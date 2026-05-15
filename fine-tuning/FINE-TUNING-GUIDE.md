# Guide de Fine-Tuning — Qwen-EJB-Migrator

## Vue d'ensemble

Ce guide décrit le processus complet pour créer un modèle LLM spécialisé dans la migration de code Java legacy vers Spring Boot. Le modèle résultant, **Qwen-EJB-Migrator**, est entraîné sur un dataset combinant vos données BMCE réelles et des milliers de fichiers legacy Java scrapés depuis GitHub.

---

## Architecture du pipeline

```
┌──────────────────────────────────────────────────────────────────┐
│  1. SCRAPING GITHUB          2. PAIRES SYNTHETIQUES              │
│  01_scrape_github_ejb.py     02_generate_synthetic_pairs.py      │
│  → 5,000-10,000 fichiers     → 10,000-15,000 paires via LLM     │
│  → 30 catégories legacy      → 50+ types de migration            │
└──────────┬───────────────────────────┬───────────────────────────┘
           │                           │
           ▼                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  3. EXTRACTION BMCE          4. FORMATAGE DATASET                │
│  03_extract_bmce_data.py     04_format_dataset.py                │
│  → 1,700+ paires réelles     → JSONL unifié + train/val split    │
│  → 101 règles apprises       → Nettoyage + déduplication         │
│  → 500+ choix d'ambiguïtés   → Validation qualité                │
└──────────┬───────────────────────────┬───────────────────────────┘
           │                           │
           ▼                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  5. ENTRAINEMENT QLORA       6. DEPLOIEMENT OLLAMA               │
│  05_train_qlora.py           06_deploy_ollama.sh                 │
│  → QLoRA 4-bit sur T4        → Conversion GGUF Q4_K_M            │
│  → 3-5 epochs, ~2-4h         → Modelfile Ollama                  │
│  → Adapter LoRA 256 MB       → Test + benchmark                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Prérequis

### Matériel

| Composant | Minimum | Recommandé |
|---|---|---|
| GPU | NVIDIA T4 (16 Go VRAM) | NVIDIA A10G (24 Go VRAM) |
| RAM | 32 Go | 64 Go |
| Disque | 100 Go SSD | 200 Go SSD |
| CPU | 4 vCPU | 8 vCPU |

### Logiciel

```bash
# Python 3.10+
sudo apt install python3.10 python3-pip

# CUDA 12.x (pour GPU)
# Suivre https://developer.nvidia.com/cuda-downloads

# Dépendances Python
pip install requests tqdm openai anthropic
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install unsloth transformers datasets peft accelerate bitsandbytes
pip install llama-cpp-python

# Ollama
curl -fsSL https://ollama.com/install.sh | sh

# GitHub CLI (pour le scraping)
sudo apt install gh
gh auth login
```

---

## Étape 1 : Scraping GitHub

Le script `01_scrape_github_ejb.py` collecte des fichiers Java legacy depuis GitHub. Il couvre **30 catégories** de technologies legacy.

### Technologies couvertes

| Catégorie | Annotations/Patterns recherchés |
|---|---|
| **EJB** | @Stateless, @Stateful, @Singleton, @MessageDriven, @Entity (EJB 2.x) |
| **Servlets** | HttpServlet, doGet, doPost, Filter, Listener |
| **JSP** | <%@, taglib, JSTL |
| **Struts** | ActionForm, Action, struts-config.xml |
| **JDBC** | DriverManager, PreparedStatement, ResultSet, Connection |
| **Hibernate** | SessionFactory, HQL, Criteria, hbm.xml |
| **JMS** | MessageListener, QueueSender, TopicPublisher |
| **SOAP** | @WebService, @WebMethod, JAX-WS, WSDL |
| **RMI/CORBA** | UnicastRemoteObject, ORB, IDL |
| **JCA** | ResourceAdapter, ManagedConnectionFactory |
| **JNDI** | InitialContext, lookup, java:comp/env |
| **Java Batch** | ItemReader, ItemWriter, ItemProcessor (JSR-352) |
| **JMX** | MBean, MBeanServer |
| **JSF** | @ManagedBean, FacesContext |
| **Spring XML** | applicationContext.xml, bean definitions |

### Lancement

```bash
cd deploy/fine-tuning/scripts

