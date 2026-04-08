#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Compleo EJB Client Modernizer — Script d'initialisation Docker
# Usage : ./scripts/docker-init.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_TEMPLATE="$PROJECT_DIR/docker/env-template.conf"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║       Compleo EJB Client Modernizer — Setup          ║"
echo "║              Version 1.0.0 On-Premises               ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Étape 1 : Vérifier le fichier .env ─────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}[WARN] Fichier .env non trouvé.${NC}"
  if [ -f "$ENV_TEMPLATE" ]; then
    cp "$ENV_TEMPLATE" "$ENV_FILE"
    echo -e "${YELLOW}[WARN] Fichier .env créé depuis le template.${NC}"
    echo -e "${RED}[IMPORTANT] Éditez le fichier .env AVANT de continuer :${NC}"
    echo -e "  nano $ENV_FILE"
    echo ""
    echo -e "  Valeurs obligatoires à remplir :"
    echo -e "    - SESSION_SECRET (openssl rand -hex 32)"
    echo -e "    - LOCAL_ADMIN_PASSWORD"
    echo -e "    - DB_PASSWORD"
    echo -e "    - MINIO_ROOT_PASSWORD"
    echo ""
    read -p "Appuyez sur Entrée après avoir édité .env, ou Ctrl+C pour annuler... "
  else
    echo -e "${RED}[ERREUR] Aucun template .env trouvé. Créez le fichier .env manuellement.${NC}"
    exit 1
  fi
fi

# ── Étape 2 : Vérifier les valeurs obligatoires ───────────────
echo -e "${CYAN}[INFO] Vérification des variables obligatoires...${NC}"
MISSING=0

check_var() {
  local var_name=$1
  local var_value
  var_value=$(grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-)
  if [ -z "$var_value" ] || [[ "$var_value" == CHANGE_ME* ]]; then
    echo -e "  ${RED}✗ ${var_name} non configuré${NC}"
    MISSING=$((MISSING + 1))
  else
    echo -e "  ${GREEN}✓ ${var_name}${NC}"
  fi
}

check_var "SESSION_SECRET"
check_var "LOCAL_ADMIN_PASSWORD"
check_var "DB_PASSWORD"
check_var "MINIO_ROOT_PASSWORD"

if [ "$MISSING" -gt 0 ]; then
  echo ""
  echo -e "${RED}[ERREUR] $MISSING variable(s) obligatoire(s) non configurée(s).${NC}"
  echo -e "Éditez le fichier .env : nano $ENV_FILE"
  exit 1
fi

echo -e "${GREEN}[OK] Toutes les variables obligatoires sont configurées.${NC}"
echo ""

# ── Étape 3 : Démarrer les services ───────────────────────────
echo -e "${CYAN}[INFO] Démarrage des services Docker...${NC}"
cd "$PROJECT_DIR"
docker compose up -d --build

# ── Étape 4 : Attendre que tous les services soient healthy ───
echo -e "${CYAN}[INFO] Attente de la disponibilité des services...${NC}"
MAX_WAIT=60
ELAPSED=0

wait_healthy() {
  local service=$1
  local max=$2
  local elapsed=0
  while [ $elapsed -lt $max ]; do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "compleo-${service}" 2>/dev/null || echo "not_found")
    if [ "$status" = "healthy" ]; then
      echo -e "  ${GREEN}✓ ${service} : healthy${NC}"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    echo -ne "  ${YELLOW}⏳ ${service} : ${status} (${elapsed}s/${max}s)${NC}\r"
  done
  echo -e "  ${RED}✗ ${service} : timeout après ${max}s${NC}"
  return 1
}

echo ""
wait_healthy "postgres" 30
wait_healthy "minio" 30
wait_healthy "app" 60

echo ""

# ── Étape 5 : Afficher les informations d'accès ──────────────
COMPLEO_PORT=$(grep "^COMPLEO_PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || echo "8080")
LOCAL_ADMIN_USER=$(grep "^LOCAL_ADMIN_USER=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || echo "admin")

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║          Compleo est prêt !                          ║"
echo "╠═══════════════════════════════════════════════════════╣"
echo "║                                                       ║"
echo "║  URL : http://localhost:${COMPLEO_PORT}                        ║"
echo "║  Login : ${LOCAL_ADMIN_USER}                                    ║"
echo "║                                                       ║"
echo "║  MinIO Console : http://localhost:9001                ║"
echo "║                                                       ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${CYAN}Commandes utiles :${NC}"
echo "  docker compose logs -f compleo    # Logs de l'application"
echo "  docker compose ps                 # État des services"
echo "  docker compose down               # Arrêter les services"
echo "  docker compose down -v            # Arrêter + supprimer les données"
