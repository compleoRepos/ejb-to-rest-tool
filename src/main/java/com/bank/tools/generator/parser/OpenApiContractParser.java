package com.bank.tools.generator.parser;

import com.bank.tools.generator.model.OpenApiContractInfo;
import com.bank.tools.generator.model.OpenApiContractInfo.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import com.bank.tools.generator.engine.util.CodeGenUtils;

/**
 * Parseur de contrats OpenAPI/Swagger (JSON).
 * Parse un fichier OpenAPI 3.x ou Swagger 2.x et extrait les endpoints,
 * parametres, schemas et metadonnees necessaires a la generation de clients REST.
 *
 * Note : Parseur JSON leger sans dependance externe (pas de Jackson/Gson requis).
 * Utilise un parsing regex/string pour rester autonome.
 */
@Component
public class OpenApiContractParser {

    private static final Logger log = LoggerFactory.getLogger(OpenApiContractParser.class);

    /**
     * Parse un fichier OpenAPI/Swagger et retourne le contrat structure.
     *
     * @param filePath chemin vers le fichier JSON OpenAPI
     * @param partnerName nom du partenaire (ex: "MAGIX", "CMI")
     * @return contrat parse
     */
    public OpenApiContractInfo parse(Path filePath, String partnerName) throws IOException {
        String content = Files.readString(filePath);
        log.info("[OpenAPI] Parsing du contrat : {} (partenaire: {})", filePath.getFileName(), partnerName);

        OpenApiContractInfo contract = new OpenApiContractInfo();
        contract.setPartnerName(partnerName);

        // Detecter la version OpenAPI
        boolean isOpenApi3 = content.contains("\"openapi\"") || content.contains("openapi:");
        boolean isSwagger2 = content.contains("\"swagger\"") || content.contains("swagger:");

        // Extraire les metadonnees
        contract.setTitle(extractJsonValue(content, "title"));
        contract.setVersion(extractJsonValue(content, "version"));
        contract.setDescription(extractJsonValue(content, "description"));

        // Extraire la base URL
        if (isOpenApi3) {
            String serverUrl = extractServerUrl(content);
            contract.setBaseUrl(serverUrl != null ? serverUrl : "https://" + partnerName.toLowerCase() + ".partner.api");
        } else if (isSwagger2) {
            String host = extractJsonValue(content, "host");
            String basePath = extractJsonValue(content, "basePath");
            contract.setBaseUrl("https://" + (host != null ? host : partnerName.toLowerCase() + ".api") +
                    (basePath != null ? basePath : ""));
        }

        // Extraire les paths (endpoints)
        List<EndpointInfo> endpoints = extractEndpoints(content);
        contract.setEndpoints(endpoints);

        // Extraire les schemas (DTOs)
        List<SchemaInfo> schemas = extractSchemas(content, isOpenApi3);
        contract.setSchemas(schemas);

        log.info("[OpenAPI] Contrat parse : {} endpoints, {} schemas",
                endpoints.size(), schemas.size());

        return contract;
    }

    // ===================== EXTRACTION DES ENDPOINTS =====================

