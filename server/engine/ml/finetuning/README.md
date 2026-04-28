# Fine-tuning LLM — Java EE vers Spring Boot

Guide complet pour entraîner un modèle de langage spécialisé dans la modernisation de code Java legacy (EJB, Servlet, Struts, SOAP, JDBC, Hibernate, JMS, Spring Legacy) vers Spring Boot 3.x et microservices cloud-native.

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
| `finetuning-dataset.jsonl` | Dataset de **27 237 paires** legacy → Spring Boot (format OpenAI) — voir `DOWNLOAD.md` |
| `train.py` | Script de fine-tuning Unsloth/LoRA **v2.0** (GPU requis) |
| `Modelfile` | Configuration Ollama avec system prompt enrichi (pas de GPU requis) |
| `dataset-stats.json` | Statistiques détaillées du dataset |
| `repos-catalog.json` | Catalogue des 1000 repos GitHub sélectionnés — voir `DOWNLOAD.md` |
| `DOWNLOAD.md` | Liens de téléchargement des fichiers volumineux (S3) |

Le dataset a été construit à partir de **884 projets GitHub open source** (sélectionnés parmi 5 779 candidats via 128 requêtes ciblées) et **4 projets bancaires réels** (BOA/BMCE Direct), couvrant **8 catégories** de technologies legacy et **187 814 fichiers Java** analysés.

### Nouveautés train.py v2.0

| Fonctionnalité | v1.0 | v2.0 |
|----------------|------|------|
| Modèle recommandé | CodeLlama 13B | **Qwen2.5-Coder 32B** (meilleur pour Java) |
| `max_seq_length` | Fixe 4096 | **Dynamique** selon modèle + VRAM |
| Validation split | Aucun | **Stratifié 95/5** par catégorie |
| Early stopping | Non | **Oui** (patience=3, eval tous les 100 steps) |
| Métriques qualité | Non | **Compilation, BLEU, annotations Spring, overlap** |
| WandB | Non | **Optionnel** (ne crash pas si absent) |
| Mode dry-run | Non | **`--dry-run`** valide le dataset sans GPU |
| Gestion VRAM | Manuelle | **Automatique** (détection GPU, recommandation modèle) |
| Rapport final | Basique | **JSON complet** avec métriques + recommandations |
| Batch size | Fixe 2 | **Adaptatif** par modèle (1 pour 32B, 4 pour 7B) |

### Distribution du dataset

| Catégorie | Entrées | Part | Description |
|-----------|---------|------|-------------|
| Struts → Spring MVC | 6 928 | 25.4% | ActionSupport, ActionForm, struts-config.xml |
| Hibernate → Spring Data JPA | 5 077 | 18.6% | SessionFactory, HQL, Criteria API |
| Servlet → REST Controller | 4 470 | 16.4% | HttpServlet, doGet/doPost, web.xml |
| JDBC DAO → Spring Data JPA | 3 305 | 12.1% | PreparedStatement, ResultSet, DataSource |
| SOAP → REST Controller | 2 657 | 9.8% | @WebService, @WebMethod, JAX-WS |
| JMS/MDB → Spring JMS | 2 398 | 8.8% | @MessageDriven, MessageListener |
| EJB → Spring Service | 1 897 | 7.0% | @Stateless, @Stateful, @Singleton |
| Spring Legacy → Spring Boot | 505 | 1.9% | XML config, JdbcTemplate |
| **Total** | **27 237** | **100%** | **310 MB, 764 repos uniques** |

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

Un GPU NVIDIA avec au moins 16 Go de VRAM est recommandé pour un dataset de cette taille.

| GPU | VRAM | Modèle recommandé | Temps estimé (27K entrées) |
|-----|------|--------------------|----------------------------|
| RTX 4070 | 12 Go | Mistral 7B / DeepSeek 6.7B | ~4-6 heures |
| RTX 3090/4080 | 24 Go | CodeLlama 13B | ~3-4 heures |
| **L40S** | **48 Go** | **Qwen2.5-Coder 32B** | **~3-4 heures** |
| A100 | 40-80 Go | Qwen2.5-Coder 32B | ~1-2 heures |
| H100 | 80 Go | Qwen2.5-Coder 32B | ~30-45 min |

