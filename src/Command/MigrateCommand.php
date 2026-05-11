<?php

namespace App\Command;

use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:db:migrate',
    description: 'Applique les migrations SQL du dossier migrations/ (idempotent)',
)]
class MigrateCommand extends Command
{
    public function __construct(private readonly Connection $db)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io  = new SymfonyStyle($input, $output);
        $dir = dirname(__DIR__, 2) . '/migrations';

        if (!is_dir($dir)) {
            $io->success('Aucun dossier migrations/ trouvé — rien à faire.');
            return Command::SUCCESS;
        }

        $files = glob($dir . '/*.sql');
        natsort($files);

        if (empty($files)) {
            $io->success('Aucune migration SQL à appliquer.');
            return Command::SUCCESS;
        }

        $pdo = $this->db->getNativeConnection();

        foreach ($files as $file) {
            $name = basename($file);
            $io->write("  Migration <comment>$name</comment>… ");
            $sql = file_get_contents($file);

            try {
                $pdo->exec($sql);
                $io->writeln('<info>OK</info>');
            } catch (\Exception $e) {
                $io->writeln('<error>ÉCHEC</error>');
                $io->error($e->getMessage());
                return Command::FAILURE;
            }
        }

        $io->success('Toutes les migrations ont été appliquées.');
        return Command::SUCCESS;
    }
}
