# Despliegue gratuito: Render

Esta configuracion despliega la app con:

- Render Free: frontend y backend.
- Render Free: PostgreSQL.
- Sin MinIO y sin Redis.

## 1. Crear los servicios en Render

1. Sube este repositorio a GitHub.
2. En Render, crea un Blueprint desde el repositorio.
3. Render detectara `render.yaml` y creara:
   - `catastrofe-logistica-backend`
   - `catastrofe-logistica-frontend`
   - `catastrofe-logistica-db`

La base de datos se declara en `render.yaml`, asi que no tienes que crearla a mano
ni copiar `DATABASE_URL` o `DIRECT_URL`: Render las inyecta automaticamente en el
backend.

## 2. Variables del backend en Render

En `catastrofe-logistica-backend`, configura:

```text
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

`JWT_SECRET`, `DATABASE_URL` y `DIRECT_URL` se generan desde el Blueprint.
`MAIL_FROM`, `SMTP_HOST`, `SMTP_USER` y `SMTP_PASS` solo son necesarios si quieres
enviar correos reales.

## 3. Variables del frontend en Render

En `catastrofe-logistica-frontend`, configura:

```text
VITE_API_URL=https://catastrofe-logistica-backend.onrender.com
```

## 4. Orden recomendado

1. Crea el Blueprint en Render.
2. Espera a que `catastrofe-logistica-db` este disponible.
3. Despliega el backend.
4. Copia la URL publica del backend.
5. Pega `VITE_API_URL` en frontend.
6. Despliega frontend.
7. Copia la URL publica del frontend.
8. Pega `FRONTEND_URL` y `APP_PUBLIC_URL` en backend.
9. Redeploy backend.

Si ya existian los servicios antes de anadir `catastrofe-logistica-db` al
`render.yaml`, no basta con pulsar "Redeploy" en el backend: eso solo despliega
el codigo. En Render debes entrar en el Blueprint y pulsar "Sync" / "Apply" para
que cree la base y reescriba `DATABASE_URL` y `DIRECT_URL` desde `fromDatabase`.

Si el backend sigue mostrando una URL antigua, borra en el servicio backend las
variables manuales `DATABASE_URL` y `DIRECT_URL` que apunten a Supabase y vuelve
a sincronizar el Blueprint.

Ejemplo del error de una variable antigua de Supabase:

```text
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-...pooler.supabase.com:5432"
FATAL: (ENOTFOUND) tenant/user ... not found
```

Cuando esta bien conectado a Render Postgres, el host del datasource ya no debe
ser `*.supabase.com`.

## 5. Recuperacion de contrasena por email

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
- Render Postgres Free tiene 1 GB, solo permite una base gratuita activa por workspace
  y caduca a los 30 dias. Render da un periodo de gracia de 14 dias para actualizarla
  antes de borrar los datos.
- Con `EMAIL_VERIFICATION_REQUIRED=false`, los usuarios nuevos quedan verificados automaticamente para facilitar la demo sin SMTP.
