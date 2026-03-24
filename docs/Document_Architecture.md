# Document d'Architecture — Modernisation EJB vers APIs REST

**Auteur** : Hamza NORDINE
**Version** : 2.0.0
**Date** : Mars 2026
**Audience** : CTO, DSI, Architectes Solutions, Comité d'Architecture

---

## Table des matières

1. [Contexte et problématique](#1-contexte-et-problématique)
2. [Stratégie de modernisation](#2-stratégie-de-modernisation)
3. [Architecture de l'outil EJB Client Modernizer](#3-architecture-de-loutil-ejb-client-modernizer)
4. [Moteur d'intelligence artificielle déterministe](#4-moteur-dintelligence-artificielle-déterministe)
5. [Architecture cible du code généré](#5-architecture-cible-du-code-généré)
6. [Bénéfices techniques](#6-bénéfices-techniques)
7. [Bénéfices business](#7-bénéfices-business)
8. [Risques et stratégies de mitigation](#8-risques-et-stratégies-de-mitigation)
9. [Recommandations](#9-recommandations)

---

## 1. Contexte et problématique

### 1.1 Situation actuelle

Les systèmes bancaires legacy reposent sur une architecture Java EE déployée sur WebSphere, utilisant les Enterprise JavaBeans (EJB) comme mécanisme principal de communication inter-services. Les applications clientes accèdent aux services métier via des injections `@EJB`, des lookups JNDI ou des appels directs sur `InitialContext`. Cette architecture, bien que robuste dans les années 2000, présente aujourd'hui des limitations critiques qui freinent l'innovation et augmentent les coûts opérationnels.

### 1.2 Problèmes identifiés

| Problème | Impact | Criticité |
| :--- | :--- | :---: |
| **Couplage fort** entre les services via les interfaces EJB | Impossibilité de déployer ou scaler indépendamment | Élevée |
| **Dépendance à WebSphere** | Coûts de licence élevés, mises à jour complexes | Élevée |
| **Protocole propriétaire** (IIOP/RMI) | Incompatibilité avec les architectures cloud-native | Élevée |
| **Difficulté de recrutement** | Expertise Java EE/EJB de plus en plus rare | Moyenne |
| **Absence d'API exposables** | Impossibilité d'ouvrir les services aux partenaires fintech | Élevée |
| **Tests complexes** | Nécessité d'un conteneur EJB complet pour les tests d'intégration | Moyenne |
| **Monitoring limité** | Observabilité réduite des appels inter-services | Moyenne |

### 1.3 Enjeux stratégiques

La transformation numérique du secteur bancaire impose une ouverture des systèmes d'information via des APIs standardisées. Les réglementations européennes (DSP2/PSD2) exigent la mise à disposition d'APIs pour les tiers autorisés. Le maintien d'une architecture EJB fermée constitue un risque réglementaire et un frein à la compétitivité.

---

## 2. Stratégie de modernisation

### 2.1 Approche retenue : Strangler Fig Pattern

La stratégie de modernisation repose sur le **Strangler Fig Pattern**, qui consiste à remplacer progressivement les composants legacy par des composants modernes, sans interruption de service. Cette approche minimise les risques en permettant une migration incrémentale et réversible.

Le principe est le suivant : chaque service EJB est progressivement encapsulé derrière une API REST. Les applications clientes sont migrées pour appeler l'API REST au lieu de l'EJB. Une fois que tous les clients ont migré, le service EJB peut être décommissionné.

### 2.2 Rôle de l'outil EJB Client Modernizer

L'outil EJB Client Modernizer automatise la partie la plus laborieuse de cette migration : la transformation du code client. Au lieu de réécrire manuellement chaque appel EJB en appel REST, l'outil analyse le code source, détecte les patterns d'appel EJB, et génère automatiquement les clients API REST modernes correspondants. La version 2.0 intègre un **moteur d'intelligence artificielle déterministe** qui évalue la qualité du code, détecte les anti-patterns et propose des optimisations contextuelles.

### 2.3 Phases de transformation

La transformation d'un appel EJB en appel REST se décompose en quatre étapes :

**Étape 1 — Analyse** : L'outil parse le code Java legacy et identifie tous les points d'appel EJB (injections, lookups JNDI, appels de méthodes). Il produit un rapport d'analyse détaillé incluant les services détectés, les dépendances, les transactions et les éléments JMS/MQ.

**Étape 2 — Génération** : À partir de l'analyse, l'outil génère un projet Spring Boot complet contenant les clients API REST (WebClient), les DTOs, la configuration, la gestion d'erreurs et la structure de tests.

**Étape 3 — Analyse IA** : Le moteur d'intelligence artificielle déterministe évalue le code legacy et le code généré, attribue des scores de qualité, détecte les anti-patterns et propose des optimisations (retry, circuit-breaker, timeout, logging, caching).

**Étape 4 — Intégration** : Le code généré est exporté en archive ZIP Maven, intégré dans le projet cible, les DTOs sont ajustés aux types réels, et le client est déployé.

---

## 3. Architecture de l'outil EJB Client Modernizer

### 3.1 Vue d'ensemble

L'outil est une application web monopage (SPA) qui s'exécute entièrement dans le navigateur. Aucun serveur backend n'est nécessaire pour l'analyse et la génération de code. Cette architecture garantit que le code source des utilisateurs ne quitte jamais leur poste de travail.

### 3.2 Stack technique de l'outil

| Composant | Technologie | Rôle |
| :--- | :--- | :--- |
| **Framework UI** | React 19 | Interface utilisateur réactive |
| **Langage** | TypeScript | Typage statique, fiabilité |
| **Éditeur de code** | Monaco Editor | Édition de code Java avec coloration syntaxique |
| **Stylisation** | Tailwind CSS 4 | Design system Terminal Craft |
| **Composants UI** | shadcn/ui + Radix | Composants accessibles et personnalisables |
| **Export ZIP** | JSZip + FileSaver.js | Génération d'archives côté client |
| **Build** | Vite 7 | Compilation et HMR rapides |

### 3.3 Architecture des modules

L'outil est composé de quatre modules principaux :

**Module 1 — Analyseur EJB** (`ejb-analyzer.ts`) : Moteur d'analyse du code Java legacy par pattern matching et expressions régulières. Il détecte les injections `@EJB`, les lookups JNDI, les appels de méthodes, les transactions et les éléments JMS/MQ/Batch. Il produit un rapport d'analyse structuré (`AnalysisReport`).

**Module 2 — Générateur de code** (`code-generator.ts`) : Moteur de génération de code moderne à partir du rapport d'analyse. Il génère les clients API REST (WebClient), les DTOs, la configuration, les exceptions, les utilitaires et les tests. Il utilise des templates de code intégrés.

**Module 3 — Moteur IA déterministe** (`ai-engine.ts`) : Système d'analyse de qualité basé sur des règles codées en dur. Il évalue le code legacy et le code généré, détecte les anti-patterns, propose des optimisations et attribue des scores de qualité. Détaillé dans la section 4.

**Module 4 — Exporteur ZIP** (`zip-exporter.ts`) : Générateur d'archives ZIP avec structure Maven complète. Il assemble les fichiers générés dans une arborescence Maven standard, ajoute le `pom.xml`, le `Dockerfile`, le `README.md` et le rapport d'analyse.

### 3.4 Modes de fonctionnement

L'outil supporte trois modes de fonctionnement :

| Mode | Description | Cas d'usage |
| :--- | :--- | :--- |
| **Fichier unique** | Un seul fichier Java dans l'éditeur | Analyse rapide d'une classe |
| **Multi-fichiers** | Plusieurs fichiers dans des onglets distincts | Analyse de plusieurs classes liées |
| **Projet entier** | Chargement d'un dossier complet avec traitement automatique | Migration d'un projet complet |

### 3.5 Flux de données

Le flux de données de l'outil suit le parcours suivant :

```
Code Java Legacy → Analyseur EJB → Rapport d'analyse
                                         ↓
                                   Générateur de code → Fichiers générés
                                         ↓                    ↓
                                   Moteur IA → Scores + Suggestions
                                                              ↓
                                                    Exporteur ZIP Maven
```

Chaque module est indépendant et communique via des interfaces TypeScript typées. Le rapport d'analyse (`AnalysisReport`) est le pivot central qui alimente à la fois le générateur de code et le moteur IA.

---

## 4. Moteur d'intelligence artificielle déterministe

### 4.1 Philosophie de conception

Le moteur IA a été conçu avec une contrainte fondamentale : **aucune hallucination**. Contrairement aux systèmes basés sur des modèles de langage (LLM), le moteur IA de l'outil est entièrement déterministe. Chaque suggestion est le résultat d'une règle codée en dur, identifiable par un identifiant unique (ex: AP-071), traçable au numéro de ligne du code source, et reproductible à l'identique pour le même code d'entrée.

### 4.2 Architecture du moteur IA

Le moteur IA est composé de trois sous-systèmes :

| Sous-système | Rôle | Entrée | Sortie |
| :--- | :--- | :--- | :--- |
| **Détecteur d'anti-patterns** | Identifie les problèmes dans le code legacy | Code source + Rapport d'analyse | Liste de suggestions avec sévérité |
| **Scoreur de qualité** | Évalue la qualité du code legacy et modernisé | Code source + Fichiers générés | Scores sur 4 critères (0-100) |
| **Optimiseur** | Recommande des améliorations pour le code généré | Rapport d'analyse + Fichiers générés | Liste d'optimisations appliquées/recommandées |

### 4.3 Règles de détection

Le moteur utilise un catalogue de règles organisées par catégorie :

| Catégorie | Préfixe | Nombre de règles | Exemples |
| :--- | :---: | :---: | :--- |
| **EJB Legacy** | AP-07x | 8 | `@Stateless`, `@Stateful`, `@Singleton`, `@MessageDriven` |
| **JNDI** | AP-02x | 4 | `InitialContext`, `Context.lookup()`, noms JNDI hardcodés |
| **Couplage** | AP-03x | 3 | Nombre excessif d'injections, dépendances circulaires |
| **Transactions** | AP-04x | 4 | `@TransactionAttribute`, `UserTransaction`, transactions distribuées |
| **Sécurité** | AP-05x | 3 | Credentials hardcodés, absence de validation |
| **Performance** | AP-06x | 3 | Appels synchrones bloquants, absence de cache |
| **JMS/MQ/Batch** | AP-08x | 3 | `@MessageDriven`, `JMSContext`, `@BatchProperty` |

### 4.4 Algorithme de scoring

Le score de qualité est calculé selon un algorithme déterministe basé sur quatre critères pondérés :

| Critère | Poids | Facteurs positifs | Facteurs négatifs |
| :--- | :---: | :--- | :--- |
| **Maintenabilité** | 30% | Injection de dépendances, séparation des responsabilités | Couplage fort, code dupliqué |
| **Sécurité** | 25% | Validation des entrées, gestion des exceptions | Credentials hardcodés, données sensibles exposées |
| **Performance** | 25% | Appels non-bloquants, caching | Appels synchrones, absence de timeout |
| **Résilience** | 20% | Retry, circuit-breaker, timeout, fallback | Absence de gestion d'erreurs, pas de retry |

Le score global est la moyenne pondérée des quatre critères, normalisée sur 100. Le score du code modernisé est systématiquement supérieur à celui du code legacy, car le code généré intègre automatiquement les bonnes pratiques.

### 4.5 Optimisations automatiques

Le moteur IA recommande six catégories d'optimisations :

**Retry** : Ajout d'une politique de retry avec backoff exponentiel (3 tentatives) pour gérer les erreurs transitoires réseau. Appliqué automatiquement dans le code généré.

**Circuit-Breaker** : Ajout d'un circuit breaker (Resilience4j) pour isoler les pannes et éviter les cascades d'erreurs entre services. Appliqué automatiquement lorsque des dépendances externes sont détectées.

**Timeout** : Ajout de timeouts explicites (connect: 5s, read: 30s) sur tous les appels WebClient pour éviter les blocages. Appliqué automatiquement dans le code généré.

**Logging** : Ajout de logging structuré (SLF4J) avec corrélation d'ID de requête pour le tracing distribué. Appliqué automatiquement dans le code généré.

**Error-Handling** : Gestion d'erreurs typée avec `WebClientResponseException` pour les erreurs HTTP, `TimeoutException` pour les timeouts, et fallback gracieux. Appliqué automatiquement dans le code généré.

**Cache** : Recommandation d'ajout de `@Cacheable` Spring pour les méthodes de lecture (get/find/list) afin de réduire les appels réseau répétitifs. Recommandé (nécessite une implémentation manuelle).

### 4.6 Estimation de l'effort de migration

Le moteur IA estime l'effort de migration en jours-homme selon la formule suivante :

| Complexité | Critères | Effort estimé |
| :--- | :--- | :--- |
| **Faible** | ≤ 2 services, ≤ 5 méthodes, pas de JMS/transactions | 0.5 jour |
| **Moyenne** | 3-5 services, 6-15 méthodes, transactions simples | 1-2 jours |
| **Élevée** | 6+ services, 16+ méthodes, JMS/MQ/Batch, transactions distribuées | 3-5 jours |

Cette estimation couvre la transformation automatique, l'ajustement des DTOs, la complétion des tests et la validation fonctionnelle.

---

## 5. Architecture cible du code généré

### 5.1 Stack technique cible

| Composant | Technologie | Justification |
| :--- | :--- | :--- |
| **Langage** | Java 21 | LTS, performances (Virtual Threads), sécurité |
| **Framework** | Spring Boot 3 | Standard de facto, écosystème riche, communauté active |
| **Client HTTP** | Spring WebFlux WebClient | Non-bloquant, réactif, gestion avancée des erreurs |
| **Résilience** | Resilience4j | Circuit-breaker, retry, rate-limiter |
| **Validation** | Jakarta Validation | Standard enterprise, annotations déclaratives |
| **Build** | Maven | Gestion des dépendances, reproductibilité |
| **Tests** | JUnit 5 + Mockito | Standard de test, mocking avancé |
| **Documentation API** | OpenAPI 3.0 / Swagger | Documentation automatique, génération de clients |
| **Monitoring** | Micrometer + Prometheus | Métriques applicatives, alerting |
| **Tracing** | OpenTelemetry | Traçabilité distribuée des appels |

### 5.2 Patterns architecturaux

**API Gateway** : Point d'entrée unique pour toutes les APIs, gérant l'authentification, le rate limiting et le routage.

**Circuit Breaker** : Pattern de résilience (via Resilience4j) protégeant les services contre les défaillances en cascade. Le moteur IA de l'outil recommande et intègre automatiquement ce pattern.

**Service Discovery** : Enregistrement et découverte dynamique des services (via Spring Cloud ou Kubernetes).

**Configuration centralisée** : Gestion des configurations via Spring Cloud Config ou Kubernetes ConfigMaps.

**Retry avec Backoff exponentiel** : Politique de retry intégrée dans les clients API générés pour gérer les erreurs transitoires réseau.

---

## 6. Bénéfices techniques

### 6.1 Découplage des services

La migration vers des APIs REST élimine le couplage fort inhérent aux appels EJB. Chaque service peut être développé, testé, déployé et scalé indépendamment. Les contrats d'API (OpenAPI) formalisent les interfaces entre services.

### 6.2 Portabilité et indépendance

L'abandon du protocole IIOP/RMI et de la dépendance à WebSphere permet de déployer les services sur n'importe quel runtime : conteneurs Docker, Kubernetes, cloud public (AWS, Azure, GCP) ou cloud privé.

### 6.3 Observabilité

Les appels REST sont nativement traçables via les headers HTTP standards. L'intégration avec OpenTelemetry et Micrometer offre une visibilité complète sur les flux d'appels, les temps de réponse et les taux d'erreur. Le logging structuré généré par l'outil facilite le tracing distribué.

### 6.4 Testabilité

Les clients API REST sont facilement testables avec des mocks HTTP (WireMock, MockWebServer). Les tests d'intégration ne nécessitent plus de conteneur EJB complet. L'outil génère automatiquement la structure de tests JUnit 5 + Mockito.

### 6.5 Performance

Spring WebClient offre un modèle non-bloquant qui, combiné aux Virtual Threads de Java 21, permet de gérer un grand nombre de connexions concurrentes avec une empreinte mémoire réduite.

### 6.6 Résilience

Le code généré intègre automatiquement les patterns de résilience recommandés par le moteur IA : retry avec backoff exponentiel, circuit-breaker, timeouts explicites et gestion d'erreurs typée. Ces patterns protègent les services contre les défaillances en cascade.

---

## 7. Bénéfices business

### 7.1 Réduction des coûts

| Poste | Économie estimée |
| :--- | :--- |
| Licences WebSphere | 60-80% de réduction |
| Infrastructure (cloud-native) | 30-50% de réduction |
| Maintenance applicative | 40% de réduction (code plus simple) |
| Recrutement | Pool de candidats 10x plus large (Spring vs EJB) |
| Effort de migration | 70% de réduction grâce à l'automatisation |

### 7.2 Accélération du time-to-market

La migration vers des APIs REST et une architecture microservices permet de réduire les cycles de développement. Les équipes peuvent travailler en parallèle sur des services indépendants, et les déploiements continus (CI/CD) deviennent possibles. L'automatisation de la transformation du code client par l'outil réduit l'effort de migration de 70%.

### 7.3 Ouverture aux partenaires

Les APIs REST standardisées permettent d'exposer les services bancaires aux partenaires fintech, conformément aux exigences réglementaires (DSP2/PSD2). Cette ouverture crée de nouvelles opportunités de revenus via des modèles API-as-a-Product.

### 7.4 Conformité réglementaire

La traçabilité native des appels REST, combinée à l'observabilité (logs, métriques, traces), facilite la conformité aux exigences d'audit et de reporting réglementaire. Le moteur IA de l'outil contribue à cette conformité en détectant les problèmes de sécurité et en recommandant les bonnes pratiques.

---

## 8. Risques et stratégies de mitigation

| Risque | Probabilité | Impact | Stratégie de mitigation |
| :--- | :---: | :---: | :--- |
| **Régression fonctionnelle** | Moyenne | Élevé | Tests automatisés exhaustifs, migration progressive, rollback possible |
| **Perte de performance** | Faible | Moyen | Benchmarking avant/après, optimisation WebClient, caching (recommandé par l'IA) |
| **Transactions distribuées** | Moyenne | Élevé | Pattern Saga, compensation, détection automatique par le moteur IA |
| **Résistance au changement** | Moyenne | Moyen | Formation des équipes, documentation, accompagnement |
| **Complexité de migration** | Élevée | Moyen | Automatisation via EJB Client Modernizer, mode projet entier |
| **Indisponibilité pendant migration** | Faible | Élevé | Strangler Fig Pattern, coexistence legacy/moderne |
| **Sécurité des APIs** | Moyenne | Élevé | OAuth2/OIDC, API Gateway, WAF, détection IA des credentials hardcodés |
| **Qualité du code généré** | Faible | Moyen | Scoring IA automatique, suggestions d'optimisation contextuelles |

---

## 9. Recommandations

### 9.1 Approche progressive

La migration doit être conduite de manière progressive, en commençant par les services les moins critiques pour valider l'approche, puis en migrant progressivement les services critiques. Le mode "Projet entier" de l'outil permet d'évaluer rapidement l'ampleur de la migration et d'obtenir une estimation d'effort grâce au moteur IA.

### 9.2 Exploitation du moteur IA

Le moteur IA de l'outil doit être utilisé systématiquement pour chaque migration. Les scores de qualité permettent de comparer objectivement le code legacy et le code modernisé. Les suggestions d'optimisation doivent être revues par l'équipe d'architecture et intégrées dans les standards de développement.

### 9.3 Gouvernance API

La mise en place d'une gouvernance API est essentielle pour garantir la cohérence et la qualité des APIs exposées. Cela inclut la définition de standards de nommage, de versioning, de documentation et de sécurité.

### 9.4 Formation et accompagnement

Les équipes de développement doivent être formées aux technologies cibles (Spring Boot, WebClient, APIs REST) et accompagnées dans la transition. La documentation générée par l'outil et les suggestions du moteur IA facilitent cette montée en compétence.

### 9.5 Monitoring et observabilité

Dès le début de la migration, un système de monitoring et d'observabilité doit être mis en place pour suivre les performances, détecter les anomalies et garantir la qualité de service. Le logging structuré généré par l'outil constitue une base solide pour cette observabilité.

---

*Document rédigé par Hamza NORDINE — EJB Client Modernizer v2.0*
