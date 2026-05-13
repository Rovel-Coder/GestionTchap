# Déploiement sur VM Ubuntu sans Docker — Gestion Personnel Tchap

Ce guide décrit l'installation de l'application directement sur une VM Ubuntu 24.04 LTS **sans Docker** : PHP-FPM, Nginx, PostgreSQL et Node.js sont installés nativement sur le système.

> **Quand choisir ce mode ?** Uniquement si votre infrastructure interdit Docker ou impose des contraintes d'intégration spécifiques. Pour les autres cas, préférer le [déploiement Docker via Ansible](DEPLOIEMENT-DOCKER.md#ansible--vm-production) qui est plus simple à maintenir.

---

## Dimensionnement recommandé

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| vCPU | 2 | 4 |
| RAM | 2 Go | 4 Go |
| Disque système | 20 Go | 40 Go |
| Disque données | 10 Go | 50 Go |

---

## 1. Mise à jour système et paquets de base

```bash
apt update && apt upgrade -y
apt install -y curl wget git unzip vim htop ufw
```

---

## 2. PHP 8.3

Ubuntu 24.04 LTS inclut PHP 8.3 dans ses dépôts officiels.

```bash
apt install -y \
    php8.3 \
    php8.3-fpm \
    php8.3-pgsql \
    php8.3-mbstring \
    php8.3-xml \
    php8.3-intl \
    php8.3-curl \
    php8.3-opcache

systemctl enable php8.3-fpm
systemctl start php8.3-fpm

php -v
```

**Configuration production** — éditer `/etc/php/8.3/fpm/php.ini` :

```ini
opcache.enable = 1
opcache.memory_consumption = 128
opcache.max_accelerated_files = 10000
opcache.validate_timestamps = 0

expose_php = Off
display_errors = Off
log_errors = On

memory_limit = 256M
max_execution_time = 60
session.cookie_httponly = On
session.cookie_secure = On
```

Pour les réglages avancés de PHP-FPM (pool de processus), voir [VM_CONFIGURATION.md](VM_CONFIGURATION.md).

---

## 3. PostgreSQL 16

Ubuntu 24.04 inclut PostgreSQL 16 dans ses dépôts.

```bash
apt install -y postgresql postgresql-contrib

systemctl enable postgresql
systemctl start postgresql
```

**Créer l'utilisateur et la base :**

```bash
sudo -u postgres psql <<EOF
CREATE USER tchap_user WITH PASSWORD 'mot_de_passe_fort';
CREATE DATABASE gestion_tchap OWNER tchap_user;
GRANT ALL PRIVILEGES ON DATABASE gestion_tchap TO tchap_user;
EOF
```

**Restreindre l'écoute réseau** — dans `/etc/postgresql/16/main/postgresql.conf` :

```conf
listen_addresses = 'localhost'
```

```bash
systemctl restart postgresql
```

Pour les réglages de performance PostgreSQL, voir [VM_CONFIGURATION.md](VM_CONFIGURATION.md).

---

## 4. Composer

```bash
curl -sS https://getcomposer.org/installer | php
mv composer.phar /usr/local/bin/composer
chmod +x /usr/local/bin/composer
composer --version
```

---

## 5. Node.js 20 (pour le bridge Tchap)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version   # v20.x
```

---

## 6. Nginx

```bash
apt install -y nginx
systemctl enable nginx
```

Créer `/etc/nginx/sites-available/gestion-tchap` :

```nginx
server {
    listen 80;
    server_name gestion-tchap.votre-domaine.fr;
    root /var/www/gestion-tchap/public;
    index index.php;

    # Headers de sécurité HTTP
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Bloque l'accès aux fichiers sensibles
    location ~ /\.(git|env|htaccess) {
        deny all;
        return 404;
    }

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

    location ~ \.php$ { return 404; }

    access_log /var/log/nginx/gestion-tchap-access.log;
    error_log  /var/log/nginx/gestion-tchap-error.log;
}
```

```bash
ln -s /etc/nginx/sites-available/gestion-tchap /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Pour les optimisations Nginx supplémentaires (gzip, cache, HSTS), voir [VM_CONFIGURATION.md](VM_CONFIGURATION.md).

