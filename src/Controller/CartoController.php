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
        $rows = $this->db->fetchAllAssociative(
            'SELECT id, "Nom", "Prenom", "Grade", "Unite", "Salons_Extra", "user_id",
                    latitude, longitude, position_at
             FROM personnel
             WHERE latitude IS NOT NULL AND longitude IS NOT NULL
             ORDER BY position_at DESC'
        );

        foreach ($rows as &$row) {
            $row['Unite'] = $row['Unite'] ? json_decode($row['Unite'], true) : [];
            $row['Salons_Extra'] = $row['Salons_Extra'] ? json_decode($row['Salons_Extra'], true) : [];
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
}
