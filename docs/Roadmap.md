# Roadmap — Java Legacy Modernizer Platform

**Auteur : Compleo** | Version 3.0 | Avril 2026

---

## Vue d'ensemble

Ce document présente la feuille de route des évolutions planifiées pour la plateforme de modernisation Java Legacy. La roadmap est organisée en horizons temporels et couvre les améliorations fonctionnelles, techniques et organisationnelles.

---

## Horizon 1 — Court terme (T2 2026)

### 1.1 Améliorations de l'interface

| Fonctionnalité | Description | Priorité |
|---|---|---|
| Drag & drop de fichiers | Glisser-déposer des fichiers `.java` directement sur l'éditeur | Haute |
| Renommage d'onglets | Double-clic pour renommer un onglet dans le panneau gauche | Moyenne |
| Personnalisation du package | Champ de configuration pour modifier le package cible et l'URL API | Haute |
| Thème clair | Option de basculement entre thème sombre et clair | Basse |
| Raccourcis clavier | Ctrl+S pour sauvegarder, Ctrl+Shift+A pour analyser, etc. | Moyenne |

### 1.2 Améliorations du moteur d'analyse

| Fonctionnalité | Description | Priorité |
|---|---|---|
| Détection Spring Legacy | Détecter Spring XML config, Spring MVC ancien, Spring Security legacy | Haute |
| Détection monolithes | Identifier les patterns monolithiques (God classes, couplage fort) | Haute |
| Analyse de dépendances Maven | Parser les `pom.xml` pour détecter les dépendances obsolètes | Moyenne |
| Détection de code mort | Identifier les méthodes et classes non utilisées | Moyenne |

### 1.3 Améliorations du moteur IA

| Fonctionnalité | Description | Priorité |
|---|---|---|
| Règles personnalisables | Permettre d'activer/désactiver des règles individuellement | Haute |
| Profils de règles | Profils prédéfinis (bancaire, assurance, retail) | Moyenne |
| Export CSV des violations | Exporter la liste des violations au format CSV pour intégration CI/CD | Moyenne |

---

## Horizon 2 — Moyen terme (T3-T4 2026)

### 2.1 Analyse avancée

| Fonctionnalité | Description | Priorité |
|---|---|---|
| Analyse de flux de données | Tracer le flux des données à travers les couches applicatives | Haute |
| Détection de patterns transactionnels | Identifier les patterns de transactions distribuées (2PC, Saga) | Haute |
| Analyse de performance | Détecter les N+1 queries, les boucles inefficaces, les fuites mémoire | Moyenne |
| Support multi-modules Maven | Analyser des projets Maven multi-modules en une seule passe | Haute |

### 2.2 Génération avancée

| Fonctionnalité | Description | Priorité |
|---|---|---|
| Tests d'intégration | Générer des tests d'intégration avec Testcontainers | Haute |
| Documentation OpenAPI | Générer la documentation Swagger/OpenAPI complète | Haute |
| Migration de base de données | Générer des scripts Flyway/Liquibase à partir du schéma existant | Moyenne |
| Contrats API (Consumer-Driven) | Générer des contrats Pact pour les tests inter-services | Moyenne |

### 2.3 Dashboard de migration

| Fonctionnalité | Description | Priorité |
|---|---|---|
| Vue portfolio | Tableau de bord avec tous les services et leur statut de migration | Haute |
| Graphiques de progression | Camemberts et barres de progression par lot de migration | Haute |
| Estimation d'effort | Calcul automatique de l'effort en jours/homme par service | Haute |
| Historique des transformations | Sauvegarder et comparer les résultats entre versions | Moyenne |

---

## Horizon 3 — Long terme (2027)

### 3.1 Intelligence artificielle avancée

| Fonctionnalité | Description | Priorité |
|---|---|---|
| Apprentissage des patterns | Le moteur apprend des corrections manuelles pour améliorer les suggestions | Haute |
| Analyse sémantique | Comprendre la logique métier au-delà de la syntaxe | Haute |
| Détection d'anomalies | Identifier les comportements anormaux dans le code legacy | Moyenne |
| Benchmark de qualité | Comparer le score de qualité avec des projets similaires du secteur | Basse |

### 3.2 Intégrations

| Fonctionnalité | Description | Priorité |
|---|---|---|
| Plugin IDE | Plugin IntelliJ IDEA et VS Code pour l'analyse en temps réel | Haute |
| Intégration CI/CD | Plugin Jenkins, GitLab CI, GitHub Actions pour l'analyse automatique | Haute |
| Intégration SonarQube | Synchroniser les règles et les résultats avec SonarQube | Moyenne |
| API REST | Exposer les fonctionnalités via une API REST pour l'automatisation | Haute |

### 3.3 Multi-langage

| Fonctionnalité | Description | Priorité |
|---|---|---|
| Support .NET | Analyser et transformer du code C#/.NET legacy | Basse |
| Support COBOL | Analyser du code COBOL pour la migration vers Java/Spring | Basse |
| Support PHP | Analyser du code PHP legacy pour la migration vers des frameworks modernes | Basse |

---

## Métriques de succès

| Métrique | Objectif T2 2026 | Objectif T4 2026 | Objectif 2027 |
|---|---|---|---|
| Technologies détectées | 10 | 15 | 20+ |
| Règles IA | 55+ | 100+ | 200+ |
| Taux de transformation automatique | 70% | 85% | 95% |
| Temps moyen par service | 2 min | 1 min | 30 sec |
| Services migrés (objectif 350) | 50 | 200 | 350 |

---

## Principes directeurs

1. **Déterminisme** : Toute suggestion doit être traçable à une règle codée. Aucune hallucination.
2. **Incrémentalité** : Chaque fonctionnalité doit être utilisable indépendamment.
3. **Industrialisation** : L'outil doit supporter le traitement en masse de centaines de services.
4. **Qualité** : Le code généré doit respecter les standards SonarQube Quality Gate.
5. **Sécurité** : Les règles OWASP sont prioritaires dans l'analyse IA.

---

**Auteur : Compleo** | Compleo | Dernière mise à jour : Avril 2026
