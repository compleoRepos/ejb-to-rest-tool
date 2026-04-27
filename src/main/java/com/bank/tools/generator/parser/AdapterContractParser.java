package com.bank.tools.generator.parser;

import com.bank.tools.generator.model.AdapterContractInfo;
import com.bank.tools.generator.model.AdapterContractInfo.AuthConfig;
import com.bank.tools.generator.model.AdapterContractInfo.EndpointInfo;
import com.bank.tools.generator.model.AdapterContractInfo.FieldInfo;
import com.bank.tools.generator.model.AdapterContractInfo.HeaderInfo;
import com.bank.tools.generator.model.AdapterContractInfo.ParamInfo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Parser de contrats JSON normalises d'Adapters WebSphere ou de toute API REST.
 *
 * <p>Lit un fichier JSON decrivant le contrat d'un adapter et produit un
 * {@link AdapterContractInfo} utilisable par le generateur.</p>
 *
 * <p>Supporte :</p>
 * <ul>
 *   <li>Methodes HTTP : GET, POST, PUT, DELETE, PATCH</li>
 *   <li>Path parameters, query parameters, headers personnalises</li>
 *   <li>Pagination BIAN</li>
 *   <li>Authentification : API Key, Bearer, OAuth2, Basic, mTLS</li>
 * </ul>
 *
 * @see AdapterContractInfo
 */
@Component
public class AdapterContractParser {

