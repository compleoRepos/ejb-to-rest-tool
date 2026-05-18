# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [1.0.0] — 2026-04-08

### Ajouté

#### Moteur d'analyse (CompleoEngine v4.0)
- Support multi-technologies : EJB, Servlets, JSP, Struts, SOAP, JDBC, Hibernate, JMS, Batch
- Pipeline d'analyse en 5 phases : parsing → détection → analyse → intelligence → génération
- Extraction automatique de microservices avec scoring de complexité
- Génération de code Spring Boot 3.x avec annotations modernes
- Génération Docker (Dockerfile, docker-compose.yml) et Kubernetes (Helm charts)
- Support des projets multi-modules Maven/Gradle

#### Moteur d'intelligence (816 règles)
- 20 catégories de règles d'analyse statique
- Règles financières (FIN) : détection `double` pour montants, arrondi incorrect, devise absente
- Règles de sécurité (SEC) : injection SQL, XSS, CSRF, désérialisation
- Règles de performance (PERF) : N+1 queries, eager loading, cache absent
- Règles de concurrence (CONC) : deadlock, race condition, synchronisation
- Règles de base de données (DB) : schéma, requêtes, index
- Règles Jakarta EE (JAK) : migration EJB → Spring
- Règles Cloud Native (CLOUD) : 12-Factor, conteneurisation, Kubernetes
- Analyseur sémantique avec inférence de rôles métier

#### Learning Engine
- Apprentissage adaptatif basé sur les choix utilisateur
- 60 règles globales pré-configurées (seed)
- Système de confiance avec renforcement/dégradation
- Auto-résolution pour les règles à haute confiance (≥0.85)
- Support multi-tenant (global + par client)
- Export/import JSON des règles

#### Agent autonome (CompleoAgent)
- Pipeline automatisé : analyse → génération → compilation → correction
- Boucle de compilation avec auto-résolution des erreurs
- Support ZIP et Git comme sources d'entrée
- Événements SSE en temps réel pour le suivi de progression

#### Interface utilisateur
- Design "Terminal Craft" — esthétique IDE/terminal haut de gamme
- Éditeur de code avec coloration syntaxique (CodeMirror)
- Panneaux redimensionnables (source / résultats / terminal)
- Visualisation des résultats d'analyse avec scoring
- Gestion de projets avec historique des scans
- Système de commentaires et de collaboration
- Partage de rapports via liens publics

#### CLI (compleo-cli)
- Interface en ligne de commande pour l'intégration CI/CD
- Modes : `--dry-run` (analyse seule), migration complète
- Support `--zip` et `--repo` comme sources
- Rapport de migration automatique

#### Infrastructure
- Dockerfile multi-stage (node:22-alpine, utilisateur non-root, HEALTHCHECK)
- docker-compose.yml (Compleo + PostgreSQL + MinIO)
- Script d'initialisation `docker-init.sh`
- CI/CD GitHub Actions (lint, test, coverage, build, regression)
- Authentification JWT Bearer sur toutes les routes API
- Support LDAP/Active Directory pour SSO on-premises

#### Documentation
- Guide d'installation on-premises (INSTALL.md)
- Dossier de sécurité pour le RSSI (SECURITY.md)
- Catalogue des 816 règles d'analyse (RULES_CATALOG.md)
- Rapport de migration dans le ZIP de sortie (MIGRATION_REPORT.md)
- Rapport d'audit de conformité (AUDIT_REPORT.pdf)

#### Tests
- 442+ tests unitaires (16 suites)
- Tests de régression multi-technologies (6 scénarios)
- Tests de régression multi-projets (5 projets bancaires)
- 52 tests sur les règles critiques (FIN, SEC, TRX, DB, PERF)
- Tests CLI (13 scénarios)
- Tests agent autonome (10 scénarios)
- Couverture des routes tRPC avec contexte authentifié

### Corrigé

- Fix `analyzeClass is not a function` dans l'IntelligenceOrchestrator (cache tsx)
- Fix contexte d'authentification dans les tests tRPC (migration vers protectedProcedure)
- Fix règle DB_SCH_001 (détection via rawSource regex, pas via annotations)
- Fix règle PERF-004 (détection EAGER sur collections uniquement)

---

## [0.3.0] — 2026-04-07

### Ajouté
- Agent autonome avec boucle de compilation
- Connecteur Git (GitHub, GitLab, Bitbucket, Azure DevOps)
- CLI `compleo-cli` avec support ZIP et Git
- Tests de régression multi-projets

---

## [0.2.0] — 2026-04-06

### Ajouté
- Support multi-technologies (Servlets, JSP, Struts, SOAP, JDBC, Hibernate, JMS, Batch)
- Moteur d'intelligence avec 816 règles
- Learning Engine avec apprentissage adaptatif
- Génération Docker et Kubernetes

---

## [0.1.0] — 2026-04-05

### Ajouté
- Moteur d'analyse EJB de base
- Génération Spring Boot
- Interface utilisateur initiale
- Base de données avec schéma Drizzle
