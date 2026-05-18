<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\ConfigService;
use App\Service\RoleService;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class BienvenueController extends AbstractController
{
    public function __construct(
        private readonly Connection    $db,
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
    ) {
    }

    #[Route('/bienvenue', name: 'app_bienvenue', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();

        if (!$this->roles->canManage($user)) {
            return $this->redirectToRoute('app_mon_profil');
        }

        $stats = [
            'agents'  => (int) $this->db->fetchOne('SELECT COUNT(*) FROM personnel'),
            'salons'  => (int) $this->db->fetchOne('SELECT COUNT(*) FROM salons'),
            'unites'  => (int) $this->db->fetchOne('SELECT COUNT(*) FROM unites'),
            'espaces' => (int) $this->db->fetchOne('SELECT COUNT(*) FROM espaces'),
        ];

        return $this->render('bienvenue/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
            'stats'       => $stats,
        ]);
    }

    #[Route('/api/audit/droits', name: 'api_audit_droits', methods: ['GET'])]
    public function auditDroits(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();

        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Forbidden'], 403);
        }

        $admins = $this->db->fetchAllAssociative(<<<'SQL'
            SELECT sub.id, sub."Nom", sub."Prenom", sub."Grade", sub.type, sub.scope
            FROM (
                SELECT p.id, p."Nom", p."Prenom", p."Grade", 'global' AS type, NULL::text AS scope
                FROM personnel p WHERE p."Role" = 'admin'
                UNION ALL
                SELECT p.id, p."Nom", p."Prenom", p."Grade", 'scoped' AS type,
                       COALESCE(u."Nom", 'Unité #' || SPLIT_PART(p."Role", ':', 2)) AS scope
                FROM personnel p
                LEFT JOIN unites u ON u.id::text = SPLIT_PART(p."Role", ':', 2)
                WHERE p."Role" ~ '^admin:[0-9]+$'
                UNION ALL
                SELECT p.id, p."Nom", p."Prenom", p."Grade", 'scoped' AS type, u."Nom" AS scope
                FROM unite_roles ur
                JOIN personnel p ON p.id = ur.personnel_id
                JOIN unites u ON u.id = ur.unite_id
                WHERE ur.role = 'admin'
            ) sub
            ORDER BY CASE WHEN sub.type = 'global' THEN 0 ELSE 1 END, sub."Nom", sub."Prenom"
        SQL);

        $superviseurs = $this->db->fetchAllAssociative(<<<'SQL'
            SELECT p.id, p."Nom", p."Prenom", p."Grade", 'global' AS type, NULL::text AS scope
            FROM personnel p
            WHERE p."Role" = 'superviseur_crise'
            ORDER BY p."Nom", p."Prenom"
        SQL);

        $gestionnaires = $this->db->fetchAllAssociative(<<<'SQL'
            SELECT sub.id, sub."Nom", sub."Prenom", sub."Grade", sub.type, sub.scope
            FROM (
                SELECT p.id, p."Nom", p."Prenom", p."Grade", 'global' AS type, NULL::text AS scope
                FROM personnel p WHERE p."Role" = 'gestionnaire'
                UNION ALL
                SELECT p.id, p."Nom", p."Prenom", p."Grade", 'scoped' AS type, u."Nom" AS scope
                FROM unite_roles ur
                JOIN personnel p ON p.id = ur.personnel_id
                JOIN unites u ON u.id = ur.unite_id
                WHERE ur.role = 'gestionnaire'
            ) sub
            ORDER BY CASE WHEN sub.type = 'global' THEN 0 ELSE 1 END, sub."Nom", sub."Prenom"
        SQL);

        return $this->json([
            'admins'       => $admins,
            'superviseurs' => $superviseurs,
            'gestionnaires' => $gestionnaires,
        ]);
    }
}
