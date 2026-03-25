package com.bank.tools.generator.ai;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Catalogue de toutes les règles du SmartCodeEnhancer.
 * <p>
 * Pour chaque règle identifiée par son ID (R01, R03, R08, etc.),
 * ce catalogue fournit :
 * <ul>
 *   <li>Le nom complet de la règle</li>
 *   <li>La justification détaillée (pourquoi cette règle est importante)</li>
 *   <li>L'action type réalisée (ce qui est concrètement modifié)</li>
 *   <li>La référence normative (OWASP, RFC, Spring Best Practices, etc.)</li>
 * </ul>
 * </p>
 */
public final class RulesCatalog {

    private RulesCatalog() {
        // Utility class
    }

    /**
     * Informations détaillées d'une règle.
     */
    public static class RuleInfo {
        private final String name;
        private final String justification;
        private final String typicalAction;
        private final String reference;

        public RuleInfo(String name, String justification, String typicalAction, String reference) {
            this.name = name;
            this.justification = justification;
            this.typicalAction = typicalAction;
            this.reference = reference;
        }

        public String getName() { return name; }
        public String getJustification() { return justification; }
        public String getTypicalAction() { return typicalAction; }
        public String getReference() { return reference; }
    }

    private static final Map<String, RuleInfo> CATALOG = new LinkedHashMap<>();

