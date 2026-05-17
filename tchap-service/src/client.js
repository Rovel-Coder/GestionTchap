'use strict';

// ── User-Agent pour nos propres appels fetch (key upload, pollSync) ───────
const UA = 'Element/1.11.52 (Node.js bridge; linux; X-No-Client)';
const _nativeFetch = global.fetch;
global.fetch = (input, init = {}) => {
  const h = (init.headers instanceof Headers)
    ? Object.fromEntries(init.headers)
    : (init.headers || {});
  init.headers = { 'User-Agent': UA, ...h };
  return _nativeFetch(input, init);
};

const {
  MatrixClient,
  SimpleFsStorageProvider,
  setRequestFn,
} = require('matrix-bot-sdk');

const requestLib = require('request');
const verif      = require('./verif');

// ── Intercepteur des requêtes matrix-bot-sdk (package "request") ──────────
// Le bot-sdk utilise "request" (pas fetch). On injecte :
//   1. User-Agent Element → contourne le WAF Tchap
//   2. Retry transparent sur erreurs réseau transitoires (ECONNRESET, etc.)
//   3. Capture des to-device events de vérification dans les réponses /sync
const NET_ERRORS   = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE']);
const MAX_NET_RETRY = 3;

setRequestFn((options, callback) => {
  // 1. User-Agent
  if (!options.headers) options.headers = {};
  options.headers['User-Agent'] = UA;

  let attempt = 0;
  const url = options.uri || options.url || '';

  function doRequest() {
    attempt++;
    return requestLib(options, (error, response, body) => {
      // 2. Retry transparent sur erreurs réseau (ECONNRESET, ETIMEDOUT, …)
      //    Le SDK long-poll /sync reçoit régulièrement ECONNRESET quand le
      //    serveur ferme la connexion TLS après timeout — c'est normal et ne
      //    doit pas remonter comme une erreur au SDK.
      if (error && NET_ERRORS.has(error.code) && attempt <= MAX_NET_RETRY) {
        const wait = attempt * 2000; // 2 s, 4 s, 6 s
        console.warn(`[net-retry] ${error.code} sur ${url} — tentative ${attempt}/${MAX_NET_RETRY}, attente ${wait}ms`);
        setTimeout(doRequest, wait);
        return;
      }

      // 3. Capture des to-device events de vérification dans les réponses /sync
      if (!error && body && url.includes('/sync')) {
        try {
          const data = typeof body === 'string' ? JSON.parse(body) : body;
          const toDeviceEvents = (data && data.to_device && data.to_device.events) || [];
          const verifEvents = toDeviceEvents.filter(e => e.type && e.type.startsWith('m.key.verification.'));
          const otherEvents  = toDeviceEvents.filter(e => !e.type || !e.type.startsWith('m.key.verification.'));

          if (verifEvents.length) {
            console.log(`[SAS] Sync intercepté — ${verifEvents.length} to-device event(s):`, verifEvents.map(e => e.type).join(', '));
            for (const ev of verifEvents) {
              console.log(`[SAS] Événement vérification capturé : ${ev.type} de ${ev.sender}`);
              verif.onToDevice(ev.type, ev, loadBotConfig());
            }
            // Supprimer les events de vérification avant de les passer au Rust SDK
            // pour éviter que le SDK envoie automatiquement un cancel conflictuel
            data.to_device.events = otherEvents;
            return callback(error, response, JSON.stringify(data));
          }
        } catch (e) {
          console.warn('[SAS] Erreur parsing sync:', e.message);
        }
      }

      callback(error, response, body);
    });
  }

  return doRequest();
});
const fs = require('fs');
const path = require('path');

// Le provider de crypto E2EE a changé de nom selon la version de matrix-bot-sdk :
// - ancienne : CryptoStorageProvider (better-sqlite3/olm)
// - nouvelle : RustSdkCryptoStorageProvider (Rust, v0.7+)
// On accepte les deux et on dégrade gracieusement si aucun n'est disponible.
let CryptoStorageProvider = null;
try {
  const m = require('matrix-bot-sdk');
  const provider = m.RustSdkCryptoStorageProvider ?? m.CryptoStorageProvider;
  if (typeof provider === 'function') {
    CryptoStorageProvider = provider;
    console.log('[E2EE] Provider crypto:', provider.name);
  } else {
    console.warn('[E2EE] Aucun provider crypto disponible — mode sans E2EE');
  }
} catch (e) {
  console.warn('[E2EE] Impossible de charger le crypto store:', e.message);
}

