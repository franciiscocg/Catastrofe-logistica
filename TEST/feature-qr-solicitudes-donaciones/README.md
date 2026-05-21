# Tests — feature/qr-solicitudes-donaciones

Suite de tests para verificar la funcionalidad de solicitudes y donaciones por QR implementada en esta rama.

## Que se testea

| Test | Tipo | Archivo |
|---|---|---|
| Confirmar QR de solicitud ciudadana: descuento, uso unico, validaciones | Unit (backend) | `backend/qr-solicitud-ciudadano.service.test.ts` |
| Confirmar QR de entrega de donacion: compensacion, uso unico, balance | Unit (backend) | `backend/qr-donacion-entrega.service.test.ts` |
| addItem con compensacion disponible/necesario del mismo producto | Unit (backend) | `backend/inventario-additem.service.test.ts` |
| Agrupacion de donaciones activas del voluntario por puesto destino | Unit (frontend) | `frontend/donaciones-voluntario.test.ts` |
| Flujo QR ciudadano, navegacion voluntario y puesto | E2E | `e2e/qr-flujo.spec.ts` |

## Requisitos previos

```bash
cd backend && npm install
cd frontend && npm install
cd TEST/feature-qr-solicitudes-donaciones && npm install

# Solo la primera vez para E2E
cd TEST/feature-qr-solicitudes-donaciones && npx playwright install chromium
```

## Ejecutar todos los tests

**Windows (PowerShell):**
```powershell
.\TEST\feature-qr-solicitudes-donaciones\run-all.ps1
```

**Linux / Mac:**
```bash
bash TEST/feature-qr-solicitudes-donaciones/run-all.sh
```

> Los tests E2E requieren el frontend corriendo:
> ```bash
> cd frontend && npm run dev
> ```

## Ejecutar por tipo

**Solo backend:**
```bash
cd backend
npx vitest run --config ../TEST/feature-qr-solicitudes-donaciones/vitest.backend.config.ts
```

**Solo frontend:**
```bash
cd frontend
npx vitest run --config ../TEST/feature-qr-solicitudes-donaciones/vitest.frontend.config.ts
```

**Solo E2E:**
```bash
cd TEST/feature-qr-solicitudes-donaciones
npx playwright test --config playwright.config.ts
```

## Decisiones de diseno

- Los tests backend no necesitan base de datos: Prisma esta mockeado con `vi.mock`.
- Los tests frontend son tests de logica pura (entorno Node) sin renderizado de componentes, para evitar incompatibilidades ESM/CJS de jsdom con dependencias de CSS.
- Los E2E son de navegacion ligera para verificar que la UI QR conecta con las rutas y pantallas correctas.