    static {
        // ===== CATÉGORIE 1 : CONVENTIONS DE NOMMAGE =====
        CATALOG.put("R01", new RuleInfo(
                "Endpoints en kebab-case",
                "Les URLs REST doivent utiliser le format kebab-case (minuscules, mots séparés par des tirets) "
                        + "pour garantir la lisibilité, la cohérence et la compatibilité avec les standards HTTP. "
                        + "Les URLs sont insensibles à la casse dans la spécification HTTP, mais les conventions "
                        + "REST imposent le kebab-case pour éviter toute ambiguïté.",
                "Transformation du nom de classe EJB (ex: GestionCompteClient) en endpoint kebab-case (ex: /api/gestion-compte-client).",
                "RFC 3986 (URI Syntax), Google API Design Guide, Microsoft REST API Guidelines"
        ));

        CATALOG.put("R03", new RuleInfo(
                "URLs basées sur les ressources (pas de verbes)",
                "Les URLs REST doivent désigner des ressources (noms) et non des actions (verbes). "
                        + "Les verbes HTTP (GET, POST, PUT, DELETE) expriment déjà l'action. "
                        + "Utiliser des verbes dans l'URL (ex: /getClient, /createAccount) est un anti-pattern REST.",
                "Vérification que l'endpoint ne contient pas de verbes comme get, create, delete, update, fetch.",
                "REST Architectural Style (Roy Fielding), Google API Design Guide"
        ));

        CATALOG.put("R08", new RuleInfo(
                "Versioning de l'API via le chemin (/api/v1/)",
                "Le versioning de l'API dans l'URL permet de faire évoluer l'API sans casser les clients existants. "
                        + "Le préfixe /api/v1/ est la convention la plus répandue et la plus simple à implémenter. "
                        + "Cela permet de maintenir plusieurs versions en parallèle pendant les périodes de migration.",
                "Ajout du préfixe /api/ dans le @RequestMapping de base de chaque controller.",
                "Zalando RESTful API Guidelines, Microsoft REST API Guidelines"
        ));

        // ===== CATÉGORIE 2 : MÉTHODES HTTP ET CODES DE STATUT =====
        CATALOG.put("R09", new RuleInfo(
                "Mapping execute() sur POST",
                "La méthode execute() des EJB UseCase correspond à une action métier qui modifie l'état du système. "
                        + "En REST, les opérations qui créent ou modifient des ressources utilisent POST. "
                        + "GET est réservé aux lectures idempotentes sans effet de bord.",
                "Mapping de la méthode execute() de l'EJB sur @PostMapping dans le controller REST.",
                "RFC 7231 (HTTP Semantics), RFC 9110"
        ));

        CATALOG.put("R11", new RuleInfo(
                "Code HTTP adapté au type d'opération",
                "Chaque type d'opération REST doit retourner le code HTTP approprié : "
                        + "200 OK pour les consultations et opérations réussies, "
                        + "201 Created pour les créations de ressources, "
                        + "202 Accepted pour les traitements asynchrones (MDB), "
                        + "204 No Content pour les suppressions. "
                        + "Retourner systématiquement 200 masque la sémantique de l'opération.",
                "Détection automatique du type d'opération (création, suppression, consultation) "
                        + "basée sur le nom de la classe EJB, puis ajustement du code HTTP retourné.",
                "RFC 7231 Section 6 (Response Status Codes), HTTP Semantics RFC 9110"
        ));

        // ===== CATÉGORIE 3 : VALIDATION DES ENTRÉES =====
        CATALOG.put("R19", new RuleInfo(
                "Ajout de @Valid sur @RequestBody",
                "L'annotation @Valid active la validation Bean Validation (JSR 380) sur les objets reçus en entrée. "
                        + "Sans @Valid, les annotations @NotBlank, @Size, @Email sur les champs du DTO sont ignorées, "
                        + "laissant passer des données invalides jusqu'à la couche métier.",
                "Ajout de @Valid devant chaque paramètre @RequestBody dans les méthodes des controllers.",
                "JSR 380 (Bean Validation 2.0), Spring Framework Reference - Validation"
        ));

        CATALOG.put("R19b", new RuleInfo(
                "Dépendance spring-boot-starter-validation",
                "La dépendance spring-boot-starter-validation est nécessaire pour activer la validation "
                        + "Bean Validation dans Spring Boot. Sans cette dépendance, les annotations @Valid, "
                        + "@NotBlank, @Size, etc. n'ont aucun effet.",
                "Ajout de la dépendance spring-boot-starter-validation dans le pom.xml du projet généré.",
                "Spring Boot Reference - Validation"
        ));

        CATALOG.put("R20", new RuleInfo(
                "Annotations de validation sur les champs DTO",
                "Les champs des DTOs d'entrée doivent porter des annotations de validation pour garantir "
                        + "l'intégrité des données dès la couche REST. @NotBlank empêche les chaînes vides, "
                        + "@Size limite la longueur pour prévenir les attaques par dépassement de tampon.",
                "Ajout de @NotBlank (champs obligatoires) et @Size(max=255) sur les champs String des DTOs d'entrée.",
                "JSR 380, OWASP Input Validation Cheat Sheet"
        ));

        CATALOG.put("R21", new RuleInfo(
                "@JsonIgnore en complément de @XmlTransient",
                "Les champs marqués @XmlTransient dans le code EJB original doivent être exclus de la sérialisation "
                        + "JSON également. @JsonIgnore (Jackson) est ajouté en complément de @XmlTransient (JAXB) "
                        + "pour garantir que ces champs sensibles ne sont exposés dans aucun format de sortie. "
                        + "@XmlTransient est conservé pour maintenir la compatibilité avec les systèmes JAXB existants.",
                "Ajout de @JsonIgnore avant @XmlTransient sur chaque champ concerné, "
                        + "avec ajout de l'import com.fasterxml.jackson.annotation.JsonIgnore.",
                "Jackson Documentation, JAXB Specification, OWASP Sensitive Data Exposure"
        ));

        // ===== CATÉGORIE 4 : GESTION DES ERREURS =====
        CATALOG.put("R26", new RuleInfo(
                "GlobalExceptionHandler @ControllerAdvice",
                "Un @ControllerAdvice centralisé intercepte toutes les exceptions non gérées et retourne "
                        + "des réponses d'erreur standardisées (format JSON uniforme). Sans cela, Spring Boot "
                        + "retourne des pages d'erreur HTML par défaut qui exposent des informations techniques.",
                "Vérification de la présence du GlobalExceptionHandler.java dans le package exception.",
                "Spring Framework Reference - Exception Handling, OWASP Error Handling"
        ));

        CATALOG.put("R27", new RuleInfo(
                "Handler MethodArgumentNotValidException (422)",
                "Lorsque la validation @Valid échoue, Spring lève une MethodArgumentNotValidException. "
                        + "Ce handler la capture et retourne un code 422 Unprocessable Entity avec le détail "
                        + "de chaque champ en erreur (nom du champ + message), permettant au client de corriger "
                        + "précisément les données invalides.",
                "Ajout d'un @ExceptionHandler(MethodArgumentNotValidException.class) qui retourne 422 "
                        + "avec un body contenant timestamp, status, error, message et details (liste des champs en erreur).",
                "RFC 4918 Section 11.2 (422 Unprocessable Entity), Spring Validation"
        ));

        CATALOG.put("R28", new RuleInfo(
                "Protection contre l'exposition des stack traces",
                "Les stack traces Java contiennent des informations sensibles (noms de classes internes, "
                        + "versions de frameworks, chemins de fichiers) qui facilitent les attaques. "
                        + "Les réponses d'erreur ne doivent jamais inclure de stack trace en production.",
                "Vérification que le GlobalExceptionHandler ne contient pas d'appel à getStackTrace() "
                        + "dans les réponses d'erreur.",
                "OWASP Error Handling Cheat Sheet, CWE-209 (Information Exposure Through Error Message)"
        ));

        CATALOG.put("R29", new RuleInfo(
                "BusinessException pour les erreurs métier",
                "Les exceptions métier EJB (FwkRollbackException, etc.) doivent être mappées sur une "
                        + "BusinessException REST avec un code HTTP 409 Conflict. Cela distingue clairement "
                        + "les erreurs métier (données incohérentes) des erreurs techniques (500).",
                "Création de la classe BusinessException avec champs status, errorCode et message. "
                        + "Retourne 409 Conflict par défaut.",
                "RFC 7231 Section 6.5.8 (409 Conflict), Domain-Driven Design - Exception Handling"
        ));

        CATALOG.put("R30", new RuleInfo(
                "ServiceUnavailableException pour les erreurs JNDI",
                "Lorsque le service EJB distant est indisponible (NamingException JNDI), l'API REST "
                        + "doit retourner 503 Service Unavailable plutôt que 500. Cela permet au client "
                        + "de distinguer une erreur temporaire (retry possible) d'une erreur permanente.",
                "Création de la classe ServiceUnavailableException. Le GlobalExceptionHandler la mappe sur 503.",
                "RFC 7231 Section 6.6.4 (503 Service Unavailable)"
        ));

        CATALOG.put("R31", new RuleInfo(
                "Erreurs de validation retournées en une seule réponse",
                "Toutes les erreurs de validation doivent être retournées en une seule réponse (pas une par une). "
                        + "Cela évite les allers-retours inutiles entre le client et le serveur et améliore "
                        + "l'expérience utilisateur.",
                "Le champ 'details' dans la réponse 422 contient la liste complète des champs en erreur.",
                "Google API Design Guide - Errors, JSON:API Error Objects"
        ));

        // ===== CATÉGORIE 5 : SÉCURITÉ =====
        CATALOG.put("R32", new RuleInfo(
                "SecurityFilterChain Spring Security",
                "La configuration Spring Security définit les règles d'accès à l'API : mode stateless "
                        + "(pas de session HTTP côté serveur), CSRF désactivé (approprié pour une API REST "
                        + "stateless qui n'utilise pas de cookies), et headers de sécurité activés.",
                "Création de SecurityConfig.java avec SecurityFilterChain configuré en mode stateless, "
                        + "CSRF désactivé, endpoints /api/** accessibles, headers X-Content-Type-Options et X-Frame-Options.",
                "OWASP REST Security Cheat Sheet, Spring Security Reference"
        ));

        CATALOG.put("R32b", new RuleInfo(
                "Dépendance spring-boot-starter-security",
                "La dépendance Spring Security est nécessaire pour activer la protection de l'API. "
                        + "Sans elle, l'API est entièrement ouverte sans aucun contrôle d'accès.",
                "Ajout de la dépendance spring-boot-starter-security dans le pom.xml.",
                "Spring Boot Reference - Security"
        ));

        CATALOG.put("R33", new RuleInfo(
                "Configuration CORS explicite",
                "La politique CORS (Cross-Origin Resource Sharing) contrôle quels domaines peuvent appeler l'API. "
                        + "Ne jamais utiliser le wildcard (*) en production car cela permet à n'importe quel site "
                        + "d'appeler l'API. Les origines autorisées doivent être explicitement listées.",
                "Création de CorsConfig.java avec origines explicites (localhost:3000, localhost:8080), "
                        + "méthodes autorisées (GET, POST, PUT, PATCH, DELETE, OPTIONS), headers autorisés.",
                "OWASP CORS Cheat Sheet, MDN Web Docs - CORS"
        ));

        CATALOG.put("R34", new RuleInfo(
                "Header X-Content-Type-Options: nosniff",
                "Ce header empêche le navigateur de deviner le type MIME d'une réponse (MIME sniffing). "
                        + "Sans ce header, un attaquant pourrait injecter du JavaScript dans un fichier "
                        + "qui serait interprété comme du HTML par le navigateur.",
                "Configuration du header dans SecurityConfig via .contentTypeOptions().",
                "OWASP Secure Headers Project, CWE-16"
        ));

        CATALOG.put("R35", new RuleInfo(
                "Header X-Frame-Options: DENY",
                "Ce header empêche l'affichage de l'API dans une iframe, protégeant contre les attaques "
                        + "de type clickjacking où un attaquant superpose une iframe invisible sur un site légitime.",
                "Configuration du header dans SecurityConfig via .frameOptions(fo -> fo.deny()).",
                "OWASP Clickjacking Defense Cheat Sheet"
        ));

        CATALOG.put("R36", new RuleInfo(
                "Cache-Control: no-store pour les endpoints sensibles",
                "Les réponses contenant des données sensibles (informations bancaires, données personnelles) "
                        + "ne doivent pas être mises en cache par les proxies ou navigateurs.",
                "Recommandation d'ajouter Cache-Control: no-store sur les endpoints sensibles.",
                "RFC 7234 (HTTP Caching), OWASP Caching Cheat Sheet"
        ));

        CATALOG.put("R37", new RuleInfo(
                "@RolesAllowed transformé en @PreAuthorize",
                "Les annotations @RolesAllowed (Java EE) sont transformées en @PreAuthorize (Spring Security) "
                        + "pour contrôler l'accès aux endpoints REST. @PreAuthorize supporte des expressions SpEL "
                        + "plus puissantes que @RolesAllowed (ex: hasRole, hasAnyRole, combinaisons logiques).",
                "Remplacement de @RolesAllowed({\"ADMIN\"}) par @PreAuthorize(\"hasRole('ADMIN')\") "
                        + "sur les classes et méthodes des controllers.",
                "Spring Security Reference - Method Security"
        ));

        CATALOG.put("R40", new RuleInfo(
                "CSRF désactivé pour API stateless",
                "La protection CSRF est conçue pour les applications web avec sessions et cookies. "
                        + "Une API REST stateless utilisant des tokens (JWT, API Key) n'a pas besoin de CSRF "
                        + "car il n'y a pas de cookie de session à exploiter.",
                "Désactivation de CSRF dans SecurityConfig : .csrf(csrf -> csrf.disable()).",
                "OWASP CSRF Prevention Cheat Sheet, Spring Security - CSRF"
        ));

        // ===== CATÉGORIE 6 : RÉSILIENCE =====
        CATALOG.put("R41", new RuleInfo(
                "Circuit breaker sur les appels JNDI",
                "Les appels JNDI vers les EJB distants peuvent échouer ou être lents. Un circuit breaker "
                        + "(pattern Resilience4j) coupe automatiquement les appels après N échecs consécutifs, "
                        + "évitant l'engorgement du système et permettant une récupération gracieuse.",
                "Recommandation d'ajouter @CircuitBreaker sur les méthodes des ServiceAdapters.",
                "Resilience4j Documentation, Martin Fowler - Circuit Breaker Pattern"
        ));

        CATALOG.put("R42", new RuleInfo(
                "Retry avec backoff exponentiel",
                "Les erreurs JNDI transientes (timeout réseau, serveur temporairement surchargé) peuvent "
                        + "être résolues par un retry automatique. Le backoff exponentiel espace les tentatives "
                        + "pour éviter d'aggraver la surcharge du serveur distant.",
                "Recommandation d'ajouter @Retry avec backoff exponentiel sur les appels JNDI.",
                "Resilience4j Retry, AWS Architecture Blog - Exponential Backoff"
        ));

        CATALOG.put("R43", new RuleInfo(
                "Timeout sur les appels JNDI",
                "Les appels JNDI sans timeout peuvent bloquer indéfiniment un thread du serveur. "
                        + "Un timeout explicite garantit que les ressources sont libérées même si le serveur "
                        + "EJB distant ne répond pas.",
                "Recommandation de configurer un timeout sur les connexions JNDI dans les ServiceAdapters.",
                "Java EE Best Practices, Spring @Transactional timeout"
        ));

        CATALOG.put("R46", new RuleInfo(
                "Spring Boot Actuator (health, metrics)",
                "Spring Boot Actuator expose des endpoints de monitoring (/actuator/health, /actuator/metrics) "
                        + "essentiels pour la supervision en production. Le health check est utilisé par les "
                        + "orchestrateurs (Kubernetes, Docker) pour détecter les instances défaillantes.",
                "Ajout de la configuration Actuator dans application.properties : "
                        + "exposition de health, info, metrics avec détails autorisés.",
                "Spring Boot Actuator Reference, 12-Factor App - Admin Processes"
        ));

        CATALOG.put("R46b", new RuleInfo(
                "Dépendance spring-boot-starter-actuator",
                "La dépendance Actuator est nécessaire pour activer les endpoints de monitoring.",
                "Ajout de la dépendance spring-boot-starter-actuator dans le pom.xml.",
                "Spring Boot Reference - Actuator"
        ));

        // ===== CATÉGORIE 7 : OBSERVABILITÉ =====
        CATALOG.put("R48", new RuleInfo(
                "Filtre CorrelationId (X-Request-ID)",
                "Un identifiant de corrélation unique est généré pour chaque requête HTTP et propagé "
                        + "dans tous les logs via le MDC (Mapped Diagnostic Context) de SLF4J. Cela permet "
                        + "de tracer une requête de bout en bout à travers tous les composants du système, "
                        + "facilitant le diagnostic des problèmes en production.",
                "Création du filtre CorrelationIdFilter.java qui génère un UUID, le place dans le MDC "
                        + "et l'ajoute dans le header de réponse X-Request-ID.",
                "OpenTelemetry Specification, 12-Factor App - Logs"
        ));

        CATALOG.put("R49", new RuleInfo(
                "LoggingAspect pour les requêtes/réponses",
                "Un aspect AOP (Aspect-Oriented Programming) intercepte toutes les méthodes des controllers "
                        + "pour logger automatiquement les paramètres d'entrée et le résultat de sortie. "
                        + "Cela fournit une trace complète des appels API sans polluer le code métier.",
                "Vérification de la présence du LoggingAspect.java dans le package logging.",
                "Spring AOP Reference, Structured Logging Best Practices"
        ));

        CATALOG.put("R50", new RuleInfo(
                "Correlation ID dans le pattern de logging",
                "Le pattern de logging est enrichi avec le Correlation ID ([%X{correlationId}]) pour que "
                        + "chaque ligne de log soit associée à la requête HTTP qui l'a générée. "
                        + "Cela est indispensable pour le diagnostic dans un environnement multi-threads.",
                "Ajout de logging.pattern.level et logging.pattern.console avec %X{correlationId} "
                        + "dans application.properties.",
                "SLF4J MDC Documentation, ELK Stack Best Practices"
        ));

        // ===== CATÉGORIE 8 : DOCUMENTATION API =====
        CATALOG.put("R54", new RuleInfo(
                "Dépendance SpringDoc OpenAPI (Swagger UI)",
                "SpringDoc OpenAPI génère automatiquement la documentation interactive de l'API (Swagger UI) "
                        + "à partir des annotations du code. L'interface Swagger UI est accessible à /swagger-ui.html "
                        + "et permet de tester les endpoints directement depuis le navigateur.",
                "Ajout de la dépendance springdoc-openapi-starter-webmvc-ui dans le pom.xml.",
                "OpenAPI Specification 3.0, SpringDoc Documentation"
        ));

        CATALOG.put("R55", new RuleInfo(
                "Annotations OpenAPI (@Operation, @ApiResponses, @Tag)",
                "Les annotations OpenAPI enrichissent la documentation Swagger avec des descriptions "
                        + "précises de chaque endpoint : résumé de l'opération, description détaillée, "
                        + "codes de réponse possibles (201, 400, 422, 500, 503) et regroupement par tag.",
                "Ajout de @Tag sur la classe controller, @Operation et @ApiResponses sur chaque méthode.",
                "OpenAPI Specification 3.0 - Operation Object"
        ));

        // ===== CATÉGORIE 9 : NÉGOCIATION DE CONTENU =====
        CATALOG.put("R59", new RuleInfo(
                "Support JSON par défaut",
                "L'API supporte le format JSON (application/json) par défaut via Spring Boot. "
                        + "Jackson est automatiquement configuré pour la sérialisation/désérialisation.",
                "Aucune action nécessaire : Spring Boot configure Jackson par défaut.",
                "Spring Boot Reference - JSON"
        ));

        CATALOG.put("R60", new RuleInfo(
                "Support XML (annotations JAXB détectées)",
                "Le projet EJB original utilise des annotations JAXB (@XmlRootElement, @XmlElement, etc.). "
                        + "Le support XML est activé pour maintenir la compatibilité avec les systèmes existants.",
                "Détection des annotations JAXB dans les DTOs et activation du support XML.",
                "JAXB Specification, Spring Content Negotiation"
        ));

        CATALOG.put("R61", new RuleInfo(
                "Négociation de contenu par paramètre",
                "La négociation de contenu permet au client de choisir le format de réponse "
                        + "(JSON ou XML) via le paramètre ?format=xml ou le header Accept.",
                "Activation de la négociation de contenu par paramètre dans la configuration Spring.",
                "RFC 7231 Section 5.3 (Content Negotiation)"
        ));

        // ===== CATÉGORIE 10 : STRUCTURE PROJET =====
        CATALOG.put("R63", new RuleInfo(
                "Configuration externalisée",
                "La configuration est externalisée dans application.properties conformément au principe "
                        + "12-Factor App. Les valeurs sensibles (URLs JNDI, credentials) sont injectées "
                        + "via des variables d'environnement en production.",
                "Vérification de la présence du fichier application.properties.",
                "12-Factor App - Config, Spring Boot Externalized Configuration"
        ));

        CATALOG.put("R64", new RuleInfo(
                "Profils Spring (dev/prod)",
                "Les profils Spring permettent d'adapter la configuration selon l'environnement "
                        + "(développement, production) sans modifier le code. Le profil actif est défini "
                        + "par la variable d'environnement SPRING_PROFILES_ACTIVE.",
                "Création de application-dev.properties (logging DEBUG, port 8081) "
                        + "et application-prod.properties (logging INFO, SSL activé, variables d'environnement).",
                "Spring Boot Reference - Profiles, 12-Factor App - Dev/Prod Parity"
        ));

        CATALOG.put("R64b", new RuleInfo(
                "Profil production avec variables d'environnement",
                "Le profil production utilise des variables d'environnement pour toutes les valeurs "
                        + "sensibles (URLs, credentials, ports), conformément aux bonnes pratiques de déploiement.",
                "Création de application-prod.properties avec ${EJB_JNDI_URL}, ${SERVER_PORT}, etc.",
                "12-Factor App - Config"
        ));

        CATALOG.put("R65", new RuleInfo(
                "Dockerfile multi-stage",
                "Le Dockerfile utilise un build multi-stage pour séparer la compilation (image lourde avec JDK) "
                        + "du runtime (image légère avec JRE). L'application tourne sous un utilisateur non-root "
                        + "pour limiter les risques de sécurité.",
                "Création du Dockerfile avec stage builder (eclipse-temurin:21-jdk-alpine) "
                        + "et stage runtime (eclipse-temurin:21-jre-alpine), utilisateur non-root, JVM tuning.",
                "Docker Best Practices, CIS Docker Benchmark"
        ));

        CATALOG.put("R66", new RuleInfo(
                "Docker Compose avec health check",
                "Le fichier docker-compose.yml facilite le déploiement local et l'intégration continue. "
                        + "Le health check vérifie que l'application répond sur /actuator/health.",
                "Création du docker-compose.yml avec service api, ports, variables d'environnement et health check.",
                "Docker Compose Reference, 12-Factor App"
        ));

        // ===== CATÉGORIE 11 : TESTS =====
        CATALOG.put("R69", new RuleInfo(
                "Tests unitaires par controller (@WebMvcTest)",
                "Chaque controller REST dispose d'un test unitaire avec 3 scénarios : "
                        + "requête valide (200/201), requête invalide (400/422), et erreur service (500). "
                        + "@WebMvcTest isole la couche web et @MockBean simule le service adapter.",
                "Création d'une classe de test par controller avec MockMvc, ObjectMapper et MockBean. "
                        + "3 méthodes de test : succès, validation échouée, erreur interne.",
                "Spring Boot Testing Reference, JUnit 5 Documentation"
        ));

        // ===== CATÉGORIE 12 : PERFORMANCE =====
        CATALOG.put("R74", new RuleInfo(
                "Pagination pour les endpoints de type liste",
                "Les endpoints qui retournent des listes doivent supporter la pagination pour éviter "
                        + "de charger des milliers d'enregistrements en mémoire. Les paramètres standard "
                        + "sont page, size et sort.",
                "Recommandation d'implémenter la pagination avec Spring Data Pageable.",
                "Spring Data Reference - Pagination, Google API Design Guide - List Pagination"
        ));

        CATALOG.put("R75", new RuleInfo(
                "Compression gzip des réponses",
                "La compression gzip réduit la taille des réponses HTTP de 60 à 80%, améliorant "
                        + "significativement les temps de réponse sur les réseaux lents. "
                        + "Seules les réponses > 1 Ko sont compressées pour éviter l'overhead sur les petites réponses.",
                "Ajout de server.compression.enabled=true, server.compression.mime-types et "
                        + "server.compression.min-response-size=1024 dans application.properties.",
                "RFC 7230 (HTTP Transfer Coding), Google PageSpeed - Enable Compression"
        ));

        CATALOG.put("R76", new RuleInfo(
                "ETag/If-None-Match pour le caching HTTP",
                "Le mécanisme ETag permet au client de vérifier si une ressource a changé avant de la "
                        + "retélécharger. Si la ressource n'a pas changé, le serveur retourne 304 Not Modified "
                        + "sans body, économisant la bande passante.",
                "Recommandation d'implémenter le support ETag avec ShallowEtagHeaderFilter.",
                "RFC 7232 (Conditional Requests), Spring Web - ShallowEtagHeaderFilter"
        ));
    }

