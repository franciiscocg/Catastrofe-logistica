#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
FAILED=0

# ── Instalar dependencias ─────────────────────────────────────────────────────
echo "Verificando dependencias..."
cd "$ROOT/frontend" && npm install --silent 2>/dev/null
cd "$TEST_DIR"      && npm install --silent 2>/dev/null

# ── Frontend unit tests ───────────────────────────────────────────────────────
echo ""
echo "== Tests unitarios frontend (guards de coordenadas y logica de menú) =="
cd "$TEST_DIR"
npx vitest run --config vitest.frontend.config.ts || FAILED=$((FAILED + 1))

# ── E2E tests ─────────────────────────────────────────────────────────────────
echo ""
echo "== Tests E2E Playwright =="
cd "$TEST_DIR"
npx playwright test --config playwright.config.ts || FAILED=$((FAILED + 1))

# ── Resultado ─────────────────────────────────────────────────────────────────
cd "$ROOT"
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "== TODOS LOS TESTS PASARON =="
else
  echo "== $FAILED SUITE(S) FALLARON =="
  exit 1
fi
