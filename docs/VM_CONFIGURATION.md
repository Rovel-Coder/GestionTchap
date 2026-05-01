# Configuration de la VM — Gestion Personnel Tchap

## Dimensionnement recommandé

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| vCPU | 2 | 4 |
| RAM | 2 Go | 4 Go |
| Disque OS | 20 Go | 40 Go |
| Disque données (PostgreSQL) | 10 Go | 50 Go |
| OS | Debian 12 / Ubuntu 22.04 LTS | Debian 12 |

> L'application est légère (pas de compilation JS, pas de Node.js). Le dimensionnement peut être revu à la baisse pour un usage interne limité (< 50 utilisateurs simultanés).

---

## 1. Système d'exploitation

```bash
# Mise à jour système
apt update && apt upgrade -y

# Paquets de base
apt install -y curl wget git unzip vim htop net-tools
```

---

## 2. PHP 8.3

### Installation via les dépôts officiels Sury (Debian/Ubuntu)

```bash
apt install -y lsb-release ca-certificates apt-transport-https software-properties-common gnupg2

curl -sSLo /tmp/debsuryorg-archive-keyring.gpg \
    https://packages.sury.org/php/apt.gpg
install -D -m 0644 /tmp/debsuryorg-archive-keyring.gpg \
    /etc/apt/keyrings/debsuryorg-archive-keyring.gpg

echo "deb [signed-by=/etc/apt/keyrings/debsuryorg-archive-keyring.gpg] \
    https://packages.sury.org/php/ $(lsb_release -sc) main" \
    > /etc/apt/sources.list.d/php.list

apt update
```

### Installer PHP 8.3 et les extensions requises

```bash
apt install -y \
    php8.3 \
    php8.3-fpm \
    php8.3-pgsql \
    php8.3-pdo \
    php8.3-mbstring \
    php8.3-xml \
    php8.3-intl \
    php8.3-ctype \
    php8.3-curl \
    php8.3-opcache \
    php8.3-readline
```

### Configuration PHP (production)

Éditer `/etc/php/8.3/fpm/php.ini` et `/etc/php/8.3/cli/php.ini` :

```ini
; Performance
opcache.enable=1
opcache.memory_consumption=128
opcache.interned_strings_buffer=16
opcache.max_accelerated_files=10000
opcache.validate_timestamps=0   ; mettre à 1 en développement

; Sécurité
expose_php = Off
display_errors = Off
log_errors = On
error_log = /var/log/php8.3-errors.log

; Limites
memory_limit = 256M
upload_max_filesize = 16M
post_max_size = 20M
max_execution_time = 60
max_input_time = 60

; Sessions
session.cookie_httponly = On
session.cookie_secure = On      ; activer uniquement si HTTPS
session.use_strict_mode = On
session.gc_maxlifetime = 86400
```

### Configuration PHP-FPM

Éditer `/etc/php/8.3/fpm/pool.d/www.conf` :

```ini
[www]
user = www-data
group = www-data
listen = /run/php/php8.3-fpm.sock
listen.owner = www-data
listen.group = www-data

pm = dynamic
pm.max_children = 20
pm.start_servers = 5
pm.min_spare_servers = 3
pm.max_spare_servers = 10
pm.max_requests = 500

; Logs
slowlog = /var/log/php8.3-fpm-slow.log
request_slowlog_timeout = 5s
```

```bash
systemctl enable php8.3-fpm
systemctl restart php8.3-fpm
```

---

## 3. PostgreSQL 14+

```bash
# Installation
apt install -y postgresql postgresql-contrib

# Activer et démarrer
systemctl enable postgresql
systemctl start postgresql
```

### Créer l'utilisateur et la base

```bash
sudo -u postgres psql <<EOF
CREATE USER tchap_user WITH PASSWORD 'mot_de_passe_fort';
CREATE DATABASE gestion_tchap OWNER tchap_user;
GRANT ALL PRIVILEGES ON DATABASE gestion_tchap TO tchap_user;
EOF
```

### Configuration PostgreSQL (performance)

Éditer `/etc/postgresql/<version>/main/postgresql.conf` :

