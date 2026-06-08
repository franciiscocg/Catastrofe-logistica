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
MAIL_FROM="Catastrofe Logistica <tu-correo@tu-dominio.com>"
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_usuario_smtp
SMTP_PASS=tu_password_smtp
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

## 6. Recuperacion de contrasena por email

La recuperacion de contrasena necesita SMTP configurado en el backend. Si `SMTP_HOST`
esta vacio, el backend no envia correo real y solo escribe el enlace en la consola
cuando se ejecuta en desarrollo.

Ejemplo con Gmail:

```text
MAIL_FROM="Catastrofe Logistica <tu-email@gmail.com>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu_contrasena_de_aplicacion
```

En Gmail no sirve la contrasena normal de la cuenta: hay que crear una contrasena
de aplicacion desde la configuracion de seguridad de Google.

## Notas

- El backend de Render Free puede dormirse tras inactividad.
- Supabase Free tiene limites de uso y almacenamiento.
- Con `EMAIL_VERIFICATION_REQUIRED=false`, los usuarios nuevos quedan verificados automaticamente para facilitar la demo sin SMTP.
