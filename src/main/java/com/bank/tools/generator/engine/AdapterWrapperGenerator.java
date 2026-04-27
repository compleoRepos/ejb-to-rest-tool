package com.bank.tools.generator.engine;

import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.model.AdapterContractInfo;
import com.bank.tools.generator.model.AdapterContractInfo.EndpointInfo;
import com.bank.tools.generator.model.AdapterContractInfo.FieldInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Generateur de Wrapper BIAN a partir d'un contrat JSON d'Adapter WebSphere.
 *
 * <p>Pipeline "Adapter Contract → Wrapper BIAN" qui capitalise sur l'architecture
 * ACL existante pour generer un wrapper complet avec :</p>
 * <ul>
 *   <li>Controller BIAN avec enveloppe ApiRequest/ApiResponse</li>
 *   <li>Service Interface (couche Domain)</li>
 *   <li>RestAdapter avec Resilience4j (Circuit Breaker, Retry, Bulkhead)</li>
 *   <li>Cle d'idempotence pour les operations idempotentes</li>
 *   <li>MockAdapter pour les tests</li>
 *   <li>Tests d'integration et tests Pact Consumer</li>
 *   <li>Configuration Spring Boot (profils rest, mock, dev, prod)</li>
 * </ul>
 *
 * @see com.bank.tools.generator.model.AdapterContractInfo
 * @see com.bank.tools.generator.parser.AdapterContractParser
 */
@Component
public class AdapterWrapperGenerator {

    private static final Logger log = LoggerFactory.getLogger(AdapterWrapperGenerator.class);

    private final BianAutoDetector bianAutoDetector;

    // =====================================================================
    // PACKAGES
    // =====================================================================
    private String PKG_BASE;
    private String PKG_API_CONTROLLER;
    private String PKG_API_DTO_REQUEST;
    private String PKG_API_DTO_RESPONSE;
    private String PKG_API_DTO_ENVELOPE;
    private String PKG_API_DTO_VALIDATION;
    private String PKG_DOMAIN_SERVICE;
    private String PKG_DOMAIN_EXCEPTION;
    private String PKG_INFRA_REST_ADAPTER;
    private String PKG_INFRA_REST_CONFIG;
    private String PKG_INFRA_MOCK;
    private String PKG_INFRA_IDEMPOTENCY;
    private String PKG_CONFIG;

    public AdapterWrapperGenerator(BianAutoDetector bianAutoDetector) {
        this.bianAutoDetector = bianAutoDetector;
    }

    // =====================================================================
    // POINT D'ENTREE
    // =====================================================================

    /**
     * Genere un projet Wrapper BIAN complet a partir d'un contrat d'adapter.
     *
     * @param contract le contrat JSON parse de l'adapter WebSphere
     * @param outputDir le repertoire de sortie du projet genere
     * @return le chemin vers le projet genere
     * @throws IOException en cas d'erreur d'ecriture
     */
    public Path generate(AdapterContractInfo contract, Path outputDir) throws IOException {
        log.info("[ADAPTER-WRAPPER] ========== DEBUT GENERATION WRAPPER BIAN ==========");
        log.info("[ADAPTER-WRAPPER] Adapter: {} | Endpoints: {} | BaseURL: {}",
                contract.getAdapterName(), contract.getEndpoints().size(), contract.getAdapterBaseUrl());

        // Creer la structure du projet
        String projectName = "generated-wrapper-" + contract.toKebabCase();
        Path projectRoot = outputDir.resolve(projectName);
        Files.createDirectories(projectRoot);

        // Structure Maven standard
        PKG_BASE = "com.bank.api";
        initPackages();

        Path srcMain = projectRoot.resolve("src/main/java/" + PKG_BASE.replace(".", "/"));
        Files.createDirectories(srcMain);

        createDirectories(srcMain);

        // Detecter le mapping BIAN automatiquement
        BianMapping bianMapping = detectBianMapping(contract);
        log.info("[ADAPTER-WRAPPER] Mapping BIAN detecte : SD={} ({})", bianMapping.getServiceDomain(), bianMapping.getServiceDomainTitle());

        // 1. Generer les DTOs Request/Response (couche API)
        for (EndpointInfo ep : contract.getEndpoints()) {
            generateRequestDto(srcMain, ep);
            generateResponseDto(srcMain, ep);
        }

        // 2. Generer les classes d'enveloppe (ApiRequest, ApiResponse)
        generateEnvelopeClasses(srcMain);

        // 3. Generer les annotations de validation
        generateValidationAnnotations(srcMain);

        // 4. Generer les Exceptions (couche Domain)
        generateDomainExceptions(srcMain);

        // 5. Generer l'interface Service (couche Domain)
        generateServiceInterface(srcMain, contract, bianMapping);

        // 6. Generer le RestAdapter avec resilience (couche Infrastructure)
        generateRestAdapter(srcMain, contract, bianMapping);

        // 7. Generer le service d'idempotence (couche Infrastructure)
        generateIdempotencyService(srcMain);

        // 8. Generer le MockAdapter (couche Infrastructure)
        generateMockAdapter(srcMain, contract, bianMapping);

        // 9. Generer le RestClientConfig (couche Infrastructure)
        generateRestClientConfig(srcMain, contract);

        // 10. Generer le Controller BIAN (couche API)
        generateBianController(srcMain, contract, bianMapping);

        // 11. Generer le GlobalExceptionHandler (Config)
        generateGlobalExceptionHandler(srcMain);

        // 12. Generer la SecurityConfig (Config)
        generateSecurityConfig(srcMain);

        // 13. Generer les profils Spring (Config)
        generateSpringProfiles(srcMain, contract);

        // 14. Generer l'Application main class
        generateApplicationClass(srcMain, contract);

        // 15. Generer le pom.xml
        generatePomXml(projectRoot, contract);

        // 16. Generer les tests d'integration
        generateIntegrationTests(srcMain, contract, bianMapping);

        // 17. Generer les tests Pact Consumer
        generatePactConsumerTests(srcMain, contract, bianMapping);

        // 18. Generer le README
        generateReadme(projectRoot, contract, bianMapping);

        log.info("[ADAPTER-WRAPPER] ========== FIN GENERATION WRAPPER BIAN ==========");
        log.info("[ADAPTER-WRAPPER] Projet genere dans : {}", projectRoot);

        return projectRoot;
    }

    // =====================================================================
    // INITIALISATION
    // =====================================================================

    private void initPackages() {
        PKG_API_CONTROLLER = PKG_BASE + ".controller";
        PKG_API_DTO_REQUEST = PKG_BASE + ".dto.request";
        PKG_API_DTO_RESPONSE = PKG_BASE + ".dto.response";
        PKG_API_DTO_ENVELOPE = PKG_BASE + ".dto.envelope";
        PKG_API_DTO_VALIDATION = PKG_BASE + ".dto.validation";
        PKG_DOMAIN_SERVICE = PKG_BASE + ".domain.service";
        PKG_DOMAIN_EXCEPTION = PKG_BASE + ".domain.exception";
        PKG_INFRA_REST_ADAPTER = PKG_BASE + ".infrastructure.rest.adapter";
        PKG_INFRA_REST_CONFIG = PKG_BASE + ".infrastructure.rest.config";
        PKG_INFRA_MOCK = PKG_BASE + ".infrastructure.mock";
        PKG_INFRA_IDEMPOTENCY = PKG_BASE + ".infrastructure.idempotency";
        PKG_CONFIG = PKG_BASE + ".config";
    }

    private void createDirectories(Path srcMain) throws IOException {
        String[] packages = {
                PKG_API_CONTROLLER, PKG_API_DTO_REQUEST, PKG_API_DTO_RESPONSE,
                PKG_API_DTO_ENVELOPE, PKG_API_DTO_VALIDATION,
                PKG_DOMAIN_SERVICE, PKG_DOMAIN_EXCEPTION,
                PKG_INFRA_REST_ADAPTER, PKG_INFRA_REST_CONFIG, PKG_INFRA_MOCK,
                PKG_INFRA_IDEMPOTENCY, PKG_CONFIG
        };
        for (String pkg : packages) {
            resolvePackagePath(srcMain, pkg);
        }
    }

    private BianMapping detectBianMapping(AdapterContractInfo contract) {
        BianMapping mapping = new BianMapping();
        // Utiliser le nom de l'adapter pour deduire le service domain BIAN
        String kebab = contract.toKebabCase();
        mapping.setServiceDomain(kebab);
        mapping.setBianId("SD0000"); // Sera affine par l'auto-detecteur
        mapping.setAction("retrieve");
        mapping.setUrl("/api/v1/" + kebab);
        return mapping;
    }

    // =====================================================================
    // COUCHE API : DTOs Request/Response
    // =====================================================================

