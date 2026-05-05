# Tests — feature/funcionalidad-voluntario

Suite de tests para verificar toda la funcionalidad implementada en esta rama: flujo completo del voluntario cubriendo donaciones, ayuda en incidencias, ayuda en puestos y cálculo de rutas operativas.

## Qué se testea

| Test | Tipo | Archivo |
|---|---|---|
| Lógica de servicio: listado y creación de donaciones | Unit (backend) | `backend/donaciones.service.test.ts` |
| Validación de necesidades pendientes por producto y puesto | Unit (backend) | `backend/donaciones.service.test.ts` |
| Múltiples donaciones activas hacia distintos puestos | Unit (backend) | `backend/donaciones.service.test.ts` |
| Generación de código QR de entrega | Unit (backend) | `backend/donaciones.service.test.ts` |
| Asignación a incidencia: solo CORTADAS, control de conflictos | Unit (backend) | `backend/incidencias.service.test.ts` |
| Finalización con actualización obligatoria del estado de la calle | Unit (backend) | `backend/incidencias.service.test.ts` |
| Asignación a puesto: capacidad, actividad única activa | Unit (backend) | `backend/puestos.service.test.ts` |
| Historial de puestos donde el voluntario ha colaborado | Unit (backend) | `backend/puestos.service.test.ts` |
| Cálculo de distancia Haversine y ordenación por cercanía | Unit (frontend) | `frontend/haversine.test.ts` |
| Orden de paradas multiparada (más cercano primero) | Unit (frontend) | `frontend/haversine.test.ts` |
| Detección de calles cortadas en la ruta del voluntario | Unit (frontend) | `frontend/routing.test.ts` |
| Radio de bloqueo correcto para incidencias | Unit (frontend) | `frontend/routing.test.ts` |
| Flujo completo voluntario en navegador | E2E (Playwright) | `e2e/voluntario-flujo.spec.ts` |

## Requisitos previos

```bash
# Backend — vitest ya instalado (ver backend/package.json)
cd backend && npm install

# Frontend — dependencias incluidas (vitest, playwright, testing-library)
cd frontend && npm install

# Playwright browsers (solo la primera vez)
cd TEST/feature-funcionalidad-voluntario && npm install
npx playwright install chromium
```

## Ejecutar todos los tests

**Windows (PowerShell):**
```powershell
.\TEST\feature-funcionalidad-voluntario\run-all.ps1
```

**Linux / Mac:**
```bash
bash TEST/feature-funcionalidad-voluntario/run-all.sh
```

> Los tests E2E requieren el frontend corriendo:
> ```bash
> cd frontend && npm run dev
> ```

## Ejecutar por tipo

**Solo tests unitarios de backend** (no necesita servidor ni BD):
```bash
cd backend
npx vitest run --config vitest.feature-funcionalidad-voluntario.config.ts
```

**Solo tests unitarios de frontend** (no necesita servidor):
```bash
cd frontend
npx vitest run --config vitest.feature-funcionalidad-voluntario.config.ts
```

**Solo E2E** (requiere frontend en http://localhost:5173):
```bash
cd TEST/feature-funcionalidad-voluntario
npx playwright test --config playwright.config.ts
```

## Estructura de tests

```
TEST/feature-funcionalidad-voluntario/
├── backend/
│   ├── donaciones.service.test.ts    # 14 casos: crear, listar, actualizar, código QR
│   ├── incidencias.service.test.ts   # 12 casos: asignar, finalizar, comentar con estado
│   └── puestos.service.test.ts       # 10 casos: asignar, capacidad, historial
├── frontend/
│   ├── haversine.test.ts             # 10 casos: distancias, ordenación por cercanía
│   └── routing.test.ts               # 10 casos: segmentos, bloqueos de ruta
├── e2e/
│   └── voluntario-flujo.spec.ts      # 13 casos: selección rol → donaciones → incidencias → puestos
├── vitest.backend.config.ts
├── vitest.frontend.config.ts
├── playwright.config.ts
├── setup.frontend.ts
├── run-all.ps1                       # Windows
└── run-all.sh                        # Linux/Mac
```

## Decisiones de diseño

- Los tests unitarios **no necesitan base de datos** — Prisma está mockeado con `vi.mock`.
- El backend permite que un voluntario tenga **donaciones activas hacia varios puestos** simultáneamente; los tests verifican que no se impone restricción artificial.
- Los tests de incidencias verifican el **control de actividad única**: un voluntario no puede estar en una incidencia si ya tiene donación activa o está en un puesto.
- Los tests de puestos verifican el **control de capacidad**: se bloquea la entrada si el puesto está lleno.
- Al finalizar la ayuda en incidencia se exige **actualizar el estado real de la calle** (CORTADA/TRANSITABLE) con un comentario obligatorio — esto se valida en `createComentarioIncidencia`.
- Los tests de routing verifican que la detección de calles bloqueadas funciona correctamente para **calcular rutas seguras** evitando incidencias CORTADAS.
- Los tests E2E usan datos del modo demo del dashboard — no requieren backend para los flujos de navegación.
