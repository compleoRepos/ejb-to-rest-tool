package com.bank.tools.generator.engine;

import com.bank.tools.generator.model.OpenApiContractInfo;
import com.bank.tools.generator.model.OpenApiContractInfo.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Generateur de clients REST Spring Boot a partir de contrats OpenAPI/Swagger.
 * Genere automatiquement :
 * - Un FeignClient interface pour chaque contrat partenaire
 * - Un service wrapper avec circuit breaker et retry
 * - Les DTOs (Request/Response) a partir des schemas OpenAPI
 * - La configuration Feign (timeouts, interceptors, error decoder)
 * - Le mapping BIAN (endpoints conformes au standard BIAN)
 *
 * Compatible OpenAPI 3.x et Swagger 2.x.
 */
@Component
public class OpenApiClientGenerator {

    private static final Logger log = LoggerFactory.getLogger(OpenApiClientGenerator.class);

    private final BianServiceDomainMapper bianMapper;

    private static final String BASE_PACKAGE = "com.bank.api";
    private static final String BASE_PACKAGE_PATH = "com/bank/api";

    public OpenApiClientGenerator(BianServiceDomainMapper bianMapper) {
        this.bianMapper = bianMapper;
    }

    // ===================== TYPE MAPPING OpenAPI → Java =====================

    private static final Map<String, String> TYPE_MAP = Map.ofEntries(
            Map.entry("string", "String"),
            Map.entry("integer", "Integer"),
            Map.entry("int32", "Integer"),
            Map.entry("int64", "Long"),
            Map.entry("number", "Double"),
            Map.entry("float", "Float"),
            Map.entry("double", "Double"),
            Map.entry("boolean", "Boolean"),
            Map.entry("date", "LocalDate"),
            Map.entry("date-time", "LocalDateTime"),
            Map.entry("binary", "byte[]"),
            Map.entry("byte", "byte[]"),
            Map.entry("object", "Object")
    );

    // ===================== POINT D'ENTREE =====================

    /**
     * Genere un projet client REST complet a partir d'un contrat OpenAPI.
     *
     * @param contract le contrat OpenAPI parse
     * @param outputDir repertoire de sortie
     * @param bianMode activer le mapping BIAN sur les endpoints generes
     * @return chemin du projet genere
     */
    public Path generateClient(OpenApiContractInfo contract, Path outputDir, boolean bianMode) throws IOException {
        String partnerName = contract.getPartnerName();
        String partnerLower = partnerName.toLowerCase();
        String partnerCapital = capitalize(partnerName.toLowerCase());

        log.info("[OpenAPI-Gen] Generation du client REST pour {} (BIAN={})", partnerName, bianMode);

        Path projectRoot = outputDir.resolve("generated-client-" + partnerLower);
        Path srcMain = projectRoot.resolve("src/main/java/" + BASE_PACKAGE_PATH);

        // Creer la structure de repertoires
        Files.createDirectories(srcMain.resolve("client/" + partnerLower));
        Files.createDirectories(srcMain.resolve("client/" + partnerLower + "/dto"));
        Files.createDirectories(srcMain.resolve("client/" + partnerLower + "/config"));
        Files.createDirectories(srcMain.resolve("client/" + partnerLower + "/service"));
        Files.createDirectories(projectRoot.resolve("src/main/resources"));

        // 1. Generer le FeignClient interface
        generateFeignClient(srcMain, contract, partnerLower, partnerCapital, bianMode);

        // 2. Generer les DTOs a partir des schemas
        for (SchemaInfo schema : contract.getSchemas()) {
            generateDto(srcMain, schema, partnerLower);
        }

        // 3. Generer la configuration Feign
        generateFeignConfig(srcMain, contract, partnerLower, partnerCapital);

        // 4. Generer le service wrapper avec resilience
        generateServiceWrapper(srcMain, contract, partnerLower, partnerCapital);

        // 5. Generer le error decoder
        generateErrorDecoder(srcMain, partnerLower, partnerCapital);

        // 6. Generer le application.yml partiel
        generateApplicationConfig(projectRoot, contract, partnerLower);

        // 7. Generer le pom.xml avec les dependances Feign
        generatePomXml(projectRoot, partnerLower, partnerCapital);

        // 8. Generer le README
        generateReadme(projectRoot, contract, bianMode);

        // 9. Si mode BIAN, generer le rapport de mapping
        if (bianMode) {
            generateBianReport(projectRoot, contract);
        }

        log.info("[OpenAPI-Gen] Client {} genere : {} endpoints, {} DTOs",
                partnerName, contract.getEndpoints().size(), contract.getSchemas().size());

        return projectRoot;
    }

