<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\RoleService;
use App\Service\ScopeService;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class UniteRolesController extends AbstractController
{
    public function __construct(
        private readonly Connection   $db,
        private readonly RoleService  $roles,
        private readonly ScopeService $scope,
    ) {}

    // ── Rôles d'administration scopés ──────────────────────────────────────

    #[Route('/api/personnel/{id}/unite-roles', name: 'api_unite_roles_list', methods: ['GET'])]
    public function listRoles(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        return $this->json($this->scope->getUniteRoles($id));
    }

    #[Route('/api/personnel/{id}/unite-roles', name: 'api_unite_roles_add', methods: ['POST'])]
    public function addRole(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $data    = json_decode($request->getContent(), true) ?? [];
        $uniteId = isset($data['unite_id']) ? (int) $data['unite_id'] : 0;
        $role    = $data['role'] ?? '';

        if (!$uniteId || !in_array($role, ['admin', 'gestionnaire'], true)) {
            return $this->json(['error' => 'unite_id et role (admin|gestionnaire) sont requis'], 400);
        }

        if (!$this->scope->canManageUnit($user, $uniteId)) {
            return $this->json(['error' => 'Cette unité est hors de votre périmètre'], 403);
        }

        if (!$this->db->fetchOne('SELECT 1 FROM personnel WHERE id = :id', ['id' => $id])) {
            return $this->json(['error' => 'Agent introuvable'], 404);
        }

        $this->db->executeStatement(
            'INSERT INTO unite_roles (personnel_id, unite_id, role)
             VALUES (:pid, :uid, :role)
             ON CONFLICT (personnel_id, unite_id) DO UPDATE SET role = :role',
            ['pid' => $id, 'uid' => $uniteId, 'role' => $role]
        );

        return $this->json(['ok' => true], 201);
    }

    #[Route('/api/personnel/{id}/unite-roles/{uniteId}', name: 'api_unite_roles_remove', methods: ['DELETE'])]
    public function removeRole(int $id, int $uniteId): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        if (!$this->scope->canManageUnit($user, $uniteId)) {
            return $this->json(['error' => 'Cette unité est hors de votre périmètre'], 403);
        }

        $count = $this->db->executeStatement(
            'DELETE FROM unite_roles WHERE personnel_id = :pid AND unite_id = :uid',
            ['pid' => $id, 'uid' => $uniteId]
        );

        if (!$count) {
            return $this->json(['error' => 'Rôle introuvable'], 404);
        }

        return new JsonResponse(null, 204);
    }

    // ── Admins d'une unité (vue inverse) ───────────────────────────────────

    #[Route('/api/unites/{id}/admins', name: 'api_unite_admins_list', methods: ['GET'])]
    public function listByUnite(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        if (!$this->scope->canManageUnit($user, $id)) {
            return $this->json(['error' => 'Cette unité est hors de votre périmètre'], 403);
        }

        $rows = $this->db->fetchAllAssociative(
            'SELECT ur.id, ur.role, ur.personnel_id,
                    p."Nom", p."Prenom", p."Grade", p."Mail"
             FROM unite_roles ur
             JOIN personnel p ON p.id = ur.personnel_id
             WHERE ur.unite_id = :uid
             ORDER BY ur.role, p."Nom", p."Prenom"',
            ['uid' => $id]
        );

        return $this->json($rows);
    }

    // ── Affectations aux unités (personnel_unite) ───────────────────────────

    #[Route('/api/personnel/{id}/unites', name: 'api_personnel_unites_list', methods: ['GET'])]
    public function listUnites(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        return $this->json($this->scope->getPersonnelUnites($id));
    }

    #[Route('/api/personnel/{id}/unites', name: 'api_personnel_unites_add', methods: ['POST'])]
    public function addUnite(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $data    = json_decode($request->getContent(), true) ?? [];
        $uniteId = isset($data['unite_id']) ? (int) $data['unite_id'] : 0;
        $type    = $data['type'] ?? '';

        if (!$uniteId || !in_array($type, ['reel', 'detachement', 'virtuel'], true)) {
            return $this->json(['error' => 'unite_id et type (reel|detachement|virtuel) sont requis'], 400);
        }

        if (!$this->scope->canManageUnit($user, $uniteId)) {
            return $this->json(['error' => 'Cette unité est hors de votre périmètre'], 403);
        }

        if (!$this->db->fetchOne('SELECT 1 FROM personnel WHERE id = :id', ['id' => $id])) {
            return $this->json(['error' => 'Agent introuvable'], 404);
        }

        try {
            if ($type === 'reel') {
                // UPSERT : met à jour l'unité si l'agent a déjà une affectation réelle
                $this->db->executeStatement(
                    "INSERT INTO personnel_unite (personnel_id, unite_id, type) VALUES (:pid, :uid, :type)
                     ON CONFLICT (personnel_id) WHERE type = 'reel'
                     DO UPDATE SET unite_id = EXCLUDED.unite_id",
                    ['pid' => $id, 'uid' => $uniteId, 'type' => $type]
                );
            } else {
                $this->db->executeStatement(
                    'INSERT INTO personnel_unite (personnel_id, unite_id, type) VALUES (:pid, :uid, :type)
                     ON CONFLICT DO NOTHING',
                    ['pid' => $id, 'uid' => $uniteId, 'type' => $type]
                );
            }
        } catch (\Exception $e) {
            throw $e;
        }

        return $this->json(['ok' => true], 201);
    }

    #[Route('/api/personnel/{id}/unites/{uniteId}', name: 'api_personnel_unites_remove', methods: ['DELETE'])]
    public function removeUnite(int $id, int $uniteId): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        if (!$this->scope->canManageUnit($user, $uniteId)) {
            return $this->json(['error' => 'Cette unité est hors de votre périmètre'], 403);
        }

        $count = $this->db->executeStatement(
            'DELETE FROM personnel_unite WHERE personnel_id = :pid AND unite_id = :uid',
            ['pid' => $id, 'uid' => $uniteId]
        );

        if (!$count) {
            return $this->json(['error' => 'Affectation introuvable'], 404);
        }

        return new JsonResponse(null, 204);
    }
}
