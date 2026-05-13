# Guide de déploiement — Gestion Personnel Tchap

## Vue d'ensemble

Cette application permet la gestion automatisée des membres dans des salons Tchap (messagerie sécurisée de l'État français basée sur le protocole Matrix). Elle synchronise un annuaire d'agents avec des salons chiffrés de bout en bout.

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

## 1. Préparer la VM

### 1.1 Ressources nécessaires

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 Go | 4 Go |
| Disque | 20 Go SSD | 40 Go SSD |
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| Réseau | Accès internet sortant | Accès internet sortant |

### 1.2 Accès réseau requis

La VM doit pouvoir joindre en sortie :

- `matrix.agent.interieur.tchap.gouv.fr` — port 443 (homeserver Tchap)
- `agent.interieur.tchap.gouv.fr` — port 443 (API Tchap)
- `download.docker.com` — port 443 (installation Docker)
- `registry.npmjs.org` — port 443 (dépendances Node.js, build Docker)
- `packagist.org` — port 443 (dépendances PHP, build Docker)
- `gitlab.votre-societe.fr` — port 22 ou 443 (récupération du code source)

En entrée, seuls ces ports doivent être accessibles :

- Port **22** (TCP) — SSH depuis le poste de l'administrateur
- Port **8088** (TCP) — Interface web de l'application

### 1.3 Créer la VM avec VirtualBox

> Si vous déployez sur un serveur physique ou une VM déjà existante avec Ubuntu 24.04 installé et SSH accessible, passez directement à la [section 2](#2-prérequis-sur-le-poste-de-déploiement).

**VirtualBox** est un logiciel gratuit qui permet de créer des machines virtuelles — c'est-à-dire des ordinateurs simulés qui tournent à l'intérieur de votre vrai poste. Pratique pour héberger l'application sur un poste dédié ou pour tester avant un déploiement sur un vrai serveur.

#### Installer VirtualBox

Télécharger et installer VirtualBox depuis **[virtualbox.org](https://www.virtualbox.org/wiki/Downloads)** (version Windows, macOS ou Linux selon votre poste).

#### Télécharger Ubuntu Server 24.04 LTS

Télécharger le fichier `.iso` depuis **[ubuntu.com/download/server](https://ubuntu.com/download/server)**.

> Choisir **Ubuntu Server 24.04 LTS** (pas la version Desktop) — plus légère et adaptée à un serveur.

#### Créer la VM dans VirtualBox

1. Ouvrir VirtualBox → **Nouvelle**
2. Renseigner :
   - **Nom** : `gestion-tchap`
   - **Type** : Linux / Ubuntu (64-bit)
3. **RAM** : 4096 Mo minimum
4. **Processeurs** : 2 minimum
5. **Disque dur** : nouveau disque virtuel de 40 Go minimum
6. Cliquer sur **Terminer**

#### Configurer le réseau (important)

Dans VirtualBox, sélectionner la VM → **Configuration → Réseau** :
- **Mode d'accès réseau** : **Réseau par pont (Bridged Adapter)**
- **Nom** : sélectionner votre carte réseau principale

> Ce mode donne à la VM une vraie adresse IP sur votre réseau, comme si c'était un ordinateur branché sur le même switch. Sans ça, Ansible ne pourra pas s'y connecter et l'application ne sera pas accessible depuis un navigateur.

#### Installer Ubuntu sur la VM

1. Dans VirtualBox → **Configuration → Stockage** → cliquer sur le lecteur optique vide → **Choisir un fichier de disque** → sélectionner le `.iso` Ubuntu
2. Démarrer la VM
3. Suivre l'assistant d'installation :
   - Langue, clavier : selon vos préférences
   - Type d'installation : **Ubuntu Server (minimized)**
   - Réseau : laisser par défaut (DHCP)
   - Stockage : **utiliser le disque entier**
   - **Activer OpenSSH : ✅ cocher cette case** — indispensable pour qu'Ansible puisse se connecter
   - Identifiant : `root` ou ce que vous souhaitez
4. Attendre la fin et redémarrer

#### Trouver l'adresse IP de la VM

Une fois la VM redémarrée, se connecter avec le compte créé et taper :

```bash
ip a
```

Repérer une ligne du type `inet 192.168.1.XX/24`. **Noter cette IP** — elle sera utilisée dans toutes les étapes suivantes.

### 1.4 Configurer l'accès SSH par clé

Ansible se connecte à la VM via **SSH avec une clé** (plus sécurisé qu'un mot de passe). Une clé SSH est une paire de fichiers : une **clé privée** sur votre poste et une **clé publique** sur la VM. Elles fonctionnent comme une clé et une serrure — la VM reconnaît votre poste sans demander de mot de passe.

**Sur votre poste**, vérifier si une clé SSH existe déjà :

```bash
ls ~/.ssh/id_ed25519.pub
```

Si le fichier n'existe pas, en créer une :

```bash
ssh-keygen -t ed25519 -C "deploiement-gestion-tchap"
# Appuyer sur Entrée 3 fois pour accepter les valeurs par défaut
```

**Copier la clé publique sur la VM** :

```bash
ssh-copy-id root@192.168.1.XX   # remplacer par l'IP de votre VM
# Saisir le mot de passe root de la VM quand demandé
```

**Vérifier que ça fonctionne** (doit se connecter sans demander de mot de passe) :

```bash
ssh root@192.168.1.XX
# Si vous voyez le prompt de la VM, tout est bon — taper "exit" pour revenir
```

---

## 2. Prérequis sur le poste de déploiement

Ansible tourne sur **votre poste** (pas sur la VM). Il se connecte à la VM via SSH et pilote tout à distance.

**Vérifier Python** (requis par Ansible) :

```bash
python3 --version   # doit afficher 3.10 ou supérieur
```

**Installer Ansible** si absent :

```bash
pip3 install ansible
ansible --version   # doit afficher [core 2.15+]
```

---

## 3. Préparation du déploiement

### 3.1 Récupérer le dépôt

```bash
git clone <url-du-depot>
cd gestion-personnel-tchap-PHP/ansible
```

### 3.2 Installer les collections Ansible

```bash
ansible-galaxy collection install -r requirements.yml
```

### 3.3 Configurer l'inventaire

Ouvrir `inventory/hosts.yml` et remplacer l'IP :

```yaml
gestion-tchap:
  ansible_host: 192.168.1.10   # ← IP réelle de votre VM
```

### 3.4 Configurer les variables

Ouvrir `inventory/group_vars/all.yml` et adapter :

```yaml
git_host:         gitlab.votre-societe.fr      # ← hostname du GitLab interne
app_repo:         git@gitlab.votre-societe.fr:VOTRE_GROUPE/gestion-personnel-tchap-PHP.git
app_branch:       main
app_port:         8088                         # port exposé sur la VM
app_default_uri:  https://votre-domaine.fr     # URL publique de l'app
app_cors_origin:  https://votre-domaine.fr     # même valeur
```

### 3.5 Configurer les secrets (vault)

> ⚠ **Ne jamais committer `vault.yml` non chiffré dans Git.**

Générer des secrets forts et les renseigner dans `inventory/group_vars/vault.yml` :

```bash
# Générer APP_SECRET
openssl rand -base64 32

# Générer TCHAP_SERVICE_KEY
openssl rand -hex 32

# Choisir un mot de passe PostgreSQL fort (ex: diceware 6 mots)
```

Éditer le fichier vault :

```yaml
# inventory/group_vars/vault.yml
vault_db_password:       "votre_mot_de_passe_postgres"
vault_app_secret:        "résultat_de_openssl_rand_base64_32"
vault_tchap_service_key: "résultat_de_openssl_rand_hex_32"
```

Chiffrer le vault :

```bash
ansible-vault encrypt inventory/group_vars/vault.yml
# Saisir et retenir le mot de passe vault — il sera demandé à chaque déploiement
```

---

## 4. Déploiement initial

### Étape 1 — Provisioning de la VM

Ce playbook configure la VM depuis zéro (à lancer une seule fois) :

```bash
ansible-playbook playbooks/setup.yml --ask-vault-pass
```

Ce que fait ce playbook :
- Mise à jour complète du système
- Installation de Docker Engine + Docker Compose plugin
- Création de l'utilisateur `deploy` avec accès Docker
- Configuration du pare-feu UFW (seuls les ports 22 et 8088 sont ouverts)
- Activation de Fail2ban (protection contre les tentatives de connexion)
- Durcissement SSH (désactivation de l'authentification par mot de passe)
- Configuration du fuseau horaire (Europe/Paris)

> **Après ce playbook**, la connexion root par mot de passe est désactivée. Seul l'utilisateur `deploy` avec clé SSH peut se connecter.

### Étape 2 — Déploiement de l'application

```bash
ansible-playbook playbooks/deploy.yml --ask-vault-pass
```

Ce que fait ce playbook :
- Clone le dépôt Git dans `/opt/gestion-tchap`
- Génère le fichier `.env` depuis les variables vault
- Build les images Docker (`docker compose build`)
- Lance tous les services (`docker compose up -d`)
- Attend que l'application soit accessible sur le port configuré

### Étape 3 — Vérification

Depuis la VM ou votre navigateur :

```bash
# Depuis la VM
curl -s -o /dev/null -w "%{http_code}" http://localhost:8088
# Attendu : 200 ou 302
```

Ou ouvrir `http://<IP_VM>:8088` dans un navigateur.

---

## 5. Configuration post-déploiement

### 5.1 Connexion initiale

Accéder à l'interface web (`http://<IP>:8088`) et se connecter avec le compte administrateur par défaut :

- **Identifiant** : `Sic`
- **Mot de passe** : `Sic` (à changer immédiatement)

Pour changer le mot de passe : **Configuration → Administrateurs système → Réinitialiser le mot de passe**.

### 5.2 Connecter le bot Tchap

1. Créer un compte Tchap dédié pour le bot sur le homeserver (compte utilisateur classique avec une adresse email dédiée, ex : `bot-gestion@votre-service.gouv.fr`)
2. Dans l'interface : **Configuration → Bots Matrix → Ajouter un bot**
3. Renseigner :
   - **Nom** : ex. `Bot Gestion` 
   - **User ID Matrix** : `@bot-gestion:agent.interieur.tchap.gouv.fr`
   - **Bot principal** : cocher (gère E2EE via le bridge)
4. Cliquer **Connecter** → saisir le mot de passe du compte Tchap du bot

Le bot se connecte, génère ses clés E2EE et publie son device sur le homeserver.

### 5.3 Vérifier le device du bot (SAS)

Pour que les autres appareils Tchap fassent confiance au bot et lui transfèrent les clés de chiffrement :

1. Dans Tchap (app mobile ou web), ouvrir la conversation avec le bot
2. **Profil du bot → Vérifier l'appareil**
3. Dans l'interface d'administration : **Configuration → Chiffrement E2EE → Vérification SAS → Vérifier l'état**
4. Comparer les 7 emojis affichés des deux côtés et confirmer s'ils correspondent

---

## 6. Mises à jour

### 6.1 Mise à jour automatique (recommandé)

Après le déploiement initial, la VM **se met à jour toute seule** à chaque nouveau commit sur `main`. Deux mécanismes complémentaires sont en place :

#### Timer systemd (toutes les heures — installé par Ansible)

Un timer systemd vérifie toutes les heures si de nouveaux commits sont disponibles sur GitLab. Dès qu'il en détecte, il lance automatiquement `git pull` + `docker compose up -d --build`.

Suivre les logs du timer :
```bash
journalctl -u gestion-tchap-update.service -f
```

Forcer une mise à jour immédiate depuis la VM :
```bash
sudo systemctl start gestion-tchap-update.service
```

Changer l'intervalle de vérification (défaut : `1h`) dans `inventory/group_vars/all.yml` :
```yaml
update_interval: 30min   # ou 2h, 15min…
```

#### GitHub Actions (immédiat — optionnel)

Si la VM est accessible en SSH depuis internet, le déploiement peut se déclencher **immédiatement** après chaque push grâce au workflow `.github/workflows/deploy.yml`.

**Configuration en 3 étapes :**

1. Ajouter les secrets dans GitHub → *Settings → Secrets and variables → Actions* :

   | Secret | Valeur |
   |--------|--------|
   | `VM_SSH_HOST` | IP ou hostname de la VM |
   | `VM_SSH_USER` | `deploy` |
   | `VM_SSH_KEY` | Contenu de votre clé privée `~/.ssh/id_ed25519` |

2. Activer le déploiement automatique dans GitHub → *Settings → Variables* :

   | Variable | Valeur |
   |----------|--------|
   | `VM_AUTODEPLOY` | `true` |

3. C'est tout — le prochain push déclenche automatiquement le déploiement.

> Si la VM n'est pas accessible depuis internet (réseau interne), laisser `VM_AUTODEPLOY` non défini. Le timer systemd prend le relais avec un délai max de 5 min.

---

#### Clé SSH de déploiement GitLab (nécessaire pour `git pull`)

Lors du premier `ansible-playbook playbooks/deploy.yml`, Ansible génère une clé SSH pour l'utilisateur `deploy` et affiche la clé publique en fin d'exécution :

```
=======================================================
ACTION REQUISE : Ajoutez cette clé comme Deploy Key
sur GitLab → Settings → Repository → Deploy keys
(cocher 'Grant read permissions to this key')
=======================================================
ssh-ed25519 AAAA... gestion-tchap-deploy@votre-vm
=======================================================
```

Copier cette clé et l'ajouter sur GitLab → **Settings → Repository → Deploy keys**.

Sans cette étape, le `git pull` automatique échouera.

> **Note GitHub Actions** : le fichier `.github/workflows/deploy.yml` est prévu pour GitHub. Sur un GitLab interne, il n'a aucun effet (GitLab n'en tient pas compte). Si vous souhaitez l'équivalent GitLab CI/CD (déploiement immédiat sur push), il faudrait créer un `.gitlab-ci.yml` — le timer systemd toutes les heures est suffisant pour la plupart des besoins.

---

### 6.2 Mise à jour manuelle

Si vous souhaitez mettre à jour manuellement depuis votre poste :

```bash
ansible-playbook playbooks/update.yml --ask-vault-pass
```

Pour un rebuild complet (changement de Dockerfile, mise à jour des dépendances) :

```bash
ansible-playbook playbooks/deploy.yml --ask-vault-pass
```

---

## 7. Commandes utiles sur la VM

Se connecter à la VM :
```bash
ssh deploy@<IP_VM>
```

Depuis `/opt/gestion-tchap` :

```bash
# Statut des services
docker compose -f docker-compose.prod.yml ps

# Logs en temps réel
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

## 8. Sauvegardes

Les données persistantes sont dans deux volumes Docker :

| Volume | Contenu | Criticité |
|--------|---------|-----------|
| `postgres_data` | Base de données (agents, salons, config) | **Critique** |
| `tchap_data` | Clés E2EE du bot, sessions Matrix | Haute |

Sauvegarder ces volumes régulièrement :

```bash
# Sauvegarde PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U tchap gestion_tchap | gzip > backup_$(date +%Y%m%d).sql.gz

# Sauvegarde du volume tchap_data (clés E2EE)
docker run --rm \
  -v gestion-tchap_tchap_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/tchap_data_$(date +%Y%m%d).tar.gz /data
```

---

## 9. Résolution de problèmes courants

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

### Oublié le mot de passe vault Ansible

Le vault chiffre uniquement les secrets du fichier `vault.yml`. Si le mot de passe vault est perdu, récupérer les valeurs directement sur la VM :

```bash
cat /opt/gestion-tchap/.env
```

Puis recréer un vault avec ces valeurs et un nouveau mot de passe.

---

## 10. Structure des fichiers Ansible

```
ansible/
├── ansible.cfg                         Configuration Ansible (user SSH, clé, etc.)
├── requirements.yml                    Collections Ansible à installer
├── inventory/
│   ├── hosts.yml                       ← IP de la VM (à modifier)
│   └── group_vars/
│       ├── all.yml                     ← Variables de l'application (à modifier)
│       └── vault.yml                   ← Secrets chiffrés (à modifier + chiffrer)
├── roles/
│   ├── common/                         Provisioning système (UFW, fail2ban, SSH…)
│   ├── docker/                         Installation Docker
│   └── app/                            Déploiement de l'application
│       ├── handlers/main.yml           Reload systemd
│       └── templates/
│           ├── env.j2                  Template .env généré depuis vault
│           ├── update.sh.j2            Script de mise à jour automatique
│           ├── gestion-tchap-update.service.j2   Service systemd
│           └── gestion-tchap-update.timer.j2     Timer systemd (toutes les 5 min)
└── playbooks/
    ├── setup.yml                       Initialisation VM (une seule fois)
    ├── deploy.yml                      Déploiement complet
    └── update.yml                      Mise à jour manuelle rapide
```