    private List<EndpointInfo> extractEndpoints(String content) {
        List<EndpointInfo> endpoints = new ArrayList<>();

        // Pattern pour trouver les paths et methodes HTTP
        // Recherche des blocs "paths" dans le JSON
        int pathsStart = content.indexOf("\"paths\"");
        if (pathsStart == -1) return endpoints;

        int braceStart = content.indexOf("{", pathsStart);
        if (braceStart == -1) return endpoints;

        String pathsBlock = extractJsonBlock(content, braceStart);

        // Extraire chaque path
        Pattern pathPattern = Pattern.compile("\"(/[^\"]+)\"\\s*:\\s*\\{");
        Matcher pathMatcher = pathPattern.matcher(pathsBlock);

        while (pathMatcher.find()) {
            String path = pathMatcher.group(1);
            int methodBlockStart = pathMatcher.end() - 1;
            String methodBlock = extractJsonBlock(pathsBlock, methodBlockStart);

            // Extraire chaque methode HTTP pour ce path
            for (String method : new String[]{"get", "post", "put", "delete", "patch"}) {
                int methodStart = methodBlock.indexOf("\"" + method + "\"");
                if (methodStart == -1) continue;

                int opBlockStart = methodBlock.indexOf("{", methodStart);
                if (opBlockStart == -1) continue;

                String opBlock = extractJsonBlock(methodBlock, opBlockStart);

                EndpointInfo endpoint = new EndpointInfo();
                endpoint.setPath(path);
                endpoint.setHttpMethod(method.toUpperCase());
                endpoint.setOperationId(extractJsonValue(opBlock, "operationId"));
                endpoint.setSummary(extractJsonValue(opBlock, "summary"));
                endpoint.setDescription(extractJsonValue(opBlock, "description"));

                // Extraire les parametres
                endpoint.setParameters(extractParameters(opBlock));

                // Extraire le requestBody schema
                String requestBodyRef = extractRef(opBlock, "requestBody");
                if (requestBodyRef != null) {
                    endpoint.setRequestBodySchema(extractSchemaName(requestBodyRef));
                }

                // Extraire le response schema
                String responseRef = extractResponseRef(opBlock);
                if (responseRef != null) {
                    endpoint.setResponseSchema(extractSchemaName(responseRef));
                }

                // Extraire les tags
                endpoint.setTags(extractTags(opBlock));

                // Generer un operationId si absent
                if (endpoint.getOperationId() == null || endpoint.getOperationId().isEmpty()) {
                    endpoint.setOperationId(generateOperationId(method, path));
                }

                endpoints.add(endpoint);
                log.debug("[OpenAPI]   {} {} → operationId: {}",
                        endpoint.getHttpMethod(), endpoint.getPath(), endpoint.getOperationId());
            }
        }

        return endpoints;
    }

    // ===================== EXTRACTION DES SCHEMAS =====================

    private List<SchemaInfo> extractSchemas(String content, boolean isOpenApi3) {
        List<SchemaInfo> schemas = new ArrayList<>();

        // Trouver le bloc "schemas" (OpenAPI 3) ou "definitions" (Swagger 2)
        String schemaKey = isOpenApi3 ? "\"schemas\"" : "\"definitions\"";
        int schemasStart = content.indexOf(schemaKey);
        if (schemasStart == -1) return schemas;

        int braceStart = content.indexOf("{", schemasStart);
        if (braceStart == -1) return schemas;

        String schemasBlock = extractJsonBlock(content, braceStart);

        // Extraire chaque schema
        Pattern schemaPattern = Pattern.compile("\"([A-Z][a-zA-Z0-9_]+)\"\\s*:\\s*\\{");
        Matcher schemaMatcher = schemaPattern.matcher(schemasBlock);

        while (schemaMatcher.find()) {
            String schemaName = schemaMatcher.group(1);
            int schemaBlockStart = schemaMatcher.end() - 1;
            String schemaBlock = extractJsonBlock(schemasBlock, schemaBlockStart);

            SchemaInfo schema = new SchemaInfo();
            schema.setName(schemaName);
            schema.setDescription(extractJsonValue(schemaBlock, "description"));

            // Extraire les proprietes
            int propsStart = schemaBlock.indexOf("\"properties\"");
            if (propsStart != -1) {
                int propsBrace = schemaBlock.indexOf("{", propsStart);
                if (propsBrace != -1) {
                    String propsBlock = extractJsonBlock(schemaBlock, propsBrace);

                    // Extraire les champs requis
                    Set<String> requiredFields = extractRequiredFields(schemaBlock);

                    // Extraire chaque propriete
                    Pattern propPattern = Pattern.compile("\"([a-zA-Z_][a-zA-Z0-9_]*)\"\\s*:\\s*\\{");
                    Matcher propMatcher = propPattern.matcher(propsBlock);

                    while (propMatcher.find()) {
                        String fieldName = propMatcher.group(1);
                        int fieldBlockStart = propMatcher.end() - 1;
                        String fieldBlock = extractJsonBlock(propsBlock, fieldBlockStart);

                        SchemaInfo.FieldInfo field = new SchemaInfo.FieldInfo();
                        field.setName(fieldName);
                        field.setType(extractJsonValue(fieldBlock, "type"));
                        field.setFormat(extractJsonValue(fieldBlock, "format"));
                        field.setDescription(extractJsonValue(fieldBlock, "description"));
                        field.setRequired(requiredFields.contains(fieldName));

                        // Verifier les references
                        String ref = extractJsonValue(fieldBlock, "$ref");
                        if (ref != null) {
                            field.setRef(extractSchemaName(ref));
                        }

                        // Verifier les items (pour les arrays)
                        if ("array".equals(field.getType())) {
                            String itemsRef = extractRef(fieldBlock, "items");
                            if (itemsRef != null) {
                                field.setItemsRef(extractSchemaName(itemsRef));
                            }
                        }

                        schema.getFields().add(field);
                    }
                }
            }

            schemas.add(schema);
            log.debug("[OpenAPI]   Schema: {} ({} champs)", schemaName, schema.getFields().size());
        }

        return schemas;
    }