const DATA_DIR = path.resolve(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'bot-config.json');

let matrixClient = null;
let _ready = false;

// Retourne le sous-dossier dédié à un userId donné.
// Ex: @bot.unite:agent.interieur.tchap.gouv.fr → data/bot.unite_agent.interieur.tchap.gouv.fr/
function getBotDir(userId) {
  const safe = (userId || 'default')
    .replace(/^@/, '')       // supprime le @ initial
    .replace(/:/g, '_')      // remplace : par _
    .replace(/[^a-zA-Z0-9._-]/g, '_'); // autres caractères → _
  const dir = path.join(DATA_DIR, safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadBotConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  return {
    homeserver: process.env.TCHAP_HOMESERVER || '',
    accessToken: process.env.TCHAP_ACCESS_TOKEN || '',
    userId: '',
    deviceId: '',
  };
}

function saveBotConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function start() {
  const config = loadBotConfig();

  if (!config.homeserver || !config.accessToken) {
    throw new Error('Bot non configuré : homeserver et accessToken manquants. Configurez via POST /login ou via .env.');
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const botDir  = getBotDir(config.userId);
  console.log(`[Bot] Dossier de session : ${botDir}`);

  const storage = new SimpleFsStorageProvider(path.join(botDir, 'session.json'));

  let crypto = null;
  if (CryptoStorageProvider) {
    try {
      crypto = new CryptoStorageProvider(path.join(botDir, 'crypto.db'));
    } catch (e) {
      console.warn('[E2EE] Initialisation crypto échouée, mode sans E2EE:', e.message);
    }
  }

  matrixClient = crypto
    ? new MatrixClient(config.homeserver, config.accessToken, storage, crypto)
    : new MatrixClient(config.homeserver, config.accessToken, storage);

  matrixClient.on('room.failed_decryption', (roomId, event, err) => {
    const session = event?.content?.session_id ?? '?';
    console.warn(`[E2EE] ✗ Décryptage échoué — salon: ${roomId} | session: ${session} | erreur: ${err.message}`);
    // Les salons qui existaient avant la connexion du bot ont des sessions Megolm
    // que le bot n'a jamais reçues. Le SDK Rust tente automatiquement une
    // m.room_key_request vers l'expéditeur — aucune action supplémentaire requise.
    // Si ce message vient d'un nouveau message (pas d'historique), vérifier que :
    //   1. Le device du bot est bien enregistré : GET /whoami
    //   2. Les clés Olm sont publiées sur le homeserver : voir log [E2EE] ✓ Clés device publiées
  });

  // Les événements to-device de vérification SAS sont traités exclusivement
  // par l'intercepteur setRequestFn ci-dessus (avant que le Rust SDK les voie).
  // Ne pas ajouter de listeners matrixClient.on('toDevice.*') ici pour éviter
  // un double-traitement → deux paires de clés ECDH → MAC incorrect.

  try {
    await matrixClient.start();
  } catch (e) {
    // One Time Keys en conflit avec le serveur Matrix :
    // Le device_id existant a des clés OTP enregistrées côté serveur qui ne correspondent plus
    // au store crypto local. La solution est de se reconnecter (nouveau device_id).
    if (e.message && e.message.includes('One time key') && e.message.includes('already exists')) {
      console.error('[E2EE] ⚠ Conflit de clés OTP avec le serveur Matrix.');
      console.error('[E2EE] Le device existant a des clés enregistrées qui ne correspondent plus au store local.');
      console.error('[E2EE] ✦ Solution : reconnectez le bot depuis Configuration → Bots Matrix → Connecter.');
      console.error('[E2EE]   Cela créera un nouvel appareil Matrix sans conflit de clés.');

      matrixClient.stop();
      matrixClient = null;
      _ready = false;

      // Purger le store local (il est de toute façon inutilisable)
      const botDir2     = getBotDir(config.userId);
      const cryptoDb    = path.join(botDir2, 'crypto.db');
      const sessionJson = path.join(botDir2, 'session.json');
      if (fs.existsSync(cryptoDb))    fs.rmSync(cryptoDb,    { recursive: true, force: true });
      if (fs.existsSync(sessionJson)) fs.rmSync(sessionJson, { force: true });

      // Effacer le token pour forcer une reconnexion explicite depuis l'interface
      const cfg = loadBotConfig();
      cfg.accessToken = '';
      cfg.deviceId    = '';
      saveBotConfig(cfg);
      console.error('[E2EE] Token effacé. Reconnectez le bot depuis l\'interface.');

      // Attendre 5 min avant de sortir pour éviter une boucle de redémarrage rapide.
      // Docker relancera le bridge après cet arrêt, mais il attendra une reconnexion.
      console.error('[E2EE] Pause de 5 minutes avant redémarrage...');
      await new Promise(r => setTimeout(r, 300000));
      process.exit(0);
    }
    throw e; // autres erreurs → propagées normalement
  }

  _ready = true;
  const whoami = await matrixClient.getWhoAmI();
  console.log(`✓ Bot connecté : ${whoami.user_id}`);

  // Vérifier que les clés Olm ont bien été uploadées (le WAF Tchap peut bloquer le premier essai)
  setTimeout(() => _verifyKeyUpload(config), 6000);

  return whoami;
}

async function _verifyKeyUpload(config) {
  try {
    const hs = config.homeserver.replace(/\/$/, '');
    const resp = await fetch(`${hs}/_matrix/client/v3/keys/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_keys: { [config.userId]: [config.deviceId] } }),
    });
    const data = await resp.json();
    const dev = data?.device_keys?.[config.userId]?.[config.deviceId];
    const hasKeys = dev && dev.keys && Object.keys(dev.keys).length > 0;

    if (hasKeys) {
      console.log(`[E2EE] ✓ Clés device publiées (${Object.keys(dev.keys).join(', ')})`);
      return;
    }

    console.warn('[E2EE] ✗ Clés Olm non publiées sur le homeserver. Purge du crypto store et redémarrage...');
    if (matrixClient) { matrixClient.stop(); matrixClient = null; _ready = false; }

    const botDir3    = getBotDir(config.userId);
    const cryptoDb   = path.join(botDir3, 'crypto.db');
    const sessionJson = path.join(botDir3, 'session.json');
    if (fs.existsSync(cryptoDb))    fs.rmSync(cryptoDb,    { recursive: true, force: true });
    if (fs.existsSync(sessionJson)) fs.rmSync(sessionJson, { force: true });

    await new Promise(r => setTimeout(r, 1000));
    process.exit(0); // Docker restart: unless-stopped relancera avec un crypto store vierge
  } catch (e) {
    console.warn('[E2EE] Impossible de vérifier le key upload:', e.message);
  }
}

async function loginAndRestart(homeserver, username, password) {
  const hs = homeserver.replace(/\/$/, '');

  // ── Réutilisation du device_id existant ───────────────────────────────────
  // Chaque nouvelle connexion sans device_id crée un nouvel appareil Matrix :
  //   • nouveau crypto store vide
  //   • nouvelles sessions Megolm à établir dans chaque salon
  //   • l'ancien device reste actif côté serveur (accumulation)
  //   • les membres des salons reçoivent "[impossible de déchiffrer]" le temps
  //     que le nouveau device récupère les sessions Megolm
  //
  // En réutilisant le device_id, le bot conserve ses sessions Megolm et son
  // crypto store — les messages restent lisibles par tous les membres.
  // En cas de conflit OTK (store local ≠ serveur), start() purge le store et
  // efface le deviceId enregistré, forçant un nouveau device au prochain login.

  const existing    = loadBotConfig();
  const loginLocal  = username.replace(/^@/, '').split(':')[0].toLowerCase();
  const savedLocal  = existing.userId ? existing.userId.replace(/^@/, '').split(':')[0].toLowerCase() : null;
  const sameAccount = existing.homeserver === homeserver && savedLocal === loginLocal && existing.deviceId;
  const cryptoDb    = sameAccount ? path.join(getBotDir(existing.userId), 'crypto.db') : null;
  const reuseDevice = sameAccount && cryptoDb && fs.existsSync(cryptoDb);

  if (reuseDevice) {
    console.log(`[E2EE] Reconnexion même compte — réutilisation device ${existing.deviceId} (sessions Megolm préservées)`);
  } else {
    console.log(`[E2EE] Nouveau device Matrix (premier login ou compte différent)`);
  }

  const resp = await fetch(`${hs}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: username },
      password,
      initial_device_display_name: 'Gestion Tchap Bridge',
      ...(reuseDevice ? { device_id: existing.deviceId } : {}),
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error ?? `Échec login Tchap (HTTP ${resp.status})`);
  }

  if (!data.access_token) {
    throw new Error('Pas de token dans la réponse Tchap');
  }

  const oldConfig = loadBotConfig();

  // Sauvegarde du nouveau config
  saveBotConfig({
    homeserver,
    accessToken: data.access_token,
    userId: data.user_id,
    deviceId: data.device_id,
  });

  // Chaque bot dispose de son propre sous-dossier dans data/ — pas de purge nécessaire.
  // Le sous-dossier du nouveau bot est créé automatiquement au prochain démarrage.
  if (oldConfig.userId && oldConfig.userId !== data.user_id) {
    console.log(`↺ Changement de bot : ${oldConfig.userId} → ${data.user_id}`);
    console.log(`   Ancien bot : data/${getBotDir(oldConfig.userId).split('/').pop()} (conservé)`);
    console.log(`   Nouveau bot : data/${getBotDir(data.user_id).split('/').pop()} (sera initialisé au démarrage)`);
  }

  // Le RustSdkCryptoStorageProvider pose un verrou exclusif sur la DB.
  // On stoppe l'ancien client et on laisse Docker relancer le processus
  // proprement (restart: unless-stopped) pour libérer le verrou.
  if (matrixClient) {
    matrixClient.stop();
    matrixClient = null;
    _ready = false;
  }

  // Retourner la réponse avant de quitter pour que PHP reçoive le token
  setImmediate(() => {
    console.log('↺ Redémarrage du bridge (libération du verrou crypto)…');
    process.exit(0);
  });

  return {
    access_token: data.access_token,
    user_id: data.user_id,
    device_id: data.device_id,
  };
}

async function importMegolmKeys(keysContent, passphrase) {
  if (!matrixClient || !_ready) throw new Error('Bot non connecté — démarrez le bridge avant d\'importer des clés');

  const { decryptMegolmKeyExport } = require('./megolm-import');
  const sessions = await decryptMegolmKeyExport(keysContent, passphrase);
  console.log(`[E2EE] Import : ${sessions.length} session(s) Megolm déchiffrée(s)`);

  // Accès au OlmMachine via la chaîne de propriétés privées (TS 'private' = JS ordinaire)
  const cryptoClient = matrixClient.crypto;
  const engine       = cryptoClient?.engine;
  const machine      = engine?.machine;

  const tryImport = machine?.importDecryptedRoomKeys
    ?? machine?.importRoomKeys
    ?? cryptoClient?.importRoomKeys
    ?? cryptoClient?.importDecryptedRoomKeys;

  if (typeof tryImport === 'function') {
    const target = machine ?? cryptoClient;
    try {
      await tryImport.call(target, sessions);
      console.log(`[E2EE] ✓ ${sessions.length} session(s) importée(s) via SDK`);
      return { imported: sessions.length, method: 'sdk' };
    } catch (e) {
      console.warn('[E2EE] Échec import SDK :', e.message);
    }
  }

  console.warn(`[E2EE] ⚠ ${sessions.length} session(s) déchiffrées, import SDK non supporté.`);
  return {
    imported:  0,
    decoded:   sessions.length,
    info: `${sessions.length} sessions déchiffrées avec succès. Le Rust SDK (matrix-sdk-crypto-nodejs) ne supporte pas l'injection de sessions depuis un export Element — utilisez la Vérification SAS pour que vos appareils Tchap transfèrent automatiquement les clés au bot.`,
  };
}

function get() {
  if (!matrixClient || !_ready) throw new Error('Client Matrix non prêt — bot non configuré ou démarrage en cours');
  return matrixClient;
}

function isReady() { return _ready; }
function getBotConfig() { return loadBotConfig(); }

module.exports = { start, loginAndRestart, importMegolmKeys, get, isReady, getBotConfig };
