<?php

namespace App\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

class LocaleSubscriber implements EventSubscriberInterface
{
    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::RESPONSE => 'onResponse'];
    }

    public function onResponse(ResponseEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $response    = $event->getResponse();
        $contentType = $response->headers->get('Content-Type', '');

        // Appliquer uniquement aux réponses HTML (pas JSON, images, CSS…)
        if (str_contains($contentType, 'text/html') || $contentType === '') {
            $response->headers->set('Content-Language', 'fr-FR');
        }
    }
}
