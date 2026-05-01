-- Schéma initial — Gestion Personnel Tchap
-- Exécuter une seule fois sur une base PostgreSQL vierge :
--   psql -U <user> -d <base> -f schema.sql

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
    "Unite"         INTEGER[]            DEFAULT '{}',
    "Salons_Extra"  INTEGER[]            DEFAULT '{}',
    password_hash   TEXT
);

CREATE TABLE IF NOT EXISTS salons (
    id            SERIAL PRIMARY KEY,
    "Nom"         TEXT NOT NULL DEFAULT '',
    "Description" TEXT NOT NULL DEFAULT '',
    "Type"        TEXT NOT NULL DEFAULT '',
    "room_id"     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS unites (
    id       SERIAL PRIMARY KEY,
    "Nom"    TEXT      NOT NULL DEFAULT '',
    "code"   TEXT      NOT NULL DEFAULT '',
    "Salons" INTEGER[]          DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS system_admins (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
