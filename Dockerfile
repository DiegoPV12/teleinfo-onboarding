# Usa la imagen oficial de PHP con Apache incorporado
FROM php:8.2-apache

# Habilita el módulo de reescritura de Apache (útil para URLs amigables)
RUN a2enmod rewrite

# SPA fallback: cualquier ruta que no sea un fichero real (p. ej. /t/<code>)
# la sirve index.html, para que el router del cliente la resuelva y no de 404.
RUN printf '<Directory /var/www/html/>\n\tFallbackResource /index.html\n</Directory>\n' \
      > /etc/apache2/conf-available/spa.conf \
    && a2enconf spa

# Copia todos los archivos de tu proyecto al directorio web del contenedor
COPY ./dist /var/www/html/

# Asigna los permisos correctos a los archivos para que Apache pueda leerlos
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# Expone el puerto 80 para el tráfico web
EXPOSE 80
