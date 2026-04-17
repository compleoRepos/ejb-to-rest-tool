package com.bank.tools.generator.engine;

import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Generateur d'architecture decouplée Anti-Corruption Layer (ACL).
 *
 * Genere les 4 couches :
 * - API        : RestDTOs (Request/Response), Controllers BIAN, Enums
 * - Domain     : Interfaces Service, Exceptions wrapper
 * - Infrastructure : JndiAdapter, MockAdapter, Mappers, ExceptionTranslator, EJB types
 * - Config     : GlobalExceptionHandler, profils Spring, SecurityConfig
 */
@Component
public class AclArchitectureGenerator {

    private static final Logger log = LoggerFactory.getLogger(AclArchitectureGenerator.class);

    // =====================================================================
    // PACKAGES
    // =====================================================================
    private String PKG_BASE;
    private String PKG_API_CONTROLLER;
    private String PKG_API_DTO_REQUEST;
    private String PKG_API_DTO_RESPONSE;
    private String PKG_API_ENUM;
    private String PKG_DOMAIN_SERVICE;
    private String PKG_DOMAIN_EXCEPTION;
    private String PKG_INFRA_EJB_ADAPTER;
    private String PKG_INFRA_EJB_MAPPER;
    private String PKG_INFRA_EJB_EXCEPTION;
    private String PKG_INFRA_EJB_TYPES;
    private String PKG_INFRA_MOCK;
    private String PKG_CONFIG;
    private String PKG_API_DTO_VALIDATION;

    // =====================================================================
    // CONSTANTES
    // =====================================================================

    private static final Set<String> LEGACY_FIELDS = Set.of(
            "codeRetour", "messageRetour", "serialVersionUID", "scoreInterne"
    );

    private static final Map<String, String> FIELD_RENAME = Map.ofEntries(
            Map.entry("numCarte", "numeroCarte"),
            Map.entry("numLot", "numeroLot"),
            Map.entry("numToken", "numeroToken"),
            Map.entry("motifBlocage", "motif"),
            Map.entry("sasCC", "identifiantClient"),
            Map.entry("ribEmetteur", "compteEmetteur"),
            Map.entry("ribBeneficiaire", "compteBeneficiaire"),
            Map.entry("montantDemande", "montant")
    );

    private static final Map<String, String> VERB_TO_NOUN = Map.ofEntries(
            Map.entry("Activer", "Activation"),
            Map.entry("Receptionner", "Reception"),
            Map.entry("Bloquer", "Blocage"),
            Map.entry("Charger", "Consultation"),
            Map.entry("Consulter", "Consultation"),
            Map.entry("Ouvrir", "Ouverture"),
            Map.entry("Simuler", "Simulation")
    );

    private static final Set<String> FRAMEWORK_TYPES = Set.of(
            "ValueObject", "Envelope", "BaseUseCase", "FwkRollbackException",
            "SynchroneService", "Services", "EaiLog", "Parser", "ParsingException",
            "UtilHash"
    );

    // =====================================================================
    // MODELES INTERNES
    // =====================================================================

    /**
     * Represente un endpoint BIAN regroupe.
     */
    static class BianEndpoint {
        String useCaseName;
        String methodName;          // ex: "activerCarte"
        String requestDtoName;      // ex: "ActivationCarteRequest"
        String responseDtoName;     // ex: "ActivationCarteResponse"
        String ejbInputDtoName;     // ex: "ActiverCarteVoIn"
        String ejbOutputDtoName;    // ex: "ActiverCarteVoOut"
        BianMapping bianMapping;    // mapping BIAN complet
        UseCaseInfo useCaseInfo;    // info du UseCase
    }

    /**
     * Represente un controller BIAN regroupe par service domain.
     */
    static class BianControllerGroup {
        String serviceDomain;           // ex: "card-management"
        String serviceDomainTitle;      // ex: "Card Management"
        String controllerName;          // ex: "CardManagementController"
        String serviceInterfaceName;    // ex: "CardManagementService"
        String bianId;                  // ex: "SD0332"
        List<BianEndpoint> endpoints = new ArrayList<>();
    }

    /**
     * Represente un champ dans un RestDTO.
     */
    static class RestField {
        String name;
        String type;
        boolean required;
        List<String> customValidators = new ArrayList<>();

        RestField(String name, String type, boolean required) {
            this.name = name;
            this.type = type;
            this.required = required;
        }
    }

    // =====================================================================
    // POINT D'ENTREE
    // =====================================================================

    public void generate(Path srcMain, ProjectAnalysisResult analysis,
                         Map<String, BianMapping> bianMappings) throws IOException {

        log.info("[ACL] ========== DEBUT GENERATION ARCHITECTURE ACL ==========");

        // Determiner le package de base depuis srcMain
        // srcMain = .../src/main/java/com/bank/api
        PKG_BASE = derivePkgBase(srcMain);
        initPackages();

        // Creer les repertoires
        createDirectories(srcMain);

        // 1. Regrouper les UseCases par service domain
        List<BianControllerGroup> groups = groupByServiceDomain(analysis, bianMappings);
        log.info("[ACL] {} controllers BIAN a generer", groups.size());

        // 2. Generer les Enums (couche API)
        generateEnums(srcMain, analysis);

        // 3. Generer les RestDTOs (couche API)
        for (BianControllerGroup group : groups) {
            for (BianEndpoint ep : group.endpoints) {
                generateRestDtoRequest(srcMain, analysis, ep);
                generateRestDtoResponse(srcMain, analysis, ep);
            }
        }

        // 3b. Generer les annotations de validation (@ValidRIB, @ValidIBAN)
        generateValidationAnnotations(srcMain);

        // 4. Generer les Exceptions (couche Domain)
        generateDomainExceptions(srcMain, analysis);

        // 5. Generer les Interfaces Service (couche Domain)
        for (BianControllerGroup group : groups) {
            generateServiceInterface(srcMain, group, analysis);
        }

        // 6. Generer les EJB Types (couche Infrastructure)
        generateEjbTypes(srcMain, analysis);

        // 7. Generer les Mappers (couche Infrastructure)
        for (BianControllerGroup group : groups) {
            for (BianEndpoint ep : group.endpoints) {
                generateMapper(srcMain, analysis, ep);
            }
        }

        // 8. Generer l'ExceptionTranslator (couche Infrastructure)
        generateExceptionTranslator(srcMain, analysis);

        // 9. Generer les JndiAdapters (couche Infrastructure)
        for (BianControllerGroup group : groups) {
            generateJndiAdapter(srcMain, group, analysis);
        }

        // 10. Generer les MockAdapters (couche Infrastructure)
        for (BianControllerGroup group : groups) {
            generateMockAdapter(srcMain, group, analysis);
        }

        // 11. Generer les Controllers BIAN (couche API)
        for (BianControllerGroup group : groups) {
            generateBianController(srcMain, group, analysis);
        }

        // 12. Generer le GlobalExceptionHandler (Config)
        generateGlobalExceptionHandler(srcMain);

        // 13. Generer les profils Spring (Config)
        generateSpringProfiles(srcMain);

        // 14. Generer les tests d'integration
        generateIntegrationTests(srcMain, groups, analysis);

        log.info("[ACL] ========== FIN GENERATION ARCHITECTURE ACL ==========");
    }

    // =====================================================================
    // INITIALISATION
    // =====================================================================

    private String derivePkgBase(Path srcMain) {
        // srcMain = .../src/main/java/com/bank/api
        String fullPath = srcMain.toString().replace("\\", "/");
        int idx = fullPath.indexOf("src/main/java/");
        if (idx >= 0) {
            String pkg = fullPath.substring(idx + "src/main/java/".length());
            return pkg.replace("/", ".");
        }
        return "com.bank.api";
    }

    private void initPackages() {
        PKG_API_CONTROLLER = PKG_BASE + ".controller";
        PKG_API_DTO_REQUEST = PKG_BASE + ".dto.request";
        PKG_API_DTO_RESPONSE = PKG_BASE + ".dto.response";
        PKG_API_ENUM = PKG_BASE + ".dto.enums";
        PKG_DOMAIN_SERVICE = PKG_BASE + ".domain.service";
        PKG_DOMAIN_EXCEPTION = PKG_BASE + ".domain.exception";
        PKG_INFRA_EJB_ADAPTER = PKG_BASE + ".infrastructure.ejb.adapter";
        PKG_INFRA_EJB_MAPPER = PKG_BASE + ".infrastructure.ejb.mapper";
        PKG_INFRA_EJB_EXCEPTION = PKG_BASE + ".infrastructure.ejb.exception";
        PKG_INFRA_EJB_TYPES = PKG_BASE + ".infrastructure.ejb.types";
        PKG_INFRA_MOCK = PKG_BASE + ".infrastructure.mock";
        PKG_CONFIG = PKG_BASE + ".config";
        PKG_API_DTO_VALIDATION = PKG_BASE + ".dto.validation";
    }

    private void createDirectories(Path srcMain) throws IOException {
        Path javaRoot = resolveJavaRoot(srcMain);
        String[] packages = {
                PKG_API_CONTROLLER, PKG_API_DTO_REQUEST, PKG_API_DTO_RESPONSE, PKG_API_ENUM,
                PKG_DOMAIN_SERVICE, PKG_DOMAIN_EXCEPTION,
                PKG_INFRA_EJB_ADAPTER, PKG_INFRA_EJB_MAPPER, PKG_INFRA_EJB_EXCEPTION,
                PKG_INFRA_EJB_TYPES, PKG_INFRA_MOCK,
                PKG_CONFIG, PKG_API_DTO_VALIDATION
        };
        for (String pkg : packages) {
            Files.createDirectories(javaRoot.resolve(pkg.replace(".", "/")));
        }
    }

    private Path resolveJavaRoot(Path srcMain) {
        // srcMain = .../src/main/java/com/bank/api → remonter au nombre de segments du package
        String[] parts = PKG_BASE.split("\\.");
        Path root = srcMain;
        for (int i = 0; i < parts.length; i++) {
            root = root.getParent();
        }
        return root; // = .../src/main/java
    }

    private Path resolvePackagePath(Path srcMain, String pkg) throws IOException {
        Path dir = resolveJavaRoot(srcMain).resolve(pkg.replace(".", "/"));
        Files.createDirectories(dir);
        return dir;
    }

    private Path resolveResourcesDir(Path srcMain) {
        // srcMain = .../src/main/java/com/bank/api → remonter à src/main/java puis parent = src/main
        return resolveJavaRoot(srcMain).getParent().resolve("resources");
    }

    private Path resolveTestJavaRoot(Path srcMain) {
        // srcMain = .../src/main/java/com/bank/api → remonter à src/main → src → src/test/java
        Path srcDir = resolveJavaRoot(srcMain).getParent().getParent(); // = .../src
        return srcDir.resolve("test").resolve("java");
    }

    // =====================================================================
    // REGROUPEMENT PAR SERVICE DOMAIN
    // =====================================================================

    private List<BianControllerGroup> groupByServiceDomain(
            ProjectAnalysisResult analysis, Map<String, BianMapping> bianMappings) {

        Map<String, BianControllerGroup> groupMap = new LinkedHashMap<>();

        for (UseCaseInfo uc : analysis.getUseCases()) {
            BianMapping mapping = bianMappings.get(uc.getClassName());
            if (mapping == null) {
                log.warn("[ACL] Pas de mapping BIAN pour {}, skip", uc.getClassName());
                continue;
            }

            String sd = mapping.getServiceDomain();
            BianControllerGroup group = groupMap.computeIfAbsent(sd, k -> {
                BianControllerGroup g = new BianControllerGroup();
                g.serviceDomain = sd;
                g.serviceDomainTitle = mapping.getServiceDomainTitle();
                g.controllerName = toPascalCase(sd) + "Controller";
                g.serviceInterfaceName = toPascalCase(sd) + "Service";
                g.bianId = mapping.getBianId();
                return g;
            });

            BianEndpoint ep = new BianEndpoint();
            ep.useCaseName = uc.getClassName();
            ep.bianMapping = mapping;
            ep.useCaseInfo = uc;

            // Determiner le nom de methode depuis l'action BIAN + BQ
            ep.methodName = deriveMethodName(mapping);

            // Determiner les DTOs EJB
            ep.ejbInputDtoName = uc.getInputDtoClassName();
            ep.ejbOutputDtoName = uc.getOutputDtoClassName();

            // Si multi-method, chercher dans les methodes publiques
            if (ep.ejbInputDtoName == null && uc.getPublicMethods() != null && !uc.getPublicMethods().isEmpty()) {
                UseCaseInfo.MethodInfo firstMethod = uc.getPublicMethods().get(0);
                if (firstMethod.getParameters() != null && !firstMethod.getParameters().isEmpty()) {
                    ep.ejbInputDtoName = firstMethod.getParameters().get(0).getType();
                }
                ep.ejbOutputDtoName = firstMethod.getReturnType();
            }

            // Deriver les noms de RestDTOs
            ep.requestDtoName = deriveRestDtoName(ep.ejbInputDtoName, "Request", mapping);
            ep.responseDtoName = deriveRestDtoName(ep.ejbOutputDtoName, "Response", mapping);

            // BIAN : tous les endpoints ont un body (meme retrieval = POST avec VoIn)
            // Pas de suppression du requestDtoName

            group.endpoints.add(ep);
            log.info("[ACL] Endpoint: {} → {}.{} [{}]",
                    uc.getClassName(), group.controllerName, ep.methodName, mapping.getAction());
        }

        // ===== FIX 2 : Deduplication des routes =====
        // Verifier les doublons de route dans chaque controller
        for (BianControllerGroup group : groupMap.values()) {
            deduplicateRoutes(group);
        }

        return new ArrayList<>(groupMap.values());
    }

