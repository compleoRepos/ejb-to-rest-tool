package com.bank.tools.generator.engine;

import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.AdapterDescriptor;
import com.bank.tools.generator.model.InputMode;
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
    private String PKG_INFRA_REST_ADAPTER;
    private String PKG_INFRA_REST_CONFIG;
    private String PKG_CONFIG;
    private String PKG_API_DTO_VALIDATION;
    private String PKG_API_DTO_ENVELOPE;

    // Tracking des types de champs des Response DTOs generes (pour eviter les type mismatch dans les mappers)
    // Cle = responseDtoName, Valeur = Map<fieldName, cleanedFieldType>
    private final java.util.Map<String, java.util.Map<String, String>> responseDtoFieldTypes = new java.util.HashMap<>();

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
        generate(srcMain, analysis, bianMappings, "jndi");
    }

    public void generate(Path srcMain, ProjectAnalysisResult analysis,
                         Map<String, BianMapping> bianMappings, String transportMode) throws IOException {

        log.info("[ACL] ========== DEBUT GENERATION ARCHITECTURE ACL (transport={}) ==========", transportMode);
        boolean restMode = "rest".equalsIgnoreCase(transportMode);

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

        // 3c. Generer les classes d'enveloppe standardisee (ApiRequest<T>, ApiResponse<T>)
        generateEnvelopeClasses(srcMain);

        // 4. Generer les Exceptions (couche Domain)
        generateDomainExceptions(srcMain, analysis);

        // 5. Generer les Interfaces Service (couche Domain)
        for (BianControllerGroup group : groups) {
            generateServiceInterface(srcMain, group, analysis);
        }

        // 6. Generer les EJB Types (couche Infrastructure)
        generateEjbTypes(srcMain, analysis, groups);

        // 7. Generer les Mappers (couche Infrastructure)
        for (BianControllerGroup group : groups) {
            for (BianEndpoint ep : group.endpoints) {
                generateMapper(srcMain, analysis, ep);
            }
        }

        // 8. Generer l'ExceptionTranslator (couche Infrastructure)
        generateExceptionTranslator(srcMain, analysis);

        // 9. Generer les JndiAdapters (couche Infrastructure) — toujours generes comme fallback
        for (BianControllerGroup group : groups) {
            generateJndiAdapter(srcMain, group, analysis);
        }

        // 10. Generer les MockAdapters (couche Infrastructure) — toujours generes pour les tests
        for (BianControllerGroup group : groups) {
            generateMockAdapter(srcMain, group, analysis);
        }

        if (restMode) {
            // 10b. Generer les RestAdapters (couche Infrastructure — appel adapter WebSphere via REST)
            log.info("[ACL] Mode REST : generation des RestAdapters et RestClientConfig");
            for (BianControllerGroup group : groups) {
                generateRestAdapter(srcMain, group, analysis);
            }

            // 10c. Generer la configuration RestTemplate (couche Infrastructure)
            generateRestClientConfig(srcMain);
        }

        // 11. Generer les Controllers BIAN (couche API)
        for (BianControllerGroup group : groups) {
            generateBianController(srcMain, group, analysis);
        }

        // 12. Generer le GlobalExceptionHandler (Config)
        generateGlobalExceptionHandler(srcMain);

        // 13. Generer les profils Spring (Config)
        generateSpringProfiles(srcMain, restMode);

        // 14. Generer les tests d'integration
        generateIntegrationTests(srcMain, groups, analysis);

        if (restMode) {
            // 15. Generer les tests Pact Consumer (contrats avec l'adapter WebSphere)
            log.info("[ACL] Mode REST : generation des Pact Consumer Tests");
            generatePactConsumerTests(srcMain, groups, analysis);
        }

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
        PKG_INFRA_REST_ADAPTER = PKG_BASE + ".infrastructure.rest.adapter";
        PKG_INFRA_REST_CONFIG = PKG_BASE + ".infrastructure.rest.config";
        PKG_CONFIG = PKG_BASE + ".config";
        PKG_API_DTO_VALIDATION = PKG_BASE + ".dto.validation";
        PKG_API_DTO_ENVELOPE = PKG_BASE + ".dto.envelope";
    }

    private void createDirectories(Path srcMain) throws IOException {
        Path javaRoot = resolveJavaRoot(srcMain);
        String[] packages = {
                PKG_API_CONTROLLER, PKG_API_DTO_REQUEST, PKG_API_DTO_RESPONSE, PKG_API_ENUM,
                PKG_DOMAIN_SERVICE, PKG_DOMAIN_EXCEPTION,
                PKG_INFRA_EJB_ADAPTER, PKG_INFRA_EJB_MAPPER, PKG_INFRA_EJB_EXCEPTION,
                PKG_INFRA_EJB_TYPES, PKG_INFRA_MOCK,
                PKG_INFRA_REST_ADAPTER, PKG_INFRA_REST_CONFIG,
                PKG_CONFIG, PKG_API_DTO_VALIDATION, PKG_API_DTO_ENVELOPE
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

            // FIX DEFAUT-1 : Pour les INLINE_ACTION / ACTION_HANDLER sans DTO EJB,
            // deriver les noms de RestDTOs depuis le mapping BIAN + envelopeFields
            boolean isActionOrInline = uc.isActionHandler() || uc.isInlineAction();
            if (isActionOrInline && ep.requestDtoName == null
                    && uc.getEnvelopeFields() != null && !uc.getEnvelopeFields().isEmpty()) {
                String base = toPascalCase(mapping.getServiceDomain());
                String bq = mapping.getBehaviorQualifier();
                if (bq != null && !bq.isEmpty()) base += toPascalCase(bq);
                ep.requestDtoName = base + "Request";
                log.info("[ACL] FIX-1: RequestDTO derive depuis BIAN pour {} → {}", uc.getClassName(), ep.requestDtoName);
            }
            if (isActionOrInline && ep.responseDtoName == null) {
                String base = toPascalCase(mapping.getServiceDomain());
                String bq = mapping.getBehaviorQualifier();
                if (bq != null && !bq.isEmpty()) base += toPascalCase(bq);
                ep.responseDtoName = base + "Response";
                log.info("[ACL] FIX-1: ResponseDTO derive depuis BIAN pour {} → {}", uc.getClassName(), ep.responseDtoName);
            }

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

        // ===== FIX 3 : Propager les noms de DTO derives dans les UseCaseInfo =====
        // Le SmartCodeEnhancer utilise uc.getInputDtoClassName() / uc.getOutputDtoClassName()
        // pour generer les tests. Il faut propager les noms derives dans BianEndpoint.
        for (BianControllerGroup group : groupMap.values()) {
            for (BianEndpoint ep : group.endpoints) {
                if (ep.requestDtoName != null && ep.useCaseInfo.getInputDtoClassName() == null) {
                    ep.useCaseInfo.setInputDtoClassName(ep.requestDtoName);
                    log.info("[ACL] FIX-3: Propagation requestDtoName -> UseCaseInfo.inputDtoClassName: {}", ep.requestDtoName);
                }
                if (ep.responseDtoName != null && ep.useCaseInfo.getOutputDtoClassName() == null) {
                    ep.useCaseInfo.setOutputDtoClassName(ep.responseDtoName);
                    log.info("[ACL] FIX-3: Propagation responseDtoName -> UseCaseInfo.outputDtoClassName: {}", ep.responseDtoName);
                }
            }
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

        // ===== FIX 5 : Deduplication des noms de methodes Java =====
        Map<String, List<BianEndpoint>> methodNameMap = new LinkedHashMap<>();
        for (BianEndpoint ep : group.endpoints) {
            methodNameMap.computeIfAbsent(ep.methodName, k -> new ArrayList<>()).add(ep);
        }
        for (var entry : methodNameMap.entrySet()) {
            if (entry.getValue().size() > 1) {
                int counter = 1;
                for (BianEndpoint ep : entry.getValue()) {
                    String originalName = ep.methodName;
                    ep.methodName = originalName + counter;
                    counter++;
                    log.info("[ACL] Methode renommee : {} → {} ({})",
                            originalName, ep.methodName, ep.useCaseName);
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
        List<RestField> fields = deriveRestFields(ejbDto, true, analysis);

        // ActionHandler / InlineAction sans DTO EJB input : utiliser les envelopeFields comme source de champs
        boolean isActionHandler = ep.useCaseInfo != null && (ep.useCaseInfo.isActionHandler() || ep.useCaseInfo.isInlineAction());
        if (isActionHandler && (ejbDto == null) && ep.useCaseInfo.getEnvelopeFields() != null
                && !ep.useCaseInfo.getEnvelopeFields().isEmpty()) {
            fields.clear();
            Set<String> knownDtoNames = analysis.getDtos().stream()
                    .map(DtoInfo::getClassName).collect(Collectors.toSet());
            for (UseCaseInfo.EnvelopeFieldInfo envField : ep.useCaseInfo.getEnvelopeFields()) {
                String restType = cleanType(envField.getJavaType());
                // Si le type est un DTO connu, l'importer depuis la couche infrastructure
                if (knownDtoNames.contains(restType)) {
                    // Garder le type complexe tel quel — il sera importé depuis ejb/types
                } else if ("Object".equals(restType) && !"Object".equals(envField.getJavaType())) {
                    continue; // Exclure les types framework resolus en Object
                }
                fields.add(new RestField(envField.getFieldName(), restType, false));
            }
        }

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
        // FIX DEFAUT-2 : Ne PAS importer les types EJB depuis infrastructure dans les DTOs API.
        // Les champs dont le type est un DTO EJB complexe sont remplaces par un sous-objet
        // Map<String, Object> pour eviter le couplage couche API → couche Infrastructure.
        Set<String> knownDtoNamesForImport = analysis.getDtos().stream()
                .map(DtoInfo::getClassName).collect(Collectors.toSet());
        boolean hasMapField = false;
        for (RestField f : fields) {
            if (knownDtoNamesForImport.contains(f.type)) {
                // Remplacer le type EJB par Map<String, Object> dans le RestDTO
                f.type = "java.util.Map<String, Object>";
                hasMapField = true;
                log.info("[ACL] FIX-2: Champ {} type EJB remplace par Map<String, Object> dans {}", f.name, ep.requestDtoName);
            }
        }
        if (hasMapField) {
            sb.append("import java.util.Map;\n");
        }
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

        // Eviter d'ecraser un Response DTO deja genere par un autre UC
        // (cas ou deux UCs partagent le meme nom de Response DTO mais ont des VoOut differents)
        if (Files.exists(file)) {
            log.info("[ACL] RestDTO Response deja existant, skip : {}", ep.responseDtoName);
            return;
        }

        DtoInfo ejbDto = findDto(analysis, ep.ejbOutputDtoName);
        List<RestField> fields = deriveRestFields(ejbDto, false, analysis);

        // Si le Response DTO est vide (aucun champ derive), ajouter des champs par defaut
        // pour que Jackson puisse serialiser la reponse (evite HttpMediaTypeNotAcceptableException)
        boolean addedDefaults = false;
        if (fields.isEmpty()) {
            fields.add(new RestField("code", "String", false));
            fields.add(new RestField("message", "String", false));
            fields.add(new RestField("data", "java.util.Map<String, Object>", false));
            addedDefaults = true;
        }

        // FIX DEFAUT-2 : Remplacer les types EJB complexes par Map<String, Object>
        Set<String> knownDtoNamesResp = analysis.getDtos().stream()
                .map(DtoInfo::getClassName).collect(Collectors.toSet());
        for (RestField f : fields) {
            if (knownDtoNamesResp.contains(f.type)) {
                f.type = "java.util.Map<String, Object>";
                log.info("[ACL] FIX-2: Champ {} type EJB remplace par Map<String, Object> dans {}", f.name, ep.responseDtoName);
            }
        }

        boolean hasBigDecimal = fields.stream().anyMatch(f -> "BigDecimal".equals(f.type));
        boolean hasEnum = fields.stream().anyMatch(f -> isEnumType(f.type, analysis));
        boolean hasMap = fields.stream().anyMatch(f -> f.type.contains("Map<"));

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_RESPONSE).append(";\n\n");

        if (hasBigDecimal) sb.append("import java.math.BigDecimal;\n");
        if (hasMap) sb.append("import java.util.Map;\n");
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
            String fieldType = f.type.replace("java.util.", "");
            sb.append("    private ").append(fieldType).append(" ").append(f.name).append(";\n");
        }
        sb.append("\n");

        sb.append("    public ").append(ep.responseDtoName).append("() {}\n\n");

        for (RestField f : fields) {
            String fieldType = f.type.replace("java.util.", "");
            String cap = capitalize(f.name);
            String getter = ("boolean".equals(f.type) ? "is" : "get") + cap;
            sb.append("    public ").append(fieldType).append(" ").append(getter).append("() { return ").append(f.name).append("; }\n");
            sb.append("    public void set").append(cap).append("(").append(fieldType).append(" ").append(f.name).append(") { this.").append(f.name).append(" = ").append(f.name).append("; }\n\n");
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());

        // Tracker les types de champs du Response DTO genere
        java.util.Map<String, String> fieldTypeMap = new java.util.HashMap<>();
        for (RestField f : fields) {
            fieldTypeMap.put(f.name, cleanType(f.type));
        }
        responseDtoFieldTypes.put(ep.responseDtoName, fieldTypeMap);

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

        // FIX DEFAUT-4 : Generer des exceptions specifiques pour chaque code erreur metier detecte
        if (analysis.getBusinessErrors() != null && !analysis.getBusinessErrors().isEmpty()) {
            Set<String> generatedErrorCodes = new HashSet<>();
            for (ProjectAnalysisResult.BusinessErrorInfo error : analysis.getBusinessErrors()) {
                String errorCode = error.getErrorCode();
                if (generatedErrorCodes.add(errorCode)) {
                    // Deriver un nom d'exception depuis le code erreur
                    String exName = "BusinessError" + errorCode.replaceAll("[^a-zA-Z0-9]", "") + "Exception";
                    String code = "BUSINESS_ERROR_" + errorCode;

                    sb = new StringBuilder();
                    sb.append("package ").append(PKG_DOMAIN_EXCEPTION).append(";\n\n");
                    sb.append("/**\n");
                    sb.append(" * Exception metier pour le code erreur ").append(errorCode).append(".\n");
                    sb.append(" * Message original : ").append(error.getErrorMessage()).append("\n");
                    sb.append(" * Detecte dans : ").append(error.getSourceClassName()).append("\n");
                    sb.append(" * Type EJB original : ").append(error.getExceptionType()).append("\n");
                    sb.append(" */\n");
                    sb.append("public class ").append(exName).append(" extends ApiException {\n\n");
                    sb.append("    public static final String ERROR_CODE = \"").append(errorCode).append("\";\n");
                    sb.append("    public static final String DEFAULT_MESSAGE = \"").append(
                            error.getErrorMessage().replace("\"", "\\\"")
                    ).append("\";\n\n");
                    sb.append("    public ").append(exName).append("() {\n");
                    sb.append("        super(\"").append(code).append("\", DEFAULT_MESSAGE, 422);\n");
                    sb.append("    }\n\n");
                    sb.append("    public ").append(exName).append("(String message) {\n");
                    sb.append("        super(\"").append(code).append("\", message, 422);\n");
                    sb.append("    }\n\n");
                    sb.append("    public ").append(exName).append("(String message, Throwable cause) {\n");
                    sb.append("        super(\"").append(code).append("\", message, 422, cause);\n");
                    sb.append("    }\n");
                    sb.append("}\n");

                    Path exFile = dir.resolve(exName + ".java");
                    if (!Files.exists(exFile)) {
                        Files.writeString(exFile, sb.toString());
                        log.info("[ACL] Exception metier generee : {} (code={}, msg={})",
                                exName, errorCode, error.getErrorMessage());
                    }
                }
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

    private void generateEjbTypes(Path srcMain, ProjectAnalysisResult analysis,
                                    List<BianControllerGroup> groups) throws IOException {
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
            // FIX : Ne pas ecraser les types framework deja generes (Envelope, BaseUseCase, etc.)
            if (Files.exists(file)) {
                log.info("[ACL] EJB Type deja genere (framework), skip : {}", dto.getClassName());
                continue;
            }

            StringBuilder sb = new StringBuilder();
            sb.append("package ").append(PKG_INFRA_EJB_TYPES).append(";\n\n");
            sb.append("import java.io.Serializable;\n");

            boolean hasBigDecimal = dto.getFields().stream().anyMatch(f -> "BigDecimal".equals(f.getType()));
            if (hasBigDecimal) sb.append("import java.math.BigDecimal;\n");
            sb.append("\n");

            sb.append("/**\n");
            sb.append(" * Copie du DTO EJB ").append(dto.getClassName()).append(" dans la couche infrastructure.\n");
            sb.append(" * Aucun import ma.eai.* \u2014 type autonome.\n");
            sb.append(" */\n");
            sb.append("public class ").append(dto.getClassName()).append(" implements ValueObject {\n\n");
            sb.append("    private static final long serialVersionUID = 1L;\n\n");

            for (DtoInfo.FieldInfo field : dto.getFields()) {
                if ("serialVersionUID".equals(field.getName())) continue;
                if (field.isStatic()) continue;

                String type = cleanType(field.getType());
                // Si le type nettoy\u00e9 n'est ni standard, ni un DTO connu, ni un enum connu \u2192 Object
                if (!isKnownType(type, analysis)) {
                    type = "Object";
                }
                sb.append("    private ").append(type).append(" ").append(field.getName()).append(";\n");
            }
            sb.append("\n");

            for (DtoInfo.FieldInfo field : dto.getFields()) {
                if ("serialVersionUID".equals(field.getName())) continue;
                if (field.isStatic()) continue;

                String type = cleanType(field.getType());
                if (!isKnownType(type, analysis)) {
                    type = "Object";
                }
                String cap = capitalize(field.getName());
                String getter = ("boolean".equals(type) ? "is" : "get") + cap;
                sb.append("    public ").append(type).append(" ").append(getter).append("() { return ").append(field.getName()).append("; }\n");
                sb.append("    public void set").append(cap).append("(").append(type).append(" ").append(field.getName()).append(") { this.").append(field.getName()).append(" = ").append(field.getName()).append("; }\n\n");
            }

            sb.append("}\n");

            Files.writeString(file, sb.toString());
            log.info("[ACL] EJB Type genere : {}", dto.getClassName());
        }

        // FIX : Generer des stubs pour les types EJB references dans les endpoints
        // mais absents de analysis.getDtos() (ex: AccountInfo, TransactionInfo)
        Set<String> existingDtoNames = analysis.getDtos().stream()
                .map(DtoInfo::getClassName)
                .collect(java.util.stream.Collectors.toSet());
        Set<String> missingTypes = new java.util.LinkedHashSet<>();
        for (BianControllerGroup group : groups) {
            for (BianEndpoint ep : group.endpoints) {
                if (ep.ejbInputDtoName != null && !isNonImportableEjbType(ep.ejbInputDtoName)
                        && !isFrameworkType(ep.ejbInputDtoName)
                        && !existingDtoNames.contains(ep.ejbInputDtoName)) {
                    missingTypes.add(ep.ejbInputDtoName);
                }
                if (ep.ejbOutputDtoName != null && !isNonImportableEjbType(ep.ejbOutputDtoName)
                        && !isFrameworkType(ep.ejbOutputDtoName)
                        && !existingDtoNames.contains(ep.ejbOutputDtoName)) {
                    missingTypes.add(ep.ejbOutputDtoName);
                }
            }
        }
        for (String typeName : missingTypes) {
            Path typeFile = dir.resolve(typeName + ".java");
            if (Files.exists(typeFile)) continue; // deja genere
            // Chercher les champs dans les DTOs detectes par le parser
            DtoInfo sourceDto = analysis.getDtos().stream()
                    .filter(d -> d.getClassName().equals(typeName))
                    .findFirst().orElse(null);
            List<DtoInfo.FieldInfo> fields = (sourceDto != null) ? sourceDto.getFields()
                    : new java.util.ArrayList<>();
            StringBuilder stub = new StringBuilder();
            stub.append("package ").append(PKG_INFRA_EJB_TYPES).append(";\n\n");
            stub.append("import java.io.Serializable;\n");
            boolean hasBD = fields.stream().anyMatch(f -> "BigDecimal".equals(f.getType()));
            if (hasBD) stub.append("import java.math.BigDecimal;\n");
            boolean hasList = fields.stream().anyMatch(f -> f.getType() != null && f.getType().contains("List"));
            if (hasList) stub.append("import java.util.List;\n");
            stub.append("\n");
            stub.append("/**\n");
            stub.append(" * Stub du type EJB ").append(typeName).append(" genere pour la couche infrastructure.\n");
            stub.append(" */\n");
            stub.append("public class ").append(typeName).append(" implements ValueObject {\n\n");
            stub.append("    private static final long serialVersionUID = 1L;\n\n");
            for (DtoInfo.FieldInfo f : fields) {
                if ("serialVersionUID".equals(f.getName()) || f.isStatic()) continue;
                String type = cleanType(f.getType());
                if (!isKnownType(type, analysis)) type = "Object";
                stub.append("    private ").append(type).append(" ").append(f.getName()).append(";\n");
            }
            stub.append("\n");
            for (DtoInfo.FieldInfo f : fields) {
                if ("serialVersionUID".equals(f.getName()) || f.isStatic()) continue;
                String type = cleanType(f.getType());
                if (!isKnownType(type, analysis)) type = "Object";
                String cap = capitalize(f.getName());
                String getter = ("boolean".equals(type) ? "is" : "get") + cap;
                stub.append("    public ").append(type).append(" ").append(getter).append("() { return ").append(f.getName()).append("; }\n");
                stub.append("    public void set").append(cap).append("(").append(type).append(" ").append(f.getName()).append(") { this.").append(f.getName()).append(" = ").append(f.getName()).append("; }\n\n");
            }
            stub.append("}\n");
            Files.writeString(typeFile, stub.toString());
            log.info("[ACL] EJB Type stub genere (manquant dans DTOs) : {}", typeName);
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

        // FIX : Detecter les conflits de noms entre DTOs REST et types EJB
        boolean inputNameConflict = ep.requestDtoName != null && ep.ejbInputDtoName != null
                && ep.requestDtoName.equals(ep.ejbInputDtoName);
        boolean outputNameConflict = ep.responseDtoName != null && ep.ejbOutputDtoName != null
                && ep.responseDtoName.equals(ep.ejbOutputDtoName);
        // Noms qualifies pour les types EJB en cas de conflit
        String ejbInputRef = inputNameConflict ? PKG_INFRA_EJB_TYPES + "." + ep.ejbInputDtoName : ep.ejbInputDtoName;
        String ejbOutputRef = outputNameConflict ? PKG_INFRA_EJB_TYPES + "." + ep.ejbOutputDtoName : ep.ejbOutputDtoName;

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_EJB_MAPPER).append(";\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
        if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
        boolean isActionHandlerMapper = ep.useCaseInfo != null && (ep.useCaseInfo.isActionHandler() || ep.useCaseInfo.isInlineAction());
        DtoInfo ejbOutForActionHandler = isActionHandlerMapper ? findDto(analysis, ep.ejbOutputDtoName) : null;
        boolean hasTypedEjbOutput = isActionHandlerMapper && ejbOutForActionHandler != null;
        if (!isActionHandlerMapper) {
            if (ep.ejbInputDtoName != null && !isNonImportableEjbType(ep.ejbInputDtoName) && !inputNameConflict) imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbInputDtoName + ";");
            if (ep.ejbOutputDtoName != null && !isNonImportableEjbType(ep.ejbOutputDtoName) && !outputNameConflict) imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbOutputDtoName + ";");
        } else {
            imports.add("import " + PKG_INFRA_EJB_TYPES + ".Envelope;");
            // FIX BUG-2 : Si le type EJB output est connu, l'importer pour le cast dans fromEnvelopePayload
            if (hasTypedEjbOutput && !isNonImportableEjbType(ep.ejbOutputDtoName) && !outputNameConflict) {
                imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbOutputDtoName + ";");
            }
        }
        imports.add("import org.springframework.stereotype.Component;");
        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        sb.append("@Component\n");
        sb.append("public class ").append(mapperName).append(" {\n\n");

        boolean isActionHandler = ep.useCaseInfo != null && (ep.useCaseInfo.isActionHandler() || ep.useCaseInfo.isInlineAction());

        if (isActionHandler) {
            // ===== PATTERN ACTION_HANDLER / INLINE_ACTION : toEnvelopePayload + fromEnvelopePayload =====

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
                        String rType = cleanType(field.getType());
                        if ("Object".equals(rType) && !"Object".equals(field.getType()) && !"java.lang.Object".equals(field.getType())) continue;
                        if (!isKnownType(rType, analysis)) continue;
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

                if (hasTypedEjbOutput) {
                    // FIX BUG-2 : Le payload est un objet EJB type, pas une Map
                    sb.append("        ").append(ep.ejbOutputDtoName).append(" data = (").append(ep.ejbOutputDtoName).append(") envOut.getPayload();\n");
                    for (DtoInfo.FieldInfo field : ejbOutForActionHandler.getFields()) {
                        if ("serialVersionUID".equals(field.getName()) || field.isStatic()) continue;
                        if (LEGACY_FIELDS.contains(field.getName())) continue;
                        if (isFrameworkType(field.getType())) continue;
                        String castType = cleanType(field.getType());
                        if ("Object".equals(castType) && !"Object".equals(field.getType()) && !"java.lang.Object".equals(field.getType())) continue;
                        if (!isKnownType(castType, analysis)) continue;
                        String restName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
                        String setter = "set" + capitalize(restName);
                        String getter = ("boolean".equals(field.getType()) ? "is" : "get") + capitalize(field.getName());
                        sb.append("        response.").append(setter).append("(data.").append(getter).append("());\n");
                    }
                } else {
                    // Payload est une Map ou type inconnu
                    sb.append("        java.util.Map<String, Object> data = (java.util.Map<String, Object>) envOut.getPayload();\n");

                    DtoInfo respDto = findDto(analysis, ep.ejbOutputDtoName);
                    if (respDto != null) {
                        for (DtoInfo.FieldInfo field : respDto.getFields()) {
                            if ("serialVersionUID".equals(field.getName()) || field.isStatic()) continue;
                            if (LEGACY_FIELDS.contains(field.getName())) continue;
                            if (isFrameworkType(field.getType())) continue;
                            String castType = cleanType(field.getType());
                            if ("Object".equals(castType) && !"Object".equals(field.getType()) && !"java.lang.Object".equals(field.getType())) continue;
                            if (!isKnownType(castType, analysis)) continue;
                            String restName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
                            String setter = "set" + capitalize(restName);
                            sb.append("        if (data.containsKey(\"").append(field.getName()).append("\")) response.").append(setter).append("((").append(castType).append(") data.get(\"").append(field.getName()).append("\")); \n");
                        }
                    } else {
                        // DTO EJB inconnu : extraire code/message du payload Envelope et passer le reste dans data
                        sb.append("        if (data.containsKey(\"code\")) response.setCode((String) data.get(\"code\"));\n");
                        sb.append("        if (data.containsKey(\"message\")) response.setMessage((String) data.get(\"message\"));\n");
                        sb.append("        response.setData(data);\n");
                    }
                }
                sb.append("        return response;\n");
                sb.append("    }\n\n");
            }

        }

        // toEjb : Request → VoIn (pattern classique)
        if (!isActionHandler && ep.requestDtoName != null && ep.ejbInputDtoName != null) {
            sb.append("    public ").append(ejbInputRef).append(" toEjb(").append(ep.requestDtoName).append(" request) {\n");
            sb.append("        ").append(ejbInputRef).append(" voIn = new ").append(ejbInputRef).append("();\n");

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
                    // Exclure les champs dont le type original a ete resolu en Object
                    if ("Object".equals(restType) && !"Object".equals(field.getType()) && !"java.lang.Object".equals(field.getType())) continue;

                    sb.append("        voIn.").append(ejbSetter).append("(request.").append(restGetter).append("());\n");
                }
            }
            sb.append("        return voIn;\n");
            sb.append("    }\n\n");
        }

        // toRest : VoOut → Response (pattern classique)
        if (!isActionHandler && ep.responseDtoName != null && ep.ejbOutputDtoName != null) {
            sb.append("    public ").append(ep.responseDtoName).append(" toRest(").append(ejbOutputRef).append(" voOut) {\n");
            sb.append("        ").append(ep.responseDtoName).append(" response = new ").append(ep.responseDtoName).append("();\n");

            // Charger les types de champs du Response DTO genere (pour verifier la compatibilite)
            java.util.Map<String, String> respFieldTypes = responseDtoFieldTypes.getOrDefault(ep.responseDtoName, java.util.Collections.emptyMap());

            if (ejbOut != null) {
                for (DtoInfo.FieldInfo field : ejbOut.getFields()) {
                    if ("serialVersionUID".equals(field.getName()) || field.isStatic()) continue;
                    if (LEGACY_FIELDS.contains(field.getName())) continue;
                    if (isFrameworkType(field.getType())) continue;
                    // Correction: exclure les champs @XmlTransient du Mapper
                    if (field.isHasXmlTransient()) continue;
                    String restType2 = cleanType(field.getType());
                    // Exclure les champs dont le type original a ete resolu en Object
                    if ("Object".equals(restType2) && !"Object".equals(field.getType()) && !"java.lang.Object".equals(field.getType())) continue;

                    String restName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
                    // Verifier la compatibilite de type avec le Response DTO
                    // (evite les erreurs de compilation quand deux UCs partagent le meme Response DTO)
                    if (!respFieldTypes.isEmpty() && respFieldTypes.containsKey(restName)) {
                        String respType = respFieldTypes.get(restName);
                        if (!respType.equals(restType2)) {
                            sb.append("        // Champ ").append(restName).append(" ignore : type incompatible (").append(restType2).append(" vs ").append(respType).append(")\n");
                            continue;
                        }
                    }

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
        // FIX DEFAUT-3 : Utiliser un nom metier propre derive du mapping BIAN
        // au lieu du nom technique EJB (ex: CommandChequier_ENRG_COMMANDE → OrderMapper)
        // FIX BUG-1 : Inclure le verbe d'action pour eviter les collisions quand
        // plusieurs actions partagent le meme BQ (ex: AJOUTBENEF et SUPBENEF → BQ=beneficiary)
        if (ep.bianMapping != null) {
            String bq = ep.bianMapping.getBehaviorQualifier();
            String action = ep.bianMapping.getAction();
            if (bq != null && !bq.isEmpty()) {
                // Toujours prefixer avec le verbe d'action pour unicite
                String verb = (action != null && !action.isEmpty()) ? capitalize(actionToVerb(action)) : "";
                return verb + toPascalCase(bq) + "Mapper";
            }
            if (action != null && !action.isEmpty()) {
                String sd = ep.bianMapping.getServiceDomain();
                return toPascalCase(sd) + capitalize(actionToVerb(action)) + "Mapper";
            }
        }
        // Fallback : nettoyer le nom technique (supprimer underscores, suffixes)
        String base = ep.useCaseName
                .replaceAll("(UC|UseCase|Handler|Bean|Impl|Service|EJB)$", "")
                .replaceAll("_", "");
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

        // FIX : Detecter les conflits de noms entre DTOs REST et types EJB pour le JndiAdapter
        Set<String> conflictingEjbTypes = new java.util.HashSet<>();
        for (BianEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null && ep.ejbInputDtoName != null
                    && ep.requestDtoName.equals(ep.ejbInputDtoName)) {
                conflictingEjbTypes.add(ep.ejbInputDtoName);
            }
            if (ep.responseDtoName != null && ep.ejbOutputDtoName != null
                    && ep.responseDtoName.equals(ep.ejbOutputDtoName)) {
                conflictingEjbTypes.add(ep.ejbOutputDtoName);
            }
        }

        // Imports
        Set<String> imports = new TreeSet<>();
        for (BianEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
            // Pour ACTION_HANDLER, les types EJB sont remplaces par Envelope — ne pas importer les types EJB individuels
            boolean isActionHandlerEp = ep.useCaseInfo != null && (ep.useCaseInfo.isActionHandler() || ep.useCaseInfo.isInlineAction());
            if (!isActionHandlerEp) {
            if (ep.ejbInputDtoName != null && !isNonImportableEjbType(ep.ejbInputDtoName) && !conflictingEjbTypes.contains(ep.ejbInputDtoName)) imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbInputDtoName + ";");
            if (ep.ejbOutputDtoName != null && !isNonImportableEjbType(ep.ejbOutputDtoName) && !conflictingEjbTypes.contains(ep.ejbOutputDtoName)) imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbOutputDtoName + ";");
            }
            imports.add("import " + PKG_INFRA_EJB_MAPPER + "." + deriveMapperName(ep) + ";");
        }
        // BaseUseCase/ValueObject seulement si au moins un endpoint n'est PAS ACTION_HANDLER
        boolean hasBaseUseCase = group.endpoints.stream()
                .anyMatch(ep -> ep.useCaseInfo == null || (!ep.useCaseInfo.isActionHandler() && !ep.useCaseInfo.isInlineAction()));
        if (hasBaseUseCase) {
            imports.add("import " + PKG_INFRA_EJB_TYPES + ".BaseUseCase;");
            imports.add("import " + PKG_INFRA_EJB_TYPES + ".ValueObject;");
        }
        // Ajouter les imports SynchroneService/Envelope si au moins un endpoint est ACTION_HANDLER
        boolean hasActionHandler = group.endpoints.stream()
                .anyMatch(ep -> ep.useCaseInfo != null && (ep.useCaseInfo.isActionHandler() || ep.useCaseInfo.isInlineAction()));
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
            boolean isActionHandler = ep.useCaseInfo != null && (ep.useCaseInfo.isActionHandler() || ep.useCaseInfo.isInlineAction());
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
                boolean ejbInputIsStandardType = ep.ejbInputDtoName != null && isNonImportableEjbType(ep.ejbInputDtoName);
                if (ep.requestDtoName != null && ep.ejbInputDtoName != null) {
                    if (ejbInputIsStandardType) {
                        // Le type EJB input est un type Java standard (String, void, etc.)
                        // Le mapper retourne ce type, mais execute() attend ValueObject
                        // On utilise un cast (ValueObject) car le runtime EJB accepte ce type
                        sb.append("            Object voIn = ").append(mapperField).append(".toEjb(request);\n");
                    } else {
                        String ejbInRef = conflictingEjbTypes.contains(ep.ejbInputDtoName)
                                ? PKG_INFRA_EJB_TYPES + "." + ep.ejbInputDtoName : ep.ejbInputDtoName;
                        sb.append("            ").append(ejbInRef).append(" voIn = ").append(mapperField).append(".toEjb(request);\n");
                    }
                }

                // JNDI lookup via cache
                sb.append("            javax.naming.InitialContext ctx = getOrCreateContext();\n");
                sb.append("            log.debug(\"[EJB-LOOKUP] ").append(jndiName).append(" (cache)\");");
                sb.append("\n");
                sb.append("            BaseUseCase useCase = (BaseUseCase) ctx.lookup(\"").append(jndiName).append("\");\n");

                // Execute avec cast type
                sb.append("            long start = System.currentTimeMillis();\n");
                if (hasReturn && ep.ejbOutputDtoName != null) {
                    sb.append("            ValueObject result = useCase.execute(");
                    if (ep.ejbInputDtoName != null) {
                        if (ejbInputIsStandardType) {
                            sb.append("(ValueObject) voIn");
                        } else {
                            sb.append("voIn");
                        }
                    } else {
                        sb.append("null");
                    }
                    sb.append(");\n");
                    sb.append("            log.info(\"[EJB-EXECUTE] ").append(ep.useCaseName).append(" en {}ms\", System.currentTimeMillis() - start);\n");
                    String ejbOutRef = conflictingEjbTypes.contains(ep.ejbOutputDtoName)
                            ? PKG_INFRA_EJB_TYPES + "." + ep.ejbOutputDtoName : ep.ejbOutputDtoName;
                    sb.append("            ").append(ejbOutRef).append(" voOut = (").append(ejbOutRef).append(") result;\n");
                    sb.append("            log.debug(\"[EJB-RESPONSE] Reponse EJB recue pour ").append(ep.useCaseName).append("\");\n");
                    sb.append("            return ").append(mapperField).append(".toRest(voOut);\n");
                } else {
                    sb.append("            useCase.execute(");
                    if (ep.ejbInputDtoName != null) {
                        if (ejbInputIsStandardType) {
                            sb.append("(ValueObject) voIn");
                        } else {
                            sb.append("voIn");
                        }
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
                                // Les types primitifs (int, long, boolean, double, float, short, byte, char) ne peuvent pas être comparés à null
                                boolean isPrimitive = Set.of("int", "long", "boolean", "double", "float", "short", "byte", "char").contains(f.getType());
                                if (isPrimitive) {
                                    sb.append("        response.").append(setter).append("(request.").append(getter).append("());\n");
                                } else {
                                    sb.append("        if (request.").append(getter).append("() != null) ");
                                    sb.append("response.").append(setter).append("(request.").append(getter).append("());\n");
                                }
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
        if (ejbOut == null) {
            // Pas de DTO EJB source : peupler les champs par defaut (code, message, data)
            sb.append("        response.setCode(\"000\");\n");
            sb.append("        response.setMessage(\"Operation realisee avec succes\");\n");
            sb.append("        java.util.Map<String, Object> mockData = new java.util.LinkedHashMap<>();\n");
            sb.append("        mockData.put(\"timestamp\", java.time.Instant.now().toString());\n");
            sb.append("        mockData.put(\"reference\", \"REF-" + ep.methodName.toUpperCase() + "\");\n");
            sb.append("        response.setData(mockData);\n");
            return;
        }

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
        imports.add("import " + PKG_API_DTO_ENVELOPE + ".ApiRequest;");
        imports.add("import " + PKG_API_DTO_ENVELOPE + ".ApiResponse;");
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + group.serviceInterfaceName + ";");
        imports.add("import io.swagger.v3.oas.annotations.Operation;");
        imports.add("import io.swagger.v3.oas.annotations.Parameter;");
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
                sb.append("        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = \"201\", description = \"Ressource creee avec succes\"),\n");
            } else {
                sb.append("        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = \"200\", description = \"Operation reussie\"),\n");
            }
            sb.append("        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = \"400\", description = \"Requete invalide\"),\n");
            sb.append("        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = \"401\", description = \"Non authentifie\"),\n");
            sb.append("        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = \"403\", description = \"Acces refuse\"),\n");
            sb.append("        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = \"500\", description = \"Erreur interne du serveur\")\n");
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
            boolean hasCrRef = url.contains("{cr-reference-id}");
            boolean hasBqRef = url.contains("{bq-reference-id}");

            if (isByteArray) {
                // Cas byte[] : pas d'enveloppe, retour binaire direct
                sb.append("    public ResponseEntity<byte[]> ").append(ep.methodName).append("(\n");
                List<String> methodParams = new ArrayList<>();
                if (hasCrRef) methodParams.add("            @Parameter(description = \"Control Record Reference ID\")\n            @PathVariable(\"cr-reference-id\") String crReferenceId");
                if (hasBqRef) methodParams.add("            @Parameter(description = \"Behavior Qualifier Reference ID\")\n            @PathVariable(\"bq-reference-id\") String bqReferenceId");
                if (ep.requestDtoName != null) methodParams.add("            @Valid @RequestBody ApiRequest<" + ep.requestDtoName + "> envelope");
                sb.append(String.join(",\n", methodParams));
                sb.append(") {\n\n");
                sb.append("        log.info(\"[REST-IN] ").append(httpMethod).append(" ").append(basePath).append(relativePath).append(" | request_id={}\", ");
                if (ep.requestDtoName != null) {
                    sb.append("envelope.getRequestId()");
                } else {
                    sb.append("\"N/A\"");
                }
                sb.append(");\n");
                sb.append("        try {\n");
                List<String> callParams = new ArrayList<>();
                if (hasCrRef) callParams.add("crReferenceId");
                if (ep.requestDtoName != null) callParams.add("envelope.getPayload()");
                sb.append("            byte[] data = ").append(serviceField).append(".").append(ep.methodName).append("Bytes(").append(String.join(", ", callParams)).append(");\n");
                sb.append("            log.info(\"[REST-OUT] 200 OK (byte[] size={})\", data != null ? data.length : 0);\n");
                sb.append("            return ResponseEntity.ok()\n");
                sb.append("                    .header(\"Content-Disposition\", \"attachment; filename=document.pdf\")\n");
                sb.append("                    .header(\"Content-Type\", \"application/pdf\")\n");
                sb.append("                    .body(data);\n");
                sb.append("        } catch (Exception e) {\n");
                sb.append("            log.error(\"[REST-ERROR] ").append(ep.methodName).append(" failed\", e);\n");
                sb.append("            throw e;\n");
                sb.append("        }\n");
                sb.append("    }\n\n");
            } else {
                // Cas standard : enveloppe ApiRequest / ApiResponse
                String responsePayloadType = ep.responseDtoName != null ? ep.responseDtoName : "Void";
                sb.append("    public ResponseEntity<ApiResponse<").append(responsePayloadType).append(">> ").append(ep.methodName).append("(\n");

                List<String> methodParams = new ArrayList<>();
                if (hasCrRef) {
                    methodParams.add("            @Parameter(description = \"Control Record Reference ID\")\n            @PathVariable(\"cr-reference-id\") String crReferenceId");
                }
                if (hasBqRef) {
                    methodParams.add("            @Parameter(description = \"Behavior Qualifier Reference ID\")\n            @PathVariable(\"bq-reference-id\") String bqReferenceId");
                }
                if (ep.requestDtoName != null) {
                    methodParams.add("            @Valid @RequestBody ApiRequest<" + ep.requestDtoName + "> envelope");
                }

                sb.append(String.join(",\n", methodParams));
                sb.append(") {\n\n");

                // Log avec request_id pour tracabilite
                if (ep.requestDtoName != null) {
                    sb.append("        log.info(\"[REST-IN] ").append(httpMethod).append(" ").append(basePath).append(relativePath).append(" | request_id={} | source={}\", envelope.getRequestId(), envelope.getSourceSystem());\n");
                } else {
                    sb.append("        log.info(\"[REST-IN] ").append(httpMethod).append(" ").append(basePath).append(relativePath).append("\");\n");
                }

                sb.append("        try {\n");

                // Extraire le payload de l'enveloppe et appeler le service
                List<String> callParams = new ArrayList<>();
                if (hasCrRef) callParams.add("crReferenceId");
                if (ep.requestDtoName != null) {
                    sb.append("            ").append(ep.requestDtoName).append(" payload = envelope.getPayload();\n");
                    callParams.add("payload");
                }

                if (ep.responseDtoName != null) {
                    sb.append("            ").append(ep.responseDtoName).append(" result = ").append(serviceField).append(".").append(ep.methodName).append("(").append(String.join(", ", callParams)).append(");\n");
                    // Wrapper la reponse dans l'enveloppe ApiResponse
                    if (ep.requestDtoName != null) {
                        sb.append("            ApiResponse<").append(ep.responseDtoName).append("> apiResponse = ApiResponse.success(envelope.getRequestId(), result);\n");
                    } else {
                        sb.append("            ApiResponse<").append(ep.responseDtoName).append("> apiResponse = ApiResponse.success(null, result);\n");
                    }
                    sb.append("            log.info(\"[REST-OUT] ").append(httpStatus).append(" OK\");\n");
                    if (httpStatus == 201) {
                        sb.append("            return ResponseEntity.status(HttpStatus.CREATED).body(apiResponse);\n");
                    } else {
                        sb.append("            return ResponseEntity.ok(apiResponse);\n");
                    }
                } else {
                    sb.append("            ").append(serviceField).append(".").append(ep.methodName).append("(").append(String.join(", ", callParams)).append(");\n");
                    sb.append("            log.info(\"[REST-OUT] ").append(httpStatus).append(" OK\");\n");
                    sb.append("            return ResponseEntity.ok(ApiResponse.success(null, null));\n");
                }

                sb.append("        } catch (Exception e) {\n");
                sb.append("            log.error(\"[REST-ERROR] ").append(ep.methodName).append(" failed\", e);\n");
                sb.append("            throw e;\n");
                sb.append("        }\n");
                sb.append("    }\n\n");
            }
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
                import %s.ApiResponse;
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.slf4j.MDC;
                import org.springframework.http.HttpStatus;
                import org.springframework.http.ResponseEntity;
                import org.springframework.web.bind.MethodArgumentNotValidException;
                import org.springframework.web.bind.annotation.ControllerAdvice;
                import org.springframework.web.bind.annotation.ExceptionHandler;

                import java.time.Instant;
                import java.util.LinkedHashMap;
                import java.util.Map;
                import java.util.stream.Collectors;

                /**
                 * Gestionnaire global des exceptions REST.
                 * Produit des reponses JSON dans le format d'enveloppe standardise ApiResponse.
                 */
                @ControllerAdvice
                public class GlobalExceptionHandler {

                    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

                    private Map<String, Object> buildErrorPayload(String code, String message) {
                        Map<String, Object> payload = new LinkedHashMap<>();
                        payload.put("code", code);
                        payload.put("message", message);
                        String correlationId = MDC.get("correlationId");
                        if (correlationId != null) {
                            payload.put("correlationId", correlationId);
                        }
                        return payload;
                    }

                    @ExceptionHandler(ApiException.class)
                    public ResponseEntity<ApiResponse<Map<String, Object>>> handleApiException(ApiException ex) {
                        log.warn("[EXCEPTION] ApiException: {} (code={})", ex.getMessage(), ex.getCode());
                        Map<String, Object> payload = buildErrorPayload(ex.getCode(), ex.getMessage());
                        ApiResponse<Map<String, Object>> response = ApiResponse.error(null, "ERROR", payload);
                        return new ResponseEntity<>(response, HttpStatus.valueOf(ex.getHttpStatus()));
                    }

                    @ExceptionHandler(MethodArgumentNotValidException.class)
                    public ResponseEntity<ApiResponse<Map<String, Object>>> handleValidation(MethodArgumentNotValidException ex) {
                        String errors = ex.getBindingResult().getFieldErrors().stream()
                            .map(e -> e.getField() + ": " + e.getDefaultMessage())
                            .collect(Collectors.joining(", "));
                        log.warn("[EXCEPTION] Validation: {}", errors);
                        Map<String, Object> payload = buildErrorPayload("VALIDATION_ERROR", errors);
                        ApiResponse<Map<String, Object>> response = ApiResponse.error(null, "VALIDATION_ERROR", payload);
                        return new ResponseEntity<>(response, HttpStatus.BAD_REQUEST);
                    }

                    @ExceptionHandler(RuntimeException.class)
                    public ResponseEntity<ApiResponse<Map<String, Object>>> handleRuntime(RuntimeException ex) {
                        log.error("[EXCEPTION] RuntimeException: {}", ex.getMessage(), ex);
                        String message = ex.getMessage() != null && ex.getMessage().contains("temporairement indisponible")
                            ? ex.getMessage()
                            : "Service temporairement indisponible";
                        Map<String, Object> payload = buildErrorPayload("SERVICE_UNAVAILABLE", message);
                        ApiResponse<Map<String, Object>> response = ApiResponse.error(null, "SERVICE_UNAVAILABLE", payload);
                        return new ResponseEntity<>(response, HttpStatus.SERVICE_UNAVAILABLE);
                    }

                    @ExceptionHandler(Exception.class)
                    public ResponseEntity<ApiResponse<Map<String, Object>>> handleGeneric(Exception ex) {
                        log.error("[EXCEPTION] Erreur interne: {}", ex.getMessage(), ex);
                        Map<String, Object> payload = buildErrorPayload("INTERNAL_ERROR", "Erreur interne du serveur");
                        ApiResponse<Map<String, Object>> response = ApiResponse.error(null, "INTERNAL_ERROR", payload);
                        return new ResponseEntity<>(response, HttpStatus.INTERNAL_SERVER_ERROR);
                    }
                }
                """.formatted(PKG_CONFIG, PKG_DOMAIN_EXCEPTION, PKG_API_DTO_ENVELOPE);

        Files.writeString(file, code);
        log.info("[ACL] GlobalExceptionHandler genere");
    }

    // =====================================================================
    // CONFIG : Profils Spring
    // =====================================================================

    private void generateSpringProfiles(Path srcMain, boolean restMode) throws IOException {
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
                # Utiliser spring.profiles.group.dev=mock dans application.properties
                logging.level.com.bank.api=DEBUG
                springdoc.swagger-ui.enabled=true
                management.endpoints.web.exposure.include=health,info,metrics,circuitbreakers,retries,bulkheads
                """);

        Files.writeString(resourcesDir.resolve("application-prod.properties"), """
                # Profil Production
                # Utiliser spring.profiles.group.prod=jndi dans application.properties
                logging.level.com.bank.api=WARN
                springdoc.swagger-ui.enabled=false
                management.endpoints.web.exposure.include=health,metrics
                management.endpoint.health.show-details=never
                """);

        // Profil WebSphere Liberty
        Files.writeString(resourcesDir.resolve("application-liberty.properties"), """
                # =====================================================================
                # Profil WebSphere Liberty
                # =====================================================================
                # Activer avec : --spring.profiles.active=liberty,jndi
                # Ou via jvm.options : -Dspring.profiles.active=liberty,jndi
                
                # Desactiver le serveur embarque (Liberty fournit le conteneur de servlets)
                server.port=-1
                
                # JNDI — Liberty utilise le namespace par defaut
                ejb.jndi.factory=com.ibm.websphere.naming.WsnInitialContextFactory
                ejb.jndi.provider.url=corbaloc:iiop:localhost:2809
                
                # Logging — Deleguer a Liberty (messages.log / trace.log)
                logging.level.root=INFO
                logging.level.com.bank.api=INFO
                
                # Actuator
                management.endpoints.web.exposure.include=health,info,metrics
                management.endpoint.health.show-details=always
                
                # Swagger — Desactiver en production Liberty
                springdoc.swagger-ui.enabled=${SWAGGER_ENABLED:false}
                springdoc.api-docs.enabled=${SWAGGER_ENABLED:false}
                """);

        // Profil REST (appel adapter WebSphere via HTTP)
        Files.writeString(resourcesDir.resolve("application-rest.properties"), """
                # =====================================================================
                # Profil REST — Appel adapter WebSphere via HTTP
                # =====================================================================
                # Activer avec : --spring.profiles.active=rest
                # Ou dans application.properties : spring.profiles.group.prod=rest
                
                # --- URL de base de l'adapter WebSphere ---
                adapter.websphere.base-url=http://adapter-websphere:8080
                
                # --- Timeouts HTTP (en millisecondes) ---
                adapter.websphere.connect-timeout=5000
                adapter.websphere.read-timeout=30000
                
                # =====================================================================
                # Resilience4j — Circuit Breaker
                # =====================================================================
                # Taille de la fenetre glissante pour calculer le taux d'echec
                resilience4j.circuitbreaker.instances.restAdapter.sliding-window-size=10
                # Seuil de taux d'echec (%) pour ouvrir le circuit
                resilience4j.circuitbreaker.instances.restAdapter.failure-rate-threshold=50
                # Duree en etat OPEN avant de passer en HALF_OPEN (secondes)
                resilience4j.circuitbreaker.instances.restAdapter.wait-duration-in-open-state=30s
                # Nombre d'appels autorises en HALF_OPEN pour tester la reprise
                resilience4j.circuitbreaker.instances.restAdapter.permitted-number-of-calls-in-half-open-state=3
                # Nombre minimum d'appels avant de calculer le taux d'echec
                resilience4j.circuitbreaker.instances.restAdapter.minimum-number-of-calls=5
                # Transition automatique de OPEN vers HALF_OPEN
                resilience4j.circuitbreaker.instances.restAdapter.automatic-transition-from-open-to-half-open-enabled=true
                # Exceptions qui comptent comme echec
                resilience4j.circuitbreaker.instances.restAdapter.record-exceptions=org.springframework.web.client.HttpServerErrorException,org.springframework.web.client.ResourceAccessException,java.util.concurrent.TimeoutException
                # Exceptions ignorees (erreurs client 4xx ne sont pas des echecs infra)
                resilience4j.circuitbreaker.instances.restAdapter.ignore-exceptions=org.springframework.web.client.HttpClientErrorException
                
                # =====================================================================
                # Resilience4j — Retry
                # =====================================================================
                # Nombre maximum de tentatives (incluant l'appel initial)
                resilience4j.retry.instances.restAdapter.max-attempts=3
                # Delai entre les tentatives (millisecondes)
                resilience4j.retry.instances.restAdapter.wait-duration=1000
                # Backoff exponentiel (multiplier le delai a chaque retry)
                resilience4j.retry.instances.restAdapter.enable-exponential-backoff=true
                resilience4j.retry.instances.restAdapter.exponential-backoff-multiplier=2
                # Exceptions declenchant un retry
                resilience4j.retry.instances.restAdapter.retry-exceptions=org.springframework.web.client.HttpServerErrorException,org.springframework.web.client.ResourceAccessException
                # Exceptions ne declenchant PAS de retry
                resilience4j.retry.instances.restAdapter.ignore-exceptions=org.springframework.web.client.HttpClientErrorException
                
                # =====================================================================
                # Resilience4j — Bulkhead (limitation de concurrence)
                # =====================================================================
                # Nombre maximum d'appels concurrents autorises
                resilience4j.bulkhead.instances.restAdapter.max-concurrent-calls=25
                # Duree max d'attente pour obtenir un slot (millisecondes)
                resilience4j.bulkhead.instances.restAdapter.max-wait-duration=500
                
                # =====================================================================
                # Resilience4j — TimeLimiter
                # =====================================================================
                # Timeout global par appel (secondes)
                resilience4j.timelimiter.instances.restAdapter.timeout-duration=30s
                resilience4j.timelimiter.instances.restAdapter.cancel-running-future=true
                
                # =====================================================================
                # Actuator — Monitoring des circuits
                # =====================================================================
                management.endpoints.web.exposure.include=health,info,circuitbreakers,retries,bulkheads,metrics
                management.endpoint.health.show-details=always
                management.health.circuitbreakers.enabled=true
                """);

        // Generer les fichiers de configuration Liberty (server.xml, jvm.options, bootstrap.properties)
        generateLibertyServerConfig(srcMain);

        log.info("[ACL] Profils Spring generes (jndi, mock, rest, http, dev, prod, liberty)");
    }

    /**
     * Genere les fichiers de configuration WebSphere Liberty :
     * - src/main/liberty/config/server.xml
     * - src/main/liberty/config/jvm.options
     * - src/main/liberty/config/bootstrap.properties
     */
    private void generateLibertyServerConfig(Path srcMain) throws IOException {
        String srcMainStr = srcMain.toString().replace("\\\\", "/");
        int javaIdx = srcMainStr.indexOf("src/main/java");
        Path libertyDir;
        if (javaIdx >= 0) {
            libertyDir = Path.of(srcMainStr.substring(0, javaIdx), "src/main/liberty/config");
        } else {
            libertyDir = srcMain.getParent().resolve("liberty/config");
        }
        Files.createDirectories(libertyDir);

        Files.writeString(libertyDir.resolve("server.xml"), """
                <?xml version="1.0" encoding="UTF-8"?>
                <server description="Generated REST API on Liberty">
                    <featureManager>
                        <feature>springBoot-3.0</feature>
                        <feature>servlet-6.0</feature>
                        <feature>jndi-1.0</feature>
                        <feature>transportSecurity-1.0</feature>
                        <feature>mpHealth-4.0</feature>
                        <feature>mpMetrics-5.0</feature>
                        <feature>jsonp-2.1</feature>
                        <feature>jsonb-3.0</feature>
                    </featureManager>
                
                    <httpEndpoint id="defaultHttpEndpoint"
                                  host="*"
                                  httpPort="${http.port:9080}"
                                  httpsPort="${https.port:9443}" />
                
                    <springBootApplication id="generated-rest-api"
                                           location="generated-rest-api-1.0.0-SNAPSHOT.war"
                                           name="generated-rest-api">
                        <classloader delegation="parentLast" />
                    </springBootApplication>
                
                    <jndiEntry jndiName="ejb/jndi/provider/url"
                               value="${env.EJB_JNDI_URL}" />
                    <jndiEntry jndiName="ejb/jndi/factory"
                               value="${env.EJB_JNDI_FACTORY}" />
                
                    <logging consoleLogLevel="INFO"
                             traceSpecification="com.bank.api.*=info"
                             maxFileSize="50"
                             maxFiles="10" />
                </server>
                """);

        Files.writeString(libertyDir.resolve("jvm.options"), """
                -Xms512m
                -Xmx1024m
                -XX:+UseG1GC
                -XX:MaxGCPauseMillis=200
                -Dfile.encoding=UTF-8
                -Dspring.profiles.active=liberty,jndi
                -Duser.timezone=Africa/Casablanca
                """);

        Files.writeString(libertyDir.resolve("bootstrap.properties"), """
                http.port=9080
                https.port=9443
                env.EJB_JNDI_URL=corbaloc:iiop:localhost:2809
                env.EJB_JNDI_FACTORY=com.ibm.websphere.naming.WsnInitialContextFactory
                """);

        log.info("[ACL] Configuration WebSphere Liberty generee (server.xml, jvm.options, bootstrap.properties)");
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
            imports.add("import " + PKG_API_DTO_ENVELOPE + ".ApiRequest;");
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
                    sb.append("        ").append(ep.requestDtoName).append(" payload = new ").append(ep.requestDtoName).append("();\n");
                    sb.append("        // TODO: Remplir les champs obligatoires du payload\n");
                    sb.append("        ApiRequest<").append(ep.requestDtoName).append("> envelope = new ApiRequest<>(\n");
                    sb.append("                \"test-request-001\", \"test-system\", java.time.Instant.now().toString(), payload);\n\n");
                    sb.append("        mockMvc.perform(").append(mockMvcMethod).append("(\"").append(testUrl).append("\")\n");
                    sb.append("                .contentType(MediaType.APPLICATION_JSON)\n");
                    sb.append("                .content(objectMapper.writeValueAsString(envelope)))\n");
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

                // Test validation : enveloppe sans request_id/source_system/timestamp doit retourner 400
                if (ep.requestDtoName != null && !"GET".equals(httpMethod)) {
                    sb.append("    @Test\n");
                    sb.append("    @DisplayName(\"Validation: ").append(ep.methodName).append(" avec enveloppe vide doit retourner 400\")\n");
                    sb.append("    void ").append(ep.methodName).append("_withEmptyEnvelope_shouldReturn400() throws Exception {\n");
                    sb.append("        mockMvc.perform(").append(mockMvcMethod).append("(\"").append(testUrl).append("\")\n");
                    sb.append("                .contentType(MediaType.APPLICATION_JSON)\n");
                    sb.append("                .content(\"{}\"))\n");
                    sb.append("                .andExpect(status().isBadRequest());\n");
                    sb.append("    }\n\n");

                    sb.append("    @Test\n");
                    sb.append("    @DisplayName(\"Validation: ").append(ep.methodName).append(" avec payload null doit retourner 400\")\n");
                    sb.append("    void ").append(ep.methodName).append("_withNullPayload_shouldReturn400() throws Exception {\n");
                    sb.append("        String envelopeNoPayload = \"{\\\"request_id\\\":\\\"test-001\\\",\\\"source_system\\\":\\\"test\\\",\\\"timestamp\\\":\\\"2026-01-01T00:00:00Z\\\"}\";\n");
                    sb.append("        mockMvc.perform(").append(mockMvcMethod).append("(\"").append(testUrl).append("\")\n");
                    sb.append("                .contentType(MediaType.APPLICATION_JSON)\n");
                    sb.append("                .content(envelopeNoPayload))\n");
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

        // Retirer VoIn/VoOut/Vo/VO et variantes (ex: VoRdOut, VoListOut)
        String base = ejbDtoName.replaceAll("(VoIn|VOIn|Vo[A-Z][a-zA-Z]*Out|VoOut|VOOut|VO|Vo)$", "");
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

    private List<RestField> deriveRestFields(DtoInfo ejbDto, boolean isRequest, ProjectAnalysisResult analysis) {
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
            // Exclure les champs dont le type est non-standard (framework, generique brut)
            // car ils ne sont pas utilisables dans un RestDTO
            if ("Object".equals(restType) && !"Object".equals(field.getType()) && !"java.lang.Object".equals(field.getType())) continue;
            // Exclure les types inconnus (ex: Emetteur, Canal) qui ne sont pas des DTOs detectes
            if (!isKnownType(restType, analysis)) continue;
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
        // Types generiques bruts (T, E, V, etc.) → Object
        if (type.length() == 1 && Character.isUpperCase(type.charAt(0))) return "Object";
        // Types generiques avec bounds (? extends X) → Object
        if (type.startsWith("?") || type.contains("<?")) return "Object";
        // Nettoyer les prefixes java.lang / java.util
        String cleaned = type.replace("java.lang.", "").replace("java.util.", "");
        // Gerer les tableaux : extraire le type de base pour verification
        String baseType = cleaned.replace("[]", "");
        if (baseType.contains("<")) baseType = baseType.substring(0, baseType.indexOf('<'));
        return cleaned;
    }

    /**
     * Verifie si un type est connu (primitif, standard Java, DTO detecte, ou enum).
     * Les types inconnus seront remplaces par Object dans les EJB types.
     */
    private boolean isKnownType(String type, ProjectAnalysisResult analysis) {
        if (type == null) return true;
        String stripped = type.replace("[]", "");
        final String base = stripped.contains("<") ? stripped.substring(0, stripped.indexOf('<')) : stripped;
        // Primitifs et types Java standard
        if (STANDARD_TYPES.contains(base)) return true;
        // DTOs detectes
        if (analysis != null && analysis.getDtos().stream().anyMatch(d -> d.getClassName().equals(base))) return true;
        // Enums detectes
        if (analysis != null && analysis.getDetectedEnums() != null
                && analysis.getDetectedEnums().stream().anyMatch(e -> e.getName().equals(base))) return true;
        return false;
    }

    private static final Set<String> STANDARD_TYPES = Set.of(
            "String", "int", "long", "boolean", "double", "float", "byte", "short", "char",
            "Integer", "Long", "Boolean", "Double", "Float", "Byte", "Short", "Character",
            "BigDecimal", "BigInteger", "Date", "LocalDate", "LocalDateTime", "Instant",
            "UUID", "Object", "Map", "List", "Set", "Collection", "HashMap", "ArrayList",
            "LinkedHashMap", "TreeMap", "HashSet", "TreeSet", "LinkedList"
    );

    /**
     * Returns true if the type should NOT be imported as an EJB type.
     * Filters out Java primitives, standard types, void, and framework types.
     */
    private boolean isNonImportableEjbType(String type) {
        if (type == null) return true;
        return Set.of("void", "Void", "String", "Integer", "Long", "Double", "Float",
                "Boolean", "Short", "Byte", "Character", "Number", "BigDecimal", "BigInteger",
                "Object", "Date", "LocalDate", "LocalDateTime", "Instant", "Map", "List",
                "Set", "Collection", "Serializable", "int", "long", "double", "float",
                "boolean", "short", "byte", "char").contains(type);
    }

    private boolean isFrameworkType(String type) {
        if (type == null) return false;
        return FRAMEWORK_TYPES.contains(type) || type.startsWith("ma.eai.") || type.contains("Envelope")
                || type.equals("Entete") || type.startsWith("Entete<")
                || type.equals("Header") || type.equals("Context")
                || type.equals("ServiceContext") || type.equals("EaiContext");
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
    // COUCHE API : Enveloppe standardisee (ApiRequest<T>, ApiResponse<T>)
    // =====================================================================

    /**
     * Genere les classes d'enveloppe standardisee pour l'API BIAN :
     * - ApiRequest<T>  : enveloppe d'entree avec request_id, source_system, timestamp, payload
     * - ApiResponse<T> : enveloppe de sortie avec request_id, source_system, timestamp, status, payload
     *
     * Les clients de l'API doivent envoyer leurs requetes dans ce format d'enveloppe.
     * Le Controller extrait le payload et le transmet au service metier.
     */
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
        sb.append("    public void setRequestId(String requestId) { this.requestId = requestId; }\n\n");
        sb.append("    public String getSourceSystem() { return sourceSystem; }\n");
        sb.append("    public void setSourceSystem(String sourceSystem) { this.sourceSystem = sourceSystem; }\n\n");
        sb.append("    public String getTimestamp() { return timestamp; }\n");
        sb.append("    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }\n\n");
        sb.append("    public T getPayload() { return payload; }\n");
        sb.append("    public void setPayload(T payload) { this.payload = payload; }\n");
        sb.append("}\n");
        Files.writeString(dir.resolve("ApiRequest.java"), sb.toString());
        log.info("[ACL] Enveloppe generee : ApiRequest<T>");

        // --- ApiResponse.java ---
        sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_ENVELOPE).append(";\n\n");
        sb.append("import com.fasterxml.jackson.annotation.JsonProperty;\n\n");
        sb.append("/**\n");
        sb.append(" * Enveloppe standardisee pour les reponses de l'API BIAN.\n");
        sb.append(" * Toutes les reponses sont wrappees dans ce format.\n");
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
        sb.append("    public void setRequestId(String requestId) { this.requestId = requestId; }\n\n");
        sb.append("    public String getSourceSystem() { return sourceSystem; }\n");
        sb.append("    public void setSourceSystem(String sourceSystem) { this.sourceSystem = sourceSystem; }\n\n");
        sb.append("    public String getTimestamp() { return timestamp; }\n");
        sb.append("    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }\n\n");
        sb.append("    public String getStatus() { return status; }\n");
        sb.append("    public void setStatus(String status) { this.status = status; }\n\n");
        sb.append("    public T getPayload() { return payload; }\n");
        sb.append("    public void setPayload(T payload) { this.payload = payload; }\n");
        sb.append("}\n");
        Files.writeString(dir.resolve("ApiResponse.java"), sb.toString());
        log.info("[ACL] Enveloppe generee : ApiResponse<T>");
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

    // =====================================================================
    // COUCHE INFRASTRUCTURE : RestAdapter (appel adapter WebSphere via HTTP)
    // =====================================================================

    /**
     * Genere un RestAdapter par service domain.
     * Active avec @Profile("rest"), il appelle l'adapter WebSphere via RestTemplate
     * au lieu d'appeler l'EJB directement via JNDI.
     *
     * L'adapter WebSphere expose du REST classique (non-BIAN).
     * Le contrat est defini par les tests Pact Consumer.
     */
    private void generateRestAdapter(Path srcMain, BianControllerGroup group, ProjectAnalysisResult analysis) throws IOException {
        String adapterName = toPascalCase(group.serviceDomain) + "RestAdapter";
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_REST_ADAPTER);
        Path file = dir.resolve(adapterName + ".java");

        // Detecter si le groupe contient des endpoints JSON_ADAPTER
        boolean isJsonAdapterMode = analysis.isJsonAdapterMode();
        AdapterDescriptor adapterDescriptor = analysis.getAdapterDescriptor();

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_REST_ADAPTER).append(";\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        for (BianEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
        }
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + group.serviceInterfaceName + ";");
        imports.add("import " + PKG_DOMAIN_EXCEPTION + ".ApiException;");
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
        imports.add("import org.springframework.http.HttpMethod;");
        imports.add("import org.springframework.http.MediaType;");
        imports.add("import org.springframework.http.ResponseEntity;");
        imports.add("import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;");
        imports.add("import io.github.resilience4j.retry.annotation.Retry;");
        imports.add("import io.github.resilience4j.bulkhead.annotation.Bulkhead;");

        for (String imp : imports) sb.append(imp).append("\n");
        sb.append("\n");

        // Determiner l'URL par defaut de l'adapter
        String defaultBaseUrl = "http://localhost:8090";
        if (isJsonAdapterMode && adapterDescriptor != null && adapterDescriptor.getAdapterBaseUrl() != null) {
            defaultBaseUrl = adapterDescriptor.getAdapterBaseUrl();
        }

        sb.append("/**\n");
        sb.append(" * Adapter REST pour le domaine BIAN ").append(group.serviceDomainTitle).append(".\n");
        if (isJsonAdapterMode) {
            sb.append(" * Appelle le backend REST via HTTP en utilisant les URLs du contrat JSON.\n");
        } else {
            sb.append(" * Appelle l'adapter WebSphere via HTTP/REST au lieu de l'EJB via JNDI.\n");
        }
        sb.append(" *\n");
        sb.append(" * Activer ce profil avec : spring.profiles.active=rest\n");
        sb.append(" * Configurer l'URL de l'adapter dans application-rest.properties\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        sb.append("@Profile(\"rest\")\n");
        sb.append("public class ").append(adapterName).append(" implements ").append(group.serviceInterfaceName).append(" {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");

        // Champs
        sb.append("    private final RestTemplate restTemplate;\n\n");
        sb.append("    @Value(\"${adapter.websphere.base-url:").append(defaultBaseUrl).append("}\")");
        sb.append("\n");
        sb.append("    private String adapterBaseUrl;\n\n");

        // Constructeur
        sb.append("    public ").append(adapterName).append("(RestTemplate restTemplate) {\n");
        sb.append("        this.restTemplate = restTemplate;\n");
        sb.append("    }\n\n");

        // Methodes de service
        for (BianEndpoint ep : group.endpoints) {
            String returnType = ep.responseDtoName != null ? ep.responseDtoName : "void";
            boolean hasReturn = ep.responseDtoName != null;
            boolean hasCrRef = ep.bianMapping.getUrl() != null && ep.bianMapping.getUrl().contains("{cr-reference-id}");

            // ===== JSON_ADAPTER : utiliser l'URL backend reelle du contrat JSON =====
            boolean isJsonEndpoint = ep.useCaseInfo != null && ep.useCaseInfo.isJsonAdapter();
            String adapterPath;
            String backendHttpMethod;

            if (isJsonEndpoint && ep.useCaseInfo.getBackendEndpoint() != null) {
                AdapterDescriptor.BackendEndpoint backendEp = ep.useCaseInfo.getBackendEndpoint();
                adapterPath = backendEp.getPath();
                backendHttpMethod = backendEp.getHttpMethod() != null ? backendEp.getHttpMethod().toUpperCase() : "POST";
            } else {
                // Mode EJB classique : construire le path
                adapterPath = "/api/" + toKebabCase(group.serviceDomain) + "/" + toKebabCase(ep.useCaseName);
                backendHttpMethod = "POST";
            }

            // Resilience4j annotations
            String fallbackName = ep.methodName + "Fallback";
            sb.append("    @CircuitBreaker(name = \"restAdapter\", fallbackMethod = \"").append(fallbackName).append("\")\n");
            sb.append("    @Retry(name = \"restAdapter\")\n");
            sb.append("    @Bulkhead(name = \"restAdapter\")\n");
            sb.append("    @Override\n");
            sb.append("    public ").append(returnType).append(" ").append(ep.methodName).append("(");

            List<String> params = new ArrayList<>();
            if (hasCrRef) params.add("String crReferenceId");
            if (ep.requestDtoName != null) params.add(ep.requestDtoName + " request");
            sb.append(String.join(", ", params));
            sb.append(") {\n");

            sb.append("        log.info(\"[REST-CALL] ").append(ep.useCaseName).append(" -> {} [").append(backendHttpMethod).append("]\", adapterBaseUrl);\n");

            // Construire l'URL
            sb.append("        String url = adapterBaseUrl + \"").append(adapterPath).append("\";\n");
            if (hasCrRef) {
                sb.append("        url = url + \"/\" + crReferenceId;\n");
            }

            sb.append("        try {\n");
            sb.append("            HttpHeaders headers = new HttpHeaders();\n");
            sb.append("            headers.setContentType(MediaType.APPLICATION_JSON);\n");

            if (ep.requestDtoName != null) {
                sb.append("            HttpEntity<").append(ep.requestDtoName).append("> entity = new HttpEntity<>(request, headers);\n");
            } else {
                sb.append("            HttpEntity<Void> entity = new HttpEntity<>(headers);\n");
            }

            sb.append("            long start = System.currentTimeMillis();\n");

            // ===== Utiliser la bonne methode HTTP =====
            if ("GET".equals(backendHttpMethod)) {
                // GET : utiliser exchange avec HttpMethod.GET
                if (hasReturn) {
                    sb.append("            ResponseEntity<").append(returnType).append("> response = restTemplate.exchange(url, HttpMethod.GET, entity, ").append(returnType).append(".class);\n");
                    sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.useCaseName).append(" en {}ms — HTTP {}\", System.currentTimeMillis() - start, response.getStatusCode());\n");
                    sb.append("            return response.getBody();\n");
                } else {
                    sb.append("            restTemplate.exchange(url, HttpMethod.GET, entity, Void.class);\n");
                    sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.useCaseName).append(" en {}ms\", System.currentTimeMillis() - start);\n");
                }
            } else if ("DELETE".equals(backendHttpMethod)) {
                // DELETE : utiliser exchange avec HttpMethod.DELETE
                if (hasReturn) {
                    sb.append("            ResponseEntity<").append(returnType).append("> response = restTemplate.exchange(url, HttpMethod.DELETE, entity, ").append(returnType).append(".class);\n");
                    sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.useCaseName).append(" en {}ms — HTTP {}\", System.currentTimeMillis() - start, response.getStatusCode());\n");
                    sb.append("            return response.getBody();\n");
                } else {
                    sb.append("            restTemplate.exchange(url, HttpMethod.DELETE, entity, Void.class);\n");
                    sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.useCaseName).append(" en {}ms\", System.currentTimeMillis() - start);\n");
                }
            } else if ("PUT".equals(backendHttpMethod)) {
                // PUT : utiliser exchange avec HttpMethod.PUT
                if (hasReturn) {
                    sb.append("            ResponseEntity<").append(returnType).append("> response = restTemplate.exchange(url, HttpMethod.PUT, entity, ").append(returnType).append(".class);\n");
                    sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.useCaseName).append(" en {}ms — HTTP {}\", System.currentTimeMillis() - start, response.getStatusCode());\n");
                    sb.append("            return response.getBody();\n");
                } else {
                    sb.append("            restTemplate.exchange(url, HttpMethod.PUT, entity, Void.class);\n");
                    sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.useCaseName).append(" en {}ms\", System.currentTimeMillis() - start);\n");
                }
            } else if ("PATCH".equals(backendHttpMethod)) {
                // PATCH : utiliser exchange avec HttpMethod.PATCH
                if (hasReturn) {
                    sb.append("            ResponseEntity<").append(returnType).append("> response = restTemplate.exchange(url, HttpMethod.PATCH, entity, ").append(returnType).append(".class);\n");
                    sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.useCaseName).append(" en {}ms — HTTP {}\", System.currentTimeMillis() - start, response.getStatusCode());\n");
                    sb.append("            return response.getBody();\n");
                } else {
                    sb.append("            restTemplate.exchange(url, HttpMethod.PATCH, entity, Void.class);\n");
                    sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.useCaseName).append(" en {}ms\", System.currentTimeMillis() - start);\n");
                }
            } else {
                // POST (defaut)
                if (hasReturn) {
                    sb.append("            ResponseEntity<").append(returnType).append("> response = restTemplate.postForEntity(url, entity, ").append(returnType).append(".class);\n");
                    sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.useCaseName).append(" en {}ms — HTTP {}\", System.currentTimeMillis() - start, response.getStatusCode());\n");
                    sb.append("            return response.getBody();\n");
                } else {
                    sb.append("            restTemplate.postForEntity(url, entity, Void.class);\n");
                    sb.append("            log.info(\"[REST-RESPONSE] ").append(ep.useCaseName).append(" en {}ms\", System.currentTimeMillis() - start);\n");
                }
            }

            sb.append("        } catch (HttpClientErrorException e) {\n");
            sb.append("            log.error(\"[REST-ERROR] Erreur client HTTP {} pour ").append(ep.useCaseName).append(" : {}\", e.getStatusCode(), e.getResponseBodyAsString());\n");
            sb.append("            throw new ApiException(\"ADAPTER_CLIENT_ERROR\", \"Erreur client adapter : \" + e.getMessage(), e.getStatusCode().value(), e);\n");
            sb.append("        } catch (HttpServerErrorException e) {\n");
            sb.append("            log.error(\"[REST-ERROR] Erreur serveur HTTP {} pour ").append(ep.useCaseName).append(" : {}\", e.getStatusCode(), e.getResponseBodyAsString());\n");
            sb.append("            throw new ApiException(\"ADAPTER_SERVER_ERROR\", \"Erreur serveur adapter : \" + e.getMessage(), e.getStatusCode().value(), e);\n");
            sb.append("        } catch (ResourceAccessException e) {\n");
            sb.append("            log.error(\"[REST-ERROR] Adapter inaccessible pour ").append(ep.useCaseName).append(" : {}\", e.getMessage());\n");
            sb.append("            throw new ApiException(\"ADAPTER_UNREACHABLE\", \"Adapter backend inaccessible : \" + e.getMessage(), 503, e);\n");
            sb.append("        }\n");
            sb.append("    }\n\n");

            // Fallback Resilience4j
            sb.append("    public ").append(returnType).append(" ").append(fallbackName).append("(");
            List<String> fallbackParams = new ArrayList<>(params);
            fallbackParams.add("Throwable t");
            sb.append(String.join(", ", fallbackParams));
            sb.append(") {\n");
            sb.append("        log.error(\"[RESILIENCE-FALLBACK] Adapter backend indisponible pour ").append(ep.useCaseName).append(" — cause : {}\", t.getMessage());\n");
            sb.append("        throw new RuntimeException(\"Adapter backend temporairement indisponible (").append(ep.useCaseName).append("). Veuillez reessayer plus tard.\", t);\n");
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
                sb.append("        ").append(ep.responseDtoName).append(" response = ").append(ep.methodName).append("(");
                List<String> callArgs = new ArrayList<>();
                if (hasCrRef) callArgs.add("crReferenceId");
                if (ep.requestDtoName != null) callArgs.add("request");
                sb.append(String.join(", ", callArgs));
                sb.append(");\n");
                sb.append("        return response != null ? response.toString().getBytes() : null;\n");
                sb.append("    }\n\n");
            }
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] RestAdapter genere : {}", adapterName);
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : RestClientConfig
    // =====================================================================

    /**
     * Genere la configuration du RestTemplate avec timeouts et interceptors.
     */
    private void generateRestClientConfig(Path srcMain) throws IOException {
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
        sb.append("import org.springframework.http.client.ClientHttpRequestInterceptor;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n\n");

        sb.append("/**\n");
        sb.append(" * Configuration du RestTemplate pour appeler l'adapter WebSphere.\n");
        sb.append(" * Active uniquement avec le profil 'rest'.\n");
        sb.append(" *\n");
        sb.append(" * Configurable via application-rest.properties :\n");
        sb.append(" * - adapter.websphere.connect-timeout (defaut: 5000ms)\n");
        sb.append(" * - adapter.websphere.read-timeout (defaut: 30000ms)\n");
        sb.append(" */\n");
        sb.append("@Configuration\n");
        sb.append("@Profile(\"rest\")\n");
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
        sb.append("        factory.setReadTimeout(readTimeout);\n\n");
        sb.append("        RestTemplate restTemplate = new RestTemplate(factory);\n\n");
        sb.append("        // Interceptor de logging\n");
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
        log.info("[ACL] RestClientConfig genere");
    }

    // =====================================================================
    // TESTS : Pact Consumer Tests
    // =====================================================================

    /**
     * Genere les tests Pact Consumer-Driven pour chaque service domain.
     * Ces tests definissent le contrat attendu entre l'API BIAN (consumer)
     * et l'adapter WebSphere (provider).
     *
     * Le fichier Pact genere (.json) sert de specification vivante
     * que l'equipe WebSphere utilise pour valider leur adapter.
     */
    private void generatePactConsumerTests(Path srcMain, List<BianControllerGroup> groups,
                                            ProjectAnalysisResult analysis) throws IOException {
        Path testJavaRoot = resolveTestJavaRoot(srcMain);
        String testPkg = PKG_BASE + ".pact";
        Path testDir = testJavaRoot.resolve(testPkg.replace(".", "/"));
        Files.createDirectories(testDir);

        for (BianControllerGroup group : groups) {
            String testName = toPascalCase(group.serviceDomain) + "PactConsumerTest";
            Path file = testDir.resolve(testName + ".java");

            StringBuilder sb = new StringBuilder();
            sb.append("package ").append(testPkg).append(";\n\n");

            // Imports
            Set<String> imports = new TreeSet<>();
            for (BianEndpoint ep : group.endpoints) {
                if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
                if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
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
            imports.add("import org.springframework.http.HttpEntity;");
            imports.add("import org.springframework.http.HttpHeaders;");
            imports.add("import org.springframework.http.MediaType;");
            imports.add("import org.springframework.http.ResponseEntity;");
            imports.add("import org.springframework.web.client.RestTemplate;");
            imports.add("import static org.junit.jupiter.api.Assertions.*;");

            for (String imp : imports) sb.append(imp).append("\n");
            sb.append("\n");

            String providerName = "adapter-websphere-" + group.serviceDomain;
            String consumerName = "api-bian-" + group.serviceDomain;

            sb.append("/**\n");
            sb.append(" * Tests Pact Consumer-Driven pour le domaine ").append(group.serviceDomainTitle).append(".\n");
            sb.append(" *\n");
            sb.append(" * Consumer : API BIAN (").append(consumerName).append(")\n");
            sb.append(" * Provider : Adapter WebSphere (").append(providerName).append(")\n");
            sb.append(" *\n");
            sb.append(" * Ces tests generent un fichier Pact (target/pacts/) qui sert de contrat\n");
            sb.append(" * entre l'API BIAN et l'adapter WebSphere.\n");
            sb.append(" * L'equipe WebSphere utilise ce fichier pour valider leur adapter.\n");
            sb.append(" */\n");
            sb.append("@ExtendWith(PactConsumerTestExt.class)\n");
            sb.append("@PactTestFor(providerName = \"").append(providerName).append("\")\n");
            sb.append("public class ").append(testName).append(" {\n\n");

            // Pour chaque endpoint, generer un @Pact et un @Test
            for (BianEndpoint ep : group.endpoints) {
                String pactMethodName = toLowerCamel(ep.methodName) + "Pact";
                String testMethodName = "test" + capitalize(ep.methodName);
                String adapterPath = "/api/" + toKebabCase(group.serviceDomain) + "/" + toKebabCase(ep.useCaseName);
                boolean hasCrRef = ep.bianMapping.getUrl() != null && ep.bianMapping.getUrl().contains("{cr-reference-id}");
                boolean hasReturn = ep.responseDtoName != null;

                // --- @Pact method ---
                sb.append("    @Pact(consumer = \"").append(consumerName).append("\")\n");
                sb.append("    public V4Pact ").append(pactMethodName).append("(PactDslWithProvider builder) {\n");
                sb.append("        PactDslJsonBody requestBody = new PactDslJsonBody()\n");

                // Ajouter les champs du request DTO au contrat
                if (ep.requestDtoName != null) {
                    DtoInfo requestDto = findDto(analysis, ep.useCaseInfo != null ? ep.useCaseInfo.getInputDtoClassName() : null);
                    if (requestDto != null && requestDto.getFields() != null) {
                        for (DtoInfo.FieldInfo field : requestDto.getFields()) {
                            if (LEGACY_FIELDS.contains(field.getName())) continue;
                            String type = field.getType();
                            if (type == null) type = "String";
                            String cleanName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
                            if (type.contains("int") || type.contains("Integer") || type.contains("long") || type.contains("Long")) {
                                sb.append("                .numberType(\"").append(cleanName).append("\", 1)\n");
                            } else if (type.contains("boolean") || type.contains("Boolean")) {
                                sb.append("                .booleanType(\"").append(cleanName).append("\", true)\n");
                            } else if (type.contains("BigDecimal") || type.contains("double") || type.contains("Double") || type.contains("float")) {
                                sb.append("                .decimalType(\"").append(cleanName).append("\", 100.0)\n");
                            } else {
                                sb.append("                .stringType(\"").append(cleanName).append("\", \"sample\")\n");
                            }
                        }
                    } else {
                        sb.append("                .stringType(\"data\", \"sample\")\n");
                    }
                } else {
                    sb.append("                .stringType(\"data\", \"sample\")\n");
                }
                sb.append("                ;\n\n");

                sb.append("        PactDslJsonBody responseBody = new PactDslJsonBody()\n");
                // Ajouter les champs du response DTO au contrat
                if (hasReturn) {
                    DtoInfo responseDto = findDto(analysis, ep.useCaseInfo != null ? ep.useCaseInfo.getOutputDtoClassName() : null);
                    if (responseDto != null && responseDto.getFields() != null) {
                        for (DtoInfo.FieldInfo field : responseDto.getFields()) {
                            if (LEGACY_FIELDS.contains(field.getName())) continue;
                            String type = field.getType();
                            if (type == null) type = "String";
                            String cleanName = FIELD_RENAME.getOrDefault(field.getName(), field.getName());
                            if (type.contains("int") || type.contains("Integer") || type.contains("long") || type.contains("Long")) {
                                sb.append("                .numberType(\"").append(cleanName).append("\")\n");
                            } else if (type.contains("boolean") || type.contains("Boolean")) {
                                sb.append("                .booleanType(\"").append(cleanName).append("\")\n");
                            } else if (type.contains("BigDecimal") || type.contains("double") || type.contains("Double") || type.contains("float")) {
                                sb.append("                .decimalType(\"").append(cleanName).append("\")\n");
                            } else {
                                sb.append("                .stringType(\"").append(cleanName).append("\")\n");
                            }
                        }
                    } else {
                        sb.append("                .stringType(\"status\", \"OK\")\n");
                    }
                } else {
                    sb.append("                .stringType(\"status\", \"OK\")\n");
                }
                sb.append("                ;\n\n");

                String path = hasCrRef ? adapterPath + "/12345" : adapterPath;
                sb.append("        return builder\n");
                sb.append("                .given(\"").append(ep.useCaseName).append(" est disponible\")\n");
                sb.append("                .uponReceiving(\"Appel ").append(ep.useCaseName).append("\")\n");
                sb.append("                .path(\"").append(path).append("\")\n");
                sb.append("                .method(\"POST\")\n");
                sb.append("                .headers(\"Content-Type\", \"application/json\")\n");
                sb.append("                .body(requestBody)\n");
                sb.append("                .willRespondWith()\n");
                sb.append("                .status(200)\n");
                sb.append("                .headers(java.util.Map.of(\"Content-Type\", \"application/json\"))\n");
                sb.append("                .body(responseBody)\n");
                sb.append("                .toPact(V4Pact.class);\n");
                sb.append("    }\n\n");

                // --- @Test method ---
                sb.append("    @Test\n");
                sb.append("    @PactTestFor(pactMethod = \"").append(pactMethodName).append("\")\n");
                sb.append("    void ").append(testMethodName).append("(MockServer mockServer) {\n");
                sb.append("        RestTemplate restTemplate = new RestTemplate();\n");
                sb.append("        String url = mockServer.getUrl() + \"").append(path).append("\";\n\n");
                sb.append("        HttpHeaders headers = new HttpHeaders();\n");
                sb.append("        headers.setContentType(MediaType.APPLICATION_JSON);\n");

                if (ep.requestDtoName != null) {
                    sb.append("        ").append(ep.requestDtoName).append(" request = new ").append(ep.requestDtoName).append("();\n");
                    sb.append("        HttpEntity<").append(ep.requestDtoName).append("> entity = new HttpEntity<>(request, headers);\n");
                } else {
                    sb.append("        HttpEntity<String> entity = new HttpEntity<>(\"{}\", headers);\n");
                }

                if (hasReturn) {
                    sb.append("        ResponseEntity<").append(ep.responseDtoName).append("> response = restTemplate.postForEntity(url, entity, ").append(ep.responseDtoName).append(".class);\n\n");
                    sb.append("        assertEquals(200, response.getStatusCode().value());\n");
                    sb.append("        assertNotNull(response.getBody());\n");
                } else {
                    sb.append("        ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);\n\n");
                    sb.append("        assertEquals(200, response.getStatusCode().value());\n");
                }

                sb.append("    }\n\n");
            }

            sb.append("}\n");

            Files.writeString(file, sb.toString());
            log.info("[ACL] Pact Consumer Test genere : {}", testName);
        }
    }
}
