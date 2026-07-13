# Project TODO — EJB to REST Tool v2

## Upgrade full-stack
- [x] Resolve merge conflicts (Home.tsx — keep existing design)
- [x] Run pnpm install and pnpm db:push
- [x] Restart dev server and verify

## Backend API — Upload & Parsing
- [x] API endpoint POST /api/upload/ejb — accept ZIP/JAR/WAR uploads
- [x] API endpoint POST /api/upload/json — accept JSON descriptor files
- [x] Parse uploaded EJB projects (extract interfaces, beans, methods, Envelope fields)
- [x] Store parsed project metadata in database (projects table, endpoints table)

## Module 1 — Adapter Generator (WAR WebSphere)
- [x] API endpoint to trigger Adapter generation from parsed EJB project
- [x] Generate WAR module: Resource + Converter + DTOs + CodeMapper + POM
- [x] Java 8 / javax.* / WebSphere compatible output
- [x] ZIP packaging and download endpoint
- [x] Documentation generation (README, DEVELOPER-GUIDE, DEPLOYMENT, ARCHITECTURE)

## Module 2 — Wrapper BIAN Generator (Spring Boot)
- [x] API endpoint to trigger BIAN wrapper generation from JSON descriptors
- [x] Map endpoints to BIAN Service Domains (Card Administration, Payment Order, etc.)
- [x] Generate Spring Boot project: Controller BIAN + Service + ACL Mapper
- [x] Generate Resilience4j configuration (Circuit Breaker, Retry, Bulkhead)
- [x] Generate RestAdapter (HTTP client to call Adapter REST endpoints)
- [x] Generate DTOs BIAN (ApiRequest<T> / ApiResponse<T>)
- [x] Generate OpenAPI/Swagger spec
- [x] Generate Dockerfile
- [x] Generate application.yml with Adapter URLs
- [x] Generate Mermaid sequence diagrams (.mmd per endpoint + overview)
- [x] Generate Postman collection (JSON v2.1 avec variables)
- [x] ZIP packaging and download endpoint
- [x] Documentation generation (README, DEVELOPER-GUIDE, DEPLOYMENT, ARCHITECTURE)

## Frontend — Two-tab IHM
- [x] Onglet "EJB" : upload de projets EJB (ZIP/JAR/WAR) → génère Adapters JAX-RS + Wrappers BIAN
- [x] Onglet "JSON" : upload de fichiers JSON descripteurs → génère Wrappers BIAN Spring Boot
- [x] Replace mock logic with real fetch + tRPC API calls
- [x] Progress step indicators during generation
- [x] Working ZIP download buttons (S3 URLs)
- [x] Results page shows real generated data from DB (tRPC generate.list)

## Database schema
- [x] projects table (id, name, type, status, createdAt)
- [x] endpoints table (id, projectId, operation, method, path, requestFields, responseFields)
- [x] generations table (id, projectId, mode adapter|bian, status, zipPath, createdAt)

## Testing — All 26 projects
- [x] Test Adapter generation on all 26 batch2-flat projects (23/26 success, 3 non-EJB)
- [x] Test BIAN wrapper generation (8 wrappers generated, 135 endpoints, 0 errors)
- [x] Audit generated code quality (Controller, Service, Adapter, DTOs, Dockerfile)
- [x] Handle non-EJB projects gracefully (isNonEjb flag + hint message)
- [x] Verify all 8 BIAN wrappers compile with Maven (mvn compile = 0 errors)
- [x] Fix Lombok @AllArgsConstructor duplicate constructor issue
- [x] Fix duplicate method names from same-named EJB operations (V2 suffix)
- [x] E2E test via web API: 23/26 projects succeed (3 are Spring, not EJB)
- [x] BIAN generation via tRPC: payment-order-wrapper generated with S3 ZIP URL

## Corrections Audit — Objectif 9.5/10

### P0 — Critiques
- [x] BIAN: Fix RestTemplate.put() → utiliser exchange() pour PUT/DELETE
- [x] BIAN: Ajouter Spring Security config (Keycloak OAuth2, dev=libre, prod=JWT)
- [x] BIAN: Implémenter BianAclMapper avec méthodes de mapping réelles
- [x] Adapter: @EJB déjà en place (confirmé par audit du code Java)

### P1 — Importants
- [x] BIAN: Ajouter TimeLimiter dans Resilience4j config
- [x] BIAN: Ajouter GlobalExceptionHandler (@ControllerAdvice)
- [x] BIAN: Séparer instances Resilience4j par adapter backend
- [x] BIAN: Ajouter CORS configuration (WebMvcConfigurer)
- [x] BIAN: Extraire interface pour RestAdapter (testabilité + SOLID-D)
- [x] Adapter: @Produces/@Consumes déjà au niveau classe (confirmé par audit)

