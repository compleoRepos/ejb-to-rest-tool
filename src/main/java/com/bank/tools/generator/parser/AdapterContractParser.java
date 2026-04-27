package com.bank.tools.generator.parser;

import com.bank.tools.generator.model.AdapterContractInfo;
import com.bank.tools.generator.model.AdapterContractInfo.EndpointInfo;
import com.bank.tools.generator.model.AdapterContractInfo.FieldInfo;
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
 * Parser de contrats JSON normalises d'Adapters WebSphere.
 *
 * <p>Lit un fichier JSON decrivant le contrat d'un adapter WebSphere
 * et produit un {@link AdapterContractInfo} utilisable par le generateur.</p>
 *
 * <p>Le format JSON attendu est documente dans {@link AdapterContractInfo}.</p>
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

        log.info("[AdapterParser] Contrat parse : adapter={}, baseUrl={}, endpoints={}",
                adapterName, baseUrl, endpoints.size());

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
                }
                if (ep.getPath() == null || ep.getPath().isBlank()) {
                    errors.add(prefix + ".path est obligatoire");
                }
            }
        }

        return errors;
    }

    // ===================== PRIVATE HELPERS =====================

    private EndpointInfo parseEndpoint(JsonNode node, String adapterName) throws IOException {
        EndpointInfo ep = new EndpointInfo();

        ep.setOperation(getTextOrThrow(node, "operation",
                "Chaque endpoint doit avoir un champ 'operation'"));
        ep.setMethod(getTextOrDefault(node, "method", "POST").toUpperCase());
        ep.setPath(getTextOrDefault(node, "path", "/" + adapterName.toLowerCase() + "/" + ep.getOperation()));
        ep.setSummary(getTextOrDefault(node, "summary", "Operation " + ep.getOperation()));
        ep.setIdempotent(getBoolOrDefault(node, "idempotent", false));
        ep.setTimeoutSeconds(getIntOrDefault(node, "timeout_seconds", 30));
        ep.setMaxRetries(getIntOrDefault(node, "max_retries", 3));

        // Request fields
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

        log.debug("[AdapterParser] Endpoint parse : {} {} {} (idempotent={}, timeout={}s, retries={})",
                ep.getMethod(), ep.getPath(), ep.getOperation(),
                ep.isIdempotent(), ep.getTimeoutSeconds(), ep.getMaxRetries());

        return ep;
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
