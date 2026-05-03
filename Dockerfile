FROM php:8.3-fpm

RUN apt-get update && apt-get install -y \
        libpq-dev \
        unzip \
        git \
    && docker-php-ext-install pdo pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock* ./
RUN composer install --no-dev --prefer-dist --no-interaction

COPY . .

RUN composer dump-autoload --optimize --no-dev \
    && mkdir -p var/cache var/log \
    && chown -R www-data:www-data var/

EXPOSE 9000
