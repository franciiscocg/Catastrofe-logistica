CREATE TYPE "EstadoAsignacionPuesto" AS ENUM ('ACTIVA', 'FINALIZADA', 'CANCELADA');

ALTER TABLE "puestos_emergencia"
ADD COLUMN "capacidadTrabajo" INTEGER NOT NULL DEFAULT 6;

CREATE TABLE "asignaciones_puestos" (
  "id" TEXT NOT NULL,
  "voluntarioId" TEXT NOT NULL,
  "puestoId" TEXT NOT NULL,
  "estado" "EstadoAsignacionPuesto" NOT NULL DEFAULT 'ACTIVA',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "asignaciones_puestos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "asignaciones_puestos_voluntarioId_estado_idx" ON "asignaciones_puestos"("voluntarioId", "estado");
CREATE INDEX "asignaciones_puestos_puestoId_estado_idx" ON "asignaciones_puestos"("puestoId", "estado");

ALTER TABLE "asignaciones_puestos"
ADD CONSTRAINT "asignaciones_puestos_voluntarioId_fkey"
FOREIGN KEY ("voluntarioId") REFERENCES "voluntarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asignaciones_puestos"
ADD CONSTRAINT "asignaciones_puestos_puestoId_fkey"
FOREIGN KEY ("puestoId") REFERENCES "puestos_emergencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
