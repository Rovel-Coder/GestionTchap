<?php

namespace App\Twig;

use App\Service\ConfigService;
use Twig\Extension\AbstractExtension;
use Twig\TwigFunction;

class AppExtension extends AbstractExtension
{
    public function __construct(private readonly ConfigService $config) {}

    public function getFunctions(): array
    {
        return [
            new TwigFunction('tchap_servers', fn() => $this->config->getTchapServers()),
        ];
    }
}
