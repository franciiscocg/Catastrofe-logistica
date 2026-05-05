# Tests — feature/incidencias-vias

Suite de tests para verificar toda la funcionalidad implementada en esta rama.

## Qué se testea

| Test | Tipo | Archivo |
|---|---|---|
| Lógica de servicio: crear, listar, actualizar incidencias | Unit (backend) | `backend/incidencias.service.test.ts` |
| Detección de duplicados y resolución de catástrofe | Unit (backend) | `backend/incidencias.service.test.ts` |
| Fórmula Haversine y ordenación por distancia | Unit (frontend) | `frontend/haversine.test.ts` |
| Algoritmo de detección de calles bloqueadas en ruta | Unit (frontend) | `frontend/routing.test.ts` |
| Pantalla de selección de rol (4 roles, navegación) | Component (frontend) | `frontend/RoleSelection.test.tsx` |
| Flujo completo ciudadano en navegador | E2E (Playwright) | `e2e/ciudadano-flujo.spec.ts` |

## Requisitos previos

```bash
# Backend — instalar vitest si no está
cd backend && npm install

# Frontend — dependencias ya incluidas (vitest, playwright, testing-library)
cd frontend && npm install

# Playwright browsers (solo la primera vez)
cd frontend && npx playwright install chromium
```

## Ejecutar todos los tests

**Windows (PowerShell):**
```powershell
.\TEST\feature-incidencias-vias\run-all.ps1
```

**Linux / Mac:**
```bash
bash TEST/feature-incidencias-vias/run-all.sh
```

> Los tests E2E requieren el frontend corriendo:
> ```bash
> cd frontend && npm run dev
> ```

## Ejecutar por tipo

**Solo tests unitarios de backend** (no necesita servidor ni BD):
```bash
cd backend
npx vitest run --config vitest.feature-incidencias-vias.config.ts
```

**Solo tests unitarios de frontend** (no necesita servidor):
```bash
cd frontend
npx vitest run --config vitest.feature-incidencias-vias.config.ts
```

**Solo E2E** (requiere frontend en http://localhost:5173):
```bash
cd frontend
npx playwright test --config playwright.feature-incidencias-vias.config.ts
```

**Modo watch** (para desarrollo):
```bash
cd backend
npx vitest --config vitest.feature-incidencias-vias.config.ts
```

## Estructura de tests

```
TEST/feature-incidencias-vias/
├── backend/
│   └── incidencias.service.test.ts   # 16 casos: crear, listar, actualizar, comentar
├── frontend/
│   ├── haversine.test.ts             # 8 casos: distancias, ordenación
│   ├── routing.test.ts               # 15 casos: segmentos, bloqueos de ruta
│   └── RoleSelection.test.tsx        # 8 casos: renderizado, navegación por rol
├── e2e/
│   └── ciudadano-flujo.spec.ts       # 12 casos: selección rol → dashboard → inventario → reporte
├── vitest.backend.config.ts
├── vitest.frontend.config.ts
├── playwright.config.ts
├── setup.frontend.ts
├── run-all.ps1                       # Windows
└── run-all.sh                        # Linux/Mac
```

## Decisiones de diseño

- Los tests unitarios **no necesitan base de datos** — Prisma está mockeado con `vi.mock`.
- Los tests de frontend son **completamente offline** — ninguno llama a APIs externas.
- Los tests E2E usan datos mock del dashboard (hardcoded en el código), por lo que tampoco requieren el backend para los flujos de inventario y navegación.
- Para el test de reporte de incidencia E2E, si el backend no está corriendo, la incidencia se guarda offline (cola de sincronización) y el test también pasa.
