package com.bank.tools.generator.parser;

import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.model.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Parser de contrat JSON adapter qui produit un {@link ProjectAnalysisResult} standard.
 *
 * <p>Ce parser transforme un fichier JSON decrivant un adapter REST backend
 * en un ProjectAnalysisResult identique a celui produit par le scanner EJB,
 * permettant de reutiliser le meme pipeline de generation ACL.</p>
 *
 * <p>Chaque endpoint du contrat JSON devient un {@link UseCaseInfo} avec le pattern
 * {@link UseCaseInfo.EjbPattern#JSON_ADAPTER} et une reference vers le
 * {@link AdapterDescriptor.BackendEndpoint} original.</p>
 *
 * <p>Si le bloc {@code bian{}} est present dans le JSON (global ou par endpoint),
 * le mapping BIAN est utilise directement pour piloter les URLs, methodes HTTP,
 * codes de statut et noms de DTOs. Sinon, le {@link BianAutoDetector} est utilise
 * pour l'auto-detection.</p>
 */
@Component
public class JsonAdapterParser {

    private static final Logger log = LoggerFactory.getLogger(JsonAdapterParser.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final BianAutoDetector bianAutoDetector;

    public JsonAdapterParser(BianAutoDetector bianAutoDetector) {
        this.bianAutoDetector = bianAutoDetector;
    }

    /**
     * Parse un fichier JSON et produit un ProjectAnalysisResult standard.
     *
     * @param jsonPath chemin vers le fichier JSON
     * @return le resultat d'analyse standard
     * @throws IOException si le fichier ne peut pas etre lu
     */
    public ProjectAnalysisResult parse(Path jsonPath) throws IOException {
        String jsonContent = Files.readString(jsonPath);
        return parseFromString(jsonContent);
    }

    /**
     * Parse une chaine JSON et produit un ProjectAnalysisResult standard.
     *
     * @param jsonContent contenu JSON
     * @return le resultat d'analyse standard
     */
    public ProjectAnalysisResult parseFromString(String jsonContent) {
        try {
            JsonNode root = objectMapper.readTree(jsonContent);
            return buildResult(root);
        } catch (Exception e) {
            throw new IllegalArgumentException("Erreur de parsing du contrat JSON : " + e.getMessage(), e);
        }
    }

    // ==================== PRIVATE ====================

    private ProjectAnalysisResult buildResult(JsonNode root) {
        ProjectAnalysisResult result = new ProjectAnalysisResult();
        result.setInputMode(InputMode.JSON_ADAPTER);

        // 1. Parse adapter metadata
        AdapterDescriptor descriptor = parseDescriptor(root);
        result.setAdapterDescriptor(descriptor);

        // 2. Set project metadata
        result.setSourceProjectName(descriptor.getAdapterName());
        result.setSourceBasePackage("com.bank.api");
        result.setTotalFilesAnalyzed(1);

        // 3. Parse BIAN mapping from JSON (global, if present)
        BianMapping globalBianMapping = parseBianMapping(root);

        // 4. Parse per-endpoint BIAN blocks from the raw JSON
        List<JsonNode> endpointBianNodes = new ArrayList<>();
        if (root.has("endpoints") && root.get("endpoints").isArray()) {
            for (JsonNode epNode : root.get("endpoints")) {
                endpointBianNodes.add(epNode.has("bian") ? epNode.get("bian") : null);
            }
        }

        // 5. Convert each endpoint to a UseCaseInfo
        List<UseCaseInfo> useCases = new ArrayList<>();
        List<DtoInfo> dtos = new ArrayList<>();

        List<AdapterDescriptor.BackendEndpoint> endpoints = descriptor.getBackendEndpoints();
        for (int i = 0; i < endpoints.size(); i++) {
            AdapterDescriptor.BackendEndpoint ep = endpoints.get(i);
            JsonNode epBianNode = i < endpointBianNodes.size() ? endpointBianNodes.get(i) : null;

            UseCaseInfo uc = convertEndpointToUseCase(ep, descriptor, globalBianMapping, epBianNode);
            useCases.add(uc);

            // Generate DTOs from request/response fields
            if (!ep.getRequestFields().isEmpty()) {
                DtoInfo requestDto = buildDtoFromFields(
                        uc.getInputDtoClassName(), ep.getRequestFields(), true);
                dtos.add(requestDto);
            }
            if (!ep.getResponseFields().isEmpty()) {
                DtoInfo responseDto = buildDtoFromFields(
                        uc.getOutputDtoClassName(), ep.getResponseFields(), false);
                dtos.add(responseDto);
            }
        }

        result.setUseCases(useCases);
        result.setDtos(dtos);
        result.setTotalEjbCount(useCases.size());

        log.info("JSON Adapter parsed: {} endpoints -> {} UseCases, {} DTOs",
                descriptor.getBackendEndpoints().size(), useCases.size(), dtos.size());

        return result;
    }

    private AdapterDescriptor parseDescriptor(JsonNode root) {
        AdapterDescriptor desc = new AdapterDescriptor();
        desc.setAdapterName(textOrDefault(root, "adapter_name", "UnknownAdapter"));
        desc.setAdapterBaseUrl(textOrDefault(root, "adapter_base_url", "http://localhost:8080"));
        desc.setDescription(textOrDefault(root, "description", ""));
        desc.setVersion(textOrDefault(root, "version", "1.0.0"));

        // Parse auth
        if (root.has("auth")) {
            desc.setAuth(parseAuth(root.get("auth")));
        }

        // Parse endpoints
        if (root.has("endpoints") && root.get("endpoints").isArray()) {
            List<AdapterDescriptor.BackendEndpoint> endpoints = new ArrayList<>();
            for (JsonNode epNode : root.get("endpoints")) {
                endpoints.add(parseEndpoint(epNode));
            }
            desc.setBackendEndpoints(endpoints);
        }

        return desc;
    }

    private AdapterDescriptor.AuthConfig parseAuth(JsonNode authNode) {
        AdapterDescriptor.AuthConfig auth = new AdapterDescriptor.AuthConfig();
        auth.setType(textOrDefault(authNode, "type", "none"));
        auth.setHeaderName(textOrDefault(authNode, "header_name", null));
        auth.setHeaderValue(textOrDefault(authNode, "header_value", null));
        auth.setTokenUrl(textOrDefault(authNode, "token_url", null));
        auth.setClientId(textOrDefault(authNode, "client_id", null));
        auth.setClientSecret(textOrDefault(authNode, "client_secret", null));
        auth.setUsername(textOrDefault(authNode, "username", null));
        auth.setPassword(textOrDefault(authNode, "password", null));
        auth.setKeystorePath(textOrDefault(authNode, "keystore_path", null));
        auth.setKeystorePassword(textOrDefault(authNode, "keystore_password", null));
        return auth;
    }

    private AdapterDescriptor.BackendEndpoint parseEndpoint(JsonNode epNode) {
        AdapterDescriptor.BackendEndpoint ep = new AdapterDescriptor.BackendEndpoint();
        // FIX: Utiliser "name" comme fallback si "operation" est absent
        String operation = textOrDefault(epNode, "operation", null);
        if (operation == null || "unknown".equals(operation)) {
            operation = textOrDefault(epNode, "name", "unknown");
        }
        ep.setOperation(operation);
        ep.setHttpMethod(textOrDefault(epNode, "method", "POST").toUpperCase());
        ep.setPath(textOrDefault(epNode, "path", "/"));
        ep.setIdempotent(boolOrDefault(epNode, "idempotent", false));
        ep.setTimeoutSeconds(intOrDefault(epNode, "timeout_seconds", 30));
        ep.setMaxRetries(intOrDefault(epNode, "max_retries", 3));
        ep.setPaginated(boolOrDefault(epNode, "paginated", false));

        // Parse fields
        if (epNode.has("request_fields") && epNode.get("request_fields").isArray()) {
            ep.setRequestFields(parseFields(epNode.get("request_fields")));
        }
        if (epNode.has("response_fields") && epNode.get("response_fields").isArray()) {
            ep.setResponseFields(parseFields(epNode.get("response_fields")));
        }

        // Parse path_params
        if (epNode.has("path_params") && epNode.get("path_params").isArray()) {
            ep.setPathParams(parseParams(epNode.get("path_params")));
        }

        // Parse query_params
        if (epNode.has("query_params") && epNode.get("query_params").isArray()) {
            ep.setQueryParams(parseParams(epNode.get("query_params")));
        }

        // Parse headers
        if (epNode.has("headers") && epNode.get("headers").isArray()) {
            ep.setHeaders(parseHeaders(epNode.get("headers")));
        }

        return ep;
    }

    private List<AdapterDescriptor.FieldInfo> parseFields(JsonNode fieldsNode) {
        List<AdapterDescriptor.FieldInfo> fields = new ArrayList<>();
        for (JsonNode f : fieldsNode) {
            AdapterDescriptor.FieldInfo fi = new AdapterDescriptor.FieldInfo();
            fi.setName(textOrDefault(f, "name", "field"));
            fi.setType(textOrDefault(f, "type", "String"));
            fi.setRequired(boolOrDefault(f, "required", false));
            fi.setDescription(textOrDefault(f, "description", null));
            fields.add(fi);
        }
        return fields;
    }

    private List<AdapterDescriptor.ParamInfo> parseParams(JsonNode paramsNode) {
        List<AdapterDescriptor.ParamInfo> params = new ArrayList<>();
        for (JsonNode p : paramsNode) {
            AdapterDescriptor.ParamInfo pi = new AdapterDescriptor.ParamInfo();
            pi.setName(textOrDefault(p, "name", "param"));
            pi.setType(textOrDefault(p, "type", "String"));
            pi.setRequired(boolOrDefault(p, "required", true));
            params.add(pi);
        }
        return params;
    }

    private List<AdapterDescriptor.HeaderInfo> parseHeaders(JsonNode headersNode) {
        List<AdapterDescriptor.HeaderInfo> headers = new ArrayList<>();
        for (JsonNode h : headersNode) {
            AdapterDescriptor.HeaderInfo hi = new AdapterDescriptor.HeaderInfo();
            hi.setName(textOrDefault(h, "name", "X-Header"));
            hi.setDefaultValue(textOrDefault(h, "default_value", null));
            headers.add(hi);
        }
        return headers;
    }

    /**
     * Parse le bloc bian{} global du JSON s'il est present.
     */
    private BianMapping parseBianMapping(JsonNode root) {
        if (!root.has("bian")) return null;

        JsonNode bianNode = root.get("bian");
        BianMapping mapping = new BianMapping();

        if (bianNode.has("service_domain")) {
            mapping.setServiceDomain(textOrDefault(bianNode, "service_domain", null));
        }
        if (bianNode.has("service_domain_id")) {
            mapping.setBianId(textOrDefault(bianNode, "service_domain_id", null));
        }
        if (bianNode.has("behavior_qualifier")) {
            mapping.setBehaviorQualifier(textOrDefault(bianNode, "behavior_qualifier", null));
        }
        if (bianNode.has("action")) {
            mapping.setAction(textOrDefault(bianNode, "action", null));
        }

        return mapping;
    }

    /**
     * Convertit un BackendEndpoint en UseCaseInfo standard.
     *
     * <p>FIX 1+2+3 : Le bloc bian{} de chaque endpoint pilote la generation :</p>
     * <ul>
     *   <li>FIX 1 : L'URL BIAN est construite depuis le BianMapping (service_domain + BQ + action)</li>
     *   <li>FIX 2 : La methode HTTP et le status code viennent du bloc bian{} de l'endpoint</li>
     *   <li>FIX 3 : Les noms de DTOs sont derives du BQ en PascalCase (OrderRequest, pas VoIn_ENRG_COMMANDERequest)</li>
     * </ul>
     *
     * @param ep le BackendEndpoint parse
     * @param descriptor le descripteur de l'adapter
     * @param globalBianMapping le mapping BIAN global (bloc bian{} racine)
     * @param epBianNode le noeud JSON du bloc bian{} de cet endpoint (peut etre null)
     */
    private UseCaseInfo convertEndpointToUseCase(
            AdapterDescriptor.BackendEndpoint ep,
            AdapterDescriptor descriptor,
            BianMapping globalBianMapping,
            JsonNode epBianNode) {

        UseCaseInfo uc = new UseCaseInfo();

        // Pattern et type
        uc.setEjbPattern(UseCaseInfo.EjbPattern.JSON_ADAPTER);
        uc.setEjbType(UseCaseInfo.EjbType.STATELESS);

        // Noms derives de l'operation
        String pascalCase = ep.toPascalCase();
        uc.setClassName(pascalCase);
        uc.setPackageName("com.bank.api");
        uc.setFullyQualifiedName("com.bank.api." + pascalCase);

        // ===== FIX 1+2+3 : Construire le BianMapping complet depuis le bloc bian{} de l'endpoint =====
        BianMapping epMapping = buildEndpointBianMapping(ep, descriptor, globalBianMapping, epBianNode);

        // FIX 3 : Noms de DTOs propres depuis le BQ (PascalCase)
        String dtoBaseName = deriveDtoBaseName(epMapping, ep);
        uc.setInputDtoClassName(dtoBaseName + "Request");
        uc.setOutputDtoClassName(dtoBaseName + "Response");
        uc.setInputDtoPackage("com.bank.api.dto.request");
        uc.setOutputDtoPackage("com.bank.api.dto.response");

        // FIX 2 : HTTP method et status code depuis le BianMapping (pas hardcode)
        String bianHttpMethod = epMapping.getHttpMethod();
        int bianHttpStatus = epMapping.getHttpStatus();
        uc.setHttpMethod(bianHttpMethod != null ? bianHttpMethod : "POST");
        uc.setHttpStatusCode(bianHttpStatus > 0 ? bianHttpStatus : 200);

        // FIX 1 : L'URL REST est construite par le BianMapping (pas depuis le nom brut de l'operation)
        // L'URL sera construite par AclArchitectureGenerator via BianMapping.buildUrl()
        // On ne la force PAS ici — on laisse le pipeline ACL la construire
        uc.setRestEndpoint(null);

        // Controller et adapter names
        uc.setControllerName(toPascalCase(descriptor.getAdapterName()) + "Controller");
        uc.setServiceAdapterName(toPascalCase(descriptor.getAdapterName()) + "RestAdapter");

        // Reference vers le backend endpoint
        uc.setBackendEndpoint(ep);

        // Stateless
        uc.setStateless(true);
        uc.setHasExecuteMethod(true);

        // Swagger — utiliser le summary du JSON endpoint s'il existe
        String summary = ep instanceof AdapterDescriptor.BackendEndpoint
                ? textFromEndpointSummary(ep, descriptor)
                : pascalCase + " - " + descriptor.getAdapterName();
        uc.setSwaggerSummary(summary);

        // Attacher le BianMapping complet au UseCase
        uc.setBianMapping(epMapping);

        log.info("[JSON-PARSER] Endpoint '{}' -> BianMapping: action={}, bq={}, httpMethod={}, httpStatus={}, dto={}",
                ep.getOperation(), epMapping.getAction(), epMapping.getBehaviorQualifier(),
                epMapping.getHttpMethod(), epMapping.getHttpStatus(), dtoBaseName);

        return uc;
    }

    /**
     * Construit un BianMapping complet pour un endpoint en fusionnant :
     * 1. Le bloc bian{} global (service_domain, service_domain_id)
     * 2. Le bloc bian{} de l'endpoint (action, behavior_qualifier, http_method, http_status, has_cr_reference_id)
     * 3. Des fallbacks intelligents si certains champs manquent
     */
    private BianMapping buildEndpointBianMapping(
            AdapterDescriptor.BackendEndpoint ep,
            AdapterDescriptor descriptor,
            BianMapping globalBianMapping,
            JsonNode epBianNode) {

        BianMapping mapping = new BianMapping();

        // 1. Heriter du global : service_domain, service_domain_id
        if (globalBianMapping != null) {
            mapping.setServiceDomain(globalBianMapping.getServiceDomain());
            mapping.setBianId(globalBianMapping.getBianId());
            // Le BQ et action globaux sont des fallbacks
            if (globalBianMapping.getBehaviorQualifier() != null) {
                mapping.setBehaviorQualifier(globalBianMapping.getBehaviorQualifier());
            }
            if (globalBianMapping.getAction() != null) {
                mapping.setAction(globalBianMapping.getAction());
            }
        }

        // 2. Surcharger avec le bloc bian{} de l'endpoint (prioritaire)
        if (epBianNode != null) {
            String epAction = textOrDefault(epBianNode, "action", null);
            String epBq = textOrDefault(epBianNode, "behavior_qualifier", null);
            String epHttpMethod = textOrDefault(epBianNode, "http_method", null);
            int epHttpStatus = intOrDefault(epBianNode, "http_status", 0);
            boolean epHasCrRef = boolOrDefault(epBianNode, "has_cr_reference_id", false);

            if (epAction != null) mapping.setAction(epAction);
            if (epBq != null) mapping.setBehaviorQualifier(epBq);
            if (epHttpMethod != null) mapping.setHttpMethod(epHttpMethod.toUpperCase());
            if (epHttpStatus > 0) mapping.setHttpStatus(epHttpStatus);

            // Stocker has_cr_reference_id : on l'utilise pour construire l'URL
            // Le BianMapping.buildUrl() gere deja le {cr-reference-id} selon l'action
            // Mais si le JSON le force, on doit le respecter
            // -> On utilise l'URL pre-construite si has_cr_reference_id est explicite
        }

        // 3. Fallbacks si des champs manquent
        if (mapping.getAction() == null || mapping.getAction().isEmpty()) {
            mapping.setAction(detectBianAction(ep.getHttpMethod()));
        }
        if (mapping.getServiceDomain() == null || mapping.getServiceDomain().isEmpty()) {
            mapping.setServiceDomain(toKebabCase(descriptor.getAdapterName()));
        }

        // FIX 2 : Deriver HTTP method et status depuis l'action BIAN si non fournis
        if (mapping.getHttpMethod() == null || mapping.getHttpMethod().isEmpty()) {
            mapping.setHttpMethod(deriveHttpMethodFromAction(mapping.getAction()));
        }
        if (mapping.getHttpStatus() <= 0) {
            mapping.setHttpStatus(deriveHttpStatusFromAction(mapping.getAction()));
        }

        // Construire l'URL BIAN (sera utilisee par AclArchitectureGenerator)
        mapping.buildUrl("/api/v1");

        // Marquer comme mapping explicite (vient du JSON, pas de l'auto-detection)
        mapping.setExplicit(epBianNode != null || globalBianMapping != null);

        return mapping;
    }

    /**
     * FIX 3 : Derive le nom de base du DTO depuis le BQ en PascalCase.
     *
     * <p>Exemples :</p>
     * <ul>
     *   <li>BQ "order" -> "Order"</li>
     *   <li>BQ "tracking" -> "Tracking"</li>
     *   <li>BQ "payment-initiation" -> "PaymentInitiation"</li>
     *   <li>Pas de BQ -> PascalCase de l'operation (fallback)</li>
     * </ul>
     */
    private String deriveDtoBaseName(BianMapping mapping, AdapterDescriptor.BackendEndpoint ep) {
        String bq = mapping.getBehaviorQualifier();
        if (bq != null && !bq.isEmpty()) {
            return toPascalCase(bq);
        }
        // Fallback : utiliser l'operation en PascalCase
        return ep.toPascalCase();
    }

    /**
     * Construit un DtoInfo a partir des champs du contrat JSON.
     */
    private DtoInfo buildDtoFromFields(String dtoName, List<AdapterDescriptor.FieldInfo> fields, boolean isRequest) {
        DtoInfo dto = new DtoInfo();
        dto.setClassName(dtoName);
        dto.setPackageName(isRequest ? "com.bank.api.dto.request" : "com.bank.api.dto.response");

        List<DtoInfo.FieldInfo> dtoFields = new ArrayList<>();
        for (AdapterDescriptor.FieldInfo f : fields) {
            DtoInfo.FieldInfo dtoField = new DtoInfo.FieldInfo();
            dtoField.setName(f.getName());
            dtoField.setType(f.toJavaType());
            dtoField.setRequired(f.isRequired());
            dtoFields.add(dtoField);
        }
        dto.setFields(dtoFields);

        return dto;
    }

    // ==================== BIAN HELPERS ====================

    /**
     * Detecte l'action BIAN depuis la methode HTTP du backend.
     * Utilise comme fallback quand le bloc bian{} ne specifie pas d'action.
     */
    private String detectBianAction(String httpMethod) {
        return switch (httpMethod.toUpperCase()) {
            case "GET" -> "retrieval";
            case "POST" -> "initiation";
            case "PUT" -> "update";
            case "DELETE" -> "termination";
            case "PATCH" -> "update";
            default -> "execution";
        };
    }

    /**
     * FIX 2 : Derive la methode HTTP BIAN depuis l'action.
     * Conforme a la table BIAN canonique (BianMappingConfig) :
     * - control/update/termination -> PUT
     * - tout le reste -> POST
     */
    private String deriveHttpMethodFromAction(String action) {
        if (action == null) return "POST";
        return switch (action.toLowerCase()) {
            case "control", "update", "termination" -> "PUT";
            default -> "POST";
        };
    }

    /**
     * FIX 2 : Derive le status HTTP BIAN depuis l'action.
     * Conforme a la table BIAN canonique (BianMappingConfig) :
     * - initiation/notification -> 201
     * - tout le reste -> 200
     */
    private int deriveHttpStatusFromAction(String action) {
        if (action == null) return 200;
        return switch (action.toLowerCase()) {
            case "initiation", "notification" -> 201;
            default -> 200;
        };
    }

    /**
     * Extrait le summary depuis le JSON endpoint.
     */
    private String textFromEndpointSummary(AdapterDescriptor.BackendEndpoint ep, AdapterDescriptor descriptor) {
        // Le summary n'est pas stocke dans BackendEndpoint, on le derive
        return ep.toPascalCase() + " - " + descriptor.getAdapterName();
    }

    // ==================== STRING HELPERS ====================

    private String toPascalCase(String input) {
        if (input == null) return "";
        StringBuilder sb = new StringBuilder();
        for (String part : input.split("[_\\-\\s]+")) {
            if (!part.isEmpty()) {
                sb.append(Character.toUpperCase(part.charAt(0)));
                if (part.length() > 1) sb.append(part.substring(1));
            }
        }
        return sb.toString();
    }

    private String toKebabCase(String input) {
        if (input == null) return "";
        return input.replaceAll("([a-z])([A-Z])", "$1-$2")
                .replaceAll("[_\\s]+", "-")
                .toLowerCase();
    }

    private String textOrDefault(JsonNode node, String field, String defaultValue) {
        if (node != null && node.has(field) && !node.get(field).isNull()) {
            return node.get(field).asText();
        }
        return defaultValue;
    }

    private boolean boolOrDefault(JsonNode node, String field, boolean defaultValue) {
        if (node != null && node.has(field)) {
            return node.get(field).asBoolean(defaultValue);
        }
        return defaultValue;
    }

    private int intOrDefault(JsonNode node, String field, int defaultValue) {
        if (node != null && node.has(field)) {
            return node.get(field).asInt(defaultValue);
        }
        return defaultValue;
    }
}
