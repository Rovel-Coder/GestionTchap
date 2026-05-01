# Documentation applicative — Gestion Personnel Tchap

## Présentation générale

**Gestion Personnel Tchap** est une application web interne destinée à la gestion du personnel et à la synchronisation avec la plateforme de messagerie **Tchap** (messagerie sécurisée de l'État basée sur le protocole Matrix).

Elle permet de maintenir un annuaire du personnel, de gérer les salons Tchap et les unités, et d'orchestrer les invitations/exclusions de membres dans les salons de façon automatisée — notamment en situation de crise.

---

## Stack technique

| Couche | Technologie |
|--------|------------|
| Backend | PHP 8.3 / Symfony 7.3 |
| Base de données | PostgreSQL 14+ |
| Accès BDD | Doctrine DBAL (requêtes SQL directes) |
| Frontend | Twig (templates serveur) + Alpine.js 3 (réactivité) |
| Icônes | Font Awesome 6.5 (CDN) |
| Cartographie | Leaflet.js (CDN) |
| Authentification | Session Symfony (form_login) |
| API Tchap | Symfony HttpClient (proxy serveur) |

Aucun outil de build JavaScript (Node.js, Webpack, Vite…) n'est requis. Tout le CSS et JS est servi comme fichier statique depuis `public/assets/`.

---

## Architecture générale

```
Navigateur
    │  HTML/CSS/JS (Twig + Alpine.js)
    ▼
Symfony (PHP 8.3)
    ├── SecurityController    → authentification, gestion comptes
    ├── PersonnelController   → CRUD agents
    ├── SalonController       → CRUD salons Tchap
    ├── UniteController       → CRUD unités
    ├── ConfigController      → paramètres applicatifs
    ├── TchapController       → proxy Matrix API
    ├── CriseController       → mode crise
    └── CartoController       → cartographie
         │
    ├── RoleService           → gestion des droits
    ├── ConfigService         → lecture/écriture config (JSONB)
    └── TchapService          → appels Matrix API (bot token)
         │
    PostgreSQL
         ├── personnel
         ├── salons
         ├── unites
         ├── config
         └── system_admins
```

---

## Modules fonctionnels

### 1. Personnel

Annuaire de tous les agents de la structure. Chaque agent dispose de :

| Champ | Description |
|-------|-------------|
| NiGend | Numéro d'identification gendarmerie (6 chiffres) |
| Nom / Prénom | Identité |
| Grade | Grade militaire ou civil |
| Mail | Adresse email (utilisée comme identifiant de connexion et pour calculer l'identifiant Tchap) |
| Statut | `actif`, `reserve`, `admin_civil`, `admin_militaire` |
| Subdivision | Sous-unité d'appartenance |
| Unite | Liste des unités rattachées (tableau d'ID) |
| Salons_Extra | Salons Tchap supplémentaires en dehors de l'unité (tableau d'ID) |
| Rôle | Rôle applicatif de l'agent (`lecteur`, `gestionnaire`, `superviseur_crise`, `admin`) |

**Fonctionnalités :**
- Création, modification, suppression d'agents
- Filtrage par catégorie de grade, statut, unité
- Recherche textuelle
- Import CSV de masse (avec aperçu avant import)
- Synchronisation bidirectionnelle avec Tchap (Tchap→BDD et BDD→Tchap)

---

### 2. Salons

Répertoire des salons Matrix/Tchap de la structure.

| Champ | Description |
|-------|-------------|
| Nom | Nom du salon |
| Description | Description |
| Type | `general`, `operationnel`, `crise` |
| room_id | Identifiant Matrix (`!xxx:serveur`) |

**Fonctionnalités :**
- CRUD des salons
- Consultation des membres Tchap actuels (appel API temps réel)
- Import/export CSV
- Filtrage par type

---

### 3. Unités

Structure organisationnelle à laquelle sont rattachés les agents.

| Champ | Description |
|-------|-------------|
| Nom | Nom de l'unité |
| code | Code court de l'unité |
| Salons | Salons automatiquement associés aux agents de l'unité (tableau d'ID) |

Quand un agent est affecté à une unité, les salons de cette unité constituent sa liste de salons **attendus** dans Tchap.

---

### 4. Configuration

Accessible uniquement aux administrateurs (`admin`) et sysadmins.

**Onglet Bot Tchap :**
- Saisie du homeserver Matrix (ex. `https://matrix.agent.interieur.tchap.gouv.fr`)
- Connexion du bot (identifiant/mot de passe) — le token est stocké en base, jamais exposé au navigateur
- Vérification de l'identité du bot (`/whoami`)

**Onglet Rôles :**
- Activation/désactivation des fonctionnalités par rôle (cartographie, mode crise, etc.)
- Personnalisation des labels de rôles

**Onglet Admins Système (sysadmin uniquement) :**
- Création de nouveaux comptes sysadmin
- Réinitialisation de mot de passe
- Suppression de comptes

---

### 5. Mode Crise

Interface de déploiement rapide en situation de crise. Permet d'inviter en masse des agents dans des salons en quelques clics.

**Fonctionnement :**
1. Sélectionner un ou plusieurs **salons de crise** (type `crise` ou `operationnel`)
2. Sélectionner les **agents à déployer** (filtres : statut, unité, recherche)
3. Cliquer sur **Déployer** → le bot Tchap envoie les invitations

**Import CSV NiGend :**
Permet d'importer un fichier CSV contenant une colonne `NiGend` pour sélectionner automatiquement les agents concernés.

---

### 6. Suivi de Crise

Tableau de bord de surveillance des salons de type `crise`. Pour chaque salon :
- Nombre de membres Tchap actuellement présents
- Nombre d'agents attendus (selon la configuration BDD)
- Liste des membres (10 premiers affichés)
- Actualisation manuelle ou automatique

---

### 7. Cartographie

Vue cartographique (Leaflet.js) affichant la localisation géographique des unités. Sidebar permettant de filtrer et de centrer la carte sur une unité.

> Cette fonctionnalité peut être activée ou désactivée par rôle dans la configuration.

---

## Gestion des droits

### Hiérarchie des rôles

```
sysadmin
    └── admin
            └── superviseur_crise
                    └── gestionnaire
                            └── lecteur
```

Chaque rôle hérite des droits du rôle inférieur.

| Rôle | Droits |
|------|--------|
| `lecteur` | Consultation de toutes les données |
| `gestionnaire` | + Création/modification du personnel, salons, unités |
| `superviseur_crise` | + Accès au mode crise et suivi de crise |
| `admin` | + Suppression, modification des rôles, accès configuration |
| `sysadmin` | + Gestion des comptes système, accès total |

### Types de comptes

Il existe deux types de comptes distincts :

**Comptes personnel** (table `personnel`) :
- Connexion par **adresse email** + mot de passe
- Rôle applicatif défini dans le champ `Role`
- Peuvent être créés depuis l'interface

**Comptes sysadmin** (table `system_admins`) :
- Connexion par **nom d'utilisateur** + mot de passe
- Rôle `sysadmin` fixe
- Gérés uniquement par d'autres sysadmins ou via la console (`app:seed-sysadmin`)

---

## Synchronisation Tchap

### Calcul des salons attendus

Pour chaque agent, les salons auxquels il devrait appartenir dans Tchap sont calculés ainsi :

```
Salons attendus = Union(
    Salons de chaque unité à laquelle l'agent appartient,
    Salons_Extra de l'agent
)
```

### Synchronisation BDD → Tchap (apply)

Pour chaque agent actif ayant un `user_id` Tchap renseigné :
- **Inviter** dans les salons attendus où il n'est pas encore présent
- **Expulser** des salons qu'il ne devrait plus fréquenter (sauf si le salon ne figure pas dans la liste gérée)

### Synchronisation Tchap → BDD (sync)

Pour chaque salon, récupère la liste des membres depuis l'API Matrix et met à jour le champ `Salons_Extra` des agents concernés.

### Identifiant Tchap

L'identifiant Matrix d'un agent est calculé automatiquement à partir de son adresse email :

```
jean.dupont@gendarmerie.interieur.gouv.fr
    → @jean.dupont-gendarmerie.interieur.gouv.fr:agent.interieur.tchap.gouv.fr
```

---

## Données techniques

### Tables PostgreSQL

#### `personnel`
```sql
id, "NiGend", "Nom", "Prenom", "Grade", "Mail", "user_id",
"grist_user_id", "Role", "Statut", "Subdivision",
"Unite" INTEGER[], "Salons_Extra" INTEGER[], password_hash
```

#### `salons`
```sql
id, "Nom", "Description", "Type", "room_id"
```

#### `unites`
```sql
id, "Nom", "code", "Salons" INTEGER[]
```

#### `config`
```sql
key TEXT PRIMARY KEY, value JSONB
```

Clés de configuration utilisées :
- `tchap` → `{ homeserver, token, bot_user_id }`
- `ui` → `{ roleFeatures: { lecteur: {...}, gestionnaire: {...}, ... } }`

#### `system_admins`
```sql
id, username, password_hash, created_at
```

---

## Sécurité

- **Authentification** : sessions PHP chiffrées, protection CSRF sur tous les formulaires
- **Brute-force** : `login_throttling` Symfony — 10 tentatives / 15 minutes par IP
- **Bot token** : le token d'accès Matrix n'est jamais envoyé au navigateur ; tous les appels API Tchap transitent par le serveur PHP
- **Mots de passe** : hashés en bcrypt (coût 12) via Symfony PasswordHasher
- **Autorisations** : vérification systématique du rôle en entrée de chaque endpoint API

---

## Fichiers importants

```
├── schema.sql                      → Initialisation de la base de données
├── .env.example                    → Template de configuration
├── src/
│   ├── Command/SeedSysAdminCommand.php   → Création du compte sysadmin initial
│   ├── Service/TchapService.php          → Client Matrix/Tchap
│   ├── Service/RoleService.php           → Logique des droits
│   ├── Service/ConfigService.php         → Paramètres applicatifs
│   ├── Security/AppUser.php              → Objet utilisateur Symfony
│   └── Security/AppUserProvider.php      → Chargement utilisateur BDD
├── public/assets/
│   ├── app.css                     → Styles (design tokens, composants)
│   └── app.js                      → Alpine.js (logique frontend)
└── templates/                      → Vues Twig
```

---

## Première utilisation

1. Se connecter avec le compte `Sic` (mot de passe : `SicGestionTchap`)
2. Aller dans **Configuration → Bot Tchap**
3. Saisir l'URL du homeserver Tchap et se connecter avec les identifiants du bot
4. Aller dans **Configuration → Admins Système** pour créer d'autres comptes sysadmin si nécessaire
5. Créer les **unités** via le menu Unités
6. Créer les **salons** via le menu Salons (renseigner le `room_id` Matrix)
7. Importer le **personnel** (manuellement ou via CSV)
8. Affecter les agents aux unités et vérifier les salons associés
9. Lancer une **synchronisation BDD → Tchap** depuis le menu Personnel

---

## Limitations connues

- La cartographie nécessite que les unités aient des coordonnées géographiques renseignées (non implémenté par défaut — à étendre selon le besoin)
- La synchronisation Tchap fonctionne uniquement si le bot est **administrateur** des salons concernés
- Les identifiants Tchap sont calculés selon le format `agent.interieur.tchap.gouv.fr` — adapter `TchapService::mailToTchapId()` si le homeserver est différent
