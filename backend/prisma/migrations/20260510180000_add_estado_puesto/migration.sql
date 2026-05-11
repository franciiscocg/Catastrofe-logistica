DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoPuesto') THEN
    CREATE TYPE "EstadoPuesto" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');
  END IF;
END $$;

ALTER TABLE "puestos_emergencia"
ADD COLUMN IF NOT EXISTS "estadoSolicitud" "EstadoPuesto" NOT NULL DEFAULT 'APROBADO',
ADD COLUMN IF NOT EXISTS "motivoRechazo" TEXT;
