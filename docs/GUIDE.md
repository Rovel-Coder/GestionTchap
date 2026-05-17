# Guide complet — Gestion Personnel Tchap

Ce document couvre toutes les étapes : développement local, déploiement en production via Ansible, configuration post-déploiement et maintenance.

---

## Vue d'ensemble

**Gestion Personnel Tchap** synchronise un annuaire d'agents avec des salons Tchap chiffrés de bout en bout (messagerie sécurisée de l'État français basée sur le protocole Matrix).

### Stack technique

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| Application web | PHP 8.3 / Symfony 7 | Interface de gestion et API |
| Base de données | PostgreSQL 16 | Stockage des agents, unités, salons |
| Serveur web | Nginx (Alpine) | Reverse proxy + fichiers statiques |
| Bridge Tchap | Node.js 20 | Session Matrix persistante avec chiffrement E2EE |
| Orchestration | Docker Compose | Tous les services dans des containers |
| Déploiement | Ansible | Provisioning VM + déploiement automatisé |

L'ensemble tourne sur une seule VM via Docker Compose. Le bridge Node.js maintient une connexion permanente au serveur Tchap et gère le chiffrement de bout en bout (Rust SDK).

---

## Partie 1 — Développement local (Docker)

### Prérequis

- Docker ≥ 24
- Docker Compose (plugin intégré `docker compose`)

```bash
docker --version
docker compose version
```

### 1. Récupérer les sources

```bash
git clone <url-du-depot> gestion-tchap
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

> **Changer ce mot de passe immédiatement** via Configuration → Administrateurs système.

### 5. Connecter le bot Tchap

Dans l'interface web → **Configuration → Bots Matrix**, renseigner les credentials du bot Tchap. Le bridge démarrera la session E2EE et conservera les clés dans le volume `tchap_data`.

### Commandes utiles (développement)

```bash
# Arrêter les services
docker compose down

# Redémarrer après une mise à jour du code
docker compose up -d --build

# Voir les logs en temps réel
docker compose logs -f

# Logs d'un service spécifique
docker compose logs -f php
docker compose logs -f tchap-bridge

# Shell dans le container PHP
docker compose exec php bash

# Accès direct à PostgreSQL
docker compose exec postgres psql -U tchap -d gestion_tchap

# Réappliquer les migrations manuellement
docker compose exec php php bin/console app:db:migrate

# Vider le cache Symfony
docker compose exec php php bin/console cache:clear
```

### Mise à jour (développement)

```bash
git pull
docker compose up -d --build
```

Les migrations sont automatiquement appliquées au redémarrage du container PHP.

### Volumes persistants

Les données ne sont **pas perdues** lors des redémarrages ou mises à jour :

| Volume | Contenu |
|--------|---------|
| `postgres_data` | Base de données PostgreSQL (agents, salons, config) |
| `vendor_cache` | Dépendances PHP (accélère les rebuilds) |
| `symfony_cache` | Cache Symfony |
| `symfony_log` | Logs Symfony |
| `tchap_data` | Clés de chiffrement et session Matrix du bridge |

### Dépannage Docker

#### Erreur `Permission denied` sur `var/cache/prod/`

```
IOException: Cannot rename "/tmp/url_matching_routes.phpXXXXXX"
  to "/var/www/html/var/cache/prod/url_matching_routes.php": Permission denied
