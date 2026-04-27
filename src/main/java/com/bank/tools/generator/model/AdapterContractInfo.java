package com.bank.tools.generator.model;

import java.util.*;

/**
 * Modele representant un contrat JSON normalise d'un Adapter WebSphere ou de toute API REST.
 *
 * <p>Ce modele est l'input du pipeline "Adapter Contract → Wrapper BIAN".
 * Il decrit les endpoints exposes par un adapter WebSphere, une API partenaire,
 * un microservice ou tout service REST.</p>
 *
 * <p>Format JSON attendu :</p>
 * <pre>
 * {
 *   "adapter_name": "CommandChequier",
 *   "adapter_base_url": "http://websphere:9080/api/adapter",
 *   "description": "Adapter pour la commande de chequiers",
 *   "version": "1.0.0",
 *   "auth": {
 *     "type": "api_key",
 *     "api_key_header": "X-API-Key",
 *     "api_key_value": "${ADAPTER_API_KEY}"
 *   },
 *   "endpoints": [
 *     {
 *       "operation": "enrg_commande",
 *       "method": "POST",
 *       "path": "/command-chequier/enrg-commande",
 *       "summary": "Enregistrer une commande de chequier",
 *       "idempotent": true,
 *       "timeout_seconds": 30,
 *       "max_retries": 3,
 *       "paginated": false,
 *       "path_params": [
 *         { "name": "accountId", "type": "String", "description": "Identifiant du compte" }
 *       ],
 *       "query_params": [
 *         { "name": "status", "type": "String", "required": false, "description": "Filtre par statut" }
 *       ],
 *       "headers": [
 *         { "name": "X-Channel", "value": "MOBILE", "description": "Canal d'origine" }
 *       ],
 *       "request_fields": [
 *         { "name": "numeroCarte", "type": "String", "required": true, "description": "Numero de carte" }
 *       ],
 *       "response_fields": [
 *         { "name": "code", "type": "String", "description": "Code retour" }
 *       ]
 *     }
 *   ]
 * }
 * </pre>
 *
 * @see com.bank.tools.generator.parser.AdapterContractParser
 * @see com.bank.tools.generator.engine.AdapterWrapperGenerator
 */
public class AdapterContractInfo {

    private String adapterName;         // ex: "CommandChequier"
    private String adapterBaseUrl;      // ex: "http://websphere:9080/api/adapter"
    private String description;         // ex: "Adapter pour la commande de chequiers"
    private String version;             // ex: "1.0.0"
    private AuthConfig auth;            // Configuration d'authentification
    private List<EndpointInfo> endpoints = new ArrayList<>();

    // ===================== AUTH CONFIG =====================

    /**
     * Configuration d'authentification pour l'adapter.
     *
     * <p>Types supportes :</p>
     * <ul>
     *   <li><b>none</b> : pas d'authentification</li>
     *   <li><b>api_key</b> : cle API dans un header (ex: X-API-Key)</li>
     *   <li><b>bearer</b> : token Bearer statique ou dynamique</li>
     *   <li><b>oauth2</b> : OAuth2 Client Credentials flow</li>
     *   <li><b>basic</b> : HTTP Basic Authentication</li>
     *   <li><b>mtls</b> : Mutual TLS (certificat client)</li>
     * </ul>
     */
    public static class AuthConfig {
        private String type = "none";           // none, api_key, bearer, oauth2, basic, mtls

        // API Key
        private String apiKeyHeader;            // ex: "X-API-Key"
        private String apiKeyValue;             // ex: "${ADAPTER_API_KEY}"

        // Bearer Token
        private String bearerToken;             // token statique ou "${ADAPTER_TOKEN}"

        // OAuth2 Client Credentials
        private String oauth2TokenUrl;          // ex: "https://auth.bank.ma/oauth2/token"
        private String oauth2ClientId;          // ex: "${OAUTH2_CLIENT_ID}"
        private String oauth2ClientSecret;      // ex: "${OAUTH2_CLIENT_SECRET}"
        private String oauth2Scope;             // ex: "adapter.read adapter.write"

        // Basic Auth
        private String basicUsername;           // ex: "${ADAPTER_USERNAME}"
        private String basicPassword;           // ex: "${ADAPTER_PASSWORD}"

