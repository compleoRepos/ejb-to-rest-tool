# Dossier de Sécurité — Compleo EJB Client Modernizer v4.0

> **Destinataire :** RSSI / Équipe Sécurité  
> **Auteur :** Hamza NORDINE  
> **Version :** 1.0.0  
> **Classification :** Confidentiel — Usage interne

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Architecture de sécurité](#2-architecture-de-sécurité)
3. [Garantie zéro appel externe](#3-garantie-zéro-appel-externe)
4. [Authentification et autorisation](#4-authentification-et-autorisation)
5. [Sécurité des données](#5-sécurité-des-données)
6. [Sécurité des conteneurs](#6-sécurité-des-conteneurs)
7. [Audit trail et journalisation](#7-audit-trail-et-journalisation)
8. [Gestion des secrets](#8-gestion-des-secrets)
9. [Conformité et certifications](#9-conformité-et-certifications)
10. [Matrice des risques](#10-matrice-des-risques)
11. [Recommandations](#11-recommandations)

---

## 1. Résumé exécutif

**Compleo EJB Client Modernizer** est un outil d'analyse et de modernisation de code Java legacy. Il est conçu pour fonctionner **intégralement en mode on-premises**, sans aucune dépendance à des services cloud externes.

**Points clés pour le RSSI :**

- **Zéro appel réseau externe** : tout le traitement est local (moteur d'analyse, règles, intelligence, learning).
- **Authentification JWT** avec support LDAP/Active Directory pour l'intégration SSO.
- **Conteneurisation Docker** avec utilisateur non-root, réseau interne isolé et health checks.
- **Aucune donnée de code source ne quitte le périmètre** de l'infrastructure on-premises.
- **Audit trail** complet sur toutes les opérations d'analyse et de génération.

---

## 2. Architecture de sécurité

### 2.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────┐
│                    PÉRIMÈTRE SÉCURISÉ                     │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Réseau Docker (compleo-net)             │ │
│  │                   Interne uniquement                 │ │
│  │                                                     │ │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐      │ │
│  │  │  Compleo   │  │ PostgreSQL│  │   MinIO   │      │ │
│  │  │  App Node  │──│   (DB)    │  │   (S3)    │      │ │
│  │  │  :3000     │  │  :5432    │  │  :9000    │      │ │
│  │  │            │  │           │  │           │      │ │
│  │  │ ┌────────┐ │  │ ┌───────┐ │  │ ┌───────┐ │      │ │
│  │  │ │Auth JWT│ │  │ │Chiffré│ │  │ │Chiffré│ │      │ │
│  │  │ │Middleware│ │  │ │at-rest│ │  │ │at-rest│ │      │ │
│  │  │ └────────┘ │  │ └───────┘ │  │ └───────┘ │      │ │
│  │  └───────────┘  └───────────┘  └───────────┘      │ │
│  │       │                                             │ │
│  └───────│─────────────────────────────────────────────┘ │
│          │ Port 3000 uniquement                          │
│  ┌───────────────┐                                       │
│  │ Reverse Proxy  │  (nginx/traefik — recommandé)        │
│  │ TLS 1.3        │                                       │
│  └───────────────┘                                       │
│          │                                                │
└──────────│────────────────────────────────────────────────┘
           │ HTTPS :443
    ┌──────────────┐
    │  Navigateurs  │
    │  utilisateurs │
    └──────────────┘
```

### 2.2 Principes de sécurité appliqués

| Principe | Implémentation |
|----------|---------------|
| **Defense in depth** | Auth middleware + JWT + rôles + réseau Docker isolé |
| **Least privilege** | Conteneur non-root (UID 1001), ports internes non exposés |
| **Zero trust** | Chaque requête API validée via Bearer token |
| **Data minimization** | Seules les métadonnées sont stockées, pas le code source brut |
| **Fail secure** | Token invalide/absent = 401, erreurs non divulguées |

---

## 3. Garantie zéro appel externe

### 3.1 Composants 100% embarqués

| Composant | Technologie | Appel externe |
|-----------|------------|:-------------:|
| Moteur d'analyse (CompleoEngine) | TypeScript natif | **Non** |
| Règles d'intelligence (150+ règles) | JSON + TypeScript | **Non** |
| Learning Engine | Drizzle ORM + PostgreSQL | **Non** |
| Générateur Spring Boot | Templates embarqués | **Non** |
| Générateur Docker/K8s | Templates embarqués | **Non** |
| Rapport de migration | Génération locale | **Non** |
| Audit de conformité | Script local | **Non** |

### 3.2 Vérification par le RSSI

```bash
# Vérifier qu'aucun appel DNS externe n'est effectué
docker compose exec compleo nslookup google.com 2>&1
# Résultat attendu : échec (pas de résolution DNS externe)

# Monitorer le trafic réseau sortant
docker compose exec compleo ss -tunap | grep -v '127.0.0.1\|172\.'
# Résultat attendu : aucune connexion externe

# Audit des dépendances npm (pas de telemetry)
docker compose exec compleo npm audit --production
```

### 3.3 Exception contrôlée : Git

Le seul composant pouvant effectuer un appel réseau est le **connecteur Git** (optionnel), utilisé pour cloner des dépôts distants. Ce composant :

- Est désactivable via la variable `GIT_REMOTE_ENABLED=false`.
- Supporte la configuration d'un proxy (`GIT_PROXY_URL`).
- Ne transmet jamais de données d'analyse vers l'extérieur.

---

## 4. Authentification et autorisation

### 4.1 Modes d'authentification

| Mode | Configuration | Cas d'usage |
|------|--------------|-------------|
| **Local** | `AUTH_MODE=local` | Déploiement standalone, POC |
| **LDAP** | `AUTH_MODE=ldap` | Intégration SI entreprise |
| **LDAPS** | `AUTH_MODE=ldap` + TLS | Production sécurisée |

### 4.2 Sécurité JWT

| Paramètre | Valeur |
|-----------|--------|
| Algorithme | HS256 |
| Durée de vie du token | 8 heures |
| Stockage | Header `Authorization: Bearer <token>` |
| Secret | Variable `JWT_SECRET` (min 32 caractères hex) |
| Rotation | Changement du `JWT_SECRET` invalide tous les tokens |

### 4.3 Protection des endpoints

| Route | Authentification | Description |
|-------|:----------------:|-------------|
| `GET /api/health` | Non | Health check (pas de données sensibles) |
| `POST /api/auth/login` | Non | Endpoint de login |
| `GET /api/trpc/*` | OAuth/Session | Routes tRPC (frontend) |
| `POST /api/trpc/*` | OAuth/Session | Mutations tRPC (frontend) |
| `GET /api/compleo/*` | **JWT Bearer** | API d'analyse |
| `POST /api/compleo/*` | **JWT Bearer** | API de génération |
| `GET /api/intelligence/*` | **JWT Bearer** | API d'intelligence |
| `GET /api/learning/*` | **JWT Bearer** | API d'apprentissage |
| `POST /api/agent/*` | **JWT Bearer** | API agent autonome |

### 4.4 Gestion des erreurs d'authentification

```json
// Token absent
{ "error": "Unauthorized", "message": "Header Authorization manquant" }

// Token invalide
{ "error": "Unauthorized", "message": "Token invalide ou expiré" }

// Token expiré
{ "error": "Unauthorized", "message": "Token invalide ou expiré" }
```

**Aucune information technique** (stack trace, version, etc.) n'est divulguée dans les réponses d'erreur.

---

## 5. Sécurité des données

### 5.1 Données traitées

| Type de donnée | Stockage | Durée de rétention | Chiffrement |
|----------------|----------|-------------------|-------------|
| Code source Java uploadé | Mémoire uniquement | Durée de la session | N/A (RAM) |
| Résultats d'analyse | PostgreSQL | Configurable | At-rest (DB) |
| Fichiers générés (ZIP) | MinIO S3 | 30 jours (configurable) | At-rest |
| Règles d'apprentissage | PostgreSQL | Permanent | At-rest (DB) |
| Logs d'audit | PostgreSQL | 90 jours (configurable) | At-rest (DB) |
| Tokens JWT | Mémoire client | 8 heures | Signé HS256 |

### 5.2 Cycle de vie du code source

```
Upload (HTTPS) → Parsing en mémoire → Analyse → Résultats en DB → Code source supprimé
                                                                     ↑
                                                              Jamais persisté sur disque
```

**Le code source Java uploadé n'est jamais écrit sur le système de fichiers.** Il est traité en mémoire et seuls les résultats d'analyse (métadonnées, scores, recommandations) sont persistés.

### 5.3 Chiffrement

| Couche | Mécanisme |
|--------|-----------|
| Transit | TLS 1.3 (via reverse proxy recommandé) |
| At-rest (DB) | Chiffrement natif PostgreSQL (si activé) |
| At-rest (S3) | Chiffrement serveur MinIO (SSE-S3) |
| Tokens | HMAC-SHA256 avec secret de 256 bits |

---

## 6. Sécurité des conteneurs

### 6.1 Image Docker

| Mesure | Détail |
|--------|--------|
| Image de base | `node:22-alpine` (surface d'attaque minimale) |
| Build multi-stage | Image finale ne contient que le runtime |
| Utilisateur non-root | `USER compleo` (UID 1001) |
| Pas de shell root | `/bin/sh` accessible uniquement à UID 1001 |
| Health check | `HEALTHCHECK` Docker natif sur `/api/health` |

### 6.2 Réseau Docker

```yaml
networks:
  compleo-net:
    driver: bridge
    internal: true   # Pas d'accès Internet depuis le réseau
```

- Le réseau `compleo-net` est **interne** : aucun conteneur ne peut accéder à Internet.
- Seul le port 3000 est exposé vers l'hôte.
- PostgreSQL et MinIO ne sont **pas accessibles** depuis l'extérieur du réseau Docker.

### 6.3 Volumes et permissions

```yaml
volumes:
  postgres-data:    # Données PostgreSQL (persistant)
  minio-data:       # Données MinIO (persistant)
```

- Les volumes sont gérés par Docker (pas de bind mount de répertoires sensibles).
- Les fichiers temporaires sont nettoyés automatiquement.

---

## 7. Audit trail et journalisation

### 7.1 Événements journalisés

| Événement | Niveau | Données enregistrées |
|-----------|--------|---------------------|
| Login réussi | INFO | Utilisateur, IP, timestamp |
| Login échoué | WARN | Utilisateur tenté, IP, timestamp |
| Analyse lancée | INFO | Projet, utilisateur, nombre de fichiers |
| Génération lancée | INFO | Projet, utilisateur, technologies |
| Règle d'apprentissage créée | INFO | Type, tenant, confiance |
| Erreur d'authentification | ERROR | IP, type d'erreur |
| Erreur système | ERROR | Composant, message (sans stack en prod) |

### 7.2 Format des logs

```
[2026-04-08T14:30:00.000Z] [INFO] [AUTH] Login successful: user=jdupont ip=192.168.1.100
[2026-04-08T14:30:05.000Z] [INFO] [ENGINE] Analysis started: project=legacy-app files=42 user=jdupont
[2026-04-08T14:30:12.000Z] [INFO] [ENGINE] Analysis completed: project=legacy-app score=72 duration=7s
```

### 7.3 Rétention et rotation

| Type de log | Rétention | Rotation |
|-------------|-----------|----------|
| Logs applicatifs | 90 jours | Quotidienne |
| Logs d'audit | 1 an | Mensuelle |
| Logs Docker | Configurable | Via Docker log driver |

---

## 8. Gestion des secrets

### 8.1 Secrets requis

| Secret | Stockage | Rotation recommandée |
|--------|----------|---------------------|
| `JWT_SECRET` | Variable d'environnement | Trimestrielle |
| `POSTGRES_PASSWORD` | Variable d'environnement | Semestrielle |
| `MINIO_ROOT_PASSWORD` | Variable d'environnement | Semestrielle |
| `LOCAL_ADMIN_PASSWORD` | Variable d'environnement | Mensuelle |
| `LDAP_BIND_PASSWORD` | Variable d'environnement | Selon politique LDAP |

### 8.2 Recommandations

- **Ne jamais committer le fichier `.env`** dans le dépôt Git (déjà dans `.gitignore`).
- Utiliser un gestionnaire de secrets (HashiCorp Vault, AWS Secrets Manager) si disponible.
- Générer les secrets avec `openssl rand -hex 32` (minimum 256 bits).
- Rotation du `JWT_SECRET` : tous les tokens existants sont invalidés automatiquement.

---

## 9. Conformité et certifications

### 9.1 Standards respectés

| Standard | Conformité | Détail |
|----------|:----------:|--------|
| OWASP Top 10 (2021) | Partiel | A01-A10 adressés (auth, injection, config) |
| RGPD | Oui | Pas de données personnelles traitées |
| ISO 27001 | Compatible | Contrôles d'accès, audit trail, chiffrement |
| SOC 2 Type II | Compatible | Logging, monitoring, access control |
| PCI-DSS | N/A | Pas de données de paiement |

### 9.2 Analyse de vulnérabilités

```bash
# Scanner l'image Docker
docker scout cves compleo:latest

# Audit des dépendances npm
docker compose exec compleo npm audit --production

# Scanner avec Trivy (si installé)
trivy image compleo:latest
```

---

## 10. Matrice des risques

| Risque | Probabilité | Impact | Mitigation |
|--------|:-----------:|:------:|------------|
| Compromission JWT_SECRET | Faible | Élevé | Rotation trimestrielle, stockage sécurisé |
| Injection SQL | Très faible | Élevé | ORM Drizzle (requêtes paramétrées) |
| XSS | Faible | Moyen | React (échappement automatique) |
| Accès non autorisé aux API | Faible | Élevé | JWT Bearer obligatoire sur toutes les routes |
| Fuite de code source | Très faible | Critique | Code traité en mémoire, jamais persisté |
| Déni de service | Moyen | Moyen | Rate limiting recommandé (reverse proxy) |
| Escalade de privilèges conteneur | Très faible | Élevé | Utilisateur non-root, réseau interne |

---

## 11. Recommandations

### 11.1 Recommandations prioritaires (avant mise en production)

1. **Déployer un reverse proxy** (nginx/Traefik) avec TLS 1.3 devant le port 3000.
2. **Configurer le rate limiting** sur le reverse proxy (max 100 req/min par IP).
3. **Activer le mode LDAP** pour l'intégration avec le SI existant.
4. **Planifier la rotation des secrets** selon le calendrier en section 8.1.
5. **Configurer la sauvegarde automatique** de la base de données (cron quotidien).

### 11.2 Recommandations à moyen terme

6. **Scanner régulièrement l'image Docker** avec Trivy ou Docker Scout.
7. **Mettre en place un SIEM** pour centraliser les logs d'audit.
8. **Effectuer un pentest** avant le déploiement en production.
9. **Documenter la procédure de réponse aux incidents** spécifique à Compleo.
10. **Former les utilisateurs** aux bonnes pratiques de sécurité (mots de passe, sessions).

---

## Annexe — Contact sécurité

Pour toute question relative à la sécurité de Compleo :

- **Responsable technique :** Hamza NORDINE
- **Email :** security@compleo.dev
- **Processus de signalement :** Créer un ticket avec le label `security` dans le dépôt GitHub privé.
