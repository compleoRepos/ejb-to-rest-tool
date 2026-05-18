# EJB Client Modernizer — Déploiement OpenShift

Plateforme complète de modernisation Java EE vers Spring Boot / Cloud-Native.
**100% autonome** — aucune dépendance internet requise en production.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenShift Cluster                          │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │  Frontend   │───▶│   Backend   │───▶│   MySQL 8.0  │    │
│  │  (Nginx)    │    │  (Node.js)  │    │  (100K repos)│    │
│  │  Port 8080  │    │  Port 3000  │    │  Port 3306   │    │
│  └─────────────┘    └──────┬──────┘    └──────────────┘    │
│                             │                                │
│                    ┌────────┴────────┐                       │
│                    │                 │                        │
│           ┌────────▼──────┐  ┌──────▼───────┐               │
│           │  Inference    │  │   Pipeline   │               │
│           │  (Ollama+GPU) │  │  (JDK+Maven) │               │
│           │  Port 11434   │  │  Port 8080   │               │
│           └───────────────┘  └──────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Composants

| Service | Image | Rôle | Ressources |
|---------|-------|------|------------|
| **frontend** | `ejb-modernizer-frontend` | SPA React + Nginx reverse proxy | 128Mi RAM |
| **backend** | `ejb-modernizer-backend` | API tRPC + Express, orchestration | 2Gi RAM |
| **mysql** | `mysql:8.0` | Base de données (100K repos GitHub) | 4Gi RAM, 20Gi PVC |
| **inference** | `ejb-modernizer-inference` | Ollama + modèle fine-tuné 32B | 32Gi RAM, 1 GPU |
| **pipeline** | `ejb-modernizer-pipeline` | JDK 21 + Maven + Gradle + SonarScanner | 8Gi RAM |

---

## Prérequis

- Red Hat OpenShift 4.12+
- NVIDIA GPU Operator installé (pour le pod inference)
- GPU NVIDIA avec ≥24 GB VRAM (A10G, L4, A100, etc.)
- `oc` CLI connecté au cluster
- Registre d'images accessible (interne ou Quay.io)

---

## Installation rapide (Docker Compose)

Pour tester en local avant le déploiement OpenShift :

```bash
# 1. Copier le fichier d'environnement
cp .env.example .env

# 2. Décompresser le dump SQL
gunzip -k data/init.sql.gz

# 3. Placer le modèle GGUF dans ./models/
cp /path/to/ejb-modernizer-32b-Q4_K_M.gguf models/

# 4. Lancer tous les services
docker-compose up -d --build

# 5. Accéder à l'application
open http://localhost
```

---

## Déploiement OpenShift

### 1. Build et push des images

```bash
# Depuis la racine du projet
REGISTRY=image-registry.openshift-image-registry.svc:5000/ejb-modernizer

# Build des images
docker build -f docker/Dockerfile.frontend -t $REGISTRY/frontend:latest .
docker build -f docker/Dockerfile.backend -t $REGISTRY/backend:latest .
docker build -f docker/Dockerfile.pipeline -t $REGISTRY/pipeline:latest .
docker build -f docker/Dockerfile.inference -t $REGISTRY/inference:latest .

# Push vers le registre OpenShift
docker push $REGISTRY/frontend:latest
docker push $REGISTRY/backend:latest
docker push $REGISTRY/pipeline:latest
docker push $REGISTRY/inference:latest
```

### 2. Déployer les manifests

```bash
# Script automatique
chmod +x openshift/deploy.sh
./openshift/deploy.sh

# OU manuellement
oc apply -f openshift/00-namespace.yaml
oc apply -f openshift/01-config.yaml
oc apply -f openshift/02-storage.yaml
oc apply -f openshift/03-mysql.yaml
oc apply -f openshift/04-backend.yaml
oc apply -f openshift/05-frontend.yaml
oc apply -f openshift/06-inference.yaml
oc apply -f openshift/07-pipeline.yaml
oc apply -f openshift/08-route.yaml
```

### 3. Charger les données initiales

```bash
# Copier le dump SQL dans le pod MySQL
oc cp data/init.sql ejb-modernizer/$(oc get pod -l app=mysql -n ejb-modernizer -o name | head -1 | cut -d/ -f2):/tmp/init.sql

# Exécuter l'import
oc exec -n ejb-modernizer deploy/mysql -- mysql -u root -p'ejb-modernizer-2025' ejb_modernizer < /tmp/init.sql
```

### 4. Charger le modèle fine-tuné

