# Tests — geolocalizacion-tiempo-real

Suite de tests para la funcionalidad de geolocalización global implementada en esta rama.

## Qué se testea

| Test | Tipo | Archivo |
|---|---|---|
| `GeolocationProvider` llama a `watchPosition` al montarse | Unit | `frontend/useGeolocation.test.tsx` |
| `watchPosition` usa `enableHighAccuracy: true` | Unit | `frontend/useGeolocation.test.tsx` |
| La posición se persiste en `sessionStorage` | Unit | `frontend/useGeolocation.test.tsx` |
| La posición se restaura de `sessionStorage` al inicializar | Unit | `frontend/useGeolocation.test.tsx` |
| Dos componentes en el mismo proveedor comparten la misma posición | Unit | `frontend/useGeolocation.test.tsx` |
| `permissionState` pasa a `"denied"` al recibir PERMISSION_DENIED | Unit | `frontend/useGeolocation.test.tsx` |
| `request()` llama a `getCurrentPosition` con alta precisión | Unit | `frontend/useGeolocation.test.tsx` |
| API no disponible → `permissionState: "unsupported"` | Unit | `frontend/useGeolocation.test.tsx` |
| El banner no se renderiza con posición disponible | Unit | `frontend/LocationPermissionBanner.test.tsx` |
| El banner muestra "Ubicacion bloqueada" cuando `permissionState === "denied"` | Unit | `frontend/LocationPermissionBanner.test.tsx` |
| El banner muestra "Ubicacion desactivada" en otros casos de error | Unit | `frontend/LocationPermissionBanner.test.tsx` |
| El botón "Activar ubicacion" llama a `request()` | Unit | `frontend/LocationPermissionBanner.test.tsx` |
| El banner tiene clase `fixed` y `z-[3000]` (persistente y sobre el mapa) | Unit | `frontend/LocationPermissionBanner.test.tsx` |
| El banner aparece en `/ciudadano` sin permisos | E2E | `e2e/ubicacion-global.spec.ts` |
| El banner muestra "Ubicacion bloqueada" | E2E | `e2e/ubicacion-global.spec.ts` |
| El banner NO aparece con geolocalización concedida | E2E | `e2e/ubicacion-global.spec.ts` |
| La posición se persiste en `sessionStorage` durante la sesión | E2E | `e2e/ubicacion-global.spec.ts` |
| La posición se reutiliza al recargar la página | E2E | `e2e/ubicacion-global.spec.ts` |
| El botón "Localizarme" es visible en el dashboard del ciudadano | E2E | `e2e/ubicacion-global.spec.ts` |
| Pulsar "Localizarme" con ubicación concedida devuelve el botón al estado normal | E2E | `e2e/ubicacion-global.spec.ts` |
| El mapa Leaflet se renderiza correctamente | E2E | `e2e/ubicacion-global.spec.ts` |

## Requisitos previos

```bash
# Frontend — dependencias ya instaladas con otras features
cd frontend && npm install

# Playwright browsers (solo la primera vez)
cd frontend && npx playwright install chromium
```

## Ejecutar todos los tests

**Windows (PowerShell):**
```powershell
.\TEST\geolocalizacion-tiempo-real\run-all.ps1
```

> Los tests E2E requieren el frontend corriendo:
> ```bash
> cd frontend && npm run dev
> ```

## Ejecutar por tipo

**Solo tests unitarios** (no necesita servidor):
```bash
cd frontend
npx vitest run --config vitest.feature-geolocalizacion-tiempo-real.config.ts
```

**Solo E2E** (requiere frontend en http://localhost:5173):
```bash
cd TEST/geolocalizacion-tiempo-real
npx playwright test --config playwright.config.ts
```

## Lógica testada

### `GeolocationProvider` ([frontend/src/hooks/useGeolocation.ts](../../../frontend/src/hooks/useGeolocation.ts))

- **Proveedor global**: envuelve toda la app en `main.tsx` → una única instancia de `GeolocationContext` compartida en todas las rutas
- **Seguimiento en tiempo real**: usa `navigator.geolocation.watchPosition` con `enableHighAccuracy: true`
- **Persistencia de sesión**: guarda la posición en `sessionStorage` bajo `catastrofe-logistica:last-geolocation` y la recupera al montar
- **Gestión de permisos**: escucha `navigator.permissions.query('geolocation')` y reactiva el watch si el permiso cambia a `granted`

### `LocationPermissionBanner` ([frontend/src/components/layout/LocationPermissionBanner.tsx](../../../frontend/src/components/layout/LocationPermissionBanner.tsx))

- Montado en `App.tsx` de forma global, presente en todas las rutas
- Solo visible cuando `!position && !loading && error`
- Distingue permiso denegado ("Ubicacion bloqueada") de desactivado ("Ubicacion desactivada")
- Es persistente: `position: fixed`, `z-index: 3000` (por encima del mapa Leaflet en z-1000)
- El botón "Activar ubicacion" llama a `request()` del hook para reintentar el permiso
