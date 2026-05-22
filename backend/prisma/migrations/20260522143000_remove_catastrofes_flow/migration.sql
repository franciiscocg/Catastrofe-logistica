ALTER TABLE "incidencias_via" DROP CONSTRAINT IF EXISTS "incidencias_via_catastrofeId_fkey";
ALTER TABLE "puestos_emergencia" DROP CONSTRAINT IF EXISTS "puestos_emergencia_catastrofeId_fkey";

DROP INDEX IF EXISTS "incidencias_via_catastrofeId_createdAt_idx";

ALTER TABLE "incidencias_via" DROP COLUMN IF EXISTS "catastrofeId";
ALTER TABLE "puestos_emergencia" DROP COLUMN IF EXISTS "catastrofeId";

DROP TABLE IF EXISTS "catastrofes";
DROP TYPE IF EXISTS "FaseCatastrofe";
