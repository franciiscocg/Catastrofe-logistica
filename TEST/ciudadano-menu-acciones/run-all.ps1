$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TEST_DIR = $PSScriptRoot
$FAILED = 0

# ── Instalar dependencias ─────────────────────────────────────────────────────
Write-Host "Verificando dependencias..." -ForegroundColor Gray
Set-Location "$ROOT\frontend"
npm install --silent 2>$null
Set-Location $TEST_DIR
npm install --silent 2>$null

# ── Frontend unit tests ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "== Tests unitarios frontend (guards de coordenadas y logica de menú) ==" -ForegroundColor Cyan
Set-Location $TEST_DIR
npx vitest run --config vitest.frontend.config.ts
if ($LASTEXITCODE -ne 0) { $FAILED++ }

# ── E2E tests ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "== Tests E2E Playwright (Playwright gestiona el servidor en :5200) ==" -ForegroundColor Cyan
$proc = Get-NetTCPConnection -LocalPort 5200 -State Listen -ErrorAction SilentlyContinue
if ($proc) {
  Write-Host "Puerto 5200 ocupado. Liberando..." -ForegroundColor Yellow
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