        // mTLS
        private String mtlsKeystorePath;        // ex: "/etc/ssl/keystore.p12"
        private String mtlsKeystorePassword;    // ex: "${KEYSTORE_PASSWORD}"
        private String mtlsTruststorePath;      // ex: "/etc/ssl/truststore.p12"
        private String mtlsTruststorePassword;  // ex: "${TRUSTSTORE_PASSWORD}"

        // Getters & Setters
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public String getApiKeyHeader() { return apiKeyHeader; }
        public void setApiKeyHeader(String apiKeyHeader) { this.apiKeyHeader = apiKeyHeader; }
        public String getApiKeyValue() { return apiKeyValue; }
        public void setApiKeyValue(String apiKeyValue) { this.apiKeyValue = apiKeyValue; }
        public String getBearerToken() { return bearerToken; }
        public void setBearerToken(String bearerToken) { this.bearerToken = bearerToken; }
        public String getOauth2TokenUrl() { return oauth2TokenUrl; }
        public void setOauth2TokenUrl(String oauth2TokenUrl) { this.oauth2TokenUrl = oauth2TokenUrl; }
        public String getOauth2ClientId() { return oauth2ClientId; }
        public void setOauth2ClientId(String oauth2ClientId) { this.oauth2ClientId = oauth2ClientId; }
        public String getOauth2ClientSecret() { return oauth2ClientSecret; }
        public void setOauth2ClientSecret(String oauth2ClientSecret) { this.oauth2ClientSecret = oauth2ClientSecret; }
        public String getOauth2Scope() { return oauth2Scope; }
        public void setOauth2Scope(String oauth2Scope) { this.oauth2Scope = oauth2Scope; }
        public String getBasicUsername() { return basicUsername; }
        public void setBasicUsername(String basicUsername) { this.basicUsername = basicUsername; }
        public String getBasicPassword() { return basicPassword; }
        public void setBasicPassword(String basicPassword) { this.basicPassword = basicPassword; }
        public String getMtlsKeystorePath() { return mtlsKeystorePath; }
        public void setMtlsKeystorePath(String mtlsKeystorePath) { this.mtlsKeystorePath = mtlsKeystorePath; }
        public String getMtlsKeystorePassword() { return mtlsKeystorePassword; }
        public void setMtlsKeystorePassword(String mtlsKeystorePassword) { this.mtlsKeystorePassword = mtlsKeystorePassword; }
        public String getMtlsTruststorePath() { return mtlsTruststorePath; }
        public void setMtlsTruststorePath(String mtlsTruststorePath) { this.mtlsTruststorePath = mtlsTruststorePath; }
        public String getMtlsTruststorePassword() { return mtlsTruststorePassword; }
        public void setMtlsTruststorePassword(String mtlsTruststorePassword) { this.mtlsTruststorePassword = mtlsTruststorePassword; }

        public boolean isNone() { return type == null || "none".equalsIgnoreCase(type); }
        public boolean isApiKey() { return "api_key".equalsIgnoreCase(type); }
        public boolean isBearer() { return "bearer".equalsIgnoreCase(type); }
        public boolean isOauth2() { return "oauth2".equalsIgnoreCase(type); }
        public boolean isBasic() { return "basic".equalsIgnoreCase(type); }
        public boolean isMtls() { return "mtls".equalsIgnoreCase(type); }
    }

    // ===================== ENDPOINT =====================

    public static class EndpointInfo {
        private String operation;           // ex: "enrg_commande"
        private String method;              // GET, POST, PUT, DELETE, PATCH
        private String path;                // ex: "/command-chequier/enrg-commande"
        private String summary;             // description courte
        private boolean idempotent;         // true = activer la cle d'idempotence
        private boolean paginated;          // true = ajouter les parametres de pagination BIAN
        private int timeoutSeconds = 30;    // timeout par defaut
        private int maxRetries = 3;         // nombre de retries
        private List<FieldInfo> requestFields = new ArrayList<>();
        private List<FieldInfo> responseFields = new ArrayList<>();
        private List<ParamInfo> pathParams = new ArrayList<>();
        private List<ParamInfo> queryParams = new ArrayList<>();
        private List<HeaderInfo> headers = new ArrayList<>();