---

## 7. Déployer l'application

```bash
git clone git@gitlab.votre-societe.fr:VOTRE_GROUPE/gestion-personnel-tchap-PHP.git /var/www/gestion-tchap
cd /var/www/gestion-tchap

# Dépendances PHP
composer install --no-dev --optimize-autoloader --no-interaction

# Configurer l'environnement
cp .env.example .env
chmod 640 .env
```

Éditer `/var/www/gestion-tchap/.env` :

```dotenv
APP_ENV=prod

# Générer avec : openssl rand -base64 32
APP_SECRET=<secret_32_caracteres>

DATABASE_URL=postgresql://tchap_user:mot_de_passe_fort@127.0.0.1:5432/gestion_tchap

# Générer avec : openssl rand -hex 32
TCHAP_SERVICE_KEY=<cle_api_bridge>

TCHAP_SERVICE_URL=http://127.0.0.1:3000
```

```bash
# Appliquer les migrations et créer le compte admin
APP_ENV=prod php bin/console app:db:migrate
APP_ENV=prod php bin/console app:seed-sysadmin

# Cache de production
APP_ENV=prod php bin/console cache:clear
APP_ENV=prod php bin/console cache:warmup

# Permissions
chown -R www-data:www-data /var/www/gestion-tchap/var/
chmod -R 775 /var/www/gestion-tchap/var/
```

---

## 8. Bridge Tchap (service systemd)

```bash
cp -r /var/www/gestion-tchap/tchap-service /opt/tchap-bridge

cd /opt/tchap-bridge
npm install --omit=dev
mkdir -p data
chown -R www-data:www-data /opt/tchap-bridge
chmod 750 data
```

Configurer `/opt/tchap-bridge/.env` :

```dotenv
PORT=3000
HOST=127.0.0.1
# Doit correspondre à TCHAP_SERVICE_KEY dans le .env PHP
API_KEY=<cle_api_bridge>
TCHAP_HOMESERVER=https://matrix.agent.interieur.tchap.gouv.fr
```

Créer `/etc/systemd/system/tchap-bridge.service` :

```ini
[Unit]
Description=Tchap Bridge E2EE
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/tchap-bridge
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/tchap-bridge/.env

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable tchap-bridge
systemctl start tchap-bridge

# Vérifier
curl http://127.0.0.1:3000/health
```

---

## 9. Pare-feu

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## 10. HTTPS avec Certbot

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d gestion-tchap.votre-domaine.fr
```

Certbot modifie automatiquement la config Nginx et programme le renouvellement automatique.

---

## 11. Vérification finale

```bash
# Services actifs
systemctl status php8.3-fpm nginx postgresql tchap-bridge

# Test HTTP
curl -I http://localhost/login

# Logs applicatifs
tail -f /var/www/gestion-tchap/var/log/prod.log
```

Accéder à l'application sur `https://gestion-tchap.votre-domaine.fr` avec les identifiants `Sic` / `SicGestionTchap`.

> **Changer ce mot de passe immédiatement** via le menu utilisateur → *Changer le mot de passe*.

---

## 12. Mise à jour

```bash
cd /var/www/gestion-tchap
git pull
composer install --no-dev --optimize-autoloader --no-interaction
APP_ENV=prod php bin/console app:db:migrate
APP_ENV=prod php bin/console cache:clear && APP_ENV=prod php bin/console cache:warmup
systemctl reload nginx
```

---

## Ports réseau

| Port | Service | Direction |
|------|---------|-----------|
| 22 | SSH (administration) | Entrant |
| 80 | HTTP → redirection HTTPS | Entrant |
| 443 | HTTPS | Entrant |
| 3000 | Tchap bridge | Loopback uniquement |
| 5432 | PostgreSQL | Loopback uniquement |
| 443 | Vers matrix.agent.interieur.tchap.gouv.fr | Sortant |
