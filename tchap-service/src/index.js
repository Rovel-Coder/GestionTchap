'use strict';

require('dotenv').config();

const express = require('express');
const bot     = require('./client');
const routes  = require('./routes');

const app  = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '127.0.0.1';

app.use(express.json({ limit: '10mb' }));
app.use('/', routes);

async function main() {
    console.log('Démarrage du service Tchap Bridge...');

    try {
        await bot.start();
    } catch (err) {
        // Le service démarre quand même — le bot sera configuré via POST /login
        console.warn(`⚠  Client Matrix non démarré : ${err.message}`);
        console.warn('   → Configurez le bot via POST /login depuis l\'interface PHP.');
    }

    app.listen(PORT, HOST, () => {
        console.log(`Tchap Bridge Service en écoute sur http://${HOST}:${PORT}`);
        console.log(`Clé API requise dans l'en-tête X-Api-Key`);
    });
}

main().catch(err => {
    console.error('Erreur fatale au démarrage :', err.message);
    process.exit(1);
});
