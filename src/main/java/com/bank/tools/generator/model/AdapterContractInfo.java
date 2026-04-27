package com.bank.tools.generator.model;

import java.util.*;

/**
 * Modele representant un contrat JSON normalise d'un Adapter WebSphere.
 *
 * <p>Ce modele est l'input du pipeline "Adapter Contract → Wrapper BIAN".
 * Il decrit les endpoints exposes par un adapter WebSphere qui communique
 * avec un EJB legacy sur le Core Banking (eGB).</p>
 *
 * <p>Format JSON attendu :</p>
 * <pre>
 * {
 *   "adapter_name": "CommandChequier",
 *   "adapter_base_url": "http://websphere:9080/api/adapter",
 *   "description": "Adapter pour la commande de chequiers",
 *   "version": "1.0.0",
 *   "endpoints": [
 *     {
 *       "operation": "enrg_commande",
 *       "method": "POST",
 *       "path": "/command-chequier/enrg-commande",
 *       "summary": "Enregistrer une commande de chequier",
 *       "idempotent": true,
 *       "timeout_seconds": 30,
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
    private List<EndpointInfo> endpoints = new ArrayList<>();

    // ===================== ENDPOINT =====================

    public static class EndpointInfo {
        private String operation;           // ex: "enrg_commande"
        private String method;              // GET, POST, PUT, DELETE
        private String path;                // ex: "/command-chequier/enrg-commande"
        private String summary;             // description courte
        private boolean idempotent;         // true = activer la cle d'idempotence
        private int timeoutSeconds = 30;    // timeout par defaut
        private int maxRetries = 3;         // nombre de retries
        private List<FieldInfo> requestFields = new ArrayList<>();
        private List<FieldInfo> responseFields = new ArrayList<>();

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
        public int getTimeoutSeconds() { return timeoutSeconds; }
        public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
        public int getMaxRetries() { return maxRetries; }
        public void setMaxRetries(int maxRetries) { this.maxRetries = maxRetries; }
        public List<FieldInfo> getRequestFields() { return requestFields; }
        public void setRequestFields(List<FieldInfo> requestFields) { this.requestFields = requestFields; }
        public List<FieldInfo> getResponseFields() { return responseFields; }
        public void setResponseFields(List<FieldInfo> responseFields) { this.responseFields = responseFields; }

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

    // ===================== MAIN GETTERS & SETTERS =====================

    public String getAdapterName() { return adapterName; }
    public void setAdapterName(String adapterName) { this.adapterName = adapterName; }
    public String getAdapterBaseUrl() { return adapterBaseUrl; }
    public void setAdapterBaseUrl(String adapterBaseUrl) { this.adapterBaseUrl = adapterBaseUrl; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public List<EndpointInfo> getEndpoints() { return endpoints; }
    public void setEndpoints(List<EndpointInfo> endpoints) { this.endpoints = endpoints; }

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
