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

class EspaceController extends AbstractController
{
    private const WRITABLE = ['Nom', 'Description'];
    private const LIMITS   = ['Nom' => 200, 'Description' => 500];

    public function __construct(
        private readonly Connection    $db,
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
        private readonly TchapService  $tchap,
    ) {
    }

    #[Route('/espaces', name: 'app_espaces', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            throw $this->createAccessDeniedException('Accès réservé aux gestionnaires');
        }

        return $this->render('espace/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }

    #[Route('/api/espaces', name: 'api_espaces_list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $espaces = $this->db->fetchAllAssociative('SELECT * FROM espaces ORDER BY "Nom"');

        // Attacher les salons liés à chaque espace
        foreach ($espaces as &$espace) {
            $espace['_salons'] = $this->db->fetchAllAssociative(
                'SELECT s.* FROM salons s
                 JOIN espace_salons es ON es.salon_id = s.id
                 WHERE es.espace_id = :id
                 ORDER BY s."Nom"',
                ['id' => $espace['id']]
            );
        }

        return $this->json($espaces);
    }

    #[Route('/api/espaces', name: 'api_espaces_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $fields = $this->extract($data);

        if (empty($fields['Nom'] ?? '')) {
            return $this->json(['error' => 'Le champ "Nom" est obligatoire'], 400);
        }

        $err = $this->validate($fields);
        if ($err) {
            return $this->json(['error' => $err], 400);
        }

        $this->db->executeStatement(
            'INSERT INTO espaces ("Nom", "Description") VALUES (:nom, :desc)',
            ['nom' => $fields['Nom'], 'desc' => $fields['Description'] ?? '']
        );
        $id  = (int) $this->db->lastInsertId();
        $row = $this->db->fetchAssociative('SELECT * FROM espaces WHERE id = :id', ['id' => $id]);
        $row['_salons'] = [];

        return $this->json($row, 201);
    }

    #[Route('/api/espaces/{id}', name: 'api_espaces_update', methods: ['PATCH'])]
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
            $sets[]      = "\"$k\" = :p$i";
            $vals["p$i"] = $v;
            $i++;
        }

        $count = $this->db->executeStatement(
            'UPDATE espaces SET ' . implode(', ', $sets) . ' WHERE id = :__id',
            $vals
        );

        if (!$count) {
            return $this->json(['error' => 'Espace introuvable'], 404);
        }

        $row           = $this->db->fetchAssociative('SELECT * FROM espaces WHERE id = :id', ['id' => $id]);
        $row['_salons'] = $this->getSalons($id);

        return $this->json($row);
    }

    // POST /api/espaces/{id}/create-space — crée l'espace sur Tchap et sauvegarde le space_id
    #[Route('/api/espaces/{id}/create-space', name: 'api_espaces_create_space', methods: ['POST'])]
    public function createSpace(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $espace = $this->db->fetchAssociative('SELECT * FROM espaces WHERE id = :id', ['id' => $id]);
        if (!$espace) {
            return $this->json(['error' => 'Espace introuvable'], 404);
        }

        if (!empty($espace['space_id'])) {
            return $this->json(['error' => 'Cet espace a déjà un space_id : ' . $espace['space_id']], 409);
        }

        try {
            $cfg    = $this->config->getTchapConfig();
            $result = $this->tchap->createSpace(
                name:   $espace['Nom'],
                topic:  $espace['Description'] ?? '',
                config: $cfg,
            );

            $spaceId = $result['space_id'] ?? null;
            if (!$spaceId) {
                return $this->json(['error' => 'Réponse Tchap invalide : space_id absent'], 500);
            }

            $this->db->executeStatement(
                'UPDATE espaces SET "space_id" = :sid WHERE id = :id',
                ['sid' => $spaceId, 'id' => $id]
            );

            $updated           = $this->db->fetchAssociative('SELECT * FROM espaces WHERE id = :id', ['id' => $id]);
            $updated['_salons'] = $this->getSalons($id);

            return $this->json($updated);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/espaces/{id}/salons — lie un salon à l'espace (et l'ajoute sur Tchap si possible)
    #[Route('/api/espaces/{id}/salons', name: 'api_espaces_add_salon', methods: ['POST'])]
    public function addSalon(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $espace = $this->db->fetchAssociative('SELECT * FROM espaces WHERE id = :id', ['id' => $id]);
        if (!$espace) {
            return $this->json(['error' => 'Espace introuvable'], 404);
        }

        $data     = json_decode($request->getContent(), true) ?? [];
        $salonId  = isset($data['salonId']) ? (int) $data['salonId'] : 0;

        if (!$salonId) {
            return $this->json(['error' => 'salonId requis'], 400);
        }

        $salon = $this->db->fetchAssociative('SELECT * FROM salons WHERE id = :id', ['id' => $salonId]);
        if (!$salon) {
            return $this->json(['error' => 'Salon introuvable'], 404);
        }

        // Insertion (ignore si déjà lié)
        $this->db->executeStatement(
            'INSERT INTO espace_salons (espace_id, salon_id) VALUES (:eid, :sid) ON CONFLICT DO NOTHING',
            ['eid' => $id, 'sid' => $salonId]
        );

        $cfg        = $this->config->getTchapConfig();
        $tchapError = null;
        $invited    = 0;
        $skipped    = 0;

        if (!empty($espace['space_id']) && !empty($salon['room_id'])) {
            // 1. Ajouter le salon comme enfant de l'espace
            try {
                $this->tchap->addChildToSpace(
                    spaceId: $espace['space_id'],
                    roomId:  $salon['room_id'],
                    config:  $cfg,
                );
            } catch (\Throwable $e) {
                $tchapError = $e->getMessage();
            }

            // 2. Auto-inviter les membres du salon dans l'espace
            try {
                $botId = strtolower($cfg['botUserId'] ?? '');

                $salonRaw    = $this->tchap->getMembers($salon['room_id'], $cfg);
                $espaceRaw   = $this->tchap->getMembers($espace['space_id'], $cfg);
                $espaceUids  = array_map(fn($m) => strtolower($m['state_key'] ?? ''), $espaceRaw);

                foreach ($salonRaw as $m) {
                    $uid  = strtolower($m['state_key'] ?? '');
                    $memb = $m['content']['membership'] ?? 'join';
                    if (!$uid || $uid === $botId || $memb !== 'join') {
                        continue;
                    }
                    if (in_array($uid, $espaceUids, true)) {
                        $skipped++;
                        continue;
                    }
                    try {
                        $this->tchap->invite($espace['space_id'], $uid, $cfg);
                        $invited++;
                    } catch (\Throwable) {
                        // non critique
                    }
                }
            } catch (\Throwable) {
                // non critique — le lien salon/espace est déjà enregistré
            }
        }

        $response = [
            '_salons'  => $this->getSalons($id),
            '_invited' => $invited,
            '_skipped' => $skipped,
        ];
        if ($tchapError) {
            $response['_tchap_warning'] = "Salon lié en base mais erreur Tchap : $tchapError";
        }

        return $this->json($response);
    }

    // DELETE /api/espaces/{id}/salons/{salonId} — retire un salon de l'espace
    #[Route('/api/espaces/{id}/salons/{salonId}', name: 'api_espaces_remove_salon', methods: ['DELETE'])]
    public function removeSalon(int $id, int $salonId): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $espace = $this->db->fetchAssociative('SELECT * FROM espaces WHERE id = :id', ['id' => $id]);
        if (!$espace) {
            return $this->json(['error' => 'Espace introuvable'], 404);
        }

        $this->db->executeStatement(
            'DELETE FROM espace_salons WHERE espace_id = :eid AND salon_id = :sid',
            ['eid' => $id, 'sid' => $salonId]
        );

        // Retirer le lien Tchap si possible
        $tchapError = null;
        $salon      = $this->db->fetchAssociative('SELECT * FROM salons WHERE id = :id', ['id' => $salonId]);
        if ($salon && !empty($espace['space_id']) && !empty($salon['room_id'])) {
            try {
                $this->tchap->removeChildFromSpace(
                    spaceId: $espace['space_id'],
                    roomId:  $salon['room_id'],
                    config:  $this->config->getTchapConfig(),
                );
            } catch (\Throwable $e) {
                $tchapError = $e->getMessage();
            }
        }

        $response = ['_salons' => $this->getSalons($id)];
        if ($tchapError) {
            $response['_tchap_warning'] = "Lien retiré en base mais erreur Tchap : $tchapError";
        }

        return $this->json($response);
    }

    // POST /api/espaces/{id}/invite — invite un utilisateur dans l'espace Tchap
    #[Route('/api/espaces/{id}/invite', name: 'api_espaces_invite', methods: ['POST'])]
    public function invite(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $espace = $this->db->fetchAssociative('SELECT * FROM espaces WHERE id = :id', ['id' => $id]);
        if (!$espace) {
            return $this->json(['error' => 'Espace introuvable'], 404);
        }

        if (empty($espace['space_id'])) {
            return $this->json(['error' => "L'espace n'a pas encore été créé sur Tchap"], 409);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $userId = trim($data['userId'] ?? '');

        if (!$userId) {
            return $this->json(['error' => 'userId requis'], 400);
        }

        try {
            $this->tchap->invite(
                roomId: $espace['space_id'],
                userId: $userId,
                config: $this->config->getTchapConfig(),
            );
            return $this->json(['ok' => true]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // GET /api/espaces/{id}/members — membres de l'espace Tchap avec leur statut
    #[Route('/api/espaces/{id}/members', name: 'api_espaces_members', methods: ['GET'])]
    public function members(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        $espace = $this->db->fetchAssociative('SELECT * FROM espaces WHERE id = :id', ['id' => $id]);
        if (!$espace) {
            return $this->json(['error' => 'Espace introuvable'], 404);
        }

        if (empty($espace['space_id'])) {
            return $this->json(['members' => []]);
        }

        try {
            $cfg    = $this->config->getTchapConfig();
            $botId  = strtolower($cfg['botUserId'] ?? '');
            $raw    = $this->tchap->getMembers($espace['space_id'], $cfg);

            $members = [];
            foreach ($raw as $m) {
                $uid  = strtolower($m['state_key'] ?? '');
                $memb = $m['content']['membership'] ?? 'join';
                if (!$uid || $uid === $botId) {
                    continue;
                }
                $members[] = ['userId' => $uid, 'membership' => $memb];
            }

            // Tri : join → invite → reste
            $order = ['join' => 0, 'invite' => 1];
            usort($members, fn($a, $b) =>
                ($order[$a['membership']] ?? 2) <=> ($order[$b['membership']] ?? 2)
                ?: strcmp($a['userId'], $b['userId'])
            );

            return $this->json(['members' => $members]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/api/espaces/{id}', name: 'api_espaces_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $count = $this->db->executeStatement('DELETE FROM espaces WHERE id = :id', ['id' => $id]);
        if (!$count) {
            return $this->json(['error' => 'Espace introuvable'], 404);
        }

        return new JsonResponse(null, 204);
    }

    private function getSalons(int $espaceId): array
    {
        return $this->db->fetchAllAssociative(
            'SELECT s.* FROM salons s
             JOIN espace_salons es ON es.salon_id = s.id
             WHERE es.espace_id = :id
             ORDER BY s."Nom"',
            ['id' => $espaceId]
        );
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
