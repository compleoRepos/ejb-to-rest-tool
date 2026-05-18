# Guide d'Installation On-Premises — Compleo EJB Client Modernizer v4.0

> **Auteur :** Compleo  
> **Version :** 2.0.0  
> **Dernière mise à jour :** 2026-04-13  
> **Classification :** Interne — Équipe Infrastructure

---

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Installation Linux (Docker)](#2-installation-linux-docker)
3. [Installation Windows (Développement local)](#3-installation-windows-développement-local)
4. [Services ML optionnels (Ollama + ChromaDB)](#4-services-ml-optionnels-ollama--chromadb)
5. [Vérification post-installation](#5-vérification-post-installation)
6. [Configuration SSO / LDAP](#6-configuration-sso--ldap)
7. [Maintenance et opérations](#7-maintenance-et-opérations)
8. [Dépannage](#8-dépannage)
9. [Mise à jour](#9-mise-à-jour)

---

## 1. Prérequis

### 1.1 Matériel minimum

| Composant | Minimum | Recommandé | Avec ML activé |
|-----------|---------|------------|-----------------|
| CPU | 4 vCPU | 8 vCPU | 8 vCPU |
| RAM | 8 Go | 16 Go | 32 Go |
| Disque | 50 Go SSD | 100 Go SSD | 150 Go SSD |
| Réseau | 100 Mbps | 1 Gbps | 1 Gbps |

### 1.2 Logiciels requis

Les prérequis diffèrent selon le mode d'installation choisi.

**Mode Docker (Linux/macOS — production) :**

| Logiciel | Version minimale | Vérification |
|----------|-----------------|--------------|
| Docker Engine | 24.0+ | `docker --version` |
| Docker Compose | 2.20+ | `docker compose version` |
| Git | 2.30+ | `git --version` |

**Mode développement local (Windows/macOS/Linux) :**

| Logiciel | Version minimale | Vérification |
|----------|-----------------|--------------|
| Node.js | 18.0+ (LTS 22 recommandé) | `node --version` |
| pnpm | 9.0+ | `pnpm --version` |
| Git | 2.30+ | `git --version` |
| Docker Desktop | 4.0+ (optionnel, pour ML) | `docker --version` |

### 1.3 Ports réseau

| Port | Service | Direction | Obligatoire |
|------|---------|-----------|:-----------:|
| 3000 | Application Web (Compleo) | Entrant | Oui |
| 5432 | PostgreSQL (interne) | Interne | Docker uniquement |
| 9000 | MinIO S3 (interne) | Interne | Docker uniquement |
| 9001 | MinIO Console (optionnel) | Entrant (admin) | Non |
| 11434 | Ollama (ML) | Interne | Non |
| 8001 | ChromaDB (ML) | Interne | Non |

### 1.4 Accès réseau

Compleo fonctionne en mode **air-gapped complet**. Aucun appel externe n'est requis en production. Le moteur d'analyse, les règles d'intelligence et le learning engine sont 100% embarqués. Seule exception optionnelle : accès Git externe pour le clonage de dépôts (configurable via proxy).

### 1.5 Comptes et permissions

Pour le mode Docker, un utilisateur avec accès `sudo` ou membre du groupe `docker` est nécessaire. Pour le mode développement local sous Windows, un accès administrateur est requis pour certaines étapes d'installation (Node.js, pnpm, politique d'exécution PowerShell).

---

## 2. Installation Linux (Docker)

Cette section couvre l'installation complète via Docker, recommandée pour les environnements de production.

### Étape 1 — Cloner le dépôt et configurer l'environnement

```bash
# Cloner le dépôt
git clone https://github.com/compleoRepos/ejb-client-modernizer.git
cd ejb-client-modernizer

# Copier le template de configuration
cp docker/env-template.conf .env

# Éditer les variables d'environnement
nano .env
```

**Variables obligatoires à configurer dans `.env` :**

```ini
# Sécurité — OBLIGATOIRE : changer ces valeurs
JWT_SECRET=<générer avec: openssl rand -hex 32>
POSTGRES_PASSWORD=<mot de passe fort>
MINIO_ROOT_PASSWORD=<mot de passe fort, min 8 caractères>

# Mode d'authentification
AUTH_MODE=local              # ou "ldap" pour SSO (voir section 6)
LOCAL_ADMIN_USER=admin       # Utilisateur admin par défaut
LOCAL_ADMIN_PASSWORD=<mot de passe fort>
```

### Étape 2 — Lancer l'installation automatique

```bash
# Rendre le script exécutable
chmod +x scripts/docker-init.sh

# Lancer l'installation
./scripts/docker-init.sh
```

Le script `docker-init.sh` effectue automatiquement la vérification de Docker, la validation du `.env`, la construction de l'image multi-stage, le démarrage des services, l'attente du health check, les migrations de base de données et le seed des règles d'apprentissage.

### Étape 3 — Accéder à l'application

```bash
# Ouvrir dans le navigateur
open http://localhost:3000

# Ou vérifier via curl
curl -s http://localhost:3000/api/health | jq .
```

**Réponse attendue :**

```json
{
  "status": "healthy",
  "version": "4.0.0",
  "services": {
    "database": "connected",
    "storage": "connected",
    "engine": "ready"
  }
}
```

---

## 3. Installation Windows (Développement local)

Cette section détaille l'installation pas-à-pas sur un poste Windows, testée sur Windows 11 Pro. Elle documente les problèmes courants rencontrés et leurs solutions.

### Étape 1 — Installer Node.js 22 LTS

Télécharger l'installeur MSI depuis [https://nodejs.org](https://nodejs.org) (bouton "Download Node.js LTS") et exécuter l'installeur avec les options par défaut.

> **Vérification :** Ouvrir un nouveau PowerShell et exécuter `node --version`. Le résultat attendu est `v22.x.x`.

> **Problème courant : ancienne version de Node.js.** Si `node --version` retourne une version inférieure à 18 (par exemple `v10.21.0`), il faut désinstaller l'ancienne version via "Programmes et fonctionnalités" dans le Panneau de configuration, puis réinstaller Node.js 22 LTS. Fermer et rouvrir PowerShell après l'installation.

### Étape 2 — Configurer la politique d'exécution PowerShell

Par défaut, Windows bloque l'exécution de scripts PowerShell (y compris les commandes `pnpm`). Il faut modifier cette politique.

Ouvrir **PowerShell en tant qu'Administrateur** (clic droit sur PowerShell dans le menu Démarrer, puis "Exécuter en tant qu'administrateur") et exécuter :

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Répondre **O** (Oui) à la confirmation.

> **Pourquoi cette étape ?** Sans cette modification, toute commande `pnpm` échouera avec l'erreur `PSSecurityException: l'exécution de scripts est désactivée sur ce système`. C'est une restriction de sécurité Windows qui empêche l'exécution de fichiers `.ps1`.

### Étape 3 — Installer pnpm et désactiver Corepack

Node.js 22 inclut `corepack` qui peut interférer avec `pnpm`. La procédure recommandée est la suivante.

Toujours dans le **PowerShell Administrateur** :

```powershell
# Désactiver corepack pour éviter les conflits
corepack disable

# Installer pnpm globalement
npm install -g pnpm@9
```

Fermer le PowerShell Administrateur et ouvrir un **PowerShell normal** :

```powershell
pnpm --version
```

> **Problème courant : conflit Corepack/pnpm.** Si `pnpm --version` affiche une erreur `Corepack is about to download...` suivie de `NativeCommandError`, cela signifie que Corepack intercepte la commande. La solution est d'exécuter `corepack disable` en mode Administrateur avant d'installer pnpm via npm. Si les fichiers Corepack persistent, les supprimer manuellement :
>
> ```powershell
> # En PowerShell Administrateur
> Remove-Item "C:\Program Files\nodejs\pnpm.ps1" -Force -ErrorAction SilentlyContinue
> Remove-Item "C:\Program Files\nodejs\pnpm.cmd" -Force -ErrorAction SilentlyContinue
> npm install -g pnpm@9
> ```

### Étape 4 — Cloner le dépôt et installer les dépendances

```powershell
# Se placer dans le répertoire de travail
cd C:\Users\<VotreNom>\Desktop\DEV

# Cloner le dépôt
git clone https://github.com/compleoRepos/ejb-client-modernizer.git
cd ejb-client-modernizer

# Basculer sur la branche de développement
git checkout feature/microservice-ml-generator

# Installer les dépendances Node.js
pnpm install
```

L'installation des dépendances prend généralement 2 à 5 minutes selon la connexion réseau.

### Étape 5 — Configurer l'environnement

```powershell
# Copier le template de configuration
Copy-Item docker/env-template.conf .env

# Ouvrir le fichier dans Notepad pour l'éditer
notepad .env
```

Configurer les variables suivantes dans le fichier `.env` :

```ini
# Sécurité
SESSION_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
LOCAL_ADMIN_PASSWORD=Compleo2024!

# Services ML (optionnels, voir section 4)
OLLAMA_URL=http://localhost:11434
CHROMA_URL=http://localhost:8001
ML_MODEL=qwen2.5:1.5b
```

> **Mode sans base de données.** En mode développement local, l'application fonctionne sans base de données externe. Les sessions sont stockées en mémoire. Le warning `ECONNREFUSED` dans les logs est normal et non bloquant. La DB n'est nécessaire que pour la persistance des sessions entre redémarrages.

### Étape 6 — Lancer l'application

```powershell
pnpm dev
```

L'application démarre sur **http://localhost:3000** (ou le prochain port disponible si 3000 est occupé). Ouvrir cette URL dans le navigateur.

> **Problème courant : port déjà occupé.** Si le port 3000 est utilisé par une autre instance, l'application basculera automatiquement sur le port 3001. Vérifier le message dans la console : `Server running on http://localhost:300X/`.

> **Problème courant : `NODE_ENV=development` ne fonctionne pas sous Windows.** Le projet utilise `cross-env` pour la compatibilité Windows. Si vous obtenez une erreur `NODE_ENV is not recognized`, vérifiez que `cross-env` est bien dans les dépendances (`pnpm add -D cross-env`) et que les scripts dans `package.json` utilisent `cross-env NODE_ENV=development` au lieu de `NODE_ENV=development`.

---

## 4. Services ML optionnels (Ollama + ChromaDB)

Les services ML enrichissent la génération avec du RAG (Retrieval-Augmented Generation). Ils sont **optionnels** : sans eux, le pipeline fonctionne en mode **rule-based** (mode principal et le plus fiable).

### 4.1 Prérequis

Docker Desktop doit être installé et en cours d'exécution.

### 4.2 Démarrer les services ML

```bash
# Linux/macOS
docker compose -f docker/docker-compose.feature.yml up -d

# Windows (PowerShell)
docker compose -f docker/docker-compose.feature.yml up -d
```

### 4.3 Télécharger le modèle ML

Le modèle `qwen2.5:1.5b` (environ 1 Go) doit être téléchargé dans Ollama :

```bash
docker exec docker-ollama-1 ollama pull qwen2.5:1.5b
```

Ce téléchargement peut prendre plusieurs minutes selon la connexion réseau.

### 4.4 Vérifier les services ML

```bash
# Vérifier Ollama (Linux/macOS)
curl http://localhost:11434/api/version

# Vérifier ChromaDB (Linux/macOS)
curl http://localhost:8001/api/v2/heartbeat
```

Sous Windows PowerShell, utiliser `Invoke-WebRequest` avec le flag `-UseBasicParsing` :

```powershell
# Vérifier Ollama
Invoke-WebRequest -Uri "http://localhost:11434/api/version" -UseBasicParsing

# Vérifier ChromaDB
Invoke-WebRequest -Uri "http://localhost:8001/api/v2/heartbeat" -UseBasicParsing
```

> **Problème courant : "ML non disponible" dans les logs.** Ce message apparaît quand Ollama ou ChromaDB ne sont pas accessibles au démarrage de l'application. Causes possibles :
>
> 1. Docker Desktop n'est pas lancé.
> 2. Les conteneurs ML ne sont pas démarrés (`docker compose -f docker/docker-compose.feature.yml up -d`).
> 3. Le modèle n'est pas téléchargé (`docker exec docker-ollama-1 ollama pull qwen2.5:1.5b`).
> 4. Les variables `OLLAMA_URL` et `CHROMA_URL` ne sont pas dans le `.env`.
> 5. Incompatibilité de version d'API ChromaDB (v1 vs v2) — voir section 8.7.
>
> Après avoir résolu le problème, **redémarrer l'application** (Ctrl+C puis `pnpm dev`) pour que le health check ML soit relancé.

### 4.5 Configuration `.env` pour ML

```ini
OLLAMA_URL=http://localhost:11434
CHROMA_URL=http://localhost:8001
ML_MODEL=qwen2.5:1.5b
```

### 4.6 Ports ML

| Port | Service | Exposé par |
|------|---------|------------|
| 11434 | Ollama API | `docker-compose.feature.yml` |
| 8001 | ChromaDB API | `docker-compose.feature.yml` (mapping 8001→8000) |

> **Note importante :** Le port interne de ChromaDB est 8000, mais il est exposé sur 8001 dans le `docker-compose.feature.yml`. Le `.env` doit utiliser `CHROMA_URL=http://localhost:8001` (port externe).

---

## 5. Vérification post-installation

### 5.1 Checklist de validation

| Test | Commande | Résultat attendu |
|------|----------|-----------------|
| Application accessible | Navigateur → `http://localhost:3000` | Page d'accueil Compleo |
| Health check | `curl http://localhost:3000/api/health` | `status: "healthy"` |
| Login admin | Interface web → Login | Accès au dashboard |
| Technologies | Onglet "Compleo" | Liste de 14+ technologies |
| Upload ZIP | Bouton "Nouveau Projet" | Analyse et génération réussie |
| Ollama (optionnel) | `curl http://localhost:11434/api/version` | `{"version":"0.20.x"}` |
| ChromaDB (optionnel) | `curl http://localhost:8001/api/v2/heartbeat` | `{"nanosecond heartbeat":...}` |

### 5.2 Test fonctionnel rapide

Après l'installation, effectuer un test de migration complet :

1. Accéder à l'application dans le navigateur.
2. Cliquer sur "Nouveau Projet" ou "Compleo".
3. Uploader un fichier ZIP contenant des sources Java EJB.
4. Vérifier que les phases s'exécutent : CLONING → ANALYZING → GENERATING → MICROSERVICES → COMPILING → PUSHING.
5. Télécharger le résultat et vérifier les fichiers Spring Boot générés.

---

## 6. Configuration SSO / LDAP

### 6.1 Activer le mode LDAP

Dans le fichier `.env` :

```ini
AUTH_MODE=ldap

# Serveur LDAP
LDAP_URL=ldap://ldap.entreprise.local:389
LDAP_BIND_DN=cn=admin,dc=entreprise,dc=local
LDAP_BIND_PASSWORD=<mot de passe du bind DN>
LDAP_SEARCH_BASE=ou=users,dc=entreprise,dc=local
LDAP_SEARCH_FILTER=(uid={{username}})

# Mapping des attributs
LDAP_ATTR_USERNAME=uid
LDAP_ATTR_EMAIL=mail
LDAP_ATTR_DISPLAY_NAME=cn
LDAP_ATTR_GROUPS=memberOf

# Groupe requis pour accéder à Compleo (optionnel)
LDAP_REQUIRED_GROUP=cn=compleo-users,ou=groups,dc=entreprise,dc=local

# Groupe admin (optionnel)
LDAP_ADMIN_GROUP=cn=compleo-admins,ou=groups,dc=entreprise,dc=local
```

### 6.2 Activer LDAPS (TLS)

```ini
LDAP_URL=ldaps://ldap.entreprise.local:636
LDAP_TLS_REJECT_UNAUTHORIZED=true
# Si certificat auto-signé :
# LDAP_TLS_CA_CERT=/certs/ca.pem
```

### 6.3 Configuration Active Directory

```ini
LDAP_URL=ldap://ad.entreprise.local:389
LDAP_BIND_DN=CN=Compleo Service,OU=Services,DC=entreprise,DC=local
LDAP_SEARCH_BASE=OU=Users,DC=entreprise,DC=local
LDAP_SEARCH_FILTER=(sAMAccountName={{username}})
LDAP_ATTR_USERNAME=sAMAccountName
LDAP_ATTR_EMAIL=mail
LDAP_ATTR_DISPLAY_NAME=displayName
LDAP_ATTR_GROUPS=memberOf
```

### 6.4 Test de la connexion LDAP

```bash
# Redémarrer après modification
docker compose restart compleo

# Tester le login LDAP
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"jdupont","password":"<ldap_password>"}' | jq .
```

---

## 7. Maintenance et opérations

### 7.1 Sauvegarde

```bash
# Sauvegarde de la base de données
docker compose exec postgres pg_dump -U compleo compleo_db > backup_$(date +%Y%m%d).sql

# Sauvegarde des fichiers MinIO
docker compose exec minio mc mirror /data /backup/minio_$(date +%Y%m%d)

# Sauvegarde complète (DB + config + volumes)
tar czf compleo-backup-$(date +%Y%m%d).tar.gz \
  backup_*.sql \
  .env \
  docker-compose.yml
```

### 7.2 Restauration

```bash
# Restaurer la base de données
cat backup_20260408.sql | docker compose exec -T postgres psql -U compleo compleo_db

# Redémarrer les services
docker compose restart
```

### 7.3 Logs et monitoring

```bash
# Logs en temps réel
docker compose logs -f compleo

# Logs d'un service spécifique
docker compose logs -f postgres
docker compose logs -f minio

# Statistiques des conteneurs
docker compose stats

# Espace disque utilisé
docker system df
```

### 7.4 Nettoyage

```bash
# Nettoyer les images Docker non utilisées
docker image prune -f

# Nettoyer les volumes orphelins (ATTENTION : destructif)
# docker volume prune -f
```

---

## 8. Dépannage

### 8.1 L'application ne démarre pas

```bash
# Vérifier les logs
docker compose logs compleo | tail -50

# Vérifier que les ports ne sont pas occupés
# Linux/macOS :
sudo netstat -tlnp | grep -E '3000|5432|9000'
# Windows :
netstat -ano | findstr "3000 5432 9000"

# Vérifier l'état des conteneurs
docker compose ps
```

### 8.2 Erreur de connexion à la base de données

```bash
# Tester la connexion PostgreSQL
docker compose exec postgres psql -U compleo -d compleo_db -c "SELECT 1;"

# Vérifier les variables d'environnement
docker compose exec compleo env | grep DATABASE
```

> **En mode développement local (sans Docker DB) :** Le warning `ECONNREFUSED` est normal. L'application fonctionne en mode mémoire. Pour activer la persistance, installer MySQL/PostgreSQL localement ou utiliser le mode Docker complet.

### 8.3 Erreur "Unauthorized" sur les endpoints

```bash
# Vérifier que JWT_SECRET est configuré
docker compose exec compleo env | grep JWT_SECRET

# Régénérer un token
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<password>"}' | jq .
```

### 8.4 MinIO ne répond pas

```bash
# Vérifier l'état de MinIO
docker compose exec minio mc admin info local

# Vérifier les credentials
docker compose exec compleo env | grep MINIO
```

### 8.5 Performance dégradée

```bash
# Vérifier les ressources
docker compose stats --no-stream

# Vérifier l'espace disque
df -h

# Vérifier les connexions DB actives
docker compose exec postgres psql -U compleo -d compleo_db \
  -c "SELECT count(*) FROM pg_stat_activity;"
```

### 8.6 Problèmes spécifiques Windows

**Erreur `PSSecurityException` (exécution de scripts désactivée) :**

```powershell
# En PowerShell Administrateur
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Erreur `NODE_ENV is not recognized` :**

Le projet utilise `cross-env` pour la compatibilité Windows. Si l'erreur persiste, vérifier que `cross-env` est installé :

```powershell
pnpm add -D cross-env
```

**Erreur `Corepack is about to download` :**

```powershell
# En PowerShell Administrateur
corepack disable
npm install -g pnpm@9
```

**Port 3000 déjà occupé :**

```powershell
# Trouver le processus qui utilise le port
netstat -ano | findstr "3000"

# Tuer le processus (remplacer <PID> par le numéro trouvé)
taskkill /PID <PID> /F
```

### 8.7 Incompatibilité API ChromaDB (v1 vs v2)

Les versions récentes de ChromaDB utilisent l'API v2 (`/api/v2/...`) au lieu de v1 (`/api/v1/...`). Si le health check ML échoue malgré ChromaDB en fonctionnement, vérifier la version d'API :

```bash
# Tester l'API v1
curl http://localhost:8001/api/v1/heartbeat

# Tester l'API v2
curl http://localhost:8001/api/v2/heartbeat
```

Si seule l'API v2 répond, le code de `EmbeddingService` doit être mis à jour pour utiliser `/api/v2/` au lieu de `/api/v1/`. Cette correction est planifiée dans une prochaine version.

---

## 9. Mise à jour

### 9.1 Mise à jour standard

```bash
# 1. Sauvegarder
docker compose exec postgres pg_dump -U compleo compleo_db > backup_pre_update.sql

# 2. Récupérer la nouvelle version
git pull origin main

# 3. Reconstruire l'image
docker compose build --no-cache compleo

# 4. Redémarrer avec migration
docker compose up -d
docker compose exec compleo pnpm db:push

# 5. Vérifier
curl -s http://localhost:3000/api/health | jq .
```

### 9.2 Mise à jour en mode développement local (Windows)

```powershell
# 1. Arrêter l'application (Ctrl+C dans le terminal pnpm dev)

# 2. Récupérer la nouvelle version
git pull origin feature/microservice-ml-generator

# 3. Réinstaller les dépendances (si package.json a changé)
pnpm install

# 4. Relancer
pnpm dev
```

### 9.3 Rollback en cas de problème

```bash
# Arrêter les services
docker compose down

# Restaurer la sauvegarde
cat backup_pre_update.sql | docker compose exec -T postgres psql -U compleo compleo_db

# Revenir à la version précédente
git checkout <tag_précédent>
docker compose build compleo
docker compose up -d
```

---

## Annexe A — Architecture réseau on-premises

```
┌──────────────────────────────────────────────────────────┐
│                  Réseau Docker interne                    │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Compleo  │  │PostgreSQL│  │  MinIO   │              │
│  │  :3000   │──│  :5432   │  │  :9000   │              │
│  │ (Node.js)│  │          │  │  :9001   │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│       │                                                  │
│  ┌──────────┐  ┌──────────┐                             │
│  │  Ollama  │  │ ChromaDB │  ← Services ML optionnels   │
│  │ :11434   │  │  :8001   │                             │
│  └──────────┘  └──────────┘                             │
│       │                                                  │
└───────│──────────────────────────────────────────────────┘
        │
   Ports exposés : 3000, 9001 (admin), 11434 (ML)
        │
  ┌─────────────┐
  │  Navigateur  │
  │  utilisateur │
  └─────────────┘
```

## Annexe B — Variables d'environnement complètes

| Variable | Obligatoire | Défaut | Description |
|----------|:-----------:|--------|-------------|
| `NODE_ENV` | Non | `production` | Environnement Node.js |
| `PORT` | Non | `3000` | Port de l'application |
| `JWT_SECRET` | **Oui** | — | Secret pour signer les tokens JWT |
| `AUTH_MODE` | Non | `local` | Mode d'authentification (`local` ou `ldap`) |
| `LOCAL_ADMIN_USER` | Non | `admin` | Utilisateur admin local |
| `LOCAL_ADMIN_PASSWORD` | **Oui** | — | Mot de passe admin local |
| `DATABASE_URL` | Non | Auto-généré | URL de connexion PostgreSQL |
| `POSTGRES_USER` | Non | `compleo` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | **Oui** (Docker) | — | Mot de passe PostgreSQL |
| `POSTGRES_DB` | Non | `compleo_db` | Nom de la base de données |
| `MINIO_ROOT_USER` | Non | `compleo` | Utilisateur MinIO |
| `MINIO_ROOT_PASSWORD` | **Oui** (Docker) | — | Mot de passe MinIO |
| `S3_ENDPOINT` | Non | `http://minio:9000` | Endpoint S3 interne |
| `S3_BUCKET` | Non | `compleo-files` | Bucket S3 pour les fichiers |
| `OLLAMA_URL` | Non | `http://localhost:11434` | URL du service Ollama (ML) |
| `CHROMA_URL` | Non | `http://localhost:8001` | URL du service ChromaDB (ML) |
| `ML_MODEL` | Non | `qwen2.5:1.5b` | Modèle Ollama pour l'enrichissement ML |
| `LDAP_URL` | Si SSO | — | URL du serveur LDAP |
| `LDAP_BIND_DN` | Si SSO | — | DN de bind LDAP |
| `LDAP_BIND_PASSWORD` | Si SSO | — | Mot de passe de bind |
| `LDAP_SEARCH_BASE` | Si SSO | — | Base de recherche LDAP |
| `LDAP_SEARCH_FILTER` | Si SSO | — | Filtre de recherche LDAP |

## Annexe C — Résumé des problèmes Windows courants

| Problème | Symptôme | Solution |
|----------|----------|----------|
| Scripts PowerShell bloqués | `PSSecurityException` | `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| Conflit Corepack/pnpm | `Corepack is about to download` | `corepack disable` puis `npm install -g pnpm@9` |
| Node.js trop ancien | `node --version` < 18 | Installer Node.js 22 LTS depuis nodejs.org |
| Port 3000 occupé | `EADDRINUSE` | `netstat -ano \| findstr 3000` puis `taskkill /PID <PID> /F` |
| DB non disponible | `ECONNREFUSED` dans les logs | Normal en mode dev local (sessions en mémoire) |
| ML non disponible | `ML non disponible` dans les logs | Démarrer Docker + conteneurs ML + télécharger modèle |
| `NODE_ENV` non reconnu | `NODE_ENV is not recognized` | Vérifier que `cross-env` est installé |
