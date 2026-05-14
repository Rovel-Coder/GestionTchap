# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Gestion Personnel Tchap** (GST) is an internal web application for managing personnel and Tchap rooms (a secure messaging platform of the French State). It maintains a staff directory, manages communication rooms, and automatically orchestrates invitations and exclusions—especially in crisis situations.

**Stack:**
- **Backend:** PHP 8.3 / Symfony 7.3 (MicroKernel pattern)
- **Database:** PostgreSQL 16 with custom SQL migrations (not Doctrine ORM)
- **Frontend:** Twig + Alpine.js (server-rendered)
- **Tchap Integration:** Node.js microservice bridge (tchap-service/) with E2EE support via matrix-bot-sdk
- **Infrastructure:** Docker Compose (dev) + Ansible (production)

---

## Architecture

### Three-Layer Stack

1. **PHP Application** (src/) — Symfony 7.3 MicroKernel
   - Handles HTTP requests, authentication, authorization
   - Uses Doctrine DBAL (not ORM) for raw SQL queries against PostgreSQL
   - Routes defined as attributes in controllers (#[Route(...)])
   - Custom Doctrine type IntArrayType maps PostgreSQL INTEGER[] to PHP arrays

2. **PostgreSQL Database** — Single source of truth
   - Schema defined in schema.sql (initial) + migrations/*.sql (incremental)
   - No Doctrine migrations—see Migrations section below
   - Core tables: personnel, unites, salons, bots, niveaux, config, system_admins
   - Hierarchical relationships: personnel_unite, unite_roles, unite_unite_roles

3. **Node.js Bridge Microservice** (tchap-service/) — E2EE gateway
   - Persistent Matrix client with full E2EE (end-to-end encryption) support
   - Exposes REST API on port 3000 (internal Docker network)
   - Handles room creation, membership, power levels, encrypted messaging
   - PHP calls it via TchapService::callBridge() when configured
   - Can fallback to direct Matrix API if bridge is unavailable

### Communication Flow

```
Client (browser)
    ↓ HTTPS
Nginx (port 8088) → FastCGI → PHP-FPM (port 9000)
    ↓ Raw SQL
PostgreSQL (port 5433)
    ↓ HTTP (internal)
Node.js Bridge (port 3000) ↔ Matrix/Tchap Server
```

### Request Lifecycle

1. **Authentication** — Form login via SecurityController
   - Username/email lookup in personnel or system_admins table
   - Bcrypt password check (cost 12)
   - Rate-limited: max 3 attempts per 15 minutes
   - Login success/failure logged via LoginSuccessSubscriber/LoginFailureSubscriber

2. **Authorization** — Role-based access control (RBAC)
   - Roles: lecteur → gestionnaire → superviseur_crise → admin → sysadmin
   - Scoped roles: agents can have admin:uniteA to manage only uniteA's subtree
   - RoleService checks minimum role via hasMinRole()
   - ScopeService computes recursive perimeter via PostgreSQL CTE (perimetre query)

3. **API Response** — JSON or HTML/Twig
   - All data is DBAL fetchAssociative()/fetchAllAssociative()
   - Controllers manually validate & sanitize input
   - CSRF protection enabled on POST/PUT/DELETE
   - CORS: none (same-origin only)

### Key Entities & Relations

**Personnel Management:**
- personnel — Agents with role, grade, contact info, Tchap user_id
- personnel_unite — Links agents to organizational units
  - Types: reel (1 only, official), detachement (1 only, temporary), virtuel (N, events)
- unite_roles — Scoped admin/gestionnaire rights per person per unit

**Organizational Structure:**
- unites — Organizational units (national → région → groupement → compagnie → BOB/BTA → BP)
  - parent_id for hierarchy, niveau_id links to niveaux for canonical ordering
  - type: reel (official) or virtuel (created ad-hoc for events)
  - Stores associated Tchap room IDs in Salons array
- niveaux — Hierarchy levels (immutable; populated from schema.sql)
- unite_unite_roles — Unit-to-unit admin relationships (SIC administers Region X)

**Tchap Integration:**
- bots — Tchap bot credentials (Matrix user_id, access_token, homeserver)
  - is_principal = true for the primary E2EE bot (via Node bridge)
  - Secondary bots can bypass the bridge for direct API calls
- salons — Tchap rooms with name, description, room_id, type
- config — JSONB key-value store (bot config, UI config, encryption keys, etc.)

---

## Build & Development Commands

### Docker (Recommended)

```bash
# Start all services (PHP, PostgreSQL, Nginx, Node.js bridge)
docker compose up -d

# View logs
docker compose logs -f php          # PHP app logs
docker compose logs -f postgres     # Database logs
docker compose logs -f tchap-bridge # Node.js bridge logs

# Access the application
# → http://localhost:8088
# Initial login: Sic / SicGestionTchap

# Access the database
docker compose exec postgres psql -U tchap -d gestion_tchap

# Run database migrations
docker compose exec php php bin/console app:db:migrate

# Seed system admin (if needed)
docker compose exec php php bin/console app:seed-sysadmin

# Clear Symfony cache
docker compose exec php php bin/console cache:clear

# Stop all services
docker compose down
```

### Local PHP (if not using Docker)

```bash
# Install dependencies
composer install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL, TCHAP_SERVICE_URL, etc.

# Migrate schema
php bin/console app:db:migrate

# Seed initial sysadmin
php bin/console app:seed-sysadmin

# Serve (requires PHP 8.3 + PostgreSQL + Node bridge running separately)
php -S localhost:8000 -t public/
```

### Environment Variables

See .env.example:

```
APP_ENV=prod|dev
APP_SECRET=                      # openssl rand -base64 32
DATABASE_URL=postgresql://...
TCHAP_SERVICE_URL=http://...     # Empty = no E2EE, direct API mode
TCHAP_SERVICE_KEY=               # openssl rand -hex 32
DEFAULT_URI=https://...          # Public URL (for absolute URLs)
```

---

## Migrations

**Custom system, not Doctrine Migrations:**

1. **Initial schema:** schema.sql applied on first Docker up via PostgreSQL entrypoint
2. **Incremental changes:** SQL files in migrations/ directory (numbered: 001_*.sql, 002_*.sql, etc.)
3. **Execution:** php bin/console app:db:migrate
   - Command reads all *.sql files from migrations/ (natural sort order)
   - Executes each file against the database (idempotent)
   - Reports success/failure for each migration

**Migration Files:**
- 001_hierarchie_unites.sql — Adds hierarchical unit structure, personnel_unite, unite_roles tables
- 002_unite_unite_roles.sql — Adds unit-to-unit admin relationships

**To add a new migration:**
1. Create migrations/003_description.sql with idempotent SQL (use IF NOT EXISTS, ON CONFLICT, etc.)
2. Run docker compose exec php php bin/console app:db:migrate
3. Commit both the SQL file and any PHP code changes

---

## Source Code Structure

```
src/
├── Command/              # Symfony console commands
│   ├── MigrateCommand.php         # Runs migrations/
│   └── SeedSysAdminCommand.php    # Seeds initial admin
├── Controller/           # HTTP request handlers (Twig + JSON API)
│   ├── PersonnelController.php    # Staff directory (read/write personnel)
│   ├── SalonController.php        # Tchap room management
│   ├── ConfigController.php       # Configuration (sysadmin only)
│   ├── CriseController.php        # Crisis mode operations
│   ├── SecurityController.php     # Login/logout/register
│   ├── UniteController.php        # Organizational units
│   ├── BotController.php          # Tchap bot setup & verification
│   └── [others...]
├── Security/
│   ├── AppUser.php                # User object (implements UserInterface)
│   └── AppUserProvider.php        # Loads users from DB (implements UserProviderInterface)
├── Service/
│   ├── TchapService.php           # Bridge to Tchap/Matrix API
│   ├── ConfigService.php          # JSONB config getter/setter
│   ├── RoleService.php            # Role hierarchy & permission checks
│   └── ScopeService.php           # Scope computation (recursive CTE for admin perimeter)
├── Doctrine/
│   └── IntArrayType.php           # Custom type for PostgreSQL INTEGER[]
├── EventSubscriber/
│   ├── LoginSuccessSubscriber.php
│   ├── LoginFailureSubscriber.php
│   └── ApiCsrfSubscriber.php
└── Kernel.php                     # Symfony MicroKernel
```

### Key Service Classes

**TchapService** (src/Service/TchapService.php)
- Abstracts Tchap/Matrix API calls
- Methods: callBridge(), invite(), kick(), createRoom(), getMembers(), sendMessage(), setPowerLevel(), loginWithPassword()
- **Bridge mode** (when TCHAP_SERVICE_URL configured): calls Node.js microservice with E2EE
- **Direct mode** (no bridge): calls Matrix API directly (no E2EE, for secondary bots)
- Automatic fallback if bridge is unreachable

**ConfigService** (src/Service/ConfigService.php)
- Wrapper around config table (JSONB)
- In-request cache to avoid repeated DB queries
- Methods: get(), set(), getTchapConfig(), getUiConfig()

**RoleService** (src/Service/RoleService.php)
- Role hierarchy: ROLE_ORDER = ['lecteur', 'gestionnaire', 'superviseur_crise', 'admin']
- Methods: hasMinRole(), canManage(), canCrise(), canAdmin(), getPermissionsArray()
- Sysadmins bypass all checks

**ScopeService** (src/Service/ScopeService.php)
- Computes which units a user can administer via PostgreSQL CTE
- Handles direct unite_roles + inherited rights via unite_unite_roles
- Methods: getPerimeterIds(), canManageUnit(), getUniteRoles(), getPersonnelUnites(), getUniteUniteRoles()

---

## Database Schema

### Core Tables

**personnel**
```
id, NiGend, Nom, Prenom, Grade, Mail, user_id (Tchap), grist_user_id,
Role (lecteur|gestionnaire|...|admin[:uniteId]), Statut, Subdivision,
password_hash, latitude, longitude, position_at
```

**unites**
```
id, Nom, code, numero, adresse, Salons (INTEGER[]),
bot_id (FK bots), parent_id (FK unites), niveau_id (FK niveaux),
type (reel|virtuel), bot_user_id, bot_access_token
```

**niveaux**
```
id, nom, slug (national|region|groupement|compagnie|cob_bta|bp), ordre
```

**personnel_unite**
```
id, personnel_id (FK), unite_id (FK), type (reel|detachement|virtuel)
UNIQUE (personnel_id, unite_id)
```

**unite_roles**
```
id, personnel_id (FK), unite_id (FK), role (admin|gestionnaire)
UNIQUE (personnel_id, unite_id)
```

**unite_unite_roles**
```
id, unite_source (FK), unite_cible (FK), role (admin|gestionnaire)
UNIQUE (unite_source, unite_cible)
```

**salons**
```
id, Nom, Description, Type, room_id (Tchap room ID)
```

**bots**
```
id, name, user_id (Tchap @...), is_principal, access_token, homeserver, created_at
```

**config**
```
key (TEXT PRIMARY KEY), value (JSONB)
```

**system_admins**
```
id, username (UNIQUE), password_hash, created_at
```

**login_locks**
```
identifier (TEXT PRIMARY KEY), attempts, locked_at, last_attempt_at
```

---

## Node.js Bridge (tchap-service/)

### Purpose
Persistent Matrix client with full E2EE support. Keeps a single authenticated session alive and handles all encrypted operations on behalf of PHP.

### Stack
- matrix-bot-sdk (^0.7.1) — Matrix client with Rust Crypto support
- express (^4.18.3) — HTTP server
- Node.js >= 18

### Routes (called by PHP via TchapService)

```
POST /login                      → Authenticate bot (credentials → session + device_id)
GET  /health                     → Bot readiness & E2EE status
GET  /whoami                     → Current user_id
GET  /profile/:userId            → Display name, avatar
POST /rooms                       → Create room
GET  /rooms/:roomId/members      → List members
POST /rooms/:roomId/invite       → Add member
POST /rooms/:roomId/kick         → Remove member (with reason)
POST /rooms/:roomId/leave        → Bot leaves room
GET  /rooms/:roomId/state        → Room state events
PUT  /rooms/:roomId/power-levels → Set user power level
POST /rooms/:roomId/send         → Send encrypted message
```

### Environment Variables
```
PORT=3000
HOST=0.0.0.0
API_KEY=dev-api-key-shared       # Must match TCHAP_SERVICE_KEY in PHP
TCHAP_HOMESERVER=https://matrix.agent.interieur.tchap.gouv.fr
```

### How It Integrates
1. PHP calls TchapService::callBridge($method, $path, $body) if bridge is enabled
2. Bridge checks X-Api-Key header against API_KEY env var
3. Bridge delegates to Matrix SDK (with E2EE if session is ready)
4. Response returned to PHP as JSON

### Fallback Behavior
If bridge is unreachable during a call, TchapService logs a warning and falls back to direct Matrix API (if bypass_bridge is true in bot config or the call is for a secondary bot).

---

## Security & Authentication

### Login & User Loading
1. AppUserProvider::loadUserByIdentifier() looks up user by email (case-insensitive)
2. Checks system_admins first (sysadmins), then personnel table
3. Validates password hash via Symfony's PasswordHasher
4. Rate-limiting: 3 failed attempts → 15-minute lockout in login_locks table

### Role Hierarchy
- **Symfony roles** (ROLE_SYSADMIN, ROLE_ADMIN, etc.) for access_control rules
- **App roles** (sysadmin, admin, gestionnaire, superviseur_crise, lecteur, with optional scope like admin:unitId)
- Scoped roles (e.g., admin:123) allow unit-level administration within a perimeter

### Scope Computation (ScopeService)
- Sysadmins and global admin users see all units
- Others compute their perimeter via PostgreSQL CTE:
  - Direct rights: unite_roles entries for their personnel_id
  - Inherited rights: unite_unite_roles + personnel_unite (if their unit administers another)
  - Returns all descendants of those units (recursive)

### CSRF Protection
- Enabled globally in security.yaml
- Form login validates _token in POST data
- AJAX requests must include CSRF token in X-CSRF-TOKEN header

### Session & Remember-Me
- Session timeout: standard Symfony session
- Remember-me cookie: 7 days (configurable in security.yaml)

---

## Testing & Development Tips

### Accessing the Database Directly
```bash
docker compose exec postgres psql -U tchap -d gestion_tchap
# Then run SQL, e.g.:
# SELECT * FROM personnel WHERE "Nom" LIKE '%Test%';
# UPDATE personnel SET "Role" = 'admin' WHERE id = 2;
```

### Debugging PHP
```bash
# View PHP errors
docker compose logs -f php

# SSH into PHP container
docker compose exec php bash

# Check configuration
docker compose exec php php bin/console config:dump
```

### Testing Tchap Bot Integration
```bash
# View bridge logs
docker compose logs -f tchap-bridge

# Check bridge health
curl http://localhost:3000/health

# Verify API key is correct (should return 403 if wrong)
curl -H "X-Api-Key: wrong" http://localhost:3000/health
```

### Viewing Migration Status
The app:db:migrate command is run automatically on container startup, but you can re-run it:
```bash
docker compose exec php php bin/console app:db:migrate
```

### Clearing Cache
If you modify routes or configuration:
```bash
docker compose exec php php bin/console cache:clear --env=dev
```

---

## Common Development Workflows

### Adding a New Personnel Field
1. Add column to schema.sql (or migration if schema.sql exists)
2. Update PersonnelController::WRITABLE & LIMITS constants
3. Update related HTML forms in templates/
4. Re-run migrations: docker compose exec php php bin/console app:db:migrate

### Adding a New Unit Hierarchy Level
1. Insert into niveaux table in schema.sql or as SQL script
2. Update hierarchy visualization logic in templates

### Configuring Tchap Bot
1. Navigate to /config (sysadmin only)
2. Enter bot credentials (username, password)
3. POST to /api/config/tchap_config with bot details
4. Bridge loads credentials and initiates E2EE session
5. Verify E2EE setup via /api/health

### Adding a New API Endpoint
1. Add #[Route(...)] method in appropriate Controller
2. Check permissions via RoleService or ScopeService
3. Use $this->db->fetchAllAssociative() or fetchAssociative() for queries
4. Return $this->json($data) for API responses
5. Return $this->render(...) for HTML pages

---

## Environment-Specific Notes

### Development (docker-compose.yml)
- APP_ENV=dev (default)
- Containers auto-restart on failure
- Hot reload: modify src/ and refresh browser (Symfony's dev cache handles it)
- Bridge & database are mocked or run locally

### Production (docker-compose.prod.yml + Ansible)
- APP_ENV=prod (requires APP_SECRET to be set securely)
- Database password must be strong (vault-encrypted in Ansible)
- Bridge URL must be internal (same Docker network or VPC)
- TCHAP_SERVICE_KEY must match bridge's API_KEY
- Default URI must be the public HTTPS domain
- Automatic updates via Ansible cron job (hourly)

---

## Useful References

- **Symfony Docs:** https://symfony.com/doc/7.3/
- **Doctrine DBAL:** https://www.doctrine-project.org/projects/doctrine-dbal/en/latest/
- **Matrix Client-Server API:** https://spec.matrix.org/v1.3/client-server-api/
- **PostgreSQL Recursive CTEs:** https://www.postgresql.org/docs/current/queries-with.html
- **Application Docs:** docs/APPLICATION.md (functional requirements, sync logic, schema details)
