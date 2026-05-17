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

class CartoController extends AbstractController
{
    public function __construct(
        private readonly RoleService $roles,
        private readonly ConfigService $config,
        private readonly TchapService $tchap,
        private readonly Connection $db,
    ) {
    }

    #[Route('/carto', name: 'app_carto', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();

        $uiConfig = $this->config->getUiConfig();
        $baseRole = str_contains($user->getAppRole(), ':')
            ? explode(':', $user->getAppRole())[0]
            : $user->getAppRole();

        $hasCarto = $user->isSysAdmin()
            || ($uiConfig['roleFeatures'][$baseRole]['carto'] ?? false);

        if (!$hasCarto) {
            throw $this->createAccessDeniedException('Acces a la cartographie non autorise');
        }

        $tchapCfg = $this->config->getTchapConfig();

        return $this->render('carto/index.html.twig', [
            'user' => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig' => $uiConfig,
            'tchapHomeserver' => $tchapCfg['homeserver'] ?? '',
        ]);
    }

    #[Route('/api/carto/positions', name: 'api_carto_positions', methods: ['GET'])]
    public function positions(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();

        $uiConfig = $this->config->getUiConfig();
        $baseRole = str_contains($user->getAppRole(), ':')
            ? explode(':', $user->getAppRole())[0]
            : $user->getAppRole();

        $hasCarto = $user->isSysAdmin()
            || ($uiConfig['roleFeatures'][$baseRole]['carto'] ?? false);

        if (!$hasCarto) {
            return $this->json(['error' => 'Acces a la cartographie non autorise'], 403);
        }

        $this->syncBridgeLocationEvents();

        if ($user->isSysAdmin()) {
            $rows = $this->fetchAllPositionedPersonnel();
        } else {
            $candidateIds = $this->getPersonnelIdsFromManagedRooms();
            $rows = $this->fetchPositionedPersonnelByIds($candidateIds);
        }

        foreach ($rows as &$row) {
            $row['Unite'] = $this->decodePgArray($row['Unite'] ?? '{}');
            $row['Salons_Extra'] = $this->decodePgArray($row['Salons_Extra'] ?? '{}');
        }

        return $this->json($rows);
    }

    #[Route('/api/carto/position', name: 'api_carto_share_position', methods: ['POST'])]
    public function sharePosition(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();

        if ($user->isSysAdmin() || !$user->getPersonnelId()) {
            return $this->json(['error' => 'Non disponible pour les comptes sysadmin'], 403);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $lat = $data['latitude'] ?? null;
        $lon = $data['longitude'] ?? null;

        if (!is_numeric($lat) || !is_numeric($lon)) {
            return $this->json(['error' => 'latitude et longitude requis'], 400);
        }

        $lat = (float) $lat;
        $lon = (float) $lon;

        if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
            return $this->json(['error' => 'Coordonnees hors limites'], 400);
        }

        $this->db->executeStatement(
            'UPDATE personnel SET latitude = :lat, longitude = :lon, position_at = NOW() WHERE id = :id',
            ['lat' => $lat, 'lon' => $lon, 'id' => $user->getPersonnelId()]
        );

        return $this->json(['ok' => true]);
    }

    #[Route('/api/carto/position', name: 'api_carto_remove_position', methods: ['DELETE'])]
    public function removePosition(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();

        if ($user->isSysAdmin() || !$user->getPersonnelId()) {
            return $this->json(['error' => 'Non disponible pour les comptes sysadmin'], 403);
        }

        $this->db->executeStatement(
            'UPDATE personnel SET latitude = NULL, longitude = NULL, position_at = NULL WHERE id = :id',
            ['id' => $user->getPersonnelId()]
        );

        return $this->json(['ok' => true]);
    }

    /**
     * Interroge le bridge pour récupérer les events m.location reçus depuis le dernier appel
     * et met à jour les coordonnées des agents correspondants en base.
     */
    private function syncBridgeLocationEvents(): void
    {
        try {
            $events = $this->tchap->callBridge('GET', '/location-events');

            foreach ($events as $event) {
                $userId = $event['userId'] ?? null;
                $lat    = isset($event['lat']) ? (float) $event['lat'] : null;
                $lon    = isset($event['lon']) ? (float) $event['lon'] : null;

                if (!$userId || $lat === null || $lon === null) {
                    continue;
                }
                if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
                    continue;
                }

                $this->db->executeStatement(
                    'UPDATE personnel SET latitude = :lat, longitude = :lon, position_at = NOW() WHERE "user_id" = :uid',
                    ['lat' => $lat, 'lon' => $lon, 'uid' => $userId]
                );
            }
        } catch (\Throwable) {
            // bridge indisponible ou erreur DB : non bloquant pour l'affichage
        }
    }

    private function fetchAllPositionedPersonnel(): array
    {
        return $this->db->fetchAllAssociative(
            'SELECT id, "Nom", "Prenom", "Grade", "Mail", "Unite", "Salons_Extra", "user_id",
                    latitude, longitude, position_at
             FROM personnel
             WHERE latitude IS NOT NULL
               AND longitude IS NOT NULL
             ORDER BY position_at DESC'
        );
    }

    /**
     * Returns the personnel ids for Matrix users currently present in salons backed by Tchap rooms.
     */
    private function getPersonnelIdsFromManagedRooms(): array
    {
        $salons = $this->db->fetchAllAssociative(
            'SELECT id, "room_id" FROM salons WHERE "room_id" IS NOT NULL AND "room_id" != \'\''
        );

        if (empty($salons)) {
            return [];
        }

        $userIds = [];

        foreach ($salons as $salon) {
            $roomId = (string) ($salon['room_id'] ?? '');
            if ($roomId === '') {
                continue;
            }

            try {
                $cfg = $this->getCfgForRoom($roomId);
                $members = $this->tchap->getMembers($roomId, $cfg);
                $botId = strtolower($cfg['botUserId'] ?? '');

                foreach ($members as $member) {
                    $membership = $member['content']['membership'] ?? '';
                    $userId = strtolower((string) ($member['state_key'] ?? ''));

                    if ($membership !== 'join' || $userId === '' || $userId === $botId) {
                        continue;
                    }

                    $userIds[$userId] = true;
                }
            } catch (\Throwable) {
                continue;
            }
        }

        if (empty($userIds)) {
            return [];
        }

        $rows = $this->db->fetchAllAssociative(
            'SELECT id, "user_id" FROM personnel WHERE "user_id" IS NOT NULL AND "user_id" != \'\''
        );

        $ids = [];
        foreach ($rows as $row) {
            $userId = strtolower((string) ($row['user_id'] ?? ''));
            if ($userId !== '' && isset($userIds[$userId])) {
                $ids[] = (int) $row['id'];
            }
        }

        return array_values(array_unique($ids));
    }

    private function fetchPositionedPersonnelByIds(array $ids): array
    {
        if (empty($ids)) {
            return [];
        }

        $pgIds = '{' . implode(',', array_map('intval', $ids)) . '}';

        return $this->db->fetchAllAssociative(
            'SELECT id, "Nom", "Prenom", "Grade", "Mail", "Unite", "Salons_Extra", "user_id",
                    latitude, longitude, position_at
             FROM personnel
             WHERE id = ANY(:ids::int[])
               AND latitude IS NOT NULL
               AND longitude IS NOT NULL
             ORDER BY position_at DESC',
            ['ids' => $pgIds]
        );
    }

    private function decodePgArray(mixed $value): array
    {
        if (is_array($value)) {
            return array_map('intval', $value);
        }

        $raw = trim((string) $value);
        if ($raw === '' || $raw === '{}') {
            return [];
        }

        return array_map('intval', explode(',', trim($raw, '{}')));
    }

    private function getCfgForRoom(string $roomId): array
    {
        $globalCfg = $this->config->getTchapConfig();

        $salon = $this->db->fetchAssociative(
            'SELECT id FROM salons WHERE "room_id" = :rid',
            ['rid' => $roomId]
        );
        if (!$salon) {
            return $globalCfg;
        }

        $unite = $this->db->fetchAssociative(
            'SELECT * FROM unites WHERE :sid = ANY("Salons") LIMIT 1',
            ['sid' => (int) $salon['id']]
        );
        if (!$unite) {
            return $globalCfg;
        }

        return $this->resolveBotCfg($unite, $globalCfg);
    }

    private function resolveBotCfg(array $unite, array $globalCfg): array
    {
        if (!empty($unite['bot_id'])) {
            $bot = $this->db->fetchAssociative(
                'SELECT * FROM bots WHERE id = :id',
                ['id' => (int) $unite['bot_id']]
            );
            if ($bot && !empty($bot['access_token'])) {
                return array_merge($globalCfg, [
                    'token' => $bot['access_token'],
                    'botUserId' => $bot['user_id'],
                    'homeserver' => $bot['homeserver'] ?: $globalCfg['homeserver'],
                    'bypass_bridge' => !$bot['is_principal'],
                ]);
            }
        }

        if (!empty($unite['bot_access_token']) && !empty($unite['bot_user_id'])) {
            return array_merge($globalCfg, [
                'token' => $unite['bot_access_token'],
                'botUserId' => $unite['bot_user_id'],
                'bypass_bridge' => true,
            ]);
        }

        return $globalCfg;
    }
}
