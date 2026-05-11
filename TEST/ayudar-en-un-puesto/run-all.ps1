$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TEST_DIR = $PSScriptRoot
$FAILED = 0
$NODE = if ($env:NODE_EXE) { $env:NODE_EXE } else { "node" }

# ── Instalar dependencias ─────────────────────────────────────────────────────
Write-Host "Verificando dependencias..." -ForegroundColor Gray
Set-Location "$ROOT\backend"
npm install --silent 2>$null
Set-Location "$ROOT\frontend"
npm install --silent 2>$null
Set-Location $TEST_DIR
npm install --silent 2>$null

# ── Backend unit tests (ejecutados desde backend/ para resolver fastify) ──────
Write-Host ""
Write-Host "== Tests unitarios backend ==" -ForegroundColor Cyan
Set-Location "$ROOT\backend"
& $NODE "node_modules/vitest/vitest.mjs" run --config "$TEST_DIR\vitest.backend.config.ts"
if ($LASTEXITCODE -ne 0) { $FAILED++ }

# ── E2E tests ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "== Tests E2E Playwright (Playwright gestiona el servidor en :5201) ==" -ForegroundColor Cyan
$proc = Get-NetTCPConnection -LocalPort 5201 -State Listen -ErrorAction SilentlyContinue
if ($proc) {
  Write-Host "Puerto 5201 ocupado. Liberando..." -ForegroundColor Yellow
  $proc | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Set-Location $TEST_DIR
npx playwright test --config playwright.config.ts
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
