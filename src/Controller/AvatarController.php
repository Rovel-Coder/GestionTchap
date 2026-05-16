<?php

namespace App\Controller;

use App\Service\ConfigService;
use App\Service\TchapService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class AvatarController extends AbstractController
{
    public function __construct(
        private readonly TchapService  $tchap,
        private readonly ConfigService $config,
    ) {
    }

    /**
     * Proxy avatar Tchap avec cache fichier 1h.
     * Accessible à tous les utilisateurs authentifiés (ROLE_USER+).
     * Retourne 404 si l'utilisateur n'a pas d'avatar ou si Tchap est injoignable.
     */
    #[Route('/api/avatar', name: 'api_avatar', methods: ['GET'])]
    public function avatar(Request $request): Response
    {
        $userId = trim($request->query->get('userId', ''));

        if (!$userId || !str_starts_with($userId, '@') || !str_contains($userId, ':')) {
            return new Response('', 404);
        }

        $cacheKey = 'av_' . md5($userId);
        $cacheDir = $this->getParameter('kernel.var_dir') . '/avatars';
        $imgPath  = $cacheDir . '/' . $cacheKey . '.img';
        $metaPath = $cacheDir . '/' . $cacheKey . '.meta';

        // Servir depuis le cache si frais (1h)
        if (is_file($imgPath) && is_file($metaPath) && filemtime($imgPath) > time() - 3600) {
            $meta = json_decode(file_get_contents($metaPath), true);
            return new Response(file_get_contents($imgPath), 200, [
                'Content-Type'  => $meta['ct'] ?? 'image/jpeg',
                'Cache-Control' => 'public, max-age=3600',
            ]);
        }

        $cfg     = $this->config->getTchapConfig();
        $profile = [];
        try {
            $profile = $this->tchap->getProfile($userId, $cfg);
        } catch (\Throwable) {
        }

        $mxcUrl = $profile['avatar_url'] ?? null;
        if (!$mxcUrl) {
            return new Response('', 404);
        }

        $image = $this->tchap->downloadAvatar($mxcUrl, $cfg, 64);
        if (!$image) {
            return new Response('', 404);
        }

        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0755, true);
        }
        file_put_contents($imgPath, $image['content']);
        file_put_contents($metaPath, json_encode(['ct' => $image['contentType']]));

        return new Response($image['content'], 200, [
            'Content-Type'  => $image['contentType'],
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }
}
