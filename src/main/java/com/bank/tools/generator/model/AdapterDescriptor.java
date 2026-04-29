package com.bank.tools.generator.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Descripteur d'un adapter backend REST, alimente par le contrat JSON.
 * Stocke les metadonnees de l'adapter (URL, auth, resilience) et les endpoints backend.
 *
 * <p>Ce descripteur est attache au {@link ProjectAnalysisResult} quand le mode
 * d'entree est {@link InputMode#JSON_ADAPTER}. Il est utilise par le generateur
 * pour produire le RestAdapter et la configuration Resilience4j.</p>
 */
public class AdapterDescriptor {

    // ==================== ADAPTER METADATA ====================

    private String adapterName;
    private String adapterBaseUrl;
    private String description;
    private String version;

    // ==================== AUTH ====================

    private AuthConfig auth;

    // ==================== BACKEND ENDPOINTS ====================

    private List<BackendEndpoint> backendEndpoints = new ArrayList<>();

    // ==================== GETTERS/SETTERS ====================

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

    public List<BackendEndpoint> getBackendEndpoints() { return backendEndpoints; }
    public void setBackendEndpoints(List<BackendEndpoint> backendEndpoints) { this.backendEndpoints = backendEndpoints; }

    // ==================== INNER CLASS: AuthConfig ====================

    /**
     * Configuration d'authentification vers l'adapter backend.
     */
    public static class AuthConfig {
        private String type; // api_key, bearer, oauth2, basic, mtls
        private String headerName;
        private String headerValue;
        private String tokenUrl;
        private String clientId;
        private String clientSecret;
        private String username;
        private String password;
        private String keystorePath;
        private String keystorePassword;

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getHeaderName() { return headerName; }
        public void setHeaderName(String headerName) { this.headerName = headerName; }

        public String getHeaderValue() { return headerValue; }
        public void setHeaderValue(String headerValue) { this.headerValue = headerValue; }

        public String getTokenUrl() { return tokenUrl; }
        public void setTokenUrl(String tokenUrl) { this.tokenUrl = tokenUrl; }

        public String getClientId() { return clientId; }
        public void setClientId(String clientId) { this.clientId = clientId; }

        public String getClientSecret() { return clientSecret; }
        public void setClientSecret(String clientSecret) { this.clientSecret = clientSecret; }

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }

        public String getKeystorePath() { return keystorePath; }
        public void setKeystorePath(String keystorePath) { this.keystorePath = keystorePath; }

        public String getKeystorePassword() { return keystorePassword; }
        public void setKeystorePassword(String keystorePassword) { this.keystorePassword = keystorePassword; }
    }

    // ==================== INNER CLASS: BackendEndpoint ====================

    /**
     * Endpoint backend de l'adapter REST.
     * Contient la methode HTTP, le path, les parametres et la configuration de resilience.
     */
    public static class BackendEndpoint {
        private String operation;
        private String httpMethod;
        private String path;
        private boolean idempotent;
        private int timeoutSeconds = 30;
        private int maxRetries = 3;
        private boolean paginated;
        private List<FieldInfo> requestFields = new ArrayList<>();
        private List<FieldInfo> responseFields = new ArrayList<>();
        private List<ParamInfo> pathParams = new ArrayList<>();
        private List<ParamInfo> queryParams = new ArrayList<>();
        private List<HeaderInfo> headers = new ArrayList<>();

        public String getOperation() { return operation; }
        public void setOperation(String operation) { this.operation = operation; }

        public String getHttpMethod() { return httpMethod; }
        public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }

        public boolean isIdempotent() { return idempotent; }
        public void setIdempotent(boolean idempotent) { this.idempotent = idempotent; }

        public int getTimeoutSeconds() { return timeoutSeconds; }
        public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }

        public int getMaxRetries() { return maxRetries; }
        public void setMaxRetries(int maxRetries) { this.maxRetries = maxRetries; }

        public boolean isPaginated() { return paginated; }
        public void setPaginated(boolean paginated) { this.paginated = paginated; }

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

        /** Nom PascalCase derive de l'operation (ex: enrg_commande -> EnrgCommande) */
        public String toPascalCase() {
            if (operation == null) return "";
            StringBuilder sb = new StringBuilder();
            for (String part : operation.split("[_\\-]")) {
                if (!part.isEmpty()) {
                    sb.append(Character.toUpperCase(part.charAt(0)));
                    if (part.length() > 1) sb.append(part.substring(1).toLowerCase());
                }
            }
            return sb.toString();
        }

        /** Nom camelCase derive de l'operation (ex: enrg_commande -> enrgCommande) */
        public String toCamelCase() {
            String pascal = toPascalCase();
            if (pascal.isEmpty()) return "";
            return Character.toLowerCase(pascal.charAt(0)) + pascal.substring(1);
        }
    }

    // ==================== INNER CLASS: FieldInfo ====================

    public static class FieldInfo {
        private String name;
        private String type;
        private boolean required;
        private String description;

        public FieldInfo() {}

        public FieldInfo(String name, String type, boolean required) {
            this.name = name;
            this.type = type;
            this.required = required;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public boolean isRequired() { return required; }
        public void setRequired(boolean required) { this.required = required; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }

        /** Retourne le type Java correspondant */
        public String toJavaType() {
            if (type == null) return "String";
            return switch (type.toLowerCase()) {
                case "int", "integer" -> "Integer";
                case "long" -> "Long";
                case "double", "float", "decimal" -> "BigDecimal";
                case "boolean", "bool" -> "Boolean";
                case "date" -> "LocalDate";
                case "datetime" -> "LocalDateTime";
                default -> "String";
            };
        }
    }

    // ==================== INNER CLASS: ParamInfo ====================

    public static class ParamInfo {
        private String name;
        private String type;
        private boolean required;

        public ParamInfo() {}

        public ParamInfo(String name, String type, boolean required) {
            this.name = name;
            this.type = type;
            this.required = required;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public boolean isRequired() { return required; }
        public void setRequired(boolean required) { this.required = required; }

        public String toJavaType() {
            if (type == null) return "String";
            return switch (type.toLowerCase()) {
                case "int", "integer" -> "Integer";
                case "long" -> "Long";
                default -> "String";
            };
        }
    }

    // ==================== INNER CLASS: HeaderInfo ====================

    public static class HeaderInfo {
        private String name;
        private String defaultValue;

        public HeaderInfo() {}

        public HeaderInfo(String name, String defaultValue) {
            this.name = name;
            this.defaultValue = defaultValue;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getDefaultValue() { return defaultValue; }
        public void setDefaultValue(String defaultValue) { this.defaultValue = defaultValue; }
    }
}