```bash
# Installer les dépendances Python
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
pip install --no-deps trl peft accelerate bitsandbytes transformers datasets

# Optionnel : métriques BLEU et tracking
pip install sacrebleu wandb

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
    {"role": "user", "content": "Modernise ce code Java legacy (struts):\n\n```java\npublic class OrderAction extends ActionSupport...```"},
    {"role": "assistant", "content": "```java\n@RestController\n@RequestMapping(\"/api/orders\")\npublic class OrderController...```"}
  ],
  "metadata": {
    "category": "struts",
    "source": "user/struts-ecommerce-app",
    "method": "rule_based",
    "score": 45,
    "original_file": "OrderAction.java",
    "class_name": "OrderAction"
  }
}
```

### Vérifier le dataset (mode dry-run)

```bash
# Validation complète sans GPU : stats, split, preview, estimation temps
python train.py --dry-run --dataset ./finetuning-dataset.jsonl --model qwen-coder
```

Le mode `--dry-run` affiche :
- Statistiques du dataset (catégories, méthodes, tokens)
- Split stratifié 95/5 avec distribution par catégorie
- Preview de 3 exemples aléatoires
- Vérification GPU/VRAM et compatibilité modèle
- Estimation du temps d'entraînement

---

## Option A — Modelfile Ollama (rapide, sans GPU)

Cette option utilise un modèle de base (CodeLlama 13B) avec un system prompt enrichi contenant les règles de transformation et des exemples de référence. Pas de fine-tuning réel, mais des résultats déjà très bons pour une démo.

### Étape 1 : Préparer le modèle

```bash
cd server/engine/ml/finetuning/

# Télécharger le modèle de base
ollama pull codellama:13b-instruct

# Créer le modèle personnalisé
ollama create ejb-modernizer -f Modelfile
```

### Étape 2 : Tester le modèle

```bash
ollama run ejb-modernizer
```

### Étape 3 : Tester via l'API

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "ejb-modernizer",
  "prompt": "Modernise ce code Java legacy (servlet) vers Spring Boot 3.x :\n\n@WebServlet(\"/api/orders\")\npublic class OrderServlet extends HttpServlet {\n    protected void doGet(HttpServletRequest req, HttpServletResponse resp) {\n        // ...\n    }\n}",
  "stream": false
}'
```

---

## Option B — Fine-tuning Unsloth/LoRA (qualité maximale)

Cette option entraîne réellement le modèle sur les 27 237 paires, produisant un modèle spécialisé avec des résultats nettement supérieurs.

### Étape 0 : Valider le dataset (dry-run)

```bash
cd server/engine/ml/finetuning/

# Vérifier le dataset, la compatibilité GPU et estimer le temps
python train.py --dry-run --dataset ./finetuning-dataset.jsonl --model qwen-coder
```

### Étape 1 : Entraîner le modèle

```bash
# Recommandé pour L40S 48GB : Qwen2.5-Coder 32B
python train.py \
  --model qwen-coder \
  --dataset ./finetuning-dataset.jsonl \
  --epochs 3 \
  --output ./outputs

# Alternative : CodeLlama 13B (24GB VRAM minimum)
python train.py \
  --model codellama \
  --dataset ./finetuning-dataset.jsonl \
  --epochs 3 \
  --output ./outputs

# Alternative rapide : Mistral 7B (12GB VRAM minimum)
python train.py \
  --model mistral \
  --dataset ./finetuning-dataset.jsonl \
  --epochs 5 \
  --output ./outputs

# Sans évaluation post-training (plus rapide)
python train.py \
  --model qwen-coder \
  --dataset ./finetuning-dataset.jsonl \
  --skip-eval \
  --output ./outputs
```

Le script v2.0 gère automatiquement :
- **Détection GPU** et recommandation du modèle optimal
- **max_seq_length dynamique** adapté à la VRAM disponible
- **Split stratifié 95/5** pour la validation
- **Early stopping** (patience=3) pour éviter le surapprentissage
- **WandB** si installé (tracking des métriques en temps réel)
- **Évaluation post-training** (compilation, BLEU, annotations Spring)
- **Rapport JSON complet** dans `outputs/training_report.json`

### Étape 2 : Consulter le rapport

```bash
# Le rapport est généré automatiquement
cat outputs/training_report.json | python -m json.tool
```

Le rapport contient :
- Configuration complète (modèle, hyperparamètres, dataset)
- Résultats (loss, durée, VRAM peak)
- Métriques qualité (compilation rate, BLEU, annotations Spring)
- Recommandations pour le prochain run

### Étape 3 : Convertir en GGUF pour Ollama

```bash
python train.py --export-gguf --output ./outputs
```

### Étape 4 : Créer le modèle Ollama

```bash
# Modifier le Modelfile : remplacer "FROM codellama:13b-instruct" par :
# FROM ./outputs-gguf/ejb-modernizer-q4_k_m.gguf

ollama create ejb-modernizer -f Modelfile
```

### Étape 5 : Tester

