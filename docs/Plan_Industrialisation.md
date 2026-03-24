# Plan d'Industrialisation Bancaire — Migration EJB vers APIs REST

**Auteur** : Hamza NORDINE
**Version** : 1.0.0
**Date** : Mars 2026
**Audience** : Direction des Systèmes d'Information, Comité de Pilotage, Architectes Solutions

---

## Table des matières

1. [Vision et objectifs](#1-vision-et-objectifs)
2. [Phase 1 — Proof of Concept](#2-phase-1--proof-of-concept)
3. [Phase 2 — Génération automatique des premiers clients API](#3-phase-2--génération-automatique-des-premiers-clients-api)
4. [Phase 3 — Migration progressive des applications](#4-phase-3--migration-progressive-des-applications)
5. [Phase 4 — Plateforme API interne](#5-phase-4--plateforme-api-interne)
6. [Phase 5 — Exposition partenaires fintech](#6-phase-5--exposition-partenaires-fintech)
7. [Sécurité](#7-sécurité)
8. [Monitoring et observabilité](#8-monitoring-et-observabilité)
9. [Gestion des accès](#9-gestion-des-accès)
10. [Scalabilité](#10-scalabilité)
11. [Gouvernance API](#11-gouvernance-api)
12. [Planning et budget](#12-planning-et-budget)

---

## 1. Vision et objectifs

### 1.1 Vision

Transformer progressivement l'architecture EJB legacy de la banque en une plateforme d'APIs REST modernes, ouverte, scalable et conforme aux exigences réglementaires, tout en maintenant la continuité de service et la qualité des opérations bancaires.

### 1.2 Objectifs mesurables

| Objectif | Indicateur | Cible |
| :--- | :--- | :---: |
| Migration des services | Nombre de services migrés | 350 services en 24 mois |
| Réduction des coûts de licence | Économie annuelle sur licences WebSphere | 60% |
| Temps de déploiement | Durée moyenne d'un déploiement | < 15 minutes |
| Disponibilité | SLA des APIs | 99.95% |
| Performance | Temps de réponse P95 | < 200ms |
| Ouverture | Nombre de partenaires connectés | 10+ en 12 mois |

---

## 2. Phase 1 — Proof of Concept

**Durée** : 4 semaines
**Équipe** : 2 architectes + 2 développeurs seniors

### 2.1 Objectifs

Cette phase vise à valider la faisabilité technique de la migration en transformant un périmètre limité de services EJB en APIs REST. L'objectif est de démontrer que l'outil EJB Client Modernizer peut automatiser efficacement la transformation du code client et que le code généré est fonctionnel en environnement de test.

### 2.2 Périmètre

Le POC cible 5 services EJB représentatifs des différents patterns rencontrés dans le système legacy :

| Service | Pattern | Complexité |
| :--- | :--- | :---: |
| AccountService | @EJB injection | Faible |
| TransferService | JNDI lookup | Moyenne |
| CustomerService | InitialContext | Moyenne |
| AuditService | @EJB + transactions | Élevée |
| NotificationService | @EJB + JMS | Élevée |

### 2.3 Livrables

Les livrables de cette phase incluent : le code des 5 clients API REST générés et validés, le rapport d'analyse de chaque service, les tests unitaires et d'intégration, un document de retour d'expérience avec les ajustements nécessaires, et une estimation affinée du planning pour les phases suivantes.

### 2.4 Critères de succès

Le POC est considéré comme réussi si les 5 clients API générés passent les tests d'intégration avec les APIs REST cibles, si le temps de transformation par service est inférieur à 2 heures (incluant les ajustements manuels), et si aucune régression fonctionnelle n'est détectée.

---

## 3. Phase 2 — Génération automatique des premiers clients API

**Durée** : 8 semaines
**Équipe** : 2 architectes + 4 développeurs + 1 QA

### 3.1 Objectifs

Cette phase étend la migration à un premier lot significatif de 50 services, en industrialisant le processus de transformation. L'outil EJB Client Modernizer est utilisé systématiquement pour générer les clients API, et les processus de validation et de déploiement sont formalisés.

### 3.2 Organisation du travail

Les 50 services sont répartis en 5 lots de 10, traités séquentiellement. Chaque lot suit le processus suivant :

**Étape 1 — Analyse automatique** : L'outil analyse le code legacy et génère le rapport d'analyse pour les 10 services du lot.

**Étape 2 — Génération** : L'outil génère les clients API REST pour chaque service.

**Étape 3 — Ajustement** : Les développeurs ajustent les DTOs, complètent les tests et intègrent le code dans le projet cible.

**Étape 4 — Validation** : Les tests unitaires, d'intégration et de non-régression sont exécutés.

**Étape 5 — Déploiement** : Les clients API sont déployés en environnement de recette, puis en production.

### 3.3 Métriques de suivi

| Métrique | Cible |
| :--- | :--- |
| Services transformés par semaine | 6-8 |
| Taux de couverture de tests | > 80% |
| Taux de réussite des tests d'intégration | > 95% |
| Temps moyen de transformation par service | < 4 heures |

---

## 4. Phase 3 — Migration progressive des applications

**Durée** : 16 semaines
**Équipe** : 2 architectes + 8 développeurs + 2 QA + 1 DevOps

### 4.1 Objectifs

Cette phase couvre la migration des 300 services restants, en parallélisant le travail sur plusieurs équipes. L'objectif est d'atteindre un rythme de migration soutenu tout en maintenant la qualité et la stabilité du système.

### 4.2 Organisation en feature teams

Les 300 services sont répartis entre 4 feature teams de 2 développeurs, chacune responsable d'un domaine fonctionnel :

| Feature Team | Domaine | Nombre de services |
| :--- | :--- | :---: |
| Team Comptes | Gestion des comptes, soldes, relevés | 80 |
| Team Paiements | Virements, prélèvements, cartes | 90 |
| Team Clients | Gestion clientèle, KYC, conformité | 70 |
| Team Opérations | Audit, reporting, batch, notifications | 60 |

### 4.3 Processus de migration continue

Chaque feature team suit un cycle de migration de 2 semaines (sprint) :

**Semaine 1** : Analyse et génération automatique (EJB Client Modernizer), ajustement des DTOs et de la logique métier, rédaction des tests.

**Semaine 2** : Tests d'intégration, validation en recette, déploiement en production avec feature flags.

### 4.4 Gestion de la coexistence

Pendant la phase de migration, les services legacy et modernes coexistent. Un API Gateway (Kong ou Spring Cloud Gateway) route les appels vers le service approprié en fonction de l'avancement de la migration. Les feature flags permettent de basculer progressivement le trafic vers les nouveaux clients API.

---

## 5. Phase 4 — Plateforme API interne

**Durée** : 8 semaines
**Équipe** : 2 architectes + 4 développeurs + 1 DevOps + 1 Product Owner API

### 5.1 Objectifs

Une fois la majorité des services migrés, cette phase consolide l'ensemble en une plateforme API interne cohérente, documentée et gouvernée. L'objectif est de fournir un catalogue d'APIs self-service aux équipes internes.

### 5.2 Composants de la plateforme

| Composant | Technologie | Fonction |
| :--- | :--- | :--- |
| **API Gateway** | Kong / Spring Cloud Gateway | Routage, rate limiting, authentification |
| **Portail développeur** | Backstage / SwaggerHub | Documentation, sandbox, onboarding |
| **Catalogue d'APIs** | OpenAPI Registry | Inventaire et versioning des APIs |
| **Monitoring** | Grafana + Prometheus | Dashboards, alerting, SLA tracking |
| **CI/CD** | GitLab CI / Jenkins | Déploiement automatisé, tests de contrat |

### 5.3 Standards API

La plateforme impose des standards uniformes pour toutes les APIs :

**Nommage** : Convention RESTful (`/api/v{version}/{resource}`), noms de ressources au pluriel, kebab-case.

**Versioning** : Versioning par URL (`/api/v1/`, `/api/v2/`), politique de dépréciation de 12 mois.

**Documentation** : Chaque API doit être documentée via OpenAPI 3.0, avec des exemples de requêtes et réponses.

**Sécurité** : Authentification OAuth2/OIDC obligatoire, scopes granulaires, chiffrement TLS 1.3.

---

## 6. Phase 5 — Exposition partenaires fintech

**Durée** : 12 semaines
**Équipe** : 1 architecte + 3 développeurs + 1 juriste + 1 Product Owner API

### 6.1 Objectifs

Cette phase ouvre les APIs bancaires aux partenaires fintech externes, conformément aux exigences DSP2/PSD2. Les APIs sont exposées via un portail partenaire sécurisé, avec des mécanismes de contrôle d'accès, de facturation et de monitoring.

### 6.2 APIs exposées

| API | Description | Niveau d'accès |
| :--- | :--- | :--- |
| Account Information | Consultation des comptes et soldes | Partenaire certifié |
| Payment Initiation | Initiation de virements | Partenaire certifié + consentement |
| Card Management | Gestion des cartes bancaires | Partenaire premium |
| Customer Data | Données client (KYC) | Partenaire certifié + consentement |

### 6.3 Sécurité renforcée

L'exposition aux partenaires externes nécessite des mesures de sécurité renforcées : authentification mutuelle TLS (mTLS), OAuth2 avec PKCE, consentement utilisateur (SCA - Strong Customer Authentication), rate limiting par partenaire, et audit complet de tous les accès.

---

## 7. Sécurité

### 7.1 Architecture de sécurité

La sécurité est intégrée à chaque couche de l'architecture :

| Couche | Mesure | Technologie |
| :--- | :--- | :--- |
| **Réseau** | Chiffrement TLS 1.3, segmentation réseau | WAF, VPN |
| **API Gateway** | Authentification, rate limiting, IP whitelisting | Kong / Spring Cloud Gateway |
| **Application** | OAuth2/OIDC, JWT, validation des entrées | Spring Security |
| **Données** | Chiffrement au repos et en transit | AES-256, TLS |
| **Audit** | Logging de tous les accès, traçabilité | ELK Stack |

### 7.2 Gestion des secrets

Les secrets (clés API, mots de passe, certificats) sont gérés via un vault centralisé (HashiCorp Vault ou Azure Key Vault). Aucun secret n'est stocké dans le code source ou les fichiers de configuration.

---

## 8. Monitoring et observabilité

### 8.1 Piliers de l'observabilité

**Métriques** : Collecte via Micrometer, stockage dans Prometheus, visualisation dans Grafana. Les métriques clés incluent le temps de réponse (P50, P95, P99), le taux d'erreur, le débit (requêtes/seconde) et l'utilisation des ressources.

**Logs** : Logging structuré (JSON) avec corrélation via trace ID. Centralisation dans ELK Stack (Elasticsearch, Logstash, Kibana) ou Loki.

**Traces** : Traçabilité distribuée via OpenTelemetry, permettant de suivre un appel à travers tous les services impliqués.

### 8.2 Alerting

Des alertes sont configurées pour les seuils critiques :

| Alerte | Seuil | Action |
| :--- | :--- | :--- |
| Temps de réponse P95 | > 500ms | Notification équipe |
| Taux d'erreur 5xx | > 1% | Notification + escalade |
| Disponibilité | < 99.9% | Escalade immédiate |
| Utilisation CPU | > 80% | Auto-scaling |

---

## 9. Gestion des accès

### 9.1 Modèle d'accès

Le modèle d'accès repose sur OAuth2/OIDC avec des scopes granulaires. Chaque API définit ses propres scopes d'accès, et les clients (internes ou externes) doivent obtenir les scopes appropriés pour accéder aux ressources.

### 9.2 Niveaux d'accès

| Niveau | Description | Authentification |
| :--- | :--- | :--- |
| **Interne** | Applications internes de la banque | OAuth2 client credentials |
| **Partenaire** | Partenaires fintech certifiés | OAuth2 + mTLS + consentement |
| **Public** | APIs publiques (informations générales) | API Key + rate limiting |

---

## 10. Scalabilité

### 10.1 Stratégie de scalabilité

L'architecture cible est conçue pour scaler horizontalement. Chaque service API est déployé dans des conteneurs Docker orchestrés par Kubernetes, permettant un auto-scaling basé sur la charge.

### 10.2 Dimensionnement

| Environnement | Instances min | Instances max | CPU/instance | RAM/instance |
| :--- | :---: | :---: | :---: | :---: |
| Développement | 1 | 2 | 0.5 vCPU | 512 MB |
| Recette | 2 | 4 | 1 vCPU | 1 GB |
| Production | 3 | 20 | 2 vCPU | 2 GB |

---

## 11. Gouvernance API

### 11.1 Comité API

Un comité API est constitué, composé de l'architecte en chef, du Product Owner API, d'un représentant de chaque feature team et du RSSI. Ce comité se réunit mensuellement pour valider les nouvelles APIs, les évolutions de standards et les demandes d'accès partenaires.

### 11.2 Cycle de vie des APIs

Chaque API suit un cycle de vie formalisé :

**Draft** : Conception et documentation de l'API (OpenAPI spec).

**Review** : Validation par le comité API (conformité aux standards, sécurité, performance).

**Published** : Déploiement en production, disponible dans le catalogue.

**Deprecated** : Annonce de dépréciation, période de transition de 12 mois.

**Retired** : Désactivation définitive de l'API.

### 11.3 Versioning

Le versioning des APIs suit la convention sémantique :

| Type de changement | Impact | Action |
| :--- | :--- | :--- |
| Ajout de champ optionnel | Non-breaking | Pas de nouvelle version |
| Modification de comportement | Breaking | Nouvelle version majeure |
| Suppression de champ | Breaking | Nouvelle version majeure |
| Ajout d'endpoint | Non-breaking | Pas de nouvelle version |

---

## 12. Planning et budget

### 12.1 Planning global

| Phase | Durée | Début | Fin |
| :--- | :---: | :--- | :--- |
| Phase 1 — POC | 4 semaines | M1 | M1 |
| Phase 2 — Premiers clients API | 8 semaines | M2 | M3 |
| Phase 3 — Migration progressive | 16 semaines | M4 | M7 |
| Phase 4 — Plateforme API interne | 8 semaines | M8 | M9 |
| Phase 5 — Exposition partenaires | 12 semaines | M10 | M12 |

### 12.2 Estimation budgétaire

| Poste | Estimation |
| :--- | :--- |
| Équipe projet (12 mois) | 800K - 1.2M EUR |
| Infrastructure cloud | 150K - 250K EUR/an |
| Licences outils (API Gateway, monitoring) | 50K - 100K EUR/an |
| Formation et accompagnement | 50K - 80K EUR |
| **Total première année** | **1.05M - 1.63M EUR** |

### 12.3 Retour sur investissement

L'économie annuelle estimée sur les licences WebSphere et l'infrastructure legacy est de 500K à 800K EUR. Le ROI est attendu entre 18 et 24 mois après le début du projet.

---

*Plan d'industrialisation rédigé par Hamza NORDINE — EJB Client Modernizer*
