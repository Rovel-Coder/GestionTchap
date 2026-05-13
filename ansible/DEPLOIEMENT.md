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

## 1. Spécifications de la VM

### Configuration minimale

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 Go | 4 Go |
| Disque | 20 Go SSD | 40 Go SSD |
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| Réseau | Accès internet sortant | Accès internet sortant |

### Accès réseau requis

La VM doit pouvoir joindre en sortie :

- `matrix.agent.interieur.tchap.gouv.fr` — port 443 (homeserver Tchap)
- `agent.interieur.tchap.gouv.fr` — port 443 (API Tchap)
- `download.docker.com` — port 443 (installation Docker)
- `registry.npmjs.org` — port 443 (dépendances Node.js, build Docker)
- `packagist.org` — port 443 (dépendances PHP, build Docker)

En entrée, seuls ces ports doivent être accessibles :

- Port **22** (TCP) — SSH depuis le poste de l'administrateur
- Port **8088** (TCP) — Interface web de l'application

### Prérequis sur la VM avant Ansible

La VM doit être une installation Ubuntu 24.04 LTS **vierge** avec :
- Accès SSH en `root` via clé publique depuis le poste de déploiement
- Pas d'autre logiciel installé (Ansible s'en charge)

---

## 2. Prérequis sur le poste de déploiement

Le poste depuis lequel vous lancez Ansible doit avoir :

```bash
# Python 3.10+ et pip
python3 --version   # doit afficher 3.10+

# Ansible 2.15+
ansible --version   # doit afficher [core 2.15+]

# Installation si absent
pip3 install ansible
```

Vérifier également que votre clé SSH `~/.ssh/id_ed25519` (ou `id_rsa`) est configurée et que la clé publique correspondante est autorisée sur la VM.

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
app_repo:         git@github.com:VOTRE_ORG/gestion-personnel-tchap-PHP.git
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

#### Timer systemd (toutes les 5 min — installé par Ansible)

Un timer systemd vérifie en permanence si de nouveaux commits sont disponibles sur GitHub. Dès qu'il en détecte, il lance automatiquement `git pull` + `docker compose up -d --build`.

Suivre les logs du timer :
```bash
journalctl -u gestion-tchap-update.service -f
```

Forcer une mise à jour immédiate depuis la VM :
```bash
sudo systemctl start gestion-tchap-update.service
```

Changer l'intervalle de vérification (défaut : `5min`) dans `inventory/group_vars/all.yml` :
```yaml
update_interval: 10min   # ou 1h, 30min…
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

#### Clé SSH de déploiement GitHub (nécessaire pour `git pull`)

Lors du premier `ansible-playbook playbooks/deploy.yml`, Ansible génère une clé SSH pour l'utilisateur `deploy` et affiche la clé publique en fin d'exécution :

```
=======================================================
ACTION REQUISE : Ajoutez cette clé comme Deploy Key
sur GitHub → Settings → Deploy keys (lecture seule)
=======================================================
ssh-ed25519 AAAA... gestion-tchap-deploy@votre-vm
=======================================================
```

Copier cette clé et l'ajouter sur GitHub → **Settings → Deploy keys → Add deploy key** (cocher *Read-only*).

Sans cette étape, le `git pull` automatique échouera.

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
