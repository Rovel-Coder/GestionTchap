<?php

namespace App\Command;

use App\Service\ConfigService;
use App\Service\TchapService;
use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:sync-tchap',
    description: 'Exécute une synchronisation Tchap en arrière-plan (DB → Tchap invite/kick)',
)]
class SyncTchapCommand extends Command
{
    // Pause toutes les BATCH_SIZE opérations Tchap (invite/kick) pour éviter le rate-limiting
    private const BATCH_SIZE     = 10;
    private const BATCH_PAUSE_US = 3_000_000; // 3 secondes en microsecondes

    public function __construct(
        private readonly TchapService  $tchap,
        private readonly ConfigService $config,
        private readonly Connection    $db,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('jobId', InputArgument::REQUIRED, 'Identifiant du job dans la table sync_jobs');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io    = new SymfonyStyle($input, $output);
        $jobId = $input->getArgument('jobId');

        // ── Charger le job ────────────────────────────────────────────────────
        $job = $this->db->fetchAssociative(
            'SELECT * FROM sync_jobs WHERE id = :id',
            ['id' => $jobId]
        );

        if (!$job) {
            $io->error("Job introuvable : $jobId");
            return Command::FAILURE;
        }

        $params   = json_decode($job['params'], true) ?? [];
        $salonIds = array_map('intval', $params['salonIds'] ?? []);
        $agentIds = array_map('intval', $params['agentIds'] ?? []);

        if (empty($salonIds)) {
            $this->markJob($jobId, 'error', [], "salonIds manquants dans les params du job");
            $io->error('salonIds manquants dans les params du job');
            return Command::FAILURE;
        }

        // ── Marquer comme running ─────────────────────────────────────────────
        $this->db->executeStatement(
            "UPDATE sync_jobs SET status = 'running', total = :total, updated_at = NOW() WHERE id = :id",
            ['total' => count($salonIds), 'id' => $jobId]
        );

        $io->writeln("Job $jobId démarré ({$job['total']} salons)");

        try {
            $globalCfg  = $this->config->getTchapConfig();
            $invited    = 0;
            $kicked     = 0;
            $reinvited  = 0;
            $errors     = [];
            $done       = 0;

            // ── Charger les salons ────────────────────────────────────────────
            $salonPh = implode(',', array_fill(0, count($salonIds), '?'));
            $salons  = $this->db->fetchAllAssociative(
                "SELECT * FROM salons WHERE id IN ($salonPh)",
                $salonIds
            );

            // ── Charger les agents ────────────────────────────────────────────
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

            // ── Construire la map salonId → cfg bot dédié ─────────────────────
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

            $manualMode = !empty($agentIds);
            $opCount    = 0; // compteur d'opérations Tchap pour le batching

            // ── Boucle principale par salon ───────────────────────────────────
            foreach ($salons as $salon) {
                if (!$salon['room_id']) {
                    $done++;
                    $this->updateProgress($jobId, $done, $salon['Nom'], $invited, $reinvited, $kicked, $errors);
                    continue;
                }

                $cfg = $salonBotCfg[(int) $salon['id']] ?? $globalCfg;

                try {
                    $members = $this->tchap->getMembers($salon['room_id'], $cfg);

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

                        if (!preg_match('/^@[^@:]+:[^@:]+/', $uid)) {
                            $errors[] = [
                                'action' => 'skip',
                                'user'   => $uid,
                                'salon'  => $salon['Nom'],
                                'error'  => "user_id invalide « $uid » — doit être au format @utilisateur:homeserver",
                            ];
                            continue;
                        }

                        if ($manualMode) {
                            $expectedIds[] = strtolower($uid);
                        } else {
                            $agentSalons = $this->getExpectedSalons($agent, $uniteMap);
                            if (in_array((int) $salon['id'], $agentSalons, true)) {
                                $expectedIds[] = strtolower($uid);
                            }
                        }
                    }

                    $botId = strtolower($cfg['botUserId'] ?? '');

                    // Renouveler les invitations en attente
                    // — mode global : uniquement les membres attendus (les autres seront expulsés)
                    // — mode manuel : tous les membres avec une invitation en attente
                    $reinviteScope = $manualMode ? $memberIds : $expectedIds;
                    foreach ($reinviteScope as $uid) {
                        if ($uid === $botId) {
                            continue;
                        }
                        if (($memberStatus[$uid] ?? '') === 'invite') {
                            try {
                                $this->tchap->kick($salon['room_id'], $uid, 'Renouvellement invitation', $cfg);
                                $this->tchap->invite($salon['room_id'], $uid, $cfg);
                                $reinvited++;
                                $opCount += 2; // kick + invite = 2 opérations
                                if ($opCount % self::BATCH_SIZE === 0) {
                                    $io->writeln("  [batch] pause après $opCount opérations…");
                                    usleep(self::BATCH_PAUSE_US);
                                }
                            } catch (\Throwable $e) {
                                $errors[] = ['action' => 'reinvite', 'user' => $uid, 'salon' => $salon['Nom'], 'error' => $e->getMessage()];
                            }
                        }
                    }

                    // Inviter les agents attendus mais absents
                    foreach ($expectedIds as $uid) {
                        if ($uid === $botId || isset($memberStatus[$uid])) {
                            continue;
                        }
                        try {
                            $this->tchap->invite($salon['room_id'], $uid, $cfg);
                            $invited++;
                            if (++$opCount % self::BATCH_SIZE === 0) {
                                $io->writeln("  [batch] pause après $opCount opérations…");
                                usleep(self::BATCH_PAUSE_US);
                            }
                        } catch (\Throwable $e) {
                            $msg = $e->getMessage();
                            if (str_contains($msg, 'M_INVALID_PARAM') || str_contains($msg, "start with '@'")) {
                                $msg = "Matrix ID introuvable sur Tchap : « $uid » n'existe pas. Vérifiez le vrai ID dans l'app Tchap (profil → Matrix ID) et corrigez le champ user_id de l'agent.";
                            }
                            $errors[] = ['action' => 'invite', 'user' => $uid, 'salon' => $salon['Nom'], 'error' => $msg];
                        }
                    }

                    // Expulser les membres non attendus (sync globale uniquement)
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
                                    if (++$opCount % self::BATCH_SIZE === 0) {
                                        $io->writeln("  [batch] pause après $opCount opérations…");
                                        usleep(self::BATCH_PAUSE_US);
                                    }
                                } catch (\Throwable $e) {
                                    $errors[] = ['action' => 'kick', 'user' => $mid, 'salon' => $salon['Nom'], 'error' => $e->getMessage()];
                                }
                            }
                        }
                    }
                } catch (\Throwable $e) {
                    $errors[] = ['salon' => $salon['Nom'], 'error' => $e->getMessage()];
                }

                $done++;
                $this->updateProgress($jobId, $done, $salon['Nom'], $invited, $reinvited, $kicked, $errors);
                $io->writeln("  [{$done}] {$salon['Nom']} — invited=$invited reinvited=$reinvited kicked=$kicked");
            }

            // ── Marquer comme terminé ─────────────────────────────────────────
            $this->db->executeStatement(
                "UPDATE sync_jobs
                 SET status = 'done', done = :done, current_salon = NULL,
                     invited = :invited, reinvited = :reinvited, kicked = :kicked,
                     errors = :errors, updated_at = NOW()
                 WHERE id = :id",
                [
                    'done'      => $done,
                    'invited'   => $invited,
                    'reinvited' => $reinvited,
                    'kicked'    => $kicked,
                    'errors'    => json_encode($errors, JSON_UNESCAPED_UNICODE),
                    'id'        => $jobId,
                ]
            );

            $io->success("Job $jobId terminé : invited=$invited reinvited=$reinvited kicked=$kicked errors=" . count($errors));
            return Command::SUCCESS;

        } catch (\Throwable $e) {
            $this->markJob($jobId, 'error', [], $e->getMessage());
            $io->error($e->getMessage());
            return Command::FAILURE;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function updateProgress(string $jobId, int $done, string $currentSalon, int $invited, int $reinvited, int $kicked, array $errors): void
    {
        $this->db->executeStatement(
            "UPDATE sync_jobs
             SET done = :done, current_salon = :salon,
                 invited = :invited, reinvited = :reinvited, kicked = :kicked,
                 errors = :errors, updated_at = NOW()
             WHERE id = :id",
            [
                'done'      => $done,
                'salon'     => $currentSalon,
                'invited'   => $invited,
                'reinvited' => $reinvited,
                'kicked'    => $kicked,
                'errors'    => json_encode($errors, JSON_UNESCAPED_UNICODE),
                'id'        => $jobId,
            ]
        );
    }

    private function markJob(string $jobId, string $status, array $errors, string $message = ''): void
    {
        if ($message) {
            $errors[] = ['error' => $message];
        }
        $this->db->executeStatement(
            "UPDATE sync_jobs SET status = :status, errors = :errors, updated_at = NOW() WHERE id = :id",
            [
                'status' => $status,
                'errors' => json_encode($errors, JSON_UNESCAPED_UNICODE),
                'id'     => $jobId,
            ]
        );
    }

    private function getExpectedSalons(array $agent, array $uniteMap): array
    {
        $salons = [];

        $uniteIds = $this->pgArrayToPhp($agent['Unite'] ?? '{}');
        foreach ($uniteIds as $uid) {
            $unite = $uniteMap[$uid] ?? null;
            if ($unite) {
                foreach ($this->pgArrayToPhp($unite['Salons'] ?? '{}') as $sid) {
                    $salons[] = $sid;
                }
            }
        }

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
