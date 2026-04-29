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
 * <p>Si le bloc {@code bian{}} est present dans le JSON, le mapping BIAN est utilise
 * directement. Sinon, le {@link BianAutoDetector} est utilise pour l'auto-detection.</p>
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

        // 3. Parse BIAN mapping from JSON (if present)
        BianMapping globalBianMapping = parseBianMapping(root);

        // 4. Convert each endpoint to a UseCaseInfo
        List<UseCaseInfo> useCases = new ArrayList<>();
        List<DtoInfo> dtos = new ArrayList<>();

        for (AdapterDescriptor.BackendEndpoint ep : descriptor.getBackendEndpoints()) {
            UseCaseInfo uc = convertEndpointToUseCase(ep, descriptor, globalBianMapping);
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
        ep.setOperation(textOrDefault(epNode, "operation", "unknown"));
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
     * Parse le bloc bian{} du JSON s'il est present.
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
     */
    private UseCaseInfo convertEndpointToUseCase(
            AdapterDescriptor.BackendEndpoint ep,
            AdapterDescriptor descriptor,
            BianMapping globalBianMapping) {

        UseCaseInfo uc = new UseCaseInfo();

        // Pattern et type
        uc.setEjbPattern(UseCaseInfo.EjbPattern.JSON_ADAPTER);
        uc.setEjbType(UseCaseInfo.EjbType.STATELESS);

        // Noms derives de l'operation
        String pascalCase = ep.toPascalCase();
        uc.setClassName(pascalCase);
        uc.setPackageName("com.bank.api");
        uc.setFullyQualifiedName("com.bank.api." + pascalCase);

        // DTOs
        uc.setInputDtoClassName("VoIn_" + ep.getOperation().toUpperCase() + "Request");
        uc.setOutputDtoClassName("VoOut_" + ep.getOperation().toUpperCase() + "Response");
        uc.setInputDtoPackage("com.bank.api.dto.request");
        uc.setOutputDtoPackage("com.bank.api.dto.response");

        // HTTP method (BIAN side — toujours POST pour le Controller BIAN)
        uc.setHttpMethod("POST");
        uc.setHttpStatusCode(200);

        // REST endpoint (BIAN URL — sera construit par le BianMapping)
        String kebab = toKebabCase(ep.getOperation());
        uc.setRestEndpoint("/" + toKebabCase(descriptor.getAdapterName()) + "/" + kebab);

        // Controller et adapter names
        uc.setControllerName(toPascalCase(descriptor.getAdapterName()) + "Controller");
        uc.setServiceAdapterName(toPascalCase(descriptor.getAdapterName()) + "RestAdapter");

        // Reference vers le backend endpoint
        uc.setBackendEndpoint(ep);

        // Stateless
        uc.setStateless(true);
        uc.setHasExecuteMethod(true);

        // Swagger
        uc.setSwaggerSummary(pascalCase + " - " + descriptor.getAdapterName());

        // BIAN mapping
        if (globalBianMapping != null) {
            // Clone le mapping global et personnalise par endpoint
            BianMapping epMapping = cloneBianMapping(globalBianMapping);
            if (epMapping.getAction() == null || epMapping.getAction().isEmpty()) {
                epMapping.setAction(detectBianAction(ep.getHttpMethod()));
            }
            uc.setBianMapping(epMapping);
        } else if (bianAutoDetector != null) {
            // Auto-detection BIAN
            BianMapping detected = bianAutoDetector.autoDetect(uc);
            uc.setBianMapping(detected);
        }

        return uc;
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

    private String detectBianAction(String httpMethod) {
        return switch (httpMethod.toUpperCase()) {
            case "GET" -> "Retrieve";
            case "POST" -> "Initiate";
            case "PUT" -> "Update";
            case "DELETE" -> "Terminate";
            case "PATCH" -> "Update";
            default -> "Execute";
        };
    }

    private BianMapping cloneBianMapping(BianMapping source) {
        BianMapping clone = new BianMapping();
        clone.setServiceDomain(source.getServiceDomain());
        clone.setBianId(source.getBianId());
        clone.setBehaviorQualifier(source.getBehaviorQualifier());
        clone.setAction(source.getAction());
        return clone;
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
