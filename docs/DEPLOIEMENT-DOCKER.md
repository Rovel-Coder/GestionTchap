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

| Volume | Contenu |
|--------|---------|
| `postgres_data` | Base de données PostgreSQL |
| `vendor_cache` | Dépendances Composer (accélère les rebuilds) |
| `tchap_data` | Clés E2EE et session Matrix du bridge |

> **Sauvegarder `postgres_data` régulièrement.** Les clés E2EE dans `tchap_data` ne sont pas critiques (reconnexion possible via l'interface) mais leur perte provoque une interruption temporaire du bot.

---

## Ansible — VM production

Ansible installe Docker sur la VM, déploie tous les services dans des containers (`docker-compose.prod.yml`) et met en place une **mise à jour automatique toutes les heures** dès qu'un nouveau commit est poussé sur le dépôt.

Le guide complet est dans [`ansible/DEPLOIEMENT.md`](../ansible/DEPLOIEMENT.md).

### Prérequis

Sur le **poste de déploiement** (pas la VM) :

```bash
# Python 3.10+ et Ansible 2.15+
pip3 install ansible

# Collections requises
ansible-galaxy collection install -r ansible/requirements.yml
```

Sur la **VM** : Ubuntu 24.04 LTS vierge avec accès SSH root.

### Séquence de déploiement

**Étape 1 — Remplir les 3 fichiers de configuration :**

```yaml
# ansible/inventory/hosts.yml
gestion-tchap:
  ansible_host: 192.168.1.10   # ← IP réelle de la VM
```

```yaml
# ansible/inventory/group_vars/all.yml
git_host:        gitlab.votre-societe.fr
app_repo:        git@gitlab.votre-societe.fr:VOTRE_GROUPE/gestion-personnel-tchap-PHP.git
app_default_uri: https://votre-domaine.fr
```

```yaml
# ansible/inventory/group_vars/vault.yml
vault_db_password:       "mot_de_passe_fort"          # openssl rand -hex 16
vault_app_secret:        "secret_32_caracteres"        # openssl rand -base64 32
vault_tchap_service_key: "cle_bridge_64_caracteres"    # openssl rand -hex 32
```

**Étape 2 — Chiffrer les secrets :**

```bash
ansible-vault encrypt ansible/inventory/group_vars/vault.yml
```

**Étape 3 — Provisionner la VM** *(une seule fois)* :

```bash
ansible-playbook ansible/playbooks/setup.yml --ask-vault-pass
```

Ce playbook installe Docker, crée l'utilisateur `deploy`, configure le pare-feu UFW et durcit SSH.

**Étape 4 — Déployer l'application :**

```bash
ansible-playbook ansible/playbooks/deploy.yml --ask-vault-pass
```

### ⚠ Action manuelle requise après l'étape 4

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

Sans cette étape, la mise à jour automatique toutes les heures échouera (le `git pull` sera rejeté par GitLab).

### Mise à jour automatique

Une fois déployé, la VM se met à jour **toute seule** toutes les heures.

```bash
# Suivre les mises à jour en temps réel sur la VM
journalctl -u gestion-tchap-update.service -f

# Forcer une mise à jour immédiate
sudo systemctl start gestion-tchap-update.service
```

### Commandes utiles sur la VM

```bash
# Connexion
ssh deploy@<IP_VM>

# Depuis /opt/gestion-tchap :
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f tchap-bridge
docker compose -f docker-compose.prod.yml restart tchap-bridge
```

### Sauvegardes

```bash
# Sauvegarde PostgreSQL
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

| Port | Service | Direction |
|------|---------|-----------|
| 22 | SSH (administration) | Entrant |
| 8088 | Interface web | Entrant |
| 3000 | Tchap bridge | Loopback uniquement (dans Docker) |
| 5432 | PostgreSQL | Loopback uniquement (dans Docker) |
| 443 | Vers matrix.agent.interieur.tchap.gouv.fr | Sortant |