    // ===================== UTILITAIRES =====================

    private List<ParameterInfo> extractParameters(String opBlock) {
        List<ParameterInfo> params = new ArrayList<>();
        int paramsStart = opBlock.indexOf("\"parameters\"");
        if (paramsStart == -1) return params;

        int arrayStart = opBlock.indexOf("[", paramsStart);
        if (arrayStart == -1) return params;

        String paramsArray = extractJsonArray(opBlock, arrayStart);

        Pattern paramPattern = Pattern.compile("\\{[^}]*\"name\"[^}]*\\}");
        Matcher paramMatcher = paramPattern.matcher(paramsArray);

        while (paramMatcher.find()) {
            String paramBlock = paramMatcher.group();
            ParameterInfo param = new ParameterInfo();
            param.setName(extractJsonValue(paramBlock, "name"));
            param.setIn(extractJsonValue(paramBlock, "in"));
            param.setType(extractJsonValue(paramBlock, "type"));
            param.setDescription(extractJsonValue(paramBlock, "description"));
            param.setRequired(paramBlock.contains("\"required\"") &&
                    paramBlock.contains("true"));
            params.add(param);
        }

        return params;
    }

    private List<String> extractTags(String opBlock) {
        List<String> tags = new ArrayList<>();
        int tagsStart = opBlock.indexOf("\"tags\"");
        if (tagsStart == -1) return tags;

        Pattern tagPattern = Pattern.compile("\"tags\"\\s*:\\s*\\[([^\\]]*)\\]");
        Matcher tagMatcher = tagPattern.matcher(opBlock.substring(tagsStart));
        if (tagMatcher.find()) {
            String tagsContent = tagMatcher.group(1);
            Pattern singleTag = Pattern.compile("\"([^\"]+)\"");
            Matcher singleMatcher = singleTag.matcher(tagsContent);
            while (singleMatcher.find()) {
                tags.add(singleMatcher.group(1));
            }
        }
        return tags;
    }

    private Set<String> extractRequiredFields(String schemaBlock) {
        Set<String> required = new HashSet<>();
        Pattern reqPattern = Pattern.compile("\"required\"\\s*:\\s*\\[([^\\]]*)\\]");
        Matcher reqMatcher = reqPattern.matcher(schemaBlock);
        if (reqMatcher.find()) {
            Pattern fieldPattern = Pattern.compile("\"([^\"]+)\"");
            Matcher fieldMatcher = fieldPattern.matcher(reqMatcher.group(1));
            while (fieldMatcher.find()) {
                required.add(fieldMatcher.group(1));
            }
        }
        return required;
    }

