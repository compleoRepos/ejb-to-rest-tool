# Document d'Architecture — Java Legacy Modernizer Platform

**Auteur** : Compleo
**Version** : 3.0.0
**Date** : Avril 2026
**Audience** : CTO, DSI, Architectes Solutions, Comité d'Architecture

---

## Table des matières

1. [Contexte et problématique](#1-contexte-et-problématique)
2. [Stratégie de modernisation](#2-stratégie-de-modernisation)
3. [Architecture de la plateforme](#3-architecture-de-la-plateforme)
4. [Moteur d'analyse multi-technologies](#4-moteur-danalyse-multi-technologies)
5. [Moteur de transformation](#5-moteur-de-transformation)
6. [Moteur d'extraction de microservices](#6-moteur-dextraction-de-microservices)
7. [Génération cloud-native](#7-génération-cloud-native)
8. [Moteur d'intelligence artificielle déterministe](#8-moteur-dintelligence-artificielle-déterministe)
9. [Sécurité : OAuth2 + OpenID Connect](#9-sécurité--oauth2--openid-connect)
10. [Domain Events et architecture event-driven](#10-domain-events-et-architecture-event-driven)
11. [Architecture cible du code généré](#11-architecture-cible-du-code-généré)
12. [Bénéfices techniques](#12-bénéfices-techniques)
13. [Bénéfices business](#13-bénéfices-business)
14. [Risques et stratégies de mitigation](#14-risques-et-stratégies-de-mitigation)
15. [Recommandations](#15-recommandations)

---

## 1. Contexte et problématique

### 1.1 Situation actuelle

Les systèmes bancaires legacy reposent sur une architecture Java EE déployée sur WebSphere/JBoss, utilisant un ensemble de technologies obsolètes : Enterprise JavaBeans (EJB) pour la communication inter-services, Servlets et JSP pour la couche web, Struts pour le MVC, SOAP pour les web services, JDBC brut ou Hibernate legacy pour l'accès aux données, JMS/MQ pour le messaging, et des timers EJB pour les traitements batch. Cette architecture, bien que robuste dans les années 2000, présente aujourd'hui des limitations critiques.

### 1.2 Problèmes identifiés

| Problème | Impact | Criticité |
| :--- | :--- | :---: |
| **Couplage fort** entre les services via EJB/IIOP | Impossibilité de déployer ou scaler indépendamment | Élevée |
| **Dépendance à WebSphere/JBoss** | Coûts de licence élevés, mises à jour complexes | Élevée |
| **Protocoles propriétaires** (IIOP/RMI, SOAP) | Incompatibilité avec les architectures cloud-native | Élevée |
| **Technologies obsolètes** (JSP, Struts, JDBC brut) | Dette technique croissante, vulnérabilités de sécurité | Élevée |
| **Difficulté de recrutement** | Expertise Java EE/EJB/Struts de plus en plus rare | Moyenne |
| **Absence d'API REST** | Impossibilité d'ouvrir les services aux partenaires fintech | Élevée |
| **Architecture monolithique** | Temps de déploiement long, blast radius élevé | Élevée |
| **Tests complexes** | Nécessité d'un conteneur EJB complet pour les tests | Moyenne |
| **Monitoring limité** | Observabilité réduite des appels inter-services | Moyenne |
| **Messaging couplé** (JMS/MQ) | Dépendance à IBM MQ, pas d'event sourcing | Moyenne |

### 1.3 Enjeux stratégiques

La transformation numérique du secteur bancaire impose une ouverture des systèmes d'information via des APIs standardisées. Les réglementations européennes (DSP2/PSD2) exigent la mise à disposition d'APIs pour les tiers autorisés. La migration vers le cloud (stratégie Cloud-First) nécessite des applications containerisées et orchestrées. Le maintien d'une architecture legacy fermée constitue un risque réglementaire, sécuritaire et un frein à la compétitivité.

---

## 2. Stratégie de modernisation

### 2.1 Approche retenue : Strangler Fig Pattern

La modernisation s'appuie sur le **Strangler Fig Pattern** : les composants legacy sont progressivement remplacés par des microservices modernes, sans interruption de service. Un API Gateway route le trafic entre les anciens et les nouveaux services pendant la période de transition.

### 2.2 Périmètre de la plateforme

La plateforme Java Legacy Modernizer couvre l'intégralité du cycle de modernisation :

| Phase | Outil | Résultat |
| :--- | :--- | :--- |
| **Inventaire** | Analyseur multi-technologies | Cartographie complète des technologies legacy |
| **Évaluation** | Moteur IA déterministe (55+ règles) | Scores de qualité, anti-patterns, estimation d'effort |
| **Transformation** | Générateur de code étendu | Code Spring Boot 3 / Spring Data JPA / Spring Kafka |
| **Décomposition** | Extracteur de microservices | Propositions de bounded contexts et microservices |
| **Déploiement** | Générateur cloud-native | Docker, K8s, Helm, CI/CD, observabilité |
| **Sécurité** | Générateur de sécurité | OAuth2 + OpenID Connect (Keycloak, Azure AD) |

### 2.3 Principes directeurs

1. **Automatisation maximale** : Réduire l'intervention manuelle à moins de 30% du code final
2. **Déterminisme** : Toute suggestion IA est traçable à une règle codée. Aucune hallucination.
3. **Incrémentalité** : Chaque service peut être migré indépendamment
4. **Réversibilité** : Le code legacy n'est jamais modifié, le rollback est toujours possible
5. **Confidentialité** : Tout s'exécute côté client, aucune donnée ne quitte le poste de travail

---

## 3. Architecture de la plateforme

### 3.1 Vue d'ensemble

La plateforme est une application web monopage (SPA) qui s'exécute entièrement dans le navigateur. Elle est composée de 6 moteurs principaux :

```
┌──────────────────────────────────────────────────────────────┐
│                    Interface Web (React 19)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Monaco Editor│  │ Onglets x6  │  │ Barre d'outils      │  │
│  │ (multi-tabs) │  │ (résultats) │  │ (actions)           │  │
│  └──────┬───────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                 │                     │             │
│  ┌──────▼─────────────────▼─────────────────────▼──────────┐ │
│  │              Orchestrateur de pipeline                    │ │
│  └──┬───────┬────────┬────────┬────────┬────────┬──────────┘ │
│     │       │        │        │        │        │            │
│  ┌──▼──┐ ┌──▼──┐ ┌───▼──┐ ┌──▼──┐ ┌───▼──┐ ┌──▼──┐        │
│  │Analy│ │Trans│ │Micro │ │Cloud│ │ IA   │ │Expor│        │
│  │seur │ │form.│ │serv. │ │Nat. │ │55+   │ │t    │        │
│  │Multi│ │Éten.│ │Extr. │ │Gén. │ │règles│ │ZIP/ │        │
│  │Tech │ │     │ │      │ │     │ │      │ │PDF  │        │
│  └─────┘ └─────┘ └──────┘ └─────┘ └──────┘ └─────┘        │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Stack technique

| Composant | Technologie | Justification |
| :--- | :--- | :--- |
| Framework UI | React 19 + TypeScript | Écosystème mature, typage fort |
| Éditeur de code | Monaco Editor | Même moteur que VS Code, coloration Java native |
| Stylisation | Tailwind CSS 4 + shadcn/ui | Design system cohérent, composants accessibles |
| Animations | Framer Motion | Micro-interactions fluides |
| Génération ZIP | JSZip + FileSaver.js | Génération côté client, aucun serveur nécessaire |
| Génération PDF | jsPDF | Rapports professionnels côté client |
| Analyse de code | Moteur TypeScript custom | Analyse AST-like par regex avancées |

### 3.3 Flux de données

Le flux de traitement suit un pipeline séquentiel :

1. **Entrée** : Code Java legacy (éditeur, fichiers, dossier, projet entier)
2. **Analyse** : Détection des 10 familles de technologies legacy
3. **Transformation** : Génération du code Spring Boot 3 moderne
4. **Extraction** : Propositions de microservices et bounded contexts
5. **Cloud** : Génération des artefacts de déploiement
6. **IA** : Évaluation de qualité et suggestions d'amélioration
7. **Export** : ZIP Maven ou PDF du rapport IA

---

## 4. Moteur d'analyse multi-technologies

### 4.1 Technologies détectées

Le moteur d'analyse détecte automatiquement 10 familles de technologies legacy :

| Technologie | Patterns détectés | Complexité de migration |
| :--- | :--- | :---: |
| **EJB** | `@EJB`, `@Stateless`, `@Stateful`, `@Remote`, `@Local`, JNDI, `InitialContext` | Moyenne |
| **Servlets** | `HttpServlet`, `@WebServlet`, `doGet/doPost`, `Filter`, `Listener` | Faible |
| **JSP** | Scriptlets, directives, taglibs, JSTL, EL expressions | Moyenne |
| **Struts** | `ActionForm`, `ActionForward`, `DispatchAction`, `struts-config.xml` | Moyenne |
| **SOAP** | `@WebService`, `@WebMethod`, `@SOAPBinding`, WSDL, JAX-WS | Élevée |
| **JDBC** | `DriverManager`, `PreparedStatement`, `ResultSet`, `Connection` | Moyenne |
| **Hibernate** | `SessionFactory`, `HQL`, `Criteria`, `Session.save/update/delete` | Faible |
| **JMS/MQ** | `@MessageDriven`, `JMSContext`, `Queue`, `Topic`, `MessageListener` | Élevée |
| **Batch** | `@Schedule`, `TimerService`, boucles de traitement en masse | Moyenne |
| **Transactions** | `@TransactionAttribute`, `UserTransaction`, BMT/CMT | Moyenne |

### 4.2 Algorithme d'analyse

L'analyseur utilise un ensemble de **regex compilées** et de **patterns de détection** pour identifier les technologies dans le code source. Pour chaque technologie, il extrait :

- Les annotations et imports spécifiques
- Les classes et interfaces héritées
- Les appels de méthodes caractéristiques
- Les lignes de code concernées
- Le nombre d'occurrences

L'analyse produit un `ExtendedAnalysisReport` contenant la cartographie complète des technologies, les dépendances inter-services et les métriques de complexité.

---

## 5. Moteur de transformation

### 5.1 Matrice de transformation

| Source | Cible | Fichiers générés |
| :--- | :--- | :--- |
| EJB Client | Spring WebClient + Resilience4j | ApiClient, DTO, Config, Exception, Test |
| Servlet | Spring REST Controller | Controller, DTO, Service, Test |
| Struts Action | Spring MVC Controller | Controller, DTO, Service, Test |
| SOAP WebService | REST Controller + OpenAPI 3.0 | Controller, DTO, Service, OpenAPI spec |
| JDBC brut | Spring Data JPA Repository | Entity, Repository, Service, Test |
| Hibernate Session | Spring Data JPA | Entity, Repository, Service |
| JMS/MQ | Spring Kafka Producer/Consumer | KafkaConfig, Producer, Consumer, Event |
| Batch Timer | Spring Batch Job | BatchConfig, Job, Step, Tasklet |

### 5.2 Qualité du code généré

Le code généré respecte les standards suivants :

- **Java 21** avec records, sealed classes et pattern matching
- **Spring Boot 3.3** avec auto-configuration
- **Jakarta EE 10** (namespace `jakarta.*`)
- **Lombok** pour la réduction du boilerplate (`@Slf4j`, `@RequiredArgsConstructor`, `@Data`)
- **OpenAPI 3.0** annotations pour la documentation automatique
- **Jakarta Validation** pour la validation des DTOs
- **Resilience4j** pour la résilience (retry, circuit-breaker, timeout)
- **Tests JUnit 5 + Mockito** avec couverture des cas nominaux et d'erreur

---

## 6. Moteur d'extraction de microservices

### 6.1 Approche

Le moteur d'extraction analyse les dépendances entre services et propose une décomposition en microservices basée sur les principes du **Domain-Driven Design** (DDD).

### 6.2 Algorithme

1. **Construction du graphe de dépendances** : Chaque service détecté devient un nœud, chaque appel inter-service devient une arête
2. **Détection des bounded contexts** : Regroupement des services fortement couplés en domaines fonctionnels
3. **Proposition de microservices** : Chaque bounded context devient un microservice candidat
4. **Analyse de couplage** : Calcul du couplage afférent/efférent et de l'instabilité

### 6.3 Résultats

Pour chaque microservice proposé, l'outil fournit :

| Élément | Description |
| :--- | :--- |
| **Nom** | Nom du microservice basé sur le domaine fonctionnel |
| **Services inclus** | Liste des services legacy regroupés |
| **APIs exposées** | Endpoints REST proposés |
| **Events** | Événements de domaine publiés/consommés |
| **Data Store** | Base de données recommandée (PostgreSQL, MongoDB, Redis) |
| **Couplage** | Score de couplage avec les autres microservices |

---

## 7. Génération cloud-native

### 7.1 Artefacts générés

| Artefact | Description |
| :--- | :--- |
| **Dockerfile** | Image multi-stage (build Maven + runtime JRE 21 slim) |
| **K8s Deployment** | Manifest avec readiness/liveness probes, resource limits |
| **K8s Service** | ClusterIP pour l'exposition interne |
| **K8s ConfigMap** | Configuration externalisée |
| **K8s HPA** | Autoscaling horizontal (CPU 70%, mémoire 80%) |
| **Helm Chart** | Chart paramétrable avec `values.yaml` et templates |
| **API Gateway** | Spring Cloud Gateway avec rate limiting et circuit-breaker |
| **SecurityConfig** | OAuth2 Resource Server + OpenID Connect |
| **Prometheus** | Métriques applicatives via Micrometer |
| **Grafana** | Dashboard JSON préconfigurés |
| **ELK** | Configuration Logback pour Elasticsearch |
| **Docker Compose** | Stack complète pour le développement local |
| **GitHub Actions** | Pipeline CI/CD (build, test, Docker, deploy K8s) |

### 7.2 Architecture de déploiement cible

```
┌─────────────────────────────────────────────────────┐
│                   Kubernetes Cluster                 │
│                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │
│  │ API Gateway  │  │ Keycloak    │  │ Prometheus │  │
│  │ (Spring     │  │ (OIDC)      │  │ + Grafana  │  │
│  │  Cloud GW)  │  │             │  │            │  │
│  └──────┬──────┘  └─────────────┘  └────────────┘  │
│         │                                           │
│  ┌──────▼──────┐  ┌─────────────┐  ┌────────────┐  │
│  │ Account     │  │ Payment     │  │ Customer   │  │
│  │ Service     │  │ Service     │  │ Service    │  │
│  │ (Spring     │  │ (Spring     │  │ (Spring    │  │
│  │  Boot 3)    │  │  Boot 3)    │  │  Boot 3)   │  │
│  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘  │
│         │                │               │          │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────┐  │
│  │ PostgreSQL  │  │ Kafka       │  │ Redis      │  │
│  │ (Database)  │  │ (Events)    │  │ (Cache)    │  │
│  └─────────────┘  └─────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 8. Moteur d'intelligence artificielle déterministe

### 8.1 Principes fondamentaux

Le moteur IA est **100% déterministe**. Il n'utilise aucun modèle de langage (LLM), aucune API externe, et ne génère aucun texte libre. Chaque suggestion est traçable à une règle codée en dur avec un identifiant unique. Il n'y a aucune hallucination possible.

### 8.2 Sources des règles (55+)

| Source | Catégorie | Exemples de règles |
| :--- | :--- | :--- |
| **OWASP** | Sécurité | Injection SQL, XSS, CSRF, secrets en dur, crypto faible |
| **SonarQube** | Qualité | Code smells, bugs, vulnérabilités, dette technique |
| **SOLID** | Architecture | SRP, OCP, LSP, ISP, DIP |
| **Clean Code** | Lisibilité | Nommage, méthodes longues, God classes, complexité |
| **PMD** | Industriel | Empty catch, unused variables, unnecessary imports |
| **SpotBugs** | Bugs | Null pointer, resource leaks, concurrency issues |
| **Checkstyle** | Conventions | Javadoc, naming, line length, modifiers |
| **Refactoring Guru** | Anti-patterns | Feature envy, data clumps, primitive obsession |

### 8.3 Algorithme de scoring

Le score de qualité (0-100) est calculé en pondérant 6 critères :

| Critère | Poids | Description |
| :--- | :--- | :---: |
| Maintenabilité | 25% | Complexité, couplage, cohésion, taille des classes |
| Sécurité | 25% | Règles OWASP, gestion des secrets, validation des entrées |
| Performance | 15% | Patterns inefficaces, N+1 queries, fuites de ressources |
| Résilience | 15% | Gestion des erreurs, retry, timeout, circuit-breaker |
| Testabilité | 10% | Injection de dépendances, interfaces, mocking |
| Lisibilité | 10% | Nommage, documentation, complexité cyclomatique |

### 8.4 Optimisations vérifiées

| Optimisation | Vérification | Recommandation |
| :--- | :--- | :--- |
| **Retry** | Présence de `@Retry` ou retry pattern | Resilience4j `@Retry` |
| **Circuit-Breaker** | Présence de `@CircuitBreaker` | Resilience4j `@CircuitBreaker` |
| **Timeout** | Présence de `.timeout()` ou `@TimeLimiter` | `Duration.ofSeconds(30)` |
| **Logging** | Présence de `@Slf4j` ou Logger | SLF4J + Logback structuré |
| **Error-Handling** | Présence de `@ControllerAdvice` | `GlobalExceptionHandler` |
| **Cache** | Présence de `@Cacheable` | Spring Cache + Redis |

---

## 9. Sécurité : OAuth2 + OpenID Connect

### 9.1 Architecture de sécurité

La plateforme génère une configuration de sécurité complète basée sur OAuth2 Resource Server avec JWT et OpenID Connect (OIDC). Cette architecture est compatible avec les providers majeurs : Keycloak, Azure AD, Okta, Auth0.

### 9.2 Composants générés

| Composant | Description |
| :--- | :--- |
| **SecurityConfig** | Configuration Spring Security avec OAuth2 Resource Server |
| **JWT Validation** | Validation automatique des tokens JWT via JWKS |
| **OIDC Discovery** | Auto-configuration via `.well-known/openid-configuration` |
| **OIDC Logout** | RP-Initiated Logout avec redirection vers le provider |
| **Role Mapping** | Extraction des rôles depuis les claims JWT (realm_access) |
| **CORS** | Configuration CORS pour les appels cross-origin |

### 9.3 Flux d'authentification

```
Client → API Gateway → OAuth2 Resource Server → JWT Validation → Service
                              ↕
                     Keycloak / Azure AD
                     (OIDC Provider)
```

---

## 10. Domain Events et architecture event-driven

### 10.1 Approche

L'outil génère automatiquement des **événements de domaine** (Domain Events) pour chaque service détecté. Les Domain Events permettent la communication asynchrone entre microservices, réduisant le couplage temporel.

### 10.2 Fichiers générés

Pour chaque service, deux fichiers sont générés :

**`{Service}DomainEvent.java`** : Classe abstraite avec les événements concrets `CreatedEvent`, `UpdatedEvent` et `DeletedEvent`. Chaque événement contient un `eventId` (UUID), un `eventType`, un `occurredAt` (timestamp) et un `aggregateId`.

**`{Service}EventPublisher.java`** : Composant Spring qui publie les événements via `ApplicationEventPublisher` (intra-service) et peut être étendu pour publier sur Kafka (inter-services).

### 10.3 Architecture event-driven cible

```
Service A → ApplicationEventPublisher → Kafka Topic → Service B
                                                    → Service C
```

---

## 11. Architecture cible du code généré

### 11.1 Structure hexagonale

```
src/main/java/com/bank/modern/
├── controller/     # Adaptateurs d'entrée (REST)
├── service/        # Cas d'utilisation (logique métier)
├── client/         # Adaptateurs de sortie (WebClient)
├── repository/     # Adaptateurs de sortie (JPA)
├── dto/            # Objets de transfert (Request/Response)
├── entity/         # Modèle de domaine
├── event/          # Événements de domaine
├── exception/      # Gestion des erreurs
├── config/         # Configuration Spring
└── kafka/          # Producers/Consumers Kafka
```

### 11.2 Principes architecturaux

| Principe | Implémentation |
| :--- | :--- |
| **Clean Architecture** | Séparation stricte des couches (controller → service → repository) |
| **DDD** | Entités riches, Value Objects, Domain Events, Aggregates |
| **CQRS** | Séparation lecture/écriture via DTOs distincts |
| **Event Sourcing** | Domain Events pour la traçabilité des changements |
| **API-First** | OpenAPI 3.0 annotations sur tous les endpoints |

---

## 12. Bénéfices techniques

| Bénéfice | Avant (Legacy) | Après (Modernisé) |
| :--- | :--- | :--- |
| **Protocole** | IIOP/RMI, SOAP | REST/HTTP2, gRPC, Kafka |
| **Déploiement** | WebSphere monolithique | Kubernetes, containers Docker |
| **Scaling** | Vertical (coûteux) | Horizontal (HPA, auto-scaling) |
| **Tests** | Conteneur EJB requis | JUnit 5 + Mockito, Testcontainers |
| **Monitoring** | Logs fichiers | Prometheus + Grafana + ELK |
| **Sécurité** | JAAS propriétaire | OAuth2 + OIDC standard |
| **CI/CD** | Manuel | GitHub Actions automatisé |
| **Résilience** | Aucune | Retry, Circuit-Breaker, Timeout |

---

## 13. Bénéfices business

| Bénéfice | Estimation |
| :--- | :--- |
| **Réduction des coûts de licence** | -60% (WebSphere → Kubernetes open-source) |
| **Accélération du time-to-market** | x3 (déploiement continu vs trimestriel) |
| **Réduction des coûts de maintenance** | -40% (code moderne, recrutement facilité) |
| **Ouverture API** | Conformité DSP2/PSD2, partenariats fintech |
| **Économie sur la migration** | 150K-250K EUR (automatisation vs migration manuelle) |
| **Réduction du risque** | Score IA > 85/100 avant mise en production |

---

## 14. Risques et stratégies de mitigation

| Risque | Probabilité | Impact | Mitigation |
| :--- | :---: | :---: | :--- |
| Logique métier complexe non détectable | Moyenne | Élevé | Revue manuelle post-génération, tests d'intégration |
| Transactions distribuées (2PC) | Faible | Élevé | Pattern Saga, compensation, moteur IA signale ces cas |
| Dépendances circulaires | Moyenne | Moyen | Extracteur de microservices détecte et signale |
| Performance des appels REST vs EJB | Faible | Moyen | Cache Redis, pagination, compression gzip |
| Résistance au changement | Moyenne | Moyen | Formation, documentation, migration progressive |
| Perte de données pendant la migration | Faible | Élevé | Strangler Fig Pattern, double-write, rollback possible |

---

## 15. Recommandations

### 15.1 Court terme (T2 2026)

1. **POC sur 5 services** : Valider l'outil sur un périmètre restreint avec des services représentatifs de chaque technologie (EJB, Servlet, SOAP, JDBC, JMS)
2. **Formation des équipes** : Former 2-3 développeurs seniors à l'utilisation de la plateforme et à la revue du code généré
3. **Intégration CI/CD** : Intégrer le scoring IA dans le pipeline de validation (seuil Quality Gate : 85/100)

### 15.2 Moyen terme (T3-T4 2026)

1. **Migration par lots** : Migrer les 350 services par lots de 20-30, en commençant par les services les moins couplés (score de couplage < 3)
2. **Déploiement Kubernetes** : Mettre en place le cluster K8s de production avec les Helm Charts générés
3. **Observabilité** : Déployer la stack Prometheus + Grafana + ELK pour le monitoring des nouveaux services

### 15.3 Long terme (2027)

1. **Décommissionnement WebSphere** : Après migration complète, arrêter les serveurs WebSphere
2. **Event-driven architecture** : Généraliser Kafka pour la communication inter-services
3. **API Marketplace** : Exposer les APIs modernisées via un portail développeur pour les partenaires

---

*Java Legacy Modernizer Platform v3.0 — Développé par Compleo*
