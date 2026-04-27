# Fine-tuning LLM — Java EE vers Spring Boot

Guide complet pour entraîner un modèle de langage spécialisé dans la modernisation de code Java legacy (EJB, Servlet, Struts, SOAP, JDBC, Hibernate, JMS) vers Spring Boot 3.x et microservices cloud-native.

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Le dataset](#le-dataset)
4. [Option A — Modelfile Ollama (rapide, sans GPU)](#option-a--modelfile-ollama-rapide-sans-gpu)
5. [Option B — Fine-tuning Unsloth/LoRA (qualité maximale)](#option-b--fine-tuning-unslothlora-qualité-maximale)
6. [Intégration dans l'application](#intégration-dans-lapplication)
7. [Évaluation du modèle](#évaluation-du-modèle)
8. [Dépannage](#dépannage)

---

## Vue d'ensemble

Ce package contient tout le nécessaire pour créer un LLM spécialisé dans la modernisation Java EE :

| Fichier | Description |
|---------|-------------|
| `finetuning-dataset.jsonl` | Dataset de 364 paires legacy → Spring Boot (format OpenAI) |
| `train.py` | Script de fine-tuning Unsloth/LoRA (GPU requis) |
| `Modelfile` | Configuration Ollama avec system prompt enrichi (pas de GPU requis) |
| `dataset-stats.json` | Statistiques détaillées du dataset |

Le dataset a été construit à partir de **50 projets GitHub open source** et **4 projets bancaires réels** (BOA/BMCE Direct), couvrant 7 catégories de technologies legacy.

### Distribution du dataset

| Catégorie | Entrées | Source |
|-----------|---------|--------|
| Servlet → RestController | 165 | 50 repos GitHub |
| EJB Session Bean → Spring Service | 149 | 50 repos GitHub + 4 projets bancaires |
| JMS/MDB → Spring JMS Listener | 26 | repos GitHub + exemples experts |
| JDBC DAO → Spring Data JPA | 6 | exemples experts |
| SOAP WebService → REST Controller | 6 | exemples experts |
| Struts Action → Spring MVC | 6 | exemples experts |
| Hibernate → Spring Data JPA | 6 | exemples experts |
| **Total** | **364** | |

Les entrées sont réparties en 3 méthodes de génération : **rule-based** (329 paires par transformation automatique), **expert** (32 paires écrites manuellement avec haute qualité) et **user_project** (3 paires extraites des projets bancaires réels).

---

## Prérequis

### Pour l'Option A (Modelfile Ollama)

Seul Docker et Ollama sont nécessaires :

```bash
# Installer Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Vérifier l'installation
ollama --version

# Télécharger le modèle de base
ollama pull codellama:13b-instruct
```

**Configuration minimale** : 16 Go de RAM, pas de GPU requis (mais recommandé).

### Pour l'Option B (Fine-tuning Unsloth/LoRA)

Un GPU NVIDIA avec au moins 12 Go de VRAM est nécessaire.

| GPU | VRAM | Modèle recommandé | Temps estimé |
|-----|------|--------------------|--------------|
| RTX 3060 | 12 Go | Mistral 7B | ~45 min |
| RTX 3080/4070 | 12-16 Go | CodeLlama 13B | ~30 min |
| RTX 3090/4080 | 24 Go | CodeLlama 13B | ~20 min |
| A100 | 40-80 Go | CodeLlama 13B | ~10 min |

```bash
# Installer les dépendances Python
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
pip install --no-deps trl peft accelerate bitsandbytes transformers datasets

# Vérifier CUDA
python -c "import torch; print(torch.cuda.is_available())"
```

---

## Le dataset

Le fichier `finetuning-dataset.jsonl` contient des entrées au format OpenAI Messages :

```json
{
  "messages": [
    {"role": "system", "content": "Tu es un expert en modernisation Java EE..."},
    {"role": "user", "content": "Modernise ce code Java legacy (ejb_session_bean):\n\n```java\n@Stateless\npublic class AccountServiceBean...```"},
    {"role": "assistant", "content": "```java\n@Service\n@Transactional\npublic class AccountService...```"}
  ],
  "metadata": {
    "category": "ejb_session_bean",
    "source": "expert_template",
    "method": "expert"
  }
}
```

### Vérifier le dataset

```bash
# Compter les entrées
wc -l finetuning-dataset.jsonl

# Voir la distribution par catégorie
python3 -c "
import json, collections
cats = collections.Counter()
with open('finetuning-dataset.jsonl') as f:
    for line in f:
        entry = json.loads(line)
        cats[entry['metadata']['category']] += 1
for cat, count in cats.most_common():
    print(f'  {cat}: {count}')
"
```

---

## Option A — Modelfile Ollama (rapide, sans GPU)

Cette option utilise un modèle de base (CodeLlama 13B) avec un system prompt enrichi contenant les règles de transformation et des exemples de référence. Pas de fine-tuning réel, mais des résultats déjà très bons pour une démo.

### Étape 1 : Préparer le modèle

```bash
# Se placer dans le répertoire finetuning
cd server/engine/ml/finetuning/

# Télécharger le modèle de base (si pas déjà fait)
ollama pull codellama:13b-instruct

# Créer le modèle personnalisé
ollama create ejb-modernizer -f Modelfile
```

### Étape 2 : Tester le modèle

```bash
# Test interactif
ollama run ejb-modernizer

# Prompt de test :
# Modernise ce code Java legacy (ejb_session_bean) vers Spring Boot 3.x :
# @Stateless public class OrderServiceBean { @EJB private OrderDAO orderDAO; ... }
```

### Étape 3 : Tester via l'API

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "ejb-modernizer",
  "prompt": "Modernise ce code Java legacy (servlet) vers Spring Boot 3.x :\n\n@WebServlet(\"/api/orders\")\npublic class OrderServlet extends HttpServlet {\n    protected void doGet(HttpServletRequest req, HttpServletResponse resp) {\n        // ...\n    }\n}",
  "stream": false
}'
```

**Temps de réponse estimé** : 5-15 secondes selon le hardware.

---

## Option B — Fine-tuning Unsloth/LoRA (qualité maximale)

Cette option entraîne réellement le modèle sur le dataset de 364 paires, produisant un modèle spécialisé avec des résultats nettement supérieurs.

### Étape 1 : Entraîner le modèle

```bash
cd server/engine/ml/finetuning/

# Option recommandée : CodeLlama 13B (meilleur pour le code)
python train.py \
  --model codellama \
  --dataset ./finetuning-dataset.jsonl \
  --epochs 3 \
  --output ./outputs

# Alternative : Mistral 7B (plus rapide, moins de VRAM)
python train.py \
  --model mistral \
  --dataset ./finetuning-dataset.jsonl \
  --epochs 5 \
  --output ./outputs

# Alternative : DeepSeek Coder (spécialisé code)
python train.py \
  --model deepseek \
  --dataset ./finetuning-dataset.jsonl \
  --epochs 3 \
  --output ./outputs
```

Le script affiche la progression en temps réel avec la loss d'entraînement.

### Étape 2 : Convertir en GGUF pour Ollama

```bash
python train.py --export-gguf --output ./outputs
```

Cela génère un fichier `.gguf` quantifié en Q4_K_M (bon compromis qualité/taille).

### Étape 3 : Créer le modèle Ollama

```bash
# Modifier le Modelfile pour pointer vers le GGUF
# Remplacer "FROM codellama:13b-instruct" par :
# FROM ./outputs-gguf/ejb-modernizer-q4_k_m.gguf

# Créer le modèle
ollama create ejb-modernizer -f Modelfile
```

### Étape 4 : Tester

```bash
ollama run ejb-modernizer
```

---

## Intégration dans l'application

Le fichier `server/engine/ml/llm-adapter.ts` gère automatiquement le routage entre les différents backends LLM :

1. **Ollama local** (modèle fine-tuné `ejb-modernizer`) — priorité si disponible
2. **Manus invokeLLM** (cloud) — fallback automatique

### Configuration

Dans le fichier `.env` ou les variables d'environnement :

```env
# URL de l'API Ollama (Docker)
OLLAMA_BASE_URL=http://localhost:11434

# Nom du modèle fine-tuné
OLLAMA_MODEL=ejb-modernizer
```

### Architecture du pipeline

```
Requête utilisateur
    │
    ▼
llm-adapter.ts
    │
    ├── Ollama disponible ? ──► ejb-modernizer (fine-tuné)
    │                              │
    │                              ▼
    │                          Réponse rapide (~5s)
    │
    └── Ollama indisponible ? ──► Manus invokeLLM (cloud)
                                   │
                                   ▼
                               Réponse cloud (~10s)
```

---

## Évaluation du modèle

### Métriques de qualité

Pour évaluer la qualité du modèle fine-tuné, utilisez les critères suivants :

| Critère | Description | Poids |
|---------|-------------|-------|
| Compilation | Le code généré compile sans erreur | 30% |
| Annotations | Les annotations Spring sont correctes | 25% |
| Logique métier | La logique métier est préservée | 25% |
| Conventions | Respect des conventions Spring Boot | 10% |
| Imports | Les imports sont corrects et complets | 10% |

### Script de test rapide

```bash
# Tester avec 5 exemples du dataset
python3 -c "
import json, subprocess

with open('finetuning-dataset.jsonl') as f:
    entries = [json.loads(line) for line in f]

# Prendre 5 exemples aléatoires
import random
samples = random.sample(entries, 5)

for i, entry in enumerate(samples):
    user_msg = entry['messages'][1]['content']
    expected = entry['messages'][2]['content']
    
    # Appeler Ollama
    result = subprocess.run(
        ['ollama', 'run', 'ejb-modernizer', user_msg],
        capture_output=True, text=True, timeout=60
    )
    
    print(f'--- Test {i+1} ---')
    print(f'Category: {entry[\"metadata\"][\"category\"]}')
    print(f'Generated: {result.stdout[:200]}...')
    print()
"
```

---

## Dépannage

### Ollama ne démarre pas

```bash
# Vérifier que Docker est en cours d'exécution
docker ps

# Redémarrer Ollama
ollama serve

# Vérifier les logs
journalctl -u ollama -f
```

### Erreur "out of memory" pendant le fine-tuning

Réduire la taille du modèle ou les paramètres :

```bash
# Utiliser Mistral 7B au lieu de CodeLlama 13B
python train.py --model mistral --dataset ./finetuning-dataset.jsonl

# Ou réduire le batch size dans train.py :
# TRAINING_CONFIG["per_device_train_batch_size"] = 1
# TRAINING_CONFIG["gradient_accumulation_steps"] = 8
```

### Le modèle génère du texte incohérent

Vérifier que la température est basse (0.1-0.3) pour la génération de code :

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "ejb-modernizer",
  "prompt": "...",
  "options": {"temperature": 0.1}
}'
```

### Le GGUF est trop volumineux

Utiliser une quantification plus agressive :

```python
# Dans train.py, changer q4_k_m par q4_0 (plus petit, légèrement moins précis)
model.save_pretrained_gguf(gguf_dir, tokenizer, quantization_method="q4_0")
```

---

## Enrichir le dataset

Pour améliorer la qualité du modèle, ajouter de nouvelles paires au dataset :

```bash
# Format d'une entrée
echo '{
  "messages": [
    {"role": "system", "content": "Tu es un expert en modernisation Java EE..."},
    {"role": "user", "content": "Modernise ce code..."},
    {"role": "assistant", "content": "```java\n...\n```"}
  ],
  "metadata": {"category": "ejb_session_bean", "source": "manual", "method": "expert"}
}' >> finetuning-dataset.jsonl
```

Les catégories sous-représentées (jdbc_dao, soap_webservice, struts, hibernate) bénéficieraient le plus de nouveaux exemples experts.

---

## Licence

Ce dataset et ces scripts sont fournis dans le cadre du projet EJB Client Modernizer.
Les fichiers Java source proviennent de projets open source sous licences Apache 2.0, MIT ou GPL.
