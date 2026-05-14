# Déploiement avec Docker — Gestion Personnel Tchap

Ce document couvre les deux modes de déploiement basés sur Docker :

| Mode | Quand l'utiliser |
|------|-----------------|
| **[Docker local](#docker-local)** | Développement, test, mise en route rapide sur un poste |
| **[Ansible — VM production](#ansible--vm-production)** | Serveur de production — Docker installé et géré automatiquement par Ansible |

---

## Docker local

### Prérequis

- Docker ≥ 24
- Docker Compose (plugin intégré `docker compose` ou standalone `docker-compose`)

```bash
docker --version
docker compose version
```

### 1. Récupérer les sources

```bash
git clone git@gitlab.votre-societe.fr:VOTRE_GROUPE/gestion-personnel-tchap-PHP.git gestion-tchap
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

# Logs d'un service spécifique
docker compose logs -f php
docker compose logs -f tchap-bridge

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

Les données ne sont **pas perdues** lors des redémarrages ou mises à jour. Docker utilise des volumes persistants stockés sur le disque du serveur :

| Volume | Contenu |
|--------|---------|
| `postgres_data` | Base de données PostgreSQL (agents, salons, config) |
| `vendor_cache` | Dépendances PHP (accélère les rebuilds) |
| `symfony_cache` | Cache Symfony (droits `www-data` garantis) |
| `symfony_log` | Logs Symfony (droits `www-data` garantis) |
| `tchap_data` | Clés de chiffrement et session Matrix du bridge |

> **Sauvegarder `postgres_data` régulièrement.** Les clés E2EE dans `tchap_data` ne sont pas critiques (reconnexion possible via l'interface) mais leur perte provoque une interruption temporaire du bot.

### Dépannage

#### Erreur `Permission denied` sur `var/cache/prod/`

```
IOException: Cannot rename "/tmp/url_matching_routes.phpXXXXXX"
  to "/var/www/html/var/cache/prod/url_matching_routes.php": Permission denied
```

PHP-FPM (`www-data`) ne peut pas écrire dans le répertoire cache. Cause : le montage du répertoire hôte a écrasé les permissions définies à la construction de l'image.

Correction : supprimer les containers **et** les volumes anonymes, puis reconstruire.

```bash
docker compose down -v
docker compose up --build
```

> Les données PostgreSQL sont dans un volume **nommé** (`postgres_data`) et ne sont **pas** supprimées par `down -v`.

---

## Ansible — VM production

Ansible est un outil d'automatisation : il se connecte à la VM via le réseau, installe tout ce dont l'application a besoin (Docker, les services, la configuration) et met en place les mises à jour automatiques — sans qu'on ait besoin de se connecter manuellement à la VM.

### Vue d'ensemble du fonctionnement

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

### Étape 0 — Créer et préparer la VM

> Si vous disposez déjà d'une VM Ubuntu 24.04 LTS avec accès SSH root, passez directement à [l'étape 1](#étape-1--prérequis-sur-votre-poste).

#### Qu'est-ce qu'une VM ?

Une **machine virtuelle (VM)** est un ordinateur simulé qui tourne à l'intérieur de votre vrai ordinateur. Elle a son propre système d'exploitation, ses propres fichiers, et se comporte comme un serveur physique — mais elle n'est qu'un logiciel. **VirtualBox** est le programme qui permet de créer et gérer ces machines virtuelles, gratuitement.

#### 0.1 — Installer VirtualBox

Télécharger et installer VirtualBox depuis **[virtualbox.org](https://www.virtualbox.org/wiki/Downloads)** (choisir la version correspondant à votre système : Windows, macOS ou Linux).

#### 0.2 — Télécharger Ubuntu 24.04 LTS

Télécharger l'image d'installation (fichier `.iso`) depuis **[ubuntu.com/download/server](https://ubuntu.com/download/server)**.

> Choisir **Ubuntu Server 24.04 LTS** — pas la version Desktop. La version Server est plus légère et adaptée à un usage en production.

#### 0.3 — Créer la VM dans VirtualBox

1. Ouvrir VirtualBox → cliquer sur **Nouvelle**
2. Renseigner :
   - **Nom** : `gestion-tchap` (ou ce que vous voulez)
   - **Type** : Linux
   - **Version** : Ubuntu (64-bit)
3. Cliquer sur **Suivant** et configurer les ressources :
   - **RAM** : 4096 Mo (4 Go) minimum
   - **Processeurs** : 2 minimum
4. **Disque dur** : créer un nouveau disque virtuel de **40 Go** minimum
5. Cliquer sur **Terminer**

#### 0.4 — Configurer le réseau (étape importante)

Par défaut, VirtualBox isole la VM du reste du réseau. Il faut la faire apparaître comme une vraie machine sur votre réseau local pour pouvoir s'y connecter depuis votre poste et y accéder depuis un navigateur.

Dans VirtualBox, sélectionner la VM → **Configuration → Réseau** :
- **Carte 1** → Mode d'accès réseau : **Réseau par pont (Bridged Adapter)**
- **Nom** : choisir votre carte réseau principale (celle que vous utilisez pour internet)

> **Pourquoi "Réseau par pont" ?** Ce mode donne à la VM une vraie adresse IP sur votre réseau, comme si c'était un ordinateur branché sur le même switch. Vous pourrez y accéder depuis votre navigateur et Ansible pourra s'y connecter.

#### 0.5 — Installer Ubuntu sur la VM

1. Sélectionner la VM → **Configuration → Stockage**
2. Cliquer sur le lecteur optique vide → **Choisir un fichier de disque** → sélectionner le fichier `.iso` Ubuntu téléchargé
3. Démarrer la VM (bouton **Démarrer**)
4. Suivre l'assistant d'installation Ubuntu :
   - **Langue** : French ou English (votre choix)
   - **Type d'installation** : Ubuntu Server (minimized)
   - **Réseau** : laisser par défaut (DHCP automatique)
   - **Stockage** : utiliser le disque entier (option par défaut)
   - **Nom de la machine** : `gestion-tchap` (par exemple)
   - **Nom d'utilisateur** : `root` ou un autre (peu importe, Ansible créera `deploy`)
   - **Mot de passe** : choisir un mot de passe temporaire
   - **Activer OpenSSH** : ✅ **cocher cette case** — c'est indispensable

5. Attendre la fin de l'installation et redémarrer la VM

#### 0.6 — Trouver l'adresse IP de la VM

Une fois la VM redémarrée, se connecter avec le compte créé pendant l'installation et taper :

```bash
ip a
```

Repérer une ligne du type `inet 192.168.1.XX/24` sur l'interface réseau principale (souvent `enp0s3` ou `eth0`). **Noter cette IP** — elle sera utilisée dans toutes les étapes suivantes.

> L'IP ressemble à `192.168.X.X` ou `10.X.X.X` selon votre réseau. Ce n'est pas `127.0.0.1` (ça c'est la machine elle-même).

#### 0.7 — Configurer l'accès SSH par clé

SSH est le protocole qui permet à Ansible de se connecter à la VM de façon sécurisée. Au lieu d'un mot de passe, on utilise une **clé SSH** : une paire de fichiers (une clé privée sur votre poste, une clé publique sur la VM) qui se reconnaissent mutuellement — comme une clé et une serrure.

**Sur votre poste**, vérifier si vous avez déjà une clé SSH :

```bash
ls ~/.ssh/id_ed25519.pub
```

Si le fichier n'existe pas, en créer une :

```bash
ssh-keygen -t ed25519 -C "deploiement-gestion-tchap"
# Appuyer sur Entrée 3 fois pour accepter les valeurs par défaut
```

Cela crée deux fichiers :
- `~/.ssh/id_ed25519` → votre **clé privée** (ne jamais la partager)
- `~/.ssh/id_ed25519.pub` → votre **clé publique** (celle qu'on copie sur la VM)

**Copier la clé publique sur la VM** :

```bash
ssh-copy-id root@192.168.1.XX   # remplacer par l'IP de votre VM
# Saisir le mot de passe root de la VM quand demandé
```

**Vérifier que ça fonctionne** (doit se connecter sans mot de passe) :

```bash
ssh root@192.168.1.XX
```

Si vous voyez le prompt de la VM, tout est bon. Taper `exit` pour revenir sur votre poste.

---

### Étape 1 — Prérequis sur votre poste

Ansible doit être installé sur **votre poste** (pas sur la VM). Il tourne nativement sur Linux et macOS. Sur Windows, il faut passer par WSL.

| Système | Ce qu'il faut faire |
|---------|---------------------|
| **Ubuntu / Linux** | Installer directement (voir ci-dessous) |
| **macOS** | Installer directement (voir ci-dessous) |
| **Windows** | Activer WSL d'abord (voir ci-dessous) |

**Sur Windows — activer WSL** (à faire une seule fois) :

Ouvrir PowerShell en administrateur et taper :
```powershell
wsl --install
```
Redémarrer, puis ouvrir Ubuntu depuis le menu Démarrer. Toutes les commandes suivantes se tapent dans ce terminal Ubuntu.

**Installer Ansible** (Linux, macOS ou WSL) :

```bash
python3 --version        # doit afficher 3.10+, sinon : sudo apt install python3
pip3 install ansible
ansible --version        # doit afficher [core 2.15+]
```

**Installer les modules Ansible nécessaires** (depuis le dossier du projet) :

```bash
ansible-galaxy collection install -r ansible/requirements.yml
```

---

### Étape 2 — Configurer le déploiement

Trois fichiers sont à renseigner dans le dossier `ansible/` :

**`ansible/inventory/hosts.yml`** — l'adresse de la VM :

```yaml
gestion-tchap:
  ansible_host: 192.168.1.XX   # ← IP notée à l'étape 0.6
```

**`ansible/inventory/group_vars/all.yml`** — l'URL de votre dépôt GitLab :

```yaml
git_host:        gitlab.votre-societe.fr
app_repo:        git@gitlab.votre-societe.fr:VOTRE_GROUPE/gestion-personnel-tchap-PHP.git
app_default_uri: http://192.168.1.XX:8088   # URL d'accès à l'application
```

**Générer les secrets automatiquement** — un seul playbook s'occupe de tout :

```bash
ansible-playbook ansible/playbooks/init-secrets.yml
```

Ce playbook vous demande uniquement :
- Le **mot de passe PostgreSQL** (vous le choisissez librement)
- Un **mot de passe vault** (protège le fichier de secrets — à retenir)

`APP_SECRET` et `TCHAP_SERVICE_KEY` sont générés automatiquement. Le fichier `vault.yml` est écrit et chiffré sans intervention supplémentaire.

> **⚠ À lancer une seule fois.** Si vous le relancez après un déploiement existant, les secrets seront régénérés et les sessions utilisateurs seront invalidées.

---

### Étape 3 — Provisionner la VM *(une seule fois)*

Ce playbook configure Ubuntu depuis zéro : installe Docker, crée les utilisateurs, configure le pare-feu et sécurise SSH.

```bash
ansible-playbook ansible/playbooks/setup.yml --ask-vault-pass
```

Durée : environ 5 minutes. À la fin, la VM est prête à recevoir l'application.

---

### Étape 4 — Déployer l'application

Ce playbook clone le code depuis GitLab, génère la configuration, lance tous les containers Docker et attend que l'application réponde.

```bash
ansible-playbook ansible/playbooks/deploy.yml --ask-vault-pass
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

**Sur GitLab** : aller dans le dépôt → **Settings → Repository → Deploy keys** → **Add new key** → coller la clé → cocher *"Grant read permissions"* → **Add key**.

Sans cette étape, la mise à jour automatique toutes les heures échouera.

---

### Accéder à l'application

Ouvrir un navigateur sur votre poste et aller sur :

```
http://192.168.1.XX:8088
```

Identifiants initiaux : `Sic` / `SicGestionTchap` — **changer le mot de passe immédiatement**.

---

### Mise à jour automatique

Une fois déployée, la VM vérifie toutes les heures si de nouveaux commits ont été poussés sur GitLab. Si c'est le cas, elle met à jour l'application automatiquement.

```bash
# Voir les logs de mise à jour sur la VM
ssh deploy@192.168.1.XX
journalctl -u gestion-tchap-update.service -f

# Forcer une mise à jour immédiate
sudo systemctl start gestion-tchap-update.service
```

---

### Commandes utiles sur la VM

```bash
# Se connecter à la VM
ssh deploy@192.168.1.XX

# Depuis /opt/gestion-tchap :
docker compose -f docker-compose.prod.yml ps              # état des services
docker compose -f docker-compose.prod.yml logs -f         # logs en temps réel
docker compose -f docker-compose.prod.yml logs -f php     # logs PHP uniquement
docker compose -f docker-compose.prod.yml restart tchap-bridge   # redémarrer le bridge
```

---

### Sauvegardes

Les données (base de données et clés de chiffrement) sont dans des volumes Docker persistants. Pour les sauvegarder :

```bash
# Sauvegarde de la base de données
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U tchap gestion_tchap | gzip > backup_$(date +%Y%m%d).sql.gz

# Sauvegarde des clés E2EE
docker run --rm \
  -v gestion-tchap_tchap_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/tchap_data_$(date +%Y%m%d).tar.gz /data
```

---

## Ports réseau (Docker)

| Port | Service | Direction | Remarque |
|------|---------|-----------|----------|
| 22 | SSH | Entrant | Administration de la VM |
| 8088 | Interface web | Entrant | Accès à l'application |
| 3000 | Tchap bridge | Interne Docker | Non accessible depuis l'extérieur |
| 5432 | PostgreSQL | Interne Docker | Non accessible depuis l'extérieur |
| 443 | Vers Tchap | Sortant | Connexion au serveur Tchap gouvernemental |
