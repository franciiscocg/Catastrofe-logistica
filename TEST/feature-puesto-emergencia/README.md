# Tests - feature/Puesto-de-emergencia

Suite de tests para verificar la funcionalidad de puesto de emergencia implementada en esta rama.

## Que se testea

| Test | Tipo | Archivo |
|---|---|---|
| Gestion de trabajadores: listar, anadir, permisos y eliminacion | Unit (backend) | `backend/trabajadores.service.test.ts` |
| Dashboard de puesto: cabecera, resumen, filtros, inventario y trabajadores | Component (frontend) | `frontend/PuestoDashboard.test.tsx` |
| Registro de puesto: validacion por pasos y payload de alta | Component (frontend) | `frontend/RegisterPuesto.test.tsx` |
| Acceso desde seleccion de rol hacia login y registro especifico de puesto | E2E | `e2e/puesto-flujo.spec.ts` |

## Requisitos previos

```bash
cd backend && npm install
cd frontend && npm install
cd TEST/feature-puesto-emergencia && npm install

# Solo la primera vez para E2E
cd TEST/feature-puesto-emergencia && npx playwright install chromium
```

## Ejecutar todos los tests

**Windows (PowerShell):**
```powershell
.\TEST\feature-puesto-emergencia\run-all.ps1
```

**Linux / Mac:**
```bash
bash TEST/feature-puesto-emergencia/run-all.sh
```

> Los tests E2E requieren el frontend corriendo:
> ```bash
> cd frontend && npm run dev
> ```

## Ejecutar por tipo

**Solo backend:**
```bash
cd backend
npx vitest run --config vitest.feature-puesto-emergencia.config.ts
```

**Solo frontend:**
```bash
cd frontend
npx vitest run --config vitest.feature-puesto-emergencia.config.ts
```

**Solo E2E:**
```bash
cd TEST/feature-puesto-emergencia
npx playwright test --config playwright.config.ts
```

## Decisiones de diseno

- Los tests backend no necesitan base de datos: Prisma esta mockeado con `vi.mock`.
- Los tests frontend no llaman a APIs reales: `apiClient`, geolocalizacion, auth store y QR scanner estan mockeados.
- Los E2E son de navegacion ligera para comprobar que el rol Puesto de Emergencia conecta con login y registro especifico.
