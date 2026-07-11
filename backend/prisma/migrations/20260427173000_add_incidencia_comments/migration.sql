-- CreateTable
CREATE TABLE "comentarios_incidencias_via" (
    "id" TEXT NOT NULL,
    "incidenciaId" TEXT NOT NULL,
    "autorId" TEXT,
    "estado" "EstadoVia" NOT NULL,
    "comentario" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_incidencias_via_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comentarios_incidencias_via_incidenciaId_createdAt_idx" ON "comentarios_incidencias_via"("incidenciaId", "createdAt");

-- AddForeignKey
ALTER TABLE "comentarios_incidencias_via" ADD CONSTRAINT "comentarios_incidencias_via_incidenciaId_fkey" FOREIGN KEY ("incidenciaId") REFERENCES "incidencias_via"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_incidencias_via" ADD CONSTRAINT "comentarios_incidencias_via_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