    private void generateRequestDto(Path srcMain, EndpointInfo ep) throws IOException {
        String dtoName = ep.toRequestDtoName();
        Path dir = resolvePackagePath(srcMain, PKG_API_DTO_REQUEST);
        Path file = dir.resolve(dtoName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_REQUEST).append(";\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        imports.add("import com.fasterxml.jackson.annotation.JsonProperty;");
        for (FieldInfo f : ep.getRequestFields()) {
            if (f.isRequired()) imports.add("import jakarta.validation.constraints.NotNull;");
            String javaType = f.toJavaType();
            if (javaType.contains(".")) imports.add("import " + javaType + ";");
        }
        for (String imp : imports) sb.append(imp).append("\n");
        if (!imports.isEmpty()) sb.append("\n");

        sb.append("/**\n");
        sb.append(" * DTO de requete pour l'operation ").append(ep.getOperation()).append(".\n");
        if (ep.getSummary() != null) sb.append(" * ").append(ep.getSummary()).append("\n");
        sb.append(" */\n");
        sb.append("public class ").append(dtoName).append(" {\n\n");

        // Champs
        for (FieldInfo f : ep.getRequestFields()) {
            if (f.getDescription() != null && !f.getDescription().isBlank()) {
                sb.append("    /** ").append(f.getDescription()).append(" */\n");
            }
            if (f.isRequired()) sb.append("    @NotNull(message = \"").append(f.getName()).append(" est obligatoire\")\n");
            sb.append("    @JsonProperty(\"").append(f.getName()).append("\")\n");
            sb.append("    private ").append(simpleType(f.toJavaType())).append(" ").append(f.getName()).append(";\n\n");
        }

        // Constructeur vide
        sb.append("    public ").append(dtoName).append("() {}\n\n");

        // Getters & Setters
        for (FieldInfo f : ep.getRequestFields()) {
            String type = simpleType(f.toJavaType());
            String cap = capitalize(f.getName());
            sb.append("    public ").append(type).append(" get").append(cap).append("() { return ").append(f.getName()).append("; }\n");
            sb.append("    public void set").append(cap).append("(").append(type).append(" ").append(f.getName()).append(") { this.").append(f.getName()).append(" = ").append(f.getName()).append("; }\n\n");
        }

        sb.append("}\n");
        Files.writeString(file, sb.toString());
        log.info("[ADAPTER-WRAPPER] Request DTO genere : {}", dtoName);
    }

    private void generateResponseDto(Path srcMain, EndpointInfo ep) throws IOException {
        String dtoName = ep.toResponseDtoName();
        Path dir = resolvePackagePath(srcMain, PKG_API_DTO_RESPONSE);
        Path file = dir.resolve(dtoName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_RESPONSE).append(";\n\n");

        Set<String> imports = new TreeSet<>();
        imports.add("import com.fasterxml.jackson.annotation.JsonProperty;");
        for (FieldInfo f : ep.getResponseFields()) {
            String javaType = f.toJavaType();
            if (javaType.contains(".")) imports.add("import " + javaType + ";");
        }
        for (String imp : imports) sb.append(imp).append("\n");
        if (!imports.isEmpty()) sb.append("\n");

        sb.append("/**\n");
        sb.append(" * DTO de reponse pour l'operation ").append(ep.getOperation()).append(".\n");
        sb.append(" */\n");
        sb.append("public class ").append(dtoName).append(" {\n\n");

        for (FieldInfo f : ep.getResponseFields()) {
            if (f.getDescription() != null && !f.getDescription().isBlank()) {
                sb.append("    /** ").append(f.getDescription()).append(" */\n");
            }
            sb.append("    @JsonProperty(\"").append(f.getName()).append("\")\n");
            sb.append("    private ").append(simpleType(f.toJavaType())).append(" ").append(f.getName()).append(";\n\n");
        }

        sb.append("    public ").append(dtoName).append("() {}\n\n");

        for (FieldInfo f : ep.getResponseFields()) {
            String type = simpleType(f.toJavaType());
            String cap = capitalize(f.getName());
            sb.append("    public ").append(type).append(" get").append(cap).append("() { return ").append(f.getName()).append("; }\n");
            sb.append("    public void set").append(cap).append("(").append(type).append(" ").append(f.getName()).append(") { this.").append(f.getName()).append(" = ").append(f.getName()).append("; }\n\n");
        }

        sb.append("}\n");
        Files.writeString(file, sb.toString());
        log.info("[ADAPTER-WRAPPER] Response DTO genere : {}", dtoName);
    }

    // =====================================================================
    // COUCHE API : Enveloppe (reutilise le pattern ACL existant)
    // =====================================================================

    private void generateEnvelopeClasses(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_API_DTO_ENVELOPE);

        // --- ApiRequest.java ---
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_ENVELOPE).append(";\n\n");
        sb.append("import com.fasterxml.jackson.annotation.JsonProperty;\n");
        sb.append("import jakarta.validation.Valid;\n");
        sb.append("import jakarta.validation.constraints.NotBlank;\n");
        sb.append("import jakarta.validation.constraints.NotNull;\n\n");
        sb.append("/**\n");
        sb.append(" * Enveloppe standardisee pour les requetes entrantes de l'API BIAN.\n");
        sb.append(" * Tous les clients doivent envoyer leurs requetes dans ce format.\n");
        sb.append(" *\n");
        sb.append(" * @param <T> le type du payload metier\n");
        sb.append(" */\n");
        sb.append("public class ApiRequest<T> {\n\n");
        sb.append("    @NotBlank(message = \"request_id est obligatoire\")\n");
        sb.append("    @JsonProperty(\"request_id\")\n");
        sb.append("    private String requestId;\n\n");
        sb.append("    @NotBlank(message = \"source_system est obligatoire\")\n");
        sb.append("    @JsonProperty(\"source_system\")\n");
        sb.append("    private String sourceSystem;\n\n");
        sb.append("    @NotBlank(message = \"timestamp est obligatoire\")\n");
        sb.append("    @JsonProperty(\"timestamp\")\n");
        sb.append("    private String timestamp;\n\n");
        sb.append("    @NotNull(message = \"payload est obligatoire\")\n");
        sb.append("    @Valid\n");
        sb.append("    @JsonProperty(\"payload\")\n");
        sb.append("    private T payload;\n\n");
        sb.append("    public ApiRequest() {}\n\n");
        sb.append("    public ApiRequest(String requestId, String sourceSystem, String timestamp, T payload) {\n");
        sb.append("        this.requestId = requestId;\n");
        sb.append("        this.sourceSystem = sourceSystem;\n");
        sb.append("        this.timestamp = timestamp;\n");
        sb.append("        this.payload = payload;\n");
        sb.append("    }\n\n");
        sb.append("    public String getRequestId() { return requestId; }\n");
        sb.append("    public void setRequestId(String requestId) { this.requestId = requestId; }\n");
        sb.append("    public String getSourceSystem() { return sourceSystem; }\n");
        sb.append("    public void setSourceSystem(String sourceSystem) { this.sourceSystem = sourceSystem; }\n");
        sb.append("    public String getTimestamp() { return timestamp; }\n");
        sb.append("    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }\n");
        sb.append("    public T getPayload() { return payload; }\n");
        sb.append("    public void setPayload(T payload) { this.payload = payload; }\n");
        sb.append("}\n");
        Files.writeString(dir.resolve("ApiRequest.java"), sb.toString());

