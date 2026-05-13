<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\ConfigService;
use App\Service\RoleService;
use App\Service\ScopeService;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class UniteController extends AbstractController
{
    private const WRITABLE = ['Nom', 'code', 'Salons', 'numero', 'adresse', 'bot_id', 'parent_id', 'niveau_id', 'type'];
    private const LIMITS   = ['Nom' => 200, 'code' => 50, 'numero' => 50, 'adresse' => 500];

    public function __construct(
        private readonly Connection    $db,
        private readonly RoleService   $roles,
        private readonly ScopeService  $scope,
        private readonly ConfigService $config,
    ) {}

    #[Route('/unites', name: 'app_unites', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            throw $this->createAccessDeniedException('Accès réservé aux gestionnaires');
        }

        return $this->render('unite/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }

    #[Route('/api/unites', name: 'api_unites_list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        if ($user->isSysAdmin()) {
            $rows = $this->db->fetchAllAssociative(
                'SELECT u.*, n.nom AS niveau_nom, n.ordre AS niveau_ordre
                 FROM unites u
                 LEFT JOIN niveaux n ON n.id = u.niveau_id
                 ORDER BY n.ordre NULLS LAST, u."Nom"'
            );
        } else {
            $ids = $this->scope->getPerimeterIds($user);
            if (empty($ids)) {
                return $this->json([]);
            }
            $rows = $this->db->fetchAllAssociative(
                'SELECT u.*, n.nom AS niveau_nom, n.ordre AS niveau_ordre
                 FROM unites u
                 LEFT JOIN niveaux n ON n.id = u.niveau_id
                 WHERE u.id = ANY(:ids::int[])
                 ORDER BY n.ordre NULLS LAST, u."Nom"',
                ['ids' => $this->scope->toPgIntArray($ids)]
            );
        }

        return $this->json(array_map($this->formatRow(...), $rows));
    }

    #[Route('/api/unites', name: 'api_unites_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $fields = $this->extract($data);

        // Si un parent est fourni, vérifier qu'il est dans le périmètre
        if (isset($fields['parent_id']) && $fields['parent_id'] !== null) {
            if (!$this->scope->canManageUnit($user, $fields['parent_id'])) {
                return $this->json(['error' => "L'unité parente est hors de votre périmètre"], 403);
            }
        } elseif (!$user->isSysAdmin()) {
            // Créer une unité sans parent (racine) est réservé aux sysadmin
            return $this->json(['error' => 'Seul un administrateur système peut créer une unité racine'], 403);
        }

        $err = $this->validate($fields);
        if ($err) {
            return $this->json(['error' => $err], 400);
        }

        [$cols, $vals, $phs] = $this->buildInsert($fields);
        $this->db->executeStatement("INSERT INTO unites ($cols) VALUES ($phs)", $vals);

        $id  = (int) $this->db->lastInsertId();
        $row = $this->db->fetchAssociative(
            'SELECT u.*, n.nom AS niveau_nom, n.ordre AS niveau_ordre
             FROM unites u LEFT JOIN niveaux n ON n.id = u.niveau_id
             WHERE u.id = :id',
            ['id' => $id]
        );

        return $this->json($this->formatRow($row), 201);
    }

    #[Route('/api/unites/{id}', name: 'api_unites_update', methods: ['PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        if (!$this->scope->canManageUnit($user, $id)) {
            return $this->json(['error' => 'Cette unité est hors de votre périmètre'], 403);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $fields = $this->extract($data);

        if (empty($fields)) {
            return $this->json(['error' => 'Aucun champ à mettre à jour'], 400);
        }

        // Vérifier le nouveau parent s'il change
        if (array_key_exists('parent_id', $fields) && $fields['parent_id'] !== null) {
            if ($fields['parent_id'] === $id) {
                return $this->json(['error' => 'Une unité ne peut pas être son propre parent'], 400);
            }
            if (!$this->scope->canManageUnit($user, $fields['parent_id'])) {
                return $this->json(['error' => "L'unité parente est hors de votre périmètre"], 403);
            }
        }

        $err = $this->validate($fields);
        if ($err) {
            return $this->json(['error' => $err], 400);
        }

        $i    = 0;
        $sets = [];
        $vals = ['__id' => $id];

        foreach ($fields as $k => $v) {
            if ($k === 'Salons') {
                $sets[]       = '"Salons" = :p' . $i;
                $vals['p' . $i] = $this->arrayToPg($v);
            } else {
                $sets[]       = "\"$k\" = :p$i";
                $vals['p' . $i] = $v;
            }
            $i++;
        }

        $count = $this->db->executeStatement(
            'UPDATE unites SET ' . implode(', ', $sets) . ' WHERE id = :__id',
            $vals
        );

        if (!$count) {
            return $this->json(['error' => 'Unité introuvable'], 404);
        }

        $row = $this->db->fetchAssociative(
            'SELECT u.*, n.nom AS niveau_nom, n.ordre AS niveau_ordre
             FROM unites u LEFT JOIN niveaux n ON n.id = u.niveau_id
             WHERE u.id = :id',
            ['id' => $id]
        );

        return $this->json($this->formatRow($row));
    }

    #[Route('/api/unites/{id}', name: 'api_unites_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        if (!$this->scope->canManageUnit($user, $id)) {
            return $this->json(['error' => 'Cette unité est hors de votre périmètre'], 403);
        }

        $children = (int) $this->db->fetchOne(
            'SELECT COUNT(*) FROM unites WHERE parent_id = :id',
            ['id' => $id]
        );
        if ($children > 0) {
            return $this->json(['error' => "Impossible de supprimer une unité qui a $children unité(s) subordonnée(s)"], 409);
        }

        $count = $this->db->executeStatement('DELETE FROM unites WHERE id = :id', ['id' => $id]);
        if (!$count) {
            return $this->json(['error' => 'Unité introuvable'], 404);
        }

        return new JsonResponse(null, 204);
    }

    #[Route('/api/unites', name: 'api_unites_bulk_delete', methods: ['DELETE'])]
    public function bulkDelete(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $ids  = array_values(array_filter(array_map('intval', $data['ids'] ?? []), fn($id) => $id > 0));

        if (empty($ids)) {
            return $this->json(['error' => 'Aucun id fourni'], 400);
        }

        // Vérifier le périmètre pour chaque ID
        foreach ($ids as $uniteId) {
            if (!$this->scope->canManageUnit($user, $uniteId)) {
                return $this->json(['error' => "L'unité $uniteId est hors de votre périmètre"], 403);
            }
        }

        // Vérifier qu'aucune n'a d'enfants
        $pgIds    = $this->scope->toPgIntArray($ids);
        $children = (int) $this->db->fetchOne(
            'SELECT COUNT(*) FROM unites WHERE parent_id = ANY(:ids::int[]) AND id != ALL(:ids::int[])',
            ['ids' => $pgIds]
        );
        if ($children > 0) {
            return $this->json(['error' => 'Une ou plusieurs unités sélectionnées ont des unités subordonnées'], 409);
        }

        $placeholders = implode(',', array_map(fn($i) => ":id$i", array_keys($ids)));
        $params       = [];
        foreach ($ids as $i => $id) {
            $params["id$i"] = $id;
        }

        $deleted = $this->db->executeStatement(
            "DELETE FROM unites WHERE id IN ($placeholders)",
            $params
        );

        return $this->json(['deleted' => $deleted]);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private function extract(array $data): array
    {
        $fields = [];
        foreach (self::WRITABLE as $k) {
            if (!array_key_exists($k, $data)) {
                continue;
            }
            $fields[$k] = match ($k) {
                'Salons'                  => $this->toIntArray($data[$k]),
                'bot_id', 'parent_id', 'niveau_id' => ($data[$k] !== null && $data[$k] !== '') ? (int) $data[$k] : null,
                default                   => $data[$k],
            };
        }

        return $fields;
    }

    private function validate(array $fields): ?string
    {
        foreach (self::LIMITS as $k => $limit) {
            if (isset($fields[$k]) && is_string($fields[$k]) && strlen($fields[$k]) > $limit) {
                return sprintf('Le champ "%s" dépasse la limite de %d caractères', $k, $limit);
            }
        }
        if (isset($fields['type']) && !in_array($fields['type'], ['reel', 'virtuel'], true)) {
            return 'Le type doit être "reel" ou "virtuel"';
        }

        return null;
    }

    private function toIntArray(mixed $val): array
    {
        if (!$val) {
            return [];
        }
        if (is_array($val)) {
            $start = ($val[0] ?? null) === 'L' ? 1 : 0;
            return array_values(array_filter(
                array_map('intval', array_slice($val, $start)),
                fn($n) => $n !== 0
            ));
        }

        return [];
    }

    private function buildInsert(array $fields): array
    {
        $cols = [];
        $vals = [];
        $phs  = [];
        $i    = 0;

        foreach ($fields as $k => $v) {
            $cols[]       = "\"$k\"";
            $phs[]        = ":p$i";
            $vals["p$i"] = $k === 'Salons' ? $this->arrayToPg($v) : $v;
            $i++;
        }

        return [implode(', ', $cols), $vals, implode(', ', $phs)];
    }

    private function arrayToPg(array $arr): string
    {
        return empty($arr) ? '{}' : '{' . implode(',', array_map('intval', $arr)) . '}';
    }

    private function formatRow(array $row): array
    {
        $s = $row['Salons'] ?? '{}';
        $row['Salons'] = is_string($s)
            ? ($s === '{}' || $s === '' ? [] : array_map('intval', explode(',', trim($s, '{}'))))
            : array_map('intval', (array) $s);

        $row['bot_id']    = isset($row['bot_id'])    ? (int) $row['bot_id']    : null;
        $row['parent_id'] = isset($row['parent_id']) ? (int) $row['parent_id'] : null;
        $row['niveau_id'] = isset($row['niveau_id']) ? (int) $row['niveau_id'] : null;
        $row['type']      = $row['type'] ?? 'virtuel';

        unset($row['bot_access_token']);

        return $row;
    }
}