```

Correction : supprimer les containers **et** les volumes anonymes, puis reconstruire.

```bash
docker compose down -v
docker compose up --build
```

> Les données PostgreSQL sont dans un volume **nommé** (`postgres_data`) et ne sont **pas** supprimées par `down -v`.

---

## Partie 2 — Déploiement production via Ansible

Ansible configure et déploie l'application sur une VM Ubuntu en automatisant tout : installation Docker, pare-feu, mise à jour automatique.

```
Votre poste
│  (Ansible tourne ici)
│
│  SSH  ──────────────────────────►  VM Ubuntu
│                                     └── Docker
│                                           ├── PHP / Symfony
│                                           ├── PostgreSQL
│                                           ├── Nginx
│                                           └── Bridge Tchap
│
GitLab  ◄────────────────────────────────── git pull (toutes les heures)
```

Ansible tourne **sur votre poste**, pas sur la VM. Il pilote la VM à distance via SSH.

---

### Étape 0 — Préparer la VM

> Si vous disposez déjà d'une VM Ubuntu 24.04 LTS avec accès SSH root, passez directement à l'[étape 1](#étape-1--prérequis-sur-votre-poste).

#### Ressources nécessaires

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 Go | 4 Go |
| Disque | 20 Go SSD | 40 Go SSD |
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |

#### Accès réseau requis

La VM doit pouvoir joindre en sortie :

- `matrix.agent.interieur.tchap.gouv.fr` — port 443 (homeserver Tchap)
- `agent.interieur.tchap.gouv.fr` — port 443 (API Tchap)
- `download.docker.com` — port 443 (installation Docker)
- `registry.npmjs.org` — port 443 (dépendances Node.js)
- `packagist.org` — port 443 (dépendances PHP)
- Votre dépôt Git — port 22 ou 443

En entrée, seuls ces ports doivent être accessibles :

- Port **22** (TCP) — SSH depuis le poste de l'administrateur
- Port **8088** (TCP) — Interface web de l'application

#### Option A — VM avec VirtualBox

VirtualBox est un logiciel gratuit pour créer des machines virtuelles (un ordinateur simulé tournant à l'intérieur de votre poste).

**Installer VirtualBox** : télécharger depuis [virtualbox.org](https://www.virtualbox.org/wiki/Downloads).

**Télécharger Ubuntu Server 24.04 LTS** : télécharger le fichier `.iso` depuis [ubuntu.com/download/server](https://ubuntu.com/download/server).

**Créer la VM** :

1. VirtualBox → **Nouvelle**
2. Nom : `gestion-tchap`, Type : Linux, Version : Ubuntu (64-bit)
3. RAM : 4096 Mo minimum, Processeurs : 2 minimum
4. Disque : nouveau disque virtuel de 40 Go minimum
5. **Terminer**

**Configurer le réseau** (important) :

VM → Configuration → Réseau → Carte 1 :
- **Mode d'accès réseau** : **Réseau par pont (Bridged Adapter)**
- **Nom** : votre carte réseau principale

> Ce mode donne à la VM une vraie adresse IP sur votre réseau, accessible depuis votre navigateur et par Ansible.

**Installer Ubuntu** :

1. Configuration → Stockage → lecteur optique vide → choisir le `.iso` Ubuntu
2. Démarrer la VM
3. Suivre l'assistant :
   - Type d'installation : **Ubuntu Server (minimized)**
   - Réseau : laisser par défaut (DHCP)
   - Stockage : utiliser le disque entier
   - **Activer OpenSSH : ✅ cocher cette case** — indispensable

**Trouver l'IP de la VM** :

Une fois démarrée, se connecter et taper :

```bash
ip a
```

Repérer une ligne `inet 192.168.1.XX/24`. **Noter cette IP** — elle sera utilisée dans toutes les étapes suivantes.

#### Option B — Serveur physique ou VM existante

Si vous disposez déjà d'un serveur Ubuntu 24.04 LTS avec SSH accessible, passez directement à la configuration SSH ci-dessous.

#### Configurer l'accès SSH par clé

Ansible se connecte via SSH avec une clé (plus sécurisé qu'un mot de passe).

**Sur votre poste**, vérifier si une clé existe déjà :

```bash
ls ~/.ssh/id_ed25519.pub
```

Si le fichier n'existe pas :

```bash
ssh-keygen -t ed25519 -C "deploiement-gestion-tchap"
# Appuyer sur Entrée 3 fois pour accepter les valeurs par défaut
```

**Copier la clé publique sur la VM** :

```bash
ssh-copy-id root@192.168.1.XX   # remplacer par l'IP de votre VM
```

**Vérifier** (doit se connecter sans mot de passe) :

```bash
ssh root@192.168.1.XX
# Taper "exit" pour revenir
```

---

### Étape 1 — Prérequis sur votre poste

Ansible doit être installé sur **votre poste** (pas sur la VM).

| Système | Ce qu'il faut faire |
|---------|---------------------|
| **Ubuntu / Linux** | Installer directement avec `pip3` |
| **macOS** | Installer directement avec `pip3` |
| **Windows** | Activer WSL d'abord (voir ci-dessous) |

**Sur Windows — activer WSL** (une seule fois) :

```powershell
# Dans PowerShell en administrateur
wsl --install
```

Redémarrer, puis ouvrir Ubuntu depuis le menu Démarrer. Toutes les commandes suivantes se tapent dans ce terminal Ubuntu WSL.

**Installer Ansible** (Linux, macOS ou WSL) :

```bash
python3 --version        # doit afficher 3.10+
pip3 install ansible
ansible --version        # doit afficher [core 2.15+]
```

**Récupérer le dépôt et installer les collections** :

```bash
git clone <url-du-depot>
cd gestion-personnel-tchap-PHP/ansible
ansible-galaxy collection install -r requirements.yml
```

---

### Étape 2 — Configurer le déploiement

**`ansible/inventory/hosts.yml`** — l'adresse de la VM :

```yaml
gestion-tchap:
  ansible_host: 192.168.1.XX   # ← IP notée à l'étape 0
