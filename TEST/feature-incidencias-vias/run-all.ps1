$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TEST_DIR = $PSScriptRoot
$FAILED = 0

# ── Instalar dependencias ─────────────────────────────────────────────────────
Write-Host "Verificando dependencias..." -ForegroundColor Gray
Set-Location "$ROOT\backend"
npm install --silent 2>$null
Set-Location "$ROOT\frontend"
npm install --silent 2>$null
Set-Location $TEST_DIR
npm install --silent 2>$null

# ── Backend unit tests ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "== Tests unitarios backend ==" -ForegroundColor Cyan
Set-Location "$ROOT\backend"
npx vitest run --config vitest.feature-incidencias-vias.config.ts
if ($LASTEXITCODE -ne 0) { $FAILED++ }

# ── Frontend unit tests ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "== Tests unitarios frontend ==" -ForegroundColor Cyan
Set-Location "$ROOT\frontend"
npx vitest run --config vitest.feature-incidencias-vias.config.ts
if ($LASTEXITCODE -ne 0) { $FAILED++ }

# ── E2E tests ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "== Tests E2E Playwright (requiere frontend en localhost:5173) ==" -ForegroundColor Cyan
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
