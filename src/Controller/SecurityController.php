<?php

namespace App\Controller;

use App\Security\AppUser;
use App\Service\RoleService;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Authentication\AuthenticationUtils;

class SecurityController extends AbstractController
{
    public function __construct(
        private readonly Connection                  $db,
        private readonly UserPasswordHasherInterface $hasher,
        private readonly RoleService                 $roles,
    ) {
    }

    #[Route('/login', name: 'app_login', methods: ['GET', 'POST'])]
    public function login(AuthenticationUtils $authUtils): Response
    {
        if ($this->getUser()) {
            return $this->redirectToRoute('app_home');
        }

        return $this->render('security/login.html.twig', [
            'last_username' => $authUtils->getLastUsername(),
            'error'         => $authUtils->getLastAuthenticationError(),
        ]);
    }

    #[Route('/register', name: 'app_register', methods: ['GET', 'POST'])]
    public function register(Request $request): Response
    {
        if ($this->getUser()) {
            return $this->redirectToRoute('app_home');
        }

        $count = (int) $this->db->fetchOne('SELECT COUNT(*) FROM personnel');

        // Mode bootstrap : aucun personnel → créer le premier administrateur
        if ($count === 0) {
            return $this->handleBootstrap($request);
        }

        // Mode inscription libre : le membre doit exister dans le personnel sans compte
        $error = null;

        if ($request->isMethod('POST')) {
            if (!$this->isCsrfTokenValid('register', $request->request->get('_csrf_token', ''))) {
                $error = 'Token invalide. Rechargez la page.';
            } else {
                $email   = trim($request->request->get('email', ''));
                $pass    = $request->request->get('password', '');
                $confirm = $request->request->get('confirm', '');

                if (!$email || !$pass) {
                    $error = 'Email et mot de passe requis';
                } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $error = 'Adresse email invalide';
                } elseif (strlen($pass) < 8) {
                    $error = 'Mot de passe trop court (8 caractères min)';
                } elseif ($pass !== $confirm) {
                    $error = 'Les mots de passe ne correspondent pas';
                } else {
                    $row = $this->db->fetchAssociative(
                        'SELECT id, password_hash FROM personnel WHERE LOWER("Mail") = LOWER(:mail)',
                        ['mail' => $email]
                    );

                    if (!$row) {
                        $error = 'Cette adresse email ne figure pas dans le personnel. Contactez un administrateur.';
                    } elseif (!empty($row['password_hash'])) {
                        $error = 'Un compte existe déjà pour cette adresse. Connectez-vous directement.';
                    } else {
                        $tempUser = new AppUser(0, $email, '', ['ROLE_USER'], false, 'lecteur');
                        $hash     = $this->hasher->hashPassword($tempUser, $pass);

                        $this->db->executeStatement(
                            'UPDATE personnel SET password_hash = :hash WHERE id = :id',
                            ['hash' => $hash, 'id' => $row['id']]
                        );

                        $this->addFlash('success', 'Compte activé. Vous pouvez vous connecter.');
                        return $this->redirectToRoute('app_login');
                    }
                }
            }
        }

