# Guide de déploiement — Gestion Personnel Tchap

## Prérequis sur la VM

| Composant | Version minimale |
|-----------|-----------------|
| PHP | 8.3 |
| Extensions PHP | `pdo`, `pdo_pgsql`, `intl`, `mbstring`, `xml`, `ctype`, `iconv` |
| PostgreSQL | 14+ |
| Composer | 2.x |
| Serveur web | Apache 2.4+ **ou** Nginx 1.18+ |

---

## 1. Transfert des fichiers

Copier le projet sur la VM (adapter selon votre méthode) :

```bash
# Via rsync
rsync -av --exclude='.git' --exclude='vendor' \
    /chemin/local/gestion-personnel-tchap-PHP/ \
    user@vm:/var/www/gestion-tchap/

# Via git (si dépôt distant configuré)
git clone https://votre-depot.git /var/www/gestion-tchap
```

---

## 2. Dépendances PHP

```bash
cd /var/www/gestion-tchap

composer install --no-dev --optimize-autoloader --no-interaction
```

> **Note :** `--no-dev` exclut les outils de développement (maker-bundle). Ne pas omettre en production.

---

## 3. Configuration de l'environnement

```bash
cp .env.example .env
```

Éditer `.env` avec les valeurs réelles :

```dotenv
APP_ENV=prod
APP_SECRET=<chaîne_aléatoire_32_caractères_minimum>
DATABASE_URL="postgresql://utilisateur:motdepasse@localhost:5432/nom_base?serverVersion=14&charset=utf8"
```

Générer un `APP_SECRET` sécurisé :

```bash
php -r "echo bin2hex(random_bytes(32)) . PHP_EOL;"
```

> **Sécurité :** Le fichier `.env` ne doit jamais être lisible publiquement. Vérifier les permissions :
> ```bash
> chmod 640 .env
> chown www-data:www-data .env
> ```

---

## 4. Base de données

### 4.1 Créer la base (si elle n'existe pas)

```bash
sudo -u postgres psql -c "CREATE DATABASE gestion_tchap OWNER votre_user;"
```

### 4.2 Initialiser le schéma

```bash
psql -U votre_user -d gestion_tchap -f schema.sql
```

Le fichier `schema.sql` crée les 5 tables nécessaires :
- `personnel` — agents avec grades, rôles, unités
- `salons` — salons Tchap/Matrix
- `unites` — unités organisationnelles
- `config` — paramètres applicatifs (clé/valeur JSONB)
- `system_admins` — comptes administrateurs système

---

## 5. Compte administrateur initial

```bash
php bin/console app:seed-sysadmin
```

Cette commande crée le compte **Sic** (mot de passe par défaut : `SicGestionTchap`) si il n'existe pas encore.

> **Important :** Changer ce mot de passe immédiatement après la première connexion via l'interface de configuration.

---

## 6. Cache et permissions

```bash
# Vider et préchauffer le cache en mode prod
APP_ENV=prod php bin/console cache:clear
APP_ENV=prod php bin/console cache:warmup

# Permissions sur les répertoires d'écriture
chown -R www-data:www-data /var/www/gestion-tchap/var/
chmod -R 775 /var/www/gestion-tchap/var/
```

---

## 7. Service Tchap Bridge (requis — salons chiffrés E2EE)

Le service `tchap-service/` est un daemon Node.js persistant qui maintient la session Matrix et les clés de chiffrement E2EE. Il écoute **uniquement en loopback** (`127.0.0.1:3000`) et n'est jamais exposé sur Internet.

### 7.1 Installer Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs
node --version  # doit afficher v20.x ou supérieur
```

### 7.2 Déployer le service

```bash
# Copier le dossier tchap-service sur la VM
cp -r /chemin/local/gestion-personnel-tchap-PHP/tchap-service /opt/tchap-bridge

# Installer les dépendances Node.js
cd /opt/tchap-bridge
npm install --omit=dev

# Créer le répertoire de données (clés E2EE, session)
mkdir -p /opt/tchap-bridge/data
chown -R www-data:www-data /opt/tchap-bridge
chmod 750 /opt/tchap-bridge/data
```

### 7.3 Configurer l'environnement du bridge

```bash
cp /opt/tchap-bridge/.env.example /opt/tchap-bridge/.env
chmod 640 /opt/tchap-bridge/.env
chown www-data:www-data /opt/tchap-bridge/.env
```

Éditer `/opt/tchap-bridge/.env` :

```dotenv
PORT=3000

# Générer avec : openssl rand -hex 32
API_KEY=<clé_secrète_32_octets_hex>

