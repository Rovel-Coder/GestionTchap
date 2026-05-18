<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\ConfigService;
use App\Service\RoleService;
use App\Service\ScopeService;
use App\Service\TchapService;
use Doctrine\DBAL\Connection;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class CartoController extends AbstractController
{
    public function __construct(
        private readonly RoleService $roles,
        private readonly ScopeService $scope,
        private readonly ConfigService $config,
        private readonly TchapService $tchap,
        private readonly Connection $db,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/api/carto/diagnostic', name: 'api_carto_diagnostic', methods: ['GET'])]
    public function diagnostic(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Forbidden'], 403);
        }

        $salons = $this->db->fetchAllAssociative(
            'SELECT id, "Nom", "room_id" FROM salons WHERE "room_id" IS NOT NULL AND "room_id" != \'\''
        );

        $results = [];
        foreach ($salons as $salon) {
            $roomId = (string) ($salon['room_id'] ?? '');
            try {
                $raw = $this->tchap->callBridge('GET', '/rooms/' . rawurlencode($roomId) . '/beacon-positions');
                $results[] = [
                    'salon_id'   => $salon['id'],
                    'salon_nom'  => $salon['Nom'],
                    'room_id'    => $roomId,
                    'positions'  => $raw,
                    'error'      => null,
                ];
            } catch (\Throwable $e) {
                $results[] = [
                    'salon_id'  => $salon['id'],
                    'salon_nom' => $salon['Nom'],
                    'room_id'   => $roomId,
                    'positions' => [],
                    'error'     => $e->getMessage(),
                ];
            }
        }

        return $this->json([
            'salons_checked' => count($salons),
            'results'        => $results,
        ]);
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

        $liveSharing = $this->syncBeaconPositionsFromBridge();
        $liveUserIds = array_keys($liveSharing);

        if ($user->isSysAdmin()) {
            $rows = $this->fetchAllPositionedPersonnel();
            $rows = $this->mergePersonnelRows($rows, $this->fetchPersonnelByUserIds($liveUserIds));
        } else {
            $perimeterIds = $this->scope->getPerimeterIds($user);
            $rows = $this->fetchPositionedPersonnelByPerimeter($perimeterIds);
            $rows = $this->mergePersonnelRows(
                $rows,
                $this->fetchPersonnelByUserIds($liveUserIds, $perimeterIds)
            );
        }

        $liveLookup = $liveSharing;
        foreach ($rows as &$row) {
            $row['Unite'] = $this->decodePgArray($row['Unite'] ?? '{}');
            $row['Salons_Extra'] = $this->decodePgArray($row['Salons_Extra'] ?? '{}');
            $liveData = $liveLookup[strtolower((string) ($row['user_id'] ?? ''))] ?? null;
            $row['sharing_live'] = $liveData !== null;
            $row['sharing_salons'] = $liveData['salons'] ?? [];
            $row['sharing_source'] = $liveData['source'] ?? null;
            $row['sharing_has_coords'] = (bool) ($liveData['has_coords'] ?? false);
            $row['diagnostic_state'] = $liveData === null
                ? ($this->hasRowCoordinates($row) ? 'position_only' : 'inactive')
                : (($liveData['has_coords'] ?? false) ? 'live_with_coords' : 'live_without_coords');
        }

        $this->logger->info('[carto/positions] réponse', [
            'count' => count($rows),
            'ids_with_lat' => array_map(fn($r) => $r['id'] . '(lat=' . $r['latitude'] . ')', array_filter($rows, fn($r) => $r['latitude'] !== null)),
        ]);

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
     * Pour chaque salon Tchap configuré, interroge le bridge pour récupérer les positions
     * beacon actives (MSC3672/MSC3488) et met à jour la base.
     * Approche pull : plus fiable que le buffer push car elle interroge l'état Matrix courant.
     */
    private function syncBeaconPositionsFromBridge(): array
    {
        $salons = $this->db->fetchAllAssociative(
            'SELECT id, "Nom", "room_id" FROM salons WHERE "room_id" IS NOT NULL AND "room_id" != \'\''
        );
        $liveSharing = [];

        foreach ($salons as $salon) {
            $roomId = (string) ($salon['room_id'] ?? '');
            if ($roomId === '') {
                continue;
            }

            try {
                $positions = $this->tchap->callBridge(
                    'GET',
                    '/rooms/' . rawurlencode($roomId) . '/beacon-positions'
                );

                foreach ($positions as $pos) {
                    $userId = $pos['userId'] ?? null;
                    $lat    = isset($pos['lat']) ? (float) $pos['lat'] : null;
                    $lon    = isset($pos['lon']) ? (float) $pos['lon'] : null;
                    $source = (string) ($pos['source'] ?? 'unknown');

                    if (!$userId) {
                        continue;
                    }
                    $userKey = strtolower((string) $userId);
                    $liveSharing[$userKey] ??= ['salons' => [], 'source' => $source, 'has_coords' => false];
                    $liveSharing[$userKey]['salons'][(int) $salon['id']] = [
                        'id' => (int) $salon['id'],
                        'Nom' => (string) ($salon['Nom'] ?? ''),
                        'room_id' => $roomId,
                    ];

                    if ($lat === null || $lon === null) {
                        $this->logger->info('[carto] Partage live détecté sans coordonnées exploitables', [
                            'user_id' => $userId,
                            'room_id' => $roomId,
                            'salon_id' => (int) $salon['id'],
                            'salon_nom' => (string) ($salon['Nom'] ?? ''),
                            'source' => $source,
                        ]);
                        continue;
                    }
                    if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
                        $this->logger->warning('[carto] Coordonnées hors limites ignorées', [
                            'user_id' => $userId,
                            'room_id' => $roomId,
                            'salon_id' => (int) $salon['id'],
                            'latitude' => $lat,
                            'longitude' => $lon,
                            'source' => $source,
                        ]);
                        continue;
                    }

                    $liveSharing[$userKey]['has_coords'] = true;

                    $updated = $this->db->executeStatement(
                        'UPDATE personnel SET latitude = :lat, longitude = :lon, position_at = NOW() WHERE LOWER("user_id") = LOWER(:uid)',
                        ['lat' => $lat, 'lon' => $lon, 'uid' => $userId]
                    );

                    if ($updated > 0) {
                        $this->logger->info('[carto] Position mise à jour depuis Tchap', [
                            'user_id' => $userId,
                            'room_id' => $roomId,
                            'salon_id' => (int) $salon['id'],
                            'salon_nom' => (string) ($salon['Nom'] ?? ''),
                            'latitude' => $lat,
                            'longitude' => $lon,
                            'rows' => $updated,
                            'source' => $source,
                        ]);
                    } else {
                        $this->logger->warning('[carto] Position reçue mais aucun personnel trouvé pour ce Matrix ID', [
                            'user_id' => $userId,
                            'room_id' => $roomId,
                            'salon_id' => (int) $salon['id'],
                            'salon_nom' => (string) ($salon['Nom'] ?? ''),
                            'latitude' => $lat,
                            'longitude' => $lon,
                            'source' => $source,
                            'known_user_ids' => $this->findCandidateUserIds($userId),
                        ]);
                    }
                }
            } catch (\Throwable) {
                // salon injoignable ou bridge indisponible : non bloquant
                continue;
            }
        }

        foreach ($liveSharing as &$data) {
            $data['salons'] = array_values($data['salons']);
        }

        return $liveSharing;
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
        $globalCfg = $this->config->getTchapConfig();

        foreach ($salons as $salon) {
            $roomId = (string) ($salon['room_id'] ?? '');
            if ($roomId === '') {
                continue;
            }

            try {
                // La carto doit d'abord interroger le bot principal (bridge/Admin),
                // car certains salons sont effectivement gérés par lui même si une
                // unité possède aussi un bot dédié configuré localement.
                $cfg = $globalCfg;
                try {
                    $members = $this->tchap->getMembers($roomId, $cfg);
                } catch (\Throwable) {
                    $cfg = $this->getCfgForRoom($roomId);
                    $members = $this->tchap->getMembers($roomId, $cfg);
                }

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

    private function fetchPositionedPersonnelByPerimeter(array $unitIds): array
    {
        $unitIds = array_values(array_unique(array_map('intval', $unitIds)));
        if (empty($unitIds)) {
            return [];
        }

        $pgIds = '{' . implode(',', $unitIds) . '}';

        return $this->db->fetchAllAssociative(
            'SELECT DISTINCT p.id, p."Nom", p."Prenom", p."Grade", p."Mail", p."Unite", p."Salons_Extra", p."user_id",
                    p.latitude, p.longitude, p.position_at
             FROM personnel p
             WHERE (
                 EXISTS (
                     SELECT 1
                     FROM personnel_unite pu
                     WHERE pu.personnel_id = p.id
                       AND pu.unite_id = ANY(:ids::int[])
                 )
                 OR p."Unite" && :ids::int[]
             )
               AND p.latitude IS NOT NULL
               AND p.longitude IS NOT NULL
             ORDER BY p.position_at DESC',
            ['ids' => $pgIds]
        );
    }

    private function fetchPersonnelByUserIds(array $userIds, ?array $restrictUnitIds = null): array
    {
        $userIds = array_values(array_filter(array_map(
            static fn($id) => strtolower(trim((string) $id)),
            $userIds
        )));
        if (empty($userIds)) {
            return [];
        }

        $params = [];
        $userPh = [];
        foreach ($userIds as $i => $userId) {
            $key = 'u' . $i;
            $userPh[] = ':' . $key;
            $params[$key] = $userId;
        }

        $sql = 'SELECT p.id, p."Nom", p."Prenom", p."Grade", p."Mail", p."Unite", p."Salons_Extra", p."user_id",
                       p.latitude, p.longitude, p.position_at
                FROM personnel p
                WHERE LOWER(p."user_id") IN (' . implode(',', $userPh) . ')';

        if ($restrictUnitIds !== null) {
            $restrictUnitIds = array_values(array_unique(array_map('intval', $restrictUnitIds)));
            if (empty($restrictUnitIds)) {
                return [];
            }

            $idPh = [];
            foreach ($restrictUnitIds as $i => $id) {
                $key = 'id' . $i;
                $idPh[] = ':' . $key;
                $params[$key] = $id;
            }

            $sql .= ' AND (
                EXISTS (
                    SELECT 1
                    FROM personnel_unite pu
                    WHERE pu.personnel_id = p.id
                      AND pu.unite_id IN (' . implode(',', $idPh) . ')
                )
                OR p."Unite" && ARRAY[' . implode(',', $idPh) . ']::int[]
            )';
        }

        $sql .= ' ORDER BY p.position_at DESC NULLS LAST, p."Nom", p."Prenom"';

        return $this->db->fetchAllAssociative($sql, $params);
    }

    private function mergePersonnelRows(array $baseRows, array $extraRows): array
    {
        $merged = [];

        foreach ([$baseRows, $extraRows] as $rows) {
            foreach ($rows as $row) {
                $id = (int) ($row['id'] ?? 0);
                if ($id <= 0 || isset($merged[$id])) {
                    continue;
                }
                $merged[$id] = $row;
            }
        }

        return array_values($merged);
    }

    private function hasRowCoordinates(array $row): bool
    {
        return isset($row['latitude'], $row['longitude'])
            && $row['latitude'] !== null
            && $row['longitude'] !== null;
    }

    private function findCandidateUserIds(string $userId): array
    {
        if (!preg_match('/^@([^:]+):/', $userId, $matches)) {
            return [];
        }

        $localPart = strtolower(trim((string) ($matches[1] ?? '')));
        if ($localPart === '') {
            return [];
        }

        $rows = $this->db->fetchFirstColumn(
            'SELECT "user_id"
             FROM personnel
             WHERE LOWER("user_id") LIKE :needle
             ORDER BY "user_id"
             LIMIT 5',
            ['needle' => '@' . $localPart . ':%']
        );

        return array_values(array_filter(array_map('strval', $rows)));
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
