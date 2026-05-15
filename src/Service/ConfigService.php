<?php

namespace App\Service;

use Doctrine\DBAL\Connection;

class ConfigService
{
    private array $cache = [];

    public function __construct(private readonly Connection $db)
    {
    }

    public function get(string $key, mixed $default = null): mixed
    {
        if (array_key_exists($key, $this->cache)) {
            return $this->cache[$key];
        }

        $row = $this->db->fetchAssociative(
            'SELECT value FROM config WHERE key = :key',
            ['key' => $key]
        );

        if (!$row) {
            return $default;
        }

        $value = is_string($row['value']) ? json_decode($row['value'], true) : $row['value'];
        $this->cache[$key] = $value;

        return $value;
    }

    public function set(string $key, mixed $value): void
    {
        $json = json_encode($value, JSON_UNESCAPED_UNICODE);

        $this->db->executeStatement(
            'INSERT INTO config (key, value) VALUES (:key, :value)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
            ['key' => $key, 'value' => $json]
        );

        $this->cache[$key] = $value;
    }

    public function getTchapConfig(): array
    {
        $defaults = [
            'homeserver'   => 'https://matrix.agent.interieur.tchap.gouv.fr',
            'token'        => '',
            'botUserId'    => '@bot-gestion:agent.interieur.tchap.gouv.fr',
            'enabled'      => false,
            'emailDomains' => 'gendarmerie.interieur.gouv.fr',
        ];

        $stored = $this->get('tchap_config', []);

        return array_merge($defaults, is_array($stored) ? $stored : []);
    }

    /**
     * Retourne la liste des serveurs Tchap connus (homeserver + identity server par domaine email).
     * Utilisée pour la résolution email → Matrix ID cross-administration.
     */
    public function getTchapServers(): array
    {
        $stored = $this->get('tchap_servers', null);
        if (is_array($stored) && !empty($stored)) {
            return $stored;
        }

        // Valeurs par défaut : administrations Tchap connues
        return [
            [
                'id'             => 'interieur',
                'name'           => "Ministère de l'Intérieur",
                'domains'        => 'gendarmerie.interieur.gouv.fr, police.interieur.gouv.fr, interieur.gouv.fr',
                'homeserver'     => 'https://matrix.agent.interieur.tchap.gouv.fr',
                'identityServer' => '',
            ],
            [
                'id'             => 'diplomatie',
                'name'           => 'Ministère des Affaires étrangères',
                'domains'        => 'diplomatie.gouv.fr',
                'homeserver'     => 'https://matrix.agent.diplomatie.tchap.gouv.fr',
                'identityServer' => '',
            ],
            [
                'id'             => 'defense',
                'name'           => 'Ministère des Armées',
                'domains'        => 'defense.gouv.fr, intradef.gouv.fr',
                'homeserver'     => 'https://matrix.agent.defense.tchap.gouv.fr',
                'identityServer' => '',
            ],
        ];
    }

    public function getUiConfig(): array
    {
        $defaults = [
            'roleFeatures' => [
                'lecteur'           => ['carto' => false, 'crise' => false, 'suivi_crise' => false],
                'gestionnaire'      => ['carto' => true,  'crise' => false, 'suivi_crise' => false],
                'superviseur_crise' => ['carto' => true,  'crise' => true,  'suivi_crise' => true],
                'admin'             => ['carto' => true,  'crise' => true,  'suivi_crise' => true],
            ],
            'customRoles' => [],
        ];

        $stored = $this->get('ui_config', []);
        if (!is_array($stored)) {
            return $defaults;
        }

        return array_merge($defaults, $stored);
    }
}
