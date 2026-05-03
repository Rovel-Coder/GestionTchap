<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\ConfigService;
use App\Service\RoleService;
use App\Service\TchapService;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class SalonController extends AbstractController
{
    private const WRITABLE = ['Nom', 'Description', 'Type', 'room_id'];
    private const LIMITS   = ['Nom' => 200, 'Description' => 500, 'room_id' => 200, 'Type' => 50];

    public function __construct(
        private readonly Connection    $db,
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
        private readonly TchapService  $tchap,
    ) {
    }

    #[Route('/salons', name: 'app_salons', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            throw $this->createAccessDeniedException('Accès réservé aux gestionnaires');
        }

        return $this->render('salon/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }

    #[Route('/api/salons', name: 'api_salons_list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $rows = $this->db->fetchAllAssociative('SELECT * FROM salons ORDER BY "Nom"');
        return $this->json($rows);
    }

    #[Route('/api/salons', name: 'api_salons_create', methods: ['POST'])]
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

        $cols = implode(', ', array_map(fn($k) => "\"$k\"", array_keys($fields)));
        $phs  = implode(', ', array_map(fn($i) => ":p$i", range(0, count($fields) - 1)));
        $vals = array_combine(
            array_map(fn($i) => "p$i", range(0, count($fields) - 1)),
            array_values($fields)
        );

        $this->db->executeStatement("INSERT INTO salons ($cols) VALUES ($phs)", $vals);
        $id  = $this->db->lastInsertId();
        $row = $this->db->fetchAssociative('SELECT * FROM salons WHERE id = :id', ['id' => $id]);

        return $this->json($row, 201);
    }

    #[Route('/api/salons/{id}', name: 'api_salons_update', methods: ['PATCH'])]
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
            $sets[]         = "\"$k\" = :p$i";
            $vals["p$i"] = $v;
            $i++;
        }

        $count = $this->db->executeStatement(
            'UPDATE salons SET ' . implode(', ', $sets) . ' WHERE id = :__id',
            $vals
        );

        if (!$count) {
            return $this->json(['error' => 'Salon introuvable'], 404);
        }

        $row = $this->db->fetchAssociative('SELECT * FROM salons WHERE id = :id', ['id' => $id]);

        return $this->json($row);
    }

    // POST /api/salons/{id}/create-room — crée le salon sur Tchap et sauvegarde le room_id
    #[Route('/api/salons/{id}/create-room', name: 'api_salons_create_room', methods: ['POST'])]
    public function createRoom(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $salon = $this->db->fetchAssociative('SELECT * FROM salons WHERE id = :id', ['id' => $id]);
        if (!$salon) {
            return $this->json(['error' => 'Salon introuvable'], 404);
        }

        if (!empty($salon['room_id'])) {
            return $this->json(['error' => 'Ce salon a déjà un room_id : ' . $salon['room_id']], 409);
        }

        try {
            $cfg    = $this->config->getTchapConfig();
            $result = $this->tchap->createRoom(
                name:   $salon['Nom'],
                topic:  $salon['Description'] ?? '',
                preset: 'private_chat',
                config: $cfg,
            );

            $roomId = $result['room_id'] ?? null;
            if (!$roomId) {
                return $this->json(['error' => 'Réponse Tchap invalide : room_id absent'], 500);
            }

            $this->db->executeStatement(
                'UPDATE salons SET "room_id" = :rid WHERE id = :id',
                ['rid' => $roomId, 'id' => $id]
            );

            $updated = $this->db->fetchAssociative('SELECT * FROM salons WHERE id = :id', ['id' => $id]);
            return $this->json($updated);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/salons/{id}', name: 'api_salons_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $count = $this->db->executeStatement('DELETE FROM salons WHERE id = :id', ['id' => $id]);
        if (!$count) {
            return $this->json(['error' => 'Salon introuvable'], 404);
        }

        return new JsonResponse(null, 204);
    }

    private function extract(array $data): array
    {
        $fields = [];
        foreach (self::WRITABLE as $k) {
            if (array_key_exists($k, $data)) {
                $fields[$k] = $data[$k];
            }
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
}