# Scraping complet (5,000-10,000 fichiers, ~2-4h)
python3 01_scrape_github_ejb.py \
    --output ./dataset/raw_legacy \
    --max-repos 5000 \
    --max-files 10000

# Scraping rapide (test, ~30 min)
python3 01_scrape_github_ejb.py \
    --output ./dataset/raw_legacy \
    --max-repos 500 \
    --max-files 1000
```

### Sortie

```
dataset/raw_legacy/
├── ejb_stateless/          # 500-1000 fichiers
├── ejb_stateful/           # 100-200 fichiers
├── ejb_mdb/                # 100-200 fichiers
├── servlet/                # 500-1000 fichiers
├── jdbc_dao/               # 500-1000 fichiers
├── hibernate_session/      # 300-500 fichiers
├── jms_producer/           # 100-200 fichiers
├── soap_service/           # 200-400 fichiers
├── struts1_action/         # 200-400 fichiers
├── jndi_lookup/            # 200-400 fichiers
├── spring_xml_beans/       # 300-500 fichiers
├── ...                     # 30 catégories au total
└── _scrape_stats.json      # Statistiques
```

---

## Étape 2 : Génération de paires synthétiques

Le script `02_generate_synthetic_pairs.py` prend les fichiers legacy scrapés et génère des paires (input legacy → output Spring Boot) via un LLM.

### Lancement

```bash
# Avec Ollama local (recommandé — gratuit, rapide)
python3 02_generate_synthetic_pairs.py \
    --input ./dataset/raw_legacy \
    --output ./dataset/pairs \
    --provider ollama \
    --model qwen2.5-coder:14b \
    --max-pairs 15000

# Avec OpenAI (plus cher mais meilleure qualité initiale)
python3 02_generate_synthetic_pairs.py \
    --input ./dataset/raw_legacy \
    --output ./dataset/pairs \
    --provider openai \
    --model gpt-4o-mini \
    --api-key sk-xxx \
    --max-pairs 15000 \
    --rate-limit 0.5
```

**Durée estimée** : 
- Ollama local (T4) : ~10-15h pour 15,000 paires
- OpenAI gpt-4o-mini : ~8h pour 15,000 paires (~15$ de coût API)

Le script supporte la **reprise** : si interrompu, relancez la même commande et il reprendra là où il s'est arrêté.

---

## Étape 3 : Extraction des données BMCE

Le script `03_extract_bmce_data.py` extrait vos données réelles depuis la base de données de l'application.

### Lancement

```bash
python3 03_extract_bmce_data.py \
    --db-url "mysql://user:pass@host:3306/modernizer" \
    --output ./dataset/bmce
```

### Données extraites

| Type | Volume estimé | Valeur |
|---|---|---|
| Paires source → généré | ~1,700 | Migrations réelles BMCE |
| Règles apprises | 101 | Connaissances métier |
| Choix d'ambiguïtés | ~500+ | Préférences de migration |
| Mapping BIAN | ~50+ | Vocabulaire bancaire |

---

## Étape 4 : Formatage du dataset

Le script `04_format_dataset.py` combine toutes les sources en un dataset JSONL unifié, prêt pour l'entraînement.

### Lancement

```bash
python3 04_format_dataset.py \
    --pairs ./dataset/pairs \
    --bmce ./dataset/bmce \
    --output ./dataset/final \
    --val-ratio 0.05
```

### Sortie

```
dataset/final/
├── train.jsonl          # ~19,000 exemples d'entraînement
├── val.jsonl            # ~1,000 exemples de validation
└── dataset_stats.json   # Statistiques détaillées
```

---

## Étape 5 : Entraînement QLoRA

Le script `05_train_qlora.py` entraîne le modèle Qwen 2.5 Coder avec QLoRA (quantized Low-Rank Adaptation).

### Lancement

```bash
# Sur GPU T4 (16 Go VRAM)
python3 05_train_qlora.py \
    --base-model unsloth/Qwen2.5-Coder-14B-Instruct-bnb-4bit \
    --dataset ./dataset/final \
    --output ./model/qwen-ejb-migrator-lora \
    --epochs 3 \
    --batch-size 2 \
    --learning-rate 2e-4 \
    --lora-rank 64

