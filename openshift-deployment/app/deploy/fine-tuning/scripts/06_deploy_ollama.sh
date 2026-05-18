#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Script 6/6 — Déploie le modèle fine-tuné sur Ollama
#
# Ce script :
# 1. Vérifie que Ollama est installé et le GPU disponible
# 2. Crée le modèle Ollama à partir du GGUF exporté
# 3. Teste le modèle avec un exemple EJB
# 4. Configure le modèle comme défaut dans l'application
#
# Usage:
#   chmod +x 06_deploy_ollama.sh
#   ./06_deploy_ollama.sh ./models/qwen-ejb-migrator/gguf
#
# Prérequis:
#   - Ollama installé (curl -fsSL https://ollama.ai/install.sh | sh)
#   - GPU NVIDIA avec drivers installés
#   - Modèle GGUF exporté par le script 05_train_qlora.py
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

MODEL_NAME="qwen-ejb-migrator"
GGUF_DIR="${1:-./models/qwen-ejb-migrator/gguf}"
APP_ENV_FILE="${2:-.env}"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ─── Vérifications ───────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════════"
echo "  Déploiement Ollama — ${MODEL_NAME}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. Vérifier Ollama
log_info "Vérification d'Ollama..."
if ! command -v ollama &> /dev/null; then
    log_error "Ollama n'est pas installé."
    log_info "Installation..."
    curl -fsSL https://ollama.ai/install.sh | sh
    log_ok "Ollama installé"
fi

# Vérifier que le service tourne
if ! curl -s "${OLLAMA_HOST}/api/tags" > /dev/null 2>&1; then
    log_info "Démarrage du service Ollama..."
    nohup ollama serve > /tmp/ollama.log 2>&1 &
    sleep 5
    if ! curl -s "${OLLAMA_HOST}/api/tags" > /dev/null 2>&1; then
        log_error "Impossible de démarrer Ollama. Vérifiez les logs: /tmp/ollama.log"
        exit 1
    fi
fi
log_ok "Ollama est opérationnel"

# 2. Vérifier le GPU
log_info "Vérification du GPU..."
if command -v nvidia-smi &> /dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
    log_ok "GPU détecté: ${GPU_NAME} (${GPU_MEM} MB VRAM)"
else
    log_warn "nvidia-smi non trouvé. Le modèle tournera sur CPU (très lent)."
    read -p "Continuer quand même ? (y/n) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

# 3. Vérifier le dossier GGUF
log_info "Vérification du modèle GGUF..."
if [ ! -d "${GGUF_DIR}" ]; then
    log_error "Dossier GGUF non trouvé: ${GGUF_DIR}"
    log_info "Lancez d'abord: python3 05_train_qlora.py --output ./models/qwen-ejb-migrator"
    exit 1
fi

GGUF_FILE=$(find "${GGUF_DIR}" -name "*.gguf" -type f | head -1)
if [ -z "${GGUF_FILE}" ]; then
    log_error "Aucun fichier .gguf trouvé dans ${GGUF_DIR}"
    exit 1
fi

GGUF_SIZE=$(du -h "${GGUF_FILE}" | cut -f1)
log_ok "Modèle GGUF trouvé: ${GGUF_FILE} (${GGUF_SIZE})"

# 4. Vérifier le Modelfile
MODELFILE="${GGUF_DIR}/Modelfile"
if [ ! -f "${MODELFILE}" ]; then
    log_warn "Modelfile non trouvé, création automatique..."
    GGUF_BASENAME=$(basename "${GGUF_FILE}")
    cat > "${MODELFILE}" << MODELFILE_EOF
FROM ./${GGUF_BASENAME}

TEMPLATE """{{- if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{- end }}
<|im_start|>user
{{ .Prompt }}<|im_end|>
<|im_start|>assistant
"""

SYSTEM """Tu es un expert en migration Java EE/EJB vers Spring Boot. Tu produis du code Spring Boot moderne, propre et compilable en suivant les meilleures pratiques (injection constructeur, @Transactional, Lombok, Spring Data JPA). Tu connais les patterns BMCE Bank et les conventions de nommage bancaires."""

PARAMETER temperature 0.2
PARAMETER top_p 0.9
PARAMETER num_ctx 8192
PARAMETER stop "<|im_end|>"
MODELFILE_EOF
    log_ok "Modelfile créé"
fi

# ─── Création du modèle Ollama ───────────────────────────────────────────────

echo ""
log_info "Création du modèle Ollama '${MODEL_NAME}'..."
log_info "Cela peut prendre quelques minutes..."

