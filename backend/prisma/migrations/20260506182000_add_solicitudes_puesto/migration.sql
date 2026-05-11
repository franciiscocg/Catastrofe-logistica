-- CreateEnum
CREATE TYPE "EstadoSolicitudPuesto" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "solicitudes_puesto" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "coordinadorId" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "direccion" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" "EstadoSolicitudPuesto" NOT NULL DEFAULT 'PENDIENTE',
    "motivoRechazo" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_puesto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_puesto_estado_createdAt_idx" ON "solicitudes_puesto"("estado", "createdAt");

-- CreateIndex
CREATE INDEX "solicitudes_puesto_usuarioId_estado_idx" ON "solicitudes_puesto"("usuarioId", "estado");

-- AddForeignKey
ALTER TABLE "solicitudes_puesto" ADD CONSTRAINT "solicitudes_puesto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_puesto" ADD CONSTRAINT "solicitudes_puesto_coordinadorId_fkey" FOREIGN KEY ("coordinadorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
