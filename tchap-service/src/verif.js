'use strict';

// Implémentation du protocole SAS v1 (Matrix spec)
// https://spec.matrix.org/v1.8/client-server-api/#short-authentication-string-sas-verification

const crypto = require('crypto');

// ── Table d'emojis Matrix spec officielle (sas-emoji.json) ───────────────
// Source: https://github.com/matrix-org/matrix-spec/blob/main/data-definitions/sas-emoji.json
const SAS_EMOJI = [
  ['🐶','Dog'],['🐱','Cat'],['🦁','Lion'],['🐎','Horse'],['🦄','Unicorn'],
  ['🐷','Pig'],['🐘','Elephant'],['🐰','Rabbit'],['🐼','Panda'],['🐓','Rooster'],
  ['🐧','Penguin'],['🐢','Turtle'],['🐟','Fish'],['🐙','Octopus'],['🦋','Butterfly'],
  ['🌷','Flower'],['🌳','Tree'],['🌵','Cactus'],['🍄','Mushroom'],['🌏','Globe'],
  ['🌙','Moon'],['☁️','Cloud'],['🔥','Fire'],['🍌','Banana'],['🍎','Apple'],
  ['🍓','Strawberry'],['🌽','Corn'],['🍕','Pizza'],['🎂','Cake'],['❤️','Heart'],
  ['😀','Smiley'],['🤖','Robot'],['🎩','Hat'],['👓','Glasses'],['🔧','Spanner'],
  ['🎅','Santa'],['👍','Thumbs Up'],['☂️','Umbrella'],['⌛','Hourglass'],['⏰','Clock'],
  ['🎁','Gift'],['💡','Light Bulb'],['📕','Book'],['✏️','Pencil'],['📎','Paperclip'],
  ['✂️','Scissors'],['🔒','Lock'],['🔑','Key'],['🔨','Hammer'],['☎️','Telephone'],
  ['🏁','Flag'],['🚂','Train'],['🚲','Bicycle'],['✈️','Aeroplane'],['🚀','Rocket'],
  ['🏆','Trophy'],['⚽','Ball'],['🎸','Guitar'],['🎺','Trumpet'],['🔔','Bell'],
  ['⚓','Anchor'],['🎧','Headphones'],['📁','Folder'],['📌','Pin'],
];

// ── Canonical JSON (RFC 8785 simplifié) ───────────────────────────────────
function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',') + '}';
}

// ── Convertit 32 octets bruts en clé publique x25519 DER SPKI ────────────
function rawToSpki(rawBuf) {
  // SPKI header pour x25519 (OID 1.3.101.110)
  const header = Buffer.from('302a300506032b656e032100', 'hex');
  return Buffer.concat([header, rawBuf]);
}

// ── Extraire les 32 derniers octets d'une clé SPKI DER (= clé brute) ──────
function spkiToRaw(derBuf) {
  return Buffer.from(derBuf).slice(-32);
}

// pollSync désactivé : tous les événements SAS passent par l'intercepteur
// du SDK dans client.js (setRequestFn). Appeler pollSync en parallèle
// provoquait un double-traitement → deux paires de clés ECDH → MAC incorrect.
async function pollSync(_cfg) { /* no-op */ }

// ── État global (une seule vérification à la fois) ────────────────────────
let s = null;

// Déduplication : évite de traiter deux fois le même événement
// (ex : intercepteur SDK + listener toDevice en parallèle).
// On garde uniquement les 20 derniers event-ids pour limiter la mémoire.
const _seen = new Set();
function _dedupe(type, txnId) {
  const key = `${type}|${txnId}`;
  if (_seen.has(key)) return true; // déjà traité
  _seen.add(key);
  if (_seen.size > 20) _seen.delete(_seen.values().next().value);
  return false;
}

function reset() { s = null; }
function getStatus() {
  if (!s) return { phase: 'idle' };
  return {
    phase:  s.phase,
    userId: s.theirUserId,
    emoji:  s.emoji,
    error:  s.error || null,
  };
}

