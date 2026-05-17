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

#[Route('/messages', name: 'app_messages_')]
class MessageController extends AbstractController
{
    private const MAX_FILE_SIZE  = 20 * 1024 * 1024; // 20 Mo
    private const MAX_ATTACH     = 5;

    public function __construct(
        private readonly Connection    $db,
        private readonly RoleService   $roles,
        private readonly ConfigService $config,
        private readonly TchapService  $tchap,
    ) {}

    // GET /messages
    #[Route('', name: 'page', methods: ['GET'])]
    public function page(): Response
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            throw $this->createAccessDeniedException('Accès réservé aux gestionnaires');
        }

        return $this->render('messages/index.html.twig', [
            'user'        => $user->toArray(),
            'permissions' => $this->roles->getPermissionsArray($user),
            'uiConfig'    => $this->config->getUiConfig(),
        ]);
    }

    // POST /messages/upload — upload d'une pièce jointe vers Matrix, retourne l'URL mxc://
    #[Route('/upload', name: 'upload', methods: ['POST'])]
    public function upload(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        $file = $request->files->get('file');
        if (!$file) {
            return $this->json(['error' => 'Aucun fichier fourni'], 400);
        }

        if ($file->getSize() > self::MAX_FILE_SIZE) {
            return $this->json(['error' => 'Fichier trop volumineux (max 20 Mo)'], 400);
        }

        try {
            $cfg      = $this->config->getTchapConfig();
            $content  = file_get_contents($file->getPathname());
            $mimetype = $file->getClientMimeType() ?: 'application/octet-stream';
            $name     = $file->getClientOriginalName();

            $mxcUrl = $this->tchap->uploadMedia($content, $name, $mimetype, $cfg);

            return $this->json([
                'url'      => $mxcUrl,
                'name'     => $name,
                'mimetype' => $mimetype,
                'size'     => $file->getSize(),
            ]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    // POST /messages/send — envoie un message dans un ou plusieurs salons
    #[Route('/send', name: 'send', methods: ['POST'])]
    public function send(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$this->roles->canManage($user)) {
            return $this->json(['error' => 'Accès refusé'], 403);
        }

        $data        = json_decode($request->getContent(), true) ?? [];
        $salonIds    = array_values(array_filter(array_map('intval', $data['salonIds'] ?? []), fn($id) => $id > 0));
        $body        = trim($data['body'] ?? '');
        $attachments = array_slice($data['attachments'] ?? [], 0, self::MAX_ATTACH);

        if (empty($salonIds)) {
            return $this->json(['error' => 'Aucun salon sélectionné'], 400);
        }
        if ($body === '' && empty($attachments)) {
            return $this->json(['error' => 'Message vide et aucune pièce jointe'], 400);
        }

        // Charger les salons ayant un room_id
        $placeholders = implode(',', array_fill(0, count($salonIds), '?'));
        $salons = $this->db->fetchAllAssociative(
            "SELECT id, \"Nom\", \"room_id\", \"Type\" FROM salons
             WHERE id IN ($placeholders)
               AND \"room_id\" IS NOT NULL AND \"room_id\" != ''",
            $salonIds
        );

        if (empty($salons)) {
            return $this->json(['error' => 'Aucun salon valide (room_id manquant pour tous les salons sélectionnés)'], 400);
        }

        // Conversion markdown → HTML minimal pour le corps texte
        $formattedBody = $body !== '' ? $this->toHtml($body) : null;

        $results = [];

        foreach ($salons as $salon) {
            $roomId = $salon['room_id'];
            $result = ['id' => $salon['id'], 'nom' => $salon['Nom'], 'roomId' => $roomId, 'ok' => false];

            try {
                $cfg = $this->getCfgForRoom($roomId);

                // Pièces jointes d'abord
                foreach ($attachments as $att) {
                    $mxc = $att['url'] ?? '';
                    if ($mxc === '') {
                        continue;
                    }
                    $isImage = str_starts_with($att['mimetype'] ?? '', 'image/');
                    $this->tchap->sendMessageWithConfig(
                        $roomId,
                        $att['name'] ?? 'fichier',
                        $cfg,
                        $isImage ? 'm.image' : 'm.file',
                        null,
                        [
                            'url'  => $mxc,
                            'info' => [
                                'mimetype' => $att['mimetype'] ?? 'application/octet-stream',
                                'size'     => (int) ($att['size'] ?? 0),
                            ],
                        ]
                    );
                }

                // Corps texte
                if ($body !== '') {
                    $this->tchap->sendMessageWithConfig($roomId, $body, $cfg, 'm.text', $formattedBody);
                }

                $result['ok'] = true;
            } catch (\Throwable $e) {
                $result['error'] = $e->getMessage();
            }

            $results[] = $result;
        }

        $sent   = count(array_filter($results, fn($r) => $r['ok']));
        $failed = count($results) - $sent;

        return $this->json(['results' => $results, 'sent' => $sent, 'failed' => $failed]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Conversion markdown minimal → HTML pour formatted_body Matrix. */
    private function toHtml(string $text): string
    {
        $html = htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        // Blocs de code (avant le code inline pour éviter les collisions)
        $html = preg_replace('/```\s*\n?(.*?)\n?```/su', '<pre><code>$1</code></pre>', $html);
        // Code inline
        $html = preg_replace('/`(.+?)`/su', '<code>$1</code>', $html);
        // Gras
        $html = preg_replace('/\*\*(.+?)\*\*/su', '<strong>$1</strong>', $html);
        // Italique
        $html = preg_replace('/\*(.+?)\*/su', '<em>$1</em>', $html);
        // Barré
        $html = preg_replace('/~~(.+?)~~/su', '<del>$1</del>', $html);
        // Citation (> au début de ligne — htmlspecialchars a transformé > en &gt;)
        $html = preg_replace('/^&gt; (.+)$/mu', '<blockquote>$1</blockquote>', $html);
        // Lien [texte](url)
        $html = preg_replace('/\[([^\]]+)]\(([^)]+)\)/u', '<a href="$2">$1</a>', $html);
        // Sauts de ligne (hors blocs pre)
        $html = preg_replace('/(?<!>)\n(?!<\/?(pre|blockquote))/u', '<br>', $html);

        return $html;
    }

    /** Retourne la config du bot approprié pour un room_id donné. */
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

    /** Résout la config bot : bot_id > legacy > global. */
    private function resolveBotCfg(array $unite, array $globalCfg): array
    {
        if (!empty($unite['bot_id'])) {
            $bot = $this->db->fetchAssociative(
                'SELECT * FROM bots WHERE id = :id',
                ['id' => (int) $unite['bot_id']]
            );
            if ($bot && !empty($bot['access_token'])) {
                return array_merge($globalCfg, [
                    'token'         => $bot['access_token'],
                    'botUserId'     => $bot['user_id'],
                    'homeserver'    => $bot['homeserver'] ?: $globalCfg['homeserver'],
                    'bypass_bridge' => !$bot['is_principal'],
                ]);
            }
        }

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
