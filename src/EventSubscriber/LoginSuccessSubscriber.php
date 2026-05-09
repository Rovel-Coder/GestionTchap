<?php

namespace App\EventSubscriber;

use Doctrine\DBAL\Connection;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\Security\Http\Event\LoginSuccessEvent;

class LoginSuccessSubscriber implements EventSubscriberInterface
{
    public function __construct(private readonly Connection $db) {}

    public static function getSubscribedEvents(): array
    {
        return [LoginSuccessEvent::class => 'onLoginSuccess'];
    }

    public function onLoginSuccess(LoginSuccessEvent $event): void
    {
        $identifier = strtolower(trim($event->getUser()->getUserIdentifier()));

        $this->db->executeStatement(
            'DELETE FROM login_locks WHERE LOWER(identifier) = :id',
            ['id' => $identifier]
        );
    }
}