# Credentials du bot (optionnel ici — configurable via l'interface PHP)
TCHAP_HOMESERVER=https://matrix.agent.interieur.tchap.gouv.fr
TCHAP_ACCESS_TOKEN=
```

> **Important :** `API_KEY` doit être identique à `TCHAP_SERVICE_KEY` dans le `.env` PHP.

### 7.4 Activer le service systemd

```bash
cp /opt/tchap-bridge/tchap-bridge.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tchap-bridge
systemctl start tchap-bridge
systemctl status tchap-bridge
```

### 7.5 Vérifier que le bridge répond

```bash
curl http://127.0.0.1:3000/health
# Réponse attendue : {"ok":true,"ready":false,"userId":null,...}
# "ready: false" est normal avant la première connexion du bot via l'interface PHP
```

### 7.6 Connecter le bot depuis l'interface PHP

Dans l'interface web → Configuration → paramètres Tchap, renseigner les credentials du bot. L'application appellera `POST /login` sur le bridge qui démarrera la session E2EE et persistera les clés dans `/opt/tchap-bridge/data/`.

> **Note :** Les clés E2EE sont conservées entre les redémarrages. Un `systemctl restart tchap-bridge` ne perd pas les sessions chiffrées.

### 7.7 Mise à jour du bridge

```bash
cd /opt/tchap-bridge
# Remplacer les fichiers src/ par la nouvelle version (rsync ou git pull)
npm install --omit=dev
systemctl restart tchap-bridge
```

---

## 8. Configuration du serveur web

### Apache

Créer `/etc/apache2/sites-available/gestion-tchap.conf` :

```apache
<VirtualHost *:80>
    ServerName gestion-tchap.votre-domaine.fr
    DocumentRoot /var/www/gestion-tchap/public

    <Directory /var/www/gestion-tchap/public>
        AllowOverride All
        Require all granted
        Options -Indexes
        DirectoryIndex index.php
    </Directory>

    # Logs
    ErrorLog  ${APACHE_LOG_DIR}/gestion-tchap-error.log
    CustomLog ${APACHE_LOG_DIR}/gestion-tchap-access.log combined
</VirtualHost>
```

Activer le site et les modules nécessaires :

```bash
a2enmod rewrite headers
a2ensite gestion-tchap.conf
systemctl reload apache2
```

Vérifier que le fichier `public/.htaccess` (généré par Symfony) est présent. Sinon, le créer :

```bash
APP_ENV=prod php bin/console assets:install public
```

### Nginx

Créer `/etc/nginx/sites-available/gestion-tchap` :

```nginx
server {
    listen 80;
    server_name gestion-tchap.votre-domaine.fr;
    root /var/www/gestion-tchap/public;
    index index.php;

    location / {
        try_files $uri /index.php$is_args$args;
    }

    location ~ ^/index\.php(/|$) {
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_split_path_info ^(.+\.php)(/.*)$;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT $realpath_root;
        internal;
    }

    location ~ \.php$ {
        return 404;
    }

    access_log /var/log/nginx/gestion-tchap-access.log;
    error_log  /var/log/nginx/gestion-tchap-error.log;
}
```

```bash
ln -s /etc/nginx/sites-available/gestion-tchap /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## 9. HTTPS (recommandé)

```bash
# Avec Certbot (Let's Encrypt)
apt install certbot python3-certbot-apache   # ou python3-certbot-nginx
certbot --apache -d gestion-tchap.votre-domaine.fr
# ou
certbot --nginx -d gestion-tchap.votre-domaine.fr
```

---

## 10. Vérification du déploiement

```bash
# Test PHP-FPM / accès HTTP
curl -I http://gestion-tchap.votre-domaine.fr/login

# Vérifier les logs en cas d'erreur
tail -f /var/www/gestion-tchap/var/log/prod.log
tail -f /var/log/apache2/gestion-tchap-error.log   # ou nginx
```

La page de connexion doit s'afficher à l'adresse configurée. Se connecter avec `Sic` / `SicGestionTchap`.

---

## 11. Mise à jour

En cas de nouvelle version de l'application :

```bash
cd /var/www/gestion-tchap

# Récupérer les sources (git ou rsync)
git pull   # ou rsync depuis le poste de développement

# Mettre à jour les dépendances si composer.json a changé
composer install --no-dev --optimize-autoloader --no-interaction

# Vider le cache
APP_ENV=prod php bin/console cache:clear

# Appliquer les éventuels nouveaux schémas SQL manuellement
# (voir CHANGELOG pour les modifications de schéma)
```

---

## Récapitulatif des commandes essentielles

```bash
# Ordre d'exécution pour un premier déploiement

# 1. Application PHP
composer install --no-dev --optimize-autoloader
cp .env.example .env && nano .env          # renseigner APP_SECRET, DATABASE_URL, TCHAP_SERVICE_KEY
psql -U <user> -d <base> -f schema.sql
php bin/console app:seed-sysadmin
APP_ENV=prod php bin/console cache:clear

# 2. Bridge Tchap E2EE
cp -r tchap-service /opt/tchap-bridge
cd /opt/tchap-bridge && npm install --omit=dev
mkdir -p data && chown -R www-data:www-data /opt/tchap-bridge
cp .env.example .env && nano .env          # renseigner API_KEY (= TCHAP_SERVICE_KEY du PHP)
cp tchap-bridge.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now tchap-bridge

# 3. Serveur web
# → configurer vhost Apache/Nginx (sections 8)
```
