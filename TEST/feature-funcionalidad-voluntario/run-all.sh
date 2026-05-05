#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0

echo "Verificando dependencias..."
(cd "$ROOT/backend"  && npm install --silent)
(cd "$ROOT/frontend" && npm install --silent)
(cd "$TEST_DIR"      && npm install --silent)

echo ""
echo "== Tests unitarios backend =="
cd "$TEST_DIR"
npx vitest run --config vitest.backend.config.ts || FAILED=$((FAILED+1))

echo ""
echo "== Tests unitarios frontend =="
cd "$TEST_DIR"
npx vitest run --config vitest.frontend.config.ts || FAILED=$((FAILED+1))

echo ""
echo "== Tests E2E Playwright (Playwright gestiona el servidor en :5199) =="
cd "$TEST_DIR"
npx playwright test --config playwright.config.ts || FAILED=$((FAILED+1))

cd "$ROOT"
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "== TODOS LOS TESTS PASARON =="
else
  echo "== $FAILED SUITE(S) FALLARON =="
  exit 1
fi
