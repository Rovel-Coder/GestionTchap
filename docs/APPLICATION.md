# Documentation applicative — Gestion Personnel Tchap

## Présentation générale

**Gestion Personnel Tchap** est une application web interne destinée à la gestion du personnel et à la synchronisation avec la plateforme de messagerie **Tchap** (messagerie sécurisée de l'État basée sur le protocole Matrix).

Elle permet de maintenir un annuaire du personnel, de gérer les salons Tchap et les unités, d'envoyer des messages formatés à plusieurs salons en même temps, et d'orchestrer les invitations/exclusions de membres de façon automatisée — notamment en situation de crise.

---

## Stack technique

| Couche | Technologie |
|--------|------------|
| Backend | PHP 8.3 / Symfony 7.3 |
| Base de données | PostgreSQL 16 |
| Accès BDD | Doctrine DBAL (requêtes SQL directes) |
| Frontend | Twig (templates serveur) + Alpine.js 3 (réactivité) |
| Icônes | Font Awesome 6.5 (CDN) |
| Authentification | Session Symfony (form_login) |
| API Tchap | Bridge Node.js (E2EE) + Symfony HttpClient (fallback direct) |

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
    ├── SalonController       → CRUD salons Tchap, création room Matrix
    ├── UniteController       → CRUD unités
    ├── HierarchieController  → arborescence des unités
    ├── MessageController     → composition et envoi de messages multi-salons
    ├── ConfigController      → paramètres applicatifs
    ├── TchapController       → proxy Matrix API (invite, kick, sync)
    ├── BotController         → gestion des bots secondaires
    └── CriseController       → mode crise
         │
    ├── RoleService           → gestion des droits
    ├── ScopeService          → périmètre d'administration (CTE PostgreSQL)
    ├── ConfigService         → lecture/écriture config (JSONB)
    └── TchapService          → appels Matrix (bridge E2EE ou API directe)
         │
    ┌────────────────────┐
    │  Bridge Node.js    │  ← tchap-service/ (E2EE via matrix-bot-sdk)
    │  port 3000         │
    └────────────────────┘
         │
    PostgreSQL
         ├── personnel
         ├── salons
         ├── unites
         ├── bots
         ├── niveaux
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
| Mail | Adresse email (identifiant de connexion, base du calcul de l'ID Tchap) |
| Statut | `actif`, `reserve`, `admin_civil`, `admin_militaire` |
| Subdivision | Sous-unité d'appartenance |
| Unite | Liste des unités rattachées (tableau d'ID) |
| Salons_Extra | Salons Tchap supplémentaires hors unité (tableau d'ID) |
| Rôle | Rôle applicatif (`lecteur`, `gestionnaire`, `superviseur_crise`, `admin`) |

**Fonctionnalités :**
- Création, modification, suppression d'agents
- Filtrage par grade, statut, unité
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
- Création du salon sur Tchap (via le bot de l'unité ou le bot principal)
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
| bot_id | Bot Tchap secondaire dédié à cette unité (optionnel) |
| parent_id | Unité parente (structure hiérarchique) |
| niveau_id | Niveau hiérarchique (national, région, groupement…) |

Quand un agent est affecté à une unité, les salons de cette unité constituent sa liste de salons **attendus** dans Tchap.

---

### 4. Hiérarchie

Vue arborescente de toutes les unités, organisée par niveaux hiérarchiques.

**Fonctionnalités :**
- Navigation dans l'arbre (expand/collapse, filtres par niveau)
- Création, modification, suppression d'unités
- **Attribution d'un bot Tchap dédié** par unité (admin/sysadmin) — le bot de l'unité est automatiquement utilisé pour toutes les opérations sur ses salons (invitation, exclusion, envoi de messages, création de salon)
- Gestion des **administrateurs** d'une unité (rôle `gestionnaire` ou `admin` sur l'unité)
- Gestion des **unités administratrices** (délégation de droits d'une unité à une autre)
- Gestion des **niveaux hiérarchiques** (sysadmin uniquement)

> Un admin ne peut configurer que les unités de son périmètre. Le périmètre est calculé via une requête CTE PostgreSQL récursive.

---

### 5. Messages

Interface de composition et d'envoi de messages Tchap vers un ou plusieurs salons simultanément.

**Fonctionnalités :**
- Sélection multiple de salons (avec recherche)
- Éditeur de texte avec barre de formatage complète :

| Bouton | Syntaxe | Rendu Tchap |
|--------|---------|-------------|
| Gras | `**texte**` | **gras** |
| Italique | `*texte*` | *italique* |
| Souligné | `__texte__` | souligné |
| Barré | `~~texte~~` | ~~barré~~ |
| Titre (H1–H6) | `# `, `## `… | Titres |
| Liste | `- ` / `1. ` | listes |
| Code | `` `code` `` | code inline |
| Bloc code | ` ```bloc``` ` | bloc de code |
| Citation | `> texte` | citation |
| Lien | `[texte](url)` | lien cliquable |
| @room | `@room` | notification de tous les membres |

- **Pièces jointes** — glisser-déposer ou sélection (max 5 × 20 Mo) ; upload via le bridge E2EE
- Chaque salon utilise **le bot déclaré pour son unité** (ou le bot principal par défaut)
- Résultats d'envoi salon par salon (succès / erreur)
- Réinitialisation automatique du formulaire après envoi réussi

**Raccourcis clavier :** Ctrl+B (gras), Ctrl+I (italique), Ctrl+U (souligné)

---

### 6. Configuration

Accessible uniquement aux administrateurs (`admin`) et sysadmins.

**Onglet Bot Tchap :**
- Ajout et gestion de plusieurs bots (principal E2EE + bots secondaires)
- Connexion d'un bot (identifiant/mot de passe) — le token est stocké en base, jamais exposé au navigateur
- Le bot **principal** (`is_principal = true`) utilise le bridge Node.js pour le chiffrement E2EE
- Les bots **secondaires** appellent l'API Matrix directement (sans E2EE)
- Vérification de l'identité du bot (`/whoami`)

**Onglet Rôles :**
- Activation/désactivation des fonctionnalités par rôle
- Personnalisation des labels de rôles

**Onglet Admins Système (sysadmin uniquement) :**
- Création de nouveaux comptes sysadmin
- Réinitialisation de mot de passe
- Suppression de comptes

---

### 7. Mode Crise

Interface de déploiement rapide en situation de crise. Permet d'inviter en masse des agents dans des salons en quelques clics.

**Fonctionnement :**
1. Sélectionner un ou plusieurs **salons de crise** (type `crise` ou `operationnel`)
2. Sélectionner les **agents à déployer** (filtres : statut, unité, recherche)
3. Cliquer sur **Déployer** → le bot Tchap envoie les invitations

**Import CSV NiGend :**
Permet d'importer un fichier CSV contenant une colonne `NiGend` pour sélectionner automatiquement les agents concernés.

---

### 8. Suivi de Crise

Tableau de bord de surveillance des salons de type `crise`. Pour chaque salon :
- Nombre de membres Tchap actuellement présents
- Nombre d'agents attendus (selon la configuration BDD)
- Liste des membres (10 premiers affichés)
- Actualisation manuelle ou automatique

---

## Bridge Node.js (tchap-service/)

Service persistant Node.js maintenant une session Matrix avec chiffrement E2EE complet.

**Routes exposées :**

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/health` | Statut du bot et de la session E2EE |
| POST | `/login` | Authentification du bot |
| GET | `/rooms/:id/members` | Liste des membres |
| POST | `/rooms/:id/invite` | Inviter un utilisateur |
| POST | `/rooms/:id/kick` | Expulser un utilisateur |
| POST | `/rooms/:id/send` | Envoyer un message (texte, fichier, formaté, @room) |
| POST | `/upload` | Upload d'un fichier vers le serveur Matrix (retourne `mxc://`) |
| PUT | `/rooms/:id/power-levels` | Modifier les niveaux de permission |
| POST | `/rooms` | Créer un salon |

**Fallback :** si le bridge est injoignable, `TchapService` bascule automatiquement sur l'API Matrix directe (sans E2EE).

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
| `gestionnaire` | + Création/modification du personnel, salons, unités ; envoi de messages |
| `superviseur_crise` | + Accès au mode crise et suivi de crise |
| `admin` | + Suppression, configuration des bots par unité, gestion des administrateurs |
| `sysadmin` | + Gestion des comptes système, niveaux hiérarchiques, accès total |

### Périmètre d'administration

Un utilisateur avec un rôle `admin:uniteId` n'administre que l'unité ciblée et tout son sous-arbre. Le périmètre est calculé via une requête CTE récursive dans `ScopeService`.

---

## Synchronisation Tchap

### Calcul des salons attendus

```
Salons attendus = Union(
    Salons de chaque unité à laquelle l'agent appartient,
    Salons_Extra de l'agent
)
```

### Synchronisation BDD → Tchap (apply)

Pour chaque agent actif ayant un `user_id` Tchap renseigné :
- **Inviter** dans les salons attendus où il n'est pas encore présent
- **Expulser** des salons qu'il ne devrait plus fréquenter

Chaque salon utilise le bot déclaré pour l'unité propriétaire (`bot_id` → table `bots`), avec fallback sur le bot principal.

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
"Role", "Statut", "Subdivision",
"Unite" INTEGER[], "Salons_Extra" INTEGER[], password_hash
```

#### `salons`
```sql
id, "Nom", "Description", "Type", "room_id"
```

#### `unites`
```sql
id, "Nom", code, numero, adresse,
"Salons" INTEGER[], bot_id INTEGER REFERENCES bots(id),
parent_id INTEGER REFERENCES unites(id),
niveau_id INTEGER REFERENCES niveaux(id),
type VARCHAR(20)
```

#### `bots`
```sql
id, name, user_id, is_principal BOOLEAN, access_token, homeserver, created_at
```

#### `niveaux`
```sql
id, nom, slug, ordre
```

#### `config`
```sql
key TEXT PRIMARY KEY, value JSONB
```

Clés de configuration utilisées :
- `tchap_config` → `{ homeserver, token, botUserId, enabled }`
- `ui` → `{ roleFeatures: { lecteur: {...}, gestionnaire: {...}, ... } }`

#### `system_admins`
```sql
id, username, password_hash, created_at
```

---

## Sécurité

- **Authentification** : sessions PHP chiffrées, protection CSRF sur tous les formulaires et appels AJAX
- **Brute-force** : 3 tentatives / 15 minutes par identifiant (table `login_locks`)
- **Bot token** : le token d'accès Matrix n'est jamais envoyé au navigateur ; tous les appels API Tchap transitent par le serveur PHP ou le bridge Node.js
- **Mots de passe** : hashés en bcrypt (coût 12) via Symfony PasswordHasher
- **Autorisations** : vérification systématique du rôle et du périmètre en entrée de chaque endpoint API

---

## Fichiers importants

```
├── schema.sql                           → Initialisation de la base de données
├── migrations/                          → Migrations SQL incrémentales
├── .env.example                         → Template de configuration
├── tchap-service/                       → Bridge Node.js E2EE
│   └── src/routes.js                    → Routes HTTP du bridge
├── src/
│   ├── Command/SeedSysAdminCommand.php  → Création du compte sysadmin initial
│   ├── Controller/MessageController.php → Envoi de messages multi-salons
│   ├── Service/TchapService.php         → Client Matrix (bridge + API directe)
│   ├── Service/RoleService.php          → Logique des droits
│   ├── Service/ScopeService.php         → Périmètre d'administration (CTE)
│   ├── Service/ConfigService.php        → Paramètres applicatifs
│   ├── Security/AppUser.php             → Objet utilisateur Symfony
│   └── Security/AppUserProvider.php     → Chargement utilisateur BDD
├── public/assets/
│   ├── app.css                          → Styles (design tokens, composants)
│   └── app.js                          → Alpine.js (logique frontend)
└── templates/                           → Vues Twig
    ├── messages/index.html.twig         → Onglet Messages
    ├── hierarchie/index.html.twig       → Onglet Hiérarchie
    └── ...
```

---

## Première utilisation

1. Se connecter avec le compte `Sic` (mot de passe : `SicGestionTchap`)
2. Aller dans **Configuration → Bot Tchap** pour connecter le bot principal
3. Vérifier l'appareil du bot (chiffrement E2EE)
4. Aller dans **Hiérarchie** pour créer l'arborescence des unités ; assigner un bot secondaire aux unités qui en ont besoin
5. Créer les **salons** via le menu Salons (renseigner le `room_id` Matrix)
6. Importer le **personnel** (manuellement ou via CSV)
7. Affecter les agents aux unités et vérifier les salons associés
8. Lancer une **synchronisation BDD → Tchap** depuis le menu Personnel
9. Utiliser l'onglet **Messages** pour envoyer des communications à plusieurs salons

---

## Limitations connues

- La synchronisation Tchap fonctionne uniquement si le bot est **administrateur** des salons concernés
- Les pièces jointes dans les salons E2EE sont envoyées sans chiffrement côté médias si le bridge est indisponible (le message lui-même reste chiffré)
- Les identifiants Tchap sont calculés selon le format `agent.interieur.tchap.gouv.fr` — adapter `TchapService::mailToTchapId()` si le homeserver est différent
