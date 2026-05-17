'use strict';

const express = require('express');
const bot     = require('./client');
const verif   = require('./verif');
const ssss    = require('./ssss');

const router = express.Router();

// ── Rate-limit helpers ────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Wrapper autour de fetch() avec retry automatique sur 429 (rate limit Matrix).
 * Attend retry_after_ms + 200ms de buffer avant chaque retry.
 * Retourne le dernier objet Response (succès ou échec définitif).
 */
async function matrixFetch(url, options, tag = '') {
    const MAX_RETRIES = 5;
    let lastErrData   = {};
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const resp = await fetch(url, options);
        if (resp.status !== 429) return resp;
        lastErrData = await resp.json().catch(() => ({}));
        const waitMs = Math.min((lastErrData.retry_after_ms ?? 1000) + 200, 30_000);
        if (attempt < MAX_RETRIES) {
            console.warn(`[rate-limit${tag}] 429 — attente ${waitMs}ms (tentative ${attempt + 1}/${MAX_RETRIES})`);
            await sleep(waitMs);
        } else {
            console.error(`[rate-limit${tag}] 429 persistant après ${MAX_RETRIES} tentatives, abandon`);
        }
    }
    return { ok: false, status: 429, json: async () => lastErrData };
}

// Health check sans authentification
router.get('/health', (_req, res) => {
    const cfg = bot.getBotConfig();
    res.json({
        ok:        true,
        ready:     bot.isReady(),
        userId:    cfg.userId || null,
        homeserver: cfg.homeserver || null,
    });
});

// Middleware auth sur toutes les autres routes
router.use((req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!key || key !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Clé API invalide' });
    }
    next();
});

