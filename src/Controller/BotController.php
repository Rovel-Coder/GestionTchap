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
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/bots', name: 'api_bots_')]
class BotController extends AbstractController
{
    public function __construct(
        private readonly Connection    $db,
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
        private readonly TchapService  $tchap,
    ) {
    }

    // GET /api/bots
    #[Route('', name: 'list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user || !$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $rows = $this->db->fetchAllAssociative(
            'SELECT id, name, user_id, is_principal, homeserver, access_token, created_at FROM bots ORDER BY is_principal DESC, id ASC'
        );

        return $this->json(array_map($this->formatBot(...), $rows));
    }

    // POST /api/bots
    #[Route('', name: 'create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user || !$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $data        = json_decode($request->getContent(), true) ?? [];
        $name        = trim($data['name'] ?? '');
        $userId      = trim($data['userId'] ?? '');
        $isPrincipal = (bool) ($data['isPrincipal'] ?? false);
        $homeserver  = trim($data['homeserver'] ?? '');

        if (!$name || !$userId) {
            return $this->json(['error' => 'Nom et userId requis'], 400);
        }

        if ($isPrincipal) {
            $this->db->executeStatement('UPDATE bots SET is_principal = false WHERE is_principal = true');
        }

        $this->db->executeStatement(
            'INSERT INTO bots (name, user_id, is_principal, homeserver) VALUES (:name, :uid, ' . ($isPrincipal ? 'true' : 'false') . ', :hs)',
            ['name' => $name, 'uid' => $userId, 'hs' => $homeserver]
        );
        $id  = (int) $this->db->lastInsertId();
        $row = $this->db->fetchAssociative('SELECT * FROM bots WHERE id = :id', ['id' => $id]);

        return $this->json($this->formatBot($row), 201);
    }

    // PUT /api/bots/{id}
    #[Route('/{id}', name: 'update', methods: ['PUT'])]
    public function update(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user || !$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $bot = $this->db->fetchAssociative('SELECT id FROM bots WHERE id = :id', ['id' => $id]);
        if (!$bot) {
            return $this->json(['error' => 'Bot introuvable'], 404);
        }

        $data        = json_decode($request->getContent(), true) ?? [];
        $name        = trim($data['name'] ?? '');
        $userId      = trim($data['userId'] ?? '');
        $isPrincipal = (bool) ($data['isPrincipal'] ?? false);
        $homeserver  = trim($data['homeserver'] ?? '');

        if (!$name || !$userId) {
            return $this->json(['error' => 'Nom et userId requis'], 400);
        }

        if ($isPrincipal) {
            $this->db->executeStatement('UPDATE bots SET is_principal = false WHERE is_principal = true AND id != :id', ['id' => $id]);
        }

        $this->db->executeStatement(
            'UPDATE bots SET name = :name, user_id = :uid, is_principal = ' . ($isPrincipal ? 'true' : 'false') . ', homeserver = :hs WHERE id = :id',
            ['name' => $name, 'uid' => $userId, 'hs' => $homeserver, 'id' => $id]
        );

        $row = $this->db->fetchAssociative('SELECT * FROM bots WHERE id = :id', ['id' => $id]);

        return $this->json($this->formatBot($row));
    }

    // DELETE /api/bots/{id}
    #[Route('/{id}', name: 'delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user || !$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $bot = $this->db->fetchAssociative('SELECT id FROM bots WHERE id = :id', ['id' => $id]);
        if (!$bot) {
            return $this->json(['error' => 'Bot introuvable'], 404);
        }

        $this->db->executeStatement('UPDATE unites SET bot_id = NULL WHERE bot_id = :id', ['id' => $id]);
        $this->db->executeStatement('DELETE FROM bots WHERE id = :id', ['id' => $id]);

        return $this->json(['ok' => true]);
    }

    // POST /api/bots/{id}/login
    #[Route('/{id}/login', name: 'login', methods: ['POST'])]
    public function login(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user || !$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $bot = $this->db->fetchAssociative('SELECT * FROM bots WHERE id = :id', ['id' => $id]);
        if (!$bot) {
            return $this->json(['error' => 'Bot introuvable'], 404);
        }

        $data     = json_decode($request->getContent(), true) ?? [];
        $password = $data['password'] ?? '';

        if (!$password) {
            return $this->json(['error' => 'Mot de passe requis'], 400);
        }

        $hs = $bot['homeserver'] ?: $this->config->getTchapConfig()['homeserver'];

        try {
            if ($bot['is_principal']) {
                // Bot principal : passe par le bridge (gère E2EE + redémarrage)
                $result = $this->tchap->loginWithPassword($hs, $bot['user_id'], $password);
                // Mettre à jour tchap_config pour la compatibilité bridge
                $cfg              = $this->config->getTchapConfig();
                $cfg['homeserver'] = $hs;
                $cfg['token']     = $result['access_token'];
                $cfg['botUserId'] = $result['user_id'] ?? $bot['user_id'];
                $cfg['enabled']   = true;
                $this->config->set('tchap_config', $cfg);
            } else {
                // Bot secondaire : login direct (bypass bridge)
                $result = $this->tchap->loginDirect($hs, $bot['user_id'], $password);
            }

            $this->db->executeStatement(
                'UPDATE bots SET access_token = :token, user_id = :uid WHERE id = :id',
                ['token' => $result['access_token'], 'uid' => $result['user_id'] ?? $bot['user_id'], 'id' => $id]
            );

            return $this->json(['ok' => true, 'userId' => $result['user_id'] ?? $bot['user_id']]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/bots/{id}/logout
    #[Route('/{id}/logout', name: 'logout', methods: ['POST'])]
    public function logout(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user || !$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $bot = $this->db->fetchAssociative('SELECT id, is_principal FROM bots WHERE id = :id', ['id' => $id]);
        if (!$bot) {
            return $this->json(['error' => 'Bot introuvable'], 404);
        }

        $this->db->executeStatement("UPDATE bots SET access_token = '' WHERE id = :id", ['id' => $id]);

        if ($bot['is_principal']) {
            $cfg            = $this->config->getTchapConfig();
            $cfg['token']   = '';
            $cfg['enabled'] = false;
            $this->config->set('tchap_config', $cfg);
        }

        return $this->json(['ok' => true]);
    }

    private function formatBot(array $row): array
    {
        return [
            'id'          => (int) $row['id'],
            'name'        => $row['name'],
            'userId'      => $row['user_id'],
            'isPrincipal' => (bool) $row['is_principal'],
            'connected'   => !empty($row['access_token']),
            'homeserver'  => $row['homeserver'] ?? '',
        ];
    }
}