### P2 — Améliorations
- [x] BIAN: Ajouter profil mock (MockAdapter avec @Profile("mock"))
- [x] Adapter: Ajouter Bean Validation (@Valid, @NotNull)
- [x] Adapter: Ajouter Logger SLF4J (log.info/log.error dans chaque Resource)
- [x] BIAN: Ajouter rate limiting (Resilience4j rateLimiter par adapter)
- [x] Postman: Ajouter auth headers + test scripts (76/76 items avec tests)
- [x] OpenAPI: Ajouter securitySchemes bearerAuth
- [x] Mermaid: Diagrammes de séquence complets avec tous les participants

## Tests de Contrat Pact
- [x] Ajouter dépendances Pact (pact-jvm-consumer-junit5, pact-jvm-provider-junit5) au POM généré
- [x] Générer Pact Consumer Tests (wrapper = consumer, adapter = provider)
- [x] Générer Pact Provider Verification Tests
- [x] Configurer Pact Broker URL externalisée dans application.yml
- [x] Vérifier compilation Maven avec les tests Pact (8/8 wrappers OK)
- [x] Corriger Consumer Tests : un fichier par adapter provider (pas un seul provider pour tout le wrapper)
- [x] Corriger Provider Verification Tests : @PactFolder("target/pacts") + @State avec MockAdapter
- [x] Vérifier compilation Maven avec les nouveaux tests multi-adapter (8/8 OK, 44+44=88 fichiers Pact)

## Corrections Audit Utilisateur v2 — Objectif 9.7/10

### Bloquant
- [x] DTOs imbriqués : supporter les objets/listes nested dans le descripteur JSON (générer classes DTO enfants)
- [x] CORS : remplacer allowedOrigins("*") + allowCredentials(true) par allowedOriginPatterns("*")

### Important
- [x] URL backend : permettre de renseigner l'URL complète par EJB (pas de port/suffixe en dur)
- [x] Sous-packages par EJB : un controller + service par adapter dans les wrappers multi-EJB
- [x] Préfixe complet : utiliser le nom complet de l'adapter (pas seulement 2 segments)
- [x] Domaine BIAN configurable : permettre la sélection manuelle du domaine et du nom de service

### Améliorations
- [x] Logs : niveau INFO par défaut (pas DEBUG)
- [x] Port : configurable via SERVER_PORT env variable (default 8081)
- [x] Java identifiers : fix noms commençant par un chiffre (3dsecure → ThreeDSecure)

## Audit Final 10/10

### Générateur Adapter
- [x] Ajouter JavaDoc exhaustif dans le code Java généré (classes, méthodes, champs)
- [x] Ajouter security headers (X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security)
- [x] Ajouter input validation/sanitization (InputSanitizer avec protection XSS)
- [x] Ajouter commentaires explicatifs pour montée en compétence des développeurs
- [x] Tests E2E complets du générateur Adapter (7 tests vitest)

### Générateur BIAN
- [x] Ajouter JavaDoc exhaustif dans le code Java généré (classes, méthodes, champs)
- [x] Ajouter SecurityHeadersFilter (8 headers de protection)
- [x] Ajouter RequestLoggingFilter (correlation ID X-Request-Id)
- [x] Ajouter commentaires explicatifs en français pour montée en compétence
- [x] Tests E2E complets du générateur BIAN (22 tests intégration)

### Qualité globale
- [x] Compilation Maven 2/2 wrappers + adapter WAR (test-compile OK)
- [x] 47 vitest passent (4 fichiers : auth + BIAN unit + BIAN integration + Adapter)
- [x] Audit final output : chaque fichier généré est commenté et sécurisé
- [x] Type 'number' mappé vers BigDecimal (fix compilation)
- [x] Push Git final (ed773fa)

## Améliorations IHM + Présentation

- [x] Ajouter champs de saisie manuelle backendUrl et serviceDomain dans l'IHM (par fichier JSON uploadé)
- [x] Ajouter aperçu des DTOs imbriqués détectés avant génération
- [x] Mettre à jour la présentation BOA avec les vrais chiffres (700 JH adapters + 550 JH wrappers = 1250 JH)

## Bug Fix — Bouton Télécharger ZIP

- [x] Fix bouton Télécharger ZIP qui disparaît quand storagePut échoue
- [x] Implémenter endpoint fallback local /api/download/:id (Express Router)
- [x] Appliquer le fallback dans le routeur BIAN (try storagePut → catch → registerLocalDownload)
- [x] Appliquer le fallback dans le routeur Adapter (même pattern)
- [x] Appliquer le fallback dans le routeur AdapterFromUpload (même pattern)
- [x] Frontend : afficher le bouton Télécharger ZIP même en mode fallback local (badge jaune "téléchargement local")
- [x] 47 tests vitest passent après la correction

## Bug Fix — JAR path introuvable en déploiement

- [x] Bundler le JAR jaxrs-wrapper-generator dans server/lib/ (inclus dans le projet)
- [x] Rendre le chemin JAR configurable : env JAXRS_GENERATOR_JAR > bundled > sandbox dev path
- [x] 47 tests vitest passent après la correction
