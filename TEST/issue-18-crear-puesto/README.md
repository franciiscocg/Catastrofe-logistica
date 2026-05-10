# Tests — features/issue-18-crear-puesto

Suite para verificar el flujo completo de creación y aprobación de puestos de emergencia:
solicitud por parte del usuario, revisión del coordinador y activación del puesto.

## Qué se testea

| Test | Tipo | Archivo |
|---|---|---|
| GET /solicitudes/mia no requiere rol PUESTO_EMERGENCIA | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| POST /solicitudes crea solicitud y añade rol | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| POST /solicitudes errores: puesto/solicitud ya existente, campos inválidos | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| POST /solicitudes/:id/aceptar crea PuestoEmergencia activo | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| POST /solicitudes/:id/aceptar errores: sin catástrofe, ya revisada, sin permiso | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| POST /solicitudes/:id/rechazar con y sin motivo | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| GET /solicitudes lista solicitudes (solo COORDINADOR) | Unit (backend) | `backend/solicitud-puesto.test.ts` |
| registerUser normal → roles CIUDADANO + VOLUNTARIO, puesto=null | Unit (backend) | `backend/auth-registro-puesto.test.ts` |
| registerUser con puesto → rol PUESTO_EMERGENCIA, solicitud PENDIENTE | Unit (backend) | `backend/auth-registro-puesto.test.ts` |
| loginUser con email y con DNI (normalización uppercase) | Unit (backend) | `backend/auth-registro-puesto.test.ts` |
| RegisterPuesto muestra formulario sin solicitud previa | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |
| RegisterPuesto muestra estado PENDIENTE con datos de la solicitud | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |
| RegisterPuesto muestra RECHAZADA con motivo y permite reenviar | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |
| RegisterPuesto redirige a /puesto cuando estado es ACEPTADA | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |
| RoleSelection navega a /auth/registro-puesto para el rol Puesto | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |
| CoordinadorDashboard puede aceptar y rechazar solicitudes | Component (frontend) | `frontend/crear-puesto-flow.test.tsx` |

## Requisitos previos

```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install

# Test local (vitest + @vitejs/plugin-react + jsdom)
cd TEST/issue-18-crear-puesto && npm install
```

## Ejecutar todos los tests

**Windows (PowerShell):**
```powershell
.\TEST\issue-18-crear-puesto\run-all.ps1
```

## Ejecutar por tipo

**Solo tests de backend:**
```bash
cd TEST/issue-18-crear-puesto
npx vitest run --config vitest.backend.config.ts
```

**Solo tests de frontend:**
```bash
cd TEST/issue-18-crear-puesto
npx vitest run --config vitest.frontend.config.ts
```

## Estructura

```
TEST/issue-18-crear-puesto/
├── backend/
│   ├── solicitud-puesto.test.ts    # 21 casos: router puestos (solicitudes, aceptar, rechazar)
│   └── auth-registro-puesto.test.ts # 12 casos: auth.service registro con/sin puesto + login
├── frontend/
│   └── crear-puesto-flow.test.tsx  # 18 casos: RegisterPuesto, RoleSelection, Coordinador
├── vitest.backend.config.ts
├── vitest.frontend.config.ts
├── setup.frontend.ts               # @testing-library/jest-dom
├── package.json                    # vitest + @vitejs/plugin-react + jsdom
└── run-all.ps1
```

## Decisiones de diseño

- `GET /solicitudes/mia` usa solo `requireAuth` (sin `requireRole`). El rol `PUESTO_EMERGENCIA`
  se añade durante la creación de la solicitud, por lo que el JWT del usuario aún no lo incluye
  hasta que vuelva a iniciar sesión. El endpoint es seguro porque filtra por `usuarioId` del token.
- Los tests unitarios de backend usan **Prisma mockeado** con `vi.hoisted` + `vi.mock`.
  No requieren base de datos.
- Los tests de frontend usan **apiClient mockeado** con `vi.mock`. No requieren backend.
- El `$transaction` mock pasa `tx` idéntico a `prismaMock` para simular la transacción.
- Los alias de la config de frontend apuntan a `frontend/node_modules` para no duplicar
  dependencias pesadas (React, testing-library). Solo `vitest`, `@vitejs/plugin-react`
  y `jsdom` se instalan localmente.
