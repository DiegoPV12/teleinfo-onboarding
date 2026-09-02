# Usa la imagen oficial de PHP con Apache incorporado
FROM php:8.2-apache

# Habilita el módulo de reescritura de Apache (útil para URLs amigables)
RUN a2enmod rewrite

# Copia todos los archivos de tu proyecto al directorio web del contenedor
COPY ./dist /var/www/html/

# Asigna los permisos correctos a los archivos para que Apache pueda leerlos
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# Expone el puerto 80 para el tráfico web
EXPOSE 80
