-- CreateEnum
CREATE TYPE "EstadoAsignacionIncidencia" AS ENUM ('ACTIVA', 'FINALIZADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "donaciones"
ADD COLUMN "entregaCodigo" TEXT,
ADD COLUMN "entregaCodigoGeneradoAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "asignaciones_incidencias" (
  "id" TEXT NOT NULL,
  "voluntarioId" TEXT NOT NULL,
  "incidenciaId" TEXT NOT NULL,
  "estado" "EstadoAsignacionIncidencia" NOT NULL DEFAULT 'ACTIVA',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "asignaciones_incidencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donaciones_entregaCodigo_key" ON "donaciones"("entregaCodigo");

-- CreateIndex
CREATE INDEX "asignaciones_incidencias_voluntarioId_estado_idx" ON "asignaciones_incidencias"("voluntarioId", "estado");

-- CreateIndex
CREATE INDEX "asignaciones_incidencias_incidenciaId_estado_idx" ON "asignaciones_incidencias"("incidenciaId", "estado");

-- AddForeignKey
ALTER TABLE "asignaciones_incidencias"
ADD CONSTRAINT "asignaciones_incidencias_voluntarioId_fkey"
FOREIGN KEY ("voluntarioId") REFERENCES "voluntarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_incidencias"
ADD CONSTRAINT "asignaciones_incidencias_incidenciaId_fkey"
FOREIGN KEY ("incidenciaId") REFERENCES "incidencias_via"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
