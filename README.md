# GST — Gestion des Salons Tchap

Application web interne de gestion du personnel et des salons **Tchap** (messagerie sécurisée de l'État).

Elle maintient un annuaire d'agents, gère les salons de communication et orchestre automatiquement les invitations et exclusions — notamment en situation de crise.

---

## Fonctionnalités

- **Annuaire du personnel** — agents, grades, statuts, unités, import/export CSV
- **Gestion des salons Tchap** — création, membres, types (général, opérationnel, crise)
- **Synchronisation automatisée** — la base de données et Tchap restent en permanence cohérents
- **Messages** — composition et envoi de messages formatés dans un ou plusieurs salons simultanément, avec pièces jointes
- **Mode Crise** — déploiement en masse dans les salons d'urgence en quelques clics
- **Suivi de Crise** — tableau de bord de présence en temps réel
- **Hiérarchie** — gestion de l'arborescence des unités, attribution d'un bot dédié par unité, gestion des administrateurs et des droits délégués
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

Deux modes d'installation sont disponibles. Voir [docs/GUIDE.md](docs/GUIDE.md) pour le guide complet.

### Avec Docker (recommandé)

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

### Sans Docker (VM native)

Voir le guide complet : [docs/DEPLOIEMENT-VM.md](docs/DEPLOIEMENT-VM.md)

---

## Documentation

| Document | Contenu |
|----------|---------|
| [docs/APPLICATION.md](docs/APPLICATION.md) | Fonctionnement détaillé, droits, synchronisation Tchap, schéma BDD |
| [docs/GUIDE.md](docs/GUIDE.md) | Guide de déploiement (Docker local + Ansible production) |
| [docs/DEPLOIEMENT-VM.md](docs/DEPLOIEMENT-VM.md) | Installation native sans Docker |

---

## Première connexion

1. Se connecter avec `Sic` / `SicGestionTchap` → **changer le mot de passe immédiatement**
2. **Configuration → Bot Tchap** : connecter le bot principal avec ses identifiants Tchap
3. **Configuration → Chiffrement E2EE** : vérifier l'appareil du bot (SAS ou clé de sécurité)
4. Créer les unités dans **Hiérarchie**, assigner un bot dédié si nécessaire
5. Créer les salons, importer le personnel
6. Lancer une synchronisation BDD → Tchap depuis le menu Personnel

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

# Reconstruire le bridge Node.js après modification de tchap-service/
docker compose build tchap-bridge && docker compose up -d tchap-bridge
```
