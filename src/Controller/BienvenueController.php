<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\ConfigService;
use App\Service\RoleService;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class BienvenueController extends AbstractController
{
    public function __construct(
        private readonly Connection    $db,
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
    ) {
    }

    #[Route('/bienvenue', name: 'app_bienvenue', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();

        if (!$this->roles->canManage($user)) {
            return $this->redirectToRoute('app_mon_profil');
        }

        $stats = [
            'agents'  => (int) $this->db->fetchOne('SELECT COUNT(*) FROM personnel'),
            'salons'  => (int) $this->db->fetchOne('SELECT COUNT(*) FROM salons'),
            'unites'  => (int) $this->db->fetchOne('SELECT COUNT(*) FROM unites'),
            'espaces' => (int) $this->db->fetchOne('SELECT COUNT(*) FROM espaces'),
        ];

        return $this->render('bienvenue/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
            'stats'       => $stats,
        ]);
    }
}