        return $this->render('security/register.html.twig', [
            'mode'  => 'register',
            'error' => $error,
        ]);
    }

    private function handleBootstrap(Request $request): Response
    {
        $error = null;

        if ($request->isMethod('POST')) {
            $email   = trim($request->request->get('email', ''));
            $pass    = $request->request->get('password', '');
            $confirm = $request->request->get('confirm', '');
            $nom     = trim($request->request->get('nom', ''));
            $prenom  = trim($request->request->get('prenom', ''));

            if (!$email || !$pass) {
                $error = 'Email et mot de passe requis';
            } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $error = 'Adresse email invalide';
            } elseif (strlen($pass) < 8) {
                $error = 'Mot de passe trop court (8 caractères min)';
            } elseif ($pass !== $confirm) {
                $error = 'Les mots de passe ne correspondent pas';
            } else {
                $tempUser = new AppUser(0, $email, '', ['ROLE_ADMIN'], false, 'admin');
                $hash     = $this->hasher->hashPassword($tempUser, $pass);

                $this->db->insert('personnel', [
                    '"Mail"'        => $email,
                    '"Nom"'         => strtoupper($nom),
                    '"Prenom"'      => $prenom,
                    '"Role"'        => 'admin',
                    '"Statut"'      => 'actif',
                    'password_hash' => $hash,
                ]);

                $this->addFlash('success', 'Compte administrateur créé. Vous pouvez vous connecter.');
                return $this->redirectToRoute('app_login');
            }
        }

        return $this->render('security/register.html.twig', [
            'mode'  => 'bootstrap',
            'error' => $error,
        ]);
    }

    // POST /api/auth/change-password
    #[Route('/api/auth/change-password', name: 'api_auth_change_password', methods: ['POST'])]
    public function changePassword(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user) {
            return $this->json(['error' => 'Non authentifié'], 401);
        }

        $data            = json_decode($request->getContent(), true) ?? [];
        $currentPassword = $data['currentPassword'] ?? '';
        $newPassword     = $data['newPassword'] ?? '';

        if (!$currentPassword || !$newPassword) {
            return $this->json(['error' => 'Champs requis'], 400);
        }
        if (strlen($newPassword) < 8) {
            return $this->json(['error' => 'Nouveau mot de passe trop court (8 caractères min)'], 400);
        }
        if (!$this->hasher->isPasswordValid($user, $currentPassword)) {
            return $this->json(['error' => 'Mot de passe actuel incorrect'], 401);
        }

        $hash = $this->hasher->hashPassword($user, $newPassword);

        if ($user->isSysAdmin()) {
            $this->db->executeStatement(
                'UPDATE system_admins SET password_hash = :hash WHERE id = :id',
                ['hash' => $hash, 'id' => $user->getId()]
            );
        } else {
            $this->db->executeStatement(
                'UPDATE personnel SET password_hash = :hash WHERE id = :id',
                ['hash' => $hash, 'id' => $user->getPersonnelId()]
            );
        }

        return $this->json(['ok' => true]);
    }

    // GET /api/auth/me
    #[Route('/api/auth/me', name: 'api_auth_me', methods: ['GET'])]
    public function me(): JsonResponse
    {
        /** @var AppUser|null $user */
        $user = $this->getUser();
        if (!$user) {
            return $this->json(['error' => 'Non authentifié'], 401);
        }

        return $this->json($user->toArray());
    }

    // GET /api/auth/is-first-user
    #[Route('/api/auth/is-first-user', name: 'api_auth_is_first_user', methods: ['GET'])]
    public function isFirstUser(): JsonResponse
    {
        $count = $this->db->fetchOne('SELECT COUNT(*) FROM personnel');
        return $this->json(['isFirstUser' => (int) $count === 0]);
    }

    // GET /api/auth/sysadmins
    #[Route('/api/auth/sysadmins', name: 'api_sysadmins_list', methods: ['GET'])]
    public function listSysAdmins(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user?->isSysAdmin()) {
            return $this->json(['error' => 'Accès réservé aux administrateurs système'], 403);
        }

        $rows = $this->db->fetchAllAssociative(
            'SELECT id, username, created_at FROM system_admins ORDER BY id'
        );

        return $this->json($rows);
    }

    // POST /api/auth/sysadmins
    #[Route('/api/auth/sysadmins', name: 'api_sysadmins_create', methods: ['POST'])]
    public function createSysAdmin(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user?->isSysAdmin()) {
            return $this->json(['error' => 'Accès réservé aux administrateurs système'], 403);
        }

        $data     = json_decode($request->getContent(), true) ?? [];
        $username = trim($data['username'] ?? '');
        $password = $data['password'] ?? '';

        if (!$username || !$password) {
            return $this->json(['error' => 'Identifiant et mot de passe requis'], 400);
        }
        if (strlen($username) > 100) {
            return $this->json(['error' => 'Identifiant invalide'], 400);
        }
        if (strlen($password) < 8) {
            return $this->json(['error' => 'Mot de passe trop court (8 caractères min)'], 400);
        }

        $tempUser = new AppUser(0, $username, '', ['ROLE_SYSADMIN'], true, 'sysadmin');
        $hash     = $this->hasher->hashPassword($tempUser, $password);

        try {
            $this->db->insert('system_admins', ['username' => $username, 'password_hash' => $hash]);
            $id  = (int) $this->db->lastInsertId();
            $row = $this->db->fetchAssociative(
                'SELECT id, username, created_at FROM system_admins WHERE id = :id',
                ['id' => $id]
            );
            return $this->json($row, 201);
        } catch (\Exception $e) {
            if (str_contains($e->getMessage(), '23505') || str_contains($e->getMessage(), 'unique')) {
                return $this->json(['error' => 'Cet identifiant existe déjà'], 409);
            }
            return $this->json(['error' => 'Erreur serveur'], 500);
        }
    }

    // POST /api/auth/sysadmins/{id}/reset-password
    #[Route('/api/auth/sysadmins/{id}/reset-password', name: 'api_sysadmins_reset_password', methods: ['POST'])]
    public function resetSysAdminPassword(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user?->isSysAdmin()) {
            return $this->json(['error' => 'Accès réservé aux administrateurs système'], 403);
        }

        $data     = json_decode($request->getContent(), true) ?? [];
        $password = $data['password'] ?? '';

        if (strlen($password) < 8) {
            return $this->json(['error' => 'Mot de passe trop court (8 caractères min)'], 400);
        }

        $tempUser = new AppUser(0, '', '', ['ROLE_SYSADMIN'], true, 'sysadmin');
        $hash     = $this->hasher->hashPassword($tempUser, $password);

        $count = $this->db->executeStatement(
            'UPDATE system_admins SET password_hash = :hash WHERE id = :id',
            ['hash' => $hash, 'id' => $id]
        );

        if (!$count) {
            return $this->json(['error' => 'Admin système introuvable'], 404);
        }

        return $this->json(['ok' => true]);
    }

    // GET /api/auth/locked-users  (admin + sysadmin)
    #[Route('/api/auth/locked-users', name: 'api_auth_locked_users', methods: ['GET'])]
    public function lockedUsers(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user || !$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $rows = $this->db->fetchAllAssociative(
            'SELECT identifier, attempts, locked_at, last_attempt_at
             FROM login_locks
             WHERE locked_at IS NOT NULL
             ORDER BY locked_at DESC'
        );

        return $this->json($rows);
    }

    // POST /api/auth/locked-users/{identifier}/unlock  (admin + sysadmin)
    #[Route('/api/auth/locked-users/{identifier}/unlock', name: 'api_auth_unlock', methods: ['POST'])]
    public function unlock(string $identifier): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user || !$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $this->db->executeStatement(
            'DELETE FROM login_locks WHERE LOWER(identifier) = LOWER(:id)',
            ['id' => $identifier]
        );

        return $this->json(['ok' => true]);
    }

    // DELETE /api/auth/sysadmins/{id}
    #[Route('/api/auth/sysadmins/{id}', name: 'api_sysadmins_delete', methods: ['DELETE'])]
    public function deleteSysAdmin(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user?->isSysAdmin()) {
            return $this->json(['error' => 'Accès réservé aux administrateurs système'], 403);
        }

        $row = $this->db->fetchAssociative(
            'SELECT username FROM system_admins WHERE id = :id',
            ['id' => $id]
        );

        if (!$row) {
            return $this->json(['error' => 'Admin système introuvable'], 404);
        }
        if ($row['username'] === 'Sic') {
            return $this->json(['error' => 'Le compte Sic ne peut pas être supprimé'], 403);
        }

        $this->db->executeStatement('DELETE FROM system_admins WHERE id = :id', ['id' => $id]);

        return $this->json(['ok' => true]);
    }
}
