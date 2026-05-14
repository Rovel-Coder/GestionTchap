-- Migration 003 — Espaces Tchap (Matrix Spaces)
-- Permet de regrouper des salons dans des espaces, comme les communautés Tchap.
--
--   psql -U <user> -d <base> -f migrations/003_espaces.sql

BEGIN;

CREATE TABLE IF NOT EXISTS espaces (
    id            SERIAL PRIMARY KEY,
    "Nom"         TEXT        NOT NULL DEFAULT '',
    "Description" TEXT        NOT NULL DEFAULT '',
    "space_id"    TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS espace_salons (
    espace_id  INTEGER NOT NULL REFERENCES espaces(id) ON DELETE CASCADE,
    salon_id   INTEGER NOT NULL REFERENCES salons(id)  ON DELETE CASCADE,
    PRIMARY KEY (espace_id, salon_id)
);

COMMIT;
