# Utilise une image PHP officielle (multi-arch par défaut)
FROM php:8.3-fpm

# Installe les dépendances système
RUN apt-get update && apt-get install -y \
        libpq-dev \
        unzip \
        git \
        libc6 \
    && docker-php-ext-install pdo pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

# Installe Composer (image officielle multi-arch)
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock* ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-scripts --optimize-autoloader

COPY . .

RUN printf "APP_ENV=prod\n" > .env \
    && composer dump-autoload --optimize --no-dev \
    && mkdir -p var/cache var/log \
    && chown -R www-data:www-data var/

EXPOSE 9000
