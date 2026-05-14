#!/bin/bash
# ============================================================
# Java Legacy Modernizer — Script d'initialisation EC2
# Ce script est exécuté automatiquement au premier démarrage
# Il installe Docker, Ollama, Node.js, clone le repo et lance l'app
# ============================================================

set -euo pipefail
exec > /var/log/modernizer-setup.log 2>&1

echo "=========================================="
echo "  Modernizer Setup — $(date)"
echo "=========================================="

# ---- 1. Mise à jour système ----
echo "[1/8] Mise à jour du système..."
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git unzip jq nginx certbot python3-certbot-nginx

# ---- 2. Installer les drivers NVIDIA ----
echo "[2/8] Installation des drivers NVIDIA..."
apt-get install -y linux-headers-$(uname -r)
apt-get install -y nvidia-driver-535 nvidia-utils-535
# Installer NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt-get update -y
apt-get install -y nvidia-container-toolkit

# ---- 3. Installer Docker ----
echo "[3/8] Installation de Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

# ---- 4. Installer Node.js 22 + pnpm ----
echo "[4/8] Installation de Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
corepack enable
corepack prepare pnpm@latest --activate

# ---- 5. Installer Ollama ----
echo "[5/8] Installation d'Ollama..."
curl -fsSL https://ollama.com/install.sh | sh
systemctl enable ollama
systemctl start ollama

# Attendre qu'Ollama soit prêt
echo "Attente d'Ollama..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "Ollama prêt !"
    break
  fi
  sleep 2
done

# Télécharger le modèle LLM
echo "Téléchargement du modèle ${ollama_model}..."
ollama pull ${ollama_model}

# ---- 6. Cloner et configurer l'application ----
echo "[6/8] Clonage de l'application..."
cd /opt
git clone ${github_repo} modernizer
cd /opt/modernizer

# Installer les dépendances
pnpm install --frozen-lockfile

# Build
pnpm run build

# ---- 7. Configurer les variables d'environnement ----
echo "[7/8] Configuration de l'environnement..."
cat > /opt/modernizer/.env.production <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://${db_user}:${db_password}@${db_host}:3306/${db_name}
JWT_SECRET=${jwt_secret}
OLLAMA_BASE_URL=http://localhost:11434
S3_BUCKET=${s3_bucket}
S3_REGION=${s3_region}
S3_ACCESS_KEY=${s3_access_key}
S3_SECRET_KEY=${s3_secret_key}
EOF

# Migrer la base de données
cd /opt/modernizer
DATABASE_URL="mysql://${db_user}:${db_password}@${db_host}:3306/${db_name}" pnpm db:push || echo "Migration DB échouée (sera retentée)"

# ---- 8. Créer le service systemd ----
echo "[8/8] Configuration du service systemd..."
cat > /etc/systemd/system/modernizer.service <<EOF
[Unit]
Description=Java Legacy Modernizer
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/modernizer
EnvironmentFile=/opt/modernizer/.env.production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=modernizer

# Limites de ressources
LimitNOFILE=65536
TimeoutStartSec=30
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable modernizer
systemctl start modernizer

# ---- 9. Configurer Nginx (reverse proxy) ----
echo "[9/8] Configuration de Nginx..."
cat > /etc/nginx/sites-available/modernizer <<EOF
server {
    listen 80;
    server_name ${domain_name} _;

    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # SSE (Server-Sent Events) pour le suivi temps réel
    location /api/agent/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/modernizer /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# ---- 10. SSL (si domaine configuré) ----
if [ -n "${domain_name}" ]; then
  echo "Configuration SSL pour ${domain_name}..."
  certbot --nginx -d ${domain_name} --non-interactive --agree-tos -m admin@${domain_name} || echo "SSL échoué (vérifiez le DNS)"
fi

echo "=========================================="
echo "  Installation terminée !"
echo "  Application: http://$(curl -s ifconfig.me):3000"
echo "  Ollama: http://localhost:11434"
echo "  Logs: journalctl -u modernizer -f"
echo "=========================================="
