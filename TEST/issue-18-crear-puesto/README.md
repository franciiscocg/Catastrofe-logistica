# Tests - issue/18 crear puesto

Suite para verificar el flujo actual de creacion y aprobacion de puestos de emergencia:
registro unificado de usuario, solicitud de puesto por parte del usuario autenticado,
revision del coordinador y activacion del puesto.

## Que se testea

| Test | Tipo | Archivo |
|---|---|---|
| GET /solicitudes/mia no requiere rol PUESTO_EMERGENCIA | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| POST /solicitudes crea una solicitud sin conceder rol de puesto | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| POST /solicitudes errores: puesto/solicitud ya existente, campos invalidos | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| POST /solicitudes/:id/aceptar crea PuestoEmergencia activo y concede PUESTO_EMERGENCIA | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| POST /solicitudes/:id/aceptar errores: ya revisada, solicitante con puesto, sin permiso | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| POST /solicitudes/:id/rechazar con y sin motivo | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| GET /solicitudes lista solicitudes solo para COORDINADOR | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| registerUser crea siempre roles CIUDADANO + VOLUNTARIO y perfil voluntario | Unit (backend) | `backend/auth-registro-puesto.test.ts` |
| registerUser ignora payloads legacy de puesto en /auth/register | Unit (backend) | `backend/auth-registro-puesto.test.ts` |
| loginUser con email y con DNI normalizado a mayusculas | Unit (backend) | `backend/auth-registro-puesto.test.ts` |
| RegisterPuesto muestra formulario sin solicitud previa | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |
| RegisterPuesto muestra estado PENDIENTE con datos de la solicitud | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |
| RegisterPuesto muestra RECHAZADA con motivo y permite reenviar | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |
| RegisterPuesto redirige a /puesto cuando estado es ACEPTADA | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |
| RoleSelection navega a /auth/registro-puesto para solicitar puesto | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |
| CoordinadorDashboard puede aceptar y rechazar solicitudes | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |

## Requisitos previos

```bash
cd backend && npm install
cd frontend && npm install
cd TEST/issue-18-crear-puesto && npm install
```

## Ejecutar todos los tests

Windows PowerShell:

```powershell
.\TEST\issue-18-crear-puesto\run-all.ps1
```

## Ejecutar por tipo

Solo tests de backend:

```bash
cd TEST/issue-18-crear-puesto
npx vitest run --config vitest.backend.config.ts
```

Solo tests de frontend:

```bash
cd TEST/issue-18-crear-puesto
npx vitest run --config vitest.frontend.config.ts
```

## Estructura

```text
TEST/issue-18-crear-puesto/
|-- backend/
|   |-- solicitud-puesto.test.ts
|   `-- auth-registro-puesto.test.ts
|-- frontend/
|   `-- crear-puesto-flow.test.tsx
|-- vitest.backend.config.ts
|-- vitest.frontend.config.ts
|-- setup.frontend.ts
|-- package.json
`-- run-all.ps1
```

## Decisiones de diseno

- El registro es unico: `registerUser` no crea puestos ni solicitudes. Todos los usuarios nacen como `CIUDADANO` y `VOLUNTARIO`.
- `GET /solicitudes/mia` usa solo `requireAuth`, porque cualquier usuario autenticado puede consultar el estado de su solicitud.
- `POST /solicitudes` crea una solicitud pendiente, pero no concede `PUESTO_EMERGENCIA`.
- El rol `PUESTO_EMERGENCIA` se concede al aceptar la solicitud y crear el puesto.
- Los tests unitarios de backend usan Prisma mockeado con `vi.hoisted` y `vi.mock`; no requieren base de datos.
- Los tests de frontend usan `apiClient` mockeado; no requieren backend.
