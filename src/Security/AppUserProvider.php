<?php

namespace App\Security;

use Doctrine\DBAL\Connection;
use Symfony\Component\Security\Core\Exception\UnsupportedUserException;
use Symfony\Component\Security\Core\Exception\UserNotFoundException;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Security\Core\User\UserProviderInterface;

class AppUserProvider implements UserProviderInterface
{
    private const ROLE_MAP = [
        'sysadmin'          => 'ROLE_SYSADMIN',
        'admin'             => 'ROLE_ADMIN',
        'superviseur_crise' => 'ROLE_SUPERVISEUR_CRISE',
        'gestionnaire'      => 'ROLE_GESTIONNAIRE',
        'lecteur'           => 'ROLE_USER',
    ];

    public function __construct(private readonly Connection $db)
    {
    }

    public function loadUserByIdentifier(string $identifier): UserInterface
    {
        // 1 — Chercher dans system_admins (par username, insensible à la casse)
        $sysAdmin = $this->db->fetchAssociative(
            'SELECT * FROM system_admins WHERE LOWER(username) = LOWER(:id)',
            ['id' => trim($identifier)]
        );

        if ($sysAdmin) {
            return new AppUser(
                id:             (int) $sysAdmin['id'],
                identifier:     $sysAdmin['username'],
                passwordHash:   $sysAdmin['password_hash'],
                symfonyRoles:   ['ROLE_SYSADMIN'],
                isSysAdminFlag: true,
                appRole:        'sysadmin',
            );
        }

        // 2 — Chercher dans personnel (par email, insensible à la casse)
        $user = $this->db->fetchAssociative(
            'SELECT * FROM personnel WHERE LOWER("Mail") = LOWER(:mail)',
            ['mail' => trim($identifier)]
        );

        if (!$user || !$user['password_hash']) {
            throw new UserNotFoundException(sprintf('Utilisateur introuvable : "%s"', $identifier));
        }

        return $this->buildPersonnelUser($user);
    }

    public function refreshUser(UserInterface $user): UserInterface
    {
        if (!$user instanceof AppUser) {
            throw new UnsupportedUserException(sprintf('Type non supporté : %s', get_class($user)));
        }

        if ($user->isSysAdmin()) {
            $row = $this->db->fetchAssociative(
                'SELECT * FROM system_admins WHERE id = :id',
                ['id' => $user->getId()]
            );
            if (!$row) {
                throw new UserNotFoundException('Admin système introuvable');
            }

            return new AppUser(
                id:             (int) $row['id'],
                identifier:     $row['username'],
                passwordHash:   $row['password_hash'],
                symfonyRoles:   ['ROLE_SYSADMIN'],
                isSysAdminFlag: true,
                appRole:        'sysadmin',
            );
        }

        $row = $this->db->fetchAssociative(
            'SELECT * FROM personnel WHERE id = :id',
            ['id' => $user->getPersonnelId() ?? $user->getId()]
        );
        if (!$row) {
            throw new UserNotFoundException('Personnel introuvable');
        }

        return $this->buildPersonnelUser($row);
    }

    public function supportsClass(string $class): bool
    {
        return AppUser::class === $class || is_subclass_of($class, AppUser::class);
    }

    private function buildPersonnelUser(array $row): AppUser
    {
        $appRole      = $row['Role'] ?? 'lecteur';
        $baseRole     = str_contains($appRole, ':') ? explode(':', $appRole)[0] : $appRole;
        $symfonyRole  = self::ROLE_MAP[$baseRole] ?? 'ROLE_USER';

        return new AppUser(
            id:             (int) $row['id'],
            identifier:     $row['Mail'],
            passwordHash:   $row['password_hash'] ?? '',
            symfonyRoles:   [$symfonyRole],
            isSysAdminFlag: false,
            appRole:        $appRole,
            nom:            $row['Nom'] ?? null,
            prenom:         $row['Prenom'] ?? null,
            personnelId:    (int) $row['id'],
        );
    }
}
