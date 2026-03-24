# Document d'Architecture — Modernisation EJB vers APIs REST

**Auteur** : Hamza NORDINE
**Version** : 1.0.0
**Date** : Mars 2026
**Audience** : CTO, DSI, Architectes Solutions, Comité d'Architecture

---

## Table des matières

1. [Contexte et problématique](#1-contexte-et-problématique)
2. [Stratégie de modernisation](#2-stratégie-de-modernisation)
3. [Architecture cible](#3-architecture-cible)
4. [Bénéfices techniques](#4-bénéfices-techniques)
5. [Bénéfices business](#5-bénéfices-business)
6. [Risques et stratégies de mitigation](#6-risques-et-stratégies-de-mitigation)
7. [Recommandations](#7-recommandations)

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

L'outil EJB Client Modernizer automatise la partie la plus laborieuse de cette migration : la transformation du code client. Au lieu de réécrire manuellement chaque appel EJB en appel REST, l'outil analyse le code source, détecte les patterns d'appel EJB, et génère automatiquement les clients API REST modernes correspondants.

### 2.3 Phases de transformation

La transformation d'un appel EJB en appel REST se décompose en trois étapes :

**Étape 1 — Analyse** : L'outil parse le code Java legacy et identifie tous les points d'appel EJB (injections, lookups JNDI, appels de méthodes). Il produit un rapport d'analyse détaillé incluant les services détectés, les dépendances, les transactions et les éléments JMS/MQ.

**Étape 2 — Génération** : À partir de l'analyse, l'outil génère un projet Spring Boot complet contenant les clients API REST (WebClient), les DTOs, la configuration, la gestion d'erreurs et la structure de tests.

**Étape 3 — Intégration** : Le code généré est intégré dans le projet cible, les DTOs sont ajustés aux types réels, les tests sont complétés, et le client est déployé.

---

## 3. Architecture cible

### 3.1 Vue d'ensemble

L'architecture cible repose sur une communication inter-services via des APIs REST standardisées, remplaçant les appels EJB propriétaires. Chaque service métier expose une API REST documentée (OpenAPI/Swagger), et les applications clientes utilisent Spring WebClient pour consommer ces APIs.

### 3.2 Stack technique cible

| Composant | Technologie | Justification |
| :--- | :--- | :--- |
| **Langage** | Java 21 | LTS, performances (Virtual Threads), sécurité |
| **Framework** | Spring Boot 3 | Standard de facto, écosystème riche, communauté active |
| **Client HTTP** | Spring WebFlux WebClient | Non-bloquant, réactif, gestion avancée des erreurs |
| **Validation** | Jakarta Validation | Standard enterprise, annotations déclaratives |
| **Build** | Maven | Gestion des dépendances, reproductibilité |
| **Tests** | JUnit 5 + Mockito | Standard de test, mocking avancé |
| **Documentation API** | OpenAPI 3.0 / Swagger | Documentation automatique, génération de clients |
| **Monitoring** | Micrometer + Prometheus | Métriques applicatives, alerting |
| **Tracing** | OpenTelemetry | Traçabilité distribuée des appels |

### 3.3 Patterns architecturaux

**API Gateway** : Point d'entrée unique pour toutes les APIs, gérant l'authentification, le rate limiting et le routage.

**Circuit Breaker** : Pattern de résilience (via Resilience4j) protégeant les services contre les défaillances en cascade.

**Service Discovery** : Enregistrement et découverte dynamique des services (via Spring Cloud ou Kubernetes).

**Configuration centralisée** : Gestion des configurations via Spring Cloud Config ou Kubernetes ConfigMaps.

---

## 4. Bénéfices techniques

### 4.1 Découplage des services

La migration vers des APIs REST élimine le couplage fort inhérent aux appels EJB. Chaque service peut être développé, testé, déployé et scalé indépendamment. Les contrats d'API (OpenAPI) formalisent les interfaces entre services.

### 4.2 Portabilité et indépendance

L'abandon du protocole IIOP/RMI et de la dépendance à WebSphere permet de déployer les services sur n'importe quel runtime : conteneurs Docker, Kubernetes, cloud public (AWS, Azure, GCP) ou cloud privé.

### 4.3 Observabilité

Les appels REST sont nativement traçables via les headers HTTP standards. L'intégration avec OpenTelemetry et Micrometer offre une visibilité complète sur les flux d'appels, les temps de réponse et les taux d'erreur.

### 4.4 Testabilité

Les clients API REST sont facilement testables avec des mocks HTTP (WireMock, MockWebServer). Les tests d'intégration ne nécessitent plus de conteneur EJB complet.

### 4.5 Performance

Spring WebClient offre un modèle non-bloquant qui, combiné aux Virtual Threads de Java 21, permet de gérer un grand nombre de connexions concurrentes avec une empreinte mémoire réduite.

---

## 5. Bénéfices business

### 5.1 Réduction des coûts

| Poste | Économie estimée |
| :--- | :--- |
| Licences WebSphere | 60-80% de réduction |
| Infrastructure (cloud-native) | 30-50% de réduction |
| Maintenance applicative | 40% de réduction (code plus simple) |
| Recrutement | Pool de candidats 10x plus large (Spring vs EJB) |

### 5.2 Accélération du time-to-market

La migration vers des APIs REST et une architecture microservices permet de réduire les cycles de développement. Les équipes peuvent travailler en parallèle sur des services indépendants, et les déploiements continus (CI/CD) deviennent possibles.

### 5.3 Ouverture aux partenaires

Les APIs REST standardisées permettent d'exposer les services bancaires aux partenaires fintech, conformément aux exigences réglementaires (DSP2/PSD2). Cette ouverture crée de nouvelles opportunités de revenus via des modèles API-as-a-Product.

### 5.4 Conformité réglementaire

La traçabilité native des appels REST, combinée à l'observabilité (logs, métriques, traces), facilite la conformité aux exigences d'audit et de reporting réglementaire.

---

## 6. Risques et stratégies de mitigation

| Risque | Probabilité | Impact | Stratégie de mitigation |
| :--- | :---: | :---: | :--- |
| **Régression fonctionnelle** | Moyenne | Élevé | Tests automatisés exhaustifs, migration progressive, rollback possible |
| **Perte de performance** | Faible | Moyen | Benchmarking avant/après, optimisation WebClient, caching |
| **Transactions distribuées** | Moyenne | Élevé | Pattern Saga, compensation, vérification manuelle des transactions critiques |
| **Résistance au changement** | Moyenne | Moyen | Formation des équipes, documentation, accompagnement |
| **Complexité de migration** | Élevée | Moyen | Automatisation via EJB Client Modernizer, migration par lots |
| **Indisponibilité pendant migration** | Faible | Élevé | Strangler Fig Pattern, coexistence legacy/moderne |
| **Sécurité des APIs** | Moyenne | Élevé | OAuth2/OIDC, API Gateway, WAF, tests de pénétration |

---

## 7. Recommandations

### 7.1 Approche progressive

La migration doit être conduite de manière progressive, en commençant par les services les moins critiques pour valider l'approche, puis en migrant progressivement les services critiques. L'outil EJB Client Modernizer permet d'accélérer significativement cette migration en automatisant la transformation du code client.

### 7.2 Gouvernance API

La mise en place d'une gouvernance API est essentielle pour garantir la cohérence et la qualité des APIs exposées. Cela inclut la définition de standards de nommage, de versioning, de documentation et de sécurité.

### 7.3 Formation et accompagnement

Les équipes de développement doivent être formées aux technologies cibles (Spring Boot, WebClient, APIs REST) et accompagnées dans la transition. La documentation générée par l'outil facilite cette montée en compétence.

### 7.4 Monitoring et observabilité

Dès le début de la migration, un système de monitoring et d'observabilité doit être mis en place pour suivre les performances, détecter les anomalies et garantir la qualité de service.

---

*Document rédigé par Hamza NORDINE — EJB Client Modernizer*
