# Tests — funcionalidad-coordinador

Pruebas de la funcionalidad añadida en la rama `feature/funcionalidad-coordinador`:

- **Panel del coordinador como vista administrativa** (listado de usuarios y métricas de tarjeta de puestos).
- **Eliminación administrativa de usuarios e incidencias** (con las salvaguardas correspondientes).
- **Modelo de puesto con responsable principal único**, cambio de responsable y voluntarios de apoyo.
- **Visualización del tipo de puesto y métricas de tarjeta** (responsable único, personas totales, estado operativo).

## Estructura

```
backend/
  coordinador-usuarios.test.ts             # GET/PATCH/DELETE /api/users/coordinador
  coordinador-incidencias.test.ts          # DELETE/PATCH/voluntarios de /api/incidencias
  coordinador-puestos-responsable.test.ts  # responsable principal, voluntarios de apoyo y métricas
vitest.backend.config.ts
```

Las pruebas son unitarias sobre los routers de Fastify (`app.inject`), con Prisma, los
middleware de autenticación/roles y la capa de realtime simulados (`vi.mock`), siguiendo el
mismo patrón que `TEST/coordinar-puesto-19-estados-puesto`.

## Ejecución

Los tests se ejecutan **desde `backend/`** (el `vitest.backend.config.ts` resuelve `fastify`
desde `backend/node_modules`):

```powershell
cd backend
npx vitest run --config ..\TEST\funcionalidad-coordinador\vitest.backend.config.ts
```

O con el script incluido desde esta carpeta:

```powershell
TEST\funcionalidad-coordinador\run-all.ps1
```