        // --- ApiResponse.java ---
        sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_ENVELOPE).append(";\n\n");
        sb.append("import com.fasterxml.jackson.annotation.JsonProperty;\n\n");
        sb.append("/**\n");
        sb.append(" * Enveloppe standardisee pour les reponses de l'API BIAN.\n");
        sb.append(" *\n");
        sb.append(" * @param <T> le type du payload metier de reponse\n");
        sb.append(" */\n");
        sb.append("public class ApiResponse<T> {\n\n");
        sb.append("    @JsonProperty(\"request_id\")\n");
        sb.append("    private String requestId;\n\n");
        sb.append("    @JsonProperty(\"source_system\")\n");
        sb.append("    private String sourceSystem;\n\n");
        sb.append("    @JsonProperty(\"timestamp\")\n");
        sb.append("    private String timestamp;\n\n");
        sb.append("    @JsonProperty(\"status\")\n");
        sb.append("    private String status;\n\n");
        sb.append("    @JsonProperty(\"payload\")\n");
        sb.append("    private T payload;\n\n");
        sb.append("    public ApiResponse() {}\n\n");
        sb.append("    public ApiResponse(String requestId, String sourceSystem, String timestamp, String status, T payload) {\n");
        sb.append("        this.requestId = requestId;\n");
        sb.append("        this.sourceSystem = sourceSystem;\n");
        sb.append("        this.timestamp = timestamp;\n");
        sb.append("        this.status = status;\n");
        sb.append("        this.payload = payload;\n");
        sb.append("    }\n\n");
        sb.append("    public static <T> ApiResponse<T> success(String requestId, T payload) {\n");
        sb.append("        return new ApiResponse<>(requestId, \"bian-api\", java.time.Instant.now().toString(), \"SUCCESS\", payload);\n");
        sb.append("    }\n\n");
        sb.append("    public static <T> ApiResponse<T> error(String requestId, String status, T payload) {\n");
        sb.append("        return new ApiResponse<>(requestId, \"bian-api\", java.time.Instant.now().toString(), status, payload);\n");
        sb.append("    }\n\n");
        sb.append("    public String getRequestId() { return requestId; }\n");
        sb.append("    public void setRequestId(String requestId) { this.requestId = requestId; }\n");
        sb.append("    public String getSourceSystem() { return sourceSystem; }\n");
        sb.append("    public void setSourceSystem(String sourceSystem) { this.sourceSystem = sourceSystem; }\n");
        sb.append("    public String getTimestamp() { return timestamp; }\n");
        sb.append("    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }\n");
        sb.append("    public String getStatus() { return status; }\n");
        sb.append("    public void setStatus(String status) { this.status = status; }\n");
        sb.append("    public T getPayload() { return payload; }\n");
        sb.append("    public void setPayload(T payload) { this.payload = payload; }\n");
        sb.append("}\n");
        Files.writeString(dir.resolve("ApiResponse.java"), sb.toString());
        log.info("[ADAPTER-WRAPPER] Enveloppes generees : ApiRequest<T>, ApiResponse<T>");
    }

    // =====================================================================
    // COUCHE API : Validation
    // =====================================================================

    private void generateValidationAnnotations(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_API_DTO_VALIDATION);

        // ValidRIB
        Files.writeString(dir.resolve("ValidRIB.java"),
                "package " + PKG_API_DTO_VALIDATION + ";\n\n" +
                "import jakarta.validation.Constraint;\nimport jakarta.validation.Payload;\nimport java.lang.annotation.*;\n\n" +
                "@Documented\n@Constraint(validatedBy = ValidRIBValidator.class)\n@Target({ElementType.FIELD, ElementType.PARAMETER})\n@Retention(RetentionPolicy.RUNTIME)\n" +
                "public @interface ValidRIB {\n    String message() default \"RIB invalide\";\n    Class<?>[] groups() default {};\n    Class<? extends Payload>[] payload() default {};\n}\n");

        Files.writeString(dir.resolve("ValidRIBValidator.java"),
                "package " + PKG_API_DTO_VALIDATION + ";\n\n" +
                "import jakarta.validation.ConstraintValidator;\nimport jakarta.validation.ConstraintValidatorContext;\n\n" +
                "public class ValidRIBValidator implements ConstraintValidator<ValidRIB, String> {\n" +
                "    @Override\n    public boolean isValid(String value, ConstraintValidatorContext context) {\n" +
                "        if (value == null || value.isBlank()) return true;\n" +
                "        return value.matches(\"^[0-9]{24}$\");\n    }\n}\n");

        Files.writeString(dir.resolve("ValidIBAN.java"),
                "package " + PKG_API_DTO_VALIDATION + ";\n\n" +
                "import jakarta.validation.Constraint;\nimport jakarta.validation.Payload;\nimport java.lang.annotation.*;\n\n" +
                "@Documented\n@Constraint(validatedBy = ValidIBANValidator.class)\n@Target({ElementType.FIELD, ElementType.PARAMETER})\n@Retention(RetentionPolicy.RUNTIME)\n" +
                "public @interface ValidIBAN {\n    String message() default \"IBAN invalide\";\n    Class<?>[] groups() default {};\n    Class<? extends Payload>[] payload() default {};\n}\n");

        Files.writeString(dir.resolve("ValidIBANValidator.java"),
                "package " + PKG_API_DTO_VALIDATION + ";\n\n" +
                "import jakarta.validation.ConstraintValidator;\nimport jakarta.validation.ConstraintValidatorContext;\n\n" +
                "public class ValidIBANValidator implements ConstraintValidator<ValidIBAN, String> {\n" +
                "    @Override\n    public boolean isValid(String value, ConstraintValidatorContext context) {\n" +
                "        if (value == null || value.isBlank()) return true;\n" +
                "        return value.matches(\"^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$\");\n    }\n}\n");

        log.info("[ADAPTER-WRAPPER] Annotations de validation generees");
    }

    // =====================================================================
    // COUCHE DOMAIN : Exceptions
    // =====================================================================

    private void generateDomainExceptions(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_DOMAIN_EXCEPTION);

        Files.writeString(dir.resolve("ApiException.java"),
                "package " + PKG_DOMAIN_EXCEPTION + ";\n\n" +
                "/**\n * Exception metier de l'API BIAN.\n */\n" +
                "public class ApiException extends RuntimeException {\n" +
                "    private final String code;\n    private final int httpStatus;\n\n" +
                "    public ApiException(String code, String message, int httpStatus) {\n" +
                "        super(message);\n        this.code = code;\n        this.httpStatus = httpStatus;\n    }\n\n" +
                "    public ApiException(String code, String message, int httpStatus, Throwable cause) {\n" +
                "        super(message, cause);\n        this.code = code;\n        this.httpStatus = httpStatus;\n    }\n\n" +
                "    public String getCode() { return code; }\n" +
                "    public int getHttpStatus() { return httpStatus; }\n}\n");

        Files.writeString(dir.resolve("IdempotencyConflictException.java"),
                "package " + PKG_DOMAIN_EXCEPTION + ";\n\n" +
                "/**\n * Exception levee quand une requete idempotente est deja en cours de traitement.\n */\n" +
                "public class IdempotencyConflictException extends ApiException {\n" +
                "    public IdempotencyConflictException(String requestId) {\n" +
                "        super(\"IDEMPOTENCY_CONFLICT\", \"Requete \" + requestId + \" deja en cours de traitement\", 409);\n" +
                "    }\n}\n");

        log.info("[ADAPTER-WRAPPER] Exceptions Domain generees");
    }

    // =====================================================================
    // COUCHE DOMAIN : Service Interface
    // =====================================================================

    private void generateServiceInterface(Path srcMain, AdapterContractInfo contract, BianMapping bianMapping) throws IOException {
        String serviceName = contract.toServiceName();
        Path dir = resolvePackagePath(srcMain, PKG_DOMAIN_SERVICE);
        Path file = dir.resolve(serviceName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_DOMAIN_SERVICE).append(";\n\n");

        Set<String> imports = new TreeSet<>();
        for (EndpointInfo ep : contract.getEndpoints()) {
            imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.toRequestDtoName() + ";");
            imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.toResponseDtoName() + ";");
        }
        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        sb.append("/**\n");
        sb.append(" * Interface du service BIAN pour le domaine ").append(bianMapping.getServiceDomainTitle()).append(".\n");
        sb.append(" * Adapter: ").append(contract.getAdapterName()).append("\n");
        sb.append(" *\n");
        sb.append(" * Implementations :\n");
        sb.append(" * - RestAdapter (profil 'rest') : appelle l'adapter WebSphere via HTTP\n");
        sb.append(" * - MockAdapter (profil 'mock') : donnees simulees pour les tests\n");
        sb.append(" */\n");
        sb.append("public interface ").append(serviceName).append(" {\n\n");

        for (EndpointInfo ep : contract.getEndpoints()) {
            sb.append("    /**\n");
            sb.append("     * ").append(ep.getSummary()).append("\n");
            sb.append("     */\n");
            sb.append("    ").append(ep.toResponseDtoName()).append(" ").append(ep.toMethodName());
            sb.append("(String crReferenceId, ").append(ep.toRequestDtoName()).append(" request);\n\n");
        }

        sb.append("}\n");
        Files.writeString(file, sb.toString());
        log.info("[ADAPTER-WRAPPER] Service Interface genere : {}", serviceName);
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : RestAdapter avec Resilience
    // =====================================================================

    private void generateRestAdapter(Path srcMain, AdapterContractInfo contract, BianMapping bianMapping) throws IOException {
        String adapterName = toPascalCase(contract.toKebabCase()) + "RestAdapter";
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_REST_ADAPTER);
        Path file = dir.resolve(adapterName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_REST_ADAPTER).append(";\n\n");

        Set<String> imports = new TreeSet<>();
        for (EndpointInfo ep : contract.getEndpoints()) {
            imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.toRequestDtoName() + ";");
            imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.toResponseDtoName() + ";");
        }
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + contract.toServiceName() + ";");
        imports.add("import " + PKG_DOMAIN_EXCEPTION + ".ApiException;");
        imports.add("import " + PKG_INFRA_IDEMPOTENCY + ".IdempotencyService;");
        imports.add("import org.slf4j.Logger;");
        imports.add("import org.slf4j.LoggerFactory;");
        imports.add("import org.springframework.beans.factory.annotation.Value;");
        imports.add("import org.springframework.context.annotation.Profile;");
        imports.add("import org.springframework.stereotype.Service;");
        imports.add("import org.springframework.web.client.RestTemplate;");
        imports.add("import org.springframework.web.client.HttpClientErrorException;");
        imports.add("import org.springframework.web.client.HttpServerErrorException;");
        imports.add("import org.springframework.web.client.ResourceAccessException;");
        imports.add("import org.springframework.http.HttpEntity;");
        imports.add("import org.springframework.http.HttpHeaders;");
        imports.add("import org.springframework.http.MediaType;");
        imports.add("import org.springframework.http.ResponseEntity;");
        imports.add("import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;");
        imports.add("import io.github.resilience4j.retry.annotation.Retry;");
        imports.add("import io.github.resilience4j.bulkhead.annotation.Bulkhead;");

        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        sb.append("/**\n");
        sb.append(" * Adapter REST pour le domaine BIAN ").append(bianMapping.getServiceDomainTitle()).append(".\n");
        sb.append(" * Appelle l'adapter WebSphere (").append(contract.getAdapterName()).append(") via HTTP/REST.\n");
        sb.append(" *\n");
        sb.append(" * Resilience :\n");
        sb.append(" * - Circuit Breaker : coupe les appels si l'adapter est en panne\n");
        sb.append(" * - Retry : reessaye automatiquement en cas d'erreur transitoire\n");
        sb.append(" * - Bulkhead : limite le nombre d'appels concurrents\n");
        sb.append(" * - Idempotency : empeche les doublons pour les operations idempotentes\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        sb.append("@Profile(\"rest\")\n");
        sb.append("public class ").append(adapterName).append(" implements ").append(contract.toServiceName()).append(" {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");
        sb.append("    private final RestTemplate restTemplate;\n");
        sb.append("    private final IdempotencyService idempotencyService;\n\n");
        sb.append("    @Value(\"${adapter.websphere.base-url:").append(contract.getAdapterBaseUrl()).append("}\")\n");
        sb.append("    private String adapterBaseUrl;\n\n");

        sb.append("    public ").append(adapterName).append("(RestTemplate restTemplate, IdempotencyService idempotencyService) {\n");
        sb.append("        this.restTemplate = restTemplate;\n");
        sb.append("        this.idempotencyService = idempotencyService;\n");
        sb.append("    }\n\n");

        // Methodes
        for (EndpointInfo ep : contract.getEndpoints()) {
            String methodName = ep.toMethodName();
            String requestDto = ep.toRequestDtoName();
            String responseDto = ep.toResponseDtoName();
            String fallbackName = methodName + "Fallback";

            sb.append("    @CircuitBreaker(name = \"restAdapter\", fallbackMethod = \"").append(fallbackName).append("\")\n");
            sb.append("    @Retry(name = \"restAdapter\")\n");
            sb.append("    @Bulkhead(name = \"restAdapter\")\n");
            sb.append("    @Override\n");
            sb.append("    public ").append(responseDto).append(" ").append(methodName);
            sb.append("(String crReferenceId, ").append(requestDto).append(" request) {\n");

            sb.append("        log.info(\"[REST-CALL] ").append(ep.getOperation()).append(" -> {} | crRef={}\", adapterBaseUrl, crReferenceId);\n");

            // Idempotency check
            if (ep.isIdempotent()) {
                sb.append("        // Verification d'idempotence\n");
                sb.append("        idempotencyService.checkAndMark(crReferenceId + \"-").append(methodName).append("\");\n");
            }

            sb.append("        String url = adapterBaseUrl + \"").append(ep.getPath()).append("\";\n");
            sb.append("        try {\n");
            sb.append("            HttpHeaders headers = new HttpHeaders();\n");
            sb.append("            headers.setContentType(MediaType.APPLICATION_JSON);\n");
            sb.append("            headers.set(\"X-Correlation-Id\", crReferenceId);\n");
            sb.append("            HttpEntity<").append(requestDto).append("> entity = new HttpEntity<>(request, headers);\n");
            sb.append("            long start = System.currentTimeMillis();\n");
            sb.append("            ResponseEntity<").append(responseDto).append("> response = restTemplate.postForEntity(url, entity, ").append(responseDto).append(".class);\n");
            sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.getOperation()).append(" en {}ms — HTTP {}\", System.currentTimeMillis() - start, response.getStatusCode());\n");
            sb.append("            return response.getBody();\n");
            sb.append("        } catch (HttpClientErrorException e) {\n");
            sb.append("            log.error(\"[REST-ERROR] Erreur client HTTP {} pour ").append(ep.getOperation()).append(" : {}\", e.getStatusCode(), e.getResponseBodyAsString());\n");
            sb.append("            throw new ApiException(\"ADAPTER_CLIENT_ERROR\", \"Erreur client adapter : \" + e.getMessage(), e.getStatusCode().value(), e);\n");
            sb.append("        } catch (HttpServerErrorException e) {\n");
            sb.append("            log.error(\"[REST-ERROR] Erreur serveur HTTP {} pour ").append(ep.getOperation()).append(" : {}\", e.getStatusCode(), e.getResponseBodyAsString());\n");
            sb.append("            throw new ApiException(\"ADAPTER_SERVER_ERROR\", \"Erreur serveur adapter : \" + e.getMessage(), e.getStatusCode().value(), e);\n");
            sb.append("        } catch (ResourceAccessException e) {\n");
            sb.append("            log.error(\"[REST-ERROR] Adapter inaccessible pour ").append(ep.getOperation()).append(" : {}\", e.getMessage());\n");
            sb.append("            throw new ApiException(\"ADAPTER_UNREACHABLE\", \"Adapter inaccessible : \" + e.getMessage(), 503, e);\n");
            sb.append("        }\n");
            sb.append("    }\n\n");

            // Fallback
            sb.append("    public ").append(responseDto).append(" ").append(fallbackName);
            sb.append("(String crReferenceId, ").append(requestDto).append(" request, Throwable t) {\n");
            sb.append("        log.error(\"[RESILIENCE-FALLBACK] Adapter indisponible pour ").append(ep.getOperation()).append(" — cause : {}\", t.getMessage());\n");
            sb.append("        throw new RuntimeException(\"Adapter temporairement indisponible (").append(ep.getOperation()).append("). Veuillez reessayer plus tard.\", t);\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");
        Files.writeString(file, sb.toString());
        log.info("[ADAPTER-WRAPPER] RestAdapter genere : {}", adapterName);
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : IdempotencyService
    // =====================================================================

    private void generateIdempotencyService(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_IDEMPOTENCY);

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_IDEMPOTENCY).append(";\n\n");
        sb.append("import ").append(PKG_DOMAIN_EXCEPTION).append(".IdempotencyConflictException;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.stereotype.Service;\n\n");
        sb.append("import java.util.concurrent.ConcurrentHashMap;\n");
        sb.append("import java.util.concurrent.ConcurrentMap;\n\n");

        sb.append("/**\n");
        sb.append(" * Service d'idempotence pour eviter les doublons de requetes.\n");
        sb.append(" *\n");
        sb.append(" * Utilise un ConcurrentHashMap en memoire (adapte pour un seul noeud).\n");
        sb.append(" * Pour un deploiement multi-noeud, remplacer par Redis ou une table DB.\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        sb.append("public class IdempotencyService {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(IdempotencyService.class);\n\n");
        sb.append("    private final ConcurrentMap<String, Long> processedRequests = new ConcurrentHashMap<>();\n\n");
        sb.append("    /** TTL des cles d'idempotence en millisecondes (defaut: 1 heure) */\n");
        sb.append("    private static final long TTL_MS = 3_600_000L;\n\n");

        sb.append("    /**\n");
        sb.append("     * Verifie si la requete a deja ete traitee. Si non, la marque comme en cours.\n");
        sb.append("     *\n");
        sb.append("     * @param idempotencyKey cle unique de la requete (ex: requestId + operation)\n");
        sb.append("     * @throws IdempotencyConflictException si la requete est deja en cours\n");
        sb.append("     */\n");
        sb.append("    public void checkAndMark(String idempotencyKey) {\n");
        sb.append("        cleanup();\n");
        sb.append("        Long existing = processedRequests.putIfAbsent(idempotencyKey, System.currentTimeMillis());\n");
        sb.append("        if (existing != null) {\n");
        sb.append("            log.warn(\"[IDEMPOTENCY] Requete dupliquee detectee : {}\", idempotencyKey);\n");
        sb.append("            throw new IdempotencyConflictException(idempotencyKey);\n");
        sb.append("        }\n");
        sb.append("        log.debug(\"[IDEMPOTENCY] Cle enregistree : {}\", idempotencyKey);\n");
        sb.append("    }\n\n");

        sb.append("    /**\n");
        sb.append("     * Marque une requete comme terminee (libere la cle).\n");
        sb.append("     */\n");
        sb.append("    public void complete(String idempotencyKey) {\n");
        sb.append("        processedRequests.remove(idempotencyKey);\n");
        sb.append("        log.debug(\"[IDEMPOTENCY] Cle liberee : {}\", idempotencyKey);\n");
        sb.append("    }\n\n");

        sb.append("    /** Nettoyage des cles expirees */\n");
        sb.append("    private void cleanup() {\n");
        sb.append("        long now = System.currentTimeMillis();\n");
        sb.append("        processedRequests.entrySet().removeIf(e -> (now - e.getValue()) > TTL_MS);\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.writeString(dir.resolve("IdempotencyService.java"), sb.toString());
        log.info("[ADAPTER-WRAPPER] IdempotencyService genere");
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : MockAdapter
    // =====================================================================

    private void generateMockAdapter(Path srcMain, AdapterContractInfo contract, BianMapping bianMapping) throws IOException {
        String adapterName = toPascalCase(contract.toKebabCase()) + "MockAdapter";
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_MOCK);
        Path file = dir.resolve(adapterName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_MOCK).append(";\n\n");

        Set<String> imports = new TreeSet<>();
        for (EndpointInfo ep : contract.getEndpoints()) {
            imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.toRequestDtoName() + ";");
            imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.toResponseDtoName() + ";");
        }
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + contract.toServiceName() + ";");
        imports.add("import org.slf4j.Logger;");
        imports.add("import org.slf4j.LoggerFactory;");
        imports.add("import org.springframework.context.annotation.Profile;");
        imports.add("import org.springframework.stereotype.Service;");
        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        sb.append("@Service\n@Profile(\"mock\")\n");
        sb.append("public class ").append(adapterName).append(" implements ").append(contract.toServiceName()).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");

        for (EndpointInfo ep : contract.getEndpoints()) {
            sb.append("    @Override\n");
            sb.append("    public ").append(ep.toResponseDtoName()).append(" ").append(ep.toMethodName());
            sb.append("(String crReferenceId, ").append(ep.toRequestDtoName()).append(" request) {\n");
            sb.append("        log.info(\"[MOCK] ").append(ep.toMethodName()).append(" appele | crRef={}\", crReferenceId);\n");
            sb.append("        ").append(ep.toResponseDtoName()).append(" response = new ").append(ep.toResponseDtoName()).append("();\n");

            // Mock values
            for (FieldInfo f : ep.getResponseFields()) {
                String setter = "set" + capitalize(f.getName());
                String mockValue = getMockValue(f);
                sb.append("        response.").append(setter).append("(").append(mockValue).append(");\n");
            }

            sb.append("        return response;\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");
        Files.writeString(file, sb.toString());
        log.info("[ADAPTER-WRAPPER] MockAdapter genere : {}", adapterName);
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : RestClientConfig
    // =====================================================================

    private void generateRestClientConfig(Path srcMain, AdapterContractInfo contract) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_REST_CONFIG);
        Path file = dir.resolve("RestClientConfig.java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_REST_CONFIG).append(";\n\n");
        sb.append("import org.springframework.beans.factory.annotation.Value;\n");
        sb.append("import org.springframework.context.annotation.Bean;\n");
        sb.append("import org.springframework.context.annotation.Configuration;\n");
        sb.append("import org.springframework.context.annotation.Profile;\n");
        sb.append("import org.springframework.http.client.SimpleClientHttpRequestFactory;\n");
        sb.append("import org.springframework.web.client.RestTemplate;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n\n");

        sb.append("@Configuration\n@Profile(\"rest\")\n");
        sb.append("public class RestClientConfig {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(RestClientConfig.class);\n\n");
        sb.append("    @Value(\"${adapter.websphere.connect-timeout:5000}\")\n");
        sb.append("    private int connectTimeout;\n\n");
        sb.append("    @Value(\"${adapter.websphere.read-timeout:30000}\")\n");
        sb.append("    private int readTimeout;\n\n");

        sb.append("    @Bean\n");
        sb.append("    public RestTemplate restTemplate() {\n");
        sb.append("        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();\n");
        sb.append("        factory.setConnectTimeout(connectTimeout);\n");
        sb.append("        factory.setReadTimeout(readTimeout);\n");
        sb.append("        RestTemplate restTemplate = new RestTemplate(factory);\n\n");
        sb.append("        restTemplate.getInterceptors().add((request, body, execution) -> {\n");
        sb.append("            log.debug(\"[REST-OUT] {} {} — body: {} bytes\", request.getMethod(), request.getURI(), body.length);\n");
        sb.append("            var response = execution.execute(request, body);\n");
        sb.append("            log.debug(\"[REST-IN] HTTP {}\", response.getStatusCode());\n");
        sb.append("            return response;\n");
        sb.append("        });\n\n");
        sb.append("        log.info(\"[REST-CONFIG] RestTemplate configure — connectTimeout={}ms, readTimeout={}ms\", connectTimeout, readTimeout);\n");
        sb.append("        return restTemplate;\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ADAPTER-WRAPPER] RestClientConfig genere");
    }

    // =====================================================================
    // COUCHE API : Controller BIAN
    // =====================================================================

    private void generateBianController(Path srcMain, AdapterContractInfo contract, BianMapping bianMapping) throws IOException {
        String controllerName = contract.toControllerName();
        Path dir = resolvePackagePath(srcMain, PKG_API_CONTROLLER);
        Path file = dir.resolve(controllerName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_CONTROLLER).append(";\n\n");

        Set<String> imports = new TreeSet<>();
        for (EndpointInfo ep : contract.getEndpoints()) {
            imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.toRequestDtoName() + ";");
            imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.toResponseDtoName() + ";");
        }
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + contract.toServiceName() + ";");
        imports.add("import " + PKG_API_DTO_ENVELOPE + ".ApiRequest;");
        imports.add("import " + PKG_API_DTO_ENVELOPE + ".ApiResponse;");
        imports.add("import io.swagger.v3.oas.annotations.Operation;");
        imports.add("import io.swagger.v3.oas.annotations.Parameter;");
        imports.add("import io.swagger.v3.oas.annotations.tags.Tag;");
        imports.add("import jakarta.validation.Valid;");
        imports.add("import org.slf4j.Logger;");
        imports.add("import org.slf4j.LoggerFactory;");
        imports.add("import org.springframework.http.ResponseEntity;");
        imports.add("import org.springframework.validation.annotation.Validated;");
        imports.add("import org.springframework.web.bind.annotation.*;");

        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        String basePath = "/api/v1/" + contract.toKebabCase();
        sb.append("@RestController\n");
        sb.append("@RequestMapping(\"").append(basePath).append("\")\n");
        sb.append("@Validated\n");
        sb.append("@Tag(name = \"").append(bianMapping.getServiceDomainTitle()).append("\", description = \"BIAN ").append(bianMapping.getBianId()).append(" — ").append(bianMapping.getServiceDomainTitle()).append("\")\n");
        sb.append("public class ").append(controllerName).append(" {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(controllerName).append(".class);\n");
        sb.append("    private final ").append(contract.toServiceName()).append(" service;\n\n");

        sb.append("    public ").append(controllerName).append("(").append(contract.toServiceName()).append(" service) {\n");
        sb.append("        this.service = service;\n");
        sb.append("    }\n\n");

        for (EndpointInfo ep : contract.getEndpoints()) {
            String methodName = ep.toMethodName();
            String requestDto = ep.toRequestDtoName();
            String responseDto = ep.toResponseDtoName();
            String endpointPath = "/{cr-reference-id}/" + toKebabCase(ep.getOperation());

            sb.append("    @Operation(operationId = \"").append(methodName).append("\",\n");
            sb.append("               summary = \"").append(ep.getSummary()).append("\")\n");
            sb.append("    @PostMapping(\"").append(endpointPath).append("\")\n");
            sb.append("    public ResponseEntity<ApiResponse<").append(responseDto).append(">> ").append(methodName).append("(\n");
            sb.append("            @Parameter(description = \"Control Record Reference ID\")\n");
            sb.append("            @PathVariable(\"cr-reference-id\") String crReferenceId,\n");
            sb.append("            @Valid @RequestBody ApiRequest<").append(requestDto).append("> envelope) {\n\n");

            sb.append("        log.info(\"[REST-IN] POST ").append(basePath).append("{} | request_id={} | source={}\",\n");
            sb.append("                \"").append(endpointPath).append("\", envelope.getRequestId(), envelope.getSourceSystem());\n");
            sb.append("        try {\n");
            sb.append("            ").append(requestDto).append(" payload = envelope.getPayload();\n");
            sb.append("            ").append(responseDto).append(" result = service.").append(methodName).append("(crReferenceId, payload);\n");
            sb.append("            ApiResponse<").append(responseDto).append("> apiResponse = ApiResponse.success(envelope.getRequestId(), result);\n");
            sb.append("            log.info(\"[REST-OUT] 200 OK | request_id={}\", envelope.getRequestId());\n");
            sb.append("            return ResponseEntity.ok(apiResponse);\n");
            sb.append("        } catch (Exception e) {\n");
            sb.append("            log.error(\"[REST-ERROR] ").append(methodName).append(" failed | request_id={}\", envelope.getRequestId(), e);\n");
            sb.append("            throw e;\n");
            sb.append("        }\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");
        Files.writeString(file, sb.toString());
        log.info("[ADAPTER-WRAPPER] Controller BIAN genere : {}", controllerName);
    }

    // =====================================================================
    // CONFIG : GlobalExceptionHandler
    // =====================================================================

    private void generateGlobalExceptionHandler(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_CONFIG);
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_CONFIG).append(";\n\n");
        sb.append("import ").append(PKG_DOMAIN_EXCEPTION).append(".ApiException;\n");
        sb.append("import ").append(PKG_API_DTO_ENVELOPE).append(".ApiResponse;\n");
        sb.append("import org.slf4j.Logger;\nimport org.slf4j.LoggerFactory;\nimport org.slf4j.MDC;\n");
        sb.append("import org.springframework.http.HttpStatus;\nimport org.springframework.http.ResponseEntity;\n");
        sb.append("import org.springframework.web.bind.MethodArgumentNotValidException;\n");
        sb.append("import org.springframework.web.bind.annotation.ControllerAdvice;\nimport org.springframework.web.bind.annotation.ExceptionHandler;\n\n");
        sb.append("import java.util.LinkedHashMap;\nimport java.util.Map;\nimport java.util.stream.Collectors;\n\n");

        sb.append("@ControllerAdvice\npublic class GlobalExceptionHandler {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);\n\n");

        sb.append("    private Map<String, Object> buildErrorPayload(String code, String message) {\n");
        sb.append("        Map<String, Object> payload = new LinkedHashMap<>();\n");
        sb.append("        payload.put(\"code\", code);\n        payload.put(\"message\", message);\n");
        sb.append("        String correlationId = MDC.get(\"correlationId\");\n");
        sb.append("        if (correlationId != null) payload.put(\"correlationId\", correlationId);\n");
        sb.append("        return payload;\n    }\n\n");

        sb.append("    @ExceptionHandler(ApiException.class)\n");
        sb.append("    public ResponseEntity<ApiResponse<Map<String, Object>>> handleApiException(ApiException ex) {\n");
        sb.append("        log.warn(\"[EXCEPTION] ApiException: {} (code={})\", ex.getMessage(), ex.getCode());\n");
        sb.append("        Map<String, Object> payload = buildErrorPayload(ex.getCode(), ex.getMessage());\n");
        sb.append("        ApiResponse<Map<String, Object>> response = ApiResponse.error(null, \"ERROR\", payload);\n");
        sb.append("        return new ResponseEntity<>(response, HttpStatus.valueOf(ex.getHttpStatus()));\n    }\n\n");

        sb.append("    @ExceptionHandler(MethodArgumentNotValidException.class)\n");
        sb.append("    public ResponseEntity<ApiResponse<Map<String, Object>>> handleValidation(MethodArgumentNotValidException ex) {\n");
        sb.append("        String errors = ex.getBindingResult().getFieldErrors().stream()\n");
        sb.append("            .map(e -> e.getField() + \": \" + e.getDefaultMessage())\n");
        sb.append("            .collect(Collectors.joining(\", \"));\n");
        sb.append("        log.warn(\"[EXCEPTION] Validation: {}\", errors);\n");
        sb.append("        Map<String, Object> payload = buildErrorPayload(\"VALIDATION_ERROR\", errors);\n");
        sb.append("        ApiResponse<Map<String, Object>> response = ApiResponse.error(null, \"VALIDATION_ERROR\", payload);\n");
        sb.append("        return new ResponseEntity<>(response, HttpStatus.BAD_REQUEST);\n    }\n\n");

        sb.append("    @ExceptionHandler(RuntimeException.class)\n");
        sb.append("    public ResponseEntity<ApiResponse<Map<String, Object>>> handleRuntime(RuntimeException ex) {\n");
        sb.append("        log.error(\"[EXCEPTION] RuntimeException: {}\", ex.getMessage(), ex);\n");
        sb.append("        String message = ex.getMessage() != null && ex.getMessage().contains(\"temporairement indisponible\")\n");
        sb.append("            ? ex.getMessage() : \"Service temporairement indisponible\";\n");
        sb.append("        Map<String, Object> payload = buildErrorPayload(\"SERVICE_UNAVAILABLE\", message);\n");
        sb.append("        ApiResponse<Map<String, Object>> response = ApiResponse.error(null, \"SERVICE_UNAVAILABLE\", payload);\n");
        sb.append("        return new ResponseEntity<>(response, HttpStatus.SERVICE_UNAVAILABLE);\n    }\n\n");

        sb.append("    @ExceptionHandler(Exception.class)\n");
        sb.append("    public ResponseEntity<ApiResponse<Map<String, Object>>> handleGeneric(Exception ex) {\n");
        sb.append("        log.error(\"[EXCEPTION] Erreur interne: {}\", ex.getMessage(), ex);\n");
        sb.append("        Map<String, Object> payload = buildErrorPayload(\"INTERNAL_ERROR\", \"Erreur interne du serveur\");\n");
        sb.append("        ApiResponse<Map<String, Object>> response = ApiResponse.error(null, \"INTERNAL_ERROR\", payload);\n");
        sb.append("        return new ResponseEntity<>(response, HttpStatus.INTERNAL_SERVER_ERROR);\n    }\n");
        sb.append("}\n");

        Files.writeString(dir.resolve("GlobalExceptionHandler.java"), sb.toString());
        log.info("[ADAPTER-WRAPPER] GlobalExceptionHandler genere");
    }

    // =====================================================================
    // CONFIG : SecurityConfig
    // =====================================================================

    private void generateSecurityConfig(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_CONFIG);
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_CONFIG).append(";\n\n");
        sb.append("import org.springframework.context.annotation.Bean;\n");
        sb.append("import org.springframework.context.annotation.Configuration;\n");
        sb.append("import org.springframework.security.config.annotation.web.builders.HttpSecurity;\n");
        sb.append("import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;\n");
        sb.append("import org.springframework.security.web.SecurityFilterChain;\n\n");

        sb.append("@Configuration\n@EnableWebSecurity\n");
        sb.append("public class SecurityConfig {\n\n");
        sb.append("    @Bean\n");
        sb.append("    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {\n");
        sb.append("        http.csrf(csrf -> csrf.disable())\n");
        sb.append("            .authorizeHttpRequests(auth -> auth\n");
        sb.append("                .requestMatchers(\"/actuator/**\", \"/swagger-ui/**\", \"/v3/api-docs/**\").permitAll()\n");
        sb.append("                .anyRequest().authenticated()\n");
        sb.append("            );\n");
        sb.append("        return http.build();\n");
        sb.append("    }\n}\n");

        Files.writeString(dir.resolve("SecurityConfig.java"), sb.toString());
        log.info("[ADAPTER-WRAPPER] SecurityConfig genere");
    }

    // =====================================================================
    // CONFIG : Spring Profiles
    // =====================================================================

    private void generateSpringProfiles(Path srcMain, AdapterContractInfo contract) throws IOException {
        Path resourcesDir = resolveResourcesDir(srcMain);
        Files.createDirectories(resourcesDir);

        // application.properties
        Files.writeString(resourcesDir.resolve("application.properties"),
                "spring.application.name=wrapper-bian-" + contract.toKebabCase() + "\n" +
                "server.port=8080\n" +
                "spring.profiles.active=rest\n\n" +
                "# Swagger / OpenAPI\n" +
                "springdoc.api-docs.path=/v3/api-docs\n" +
                "springdoc.swagger-ui.path=/swagger-ui.html\n");

        // application-rest.properties
        Files.writeString(resourcesDir.resolve("application-rest.properties"),
                "# Configuration de l'adapter WebSphere\n" +
                "adapter.websphere.base-url=" + contract.getAdapterBaseUrl() + "\n" +
                "adapter.websphere.connect-timeout=5000\n" +
                "adapter.websphere.read-timeout=30000\n\n" +
                "# Resilience4j — Circuit Breaker\n" +
                "resilience4j.circuitbreaker.instances.restAdapter.sliding-window-size=10\n" +
                "resilience4j.circuitbreaker.instances.restAdapter.failure-rate-threshold=50\n" +
                "resilience4j.circuitbreaker.instances.restAdapter.wait-duration-in-open-state=30s\n" +
                "resilience4j.circuitbreaker.instances.restAdapter.permitted-number-of-calls-in-half-open-state=3\n\n" +
                "# Resilience4j — Retry\n" +
                "resilience4j.retry.instances.restAdapter.max-attempts=3\n" +
                "resilience4j.retry.instances.restAdapter.wait-duration=2s\n" +
                "resilience4j.retry.instances.restAdapter.enable-exponential-backoff=true\n" +
                "resilience4j.retry.instances.restAdapter.exponential-backoff-multiplier=2\n\n" +
                "# Resilience4j — Bulkhead\n" +
                "resilience4j.bulkhead.instances.restAdapter.max-concurrent-calls=25\n" +
                "resilience4j.bulkhead.instances.restAdapter.max-wait-duration=500ms\n\n" +
                "# Resilience4j — TimeLimiter\n" +
                "resilience4j.timelimiter.instances.restAdapter.timeout-duration=30s\n\n" +
                "# Actuator\n" +
                "management.endpoints.web.exposure.include=health,info,circuitbreakers,retries,bulkheads,metrics\n" +
                "management.endpoint.health.show-details=always\n" +
                "management.health.circuitbreakers.enabled=true\n");

        // application-mock.properties
        Files.writeString(resourcesDir.resolve("application-mock.properties"),
                "# Profil Mock — donnees simulees\n" +
                "spring.profiles.active=mock\n");

        log.info("[ADAPTER-WRAPPER] Profils Spring generes");
    }

    // =====================================================================
    // APPLICATION MAIN CLASS
    // =====================================================================

    private void generateApplicationClass(Path srcMain, AdapterContractInfo contract) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_BASE);
        String className = toPascalCase(contract.toKebabCase()) + "WrapperApplication";

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_BASE).append(";\n\n");
        sb.append("import org.springframework.boot.SpringApplication;\n");
        sb.append("import org.springframework.boot.autoconfigure.SpringBootApplication;\n\n");
        sb.append("@SpringBootApplication\n");
        sb.append("public class ").append(className).append(" {\n\n");
        sb.append("    public static void main(String[] args) {\n");
        sb.append("        SpringApplication.run(").append(className).append(".class, args);\n");
        sb.append("    }\n}\n");

        Files.writeString(dir.resolve(className + ".java"), sb.toString());
        log.info("[ADAPTER-WRAPPER] Application class generee : {}", className);
    }

    // =====================================================================
    // POM.XML
    // =====================================================================

    private void generatePomXml(Path projectRoot, AdapterContractInfo contract) throws IOException {
        String artifactId = "wrapper-bian-" + contract.toKebabCase();

        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<project xmlns=\"http://maven.apache.org/POM/4.0.0\"\n");
        sb.append("         xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"\n");
        sb.append("         xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd\">\n");
        sb.append("    <modelVersion>4.0.0</modelVersion>\n\n");
        sb.append("    <parent>\n");
        sb.append("        <groupId>org.springframework.boot</groupId>\n");
        sb.append("        <artifactId>spring-boot-starter-parent</artifactId>\n");
        sb.append("        <version>3.2.5</version>\n");
        sb.append("    </parent>\n\n");
        sb.append("    <groupId>com.bank.api</groupId>\n");
        sb.append("    <artifactId>").append(artifactId).append("</artifactId>\n");
        sb.append("    <version>").append(contract.getVersion()).append("</version>\n");
        sb.append("    <name>").append(contract.getAdapterName()).append(" BIAN Wrapper</name>\n");
        sb.append("    <description>").append(contract.getDescription()).append("</description>\n\n");

        sb.append("    <properties>\n");
        sb.append("        <java.version>17</java.version>\n");
        sb.append("    </properties>\n\n");

        sb.append("    <dependencies>\n");
        sb.append("        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>\n");
        sb.append("        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-validation</artifactId></dependency>\n");
        sb.append("        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-security</artifactId></dependency>\n");
        sb.append("        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-actuator</artifactId></dependency>\n");
        sb.append("        <dependency><groupId>org.springdoc</groupId><artifactId>springdoc-openapi-starter-webmvc-ui</artifactId><version>2.5.0</version></dependency>\n");
        sb.append("        <dependency><groupId>io.github.resilience4j</groupId><artifactId>resilience4j-spring-boot3</artifactId><version>2.2.0</version></dependency>\n");
        sb.append("        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-aop</artifactId></dependency>\n\n");
        sb.append("        <!-- Test -->\n");
        sb.append("        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>\n");
        sb.append("        <dependency><groupId>au.com.dius.pact.consumer</groupId><artifactId>junit5</artifactId><version>4.6.7</version><scope>test</scope></dependency>\n");
        sb.append("    </dependencies>\n\n");

        sb.append("    <build>\n");
        sb.append("        <plugins>\n");
        sb.append("            <plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin>\n");
        sb.append("        </plugins>\n");
        sb.append("    </build>\n");
        sb.append("</project>\n");

        Files.writeString(projectRoot.resolve("pom.xml"), sb.toString());
        log.info("[ADAPTER-WRAPPER] pom.xml genere");
    }

    // =====================================================================
    // TESTS D'INTEGRATION
    // =====================================================================

    private void generateIntegrationTests(Path srcMain, AdapterContractInfo contract, BianMapping bianMapping) throws IOException {
        Path testJavaRoot = resolveTestJavaRoot(srcMain);
        String testPkg = PKG_BASE + ".controller";
        Path testDir = testJavaRoot.resolve(testPkg.replace(".", "/"));
        Files.createDirectories(testDir);

        String testName = contract.toControllerName() + "Test";
        Path file = testDir.resolve(testName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(testPkg).append(";\n\n");
        sb.append("import org.junit.jupiter.api.DisplayName;\nimport org.junit.jupiter.api.Test;\n");
        sb.append("import org.springframework.beans.factory.annotation.Autowired;\n");
        sb.append("import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;\n");
        sb.append("import org.springframework.boot.test.context.SpringBootTest;\n");
        sb.append("import org.springframework.http.MediaType;\n");
        sb.append("import org.springframework.test.context.ActiveProfiles;\n");
        sb.append("import org.springframework.test.web.servlet.MockMvc;\n\n");
        sb.append("import ").append(PKG_API_DTO_ENVELOPE).append(".ApiRequest;\n");
        sb.append("import com.fasterxml.jackson.databind.ObjectMapper;\n\n");
        sb.append("import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;\n");
        sb.append("import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;\n\n");

        sb.append("@SpringBootTest\n@AutoConfigureMockMvc\n@ActiveProfiles(\"mock\")\n");
        sb.append("class ").append(testName).append(" {\n\n");
        sb.append("    @Autowired private MockMvc mockMvc;\n");
        sb.append("    @Autowired private ObjectMapper objectMapper;\n\n");

        String basePath = "/api/v1/" + contract.toKebabCase();

        for (EndpointInfo ep : contract.getEndpoints()) {
            String methodName = ep.toMethodName();
            String requestDto = ep.toRequestDtoName();
            String endpointPath = basePath + "/TEST-CR-001/" + toKebabCase(ep.getOperation());

            // Test 200 OK
            sb.append("    @Test\n");
            sb.append("    void ").append(methodName).append("_shouldReturn200() throws Exception {\n");
            sb.append("        ").append(PKG_API_DTO_REQUEST).append(".").append(requestDto).append(" payload = new ").append(PKG_API_DTO_REQUEST).append(".").append(requestDto).append("();\n");
            sb.append("        ApiRequest<").append(PKG_API_DTO_REQUEST).append(".").append(requestDto).append("> envelope = new ApiRequest<>(\n");
            sb.append("                \"test-request-001\", \"test-system\", java.time.Instant.now().toString(), payload);\n\n");
            sb.append("        mockMvc.perform(post(\"").append(endpointPath).append("\")\n");
            sb.append("                .contentType(MediaType.APPLICATION_JSON)\n");
            sb.append("                .content(objectMapper.writeValueAsString(envelope)))\n");
            sb.append("                .andExpect(status().isOk())\n");
            sb.append("                .andExpect(content().contentType(MediaType.APPLICATION_JSON));\n");
            sb.append("    }\n\n");

            // Test 400 enveloppe vide
            sb.append("    @Test\n");
            sb.append("    @DisplayName(\"Validation: ").append(methodName).append(" avec enveloppe vide doit retourner 400\")\n");
            sb.append("    void ").append(methodName).append("_withEmptyEnvelope_shouldReturn400() throws Exception {\n");
            sb.append("        mockMvc.perform(post(\"").append(endpointPath).append("\")\n");
            sb.append("                .contentType(MediaType.APPLICATION_JSON)\n");
            sb.append("                .content(\"{}\"))\n");
            sb.append("                .andExpect(status().isBadRequest());\n");
            sb.append("    }\n\n");

            // Test 400 payload null
            sb.append("    @Test\n");
            sb.append("    @DisplayName(\"Validation: ").append(methodName).append(" avec payload null doit retourner 400\")\n");
            sb.append("    void ").append(methodName).append("_withNullPayload_shouldReturn400() throws Exception {\n");
            sb.append("        String noPayload = \"{\\\"request_id\\\":\\\"test-001\\\",\\\"source_system\\\":\\\"test\\\",\\\"timestamp\\\":\\\"2026-01-01T00:00:00Z\\\"}\";\n");
            sb.append("        mockMvc.perform(post(\"").append(endpointPath).append("\")\n");
            sb.append("                .contentType(MediaType.APPLICATION_JSON)\n");
            sb.append("                .content(noPayload))\n");
            sb.append("                .andExpect(status().isBadRequest());\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");
        Files.writeString(file, sb.toString());
        log.info("[ADAPTER-WRAPPER] Tests d'integration generes : {}", testName);
    }

    // =====================================================================
    // TESTS PACT CONSUMER
    // =====================================================================

    private void generatePactConsumerTests(Path srcMain, AdapterContractInfo contract, BianMapping bianMapping) throws IOException {
        Path testJavaRoot = resolveTestJavaRoot(srcMain);
        String testPkg = PKG_BASE + ".pact";
        Path testDir = testJavaRoot.resolve(testPkg.replace(".", "/"));
        Files.createDirectories(testDir);

        String testName = toPascalCase(contract.toKebabCase()) + "PactConsumerTest";
        Path file = testDir.resolve(testName + ".java");

        String providerName = "adapter-websphere-" + contract.toKebabCase();
        String consumerName = "wrapper-bian-" + contract.toKebabCase();

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(testPkg).append(";\n\n");

        Set<String> imports = new TreeSet<>();
        for (EndpointInfo ep : contract.getEndpoints()) {
            imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.toRequestDtoName() + ";");
            imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.toResponseDtoName() + ";");
        }
        imports.add("import au.com.dius.pact.consumer.dsl.PactDslWithProvider;");
        imports.add("import au.com.dius.pact.consumer.dsl.PactDslJsonBody;");
        imports.add("import au.com.dius.pact.consumer.junit5.PactConsumerTestExt;");
        imports.add("import au.com.dius.pact.consumer.junit5.PactTestFor;");
        imports.add("import au.com.dius.pact.consumer.MockServer;");
        imports.add("import au.com.dius.pact.core.model.V4Pact;");
        imports.add("import au.com.dius.pact.core.model.annotations.Pact;");
        imports.add("import org.junit.jupiter.api.Test;");
        imports.add("import org.junit.jupiter.api.extension.ExtendWith;");
        imports.add("import org.springframework.http.*;");
        imports.add("import org.springframework.web.client.RestTemplate;");
        imports.add("import static org.junit.jupiter.api.Assertions.*;");
        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        sb.append("/**\n * Tests Pact Consumer-Driven.\n * Consumer: ").append(consumerName).append("\n * Provider: ").append(providerName).append("\n */\n");
        sb.append("@ExtendWith(PactConsumerTestExt.class)\n");
        sb.append("@PactTestFor(providerName = \"").append(providerName).append("\")\n");
        sb.append("public class ").append(testName).append(" {\n\n");

        for (EndpointInfo ep : contract.getEndpoints()) {
            String pactMethod = ep.toMethodName() + "Pact";
            String testMethod = "test" + capitalize(ep.toMethodName());

            sb.append("    @Pact(consumer = \"").append(consumerName).append("\")\n");
            sb.append("    public V4Pact ").append(pactMethod).append("(PactDslWithProvider builder) {\n");
            sb.append("        PactDslJsonBody requestBody = new PactDslJsonBody()");
            for (FieldInfo f : ep.getRequestFields()) {
                sb.append("\n                .stringType(\"").append(f.getName()).append("\", \"sample\")");
            }
            sb.append(";\n");
            sb.append("        PactDslJsonBody responseBody = new PactDslJsonBody()");
            for (FieldInfo f : ep.getResponseFields()) {
                sb.append("\n                .stringType(\"").append(f.getName()).append("\", \"sample\")");
            }
            sb.append(";\n\n");

            sb.append("        return builder\n");
            sb.append("                .given(\"Adapter ").append(contract.getAdapterName()).append(" est disponible\")\n");
            sb.append("                .uponReceiving(\"Appel ").append(ep.getOperation()).append("\")\n");
            sb.append("                .path(\"").append(ep.getPath()).append("\")\n");
            sb.append("                .method(\"POST\")\n");
            sb.append("                .headers(\"Content-Type\", \"application/json\")\n");
            sb.append("                .body(requestBody)\n");
            sb.append("                .willRespondWith()\n");
            sb.append("                .status(200)\n");
            sb.append("                .headers(java.util.Map.of(\"Content-Type\", \"application/json\"))\n");
            sb.append("                .body(responseBody)\n");
            sb.append("                .toPact(V4Pact.class);\n");
            sb.append("    }\n\n");

            sb.append("    @Test\n");
            sb.append("    @PactTestFor(pactMethod = \"").append(pactMethod).append("\")\n");
            sb.append("    void ").append(testMethod).append("(MockServer mockServer) {\n");
            sb.append("        RestTemplate restTemplate = new RestTemplate();\n");
            sb.append("        String url = mockServer.getUrl() + \"").append(ep.getPath()).append("\";\n");
            sb.append("        HttpHeaders headers = new HttpHeaders();\n");
            sb.append("        headers.setContentType(MediaType.APPLICATION_JSON);\n");
            sb.append("        ").append(ep.toRequestDtoName()).append(" request = new ").append(ep.toRequestDtoName()).append("();\n");
            sb.append("        HttpEntity<").append(ep.toRequestDtoName()).append("> entity = new HttpEntity<>(request, headers);\n");
            sb.append("        ResponseEntity<").append(ep.toResponseDtoName()).append("> response = restTemplate.postForEntity(url, entity, ").append(ep.toResponseDtoName()).append(".class);\n");
            sb.append("        assertEquals(200, response.getStatusCode().value());\n");
            sb.append("        assertNotNull(response.getBody());\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");
        Files.writeString(file, sb.toString());
        log.info("[ADAPTER-WRAPPER] Pact Consumer Tests generes : {}", testName);
    }

    // =====================================================================
    // README
    // =====================================================================

    private void generateReadme(Path projectRoot, AdapterContractInfo contract, BianMapping bianMapping) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Wrapper BIAN — ").append(contract.getAdapterName()).append("\n\n");
        sb.append("## Description\n\n");
        sb.append(contract.getDescription()).append("\n\n");
        sb.append("**Service Domain BIAN** : ").append(bianMapping.getServiceDomainTitle()).append(" (").append(bianMapping.getBianId()).append(")\n\n");
        sb.append("## Architecture\n\n");
        sb.append("```\n");
        sb.append("Client → [ApiRequest] → Controller BIAN → Service Interface → RestAdapter → Adapter WebSphere → Core Banking\n");
        sb.append("```\n\n");
        sb.append("## Endpoints\n\n");
        sb.append("| Operation | Method | Path | Idempotent | Timeout |\n");
        sb.append("|-----------|--------|------|------------|--------|\n");
        for (EndpointInfo ep : contract.getEndpoints()) {
            sb.append("| ").append(ep.getOperation()).append(" | ").append(ep.getMethod()).append(" | ");
            sb.append("/api/v1/").append(contract.toKebabCase()).append("/{cr-reference-id}/").append(toKebabCase(ep.getOperation()));
            sb.append(" | ").append(ep.isIdempotent() ? "Oui" : "Non").append(" | ").append(ep.getTimeoutSeconds()).append("s |\n");
        }
        sb.append("\n## Format d'enveloppe\n\n");
        sb.append("### Requete\n```json\n{\n  \"request_id\": \"uuid\",\n  \"source_system\": \"e-banking\",\n  \"timestamp\": \"2026-04-27T10:00:00Z\",\n  \"payload\": { ... }\n}\n```\n\n");
        sb.append("### Reponse\n```json\n{\n  \"request_id\": \"uuid\",\n  \"source_system\": \"bian-api\",\n  \"timestamp\": \"2026-04-27T10:00:01Z\",\n  \"status\": \"SUCCESS\",\n  \"payload\": { ... }\n}\n```\n\n");
        sb.append("## Resilience\n\n");
        sb.append("- **Circuit Breaker** : coupe les appels si >50% d'echecs sur 10 appels\n");
        sb.append("- **Retry** : 3 tentatives avec backoff exponentiel (2s, 4s, 8s)\n");
        sb.append("- **Bulkhead** : max 25 appels concurrents\n");
        sb.append("- **Idempotency** : cle unique par request_id (TTL 1h)\n\n");
        sb.append("## Profils Spring\n\n");
        sb.append("| Profil | Usage |\n|--------|-------|\n");
        sb.append("| `rest` | Production — appelle l'adapter WebSphere |\n");
        sb.append("| `mock` | Tests — donnees simulees |\n\n");
        sb.append("## Demarrage\n\n```bash\nmvn spring-boot:run -Dspring-boot.run.profiles=rest\n```\n");

        Files.writeString(projectRoot.resolve("README.md"), sb.toString());
        log.info("[ADAPTER-WRAPPER] README genere");
    }

    // =====================================================================
    // UTILITAIRES
    // =====================================================================

    private Path resolveJavaRoot(Path srcMain) {
        String[] parts = PKG_BASE.split("\\.");
        Path root = srcMain;
        for (int i = 0; i < parts.length; i++) root = root.getParent();
        return root;
    }

    private Path resolvePackagePath(Path srcMain, String pkg) throws IOException {
        Path dir = resolveJavaRoot(srcMain).resolve(pkg.replace(".", "/"));
        Files.createDirectories(dir);
        return dir;
    }

    private Path resolveResourcesDir(Path srcMain) {
        return resolveJavaRoot(srcMain).getParent().resolve("resources");
    }

    private Path resolveTestJavaRoot(Path srcMain) {
        Path srcDir = resolveJavaRoot(srcMain).getParent().getParent();
        return srcDir.resolve("test").resolve("java");
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }

    private String toPascalCase(String kebab) {
        if (kebab == null || kebab.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (String part : kebab.split("[-_]")) {
            if (!part.isEmpty()) {
                sb.append(Character.toUpperCase(part.charAt(0)));
                if (part.length() > 1) sb.append(part.substring(1));
            }
        }
        return sb.toString();
    }

    private String toKebabCase(String camelCase) {
        if (camelCase == null) return "";
        return camelCase.replaceAll("([a-z])([A-Z])", "$1-$2")
                .replaceAll("[_\\s]+", "-")
                .toLowerCase();
    }

    private String simpleType(String javaType) {
        if (javaType == null) return "String";
        int dot = javaType.lastIndexOf('.');
        return dot >= 0 ? javaType.substring(dot + 1) : javaType;
    }

    private String getMockValue(FieldInfo f) {
        String type = f.toJavaType().toLowerCase();
        if (type.contains("integer") || type.contains("int")) return "0";
        if (type.contains("long")) return "0L";
        if (type.contains("double") || type.contains("number")) return "0.0";
        if (type.contains("boolean")) return "true";
        if (type.contains("bigdecimal")) return "java.math.BigDecimal.ZERO";
        return "\"MOCK_" + f.getName().toUpperCase() + "\"";
    }
}
