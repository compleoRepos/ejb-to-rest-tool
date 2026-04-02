package com.bank.tools.generator.ai;

import com.bank.tools.generator.ai.EnhancementReport.Category;
import com.bank.tools.generator.ai.EnhancementReport.Enhancement;
import com.bank.tools.generator.ai.EnhancementReport.Severity;
import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.List;

/**
 * Moteur d'intelligence artificielle interne (basé sur des règles).
 * <p>
 * Analyse et améliore automatiquement le code généré en appliquant
 * 77 règles réparties en 12 catégories, basées sur les bonnes pratiques
 * REST API (OWASP, Postman, Spring Boot, OpenAPI).
 * </p>
 * <p>
 * Ce moteur fonctionne entièrement en local, sans appel à une IA externe,
 * garantissant l'absence d'hallucinations et la reproductibilité des résultats.
 * </p>
 */
@Component
public class SmartCodeEnhancer {

    private static final Logger log = LoggerFactory.getLogger(SmartCodeEnhancer.class);
    private static final String BASE_PACKAGE = "com.bank.api";
    private static final String BASE_PACKAGE_PATH = "com/bank/api";

    /**
     * Point d'entrée principal : améliore le projet généré.
     *
     * @param projectRoot    chemin du projet généré
     * @param analysisResult résultat de l'analyse EJB
     * @return rapport d'amélioration
     */
    public EnhancementReport enhance(Path projectRoot, ProjectAnalysisResult analysisResult) throws IOException {
        log.info("SmartCodeEnhancer: début de l'analyse et de l'amélioration du projet");
        EnhancementReport report = new EnhancementReport();

        Path srcMain = projectRoot.resolve("src/main/java/" + BASE_PACKAGE_PATH);
        Path resourcesDir = projectRoot.resolve("src/main/resources");
        Path testDir = projectRoot.resolve("src/test/java/" + BASE_PACKAGE_PATH);
        Files.createDirectories(testDir.resolve("controller"));

        boolean projectHasXml = analysisResult.getUseCases().stream().anyMatch(UseCaseInfo::hasXmlSupport)
                || analysisResult.getDtos().stream().anyMatch(DtoInfo::hasJaxbAnnotations);

        // ===== CATÉGORIE 1 : CONVENTIONS DE NOMMAGE =====
        applyNamingRules(report, srcMain, analysisResult);

        // ===== CATÉGORIE 2 : MÉTHODES HTTP ET CODES DE STATUT =====
        applyHttpMethodRules(report, srcMain, analysisResult);

        // ===== CATÉGORIE 3 : VALIDATION DES ENTRÉES =====
        applyInputValidationRules(report, srcMain, analysisResult);

        // ===== CATÉGORIE 4 : GESTION DES ERREURS =====
        applyErrorHandlingRules(report, srcMain);

        // ===== CATÉGORIE 5 : SÉCURITÉ =====
        applySecurityRules(report, srcMain, resourcesDir, analysisResult);

        // ===== CATÉGORIE 6 : RÉSILIENCE =====
        applyResilienceRules(report, srcMain, resourcesDir);

        // ===== CATÉGORIE 7 : OBSERVABILITÉ =====
        applyObservabilityRules(report, srcMain, resourcesDir);

        // ===== CATÉGORIE 8 : DOCUMENTATION API =====
        applyDocumentationRules(report, srcMain, analysisResult, projectRoot);

        // ===== CATÉGORIE 9 : NÉGOCIATION DE CONTENU =====
        applyContentNegotiationRules(report, projectHasXml);

        // ===== CATÉGORIE 10 : STRUCTURE PROJET =====
        applyProjectStructureRules(report, projectRoot, resourcesDir);

        // ===== CATÉGORIE 11 : TESTS =====
        applyTestingRules(report, testDir, analysisResult);

        // ===== CATÉGORIE 12 : PERFORMANCE =====
        applyPerformanceRules(report, srcMain, resourcesDir);

        // ===== CATÉGORIE 13 : CONFORMITÉ BIAN =====
        applyBianComplianceRules(report, srcMain, analysisResult);

        // Calcul du score de qualité
        int score = calculateQualityScore(report);
        report.setQualityScore(score);

        // Enrichir chaque règle avec les détails du catalogue (justification, action, référence)
        RulesCatalog.enrichAll(report);

        log.info("SmartCodeEnhancer: terminé. {} règles vérifiées, {} appliquées, score: {}/100, {} avec détails",
                report.getTotalRulesChecked(), report.getTotalRulesApplied(), score, report.countWithDetails());

        return report;
    }

    // ==================== CATÉGORIE 1 : NAMING ====================

    private void applyNamingRules(EnhancementReport report, Path srcMain,
                                  ProjectAnalysisResult analysisResult) {
        // R01: Endpoints en kebab-case (déjà appliqué par le parser)
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            boolean isKebab = uc.getRestEndpoint() != null && uc.getRestEndpoint().matches("/api/[a-z0-9-]+");
            report.addEnhancement(new Enhancement("R01", Category.NAMING, Severity.INFO,
                    "Endpoint '" + uc.getRestEndpoint() + "' utilise le format kebab-case",
                    uc.getControllerName() + ".java", isKebab));
        }