// POST /import-keys — import d'un export de clés Megolm (format -----BEGIN MEGOLM SESSION DATA-----)
router.post('/import-keys', async (req, res) => {
    const { keys, passphrase } = req.body ?? {};
    if (!keys || !passphrase) {
        return res.status(400).json({ error: 'keys (contenu du fichier) et passphrase requis' });
    }
    try {
        const result = await bot.importMegolmKeys(keys, passphrase);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /login — authentifie le bot et démarre/redémarre la session E2EE
router.post('/login', async (req, res) => {
    const { homeserver, username, password } = req.body ?? {};
    if (!homeserver || !username || !password) {
        return res.status(400).json({ error: 'homeserver, username et password requis' });
    }
    try {
        const result = await bot.loginAndRestart(homeserver, username, password);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /whoami — identité du bot connecté
router.get('/whoami', async (_req, res) => {
    try {
        const data = await bot.get().getWhoAmI();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /rooms/:roomId/members — membres d'un salon (format compatible avec TchapService PHP)
router.get('/rooms/:roomId/members', async (req, res) => {
    try {
        const statuses = ['join', 'invite'];
        const members  = await bot.get().getRoomMembers(req.params.roomId, undefined, statuses);
        const chunk   = members.map(m => ({
            state_key: m.membershipFor,
            content:   { membership: m.content?.membership ?? 'join' },
        }));
        res.json({ chunk });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /rooms/:roomId/invite
// Utilise fetch direct vers l'API Matrix (bypass matrix-bot-sdk qui produit M_INVALID_PARAM sur Tchap)
router.post('/rooms/:roomId/invite', async (req, res) => {
    const { userId } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId requis' });

    if (typeof userId !== 'string' || !userId.startsWith('@') || !userId.includes(':')) {
        console.error(`[invite] userId invalide : ${JSON.stringify(userId)}`);
        return res.status(400).json({ error: `userId invalide : "${userId}" — format attendu @utilisateur:homeserver` });
    }

    const roomId = req.params.roomId;
    const cfg    = bot.getBotConfig();

    if (!cfg.homeserver || !cfg.accessToken) {
        return res.status(503).json({ error: 'Bot non configuré (homeserver ou accessToken manquant)' });
    }

    const url = `${cfg.homeserver.replace(/\/$/, '')}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`;
    console.log(`[invite] ${userId} → ${roomId}`);

    try {
        const resp = await matrixFetch(url, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ user_id: userId }),
        }, ' invite');
        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            console.error(`[invite] Échec HTTP=${resp.status} : ${JSON.stringify(data)}`);
            const errMsg = data.error ?? data.errcode ?? `HTTP ${resp.status}`;
            return res.status(resp.status === 403 ? 403 : 500).json({ error: errMsg });
        }

        res.json({ ok: true });
    } catch (e) {
        console.error(`[invite] Erreur réseau : ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// POST /rooms/:roomId/kick
// Utilise fetch direct vers l'API Matrix (cohérence avec /invite)
router.post('/rooms/:roomId/kick', async (req, res) => {
    const { userId, reason } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId requis' });

    const roomId = req.params.roomId;
    const cfg    = bot.getBotConfig();

    if (!cfg.homeserver || !cfg.accessToken) {
        return res.status(503).json({ error: 'Bot non configuré' });
    }

    const url = `${cfg.homeserver.replace(/\/$/, '')}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`;
    console.log(`[kick] ${userId} ← ${roomId}`);

    try {
        const resp = await matrixFetch(url, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ user_id: userId, reason: reason ?? 'Gestion automatique' }),
        }, ' kick');
        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            console.error(`[kick] Échec HTTP=${resp.status} : ${JSON.stringify(data)}`);
            const errMsg = data.error ?? data.errcode ?? `HTTP ${resp.status}`;
            return res.status(resp.status === 403 ? 403 : 500).json({ error: errMsg });
        }

        res.json({ ok: true });
    } catch (e) {
        console.error(`[kick] Erreur réseau : ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// POST /rooms/:roomId/leave — le bot quitte lui-même le salon
router.post('/rooms/:roomId/leave', async (req, res) => {
    const roomId = req.params.roomId;
    const cfg    = bot.getBotConfig();

    if (!cfg.homeserver || !cfg.accessToken) {
        return res.status(503).json({ error: 'Bot non configuré (homeserver ou accessToken manquant)' });
    }

    const url = `${cfg.homeserver.replace(/\/$/, '')}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`;
    console.log(`[leave] ${roomId}`);

    try {
        const resp = await matrixFetch(url, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({}),
        }, ' leave');
        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            console.error(`[leave] Échec HTTP=${resp.status} : ${JSON.stringify(data)}`);
            const errMsg = data.error ?? data.errcode ?? `HTTP ${resp.status}`;
            return res.status(resp.status === 403 ? 403 : 500).json({ error: errMsg });
        }

        res.json({ ok: true });
    } catch (e) {
        console.error(`[leave] Erreur réseau : ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// POST /rooms — créer un salon
router.post('/rooms', async (req, res) => {
    const { name, topic, preset } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name requis' });
    try {
        const roomId = await bot.get().createRoom({
            name,
            topic:            topic ?? '',
            preset:           preset ?? 'private_chat',
            initial_state: [{
                type:      'm.room.encryption',
                state_key: '',
                content:   { algorithm: 'm.megolm.v1.aes-sha2' },
            }],
        });
        res.json({ room_id: roomId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /rooms/:roomId/power-levels — modifier le niveau de permission d'un utilisateur
router.put('/rooms/:roomId/power-levels', async (req, res) => {
    const { userId, level } = req.body ?? {};
    if (!userId || level === undefined) return res.status(400).json({ error: 'userId et level requis' });
    try {
        const c       = bot.get();
        const current = await c.getRoomStateEvent(req.params.roomId, 'm.room.power_levels', '');
        current.users          = current.users ?? {};
        current.users[userId]  = level;
        await c.sendStateEvent(req.params.roomId, 'm.room.power_levels', '', current);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /rooms/:roomId/permissions — seuils d'action du salon (hors carte users)
router.get('/rooms/:roomId/permissions', async (req, res) => {
    try {
        const pl = await bot.get().getRoomStateEvent(req.params.roomId, 'm.room.power_levels', '');
        const { users, ...permissions } = pl;
        res.json(permissions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /rooms/:roomId/permissions — mise à jour des seuils d'action (merge)
router.put('/rooms/:roomId/permissions', async (req, res) => {
    const updates = req.body ?? {};
    try {
        const c       = bot.get();
        const current = await c.getRoomStateEvent(req.params.roomId, 'm.room.power_levels', '');
        const { events: updEvents, notifications: updNotif, ...topLevel } = updates;
        Object.assign(current, topLevel);
        if (updEvents)  current.events        = { ...(current.events ?? {}),        ...updEvents };
        if (updNotif)   current.notifications = { ...(current.notifications ?? {}), ...updNotif };
        await c.sendStateEvent(req.params.roomId, 'm.room.power_levels', '', current);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /rooms/:roomId/state — état complet d'un salon
router.get('/rooms/:roomId/state', async (req, res) => {
    try {
        const state = await bot.get().getRoomState(req.params.roomId);
        res.json(state);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /rooms/:roomId/send — envoyer un message dans un salon E2EE
router.post('/rooms/:roomId/send', async (req, res) => {
    const { body, msgtype, formatted_body, url, info } = req.body ?? {};
    if (!body && !url) return res.status(400).json({ error: 'body ou url requis' });
    try {
        const content = { msgtype: msgtype ?? 'm.text', body: body ?? '' };
        if (formatted_body) {
            content.format          = 'org.matrix.custom.html';
            content.formatted_body  = formatted_body;
        }
        if (url) {
            content.url  = url;
            if (info) content.info = info;
        }
        // m.mentions : requis par les clients Matrix récents pour @room et mentions utilisateurs (MSC3952)
        if (req.body['m.mentions']) {
            content['m.mentions'] = req.body['m.mentions'];
        }
        const eventId = await bot.get().sendMessage(req.params.roomId, content);
        res.json({ event_id: eventId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /upload — upload d'un fichier vers le serveur Matrix (retourne mxc://)
// Corps JSON : { data: "<base64>", filename: "...", mimetype: "..." }
router.post('/upload', async (req, res) => {
    const { data, filename, mimetype } = req.body ?? {};
    if (!data || !filename || !mimetype) {
        return res.status(400).json({ error: 'data (base64), filename et mimetype requis' });
    }
    try {
        const buffer  = Buffer.from(data, 'base64');
        const mxcUrl  = await bot.get().uploadContent(buffer, mimetype, filename);
        res.json({ url: mxcUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Espaces (Matrix Spaces) ───────────────────────────────────────────────

// POST /spaces — créer un espace (room de type m.space)
router.post('/spaces', async (req, res) => {
    const { name, topic } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name requis' });
    try {
        const spaceId = await bot.get().createRoom({
            name,
            topic:            topic ?? '',
            preset:           'private_chat',
            creation_content: { type: 'm.space' },
        });
        res.json({ space_id: spaceId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /spaces/:spaceId/children — ajouter un salon/espace enfant
router.post('/spaces/:spaceId/children', async (req, res) => {
    const { roomId } = req.body ?? {};
    if (!roomId) return res.status(400).json({ error: 'roomId requis' });

    const spaceId = req.params.spaceId;
    const cfg     = bot.getBotConfig();

    if (!cfg.homeserver || !cfg.accessToken) {
        return res.status(503).json({ error: 'Bot non configuré' });
    }

    try {
        const via = new URL(cfg.homeserver).hostname;
        await bot.get().sendStateEvent(spaceId, 'm.space.child', roomId, {
            via:       [via],
            suggested: false,
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /spaces/:spaceId/children/:roomId — retirer un salon de l'espace
router.delete('/spaces/:spaceId/children/:roomId', async (req, res) => {
    const spaceId = req.params.spaceId;
    const roomId  = decodeURIComponent(req.params.roomId);
    try {
        // m.space.child vide = retrait du lien
        await bot.get().sendStateEvent(spaceId, 'm.space.child', roomId, {});
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /spaces/:spaceId/invite — inviter un membre dans l'espace
// Identique à /rooms/:roomId/invite (un espace est une room Matrix)
router.post('/spaces/:spaceId/invite', async (req, res) => {
    const { userId } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId requis' });

    if (typeof userId !== 'string' || !userId.startsWith('@') || !userId.includes(':')) {
        return res.status(400).json({ error: `userId invalide : "${userId}" — format attendu @utilisateur:homeserver` });
    }

    const spaceId = req.params.spaceId;
    const cfg     = bot.getBotConfig();

    if (!cfg.homeserver || !cfg.accessToken) {
        return res.status(503).json({ error: 'Bot non configuré' });
    }

    const url = `${cfg.homeserver.replace(/\/$/, '')}/_matrix/client/v3/rooms/${encodeURIComponent(spaceId)}/invite`;
    console.log(`[space-invite] ${userId} → ${spaceId}`);

    try {
        const resp = await matrixFetch(url, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ user_id: userId }),
        }, ' space-invite');
        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            const errMsg = data.error ?? data.errcode ?? `HTTP ${resp.status}`;
            return res.status(resp.status === 403 ? 403 : 500).json({ error: errMsg });
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /location-events — retourne les événements m.location en attente et vide le buffer
router.get('/location-events', (_req, res) => {
    res.json(bot.getAndClearLocationEvents());
});

// ── Vérification SAS ──────────────────────────────────────────────────────

// GET /verif — retourne l'état courant de la vérification SAS
// Les événements sont traités par l'intercepteur SDK (client.js setRequestFn)
router.get('/verif', (_req, res) => {
  res.json(verif.getStatus());
});

// POST /verif/accept — accepter la demande de vérification entrante
router.post('/verif/accept', async (_req, res) => {
  try {
    const cfg = bot.getBotConfig();
    await verif.acceptVerif(cfg);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /verif/confirm — confirmer que les emojis correspondent
router.post('/verif/confirm', async (_req, res) => {
  try {
    const cfg = bot.getBotConfig();
    await verif.confirmSas(cfg);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /verif/cancel — annuler la vérification
router.post('/verif/cancel', async (_req, res) => {
  try {
    const cfg = bot.getBotConfig();
    await verif.cancelVerif(cfg);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /verif/security-key — vérifier le device via la clé de sécurité SSSS (12×4 chars)
router.post('/verif/security-key', async (req, res) => {
  const { key } = req.body ?? {};
  if (!key) return res.status(400).json({ error: 'Clé de sécurité manquante' });
  try {
    const cfg = bot.getBotConfig();
    await ssss.verifyWithSecurityKey(cfg, key);
    res.json({ ok: true });
  } catch (e) {
    console.error('[SSSS] Erreur vérification clé:', e.message);
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
