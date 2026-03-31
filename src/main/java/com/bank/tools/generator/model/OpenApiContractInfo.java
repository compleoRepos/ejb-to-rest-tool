package com.bank.tools.generator.model;

import java.util.*;

/**
 * Modele representant un contrat OpenAPI/Swagger parse.
 * Contient les informations necessaires pour generer un client REST Feign/WebClient.
 */
public class OpenApiContractInfo {

    private String title;
    private String version;
    private String description;
    private String baseUrl;
    private String partnerName;       // ex: "MAGIX", "CMI", "DamanCash"
    private List<EndpointInfo> endpoints = new ArrayList<>();
    private List<SchemaInfo> schemas = new ArrayList<>();

    // ===================== ENDPOINT =====================

    public static class EndpointInfo {
        private String path;              // ex: "/cards/activate"
        private String httpMethod;        // GET, POST, PUT, DELETE
        private String operationId;       // ex: "activateCard"
        private String summary;
        private String description;
        private String requestBodySchema; // nom du schema de requete
        private String responseSchema;    // nom du schema de reponse
        private List<ParameterInfo> parameters = new ArrayList<>();
        private List<String> tags = new ArrayList<>();

        // Getters & Setters
        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }
        public String getHttpMethod() { return httpMethod; }
        public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }
        public String getOperationId() { return operationId; }
        public void setOperationId(String operationId) { this.operationId = operationId; }
        public String getSummary() { return summary; }
        public void setSummary(String summary) { this.summary = summary; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public String getRequestBodySchema() { return requestBodySchema; }
        public void setRequestBodySchema(String requestBodySchema) { this.requestBodySchema = requestBodySchema; }
        public String getResponseSchema() { return responseSchema; }
        public void setResponseSchema(String responseSchema) { this.responseSchema = responseSchema; }
        public List<ParameterInfo> getParameters() { return parameters; }
        public void setParameters(List<ParameterInfo> parameters) { this.parameters = parameters; }
        public List<String> getTags() { return tags; }
        public void setTags(List<String> tags) { this.tags = tags; }
    }

    // ===================== PARAMETER =====================

    public static class ParameterInfo {
        private String name;
        private String in;        // "path", "query", "header"
        private String type;      // "string", "integer", etc.
        private boolean required;
        private String description;

        // Getters & Setters
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getIn() { return in; }
        public void setIn(String in) { this.in = in; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public boolean isRequired() { return required; }
        public void setRequired(boolean required) { this.required = required; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }

    // ===================== SCHEMA (DTO) =====================

    public static class SchemaInfo {
        private String name;
        private String description;
        private List<FieldInfo> fields = new ArrayList<>();

        public static class FieldInfo {
            private String name;
            private String type;       // "string", "integer", "number", "boolean", "array", "object"
            private String format;     // "date-time", "date", "int64", etc.
            private String ref;        // reference a un autre schema
            private String itemsRef;   // pour les arrays, reference du type des elements
            private boolean required;
            private String description;

            // Getters & Setters
            public String getName() { return name; }
            public void setName(String name) { this.name = name; }
            public String getType() { return type; }
            public void setType(String type) { this.type = type; }
            public String getFormat() { return format; }
            public void setFormat(String format) { this.format = format; }
            public String getRef() { return ref; }
            public void setRef(String ref) { this.ref = ref; }
            public String getItemsRef() { return itemsRef; }
            public void setItemsRef(String itemsRef) { this.itemsRef = itemsRef; }
            public boolean isRequired() { return required; }
            public void setRequired(boolean required) { this.required = required; }
            public String getDescription() { return description; }
            public void setDescription(String description) { this.description = description; }
        }

        // Getters & Setters
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public List<FieldInfo> getFields() { return fields; }
        public void setFields(List<FieldInfo> fields) { this.fields = fields; }
    }

    // ===================== MAIN GETTERS & SETTERS =====================

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getPartnerName() { return partnerName; }
    public void setPartnerName(String partnerName) { this.partnerName = partnerName; }
    public List<EndpointInfo> getEndpoints() { return endpoints; }
    public void setEndpoints(List<EndpointInfo> endpoints) { this.endpoints = endpoints; }
    public List<SchemaInfo> getSchemas() { return schemas; }
    public void setSchemas(List<SchemaInfo> schemas) { this.schemas = schemas; }
}
