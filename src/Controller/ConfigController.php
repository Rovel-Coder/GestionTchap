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

class ConfigController extends AbstractController
{
    public function __construct(
        private readonly Connection     $db,
        private readonly ConfigService  $config,
        private readonly RoleService    $roles,
    ) {
    }

    #[Route('/config', name: 'app_config', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user?->isSysAdmin()) {
            throw $this->createAccessDeniedException('Accès réservé aux administrateurs système');
        }

        return $this->render('config/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }

    // GET /api/config/:key  — sysadmin uniquement
    #[Route('/api/config/{key}', name: 'api_config_get', methods: ['GET'])]
    public function get(string $key): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user?->isSysAdmin()) {
            return $this->json(['error' => 'Accès réservé aux administrateurs système'], 403);
        }

        $value = $this->config->get($key);
        return $this->json($value);
    }

    // PUT /api/config/:key  — sysadmin uniquement
    #[Route('/api/config/{key}', name: 'api_config_set', methods: ['PUT'])]
    public function set(string $key, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user?->isSysAdmin()) {
            return $this->json(['error' => 'Accès réservé aux administrateurs système'], 403);
        }

        $value = json_decode($request->getContent(), true);
        $this->config->set($key, $value);

        return $this->json(['ok' => true]);
    }

    // GET /api/health
    #[Route('/api/health', name: 'api_health', methods: ['GET'])]
    public function health(): JsonResponse
    {
        return $this->json(['ok' => true]);
    }
}
