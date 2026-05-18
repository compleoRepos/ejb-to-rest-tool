# Catalogue des Règles d'Analyse — Compleo v4.0

> **Auteur :** Compleo  
> **Version :** 1.0.0  
> **Total des règles :** 816 règles uniques réparties en 20 catégories  
> **Dernière mise à jour :** 2026-04-08

---

## Vue d'ensemble

Le moteur d'intelligence de Compleo embarque **816 règles d'analyse statique** organisées en **20 catégories**. Chaque règle est évaluée automatiquement lors de l'analyse d'un projet Java legacy et produit des recommandations de modernisation.

### Répartition par sévérité

| Sévérité | Description | Action requise |
|----------|-------------|----------------|
| **critical** | Bloquant pour la migration — risque de perte de données ou de sécurité | Correction obligatoire avant migration |
| **major** | Impact significatif sur la qualité ou la maintenabilité | Correction fortement recommandée |
| **minor** | Amélioration de la qualité du code | Correction optionnelle |
| **info** | Information contextuelle | Aucune action requise |

---

## 1. Architecture (ARCH)

**Fichiers :** `ArchitectureRules.ts`, `ArchitectureExtendedRules.ts`  
**Nombre de règles :** ~43 règles

### 1.1 Couplage et structure (ARCH_COUP)

