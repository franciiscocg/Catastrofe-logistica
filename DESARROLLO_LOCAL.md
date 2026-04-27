# Guía de desarrollo local

## Requisitos previos

| Herramienta | Versión mínima | Descarga |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org |
| Docker Desktop | cualquiera | https://www.docker.com/products/docker-desktop |

Verifica que están instalados:
```bash
node -v      # v20+
docker -v    # cualquier versión reciente
```

---

## Primera vez (setup inicial)

### 1. Variables de entorno

```bash
# Copia el archivo de ejemplo (solo la primera vez)
cp .env.example .env           # Linux/Mac
copy .env.example .env         # Windows CMD
Copy-Item .env.example .env    # Windows PowerShell
```

El `.env` de desarrollo no necesita cambios — funciona tal cual.

### 2. Levantar la base de datos y Redis

```bash
docker compose up postgres redis -d
```

Espera ~10 segundos a que los contenedores estén `healthy`:
```bash
docker ps   # columna STATUS debe decir "(healthy)"
```

### 3. Aplicar el schema a la base de datos

> **Nota Windows:** El migration engine de Prisma 5.x tiene un bug en Windows con Docker que impide usar `prisma migrate dev` directamente. Usa estos comandos alternativos:

```bash
cd backend

# Genera el SQL del schema y aplícalo directamente al contenedor
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | docker exec -i catlogistica_postgres psql -U postgres -d catlogistica

# Crea la tabla de migraciones de Prisma y marca la migración como aplicada
docker exec catlogistica_postgres psql -U postgres -d catlogistica -c "
CREATE TABLE IF NOT EXISTS \"_prisma_migrations\" (
  id VARCHAR(36) PRIMARY KEY,
  checksum VARCHAR(64) NOT NULL,
  finished_at TIMESTAMPTZ,
  migration_name VARCHAR(255) NOT NULL,
  logs TEXT,
  rolled_back_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_steps_count INT NOT NULL DEFAULT 0
);
INSERT INTO \"_prisma_migrations\" (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES ('init-manual', 'manual', now(), '20240101000000_init', 1)
ON CONFLICT DO NOTHING;"

# Genera el cliente de Prisma (necesario después de cualquier cambio al schema)
npx prisma generate
```

### 4. Instalar dependencias del frontend

```bash
cd ../frontend
npm install
```

---

## Arrancar la aplicación

Necesitas **dos terminales**.

**Terminal 1 — Backend (API):**
```bash
cd backend
npm run dev
# API disponible en http://localhost:3000
# Healthcheck: http://localhost:3000/health
```

**Terminal 2 — Frontend (PWA):**
```bash
cd frontend
npm run dev
# App disponible en http://localhost:5173
```

Abre el navegador en `http://localhost:5173` y verás la pantalla de selección de rol.

---

## Comandos útiles del día a día

### Base de datos

```bash
# Ver tablas y datos (GUI web de Prisma)
cd backend && npx prisma studio

# Ver logs de PostgreSQL
docker logs catlogistica_postgres -f

# Conectar directamente a la base de datos
docker exec -it catlogistica_postgres psql -U postgres -d catlogistica
```

### Cuando cambias el schema de Prisma (`prisma/schema.prisma`)

```bash
cd backend

# 1. Genera el diff entre el estado actual y el nuevo schema
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script

# 2. Si hay cambios, aplícalos manualmente (workaround Windows):
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script \
  | docker exec -i catlogistica_postgres psql -U postgres -d catlogistica

# 3. Regenera el cliente
npx prisma generate
```

### Docker

```bash
# Parar los contenedores (conserva los datos)
docker compose stop

# Volver a arrancar los contenedores
docker compose up postgres redis -d

# Borrar TODO y empezar desde cero (¡borra los datos!)
docker compose down -v
```

---

## Estructura del proyecto

```
Catastrofe-logistica/
├── frontend/          PWA con React + Vite + TailwindCSS
├── backend/           API con Fastify + Prisma + PostgreSQL
├── docker-compose.yml PostgreSQL, Redis, MinIO
├── .env.example       Plantilla de variables de entorno
└── .env               Variables locales (NO subir a git)
```

## Puertos por defecto

| Servicio | Puerto | URL |
|---|---|---|
| Frontend (PWA) | 5173 | http://localhost:5173 |
| Backend (API) | 3000 | http://localhost:3000 |
| PostgreSQL | 5432 | — |
| Redis | 6379 | — |
| MinIO (objetos) | 9000 | http://localhost:9001 (consola) |
