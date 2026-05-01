<?php

namespace App\Service;

use Symfony\Contracts\HttpClient\HttpClientInterface;

class TchapService
{
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly string $bridgeUrl = '',
        private readonly string $bridgeKey = '',
    ) {
    }

    private function bridgeEnabled(): bool
    {
        return $this->bridgeUrl !== '' && $this->bridgeKey !== '';
    }

    /**
     * Appelle le microservice Node.js tchap-bridge au lieu de l'API Matrix directement.
     * Utilisé quand TCHAP_SERVICE_URL et TCHAP_SERVICE_KEY sont configurés dans .env.
     */
    private function callBridge(string $method, string $path, ?array $body = null): array
    {
        $url = rtrim($this->bridgeUrl, '/') . $path;

        $options = [
            'headers' => [
                'X-Api-Key'    => $this->bridgeKey,
                'Content-Type' => 'application/json',
            ],
        ];

        if ($body !== null) {
            $options['json'] = $body;
        }

        $response = $this->httpClient->request($method, $url, $options);
        $data     = $response->toArray(false);
        $status   = $response->getStatusCode();

        if ($status >= 400) {
            $msg = $data['error'] ?? "HTTP $status";

            if (403 === $status) {
                if (str_contains($path, '/invite')) {
                    throw new \RuntimeException("Le bot n'a pas le droit d'inviter dans ce salon (403). Vérifiez qu'il est administrateur. Détail : $msg");
                }
                if (str_contains($path, '/kick')) {
                    throw new \RuntimeException("Le bot n'a pas le droit d'expulser dans ce salon (403). Détail : $msg");
                }
                throw new \RuntimeException("Accès refusé (403) : $msg");
            }

            throw new \RuntimeException($msg);
        }

        return $data;
    }

    private function call(string $method, string $path, array $config, ?array $body = null): array
    {
        if (empty($config['token']) || empty($config['homeserver'])) {
            throw new \RuntimeException('Bot Tchap non configuré (token ou homeserver manquant)');
        }

        $homeserver = rtrim($config['homeserver'], '/');
        $url        = $homeserver . '/_matrix/client/v3' . $path;

        $options = [
            'headers' => [
                'Authorization' => 'Bearer ' . $config['token'],
                'Content-Type'  => 'application/json',
            ],
        ];

        if ($body !== null) {
            $options['json'] = $body;
        }

        $response = $this->httpClient->request($method, $url, $options);
        $data     = $response->toArray(false);
        $status   = $response->getStatusCode();

        if ($status >= 400) {
            $msg = $data['error'] ?? "HTTP $status";

            if (403 === $status) {
                if (str_contains($path, '/invite')) {
                    throw new \RuntimeException("Le bot n'a pas le droit d'inviter dans ce salon (403). Vérifiez qu'il est administrateur. Détail : $msg");
                }
                if (str_contains($path, '/kick')) {
                    throw new \RuntimeException("Le bot n'a pas le droit d'expulser dans ce salon (403). Détail : $msg");
                }
                throw new \RuntimeException("Accès refusé (403) : $msg");
            }

            if (429 === $status) {
                $retryMs  = $data['retry_after_ms'] ?? null;
                $retrySec = $retryMs ? ceil($retryMs / 1000) : null;
                $suffix   = $retrySec ? " — réessayez dans {$retrySec} s" : '';
                throw new \RuntimeException("Trop de requêtes (429)$suffix");
            }

            throw new \RuntimeException($msg);
        }

        return $data;
    }

    /**
     * Interroge le bridge Node.js pour obtenir son état (prêt, userId, E2EE).
     * Retourne un tableau avec ok, ready, userId, e2ee, homeserver.
     */
    public function bridgeHealth(): array
    {
        if (!$this->bridgeEnabled()) {
            return ['ok' => false, 'ready' => false, 'e2ee' => false, 'reason' => 'Bridge non configuré'];
        }

        $url = rtrim($this->bridgeUrl, '/') . '/health';
        try {
            $response = $this->httpClient->request('GET', $url, [
                'timeout' => 5,
            ]);
            $data = $response->toArray(false);
            $data['e2ee'] = true; // RustSdkCryptoStorageProvider actif dès que le bridge est prêt
            return $data;
        } catch (\Throwable $e) {
            return ['ok' => false, 'ready' => false, 'e2ee' => false, 'reason' => $e->getMessage()];
        }
    }

    public function whoami(array $config): array
    {
        if ($this->bridgeEnabled()) {
            return $this->callBridge('GET', '/whoami');
        }

        return $this->call('GET', '/account/whoami', $config);
    }

    public function getMembers(string $roomId, array $config): array
    {
        if ($this->bridgeEnabled()) {
            $data = $this->callBridge('GET', '/rooms/' . rawurlencode($roomId) . '/members');
        } else {
            $path = '/rooms/' . rawurlencode($roomId) . '/members?membership=join';
            $data = $this->call('GET', $path, $config);
        }

        return array_values(array_filter(
            $data['chunk'] ?? [],
            fn($m) => ($m['content']['membership'] ?? '') === 'join'
        ));
    }

    public function invite(string $roomId, string $userId, array $config): array
    {
        if ($this->bridgeEnabled()) {
            return $this->callBridge('POST', '/rooms/' . rawurlencode($roomId) . '/invite', ['userId' => $userId]);
        }

        return $this->call(
            'POST',
            '/rooms/' . rawurlencode($roomId) . '/invite',
            $config,
            ['user_id' => $userId]
        );
    }

    public function kick(string $roomId, string $userId, string $reason, array $config): array
    {
        if ($this->bridgeEnabled()) {
            return $this->callBridge('POST', '/rooms/' . rawurlencode($roomId) . '/kick', ['userId' => $userId, 'reason' => $reason]);
        }

        return $this->call(
            'POST',
            '/rooms/' . rawurlencode($roomId) . '/kick',
            $config,
            ['user_id' => $userId, 'reason' => $reason]
        );
    }

    public function leaveRoom(string $roomId, array $config): array
    {
        if ($this->bridgeEnabled()) {
            return $this->callBridge('POST', '/rooms/' . rawurlencode($roomId) . '/leave');
        }

        return $this->call('POST', '/rooms/' . rawurlencode($roomId) . '/leave', $config, []);
    }

    public function createRoom(string $name, string $topic, string $preset, array $config): array
    {
        if ($this->bridgeEnabled()) {
            return $this->callBridge('POST', '/rooms', ['name' => $name, 'topic' => $topic, 'preset' => $preset]);
        }

        return $this->call('POST', '/createRoom', $config, [
            'name'              => $name,
            'topic'             => $topic,
            'preset'            => $preset,
            'creation_content'  => ['m.federate' => false],
        ]);
    }

    public function setPowerLevel(string $roomId, string $userId, int $level, array $config): array
    {
        if ($this->bridgeEnabled()) {
            return $this->callBridge('PUT', '/rooms/' . rawurlencode($roomId) . '/power-levels', ['userId' => $userId, 'level' => $level]);
        }

        $state = $this->call('GET', '/rooms/' . rawurlencode($roomId) . '/state/m.room.power_levels', $config);
        $state['users'][$userId] = $level;

        return $this->call(
            'PUT',
            '/rooms/' . rawurlencode($roomId) . '/state/m.room.power_levels',
            $config,
            $state
        );
    }

    public function getRoomState(string $roomId, array $config): array
    {
        if ($this->bridgeEnabled()) {
            return $this->callBridge('GET', '/rooms/' . rawurlencode($roomId) . '/state');
        }

        return $this->call('GET', '/rooms/' . rawurlencode($roomId) . '/state', $config);
    }

    public function sendMessage(string $roomId, string $body, string $msgtype = 'm.text'): array
    {
        if (!$this->bridgeEnabled()) {
            throw new \RuntimeException('sendMessage nécessite le service bridge (E2EE)');
        }

        return $this->callBridge('POST', '/rooms/' . rawurlencode($roomId) . '/send', ['body' => $body, 'msgtype' => $msgtype]);
    }

    public function loginWithPassword(string $homeserver, string $username, string $password): array
    {
        // En mode bridge, déléguer au service Node qui gère lui-même les credentials et la session E2EE
        if ($this->bridgeEnabled()) {
            return $this->callBridge('POST', '/login', [
                'homeserver' => $homeserver,
                'username'   => $username,
                'password'   => $password,
            ]);
        }

        $hs  = rtrim($homeserver, '/');
        $url = $hs . '/_matrix/client/v3/login';

        $response = $this->httpClient->request('POST', $url, [
            'json' => [
                'type'       => 'm.login.password',
                'identifier' => ['type' => 'm.id.user', 'user' => $username],
                'password'   => $password,
                'device_id'  => 'PHP_BOT_' . strtoupper(substr(md5($username), 0, 8)),
                'initial_device_display_name' => 'Gestion Tchap PHP Bot',
            ],
        ]);

        $data   = $response->toArray(false);
        $status = $response->getStatusCode();

        if ($status >= 400) {
            throw new \RuntimeException($data['error'] ?? "Échec login Matrix (HTTP $status)");
        }

        if (empty($data['access_token'])) {
            throw new \RuntimeException('Pas de token dans la réponse Matrix');
        }

        return $data;
    }

    /**
     * Récupère le profil Tchap d'un utilisateur (displayname, avatar_url).
     */
    public function getProfile(string $userId, array $config): array
    {
        if ($this->bridgeEnabled()) {
            try {
                return $this->callBridge('GET', '/profile/' . rawurlencode($userId));
            } catch (\Throwable) {
                // Fallback to direct Matrix API
            }
        }

        return $this->call('GET', '/profile/' . rawurlencode($userId), $config);
    }

    public function mailToTchapId(string $mail): string
    {
        $mail = strtolower(trim($mail));
        $at   = strpos($mail, '@');
        if ($at < 1) {
            return '';
        }

        $local  = substr($mail, 0, $at);
        $domain = substr($mail, $at + 1);

        return "@{$local}-{$domain}:agent.interieur.tchap.gouv.fr";
    }
}