```

**`ansible/inventory/group_vars/all.yml`** — les variables de l'application :

```yaml
git_host:         gitlab.votre-societe.fr
app_repo:         git@gitlab.votre-societe.fr:VOTRE_GROUPE/gestion-personnel-tchap-PHP.git
app_branch:       main
app_port:         8088
app_default_uri:  http://192.168.1.XX:8088   # URL d'accès à l'application
```

**Générer les secrets** (une seule fois) :

```bash
ansible-playbook playbooks/init-secrets.yml
```

Ce playbook demande uniquement :
- Le **mot de passe PostgreSQL** (vous le choisissez)
- Un **mot de passe vault** (protège le fichier de secrets — à retenir)

`APP_SECRET` et `TCHAP_SERVICE_KEY` sont générés automatiquement. Le fichier `vault.yml` est écrit et chiffré sans intervention supplémentaire.

> **⚠ À lancer une seule fois.** Si relancé après un déploiement existant, les secrets seront régénérés et les sessions utilisateurs seront invalidées.

---

### Étape 3 — Provisionner la VM *(une seule fois)*

Ce playbook configure Ubuntu depuis zéro :
- Mise à jour complète du système
- Installation de Docker Engine + Docker Compose
- Création de l'utilisateur `deploy` avec accès Docker
- Configuration du pare-feu UFW (ports 22 et 8088 uniquement)
- Activation de Fail2ban (protection contre les tentatives de connexion)
- Durcissement SSH (désactivation de l'authentification par mot de passe)
- Configuration du fuseau horaire (Europe/Paris)

```bash
ansible-playbook playbooks/setup.yml --ask-vault-pass
```

Durée : environ 5 minutes.

> **Après ce playbook**, la connexion root par mot de passe est désactivée. Seul l'utilisateur `deploy` avec clé SSH peut se connecter.

---

### Étape 4 — Déployer l'application

Ce playbook clone le code depuis GitLab, génère la configuration, lance tous les containers et attend que l'application réponde.

```bash
ansible-playbook playbooks/deploy.yml --ask-vault-pass
```

---

### ⚠ Action manuelle requise après l'étape 4

À la fin du playbook `deploy.yml`, Ansible affiche une clé SSH dans les logs. Cette clé permet à la VM de récupérer automatiquement les mises à jour depuis GitLab.

```
=======================================================
ACTION REQUISE : Ajoutez cette clé comme Deploy Key
sur GitLab → Settings → Repository → Deploy keys
(cocher 'Grant read permissions to this key')
=======================================================
ssh-ed25519 AAAA... gestion-tchap-deploy@votre-vm
=======================================================
```

**Sur GitLab** : dépôt → **Settings → Repository → Deploy keys → Add new key** → coller la clé → cocher *"Grant read permissions"* → **Add key**.

Sans cette étape, la mise à jour automatique toutes les heures échouera.

---

### Étape 5 — Vérifier le déploiement

```bash
# Depuis la VM
ssh deploy@192.168.1.XX
curl -s -o /dev/null -w "%{http_code}" http://localhost:8088
# Attendu : 200 ou 302
```

Ou ouvrir `http://192.168.1.XX:8088` dans un navigateur.

---

## Partie 3 — Configuration post-déploiement

### Connexion initiale

Accéder à l'interface web et se connecter avec le compte administrateur par défaut :

- **Identifiant** : `Sic`
- **Mot de passe** : `SicGestionTchap`

**Changer ce mot de passe immédiatement** : Configuration → Administrateurs système → Réinitialiser le mot de passe.

### Connecter le bot Tchap

1. Créer un compte Tchap dédié pour le bot (adresse email dédiée, ex : `bot-gestion@votre-service.gouv.fr`)
2. Dans l'interface : **Configuration → Bots Matrix → Ajouter un bot**
3. Renseigner :
   - **Nom** : ex. `Bot Gestion`
   - **User ID Matrix** : `@bot-gestion:agent.interieur.tchap.gouv.fr`
   - **Bot principal** : cocher (gère E2EE via le bridge)
