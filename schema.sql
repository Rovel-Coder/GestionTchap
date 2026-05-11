-- Schéma — Gestion Personnel Tchap
-- Exécuter une seule fois sur une base PostgreSQL vierge :
--   psql -U <user> -d <base> -f schema.sql

-- ---------------------------------------------------------------------------
-- Niveaux hiérarchiques (configurables)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS niveaux (
    id    SERIAL PRIMARY KEY,
    nom   VARCHAR(100) NOT NULL,
    slug  VARCHAR(50)  NOT NULL UNIQUE,
    ordre INT          NOT NULL,
    CONSTRAINT niveaux_ordre_positif CHECK (ordre > 0)
);

INSERT INTO niveaux (nom, slug, ordre) VALUES
    ('National',   'national',   1),
    ('Région',     'region',     2),
    ('Groupement', 'groupement', 3),
    ('Compagnie',  'compagnie',  4),
    ('COB / BTA',  'cob_bta',    5),
    ('BP',         'bp',         6)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Bots Tchap
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bots (
    id           SERIAL PRIMARY KEY,
    name         TEXT    NOT NULL DEFAULT 'Bot',
    user_id      TEXT    NOT NULL DEFAULT '',
    is_principal BOOLEAN NOT NULL DEFAULT false,
    access_token TEXT    NOT NULL DEFAULT '',
    homeserver   TEXT    NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Unités organisationnelles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unites (
    id                 SERIAL PRIMARY KEY,
    "Nom"              TEXT      NOT NULL DEFAULT '',
    "code"             TEXT      NOT NULL DEFAULT '',
    "Salons"           INTEGER[]          DEFAULT '{}',
    "numero"           TEXT      NOT NULL DEFAULT '',
    "adresse"          TEXT      NOT NULL DEFAULT '',
    "bot_user_id"      TEXT      NOT NULL DEFAULT '',
    "bot_access_token" TEXT      NOT NULL DEFAULT '',
    bot_id             INTEGER   REFERENCES bots(id) ON DELETE SET NULL,
    -- Hiérarchie
    parent_id          INTEGER   REFERENCES unites(id) ON DELETE RESTRICT,
    niveau_id          INTEGER   REFERENCES niveaux(id),
    type               VARCHAR(20) NOT NULL DEFAULT 'virtuel',
    CONSTRAINT unites_type_valide CHECK (type IN ('reel', 'virtuel'))
);

-- ---------------------------------------------------------------------------
-- Salons Tchap
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS salons (
    id            SERIAL PRIMARY KEY,
    "Nom"         TEXT NOT NULL DEFAULT '',
    "Description" TEXT NOT NULL DEFAULT '',
    "Type"        TEXT NOT NULL DEFAULT '',
    "room_id"     TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- Personnel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personnel (
    id              SERIAL PRIMARY KEY,
    "NiGend"        TEXT        NOT NULL DEFAULT '',
    "Nom"           TEXT        NOT NULL DEFAULT '',
    "Prenom"        TEXT        NOT NULL DEFAULT '',
    "Grade"         TEXT        NOT NULL DEFAULT '',
    "Mail"          TEXT        NOT NULL DEFAULT '',
    "user_id"       TEXT        NOT NULL DEFAULT '',
    "grist_user_id" INTEGER     NOT NULL DEFAULT 0,
    "Role"          TEXT        NOT NULL DEFAULT 'lecteur',
    "Statut"        TEXT        NOT NULL DEFAULT '',
    "Subdivision"   TEXT        NOT NULL DEFAULT '',
    -- Unite[] conservé temporairement pour compatibilité ; remplacé par personnel_unite
    "Unite"         INTEGER[]            DEFAULT '{}',
    "Salons_Extra"  INTEGER[]            DEFAULT '{}',
    password_hash   TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    position_at     TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Appartenance d'un agent à une ou plusieurs unités
-- type : 'reel'        → affectation administrative officielle (1 seule)
--        'detachement' → affectation temporaire               (1 seule)
--        'virtuel'     → événement / domaine particulier      (N possibles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personnel_unite (
    id           SERIAL PRIMARY KEY,
    personnel_id INTEGER     NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    unite_id     INTEGER     NOT NULL REFERENCES unites(id)   ON DELETE CASCADE,
    type         VARCHAR(20) NOT NULL,
    CONSTRAINT personnel_unite_type_valide CHECK (type IN ('reel', 'detachement', 'virtuel')),
    UNIQUE (personnel_id, unite_id)
);

-- Garantit un seul 'reel' et un seul 'detachement' par agent
CREATE UNIQUE INDEX IF NOT EXISTS personnel_unite_unique_reel
    ON personnel_unite (personnel_id)
    WHERE type = 'reel';

CREATE UNIQUE INDEX IF NOT EXISTS personnel_unite_unique_detachement
    ON personnel_unite (personnel_id)
    WHERE type = 'detachement';

-- ---------------------------------------------------------------------------
-- Rôles d'administration scopés à un nœud de l'arbre
-- Un agent peut administrer un nœud différent de son unité d'affectation.
-- role : 'admin'        → gère le nœud et tout l'arbre en dessous
--        'gestionnaire' → gère les salons du nœud uniquement
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unite_roles (
    id           SERIAL PRIMARY KEY,
    personnel_id INTEGER     NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    unite_id     INTEGER     NOT NULL REFERENCES unites(id)   ON DELETE CASCADE,
    role         VARCHAR(50) NOT NULL,
    CONSTRAINT unite_roles_role_valide CHECK (role IN ('admin', 'gestionnaire')),
    UNIQUE (personnel_id, unite_id)
);

-- ---------------------------------------------------------------------------
-- Configuration clé/valeur (JSONB)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

-- ---------------------------------------------------------------------------
-- Administrateurs système (compte technique, hors personnel)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_admins (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Verrouillage de connexion (anti-bruteforce)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_locks (
    identifier      TEXT PRIMARY KEY,
    attempts        INT         NOT NULL DEFAULT 0,
    locked_at       TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
