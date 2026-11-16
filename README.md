# AK Studio — Explorador gratuito de terrenos para Airbnb

Rama experimental sin servicios de búsqueda de pago. Mantiene el código histórico de Lead Finder en `main`.

## Lo que funciona sin facturación
- Elegir un punto turístico de Guanacaste, Puntarenas, Limón o San Carlos.
- Dibujar círculos de 1, 2, 3 y 5 km con Leaflet y mosaicos públicos de OpenStreetMap.
- Abrir búsquedas manuales de anuncios en buscadores públicos y portales inmobiliarios.
- Copiar coordenadas de un terreno encontrado, guardarlo en el navegador y medir la distancia en línea recta al punto de referencia.
- Filtrar visualmente candidatos dentro/fuera del radio y exportar CSV.

## Restricciones y verificación
- **No hay búsqueda automática de anuncios**; se desactivó SerpAPI y se borraron las rutas API de pago.
- Las coordenadas de las referencias son aproximadas. Los anuncios y coordenadas de los terrenos deben verificarse manualmente.
- No determina distancias por carretera, proximidad real a ríos, mapas de inundación, permisos, ZMT, disponibilidad de agua, potencial de ocupación o viabilidad constructiva.
- Los candidatos quedan en `localStorage` de ese navegador; no se sincronizan entre dispositivos.
- Leaflet se carga desde un CDN público y el mapa utiliza mosaicos OpenStreetMap; ambos son servicios de terceros gratuitos que pueden estar temporalmente limitados o indisponibles. Respetar https://operations.osmfoundation.org/policies/tiles/ y mostrar atribución.
- No se requiere Google Maps Platform ni tarjeta bancaria.
- Esta rama NO ofrece autenticación real: es una app de exploración sin datos privados de servidor. No publicar información confidencial.
- El plan Hobby gratuito de Vercel está limitado a uso personal/no comercial. Para uso empresarial de AK Studio, comprobar los términos y elegir un alojamiento gratuito que permita ese uso. No hay despliegue automático realizado desde este cambio.

## Desarrollo
```bash
npm ci
npm run dev
npm run build
```
