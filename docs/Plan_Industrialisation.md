# Plan d'Industrialisation Bancaire — Migration EJB vers APIs REST

**Auteur** : Hamza NORDINE
**Version** : 3.0.0
**Date** : Avril 2026
**Audience** : Direction des Systèmes d'Information, Comité de Pilotage, Architectes Solutions

---

## Table des matières

1. [Vision et objectifs](#1-vision-et-objectifs)
2. [Rôle du moteur IA déterministe dans l'industrialisation](#2-rôle-du-moteur-ia-déterministe-dans-lindustrialisation)
3. [Phase 1 — Proof of Concept avec scoring IA](#3-phase-1--proof-of-concept-avec-scoring-ia)
4. [Phase 2 — Génération automatique des premiers clients API](#4-phase-2--génération-automatique-des-premiers-clients-api)
5. [Phase 3 — Migration progressive assistée par IA](#5-phase-3--migration-progressive-assistée-par-ia)
6. [Phase 4 — Plateforme API interne](#6-phase-4--plateforme-api-interne)
7. [Phase 5 — Exposition partenaires fintech](#7-phase-5--exposition-partenaires-fintech)
8. [Stratégie de priorisation IA des 350 services](#8-stratégie-de-priorisation-ia-des-350-services)
9. [Sécurité](#9-sécurité)
10. [Monitoring et observabilité](#10-monitoring-et-observabilité)
11. [Gestion des accès](#11-gestion-des-accès)
12. [Scalabilité](#12-scalabilité)
13. [Gouvernance API](#13-gouvernance-api)
14. [Planning et budget](#14-planning-et-budget)

---

## 1. Vision et objectifs

### 1.1 Vision

Transformer progressivement l'architecture EJB legacy de la banque en une plateforme d'APIs REST modernes, ouverte, scalable et conforme aux exigences réglementaires, tout en maintenant la continuité de service et la qualité des opérations bancaires. La version 2.0 de l'outil EJB Client Modernizer intègre un **moteur d'intelligence artificielle déterministe** qui accélère et sécurise cette transformation en fournissant des scores de qualité, des détections d'anti-patterns et des optimisations automatiques à chaque étape du processus.

### 1.2 Objectifs mesurables

| Objectif | Indicateur | Cible |
| :--- | :--- | :---: |
| Migration des services | Nombre de services migrés | 350 services en 24 mois |
| Réduction des coûts de licence | Économie annuelle sur licences WebSphere | 60% |
| Temps de déploiement | Durée moyenne d'un déploiement | < 15 minutes |
| Disponibilité | SLA des APIs | 99.95% |
| Performance | Temps de réponse P95 | < 200ms |
| Ouverture | Nombre de partenaires connectés | 10+ en 12 mois |
| Score IA du code modernisé | Score moyen de qualité (moteur IA) | > 90/100 |
| Taux de couverture IA | Services analysés par le moteur IA | 100% |
| Anti-patterns résolus | Taux de résolution des anti-patterns détectés | > 95% |

---

## 2. Rôle du moteur IA déterministe dans l'industrialisation

### 2.1 Présentation du moteur IA

Le moteur IA intégré à l'outil EJB Client Modernizer est un système d'analyse **100% déterministe** qui fonctionne entièrement dans le navigateur, sans appel à un service externe. Il repose sur un catalogue de règles codées en dur, chacune identifiable par un identifiant unique (ex: AP-071). Ce moteur ne génère aucun texte libre et ne produit aucune hallucination : chaque suggestion est traçable à une règle précise, reproductible à l'identique pour le même code d'entrée.

### 2.2 Apport du moteur IA dans le processus de migration

Le moteur IA intervient à quatre niveaux dans le processus d'industrialisation :

| Niveau | Apport | Phase concernée |
| :--- | :--- | :--- |
| **Priorisation** | Scoring automatique des 350 services pour déterminer l'ordre de migration optimal | Toutes les phases |
| **Qualité** | Évaluation du code legacy et du code généré sur 4 critères (maintenabilité, sécurité, performance, résilience) | Phases 1 à 3 |
| **Optimisation** | Recommandation et application automatique de patterns de résilience (retry, circuit-breaker, timeout, logging, caching) | Phases 2 et 3 |
| **Conformité** | Détection des anti-patterns, des credentials hardcodés, des transactions distribuées et des éléments JMS/MQ/Batch nécessitant une attention particulière | Toutes les phases |

### 2.3 Critères de scoring IA

Le moteur IA évalue chaque service selon quatre critères pondérés :

| Critère | Poids | Facteurs positifs | Facteurs négatifs |
| :--- | :---: | :--- | :--- |
| **Maintenabilité** | 30% | Injection de dépendances, séparation des responsabilités, code lisible | Couplage fort, code dupliqué, classes monolithiques |
| **Sécurité** | 25% | Validation des entrées, gestion des exceptions typée | Credentials hardcodés, données sensibles exposées |
| **Performance** | 25% | Appels non-bloquants, caching, pagination | Appels synchrones bloquants, absence de timeout |
| **Résilience** | 20% | Retry, circuit-breaker, timeout, fallback | Absence de gestion d'erreurs, pas de retry |

Le score global est la moyenne pondérée des quatre critères, normalisée sur 100. L'objectif industriel est d'atteindre un score moyen de **90/100** pour le code modernisé.

### 2.4 Catégories de règles de détection

Le moteur utilise un catalogue de règles organisées par catégorie :

| Catégorie | Préfixe | Exemples de détection |
| :--- | :---: | :--- |
| **EJB Legacy** | AP-07x | `@Stateless`, `@Stateful`, `@Singleton`, `@MessageDriven` |
| **JNDI** | AP-02x | `InitialContext`, `Context.lookup()`, noms JNDI hardcodés |
| **Couplage** | AP-03x | Nombre excessif d'injections (seuil : 5+), dépendances circulaires |
| **Transactions** | AP-04x | `@TransactionAttribute`, `UserTransaction`, transactions distribuées |
| **Sécurité** | AP-05x | Credentials hardcodés, absence de validation des entrées |
| **Performance** | AP-06x | Appels synchrones bloquants, absence de cache, boucles N+1 |
| **JMS/MQ/Batch** | AP-08x | `@MessageDriven`, `JMSContext`, `@BatchProperty` |

### 2.5 Optimisations automatiques

Le moteur IA recommande et applique six catégories d'optimisations dans le code généré :

| Optimisation | Statut | Description |
| :--- | :---: | :--- |
| **Retry** | Appliqué automatiquement | Politique de retry (3 tentatives, backoff exponentiel) pour les erreurs transitoires |
| **Circuit-Breaker** | Appliqué automatiquement | Isolation des pannes via Resilience4j pour éviter les cascades d'erreurs |
| **Timeout** | Appliqué automatiquement | Timeouts explicites (connect: 5s, read: 30s) sur tous les appels WebClient |
| **Logging** | Appliqué automatiquement | Logging structuré (SLF4J) avec corrélation d'ID de requête |
| **Error-Handling** | Appliqué automatiquement | Gestion d'erreurs typée (WebClientResponseException, TimeoutException, fallback) |
| **Cache** | Recommandé | Ajout de `@Cacheable` pour les méthodes de lecture (get/find/list) |

---

## 3. Phase 1 — Proof of Concept avec scoring IA

**Durée** : 4 semaines
**Équipe** : 2 architectes + 2 développeurs seniors

### 3.1 Objectifs

Cette phase vise à valider la faisabilité technique de la migration en transformant un périmètre limité de services EJB en APIs REST. L'objectif est de démontrer que l'outil EJB Client Modernizer, enrichi de son moteur IA, peut automatiser efficacement la transformation du code client, évaluer la qualité du code et proposer des optimisations pertinentes. Le scoring IA servira de **référence de qualité** pour toutes les phases suivantes.

### 3.2 Périmètre

Le POC cible 5 services EJB représentatifs des différents patterns rencontrés dans le système legacy :

| Service | Pattern | Complexité | Score IA attendu (legacy) |
| :--- | :--- | :---: | :---: |
| AccountService | @EJB injection | Faible | 70-80 |
| TransferService | JNDI lookup | Moyenne | 55-65 |
| CustomerService | InitialContext | Moyenne | 50-60 |
| AuditService | @EJB + transactions | Élevée | 40-50 |
| NotificationService | @EJB + JMS | Élevée | 35-45 |

### 3.3 Processus POC avec moteur IA

Le processus de POC intègre le moteur IA à chaque étape :

**Étape 1 — Analyse et scoring initial** : L'outil analyse le code legacy des 5 services. Le moteur IA attribue un score de qualité à chaque service et détecte les anti-patterns. Ce scoring initial constitue la **baseline** de référence.

**Étape 2 — Génération et scoring du code modernisé** : L'outil génère les clients API REST. Le moteur IA évalue le code généré et confirme l'amélioration du score (objectif : gain de 20 à 40 points par rapport au code legacy).

**Étape 3 — Revue des suggestions IA** : L'équipe examine les suggestions du moteur IA (anti-patterns détectés, optimisations recommandées) et valide leur pertinence. Les suggestions non pertinentes sont documentées pour affiner les règles si nécessaire.

**Étape 4 — Application des optimisations** : Les optimisations recommandées par le moteur IA (retry, circuit-breaker, timeout, caching) sont intégrées dans le code final. Le score IA est recalculé pour confirmer l'amélioration.

### 3.4 Livrables

Les livrables de cette phase incluent : le code des 5 clients API REST générés et validés, le rapport d'analyse de chaque service avec scoring IA (legacy vs modernisé), la matrice des anti-patterns détectés et leur résolution, les tests unitaires et d'intégration, un document de retour d'expérience incluant la validation des règles IA, et une estimation affinée du planning pour les phases suivantes basée sur les scores de complexité IA.

### 3.5 Critères de succès

| Critère | Seuil de réussite |
| :--- | :--- |
| Tests d'intégration | 5/5 clients API passent les tests |
| Temps de transformation par service | < 2 heures (incluant ajustements manuels) |
| Score IA du code modernisé | > 85/100 pour chaque service |
| Gain de score IA (legacy → modernisé) | > 20 points en moyenne |
| Anti-patterns critiques résolus | 100% |
| Régression fonctionnelle | Aucune |

---

## 4. Phase 2 — Génération automatique des premiers clients API

**Durée** : 8 semaines
**Équipe** : 2 architectes + 4 développeurs + 1 QA

### 4.1 Objectifs

Cette phase étend la migration à un premier lot significatif de 50 services, en industrialisant le processus de transformation. L'outil EJB Client Modernizer est utilisé systématiquement avec le moteur IA pour générer les clients API, évaluer la qualité et appliquer les optimisations. Le **mode projet entier** de l'outil est utilisé pour traiter les lots de services en une seule passe.

### 4.2 Organisation du travail

Les 50 services sont répartis en 5 lots de 10, traités séquentiellement. Chaque lot suit le processus suivant :

**Étape 1 — Chargement projet entier** : Le mode "Projet entier" de l'outil charge l'ensemble des fichiers Java du lot. Tous les fichiers sont affichés dans des onglets distincts.

**Étape 2 — Analyse et scoring IA automatique** : L'outil analyse les 10 services et le moteur IA attribue un score à chaque service. Les services avec un score legacy inférieur à 50 sont signalés comme nécessitant une attention particulière.

**Étape 3 — Génération et optimisation** : L'outil génère les clients API REST. Le moteur IA applique automatiquement les optimisations (retry, circuit-breaker, timeout, logging, error-handling) et recommande le caching pour les méthodes de lecture.

**Étape 4 — Revue des suggestions IA** : Les développeurs examinent les suggestions du moteur IA, en se concentrant sur les éléments de sévérité "critique" et "avertissement". Les anti-patterns critiques sont résolus avant de passer à l'étape suivante.

**Étape 5 — Export ZIP Maven et intégration** : Le projet modernisé est exporté en archive ZIP Maven via le bouton "ZIP Maven". Les développeurs ajustent les DTOs, complètent les tests et intègrent le code dans le projet cible.

**Étape 6 — Validation et déploiement** : Les tests unitaires, d'intégration et de non-régression sont exécutés. Les clients API sont déployés en recette, puis en production.

### 4.3 Métriques de suivi

| Métrique | Cible |
| :--- | :--- |
| Services transformés par semaine | 6-8 |
| Taux de couverture de tests | > 80% |
| Taux de réussite des tests d'intégration | > 95% |
| Temps moyen de transformation par service | < 4 heures |
| Score IA moyen du code modernisé | > 88/100 |
| Anti-patterns critiques résolus | 100% |
| Optimisations IA appliquées | > 90% des recommandations |

### 4.4 Tableau de bord IA par lot

Pour chaque lot de 10 services, un tableau de bord IA est produit :

| Indicateur | Description |
| :--- | :--- |
| Score moyen legacy | Moyenne des scores IA du code legacy du lot |
| Score moyen modernisé | Moyenne des scores IA du code modernisé du lot |
| Gain moyen | Différence entre les deux scores |
| Anti-patterns détectés | Nombre total d'anti-patterns par catégorie |
| Anti-patterns résolus | Nombre d'anti-patterns corrigés |
| Optimisations appliquées | Nombre d'optimisations intégrées dans le code |
| Effort estimé (IA) | Estimation de l'effort en jours-homme par le moteur IA |

---

## 5. Phase 3 — Migration progressive assistée par IA

**Durée** : 16 semaines
**Équipe** : 2 architectes + 8 développeurs + 2 QA + 1 DevOps

### 5.1 Objectifs

Cette phase couvre la migration des 300 services restants, en parallélisant le travail sur plusieurs équipes. Le moteur IA joue un rôle central dans cette phase en fournissant la **priorisation automatique** des services, le **scoring continu** de la qualité et le **suivi des optimisations** appliquées.

### 5.2 Organisation en feature teams

Les 300 services sont répartis entre 4 feature teams de 2 développeurs, chacune responsable d'un domaine fonctionnel. L'ordre de migration au sein de chaque domaine est déterminé par le **score IA de complexité** (les services les plus simples sont migrés en premier) :

| Feature Team | Domaine | Services | Complexité moyenne (IA) |
| :--- | :--- | :---: | :---: |
| Team Comptes | Gestion des comptes, soldes, relevés | 80 | Faible à moyenne |
| Team Paiements | Virements, prélèvements, cartes | 90 | Moyenne à élevée |
| Team Clients | Gestion clientèle, KYC, conformité | 70 | Moyenne |
| Team Opérations | Audit, reporting, batch, notifications | 60 | Élevée |

### 5.3 Processus de migration continue assisté par IA

Chaque feature team suit un cycle de migration de 2 semaines (sprint), enrichi par le moteur IA :

**Semaine 1** :

- Chargement du lot de services via le mode "Projet entier"
- Analyse automatique et scoring IA de chaque service
- Génération des clients API REST avec optimisations automatiques
- Revue des suggestions IA (focus sur les critiques et avertissements)
- Export ZIP Maven et ajustement des DTOs et de la logique métier
- Rédaction des tests complémentaires

**Semaine 2** :

- Tests d'intégration et validation en recette
- Vérification du score IA du code final (objectif : > 90/100)
- Résolution des anti-patterns résiduels signalés par l'IA
- Déploiement en production avec feature flags
- Mise à jour du tableau de bord de migration

### 5.4 Suivi de la qualité par le moteur IA

Le moteur IA fournit un suivi continu de la qualité tout au long de la phase 3 :

| Indicateur IA | Fréquence | Responsable |
| :--- | :--- | :--- |
| Score moyen par feature team | Hebdomadaire | Architecte |
| Évolution du score global (350 services) | Bi-mensuel | Comité de pilotage |
| Anti-patterns critiques non résolus | Quotidien | Feature team |
| Taux d'application des optimisations | Par sprint | QA |
| Estimation de l'effort restant | Par sprint | Chef de projet |

### 5.5 Gestion de la coexistence

Pendant la phase de migration, les services legacy et modernes coexistent. Un API Gateway (Kong ou Spring Cloud Gateway) route les appels vers le service approprié en fonction de l'avancement de la migration. Les feature flags permettent de basculer progressivement le trafic vers les nouveaux clients API. Le moteur IA contribue à cette coexistence en identifiant les dépendances inter-services et en signalant les risques de régression.

---

## 6. Phase 4 — Plateforme API interne

**Durée** : 8 semaines
**Équipe** : 2 architectes + 4 développeurs + 1 DevOps + 1 Product Owner API

### 6.1 Objectifs

Une fois la majorité des services migrés, cette phase consolide l'ensemble en une plateforme API interne cohérente, documentée et gouvernée. Le moteur IA fournit un **rapport de qualité global** couvrant l'ensemble des 350 services migrés, servant de base à la gouvernance API.

### 6.2 Composants de la plateforme

| Composant | Technologie | Fonction |
| :--- | :--- | :--- |
| **API Gateway** | Kong / Spring Cloud Gateway | Routage, rate limiting, authentification |
| **Portail développeur** | Backstage / SwaggerHub | Documentation, sandbox, onboarding |
| **Catalogue d'APIs** | OpenAPI Registry | Inventaire et versioning des APIs |
| **Monitoring** | Grafana + Prometheus | Dashboards, alerting, SLA tracking |
| **CI/CD** | GitLab CI / Jenkins | Déploiement automatisé, tests de contrat |
| **Rapport qualité IA** | EJB Client Modernizer | Scoring global, anti-patterns résiduels, recommandations |

### 6.3 Standards API

La plateforme impose des standards uniformes pour toutes les APIs :

**Nommage** : Convention RESTful (`/api/v{version}/{resource}`), noms de ressources au pluriel, kebab-case.

**Versioning** : Versioning par URL (`/api/v1/`, `/api/v2/`), politique de dépréciation de 12 mois.

**Documentation** : Chaque API doit être documentée via OpenAPI 3.0, avec des exemples de requêtes et réponses.

**Sécurité** : Authentification OAuth2/OIDC obligatoire, scopes granulaires, chiffrement TLS 1.3.

**Qualité IA** : Chaque API doit atteindre un score IA minimum de 85/100 avant publication dans le catalogue. Les anti-patterns critiques doivent être résolus.

---

## 7. Phase 5 — Exposition partenaires fintech

**Durée** : 12 semaines
**Équipe** : 1 architecte + 3 développeurs + 1 juriste + 1 Product Owner API

### 7.1 Objectifs

Cette phase ouvre les APIs bancaires aux partenaires fintech externes, conformément aux exigences DSP2/PSD2. Les APIs sont exposées via un portail partenaire sécurisé, avec des mécanismes de contrôle d'accès, de facturation et de monitoring. Le moteur IA vérifie que les APIs exposées respectent les critères de sécurité et de résilience requis pour l'exposition externe.

### 7.2 APIs exposées

| API | Description | Niveau d'accès | Score IA requis |
| :--- | :--- | :--- | :---: |
| Account Information | Consultation des comptes et soldes | Partenaire certifié | > 95/100 |
| Payment Initiation | Initiation de virements | Partenaire certifié + consentement | > 95/100 |
| Card Management | Gestion des cartes bancaires | Partenaire premium | > 92/100 |
| Customer Data | Données client (KYC) | Partenaire certifié + consentement | > 95/100 |

### 7.3 Validation IA avant exposition

Avant toute exposition externe, chaque API passe par une validation IA renforcée :

| Critère IA | Seuil requis | Justification |
| :--- | :---: | :--- |
| Score global | > 95/100 | Exigence de qualité maximale pour les APIs publiques |
| Score sécurité | > 95/100 | Protection des données bancaires sensibles |
| Score résilience | > 90/100 | Garantie de disponibilité pour les partenaires |
| Anti-patterns critiques | 0 | Aucun anti-pattern critique toléré |
| Optimisations appliquées | 100% | Toutes les optimisations recommandées doivent être intégrées |

### 7.4 Sécurité renforcée

L'exposition aux partenaires externes nécessite des mesures de sécurité renforcées : authentification mutuelle TLS (mTLS), OAuth2 avec PKCE, consentement utilisateur (SCA - Strong Customer Authentication), rate limiting par partenaire, et audit complet de tous les accès. Le moteur IA vérifie l'absence de credentials hardcodés et la présence de validation des entrées dans chaque API exposée.

---

## 8. Stratégie de priorisation IA des 350 services

### 8.1 Principe de priorisation

Le moteur IA permet de prioriser automatiquement l'ordre de migration des 350 services en fonction de leur score de complexité et de leur criticité métier. La stratégie retenue est de migrer d'abord les services les plus simples (score IA élevé = peu d'anti-patterns, faible complexité) pour accumuler de l'expérience, puis de progresser vers les services les plus complexes.

### 8.2 Classification automatique

Le moteur IA classe chaque service dans l'une des trois catégories de complexité :

| Catégorie | Critères IA | Effort estimé | Nombre estimé |
| :--- | :--- | :---: | :---: |
| **Simple** | ≤ 2 injections EJB, ≤ 5 méthodes, pas de JMS/transactions, score legacy > 70 | 0.5 jour | ~140 services (40%) |
| **Moyen** | 3-5 injections, 6-15 méthodes, transactions simples, score legacy 50-70 | 1-2 jours | ~140 services (40%) |
| **Complexe** | 6+ injections, 16+ méthodes, JMS/MQ/Batch, transactions distribuées, score legacy < 50 | 3-5 jours | ~70 services (20%) |

### 8.3 Processus de scan initial

Avant le début de la phase 2, un scan initial de l'ensemble des 350 services est réalisé via le mode "Projet entier" de l'outil :

**Étape 1 — Chargement** : Les 350 fichiers Java sont chargés par domaine fonctionnel (comptes, paiements, clients, opérations).

**Étape 2 — Analyse batch** : Le moteur IA analyse chaque service et attribue un score de complexité.

**Étape 3 — Classification** : Les services sont automatiquement classés en Simple, Moyen ou Complexe.

**Étape 4 — Rapport de priorisation** : Un rapport consolidé est généré, incluant pour chaque service : le score IA, la catégorie de complexité, l'estimation d'effort, les anti-patterns détectés et les optimisations recommandées.

### 8.4 Matrice de priorisation

La matrice de priorisation combine le score IA de complexité et la criticité métier :

| | Criticité métier faible | Criticité métier moyenne | Criticité métier élevée |
| :--- | :---: | :---: | :---: |
| **Complexité IA faible** | Priorité 3 (Phase 2) | Priorité 2 (Phase 2) | Priorité 1 (Phase 1/POC) |
| **Complexité IA moyenne** | Priorité 4 (Phase 3) | Priorité 3 (Phase 3) | Priorité 2 (Phase 2) |
| **Complexité IA élevée** | Priorité 5 (Phase 3) | Priorité 4 (Phase 3) | Priorité 3 (Phase 3, équipe senior) |

### 8.5 Estimation globale de l'effort

Sur la base des catégories de complexité IA, l'effort total de migration des 350 services est estimé comme suit :

| Catégorie | Services | Effort unitaire | Effort total |
| :--- | :---: | :---: | :---: |
| Simple | 140 | 0.5 jour | 70 jours |
| Moyen | 140 | 1.5 jours | 210 jours |
| Complexe | 70 | 4 jours | 280 jours |
| **Total** | **350** | | **560 jours-homme** |

Avec une équipe de 8 développeurs et un taux d'utilisation de 80%, cela représente environ **9 mois** de travail effectif, cohérent avec le planning global de 24 mois (incluant les phases de POC, plateforme et exposition partenaires).

---

## 9. Sécurité

### 9.1 Architecture de sécurité

La sécurité est intégrée à chaque couche de l'architecture :

| Couche | Mesure | Technologie |
| :--- | :--- | :--- |
| **Réseau** | Chiffrement TLS 1.3, segmentation réseau | WAF, VPN |
| **API Gateway** | Authentification, rate limiting, IP whitelisting | Kong / Spring Cloud Gateway |
| **Application** | OAuth2/OIDC, JWT, validation des entrées | Spring Security |
| **Données** | Chiffrement au repos et en transit | AES-256, TLS |
| **Audit** | Logging de tous les accès, traçabilité | ELK Stack |
| **Analyse IA** | Détection de credentials hardcodés, absence de validation | Moteur IA déterministe |

### 9.2 Contribution du moteur IA à la sécurité

Le moteur IA contribue à la sécurité de la migration en détectant automatiquement les problèmes suivants dans le code legacy :

| Problème détecté | Règle IA | Sévérité | Action recommandée |
| :--- | :---: | :---: | :--- |
| Credentials hardcodés (mots de passe, clés API) | AP-051 | Critique | Externaliser dans un vault |
| Absence de validation des entrées | AP-052 | Avertissement | Ajouter Jakarta Validation |
| Données sensibles dans les logs | AP-053 | Critique | Masquer les données sensibles |
| Absence de chiffrement des données en transit | AP-054 | Avertissement | Activer TLS |

### 9.3 Gestion des secrets

Les secrets (clés API, mots de passe, certificats) sont gérés via un vault centralisé (HashiCorp Vault ou Azure Key Vault). Aucun secret n'est stocké dans le code source ou les fichiers de configuration. Le moteur IA vérifie systématiquement l'absence de secrets dans le code analysé.

---

## 10. Monitoring et observabilité

### 10.1 Piliers de l'observabilité

**Métriques** : Collecte via Micrometer, stockage dans Prometheus, visualisation dans Grafana. Les métriques clés incluent le temps de réponse (P50, P95, P99), le taux d'erreur, le débit (requêtes/seconde) et l'utilisation des ressources.

**Logs** : Logging structuré (JSON) avec corrélation via trace ID. Centralisation dans ELK Stack (Elasticsearch, Logstash, Kibana) ou Loki. Le code généré par l'outil intègre automatiquement le logging structuré grâce à l'optimisation IA "Logging".

**Traces** : Traçabilité distribuée via OpenTelemetry, permettant de suivre un appel à travers tous les services impliqués.

### 10.2 Tableau de bord de migration IA

Un tableau de bord dédié au suivi de la migration, alimenté par les données du moteur IA, est mis en place :

| Indicateur | Visualisation | Fréquence de mise à jour |
| :--- | :--- | :--- |
| Progression de la migration (services migrés / total) | Barre de progression | Temps réel |
| Score IA moyen par domaine fonctionnel | Graphique radar | Hebdomadaire |
| Évolution du score IA global dans le temps | Courbe temporelle | Hebdomadaire |
| Répartition des anti-patterns par catégorie | Diagramme en barres | Par sprint |
| Taux d'application des optimisations IA | Jauge | Par sprint |
| Estimation de l'effort restant (jours-homme) | Compteur | Par sprint |

### 10.3 Alerting

Des alertes sont configurées pour les seuils critiques :

| Alerte | Seuil | Action |
| :--- | :--- | :--- |
| Temps de réponse P95 | > 500ms | Notification équipe |
| Taux d'erreur 5xx | > 1% | Notification + escalade |
| Disponibilité | < 99.9% | Escalade immédiate |
| Utilisation CPU | > 80% | Auto-scaling |
| Score IA d'un service migré | < 85/100 | Revue obligatoire avant déploiement |

---

## 11. Gestion des accès

### 11.1 Modèle d'accès

Le modèle d'accès repose sur OAuth2/OIDC avec des scopes granulaires. Chaque API définit ses propres scopes d'accès, et les clients (internes ou externes) doivent obtenir les scopes appropriés pour accéder aux ressources.

### 11.2 Niveaux d'accès

| Niveau | Description | Authentification |
| :--- | :--- | :--- |
| **Interne** | Applications internes de la banque | OAuth2 client credentials |
| **Partenaire** | Partenaires fintech certifiés | OAuth2 + mTLS + consentement |
| **Public** | APIs publiques (informations générales) | API Key + rate limiting |

---

## 12. Scalabilité

### 12.1 Stratégie de scalabilité

L'architecture cible est conçue pour scaler horizontalement. Chaque service API est déployé dans des conteneurs Docker orchestrés par Kubernetes, permettant un auto-scaling basé sur la charge. Le code généré par l'outil inclut un Dockerfile optimisé pour chaque service.

### 12.2 Dimensionnement

| Environnement | Instances min | Instances max | CPU/instance | RAM/instance |
| :--- | :---: | :---: | :---: | :---: |
| Développement | 1 | 2 | 0.5 vCPU | 512 MB |
| Recette | 2 | 4 | 1 vCPU | 1 GB |
| Production | 3 | 20 | 2 vCPU | 2 GB |

---

## 13. Gouvernance API

### 13.1 Comité API

Un comité API est constitué, composé de l'architecte en chef, du Product Owner API, d'un représentant de chaque feature team et du RSSI. Ce comité se réunit mensuellement pour valider les nouvelles APIs, les évolutions de standards et les demandes d'accès partenaires. Le **rapport de scoring IA** est un document d'entrée obligatoire pour chaque validation.

### 13.2 Cycle de vie des APIs

Chaque API suit un cycle de vie formalisé, enrichi par le scoring IA :

**Draft** : Conception et documentation de l'API (OpenAPI spec).

**Review** : Validation par le comité API (conformité aux standards, sécurité, performance). Le score IA doit être supérieur à 85/100.

**Published** : Déploiement en production, disponible dans le catalogue. Score IA minimum : 85/100.

**Deprecated** : Annonce de dépréciation, période de transition de 12 mois.

**Retired** : Désactivation définitive de l'API.

### 13.3 Versioning

Le versioning des APIs suit la convention sémantique :

| Type de changement | Impact | Action |
| :--- | :--- | :--- |
| Ajout de champ optionnel | Non-breaking | Pas de nouvelle version |
| Modification de comportement | Breaking | Nouvelle version majeure |
| Suppression de champ | Breaking | Nouvelle version majeure |
| Ajout d'endpoint | Non-breaking | Pas de nouvelle version |

### 13.4 Seuils de qualité IA par environnement

| Environnement | Score IA minimum | Anti-patterns critiques tolérés | Optimisations requises |
| :--- | :---: | :---: | :--- |
| Développement | Aucun seuil | Illimité | Aucune obligation |
| Recette | > 80/100 | ≤ 2 | Retry + Timeout + Error-Handling |
| Production (interne) | > 85/100 | 0 | Toutes sauf Cache |
| Production (partenaires) | > 95/100 | 0 | Toutes (y compris Cache) |

---

## 14. Planning et budget

### 14.1 Planning global

| Phase | Durée | Début | Fin | Apport IA |
| :--- | :---: | :--- | :--- | :--- |
| Phase 1 — POC avec scoring IA | 4 semaines | M1 | M1 | Baseline de scoring, validation des règles |
| Phase 2 — Premiers clients API | 8 semaines | M2 | M3 | Scoring par lot, priorisation, optimisations |
| Phase 3 — Migration progressive | 16 semaines | M4 | M7 | Priorisation des 300 services, suivi continu |
| Phase 4 — Plateforme API interne | 8 semaines | M8 | M9 | Rapport qualité global, seuils de publication |
| Phase 5 — Exposition partenaires | 12 semaines | M10 | M12 | Validation sécurité renforcée |

### 14.2 Estimation budgétaire

| Poste | Estimation |
| :--- | :--- |
| Équipe projet (12 mois) | 800K - 1.2M EUR |
| Infrastructure cloud | 150K - 250K EUR/an |
| Licences outils (API Gateway, monitoring) | 50K - 100K EUR/an |
| Formation et accompagnement | 50K - 80K EUR |
| **Total première année** | **1.05M - 1.63M EUR** |

### 14.3 Économies liées au moteur IA

Le moteur IA contribue à des économies significatives sur le projet :

| Poste d'économie | Estimation | Justification |
| :--- | :--- | :--- |
| Réduction de l'effort de revue de code | 30% | Détection automatique des anti-patterns |
| Réduction des bugs en production | 40% | Optimisations de résilience appliquées automatiquement |
| Accélération de la priorisation | 80% | Classification automatique des 350 services |
| Réduction des régressions | 25% | Détection des dépendances et des transactions distribuées |
| **Économie totale estimée** | **150K - 250K EUR** | Sur la durée du projet (24 mois) |

### 14.4 Retour sur investissement

L'économie annuelle estimée sur les licences WebSphere et l'infrastructure legacy est de 500K à 800K EUR. Les économies supplémentaires liées au moteur IA (150K à 250K EUR sur 24 mois) accélèrent le retour sur investissement. Le ROI est attendu entre **15 et 20 mois** après le début du projet (contre 18 à 24 mois sans le moteur IA).

---

*Plan d'industrialisation rédigé par Hamza NORDINE — EJB Client Modernizer v2.0*
