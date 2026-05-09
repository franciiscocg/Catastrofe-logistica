# Tests: registro de usuarios, login y solicitudes de puesto

Suite para la PR #22.

## Ejecutar

Desde la raiz del repositorio:

```powershell
.\TEST\feature-registro-usuarios\run-all.ps1
```

Tambien se pueden ejecutar por separado:

```powershell
cd backend
node node_modules\vitest\vitest.mjs run --config vitest.feature-registro-usuarios.config.ts

cd ..\frontend
node node_modules\vitest\vitest.mjs run --config vitest.feature-registro-usuarios.config.ts
```
