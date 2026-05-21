#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$ROOT/TEST/feature-qr-solicitudes-donaciones"
FAILED=0

echo "Verificando dependencias..."
(cd "$ROOT/backend" && npm install --silent >/dev/null 2>&1)
(cd "$ROOT/frontend" && npm install --silent >/dev/null 2>&1)
(cd "$TEST_DIR" && npm install --silent >/dev/null 2>&1)

echo ""
echo "== Tests unitarios backend (qr-solicitudes-donaciones) =="
(cd "$ROOT/backend" && npx vitest run --config "$TEST_DIR/vitest.backend.config.ts") || FAILED=$((FAILED + 1))

echo ""
echo "== Tests unitarios frontend (qr-solicitudes-donaciones) =="
(cd "$ROOT/frontend" && npx vitest run --config "$TEST_DIR/vitest.frontend.config.ts") || FAILED=$((FAILED + 1))

echo ""
echo "== Tests E2E Playwright (requiere frontend en localhost:5173) =="
(cd "$TEST_DIR" && npx playwright test --config playwright.config.ts) || FAILED=$((FAILED + 1))

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "== TODOS LOS TESTS PASARON =="
else
  echo "== $FAILED SUITE(S) FALLARON =="
  exit 1
fi
