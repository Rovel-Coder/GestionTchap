<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\ConfigService;
use App\Service\RoleService;
use App\Service\TchapService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class CartoController extends AbstractController
{
    public function __construct(
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
        private readonly TchapService  $tchap,
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
            throw $this->createAccessDeniedException('Accès à la cartographie non autorisé');
        }

        $tchapCfg = $this->config->getTchapConfig();

        return $this->render('carto/index.html.twig', [
            'user'            => $user->toArray(),
            'permissions'     => $this->roles->getPermissionsArray($user),
            'uiConfig'        => $uiConfig,
            'tchapHomeserver' => $tchapCfg['homeserver'] ?? '',
        ]);
    }
}
