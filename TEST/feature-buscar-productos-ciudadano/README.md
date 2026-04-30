# Tests — feature/buscar-productos-ciudadano

Suite de tests para la funcionalidad de búsqueda de productos implementada en esta rama.

## Qué se testea

| Test | Tipo | Archivo |
|---|---|---|
| `getProductosDisponibles` — extracción de inventario por puesto | Unit | `frontend/productos.test.ts` |
| `getProductoOptions` — agregación y ordenación alfabética | Unit | `frontend/productos.test.ts` |
| `matchProductoNombre` — coincidencia exacta case-insensitive | Unit | `frontend/productos.test.ts` |
| Abrir panel oculta lista de puestos y botones rápidos | E2E | `e2e/buscar-productos.spec.ts` |
| Autocompletado muestra sugerencias al escribir | E2E | `e2e/buscar-productos.spec.ts` |
| Seleccionar producto muestra puesto recomendado con cantidad | E2E | `e2e/buscar-productos.spec.ts` |
| Alerta cuando se intenta calcular ruta sin ubicación | E2E | `e2e/buscar-productos.spec.ts` |
| Indicador de carga durante cálculo de ruta | E2E | `e2e/buscar-productos.spec.ts` |

## Requisitos previos

```bash
# Frontend — dependencias ya instaladas con feature-incidencias-vias
cd frontend && npm install

# Playwright browsers (solo la primera vez)
cd frontend && npx playwright install chromium
```

## Ejecutar todos los tests

**Windows (PowerShell):**
```powershell
.\TEST\feature-buscar-productos-ciudadano\run-all.ps1
```

> Los tests E2E requieren el frontend corriendo:
> ```bash
> cd frontend && npm run dev
> ```

## Ejecutar por tipo

**Solo tests unitarios** (no necesita servidor):
```bash
cd frontend
npx vitest run --config vitest.feature-buscar-productos.config.ts
```

**Solo E2E** (requiere frontend en http://localhost:5173):
```bash
cd TEST/feature-buscar-productos-ciudadano
npx playwright test --config playwright.config.ts
```

## Funciones testadas

Las funciones puras `getProductosDisponibles`, `getProductoOptions` y `matchProductoNombre` se extrajeron de `Dashboard.tsx` a `frontend/src/utils/productos.ts` para hacerlas testables de forma aislada.

- **`getProductosDisponibles(puestos, inventario)`** — aplana el inventario de múltiples puestos en una lista con referencia al puesto
- **`getProductoOptions(disponibles)`** — agrega cantidades del mismo producto, deduplica y ordena alfabéticamente en español
- **`matchProductoNombre(texto, opciones)`** — coincidencia exacta (normalizada) del texto con las opciones disponibles
