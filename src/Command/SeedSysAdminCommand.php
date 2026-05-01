<?php

namespace App\Command;

use App\Security\AppUser;
use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

#[AsCommand(
    name: 'app:seed-sysadmin',
    description: 'Crée le compte administrateur système "Sic" si absent (mot de passe : SicGestionTchap)',
)]
class SeedSysAdminCommand extends Command
{
    public function __construct(
        private readonly Connection                  $db,
        private readonly UserPasswordHasherInterface $hasher,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $existing = $this->db->fetchAssociative(
            "SELECT id FROM system_admins WHERE username = 'Sic'"
        );

        if ($existing) {
            $io->success('Le compte Sic existe déjà.');
            return Command::SUCCESS;
        }

        $tempUser = new AppUser(0, 'Sic', '', ['ROLE_SYSADMIN'], true, 'sysadmin');
        $hash     = $this->hasher->hashPassword($tempUser, 'SicGestionTchap');

        $this->db->insert('system_admins', [
            'username'      => 'Sic',
            'password_hash' => $hash,
        ]);

        $io->success('Compte système Sic créé (mot de passe : SicGestionTchap). Changez-le immédiatement !');

        return Command::SUCCESS;
    }
}
