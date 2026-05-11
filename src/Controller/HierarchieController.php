<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\ConfigService;
use App\Service\RoleService;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class HierarchieController extends AbstractController
{
    public function __construct(
        private readonly Connection    $db,
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
    ) {}

    #[Route('/hierarchie', name: 'app_hierarchie', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            throw $this->createAccessDeniedException('Accès réservé aux administrateurs');
        }

        return $this->render('hierarchie/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }
}
