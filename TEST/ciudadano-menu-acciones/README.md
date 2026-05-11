# Tests — feature/ciudadano-menu-acciones

Suite de tests para verificar toda la funcionalidad implementada en esta rama:
primera pantalla de inicio para el ciudadano con tres acciones diferenciadas,
separación estricta de flujos, recuperación del botón "Cómo llegar" desde la
búsqueda de producto, botón "Volver" visible y centrado, y blindaje del mapa
contra coordenadas inválidas (NaN, NaN).

## Qué se testea

| Test | Tipo | Archivo |
|---|---|---|
| Guard `isValidLatLng` — rechaza NaN, Infinity, null, undefined | Unit (frontend) | `frontend/map-guards.test.ts` |
| Guard `hasValidMarkerPosition` — filtra marcadores con coords inválidas | Unit (frontend) | `frontend/map-guards.test.ts` |
| Guard `currentUserPosition` — descarta posición NaN de la geolocalización | Unit (frontend) | `frontend/map-guards.test.ts` |
| Guard `destinoPuesto` — ignora query params lat=NaN/lng=NaN | Unit (frontend) | `frontend/map-guards.test.ts` |
| Estructura del menú de inicio — 3 acciones únicas con título e icono | Unit (frontend) | `frontend/map-guards.test.ts` |
| Pantalla de inicio muestra las 3 acciones y navega correctamente | E2E (Playwright) | `e2e/ciudadano-menu.spec.ts` |
| Separación de flujos — cada vista no mezcla controles de las otras | E2E (Playwright) | `e2e/ciudadano-menu.spec.ts` |
| Botón "🚗 Cómo llegar" desde búsqueda de producto | E2E (Playwright) | `e2e/ciudadano-menu.spec.ts` |
| Botón "Volver" visible, centrado y funcional en todos los flujos | E2E (Playwright) | `e2e/ciudadano-menu.spec.ts` |
| Mapa carga sin errores "Invalid LatLng" con coords por defecto o inválidas | E2E (Playwright) | `e2e/ciudadano-menu.spec.ts` |

## Requisitos previos

```bash
# Frontend — dependencias incluidas (vitest, playwright)
cd frontend && npm install

# Playwright browsers (solo la primera vez)
cd TEST/ciudadano-menu-acciones && npm install
npx playwright install chromium
```

## Ejecutar todos los tests

**Windows (PowerShell):**
```powershell
.\TEST\ciudadano-menu-acciones\run-all.ps1
```

**Linux / Mac:**
```bash
bash TEST/ciudadano-menu-acciones/run-all.sh
```

> Playwright levanta el frontend automáticamente en el puerto 5200.
> Si prefieres arrancarlo tú mismo, cambia `reuseExistingServer` a `true`
> en `playwright.config.ts` y ejecuta `cd frontend && npm run dev`.

## Ejecutar por tipo

**Solo tests unitarios de frontend** (no necesita servidor):
```bash
cd TEST/ciudadano-menu-acciones
npx vitest run --config vitest.frontend.config.ts
```

**Solo E2E** (Playwright gestiona el servidor):
```bash
cd TEST/ciudadano-menu-acciones
npx playwright test --config playwright.config.ts
```

**Modo watch** (para desarrollo):
```bash
cd TEST/ciudadano-menu-acciones
npx vitest --config vitest.frontend.config.ts
```

## Estructura de tests

```
TEST/ciudadano-menu-acciones/
├── frontend/
│   └── map-guards.test.ts        # 30 casos: isValidLatLng, hasValidMarkerPosition,
│                                 #            currentUserPosition, destinoPuesto, menú
├── e2e/
│   └── ciudadano-menu.spec.ts    # 27 casos: pantalla inicio → mapa → buscador →
│                                 #            reporte → botón Volver → NaN guard
├── vitest.frontend.config.ts
├── playwright.config.ts
├── run-all.ps1                   # Windows
└── run-all.sh                    # Linux/Mac
```

## Particularidades conocidas

### Selector `getByText('Buscar producto', { exact: true })`
El texto "Buscar producto" aparece en tres elementos del DOM simultáneamente: el `<span>` del botón de acción en `CiudadanoInicio`, un párrafo de descripción que contiene "buscar productos" y un botón oculto (`div.hidden`) con emoji. Sin `{ exact: true }` Playwright viola el strict-mode. Con `exact:true` solo coincide el `<span>` con texto exacto.

### `click({ force: true })` en los botones "Volver"
El `LocationPermissionBanner` (z-3000) aparece en el entorno headless porque el navegador deniega la geolocalización inmediatamente. Este banner tapa el botón "Volver" (z-1200) en la vista de mapa y el footer del panel de reporte. Se usa `{ force: true }` para saltarse la comprobación de superposición y verificar la lógica de navegación, que es lo que se está testando.

### `Number('') === 0`
En JavaScript `Number('')` devuelve `0`, no `NaN`. Por eso el guard de `destinoPuesto` acepta `lat=""` como latitud 0 (coordenada válida del ecuador). El test refleja este comportamiento real en lugar de asumir que la cadena vacía es inválida.

## Decisiones de diseño

- Los tests unitarios de frontend son **puras funciones de lógica** — no hay
  mocks de React ni de Leaflet. Los guards se replican literalmente desde el
  código fuente para documentar y verificar el contrato exacto.
- Los tests E2E usan `webServer` para que Playwright levante Vite en el puerto
  5200 de forma automática, evitando dependencias manuales.
- La separación de flujos se verifica comprobando que los controles de otras
  vistas **no son visibles** en la vista activa — no solo que estén ocultos con
  `display:none`, sino que Playwright los marque como no visibles.
- El test del botón "Volver" comprueba tanto la **visibilidad** como las
  **clases CSS de centrado** (`left-1/2 -translate-x-1/2` / `mx-auto`).
- Los tests de NaN capturan errores de consola de tipo `error` y verifican
  que no contienen el string `"Invalid LatLng"`.
