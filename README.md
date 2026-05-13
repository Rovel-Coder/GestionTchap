# GST — Gestion des Salons Tchap

Application web interne de gestion du personnel et des salons **Tchap** (messagerie sécurisée de l'État).

Elle maintient un annuaire d'agents, gère les salons de communication et orchestre automatiquement les invitations et exclusions — notamment en situation de crise.

---

## Fonctionnalités

- **Annuaire du personnel** — agents, grades, statuts, unités, import/export CSV
- **Gestion des salons Tchap** — création, membres, types (général, opérationnel, crise)
- **Synchronisation automatisée** — la base de données et Tchap restent en permanence cohérents
- **Mode Crise** — déploiement en masse dans les salons d'urgence en quelques clics
- **Suivi de Crise** — tableau de bord de présence en temps réel
- **Cartographie** — localisation géographique des unités
- **Gestion des rôles** hiérarchiques : `lecteur` → `gestionnaire` → `superviseur_crise` → `admin` → `sysadmin`

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Backend | PHP 8.3 / Symfony 7.3 |
| Base de données | PostgreSQL 16 |
| Frontend | Twig + Alpine.js (rendu serveur) |
| Intégration Tchap | Bridge Node.js (chiffrement E2EE) |
| Déploiement | Docker + Ansible (ou installation native) |

---

## Déploiement

Deux modes d'installation sont disponibles. Voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) pour choisir.

### Avec Docker (recommandé)

Voir le guide complet : [docs/DEPLOIEMENT-DOCKER.md](docs/DEPLOIEMENT-DOCKER.md)

**Démarrage rapide en local :**

```bash
git clone <url-du-depot> gestion-tchap
cd gestion-tchap
cp .env.example .env   # renseigner APP_SECRET, DB_PASSWORD, TCHAP_SERVICE_KEY
docker compose up -d
```

Accéder à **http://localhost:8088** — identifiants initiaux : `Sic` / `SicGestionTchap`

**En production via Ansible :**

```bash
ansible-galaxy collection install -r ansible/requirements.yml
# Remplir ansible/inventory/hosts.yml, all.yml et vault.yml
ansible-vault encrypt ansible/inventory/group_vars/vault.yml
ansible-playbook ansible/playbooks/setup.yml --ask-vault-pass
ansible-playbook ansible/playbooks/deploy.yml --ask-vault-pass
```

L'application se met ensuite à jour automatiquement toutes les heures.
Guide complet : [ansible/DEPLOIEMENT.md](ansible/DEPLOIEMENT.md)

### Sans Docker (VM native)

Voir le guide complet : [docs/DEPLOIEMENT-VM.md](docs/DEPLOIEMENT-VM.md)

---

## Documentation

| Document | Contenu |
|----------|---------|
| [docs/APPLICATION.md](docs/APPLICATION.md) | Fonctionnement détaillé, droits, synchronisation Tchap, schéma BDD |
| [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) | Choix du mode de déploiement |
| [docs/DEPLOIEMENT-DOCKER.md](docs/DEPLOIEMENT-DOCKER.md) | Docker local + Ansible production |
| [docs/DEPLOIEMENT-VM.md](docs/DEPLOIEMENT-VM.md) | Installation native sans Docker |
| [docs/VM_CONFIGURATION.md](docs/VM_CONFIGURATION.md) | Réglages avancés PHP-FPM, PostgreSQL, Nginx |
| [ansible/DEPLOIEMENT.md](ansible/DEPLOIEMENT.md) | Guide Ansible complet, mise à jour automatique |

---

## Première connexion

1. Se connecter avec `Sic` / `SicGestionTchap` → **changer le mot de passe immédiatement**
2. **Configuration → Bot Tchap** : connecter le bot avec ses identifiants Tchap
3. **Configuration → Chiffrement E2EE** : vérifier l'appareil du bot (SAS ou clé de sécurité)
4. Créer les unités, les salons, importer le personnel
5. Lancer une synchronisation BDD → Tchap depuis le menu Personnel

---

## Développement

Projet développé et maintenu en interne. Aucune dépendance commerciale — stack entièrement open source.

```bash
# Lancer en développement
docker compose up -d
docker compose logs -f php

# Accéder à la base de données
docker compose exec postgres psql -U tchap -d gestion_tchap

# Réappliquer les migrations
docker compose exec php php bin/console app:db:migrate
```