4. Cliquer **Connecter** → saisir le mot de passe du compte Tchap du bot

Le bot se connecte, génère ses clés E2EE et publie son device sur le homeserver.

### Vérifier le device du bot (vérification SAS)

Pour que les autres appareils Tchap fassent confiance au bot et lui transfèrent les clés de chiffrement :

1. Dans Tchap (app mobile ou web), ouvrir la conversation avec le bot
2. **Profil du bot → Vérifier l'appareil**
3. Dans l'interface d'administration : **Configuration → Chiffrement E2EE → Vérification SAS → Vérifier l'état**
4. Comparer les 7 emojis affichés des deux côtés et confirmer s'ils correspondent

---

## Partie 4 — Mises à jour

### Mise à jour automatique (recommandée)

Une fois déployée, la VM **se met à jour toute seule** à chaque nouveau commit sur `main`. Deux mécanismes sont en place :

#### Timer systemd (toutes les heures — installé par Ansible)

Vérifie toutes les heures si de nouveaux commits sont disponibles sur GitLab. Si c'est le cas, lance automatiquement `git pull` + `docker compose up -d --build`.

```bash
# Voir les logs du timer (depuis la VM)
journalctl -u gestion-tchap-update.service -f

# Forcer une mise à jour immédiate
sudo systemctl start gestion-tchap-update.service
```

Changer l'intervalle dans `ansible/inventory/group_vars/all.yml` :

```yaml
update_interval: 30min   # ou 2h, 15min…
```

#### GitHub Actions (immédiat — optionnel)

Si la VM est accessible en SSH depuis internet, le déploiement se déclenche **immédiatement** après chaque push.

**Configuration** :

1. GitHub → *Settings → Secrets and variables → Actions* → ajouter :

   | Secret | Valeur |
   |--------|--------|
   | `VM_SSH_HOST` | IP ou hostname de la VM |
   | `VM_SSH_USER` | `deploy` |
   | `VM_SSH_KEY` | Contenu de `~/.ssh/id_ed25519` |

2. GitHub → *Settings → Variables* → ajouter :

   | Variable | Valeur |
   |----------|--------|
   | `VM_AUTODEPLOY` | `true` |

> Si la VM n'est pas accessible depuis internet, laisser `VM_AUTODEPLOY` non défini. Le timer systemd prend le relais.

> **Note GitLab** : le fichier `.github/workflows/deploy.yml` n'a aucun effet sur un GitLab interne. Le timer systemd toutes les heures est suffisant pour la plupart des besoins.

### Mise à jour manuelle

```bash
# Mise à jour rapide depuis votre poste
ansible-playbook ansible/playbooks/update.yml --ask-vault-pass

# Rebuild complet (changement de Dockerfile, mise à jour des dépendances)
ansible-playbook ansible/playbooks/deploy.yml --ask-vault-pass
```

---

## Partie 5 — Référence commandes

### Se connecter à la VM

```bash
ssh deploy@<IP_VM>
```

### Gestion des services (depuis `/opt/gestion-tchap`)

```bash
# Statut des services
docker compose -f docker-compose.prod.yml ps

# Logs en temps réel (tous les services)
docker compose -f docker-compose.prod.yml logs -f

# Logs d'un service spécifique
docker compose -f docker-compose.prod.yml logs -f tchap-bridge
docker compose -f docker-compose.prod.yml logs -f php

# Redémarrer le bridge Tchap
docker compose -f docker-compose.prod.yml restart tchap-bridge

# Redémarrer tous les services
docker compose -f docker-compose.prod.yml restart
```

---

## Partie 6 — Sauvegardes

Les données persistantes sont dans deux volumes Docker :

| Volume | Contenu | Criticité |
|--------|---------|-----------|
| `postgres_data` | Base de données (agents, salons, config) | **Critique** |
| `tchap_data` | Clés E2EE du bot, sessions Matrix | Haute |

```bash
# Sauvegarde PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U tchap gestion_tchap | gzip > backup_$(date +%Y%m%d).sql.gz

# Sauvegarde du volume tchap_data (clés E2EE)
docker run --rm \
  -v gestion-tchap_tchap_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/tchap_data_$(date +%Y%m%d).tar.gz /data

# Restauration PostgreSQL
gunzip -c backup_20260101.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U tchap gestion_tchap
```

