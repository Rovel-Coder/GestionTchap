'use strict';

const {
    MatrixClient,
    SimpleFsStorageProvider,
} = require('matrix-bot-sdk');
const fs   = require('fs');
const path = require('path');

// Le provider de crypto E2EE a changé de nom selon la version de matrix-bot-sdk :
// - ancienne : CryptoStorageProvider (better-sqlite3/olm)
// - nouvelle  : RustSdkCryptoStorageProvider (Rust, v0.7+)
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

const DATA_DIR    = path.resolve(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'bot-config.json');

let matrixClient = null;
let _ready       = false;

function loadBotConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
    return {
        homeserver:  process.env.TCHAP_HOMESERVER  || '',
        accessToken: process.env.TCHAP_ACCESS_TOKEN || '',
        userId:      '',
        deviceId:    '',
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

    const storage = new SimpleFsStorageProvider(path.join(DATA_DIR, 'session.json'));

    let crypto = null;
    if (CryptoStorageProvider) {
        try {
            crypto = new CryptoStorageProvider(path.join(DATA_DIR, 'crypto.db'));
        } catch (e) {
            console.warn('[E2EE] Initialisation crypto échouée, mode sans E2EE:', e.message);
        }
    }

    matrixClient = crypto
        ? new MatrixClient(config.homeserver, config.accessToken, storage, crypto)
        : new MatrixClient(config.homeserver, config.accessToken, storage);

    matrixClient.on('room.failed_decryption', (roomId, _event, err) => {
        console.warn(`[E2EE] Décryptage échoué salon ${roomId}: ${err.message}`);
    });

    await matrixClient.start();
    _ready = true;

    const whoami = await matrixClient.getWhoAmI();
    console.log(`✓ Bot connecté : ${whoami.user_id}`);
    return whoami;
}

async function loginAndRestart(homeserver, username, password) {
    const hs        = homeserver.replace(/\/$/, '');
    const deviceId  = 'TCHAP_BRIDGE_' + Buffer.from(username).toString('base64').replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase();

    const resp = await fetch(`${hs}/_matrix/client/v3/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            type:       'm.login.password',
            identifier: { type: 'm.id.user', user: username },
            password,
            device_id:  deviceId,
            initial_device_display_name: 'Gestion Tchap Bridge',
        }),
    });

    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(data.error ?? `Échec login Tchap (HTTP ${resp.status})`);
    }
    if (!data.access_token) {
        throw new Error('Pas de token dans la réponse Tchap');
    }

    // Sauvegarde du config avant tout
    saveBotConfig({
        homeserver,
        accessToken: data.access_token,
        userId:      data.user_id,
        deviceId:    data.device_id,
    });

    // Le RustSdkCryptoStorageProvider pose un verrou exclusif sur la DB.
    // On ne peut pas ouvrir une seconde instance dans le même processus.
    // On stoppe l'ancien client et on laisse Docker relancer le processus
    // proprement (restart: unless-stopped) pour libérer le verrou.
    if (matrixClient) {
        matrixClient.stop();
        matrixClient = null;
        _ready = false;
    }

    // Retourner la réponse avant de quitter pour que PHP reçoive le token
    setImmediate(() => {
        console.log('↺ Redémarrage du bridge après login (libération du verrou crypto)…');
        process.exit(0);
    });

    return {
        access_token: data.access_token,
        user_id:      data.user_id,
        device_id:    data.device_id,
    };
}

function get() {
    if (!matrixClient || !_ready) throw new Error('Client Matrix non prêt — bot non configuré ou démarrage en cours');
    return matrixClient;
}

function isReady()      { return _ready; }
function getBotConfig() { return loadBotConfig(); }

module.exports = { start, loginAndRestart, get, isReady, getBotConfig };
