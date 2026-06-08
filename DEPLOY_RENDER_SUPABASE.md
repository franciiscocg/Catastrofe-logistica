# Despliegue gratuito: Render + Supabase

Esta configuracion despliega la app con:

- Render Free: frontend y backend.
- Supabase Free: PostgreSQL.
- Sin MinIO y sin Redis.

## 1. Crear la base de datos en Supabase

1. Crea un proyecto en Supabase.
2. Ve a `Project Settings > Database`.
3. Copia la connection string de Postgres.
4. Usa la URL de conexion con pooler si Supabase la recomienda para IPv4.

La URL de pooler/session se usara en Render como `DATABASE_URL`.
La URL directa se usara como `DIRECT_URL` para ejecutar migraciones de Prisma.

## 2. Crear los servicios en Render

1. Sube este repositorio a GitHub.
2. En Render, crea un Blueprint desde el repositorio.
3. Render detectara `render.yaml` y creara:
   - `catastrofe-logistica-backend`
   - `catastrofe-logistica-frontend`

## 3. Variables del backend en Render

En `catastrofe-logistica-backend`, configura:

```text
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
JWT_SECRET=un_valor_aleatorio_de_32_caracteres_o_mas
FRONTEND_URL=https://catastrofe-logistica-frontend.onrender.com
APP_PUBLIC_URL=https://catastrofe-logistica-frontend.onrender.com
EMAIL_VERIFICATION_REQUIRED=false
COOKIE_SAME_SITE=none
```

`JWT_SECRET` puede generarse con:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 4. Variables del frontend en Render

En `catastrofe-logistica-frontend`, configura:

```text
VITE_API_URL=https://catastrofe-logistica-backend.onrender.com
```

## 5. Orden recomendado

1. Crea Supabase y copia `DATABASE_URL`.
2. Crea el Blueprint en Render.
3. Pega las variables pendientes.
4. Despliega primero backend.
5. Copia la URL publica del backend.
6. Pega `VITE_API_URL` en frontend.
7. Despliega frontend.
8. Copia la URL publica del frontend.
9. Pega `FRONTEND_URL` y `APP_PUBLIC_URL` en backend.
10. Redeploy backend.

## Notas

- El backend de Render Free puede dormirse tras inactividad.
- Supabase Free tiene limites de uso y almacenamiento.
- Con `EMAIL_VERIFICATION_REQUIRED=false`, los usuarios nuevos quedan verificados automaticamente para facilitar la demo sin SMTP.