    /**
     * Detecte et resout les conflits de route dans un controller.
     * Si deux endpoints ont la meme methode HTTP + URL relative,
     * on force un BQ unique base sur le nom du handler.
     */
    private void deduplicateRoutes(BianControllerGroup group) {
        // Construire les URLs pour chaque endpoint
        for (BianEndpoint ep : group.endpoints) {
            if (ep.bianMapping.getUrl() == null) {
                ep.bianMapping.buildUrl("/api/v1");
            }
        }

        // Grouper par cle de route : HTTP_METHOD + URL relative
        Map<String, List<BianEndpoint>> routeMap = new LinkedHashMap<>();
        for (BianEndpoint ep : group.endpoints) {
            String httpMethod = ep.bianMapping.getHttpMethod() != null
                    ? ep.bianMapping.getHttpMethod().toUpperCase() : "POST";
            String relUrl = ep.bianMapping.getUrl();
            if (relUrl != null && relUrl.startsWith("/" + group.serviceDomain)) {
                relUrl = relUrl.substring(("/" + group.serviceDomain).length());
            }
            String routeKey = httpMethod + ":" + relUrl;
            routeMap.computeIfAbsent(routeKey, k -> new ArrayList<>()).add(ep);
        }

        // Resoudre les conflits
        for (var entry : routeMap.entrySet()) {
            if (entry.getValue().size() > 1) {
                log.warn("[ACL] Conflit de route detecte : {} — {} endpoints",
                        entry.getKey(), entry.getValue().size());
                for (BianEndpoint ep : entry.getValue()) {
                    // Forcer un BQ unique base sur le nom du handler
                    String handlerName = ep.useCaseName
                            .replaceAll("(Handler|UC|UseCase|Bean|Impl|Service|EJB)$", "");
                    String uniqueBq = handlerName.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
                    ep.bianMapping.setBehaviorQualifier(uniqueBq);
                    // Invalider le cache URL pour forcer le recalcul
                    ep.bianMapping.setUrl(null);
                    ep.bianMapping.setOperationId(null);
                    ep.bianMapping.buildUrl("/api/v1");
                    // Recalculer le nom de methode
                    ep.methodName = deriveMethodName(ep.bianMapping);
                    log.info("[ACL] Route corrigee : {} → {}",
                            ep.useCaseName, ep.bianMapping.getUrl());
                }
            }
        }
    }

    private String deriveMethodName(BianMapping mapping) {
        String action = mapping.getAction();
        String bq = mapping.getBehaviorQualifier();
        String verb = actionToVerb(action);

        if (bq != null && !bq.isEmpty()) {
            return verb + capitalize(toPascalCase(bq));
        }

        // Utiliser le service domain pour les actions sans BQ
        return verb + toPascalCase(mapping.getServiceDomain());
    }

    private String actionToVerb(String action) {
        if (action == null) return "execute";
        return switch (action) {
            case "initiation" -> "initiate";
            case "retrieval" -> "retrieve";
            case "update" -> "update";
            case "execution" -> "execute";
            case "termination" -> "terminate";
            case "evaluation" -> "evaluate";
            case "notification" -> "notify";
            case "control" -> "control";
            case "request" -> "request";
            case "exchange" -> "exchange";
            case "grant" -> "grant";
            default -> action;
        };
    }

    // =====================================================================
    // COUCHE API : RestDTOs Request
    // =====================================================================

    private void generateRestDtoRequest(Path srcMain, ProjectAnalysisResult analysis,
                                         BianEndpoint ep) throws IOException {
        if (ep.requestDtoName == null) return;

        Path dir = resolvePackagePath(srcMain, PKG_API_DTO_REQUEST);
        Path file = dir.resolve(ep.requestDtoName + ".java");

        DtoInfo ejbDto = findDto(analysis, ep.ejbInputDtoName);
        List<RestField> fields = deriveRestFields(ejbDto, true);

        // Detecter si on a besoin d'imports speciaux
        boolean hasNotBlank = fields.stream().anyMatch(f -> f.required && "String".equals(f.type));
        boolean hasNotNull = fields.stream().anyMatch(f -> f.required && !"String".equals(f.type));
        boolean hasBigDecimal = fields.stream().anyMatch(f -> "BigDecimal".equals(f.type));
        boolean hasEnum = fields.stream().anyMatch(f -> isEnumType(f.type, analysis));

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_REQUEST).append(";\n\n");

        // Imports
        if (hasNotBlank) sb.append("import jakarta.validation.constraints.NotBlank;\n");
        if (hasNotNull) sb.append("import jakarta.validation.constraints.NotNull;\n");
        if (hasBigDecimal) sb.append("import java.math.BigDecimal;\n");
        for (RestField f : fields) {
            if (isEnumType(f.type, analysis)) {
                sb.append("import ").append(PKG_API_ENUM).append(".").append(f.type).append(";\n");
            }
        }
        // Import @ValidRIB/@ValidIBAN si necessaire
        boolean hasValidRIB = fields.stream().anyMatch(f -> f.customValidators.stream().anyMatch(v -> v.contains("ValidRIB")));
        boolean hasValidIBAN = fields.stream().anyMatch(f -> f.customValidators.stream().anyMatch(v -> v.contains("ValidIBAN")));
        if (hasValidRIB) sb.append("import ").append(PKG_API_DTO_VALIDATION).append(".ValidRIB;\n");
        if (hasValidIBAN) sb.append("import ").append(PKG_API_DTO_VALIDATION).append(".ValidIBAN;\n");
        sb.append("\n");

        sb.append("/**\n");
        sb.append(" * Request DTO pour ").append(humanize(ep.methodName)).append(".\n");
        // Commentaire de tracabilite supprime pour proprete architecturale
        sb.append(" */\n");
        sb.append("public class ").append(ep.requestDtoName).append(" {\n\n");

        // Champs
        for (RestField f : fields) {
            if (f.required) {
                if ("String".equals(f.type)) {
                    sb.append("    @NotBlank(message = \"Le champ ").append(f.name).append(" est obligatoire\")\n");
                } else {
                    sb.append("    @NotNull(message = \"Le champ ").append(f.name).append(" est obligatoire\")\n");
                }
            }
            // Correction 4: @ValidRIB/@ValidIBAN
            for (String validator : f.customValidators) {
                sb.append("    ").append(validator).append("\n");
            }
            sb.append("    private ").append(f.type).append(" ").append(f.name).append(";\n\n");
        }

        // Constructeur vide
        sb.append("    public ").append(ep.requestDtoName).append("() {}\n\n");

