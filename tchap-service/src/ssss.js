'use strict';

// Vérification d'appareil via la clé de sécurité SSSS (Secure Secret Storage)
// Spec Matrix : https://spec.matrix.org/v1.8/client-server-api/#msecret_storagev1aes-hmac-sha2
//
// Flow : clé 12×4 chars → décodage base58 → déchiffrement SSSS → self-signing key
//        → signature du device bot → upload → device vérifié

const crypto = require('crypto');

// ── Décodage de la clé de sécurité (base58, 12×4 chars) ──────────────────
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(str) {
  let bytes = [0];
  for (const char of str) {
    const idx = BASE58.indexOf(char);
    if (idx < 0) throw new Error(`Caractère invalide dans la clé : "${char}"`);
    let carry = idx;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of str) {
    if (char !== '1') break;
    bytes.push(0);
  }
  return Buffer.from(bytes.reverse());
}

// Retourne les 32 octets bruts de la clé de sécurité Matrix.
// keyStr : "xxxx xxxx xxxx ..." (12 groupes de 4, espaces optionnels)
function decodeSecurityKey(keyStr) {
  const cleaned = keyStr.replace(/[\s-]/g, '');
  if (cleaned.length !== 48) {
    throw new Error(`Longueur invalide : ${cleaned.length} caractères (48 attendus)`);
  }

  const decoded = base58Decode(cleaned);
  if (decoded.length !== 35) {
    throw new Error(`Décodage invalide : ${decoded.length} octets (35 attendus)`);
  }

  // Préfixe Matrix : 0x8B 0x01
  if (decoded[0] !== 0x8b || decoded[1] !== 0x01) {
    throw new Error('Préfixe de clé invalide — ce n\'est pas une clé de sécurité Tchap/Matrix');
  }

  // Octet de parité (XOR des 34 premiers octets)
  const parity = decoded.slice(0, 34).reduce((a, b) => a ^ b, 0);
  if (parity !== decoded[34]) {
    throw new Error('Erreur de parité — clé de sécurité incorrecte ou mal recopiée');
  }

  return decoded.slice(2, 34); // 32 octets de clé brute
}

// ── Dérivation HKDF pour SSSS ─────────────────────────────────────────────
// Salt = 32 zéros, info = nom du secret (ou "" pour la vérification de la clé)
function deriveKeys(rawKey, info) {
  const salt = Buffer.alloc(32, 0);
  return Buffer.from(crypto.hkdfSync('sha256', rawKey, salt, info, 64));
}

// ── Vérification de la clé contre le check stocké en account_data ────────
async function verifyKeyCorrect(rawKey, keyInfo) {
  if (!keyInfo.iv || !keyInfo.mac) {
    console.log('[SSSS] Pas de données de vérification stockées, on continue');
    return;
  }

  const keys   = deriveKeys(rawKey, '');
  const aesKey = keys.slice(0, 32);
  const macKey = keys.slice(32);

  const iv     = Buffer.from(keyInfo.iv, 'base64');
  const cipher = crypto.createCipheriv('aes-256-ctr', aesKey, iv);
  const ct     = Buffer.concat([cipher.update(Buffer.alloc(32, 0)), cipher.final()]);
  const mac    = crypto.createHmac('sha256', macKey).update(ct).digest('base64').replace(/=+$/, '');

  if (mac !== keyInfo.mac.replace(/=+$/, '')) {
    throw new Error('Clé de sécurité incorrecte — les codes ne correspondent pas');
  }
}

// ── Déchiffrement d'un secret SSSS ───────────────────────────────────────
function decryptSecret(rawKey, secretName, encData) {
  const { iv, ciphertext, mac } = encData;

  const keys   = deriveKeys(rawKey, secretName);
  const aesKey = keys.slice(0, 32);
  const macKey = keys.slice(32);

  const ctBuf  = Buffer.from(ciphertext, 'base64');
  const ivBuf  = Buffer.from(iv, 'base64');

  // Vérification MAC avant déchiffrement
  const computedMac = crypto.createHmac('sha256', macKey).update(ctBuf).digest('base64').replace(/=+$/, '');
  if (computedMac !== mac.replace(/=+$/, '')) {
    throw new Error(`MAC invalide pour "${secretName}" — clé incorrecte ou données corrompues`);
  }

  const decipher = crypto.createDecipheriv('aes-256-ctr', aesKey, ivBuf);
  return Buffer.concat([decipher.update(ctBuf), decipher.final()]);
}

