#!/bin/bash
# ============================================================
# Compleo - Script de mise a jour
# Usage : sudo ./update.sh [INSTALL_DIR]
# ============================================================
set -e

INSTALL_DIR=${1:-/opt/compleo}
JAR_NAME="compleo.jar"
BACKUP_DIR="$INSTALL_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=============================================="
echo "  Compleo - Mise a jour"
echo "=============================================="
echo "Repertoire : $INSTALL_DIR"
echo ""

# Verifier que Compleo est installe
if [ ! -f "$INSTALL_DIR/$JAR_NAME" ]; then
    echo "ERREUR : Compleo non installe dans $INSTALL_DIR"
    echo "Lancer d'abord : ./install.sh $INSTALL_DIR"
    exit 1
fi

# Trouver le nouveau JAR
NEW_JAR=""
if [ -f "target/ejb-to-rest-generator-"*.jar ]; then
    NEW_JAR=$(ls target/ejb-to-rest-generator-*.jar | head -1)
elif [ -f "$JAR_NAME" ]; then
    NEW_JAR="$JAR_NAME"
else
    echo "ERREUR : Nouveau JAR introuvable. Compiler avec : mvn clean package -DskipTests"
    exit 1
fi

echo "[1/4] Arret du service..."
systemctl stop compleo 2>/dev/null || echo "  Service deja arrete"

echo "[2/4] Sauvegarde..."
mkdir -p "$BACKUP_DIR"
cp "$INSTALL_DIR/$JAR_NAME" "$BACKUP_DIR/${JAR_NAME}.${TIMESTAMP}.bak"
echo "  Sauvegarde : $BACKUP_DIR/${JAR_NAME}.${TIMESTAMP}.bak"

echo "[3/4] Mise a jour du JAR..."
cp "$NEW_JAR" "$INSTALL_DIR/$JAR_NAME"
chown compleo:compleo "$INSTALL_DIR/$JAR_NAME"

# Mettre a jour la config si necessaire
if [ -f "src/main/resources/compleo-config.yml" ]; then
    cp "$INSTALL_DIR/config/compleo-config.yml" "$BACKUP_DIR/compleo-config.yml.${TIMESTAMP}.bak" 2>/dev/null || true
    echo "  Config sauvegardee (la config existante est preservee)"
fi

echo "[4/4] Redemarrage du service..."
systemctl start compleo
sleep 3

if systemctl is-active --quiet compleo; then
    echo ""
    echo "=============================================="
    echo "  Mise a jour reussie !"
    echo "=============================================="
    echo "  Version precedente sauvegardee dans : $BACKUP_DIR"
    echo "  Acces : http://localhost:8080"
else
    echo ""
    echo "ERREUR : Le service n'a pas demarre correctement."
    echo "Restauration de la version precedente..."
    cp "$BACKUP_DIR/${JAR_NAME}.${TIMESTAMP}.bak" "$INSTALL_DIR/$JAR_NAME"
    systemctl start compleo
    echo "Version precedente restauree."
    exit 1
fi
