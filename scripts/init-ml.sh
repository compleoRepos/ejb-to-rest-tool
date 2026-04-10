#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Compleo v7.0 — Initialisation ML
# Installer et configurer Ollama + modèles de code
# Tourne sur CPU — GPU optionnel pour accélérer
# ═══════════════════════════════════════════════════════════════════

set -e

echo "Initialisation ML Compleo..."
echo ""

# ── Installer Ollama si pas présent ───────────────────────────────

if ! command -v ollama &> /dev/null; then
  echo "Installation d'Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
  echo "Ollama installé."
else
  echo "Ollama déjà installé : $(ollama --version 2>/dev/null || echo 'version inconnue')"
fi

# ── Télécharger les modèles ──────────────────────────────────────

echo ""
echo "Téléchargement du modèle de génération de code..."
echo "  deepseek-coder:6.7b-instruct-q4_K_M (~4GB)"
ollama pull deepseek-coder:6.7b-instruct-q4_K_M

echo ""
echo "Téléchargement du modèle d'embedding..."
echo "  nomic-embed-text (~80MB)"
ollama pull nomic-embed-text

# ── Résumé ────────────────────────────────────────────────────────

echo ""
echo "Modèles prêts"
echo "  deepseek-coder:6.7b — génération Java/Spring (~60s/méthode sur CPU)"
echo "  nomic-embed-text    — embeddings pour RAG (~1s/méthode)"
echo ""
echo "Pour accélérer : installer une GPU NVIDIA/AMD"
echo "  CPU seul  : ~60s par méthode"
echo "  GPU RTX   : ~4s  par méthode"
echo "  Mac M2    : ~8s  par méthode"

# ── Démarrer Ollama en arrière-plan ──────────────────────────────

echo ""
echo "Démarrage d'Ollama..."
ollama serve &
echo "Ollama démarré sur http://localhost:11434"
echo ""
echo "Pour arrêter : pkill ollama"
echo "Pour les logs : ollama logs"
