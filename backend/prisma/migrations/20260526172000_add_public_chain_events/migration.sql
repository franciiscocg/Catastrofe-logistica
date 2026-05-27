-- DropIndex
DROP INDEX IF EXISTS "chain_events_sequence_idx";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "chain_events_sequence_key" ON "chain_events"("sequence");