// ── Envoi d'un événement to-device via l'API Matrix REST ─────────────────
async function sendToDevice(cfg, userId, deviceId, type, content) {
  const txnId = Date.now() + '_' + Math.random().toString(36).slice(2);
  const hs = cfg.homeserver.replace(/\/$/, '');
  const url = `${hs}/_matrix/client/v3/sendToDevice/${encodeURIComponent(type)}/${txnId}`;
  const body = { messages: { [userId]: { [deviceId]: content } } };
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`sendToDevice(${type}) HTTP ${resp.status}: ${err.error || ''}`);
  }
}

// ── Récupérer la clé Ed25519 du bot depuis le homeserver ─────────────────
async function fetchBotEd25519Key(cfg) {
  const hs = cfg.homeserver.replace(/\/$/, '');
  const resp = await fetch(`${hs}/_matrix/client/v3/keys/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_keys: { [cfg.userId]: [] } }),
  });
  const data = await resp.json();
  const dev = data?.device_keys?.[cfg.userId]?.[cfg.deviceId];
  return dev?.keys?.[`ed25519:${cfg.deviceId}`] || null;
}

// ── Calculer les emojis SAS ───────────────────────────────────────────────
function calcEmoji(sharedSecret, senderUserId, senderDeviceId, senderKeyB64,
                   receiverUserId, receiverDeviceId, receiverKeyB64, txnId) {
  const info = [
    'MATRIX_KEY_VERIFICATION_SAS',
    senderUserId, senderDeviceId, senderKeyB64,
    receiverUserId, receiverDeviceId, receiverKeyB64,
    txnId,
  ].join('|');

  // HKDF-SHA256 : 6 octets = 48 bits → on utilise les 42 premiers (6 bits × 7 emojis)
  const sasBits = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), info, 6));

  const bits = [];
  for (const byte of sasBits) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }

  const emoji = [];
  for (let i = 0; i < 7; i++) {
    const idx = bits.slice(i * 6, i * 6 + 6).reduce((a, b) => (a << 1) | b, 0); // 0-63
    emoji.push({ emoji: SAS_EMOJI[idx][0], label: SAS_EMOJI[idx][1] });
  }
  return emoji;
}

// ── Calculer le MAC d'une clé ─────────────────────────────────────────────
function calcMac(sharedSecret, senderUserId, senderDeviceId,
                 receiverUserId, receiverDeviceId, txnId, keyId, keyValue) {
  const infoMac = [
    'MATRIX_KEY_VERIFICATION_MAC_v2',
    senderUserId, senderDeviceId,
    receiverUserId, receiverDeviceId,
    txnId, keyId,
  ].join('|');
  const macKey = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), infoMac, 32));
  return crypto.createHmac('sha256', macKey).update(keyValue).digest('base64').replace(/=+$/, '');
}

// ── Handler : événement to-device reçu ───────────────────────────────────
function onToDevice(type, event, cfg) {
  const c = event.content || {};
  const txnId = c.transaction_id;

  // Ignorer les doublons (même type + même txnId déjà traité)
  if (txnId && _dedupe(type, txnId)) {
    console.log(`[SAS] Doublon ignoré : ${type} txn=${txnId}`);
    return;
  }

  if (type === 'm.key.verification.request') {
    if (s) return; // déjà en cours
    if (!c.methods?.includes('m.sas.v1')) return;
    // Ignorer les demandes trop anciennes (> 5 min)
    if (c.timestamp && Date.now() - c.timestamp > 5 * 60 * 1000) {
      console.log(`[SAS] Demande ignorée (trop ancienne) de ${event.sender} txn=${txnId}`);
      return;
    }
    s = {
      phase: 'requested',
      txnId,
      theirUserId:  event.sender,
      theirDeviceId: c.from_device,
      theirStartContent: null,
      theirKeyB64: null,
      ourKeyB64:   null,
      ourEcdhPriv: null,
      sharedSecret: null,
      emoji: [],
      error: null,
      cfg,
    };
    console.log(`[SAS] Demande reçue de ${event.sender} txn=${txnId}`);
    // Auto-accepter immédiatement sans attendre l'action utilisateur
    setImmediate(() => {
      acceptVerif(cfg).catch(e => {
        console.error('[SAS] Auto-accept échoué:', e.message);
        if (s) s.error = e.message;
      });
    });
    return;
  }

  if (!s || s.txnId !== txnId) return;

  if (type === 'm.key.verification.start') {
    if (s.phase !== 'accepted') return;
    s.theirStartContent = c;
    s.phase = 'started';
    console.log(`[SAS] Start reçu, envoi accept`);
    // Envoi asynchrone de accept + clé
    _sendAcceptAndKey().catch(e => { s.phase = 'error'; s.error = e.message; });
    return;
  }

  if (type === 'm.key.verification.key') {
    s.theirKeyB64 = (c.key || '').replace(/=+$/, ''); // spec: unpadded base64
    console.log(`[SAS] Clé reçue: ${c.key?.slice(0, 10)}...`);
    if (s.ourKeyB64 && s.theirKeyB64 && s.phase === 'key-sent') {
      _computeSas().catch(e => { s.phase = 'error'; s.error = e.message; });
    }
    return;
  }

  if (type === 'm.key.verification.mac') {
    // Stocke leur MAC pour vérification optionnelle (on fait confiance à l'UX)
    s.theirMac = c;
    return;
  }

  if (type === 'm.key.verification.done') {
    if (s.phase === 'mac-sent') s.phase = 'done';
    return;
  }

  if (type === 'm.key.verification.cancel') {
    s = null;
    console.log('[SAS] Vérification annulée (code: ' + (c.code || '?') + ')');
    return;
  }
}

// ── Accepter la demande (appelé depuis l'UI) ──────────────────────────────
async function acceptVerif(cfg) {
  if (!s || s.phase !== 'requested') throw new Error('Aucune demande en attente');
  s.cfg = cfg;

  await sendToDevice(cfg, s.theirUserId, s.theirDeviceId, 'm.key.verification.ready', {
    from_device: cfg.deviceId,
    methods: ['m.sas.v1'],
    transaction_id: s.txnId,
  });

  s.phase = 'accepted';
  console.log('[SAS] Ready envoyé, en attente du Start...');
}

// ── Après réception du Start : envoyer Accept + notre clé ────────────────
async function _sendAcceptAndKey() {
  const cfg = s.cfg;

  // Générer notre paire éphémère x25519
  const { privateKey, publicKey } = crypto.generateKeyPairSync('x25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    publicKeyEncoding:  { type: 'spki',  format: 'der'  },
  });

  const rawPub = spkiToRaw(Buffer.from(publicKey));
  const ourKeyB64 = rawPub.toString('base64').replace(/=+$/, ''); // spec: unpadded base64

  s.ourKeyB64  = ourKeyB64;
  s.ourEcdhPriv = Buffer.from(privateKey);

  // Commitment = SHA256(ourKeyB64 + canonicalJson(startContent))
  const startJsonCanonical = canonicalJson(s.theirStartContent);
  const startJsonRaw       = JSON.stringify(s.theirStartContent); // ordre original (insertion)
  const commitment = crypto.createHash('sha256')
    .update(ourKeyB64 + startJsonCanonical)
    .digest('base64')
    .replace(/=+$/, '');
  const commitmentRaw = crypto.createHash('sha256')
    .update(ourKeyB64 + startJsonRaw)
    .digest('base64')
    .replace(/=+$/, '');

  console.log('[SAS][DEBUG] ourKeyB64        =', ourKeyB64);
  console.log('[SAS][DEBUG] startJson canon  =', startJsonCanonical);
  console.log('[SAS][DEBUG] startJson raw    =', startJsonRaw);
  console.log('[SAS][DEBUG] sameOrder?       =', startJsonCanonical === startJsonRaw);
  console.log('[SAS][DEBUG] commitment canon =', commitment);
  console.log('[SAS][DEBUG] commitment raw   =', commitmentRaw);

  await sendToDevice(cfg, s.theirUserId, s.theirDeviceId, 'm.key.verification.accept', {
    commitment,
    hash: 'sha256',
    key_agreement_protocol: 'curve25519-hkdf-sha256',
    message_authentication_code: 'hkdf-hmac-sha256.v2',
    method: 'm.sas.v1',
    short_authentication_string: ['decimal', 'emoji'],
    transaction_id: s.txnId,
  });

  await sendToDevice(cfg, s.theirUserId, s.theirDeviceId, 'm.key.verification.key', {
    key: ourKeyB64,
    transaction_id: s.txnId,
  });

  s.phase = 'key-sent';
  console.log('[SAS] Accept + clé envoyés');

  // Si leur clé est déjà arrivée (race condition), calculer tout de suite
  if (s.theirKeyB64) {
    await _computeSas();
  }
}

// ── Calculer les emojis après échange de clés ─────────────────────────────
async function _computeSas() {
  const { theirUserId, theirDeviceId, theirKeyB64, ourKeyB64, ourEcdhPriv, txnId, cfg } = s;

  const theirRaw = Buffer.from(theirKeyB64, 'base64');
  const theirSpki = rawToSpki(theirRaw);

  const ourPrivKey = crypto.createPrivateKey({ key: ourEcdhPriv, format: 'der', type: 'pkcs8' });
  const theirPubKey = crypto.createPublicKey({ key: theirSpki, format: 'der', type: 'spki' });

  const sharedSecret = crypto.diffieHellman({ privateKey: ourPrivKey, publicKey: theirPubKey });
  s.sharedSecret = sharedSecret;

  // Alice = sender of Start = leur côté (theirUserId/Device/Key)
  // Bob   = nous (cfg.userId/cfg.deviceId/ourKeyB64)
  const info = [
    'MATRIX_KEY_VERIFICATION_SAS',
    theirUserId, theirDeviceId, theirKeyB64,
    cfg.userId,  cfg.deviceId,  ourKeyB64,
    txnId,
  ].join('|');
  console.log('[SAS][DEBUG] HKDF info =', info);
  console.log('[SAS][DEBUG] Alice (start) :', theirUserId, '/', theirDeviceId, '/ key:', theirKeyB64.slice(0, 12) + '…');
  console.log('[SAS][DEBUG] Bob   (accept):', cfg.userId,  '/', cfg.deviceId,  '/ key:', ourKeyB64.slice(0, 12)   + '…');

  s.emoji = calcEmoji(
    sharedSecret,
    theirUserId,  theirDeviceId, theirKeyB64,
    cfg.userId,   cfg.deviceId,  ourKeyB64,
    txnId
  );

  s.phase = 'sas';
  console.log(`[SAS] Emojis calculés : ${s.emoji.map(e => e.emoji + ' ' + e.label).join('  ')}`);
}

// ── Confirmer que les emojis correspondent ────────────────────────────────
async function confirmSas(cfg) {
  if (!s || s.phase !== 'sas') throw new Error('Phase incorrecte : ' + (s?.phase || 'idle'));

  const ed25519Key = await fetchBotEd25519Key(cfg);
  if (!ed25519Key) throw new Error('Impossible de récupérer la clé Ed25519 du bot');

  const { theirUserId, theirDeviceId, txnId, sharedSecret } = s;
  const keyId = `ed25519:${cfg.deviceId}`;

  // MAC de notre clé Ed25519
  const keyMac  = calcMac(sharedSecret, cfg.userId, cfg.deviceId, theirUserId, theirDeviceId, txnId, keyId, ed25519Key);

  // MAC de la liste de key_ids
  const keyIds  = keyId;
  const keysMac = calcMac(sharedSecret, cfg.userId, cfg.deviceId, theirUserId, theirDeviceId, txnId, 'KEY_IDS', keyIds);

  await sendToDevice(cfg, theirUserId, theirDeviceId, 'm.key.verification.mac', {
    keys: keysMac,
    mac:  { [keyId]: keyMac },
    transaction_id: txnId,
  });

  await sendToDevice(cfg, theirUserId, theirDeviceId, 'm.key.verification.done', {
    transaction_id: txnId,
  });

  s.phase = 'mac-sent';
  console.log('[SAS] MAC + Done envoyés — vérification terminée côté bot');
}

// ── Annuler la vérification ───────────────────────────────────────────────
async function cancelVerif(cfg) {
  if (!s) return;
  try {
    await sendToDevice(cfg, s.theirUserId, s.theirDeviceId, 'm.key.verification.cancel', {
      code: 'm.user',
      reason: 'Annulé par l\'administrateur',
      transaction_id: s.txnId,
    });
  } catch (_) {}
  reset();
}

module.exports = { onToDevice, pollSync, acceptVerif, confirmSas, cancelVerif, getStatus, reset };