        // Getters & Setters
        public String getOperation() { return operation; }
        public void setOperation(String operation) { this.operation = operation; }
        public String getMethod() { return method; }
        public void setMethod(String method) { this.method = method; }
        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }
        public String getSummary() { return summary; }
        public void setSummary(String summary) { this.summary = summary; }
        public boolean isIdempotent() { return idempotent; }
        public void setIdempotent(boolean idempotent) { this.idempotent = idempotent; }
        public boolean isPaginated() { return paginated; }
        public void setPaginated(boolean paginated) { this.paginated = paginated; }
        public int getTimeoutSeconds() { return timeoutSeconds; }
        public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
        public int getMaxRetries() { return maxRetries; }
        public void setMaxRetries(int maxRetries) { this.maxRetries = maxRetries; }
        public List<FieldInfo> getRequestFields() { return requestFields; }
        public void setRequestFields(List<FieldInfo> requestFields) { this.requestFields = requestFields; }
        public List<FieldInfo> getResponseFields() { return responseFields; }
        public void setResponseFields(List<FieldInfo> responseFields) { this.responseFields = responseFields; }
        public List<ParamInfo> getPathParams() { return pathParams; }
        public void setPathParams(List<ParamInfo> pathParams) { this.pathParams = pathParams; }
        public List<ParamInfo> getQueryParams() { return queryParams; }
        public void setQueryParams(List<ParamInfo> queryParams) { this.queryParams = queryParams; }
        public List<HeaderInfo> getHeaders() { return headers; }
        public void setHeaders(List<HeaderInfo> headers) { this.headers = headers; }

        /**
         * Verifie si l'endpoint a un corps de requete (body).
         * GET et DELETE n'ont generalement pas de body.
         */
        public boolean hasRequestBody() {
            if (method == null) return true;
            String m = method.toUpperCase();
            return "POST".equals(m) || "PUT".equals(m) || "PATCH".equals(m);
        }

        /**
         * Retourne l'annotation Spring correspondant a la methode HTTP.
         */
        public String toSpringAnnotation() {
            if (method == null) return "@PostMapping";
            return switch (method.toUpperCase()) {
                case "GET" -> "@GetMapping";
                case "PUT" -> "@PutMapping";
                case "DELETE" -> "@DeleteMapping";
                case "PATCH" -> "@PatchMapping";
                default -> "@PostMapping";
            };
        }

        /**
         * Retourne la methode RestTemplate correspondante.
         */
        public String toRestTemplateMethod() {
            if (method == null) return "postForEntity";
            return switch (method.toUpperCase()) {
                case "GET" -> "getForEntity";
                case "DELETE" -> "exchange";
                case "PUT" -> "exchange";
                case "PATCH" -> "exchange";
                default -> "postForEntity";
            };
        }

        /**
         * Derive un nom de methode Java a partir de l'operation.
         * Ex: "enrg_commande" → "enrgCommande"
         */
        public String toMethodName() {
            if (operation == null || operation.isBlank()) return "execute";
            String[] parts = operation.toLowerCase().split("[_\\-\\s]+");
            StringBuilder sb = new StringBuilder(parts[0]);
            for (int i = 1; i < parts.length; i++) {
                if (!parts[i].isEmpty()) {
                    sb.append(Character.toUpperCase(parts[i].charAt(0)));
                    sb.append(parts[i].substring(1));
                }
            }
            return sb.toString();
        }

        /**
         * Derive un nom de classe Request DTO.
         * Ex: "enrg_commande" → "EnrgCommandeRequest"
         */
        public String toRequestDtoName() {
            return capitalize(toMethodName()) + "Request";
        }

        /**
         * Derive un nom de classe Response DTO.
         * Ex: "enrg_commande" → "EnrgCommandeResponse"
         */
        public String toResponseDtoName() {
            return capitalize(toMethodName()) + "Response";
        }

