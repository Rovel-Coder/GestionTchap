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

/**
 * Gère les relations "une unité administre une autre unité" (unite_unite_roles).
 * Ex : l'unité SIC administre le Groupement du Nord.
 */
class UniteUniteRolesController extends AbstractController
{
    public function __construct(
        private readonly Connection   $db,
        private readonly RoleService  $roles,
        private readonly ScopeService $scope,
    ) {}

    /** Liste des unités administratrices d'une unité cible. */
    #[Route('/api/unites/{id}/unite-admins', name: 'api_unite_unite_roles_list', methods: ['GET'])]
    public function list(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        return $this->json($this->scope->getUniteUniteRoles($id));
    }

    /** Assigner une unité source comme administratrice de l'unité cible. */
    #[Route('/api/unites/{id}/unite-admins', name: 'api_unite_unite_roles_add', methods: ['POST'])]
    public function add(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $data     = json_decode($request->getContent(), true) ?? [];
        $sourceId = isset($data['unite_source_id']) ? (int) $data['unite_source_id'] : 0;
        $role     = $data['role'] ?? 'gestionnaire';

        if (!$sourceId || !in_array($role, ['admin', 'gestionnaire'], true)) {
            return $this->json(['error' => 'unite_source_id et role (admin|gestionnaire) sont requis'], 400);
        }

        if ($sourceId === $id) {
            return $this->json(['error' => 'Une unité ne peut pas s\'administrer elle-même'], 400);
        }

        if (!$this->scope->canManageUnit($user, $id)) {
            return $this->json(['error' => 'Cette unité est hors de votre périmètre'], 403);
        }

        if (!$this->db->fetchOne('SELECT 1 FROM unites WHERE id = :id', ['id' => $sourceId])) {
            return $this->json(['error' => 'Unité source introuvable'], 404);
        }

        $this->db->executeStatement(
            'INSERT INTO unite_unite_roles (unite_source, unite_cible, role)
             VALUES (:src, :cible, :role)
             ON CONFLICT (unite_source, unite_cible) DO UPDATE SET role = :role',
            ['src' => $sourceId, 'cible' => $id, 'role' => $role]
        );

        return $this->json(['ok' => true], 201);
    }

    /** Retirer une unité source de l'administration de l'unité cible. */
    #[Route('/api/unites/{id}/unite-admins/{sourceId}', name: 'api_unite_unite_roles_remove', methods: ['DELETE'])]
    public function remove(int $id, int $sourceId): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        if (!$this->scope->canManageUnit($user, $id)) {
            return $this->json(['error' => 'Cette unité est hors de votre périmètre'], 403);
        }

        $count = $this->db->executeStatement(
            'DELETE FROM unite_unite_roles WHERE unite_source = :src AND unite_cible = :cible',
            ['src' => $sourceId, 'cible' => $id]
        );

        if (!$count) {
            return $this->json(['error' => 'Association introuvable'], 404);
        }

        return new JsonResponse(null, 204);
    }
}
