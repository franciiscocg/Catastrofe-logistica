CREATE TYPE "EstadoDonacion" AS ENUM ('PENDIENTE', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA');

CREATE TABLE "donaciones" (
  "id" TEXT NOT NULL,
  "voluntarioId" TEXT NOT NULL,
  "puestoId" TEXT NOT NULL,
  "productoId" TEXT NOT NULL,
  "cantidad" DOUBLE PRECISION NOT NULL,
  "unidad" TEXT NOT NULL,
  "estado" "EstadoDonacion" NOT NULL DEFAULT 'PENDIENTE',
  "comentario" TEXT,
  "eta" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "donaciones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "donaciones_voluntarioId_estado_idx" ON "donaciones"("voluntarioId", "estado");
CREATE INDEX "donaciones_puestoId_estado_idx" ON "donaciones"("puestoId", "estado");
CREATE INDEX "donaciones_productoId_idx" ON "donaciones"("productoId");

ALTER TABLE "donaciones" ADD CONSTRAINT "donaciones_voluntarioId_fkey" FOREIGN KEY ("voluntarioId") REFERENCES "voluntarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donaciones" ADD CONSTRAINT "donaciones_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "puestos_emergencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donaciones" ADD CONSTRAINT "donaciones_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
