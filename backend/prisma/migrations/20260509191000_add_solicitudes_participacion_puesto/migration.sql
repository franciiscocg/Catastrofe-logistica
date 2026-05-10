-- CreateEnum
CREATE TYPE "EstadoSolicitudParticipacionPuesto" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "solicitudes_participacion_puesto" (
    "id" TEXT NOT NULL,
    "puestoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "responsableId" TEXT,
    "estado" "EstadoSolicitudParticipacionPuesto" NOT NULL DEFAULT 'PENDIENTE',
    "motivoRechazo" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_participacion_puesto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_participacion_puesto_puestoId_estado_createdAt_idx" ON "solicitudes_participacion_puesto"("puestoId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "solicitudes_participacion_puesto_usuarioId_estado_idx" ON "solicitudes_participacion_puesto"("usuarioId", "estado");

-- AddForeignKey
ALTER TABLE "solicitudes_participacion_puesto" ADD CONSTRAINT "solicitudes_participacion_puesto_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "puestos_emergencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_participacion_puesto" ADD CONSTRAINT "solicitudes_participacion_puesto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_participacion_puesto" ADD CONSTRAINT "solicitudes_participacion_puesto_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