```bash
# Copier le GGUF dans le PVC models-data
oc cp ejb-modernizer-32b-Q4_K_M.gguf ejb-modernizer/$(oc get pod -l app=inference -n ejb-modernizer -o name | head -1 | cut -d/ -f2):/models/

# Redémarrer le pod inference pour charger le modèle
oc rollout restart deployment/inference -n ejb-modernizer
```

---

## Configuration

### Variables d'environnement (ConfigMap)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `NODE_ENV` | Environnement Node.js | `production` |
| `PORT` | Port du backend | `3000` |
| `OLLAMA_URL` | URL du service Ollama | `http://inference:11434` |
| `OLLAMA_MODEL` | Nom du modèle Ollama | `ejb-modernizer` |
| `PIPELINE_URL` | URL du service pipeline | `http://pipeline:8080` |
| `STORAGE_PATH` | Chemin de stockage fichiers | `/data/uploads` |

### Secrets

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | URL de connexion MySQL |
| `MYSQL_ROOT_PASSWORD` | Mot de passe root MySQL |
| `JWT_SECRET` | Secret pour les tokens JWT |

---

## Modèle fine-tuné

Le modèle `ejb-modernizer-32b` est un Qwen2.5-Coder-32B fine-tuné sur 95 000 paires de transformation Java EE → Spring Boot.

**Caractéristiques :**
- Format : GGUF Q4_K_M (~20 GB)
- VRAM requise : ≥24 GB
- Context window : 8192 tokens
- Spécialisations : EJB, Servlets, JSP, Struts, SOAP, JDBC, Hibernate, JMS

**Catégories de transformation :**
- `ejb_to_spring` — EJB Session/Entity Beans → Spring Services
- `jsp_to_react` — JSP/JSTL → React TypeScript
- `servlet_to_controller` — Servlets → Spring REST Controllers
- `jdbc_to_jpa` — JDBC brut → Spring Data JPA
- `soap_to_rest` — SOAP/WSDL → REST OpenAPI
- `struts_to_spring_mvc` — Struts Actions → Spring MVC
- `jms_to_kafka` — JMS → Spring Kafka/RabbitMQ

---

## Pipeline de compilation

Le service pipeline expose une API REST pour compiler et analyser les projets Java :

```bash
# Health check
curl http://pipeline:8080/health

# Détecter l'outil de build
curl -X POST http://pipeline:8080/detect -d '{"projectDir": "/workspace/my-project"}'

# Compiler un projet
curl -X POST http://pipeline:8080/compile -d '{"projectDir": "/workspace/my-project"}'

# Analyser la structure
curl -X POST http://pipeline:8080/analyze -d '{"projectDir": "/workspace/my-project"}'
```

**Outils disponibles :**
- JDK 21 (OpenJDK Temurin)
- Maven 3.6.3
- Gradle 8.12
- SonarScanner 6.2.1
- Node.js 20
- Git

---

## Structure du projet

```
ejb-modernizer-openshift/
├── README.md                    ← Ce fichier
├── docker-compose.yml           ← Test local
├── .env.example                 ← Variables d'environnement
├── app/                         ← Code source (frontend + backend)
│   ├── client/                  ← React SPA
│   ├── server/                  ← Backend Node.js + tRPC
│   ├── drizzle/                 ← Schéma DB + migrations
│   └── shared/                  ← Types partagés
├── docker/                      ← Dockerfiles
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   ├── Dockerfile.pipeline
│   ├── Dockerfile.inference
│   ├── Modelfile               ← Config Ollama
│   ├── nginx.conf              ← Config Nginx
│   └── entrypoint-ollama.sh    ← Script de démarrage Ollama
├── openshift/                   ← Manifests Kubernetes/OpenShift
│   ├── 00-namespace.yaml
│   ├── 01-config.yaml
│   ├── 02-storage.yaml
│   ├── 03-mysql.yaml
│   ├── 04-backend.yaml
│   ├── 05-frontend.yaml
│   ├── 06-inference.yaml
│   ├── 07-pipeline.yaml
│   ├── 08-route.yaml
│   └── deploy.sh              ← Script de déploiement automatique
├── pipeline/                    ← Service de compilation Java
│   ├── server.js
│   └── package.json
├── models/                      ← Modèle GGUF (à ajouter après training)
├── data/                        ← Dump SQL (100K repos)
│   ├── init.sql.gz             ← Dump compressé (37 MB)
│   └── init.sql                ← Dump décompressé (262 MB)
└── scripts/                     ← Scripts utilitaires
    └── export-data.mjs
```

---

## Auteur

**Hamza NORDINE** — Compleo Consulting / BMCE Bank

---

## Licence

Propriétaire — Usage interne uniquement.