cd "${GGUF_DIR}"
ollama create "${MODEL_NAME}" -f Modelfile

log_ok "Modèle '${MODEL_NAME}' créé avec succès!"

# Vérifier que le modèle est listé
echo ""
log_info "Modèles Ollama disponibles:"
ollama list | grep -E "NAME|${MODEL_NAME}"

# ─── Test du modèle ──────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Test du modèle"
echo "═══════════════════════════════════════════════════════════"
echo ""

TEST_PROMPT='Migre ce composant EJB legacy vers Spring Boot:

@Stateless
public class EnvoiSmsServiceBean implements EnvoiSmsServiceRemote {
    @EJB
    private SmsGateway gateway;
    
    @Override
    public void envoyerSms(String numero, String message) {
        gateway.send(numero, message);
    }
    
    @Override
    public List<SmsStatus> getStatuts(String numero) {
        return gateway.getStatuts(numero);
    }
}'

log_info "Envoi du prompt de test..."
echo ""

# Mesurer le temps de réponse
START_TIME=$(date +%s%N)

RESPONSE=$(curl -s "${OLLAMA_HOST}/api/generate" \
    -d "{
        \"model\": \"${MODEL_NAME}\",
        \"prompt\": $(echo "${TEST_PROMPT}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"),
        \"stream\": false,
        \"options\": {
            \"temperature\": 0.2,
            \"num_ctx\": 8192
        }
    }" 2>/dev/null)

END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
ELAPSED_S=$(echo "scale=1; ${ELAPSED_MS} / 1000" | bc)

if echo "${RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('response','')[:500])" 2>/dev/null; then
    echo ""
    log_ok "Réponse reçue en ${ELAPSED_S}s"
    
    # Extraire les métriques
    EVAL_COUNT=$(echo "${RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('eval_count', 'N/A'))" 2>/dev/null || echo "N/A")
    EVAL_DURATION=$(echo "${RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d.get('eval_duration', 0)/1e9:.1f}s\")" 2>/dev/null || echo "N/A")
    
    echo ""
    echo "─── Métriques ───"
    echo "  Temps total:    ${ELAPSED_S}s"
    echo "  Tokens générés: ${EVAL_COUNT}"
    echo "  Temps inférence: ${EVAL_DURATION}"
else
    log_error "Erreur lors du test. Réponse brute:"
    echo "${RESPONSE}" | head -5
fi

# ─── Configuration de l'application ──────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Configuration de l'application"
echo "═══════════════════════════════════════════════════════════"
echo ""

log_info "Pour configurer l'application avec ce modèle, ajoutez à votre .env :"
echo ""
echo "  OLLAMA_BASE_URL=http://localhost:11434"
echo "  OLLAMA_MODEL=${MODEL_NAME}"
echo "  LLM_PROVIDER=ollama"
echo ""

# Optionnel: mettre à jour le .env si fourni
if [ -f "${APP_ENV_FILE}" ]; then
    read -p "Mettre à jour ${APP_ENV_FILE} automatiquement ? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Supprimer les anciennes valeurs
        sed -i '/^OLLAMA_BASE_URL=/d' "${APP_ENV_FILE}"
        sed -i '/^OLLAMA_MODEL=/d' "${APP_ENV_FILE}"
        sed -i '/^LLM_PROVIDER=/d' "${APP_ENV_FILE}"
        
        # Ajouter les nouvelles
        echo "" >> "${APP_ENV_FILE}"
        echo "# Fine-tuned model configuration" >> "${APP_ENV_FILE}"
        echo "OLLAMA_BASE_URL=http://localhost:11434" >> "${APP_ENV_FILE}"
        echo "OLLAMA_MODEL=${MODEL_NAME}" >> "${APP_ENV_FILE}"
        echo "LLM_PROVIDER=ollama" >> "${APP_ENV_FILE}"
        
        log_ok "${APP_ENV_FILE} mis à jour"
    fi
fi

# ─── Résumé final ────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Déploiement terminé!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Modèle:     ${MODEL_NAME}"
echo "  GGUF:       ${GGUF_FILE}"
echo "  Ollama:     ${OLLAMA_HOST}"
echo ""
echo "  Pour tester manuellement:"
echo "    ollama run ${MODEL_NAME}"
echo ""
echo "  Pour utiliser via l'API:"
echo "    curl ${OLLAMA_HOST}/api/generate -d '{\"model\":\"${MODEL_NAME}\",\"prompt\":\"...\"}'"
echo ""
echo "═══════════════════════════════════════════════════════════"
