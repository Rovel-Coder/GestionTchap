<?php

namespace App\Security;

use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;

class AppUser implements UserInterface, PasswordAuthenticatedUserInterface
{
    public function __construct(
        private readonly int     $id,
        private readonly string  $identifier,
        private readonly string  $passwordHash,
        private readonly array   $symfonyRoles,
        private readonly bool    $isSysAdminFlag,
        private readonly string  $appRole,
        private readonly ?string $nom = null,
        private readonly ?string $prenom = null,
        private readonly ?int    $personnelId = null,
    ) {
    }

    public function getUserIdentifier(): string
    {
        return $this->identifier;
    }

    public function getPassword(): string
    {
        return $this->passwordHash;
    }

    public function getRoles(): array
    {
        return $this->symfonyRoles;
    }

    public function eraseCredentials(): void
    {
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function getAppRole(): string
    {
        return $this->appRole;
    }

    public function isSysAdmin(): bool
    {
        return $this->isSysAdminFlag;
    }

    public function getNom(): ?string
    {
        return $this->nom;
    }

    public function getPrenom(): ?string
    {
        return $this->prenom;
    }

    public function getPersonnelId(): ?int
    {
        return $this->personnelId;
    }

    public function getDisplayName(): string
    {
        if ($this->prenom && $this->nom) {
            return $this->prenom . ' ' . $this->nom;
        }

        return $this->identifier;
    }

    public function toArray(): array
    {
        return [
            'id'          => $this->id,
            'identifier'  => $this->identifier,
            'role'        => $this->appRole,
            'isSysAdmin'  => $this->isSysAdminFlag,
            'nom'         => $this->nom,
            'prenom'      => $this->prenom,
            'personnelId' => $this->personnelId,
            'displayName' => $this->getDisplayName(),
        ];
    }
}
