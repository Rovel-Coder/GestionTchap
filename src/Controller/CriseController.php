<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\ConfigService;
use App\Service\RoleService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class CriseController extends AbstractController
{
    public function __construct(
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
    ) {
    }

    #[Route('/crise', name: 'app_crise', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canCrise($user)) {
            throw $this->createAccessDeniedException('Accès réservé aux superviseurs de crise');
        }

        return $this->render('crise/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }

    #[Route('/suivi-crise', name: 'app_suivi_crise', methods: ['GET'])]
    public function suiviPage(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canCrise($user)) {
            throw $this->createAccessDeniedException('Accès réservé aux superviseurs de crise');
        }

        return $this->render('crise/suivi.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }
}