    private String extractServerUrl(String content) {
        Pattern serverPattern = Pattern.compile("\"servers\"\\s*:\\s*\\[\\s*\\{[^}]*\"url\"\\s*:\\s*\"([^\"]+)\"");
        Matcher matcher = serverPattern.matcher(content);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String extractRef(String block, String context) {
        int ctxStart = block.indexOf("\"" + context + "\"");
        if (ctxStart == -1) return null;
        String sub = block.substring(ctxStart, Math.min(ctxStart + 500, block.length()));
        Pattern refPattern = Pattern.compile("\"\\$ref\"\\s*:\\s*\"([^\"]+)\"");
        Matcher refMatcher = refPattern.matcher(sub);
        return refMatcher.find() ? refMatcher.group(1) : null;
    }

    private String extractResponseRef(String opBlock) {
        // Chercher dans les responses 200/201
        for (String code : new String[]{"200", "201", "default"}) {
            int codeStart = opBlock.indexOf("\"" + code + "\"");
            if (codeStart != -1) {
                String sub = opBlock.substring(codeStart, Math.min(codeStart + 500, opBlock.length()));
                Pattern refPattern = Pattern.compile("\"\\$ref\"\\s*:\\s*\"([^\"]+)\"");
                Matcher refMatcher = refPattern.matcher(sub);
                if (refMatcher.find()) return refMatcher.group(1);
            }
        }
        return null;
    }

    private String extractSchemaName(String ref) {
        if (ref == null) return null;
        int lastSlash = ref.lastIndexOf("/");
        return lastSlash >= 0 ? ref.substring(lastSlash + 1) : ref;
    }

    private String generateOperationId(String method, String path) {
        String clean = path.replaceAll("[{}]", "")
                .replaceAll("/", "_")
                .replaceAll("[^a-zA-Z0-9_]", "");
        if (clean.startsWith("_")) clean = clean.substring(1);
        return method.toLowerCase() + CodeGenUtils.capitalize(toCamelCase(clean));
    }

    private String extractJsonValue(String json, String key) {
        Pattern pattern = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"([^\"]*?)\"");
        Matcher matcher = pattern.matcher(json);
        return matcher.find() ? matcher.group(1) : null;
    }

    /**
     * Extrait un bloc JSON delimitee par des accolades, en gerant l'imbrication.
     */
    private String extractJsonBlock(String json, int startBrace) {
        if (startBrace >= json.length() || json.charAt(startBrace) != '{') return "{}";

        int depth = 0;
        boolean inString = false;
        boolean escaped = false;

        for (int i = startBrace; i < json.length(); i++) {
            char c = json.charAt(i);

            if (escaped) {
                escaped = false;
                continue;
            }
            if (c == '\\') {
                escaped = true;
                continue;
            }
            if (c == '"') {
                inString = !inString;
                continue;
            }
            if (inString) continue;

            if (c == '{') depth++;
            else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return json.substring(startBrace, i + 1);
                }
            }
        }

        return json.substring(startBrace);
    }

    private String extractJsonArray(String json, int startBracket) {
        if (startBracket >= json.length() || json.charAt(startBracket) != '[') return "[]";

        int depth = 0;
        boolean inString = false;
        boolean escaped = false;

        for (int i = startBracket; i < json.length(); i++) {
            char c = json.charAt(i);

            if (escaped) { escaped = false; continue; }
            if (c == '\\') { escaped = true; continue; }
            if (c == '"') { inString = !inString; continue; }
            if (inString) continue;

            if (c == '[') depth++;
            else if (c == ']') {
                depth--;
                if (depth == 0) return json.substring(startBracket, i + 1);
            }
        }

        return json.substring(startBracket);
    }
    private String toCamelCase(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        boolean nextUpper = false;
        for (char c : s.toCharArray()) {
            if (c == '_' || c == '-') {
                nextUpper = true;
            } else if (nextUpper) {
                sb.append(Character.toUpperCase(c));
                nextUpper = false;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
