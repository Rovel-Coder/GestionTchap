-- Migration 002 — Rôles d'administration par unité entière
-- Permet d'assigner une unité (ex: SIC) comme administratrice d'une autre unité.
-- Tous les membres de l'unité source héritent automatiquement des droits.
--
--   psql -U <user> -d <base> -f migrations/002_unite_unite_roles.sql

BEGIN;

CREATE TABLE IF NOT EXISTS unite_unite_roles (
    id           SERIAL PRIMARY KEY,
    unite_source INTEGER     NOT NULL REFERENCES unites(id) ON DELETE CASCADE,
    -- l'unité qui administre (ex: SIC)
    unite_cible  INTEGER     NOT NULL REFERENCES unites(id) ON DELETE CASCADE,
    -- l'unité administrée
    role         VARCHAR(50) NOT NULL,
    CONSTRAINT unite_unite_roles_role_valide CHECK (role IN ('admin', 'gestionnaire')),
    UNIQUE (unite_source, unite_cible)
);

COMMIT;
