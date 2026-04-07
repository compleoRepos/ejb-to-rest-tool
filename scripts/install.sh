#!/bin/bash
# ============================================================
# Compleo - Script d'installation on-premises
# Usage : sudo ./install.sh [INSTALL_DIR]
# ============================================================
set -e

INSTALL_DIR=${1:-/opt/compleo}
COMPLEO_USER="compleo"
JAR_NAME="compleo.jar"

echo "=============================================="
echo "  Compleo - Installation On-Premises"
echo "=============================================="
echo "Repertoire : $INSTALL_DIR"
echo ""

# Verifier les prerequis
echo "[1/6] Verification des prerequis..."
if ! command -v java &> /dev/null; then
    echo "ERREUR : Java 17+ requis. Installer avec : apt install openjdk-17-jre"
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" -lt 17 ]; then
    echo "ERREUR : Java 17+ requis (version actuelle : $JAVA_VERSION)"
    exit 1
fi
echo "  Java $JAVA_VERSION detecte"

# Creer l'utilisateur systeme
echo "[2/6] Creation de l'utilisateur systeme..."
if ! id "$COMPLEO_USER" &>/dev/null; then
    useradd --system --no-create-home --shell /bin/false "$COMPLEO_USER"
    echo "  Utilisateur $COMPLEO_USER cree"
else
    echo "  Utilisateur $COMPLEO_USER existe deja"
fi

# Creer le repertoire d'installation
echo "[3/6] Creation du repertoire d'installation..."
mkdir -p "$INSTALL_DIR"/{config,logs,data,uploads}

# Copier le JAR
echo "[4/6] Copie du JAR..."
if [ -f "target/ejb-to-rest-generator-"*.jar ]; then
    cp target/ejb-to-rest-generator-*.jar "$INSTALL_DIR/$JAR_NAME"
elif [ -f "$JAR_NAME" ]; then
    cp "$JAR_NAME" "$INSTALL_DIR/$JAR_NAME"
else
    echo "ERREUR : JAR introuvable. Compiler avec : mvn clean package -DskipTests"
    exit 1
fi

# Copier la configuration
echo "[5/6] Configuration..."
if [ -f "src/main/resources/compleo-config.yml" ]; then
    cp src/main/resources/compleo-config.yml "$INSTALL_DIR/config/"
fi
if [ -f "src/main/resources/application.properties" ]; then
    cp src/main/resources/application.properties "$INSTALL_DIR/config/"
fi

# Creer le script de demarrage
cat > "$INSTALL_DIR/start.sh" << 'STARTEOF'
#!/bin/bash
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
JAVA_OPTS="-Xms256m -Xmx1024m -XX:+UseG1GC"
JAVA_OPTS="$JAVA_OPTS -Dspring.config.additional-location=file:$INSTALL_DIR/config/"
JAVA_OPTS="$JAVA_OPTS -Dlogging.file.path=$INSTALL_DIR/logs"
JAVA_OPTS="$JAVA_OPTS -Dejb.upload.dir=$INSTALL_DIR/uploads"
JAVA_OPTS="$JAVA_OPTS -Dejb.output.dir=$INSTALL_DIR/data"

exec java $JAVA_OPTS -jar "$INSTALL_DIR/compleo.jar"
STARTEOF
chmod +x "$INSTALL_DIR/start.sh"

# Creer le service systemd
echo "[6/6] Configuration du service systemd..."
cat > /etc/systemd/system/compleo.service << EOF
[Unit]
Description=Compleo EJB-to-REST Transformation Engine
After=network.target

[Service]
Type=simple
User=$COMPLEO_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/start.sh
Restart=on-failure
RestartSec=10
StandardOutput=append:$INSTALL_DIR/logs/compleo.log
StandardError=append:$INSTALL_DIR/logs/compleo-error.log

# Securite
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$INSTALL_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Permissions
chown -R "$COMPLEO_USER":"$COMPLEO_USER" "$INSTALL_DIR"
systemctl daemon-reload

echo ""
echo "=============================================="
echo "  Installation terminee !"
echo "=============================================="
echo ""
echo "  Repertoire : $INSTALL_DIR"
echo "  Config     : $INSTALL_DIR/config/"
echo "  Logs       : $INSTALL_DIR/logs/"
echo "  Data       : $INSTALL_DIR/data/"
echo ""
echo "  Commandes :"
echo "    systemctl start compleo     # Demarrer"
echo "    systemctl stop compleo      # Arreter"
echo "    systemctl status compleo    # Statut"
echo "    systemctl enable compleo    # Demarrage auto"
echo ""
echo "  Acces : http://localhost:8080"
echo ""
