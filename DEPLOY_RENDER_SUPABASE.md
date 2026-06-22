# Despliegue gratuito: Render

Esta configuracion despliega la app con:

- Render Free: frontend PWA y backend en un unico servicio web.
- Render Free: PostgreSQL.
- Sin MinIO y sin Redis.

## 1. Crear los servicios en Render

1. Sube este repositorio a GitHub.
2. En Render, crea un Blueprint desde el repositorio.
3. Render detectara `render.yaml` y creara:
   - `catastrofe-logistica`
   - `catastrofe-logistica-db`

La base de datos se declara en `render.yaml`, asi que no tienes que crearla a mano
ni copiar `DATABASE_URL` o `DIRECT_URL`: Render las inyecta automaticamente en el
backend.

## 2. Variables del backend en Render

En `catastrofe-logistica`, configura:

```text
FRONTEND_URL=https://catastrofe-logistica.onrender.com
APP_PUBLIC_URL=https://catastrofe-logistica.onrender.com
COOKIE_SAME_SITE=lax
```

`JWT_SECRET`, `DATABASE_URL` y `DIRECT_URL` se generan desde el Blueprint.

La PWA usa `/api` en el mismo origen. No configures `VITE_API_URL` en producción.

## 4. Orden recomendado

1. Crea el Blueprint en Render.
2. Espera a que `catastrofe-logistica-db` este disponible.
3. Despliega el servicio web combinado.
4. Copia su URL publica en `FRONTEND_URL` y `APP_PUBLIC_URL`.
5. Haz redeploy del servicio.

Servir PWA y API bajo el mismo origen es intencionado: evita cookies de terceros y
permite restaurar la sesión de forma fiable antes y después de trabajar sin conexión.

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

## 5. Registro y recuperación de contraseña

El registro no requiere confirmar la dirección de correo y la aplicación no envía
mensajes electrónicos. La recuperación se realiza directamente en la aplicación
comprobando la combinación de correo y DNI/NIE, con un máximo de cinco intentos
cada quince minutos por dirección IP. Al cambiar la contraseña se cierran todas
las sesiones anteriores del usuario.

## Notas

- El backend de Render Free puede dormirse tras inactividad.
- Render Postgres Free tiene 1 GB, solo permite una base gratuita activa por workspace
  y caduca a los 30 dias. Render da un periodo de gracia de 14 dias para actualizarla
  antes de borrar los datos.