    /**
     * Retourne les informations détaillées d'une règle par son ID.
     *
     * @param ruleId identifiant de la règle (ex: "R01", "R19", etc.)
     * @return les informations de la règle, ou null si non trouvée
     */
    public static RuleInfo get(String ruleId) {
        return CATALOG.get(ruleId);
    }

    /**
     * Retourne le catalogue complet des règles.
     */
    public static Map<String, RuleInfo> getAll() {
        return CATALOG;
    }

    /**
     * Enrichit un Enhancement avec les informations du catalogue.
     * Les champs justification, actionTaken et reference sont remplis
     * si le ruleId est trouvé dans le catalogue.
     *
     * @param enhancement l'amélioration à enrichir
     */
    public static void enrich(EnhancementReport.Enhancement enhancement) {
        if (enhancement == null || enhancement.getRuleId() == null) return;
        RuleInfo info = CATALOG.get(enhancement.getRuleId());
        if (info != null) {
            if (enhancement.getJustification() == null || enhancement.getJustification().isEmpty()) {
                enhancement.setJustification(info.getJustification());
            }
            if (enhancement.getActionTaken() == null || enhancement.getActionTaken().isEmpty()) {
                enhancement.setActionTaken(info.getTypicalAction());
            }
            if (enhancement.getReference() == null || enhancement.getReference().isEmpty()) {
                enhancement.setReference(info.getReference());
            }
        }
    }

    /**
     * Enrichit tous les enhancements d'un rapport avec les informations du catalogue.
     *
     * @param report le rapport à enrichir
     */
    public static void enrichAll(EnhancementReport report) {
        if (report == null) return;
        for (EnhancementReport.Enhancement e : report.getEnhancements()) {
            enrich(e);
        }
    }
}