        // Getters/Setters
        for (RestField f : fields) {
            String cap = capitalize(f.name);
            String getter = ("boolean".equals(f.type) ? "is" : "get") + cap;
            sb.append("    public ").append(f.type).append(" ").append(getter).append("() { return ").append(f.name).append("; }\n");
            sb.append("    public void set").append(cap).append("(").append(f.type).append(" ").append(f.name).append(") { this.").append(f.name).append(" = ").append(f.name).append("; }\n\n");
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] RestDTO Request genere : {}", ep.requestDtoName);
    }

    // =====================================================================
    // COUCHE API : RestDTOs Response
    // =====================================================================

    private void generateRestDtoResponse(Path srcMain, ProjectAnalysisResult analysis,
                                          BianEndpoint ep) throws IOException {
        if (ep.responseDtoName == null) return;

        Path dir = resolvePackagePath(srcMain, PKG_API_DTO_RESPONSE);
        Path file = dir.resolve(ep.responseDtoName + ".java");

        DtoInfo ejbDto = findDto(analysis, ep.ejbOutputDtoName);
        List<RestField> fields = deriveRestFields(ejbDto, false);

        boolean hasBigDecimal = fields.stream().anyMatch(f -> "BigDecimal".equals(f.type));
        boolean hasEnum = fields.stream().anyMatch(f -> isEnumType(f.type, analysis));

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_RESPONSE).append(";\n\n");

        if (hasBigDecimal) sb.append("import java.math.BigDecimal;\n");
        for (RestField f : fields) {
            if (isEnumType(f.type, analysis)) {
                sb.append("import ").append(PKG_API_ENUM).append(".").append(f.type).append(";\n");
            }
        }
        sb.append("\n");

        sb.append("/**\n");
        sb.append(" * Response DTO pour ").append(humanize(ep.methodName)).append(".\n");
        // Commentaire de tracabilite supprime pour proprete architecturale
        sb.append(" */\n");
        sb.append("public class ").append(ep.responseDtoName).append(" {\n\n");

        for (RestField f : fields) {
            sb.append("    private ").append(f.type).append(" ").append(f.name).append(";\n");
        }
        sb.append("\n");

        sb.append("    public ").append(ep.responseDtoName).append("() {}\n\n");

        for (RestField f : fields) {
            String cap = capitalize(f.name);
            String getter = ("boolean".equals(f.type) ? "is" : "get") + cap;
            sb.append("    public ").append(f.type).append(" ").append(getter).append("() { return ").append(f.name).append("; }\n");
            sb.append("    public void set").append(cap).append("(").append(f.type).append(" ").append(f.name).append(") { this.").append(f.name).append(" = ").append(f.name).append("; }\n\n");
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] RestDTO Response genere : {}", ep.responseDtoName);
    }

    // =====================================================================
    // COUCHE API : Enums
    // =====================================================================

    private void generateEnums(Path srcMain, ProjectAnalysisResult analysis) throws IOException {
        if (analysis.getDetectedEnums() == null) return;

        Path dir = resolvePackagePath(srcMain, PKG_API_ENUM);

        for (ProjectAnalysisResult.EnumInfo enumInfo : analysis.getDetectedEnums()) {
            Path file = dir.resolve(enumInfo.getName() + ".java");

            StringBuilder sb = new StringBuilder();
            sb.append("package ").append(PKG_API_ENUM).append(";\n\n");
            sb.append("/**\n");
            sb.append(" * Enum ").append(enumInfo.getName()).append(" (copie REST sans annotations JAXB).\n");
            sb.append(" */\n");
            sb.append("public enum ").append(enumInfo.getName()).append(" {\n");

            List<String> values = enumInfo.getValues();
            for (int i = 0; i < values.size(); i++) {
                sb.append("    ").append(values.get(i));
                if (i < values.size() - 1) sb.append(",");
                sb.append("\n");
            }
            sb.append("}\n");

            Files.writeString(file, sb.toString());
            log.info("[ACL] Enum genere : {}", enumInfo.getName());
        }
    }

    // =====================================================================
    // COUCHE DOMAIN : Exceptions
    // =====================================================================

    private void generateDomainExceptions(Path srcMain, ProjectAnalysisResult analysis) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_DOMAIN_EXCEPTION);

        // ApiException de base
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_DOMAIN_EXCEPTION).append(";\n\n");
        sb.append("public class ApiException extends RuntimeException {\n\n");
        sb.append("    private final String code;\n");
        sb.append("    private final int httpStatus;\n\n");
        sb.append("    public ApiException(String code, String message, int httpStatus) {\n");
        sb.append("        super(message);\n");
        sb.append("        this.code = code;\n");
        sb.append("        this.httpStatus = httpStatus;\n");
        sb.append("    }\n\n");
        sb.append("    public ApiException(String code, String message, int httpStatus, Throwable cause) {\n");
        sb.append("        super(message, cause);\n");
        sb.append("        this.code = code;\n");
        sb.append("        this.httpStatus = httpStatus;\n");
        sb.append("    }\n\n");
        sb.append("    public String getCode() { return code; }\n");
        sb.append("    public int getHttpStatus() { return httpStatus; }\n");
        sb.append("}\n");
        Files.writeString(dir.resolve("ApiException.java"), sb.toString());

        // Exceptions specifiques derivees des exceptions EJB detectees
        Map<String, int[]> exceptionMapping = Map.of(
                "CarteInexistante", new int[]{404},
                "CarteDejaActive", new int[]{409},
                "ClientInexistant", new int[]{404},
                "CompteInexistant", new int[]{404},
                "SoldeInsuffisant", new int[]{422},
                "Authentification", new int[]{401}
        );

        // Exceptions generiques toujours generees
        Map<String, int[]> genericExceptions = Map.of(
                "ResourceNotFound", new int[]{404},
                "BusinessRule", new int[]{409},
                "ServiceUnavailable", new int[]{503}
        );

        // Generer les exceptions depuis les exceptions EJB detectees
        if (analysis.getDetectedExceptions() != null) {
            for (ProjectAnalysisResult.ExceptionInfo exInfo : analysis.getDetectedExceptions()) {
                String ejbName = exInfo.getName().replace("Exception", "");
                int httpStatus = 500;
                for (Map.Entry<String, int[]> entry : exceptionMapping.entrySet()) {
                    if (ejbName.contains(entry.getKey())) {
                        httpStatus = entry.getValue()[0];
                        break;
                    }
                }

                String restExName = ejbName + "Exception";
                String code = toSnakeCase(ejbName).toUpperCase();

                sb = new StringBuilder();
                sb.append("package ").append(PKG_DOMAIN_EXCEPTION).append(";\n\n");
                sb.append("public class ").append(restExName).append(" extends ApiException {\n\n");
                sb.append("    public ").append(restExName).append("(String message) {\n");
                sb.append("        super(\"").append(code).append("\", message, ").append(httpStatus).append(");\n");
                sb.append("    }\n\n");
                sb.append("    public ").append(restExName).append("(String message, Throwable cause) {\n");
                sb.append("        super(\"").append(code).append("\", message, ").append(httpStatus).append(", cause);\n");
                sb.append("    }\n");
                sb.append("}\n");
                Files.writeString(dir.resolve(restExName + ".java"), sb.toString());
                log.info("[ACL] Exception Domain generee : {} (HTTP {})", restExName, httpStatus);
            }
        }

        // Generer les exceptions generiques
        for (Map.Entry<String, int[]> entry : genericExceptions.entrySet()) {
            String name = entry.getKey() + "Exception";
            String code = toSnakeCase(entry.getKey()).toUpperCase();
            int status = entry.getValue()[0];

            sb = new StringBuilder();
            sb.append("package ").append(PKG_DOMAIN_EXCEPTION).append(";\n\n");
            sb.append("public class ").append(name).append(" extends ApiException {\n\n");
            sb.append("    public ").append(name).append("(String message) {\n");
            sb.append("        super(\"").append(code).append("\", message, ").append(status).append(");\n");
            sb.append("    }\n\n");
            sb.append("    public ").append(name).append("(String message, Throwable cause) {\n");
            sb.append("        super(\"").append(code).append("\", message, ").append(status).append(", cause);\n");
            sb.append("    }\n");
            sb.append("}\n");

            Path exFile = dir.resolve(name + ".java");
            if (!Files.exists(exFile)) {
                Files.writeString(exFile, sb.toString());
                log.info("[ACL] Exception generique generee : {} (HTTP {})", name, status);
            }
        }
    }

    // =====================================================================
    // COUCHE DOMAIN : Interfaces Service
    // =====================================================================

    private void generateServiceInterface(Path srcMain, BianControllerGroup group, ProjectAnalysisResult analysis) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_DOMAIN_SERVICE);
        Path file = dir.resolve(group.serviceInterfaceName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_DOMAIN_SERVICE).append(";\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        for (BianEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
        }
        for (String imp : imports) sb.append(imp).append("\n");
        if (!imports.isEmpty()) sb.append("\n");

        sb.append("/**\n");
        sb.append(" * Interface Service pour le domaine BIAN ").append(group.serviceDomainTitle).append(".\n");
        sb.append(" * Contrat de service purement REST.\n");
        sb.append(" */\n");
        sb.append("public interface ").append(group.serviceInterfaceName).append(" {\n\n");

        for (BianEndpoint ep : group.endpoints) {
            String returnType = ep.responseDtoName != null ? ep.responseDtoName : "void";
            sb.append("    ").append(returnType).append(" ").append(ep.methodName).append("(");

            List<String> params = new ArrayList<>();
            // Ajouter crReferenceId si l'URL contient {cr-reference-id}
            if (ep.bianMapping.getUrl() != null && ep.bianMapping.getUrl().contains("{cr-reference-id}")) {
                params.add("String crReferenceId");
            }
            if (ep.requestDtoName != null) {
                params.add(ep.requestDtoName + " request");
            }
            sb.append(String.join(", ", params));
            sb.append(");\n\n");

            // Methode byte[] supplementaire pour les endpoints byte[]
            if (isByteArrayResponse(ep, analysis)) {
                sb.append("    byte[] ").append(ep.methodName).append("Bytes(");
                sb.append(String.join(", ", params));
                sb.append(");\n\n");
            }
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] Interface Service generee : {}", group.serviceInterfaceName);
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : EJB Types
    // =====================================================================

    private void generateEjbTypes(Path srcMain, ProjectAnalysisResult analysis) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_EJB_TYPES);

        // Generer BaseUseCase.java
        Files.writeString(dir.resolve("BaseUseCase.java"),
                "package " + PKG_INFRA_EJB_TYPES + ";\n\n" +
                "public interface BaseUseCase {\n" +
                "    ValueObject execute(ValueObject voIn) throws Exception;\n" +
                "}\n");
        log.info("[ACL] EJB Type genere : BaseUseCase");

        // Generer ValueObject.java
        Files.writeString(dir.resolve("ValueObject.java"),
                "package " + PKG_INFRA_EJB_TYPES + ";\n\n" +
                "import java.io.Serializable;\n\n" +
                "public interface ValueObject extends Serializable {\n" +
                "}\n");
        log.info("[ACL] EJB Type genere : ValueObject");

        // Generer Envelope.java — type framework EAI utilise comme VoIn/VoOut generique
        // dans certains projets (ex: MadServices). Sans ce fichier, l'import dans le
        // JndiAdapter provoque une erreur de compilation.
        Files.writeString(dir.resolve("Envelope.java"),
                "package " + PKG_INFRA_EJB_TYPES + ";\n\n" +
                "import java.io.Serializable;\n\n" +
                "/**\n" +
                " * Type framework EAI generique utilise comme conteneur ValueObject.\n" +
                " * Genere automatiquement pour les projets qui utilisent Envelope comme VoIn/VoOut.\n" +
                " */\n" +
                "public class Envelope implements ValueObject {\n\n" +
                "    private static final long serialVersionUID = 1L;\n\n" +
                "    private String action;\n" +
                "    private String service;\n" +
                "    private Object payload;\n" +
                "    private java.util.Map<String, Object> headers = new java.util.HashMap<>();\n" +
                "    private java.util.Map<String, Object> properties = new java.util.HashMap<>();\n\n" +
                "    public Envelope() {}\n\n" +
                "    public String getAction() { return action; }\n" +
                "    public void setAction(String action) { this.action = action; }\n\n" +
                "    public String getService() { return service; }\n" +
                "    public void setService(String service) { this.service = service; }\n\n" +
                "    public Object getPayload() { return payload; }\n" +
                "    public void setPayload(Object payload) { this.payload = payload; }\n\n" +
                "    public java.util.Map<String, Object> getHeaders() { return headers; }\n" +
                "    public void setHeaders(java.util.Map<String, Object> headers) { this.headers = headers; }\n\n" +
                "    public java.util.Map<String, Object> getProperties() { return properties; }\n" +
                "    public void setProperties(java.util.Map<String, Object> properties) { this.properties = properties; }\n" +
                "}\n");
        log.info("[ACL] EJB Type genere : Envelope");

        // Generer SynchroneService.java si le pattern est detecte
        if (analysis.isSynchroneServiceDetected()) {
            Files.writeString(dir.resolve("SynchroneService.java"),
                    "package " + PKG_INFRA_EJB_TYPES + ";\n\n" +
                    "/**\n" +
                    " * Interface SynchroneService du framework EAI BOA.\n" +
                    " * Le service distant implemente cette interface et expose process(Envelope).\n" +
                    " */\n" +
                    "public interface SynchroneService {\n" +
                    "    Envelope process(Envelope envelopeIn) throws Exception;\n" +
                    "}\n");
            log.info("[ACL] EJB Type genere : SynchroneService");

            // Generer ActionHandler.java
            Files.writeString(dir.resolve("ActionHandler.java"),
                    "package " + PKG_INFRA_EJB_TYPES + ";\n\n" +
                    "/**\n" +
                    " * Interface ActionHandler du framework EAI BOA.\n" +
                    " * Chaque handler gere une action specifique via handle(Envelope).\n" +
                    " */\n" +
                    "public interface ActionHandler {\n" +
                    "    Envelope handle(Envelope envIn) throws Throwable;\n" +
                    "}\n");
            log.info("[ACL] EJB Type genere : ActionHandler");
        }

        for (DtoInfo dto : analysis.getDtos()) {
            Path file = dir.resolve(dto.getClassName() + ".java");

            StringBuilder sb = new StringBuilder();
            sb.append("package ").append(PKG_INFRA_EJB_TYPES).append(";\n\n");
            sb.append("import java.io.Serializable;\n");

            boolean hasBigDecimal = dto.getFields().stream().anyMatch(f -> "BigDecimal".equals(f.getType()));
            if (hasBigDecimal) sb.append("import java.math.BigDecimal;\n");
            sb.append("\n");

            sb.append("/**\n");
            sb.append(" * Copie du DTO EJB ").append(dto.getClassName()).append(" dans la couche infrastructure.\n");
            sb.append(" * Aucun import ma.eai.* — type autonome.\n");
            sb.append(" */\n");
            sb.append("public class ").append(dto.getClassName()).append(" implements ValueObject {\n\n");
            sb.append("    private static final long serialVersionUID = 1L;\n\n");

            for (DtoInfo.FieldInfo field : dto.getFields()) {
                if ("serialVersionUID".equals(field.getName())) continue;
                if (field.isStatic()) continue;

                String type = cleanType(field.getType());
                sb.append("    private ").append(type).append(" ").append(field.getName()).append(";\n");
            }
            sb.append("\n");

            for (DtoInfo.FieldInfo field : dto.getFields()) {
                if ("serialVersionUID".equals(field.getName())) continue;
                if (field.isStatic()) continue;

                String type = cleanType(field.getType());
                String cap = capitalize(field.getName());
                String getter = ("boolean".equals(type) ? "is" : "get") + cap;
                sb.append("    public ").append(type).append(" ").append(getter).append("() { return ").append(field.getName()).append("; }\n");
                sb.append("    public void set").append(cap).append("(").append(type).append(" ").append(field.getName()).append(") { this.").append(field.getName()).append(" = ").append(field.getName()).append("; }\n\n");
            }

            sb.append("}\n");

            Files.writeString(file, sb.toString());
            log.info("[ACL] EJB Type genere : {}", dto.getClassName());
        }
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : Mappers
    // =====================================================================

    private void generateMapper(Path srcMain, ProjectAnalysisResult analysis,
                                BianEndpoint ep) throws IOException {
        String mapperName = deriveMapperName(ep);
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_EJB_MAPPER);
        Path file = dir.resolve(mapperName + ".java");

        DtoInfo ejbIn = findDto(analysis, ep.ejbInputDtoName);
        DtoInfo ejbOut = findDto(analysis, ep.ejbOutputDtoName);

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_EJB_MAPPER).append(";\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
        if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
        boolean isActionHandlerMapper = ep.useCaseInfo != null && ep.useCaseInfo.isActionHandler();
        if (!isActionHandlerMapper) {
            if (ep.ejbInputDtoName != null) imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbInputDtoName + ";");
            if (ep.ejbOutputDtoName != null) imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbOutputDtoName + ";");
        } else {
            imports.add("import " + PKG_INFRA_EJB_TYPES + ".Envelope;");
        }
        imports.add("import org.springframework.stereotype.Component;");
        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        sb.append("@Component\n");
        sb.append("public class ").append(mapperName).append(" {\n\n");

        boolean isActionHandler = ep.useCaseInfo != null && ep.useCaseInfo.isActionHandler();

        if (isActionHandler) {
            // ===== PATTERN ACTION_HANDLER : toEnvelopePayload + fromEnvelopePayload =====

            // toEnvelopePayload : Request → Map<String, Object> pour Envelope.payload
            if (ep.requestDtoName != null) {
                sb.append("    /**\n");
                sb.append("     * Convertit le RestDTO Request en payload Map pour l'Envelope EAI.\n");
                sb.append("     */\n");
                sb.append("    public java.util.Map<String, Object> toEnvelopePayload(").append(ep.requestDtoName).append(" request) {\n");
                sb.append("        java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();\n");

                DtoInfo reqDto = findDto(analysis, ep.ejbInputDtoName);
                if (reqDto != null) {
                    for (DtoInfo.FieldInfo field : reqDto.getFields()) {
                        if ("serialVersionUID".equals(field.getName()) || field.isStatic()) continue;
                        if (LEGACY_FIELDS.contains(field.getName())) continue;
                        if (isFrameworkType(field.getType())) continue;
                        String restName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
                        String getter = ("boolean".equals(field.getType()) ? "is" : "get") + capitalize(restName);
                        sb.append("        payload.put(\"").append(field.getName()).append("\", request.").append(getter).append("());\n");
                    }
                } else if (ep.useCaseInfo.getEnvelopeFields() != null && !ep.useCaseInfo.getEnvelopeFields().isEmpty()) {
                    for (UseCaseInfo.EnvelopeFieldInfo envField : ep.useCaseInfo.getEnvelopeFields()) {
                        String getter = "get" + capitalize(envField.getFieldName());
                        sb.append("        payload.put(\"").append(envField.getFieldName()).append("\", request.").append(getter).append("());\n");
                    }
                } else {
                    sb.append("        // TODO: mapper les champs du request vers le payload Envelope\n");
                    sb.append("        payload.put(\"data\", request);\n");
                }
                sb.append("        return payload;\n");
                sb.append("    }\n\n");
            }

            // fromEnvelopePayload : Envelope → Response
            if (ep.responseDtoName != null) {
                sb.append("    /**\n");
                sb.append("     * Convertit l'Envelope de reponse EAI en RestDTO Response.\n");
                sb.append("     */\n");
                sb.append("    @SuppressWarnings(\"unchecked\")\n");
                sb.append("    public ").append(ep.responseDtoName).append(" fromEnvelopePayload(Envelope envOut) {\n");
                sb.append("        ").append(ep.responseDtoName).append(" response = new ").append(ep.responseDtoName).append("();\n");
                sb.append("        if (envOut == null || envOut.getPayload() == null) return response;\n");
                sb.append("        java.util.Map<String, Object> data = (java.util.Map<String, Object>) envOut.getPayload();\n");

                DtoInfo respDto = findDto(analysis, ep.ejbOutputDtoName);
                if (respDto != null) {
                    for (DtoInfo.FieldInfo field : respDto.getFields()) {
                        if ("serialVersionUID".equals(field.getName()) || field.isStatic()) continue;
                        if (LEGACY_FIELDS.contains(field.getName())) continue;
                        if (isFrameworkType(field.getType())) continue;
                        String restName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
                        String setter = "set" + capitalize(restName);
                        String castType = cleanType(field.getType());
                        sb.append("        if (data.containsKey(\"").append(field.getName()).append("\")) response.").append(setter).append("((").append(castType).append(") data.get(\"").append(field.getName()).append("\")); \n");
                    }
                } else {
                    sb.append("        // TODO: mapper les champs du payload Envelope vers la response\n");
                }
                sb.append("        return response;\n");
                sb.append("    }\n\n");
            }

        }

        // toEjb : Request → VoIn (pattern classique)
        if (!isActionHandler && ep.requestDtoName != null && ep.ejbInputDtoName != null) {
            sb.append("    public ").append(ep.ejbInputDtoName).append(" toEjb(").append(ep.requestDtoName).append(" request) {\n");
            sb.append("        ").append(ep.ejbInputDtoName).append(" voIn = new ").append(ep.ejbInputDtoName).append("();\n");

            if (ejbIn != null) {
                for (DtoInfo.FieldInfo field : ejbIn.getFields()) {
                    if ("serialVersionUID".equals(field.getName()) || field.isStatic()) continue;
                    if (LEGACY_FIELDS.contains(field.getName())) continue;
                    // Correction: exclure les champs @XmlTransient du Mapper
                    if (field.isHasXmlTransient()) continue;

                    String restName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
                    String ejbSetter = "set" + capitalize(field.getName());
                    String restGetter = ("boolean".equals(field.getType()) ? "is" : "get") + capitalize(restName);

                    // Enum conversion : RestEnum → String ou vice versa
                    String restType = cleanType(field.getType());
                    if (isFrameworkType(field.getType())) continue;

                    sb.append("        voIn.").append(ejbSetter).append("(request.").append(restGetter).append("());\n");
                }
            }
            sb.append("        return voIn;\n");
            sb.append("    }\n\n");
        }

        // toRest : VoOut → Response (pattern classique)
        if (!isActionHandler && ep.responseDtoName != null && ep.ejbOutputDtoName != null) {
            sb.append("    public ").append(ep.responseDtoName).append(" toRest(").append(ep.ejbOutputDtoName).append(" voOut) {\n");
            sb.append("        ").append(ep.responseDtoName).append(" response = new ").append(ep.responseDtoName).append("();\n");

            if (ejbOut != null) {
                for (DtoInfo.FieldInfo field : ejbOut.getFields()) {
                    if ("serialVersionUID".equals(field.getName()) || field.isStatic()) continue;
                    if (LEGACY_FIELDS.contains(field.getName())) continue;
                    if (isFrameworkType(field.getType())) continue;
                    // Correction: exclure les champs @XmlTransient du Mapper
                    if (field.isHasXmlTransient()) continue;

                    String restName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
                    String restSetter = "set" + capitalize(restName);
                    String ejbGetter = ("boolean".equals(field.getType()) ? "is" : "get") + capitalize(field.getName());

                    sb.append("        response.").append(restSetter).append("(voOut.").append(ejbGetter).append("());\n");
                }
            }
            sb.append("        return response;\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] Mapper genere : {}", mapperName);
    }

    private String deriveMapperName(BianEndpoint ep) {
        String base = ep.useCaseName.replaceAll("(UC|UseCase)$", "");
        return base + "Mapper";
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : ExceptionTranslator
    // =====================================================================

    private void generateExceptionTranslator(Path srcMain, ProjectAnalysisResult analysis) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_EJB_EXCEPTION);
        Path file = dir.resolve("ExceptionTranslator.java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_EJB_EXCEPTION).append(";\n\n");
        sb.append("import ").append(PKG_DOMAIN_EXCEPTION).append(".*;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.stereotype.Component;\n\n");

        sb.append("@Component\n");
        sb.append("public class ExceptionTranslator {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(ExceptionTranslator.class);\n\n");

        sb.append("    public RuntimeException translate(Exception ejbException) {\n");
        sb.append("        String msg = ejbException.getMessage() != null ? ejbException.getMessage() : \"Erreur inconnue\";\n");
        sb.append("        String className = ejbException.getClass().getSimpleName();\n");
        sb.append("        log.warn(\"[EJB-ERROR] Translation exception EJB: {} -> {}\", className, msg);\n\n");

        // Mapper les exceptions EJB detectees
        if (analysis.getDetectedExceptions() != null) {
            for (ProjectAnalysisResult.ExceptionInfo exInfo : analysis.getDetectedExceptions()) {
                String ejbName = exInfo.getName();
                String restName = ejbName.replace("Exception", "") + "Exception";
                sb.append("        if (className.contains(\"").append(ejbName.replace("Exception", "")).append("\")) {\n");
                sb.append("            return new ").append(restName).append("(msg, ejbException);\n");
                sb.append("        }\n");
            }
        }

        sb.append("        return new ServiceUnavailableException(\"Erreur technique: \" + msg, ejbException);\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] ExceptionTranslator genere");
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : JndiAdapter
    // =====================================================================

    private void generateJndiAdapter(Path srcMain, BianControllerGroup group, ProjectAnalysisResult analysis) throws IOException {
        String adapterName = toPascalCase(group.serviceDomain) + "JndiAdapter";
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_EJB_ADAPTER);
        Path file = dir.resolve(adapterName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_EJB_ADAPTER).append(";\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        for (BianEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
            // Pour ACTION_HANDLER, les types EJB sont remplaces par Envelope — ne pas importer les types EJB individuels
            boolean isActionHandlerEp = ep.useCaseInfo != null && ep.useCaseInfo.isActionHandler();
            if (!isActionHandlerEp) {
                if (ep.ejbInputDtoName != null) imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbInputDtoName + ";");
                if (ep.ejbOutputDtoName != null) imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbOutputDtoName + ";");
            }
            imports.add("import " + PKG_INFRA_EJB_MAPPER + "." + deriveMapperName(ep) + ";");
        }
        // BaseUseCase/ValueObject seulement si au moins un endpoint n'est PAS ACTION_HANDLER
        boolean hasBaseUseCase = group.endpoints.stream()
                .anyMatch(ep -> ep.useCaseInfo == null || !ep.useCaseInfo.isActionHandler());
        if (hasBaseUseCase) {
            imports.add("import " + PKG_INFRA_EJB_TYPES + ".BaseUseCase;");
            imports.add("import " + PKG_INFRA_EJB_TYPES + ".ValueObject;");
        }
        // Ajouter les imports SynchroneService/Envelope si au moins un endpoint est ACTION_HANDLER
        boolean hasActionHandler = group.endpoints.stream()
                .anyMatch(ep -> ep.useCaseInfo != null && ep.useCaseInfo.isActionHandler());
        if (hasActionHandler) {
            imports.add("import " + PKG_INFRA_EJB_TYPES + ".SynchroneService;");
            imports.add("import " + PKG_INFRA_EJB_TYPES + ".Envelope;");
        }
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + group.serviceInterfaceName + ";");
        imports.add("import " + PKG_INFRA_EJB_EXCEPTION + ".ExceptionTranslator;");
        imports.add("import org.slf4j.Logger;");
        imports.add("import org.slf4j.LoggerFactory;");
        imports.add("import org.springframework.beans.factory.annotation.Value;");
        imports.add("import org.springframework.context.annotation.Profile;");
        imports.add("import org.springframework.stereotype.Service;");
        // Resilience4j imports
        imports.add("import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;");
        imports.add("import io.github.resilience4j.retry.annotation.Retry;");
        imports.add("import io.github.resilience4j.bulkhead.annotation.Bulkhead;");

        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        sb.append("@Service\n");
        sb.append("@Profile(\"jndi\")\n");
        sb.append("public class ").append(adapterName).append(" implements ").append(group.serviceInterfaceName).append(" {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");

        // Champs JNDI
        sb.append("    @Value(\"${ejb.jndi.factory:org.jboss.naming.remote.client.InitialContextFactory}\")\n");
        sb.append("    private String jndiFactory;\n\n");
        sb.append("    @Value(\"${ejb.jndi.provider.url:remote+http://serveur-ejb:8080}\")\n");
        sb.append("    private String jndiProviderUrl;\n\n");
        // Cache JNDI : contexte reutilisable (volatile pour thread-safety)
        sb.append("    /** Contexte JNDI cache \u2014 initialise une seule fois (lazy) et reutilise. */\n");
        sb.append("    private volatile javax.naming.InitialContext cachedContext;\n");
        sb.append("    private final Object jndiLock = new Object();\n\n");

        // Champs injectes : mappers + exception translator
        sb.append("    private final ExceptionTranslator exceptionTranslator;\n");
        Set<String> mapperFields = new LinkedHashSet<>();
        for (BianEndpoint ep : group.endpoints) {
            String mapperName = deriveMapperName(ep);
            String fieldName = toLowerCamel(mapperName);
            if (mapperFields.add(fieldName)) {
                sb.append("    private final ").append(mapperName).append(" ").append(fieldName).append(";\n");
            }
        }
        sb.append("\n");

        // Constructeur
        sb.append("    public ").append(adapterName).append("(\n");
        sb.append("            ExceptionTranslator exceptionTranslator");
        for (String fieldName : mapperFields) {
            String typeName = capitalize(fieldName);
            sb.append(",\n            ").append(typeName).append(" ").append(fieldName);
        }
        sb.append(") {\n");
        sb.append("        this.exceptionTranslator = exceptionTranslator;\n");
        for (String fieldName : mapperFields) {
            sb.append("        this.").append(fieldName).append(" = ").append(fieldName).append(";\n");
        }
        sb.append("    }\n\n");
        // Methode getOrCreateContext avec cache
        sb.append("    /**\n");
        sb.append("     * Retourne le contexte JNDI cache ou en cree un nouveau (double-checked locking).\n");
        sb.append("     * Evite de creer un InitialContext a chaque appel HTTP.\n");
        sb.append("     */\n");
        sb.append("    private javax.naming.InitialContext getOrCreateContext() throws javax.naming.NamingException {\n");
        sb.append("        javax.naming.InitialContext ctx = cachedContext;\n");
        sb.append("        if (ctx != null) return ctx;\n");
        sb.append("        synchronized (jndiLock) {\n");
        sb.append("            if (cachedContext != null) return cachedContext;\n");
        sb.append("            java.util.Properties props = new java.util.Properties();\n");
        sb.append("            props.put(javax.naming.Context.INITIAL_CONTEXT_FACTORY, jndiFactory);\n");
        sb.append("            props.put(javax.naming.Context.PROVIDER_URL, jndiProviderUrl);\n");
        sb.append("            cachedContext = new javax.naming.InitialContext(props);\n");
        sb.append("            log.info(\"[JNDI-CACHE] Nouveau contexte JNDI cree\");\n");
        sb.append("            return cachedContext;\n");
        sb.append("        }\n");
        sb.append("    }\n\n");
        // Methode invalidateCache
        sb.append("    /** Invalide le cache JNDI pour forcer une reconnexion au prochain appel. */\n");
        sb.append("    private void invalidateJndiCache() {\n");
        sb.append("        synchronized (jndiLock) {\n");
        sb.append("            if (cachedContext != null) {\n");
        sb.append("                try { cachedContext.close(); } catch (Exception ignored) {}\n");
        sb.append("            }\n");
        sb.append("            cachedContext = null;\n");
        sb.append("            log.info(\"[JNDI-CACHE] Cache invalide \u2014 reconnexion au prochain appel\");\n");
        sb.append("        }\n");
        sb.append("    }\n\n");

        // Methodes avec code JNDI reel (utilisant le cache)
        for (BianEndpoint ep : group.endpoints) {
            String returnType = ep.responseDtoName != null ? ep.responseDtoName : "void";
            boolean hasReturn = ep.responseDtoName != null;
            String mapperField = toLowerCamel(deriveMapperName(ep));
            boolean isActionHandler = ep.useCaseInfo != null && ep.useCaseInfo.isActionHandler();
            String jndiName = isActionHandler && ep.useCaseInfo.getParentServiceJndiName() != null
                    ? ep.useCaseInfo.getParentServiceJndiName()
                    : "java:global/bank/" + ep.useCaseName;

            // Resilience4j annotations
            String fallbackName = ep.methodName + "Fallback";
            sb.append("    @CircuitBreaker(name = \"ejbService\", fallbackMethod = \"").append(fallbackName).append("\")\n");
            sb.append("    @Retry(name = \"ejbService\")\n");
            sb.append("    @Bulkhead(name = \"ejbService\")\n");
            sb.append("    @Override\n");
            sb.append("    public ").append(returnType).append(" ").append(ep.methodName).append("(");

            List<String> params = new ArrayList<>();
            boolean hasCrRef = ep.bianMapping.getUrl() != null && ep.bianMapping.getUrl().contains("{cr-reference-id}");
            if (hasCrRef) params.add("String crReferenceId");
            if (ep.requestDtoName != null) params.add(ep.requestDtoName + " request");
            sb.append(String.join(", ", params));
            sb.append(") {\n");

            sb.append("        log.info(\"[EJB-CALL] ").append(ep.useCaseName).append("\");\n");
            sb.append("        try {\n");

            if (isActionHandler) {
                // ===== PATTERN ACTION_HANDLER : lookup SynchroneService + Envelope =====
                String actionName = ep.useCaseInfo.getActionName() != null ? ep.useCaseInfo.getActionName() : ep.useCaseName;
                String parentService = ep.useCaseInfo.getParentServiceClassName() != null ? ep.useCaseInfo.getParentServiceClassName() : "MadServices";

                sb.append("            // Construire l'Envelope avec l'action \"" + actionName + "\"\n");
                sb.append("            Envelope envIn = new Envelope();\n");
                sb.append("            envIn.setAction(\"" + actionName + "\");\n");
                sb.append("            envIn.setService(\"" + parentService + "\");\n");
                if (ep.requestDtoName != null) {
                    sb.append("            envIn.setPayload(").append(mapperField).append(".toEnvelopePayload(request));\n");
                }

                sb.append("            javax.naming.InitialContext ctx = getOrCreateContext();\n");
                sb.append("            log.debug(\"[EJB-LOOKUP] ").append(jndiName).append(" (SynchroneService cache)\");\n");
                sb.append("            SynchroneService service = (SynchroneService) ctx.lookup(\"").append(jndiName).append("\");\n");

                sb.append("            long start = System.currentTimeMillis();\n");
                sb.append("            Envelope envOut = service.process(envIn);\n");
                sb.append("            log.info(\"[EJB-EXECUTE] ").append(ep.useCaseName).append(" en {}ms\", System.currentTimeMillis() - start);\n");

                if (hasReturn) {
                    sb.append("            return ").append(mapperField).append(".fromEnvelopePayload(envOut);\n");
                }

            } else {
                // ===== PATTERN CLASSIQUE : BaseUseCase.execute(VoIn) =====

                // Mapper Request -> VoIn
                if (ep.requestDtoName != null && ep.ejbInputDtoName != null) {
                    sb.append("            ").append(ep.ejbInputDtoName).append(" voIn = ").append(mapperField).append(".toEjb(request);\n");
                }

                // JNDI lookup via cache
                sb.append("            javax.naming.InitialContext ctx = getOrCreateContext();\n");
                sb.append("            log.debug(\"[EJB-LOOKUP] ").append(jndiName).append(" (cache)\");\n");
                sb.append("            BaseUseCase useCase = (BaseUseCase) ctx.lookup(\"").append(jndiName).append("\");\n");

                // Execute avec cast type
                sb.append("            long start = System.currentTimeMillis();\n");
                if (hasReturn && ep.ejbOutputDtoName != null) {
                    sb.append("            ValueObject result = useCase.execute(");
                    if (ep.ejbInputDtoName != null) {
                        sb.append("voIn");
                    } else {
                        sb.append("null");
                    }
                    sb.append(");\n");
                    sb.append("            log.info(\"[EJB-EXECUTE] ").append(ep.useCaseName).append(" en {}ms\", System.currentTimeMillis() - start);\n");
                    sb.append("            ").append(ep.ejbOutputDtoName).append(" voOut = (").append(ep.ejbOutputDtoName).append(") result;\n");
                    sb.append("            log.debug(\"[EJB-RESPONSE] Reponse EJB recue pour ").append(ep.useCaseName).append("\");\n");
                    sb.append("            return ").append(mapperField).append(".toRest(voOut);\n");
                } else {
                    sb.append("            useCase.execute(");
                    if (ep.ejbInputDtoName != null) {
                        sb.append("voIn");
                    } else {
                        sb.append("null");
                    }
                    sb.append(");\n");
                    sb.append("            log.info(\"[EJB-EXECUTE] ").append(ep.useCaseName).append(" en {}ms\", System.currentTimeMillis() - start);\n");
                    sb.append("            log.debug(\"[EJB-RESPONSE] Appel EJB termine pour ").append(ep.useCaseName).append("\");\n");
                }
            }

            sb.append("        } catch (javax.naming.CommunicationException | javax.naming.ServiceUnavailableException e) {\n");
            sb.append("            log.warn(\"[EJB-ERROR] Connexion JNDI perdue, invalidation du cache : {}\", e.getMessage());\n");
            sb.append("            invalidateJndiCache();\n");
            sb.append("            throw exceptionTranslator.translate(e);\n");
            sb.append("        } catch (Exception e) {\n");
            sb.append("            log.error(\"[EJB-ERROR] Erreur lors de l'appel EJB ").append(ep.useCaseName).append("\", e);\n");
            sb.append("            throw exceptionTranslator.translate(e);\n");
            sb.append("        }\n");
            sb.append("    }\n\n");

            // Methode fallback Resilience4j
            sb.append("    /**\n");
            sb.append("     * Fallback Resilience4j pour ").append(ep.methodName).append("().\n");
            sb.append("     * Appele quand le circuit breaker est ouvert, les retries epuises ou le bulkhead sature.\n");
            sb.append("     */\n");
            sb.append("    public ").append(returnType).append(" ").append(fallbackName).append("(");
            List<String> fallbackParams = new ArrayList<>(params);
            fallbackParams.add("Throwable t");
            sb.append(String.join(", ", fallbackParams));
            sb.append(") {\n");
            sb.append("        log.error(\"[RESILIENCE-FALLBACK] Service EJB indisponible pour ").append(ep.useCaseName).append(" \u2014 cause : {}\", t.getMessage());\n");
            sb.append("        throw new RuntimeException(\"Service EJB temporairement indisponible (").append(ep.useCaseName).append("). Veuillez reessayer plus tard.\", t);\n");
            sb.append("    }\n\n");

            // Methode Bytes supplementaire pour les endpoints byte[]
            if (isByteArrayResponse(ep, analysis)) {
                sb.append("    @Override\n");
                sb.append("    public byte[] ").append(ep.methodName).append("Bytes(");
                List<String> bytesParams = new ArrayList<>();
                if (hasCrRef) bytesParams.add("String crReferenceId");
                if (ep.requestDtoName != null) bytesParams.add(ep.requestDtoName + " request");
                sb.append(String.join(", ", bytesParams));
                sb.append(") {\n");
                sb.append("        log.info(\"[EJB-CALL] ").append(ep.useCaseName).append(" (bytes)\");\n");
                sb.append("        ").append(ep.responseDtoName).append(" response = ").append(ep.methodName).append("(");
                List<String> callArgs = new ArrayList<>();
                if (hasCrRef) callArgs.add("crReferenceId");
                if (ep.requestDtoName != null) callArgs.add("request");
                sb.append(String.join(", ", callArgs));
                sb.append(");\n");
                // Trouver le champ byte[] dans le VoOut
                sb.append("        // Extraire le champ byte[] de la reponse\n");
                DtoInfo ejbOutDto = findDto(analysis, ep.ejbOutputDtoName);
                String byteFieldGetter = "null";
                if (ejbOutDto != null) {
                    for (DtoInfo.FieldInfo bf : ejbOutDto.getFields()) {
                        if (bf.getType() != null && bf.getType().contains("byte")) {
                            String restByteName = FIELD_RENAME.getOrDefault(bf.getName(), bf.getName());
                            byteFieldGetter = "response.get" + capitalize(restByteName) + "()";
                            break;
                        }
                    }
                }
                sb.append("        return response != null ? ").append(byteFieldGetter).append(" : null;\n");
                sb.append("    }\n\n");
            }
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] JndiAdapter genere : {}", adapterName);
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : MockAdapter
    // =====================================================================

    private void generateMockAdapter(Path srcMain, BianControllerGroup group, ProjectAnalysisResult analysis) throws IOException {
        String adapterName = toPascalCase(group.serviceDomain) + "MockAdapter";
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_MOCK);
        Path file = dir.resolve(adapterName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_MOCK).append(";\n\n");

        Set<String> imports = new TreeSet<>();
        for (BianEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
        }
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + group.serviceInterfaceName + ";");
        imports.add("import org.slf4j.Logger;");
        imports.add("import org.slf4j.LoggerFactory;");
        imports.add("import org.springframework.context.annotation.Profile;");
        imports.add("import org.springframework.stereotype.Service;");

        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        sb.append("@Service\n");
        sb.append("@Profile(\"mock\")\n");
        sb.append("public class ").append(adapterName).append(" implements ").append(group.serviceInterfaceName).append(" {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");

        for (BianEndpoint ep : group.endpoints) {
            String returnType = ep.responseDtoName != null ? ep.responseDtoName : "void";
            boolean hasReturn = ep.responseDtoName != null;

            sb.append("    @Override\n");
            sb.append("    public ").append(returnType).append(" ").append(ep.methodName).append("(");

            List<String> params = new ArrayList<>();
            boolean hasCrRef = ep.bianMapping.getUrl() != null && ep.bianMapping.getUrl().contains("{cr-reference-id}");
            if (hasCrRef) params.add("String crReferenceId");
            if (ep.requestDtoName != null) params.add(ep.requestDtoName + " request");
            sb.append(String.join(", ", params));
            sb.append(") {\n");

            sb.append("        log.info(\"[MOCK] ").append(ep.methodName).append(" appele\");\n");

            if (hasReturn) {
                sb.append("        ").append(ep.responseDtoName).append(" response = new ").append(ep.responseDtoName).append("();\n");
                // Remplir avec des donnees mock realistes
                generateMockFieldValues(sb, ep, analysis);

                // Echo : recopier les champs de la request dans la response (ecrase les mocks)
                if (ep.requestDtoName != null) {
                    sb.append("        // Echo : recopier les champs de la request dans la response\n");
                    DtoInfo reqDto = findDto(analysis, ep.ejbInputDtoName);
                    DtoInfo resDto = findDto(analysis, ep.ejbOutputDtoName);
                    if (reqDto != null && resDto != null) {
                        Set<String> resFields = new HashSet<>();
                        for (DtoInfo.FieldInfo f : resDto.getFields()) resFields.add(f.getName());
                        for (DtoInfo.FieldInfo f : reqDto.getFields()) {
                            if ("serialVersionUID".equals(f.getName()) || f.isStatic()) continue;
                            if (LEGACY_FIELDS.contains(f.getName())) continue;
                            if (isFrameworkType(f.getType())) continue;
                            // Correction: exclure les champs @XmlTransient de l'echo
                            if (f.isHasXmlTransient()) continue;
                            if (resFields.contains(f.getName())) {
                                String restReqName = FIELD_RENAME.getOrDefault(f.getName(), f.getName());
                                String restResName = FIELD_RENAME.getOrDefault(f.getName(), f.getName());
                                String getter = ("boolean".equals(f.getType()) ? "is" : "get") + capitalize(restReqName);
                                String setter = "set" + capitalize(restResName);
                                sb.append("        if (request.").append(getter).append("() != null) ");
                                sb.append("response.").append(setter).append("(request.").append(getter).append("());\n");
                            }
                        }
                    }
                }

                sb.append("        return response;\n");
            }

            sb.append("    }\n\n");

            // Methode Bytes supplementaire pour les endpoints byte[]
            if (isByteArrayResponse(ep, analysis)) {
                sb.append("    @Override\n");
                sb.append("    public byte[] ").append(ep.methodName).append("Bytes(");
                sb.append(String.join(", ", params));
                sb.append(") {\n");
                sb.append("        log.info(\"[MOCK] ").append(ep.methodName).append("Bytes appele\");\n");
                sb.append("        // Mock PDF : %PDF-1.4 header\n");
                sb.append("        return new byte[]{37, 80, 68, 70, 45, 49, 46, 52};\n");
                sb.append("    }\n\n");
            }
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] MockAdapter genere : {}", adapterName);
    }

    private void generateMockFieldValues(StringBuilder sb, BianEndpoint ep, ProjectAnalysisResult analysis) {
        DtoInfo ejbOut = findDto(analysis, ep.ejbOutputDtoName);
        if (ejbOut == null) return;

        for (DtoInfo.FieldInfo field : ejbOut.getFields()) {
            if ("serialVersionUID".equals(field.getName()) || field.isStatic()) continue;
            if (LEGACY_FIELDS.contains(field.getName())) continue;
            if (isFrameworkType(field.getType())) continue;
            // Correction: exclure les champs @XmlTransient du MockAdapter aussi
            if (field.isHasXmlTransient()) continue;

            String restName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
            String setter = "set" + capitalize(restName);
            String type = cleanType(field.getType());

            String mockValue = switch (type) {
                case "String" -> getMockStringValue(restName);
                case "BigDecimal" -> "new java.math.BigDecimal(\"15000.00\")";
                case "int", "Integer" -> "1";
                case "long", "Long" -> "1L";
                case "boolean", "Boolean" -> "true";
                case "double", "Double" -> "0.035";
                case "byte[]", "byte []", "Byte[]", "Byte []", "bytes" -> "new byte[]{37,80,68,70}";
                default -> {
                    if (isEnumType(type, analysis)) {
                        yield type + ".values()[0]";
                    }
                    yield null;
                }
            };

            if (mockValue != null) {
                sb.append("        response.").append(setter).append("(").append(mockValue).append(");\n");
            }
        }
    }

    private String getMockStringValue(String fieldName) {
        String lower = fieldName.toLowerCase();
        if (lower.contains("carte") || lower.contains("numero")) return "\"4532111122223333\"";
        if (lower.contains("rib") || lower.contains("compte") || lower.contains("iban")) return "\"001078045600100000000000\"";
        if (lower.contains("nom")) return "\"NORDINE\"";
        if (lower.contains("prenom")) return "\"Hamza\"";
        if (lower.contains("email")) return "\"hamza.nordine@example.ma\"";
        if (lower.contains("telephone") || lower.contains("tel")) return "\"+212661234567\"";
        if (lower.contains("adresse")) return "\"123 Bd Mohammed V, Casablanca\"";
        if (lower.contains("statut") || lower.contains("status")) return "\"ACTIF\"";
        if (lower.contains("devise") || lower.contains("currency")) return "\"MAD\"";
        if (lower.contains("motif")) return "\"Demande client\"";
        if (lower.contains("date")) return "\"2026-04-06\"";
        if (lower.contains("identifiant") || lower.contains("corporate") || lower.contains("client")) return "\"CORP-001\"";
        if (lower.contains("code")) return "\"OK\"";
        if (lower.contains("message")) return "\"Operation reussie\"";
        if (lower.contains("reference")) return "\"REF-2026-001\"";
        if (lower.contains("type")) return "\"STANDARD\"";
        if (lower.contains("sujet")) return "\"Notification\"";
        if (lower.contains("contenu")) return "\"Bienvenue chez BOA\"";
        return "\"MOCK-VALUE\"";
    }

    // =====================================================================
    // COUCHE API : Controllers BIAN
    // =====================================================================

    private void generateBianController(Path srcMain, BianControllerGroup group, ProjectAnalysisResult analysis) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_API_CONTROLLER);
        Path file = dir.resolve(group.controllerName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_CONTROLLER).append(";\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        for (BianEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
        }
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + group.serviceInterfaceName + ";");
        imports.add("import io.swagger.v3.oas.annotations.Operation;");
        imports.add("import io.swagger.v3.oas.annotations.Parameter;");
        imports.add("import io.swagger.v3.oas.annotations.responses.ApiResponse;");
        imports.add("import io.swagger.v3.oas.annotations.responses.ApiResponses;");
        imports.add("import io.swagger.v3.oas.annotations.tags.Tag;");
        imports.add("import org.springframework.validation.annotation.Validated;");
        imports.add("import jakarta.validation.Valid;");
        imports.add("import org.slf4j.Logger;");
        imports.add("import org.slf4j.LoggerFactory;");
        imports.add("import org.springframework.http.HttpStatus;");
        imports.add("import org.springframework.http.ResponseEntity;");
        imports.add("import org.springframework.web.bind.annotation.*;");

        // BUG 4: @PreAuthorize si @RolesAllowed detecte
        boolean hasRoles = group.endpoints.stream()
                .anyMatch(ep -> ep.useCaseInfo != null && ep.useCaseInfo.getRolesAllowed() != null
                        && !ep.useCaseInfo.getRolesAllowed().isEmpty());
        if (hasRoles) {
            imports.add("import org.springframework.security.access.prepost.PreAuthorize;");
        }

        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        // Isolation respectee — aucun commentaire revelant l'implementation interne

        String basePath = "/api/v1/" + group.serviceDomain;
        String tagName = group.serviceDomainTitle;
        String tagDesc = "BIAN";
        if (group.bianId != null && !group.bianId.isEmpty()) {
            tagDesc += " " + group.bianId;
        }
        tagDesc += " — " + tagName;

        sb.append("@RestController\n");
        sb.append("@RequestMapping(\"").append(basePath).append("\")\n");
        sb.append("@Validated\n");
        sb.append("@Tag(name = \"").append(tagName).append("\", description = \"").append(tagDesc).append("\")\n");
        sb.append("public class ").append(group.controllerName).append(" {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(group.controllerName).append(".class);\n");
        String serviceField = toLowerCamel(group.serviceInterfaceName);
        sb.append("    private final ").append(group.serviceInterfaceName).append(" ").append(serviceField).append(";\n\n");

        sb.append("    public ").append(group.controllerName).append("(").append(group.serviceInterfaceName).append(" ").append(serviceField).append(") {\n");
        sb.append("        this.").append(serviceField).append(" = ").append(serviceField).append(";\n");
        sb.append("    }\n\n");

        for (BianEndpoint ep : group.endpoints) {
            BianMapping m = ep.bianMapping;
            String url = m.getUrl(); // ex: /card-management/{cr-reference-id}/activation/execution
            // Extraire le path relatif au basePath
            String relativePath = url;
            if (relativePath.startsWith("/" + group.serviceDomain)) {
                relativePath = relativePath.substring(("/" + group.serviceDomain).length());
            }
            if (relativePath.isEmpty()) relativePath = "";

            String httpMethod = m.getHttpMethod() != null ? m.getHttpMethod().toUpperCase() : "POST";
            int httpStatus = m.getHttpStatus() > 0 ? m.getHttpStatus() : 200;
            String operationId = m.buildOperationId();
            String summary = m.getSummary() != null ? m.getSummary() : humanize(ep.methodName);

            sb.append("    @Operation(operationId = \"").append(operationId).append("\",\n");
            sb.append("               summary = \"").append(summary).append("\")\n");
            // @ApiResponses Swagger — documentation des codes de reponse
            sb.append("    @ApiResponses(value = {\n");
            if (httpStatus == 201) {
                sb.append("        @ApiResponse(responseCode = \"201\", description = \"Ressource creee avec succes\"),\n");
            } else {
                sb.append("        @ApiResponse(responseCode = \"200\", description = \"Operation reussie\"),\n");
            }
            sb.append("        @ApiResponse(responseCode = \"400\", description = \"Requete invalide\"),\n");
            sb.append("        @ApiResponse(responseCode = \"401\", description = \"Non authentifie\"),\n");
            sb.append("        @ApiResponse(responseCode = \"403\", description = \"Acces refuse\"),\n");
            sb.append("        @ApiResponse(responseCode = \"500\", description = \"Erreur interne du serveur\")\n");
            sb.append("    })\n");

            // BUG 4: @PreAuthorize si @RolesAllowed detecte sur le UseCase
            if (ep.useCaseInfo != null && ep.useCaseInfo.getRolesAllowed() != null
                    && !ep.useCaseInfo.getRolesAllowed().isEmpty()) {
                List<String> roles = ep.useCaseInfo.getRolesAllowed();
                String rolesExpr = roles.stream()
                        .map(r -> "'" + r + "'")
                        .collect(Collectors.joining(", "));
                sb.append("    @PreAuthorize(\"hasAnyRole(").append(rolesExpr).append(")\")").append("\n");
            }

            // Annotation HTTP method
            String mappingAnnotation = switch (httpMethod) {
                case "GET" -> "@GetMapping";
                case "PUT" -> "@PutMapping";
                case "DELETE" -> "@DeleteMapping";
                case "PATCH" -> "@PatchMapping";
                default -> "@PostMapping";
            };
            sb.append("    ").append(mappingAnnotation).append("(\"").append(relativePath).append("\")\n");

            // ResponseStatus pour 201
            if (httpStatus == 201) {
                sb.append("    @ResponseStatus(HttpStatus.CREATED)\n");
            }

            // Correction 7: byte[] → Content-Disposition
            boolean isByteArray = isByteArrayResponse(ep, analysis);
            String returnType;
            if (isByteArray) {
                returnType = "byte[]";
            } else {
                returnType = ep.responseDtoName != null ? ep.responseDtoName : "Void";
            }
            sb.append("    public ResponseEntity<").append(returnType).append("> ").append(ep.methodName).append("(\n");

            List<String> methodParams = new ArrayList<>();
            boolean hasCrRef = url.contains("{cr-reference-id}");
            boolean hasBqRef = url.contains("{bq-reference-id}");

            if (hasCrRef) {
                methodParams.add("            @Parameter(description = \"Control Record Reference ID\")\n            @PathVariable(\"cr-reference-id\") String crReferenceId");
            }
            if (hasBqRef) {
                methodParams.add("            @Parameter(description = \"Behavior Qualifier Reference ID\")\n            @PathVariable(\"bq-reference-id\") String bqReferenceId");
            }
            if (ep.requestDtoName != null) {
                methodParams.add("            @Valid @RequestBody " + ep.requestDtoName + " request");
            }

            sb.append(String.join(",\n", methodParams));
            sb.append(") {\n\n");

            sb.append("        log.info(\"[REST-IN] ").append(httpMethod).append(" ").append(basePath).append(relativePath).append("\");");
            sb.append("\n");

            // try/catch avec [REST-ERROR]
            sb.append("        try {\n");

            // Appel au service
            List<String> callParams = new ArrayList<>();
            if (hasCrRef) callParams.add("crReferenceId");
            if (ep.requestDtoName != null) callParams.add("request");

            if (isByteArray) {
                sb.append("            byte[] data = ").append(serviceField).append(".").append(ep.methodName).append("Bytes(").append(String.join(", ", callParams)).append(");\n");
                sb.append("            log.info(\"[REST-OUT] 200 OK (byte[] size={})\", data != null ? data.length : 0);\n");
                sb.append("            return ResponseEntity.ok()\n");
                sb.append("                    .header(\"Content-Disposition\", \"attachment; filename=document.pdf\")\n");
                sb.append("                    .header(\"Content-Type\", \"application/pdf\")\n");
                sb.append("                    .body(data);\n");
            } else if (ep.responseDtoName != null) {
                sb.append("            ").append(ep.responseDtoName).append(" response = ").append(serviceField).append(".").append(ep.methodName).append("(").append(String.join(", ", callParams)).append(");\n");
                sb.append("            log.info(\"[REST-OUT] ").append(httpStatus).append(" OK\");\n");
                if (httpStatus == 201) {
                    sb.append("            return ResponseEntity.status(HttpStatus.CREATED).body(response);\n");
                } else {
                    sb.append("            return ResponseEntity.ok(response);\n");
                }
            } else {
                sb.append("            ").append(serviceField).append(".").append(ep.methodName).append("(").append(String.join(", ", callParams)).append(");\n");
                sb.append("            log.info(\"[REST-OUT] ").append(httpStatus).append(" OK\");\n");
                sb.append("            return ResponseEntity.ok().build();\n");
            }

            sb.append("        } catch (Exception e) {\n");
            sb.append("            log.error(\"[REST-ERROR] ").append(ep.methodName).append(" failed\", e);\n");
            sb.append("            throw e;\n");
            sb.append("        }\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] Controller BIAN genere : {}", group.controllerName);
    }

    // =====================================================================
    // CONFIG : GlobalExceptionHandler
    // =====================================================================

    private void generateGlobalExceptionHandler(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_CONFIG);
        Path file = dir.resolve("GlobalExceptionHandler.java");

        String code = """
                package %s;

                import %s.ApiException;
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.slf4j.MDC;
                import org.springframework.http.HttpStatus;
                import org.springframework.http.ResponseEntity;
                import org.springframework.security.access.AccessDeniedException;
                import org.springframework.web.bind.MethodArgumentNotValidException;
                import org.springframework.web.bind.annotation.ControllerAdvice;
                import org.springframework.web.bind.annotation.ExceptionHandler;

                import java.time.LocalDateTime;
                import java.util.LinkedHashMap;
                import java.util.Map;
                import java.util.stream.Collectors;

                /**
                 * Gestionnaire global des exceptions REST.
                 * Produit des reponses JSON structurees avec correlation-id pour la tracabilite.
                 */
                @ControllerAdvice
                public class GlobalExceptionHandler {

                    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

                    private Map<String, Object> buildErrorBody(int status, String code, String message) {
                        Map<String, Object> body = new LinkedHashMap<>();
                        body.put("timestamp", LocalDateTime.now().toString());
                        body.put("status", status);
                        body.put("code", code);
                        body.put("message", message);
                        String correlationId = MDC.get("correlationId");
                        if (correlationId != null) {
                            body.put("correlationId", correlationId);
                        }
                        return body;
                    }

                    @ExceptionHandler(ApiException.class)
                    public ResponseEntity<Map<String, Object>> handleApiException(ApiException ex) {
                        log.warn("[EXCEPTION] ApiException: {} (code={})", ex.getMessage(), ex.getCode());
                        Map<String, Object> body = buildErrorBody(ex.getHttpStatus(), ex.getCode(), ex.getMessage());
                        return new ResponseEntity<>(body, HttpStatus.valueOf(ex.getHttpStatus()));
                    }

                    @ExceptionHandler(MethodArgumentNotValidException.class)
                    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
                        String errors = ex.getBindingResult().getFieldErrors().stream()
                            .map(e -> e.getField() + ": " + e.getDefaultMessage())
                            .collect(Collectors.joining(", "));
                        log.warn("[EXCEPTION] Validation: {}", errors);
                        Map<String, Object> body = buildErrorBody(400, "VALIDATION_ERROR", errors);
                        return new ResponseEntity<>(body, HttpStatus.BAD_REQUEST);
                    }

                    @ExceptionHandler(AccessDeniedException.class)
                    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex) {
                        log.warn("[EXCEPTION] Acces refuse: {}", ex.getMessage());
                        Map<String, Object> body = buildErrorBody(403, "ACCESS_DENIED", "Acces refuse");
                        return new ResponseEntity<>(body, HttpStatus.FORBIDDEN);
                    }

                    @ExceptionHandler(RuntimeException.class)
                    public ResponseEntity<Map<String, Object>> handleRuntime(RuntimeException ex) {
                        log.error("[EXCEPTION] RuntimeException: {}", ex.getMessage(), ex);
                        String message = ex.getMessage() != null && ex.getMessage().contains("temporairement indisponible")
                            ? ex.getMessage()
                            : "Service temporairement indisponible";
                        Map<String, Object> body = buildErrorBody(503, "SERVICE_UNAVAILABLE", message);
                        return new ResponseEntity<>(body, HttpStatus.SERVICE_UNAVAILABLE);
                    }

                    @ExceptionHandler(Exception.class)
                    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
                        log.error("[EXCEPTION] Erreur interne: {}", ex.getMessage(), ex);
                        Map<String, Object> body = buildErrorBody(500, "INTERNAL_ERROR", "Erreur interne du serveur");
                        return new ResponseEntity<>(body, HttpStatus.INTERNAL_SERVER_ERROR);
                    }
                }
                """.formatted(PKG_CONFIG, PKG_DOMAIN_EXCEPTION);

        Files.writeString(file, code);
        log.info("[ACL] GlobalExceptionHandler genere");
    }

    // =====================================================================
    // CONFIG : Profils Spring
    // =====================================================================

    private void generateSpringProfiles(Path srcMain) throws IOException {
        Path resourcesDir = resolveResourcesDir(srcMain);
        Files.createDirectories(resourcesDir);

        Files.writeString(resourcesDir.resolve("application-jndi.properties"), """
                # Profil JNDI (production EJB)
                ejb.jndi.factory=org.jboss.naming.remote.client.InitialContextFactory
                ejb.jndi.provider.url=remote+http://serveur-ejb:8080
                """);

        Files.writeString(resourcesDir.resolve("application-mock.properties"), """
                # Profil Mock (tests/demo)
                # Pas de configuration JNDI necessaire
                """);

        Files.writeString(resourcesDir.resolve("application-http.properties"), """
                # Profil HTTP (futur microservices)
                # carte-service.url=http://carte-service:8080
                """);

        Files.writeString(resourcesDir.resolve("application-dev.properties"), """
                # Profil Developpement
                spring.profiles.active=mock
                logging.level.com.bank.api=DEBUG
                springdoc.swagger-ui.enabled=true
                management.endpoints.web.exposure.include=health,info,metrics,circuitbreakers,retries,bulkheads
                """);

        Files.writeString(resourcesDir.resolve("application-prod.properties"), """
                # Profil Production
                spring.profiles.active=jndi
                logging.level.com.bank.api=WARN
                springdoc.swagger-ui.enabled=false
                management.endpoints.web.exposure.include=health,metrics
                management.endpoint.health.show-details=never
                """);

        log.info("[ACL] Profils Spring generes (jndi, mock, http, dev, prod)");
    }

    // =====================================================================
    // TESTS D'INTEGRATION
    // =====================================================================

    private void generateIntegrationTests(Path srcMain, List<BianControllerGroup> groups,
                                           ProjectAnalysisResult analysis) throws IOException {
        Path testJavaRoot = resolveTestJavaRoot(srcMain);
        String testPkg = PKG_BASE + ".controller";
        Path testDir = testJavaRoot.resolve(testPkg.replace(".", "/"));
        Files.createDirectories(testDir);

        for (BianControllerGroup group : groups) {
            String testClassName = group.controllerName + "Test";
            Path testFile = testDir.resolve(testClassName + ".java");

            StringBuilder sb = new StringBuilder();
            sb.append("package ").append(testPkg).append(";\n\n");

            // Imports
            Set<String> imports = new TreeSet<>();
            for (BianEndpoint ep : group.endpoints) {
                if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            }
            imports.add("import com.fasterxml.jackson.databind.ObjectMapper;");
            imports.add("import org.junit.jupiter.api.DisplayName;");
            imports.add("import org.junit.jupiter.api.Test;");
            imports.add("import org.springframework.beans.factory.annotation.Autowired;");
            imports.add("import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;");
            imports.add("import org.springframework.boot.test.context.SpringBootTest;");
            imports.add("import org.springframework.http.MediaType;");
            imports.add("import org.springframework.test.context.ActiveProfiles;");
            imports.add("import org.springframework.test.web.servlet.MockMvc;");
            imports.add("import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;");
            imports.add("import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;");

            for (String imp : imports) sb.append(imp).append("\n");
            sb.append("\n");

            sb.append("@SpringBootTest\n");
            sb.append("@AutoConfigureMockMvc\n");
            sb.append("@ActiveProfiles(\"mock\")\n");
            sb.append("class ").append(testClassName).append(" {\n\n");

            sb.append("    @Autowired\n");
            sb.append("    private MockMvc mockMvc;\n\n");
            sb.append("    @Autowired\n");
            sb.append("    private ObjectMapper objectMapper;\n\n");

            String basePath = "/api/v1/" + group.serviceDomain;

            for (BianEndpoint ep : group.endpoints) {
                BianMapping m = ep.bianMapping;
                String httpMethod = m.getHttpMethod() != null ? m.getHttpMethod().toUpperCase() : "POST";
                int expectedStatus = m.getHttpStatus() > 0 ? m.getHttpStatus() : 200;
                String url = m.getUrl();
                // Remplacer les path variables par des valeurs de test
                String testUrl = basePath + url.substring(("/" + group.serviceDomain).length());
                testUrl = testUrl.replace("{cr-reference-id}", "TEST-CR-001")
                                 .replace("{bq-reference-id}", "TEST-BQ-001");

                // Test nominal
                sb.append("    @Test\n");
                sb.append("    void ").append(ep.methodName).append("_shouldReturn").append(expectedStatus).append("() throws Exception {\n");

                String mockMvcMethod = switch (httpMethod) {
                    case "GET" -> "get";
                    case "PUT" -> "put";
                    case "DELETE" -> "delete";
                    case "PATCH" -> "patch";
                    default -> "post";
                };

                if (ep.requestDtoName != null) {
                    sb.append("        ").append(ep.requestDtoName).append(" request = new ").append(ep.requestDtoName).append("();\n");
                    sb.append("        // TODO: Remplir les champs obligatoires\n\n");
                    sb.append("        mockMvc.perform(").append(mockMvcMethod).append("(\"").append(testUrl).append("\")\n");
                    sb.append("                .contentType(MediaType.APPLICATION_JSON)\n");
                    sb.append("                .content(objectMapper.writeValueAsString(request)))\n");
                } else {
                    sb.append("        mockMvc.perform(").append(mockMvcMethod).append("(\"").append(testUrl).append("\"))\n");
                }

                 sb.append("                .andExpect(status().is(").append(expectedStatus).append("))");
                // Verifier le content-type JSON si reponse non-byte[]
                boolean isByteArray = isByteArrayResponse(ep, analysis);
                if (!isByteArray && ep.responseDtoName != null) {
                    sb.append("\n                .andExpect(content().contentType(MediaType.APPLICATION_JSON))");
                }
                sb.append(";\n");
                sb.append("    }\n\n");;

                // Test validation (pour les endpoints avec body)
                if (ep.requestDtoName != null && !"GET".equals(httpMethod)) {
                    sb.append("    @Test\n");
                    sb.append("    @DisplayName(\"Validation: ").append(ep.methodName).append(" avec body vide doit retourner 400\")\n");
                    sb.append("    void ").append(ep.methodName).append("_withEmptyBody_shouldReturn400() throws Exception {\n");
                    sb.append("        mockMvc.perform(").append(mockMvcMethod).append("(\"").append(testUrl).append("\")\n");
                    sb.append("                .contentType(MediaType.APPLICATION_JSON)\n");
                    sb.append("                .content(\"{}\"))\n");
                    sb.append("                .andExpect(status().isBadRequest());\n");
                    sb.append("    }\n\n");
                }
            }

            sb.append("}\n");

            Files.writeString(testFile, sb.toString());
            log.info("[ACL] Test genere : {}", testClassName);
        }

        // Test de connectivite
        generateConnectivityTest(testDir);
    }

    private void generateConnectivityTest(Path testDir) throws IOException {
        String testPkg = PKG_BASE + ".controller";
        Path file = testDir.resolve("ConnectivityTest.java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(testPkg).append(";\n\n");
        sb.append("import org.junit.jupiter.api.DisplayName;\n");
        sb.append("import org.junit.jupiter.api.Test;\n");
        sb.append("import org.springframework.http.MediaType;\n");
        sb.append("import org.springframework.beans.factory.annotation.Autowired;\n");
        sb.append("import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;\n");
        sb.append("import org.springframework.boot.test.context.SpringBootTest;\n");
        sb.append("import org.springframework.test.context.ActiveProfiles;\n");
        sb.append("import org.springframework.test.web.servlet.MockMvc;\n\n");
        sb.append("import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;\n");
        sb.append("import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;\n\n");

        sb.append("@SpringBootTest\n");
        sb.append("@AutoConfigureMockMvc\n");
        sb.append("@ActiveProfiles(\"mock\")\n");
        sb.append("class ConnectivityTest {\n\n");

        sb.append("    @Autowired\n");
        sb.append("    private MockMvc mockMvc;\n\n");

        sb.append("    @Test\n");
        sb.append("    void actuatorHealth_shouldReturn200() throws Exception {\n");
        sb.append("        mockMvc.perform(get(\"/actuator/health\"))\n");
        sb.append("                .andExpect(status().isOk());\n");
        sb.append("    }\n\n");

        sb.append("    @Test\n");
        sb.append("    void openApiDocs_shouldReturn200() throws Exception {\n");
        sb.append("        mockMvc.perform(get(\"/v3/api-docs\"))\n");
        sb.append("                .andExpect(status().isOk());\n");
        sb.append("    }\n\n");

        sb.append("    @Test\n");
        sb.append("    void swaggerUi_shouldReturn200() throws Exception {\n");
        sb.append("        mockMvc.perform(get(\"/swagger-ui/index.html\"))\n");
        sb.append("                .andExpect(status().isOk());\n");
        sb.append("    }\n\n");

        sb.append("    @Test\n");
        sb.append("    @DisplayName(\"Actuator: health contient le status UP\")\n");
        sb.append("    void actuatorHealth_shouldContainStatusUp() throws Exception {\n");
        sb.append("        mockMvc.perform(get(\"/actuator/health\"))\n");
        sb.append("                .andExpect(status().isOk())\n");
        sb.append("                .andExpect(content().contentType(MediaType.APPLICATION_JSON))\n");
        sb.append("                .andExpect(jsonPath(\"$.status\").value(\"UP\"));\n");
        sb.append("    }\n\n");

        sb.append("    @Test\n");
        sb.append("    @DisplayName(\"Actuator: metrics Resilience4j accessibles\")\n");
        sb.append("    void actuatorMetrics_shouldReturn200() throws Exception {\n");
        sb.append("        mockMvc.perform(get(\"/actuator/metrics\"))\n");
        sb.append("                .andExpect(status().isOk());\n");
        sb.append("    }\n\n");

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] Test de connectivite genere");
    }

    // =====================================================================
    // METHODES UTILITAIRES
    // =====================================================================

    private DtoInfo findDto(ProjectAnalysisResult analysis, String className) {
        if (className == null) return null;
        return analysis.getDtos().stream()
                .filter(d -> d.getClassName().equals(className))
                .findFirst().orElse(null);
    }

    private String deriveRestDtoName(String ejbDtoName, String suffix, BianMapping mapping) {
        if (ejbDtoName == null) return null;

        // Cas speciaux : types primitifs ou void — pas de DTO
        if ("void".equals(ejbDtoName) || "Void".equals(ejbDtoName)) return null;

        // Cas Envelope et types framework generiques — utiliser le Service Domain BIAN
        // pour generer un nom significatif au lieu de "EnvelopeRequest"/"EnvelopeResponse"
        if (FRAMEWORK_TYPES.contains(ejbDtoName) || "Envelope".equals(ejbDtoName)
                || "Object".equals(ejbDtoName) || "Serializable".equals(ejbDtoName)) {
            String base = toPascalCase(mapping.getServiceDomain());
            String bq = mapping.getBehaviorQualifier();
            if (bq != null && !bq.isEmpty()) base += toPascalCase(bq);
            return base + suffix;
        }

        if ("String".equals(ejbDtoName) || "string".equals(ejbDtoName)) {
            // Generer un nom significatif depuis le mapping BIAN
            String base = toPascalCase(mapping.getServiceDomain());
            String bq = mapping.getBehaviorQualifier();
            if (bq != null && !bq.isEmpty()) base += toPascalCase(bq);
            return base + suffix;
        }
        if ("boolean".equals(ejbDtoName) || "Boolean".equals(ejbDtoName)
            || "int".equals(ejbDtoName) || "Integer".equals(ejbDtoName)
            || "long".equals(ejbDtoName) || "Long".equals(ejbDtoName)
            || "double".equals(ejbDtoName) || "Double".equals(ejbDtoName)
            || "byte[]".equals(ejbDtoName)) {
            String base = toPascalCase(mapping.getServiceDomain());
            String bq = mapping.getBehaviorQualifier();
            if (bq != null && !bq.isEmpty()) base += toPascalCase(bq);
            return base + suffix;
        }

        // Retirer VoIn/VoOut/Vo
        String base = ejbDtoName.replaceAll("(VoIn|VoOut|Vo)$", "");
        // Retirer UC/UseCase
        base = base.replaceAll("(UC|UseCase)$", "");

        // Convertir le verbe en nom d'action
        for (Map.Entry<String, String> entry : VERB_TO_NOUN.entrySet()) {
            if (base.startsWith(entry.getKey())) {
                base = entry.getValue() + base.substring(entry.getKey().length());
                break;
            }
        }

        // Eviter les doublons : si base se termine deja par Request/Response, ne pas re-suffixer
        if (base.endsWith("Request") && "Request".equals(suffix)) return base;
        if (base.endsWith("Response") && "Response".equals(suffix)) return base;

        // Eviter les noms trop courts (< 3 chars) — utiliser le Service Domain
        if (base.length() < 3) {
            base = toPascalCase(mapping.getServiceDomain());
            String bq = mapping.getBehaviorQualifier();
            if (bq != null && !bq.isEmpty()) base += toPascalCase(bq);
        }

        return base + suffix;
    }

    private List<RestField> deriveRestFields(DtoInfo ejbDto, boolean isRequest) {
        List<RestField> fields = new ArrayList<>();
        if (ejbDto == null) {
            if (isRequest) {
                fields.add(new RestField("identifiant", "String", true));
            }
            return fields;
        }

        for (DtoInfo.FieldInfo field : ejbDto.getFields()) {
            if ("serialVersionUID".equals(field.getName())) continue;
            if (field.isStatic()) continue;
            if (LEGACY_FIELDS.contains(field.getName())) continue;
            if (isFrameworkType(field.getType())) continue;
            // Correction 7: @XmlTransient → exclure du RestDTO
            if (field.isHasXmlTransient()) continue;

            String restName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
            String restType = cleanType(field.getType());
            boolean required = field.isRequired() && isRequest;

            // Correction 4: @ValidRIB/@ValidIBAN → préserver les validateurs custom
            List<String> customValidators = new ArrayList<>();
            if (field.getCustomAnnotations() != null) {
                for (String ann : field.getCustomAnnotations()) {
                    if (ann.contains("ValidRIB") || ann.contains("ValidIBAN")) {
                        String cleaned = ann.replace("javax.", "jakarta.");
                        if (!cleaned.startsWith("@")) cleaned = "@" + cleaned;
                        customValidators.add(cleaned);
                    }
                }
            }

            RestField rf = new RestField(restName, restType, required);
            rf.customValidators = customValidators;
            fields.add(rf);
        }

        return fields;
    }

    private boolean isEnumType(String type, ProjectAnalysisResult analysis) {
        if (type == null || analysis.getDetectedEnums() == null) return false;
        return analysis.getDetectedEnums().stream()
                .anyMatch(e -> e.getName().equals(type));
    }

    private String cleanType(String type) {
        if (type == null) return "String";
        if (isFrameworkType(type)) return "Object";
        return type.replace("java.lang.", "").replace("java.util.", "");
    }

    private boolean isFrameworkType(String type) {
        if (type == null) return false;
        return FRAMEWORK_TYPES.contains(type) || type.startsWith("ma.eai.") || type.contains("Envelope");
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }

    private String toLowerCamel(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toLowerCase() + s.substring(1);
    }

    private String toPascalCase(String kebab) {
        if (kebab == null || kebab.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (String part : kebab.split("-")) {
            if (!part.isEmpty()) {
                sb.append(Character.toUpperCase(part.charAt(0)));
                if (part.length() > 1) sb.append(part.substring(1));
            }
        }
        return sb.toString();
    }

    private String toKebabCase(String camelCase) {
        if (camelCase == null) return "";
        return camelCase.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
    }

    private String toSnakeCase(String camelCase) {
        if (camelCase == null) return "";
        return camelCase.replaceAll("([a-z])([A-Z])", "$1_$2").toLowerCase();
    }

    private String humanize(String camelCase) {
        if (camelCase == null) return "";
        return camelCase.replaceAll("([a-z])([A-Z])", "$1 $2");
    }

    /**
     * Detecte si un UseCase retourne byte[] (ex: GenererDocumentUC).
     */
    private boolean isByteArrayResponse(BianEndpoint ep, ProjectAnalysisResult analysis) {
        // Verifier si le VoOut contient un champ byte[]
        DtoInfo ejbOut = findDto(analysis, ep.ejbOutputDtoName);
        if (ejbOut != null) {
            for (DtoInfo.FieldInfo field : ejbOut.getFields()) {
                String type = field.getType();
                if (type != null && (type.contains("byte[]") || type.contains("Byte[]"))) {
                    return true;
                }
            }
        }
        // Fallback: detecter par le nom du UseCase
        if (ep.useCaseName != null) {
            String lower = ep.useCaseName.toLowerCase();
            if (lower.contains("document") || lower.contains("generer") || lower.contains("export") || lower.contains("pdf")) {
                return true;
            }
        }
        return false;
    }

    // =====================================================================
    // COUCHE API : Annotations de validation (@ValidRIB, @ValidIBAN)
    // =====================================================================

    private void generateValidationAnnotations(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_API_DTO_VALIDATION);

        // ValidRIB.java
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_VALIDATION).append(";\n\n");
        sb.append("import jakarta.validation.Constraint;\n");
        sb.append("import jakarta.validation.Payload;\n");
        sb.append("import java.lang.annotation.*;\n\n");
        sb.append("@Documented\n");
        sb.append("@Constraint(validatedBy = ValidRIBValidator.class)\n");
        sb.append("@Target({ElementType.FIELD, ElementType.PARAMETER})\n");
        sb.append("@Retention(RetentionPolicy.RUNTIME)\n");
        sb.append("public @interface ValidRIB {\n");
        sb.append("    String message() default \"RIB invalide\";\n");
        sb.append("    Class<?>[] groups() default {};\n");
        sb.append("    Class<? extends Payload>[] payload() default {};\n");
        sb.append("}\n");
        Files.writeString(dir.resolve("ValidRIB.java"), sb.toString());
        log.info("[ACL] Validation generee : ValidRIB");

        // ValidRIBValidator.java
        sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_VALIDATION).append(";\n\n");
        sb.append("import jakarta.validation.ConstraintValidator;\n");
        sb.append("import jakarta.validation.ConstraintValidatorContext;\n\n");
        sb.append("public class ValidRIBValidator implements ConstraintValidator<ValidRIB, String> {\n\n");
        sb.append("    @Override\n");
        sb.append("    public boolean isValid(String value, ConstraintValidatorContext context) {\n");
        sb.append("        if (value == null || value.isBlank()) return true; // @NotBlank gere le cas null\n");
        sb.append("        // RIB marocain : 24 chiffres\n");
        sb.append("        return value.matches(\"^[0-9]{24}$\");\n");
        sb.append("    }\n");
        sb.append("}\n");
        Files.writeString(dir.resolve("ValidRIBValidator.java"), sb.toString());
        log.info("[ACL] Validation generee : ValidRIBValidator");

        // ValidIBAN.java
        sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_VALIDATION).append(";\n\n");
        sb.append("import jakarta.validation.Constraint;\n");
        sb.append("import jakarta.validation.Payload;\n");
        sb.append("import java.lang.annotation.*;\n\n");
        sb.append("@Documented\n");
        sb.append("@Constraint(validatedBy = ValidIBANValidator.class)\n");
        sb.append("@Target({ElementType.FIELD, ElementType.PARAMETER})\n");
        sb.append("@Retention(RetentionPolicy.RUNTIME)\n");
        sb.append("public @interface ValidIBAN {\n");
        sb.append("    String message() default \"IBAN invalide\";\n");
        sb.append("    Class<?>[] groups() default {};\n");
        sb.append("    Class<? extends Payload>[] payload() default {};\n");
        sb.append("}\n");
        Files.writeString(dir.resolve("ValidIBAN.java"), sb.toString());
        log.info("[ACL] Validation generee : ValidIBAN");

        // ValidIBANValidator.java
        sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_VALIDATION).append(";\n\n");
        sb.append("import jakarta.validation.ConstraintValidator;\n");
        sb.append("import jakarta.validation.ConstraintValidatorContext;\n\n");
        sb.append("public class ValidIBANValidator implements ConstraintValidator<ValidIBAN, String> {\n\n");
        sb.append("    @Override\n");
        sb.append("    public boolean isValid(String value, ConstraintValidatorContext context) {\n");
        sb.append("        if (value == null || value.isBlank()) return true; // @NotBlank gere le cas null\n");
        sb.append("        // IBAN : 2 lettres + 2 chiffres + BBAN (max 30 chars)\n");
        sb.append("        return value.matches(\"^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$\");\n");
        sb.append("    }\n");
        sb.append("}\n");
        Files.writeString(dir.resolve("ValidIBANValidator.java"), sb.toString());
        log.info("[ACL] Validation generee : ValidIBANValidator");
    }
}
