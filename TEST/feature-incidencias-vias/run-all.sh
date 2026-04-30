#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Ejecuta todos los tests de la rama feature/incidencias-vias
# Uso: bash TEST/feature-incidencias-vias/run-all.sh
# Requisito E2E: frontend corriendo (cd frontend && npm run dev)
# ─────────────────────────────────────────────────────────────────────────────

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
FAILED=0

run_step() {
  local label="$1"
  shift
  echo ""
  echo "══ $label ══"
  if "$@"; then
    echo "✓ OK: $label"
  else
    echo "✗ FALLIDO: $label"
    FAILED=$((FAILED + 1))
  fi
}

# ── Backend unit tests ────────────────────────────────────────────────────────
run_step "Tests unitarios backend (incidencias.service)" \
  bash -c "cd '$ROOT/backend' && npx vitest run --config '$TEST_DIR/vitest.backend.config.ts'"

# ── Frontend unit tests ───────────────────────────────────────────────────────
run_step "Tests unitarios frontend (haversine + routing + RoleSelection)" \
  bash -c "cd '$ROOT/frontend' && npx vitest run --config '$TEST_DIR/vitest.frontend.config.ts'"

# ── E2E tests ─────────────────────────────────────────────────────────────────
run_step "Tests E2E Playwright (requiere frontend en http://localhost:5173)" \
  bash -c "cd '$ROOT/frontend' && npx playwright test --config '$TEST_DIR/playwright.config.ts'"

# ── Resultado final ───────────────────────────────────────────────────────────
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "══ TODOS LOS TESTS PASARON ══"
else
  echo "══ $FAILED SUITE(S) FALLARON ══"
  exit 1
fi
