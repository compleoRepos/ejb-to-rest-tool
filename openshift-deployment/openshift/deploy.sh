#!/bin/bash
# ============================================================
# EJB Client Modernizer — OpenShift Deployment Script
# Deploys all components to an OpenShift cluster
# ============================================================
# Prerequisites:
#   - oc CLI logged into the cluster
#   - Container images pushed to the internal registry
#   - GPU operator installed (for inference pod)
# ============================================================

set -e

NAMESPACE="ejb-modernizer"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================"
echo " EJB Client Modernizer — OpenShift Deploy"
echo "============================================"

# Step 1: Create namespace
echo "[1/8] Creating namespace..."
oc apply -f "$SCRIPT_DIR/00-namespace.yaml"

# Step 2: Create config and secrets
echo "[2/8] Creating ConfigMaps and Secrets..."
oc apply -f "$SCRIPT_DIR/01-config.yaml"

# Step 3: Create PVCs
echo "[3/8] Creating Persistent Volume Claims..."
oc apply -f "$SCRIPT_DIR/02-storage.yaml"

# Step 4: Deploy MySQL
echo "[4/8] Deploying MySQL..."
oc apply -f "$SCRIPT_DIR/03-mysql.yaml"
echo "  Waiting for MySQL to be ready..."
oc rollout status deployment/mysql -n "$NAMESPACE" --timeout=120s || true

# Step 5: Deploy Backend
echo "[5/8] Deploying Backend..."
oc apply -f "$SCRIPT_DIR/04-backend.yaml"

# Step 6: Deploy Frontend
echo "[6/8] Deploying Frontend..."
oc apply -f "$SCRIPT_DIR/05-frontend.yaml"

# Step 7: Deploy Inference (GPU)
echo "[7/8] Deploying Inference (Ollama + GPU)..."
oc apply -f "$SCRIPT_DIR/06-inference.yaml"

# Step 8: Deploy Pipeline
echo "[8/8] Deploying Pipeline..."
oc apply -f "$SCRIPT_DIR/07-pipeline.yaml"

# Create Route
echo "[Route] Creating external route..."
oc apply -f "$SCRIPT_DIR/08-route.yaml"

echo ""
echo "============================================"
echo " Deployment complete!"
echo "============================================"
echo ""
echo "Check status:"
echo "  oc get pods -n $NAMESPACE"
echo "  oc get routes -n $NAMESPACE"
echo ""
echo "Access the application:"
ROUTE=$(oc get route ejb-modernizer -n "$NAMESPACE" -o jsonpath='{.spec.host}' 2>/dev/null || echo "pending...")
echo "  https://$ROUTE"
echo ""
echo "IMPORTANT: Load the model GGUF into the models-data PVC:"
echo "  oc cp ejb-modernizer-32b-Q4_K_M.gguf $NAMESPACE/\$(oc get pod -l app=inference -n $NAMESPACE -o name | head -1):/models/"
echo ""
