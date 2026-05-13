# Configuration avancée de la VM — Ubuntu 24.04 LTS

Ce document couvre les réglages complémentaires à l'installation de base décrite dans [DEPLOIEMENT.md](DEPLOIEMENT.md).

---

## PHP-FPM — pool de processus

Éditer `/etc/php/8.3/fpm/pool.d/www.conf` pour adapter aux ressources disponibles :

```ini
[www]
user  = www-data
group = www-data
listen = /run/php/php8.3-fpm.sock
listen.owner = www-data
listen.group = www-data

; Gestion dynamique des processus
pm = dynamic
pm.max_children    = 20   ; augmenter si la RAM le permet
pm.start_servers   = 5
pm.min_spare_servers = 3
pm.max_spare_servers = 10
pm.max_requests    = 500  ; recycler les processus pour éviter les fuites mémoire

; Log des requêtes lentes
slowlog = /var/log/php8.3-fpm-slow.log
request_slowlog_timeout = 5s
```

```bash
systemctl restart php8.3-fpm
```

---

## PostgreSQL — réglages performance

Adapter à la RAM disponible dans `/etc/postgresql/16/main/postgresql.conf` :

```conf
# Mémoire — règle générale : shared_buffers = 25 % de la RAM
shared_buffers      = 512MB       # pour 2 Go de RAM
effective_cache_size = 1536MB     # 75 % de la RAM
work_mem            = 16MB
maintenance_work_mem = 128MB

# Connexions
max_connections = 50              # suffisant pour une instance PHP-FPM < 20 workers

# Journalisation — utile pour détecter des requêtes lentes
log_min_duration_statement = 1000    # ms
log_line_prefix = '%t [%p]: '

# Sécurité réseau
listen_addresses = 'localhost'
```

Accès autorisés dans `/etc/postgresql/16/main/pg_hba.conf` :

```
# TYPE  DATABASE        USER         ADDRESS        METHOD
local   all             postgres                    peer
local   gestion_tchap   tchap_user                  scram-sha-256
host    gestion_tchap   tchap_user   127.0.0.1/32   scram-sha-256
```

```bash
systemctl restart postgresql
```

---

## Sauvegarde de la base de données

### Dump manuel

```bash
sudo -u postgres pg_dump gestion_tchap \
    --format=custom \
    --file=/var/backups/gestion_tchap_$(date +%Y%m%d_%H%M).dump
```

### Sauvegarde automatique via cron

```bash
cat > /etc/cron.d/gestion-tchap-backup << 'EOF'
# Dump quotidien à 2h du matin, conservation 30 jours
0 2 * * *  postgres  pg_dump gestion_tchap --format=custom \
              --file=/var/backups/gestion_tchap_$(date +\%Y\%m\%d).dump \
              && find /var/backups -name 'gestion_tchap_*.dump' -mtime +30 -delete
EOF
```

### Restauration

```bash
sudo -u postgres pg_restore \
    --dbname=gestion_tchap \
    --clean \
    /var/backups/gestion_tchap_20260101_020000.dump
```

---

## Nginx — optimisations supplémentaires

Ajouter dans le bloc `server` ou dans `/etc/nginx/nginx.conf` :

```nginx
# Compression gzip
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml;
gzip_min_length 1024;

# Cache navigateur pour les assets statiques
location ~* \.(css|js|png|jpg|svg|woff2?)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}

# Headers de sécurité HTTP
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
# Activer HSTS si HTTPS est configuré :
# add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Masquer la version Nginx
server_tokens off;

# Limiter la taille des requêtes
client_max_body_size 20M;
```

---

## Supervision avec systemd

Toutes les unités systemd pertinentes :

```bash
# État de tous les services d'un coup
systemctl status php8.3-fpm nginx postgresql tchap-bridge

# Logs en temps réel (toutes unités)
journalctl -u php8.3-fpm -u nginx -u postgresql -u tchap-bridge -f

# Relancer automatiquement en cas d'échec
systemctl edit tchap-bridge
```

Dans l'éditeur (ajout d'un override) :

```ini
[Service]
Restart=always
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=5
```

---

## Sécurisation

### Fail2ban — protection SSH et applicative

```bash
apt install -y fail2ban
```

Créer `/etc/fail2ban/jail.d/local.conf` :

```ini
[sshd]
enabled  = true
port     = ssh
maxretry = 5
bantime  = 3600

[nginx-http-auth]
enabled = true
```

```bash
systemctl enable --now fail2ban
```

> L'application implémente déjà un rate-limiting natif via Symfony (`login_throttling`) : 10 tentatives par IP par 15 minutes.

### Désactiver les services inutiles

```bash
systemctl disable --now bluetooth avahi-daemon cups snapd 2>/dev/null || true
```

### Mises à jour automatiques de sécurité

```bash
apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

---

## Proxy d'entreprise

Si la VM est derrière un proxy, ajouter dans `/var/www/gestion-tchap/.env` :

```dotenv
# Utilisés par Symfony HttpClient (appels vers le bridge et Tchap)
http_proxy=http://proxy.intranet:3128
https_proxy=http://proxy.intranet:3128
no_proxy=localhost,127.0.0.1
```

Et dans `/opt/tchap-bridge/.env` pour Node.js :

```dotenv
HTTPS_PROXY=http://proxy.intranet:3128
NO_PROXY=localhost,127.0.0.1
```

Tester la connectivité sortante :

```bash
curl -v https://matrix.agent.interieur.tchap.gouv.fr/_matrix/client/v3/login
```

---

## Vérifications post-installation

```bash
# PHP et extensions
php -v
php -m | grep -E 'pdo_pgsql|mbstring|intl|opcache'

# PostgreSQL
sudo -u postgres psql -c "SELECT version();"
psql -U tchap_user -d gestion_tchap -c "\dt"

# Bridge Tchap
curl -s http://127.0.0.1:3000/health | python3 -m json.tool

# Application
curl -I http://localhost/login

# Logs applicatifs
tail -20 /var/www/gestion-tchap/var/log/prod.log
```

---

## Récapitulatif des ports

| Port | Service | Direction | Remarque |
|------|---------|-----------|----------|
| 22 | SSH | Entrant | Administration |
| 80 | HTTP | Entrant | Redirection vers HTTPS |
| 443 | HTTPS | Entrant | Application |
| 3000 | Tchap bridge | Loopback | Jamais exposé |
| 5432 | PostgreSQL | Loopback | Jamais exposé |
| 443 | Matrix/Tchap | Sortant | `matrix.agent.interieur.tchap.gouv.fr` |
