# Guide d'Installation On-Premises — Compleo EJB Client Modernizer v4.0

> **Auteur :** Hamza NORDINE  
> **Version :** 1.0.0  
> **Dernière mise à jour :** 2026-04-08  
> **Classification :** Interne — Équipe Infrastructure

---

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Installation en 3 étapes](#2-installation-en-3-étapes)
3. [Vérification post-installation](#3-vérification-post-installation)
4. [Configuration SSO / LDAP](#4-configuration-sso--ldap)
5. [Maintenance et opérations](#5-maintenance-et-opérations)
6. [Dépannage](#6-dépannage)
7. [Mise à jour](#7-mise-à-jour)

---

## 1. Prérequis

### 1.1 Matériel minimum

| Composant | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 8 Go | 16 Go |
| Disque | 50 Go SSD | 100 Go SSD |
| Réseau | 100 Mbps | 1 Gbps |

### 1.2 Logiciels requis

| Logiciel | Version minimale | Vérification |
|----------|-----------------|--------------|
| Docker Engine | 24.0+ | `docker --version` |
| Docker Compose | 2.20+ | `docker compose version` |
| Git | 2.30+ | `git --version` |
| curl | 7.68+ | `curl --version` |

### 1.3 Ports réseau

| Port | Service | Direction |
|------|---------|-----------|
| 3000 | Application Web (Compleo) | Entrant |
| 5432 | PostgreSQL (interne) | Interne uniquement |
| 9000 | MinIO S3 (interne) | Interne uniquement |
| 9001 | MinIO Console (optionnel) | Entrant (admin) |

### 1.4 Accès réseau

- **Aucun appel externe requis** : Compleo fonctionne en mode air-gapped complet.
- Le moteur d'analyse, les règles d'intelligence et le learning engine sont 100% embarqués.
- Seule exception optionnelle : accès Git externe pour le clonage de dépôts (configurable via proxy).

### 1.5 Comptes et permissions

- Utilisateur avec accès `sudo` ou membre du groupe `docker`.
- Droits d'écriture sur le répertoire d'installation.

---

## 2. Installation en 3 étapes

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
AUTH_MODE=local              # ou "ldap" pour SSO (voir section 4)
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

Le script `docker-init.sh` effectue automatiquement :

1. Vérification de la présence de Docker et Docker Compose.
2. Validation du fichier `.env` (variables obligatoires).
3. Construction de l'image Docker multi-stage.
4. Démarrage des services (Compleo + PostgreSQL + MinIO).
5. Attente du health check (max 120 secondes).
6. Exécution des migrations de base de données.
7. Seed des règles d'apprentissage globales.

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
  "uptime": 42,
  "services": {
    "database": "connected",
    "storage": "connected",
    "engine": "ready"
  }
}
```

---

## 3. Vérification post-installation

### 3.1 Checklist de validation

Exécutez les commandes suivantes pour vérifier chaque composant :

```bash
# 1. Santé globale
curl -s http://localhost:3000/api/health | jq .

# 2. Authentification locale
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<votre_password>"}' | jq -r '.token')
echo "Token: $TOKEN"

# 3. Moteur d'analyse
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/compleo/technologies | jq .

# 4. Règles d'apprentissage
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/learning/stats | jq .

# 5. Moteur d'intelligence
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/intelligence/categories | jq .

# 6. Base de données (via Docker)
docker compose exec postgres psql -U compleo -d compleo_db -c "SELECT count(*) FROM learning_rules;"
```

### 3.2 Résultats attendus

| Test | Résultat attendu |
|------|-----------------|
| Health check | `status: "healthy"` |
| Login | Token JWT valide |
| Technologies | Liste de 8+ technologies supportées |
| Learning stats | `totalRules: 60`, `activeRules: 60` |
| Intelligence | Liste des catégories de règles |
| DB count | `60` règles globales |

---

## 4. Configuration SSO / LDAP

### 4.1 Activer le mode LDAP

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

### 4.2 Activer LDAPS (TLS)

```ini
LDAP_URL=ldaps://ldap.entreprise.local:636
LDAP_TLS_REJECT_UNAUTHORIZED=true
# Si certificat auto-signé :
# LDAP_TLS_CA_CERT=/certs/ca.pem
```

### 4.3 Configuration Active Directory

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

### 4.4 Test de la connexion LDAP

```bash
# Redémarrer après modification
docker compose restart compleo

# Tester le login LDAP
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"jdupont","password":"<ldap_password>"}' | jq .
```

---

## 5. Maintenance et opérations

### 5.1 Sauvegarde

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

### 5.2 Restauration

```bash
# Restaurer la base de données
cat backup_20260408.sql | docker compose exec -T postgres psql -U compleo compleo_db

# Redémarrer les services
docker compose restart
```

### 5.3 Logs et monitoring

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

### 5.4 Nettoyage

```bash
# Nettoyer les images Docker non utilisées
docker image prune -f

# Nettoyer les volumes orphelins (ATTENTION : destructif)
# docker volume prune -f
```

---

## 6. Dépannage

### 6.1 L'application ne démarre pas

```bash
# Vérifier les logs
docker compose logs compleo | tail -50

# Vérifier que les ports ne sont pas occupés
sudo netstat -tlnp | grep -E '3000|5432|9000'

# Vérifier l'état des conteneurs
docker compose ps
```

### 6.2 Erreur de connexion à la base de données

```bash
# Tester la connexion PostgreSQL
docker compose exec postgres psql -U compleo -d compleo_db -c "SELECT 1;"

# Vérifier les variables d'environnement
docker compose exec compleo env | grep DATABASE
```

### 6.3 Erreur "Unauthorized" sur les endpoints

```bash
# Vérifier que JWT_SECRET est configuré
docker compose exec compleo env | grep JWT_SECRET

# Régénérer un token
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<password>"}' | jq .
```

### 6.4 MinIO ne répond pas

```bash
# Vérifier l'état de MinIO
docker compose exec minio mc admin info local

# Vérifier les credentials
docker compose exec compleo env | grep MINIO
```

### 6.5 Performance dégradée

```bash
# Vérifier les ressources
docker compose stats --no-stream

# Vérifier l'espace disque
df -h

# Vérifier les connexions DB actives
docker compose exec postgres psql -U compleo -d compleo_db \
  -c "SELECT count(*) FROM pg_stat_activity;"
```

---

## 7. Mise à jour

### 7.1 Mise à jour standard

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

### 7.2 Rollback en cas de problème

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
┌─────────────────────────────────────────────┐
│              Réseau Docker interne           │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Compleo  │  │PostgreSQL│  │  MinIO   │  │
│  │  :3000   │──│  :5432   │  │  :9000   │  │
│  │ (Node.js)│  │          │  │  :9001   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│       │                                      │
└───────│──────────────────────────────────────┘
        │
   Port 3000 exposé
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
| `POSTGRES_PASSWORD` | **Oui** | — | Mot de passe PostgreSQL |
| `POSTGRES_DB` | Non | `compleo_db` | Nom de la base de données |
| `MINIO_ROOT_USER` | Non | `compleo` | Utilisateur MinIO |
| `MINIO_ROOT_PASSWORD` | **Oui** | — | Mot de passe MinIO |
| `S3_ENDPOINT` | Non | `http://minio:9000` | Endpoint S3 interne |
| `S3_BUCKET` | Non | `compleo-files` | Bucket S3 pour les fichiers |
| `LDAP_URL` | Si SSO | — | URL du serveur LDAP |
| `LDAP_BIND_DN` | Si SSO | — | DN de bind LDAP |
| `LDAP_BIND_PASSWORD` | Si SSO | — | Mot de passe de bind |
| `LDAP_SEARCH_BASE` | Si SSO | — | Base de recherche LDAP |
| `LDAP_SEARCH_FILTER` | Si SSO | — | Filtre de recherche LDAP |