```conf
# Mémoire (adapter selon la RAM disponible)
shared_buffers = 512MB           # 25% de la RAM
effective_cache_size = 1536MB    # 75% de la RAM
work_mem = 16MB
maintenance_work_mem = 128MB

# Connexions
max_connections = 50             # limiter selon le nb d'utilisateurs

# Logging
log_min_duration_statement = 1000   # log des requêtes > 1s
log_line_prefix = '%t [%p]: [%l-1] '

# Sécurité réseau (écouter uniquement en local)
listen_addresses = 'localhost'
```

Éditer `/etc/postgresql/<version>/main/pg_hba.conf` pour l'accès local :

```
# TYPE  DATABASE        USER            ADDRESS         METHOD
local   all             postgres                        peer
local   gestion_tchap   tchap_user                      md5
host    gestion_tchap   tchap_user      127.0.0.1/32    md5
```

```bash
systemctl restart postgresql
```

---

## 4. Composer

```bash
curl -sS https://getcomposer.org/installer | php
mv composer.phar /usr/local/bin/composer
chmod +x /usr/local/bin/composer

# Vérifier
composer --version
```

---

## 5. Serveur web

### Apache 2.4

```bash
apt install -y apache2

a2enmod rewrite headers proxy_fcgi setenvif
a2enconf php8.3-fpm

systemctl enable apache2
systemctl restart apache2
```

### Nginx (alternative)

```bash
apt install -y nginx

systemctl enable nginx
systemctl start nginx
```

---

## 6. Permissions et répertoires

```bash
# Répertoire de l'application
mkdir -p /var/www/gestion-tchap
chown -R www-data:www-data /var/www/gestion-tchap

# Permettre au compte de déploiement d'écrire dans le projet
usermod -aG www-data votre_utilisateur

# Permissions standard Symfony
find /var/www/gestion-tchap -type f -exec chmod 644 {} \;
find /var/www/gestion-tchap -type d -exec chmod 755 {} \;
chmod -R 775 /var/www/gestion-tchap/var/
chmod -R 775 /var/www/gestion-tchap/public/
```

---

## 7. Pare-feu

```bash
apt install -y ufw

# Politique par défaut
ufw default deny incoming
ufw default allow outgoing

# Autoriser SSH, HTTP, HTTPS
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp

ufw enable
ufw status
```

> Si la VM est derrière un pare-feu réseau (recommandé), restreindre l'accès HTTP/HTTPS aux seules plages IP autorisées.

---

## 8. Accès réseau sortant (requis pour Tchap)

L'application doit pouvoir joindre le serveur Matrix/Tchap en HTTPS depuis la VM :

```bash
# Tester la connectivité vers le homeserver Tchap
curl -v https://matrix.agent.interieur.tchap.gouv.fr/_matrix/client/v3/login
```

Si la VM est derrière un proxy d'entreprise, configurer dans `.env` :

```dotenv
# Variables standard pour Symfony HttpClient
http_proxy=http://proxy.intranet:3128
https_proxy=http://proxy.intranet:3128
no_proxy=localhost,127.0.0.1
```

---

## 9. Sécurisation complémentaire

### Fail2ban (protection anti-brute force SSH)

```bash
apt install -y fail2ban

cat > /etc/fail2ban/jail.d/ssh.conf <<EOF
[sshd]
enabled = true
port    = ssh
filter  = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime  = 3600
EOF

systemctl enable fail2ban
systemctl restart fail2ban
```

> L'application gère elle-même la limitation des tentatives de connexion via Symfony `login_throttling` (10 tentatives / 15 minutes par IP).

### Désactiver les services inutiles

```bash
systemctl disable --now bluetooth avahi-daemon cups 2>/dev/null || true
```

### Mises à jour automatiques de sécurité

```bash
apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 10. Vérification finale

```bash
# PHP
php -v
php -m | grep -E 'pdo_pgsql|mbstring|intl|opcache'

# PostgreSQL
sudo -u postgres psql -c "SELECT version();"
psql -U tchap_user -d gestion_tchap -c "\dt"

# Composer
composer --version

# PHP-FPM
systemctl status php8.3-fpm

# Serveur web
systemctl status apache2   # ou nginx
curl -I http://localhost/
```

---

## Récapitulatif des ports

| Port | Service | Sens |
|------|---------|------|
| 22 | SSH | Entrant (admin) |
| 80 | HTTP (redirection HTTPS) | Entrant |
| 443 | HTTPS | Entrant |
| 5432 | PostgreSQL | Local uniquement |
| 443 | HTTPS vers Tchap/Matrix | Sortant |
