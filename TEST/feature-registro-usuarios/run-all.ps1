$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$FAILED = 0
$NODE = if ($env:NODE_EXE) { $env:NODE_EXE } else { "node" }

Write-Host ""
Write-Host "== Tests backend (registro de usuarios y puestos) ==" -ForegroundColor Cyan
Set-Location "$ROOT\backend"
& $NODE node_modules\vitest\vitest.mjs run --config vitest.feature-registro-usuarios.config.ts
if ($LASTEXITCODE -ne 0) { $FAILED++ }

Write-Host ""
Write-Host "== Tests frontend (registro, login, roles y coordinador) ==" -ForegroundColor Cyan
Set-Location "$ROOT\frontend"
& $NODE node_modules\vitest\vitest.mjs run --config vitest.feature-registro-usuarios.config.ts
if ($LASTEXITCODE -ne 0) { $FAILED++ }

Set-Location $ROOT
Write-Host ""
if ($FAILED -eq 0) {
  Write-Host "== TODOS LOS TESTS PASARON ==" -ForegroundColor Green
} else {
  Write-Host "== $FAILED SUITE(S) FALLARON ==" -ForegroundColor Red
  exit 1
}
