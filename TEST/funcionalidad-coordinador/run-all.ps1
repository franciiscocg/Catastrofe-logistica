$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TEST_DIR = $PSScriptRoot
$FAILED = 0

# ── Instalar dependencias ─────────────────────────────────────────────────────
Write-Host "Verificando dependencias..." -ForegroundColor Gray
Set-Location "$ROOT\backend"
npm install --silent 2>$null

# ── Backend unit tests (ejecutados desde backend/ para resolver fastify) ──────
Write-Host ""
Write-Host "== Tests unitarios backend (funcionalidad-coordinador) ==" -ForegroundColor Cyan
Set-Location "$ROOT\backend"
npx vitest run --config "$TEST_DIR\vitest.backend.config.ts"
if ($LASTEXITCODE -ne 0) { $FAILED++ }

# ── Resultado ─────────────────────────────────────────────────────────────────
Set-Location $ROOT
Write-Host ""
if ($FAILED -eq 0) {
  Write-Host "== TODOS LOS TESTS PASARON ==" -ForegroundColor Green
} else {
  Write-Host "== $FAILED SUITE(S) FALLARON ==" -ForegroundColor Red
  exit 1
}
