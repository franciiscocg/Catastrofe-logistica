CREATE TABLE "puesto_trabajadores" (
  "id" TEXT NOT NULL,
  "puestoId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "addedBy" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "puesto_trabajadores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "puesto_trabajadores_puestoId_usuarioId_key"
ON "puesto_trabajadores"("puestoId", "usuarioId");

ALTER TABLE "puesto_trabajadores"
ADD CONSTRAINT "puesto_trabajadores_puestoId_fkey"
FOREIGN KEY ("puestoId") REFERENCES "puestos_emergencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "puesto_trabajadores"
ADD CONSTRAINT "puesto_trabajadores_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
