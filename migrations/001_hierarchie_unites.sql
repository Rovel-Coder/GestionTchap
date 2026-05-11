-- Migration 001 — Hiérarchie des unités
-- À exécuter sur une base existante (données de production).
-- Idempotente : peut être relancée sans effet de bord.
--
--   psql -U <user> -d <base> -f migrations/001_hierarchie_unites.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Niveaux hiérarchiques
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
-- 2. Colonnes hiérarchiques sur unites
-- ---------------------------------------------------------------------------
ALTER TABLE unites
    ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES unites(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS niveau_id INTEGER REFERENCES niveaux(id),
    ADD COLUMN IF NOT EXISTS type      VARCHAR(20) NOT NULL DEFAULT 'virtuel';

-- Contrainte sur type (sans recréer si elle existe déjà)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unites_type_valide' AND conrelid = 'unites'::regclass
    ) THEN
        ALTER TABLE unites ADD CONSTRAINT unites_type_valide
            CHECK (type IN ('reel', 'virtuel'));
    END IF;
END$$;

-- Les unités existantes sont virtuelles (créées pour des événements particuliers)
UPDATE unites SET type = 'virtuel' WHERE type IS NULL OR type = '';

-- ---------------------------------------------------------------------------
-- 3. Table personnel_unite
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personnel_unite (
    id           SERIAL PRIMARY KEY,
    personnel_id INTEGER     NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    unite_id     INTEGER     NOT NULL REFERENCES unites(id)   ON DELETE CASCADE,
    type         VARCHAR(20) NOT NULL,
    CONSTRAINT personnel_unite_type_valide CHECK (type IN ('reel', 'detachement', 'virtuel')),
    UNIQUE (personnel_id, unite_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS personnel_unite_unique_reel
    ON personnel_unite (personnel_id)
    WHERE type = 'reel';

CREATE UNIQUE INDEX IF NOT EXISTS personnel_unite_unique_detachement
    ON personnel_unite (personnel_id)
    WHERE type = 'detachement';

-- Migrer les Unite[] existants vers personnel_unite (type virtuel)
INSERT INTO personnel_unite (personnel_id, unite_id, type)
SELECT
    p.id                 AS personnel_id,
    unnest(p."Unite")    AS unite_id,
    'virtuel'            AS type
FROM personnel p
WHERE array_length(p."Unite", 1) > 0
  AND unnest(p."Unite") IN (SELECT id FROM unites)  -- sécurité : ids valides seulement
ON CONFLICT (personnel_id, unite_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Table unite_roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unite_roles (
    id           SERIAL PRIMARY KEY,
    personnel_id INTEGER     NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    unite_id     INTEGER     NOT NULL REFERENCES unites(id)   ON DELETE CASCADE,
    role         VARCHAR(50) NOT NULL,
    CONSTRAINT unite_roles_role_valide CHECK (role IN ('admin', 'gestionnaire')),
    UNIQUE (personnel_id, unite_id)
);

COMMIT;

-- ---------------------------------------------------------------------------
-- Notes post-migration
-- ---------------------------------------------------------------------------
-- Le champ personnel."Unite" est conservé pour compatibilité ascendante.
-- Il peut être supprimé une fois que tout le code PHP utilise personnel_unite.
-- Commande de suppression (à exécuter manuellement après validation) :
--
--   ALTER TABLE personnel DROP COLUMN "Unite";
