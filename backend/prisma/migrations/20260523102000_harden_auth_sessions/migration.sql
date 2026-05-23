ALTER TABLE "usuarios"
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

UPDATE "usuarios" SET "emailVerified" = true, "emailVerifiedAt" = COALESCE("emailVerifiedAt", CURRENT_TIMESTAMP);

CREATE TABLE "refresh_tokens" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE INDEX "refresh_tokens_usuarioId_revokedAt_idx" ON "refresh_tokens"("usuarioId", "revokedAt");
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "account_verification_tokens" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_verification_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "account_verification_tokens_tokenHash_key" ON "account_verification_tokens"("tokenHash");
CREATE INDEX "account_verification_tokens_usuarioId_usedAt_idx" ON "account_verification_tokens"("usuarioId", "usedAt");
CREATE INDEX "account_verification_tokens_expiresAt_idx" ON "account_verification_tokens"("expiresAt");
ALTER TABLE "account_verification_tokens" ADD CONSTRAINT "account_verification_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_usuarioId_usedAt_idx" ON "password_reset_tokens"("usuarioId", "usedAt");
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