        private String capitalize(String s) {
            if (s == null || s.isEmpty()) return s;
            return Character.toUpperCase(s.charAt(0)) + s.substring(1);
        }
    }

    // ===================== FIELD =====================

    public static class FieldInfo {
        private String name;            // ex: "numeroCarte"
        private String type;            // "String", "Integer", "Long", "Double", "Boolean", "BigDecimal", "LocalDate", "LocalDateTime"
        private boolean required;       // champ obligatoire
        private String description;     // description du champ
        private String defaultValue;    // valeur par defaut (optionnel)
        private String format;          // format additionnel (ex: "date", "date-time", "email", "iban")

        // Getters & Setters
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public boolean isRequired() { return required; }
        public void setRequired(boolean required) { this.required = required; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public String getDefaultValue() { return defaultValue; }
        public void setDefaultValue(String defaultValue) { this.defaultValue = defaultValue; }
        public String getFormat() { return format; }
        public void setFormat(String format) { this.format = format; }

        /**
         * Convertit le type JSON normalise en type Java.
         */
        public String toJavaType() {
            if (type == null) return "String";
            return switch (type.toLowerCase()) {
                case "string" -> "String";
                case "integer", "int" -> "Integer";
                case "long" -> "Long";
                case "double", "number" -> "Double";
                case "boolean", "bool" -> "Boolean";
                case "bigdecimal", "decimal" -> "java.math.BigDecimal";
                case "localdate", "date" -> "java.time.LocalDate";
                case "localdatetime", "datetime", "date-time" -> "java.time.LocalDateTime";
                default -> "String";
            };
        }
    }

    // ===================== PARAM (path / query) =====================

    /**
     * Represente un parametre de chemin (path) ou de requete (query).
     */
    public static class ParamInfo {
        private String name;            // ex: "accountId"
        private String type;            // "String", "Integer", "Long"
        private boolean required;       // obligatoire (true par defaut pour path params)
        private String description;     // description du parametre
        private String defaultValue;    // valeur par defaut (query params uniquement)

        // Getters & Setters
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public boolean isRequired() { return required; }
        public void setRequired(boolean required) { this.required = required; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public String getDefaultValue() { return defaultValue; }
        public void setDefaultValue(String defaultValue) { this.defaultValue = defaultValue; }

        /**
         * Convertit le type en type Java.
         */
        public String toJavaType() {
            if (type == null) return "String";
            return switch (type.toLowerCase()) {
                case "integer", "int" -> "Integer";
                case "long" -> "Long";
                case "boolean", "bool" -> "Boolean";
                default -> "String";
            };
        }
    }

    // ===================== HEADER =====================

    /**
     * Represente un header HTTP personnalise a ajouter aux appels vers l'adapter.
     */
    public static class HeaderInfo {
        private String name;            // ex: "X-Channel"
        private String value;           // ex: "MOBILE" ou "${CHANNEL_HEADER}"
        private String description;     // description du header

        // Getters & Setters
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getValue() { return value; }
        public void setValue(String value) { this.value = value; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }

    // ===================== MAIN GETTERS & SETTERS =====================

    public String getAdapterName() { return adapterName; }
    public void setAdapterName(String adapterName) { this.adapterName = adapterName; }
    public String getAdapterBaseUrl() { return adapterBaseUrl; }
    public void setAdapterBaseUrl(String adapterBaseUrl) { this.adapterBaseUrl = adapterBaseUrl; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public AuthConfig getAuth() { return auth; }
    public void setAuth(AuthConfig auth) { this.auth = auth; }
    public List<EndpointInfo> getEndpoints() { return endpoints; }
    public void setEndpoints(List<EndpointInfo> endpoints) { this.endpoints = endpoints; }

    /**
     * Verifie si l'adapter a une configuration d'authentification.
     */
    public boolean hasAuth() {
        return auth != null && !auth.isNone();
    }

    /**
     * Derive le nom du service domain BIAN a partir du nom de l'adapter.
     * Ex: "CommandChequier" → "command-chequier"
     */
    public String toKebabCase() {
        if (adapterName == null) return "unknown";
        return adapterName
                .replaceAll("([a-z])([A-Z])", "$1-$2")
                .replaceAll("[_\\s]+", "-")
                .toLowerCase();
    }

    /**
     * Derive le nom du controller.
     * Ex: "CommandChequier" → "CommandChequierController"
     */
    public String toControllerName() {
        if (adapterName == null) return "DefaultController";
        String clean = adapterName.replaceAll("[^a-zA-Z0-9]", "");
        return clean.substring(0, 1).toUpperCase() + clean.substring(1) + "Controller";
    }

    /**
     * Derive le nom de l'interface service.
     * Ex: "CommandChequier" → "CommandChequierService"
     */
    public String toServiceName() {
        if (adapterName == null) return "DefaultService";
        String clean = adapterName.replaceAll("[^a-zA-Z0-9]", "");
        return clean.substring(0, 1).toUpperCase() + clean.substring(1) + "Service";
    }
}