# Sur GPU A10G (24 Go VRAM) — meilleure qualité
python3 05_train_qlora.py \
    --base-model unsloth/Qwen2.5-Coder-14B-Instruct-bnb-4bit \
    --dataset ./dataset/final \
    --output ./model/qwen-ejb-migrator-lora \
    --epochs 5 \
    --batch-size 4 \
    --learning-rate 1e-4 \
    --lora-rank 128
```

**Durée estimée** :
- T4 (16 Go) : ~3-4h pour 3 epochs
- A10G (24 Go) : ~2-3h pour 5 epochs

### Métriques à surveiller

| Métrique | Bon | Excellent |
|---|---|---|
| Training loss | < 0.5 | < 0.3 |
| Validation loss | < 0.6 | < 0.4 |
| Compilabilité du code généré | > 80% | > 90% |

---

## Étape 6 : Déploiement Ollama

Le script `06_deploy_ollama.sh` convertit le modèle entraîné en format GGUF et le déploie sur Ollama.

### Lancement

```bash
chmod +x 06_deploy_ollama.sh
./06_deploy_ollama.sh \
    --lora-path ./model/qwen-ejb-migrator-lora \
    --output ./model/gguf \
    --quant q4_K_M \
    --model-name qwen-ejb-migrator
```

### Vérification

```bash
# Tester le modèle
ollama run qwen-ejb-migrator "Migrate this EJB @Stateless bean to Spring Boot: ..."

# Vérifier qu'il est disponible
ollama list
```

---

## Intégration avec l'application

Une fois le modèle déployé sur Ollama, modifiez la configuration de l'application :

### 1. Variable d'environnement

```bash
# Dans .env ou docker-compose.yml
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen-ejb-migrator
```

### 2. Configuration llm-adapter.ts

Le `llm-adapter.ts` de l'application détecte automatiquement Ollama. Il suffit que le serveur Ollama soit accessible sur `OLLAMA_BASE_URL`.

---

## Dataset final estimé

| Source | Paires | Pourcentage |
|---|---|---|
| GitHub scraping + paires synthétiques | ~15,000 | 75% |
| Données BMCE réelles | ~1,700 | 8.5% |
| Règles + ambiguïtés BMCE | ~600 | 3% |
| Migrations GitHub réelles (diffs) | ~2,700 | 13.5% |
| **Total** | **~20,000** | **100%** |

---

## Résultats attendus

| Métrique | Avant (Qwen base) | Après (fine-tuné) |
|---|---|---|
| Compilabilité du code | 50-60% | 85-95% |
| Résolution auto ambiguïtés | 60% | 90%+ |
| Patterns EJB reconnus | ~15 | 50+ |
| Temps par projet (110 fichiers) | 5-10 min | 3-5 min |
| Qualité vs GPT-4 | 70% | 90-95% |

---

## Troubleshooting

### CUDA out of memory

Réduire `--batch-size` à 1 et `--lora-rank` à 32.

### Scraping rate-limited par GitHub

Le script gère automatiquement les rate limits avec des pauses. Si bloqué, attendez 1h ou utilisez un token GitHub avec plus de quota.

### Validation loss diverge

Le dataset contient probablement des paires de mauvaise qualité. Relancez `04_format_dataset.py` avec `--min-quality 0.7` pour filtrer plus strictement.

### Modèle GGUF trop gros

Utilisez `--quant q3_K_M` au lieu de `q4_K_M` (perte de qualité minime, ~30% plus petit).

---

## Coûts

| Étape | Coût | Durée |
|---|---|---|
| Scraping GitHub | Gratuit | 2-4h |
| Paires synthétiques (Ollama) | Gratuit (GPU local) | 10-15h |
| Paires synthétiques (OpenAI) | ~15$ | 8h |
| Entraînement QLoRA (T4) | Inclus dans EC2 | 3-4h |
| **Total** | **0-15$** | **~20-25h** |

---

## Prochaines étapes

1. **Itérer** : Relancer le scraping + entraînement tous les mois avec de nouvelles données
2. **Benchmark** : Comparer systématiquement Qwen-EJB-Migrator vs GPT-4 vs Claude sur 10 projets de test
3. **Spécialiser** : Créer des variantes par domaine (bancaire, assurance, telecom)
4. **Commercialiser** : Le modèle fine-tuné est un actif propriétaire vendable en SaaS
