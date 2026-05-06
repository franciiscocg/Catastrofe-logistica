$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TEST_DIR = $PSScriptRoot
$FAILED = 0

Write-Host "Verificando dependencias..." -ForegroundColor Gray
Set-Location "$ROOT\frontend"
npm install --silent 2>$null
Set-Location $TEST_DIR
npm install --silent 2>$null

Write-Host ""
Write-Host "== Tests unitarios frontend (geolocalizacion tiempo real) ==" -ForegroundColor Cyan
Set-Location "$ROOT\frontend"
# NODE_PATH permite que Node.js resuelva vitest/config y @vitejs/plugin-react
# desde frontend/node_modules aunque el vitest.config.ts esté en TEST/.
$env:NODE_PATH = "$ROOT\frontend\node_modules"
npx vitest run --config ../TEST/geolocalizacion-tiempo-real/vitest.config.ts
if ($LASTEXITCODE -ne 0) { $FAILED++ }
Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "== Tests E2E Playwright (requiere frontend en localhost:5173) ==" -ForegroundColor Cyan
Set-Location $TEST_DIR
npx playwright test --config playwright.config.ts
if ($LASTEXITCODE -ne 0) { $FAILED++ }

Set-Location $ROOT
Write-Host ""
if ($FAILED -eq 0) {
  Write-Host "== TODOS LOS TESTS PASARON ==" -ForegroundColor Green
} else {
  Write-Host "== $FAILED SUITE(S) FALLARON ==" -ForegroundColor Red
  exit 1
}
