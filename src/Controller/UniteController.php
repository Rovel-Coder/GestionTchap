<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\ConfigService;
use App\Service\RoleService;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class UniteController extends AbstractController
{
    private const WRITABLE = ['Nom', 'code', 'Salons'];
    private const LIMITS   = ['Nom' => 200, 'code' => 50];

    public function __construct(
        private readonly Connection    $db,
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
    ) {
    }

    #[Route('/unites', name: 'app_unites', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();

        return $this->render('unite/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }

    #[Route('/api/unites', name: 'api_unites_list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        $rows = $this->db->fetchAllAssociative('SELECT * FROM unites ORDER BY "Nom"');
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

        $err = $this->validate($fields);
        if ($err) {
            return $this->json(['error' => $err], 400);
        }

        [$cols, $vals, $phs] = $this->buildInsert($fields);

        $this->db->executeStatement("INSERT INTO unites ($cols) VALUES ($phs)", $vals);
        $id  = $this->db->lastInsertId();
        $row = $this->db->fetchAssociative('SELECT * FROM unites WHERE id = :id', ['id' => $id]);

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

        $data   = json_decode($request->getContent(), true) ?? [];
        $fields = $this->extract($data);

        if (empty($fields)) {
            return $this->json(['error' => 'Aucun champ à mettre à jour'], 400);
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
                $sets[]       = "\"Salons\" = :p$i";
                $vals["p$i"] = $this->arrayToPg($v);
            } else {
                $sets[]       = "\"$k\" = :p$i";
                $vals["p$i"] = $v;
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

        $row = $this->db->fetchAssociative('SELECT * FROM unites WHERE id = :id', ['id' => $id]);

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

        $count = $this->db->executeStatement('DELETE FROM unites WHERE id = :id', ['id' => $id]);
        if (!$count) {
            return $this->json(['error' => 'Unité introuvable'], 404);
        }

        return new JsonResponse(null, 204);
    }

    private function extract(array $data): array
    {
        $fields = [];
        foreach (self::WRITABLE as $k) {
            if (!array_key_exists($k, $data)) {
                continue;
            }
            $fields[$k] = $k === 'Salons' ? $this->toIntArray($data[$k]) : $data[$k];
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
        if (is_string($s)) {
            $row['Salons'] = $s === '{}' || $s === '' ? [] : array_map('intval', explode(',', trim($s, '{}')));
        } else {
            $row['Salons'] = array_map('intval', (array) $s);
        }
        return $row;
    }
}
