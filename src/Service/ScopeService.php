<?php

namespace App\Service;

use App\Security\AppUser;
use Doctrine\DBAL\Connection;

/**
 * Calcule le périmètre d'administration d'un utilisateur à partir de ses
 * entrées dans unite_roles, en remontant récursivement l'arbre des unités.
 */
class ScopeService
{
    /** Cache par requête HTTP : évite de relancer la CTE récursive plusieurs fois. */
    private array $cache = [];

    public function __construct(private readonly Connection $db) {}

    /**
     * Retourne les IDs de toutes les unités que l'utilisateur peut administrer.
     * - sysadmin → toutes les unités
     * - autres   → sous-arbre(s) défini(s) par unite_roles
     */
    public function getPerimeterIds(AppUser $user): array
    {
        $key = $user->isSysAdmin() ? '__sysadmin' : ('p' . $user->getPersonnelId());

        if (array_key_exists($key, $this->cache)) {
            return $this->cache[$key];
        }

        // Sysadmin et admins globaux voient toutes les unités.
        // Les gestionnaires/superviseurs sont limités à leurs unite_roles.
        if ($user->isSysAdmin() || $user->getAppRole() === 'admin') {
            $ids = array_map('intval', array_column(
                $this->db->fetchAllAssociative('SELECT id FROM unites'),
                'id'
            ));
            return $this->cache[$key] = $ids;
        }

        $pid = $user->getPersonnelId();
        if (!$pid) {
            return $this->cache[$key] = [];
        }

        $rows = $this->db->fetchAllAssociative(
            'WITH RECURSIVE perimetre AS (
                SELECT id FROM (
                    -- Droits directs : person → unite
                    SELECT ur.unite_id AS id
                    FROM unite_roles ur
                    WHERE ur.personnel_id = :pid
                    UNION
                    -- Droits hérités : via appartenance à une unité administratrice
                    SELECT uur.unite_cible AS id
                    FROM unite_unite_roles uur
                    JOIN personnel_unite pu ON pu.unite_id = uur.unite_source
                    WHERE pu.personnel_id = :pid
                ) roots
                UNION ALL
                -- Descendants récursifs
                SELECT u.id
                FROM unites u
                JOIN perimetre p ON u.parent_id = p.id
            )
            SELECT DISTINCT id FROM perimetre',
            ['pid' => $pid]
        );

        return $this->cache[$key] = array_map('intval', array_column($rows, 'id'));
    }

    /**
     * Vérifie si l'utilisateur peut administrer une unité spécifique.
     */
    public function canManageUnit(AppUser $user, int $uniteId): bool
    {
        if ($user->isSysAdmin()) {
            return true;
        }

        return in_array($uniteId, $this->getPerimeterIds($user), true);
    }

    /**
     * Retourne les rôles d'administration d'un agent (pour l'affichage).
     */
    public function getUniteRoles(int $personnelId): array
    {
        return $this->db->fetchAllAssociative(
            'SELECT ur.id, ur.unite_id, ur.role,
                    u."Nom"      AS unite_nom,
                    n.nom        AS niveau_nom,
                    n.ordre      AS niveau_ordre
             FROM unite_roles ur
             JOIN unites u  ON u.id  = ur.unite_id
             LEFT JOIN niveaux n ON n.id = u.niveau_id
             WHERE ur.personnel_id = :pid
             ORDER BY n.ordre NULLS LAST, u."Nom"',
            ['pid' => $personnelId]
        );
    }

    /**
     * Retourne les affectations d'unités d'un agent (pour l'affichage).
     */
    public function getPersonnelUnites(int $personnelId): array
    {
        return $this->db->fetchAllAssociative(
            'SELECT pu.id, pu.unite_id, pu.type,
                    u."Nom"      AS unite_nom,
                    n.nom        AS niveau_nom,
                    n.ordre      AS niveau_ordre
             FROM personnel_unite pu
             JOIN unites u  ON u.id  = pu.unite_id
             LEFT JOIN niveaux n ON n.id = u.niveau_id
             WHERE pu.personnel_id = :pid
             ORDER BY pu.type, n.ordre NULLS LAST, u."Nom"',
            ['pid' => $personnelId]
        );
    }

    /**
     * Retourne les unités qui administrent une unité donnée (unite_unite_roles).
     */
    public function getUniteUniteRoles(int $uniteId): array
    {
        return $this->db->fetchAllAssociative(
            'SELECT uur.id, uur.unite_source, uur.role,
                    u."Nom"      AS source_nom,
                    n.nom        AS niveau_nom,
                    n.ordre      AS niveau_ordre
             FROM unite_unite_roles uur
             JOIN unites u  ON u.id  = uur.unite_source
             LEFT JOIN niveaux n ON n.id = u.niveau_id
             WHERE uur.unite_cible = :uid
             ORDER BY n.ordre NULLS LAST, u."Nom"',
            ['uid' => $uniteId]
        );
    }

    /**
     * Formate un tableau d'IDs entiers en littéral tableau PostgreSQL.
     * Ex : [1, 2, 3] → '{1,2,3}'
     */
    public function toPgIntArray(array $ids): string
    {
        return empty($ids) ? '{}' : '{' . implode(',', array_map('intval', $ids)) . '}';
    }
}
