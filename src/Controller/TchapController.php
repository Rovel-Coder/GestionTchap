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

#[Route('/api/tchap', name: 'api_tchap_')]
class TchapController extends AbstractController
{
    public function __construct(
        private readonly TchapService  $tchap,
        private readonly ConfigService $config,
        private readonly RoleService   $roles,
        private readonly Connection    $db,
        private readonly string        $projectDir = '',
    ) {
    }

    // GET /api/tchap/whoami
    #[Route('/whoami', name: 'whoami', methods: ['GET'])]
    public function whoami(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        try {
            $cfg    = $this->config->getTchapConfig();
            $result = $this->tchap->whoami($cfg);
            return $this->json($result);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/login  — connexion du bot par identifiants
    #[Route('/login', name: 'login', methods: ['POST'])]
    public function login(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user?->isSysAdmin()) {
            return $this->json(['error' => 'Accès réservé aux administrateurs système'], 403);
        }

        $data       = json_decode($request->getContent(), true) ?? [];
        $homeserver = trim($data['homeserver'] ?? '');
        $username   = trim($data['username'] ?? '');
        $password   = $data['password'] ?? '';

        if (!$homeserver || !$username || !$password) {
            return $this->json(['error' => 'homeserver, username et password requis'], 400);
        }

        try {
            $result = $this->tchap->loginWithPassword($homeserver, $username, $password);

            // Sauvegarder le token (sans le mot de passe)
            $cfg = $this->config->getTchapConfig();
            $cfg['homeserver'] = $homeserver;
            $cfg['token']      = $result['access_token'];
            $cfg['botUserId']  = $result['user_id'];
            $cfg['enabled']    = true;
            $this->config->set('tchap_config', $cfg);

            return $this->json([
                'ok'       => true,
                'userId'   => $result['user_id'],
                'deviceId' => $result['device_id'] ?? null,
            ]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // ── Routes E2EE ───────────────────────────────────────────────────────────
    // Dans l'architecture PHP+bridge, E2EE est géré automatiquement par le
    // service Node.js (RustSdkCryptoStorageProvider démarre avec le bot).
    // Ces routes exposent l'état du bridge et permettent un reset si nécessaire.

    // POST /api/tchap/e2ee/start — vérifie l'état E2EE du bridge
    #[Route('/e2ee/start', name: 'e2ee_start', methods: ['POST'])]
    public function e2eeStart(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $health = $this->tchap->bridgeHealth();
        if ($health['ready'] ?? false) {
            return $this->json(['phase' => 'ready', 'userId' => $health['userId'] ?? null, 'e2ee' => true]);
        }
        return $this->json(['error' => $health['reason'] ?? 'Bridge non prêt — configurez le bot via Se connecter'], 503);
    }

    // POST /api/tchap/e2ee/stop — arrêt non supporté (E2EE auto-géré par le bridge)
    #[Route('/e2ee/stop', name: 'e2ee_stop', methods: ['POST'])]
    public function e2eeStop(): JsonResponse
    {
        return $this->json(['error' => 'E2EE est géré automatiquement par le bridge. Pour l\'arrêter, arrêtez le service tchap-bridge.'], 400);
    }

    // POST /api/tchap/e2ee/reset-keys — réinitialise le store crypto du bridge
    #[Route('/e2ee/reset-keys', name: 'e2ee_reset_keys', methods: ['POST'])]
    public function e2eeResetKeys(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        return $this->json([
            'error' => 'La réinitialisation des clés nécessite de supprimer manuellement le volume tchap_data et de relancer le bridge : docker compose down tchap-bridge && docker volume rm <projet>_tchap_data && docker compose up -d tchap-bridge',
        ], 400);
    }

    // POST /api/tchap/e2ee/import-keys — import d'un export Megolm (-----BEGIN MEGOLM SESSION DATA-----)
    #[Route('/e2ee/import-keys', name: 'e2ee_import_keys', methods: ['POST'])]
    public function e2eeImportKeys(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }

        $data       = json_decode($request->getContent(), true) ?? [];
        $keys       = trim($data['keys']       ?? '');
        $passphrase = $data['passphrase'] ?? '';

        if (!$keys || !$passphrase) {
            return $this->json(['error' => 'keys (contenu du fichier) et passphrase requis'], 400);
        }

        if (!str_contains($keys, 'BEGIN MEGOLM SESSION DATA')) {
            return $this->json(['error' => 'Format invalide — le fichier doit commencer par -----BEGIN MEGOLM SESSION DATA-----'], 400);
        }

        try {
            $result = $this->tchap->callBridge('POST', '/import-keys', [
                'keys'       => $keys,
                'passphrase' => $passphrase,
            ]);
            return $this->json($result);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // GET /api/tchap/e2ee/verif-status — état courant de la vérification SAS dans le bridge
    #[Route('/e2ee/verif-status', name: 'e2ee_verif_status', methods: ['GET'])]
    public function e2eeVerifStatus(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }
        try {
            return $this->json($this->tchap->callBridge('GET', '/verif'));
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/e2ee/verif-accept — le bridge auto-accepte ; cette route retourne l'état courant
    #[Route('/e2ee/verif-accept', name: 'e2ee_verif_accept', methods: ['POST'])]
    public function e2eeVerifAccept(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }
        try {
            $status = $this->tchap->callBridge('GET', '/verif');
            $phase  = $status['phase'] ?? 'idle';
            if ($phase === 'idle') {
                return $this->json(['error' => 'Aucune demande de vérification en cours. Initiez la vérification depuis Tchap.'], 400);
            }
            return $this->json([
                'phase'  => $phase,
                'emoji'  => $status['emoji']  ?? [],
                'userId' => $status['userId'] ?? null,
            ]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/e2ee/verif-confirm — confirmer que les emojis correspondent
    #[Route('/e2ee/verif-confirm', name: 'e2ee_verif_confirm', methods: ['POST'])]
    public function e2eeVerifConfirm(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }
        try {
            $this->tchap->callBridge('POST', '/verif/confirm');
            return $this->json(['ok' => true]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/e2ee/verif-cancel — annuler la vérification (ou emojis ne correspondent pas)
    #[Route('/e2ee/verif-cancel',   name: 'e2ee_verif_cancel',   methods: ['POST'])]
    #[Route('/e2ee/verif-mismatch', name: 'e2ee_verif_mismatch', methods: ['POST'])]
    public function e2eeVerifCancel(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }
        try {
            $this->tchap->callBridge('POST', '/verif/cancel');
            return $this->json(['ok' => true]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/e2ee/verif-security-key — vérifier le device via la clé de sécurité SSSS
    #[Route('/e2ee/verif-security-key', name: 'e2ee_verif_security_key', methods: ['POST'])]
    public function e2eeVerifSecurityKey(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canAdmin($user)) {
            return $this->json(['error' => 'Accès réservé aux administrateurs'], 403);
        }
        $body = json_decode($request->getContent(), true) ?? [];
        $key  = trim($body['key'] ?? '');
        if (!$key) {
            return $this->json(['error' => 'Clé de sécurité manquante'], 400);
        }
        try {
            $this->tchap->callBridge('POST', '/verif/security-key', ['key' => $key]);
            return $this->json(['ok' => true]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // GET /api/tchap/profile/{userId} — profil Matrix (displayname, avatar_url)
    #[Route('/profile/{userId}', name: 'profile', methods: ['GET'], requirements: ['userId' => '.+'])]
    public function profile(string $userId): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        try {
            $cfg    = $this->config->getTchapConfig();
            $result = $this->tchap->getProfile($userId, $cfg);
            return $this->json($result);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // GET /api/tchap/members/{roomId}
    #[Route('/members/{roomId}', name: 'members', methods: ['GET'], requirements: ['roomId' => '.+'])]
    public function members(string $roomId): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès réservé aux gestionnaires'], 403);
        }

        try {
            $cfg     = $this->getCfgForRoom($roomId);
            $members = $this->tchap->getMembers($roomId, $cfg);
            return $this->json([
                'members'   => $members,
                'botUserId' => $cfg['botUserId'] ?? '',
            ]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/invite
    #[Route('/invite', name: 'invite', methods: ['POST'])]
    public function invite(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $roomId = trim($data['roomId'] ?? '');
        $userId = trim($data['userId'] ?? '');

        if (!$roomId || !$userId) {
            return $this->json(['error' => 'roomId et userId requis'], 400);
        }

        if (!preg_match('/^@[^@:]+:[^@:]+/', $userId)) {
            return $this->json(['error' => "userId invalide « $userId » — doit être au format @utilisateur:homeserver"], 400);
        }

        try {
            $cfg    = $this->config->getTchapConfig();
            $result = $this->tchap->invite($roomId, $userId, $cfg);
            return $this->json($result);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/kick
    #[Route('/kick', name: 'kick', methods: ['POST'])]
    public function kick(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $roomId = $data['roomId'] ?? '';
        $userId = $data['userId'] ?? '';
        $reason = $data['reason'] ?? 'Gestion automatique';

        if (!$roomId || !$userId) {
            return $this->json(['error' => 'roomId et userId requis'], 400);
        }

        try {
            $cfg    = $this->config->getTchapConfig();
            $result = $this->tchap->kick($roomId, $userId, $reason, $cfg);
            return $this->json($result);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/kick-all  — expulse tous les membres non-bot d'un salon
    // Paramètre optionnel : kickBot (bool, défaut true) — si false, le bot ne quitte pas le salon
    #[Route('/kick-all', name: 'kick_all', methods: ['POST'])]
    public function kickAll(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        $data    = json_decode($request->getContent(), true) ?? [];
        $roomId  = trim($data['roomId'] ?? '');
        $kickBot = $data['kickBot'] ?? true;

        if (!$roomId) {
            return $this->json(['error' => 'roomId requis'], 400);
        }

        try {
            $cfg   = $this->getCfgForRoom($roomId);
            $botId = strtolower($cfg['botUserId'] ?? '');

            $members = $this->tchap->getMembers($roomId, $cfg);
            $kicked  = 0;
            $errors  = [];

            foreach ($members as $member) {
                $mid = trim($member['state_key'] ?? '');
                if (!$mid || !str_starts_with($mid, '@') || !str_contains($mid, ':')) {
                    continue;
                }
                if (strtolower($mid) === $botId) {
                    continue;
                }
                try {
                    $this->tchap->kick($roomId, $mid, 'Fermeture du salon', $cfg);
                    $kicked++;
                } catch (\Throwable $e) {
                    $errors[] = ['user' => $mid, 'error' => $e->getMessage()];
                }
            }

            // Le bot quitte le salon en dernier (un bot ne peut pas se kicker lui-même)
            if ($kickBot) {
                try {
                    $this->tchap->leaveRoom($roomId, $cfg);
                } catch (\Throwable $e) {
                    $errors[] = ['user' => $cfg['botUserId'] ?? 'bot', 'error' => 'Départ du bot : ' . $e->getMessage()];
                }
            }

            return $this->json(['ok' => true, 'kicked' => $kicked, 'botKicked' => (bool) $kickBot, 'errors' => $errors]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/bot-leave  — fait quitter le bot d'un salon
    #[Route('/bot-leave', name: 'bot_leave', methods: ['POST'])]
    public function botLeave(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $roomId = trim($data['roomId'] ?? '');

        if (!$roomId) {
            return $this->json(['error' => 'roomId requis'], 400);
        }

        try {
            $cfg = $this->getCfgForRoom($roomId);
            $this->tchap->leaveRoom($roomId, $cfg);
            return $this->json(['ok' => true]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/sync-all  — sync complète : Tchap → DB
    #[Route('/sync-all', name: 'sync_all', methods: ['POST'])]
    public function syncAll(): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        try {
            $cfg     = $this->config->getTchapConfig();
            $salons  = $this->db->fetchAllAssociative('SELECT * FROM salons WHERE "room_id" != \'\'');
            $updated = 0;
            $errors  = [];

            foreach ($salons as $salon) {
                try {
                    $members = $this->tchap->getMembers($salon['room_id'], $cfg);
                    $memberIds = array_column($members, 'state_key');

                    // Pour chaque membre Tchap, chercher le personnel correspondant
                    foreach ($memberIds as $matrixId) {
                        if ($matrixId === $cfg['botUserId']) {
                            continue;
                        }

                        // Chercher le personnel par user_id
                        $agent = $this->db->fetchAssociative(
                            'SELECT * FROM personnel WHERE LOWER("user_id") = LOWER(:uid)',
                            ['uid' => $matrixId]
                        );

                        if ($agent) {
                            $current = $this->pgArrayToPhp($agent['Salons_Extra'] ?? '{}');
                            if (!in_array((int) $salon['id'], $current, true)) {
                                $current[] = (int) $salon['id'];
                                $this->db->executeStatement(
                                    'UPDATE personnel SET "Salons_Extra" = :val WHERE id = :id',
                                    ['val' => $this->arrayToPg($current), 'id' => $agent['id']]
                                );
                                $updated++;
                            }
                        }
                    }
                } catch (\Throwable $e) {
                    $errors[] = ['salon' => $salon['Nom'], 'error' => $e->getMessage()];
                }
            }

            return $this->json(['ok' => true, 'updated' => $updated, 'errors' => $errors]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /api/tchap/sync/start  — démarre une sync en arrière-plan et retourne un jobId
    #[Route('/sync/start', name: 'sync_start', methods: ['POST'])]
    public function syncStart(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        $data     = json_decode($request->getContent(), true) ?? [];
        $salonIds = array_map('intval', $data['salonIds'] ?? []);
        $agentIds = array_map('intval', $data['agentIds'] ?? []);

        if (empty($salonIds)) {
            return $this->json(['error' => 'salonIds requis'], 400);
        }

        $jobId  = uniqid('sync_', true);
        $params = json_encode(['salonIds' => $salonIds, 'agentIds' => $agentIds], JSON_UNESCAPED_UNICODE);

        $this->db->executeStatement(
            "INSERT INTO sync_jobs (id, status, total, params) VALUES (?, 'pending', ?, ?)",
            [$jobId, count($salonIds), $params]
        );

        $projectDir = $this->projectDir ?: dirname(__DIR__, 2);
        $cmd        = PHP_BINARY . ' ' . $projectDir . '/bin/console app:sync-tchap ' . escapeshellarg($jobId) . ' > /dev/null 2>&1 &';
        exec($cmd);

        return $this->json(['ok' => true, 'jobId' => $jobId]);
    }

    // GET /api/tchap/sync/progress/{jobId}  — état courant d'un job de sync
    #[Route('/sync/progress/{jobId}', name: 'sync_progress', methods: ['GET'])]
    public function syncProgress(string $jobId): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        $job = $this->db->fetchAssociative(
            'SELECT * FROM sync_jobs WHERE id = :id',
            ['id' => $jobId]
        );

        if (!$job) {
            return $this->json(['error' => 'Job introuvable'], 404);
        }

        // Décoder les champs JSON stockés sous forme de texte
        $job['errors'] = json_decode($job['errors'] ?? '[]', true) ?? [];
        $job['params'] = json_decode($job['params'] ?? '{}', true) ?? [];

        return $this->json($job);
    }

    // POST /api/tchap/apply  — sync DB → Tchap (invite/kick)
    #[Route('/apply', name: 'apply', methods: ['POST'])]
    public function apply(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        $data      = json_decode($request->getContent(), true) ?? [];
        $salonIds  = array_map('intval', $data['salonIds'] ?? []);
        $agentIds  = array_map('intval', $data['agentIds'] ?? []);

        if (empty($salonIds)) {
            return $this->json(['error' => 'salonIds requis'], 400);
        }

        try {
            $globalCfg = $this->config->getTchapConfig();
            $invited    = 0;
            $kicked     = 0;
            $reinvited  = 0;
            $errors     = [];

            // Charger les agents concernés
            $salonPh = implode(',', array_fill(0, count($salonIds), '?'));
            $salons = $this->db->fetchAllAssociative(
                "SELECT * FROM salons WHERE id IN ($salonPh)",
                $salonIds
            );

            if (empty($agentIds)) {
                $agents = $this->db->fetchAllAssociative('SELECT * FROM personnel');
            } else {
                $agentPh = implode(',', array_fill(0, count($agentIds), '?'));
                $agents  = $this->db->fetchAllAssociative(
                    "SELECT * FROM personnel WHERE id IN ($agentPh)",
                    $agentIds
                );
            }

            $unites   = $this->db->fetchAllAssociative('SELECT * FROM unites');
            $uniteMap = array_column($unites, null, 'id');

            // Construire une map salonId → cfg du bot dédié de l'unité (si configuré)
            $salonBotCfg = [];
            foreach ($unites as $unite) {
                $hasDedicatedBot = !empty($unite['bot_id'])
                    || (!empty($unite['bot_access_token']) && !empty($unite['bot_user_id']));
                if (!$hasDedicatedBot) {
                    continue;
                }
                $uniteSalons = $this->pgArrayToPhp($unite['Salons'] ?? '{}');
                $uniteCfg    = $this->resolveBotCfg($unite, $globalCfg);
                foreach ($uniteSalons as $sid) {
                    $salonBotCfg[(int) $sid] = $salonBotCfg[(int) $sid] ?? $uniteCfg;
                }
            }

            $cfg = $globalCfg; // sera surchargé par salon si bot dédié

            // Mode sélection manuelle (crise) : agentIds fournis → tous les agents
            // sélectionnés sont attendus dans tous les salons sélectionnés,
            // sans passer par getExpectedSalons().
            $manualMode = !empty($agentIds);

            foreach ($salons as $salon) {
                if (!$salon['room_id']) {
                    continue;
                }

                // Utiliser le bot dédié de l'unité si ce salon en possède un
                $cfg = $salonBotCfg[(int) $salon['id']] ?? $globalCfg;

                try {
                    $members = $this->tchap->getMembers($salon['room_id'], $cfg);

                    // Construire la map userId → membership (join ou invite)
                    $memberStatus = [];
                    foreach ($members as $m) {
                        $uid = strtolower($m['state_key'] ?? '');
                        if ($uid) {
                            $memberStatus[$uid] = $m['content']['membership'] ?? 'join';
                        }
                    }
                    $memberIds   = array_keys($memberStatus);
                    $expectedIds = [];

                    foreach ($agents as $agent) {
                        $uid = trim($agent['user_id'] ?? '');
                        if (!$uid) {
                            continue;
                        }

                        // Valider le format Matrix ID (@localpart:homeserver)
                        // Regex : commence par @, au moins 1 char de localpart, :, au moins 1 char de homeserver
                        if (!preg_match('/^@[^@:]+:[^@:]+/', $uid)) {
                            $errors[] = [
                                'action' => 'skip',
                                'user'   => $uid,
                                'salon'  => $salon['Nom'],
                                'error'  => "user_id invalide « $uid » — doit être au format @utilisateur:homeserver (pas une adresse email)",
                            ];
                            continue;
                        }

                        if ($manualMode) {
                            // Sélection manuelle : tous les agents sélectionnés sont attendus
                            $expectedIds[] = strtolower($uid);
                        } else {
                            // Sync globale : on respecte les attributions unités/Salons_Extra
                            $agentSalons = $this->getExpectedSalons($agent, $uniteMap);
                            if (in_array((int) $salon['id'], $agentSalons, true)) {
                                $expectedIds[] = strtolower($uid);
                            }
                        }
                    }

                    $botId = strtolower($cfg['botUserId'] ?? '');

                    // Renouveler les invitations en attente (invite → kick + re-invite)
                    foreach ($expectedIds as $uid) {
                        if ($uid === $botId) {
                            continue;
                        }
                        if (($memberStatus[$uid] ?? '') === 'invite') {
                            try {
                                $this->tchap->kick($salon['room_id'], $uid, 'Renouvellement invitation', $cfg);
                                $this->tchap->invite($salon['room_id'], $uid, $cfg);
                                $reinvited++;
                            } catch (\Throwable $e) {
                                $errors[] = ['action' => 'reinvite', 'user' => $uid, 'salon' => $salon['Nom'], 'error' => $e->getMessage()];
                            }
                        }
                    }

                    // Inviter les agents attendus mais absents du salon
                    foreach ($expectedIds as $uid) {
                        if ($uid === $botId || isset($memberStatus[$uid])) {
                            continue;
                        }
                        try {
                            $this->tchap->invite($salon['room_id'], $uid, $cfg);
                            $invited++;
                        } catch (\Throwable $e) {
                            $msg = $e->getMessage();
                            // M_INVALID_PARAM = Matrix ID inexistant sur Tchap
                            if (str_contains($msg, 'M_INVALID_PARAM') || str_contains($msg, "start with '@'")) {
                                $msg = "Matrix ID introuvable sur Tchap : « $uid » n'existe pas. Vérifiez le vrai ID dans l'app Tchap (profil → Matrix ID) et corrigez le champ user_id de l'agent.";
                            }
                            $errors[] = ['action' => 'invite', 'user' => $uid, 'salon' => $salon['Nom'], 'error' => $msg];
                        }
                    }

                    // Expulser les membres join non attendus (sync globale uniquement)
                    // Les membres invite non attendus sont aussi expulsés (invitation erronée)
                    if (!$manualMode) {
                        foreach ($memberIds as $mid) {
                            if (!$mid || !str_starts_with($mid, '@') || !str_contains($mid, ':')) {
                                continue;
                            }
                            if ($mid === $botId) {
                                continue;
                            }
                            if (!in_array($mid, $expectedIds, true)) {
                                try {
                                    $this->tchap->kick($salon['room_id'], $mid, 'Gestion automatique', $cfg);
                                    $kicked++;
                                } catch (\Throwable $e) {
                                    $errors[] = ['action' => 'kick', 'user' => $mid, 'salon' => $salon['Nom'], 'error' => $e->getMessage()];
                                }
                            }
                        }
                    }
                } catch (\Throwable $e) {
                    $errors[] = ['salon' => $salon['Nom'], 'error' => $e->getMessage()];
                }
            }

            return $this->json(['ok' => true, 'invited' => $invited, 'reinvited' => $reinvited, 'kicked' => $kicked, 'errors' => $errors]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    private function getExpectedSalons(array $agent, array $uniteMap): array
    {
        $salons = [];

        // Salons via unités
        $uniteIds = $this->pgArrayToPhp($agent['Unite'] ?? '{}');
        foreach ($uniteIds as $uid) {
            $unite = $uniteMap[$uid] ?? null;
            if ($unite) {
                foreach ($this->pgArrayToPhp($unite['Salons'] ?? '{}') as $sid) {
                    $salons[] = $sid;
                }
            }
        }

        // Salons extra directs
        foreach ($this->pgArrayToPhp($agent['Salons_Extra'] ?? '{}') as $sid) {
            $salons[] = $sid;
        }

        return array_unique($salons);
    }

    private function pgArrayToPhp(mixed $val): array
    {
        if (is_array($val)) {
            return array_map('intval', $val);
        }
        $s = (string) $val;
        if ($s === '{}' || $s === '') {
            return [];
        }
        return array_map('intval', explode(',', trim($s, '{}')));
    }

    private function arrayToPg(array $arr): string
    {
        return empty($arr) ? '{}' : '{' . implode(',', array_map('intval', $arr)) . '}';
    }

    // Retourne le cfg du bot approprié pour un room_id donné.
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

    // Résout le cfg du bot à utiliser pour une unité donnée.
    // Priorité : bot_id (bots table) > legacy bot_user_id/bot_access_token > global
    private function resolveBotCfg(array $unite, array $globalCfg): array
    {
        // Priorité 1 : bot_id référence la table bots
        if (!empty($unite['bot_id'])) {
            $bot = $this->db->fetchAssociative(
                'SELECT * FROM bots WHERE id = :id',
                ['id' => (int) $unite['bot_id']]
            );
            if ($bot && !empty($bot['access_token'])) {
                $hs = $bot['homeserver'] ?: $globalCfg['homeserver'];
                return array_merge($globalCfg, [
                    'token'         => $bot['access_token'],
                    'botUserId'     => $bot['user_id'],
                    'homeserver'    => $hs,
                    'bypass_bridge' => !$bot['is_principal'],
                ]);
            }
        }

        // Priorité 2 : legacy bot_user_id + bot_access_token
        if (!empty($unite['bot_access_token']) && !empty($unite['bot_user_id'])) {
            return array_merge($globalCfg, [
                'token'         => $unite['bot_access_token'],
                'botUserId'     => $unite['bot_user_id'],
                'bypass_bridge' => true,
            ]);
        }

        return $globalCfg;
    }
}
