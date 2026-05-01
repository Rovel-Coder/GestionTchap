<?php

namespace App\Doctrine;

use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Types\Type;

class IntArrayType extends Type
{
    public const NAME = 'int_array';

    public function getName(): string
    {
        return self::NAME;
    }

    public function getSQLDeclaration(array $column, AbstractPlatform $platform): string
    {
        return 'INTEGER[]';
    }

    public function convertToPHPValue(mixed $value, AbstractPlatform $platform): array
    {
        if (null === $value || '{}' === $value || '' === $value) {
            return [];
        }

        if (is_array($value)) {
            return array_map('intval', $value);
        }

        // PostgreSQL retourne le format {1,2,3}
        $trimmed = trim((string) $value, '{}');
        if ('' === $trimmed) {
            return [];
        }

        return array_map('intval', explode(',', $trimmed));
    }

    public function convertToDatabaseValue(mixed $value, AbstractPlatform $platform): string
    {
        if (empty($value)) {
            return '{}';
        }

        return '{' . implode(',', array_map('intval', (array) $value)) . '}';
    }

    public function requiresSQLCommentHint(AbstractPlatform $platform): bool
    {
        return true;
    }
}
