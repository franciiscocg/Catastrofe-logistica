CREATE TABLE "pending_chain_events" (
  "id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "intentos" INTEGER NOT NULL DEFAULT 0,
  "ultimoError" TEXT,
  "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pending_chain_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chain_events" (
  "id" TEXT NOT NULL,
  "sequence" SERIAL NOT NULL,
  "tipo" TEXT NOT NULL,
  "actorId" TEXT,
  "actorRol" TEXT,
  "entidad" TEXT NOT NULL,
  "entidadId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "hashPrevio" TEXT NOT NULL,
  "hashPropio" TEXT NOT NULL,
  "tsaToken" TEXT,
  "tsaTimestamp" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "chain_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pending_chain_events_nextRetryAt_intentos_idx"
ON "pending_chain_events"("nextRetryAt", "intentos");

CREATE UNIQUE INDEX "chain_events_hashPropio_key" ON "chain_events"("hashPropio");
CREATE UNIQUE INDEX "chain_events_sequence_key" ON "chain_events"("sequence");
CREATE INDEX "chain_events_entidad_entidadId_idx" ON "chain_events"("entidad", "entidadId");
