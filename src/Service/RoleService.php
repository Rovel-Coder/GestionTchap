<?php

namespace App\Service;

use App\Security\AppUser;

class RoleService
{
    private const ROLE_ORDER = ['lecteur', 'gestionnaire', 'superviseur_crise', 'admin'];

    public function extractBaseRole(string $role): string
    {
        return str_contains($role, ':') ? explode(':', $role)[0] : $role;
    }

    public function hasMinRole(string $userRole, string $minRole): bool
    {
        $base    = $this->extractBaseRole($userRole);
        $userIdx = array_search($base, self::ROLE_ORDER, true);
        $minIdx  = array_search($minRole, self::ROLE_ORDER, true);

        return false !== $userIdx && false !== $minIdx && $userIdx >= $minIdx;
    }

    public function canManage(AppUser $user): bool
    {
        if ($user->isSysAdmin()) {
            return true;
        }

        return $this->hasMinRole($user->getAppRole(), 'gestionnaire');
    }

    public function canCrise(AppUser $user): bool
    {
        if ($user->isSysAdmin()) {
            return true;
        }

        return $this->hasMinRole($user->getAppRole(), 'superviseur_crise');
    }

    public function canAdmin(AppUser $user): bool
    {
        if ($user->isSysAdmin()) {
            return true;
        }

        return $this->hasMinRole($user->getAppRole(), 'admin');
    }

    public function canChangeRole(AppUser $user): bool
    {
        return $this->canAdmin($user);
    }

    public function getPermissionsArray(AppUser $user): array
    {
        return [
            'canManage' => $this->canManage($user),
            'canCrise'  => $this->canCrise($user),
            'canAdmin'  => $this->canAdmin($user),
            'isSysAdmin' => $user->isSysAdmin(),
        ];
    }
}
