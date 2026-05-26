CREATE TABLE "qr_consumptions" (
  "key" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "puestoId" TEXT NOT NULL,
  "usuarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "qr_consumptions_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "qr_consumptions_puestoId_createdAt_idx"
ON "qr_consumptions"("puestoId", "createdAt");

INSERT INTO "qr_consumptions" ("key", "tipo", "puestoId", "usuarioId", "createdAt")
SELECT DISTINCT ON ("entidadId")
  'SOLICITUD_CIUDADANO:' || "entidadId",
  'SOLICITUD_CIUDADANO',
  COALESCE("datos"->>'puestoId', ''),
  "usuarioId",
  "createdAt"
FROM "audit_logs"
WHERE "accion" = 'QR_SOLICITUD_CIUDADANO_CONFIRMADA'
  AND "entidad" = 'QR_SOLICITUD_CIUDADANO'
ORDER BY "entidadId", "createdAt";
