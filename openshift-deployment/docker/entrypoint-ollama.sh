#!/bin/bash
# Entrypoint for Ollama inference container
# Starts Ollama server and loads the fine-tuned model

set -e

echo "[Inference] Starting Ollama server..."
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "[Inference] Waiting for Ollama to be ready..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "[Inference] Ollama is ready."
    break
  fi
  sleep 2
done

# Check if model exists, if not create it from Modelfile
if ! ollama list | grep -q "ejb-modernizer"; then
  if [ -f /models/ejb-modernizer-32b-Q4_K_M.gguf ]; then
    echo "[Inference] Creating ejb-modernizer model from GGUF..."
    ollama create ejb-modernizer -f /models/Modelfile
    echo "[Inference] Model ejb-modernizer created successfully."
  else
    echo "[Inference] WARNING: Model GGUF not found at /models/ejb-modernizer-32b-Q4_K_M.gguf"
    echo "[Inference] The model must be mounted via PVC or copied into the container."
    echo "[Inference] Falling back to pulling qwen2.5-coder:32b from registry..."
    ollama pull qwen2.5-coder:32b || echo "[Inference] Pull failed (no internet). Mount the model manually."
  fi
else
  echo "[Inference] Model ejb-modernizer already loaded."
fi

echo "[Inference] Ollama inference service is running."

# Keep the container alive
wait $OLLAMA_PID