| ID | Nom | Sévérité | Description |
|----|-----|----------|-------------|
| ARCH_COUP_001 | Import circulaire | major | Détecte les imports circulaires entre packages |
| ARCH_COUP_002 | God class | critical | Classe avec trop de responsabilités (>500 lignes, >20 méthodes) |
| ARCH_COUP_003 | Service dans Entity | critical | Injection de service dans une entité JPA |
| ARCH_COUP_004 | DAO dans Controller | major | Accès direct au DAO depuis un contrôleur |
| ARCH_COUP_005 | Static utility abuse | minor | Surutilisation de méthodes statiques |
| ARCH_COUP_006 | Concrete dependency | major | Dépendance sur une implémentation concrète |
| ARCH_COUP_007 | Feature envy | minor | Méthode qui utilise plus de données d'une autre classe |
| ARCH_COUP_008 | Law of Demeter | minor | Violation de la loi de Déméter (chaînes d'appels) |
| ARCH_COUP_009 | Package cycle | major | Cycle de dépendances entre packages |
| ARCH_COUP_010 | Anemic domain | minor | Modèle de domaine anémique (entités sans logique) |

### 1.2 Nommage (ARCH_NAME)

| ID | Nom | Sévérité | Description |
|----|-----|----------|-------------|
| ARCH_NAME_001 | Classe mal nommée | minor | Nom de classe ne respectant pas les conventions |
| ARCH_NAME_002 | Méthode trop générique | minor | Nom de méthode comme `process()`, `handle()` |
| ARCH_NAME_003 | Variable single letter | minor | Variable nommée avec une seule lettre |
| ARCH_NAME_004 | Boolean sans prefix | minor | Booléen sans préfixe `is`/`has`/`can` |
| ARCH_NAME_005 | Constante non UPPER_CASE | minor | Constante ne respectant pas la convention |

### 1.3 Complexité (ARCH_CMPLX)

15 règles couvrant la complexité cyclomatique, la profondeur d'imbrication, le nombre de paramètres, la taille des méthodes et des classes.

### 1.4 Règles générales (ARCH-001 à ARCH-008)

8 règles de haut niveau : God Class, couplage direct, logique dans le contrôleur, convention de nommage, dépendance circulaire, état statique mutable, exception générique, violation de couche.

---

## 2. Sécurité (SEC)

**Fichiers :** `SecurityRules.ts`, `SecurityExtendedRules.ts`  
**Nombre de règles :** ~40 règles

### 2.1 Injection (SEC_INJ)

| ID | Nom | Sévérité | Description |
|----|-----|----------|-------------|
| SEC_INJ_001 | SQL Injection | critical | Concaténation de chaînes dans les requêtes SQL |
| SEC_INJ_002 | LDAP Injection | critical | Entrée non validée dans les requêtes LDAP |
| SEC_INJ_003 | XSS | critical | Sortie non échappée dans les réponses HTTP |
| SEC_INJ_004 | Command Injection | critical | Exécution de commandes système avec entrée utilisateur |
| SEC_INJ_005 | Path Traversal | critical | Accès fichier avec chemin non validé |
| SEC_INJ_006 | XML External Entity | critical | Parsing XML sans désactivation des entités externes |
| SEC_INJ_007 | Deserialization | critical | Désérialisation d'objets non fiables |
| SEC_INJ_008 | Expression Language | major | Injection dans les expressions EL/JSTL |
| SEC_INJ_009 | Header Injection | major | Injection dans les headers HTTP |
| SEC_INJ_010 | Log Injection | major | Entrée non sanitisée dans les logs |

### 2.2 Authentification (SEC_AUTH)

| ID | Nom | Sévérité | Description |
|----|-----|----------|-------------|
| SEC_AUTH_001 | Mot de passe en clair | critical | Mot de passe stocké sans hachage |
| SEC_AUTH_002 | Session fixation | critical | Session non régénérée après login |
| SEC_AUTH_003 | Cookie insecure | major | Cookie sans flag Secure/HttpOnly |
| SEC_AUTH_004 | CORS permissif | major | `Access-Control-Allow-Origin: *` |
| SEC_AUTH_005 | CSRF absent | major | Pas de protection CSRF sur les formulaires |

### 2.3 Règles générales (SEC-001 à SEC-010)

10 règles de haut niveau couvrant les patterns de sécurité Java EE classiques.

---

## 3. Finance (FIN)

**Fichiers :** `FinancialRules.ts`, `FinancialExtendedRules.ts`  
**Nombre de règles :** ~25 règles

| ID | Nom | Sévérité | Description |
|----|-----|----------|-------------|
| FIN-001 | Double pour montant | critical | Utilisation de `double`/`float` pour des montants financiers |
| FIN-002 | Arrondi incorrect | critical | Arrondi sans `RoundingMode` explicite |
| FIN-003 | Division entière | major | Division entière pouvant perdre la précision |
| FIN-004 | Devise absente | major | Montant sans devise associée |
| FIN-005 | Calcul non auditable | major | Calcul financier sans trace d'audit |
| FIN_EXT_001–020 | Règles étendues | varié | Validation IBAN, calcul de taux, conformité PCI |

---

## 4. Performance (PERF)

**Fichiers :** `PerformanceRules.ts`, `PerformanceExtendedRules.ts`  
**Nombre de règles :** ~53 règles

### 4.1 N+1 Queries (PERF_NQ)

15 règles détectant les problèmes de requêtes N+1 dans les boucles, les relations JPA mal configurées et les chargements paresseux non optimisés.

### 4.2 Mémoire (PERF_MEM)

15 règles couvrant les fuites mémoire, les caches non bornés, les streams non fermés et les allocations excessives.

### 4.3 Concurrence (PERF_CONC)

15 règles sur les problèmes de concurrence liés à la performance : synchronisation excessive, contention de verrous, pools de threads mal dimensionnés.

### 4.4 Règles générales (PERF-001 à PERF-008)

| ID | Nom | Sévérité | Description |
|----|-----|----------|-------------|
| PERF-001 | Requête N+1 | HIGH | Requête en boucle sans batch/join fetch |
| PERF-002 | Cache absent | MEDIUM | Données de référence sans cache |
| PERF-003 | String concatenation | LOW | Concaténation de chaînes en boucle |
| PERF-004 | Eager loading excessif | MEDIUM | `@ManyToMany`/`@OneToMany` en EAGER |

---

## 5. Concurrence (CONC)

**Fichier :** `ConcurrencyRules.ts`  
**Nombre de règles :** ~35 règles

| Préfixe | Sous-catégorie | Nombre |
|---------|---------------|--------|
| CONC_SYNC | Synchronisation | 10 |
| CONC_ATOM | Atomicité | 10 |
| CONC_DEAD | Deadlock | 10 |
| CONC_POOL | Thread pools | 5 |

Exemples de règles critiques :

| ID | Nom | Sévérité |
|----|-----|----------|
| CONC_SYNC_001 | Synchronized sur this | major |
| CONC_ATOM_001 | Check-then-act non atomique | critical |
| CONC_DEAD_001 | Lock ordering inconsistant | critical |

---

## 6. Base de données (DB)

**Fichier :** `DatabaseRules.ts`  
**Nombre de règles :** ~40 règles

### 6.1 Schéma (DB_SCH)

| ID | Nom | Sévérité | Description |
|----|-----|----------|-------------|
| DB_SCH_001 | Table sans PK | critical | Table sans clé primaire |
| DB_SCH_002 | FK absente | major | Relation sans foreign key |
| DB_SCH_003 | Index manquant | major | Colonne fréquemment requêtée sans index |

### 6.2 Requêtes (DB_QRY)

20 règles couvrant les requêtes SQL non optimisées, les `SELECT *`, les jointures cartésiennes et les sous-requêtes corrélées.

---

## 7. Jakarta EE / EJB (JAK)

**Fichiers :** `JakartaRules.ts`, `JakartaExtendedRules.ts`  
**Nombre de règles :** ~21 règles

| ID | Nom | Sévérité | Description |
|----|-----|----------|-------------|
| JAK_EJB_001 | @Stateful inutile | major | Session bean stateful sans état réel |
| JAK_EJB_002 | @Remote inutile | major | Interface Remote sans appel distant |
| JAK_EJB_003 | JNDI lookup | major | Lookup JNDI au lieu de @Inject |
| JAK-001 | @Stateless → @Service | HIGH | Migration EJB vers Spring |
| JAK-002 | @EJB → @Autowired | MEDIUM | Migration injection de dépendances |

---

## 8. Spring Migration (SPR)

**Fichier :** `SpringMigrationRules.ts`  
**Nombre de règles :** ~40 règles

### 8.1 Spring Boot (SPR_BOOT)

25 règles de migration vers Spring Boot : configuration, auto-configuration, profils, actuator, starters.

### 8.2 Spring Cloud (SPR_CLD)

15 règles de migration vers Spring Cloud : service discovery, circuit breaker, config server, gateway.

---

## 9. Cloud Native (CLOUD)

**Fichier :** `CloudNativeRules.ts`  
**Nombre de règles :** ~45 règles

### 9.1 Twelve-Factor App (CLOUD_12F)

15 règles basées sur la méthodologie Twelve-Factor : configuration externalisée, ports, logs, processus stateless.

### 9.2 Conteneurisation (CLOUD_CTR)

15 règles pour la conteneurisation : health checks, graceful shutdown, signaux, volumes.

### 9.3 Kubernetes (CLOUD_K8S)

15 règles pour Kubernetes : probes, resource limits, secrets, ConfigMaps.

---

## 10. Qualité du code (CQ)

**Fichier :** `CodeQualityRules.ts`  
**Nombre de règles :** ~30 règles

### 10.1 Clean Code (CQ_CLEAN)

20 règles basées sur les principes Clean Code : méthodes courtes, noms expressifs, pas de commentaires inutiles.

### 10.2 SOLID (CQ_SOLID)

15 règles vérifiant les principes SOLID : SRP, OCP, LSP, ISP, DIP.

---

## 11. Gestion des erreurs (ERR)

**Fichier :** `ErrorHandlingRules.ts`  
**Nombre de règles :** ~35 règles

Couvre les patterns d'erreurs : catch vide, exception générique, swallowed exceptions, error codes vs exceptions, retry patterns.

---

## 12. Tests (TEST)

**Fichier :** `TestingRules.ts`  
**Nombre de règles :** ~40 règles

### 12.1 Qualité des tests (TEST_QUAL)

20 règles : assertions significatives, tests indépendants, nommage, mocking approprié.

### 12.2 Couverture (TEST_COV)

20 règles : couverture minimale, branches critiques, tests d'intégration, tests de régression.

---

## 13. Logging (LOG)

**Fichier :** `LoggingRules.ts`  
**Nombre de règles :** ~30 règles

### 13.1 Bonnes pratiques (LOG_BP)

15 règles : niveaux de log appropriés, messages structurés, pas de `System.out.println`.

### 13.2 Sécurité des logs (LOG_SEC)

15 règles : pas de données sensibles dans les logs, sanitisation, rotation.

---

## 14. Observabilité (OBS)

**Fichier :** `ObservabilityRules.ts`  
**Nombre de règles :** ~30 règles

Métriques, tracing distribué, health checks, alerting, dashboards.

---

## 15. Résilience (RES)

**Fichier :** `ResilienceRules.ts`  
**Nombre de règles :** ~30 règles

### 15.1 Circuit Breaker (RES_CB)

15 règles : patterns de circuit breaker, fallback, bulkhead.

### 15.2 Gestion des erreurs réseau (RES_ERR)

20 règles : retry, timeout, backoff, dead letter queue.

---

## 16. API Design (API)

**Fichier :** `ApiDesignRules.ts`  
**Nombre de règles :** ~35 règles

### 16.1 REST (API_REST)

20 règles : conventions REST, codes HTTP, pagination, versioning.

### 16.2 DTO (API_DTO)

15 règles : séparation DTO/Entity, validation, mapping.

---

## 17. Dépendances (DEP)

**Fichier :** `DependencyRules.ts`  
**Nombre de règles :** ~30 règles

Dépendances obsolètes, vulnérabilités connues, conflits de versions, dépendances transitives.

---

## 18. Internationalisation (I18N)

**Fichier :** `I18nRules.ts`  
**Nombre de règles :** ~30 règles

Chaînes en dur, encodage, locale, formats de date/nombre, ResourceBundle.

---

## 19. Apprentissage (Learning Rules)

**Fichier :** `server/learning/seeds/global-rules.ts`  
**Nombre de règles seed :** 60 règles globales

Les règles d'apprentissage sont dynamiques et évoluent avec l'utilisation :

| Type de règle | Description | Nombre seed |
|---------------|-------------|:-----------:|
| NAMING_CONVENTION | Conventions de nommage Spring | 10 |
| SCOPE_UNCLEAR | Extraction de microservices | 8 |
| DEPENDENCY_REPLACEMENT | Remplacement de dépendances | 12 |
| TRANSACTION_BOUNDARY | Gestion des transactions | 10 |
| TRANSACTION_AMBIGUOUS | Transactions ambiguës | 8 |
| SECURITY_PATTERN | Patterns de sécurité | 6 |
| PERFORMANCE_PATTERN | Patterns de performance | 6 |

---

## Annexe — Statistiques globales

| Catégorie | Fichier(s) | Règles |
|-----------|-----------|:------:|
| Architecture | ArchitectureRules + Extended | ~43 |
| Sécurité | SecurityRules + Extended | ~40 |
| Finance | FinancialRules + Extended | ~25 |
| Performance | PerformanceRules + Extended | ~53 |
| Concurrence | ConcurrencyRules | ~35 |
| Base de données | DatabaseRules | ~40 |
| Jakarta EE | JakartaRules + Extended | ~21 |
| Spring Migration | SpringMigrationRules | ~40 |
| Cloud Native | CloudNativeRules | ~45 |
| Qualité du code | CodeQualityRules | ~30 |
| Gestion des erreurs | ErrorHandlingRules | ~35 |
| Tests | TestingRules | ~40 |
| Logging | LoggingRules | ~30 |
| Observabilité | ObservabilityRules | ~30 |
| Résilience | ResilienceRules | ~30 |
| API Design | ApiDesignRules | ~35 |
| Dépendances | DependencyRules | ~30 |
| Internationalisation | I18nRules | ~30 |
| **Total** | **24 fichiers** | **~816** |
