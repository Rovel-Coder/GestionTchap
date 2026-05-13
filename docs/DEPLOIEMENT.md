# Déploiement — Gestion Personnel Tchap

Trois modes d'installation sont disponibles :

| Mode | Technologie sur le serveur | Recommandé pour |
|------|---------------------------|----------------|
| **[Docker local](#docker)** | Docker sur votre poste | Mise en route rapide, développement |
| **[Ansible (automatisé)](#ansible-automatisé)** | Docker sur la VM, géré par Ansible | **Production recommandée** — provisioning et mises à jour automatiques |
| **[VM manuelle Ubuntu 24.04 LTS](#vm-ubuntu-2404-lts)** | PHP/Nginx/PostgreSQL natifs, sans Docker | Production sur infrastructure existante contrainte |

---

## Docker

### Prérequis

- Docker ≥ 24
- Docker Compose (plugin intégré `docker compose` ou standalone `docker-compose`)

```bash
docker --version
docker compose version
```

### 1. Récupérer les sources

```bash
git clone https://github.com/Rovel-Coder/GestionTchap.git gestion-tchap
cd gestion-tchap
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

Ouvrir `.env` et renseigner les valeurs obligatoires :

```dotenv
# Secret applicatif — générer avec : openssl rand -base64 32
APP_SECRET=<secret_32_caracteres>

# Mot de passe PostgreSQL
DB_PASSWORD=<mot_de_passe_fort>

# Reprendre DB_PASSWORD ci-dessus
DATABASE_URL=postgresql://tchap:<mot_de_passe_fort>@postgres:5432/gestion_tchap

# Clé API partagée entre PHP et le bridge Tchap — générer avec : openssl rand -hex 32
TCHAP_SERVICE_KEY=<cle_api_bridge>
```

> Les valeurs par défaut (`changeme-…`) ne doivent **jamais** être conservées en production.

### 3. Démarrer les services

```bash
docker compose up -d
```

Au premier démarrage, Docker :
1. Construit les images PHP et tchap-bridge
2. Démarre PostgreSQL et attend qu'il soit prêt
3. Exécute les migrations SQL (`app:db:migrate`)
4. Crée le compte administrateur initial (`app:seed-sysadmin`)
5. Lance PHP-FPM et Nginx

Suivre les logs de démarrage :

```bash
docker compose logs -f php
```

### 4. Accéder à l'application

Ouvrir **http://localhost:8088** dans un navigateur.

Identifiants initiaux :
- Login : `Sic`
- Mot de passe : `SicGestionTchap`

> **Changer ce mot de passe immédiatement** via le menu utilisateur en haut à droite → *Changer le mot de passe*.

### 5. Connecter le bot Tchap

Dans l'interface web → **Configuration** → section *Bots Matrix*, renseigner les credentials du bot Tchap. Le bridge démarrera la session E2EE et conservera les clés dans le volume `tchap_data`.

### Commandes utiles

```bash
# Arrêter les services
docker compose down

# Redémarrer après une mise à jour du code
docker compose up -d --build

# Voir les logs en temps réel
docker compose logs -f

# Accéder au shell PHP
docker compose exec php bash

# Accéder à PostgreSQL
docker compose exec postgres psql -U tchap -d gestion_tchap

# Réappliquer les migrations manuellement
docker compose exec php php bin/console app:db:migrate
```

### Mise à jour

```bash
git pull
docker compose up -d --build
```

Les migrations sont automatiquement appliquées au redémarrage du conteneur PHP.

### Volumes persistants

| Volume | Contenu |
|--------|---------|
| `postgres_data` | Base de données PostgreSQL |
| `vendor_cache` | Dépendances Composer (accélère les rebuilds) |
| `tchap_data` | Clés E2EE et session Matrix du bridge |

> **Sauvegarder `postgres_data` régulièrement.** Les clés E2EE dans `tchap_data` ne sont pas critiques (reconnexion possible via l'interface) mais leur perte provoque une interruption temporaire du bot.

---

## Ansible (automatisé)

Le déploiement Ansible est **le mode recommandé pour la production**. Il installe Docker sur la VM, déploie tous les services dans des containers (`docker-compose.prod.yml`) et met en place une **mise à jour automatique toutes les heures** dès qu'un nouveau commit est poussé sur le dépôt.

Le guide complet est dans [`ansible/DEPLOIEMENT.md`](../ansible/DEPLOIEMENT.md).

### Séquence résumée

```bash
# 1. Installer les collections Ansible
ansible-galaxy collection install -r ansible/requirements.yml

# 2. Remplir les 3 fichiers de configuration (IP, URL dépôt, secrets)
#    ansible/inventory/hosts.yml
#    ansible/inventory/group_vars/all.yml
#    ansible/inventory/group_vars/vault.yml

# 3. Chiffrer les secrets
ansible-vault encrypt ansible/inventory/group_vars/vault.yml

# 4. Provisionner la VM (une seule fois)
ansible-playbook ansible/playbooks/setup.yml --ask-vault-pass

# 5. Déployer l'application
ansible-playbook ansible/playbooks/deploy.yml --ask-vault-pass
```

### ⚠ Action manuelle requise après l'étape 5

À la fin du playbook `deploy.yml`, Ansible affiche une clé SSH publique dans les logs :

```
=======================================================
ACTION REQUISE : Ajoutez cette clé comme Deploy Key
sur GitLab → Settings → Repository → Deploy keys
(cocher 'Grant read permissions to this key')
=======================================================
ssh-ed25519 AAAA... gestion-tchap-deploy@votre-vm
=======================================================
```

**Copier cette clé et l'ajouter sur GitLab** → Settings → Repository → Deploy keys.

Sans cette étape, la mise à jour automatique toutes les heures ne fonctionnera pas (le `git pull` sera rejeté par GitLab).

---

## VM Ubuntu 24.04 LTS (sans Docker)

### Dimensionnement recommandé

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| vCPU | 2 | 4 |
| RAM | 2 Go | 4 Go |
| Disque système | 20 Go | 40 Go |
| Disque données | 10 Go | 50 Go |

### 1. Mise à jour système et paquets de base

```bash
apt update && apt upgrade -y
apt install -y curl wget git unzip vim htop ufw
```

### 2. PHP 8.3

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

### 3. PostgreSQL 16

Ubuntu 24.04 inclut PostgreSQL 16. Utiliser le dépôt officiel PostgreSQL pour une version plus récente.

```bash
# Depuis les dépôts Ubuntu (PostgreSQL 16)
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

### 4. Composer

```bash
curl -sS https://getcomposer.org/installer | php
mv composer.phar /usr/local/bin/composer
chmod +x /usr/local/bin/composer
composer --version
```

### 5. Node.js 20 (pour le bridge Tchap)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version   # v20.x
```

### 6. Nginx

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

### 7. Déployer l'application

```bash
# Cloner ou copier les sources
git clone https://github.com/Rovel-Coder/GestionTchap.git /var/www/gestion-tchap
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

### 8. Bridge Tchap (service systemd)

```bash
# Copier le service
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

### 9. Pare-feu

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 10. HTTPS avec Certbot

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d gestion-tchap.votre-domaine.fr
```

Certbot modifie automatiquement la config Nginx et programme le renouvellement automatique.

### 11. Vérification finale

```bash
# Services actifs
systemctl status php8.3-fpm nginx postgresql tchap-bridge

# Test HTTP
curl -I http://localhost/login

# Logs applicatifs
tail -f /var/www/gestion-tchap/var/log/prod.log
```

Accéder à l'application sur `https://gestion-tchap.votre-domaine.fr` avec les identifiants `Sic` / `SicGestionTchap`.

### Mise à jour

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
| 22 | SSH | Entrant (administration) |
| 80 | HTTP → redirection HTTPS | Entrant |
| 443 | HTTPS | Entrant |
| 3000 | Tchap bridge | Loopback uniquement |
| 5432 | PostgreSQL | Loopback uniquement |
| 443 | Vers matrix.agent.interieur.tchap.gouv.fr | Sortant |