### Sauvegarde automatique via cron (optionnel)

```bash
cat > /etc/cron.d/gestion-tchap-backup << 'EOF'
# Dump quotidien à 2h du matin, conservation 30 jours
0 2 * * *  root  cd /opt/gestion-tchap && \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U tchap gestion_tchap | gzip > /var/backups/gestion_tchap_$(date +\%Y\%m\%d).sql.gz && \
  find /var/backups -name 'gestion_tchap_*.sql.gz' -mtime +30 -delete
EOF
```

---

## Partie 7 — Résolution de problèmes

### Le bridge Tchap ne démarre pas

```bash
docker compose -f docker-compose.prod.yml logs tchap-bridge | tail -30
```

Causes fréquentes :
- **Clés OTK en conflit** : supprimer le volume tchap_data et reconnecter le bot
- **Token expiré** : reconnecter le bot depuis l'interface (Configuration → Bots)

### L'application ne répond pas

```bash
docker compose -f docker-compose.prod.yml ps
# Vérifier que tous les services sont en état "Up"

docker compose -f docker-compose.prod.yml logs php | tail -20
```

### Mot de passe vault Ansible oublié

Le vault chiffre uniquement les secrets du fichier `vault.yml`. Si le mot de passe vault est perdu, récupérer les valeurs directement sur la VM :

```bash
cat /opt/gestion-tchap/.env
```

Puis recréer un vault avec ces valeurs et un nouveau mot de passe via `playbooks/init-secrets.yml` (attention : ne pas redeployer ensuite sans vérification).

### Vérifications rapides (depuis la VM)

```bash
# État des containers
docker compose -f docker-compose.prod.yml ps

# Bridge Tchap
curl -s http://127.0.0.1:3000/health

# Application
curl -I http://localhost:8088/login
```

---

## Partie 8 — Configuration avancée

### Proxy d'entreprise

Si la VM est derrière un proxy, ajouter dans `/opt/gestion-tchap/.env` :

```dotenv
http_proxy=http://proxy.intranet:3128
https_proxy=http://proxy.intranet:3128
no_proxy=localhost,127.0.0.1
```

Et dans le container tchap-bridge, même variables pour Node.js :

```dotenv
HTTPS_PROXY=http://proxy.intranet:3128
NO_PROXY=localhost,127.0.0.1
```

Tester la connectivité sortante :

```bash
curl -v https://matrix.agent.interieur.tchap.gouv.fr/_matrix/client/v3/login
```

### Optimisations Nginx

Dans la configuration Nginx du container (ou en override) :

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
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# HSTS si HTTPS configuré :
# add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

server_tokens off;
client_max_body_size 20M;
```

### Ports réseau

| Port | Service | Direction | Remarque |
|------|---------|-----------|----------|
| 22 | SSH | Entrant | Administration de la VM |
| 8088 | Interface web | Entrant | Accès à l'application |
| 3000 | Tchap bridge | Interne Docker | Non accessible depuis l'extérieur |
| 5432 | PostgreSQL | Interne Docker | Non accessible depuis l'extérieur |
| 443 | Vers Tchap | Sortant | `matrix.agent.interieur.tchap.gouv.fr` |

---

## Annexe — Structure des fichiers Ansible

```
ansible/
├── ansible.cfg                         Configuration Ansible (user SSH, clé, etc.)
├── requirements.yml                    Collections Ansible à installer
├── inventory/
│   ├── hosts.yml                       ← IP de la VM (à modifier)
│   └── group_vars/
│       ├── all.yml                     ← Variables de l'application (à modifier)
│       └── vault.yml                   ← Secrets chiffrés (généré par init-secrets.yml)
├── roles/
│   ├── common/                         Provisioning système (UFW, fail2ban, SSH…)
│   ├── docker/                         Installation Docker
│   └── app/                            Déploiement de l'application
│       ├── handlers/main.yml           Reload systemd
│       └── templates/
│           ├── env.j2                  Template .env généré depuis vault
│           ├── update.sh.j2            Script de mise à jour automatique
│           ├── gestion-tchap-update.service.j2   Service systemd
│           └── gestion-tchap-update.timer.j2     Timer systemd (toutes les heures)
└── playbooks/
    ├── init-secrets.yml                Génération automatique des secrets (1 fois)
    ├── setup.yml                       Initialisation VM (une seule fois)
    ├── deploy.yml                      Déploiement complet
    └── update.yml                      Mise à jour manuelle rapide
```
