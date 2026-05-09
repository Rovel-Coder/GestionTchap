<?php

namespace App\EventSubscriber;

use Doctrine\DBAL\Connection;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAuthenticationException;
use Symfony\Component\Security\Http\Event\LoginFailureEvent;

class LoginFailureSubscriber implements EventSubscriberInterface
{
    private const MAX_ATTEMPTS = 3;

    public function __construct(private readonly Connection $db) {}

    public static function getSubscribedEvents(): array
    {
        return [LoginFailureEvent::class => 'onLoginFailure'];
    }

    public function onLoginFailure(LoginFailureEvent $event): void
    {
        // Ne pas incrémenter si le compte est déjà verrouillé
        $exception = $event->getException();
        if ($exception instanceof CustomUserMessageAuthenticationException
            && str_contains($exception->getMessageKey(), 'verrouillé')) {
            return;
        }

        $identifier = strtolower(trim((string) $event->getRequest()->request->get('identifier', '')));
        if (!$identifier) {
            return;
        }

        if (!$this->identifierExists($identifier)) {
            return;
        }

        $this->db->executeStatement(
            'INSERT INTO login_locks (identifier, attempts, last_attempt_at)
             VALUES (:id, 1, NOW())
             ON CONFLICT (identifier) DO UPDATE
             SET attempts         = login_locks.attempts + 1,
                 last_attempt_at  = NOW(),
                 locked_at        = CASE
                     WHEN login_locks.attempts + 1 >= :max THEN NOW()
                     ELSE login_locks.locked_at
                 END',
            ['id' => $identifier, 'max' => self::MAX_ATTEMPTS]
        );
    }

    private function identifierExists(string $identifier): bool
    {
        return (bool) $this->db->fetchOne(
            'SELECT 1 FROM personnel WHERE LOWER("Mail") = :id
             UNION ALL
             SELECT 1 FROM system_admins WHERE LOWER(username) = :id
             LIMIT 1',
            ['id' => $identifier]
        );
    }
}