// ── Appels API Matrix ─────────────────────────────────────────────────────
async function fetchAccountData(cfg, type) {
  const hs   = cfg.homeserver.replace(/\/$/, '');
  const url  = `${hs}/_matrix/client/v3/user/${encodeURIComponent(cfg.userId)}/account_data/${encodeURIComponent(type)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`account_data(${type}) HTTP ${resp.status}: ${err.error || err.errcode || ''}`);
  }
  return resp.json();
}

async function fetchDeviceKey(cfg) {
  const hs   = cfg.homeserver.replace(/\/$/, '');
  const resp = await fetch(`${hs}/_matrix/client/v3/keys/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_keys: { [cfg.userId]: [cfg.deviceId] } }),
  });
  const data = await resp.json();
  const dev  = data?.device_keys?.[cfg.userId]?.[cfg.deviceId];
  if (!dev) throw new Error('Device du bot introuvable via /keys/query');
  return dev;
}

function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',') + '}';
}

async function uploadSignature(cfg, deviceObj, sigKeyId, signature) {
  const signed = JSON.parse(JSON.stringify(deviceObj)); // deep copy
  signed.signatures                  = signed.signatures || {};
  signed.signatures[cfg.userId]      = signed.signatures[cfg.userId] || {};
  signed.signatures[cfg.userId][sigKeyId] = signature;

  const hs   = cfg.homeserver.replace(/\/$/, '');
  const resp = await fetch(`${hs}/_matrix/client/v3/keys/signatures/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ [cfg.userId]: { [cfg.deviceId]: signed } }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`signatures/upload HTTP ${resp.status}: ${data.error || ''}`);
  if (data.failures && Object.keys(data.failures).length) {
    console.warn('[SSSS] Failures signatures/upload:', JSON.stringify(data.failures));
  }
  return data;
}

// ── Point d'entrée principal ──────────────────────────────────────────────
async function verifyWithSecurityKey(cfg, keyStr) {
  // 1. Décodage de la clé
  const rawKey = decodeSecurityKey(keyStr);
  console.log('[SSSS] Clé décodée :', rawKey.length, 'octets');

  // 2. Récupération de l'ID de la clé de stockage par défaut
  const defaultKeyData = await fetchAccountData(cfg, 'm.secret_storage.default_key');
  const keyId = defaultKeyData.key;
  if (!keyId) throw new Error('Aucune clé de stockage secret configurée sur ce compte');
  console.log('[SSSS] Key ID SSSS :', keyId);

  // 3. Vérification de la clé
  const keyInfo = await fetchAccountData(cfg, `m.secret_storage.key.${keyId}`);
  await verifyKeyCorrect(rawKey, keyInfo);
  console.log('[SSSS] Clé vérifiée ✓');

  // 4. Récupération et déchiffrement de la self-signing key
  const selfSigningData = await fetchAccountData(cfg, 'm.cross_signing.self_signing');
  const encData = selfSigningData?.encrypted?.[keyId];
  if (!encData) {
    throw new Error(
      'Clé self-signing introuvable dans le stockage secret. ' +
      'Assurez-vous que le cross-signing est activé sur le compte du bot ' +
      '(vérification SAS initiale requise depuis Element/Tchap).'
    );
  }

  // Le secret déchiffré est la seed Ed25519 encodée en base64 (UTF-8)
  const plaintextBuf = decryptSecret(rawKey, 'm.cross_signing.self_signing', encData);
  const seed = Buffer.from(plaintextBuf.toString('utf8'), 'base64');
  if (seed.length !== 32) {
    throw new Error(`Self-signing key invalide : ${seed.length} octets (32 attendus)`);
  }
  console.log('[SSSS] Self-signing key déchiffrée ✓');

  // 5. Construction de la clé privée Ed25519 depuis la seed (PKCS8 DER)
  const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const privDer     = Buffer.concat([pkcs8Header, seed]);
  const privateKey  = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });

  // Extraction de la clé publique (= ID de la self-signing key)
  const pubSpki  = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const pubRaw   = pubSpki.slice(-32);
  const pubB64   = pubRaw.toString('base64').replace(/=+$/, '');
  const sigKeyId = `ed25519:${pubB64}`;
  console.log('[SSSS] Self-signing key ID :', sigKeyId.slice(0, 30) + '…');

  // 6. Récupération de la clé du device bot
  const deviceObj = await fetchDeviceKey(cfg);

  // 7. Signature du device (canonical JSON sans le champ signatures)
  const toSign  = JSON.parse(JSON.stringify(deviceObj));
  delete toSign.signatures;
  const message   = Buffer.from(canonicalJson(toSign));
  const signature = crypto.sign(null, message, privateKey).toString('base64').replace(/=+$/, '');

  // 8. Upload de la signature
  await uploadSignature(cfg, deviceObj, sigKeyId, signature);
  console.log('[SSSS] ✓ Device vérifié via clé de sécurité');
}

module.exports = { verifyWithSecurityKey, decodeSecurityKey };