```bash
ollama run ejb-modernizer
```

---

## Intégration dans l'application

Le fichier `server/engine/ml/llm-adapter.ts` gère automatiquement le routage entre les différents backends LLM avec une chaîne de priorité à 3 niveaux :

1. **Ollama fine-tuné** (`ejb-modernizer`) — priorité maximale si disponible, boost de confiance +10%
2. **Manus invokeLLM** (cloud) — fallback automatique
3. **Ollama générique** (`qwen2.5-coder:1.5b`) — dernier recours

### Configuration

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=ejb-modernizer
```

### Architecture du pipeline

```
Requête utilisateur
    │
    ▼
llm-adapter.ts (v9.0)
    │
    ├── [1] Ollama ejb-modernizer ? ──► Modèle fine-tuné (27K paires)
    │                                      │ Confiance: +10% boost
    │                                      ▼
    │                                  Réponse rapide (~3-5s)
    │
    ├── [2] Manus invokeLLM ? ──► Cloud LLM (généraliste)
    │                                │
    │                                ▼
    │                            Réponse cloud (~8-12s)
    │
    └── [3] Ollama generic ? ──► qwen2.5-coder:1.5b (fallback)
                                    │
                                    ▼
                                Réponse basique (~5s)
```

---

## Évaluation du modèle

### Métriques automatiques (v2.0)

Le script `train.py` évalue automatiquement le modèle après l'entraînement sur 100 exemples de validation :

| Métrique | Description | Cible |
|----------|-------------|-------|
| Compilation rate | % de code généré qui compile avec `javac` | > 60% |
| Spring annotations | % d'annotations Spring correctement présentes | > 80% |
| BLEU score | Similarité textuelle avec la référence (0-1) | > 0.4 |
| Token overlap | Jaccard similarity des tokens (0-100%) | > 50% |

Les résultats sont ventilés par catégorie dans le rapport JSON.

### Script de test manuel

```bash
python3 -c "
import json, subprocess, random

with open('finetuning-dataset.jsonl') as f:
    entries = [json.loads(line) for line in f]

samples = random.sample(entries, 5)
for i, entry in enumerate(samples):
    user_msg = entry['messages'][1]['content'][:500]
    result = subprocess.run(
        ['ollama', 'run', 'ejb-modernizer', user_msg],
        capture_output=True, text=True, timeout=60
    )
    print(f'--- Test {i+1} ({entry[\"metadata\"][\"category\"]}) ---')
    print(f'Generated: {result.stdout[:200]}...')
"
```

---

## Dépannage

### Erreur "out of memory" pendant le fine-tuning

Le script v2.0 détecte automatiquement la VRAM et recommande un modèle compatible. Si l'OOM survient quand même :

```bash
# Le script recommande automatiquement un modèle plus petit
# Mais vous pouvez forcer manuellement :

# Utiliser Mistral 7B au lieu de Qwen 32B
python train.py --model mistral --dataset ./finetuning-dataset.jsonl

# Ou utiliser CodeLlama 7B (le plus léger)
python train.py --model codellama-7b --dataset ./finetuning-dataset.jsonl
```

### Le dataset est trop volumineux pour la RAM

Utiliser un sous-ensemble pour les premiers tests :

```bash
# Prendre les 5000 premières entrées
head -5000 finetuning-dataset.jsonl > finetuning-dataset-5k.jsonl
python train.py --dataset ./finetuning-dataset-5k.jsonl
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

### WandB ne fonctionne pas

WandB est optionnel. Si l'initialisation échoue, le training continue normalement sans tracking. Pour désactiver explicitement :

```bash
WANDB_DISABLED=true python train.py --model qwen-coder --dataset ./finetuning-dataset.jsonl
```

### L'évaluation post-training est trop lente

Utiliser `--skip-eval` pour sauter l'évaluation :

```bash
python train.py --model qwen-coder --dataset ./finetuning-dataset.jsonl --skip-eval
```

---

## Enrichir le dataset

Pour améliorer la qualité du modèle, ajouter de nouvelles paires :

```bash
echo '{
  "messages": [
    {"role": "system", "content": "Tu es un expert en modernisation Java EE..."},
    {"role": "user", "content": "Modernise ce code..."},
    {"role": "assistant", "content": "```java\n...\n```"}
  ],
  "metadata": {"category": "ejb_session_bean", "source": "manual", "method": "expert"}
}' >> finetuning-dataset.jsonl
```

---

## Licence

Ce dataset et ces scripts sont fournis dans le cadre du projet EJB Client Modernizer.
Les fichiers Java source proviennent de projets open source sous licences Apache 2.0, MIT ou GPL.
