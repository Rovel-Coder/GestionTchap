<?php

namespace App\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\Security\Csrf\CsrfToken;
use Symfony\Component\Security\Csrf\CsrfTokenManagerInterface;

/**
 * Valide le token CSRF (header X-CSRF-Token) sur toutes les routes /api/*
 * qui modifient l'état (POST, PATCH, DELETE, PUT).
 *
 * Le token est injecté dans la page via window.CSRF_TOKEN (base.html.twig)
 * et envoyé automatiquement par apiFetch() (app.js).
 */
class ApiCsrfSubscriber implements EventSubscriberInterface
{
    public function __construct(
        private readonly CsrfTokenManagerInterface $csrfTokenManager,
    ) {
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::REQUEST => ['onKernelRequest', 10]];
    }

    public function onKernelRequest(RequestEvent $event): void
    {
        $request = $event->getRequest();

        if (!$event->isMainRequest()) {
            return;
        }

        if (!str_starts_with($request->getPathInfo(), '/api/')) {
            return;
        }

        if (in_array($request->getMethod(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }

        $token = $request->headers->get('X-CSRF-Token', '');
        if (!$this->csrfTokenManager->isTokenValid(new CsrfToken('api', $token))) {
            $event->setResponse(new JsonResponse(['error' => 'Token CSRF invalide ou manquant'], 403));
        }
    }
}
