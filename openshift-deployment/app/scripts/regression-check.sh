#!/bin/bash
# Pre-commit hook Compleo — bloque les régressions critiques
# Durée : < 2 minutes
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo ""
echo "🔍 Compleo — Vérification de régression"
echo "────────────────────────────────────────"

# ── 1. Tests unitaires (< 30s) ───────────────────────────────
echo -n "  ▸ Tests unitaires... "
npx vitest run tests/unit/ --reporter=dot 2>&1 | tail -3
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo -e "${RED}❌ Tests unitaires échoués — commit bloqué${NC}"
  echo "   Lancer : npm run test:unit -- --reporter=verbose"
  exit 1
fi
echo -e "${GREEN}✅${NC}"

# ── 2. Tests no-regression rapides (< 30s, sans Maven) ───────
echo -n "  ▸ Tests no-regression... "
npx vitest run tests/regression/04-no-regression.test.ts --reporter=dot 2>&1 | tail -3
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo -e "${RED}❌ Régression détectée — commit bloqué${NC}"
  echo "   Un bug historique a été réintroduit."
  exit 1
fi
echo -e "${GREEN}✅${NC}"

# ── 3. Tests de compilation (< 60s) ──────────────────────────
echo -n "  ▸ Tests de compilation... "
npx vitest run tests/regression/01-compilation.test.ts --reporter=dot 2>&1 | tail -3
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo -e "${RED}❌ Compilation échouée — commit bloqué${NC}"
  echo "   Le code Java généré a des erreurs de syntaxe."
  exit 1
fi
echo -e "${GREEN}✅${NC}"

echo ""
echo -e "${GREEN}✅ Toutes vérifications passées — commit autorisé${NC}"
echo ""
