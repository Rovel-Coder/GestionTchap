'use strict';

/**
 * Déchiffrement du format d'export de clés Matrix/Element (Megolm).
 *
 * Format binaire (spec Matrix §11.12.2) — header 37 octets :
 *   [1 octet  version  = 0x01             ]
 *   [16 octets salt                        ]
 *   [16 octets IV (AES-256-CTR)            ]
 *   [4 octets  iterations (BE uint32)      ]
 *   [N octets  payload AES-256-CTR chiffré ]
 *   [32 octets HMAC-SHA256 (header+payload)]
 *
 * Dérivation : PBKDF2-SHA512(passphrase, salt, iterations, 64 octets)
 *   octets  0-31 → clé AES-256
 *   octets 32-63 → clé HMAC-SHA256
 */

const crypto = require('crypto');

const HEADER = '-----BEGIN MEGOLM SESSION DATA-----';
const FOOTER = '-----END MEGOLM SESSION DATA-----';

async function decryptMegolmKeyExport(exportText, passphrase) {
    const b64 = exportText
        .replace(HEADER, '')
        .replace(FOOTER, '')
        .replace(/\s+/g, '');

    const buf = Buffer.from(b64, 'base64');

    const version = buf[0];
    if (version !== 0x01) throw new Error(`Version d'export inconnue : ${version}`);

    const salt       = buf.slice(1, 17);   // 16 octets
    const iv         = buf.slice(17, 33);  // 16 octets
    const iterations = buf.readUInt32BE(33); // 4 octets
    const payload    = buf.slice(37, buf.length - 32); // header=37, hmac=32
    const macStored  = buf.slice(buf.length - 32);

    console.log(`[Megolm] ${buf.length}B — iterations=${iterations} payload=${payload.length}B`);

    const derived = await new Promise((resolve, reject) => {
        crypto.pbkdf2(passphrase, salt, iterations, 64, 'sha512', (err, k) => {
            if (err) reject(err); else resolve(k);
        });
    });

    const aesKey = derived.slice(0, 32);
    const macKey = derived.slice(32, 64);

    // Vérification HMAC-SHA256
    const hmac    = crypto.createHmac('sha256', macKey);
    hmac.update(buf.slice(0, buf.length - 32));
    const macCalc = hmac.digest();
    if (!crypto.timingSafeEqual(macCalc, macStored)) {
        throw new Error('Passphrase incorrecte ou fichier corrompu (HMAC invalide)');
    }

    // Déchiffrement AES-256-CTR
    const decipher  = crypto.createDecipheriv('aes-256-ctr', aesKey, iv);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);

    return JSON.parse(decrypted.toString('utf8'));
}

module.exports = { decryptMegolmKeyExport };