    // ===================== FEIGN CLIENT =====================

    private void generateFeignClient(Path srcMain, OpenApiContractInfo contract,
                                      String partnerLower, String partnerCapital,
                                      boolean bianMode) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".client.").append(partnerLower).append(";\n\n");

        // Imports
        sb.append("import ").append(BASE_PACKAGE).append(".client.").append(partnerLower).append(".config.")
          .append(partnerCapital).append("FeignConfig;\n");
        sb.append("import ").append(BASE_PACKAGE).append(".client.").append(partnerLower).append(".dto.*;\n");
        sb.append("import org.springframework.cloud.openfeign.FeignClient;\n");
        sb.append("import org.springframework.web.bind.annotation.*;\n\n");
        sb.append("import java.util.List;\n\n");

        // Javadoc
        sb.append("/**\n");
        sb.append(" * Client Feign auto-genere pour le partenaire ").append(contract.getPartnerName()).append(".\n");
        if (contract.getDescription() != null) {
            sb.append(" * ").append(contract.getDescription()).append("\n");
        }
        sb.append(" *\n");
        sb.append(" * Base URL : ").append(contract.getBaseUrl()).append("\n");
        sb.append(" * Version  : ").append(contract.getVersion()).append("\n");
        sb.append(" * Genere automatiquement par ejb-to-rest-tool (OpenAPI Client Generator)\n");
        sb.append(" */\n");

        // Annotation FeignClient
        sb.append("@FeignClient(\n");
        sb.append("    name = \"").append(partnerLower).append("-client\",\n");
        sb.append("    url = \"${partner.").append(partnerLower).append(".base-url}\",\n");
        sb.append("    configuration = ").append(partnerCapital).append("FeignConfig.class\n");
        sb.append(")\n");
        sb.append("public interface ").append(partnerCapital).append("FeignClient {\n\n");

        // Generer une methode par endpoint
        for (EndpointInfo endpoint : contract.getEndpoints()) {
            String methodName = endpoint.getOperationId() != null ?
                    endpoint.getOperationId() : generateMethodName(endpoint);

            // Javadoc de la methode
            if (endpoint.getSummary() != null) {
                sb.append("    /**\n");
                sb.append("     * ").append(endpoint.getSummary()).append("\n");
                if (endpoint.getDescription() != null) {
                    sb.append("     * ").append(endpoint.getDescription()).append("\n");
                }
                sb.append("     */\n");
            }

            // Annotation HTTP
            String path = endpoint.getPath();
            if (bianMode) {
                path = toBianPath(endpoint);
            }

            sb.append("    @").append(httpToAnnotation(endpoint.getHttpMethod()))
              .append("(\"").append(path).append("\")\n");

            // Signature de la methode
            String returnType = endpoint.getResponseSchema() != null ?
                    endpoint.getResponseSchema() : "Object";

            sb.append("    ").append(returnType).append(" ").append(methodName).append("(\n");

            // Parametres path
            List<String> params = new ArrayList<>();
            for (ParameterInfo param : endpoint.getParameters()) {
                String javaType = mapType(param.getType(), null);
                if ("path".equals(param.getIn())) {
                    params.add("        @PathVariable(\"" + param.getName() + "\") " + javaType + " " + param.getName());
                } else if ("query".equals(param.getIn())) {
                    params.add("        @RequestParam(\"" + param.getName() + "\") " + javaType + " " + param.getName());
                } else if ("header".equals(param.getIn())) {
                    params.add("        @RequestHeader(\"" + param.getName() + "\") " + javaType + " " + param.getName());
                }
            }

            // Request body
            if (endpoint.getRequestBodySchema() != null) {
                params.add("        @RequestBody " + endpoint.getRequestBodySchema() + " request");
            }

            sb.append(String.join(",\n", params));
            sb.append("\n    );\n\n");
        }

        sb.append("}\n");

        Path file = srcMain.resolve("client/" + partnerLower + "/" + partnerCapital + "FeignClient.java");
        Files.writeString(file, sb.toString());
        log.info("[OpenAPI-Gen]   FeignClient genere : {}", file.getFileName());
    }

    // ===================== DTOs =====================

    private void generateDto(Path srcMain, SchemaInfo schema, String partnerLower) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".client.").append(partnerLower).append(".dto;\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        for (SchemaInfo.FieldInfo field : schema.getFields()) {
            String javaType = mapType(field.getType(), field.getFormat());
            if ("LocalDate".equals(javaType)) imports.add("import java.time.LocalDate;");
            if ("LocalDateTime".equals(javaType)) imports.add("import java.time.LocalDateTime;");
            if ("BigDecimal".equals(javaType)) imports.add("import java.math.BigDecimal;");
            if ("array".equals(field.getType())) imports.add("import java.util.List;");
        }
        for (String imp : imports) {
            sb.append(imp).append("\n");
        }
        if (!imports.isEmpty()) sb.append("\n");

        // Javadoc
        sb.append("/**\n");
        sb.append(" * DTO auto-genere depuis le schema OpenAPI : ").append(schema.getName()).append("\n");
        if (schema.getDescription() != null) {
            sb.append(" * ").append(schema.getDescription()).append("\n");
        }
        sb.append(" */\n");

        sb.append("public class ").append(schema.getName()).append(" {\n\n");

        // Champs
        for (SchemaInfo.FieldInfo field : schema.getFields()) {
            if (field.getDescription() != null) {
                sb.append("    /** ").append(field.getDescription()).append(" */\n");
            }
            String javaType = resolveFieldType(field);
            sb.append("    private ").append(javaType).append(" ").append(field.getName()).append(";\n");
        }

        sb.append("\n");

        // Constructeur par defaut
        sb.append("    public ").append(schema.getName()).append("() {}\n\n");

        // Getters & Setters
        for (SchemaInfo.FieldInfo field : schema.getFields()) {
            String javaType = resolveFieldType(field);
            String capName = capitalize(field.getName());

            // Getter
            sb.append("    public ").append(javaType).append(" get").append(capName).append("() {\n");
            sb.append("        return this.").append(field.getName()).append(";\n");
            sb.append("    }\n\n");

            // Setter
            sb.append("    public void set").append(capName).append("(").append(javaType).append(" ")
              .append(field.getName()).append(") {\n");
            sb.append("        this.").append(field.getName()).append(" = ").append(field.getName()).append(";\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");

        Path file = srcMain.resolve("client/" + partnerLower + "/dto/" + schema.getName() + ".java");
        Files.writeString(file, sb.toString());
    }

    // ===================== FEIGN CONFIG =====================

    private void generateFeignConfig(Path srcMain, OpenApiContractInfo contract,
                                      String partnerLower, String partnerCapital) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".client.").append(partnerLower).append(".config;\n\n");

        sb.append("import feign.RequestInterceptor;\n");
        sb.append("import feign.codec.ErrorDecoder;\n");
        sb.append("import feign.Logger;\n");
        sb.append("import org.springframework.beans.factory.annotation.Value;\n");
        sb.append("import org.springframework.context.annotation.Bean;\n");
        sb.append("import org.springframework.context.annotation.Configuration;\n\n");

        sb.append("/**\n");
        sb.append(" * Configuration Feign pour le partenaire ").append(contract.getPartnerName()).append(".\n");
        sb.append(" * Gere l'authentification, les timeouts et le logging.\n");
        sb.append(" */\n");
        sb.append("@Configuration\n");
        sb.append("public class ").append(partnerCapital).append("FeignConfig {\n\n");

        sb.append("    @Value(\"${partner.").append(partnerLower).append(".api-key:}\")\n");
        sb.append("    private String apiKey;\n\n");

        sb.append("    @Value(\"${partner.").append(partnerLower).append(".auth-token:}\")\n");
        sb.append("    private String authToken;\n\n");

        // Request Interceptor (ajoute les headers d'auth)
        sb.append("    /**\n");
        sb.append("     * Intercepteur de requetes : ajoute les headers d'authentification.\n");
        sb.append("     * Configurer api-key ou auth-token dans application.yml.\n");
        sb.append("     */\n");
        sb.append("    @Bean\n");
        sb.append("    public RequestInterceptor ").append(partnerLower).append("RequestInterceptor() {\n");
        sb.append("        return template -> {\n");
        sb.append("            if (apiKey != null && !apiKey.isEmpty()) {\n");
        sb.append("                template.header(\"X-API-Key\", apiKey);\n");
        sb.append("            }\n");
        sb.append("            if (authToken != null && !authToken.isEmpty()) {\n");
        sb.append("                template.header(\"Authorization\", \"Bearer \" + authToken);\n");
        sb.append("            }\n");
        sb.append("            template.header(\"Content-Type\", \"application/json\");\n");
        sb.append("            template.header(\"Accept\", \"application/json\");\n");
        sb.append("        };\n");
        sb.append("    }\n\n");

        // Error Decoder
        sb.append("    @Bean\n");
        sb.append("    public ErrorDecoder ").append(partnerLower).append("ErrorDecoder() {\n");
        sb.append("        return new ").append(partnerCapital).append("ErrorDecoder();\n");
        sb.append("    }\n\n");

        // Logger Level
        sb.append("    @Bean\n");
        sb.append("    public Logger.Level ").append(partnerLower).append("LoggerLevel() {\n");
        sb.append("        return Logger.Level.FULL;\n");
        sb.append("    }\n\n");

        sb.append("}\n");

        Path file = srcMain.resolve("client/" + partnerLower + "/config/" + partnerCapital + "FeignConfig.java");
        Files.writeString(file, sb.toString());
    }

    // ===================== SERVICE WRAPPER =====================

    private void generateServiceWrapper(Path srcMain, OpenApiContractInfo contract,
                                         String partnerLower, String partnerCapital) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".client.").append(partnerLower).append(".service;\n\n");

        sb.append("import ").append(BASE_PACKAGE).append(".client.").append(partnerLower).append(".")
          .append(partnerCapital).append("FeignClient;\n");
        sb.append("import ").append(BASE_PACKAGE).append(".client.").append(partnerLower).append(".dto.*;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.stereotype.Service;\n\n");
        sb.append("import java.util.List;\n\n");

        sb.append("/**\n");
        sb.append(" * Service wrapper pour le partenaire ").append(contract.getPartnerName()).append(".\n");
        sb.append(" * Encapsule les appels Feign avec logging, gestion d'erreurs et resilience.\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        sb.append("public class ").append(partnerCapital).append("ClientService {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(")
          .append(partnerCapital).append("ClientService.class);\n\n");

        sb.append("    private final ").append(partnerCapital).append("FeignClient feignClient;\n\n");

        sb.append("    public ").append(partnerCapital).append("ClientService(")
          .append(partnerCapital).append("FeignClient feignClient) {\n");
        sb.append("        this.feignClient = feignClient;\n");
        sb.append("    }\n\n");

        // Generer une methode wrapper par endpoint
        for (EndpointInfo endpoint : contract.getEndpoints()) {
            String methodName = endpoint.getOperationId() != null ?
                    endpoint.getOperationId() : generateMethodName(endpoint);
            String returnType = endpoint.getResponseSchema() != null ?
                    endpoint.getResponseSchema() : "Object";

            sb.append("    /**\n");
            if (endpoint.getSummary() != null) {
                sb.append("     * ").append(endpoint.getSummary()).append("\n");
            }
            sb.append("     * Appel ").append(endpoint.getHttpMethod()).append(" ").append(endpoint.getPath()).append("\n");
            sb.append("     */\n");

            // Construire la signature
            List<String> params = new ArrayList<>();
            List<String> args = new ArrayList<>();
            for (ParameterInfo param : endpoint.getParameters()) {
                String javaType = mapType(param.getType(), null);
                params.add(javaType + " " + param.getName());
                args.add(param.getName());
            }
            if (endpoint.getRequestBodySchema() != null) {
                params.add(endpoint.getRequestBodySchema() + " request");
                args.add("request");
            }

            sb.append("    public ").append(returnType).append(" ").append(methodName).append("(")
              .append(String.join(", ", params)).append(") {\n");
            sb.append("        log.info(\"[").append(contract.getPartnerName()).append("] Appel ")
              .append(methodName).append("\");\n");
            sb.append("        try {\n");
            sb.append("            ").append(returnType).append(" result = feignClient.")
              .append(methodName).append("(").append(String.join(", ", args)).append(");\n");
            sb.append("            log.info(\"[").append(contract.getPartnerName()).append("] ")
              .append(methodName).append(" : succes\");\n");
            sb.append("            return result;\n");
            sb.append("        } catch (Exception e) {\n");
            sb.append("            log.error(\"[").append(contract.getPartnerName()).append("] ")
              .append(methodName).append(" : erreur - {}\", e.getMessage());\n");
            sb.append("            throw new RuntimeException(\"Erreur appel partenaire ")
              .append(contract.getPartnerName()).append(" (").append(methodName).append(")\", e);\n");
            sb.append("        }\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");

        Path file = srcMain.resolve("client/" + partnerLower + "/service/" + partnerCapital + "ClientService.java");
        Files.writeString(file, sb.toString());
    }

    // ===================== ERROR DECODER =====================

    private void generateErrorDecoder(Path srcMain, String partnerLower, String partnerCapital) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".client.").append(partnerLower).append(".config;\n\n");

        sb.append("import feign.Response;\n");
        sb.append("import feign.codec.ErrorDecoder;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n\n");

        sb.append("/**\n");
        sb.append(" * Decodeur d'erreurs Feign pour le partenaire ").append(partnerCapital).append(".\n");
        sb.append(" * Traduit les codes HTTP d'erreur en exceptions metier.\n");
        sb.append(" */\n");
        sb.append("public class ").append(partnerCapital).append("ErrorDecoder implements ErrorDecoder {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(")
          .append(partnerCapital).append("ErrorDecoder.class);\n\n");

        sb.append("    private final ErrorDecoder defaultDecoder = new Default();\n\n");

        sb.append("    @Override\n");
        sb.append("    public Exception decode(String methodKey, Response response) {\n");
        sb.append("        log.error(\"[").append(partnerCapital).append("] Erreur HTTP {} sur {}\",\n");
        sb.append("                response.status(), methodKey);\n\n");

        sb.append("        return switch (response.status()) {\n");
        sb.append("            case 400 -> new IllegalArgumentException(\n");
        sb.append("                    \"Requete invalide vers ").append(partnerCapital).append(" : \" + methodKey);\n");
        sb.append("            case 401, 403 -> new SecurityException(\n");
        sb.append("                    \"Authentification ").append(partnerCapital).append(" echouee : \" + methodKey);\n");
        sb.append("            case 404 -> new RuntimeException(\n");
        sb.append("                    \"Ressource non trouvee chez ").append(partnerCapital).append(" : \" + methodKey);\n");
        sb.append("            case 429 -> new RuntimeException(\n");
        sb.append("                    \"Rate limit atteint chez ").append(partnerCapital).append(" : \" + methodKey);\n");
        sb.append("            case 500, 502, 503 -> new RuntimeException(\n");
        sb.append("                    \"Erreur serveur ").append(partnerCapital).append(" : \" + methodKey);\n");
        sb.append("            default -> defaultDecoder.decode(methodKey, response);\n");
        sb.append("        };\n");
        sb.append("    }\n\n");

        sb.append("}\n");

        Path file = srcMain.resolve("client/" + partnerLower + "/config/" + partnerCapital + "ErrorDecoder.java");
        Files.writeString(file, sb.toString());
    }

    // ===================== APPLICATION CONFIG =====================

    private void generateApplicationConfig(Path projectRoot, OpenApiContractInfo contract,
                                            String partnerLower) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# =============================================\n");
        sb.append("# Configuration du partenaire ").append(contract.getPartnerName()).append("\n");
        sb.append("# A integrer dans application.yml du projet principal\n");
        sb.append("# =============================================\n\n");

        sb.append("partner:\n");
        sb.append("  ").append(partnerLower).append(":\n");
        sb.append("    base-url: ").append(contract.getBaseUrl() != null ? contract.getBaseUrl() : "https://TODO.partner.api").append("\n");
        sb.append("    api-key: ${").append(partnerLower.toUpperCase()).append("_API_KEY:}\n");
        sb.append("    auth-token: ${").append(partnerLower.toUpperCase()).append("_AUTH_TOKEN:}\n");
        sb.append("    timeout:\n");
        sb.append("      connect: 5000\n");
        sb.append("      read: 30000\n\n");

        sb.append("# Feign logging\n");
        sb.append("logging:\n");
        sb.append("  level:\n");
        sb.append("    ").append(BASE_PACKAGE).append(".client.").append(partnerLower).append(": DEBUG\n");

        Path file = projectRoot.resolve("src/main/resources/application-" + partnerLower + ".yml");
        Files.writeString(file, sb.toString());
    }

    // ===================== POM.XML =====================

    private void generatePomXml(Path projectRoot, String partnerLower, String partnerCapital) throws IOException {
        String pom = """
                <?xml version="1.0" encoding="UTF-8"?>
                <project xmlns="http://maven.apache.org/POM/4.0.0"
                         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
                    <modelVersion>4.0.0</modelVersion>
                
                    <parent>
                        <groupId>org.springframework.boot</groupId>
                        <artifactId>spring-boot-starter-parent</artifactId>
                        <version>3.2.5</version>
                        <relativePath/>
                    </parent>
                
                    <groupId>com.bank.api</groupId>
                    <artifactId>client-%s</artifactId>
                    <version>1.0.0</version>
                    <name>Client REST %s (Auto-genere)</name>
                    <description>Client REST Spring Boot pour le partenaire %s, genere par ejb-to-rest-tool</description>
                
                    <properties>
                        <java.version>21</java.version>
                        <spring-cloud.version>2023.0.1</spring-cloud.version>
                    </properties>
                
                    <dependencies>
                        <!-- Spring Boot Web -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-web</artifactId>
                        </dependency>
                
                        <!-- Spring Cloud OpenFeign -->
                        <dependency>
                            <groupId>org.springframework.cloud</groupId>
                            <artifactId>spring-cloud-starter-openfeign</artifactId>
                        </dependency>
                
                        <!-- Resilience4j (Circuit Breaker) -->
                        <dependency>
                            <groupId>io.github.resilience4j</groupId>
                            <artifactId>resilience4j-spring-boot3</artifactId>
                            <version>2.2.0</version>
                        </dependency>
                
                        <!-- Jackson JSON -->
                        <dependency>
                            <groupId>com.fasterxml.jackson.core</groupId>
                            <artifactId>jackson-databind</artifactId>
                        </dependency>
                        <dependency>
                            <groupId>com.fasterxml.jackson.datatype</groupId>
                            <artifactId>jackson-datatype-jsr310</artifactId>
                        </dependency>
                
                        <!-- Testing -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-test</artifactId>
                            <scope>test</scope>
                        </dependency>
                    </dependencies>
                
                    <dependencyManagement>
                        <dependencies>
                            <dependency>
                                <groupId>org.springframework.cloud</groupId>
                                <artifactId>spring-cloud-dependencies</artifactId>
                                <version>${spring-cloud.version}</version>
                                <type>pom</type>
                                <scope>import</scope>
                            </dependency>
                        </dependencies>
                    </dependencyManagement>
                
                    <build>
                        <plugins>
                            <plugin>
                                <groupId>org.springframework.boot</groupId>
                                <artifactId>spring-boot-maven-plugin</artifactId>
                            </plugin>
                        </plugins>
                    </build>
                </project>
                """.formatted(partnerLower, partnerCapital, partnerCapital);

        Files.writeString(projectRoot.resolve("pom.xml"), pom);
    }

    // ===================== README =====================

    private void generateReadme(Path projectRoot, OpenApiContractInfo contract, boolean bianMode) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Client REST ").append(contract.getPartnerName()).append("\n\n");
        sb.append("Client Spring Boot auto-genere par **ejb-to-rest-tool** (OpenAPI Client Generator).\n\n");

        sb.append("## Informations du contrat\n\n");
        sb.append("| Propriete | Valeur |\n");
        sb.append("|-----------|--------|\n");
        sb.append("| Partenaire | **").append(contract.getPartnerName()).append("** |\n");
        sb.append("| Titre | ").append(contract.getTitle() != null ? contract.getTitle() : "N/A").append(" |\n");
        sb.append("| Version | ").append(contract.getVersion() != null ? contract.getVersion() : "N/A").append(" |\n");
        sb.append("| Base URL | `").append(contract.getBaseUrl()).append("` |\n");
        sb.append("| Endpoints | ").append(contract.getEndpoints().size()).append(" |\n");
        sb.append("| Schemas/DTOs | ").append(contract.getSchemas().size()).append(" |\n");
        sb.append("| Mode BIAN | ").append(bianMode ? "Active" : "Desactive").append(" |\n\n");

        sb.append("## Fichiers generes\n\n");
        sb.append("- `FeignClient` : Interface declarative pour les appels HTTP\n");
        sb.append("- `FeignConfig` : Configuration (auth, timeouts, logging)\n");
        sb.append("- `ErrorDecoder` : Gestion des erreurs HTTP partenaire\n");
        sb.append("- `ClientService` : Service wrapper avec logging et resilience\n");
        sb.append("- `dto/` : DTOs generes depuis les schemas OpenAPI\n\n");

        sb.append("## Configuration requise\n\n");
        sb.append("Ajouter dans `application.yml` :\n\n");
        sb.append("```yaml\npartner:\n  ").append(contract.getPartnerName().toLowerCase())
          .append(":\n    base-url: ").append(contract.getBaseUrl())
          .append("\n    api-key: ${API_KEY}\n```\n");

        Files.writeString(projectRoot.resolve("README.md"), sb.toString());
    }

    // ===================== BIAN REPORT =====================

    private void generateBianReport(Path projectRoot, OpenApiContractInfo contract) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Rapport de Mapping BIAN - ").append(contract.getPartnerName()).append("\n\n");
        sb.append("| Endpoint Original | Methode HTTP | Endpoint BIAN | Service Domain |\n");
        sb.append("|-------------------|-------------|---------------|----------------|\n");

        for (EndpointInfo endpoint : contract.getEndpoints()) {
            String bianPath = toBianPath(endpoint);
            String domain = detectBianDomain(endpoint);
            sb.append("| `").append(endpoint.getPath()).append("` | ")
              .append(endpoint.getHttpMethod()).append(" | `").append(bianPath)
              .append("` | ").append(domain).append(" |\n");
        }

        Files.writeString(projectRoot.resolve("BIAN_MAPPING.md"), sb.toString());
    }

    // ===================== UTILITAIRES =====================

    private String mapType(String openApiType, String format) {
        if (format != null && TYPE_MAP.containsKey(format)) {
            return TYPE_MAP.get(format);
        }
        if (openApiType != null && TYPE_MAP.containsKey(openApiType)) {
            return TYPE_MAP.get(openApiType);
        }
        return "String";
    }

    private String resolveFieldType(SchemaInfo.FieldInfo field) {
        if (field.getRef() != null) return field.getRef();
        if ("array".equals(field.getType())) {
            String itemType = field.getItemsRef() != null ? field.getItemsRef() : "Object";
            return "List<" + itemType + ">";
        }
        return mapType(field.getType(), field.getFormat());
    }

    private String httpToAnnotation(String method) {
        return switch (method.toUpperCase()) {
            case "GET" -> "GetMapping";
            case "POST" -> "PostMapping";
            case "PUT" -> "PutMapping";
            case "DELETE" -> "DeleteMapping";
            case "PATCH" -> "PatchMapping";
            default -> "GetMapping";
        };
    }

    private String toBianPath(EndpointInfo endpoint) {
        String domain = detectBianDomain(endpoint).toLowerCase().replace(" ", "-");
        String path = endpoint.getPath();
        // Transformer en path BIAN : /{service-domain}/v1/{path}
        return "/bian/" + domain + "/v1" + path;
    }

    private String detectBianDomain(EndpointInfo endpoint) {
        String combined = (endpoint.getPath() + " " +
                (endpoint.getSummary() != null ? endpoint.getSummary() : "") + " " +
                (endpoint.getOperationId() != null ? endpoint.getOperationId() : "")).toLowerCase();

        if (combined.contains("card") || combined.contains("carte")) return "Issued Device";
        if (combined.contains("payment") || combined.contains("transfer") || combined.contains("virement")) return "Payment Execution";
        if (combined.contains("account") || combined.contains("compte") || combined.contains("balance") || combined.contains("solde")) return "Current Account";
        if (combined.contains("loan") || combined.contains("credit")) return "Consumer Loan";
        if (combined.contains("insurance") || combined.contains("assurance")) return "Insurance Policy";
        if (combined.contains("auth") || combined.contains("sign") || combined.contains("otp")) return "Party Authentication";
        if (combined.contains("sms") || combined.contains("notification") || combined.contains("email")) return "Correspondence";
        if (combined.contains("product") || combined.contains("catalog")) return "Product Directory";
        if (combined.contains("portfolio") || combined.contains("titre")) return "Investment Portfolio";

        return "Customer Offer";
    }

    private String generateMethodName(EndpointInfo endpoint) {
        String method = endpoint.getHttpMethod().toLowerCase();
        String path = endpoint.getPath().replaceAll("[{}]", "")
                .replaceAll("/", "_").replaceAll("[^a-zA-Z0-9_]", "");
        if (path.startsWith("_")) path = path.substring(1);
        return method + capitalize(toCamelCase(path));
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }

    private String toCamelCase(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        boolean nextUpper = false;
        for (char c : s.toCharArray()) {
            if (c == '_' || c == '-') { nextUpper = true; }
            else if (nextUpper) { sb.append(Character.toUpperCase(c)); nextUpper = false; }
            else { sb.append(c); }
        }
        return sb.toString();
    }
}