    private static final Logger log = LoggerFactory.getLogger(AdapterContractParser.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Parse un fichier JSON de contrat adapter.
     *
     * @param filePath chemin vers le fichier JSON
     * @return le contrat parse
     * @throws IOException en cas d'erreur de lecture ou de format invalide
     */
    public AdapterContractInfo parse(Path filePath) throws IOException {
        log.info("[AdapterParser] Parsing du contrat : {}", filePath);

        String content = Files.readString(filePath);
        return parseFromString(content);
    }

    /**
     * Parse un contrat adapter depuis une chaine JSON.
     *
     * @param jsonContent le contenu JSON
     * @return le contrat parse
     * @throws IOException en cas de format invalide
     */
    public AdapterContractInfo parseFromString(String jsonContent) throws IOException {
        JsonNode root = objectMapper.readTree(jsonContent);
        AdapterContractInfo contract = new AdapterContractInfo();

        // Champs obligatoires
        String adapterName = getTextOrThrow(root, "adapter_name", "Le champ 'adapter_name' est obligatoire");
        contract.setAdapterName(adapterName);

        String baseUrl = getTextOrThrow(root, "adapter_base_url", "Le champ 'adapter_base_url' est obligatoire");
        contract.setAdapterBaseUrl(baseUrl);

        // Champs optionnels
        contract.setDescription(getTextOrDefault(root, "description", "Adapter " + adapterName));
        contract.setVersion(getTextOrDefault(root, "version", "1.0.0"));

        // Authentification
        JsonNode authNode = root.get("auth");
        if (authNode != null && !authNode.isNull()) {
            contract.setAuth(parseAuth(authNode));
        }

        // Endpoints
        JsonNode endpointsNode = root.get("endpoints");
        if (endpointsNode == null || !endpointsNode.isArray() || endpointsNode.isEmpty()) {
            throw new IOException("Le contrat doit contenir au moins un endpoint dans 'endpoints'");
        }

        List<EndpointInfo> endpoints = new ArrayList<>();
        for (JsonNode epNode : endpointsNode) {
            endpoints.add(parseEndpoint(epNode, adapterName));
        }
        contract.setEndpoints(endpoints);

        log.info("[AdapterParser] Contrat parse : adapter={}, baseUrl={}, endpoints={}, auth={}",
                adapterName, baseUrl, endpoints.size(),
                contract.hasAuth() ? contract.getAuth().getType() : "none");

        return contract;
    }

    /**
     * Valide un contrat parse et retourne les erreurs eventuelles.
     *
     * @param contract le contrat a valider
     * @return liste des erreurs (vide si valide)
     */
    public List<String> validate(AdapterContractInfo contract) {
        List<String> errors = new ArrayList<>();

        if (contract.getAdapterName() == null || contract.getAdapterName().isBlank()) {
            errors.add("adapter_name est obligatoire");
        }
        if (contract.getAdapterBaseUrl() == null || contract.getAdapterBaseUrl().isBlank()) {
            errors.add("adapter_base_url est obligatoire");
        }
        if (contract.getEndpoints() == null || contract.getEndpoints().isEmpty()) {
            errors.add("Au moins un endpoint est requis");
        }

        if (contract.getEndpoints() != null) {
            for (int i = 0; i < contract.getEndpoints().size(); i++) {
                EndpointInfo ep = contract.getEndpoints().get(i);
                String prefix = "endpoints[" + i + "]";
                if (ep.getOperation() == null || ep.getOperation().isBlank()) {
                    errors.add(prefix + ".operation est obligatoire");
                }
                if (ep.getMethod() == null || ep.getMethod().isBlank()) {
                    errors.add(prefix + ".method est obligatoire");
                } else {
                    String m = ep.getMethod().toUpperCase();
                    if (!List.of("GET", "POST", "PUT", "DELETE", "PATCH").contains(m)) {
                        errors.add(prefix + ".method doit etre GET, POST, PUT, DELETE ou PATCH");
                    }
                }
                if (ep.getPath() == null || ep.getPath().isBlank()) {
                    errors.add(prefix + ".path est obligatoire");
                }
                // GET/DELETE ne doivent pas avoir de request_fields
                if (ep.getMethod() != null && !ep.hasRequestBody() && ep.getRequestFields() != null && !ep.getRequestFields().isEmpty()) {
                    errors.add(prefix + " : les methodes " + ep.getMethod() + " ne doivent pas avoir de request_fields (utiliser query_params)");
                }
            }
        }

        // Validation auth
        if (contract.hasAuth()) {
            AuthConfig auth = contract.getAuth();
            if (auth.isApiKey()) {
                if (auth.getApiKeyHeader() == null || auth.getApiKeyHeader().isBlank()) {
                    errors.add("auth.api_key_header est obligatoire pour le type api_key");
                }
            }
            if (auth.isOauth2()) {
                if (auth.getOauth2TokenUrl() == null || auth.getOauth2TokenUrl().isBlank()) {
                    errors.add("auth.oauth2_token_url est obligatoire pour le type oauth2");
                }
            }
            if (auth.isMtls()) {
                if (auth.getMtlsKeystorePath() == null || auth.getMtlsKeystorePath().isBlank()) {
                    errors.add("auth.mtls_keystore_path est obligatoire pour le type mtls");
                }
            }
        }

        return errors;
    }

    // ===================== PRIVATE HELPERS =====================

    private AuthConfig parseAuth(JsonNode node) {
        AuthConfig auth = new AuthConfig();
        auth.setType(getTextOrDefault(node, "type", "none"));

        // API Key
        auth.setApiKeyHeader(getTextOrDefault(node, "api_key_header", "X-API-Key"));
        auth.setApiKeyValue(getTextOrDefault(node, "api_key_value", "${ADAPTER_API_KEY}"));

        // Bearer
        auth.setBearerToken(getTextOrDefault(node, "bearer_token", "${ADAPTER_TOKEN}"));

        // OAuth2
        auth.setOauth2TokenUrl(getTextOrDefault(node, "oauth2_token_url", null));
        auth.setOauth2ClientId(getTextOrDefault(node, "oauth2_client_id", "${OAUTH2_CLIENT_ID}"));
        auth.setOauth2ClientSecret(getTextOrDefault(node, "oauth2_client_secret", "${OAUTH2_CLIENT_SECRET}"));
        auth.setOauth2Scope(getTextOrDefault(node, "oauth2_scope", ""));

        // Basic
        auth.setBasicUsername(getTextOrDefault(node, "basic_username", "${ADAPTER_USERNAME}"));
        auth.setBasicPassword(getTextOrDefault(node, "basic_password", "${ADAPTER_PASSWORD}"));

        // mTLS
        auth.setMtlsKeystorePath(getTextOrDefault(node, "mtls_keystore_path", null));
        auth.setMtlsKeystorePassword(getTextOrDefault(node, "mtls_keystore_password", "${KEYSTORE_PASSWORD}"));
        auth.setMtlsTruststorePath(getTextOrDefault(node, "mtls_truststore_path", null));
        auth.setMtlsTruststorePassword(getTextOrDefault(node, "mtls_truststore_password", "${TRUSTSTORE_PASSWORD}"));

        log.debug("[AdapterParser] Auth parse : type={}", auth.getType());
        return auth;
    }

    private EndpointInfo parseEndpoint(JsonNode node, String adapterName) throws IOException {
        EndpointInfo ep = new EndpointInfo();

        ep.setOperation(getTextOrThrow(node, "operation",
                "Chaque endpoint doit avoir un champ 'operation'"));
        ep.setMethod(getTextOrDefault(node, "method", "POST").toUpperCase());
        ep.setPath(getTextOrDefault(node, "path", "/" + adapterName.toLowerCase() + "/" + ep.getOperation()));
        ep.setSummary(getTextOrDefault(node, "summary", "Operation " + ep.getOperation()));
        ep.setIdempotent(getBoolOrDefault(node, "idempotent", false));
        ep.setPaginated(getBoolOrDefault(node, "paginated", false));
        ep.setTimeoutSeconds(getIntOrDefault(node, "timeout_seconds", 30));
        ep.setMaxRetries(getIntOrDefault(node, "max_retries", 3));

        // Path parameters
        JsonNode pathParams = node.get("path_params");
        if (pathParams != null && pathParams.isArray()) {
            for (JsonNode paramNode : pathParams) {
                ep.getPathParams().add(parseParam(paramNode, true));
            }
        }

        // Query parameters
        JsonNode queryParams = node.get("query_params");
        if (queryParams != null && queryParams.isArray()) {
            for (JsonNode paramNode : queryParams) {
                ep.getQueryParams().add(parseParam(paramNode, false));
            }
        }

        // Custom headers
        JsonNode headers = node.get("headers");
        if (headers != null && headers.isArray()) {
            for (JsonNode headerNode : headers) {
                ep.getHeaders().add(parseHeader(headerNode));
            }
        }

        // Request fields (POST, PUT, PATCH only)
        JsonNode reqFields = node.get("request_fields");
        if (reqFields != null && reqFields.isArray()) {
            for (JsonNode fieldNode : reqFields) {
                ep.getRequestFields().add(parseField(fieldNode));
            }
        }

        // Response fields
        JsonNode resFields = node.get("response_fields");
        if (resFields != null && resFields.isArray()) {
            for (JsonNode fieldNode : resFields) {
                ep.getResponseFields().add(parseField(fieldNode));
            }
        }

        log.debug("[AdapterParser] Endpoint parse : {} {} {} (idempotent={}, paginated={}, timeout={}s, retries={}, pathParams={}, queryParams={}, headers={})",
                ep.getMethod(), ep.getPath(), ep.getOperation(),
                ep.isIdempotent(), ep.isPaginated(), ep.getTimeoutSeconds(), ep.getMaxRetries(),
                ep.getPathParams().size(), ep.getQueryParams().size(), ep.getHeaders().size());

        return ep;
    }

    private ParamInfo parseParam(JsonNode node, boolean defaultRequired) {
        ParamInfo param = new ParamInfo();
        param.setName(getTextOrDefault(node, "name", "unknown"));
        param.setType(getTextOrDefault(node, "type", "String"));
        param.setRequired(getBoolOrDefault(node, "required", defaultRequired));
        param.setDescription(getTextOrDefault(node, "description", ""));
        param.setDefaultValue(getTextOrDefault(node, "default_value", null));
        return param;
    }

    private HeaderInfo parseHeader(JsonNode node) {
        HeaderInfo header = new HeaderInfo();
        header.setName(getTextOrDefault(node, "name", "X-Custom"));
        header.setValue(getTextOrDefault(node, "value", ""));
        header.setDescription(getTextOrDefault(node, "description", ""));
        return header;
    }

    private FieldInfo parseField(JsonNode node) {
        FieldInfo field = new FieldInfo();
        field.setName(getTextOrDefault(node, "name", "unknown"));
        field.setType(getTextOrDefault(node, "type", "String"));
        field.setRequired(getBoolOrDefault(node, "required", false));
        field.setDescription(getTextOrDefault(node, "description", ""));
        field.setDefaultValue(getTextOrDefault(node, "default_value", null));
        field.setFormat(getTextOrDefault(node, "format", null));
        return field;
    }

    private String getTextOrThrow(JsonNode node, String field, String errorMessage) throws IOException {
        JsonNode child = node.get(field);
        if (child == null || child.isNull() || child.asText().isBlank()) {
            throw new IOException(errorMessage);
        }
        return child.asText().trim();
    }

    private String getTextOrDefault(JsonNode node, String field, String defaultValue) {
        JsonNode child = node.get(field);
        if (child == null || child.isNull() || child.asText().isBlank()) {
            return defaultValue;
        }
        return child.asText().trim();
    }

    private boolean getBoolOrDefault(JsonNode node, String field, boolean defaultValue) {
        JsonNode child = node.get(field);
        if (child == null || child.isNull()) return defaultValue;
        return child.asBoolean(defaultValue);
    }

    private int getIntOrDefault(JsonNode node, String field, int defaultValue) {
        JsonNode child = node.get(field);
        if (child == null || child.isNull()) return defaultValue;
        return child.asInt(defaultValue);
    }
}