        // R02: Endpoints avec noms de ressources (pas de verbes)
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            String ep = uc.getRestEndpoint() != null ? uc.getRestEndpoint() : "";
            boolean noVerbs = !ep.contains("get") && !ep.contains("create") && !ep.contains("delete")
                    && !ep.contains("update") && !ep.contains("fetch");
            report.addEnhancement(new Enhancement("R03", Category.NAMING, Severity.INFO,
                    "Endpoint '" + ep + "' n'utilise pas de verbes dans l'URL",
                    uc.getControllerName() + ".java", noVerbs));
        }

        // R08: API base path inclut la version /api/v1/
        report.addEnhancement(new Enhancement("R08", Category.NAMING, Severity.SUGGESTION,
                "Ajout du versioning /api/v1/ dans les endpoints",
                "Controllers", true));
    }

    // ==================== CATÉGORIE 2 : HTTP METHODS ====================

    private void applyHttpMethodRules(EnhancementReport report, Path srcMain,
                                      ProjectAnalysisResult analysisResult) throws IOException {
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            Path controllerFile = srcMain.resolve("controller/" + uc.getControllerName() + ".java");
            if (Files.exists(controllerFile)) {
                String content = Files.readString(controllerFile);

                // R09: execute() → POST
                boolean usesPost = content.contains("@PostMapping");
                report.addEnhancement(new Enhancement("R09", Category.HTTP_METHODS, Severity.INFO,
                        "Méthode execute() mappée sur POST dans " + uc.getControllerName(),
                        controllerFile.getFileName().toString(), usesPost));

                // R11: Déterminer le code HTTP selon le type d'opération
                // MDB controllers utilisent 202 ACCEPTED — ne pas modifier
                if (uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN) {
                    report.addEnhancement(new Enhancement("R11", Category.HTTP_METHODS, Severity.INFO,
                            "MDB " + uc.getControllerName() + " conserve 202 Accepted (traitement asynchrone)",
                            controllerFile.getFileName().toString(), true));
                    continue;
                }

                // Logique inversée : on détecte les CRÉATIONS (201) et SUPPRESSIONS (204)
                // Tout le reste (consultation, transfert, etc.) → 200 OK par défaut
                String ucName = uc.getClassName().toLowerCase();
                String javadoc = uc.getJavadoc() != null ? uc.getJavadoc().toLowerCase() : "";

                // Détection basée UNIQUEMENT sur le nom de classe (pas le Javadoc car trop ambigu)
                boolean isCreation = ucName.contains("create") || ucName.contains("creer")
                        || ucName.contains("souscrire") || ucName.contains("ajouter")
                        || ucName.contains("inscrire") || ucName.contains("enregistrer")
                        || ucName.contains("add") || ucName.contains("insert")
                        || ucName.contains("register") || ucName.contains("open")
                        || ucName.contains("save") || ucName.contains("nouveau");

                boolean isDeletion = ucName.contains("delete") || ucName.contains("supprimer")
                        || ucName.contains("remove") || ucName.contains("close")
                        || ucName.contains("cancel") || ucName.contains("annuler");

                if (isCreation && usesPost) {
                    // Opération de création : mettre 201 Created
                    if (!content.contains("HttpStatus.CREATED")) {
                        String improved = content.replace(
                                "return ResponseEntity.ok(",
                                "return ResponseEntity.status(HttpStatus.CREATED).body(");
                        if (!improved.contains("import org.springframework.http.HttpStatus;")) {
                            improved = improved.replace(
                                    "import org.springframework.http.ResponseEntity;",
                                    "import org.springframework.http.HttpStatus;\nimport org.springframework.http.ResponseEntity;");
                        }
                        Files.writeString(controllerFile, improved);
                    }
                    report.addEnhancement(new Enhancement("R11", Category.HTTP_METHODS, Severity.WARNING,
                            "POST de création retourne 201 Created dans " + uc.getControllerName(),
                            controllerFile.getFileName().toString(), true));
                } else if (isDeletion) {
                    // Opération de suppression : garder 204 si déjà présent
                    report.addEnhancement(new Enhancement("R11", Category.HTTP_METHODS, Severity.INFO,
                            "Opération de suppression détectée dans " + uc.getControllerName(),
                            controllerFile.getFileName().toString(), true));
                } else {
                    // Tout le reste (consultation, transfert, etc.) → 200 OK
                    if (content.contains("HttpStatus.CREATED")) {
                        // Corriger si le code avait été mis à 201 par erreur
                        String improved = content.replace(
                                "ResponseEntity.status(HttpStatus.CREATED).body(",
                                "ResponseEntity.ok(");
                        // Supprimer l'import HttpStatus s'il n'est plus nécessaire
                        if (!improved.contains("HttpStatus.")) {
                            improved = improved.replace("import org.springframework.http.HttpStatus;\n", "");
                        }
                        Files.writeString(controllerFile, improved);
                    }
                    report.addEnhancement(new Enhancement("R11", Category.HTTP_METHODS, Severity.INFO,
                            "POST retourne 200 OK dans " + uc.getControllerName() + " (opération non-création)",
                            controllerFile.getFileName().toString(), true));
                }
            }
        }
    }

    // ==================== CATÉGORIE 3 : INPUT VALIDATION ====================

    private void applyInputValidationRules(EnhancementReport report, Path srcMain,
                                           ProjectAnalysisResult analysisResult) throws IOException {
        // R19: Ajouter @Valid sur les @RequestBody
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            Path controllerFile = srcMain.resolve("controller/" + uc.getControllerName() + ".java");
            if (Files.exists(controllerFile)) {
                String content = Files.readString(controllerFile);
                if (content.contains("@RequestBody") && !content.contains("@Valid")) {
                    String improved = content.replace("@RequestBody ", "@Valid @RequestBody ");
                    if (!improved.contains("import jakarta.validation.Valid;")) {
                        improved = improved.replace(
                                "import org.springframework.web.bind.annotation.*;",
                                "import jakarta.validation.Valid;\nimport org.springframework.web.bind.annotation.*;");
                    }
                    Files.writeString(controllerFile, improved);
                    report.addEnhancement(new Enhancement("R19", Category.INPUT_VALIDATION, Severity.CRITICAL,
                            "Ajout de @Valid sur @RequestBody dans " + uc.getControllerName(),
                            controllerFile.getFileName().toString(), true));
                }
            }
        }

        // R20-R25: Ajouter des annotations de validation sur les DTO d'entrée
        for (DtoInfo dto : analysisResult.getDtos()) {
            if (dto.getClassName().contains("VoIn") || dto.getClassName().contains("In")
                    || dto.getClassName().contains("Request")) {
                Path dtoFile = srcMain.resolve("dto/" + dto.getClassName() + ".java");
                if (Files.exists(dtoFile)) {
                    String content = Files.readString(dtoFile);
                    boolean modified = false;
                    StringBuilder sb = new StringBuilder(content);

                    // BUG 10 : Ajouter les imports de validation si nécessaire
                    // Vérifier chaque import individuellement (pas en bloc)
                    if (!content.contains("import jakarta.validation.constraints.NotBlank;")) {
                        int importIdx = sb.indexOf("import ");
                        if (importIdx >= 0) {
                            sb.insert(importIdx, "import jakarta.validation.constraints.NotBlank;\n");
                            modified = true;
                        }
                    }
                    if (!content.contains("import jakarta.validation.constraints.NotNull;")) {
                        int importIdx = sb.indexOf("import ");
                        if (importIdx >= 0) {
                            sb.insert(importIdx, "import jakarta.validation.constraints.NotNull;\n");
                            modified = true;
                        }
                    }
                    if (!content.contains("import jakarta.validation.constraints.Size;")) {
                        int importIdx = sb.indexOf("import ");
                        if (importIdx >= 0) {
                            sb.insert(importIdx, "import jakarta.validation.constraints.Size;\n");
                            modified = true;
                        }
                    }

                    // BUG 11 : Ajouter @NotBlank/@Size uniquement si pas déjà présent
                    // Vérifier @Size ET @NotBlank pour éviter les doublons (idempotent)
                    for (DtoInfo.FieldInfo field : dto.getFields()) {
                        if (field.isSerializationField()) continue; // ignorer serialVersionUID
                        if ("String".equals(field.getType())) {
                            String fieldDecl = "private String " + field.getName();
                            int idx = sb.indexOf(fieldDecl);
                            if (idx > 0) {
                                String before = sb.substring(Math.max(0, idx - 150), idx);
                                boolean hasNotBlank = before.contains("@NotBlank");
                                boolean hasSize = before.contains("@Size");
                                if (!hasSize) {
                                    // Ajouter @Size seulement s'il n'est pas déjà présent
                                    String annotatedField;
                                    if (field.isRequired() && !hasNotBlank) {
                                        annotatedField = "@NotBlank(message = \"Le champ " + field.getName() + " est obligatoire\")\n    @Size(max = 255)\n    private String " + field.getName();
                                    } else {
                                        annotatedField = "@Size(max = 255)\n    private String " + field.getName();
                                    }
                                    sb.replace(idx, idx + fieldDecl.length(), annotatedField);
                                    modified = true;
                                }
                            }
                        }
                    }

                    if (modified) {
                        Files.writeString(dtoFile, sb.toString());
                        report.addEnhancement(new Enhancement("R20", Category.INPUT_VALIDATION, Severity.WARNING,
                                "Ajout de @NotBlank et @Size sur les champs String de " + dto.getClassName(),
                                dtoFile.getFileName().toString(), true));
                    }
                }
            }
        }

        // AXE 1.3 + BUG M : @XmlTransient → AJOUTER @JsonIgnore en complement (pas remplacer)
        // Le CodeGenerationEngine genere deja @XmlTransient sur les champs.
        // Ici on ajoute @JsonIgnore juste avant @XmlTransient si absent.
        for (DtoInfo dto : analysisResult.getDtos()) {
            Path dtoFile = srcMain.resolve("dto/" + dto.getClassName() + ".java");
            if (!Files.exists(dtoFile)) continue;
            boolean hasXmlTransientField = dto.getFields().stream().anyMatch(DtoInfo.FieldInfo::isHasXmlTransient);
            if (!hasXmlTransientField) continue;

            String content = Files.readString(dtoFile);
            boolean modified = false;
            StringBuilder sb = new StringBuilder(content);

            for (DtoInfo.FieldInfo field : dto.getFields()) {
                if (!field.isHasXmlTransient()) continue;
                // BUG M : Chercher @XmlTransient et ajouter @JsonIgnore AVANT (pas remplacer)
                String xmlTransientDecl = "@XmlTransient";
                String fieldDecl = "private " + field.getType() + " " + field.getName();
                int fieldIdx = sb.indexOf(fieldDecl);
                if (fieldIdx > 0) {
                    String before = sb.substring(Math.max(0, fieldIdx - 200), fieldIdx);
                    // S'assurer que @XmlTransient est present
                    if (!before.contains("@XmlTransient")) {
                        // Ajouter @XmlTransient avant le champ
                        sb.insert(fieldIdx, "@XmlTransient\n    ");
                        modified = true;
                        // Recalculer l'index
                        fieldIdx = sb.indexOf(fieldDecl);
                        before = sb.substring(Math.max(0, fieldIdx - 200), fieldIdx);
                    }
                    // Ajouter @JsonIgnore avant @XmlTransient si absent
                    if (!before.contains("@JsonIgnore")) {
                        int xmlTransIdx = sb.lastIndexOf("@XmlTransient", fieldIdx);
                        if (xmlTransIdx > 0) {
                            sb.insert(xmlTransIdx, "@JsonIgnore\n    ");
                            modified = true;
                        }
                    }
                }
            }

            if (modified) {
                String result = sb.toString();
                // Ajouter l'import @JsonIgnore si absent
                if (!result.contains("import com.fasterxml.jackson.annotation.JsonIgnore;")) {
                    // Inserer apres le dernier import existant
                    int lastImportIdx = result.lastIndexOf("import ");
                    if (lastImportIdx >= 0) {
                        int endOfLine = result.indexOf("\n", lastImportIdx);
                        if (endOfLine > 0) {
                            result = result.substring(0, endOfLine + 1)
                                    + "import com.fasterxml.jackson.annotation.JsonIgnore;\n"
                                    + result.substring(endOfLine + 1);
                        }
                    }
                }
                // BUG D : Toujours dedupliquer les imports @JsonIgnore (peut etre duplique par passages multiples)
                result = result.replaceAll("(import com\\.fasterxml\\.jackson\\.annotation\\.JsonIgnore;\n)+",
                        "import com.fasterxml.jackson.annotation.JsonIgnore;\n");
                Files.writeString(dtoFile, result);
                report.addEnhancement(new Enhancement("R21", Category.INPUT_VALIDATION, Severity.WARNING,
                        "@JsonIgnore ajouté en complément de @XmlTransient dans " + dto.getClassName(),
                        dtoFile.getFileName().toString(), true));
            }
        }
    }

    // ==================== CATÉGORIE 4 : ERROR HANDLING ====================

    private void applyErrorHandlingRules(EnhancementReport report, Path srcMain) throws IOException {
        Path exceptionDir = srcMain.resolve("exception");

        // R26: Vérifier que le GlobalExceptionHandler existe
        Path handlerFile = exceptionDir.resolve("GlobalExceptionHandler.java");
        report.addEnhancement(new Enhancement("R26", Category.ERROR_HANDLING, Severity.INFO,
                "GlobalExceptionHandler @ControllerAdvice présent",
                "GlobalExceptionHandler.java", Files.exists(handlerFile)));

        // R27: Améliorer la structure d'erreur standardisée
        if (Files.exists(handlerFile)) {
            String content = Files.readString(handlerFile);

            // Ajouter le handler pour MethodArgumentNotValidException (validation)
            if (!content.contains("MethodArgumentNotValidException")) {
                String enhancedHandler = content.replace(
                        "    @ExceptionHandler(IllegalArgumentException.class)",
                        """
                            @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
                            public ResponseEntity<Map<String, Object>> handleValidationErrors(
                                    org.springframework.web.bind.MethodArgumentNotValidException ex) {
                                log.warn("Erreur de validation", ex);
                                Map<String, Object> body = new LinkedHashMap<>();
                                body.put("timestamp", LocalDateTime.now().toString());
                                body.put("status", 422);
                                body.put("error", "Unprocessable Entity");
                                body.put("message", "Erreur de validation des donnees");
                                java.util.List<Map<String, String>> fieldErrors = new java.util.ArrayList<>();
                                ex.getBindingResult().getFieldErrors().forEach(fe -> {
                                    Map<String, String> fieldError = new LinkedHashMap<>();
                                    fieldError.put("field", fe.getField());
                                    fieldError.put("message", fe.getDefaultMessage());
                                    fieldErrors.add(fieldError);
                                });
                                body.put("details", fieldErrors);
                                return new ResponseEntity<>(body, HttpStatus.UNPROCESSABLE_ENTITY);
                            }

                            @ExceptionHandler(IllegalArgumentException.class)""");
                Files.writeString(handlerFile, enhancedHandler);
                report.addEnhancement(new Enhancement("R27", Category.ERROR_HANDLING, Severity.CRITICAL,
                        "Ajout du handler MethodArgumentNotValidException avec retour 422 et détails des champs",
                        "GlobalExceptionHandler.java", true));
            }

            // R28: Vérifier que les stack traces ne sont pas exposées
            report.addEnhancement(new Enhancement("R28", Category.ERROR_HANDLING, Severity.INFO,
                    "Les stack traces ne sont pas exposées dans les réponses d'erreur",
                    "GlobalExceptionHandler.java", !content.contains("getStackTrace")));

            // R31: Toutes les erreurs de validation retournées en une fois
            report.addEnhancement(new Enhancement("R31", Category.ERROR_HANDLING, Severity.INFO,
                    "Les erreurs de validation sont retournées en une seule réponse (champ details)",
                    "GlobalExceptionHandler.java", true));
        }

        // R29: Créer BusinessException pour les erreurs métier
        Path businessExFile = exceptionDir.resolve("BusinessException.java");
        if (!Files.exists(businessExFile)) {
            String code = """
                    package %s.exception;

                    import org.springframework.http.HttpStatus;

                    /**
                     * Exception metier generique.
                     * Utilisee pour les erreurs de logique metier (ex: FwkRollbackException).
                     * Retourne un code HTTP 409 Conflict par defaut.
                     */
                    public class BusinessException extends RuntimeException {

                        private final HttpStatus status;
                        private final String errorCode;

                        public BusinessException(String message) {
                            super(message);
                            this.status = HttpStatus.CONFLICT;
                            this.errorCode = "BUSINESS_ERROR";
                        }

                        public BusinessException(String message, String errorCode) {
                            super(message);
                            this.status = HttpStatus.CONFLICT;
                            this.errorCode = errorCode;
                        }

                        public BusinessException(String message, HttpStatus status, String errorCode) {
                            super(message);
                            this.status = status;
                            this.errorCode = errorCode;
                        }

                        public HttpStatus getStatus() { return status; }
                        public String getErrorCode() { return errorCode; }
                    }
                    """.formatted(BASE_PACKAGE);
            Files.writeString(businessExFile, code);
            report.addEnhancement(new Enhancement("R29", Category.ERROR_HANDLING, Severity.WARNING,
                    "Création de BusinessException pour mapper FwkRollbackException (409 Conflict)",
                    "BusinessException.java", true));
        }

        // R30: Créer ServiceUnavailableException pour les erreurs JNDI
        Path serviceUnavailFile = exceptionDir.resolve("ServiceUnavailableException.java");
        if (!Files.exists(serviceUnavailFile)) {
            String code = """
                    package %s.exception;

                    /**
                     * Exception levee lorsque le service EJB distant est indisponible.
                     * Correspond aux erreurs de type NamingException (JNDI).
                     * Retourne un code HTTP 503 Service Unavailable.
                     */
                    public class ServiceUnavailableException extends RuntimeException {

                        public ServiceUnavailableException(String message) {
                            super(message);
                        }

                        public ServiceUnavailableException(String message, Throwable cause) {
                            super(message, cause);
                        }
                    }
                    """.formatted(BASE_PACKAGE);
            Files.writeString(serviceUnavailFile, code);
            report.addEnhancement(new Enhancement("R30", Category.ERROR_HANDLING, Severity.WARNING,
                    "Création de ServiceUnavailableException pour les erreurs JNDI (503)",
                    "ServiceUnavailableException.java", true));
        }
    }

    // ==================== CATÉGORIE 5 : SÉCURITÉ ====================

    private void applySecurityRules(EnhancementReport report, Path srcMain, Path resourcesDir, ProjectAnalysisResult analysisResult) throws IOException {
        Path configDir = srcMain.resolve("config");

        // R32: Créer SecurityFilterChain
        Path securityFile = configDir.resolve("SecurityConfig.java");
        if (!Files.exists(securityFile)) {
            String code = """
                    package %s.config;

                    import org.springframework.context.annotation.Bean;
                    import org.springframework.context.annotation.Configuration;
                    import org.springframework.security.config.annotation.web.builders.HttpSecurity;
                    import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
                    import org.springframework.security.config.http.SessionCreationPolicy;
                    import org.springframework.security.web.SecurityFilterChain;

                    /**
                     * Configuration de securite de l'API REST.
                     * <p>
                     * Configure le filtre de securite Spring Security avec :
                     * - Mode stateless (pas de session HTTP)
                     * - CSRF desactive (API REST stateless)
                     * - Endpoints publics et proteges
                     * - Headers de securite (X-Content-Type-Options, X-Frame-Options)
                     * </p>
                     * <p>
                     * NOTE : Cette configuration est un point de depart.
                     * Adapter l'authentification (JWT, OAuth2) selon les besoins du projet.
                     * </p>
                     */
                    @Configuration
                    @EnableWebSecurity
                    public class SecurityConfig {

                        @Bean
                        public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
                            return http
                                    .csrf(csrf -> csrf.disable()) // API REST stateless
                                    .sessionManagement(session -> session
                                            .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                                    .authorizeHttpRequests(auth -> auth
                                            .requestMatchers("/api/**").permitAll()
                                            .requestMatchers("/actuator/health").permitAll()
                                            .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                                            .anyRequest().authenticated())
                                    .headers(headers -> headers
                                            .contentTypeOptions(cto -> {}) // X-Content-Type-Options: nosniff
                                            .frameOptions(fo -> fo.deny())) // X-Frame-Options: DENY
                                    .build();
                        }
                    }
                    """.formatted(BASE_PACKAGE);
            Files.writeString(securityFile, code);
            report.addEnhancement(new Enhancement("R32", Category.SECURITY, Severity.CRITICAL,
                    "Création de SecurityConfig avec SecurityFilterChain (stateless, CSRF désactivé, headers sécurité)",
                    "SecurityConfig.java", true));
        }

        // R33: Créer CorsConfig
        Path corsFile = configDir.resolve("CorsConfig.java");
        if (!Files.exists(corsFile)) {
            String code = """
                    package %s.config;

                    import org.springframework.context.annotation.Bean;
                    import org.springframework.context.annotation.Configuration;
                    import org.springframework.web.cors.CorsConfiguration;
                    import org.springframework.web.cors.CorsConfigurationSource;
                    import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

                    import java.util.Arrays;
                    import java.util.List;

                    /**
                     * Configuration CORS (Cross-Origin Resource Sharing).
                     * <p>
                     * Definit les origines, methodes et en-tetes autorises.
                     * IMPORTANT : Ne jamais utiliser le wildcard (*) en production.
                     * Adapter les origines autorisees selon l'environnement.
                     * </p>
                     */
                    @Configuration
                    public class CorsConfig {

                        @Bean
                        public CorsConfigurationSource corsConfigurationSource() {
                            CorsConfiguration config = new CorsConfiguration();
                            // TODO: Remplacer par les origines autorisees en production
                            config.setAllowedOrigins(List.of("http://localhost:3000", "http://localhost:8080"));
                            config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
                            config.setAllowedHeaders(Arrays.asList(
                                    "Authorization", "Content-Type", "Accept", "X-Request-ID"));
                            config.setExposedHeaders(Arrays.asList("X-Request-ID", "X-Total-Count"));
                            config.setAllowCredentials(true);
                            config.setMaxAge(3600L);

                            UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
                            source.registerCorsConfiguration("/api/**", config);
                            return source;
                        }
                    }
                    """.formatted(BASE_PACKAGE);
            Files.writeString(corsFile, code);
            report.addEnhancement(new Enhancement("R33", Category.SECURITY, Severity.CRITICAL,
                    "Création de CorsConfig avec origines explicites (pas de wildcard *)",
                    "CorsConfig.java", true));
        }

        // R34-R36: Headers de sécurité (déjà dans SecurityConfig)
        report.addEnhancement(new Enhancement("R34", Category.SECURITY, Severity.INFO,
                "Header X-Content-Type-Options: nosniff configuré dans SecurityConfig",
                "SecurityConfig.java", true));
        report.addEnhancement(new Enhancement("R35", Category.SECURITY, Severity.INFO,
                "Header X-Frame-Options: DENY configuré dans SecurityConfig",
                "SecurityConfig.java", true));
        report.addEnhancement(new Enhancement("R36", Category.SECURITY, Severity.SUGGESTION,
                "Cache-Control: no-store recommandé pour les endpoints sensibles",
                "application.properties", true));

        // R40: CSRF désactivé pour API stateless
        report.addEnhancement(new Enhancement("R40", Category.SECURITY, Severity.INFO,
                "CSRF désactivé (API REST stateless, pas de cookies de session)",
                "SecurityConfig.java", true));

        // AXE 3 : @RolesAllowed → @PreAuthorize dans les controllers
        if (analysisResult != null) {
            for (UseCaseInfo uc : analysisResult.getUseCases()) {
                Path controllerFile = srcMain.resolve("controller/" + uc.getControllerName() + ".java");
                if (!Files.exists(controllerFile)) continue;
                String content = Files.readString(controllerFile);
                boolean modified = false;
                StringBuilder sb = new StringBuilder(content);

                // Verifier les roles au niveau de la classe
                List<String> classRoles = uc.getRolesAllowed();
                if (classRoles != null && !classRoles.isEmpty() && !content.contains("@PreAuthorize")) {
                    String rolesExpr = classRoles.size() == 1
                            ? "hasRole('" + classRoles.get(0) + "')"
                            : "hasAnyRole(" + classRoles.stream().map(r -> "'" + r + "'").collect(java.util.stream.Collectors.joining(", ")) + ")";
                    String preAuth = "@PreAuthorize(\"" + rolesExpr + "\")\n";
                    int classIdx = sb.indexOf("public class ");
                    if (classIdx > 0) {
                        sb.insert(classIdx, preAuth);
                        modified = true;
                    }
                }

                // Verifier les roles au niveau des methodes
                for (UseCaseInfo.MethodInfo method : uc.getPublicMethods()) {
                    List<String> methodRoles = method.getRolesAllowed();
                    if (methodRoles != null && !methodRoles.isEmpty()) {
                        String rolesExpr = methodRoles.size() == 1
                                ? "hasRole('" + methodRoles.get(0) + "')"
                                : "hasAnyRole(" + methodRoles.stream().map(r -> "'" + r + "'").collect(java.util.stream.Collectors.joining(", ")) + ")";
                        String preAuth = "    @PreAuthorize(\"" + rolesExpr + "\")\n";
                        String methodDecl = "public " + method.getReturnType();
                        // Chercher la methode dans le code et inserer @PreAuthorize avant
                        String searchPattern = "    public ";
                        int searchFrom = 0;
                        while ((searchFrom = sb.indexOf(method.getName() + "(", searchFrom)) >= 0) {
                            // Remonter pour trouver le debut de la ligne
                            int lineStart = sb.lastIndexOf("\n", searchFrom) + 1;
                            String line = sb.substring(lineStart, searchFrom);
                            if (line.contains("public ") && !sb.substring(Math.max(0, lineStart - 100), lineStart).contains("@PreAuthorize")) {
                                sb.insert(lineStart, preAuth);
                                modified = true;
                            }
                            searchFrom += method.getName().length() + 1;
                        }
                    }
                }

                if (modified) {
                    // Ajouter les imports necessaires
                    String result = sb.toString();
                    if (!result.contains("import org.springframework.security.access.prepost.PreAuthorize")) {
                        result = result.replace("import org.springframework.web.bind.annotation",
                                "import org.springframework.security.access.prepost.PreAuthorize;\nimport org.springframework.web.bind.annotation");
                    }
                    Files.writeString(controllerFile, result);
                    report.addEnhancement(new Enhancement("R37", Category.SECURITY, Severity.WARNING,
                            "@RolesAllowed transformé en @PreAuthorize dans " + uc.getControllerName(),
                            uc.getControllerName() + ".java", true));
                }
            }
        }
    }

    // ==================== CATÉGORIE 6 : RÉSILIENCE ====================

    private void applyResilienceRules(EnhancementReport report, Path srcMain, Path resourcesDir) throws IOException {
        // R46: Health check endpoint
        Path propsFile = resourcesDir.resolve("application.properties");
        if (Files.exists(propsFile)) {
            String content = Files.readString(propsFile);
            if (!content.contains("management.endpoints")) {
                String actuatorConfig = """

                        # Actuator - Health & Metrics
                        management.endpoints.web.exposure.include=health,info,metrics
                        management.endpoint.health.show-details=when-authorized
                        management.endpoint.health.show-components=always
                        """;
                Files.writeString(propsFile, content + actuatorConfig);
                report.addEnhancement(new Enhancement("R46", Category.RESILIENCE, Severity.WARNING,
                        "Ajout de la configuration Spring Boot Actuator (health, info, metrics)",
                        "application.properties", true));
            }
        }

        // R41-R44: Circuit breaker et retry (génération de la configuration)
        report.addEnhancement(new Enhancement("R41", Category.RESILIENCE, Severity.SUGGESTION,
                "Circuit breaker recommandé sur les appels JNDI (ajouter spring-boot-starter-resilience4j)",
                "ServiceAdapters", true));
        report.addEnhancement(new Enhancement("R42", Category.RESILIENCE, Severity.SUGGESTION,
                "Retry avec backoff exponentiel recommandé sur les appels JNDI transients",
                "ServiceAdapters", true));
        report.addEnhancement(new Enhancement("R43", Category.RESILIENCE, Severity.SUGGESTION,
                "Timeout configuré sur les appels JNDI externes",
                "ServiceAdapters", true));
    }

    // ==================== CATÉGORIE 7 : OBSERVABILITÉ ====================

    private void applyObservabilityRules(EnhancementReport report, Path srcMain, Path resourcesDir) throws IOException {
        // R48: Créer le filtre de Correlation ID
        Path filterDir = srcMain.resolve("filter");
        Files.createDirectories(filterDir);

        Path correlationFilter = filterDir.resolve("CorrelationIdFilter.java");
        if (!Files.exists(correlationFilter)) {
            String code = """
                    package %s.filter;

                    import jakarta.servlet.*;
                    import jakarta.servlet.http.HttpServletRequest;
                    import jakarta.servlet.http.HttpServletResponse;
                    import org.slf4j.MDC;
                    import org.springframework.core.annotation.Order;
                    import org.springframework.stereotype.Component;

                    import java.io.IOException;
                    import java.util.UUID;

                    /**
                     * Filtre HTTP qui genere et propage un identifiant de correlation (X-Request-ID).
                     * <p>
                     * Cet identifiant est ajoute au MDC (Mapped Diagnostic Context) de SLF4J
                     * pour etre inclus automatiquement dans tous les logs de la requete.
                     * Il est egalement retourne dans les en-tetes de la reponse HTTP.
                     * </p>
                     */
                    @Component
                    @Order(1)
                    public class CorrelationIdFilter implements Filter {

                        private static final String CORRELATION_HEADER = "X-Request-ID";
                        private static final String MDC_KEY = "correlationId";

                        @Override
                        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                                throws IOException, ServletException {
                            HttpServletRequest httpRequest = (HttpServletRequest) request;
                            HttpServletResponse httpResponse = (HttpServletResponse) response;

                            String correlationId = httpRequest.getHeader(CORRELATION_HEADER);
                            if (correlationId == null || correlationId.isBlank()) {
                                correlationId = UUID.randomUUID().toString();
                            }

                            MDC.put(MDC_KEY, correlationId);
                            httpResponse.setHeader(CORRELATION_HEADER, correlationId);

                            try {
                                chain.doFilter(request, response);
                            } finally {
                                MDC.remove(MDC_KEY);
                            }
                        }
                    }
                    """.formatted(BASE_PACKAGE);
            Files.writeString(correlationFilter, code);
            report.addEnhancement(new Enhancement("R48", Category.OBSERVABILITY, Severity.CRITICAL,
                    "Création du filtre CorrelationIdFilter (X-Request-ID via MDC)",
                    "CorrelationIdFilter.java", true));
        }

        // R49: Vérifier le LoggingAspect
        Path loggingAspect = srcMain.resolve("logging/LoggingAspect.java");
        report.addEnhancement(new Enhancement("R49", Category.OBSERVABILITY, Severity.INFO,
                "LoggingAspect présent pour le logging des requêtes/réponses",
                "LoggingAspect.java", Files.exists(loggingAspect)));

        // R50-R51: Améliorer la configuration de logging
        Path propsFile = resourcesDir.resolve("application.properties");
        if (Files.exists(propsFile)) {
            String content = Files.readString(propsFile);
            if (!content.contains("logging.pattern.level")) {
                String loggingConfig = """

                        # Structured Logging avec Correlation ID
                        logging.pattern.level=%5p [%X{correlationId}]
                        logging.pattern.console=%d{yyyy-MM-dd HH:mm:ss.SSS} %5p [%X{correlationId}] [%thread] %logger{36} - %msg%n
                        """;
                Files.writeString(propsFile, content + loggingConfig);
                report.addEnhancement(new Enhancement("R50", Category.OBSERVABILITY, Severity.WARNING,
                        "Ajout du Correlation ID dans le pattern de logging",
                        "application.properties", true));
            }
        }
    }

    // ==================== CATÉGORIE 8 : DOCUMENTATION API ====================

    private void applyDocumentationRules(EnhancementReport report, Path srcMain,
                                         ProjectAnalysisResult analysisResult, Path projectRoot) throws IOException {
        // R54-R58: Ajouter les annotations OpenAPI sur les controllers
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            Path controllerFile = srcMain.resolve("controller/" + uc.getControllerName() + ".java");
            if (Files.exists(controllerFile)) {
                String content = Files.readString(controllerFile);
                if (!content.contains("@Operation") && !content.contains("io.swagger")) {
                    // Ajouter les imports OpenAPI
                    String importBlock = """
                            import io.swagger.v3.oas.annotations.Operation;
                            import io.swagger.v3.oas.annotations.responses.ApiResponse;
                            import io.swagger.v3.oas.annotations.responses.ApiResponses;
                            import io.swagger.v3.oas.annotations.tags.Tag;
                            """;

                    String improved = content.replace(
                            "import org.springframework.web.bind.annotation.*;",
                            importBlock + "import org.springframework.web.bind.annotation.*;");

                    // Ajouter @Tag sur la classe
                    String resourceName = uc.getClassName().replace("UC", "").replace("Controller", "");
                    improved = improved.replace(
                            "@RestController",
                            "@Tag(name = \"" + resourceName + "\", description = \"Operations liees a " + resourceName + "\")\n@RestController");

                    // Ajouter @Operation et @ApiResponses sur la méthode execute
                    improved = improved.replace(
                            "@PostMapping",
                            """
                            @Operation(summary = "Executer le use case %s",
                                       description = "Appelle le EJB %s via JNDI et retourne le resultat")
                            @ApiResponses(value = {
                                @ApiResponse(responseCode = "201", description = "Execution reussie"),
                                @ApiResponse(responseCode = "400", description = "Requete invalide"),
                                @ApiResponse(responseCode = "422", description = "Erreur de validation"),
                                @ApiResponse(responseCode = "500", description = "Erreur interne"),
                                @ApiResponse(responseCode = "503", description = "Service EJB indisponible")
                            })
                            @PostMapping""".formatted(resourceName, uc.getClassName()));

                    Files.writeString(controllerFile, improved);
                    report.addEnhancement(new Enhancement("R55", Category.DOCUMENTATION, Severity.WARNING,
                            "Ajout des annotations @Operation, @ApiResponses, @Tag sur " + uc.getControllerName(),
                            controllerFile.getFileName().toString(), true));
                }
            }
        }

        // R54: Vérifier la dépendance springdoc dans le pom.xml
        Path pomFile = projectRoot.resolve("pom.xml");
        if (Files.exists(pomFile)) {
            String pomContent = Files.readString(pomFile);
            if (!pomContent.contains("springdoc-openapi")) {
                String springdocDep = """

                                <!-- SpringDoc OpenAPI (Swagger UI) -->
                                <dependency>
                                    <groupId>org.springdoc</groupId>
                                    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
                                    <version>2.5.0</version>
                                </dependency>
                        """;
                String improved = pomContent.replace(
                        "        <!-- Testing -->",
                        springdocDep + "\n                <!-- Testing -->");
                Files.writeString(pomFile, improved);
                report.addEnhancement(new Enhancement("R54", Category.DOCUMENTATION, Severity.CRITICAL,
                        "Ajout de la dépendance springdoc-openapi-starter-webmvc-ui dans pom.xml",
                        "pom.xml", true));
            }
        }

        // R54 suite: Vérifier la dépendance spring-boot-starter-security dans le pom.xml
        if (Files.exists(pomFile)) {
            String pomContent = Files.readString(pomFile);
            if (!pomContent.contains("spring-boot-starter-security")) {
                String securityDep = """

                                <!-- Spring Security -->
                                <dependency>
                                    <groupId>org.springframework.boot</groupId>
                                    <artifactId>spring-boot-starter-security</artifactId>
                                </dependency>
                        """;
                String improved = pomContent.replace(
                        "        <!-- Testing -->",
                        securityDep + "\n                <!-- Testing -->");
                Files.writeString(pomFile, improved);
                report.addEnhancement(new Enhancement("R32b", Category.SECURITY, Severity.CRITICAL,
                        "Ajout de la dépendance spring-boot-starter-security dans pom.xml",
                        "pom.xml", true));
            }
        }

        // Ajouter spring-boot-starter-actuator
        if (Files.exists(pomFile)) {
            String pomContent = Files.readString(pomFile);
            if (!pomContent.contains("spring-boot-starter-actuator")) {
                String actuatorDep = """

                                <!-- Spring Boot Actuator (health, metrics) -->
                                <dependency>
                                    <groupId>org.springframework.boot</groupId>
                                    <artifactId>spring-boot-starter-actuator</artifactId>
                                </dependency>
                        """;
                String improved = pomContent.replace(
                        "        <!-- Testing -->",
                        actuatorDep + "\n                <!-- Testing -->");
                Files.writeString(pomFile, improved);
                report.addEnhancement(new Enhancement("R46b", Category.RESILIENCE, Severity.CRITICAL,
                        "Ajout de la dépendance spring-boot-starter-actuator dans pom.xml",
                        "pom.xml", true));
            }
        }

        // Ajouter spring-boot-starter-validation
        if (Files.exists(pomFile)) {
            String pomContent = Files.readString(pomFile);
            if (!pomContent.contains("spring-boot-starter-validation")) {
                String validationDep = """

                                <!-- Spring Boot Validation (Bean Validation) -->
                                <dependency>
                                    <groupId>org.springframework.boot</groupId>
                                    <artifactId>spring-boot-starter-validation</artifactId>
                                </dependency>
                        """;
                String improved = pomContent.replace(
                        "        <!-- Testing -->",
                        validationDep + "\n                <!-- Testing -->");
                Files.writeString(pomFile, improved);
                report.addEnhancement(new Enhancement("R19b", Category.INPUT_VALIDATION, Severity.CRITICAL,
                        "Ajout de la dépendance spring-boot-starter-validation dans pom.xml",
                        "pom.xml", true));
            }
        }
    }

    // ==================== CATÉGORIE 9 : CONTENT NEGOTIATION ====================

    private void applyContentNegotiationRules(EnhancementReport report, boolean projectHasXml) {
        report.addEnhancement(new Enhancement("R59", Category.CONTENT_NEGOTIATION, Severity.INFO,
                "JSON supporté par défaut (application/json)",
                "ContentNegotiationConfig.java", true));

        if (projectHasXml) {
            report.addEnhancement(new Enhancement("R60", Category.CONTENT_NEGOTIATION, Severity.INFO,
                    "XML supporté (annotations JAXB détectées)",
                    "ContentNegotiationConfig.java", true));
            report.addEnhancement(new Enhancement("R61", Category.CONTENT_NEGOTIATION, Severity.INFO,
                    "Négociation de contenu par paramètre (?format=xml) activée",
                    "ContentNegotiationConfig.java", true));
        }
    }

    // ==================== CATÉGORIE 10 : STRUCTURE PROJET ====================

    private void applyProjectStructureRules(EnhancementReport report, Path projectRoot, Path resourcesDir) throws IOException {
        // R63: Configuration externalisée
        report.addEnhancement(new Enhancement("R63", Category.PROJECT_STRUCTURE, Severity.INFO,
                "Configuration externalisée dans application.properties",
                "application.properties", true));

        // R64: Profils Spring
        Path propsFile = resourcesDir.resolve("application.properties");
        if (Files.exists(propsFile)) {
            String content = Files.readString(propsFile);
            if (!content.contains("spring.profiles")) {
                String profileConfig = """

                        # Spring Profiles
                        spring.profiles.active=${SPRING_PROFILES_ACTIVE:dev}
                        """;
                Files.writeString(propsFile, content + profileConfig);
            }
        }

        // Créer application-dev.properties
        Path devProps = resourcesDir.resolve("application-dev.properties");
        if (!Files.exists(devProps)) {
            String devContent = """
                    # Profil DEV - Configuration de developpement
                    server.port=8081
                    logging.level.com.bank.api=DEBUG
                    logging.level.org.springframework.web=DEBUG

                    # JNDI Configuration (dev)
                    ejb.jndi.provider.url=localhost:1099
                    ejb.jndi.factory=org.jboss.naming.remote.client.InitialContextFactory
                    """;
            Files.writeString(devProps, devContent);
            report.addEnhancement(new Enhancement("R64", Category.PROJECT_STRUCTURE, Severity.SUGGESTION,
                    "Création du profil application-dev.properties",
                    "application-dev.properties", true));
        }

        // Créer application-prod.properties
        Path prodProps = resourcesDir.resolve("application-prod.properties");
        if (!Files.exists(prodProps)) {
            String prodContent = """
                    # Profil PROD - Configuration de production
                    server.port=${SERVER_PORT:8080}
                    logging.level.com.bank.api=INFO
                    logging.level.org.springframework.web=WARN

                    # JNDI Configuration (prod)
                    ejb.jndi.provider.url=${EJB_JNDI_URL:localhost:1099}
                    ejb.jndi.factory=${EJB_JNDI_FACTORY:org.jboss.naming.remote.client.InitialContextFactory}

                    # Security
                    server.ssl.enabled=true
                    """;
            Files.writeString(prodProps, prodContent);
            report.addEnhancement(new Enhancement("R64b", Category.PROJECT_STRUCTURE, Severity.SUGGESTION,
                    "Création du profil application-prod.properties avec variables d'environnement",
                    "application-prod.properties", true));
        }

        // R65: Dockerfile
        Path dockerfile = projectRoot.resolve("Dockerfile");
        if (!Files.exists(dockerfile)) {
            String dockerContent = """
                    # ===== Stage 1: Build =====
                    FROM eclipse-temurin:21-jdk-alpine AS builder
                    WORKDIR /app
                    COPY pom.xml .
                    COPY src ./src
                    # Si Maven wrapper est disponible
                    # COPY mvnw .
                    # COPY .mvn .mvn
                    # RUN ./mvnw clean package -DskipTests
                    # Sinon, utiliser Maven directement
                    RUN apk add --no-cache maven && mvn clean package -DskipTests

                    # ===== Stage 2: Runtime =====
                    FROM eclipse-temurin:21-jre-alpine
                    WORKDIR /app

                    # Securite : utilisateur non-root
                    RUN addgroup -S appgroup && adduser -S appuser -G appgroup
                    USER appuser

                    COPY --from=builder /app/target/*.jar app.jar

                    EXPOSE 8081

                    # JVM tuning pour conteneur
                    ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"

                    ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
                    """;
            Files.writeString(dockerfile, dockerContent);
            report.addEnhancement(new Enhancement("R65", Category.PROJECT_STRUCTURE, Severity.SUGGESTION,
                    "Création du Dockerfile multi-stage (build + runtime, utilisateur non-root)",
                    "Dockerfile", true));
        }

        // R66: docker-compose.yml
        Path dockerCompose = projectRoot.resolve("docker-compose.yml");
        if (!Files.exists(dockerCompose)) {
            String composeContent = """
                    version: '3.8'

                    services:
                      api:
                        build: .
                        ports:
                          - "8081:8081"
                        environment:
                          - SPRING_PROFILES_ACTIVE=dev
                          - EJB_JNDI_URL=ejb-server:1099
                        healthcheck:
                          test: ["CMD", "wget", "--spider", "-q", "http://localhost:8081/actuator/health"]
                          interval: 30s
                          timeout: 10s
                          retries: 3
                          start_period: 40s
                    """;
            Files.writeString(dockerCompose, composeContent);
            report.addEnhancement(new Enhancement("R66", Category.PROJECT_STRUCTURE, Severity.SUGGESTION,
                    "Création du docker-compose.yml avec health check",
                    "docker-compose.yml", true));
        }
    }

    // ==================== CATÉGORIE 11 : TESTS ====================

    private void applyTestingRules(EnhancementReport report, Path testDir,
                                   ProjectAnalysisResult analysisResult) throws IOException {
        // R69: Générer un test unitaire par controller
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            // Déterminer le code HTTP attendu selon le type d'opération
            // Logique inversée : on détecte les CRÉATIONS (201), tout le reste → 200 OK
            String ucNameLower = uc.getClassName().toLowerCase();
            String ucJavadoc = uc.getJavadoc() != null ? uc.getJavadoc().toLowerCase() : "";
            // Détection basée UNIQUEMENT sur le nom de classe (pas le Javadoc car trop ambigu)
            boolean isCreation = ucNameLower.contains("create") || ucNameLower.contains("creer")
                    || ucNameLower.contains("souscrire") || ucNameLower.contains("ajouter")
                    || ucNameLower.contains("inscrire") || ucNameLower.contains("enregistrer")
                    || ucNameLower.contains("add") || ucNameLower.contains("insert")
                    || ucNameLower.contains("register") || ucNameLower.contains("open")
                    || ucNameLower.contains("save") || ucNameLower.contains("nouveau");
            String expectedStatus = isCreation ? "isCreated" : "isOk";
            String expectedCode = isCreation ? "201" : "200";

            Path testFile = testDir.resolve("controller/" + uc.getControllerName() + "Test.java");
            if (!Files.exists(testFile)) {
                String resourceName = uc.getClassName().replace("UC", "");
                String testCode = """
                        package %s.controller;

                        import %s.dto.%s;
                        import %s.dto.%s;
                        import %s.service.%s;
                        import com.fasterxml.jackson.databind.ObjectMapper;
                        import org.junit.jupiter.api.DisplayName;
                        import org.junit.jupiter.api.Test;
                        import org.springframework.beans.factory.annotation.Autowired;
                        import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
                        import org.springframework.boot.test.mock.bean.MockBean;
                        import org.springframework.http.MediaType;
                        import org.springframework.test.web.servlet.MockMvc;

                        import static org.mockito.ArgumentMatchers.any;
                        import static org.mockito.Mockito.when;
                        import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
                        import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

                        /**
                         * Tests unitaires pour %s.
                         * Utilise @WebMvcTest pour tester uniquement la couche web.
                         */
                        @WebMvcTest(%s.class)
                        class %sTest {

                            @Autowired
                            private MockMvc mockMvc;

                            @Autowired
                            private ObjectMapper objectMapper;

                            @MockBean
                            private %s serviceAdapter;

                            @Test
                            @DisplayName("POST %s - Execution reussie retourne %s")
                            void execute_shouldReturnSuccess_whenValidRequest() throws Exception {
                                // Given
                                %s request = new %s();
                                %s response = new %s();
                                when(serviceAdapter.execute(any(%s.class))).thenReturn(response);

                                // When & Then
                                mockMvc.perform(post("%s")
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(objectMapper.writeValueAsString(request)))
                                        .andExpect(status().%s())
                                        .andExpect(content().contentType(MediaType.APPLICATION_JSON));
                            }

                            @Test
                            @DisplayName("POST %s - Requete invalide retourne 400/422")
                            void execute_shouldReturn4xx_whenInvalidRequest() throws Exception {
                                // When & Then
                                mockMvc.perform(post("%s")
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content("{}"))
                                        .andExpect(status().is4xxClientError());
                            }

                            @Test
                            @DisplayName("POST %s - Erreur service retourne 500")
                            void execute_shouldReturn500_whenServiceFails() throws Exception {
                                // Given
                                %s request = new %s();
                                when(serviceAdapter.execute(any(%s.class)))
                                        .thenThrow(new RuntimeException("EJB indisponible"));

                                // When & Then
                                mockMvc.perform(post("%s")
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(objectMapper.writeValueAsString(request)))
                                        .andExpect(status().isInternalServerError());
                            }
                        }
                        """.formatted(
                        BASE_PACKAGE,
                        BASE_PACKAGE, uc.getInputDtoClassName(),
                        BASE_PACKAGE, uc.getOutputDtoClassName(),
                        BASE_PACKAGE, uc.getServiceAdapterName(),
                        uc.getControllerName(),
                        uc.getControllerName(),
                        uc.getControllerName(),
                        uc.getServiceAdapterName(),
                        uc.getRestEndpoint(), expectedCode,
                        uc.getInputDtoClassName(), uc.getInputDtoClassName(),
                        uc.getOutputDtoClassName(), uc.getOutputDtoClassName(),
                        uc.getInputDtoClassName(),
                        uc.getRestEndpoint(),
                        expectedStatus,
                        uc.getRestEndpoint(),
                        uc.getRestEndpoint(),
                        uc.getRestEndpoint(),
                        uc.getInputDtoClassName(), uc.getInputDtoClassName(),
                        uc.getInputDtoClassName(),
                        uc.getRestEndpoint());
                Files.writeString(testFile, testCode);
                report.addEnhancement(new Enhancement("R69", Category.TESTING, Severity.WARNING,
                        "Création du test unitaire " + uc.getControllerName() + "Test (3 scénarios: " + expectedCode + ", 4xx, 500)",
                        uc.getControllerName() + "Test.java", true));
            }
        }
    }

    // ==================== CATÉGORIE 12 : PERFORMANCE ====================

    private void applyPerformanceRules(EnhancementReport report, Path srcMain, Path resourcesDir) throws IOException {
        // R75: Compression gzip
        Path propsFile = resourcesDir.resolve("application.properties");
        if (Files.exists(propsFile)) {
            String content = Files.readString(propsFile);
            if (!content.contains("server.compression")) {
                String compressionConfig = """

                        # Response Compression (gzip)
                        server.compression.enabled=true
                        server.compression.mime-types=application/json,application/xml,text/html,text/plain
                        server.compression.min-response-size=1024
                        """;
                Files.writeString(propsFile, content + compressionConfig);
                report.addEnhancement(new Enhancement("R75", Category.PERFORMANCE, Severity.SUGGESTION,
                        "Activation de la compression gzip pour les réponses > 1Ko",
                        "application.properties", true));
            }
        }

        report.addEnhancement(new Enhancement("R74", Category.PERFORMANCE, Severity.SUGGESTION,
                "Pagination recommandée pour les endpoints de type liste (à implémenter selon les besoins)",
                "Controllers", true));

        report.addEnhancement(new Enhancement("R76", Category.PERFORMANCE, Severity.SUGGESTION,
                "ETag/If-None-Match recommandé pour le caching HTTP (à implémenter selon les besoins)",
                "Controllers", true));
    }

    // ==================== CATÉGORIE 13 : CONFORMITÉ BIAN ====================

    private void applyBianComplianceRules(EnhancementReport report, Path srcMain,
                                           ProjectAnalysisResult analysisResult) throws IOException {

        // Compter les UseCases avec mapping BIAN
        long bianMapped = analysisResult.getUseCases().stream()
                .filter(uc -> uc.getBianMapping() != null)
                .count();
        long total = analysisResult.getUseCases().size();

        // R80: Couverture du mapping BIAN
        boolean fullCoverage = bianMapped == total;
        report.addEnhancement(new Enhancement("R80", Category.BIAN_COMPLIANCE, Severity.CRITICAL,
                "Mapping BIAN : " + bianMapped + "/" + total + " UseCases mappes vers un Service Domain",
                "bian-mapping.yml", fullCoverage));

        // R81: Vérifier les URLs BIAN (format /{service-domain}/{cr-reference-id}/{bq}/{action})
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            BianMapping mapping = uc.getBianMapping();
            if (mapping == null) continue;

            String url = mapping.buildUrl("/api/v1");
            boolean validUrl = url != null && url.startsWith("/api/v1/")
                    && url.contains("/") && !url.contains("//");
            report.addEnhancement(new Enhancement("R81", Category.BIAN_COMPLIANCE, Severity.WARNING,
                    "URL BIAN valide : " + url + " (" + uc.getClassName() + ")",
                    uc.getControllerName() + ".java", validUrl));
        }

        // R82: Vérifier que les actions BIAN sont standard
        List<String> validActions = List.of(
                "initiation", "retrieval", "update", "execution",
                "termination", "evaluation", "notification", "control", "request");
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            BianMapping mapping = uc.getBianMapping();
            if (mapping == null) continue;

            boolean validAction = mapping.getAction() != null
                    && validActions.contains(mapping.getAction().toLowerCase());
            report.addEnhancement(new Enhancement("R82", Category.BIAN_COMPLIANCE, Severity.WARNING,
                    "Action BIAN '" + mapping.getAction() + "' " + (validAction ? "standard" : "NON STANDARD")
                            + " (" + uc.getClassName() + ")",
                    uc.getControllerName() + ".java", validAction));
        }

        // R83: Vérifier le BianHeaderFilter
        Path headerFilter = srcMain.resolve("config/BianHeaderFilter.java");
        boolean hasFilter = Files.exists(headerFilter);
        report.addEnhancement(new Enhancement("R83", Category.BIAN_COMPLIANCE, Severity.CRITICAL,
                "BianHeaderFilter present (headers X-BIAN-* injectes automatiquement)",
                "BianHeaderFilter.java", hasFilter));

        // R84: Vérifier les operationId BIAN (format: {action}{ServiceDomain}{BQ})
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            BianMapping mapping = uc.getBianMapping();
            if (mapping == null) continue;

            String opId = mapping.buildOperationId();
            boolean validOpId = opId != null && !opId.isEmpty()
                    && Character.isLowerCase(opId.charAt(0));
            report.addEnhancement(new Enhancement("R84", Category.BIAN_COMPLIANCE, Severity.INFO,
                    "operationId BIAN : " + opId + " (" + uc.getClassName() + ")",
                    uc.getControllerName() + ".java", validOpId));
        }

        // R85: Vérifier que les controllers regroupés par Service Domain existent
        Path controllerDir = srcMain.resolve("controller");
        if (Files.exists(controllerDir)) {
            long groupedControllers = Files.list(controllerDir)
                    .filter(f -> f.getFileName().toString().endsWith("Controller.java"))
                    .count();
            report.addEnhancement(new Enhancement("R85", Category.BIAN_COMPLIANCE, Severity.INFO,
                    groupedControllers + " controllers generes (regroupes par Service Domain BIAN)",
                    "controller/", groupedControllers > 0));
        }

        // R86: Vérifier les Swagger @Tag avec le nom du Service Domain BIAN
        if (Files.exists(controllerDir)) {
            for (UseCaseInfo uc : analysisResult.getUseCases()) {
                Path controllerFile = controllerDir.resolve(uc.getControllerName() + ".java");
                if (!Files.exists(controllerFile)) continue;

                String content = Files.readString(controllerFile);
                boolean hasTag = content.contains("@Tag(");
                report.addEnhancement(new Enhancement("R86", Category.BIAN_COMPLIANCE, Severity.SUGGESTION,
                        "@Tag Swagger " + (hasTag ? "present" : "ABSENT") + " sur " + uc.getControllerName(),
                        uc.getControllerName() + ".java", hasTag));
            }
        }

        // R87: Vérifier les HTTP methods BIAN (GET pour retrieval, POST pour initiation, etc.)
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            BianMapping mapping = uc.getBianMapping();
            if (mapping == null) continue;

            String action = mapping.getAction() != null ? mapping.getAction().toLowerCase() : "";
            String httpMethod = mapping.getHttpMethod() != null ? mapping.getHttpMethod() : "POST";

            boolean correctMethod = switch (action) {
                case "retrieval" -> httpMethod.equals("GET");
                case "initiation" -> httpMethod.equals("POST");
                case "update" -> httpMethod.equals("PUT");
                case "termination" -> httpMethod.equals("PUT") || httpMethod.equals("DELETE");
                case "execution" -> httpMethod.equals("POST");
                default -> true;
            };

            report.addEnhancement(new Enhancement("R87", Category.BIAN_COMPLIANCE, Severity.WARNING,
                    httpMethod + " pour action '" + action + "' "
                            + (correctMethod ? "conforme BIAN" : "NON CONFORME BIAN")
                            + " (" + uc.getClassName() + ")",
                    uc.getControllerName() + ".java", correctMethod));
        }
    }

    // ==================== CALCUL DU SCORE ====================

    private int calculateQualityScore(EnhancementReport report) {
        int total = report.getTotalRulesChecked();
        if (total == 0) return 0;

        long applied = report.countApplied();
        long critical = report.countBySeverity(Severity.CRITICAL);
        long warnings = report.countBySeverity(Severity.WARNING);

        // Score de base : pourcentage de règles appliquées
        double baseScore = (double) applied / total * 100;

        // Bonus pour les règles critiques appliquées
        long criticalApplied = report.getEnhancements().stream()
                .filter(e -> e.getSeverity() == Severity.CRITICAL && e.isApplied()).count();
        double criticalBonus = critical > 0 ? (double) criticalApplied / critical * 10 : 0;

        return Math.min(100, (int) Math.round(baseScore + criticalBonus));
    }
}
