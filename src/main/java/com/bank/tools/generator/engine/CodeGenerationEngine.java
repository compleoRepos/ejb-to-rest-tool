package com.bank.tools.generator.engine;

import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Moteur de generation de code v3.
 * Genere un projet Spring Boot complet a partir du resultat de l'analyse
 * d'un projet EJB. Implemente les regles G1-G14 et corrige les bugs 7/10/11/12.
 */
@Component
public class CodeGenerationEngine {

    private static final Logger log = LoggerFactory.getLogger(CodeGenerationEngine.class);

    private final ImportResolver importResolver;

    public CodeGenerationEngine(ImportResolver importResolver) {
        this.importResolver = importResolver;
    }

    private static final String BASE_PACKAGE = "com.bank.api";
    private static final String BASE_PACKAGE_PATH = "com/bank/api";

    // ===================== G1 : TABLE DE MAPPING UNIVERSELLE DES IMPORTS =====================

    private static final Map<String, String> TYPE_IMPORT_MAP = new LinkedHashMap<>();
    static {
        // Types Java standard
        TYPE_IMPORT_MAP.put("BigDecimal", "java.math.BigDecimal");
        TYPE_IMPORT_MAP.put("BigInteger", "java.math.BigInteger");
        TYPE_IMPORT_MAP.put("List", "java.util.List");
        TYPE_IMPORT_MAP.put("ArrayList", "java.util.ArrayList");
        TYPE_IMPORT_MAP.put("Map", "java.util.Map");
        TYPE_IMPORT_MAP.put("HashMap", "java.util.HashMap");
        TYPE_IMPORT_MAP.put("Set", "java.util.Set");
        TYPE_IMPORT_MAP.put("HashSet", "java.util.HashSet");
        TYPE_IMPORT_MAP.put("LinkedList", "java.util.LinkedList");
        TYPE_IMPORT_MAP.put("Optional", "java.util.Optional");
        TYPE_IMPORT_MAP.put("Date", "java.util.Date");
        TYPE_IMPORT_MAP.put("Calendar", "java.util.Calendar");
        TYPE_IMPORT_MAP.put("UUID", "java.util.UUID");
        TYPE_IMPORT_MAP.put("Arrays", "java.util.Arrays");
        TYPE_IMPORT_MAP.put("Collections", "java.util.Collections");
        TYPE_IMPORT_MAP.put("Collection", "java.util.Collection");
        TYPE_IMPORT_MAP.put("LocalDate", "java.time.LocalDate");
        TYPE_IMPORT_MAP.put("LocalDateTime", "java.time.LocalDateTime");
        TYPE_IMPORT_MAP.put("LocalTime", "java.time.LocalTime");
        TYPE_IMPORT_MAP.put("Instant", "java.time.Instant");
        TYPE_IMPORT_MAP.put("ZonedDateTime", "java.time.ZonedDateTime");
        TYPE_IMPORT_MAP.put("Duration", "java.time.Duration");
        TYPE_IMPORT_MAP.put("Serializable", "java.io.Serializable");
    }

    /** Types du package java.lang qui ne necessitent pas d'import */
    private static final Set<String> JAVA_LANG_TYPES = Set.of(
            "String", "Integer", "Long", "Double", "Float", "Boolean",
            "Byte", "Short", "Character", "Object", "Number", "Void"
    );

    /** Types primitifs Java */
    private static final Set<String> PRIMITIVE_TYPES = Set.of(
            "int", "long", "double", "float", "boolean", "byte", "short", "char", "void"
    );

    // ===================== G6 : MAPPING HTTP INTELLIGENT =====================

    private static final List<Map.Entry<String, String>> HTTP_METHOD_PATTERNS = List.of(
            Map.entry("GET", "find|get|search|list|fetch|load|read|check|is|has|count|query|retrieve"),
            Map.entry("POST_CREATED", "create|add|insert|register|open"),
            Map.entry("PUT", "update|modify|edit|change|set"),
            Map.entry("PATCH", "patch|partialUpdate"),
            Map.entry("DELETE", "delete|remove|close|cancel|disable|deactivate"),
            Map.entry("POST_OK", "execute|process|run|perform|transfer|send|submit|validate|approve|reject|save")
    );

    // ===================== POINT D'ENTREE =====================

    public Path generateProject(ProjectAnalysisResult analysisResult, Path outputDir) throws IOException {
        log.info("Debut de la generation du projet API REST (v3 - G1-G14)");

        Path projectRoot = outputDir.resolve("generated-api");
        Files.createDirectories(projectRoot);

        Path srcMain = projectRoot.resolve("src/main/java/" + BASE_PACKAGE_PATH);
        Files.createDirectories(srcMain.resolve("controller"));
        Files.createDirectories(srcMain.resolve("service"));
        Files.createDirectories(srcMain.resolve("dto"));
        Files.createDirectories(srcMain.resolve("config"));
        Files.createDirectories(srcMain.resolve("exception"));
        Files.createDirectories(srcMain.resolve("logging"));
        Files.createDirectories(srcMain.resolve("ejb/interfaces"));
        Files.createDirectories(srcMain.resolve("enums"));
        Files.createDirectories(srcMain.resolve("validation"));

        Path resourcesDir = projectRoot.resolve("src/main/resources");
        Files.createDirectories(resourcesDir);

        boolean projectHasXml = analysisResult.getUseCases().stream().anyMatch(UseCaseInfo::hasXmlSupport)
                || analysisResult.getDtos().stream().anyMatch(DtoInfo::hasJaxbAnnotations);

        boolean projectHasValidation = analysisResult.getDtos().stream()
                .flatMap(dto -> dto.getFields().stream())
                .anyMatch(DtoInfo.FieldInfo::isRequired);

        // Generer les fichiers de base
        generatePomXml(projectRoot, projectHasXml, projectHasValidation);
        generateApplicationClass(srcMain);
        generateApplicationProperties(resourcesDir);
        generateGlobalExceptionHandler(srcMain, analysisResult);   // G9 enrichi + AXE 1.6 exceptions custom
        generateLoggingAspect(srcMain);
        generateEjbLookupConfig(srcMain);
        generateBaseUseCaseInterface(srcMain);
        generateValueObjectInterface(srcMain);

        if (projectHasXml) {
            generateXmlConfig(srcMain);
        }

        // AXE 1.1 : Recopier les enums JAXB
        for (ProjectAnalysisResult.EnumInfo enumInfo : analysisResult.getDetectedEnums()) {
            generateEnumClass(srcMain, enumInfo);
        }

        // AXE 1.6 : Recopier les exceptions custom + enrichir GlobalExceptionHandler
        for (ProjectAnalysisResult.ExceptionInfo excInfo : analysisResult.getDetectedExceptions()) {
            generateExceptionClass(srcMain, excInfo);
        }

        // AXE 1.5 : Recopier les validateurs custom
        for (ProjectAnalysisResult.ValidatorInfo valInfo : analysisResult.getDetectedValidators()) {
            generateValidatorClasses(srcMain, valInfo);
        }

        // BUG B : Recopier les interfaces @Remote/@Local avec migration javax → jakarta
        for (ProjectAnalysisResult.RemoteInterfaceInfo ifaceInfo : analysisResult.getDetectedRemoteInterfaces()) {
            generateRemoteInterface(srcMain, ifaceInfo);
        }

        // Generer controllers et service adapters
        for (UseCaseInfo useCase : analysisResult.getUseCases()) {
            // G4 : Verifier le type EJB
            if (useCase.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN) {
                generateMdbController(srcMain, useCase);
                generateMdbEventClass(srcMain, useCase);
                generateMdbEventListener(srcMain, useCase);
                generateMdbServiceAdapter(srcMain, useCase);
                continue;
            }

            // G5 : Pattern multi-methodes ou BaseUseCase
            if (useCase.getEjbPattern() == UseCaseInfo.EjbPattern.BASE_USE_CASE) {
                generateController(srcMain, useCase);
                generateServiceAdapter(srcMain, useCase);
            } else {
                generateMultiMethodController(srcMain, useCase);
                generateMultiMethodServiceAdapter(srcMain, useCase);
            }
        }

        // Generer les DTOs
        for (DtoInfo dto : analysisResult.getDtos()) {
            generateDtoClass(srcMain, dto);
        }

        // G14 : TRANSFORMATION_SUMMARY.md
        generateTransformationSummary(projectRoot, analysisResult, projectHasXml);
        generateReadme(projectRoot, analysisResult, projectHasXml);

        // PHASE 8 : Resolution systemique des imports post-generation
        int resolvedCount = importResolver.resolveImports(projectRoot);
        log.info("[Phase 8] ImportResolver : {} fichiers corriges", resolvedCount);

        log.info("Generation terminee dans : {}", projectRoot);
        return projectRoot;
    }

    // ===================== POM.XML =====================

    private void generatePomXml(Path projectRoot, boolean includeXml, boolean includeValidation) throws IOException {
        StringBuilder deps = new StringBuilder();
        deps.append("""
                        <!-- Spring Boot Web -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-web</artifactId>
                        </dependency>
                
                        <!-- Spring Boot AOP -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-aop</artifactId>
                        </dependency>
                
                        <!-- Jakarta EE API (pour JNDI) -->
                        <dependency>
                            <groupId>jakarta.platform</groupId>
                            <artifactId>jakarta.jakartaee-api</artifactId>
                            <version>10.0.0</version>
                            <scope>provided</scope>
                        </dependency>
                
                        <!-- Swagger / OpenAPI 3 (G11) -->
                        <dependency>
                            <groupId>org.springdoc</groupId>
                            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
                            <version>2.5.0</version>
                        </dependency>
                """);

        if (includeValidation) {
            deps.append("""
                
                        <!-- Bean Validation -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-validation</artifactId>
                        </dependency>
                """);
        }

        if (includeXml) {
            deps.append("""
                
                        <!-- JAXB API (support XML) -->
                        <dependency>
                            <groupId>jakarta.xml.bind</groupId>
                            <artifactId>jakarta.xml.bind-api</artifactId>
                            <version>4.0.2</version>
                        </dependency>
                
                        <!-- JAXB Runtime -->
                        <dependency>
                            <groupId>org.glassfish.jaxb</groupId>
                            <artifactId>jaxb-runtime</artifactId>
                            <version>4.0.5</version>
                        </dependency>
                
                        <!-- Jackson XML -->
                        <dependency>
                            <groupId>com.fasterxml.jackson.dataformat</groupId>
                            <artifactId>jackson-dataformat-xml</artifactId>
                        </dependency>
                """);
        }

        deps.append("""
                
                        <!-- Testing -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-test</artifactId>
                            <scope>test</scope>
                        </dependency>
                """);

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
                    <artifactId>generated-rest-api</artifactId>
                    <version>1.0.0-SNAPSHOT</version>
                    <packaging>jar</packaging>
                    <name>Generated REST API</name>
                    <description>API REST generee automatiquement a partir du projet EJB</description>
                
                    <properties>
                        <java.version>21</java.version>
                    </properties>
                
                    <dependencies>
                %s
                    </dependencies>
                
                    <build>
                        <plugins>
                            <plugin>
                                <groupId>org.springframework.boot</groupId>
                                <artifactId>spring-boot-maven-plugin</artifactId>
                            </plugin>
                        </plugins>
                    </build>
                
                </project>
                """.formatted(deps.toString());

        Files.writeString(projectRoot.resolve("pom.xml"), pom);
        log.info("pom.xml genere (XML: {}, Validation: {}, Swagger: oui)", includeXml, includeValidation);
    }

    // ===================== APPLICATION CLASS =====================

    private void generateApplicationClass(Path srcMain) throws IOException {
        String code = """
                package %s;
                
                import org.springframework.boot.SpringApplication;
                import org.springframework.boot.autoconfigure.SpringBootApplication;
                
                @SpringBootApplication
                public class Application {
                
                    public static void main(String[] args) {
                        SpringApplication.run(Application.class, args);
                    }
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(srcMain.resolve("Application.java"), code);
    }

    // ===================== APPLICATION PROPERTIES =====================

    private void generateApplicationProperties(Path resourcesDir) throws IOException {
        String props = """
                # Generated REST API - Configuration
                server.port=8081
                
                # JNDI Configuration
                ejb.jndi.provider.url=localhost:1099
                ejb.jndi.factory=org.jboss.naming.remote.client.InitialContextFactory
                
                # Logging
                logging.level.com.bank.api=DEBUG
                logging.pattern.console=%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger{36} - %msg%n
                
                # Swagger
                springdoc.api-docs.path=/api-docs
                springdoc.swagger-ui.path=/swagger-ui.html
                """;

        Files.writeString(resourcesDir.resolve("application.properties"), props);
    }

    // ===================== BASE INTERFACES =====================

    private void generateBaseUseCaseInterface(Path srcMain) throws IOException {
        String code = """
                package %s.ejb.interfaces;
                
                /**
                 * Interface BaseUseCase recopiee depuis le projet EJB source.
                 * Permet le cast type lors du lookup JNDI des EJB.
                 */
                public interface BaseUseCase {
                    ValueObject execute(ValueObject input) throws Exception;
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(srcMain.resolve("ejb/interfaces/BaseUseCase.java"), code);
    }

    private void generateValueObjectInterface(Path srcMain) throws IOException {
        String code = """
                package %s.ejb.interfaces;
                
                import java.io.Serializable;
                
                /**
                 * Interface ValueObject recopiee depuis le projet EJB source.
                 */
                public interface ValueObject extends Serializable {
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(srcMain.resolve("ejb/interfaces/ValueObject.java"), code);
    }

    // ===================== XML CONFIG =====================

    private void generateXmlConfig(Path srcMain) throws IOException {
        String code = """
                package %s.config;
                
                import com.fasterxml.jackson.dataformat.xml.XmlMapper;
                import com.fasterxml.jackson.dataformat.xml.ser.ToXmlGenerator;
                import org.springframework.context.annotation.Bean;
                import org.springframework.context.annotation.Configuration;
                import org.springframework.http.MediaType;
                import org.springframework.http.converter.xml.MappingJackson2XmlHttpMessageConverter;
                import org.springframework.web.servlet.config.annotation.ContentNegotiationConfigurer;
                import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
                
                @Configuration
                public class ContentNegotiationConfig implements WebMvcConfigurer {
                
                    @Override
                    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
                        configurer
                                .favorParameter(true)
                                .parameterName("format")
                                .ignoreAcceptHeader(false)
                                .defaultContentType(MediaType.APPLICATION_JSON)
                                .mediaType("json", MediaType.APPLICATION_JSON)
                                .mediaType("xml", MediaType.APPLICATION_XML);
                    }
                
                    @Bean
                    public MappingJackson2XmlHttpMessageConverter xmlConverter() {
                        XmlMapper xmlMapper = XmlMapper.builder()
                                .configure(ToXmlGenerator.Feature.WRITE_XML_DECLARATION, true)
                                .build();
                        return new MappingJackson2XmlHttpMessageConverter(xmlMapper);
                    }
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(srcMain.resolve("config/ContentNegotiationConfig.java"), code);
    }

    // ===================== CONTROLLER (Pattern BaseUseCase) =====================

    private void generateController(Path srcMain, UseCaseInfo useCase) throws IOException {
        String inputDto = useCase.getInputDtoClassName();
        String outputDto = useCase.getOutputDtoClassName();
        String controllerName = useCase.getControllerName();
        String adapterName = useCase.getServiceAdapterName();
        String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);
        String endpoint = useCase.getRestEndpoint();
        boolean hasXml = useCase.hasXmlSupport();

        // G6 : HTTP status
        HttpMapping httpMapping = resolveHttpMappingForUseCase(useCase.getClassName());

        // G4 : Commentaire EJB type
        String ejbTypeComment = generateEjbTypeComment(useCase);

        // G11 : Swagger
        String swaggerSummary = deriveSwaggerSummary(useCase.getClassName());
        String swaggerDescription = useCase.getJavadoc() != null ? useCase.getJavadoc() : swaggerSummary;

        // Construire les imports
        Set<String> imports = new TreeSet<>();
        imports.add(BASE_PACKAGE + ".dto." + inputDto);
        imports.add(BASE_PACKAGE + ".dto." + outputDto);
        imports.add(BASE_PACKAGE + ".service." + adapterName);
        imports.add("org.slf4j.Logger");
        imports.add("org.slf4j.LoggerFactory");
        imports.add("org.springframework.http.ResponseEntity");
        imports.add("org.springframework.web.bind.annotation.*");
        imports.add("io.swagger.v3.oas.annotations.Operation");
        imports.add("io.swagger.v3.oas.annotations.responses.ApiResponse");
        imports.add("io.swagger.v3.oas.annotations.responses.ApiResponses");
        imports.add("io.swagger.v3.oas.annotations.media.Content");
        imports.add("io.swagger.v3.oas.annotations.media.Schema");

        if (!httpMapping.statusCode.equals("200")) {
            imports.add("org.springframework.http.HttpStatus");
        }
        if (useCase.isInputDtoHasRequiredFields()) {
            imports.add("jakarta.validation.Valid");
        }

        String producesConsumes = "";
        if (hasXml) {
            producesConsumes = ",\n        produces = { \"application/json\", \"application/xml\" },\n        consumes = { \"application/json\", \"application/xml\" }";
        }

        String validAnnotation = useCase.isInputDtoHasRequiredFields() ? "@Valid " : "";

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".controller;\n\n");
        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }
        sb.append("\n");
        sb.append(ejbTypeComment);
        sb.append("/**\n");
        sb.append(" * Controller REST pour le UseCase ").append(useCase.getClassName()).append(".\n");
        sb.append(" * Endpoint : ").append(endpoint).append("\n");
        sb.append(" */\n");
        sb.append("@RestController\n");
        sb.append("@RequestMapping(value = \"").append(endpoint).append("\"").append(producesConsumes).append(")\n");
        sb.append("public class ").append(controllerName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(controllerName).append(".class);\n\n");
        sb.append("    private final ").append(adapterName).append(" ").append(adapterField).append(";\n\n");
        sb.append("    public ").append(controllerName).append("(").append(adapterName).append(" ").append(adapterField).append(") {\n");
        sb.append("        this.").append(adapterField).append(" = ").append(adapterField).append(";\n");
        sb.append("    }\n\n");

        // G11 : Swagger annotations
        sb.append("    @Operation(\n");
        sb.append("        summary = \"").append(escapeJavaString(swaggerSummary)).append("\",\n");
        sb.append("        description = \"").append(escapeJavaString(swaggerDescription)).append("\"\n");
        sb.append("    )\n");
        sb.append("    @ApiResponses(value = {\n");
        sb.append("        @ApiResponse(responseCode = \"").append(httpMapping.statusCode).append("\", description = \"Succes\",\n");
        sb.append("            content = @Content(schema = @Schema(implementation = ").append(outputDto).append(".class))),\n");
        sb.append("        @ApiResponse(responseCode = \"400\", description = \"Requete invalide\"),\n");
        sb.append("        @ApiResponse(responseCode = \"404\", description = \"Ressource non trouvee\"),\n");
        sb.append("        @ApiResponse(responseCode = \"503\", description = \"Service EJB indisponible\")\n");
        sb.append("    })\n");

        sb.append("    @PostMapping\n");
        sb.append("    public ResponseEntity<").append(outputDto).append("> execute(").append(validAnnotation).append("@RequestBody ").append(inputDto).append(" input) {\n");
        sb.append("        log.info(\"[REST-IN] Requete recue sur ").append(endpoint).append(" - UC: ").append(useCase.getClassName()).append("\");\n");
        sb.append("        try {\n");
        sb.append("            ").append(outputDto).append(" result = ").append(adapterField).append(".execute(input);\n");
        sb.append("            log.info(\"[REST-OUT] UseCase ").append(useCase.getClassName()).append(" execute avec succes\");\n");
        sb.append("            return ").append(httpMapping.responseExpression).append(";\n");
        sb.append("        } catch (Exception e) {\n");
        sb.append("            log.error(\"Erreur lors de l'execution du UseCase ").append(useCase.getClassName()).append("\", e);\n");
        sb.append("            throw new RuntimeException(\"Erreur lors de l'appel au UseCase ").append(useCase.getClassName()).append("\", e);\n");
        sb.append("        }\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.writeString(srcMain.resolve("controller/" + controllerName + ".java"), sb.toString());
        log.info("Controller genere : {} (HTTP: {} {})", controllerName, httpMapping.method, httpMapping.statusCode);
    }

    // ===================== CONTROLLER (Pattern multi-methodes - G5) =====================

    private void generateMultiMethodController(Path srcMain, UseCaseInfo useCase) throws IOException {
        String controllerName = useCase.getControllerName();
        String adapterName = useCase.getServiceAdapterName();
        String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);
        // BUG I : URL de base au pluriel
        String baseEndpoint = ensurePluralEndpoint(useCase.getRestEndpoint());
        boolean hasXml = useCase.hasXmlSupport();
        String ejbTypeComment = generateEjbTypeComment(useCase);

        Set<String> imports = new TreeSet<>();
        imports.add(BASE_PACKAGE + ".service." + adapterName);
        imports.add("org.slf4j.Logger");
        imports.add("org.slf4j.LoggerFactory");
        imports.add("org.springframework.http.ResponseEntity");
        imports.add("org.springframework.http.HttpStatus");
        imports.add("org.springframework.web.bind.annotation.*");
        imports.add("io.swagger.v3.oas.annotations.Operation");

        // Collecter les imports des types utilises dans les methodes
        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            resolveTypeImports(method.getReturnType(), imports);
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                resolveTypeImports(param.getType(), imports);
            }
            // Importer les DTOs du meme package
            String returnBase = extractBaseType(method.getReturnType());
            if (isDtoType(returnBase)) {
                imports.add(BASE_PACKAGE + ".dto." + returnBase);
            }
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                String paramBase = extractBaseType(param.getType());
                if (isDtoType(paramBase)) {
                    imports.add(BASE_PACKAGE + ".dto." + paramBase);
                }
            }
        }

        // G7 : byte[] retour
        boolean hasByteArrayReturn = useCase.getPublicMethods().stream()
                .anyMatch(m -> m.getReturnType().equals("byte[]"));
        if (hasByteArrayReturn) {
            imports.add("org.springframework.http.HttpHeaders");
            imports.add("org.springframework.http.MediaType");
        }

        // BUG E : Pre-calculer toutes les routes pour detecter les conflits
        Map<String, List<UseCaseInfo.MethodInfo>> routeMap = new LinkedHashMap<>();
        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            HttpMapping mapping = resolveHttpMappingForMethod(method.getName(), method.getReturnType());
            String subPath = deriveSubPathV2(method, mapping, useCase.getPublicMethods());
            String routeKey = mapping.method + ":" + subPath;
            routeMap.computeIfAbsent(routeKey, k -> new ArrayList<>()).add(method);
        }
        // Resoudre les conflits en ajoutant un sous-chemin derive du nom de la methode
        Map<String, String> methodSubPaths = new LinkedHashMap<>();
        for (Map.Entry<String, List<UseCaseInfo.MethodInfo>> routeEntry : routeMap.entrySet()) {
            List<UseCaseInfo.MethodInfo> methods = routeEntry.getValue();
            if (methods.size() > 1) {
                // Conflit detecte : ajouter un sous-chemin unique pour chaque methode
                for (UseCaseInfo.MethodInfo m : methods) {
                    methodSubPaths.put(m.getName(), "/" + toKebabCase(m.getName()));
                }
            } else {
                HttpMapping mapping = resolveHttpMappingForMethod(methods.get(0).getName(), methods.get(0).getReturnType());
                methodSubPaths.put(methods.get(0).getName(), deriveSubPathV2(methods.get(0), mapping, useCase.getPublicMethods()));
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".controller;\n\n");
        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }
        sb.append("\n");
        sb.append(ejbTypeComment);
        sb.append("/**\n");
        sb.append(" * Controller REST multi-methodes pour ").append(useCase.getClassName()).append(".\n");
        sb.append(" */\n");
        sb.append("@RestController\n");
        sb.append("@RequestMapping(\"").append(baseEndpoint).append("\")\n");
        sb.append("public class ").append(controllerName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(controllerName).append(".class);\n\n");
        sb.append("    private final ").append(adapterName).append(" ").append(adapterField).append(";\n\n");
        sb.append("    public ").append(controllerName).append("(").append(adapterName).append(" ").append(adapterField).append(") {\n");
        sb.append("        this.").append(adapterField).append(" = ").append(adapterField).append(";\n");
        sb.append("    }\n");

        // Generer une route par methode (G5)
        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            sb.append("\n");
            // BUG N : generate* + byte[] → GET (telechargement)
            HttpMapping mapping = resolveHttpMappingForMethod(method.getName(), method.getReturnType());
            String subPath = methodSubPaths.getOrDefault(method.getName(), "/" + toKebabCase(method.getName()));

            // G11 : Swagger
            sb.append("    @Operation(summary = \"").append(escapeJavaString(deriveSwaggerSummary(method.getName()))).append("\")\n");

            // G6 : Annotation HTTP
            sb.append("    @").append(mapping.springAnnotation);
            if (!subPath.isEmpty()) {
                sb.append("(\"").append(subPath).append("\")");
            }
            sb.append("\n");

            // G7 : Type de retour
            String returnType = method.getReturnType();
            String responseType = mapReturnType(returnType);

            sb.append("    public ResponseEntity<").append(responseType).append("> ").append(method.getName()).append("(");

            // BUG F + BUG J : Parametres avec 1 seul @RequestBody max, enums en @RequestParam
            List<String> paramDecls = new ArrayList<>();
            boolean hasRequestBody = false;
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                String annotation = resolveParameterAnnotationV2(param, mapping.method, hasRequestBody);
                if (annotation.contains("@RequestBody")) hasRequestBody = true;
                paramDecls.add(annotation + param.getType() + " " + param.getName());
            }
            sb.append(String.join(",\n            ", paramDecls));
            sb.append(") {\n");

            // BUG K : Tracabilite complete [REST-IN] avec URL
            sb.append("        log.info(\"[REST-IN] ").append(mapping.method).append(" ").append(baseEndpoint).append(subPath);
            sb.append(" - ").append(method.getName()).append("\");\n");
            sb.append("        try {\n");

            // Corps de la methode
            String args = method.getParameters().stream().map(UseCaseInfo.ParameterInfo::getName).collect(Collectors.joining(", "));
            if (returnType.equals("void")) {
                sb.append("            ").append(adapterField).append(".").append(method.getName()).append("(").append(args).append(");\n");
                // BUG K : [REST-OUT]
                sb.append("            log.info(\"[REST-OUT] 204 No Content\");\n");
                sb.append("            return ResponseEntity.noContent().build();\n");
            } else if (returnType.equals("byte[]")) {
                sb.append("            byte[] data = ").append(adapterField).append(".").append(method.getName()).append("(").append(args).append(");\n");
                sb.append("            log.info(\"[REST-OUT] 200 OK - {} octets\", data.length);\n");
                sb.append("            return ResponseEntity.ok()\n");
                sb.append("                .header(HttpHeaders.CONTENT_DISPOSITION, \"attachment; filename=export.bin\")\n");
                sb.append("                .contentType(MediaType.APPLICATION_OCTET_STREAM)\n");
                sb.append("                .body(data);\n");
            } else {
                sb.append("            ").append(returnType).append(" result = ").append(adapterField).append(".").append(method.getName()).append("(").append(args).append(");\n");
                // BUG K : [REST-OUT]
                sb.append("            log.info(\"[REST-OUT] ").append(mapping.statusCode).append(" - ").append(method.getName()).append(" OK\");\n");
                sb.append("            return ").append(mapping.responseExpression).append(";\n");
            }

            sb.append("        } catch (Exception e) {\n");
            // BUG K : [REST-ERROR]
            sb.append("            log.error(\"[REST-ERROR] ").append(method.getName()).append(" : {}\", e.getMessage());\n");
            sb.append("            throw new RuntimeException(e.getMessage(), e);\n");
            sb.append("        }\n");
            sb.append("    }\n");
        }

        sb.append("}\n");

        Files.writeString(srcMain.resolve("controller/" + controllerName + ".java"), sb.toString());
        log.info("Controller multi-methodes genere : {} ({} routes)", controllerName, useCase.getPublicMethods().size());
    }

    // ===================== SERVICE ADAPTER (Pattern BaseUseCase) =====================

    private void generateServiceAdapter(Path srcMain, UseCaseInfo useCase) throws IOException {
        String inputDto = useCase.getInputDtoClassName();
        String outputDto = useCase.getOutputDtoClassName();
        String adapterName = useCase.getServiceAdapterName();
        String jndiName = useCase.getJndiName();

        // G4 : Scope annotation
        String scopeAnnotation = "";
        if (useCase.getEjbType() == UseCaseInfo.EjbType.SINGLETON) {
            scopeAnnotation = "@Scope(\"singleton\")\n// EJB source @Singleton — le scope singleton est preserve cote Spring\n";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".service;\n\n");
        sb.append("import ").append(BASE_PACKAGE).append(".dto.").append(inputDto).append(";\n");
        sb.append("import ").append(BASE_PACKAGE).append(".dto.").append(outputDto).append(";\n");
        sb.append("import ").append(BASE_PACKAGE).append(".ejb.interfaces.BaseUseCase;\n");
        sb.append("import ").append(BASE_PACKAGE).append(".ejb.interfaces.ValueObject;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.beans.factory.annotation.Value;\n");
        sb.append("import org.springframework.stereotype.Service;\n");
        if (!scopeAnnotation.isEmpty()) {
            sb.append("import org.springframework.context.annotation.Scope;\n");
        }
        sb.append("\nimport javax.naming.Context;\n");
        sb.append("import javax.naming.InitialContext;\n");
        sb.append("import javax.naming.NamingException;\n");
        sb.append("import java.util.Properties;\n\n");

        sb.append("/**\n");
        sb.append(" * Service adapter pour ").append(useCase.getClassName()).append(".\n");
        sb.append(" * Lookup JNDI avec cast type vers BaseUseCase.\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        if (!scopeAnnotation.isEmpty()) {
            sb.append(scopeAnnotation);
        }
        sb.append("public class ").append(adapterName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");
        sb.append("    @Value(\"${ejb.jndi.provider.url:localhost:1099}\")\n");
        sb.append("    private String jndiProviderUrl;\n\n");
        sb.append("    @Value(\"${ejb.jndi.factory:org.jboss.naming.remote.client.InitialContextFactory}\")\n");
        sb.append("    private String jndiFactory;\n\n");

        sb.append("    public ").append(outputDto).append(" execute(").append(inputDto).append(" input) throws Exception {\n");
        sb.append("        log.info(\"[EJB-CALL] Lookup JNDI pour ").append(useCase.getClassName()).append(" - JNDI: ").append(jndiName).append("\");\n\n");
        sb.append("        Properties props = new Properties();\n");
        sb.append("        props.put(Context.INITIAL_CONTEXT_FACTORY, jndiFactory);\n");
        sb.append("        props.put(Context.PROVIDER_URL, jndiProviderUrl);\n\n");
        sb.append("        InitialContext ctx = null;\n");
        sb.append("        try {\n");
        sb.append("            ctx = new InitialContext(props);\n");
        sb.append("            BaseUseCase useCase = (BaseUseCase) ctx.lookup(\"").append(jndiName).append("\");\n");
        sb.append("            ValueObject result = useCase.execute(input);\n");
        sb.append("            return (").append(outputDto).append(") result;\n");
        sb.append("        } finally {\n");
        sb.append("            if (ctx != null) {\n");
        sb.append("                try { ctx.close(); } catch (NamingException e) { log.warn(\"Erreur fermeture JNDI\", e); }\n");
        sb.append("            }\n");
        sb.append("        }\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.writeString(srcMain.resolve("service/" + adapterName + ".java"), sb.toString());
        log.info("Service adapter genere : {}", adapterName);
    }

    // ===================== SERVICE ADAPTER (Pattern multi-methodes - G5) =====================

    private void generateMultiMethodServiceAdapter(Path srcMain, UseCaseInfo useCase) throws IOException {
        String adapterName = useCase.getServiceAdapterName();
        String jndiName = useCase.getJndiName();

        Set<String> imports = new TreeSet<>();
        imports.add("org.slf4j.Logger");
        imports.add("org.slf4j.LoggerFactory");
        imports.add("org.springframework.beans.factory.annotation.Value");
        imports.add("org.springframework.stereotype.Service");
        imports.add("javax.naming.Context");
        imports.add("javax.naming.InitialContext");
        imports.add("javax.naming.NamingException");
        imports.add("java.util.Properties");

        // AXE 2 : Importer l'interface @Remote si connue
        String remoteIfaceName = useCase.getRemoteInterfaceName();
        if (remoteIfaceName != null && !remoteIfaceName.isEmpty()) {
            // L'interface @Remote est dans le package ejb.interfaces
            imports.add(BASE_PACKAGE + ".ejb.interfaces." + remoteIfaceName);
        }

        // Collecter les imports des types
        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            resolveTypeImports(method.getReturnType(), imports);
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                resolveTypeImports(param.getType(), imports);
            }
            // DTOs
            String returnBase = extractBaseType(method.getReturnType());
            if (isDtoType(returnBase)) {
                imports.add(BASE_PACKAGE + ".dto." + returnBase);
            }
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                String paramBase = extractBaseType(param.getType());
                if (isDtoType(paramBase)) {
                    imports.add(BASE_PACKAGE + ".dto." + paramBase);
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".service;\n\n");
        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }
        sb.append("\n/**\n");
        sb.append(" * Service adapter multi-methodes pour ").append(useCase.getClassName()).append(".\n");
        sb.append(" * Chaque methode effectue un lookup JNDI et delegue a l'EJB.\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        sb.append("public class ").append(adapterName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");
        sb.append("    @Value(\"${ejb.jndi.provider.url:localhost:1099}\")\n");
        sb.append("    private String jndiProviderUrl;\n\n");
        sb.append("    @Value(\"${ejb.jndi.factory:org.jboss.naming.remote.client.InitialContextFactory}\")\n");
        sb.append("    private String jndiFactory;\n\n");

        // Methode utilitaire de lookup
        sb.append("    private Object lookupEjb() throws Exception {\n");
        sb.append("        Properties props = new Properties();\n");
        sb.append("        props.put(Context.INITIAL_CONTEXT_FACTORY, jndiFactory);\n");
        sb.append("        props.put(Context.PROVIDER_URL, jndiProviderUrl);\n");
        sb.append("        InitialContext ctx = new InitialContext(props);\n");
        sb.append("        try {\n");
        sb.append("            return ctx.lookup(\"").append(jndiName).append("\");\n");
        sb.append("        } finally {\n");
        sb.append("            try { ctx.close(); } catch (NamingException e) { log.warn(\"Erreur fermeture JNDI\", e); }\n");
        sb.append("        }\n");
        sb.append("    }\n");

        // Generer chaque methode
        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            sb.append("\n");
            String params = method.getParameters().stream()
                    .map(p -> p.getType() + " " + p.getName())
                    .collect(Collectors.joining(", "));
            String args = method.getParameters().stream()
                    .map(UseCaseInfo.ParameterInfo::getName)
                    .collect(Collectors.joining(", "));

            sb.append("    public ").append(method.getReturnType()).append(" ").append(method.getName()).append("(").append(params).append(") throws Exception {\n");
            // BUG K : Tracabilite complete avec 6 prefixes EJB
            sb.append("        // --- DEBUT APPEL EJB ---\n");
            sb.append("        log.info(\"[EJB-CALL] ").append(useCase.getClassName()).append(".").append(method.getName()).append("({})\", \"");
            sb.append(method.getParameters().stream().map(p -> "{" + p.getName() + "}").collect(Collectors.joining(", ")));
            sb.append("\");\n");

            // AXE 2 : Si une interface @Remote est connue, utiliser le cast type au lieu de la reflexion
            String remoteIface = useCase.getRemoteInterfaceName();
            if (remoteIface != null && !remoteIface.isEmpty()) {
                sb.append("        // --- LOOKUP JNDI ---\n");
                sb.append("        log.debug(\"[EJB-LOOKUP] Recherche EJB : ").append(jndiName).append("\");\n");
                sb.append("        ").append(remoteIface).append(" ejb = (").append(remoteIface).append(") lookupEjb();\n");
                sb.append("        log.debug(\"[EJB-LOOKUP] EJB trouve\");\n");
                sb.append("        // --- EXECUTION METHODE EJB ---\n");
                sb.append("        long start = System.currentTimeMillis();\n");
                if (method.getReturnType().equals("void")) {
                    sb.append("        ejb.").append(method.getName()).append("(").append(args).append(");\n");
                    sb.append("        long duration = System.currentTimeMillis() - start;\n");
                    sb.append("        log.info(\"[EJB-EXECUTE] ").append(method.getName()).append("() termine en {}ms\", duration);\n");
                } else {
                    sb.append("        ").append(method.getReturnType()).append(" result = ejb.").append(method.getName()).append("(").append(args).append(");\n");
                    sb.append("        long duration = System.currentTimeMillis() - start;\n");
                    sb.append("        log.info(\"[EJB-EXECUTE] ").append(method.getName()).append("() termine en {}ms\", duration);\n");
                    sb.append("        // --- REPONSE EJB ---\n");
                    sb.append("        log.debug(\"[EJB-RESPONSE] Resultat : {}\", result);\n");
                    sb.append("        return result;\n");
                }
            } else {
                sb.append("        // --- LOOKUP JNDI ---\n");
                sb.append("        log.debug(\"[EJB-LOOKUP] Recherche EJB : ").append(jndiName).append("\");\n");
                sb.append("        // TODO: Remplacer par le cast vers l'interface Remote/Local appropriee\n");
                sb.append("        Object ejb = lookupEjb();\n");
                sb.append("        log.debug(\"[EJB-LOOKUP] EJB trouve\");\n");
                sb.append("        // --- EXECUTION METHODE EJB ---\n");
                sb.append("        long start = System.currentTimeMillis();\n");
                sb.append("        java.lang.reflect.Method m = ejb.getClass().getMethod(\"").append(method.getName()).append("\"");
                for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                    sb.append(", ").append(extractBaseType(param.getType())).append(".class");
                }
                sb.append(");\n");
                if (method.getReturnType().equals("void")) {
                    sb.append("        m.invoke(ejb").append(args.isEmpty() ? "" : ", " + args).append(");\n");
                    sb.append("        long duration = System.currentTimeMillis() - start;\n");
                    sb.append("        log.info(\"[EJB-EXECUTE] ").append(method.getName()).append("() termine en {}ms\", duration);\n");
                } else {
                    sb.append("        ").append(method.getReturnType()).append(" result = (").append(method.getReturnType()).append(") m.invoke(ejb").append(args.isEmpty() ? "" : ", " + args).append(");\n");
                    sb.append("        long duration = System.currentTimeMillis() - start;\n");
                    sb.append("        log.info(\"[EJB-EXECUTE] ").append(method.getName()).append("() termine en {}ms\", duration);\n");
                    sb.append("        // --- REPONSE EJB ---\n");
                    sb.append("        log.debug(\"[EJB-RESPONSE] Resultat : {}\", result);\n");
                    sb.append("        return result;\n");
                }
            }
            sb.append("    }\n");
        }

        sb.append("}\n");

        Files.writeString(srcMain.resolve("service/" + adapterName + ".java"), sb.toString());
        log.info("Service adapter multi-methodes genere : {}", adapterName);
    }

    // ===================== MDB GENERATION (G4 - Event-Driven) =====================

    /**
     * Genere un controller REST asynchrone pour un MDB.
     * Le controller recoit les messages via HTTP POST et publie un evenement Spring.
     */
    private void generateMdbController(Path srcMain, UseCaseInfo useCase) throws IOException {
        String controllerName = useCase.getControllerName();
        String endpoint = useCase.getRestEndpoint();
        String baseName = controllerName.replace("Controller", "");
        String eventClassName = baseName.endsWith("Event") ? baseName : baseName + "Event";
        String swaggerSummary = deriveSwaggerSummary(useCase.getClassName());
        String swaggerDescription = useCase.getJavadoc() != null ? useCase.getJavadoc() :
                "Endpoint asynchrone remplacant le MDB " + useCase.getClassName() + ". " +
                "Recoit un message via HTTP et le traite de maniere asynchrone.";

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".controller;\n\n");

        // Imports
        sb.append("import ").append(BASE_PACKAGE).append(".event.").append(eventClassName).append(";\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.context.ApplicationEventPublisher;\n");
        sb.append("import org.springframework.http.HttpStatus;\n");
        sb.append("import org.springframework.http.ResponseEntity;\n");
        sb.append("import org.springframework.web.bind.annotation.*;\n");
        sb.append("import io.swagger.v3.oas.annotations.Operation;\n");
        sb.append("import io.swagger.v3.oas.annotations.responses.ApiResponse;\n");
        sb.append("import io.swagger.v3.oas.annotations.responses.ApiResponses;\n");
        sb.append("import java.util.Map;\n");
        sb.append("import java.util.UUID;\n");
        sb.append("\n");

        // Commentaire G4
        sb.append("/**\n");
        sb.append(" * Controller REST asynchrone remplacant le MDB ").append(useCase.getClassName()).append(".\n");
        sb.append(" * \n");
        sb.append(" * L'EJB source est un @MessageDriven qui consommait des messages JMS.\n");
        sb.append(" * Ce controller recoit les messages via HTTP POST et les traite de maniere\n");
        sb.append(" * asynchrone via le systeme d'evenements Spring (ApplicationEventPublisher).\n");
        sb.append(" * \n");
        sb.append(" * Destination JMS source : ").append(useCase.getJndiName()).append("\n");
        sb.append(" * Endpoint REST : POST ").append(endpoint).append("\n");
        sb.append(" */\n");
        sb.append("@RestController\n");
        sb.append("@RequestMapping(\"").append(endpoint).append("\")\n");
        sb.append("public class ").append(controllerName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(controllerName).append(".class);\n\n");
        sb.append("    private final ApplicationEventPublisher eventPublisher;\n\n");
        sb.append("    public ").append(controllerName).append("(ApplicationEventPublisher eventPublisher) {\n");
        sb.append("        this.eventPublisher = eventPublisher;\n");
        sb.append("    }\n\n");

        // Swagger
        sb.append("    @Operation(\n");
        sb.append("        summary = \"").append(escapeJavaString(swaggerSummary)).append(" (async)\",\n");
        sb.append("        description = \"").append(escapeJavaString(swaggerDescription)).append("\"\n");
        sb.append("    )\n");
        sb.append("    @ApiResponses(value = {\n");
        sb.append("        @ApiResponse(responseCode = \"202\", description = \"Message accepte pour traitement asynchrone\"),\n");
        sb.append("        @ApiResponse(responseCode = \"400\", description = \"Requete invalide\"),\n");
        sb.append("        @ApiResponse(responseCode = \"500\", description = \"Erreur interne\")\n");
        sb.append("    })\n");

        sb.append("    @PostMapping\n");
        sb.append("    public ResponseEntity<Map<String, String>> receiveMessage(@RequestBody Map<String, Object> payload) {\n");
        sb.append("        String correlationId = UUID.randomUUID().toString();\n");
        sb.append("        log.info(\"Message recu sur ").append(endpoint).append(" [correlationId={}]\", correlationId);\n");
        sb.append("        try {\n");
        sb.append("            ").append(eventClassName).append(" event = new ").append(eventClassName).append("(this, correlationId, payload);\n");
        sb.append("            eventPublisher.publishEvent(event);\n");
        sb.append("            log.info(\"Evenement publie avec succes [correlationId={}]\", correlationId);\n");
        sb.append("            return ResponseEntity.status(HttpStatus.ACCEPTED)\n");
        sb.append("                    .body(Map.of(\"status\", \"ACCEPTED\", \"correlationId\", correlationId));\n");
        sb.append("        } catch (Exception e) {\n");
        sb.append("            log.error(\"Erreur lors de la publication de l'evenement [correlationId={}]\", correlationId, e);\n");
        sb.append("            throw new RuntimeException(\"Erreur lors du traitement du message MDB ").append(useCase.getClassName()).append("\", e);\n");
        sb.append("        }\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.createDirectories(srcMain.resolve("controller"));
        Files.writeString(srcMain.resolve("controller/" + controllerName + ".java"), sb.toString());
        log.info("Controller MDB genere : {} (HTTP: POST 202 Accepted)", controllerName);
    }

    /**
     * Genere la classe d'evenement Spring pour un MDB.
     */
    private void generateMdbEventClass(Path srcMain, UseCaseInfo useCase) throws IOException {
        String baseName = useCase.getControllerName().replace("Controller", "");
        String eventClassName = baseName.endsWith("Event") ? baseName : baseName + "Event";

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".event;\n\n");
        sb.append("import org.springframework.context.ApplicationEvent;\n");
        sb.append("import java.util.Map;\n");
        sb.append("\n");
        sb.append("/**\n");
        sb.append(" * Evenement Spring remplacant le message JMS du MDB ").append(useCase.getClassName()).append(".\n");
        sb.append(" * Contient le payload du message et un identifiant de correlation.\n");
        sb.append(" */\n");
        sb.append("public class ").append(eventClassName).append(" extends ApplicationEvent {\n\n");
        sb.append("    private static final long serialVersionUID = 1L;\n\n");
        sb.append("    private final String correlationId;\n");
        sb.append("    private final Map<String, Object> payload;\n\n");
        sb.append("    public ").append(eventClassName).append("(Object source, String correlationId, Map<String, Object> payload) {\n");
        sb.append("        super(source);\n");
        sb.append("        this.correlationId = correlationId;\n");
        sb.append("        this.payload = payload;\n");
        sb.append("    }\n\n");
        sb.append("    public String getCorrelationId() { return correlationId; }\n");
        sb.append("    public Map<String, Object> getPayload() { return payload; }\n");
        sb.append("}\n");

        Files.createDirectories(srcMain.resolve("event"));
        Files.writeString(srcMain.resolve("event/" + eventClassName + ".java"), sb.toString());
        log.info("Event class MDB generee : {}", eventClassName);
    }

    /**
     * Genere le listener d'evenement asynchrone pour un MDB.
     * Equivalent Spring du onMessage() JMS.
     */
    private void generateMdbEventListener(Path srcMain, UseCaseInfo useCase) throws IOException {
        String baseName = useCase.getControllerName().replace("Controller", "");
        String eventClassName = baseName.endsWith("Event") ? baseName : baseName + "Event";
        String listenerName = eventClassName + "Listener";
        String adapterName = useCase.getServiceAdapterName();
        String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".event;\n\n");
        sb.append("import ").append(BASE_PACKAGE).append(".service.").append(adapterName).append(";\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.context.event.EventListener;\n");
        sb.append("import org.springframework.scheduling.annotation.Async;\n");
        sb.append("import org.springframework.stereotype.Component;\n");
        sb.append("\n");
        sb.append("/**\n");
        sb.append(" * Listener asynchrone remplacant la methode onMessage() du MDB ").append(useCase.getClassName()).append(".\n");
        sb.append(" * \n");
        sb.append(" * Ce composant ecoute les evenements ").append(eventClassName).append(" publies par le controller\n");
        sb.append(" * et delegue le traitement au service adapter (pont vers l'EJB legacy).\n");
        sb.append(" * L'annotation @Async garantit un traitement non-bloquant.\n");
        sb.append(" */\n");
        sb.append("@Component\n");
        sb.append("public class ").append(listenerName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(listenerName).append(".class);\n\n");
        sb.append("    private final ").append(adapterName).append(" ").append(adapterField).append(";\n\n");
        sb.append("    public ").append(listenerName).append("(").append(adapterName).append(" ").append(adapterField).append(") {\n");
        sb.append("        this.").append(adapterField).append(" = ").append(adapterField).append(";\n");
        sb.append("    }\n\n");
        sb.append("    @Async\n");
        sb.append("    @EventListener\n");
        sb.append("    public void handle").append(eventClassName).append("(").append(eventClassName).append(" event) {\n");
        sb.append("        log.info(\"Traitement asynchrone du message [correlationId={}]\", event.getCorrelationId());\n");
        sb.append("        try {\n");
        sb.append("            ").append(adapterField).append(".processMessage(event.getPayload());\n");
        sb.append("            log.info(\"Message traite avec succes [correlationId={}]\", event.getCorrelationId());\n");
        sb.append("        } catch (Exception e) {\n");
        sb.append("            log.error(\"Erreur lors du traitement du message [correlationId={}]\", event.getCorrelationId(), e);\n");
        sb.append("            // TODO: Implementer une strategie de retry ou dead-letter\n");
        sb.append("        }\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.createDirectories(srcMain.resolve("event"));
        Files.writeString(srcMain.resolve("event/" + listenerName + ".java"), sb.toString());
        log.info("Event listener MDB genere : {}", listenerName);
    }

    /**
     * Genere le service adapter pour un MDB.
     * Contient la logique de pont vers l'EJB legacy.
     */
    private void generateMdbServiceAdapter(Path srcMain, UseCaseInfo useCase) throws IOException {
        String adapterName = useCase.getServiceAdapterName();
        String jmsDestination = useCase.getJndiName();

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".service;\n\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.stereotype.Service;\n");
        sb.append("import java.util.Map;\n");
        sb.append("\n");
        sb.append("/**\n");
        sb.append(" * Service adapter pour le MDB ").append(useCase.getClassName()).append(".\n");
        sb.append(" * \n");
        sb.append(" * Destination JMS source : ").append(jmsDestination).append("\n");
        sb.append(" * Ce service contient la logique metier qui etait dans onMessage().\n");
        sb.append(" * TODO: Migrer la logique metier du MDB original ici.\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        sb.append("public class ").append(adapterName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");
        sb.append("    /**\n");
        sb.append("     * Traite un message recu (equivalent de onMessage du MDB).\n");
        sb.append("     *\n");
        sb.append("     * @param payload le contenu du message sous forme de Map\n");
        sb.append("     */\n");
        sb.append("    public void processMessage(Map<String, Object> payload) {\n");
        sb.append("        log.info(\"Traitement du message MDB ").append(useCase.getClassName()).append(" : {}\", payload);\n");
        sb.append("        // TODO: Implementer la logique metier du MDB ").append(useCase.getClassName()).append("\n");
        sb.append("        // La logique originale se trouvait dans la methode onMessage()\n");
        sb.append("        // de l'EJB @MessageDriven ").append(useCase.getClassName()).append("\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.createDirectories(srcMain.resolve("service"));
        Files.writeString(srcMain.resolve("service/" + adapterName + ".java"), sb.toString());
        log.info("Service adapter MDB genere : {}", adapterName);
    }

    // ===================== AXE 1.1 : ENUM GENERATION =====================

    /**
     * AXE 1.1 : Genere une enum JAXB dans le package enums.
     * Migre javax.xml.bind → jakarta.xml.bind et ajoute @JsonValue/@JsonCreator.
     */
    private void generateEnumClass(Path srcMain, ProjectAnalysisResult.EnumInfo enumInfo) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".enums;\n\n");
        sb.append("import com.fasterxml.jackson.annotation.JsonCreator;\n");
        sb.append("import com.fasterxml.jackson.annotation.JsonValue;\n");
        sb.append("import jakarta.xml.bind.annotation.XmlEnum;\n");
        sb.append("import jakarta.xml.bind.annotation.XmlEnumValue;\n");
        sb.append("import jakarta.xml.bind.annotation.XmlType;\n\n");

        sb.append("/**\n");
        sb.append(" * Enum recopiee depuis le projet EJB source.\n");
        sb.append(" * Package source : ").append(enumInfo.getPackageName()).append("\n");
        sb.append(" * Migration : javax.xml.bind → jakarta.xml.bind + Jackson annotations.\n");
        sb.append(" */\n");
        sb.append("@XmlType\n");
        sb.append("@XmlEnum\n");
        sb.append("public enum ").append(enumInfo.getName()).append(" {\n\n");

        List<String> values = enumInfo.getValues();
        for (int i = 0; i < values.size(); i++) {
            sb.append("    ").append(values.get(i));
            if (i < values.size() - 1) sb.append(",");
            else sb.append(";");
            sb.append("\n");
        }

        sb.append("\n    @JsonValue\n");
        sb.append("    public String toValue() {\n");
        sb.append("        return name();\n");
        sb.append("    }\n\n");

        sb.append("    @JsonCreator\n");
        sb.append("    public static ").append(enumInfo.getName()).append(" fromValue(String value) {\n");
        sb.append("        return valueOf(value);\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.writeString(srcMain.resolve("enums/" + enumInfo.getName() + ".java"), sb.toString());
        log.info("Enum generee : {} ({} valeurs)", enumInfo.getName(), values.size());
    }

    // ===================== AXE 1.6 : EXCEPTION GENERATION =====================

    /**
     * AXE 1.6 : Genere une exception custom dans le package exception.
     * Preserve la hierarchie (extends RuntimeException ou Exception).
     */
    private void generateExceptionClass(Path srcMain, ProjectAnalysisResult.ExceptionInfo excInfo) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".exception;\n\n");

        sb.append("/**\n");
        sb.append(" * Exception custom recopiee depuis le projet EJB source.\n");
        sb.append(" * Package source : ").append(excInfo.getPackageName()).append("\n");
        if (excInfo.getErrorCode() != null) {
            sb.append(" * Code erreur : ").append(excInfo.getErrorCode()).append("\n");
        }
        sb.append(" */\n");
        sb.append("public class ").append(excInfo.getName());
        sb.append(" extends ").append(excInfo.getParentClass() != null ? excInfo.getParentClass() : "RuntimeException");
        sb.append(" {\n\n");
        sb.append("    private static final long serialVersionUID = 1L;\n\n");

        if (excInfo.getErrorCode() != null) {
            sb.append("    private final String errorCode = \"").append(excInfo.getErrorCode()).append("\";\n\n");
        }

        sb.append("    public ").append(excInfo.getName()).append("() {\n");
        sb.append("        super();\n");
        sb.append("    }\n\n");

        sb.append("    public ").append(excInfo.getName()).append("(String message) {\n");
        sb.append("        super(message);\n");
        sb.append("    }\n\n");

        sb.append("    public ").append(excInfo.getName()).append("(String message, Throwable cause) {\n");
        sb.append("        super(message, cause);\n");
        sb.append("    }\n\n");

        if (excInfo.getErrorCode() != null) {
            sb.append("    public String getErrorCode() {\n");
            sb.append("        return errorCode;\n");
            sb.append("    }\n");
        }

        sb.append("}\n");

        Files.writeString(srcMain.resolve("exception/" + excInfo.getName() + ".java"), sb.toString());
        log.info("Exception generee : {} (extends {})", excInfo.getName(), excInfo.getParentClass());
    }

    // ===================== AXE 1.5 : VALIDATOR GENERATION =====================

    /**
     * AXE 1.5 : Genere l'annotation de validation custom et son validateur.
     * Migre javax.validation → jakarta.validation.
     */
    private void generateValidatorClasses(Path srcMain, ProjectAnalysisResult.ValidatorInfo valInfo) throws IOException {
        // 1. Generer l'annotation : recopier le source original avec migration javax → jakarta
        if (valInfo.getAnnotationSource() != null && !valInfo.getAnnotationSource().isBlank()) {
            String annSource = valInfo.getAnnotationSource()
                    .replace("javax.validation", "jakarta.validation")
                    .replace("javax.annotation", "jakarta.annotation");
            StringBuilder annSb = new StringBuilder();
            annSb.append("package ").append(BASE_PACKAGE).append(".validation;\n\n");
            // Extraire les imports du source original
            for (String line : annSource.split("\n")) {
                String trimmed = line.trim();
                if (trimmed.startsWith("import ")) {
                    annSb.append(trimmed).append("\n");
                }
            }
            annSb.append("\n");
            // Extraire le corps de l'annotation (depuis @Target ou @Documented ou @Constraint)
            boolean inBody = false;
            for (String line : annSource.split("\n")) {
                String trimmed = line.trim();
                if (trimmed.startsWith("@Target") || trimmed.startsWith("@Retention") || 
                    trimmed.startsWith("@Constraint") || trimmed.startsWith("@Documented") ||
                    trimmed.startsWith("public @interface")) {
                    inBody = true;
                }
                if (inBody) {
                    annSb.append(line).append("\n");
                }
            }
            Files.writeString(srcMain.resolve("validation/" + valInfo.getAnnotationName() + ".java"), annSb.toString());
        } else {
            // Fallback : generer un squelette
            StringBuilder annSb = new StringBuilder();
            annSb.append("package ").append(BASE_PACKAGE).append(".validation;\n\n");
            annSb.append("import jakarta.validation.Constraint;\n");
            annSb.append("import jakarta.validation.Payload;\n");
            annSb.append("import java.lang.annotation.*;\n\n");
            annSb.append("@Documented\n");
            annSb.append("@Constraint(validatedBy = ").append(valInfo.getValidatorName()).append(".class)\n");
            annSb.append("@Target({ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER})\n");
            annSb.append("@Retention(RetentionPolicy.RUNTIME)\n");
            annSb.append("public @interface ").append(valInfo.getAnnotationName()).append(" {\n\n");
            annSb.append("    String message() default \"Validation failed for @").append(valInfo.getAnnotationName()).append("\";\n\n");
            annSb.append("    Class<?>[] groups() default {};\n\n");
            annSb.append("    Class<? extends Payload>[] payload() default {};\n");
            annSb.append("}\n");
            Files.writeString(srcMain.resolve("validation/" + valInfo.getAnnotationName() + ".java"), annSb.toString());
        }

        // 2. Generer le validateur : recopier le source original avec migration javax → jakarta
        if (valInfo.getValidatorSource() != null && !valInfo.getValidatorSource().isBlank()) {
            String valSource = valInfo.getValidatorSource()
                    .replace("javax.validation", "jakarta.validation")
                    .replace("javax.annotation", "jakarta.annotation");
            StringBuilder valSb = new StringBuilder();
            valSb.append("package ").append(BASE_PACKAGE).append(".validation;\n\n");
            // Extraire les imports du source original
            for (String line : valSource.split("\n")) {
                String trimmed = line.trim();
                if (trimmed.startsWith("import ")) {
                    valSb.append(trimmed).append("\n");
                }
            }
            valSb.append("\n");
            // Extraire le corps de la classe (depuis la declaration de classe)
            boolean inBody = false;
            for (String line : valSource.split("\n")) {
                String trimmed = line.trim();
                if (trimmed.startsWith("public class ") || trimmed.startsWith("public final class ")) {
                    inBody = true;
                }
                if (inBody) {
                    valSb.append(line).append("\n");
                }
            }
            Files.writeString(srcMain.resolve("validation/" + valInfo.getValidatorName() + ".java"), valSb.toString());
        } else {
            // Fallback : generer un squelette
            StringBuilder valSb = new StringBuilder();
            valSb.append("package ").append(BASE_PACKAGE).append(".validation;\n\n");
            valSb.append("import jakarta.validation.ConstraintValidator;\n");
            valSb.append("import jakarta.validation.ConstraintValidatorContext;\n\n");
            valSb.append("public class ").append(valInfo.getValidatorName());
            valSb.append(" implements ConstraintValidator<").append(valInfo.getAnnotationName()).append(", Object> {\n\n");
            valSb.append("    @Override\n");
            valSb.append("    public void initialize(").append(valInfo.getAnnotationName()).append(" constraintAnnotation) {\n");
            valSb.append("        // Initialisation du validateur\n");
            valSb.append("    }\n\n");
            valSb.append("    @Override\n");
            valSb.append("    public boolean isValid(Object value, ConstraintValidatorContext context) {\n");
            valSb.append("        // TODO: Implementer la logique de validation\n");
            valSb.append("        return value != null;\n");
            valSb.append("    }\n");
            valSb.append("}\n");
            Files.writeString(srcMain.resolve("validation/" + valInfo.getValidatorName() + ".java"), valSb.toString());
        }
        log.info("Validateur genere : @{} / {}", valInfo.getAnnotationName(), valInfo.getValidatorName());
    }

    // ===================== BUG B : REMOTE INTERFACE GENERATION =====================

    /**
     * Recopie une interface @Remote/@Local dans le projet genere avec migration javax → jakarta.
     * Les imports sont adaptes au package cible com.bank.api.
     */
    private void generateRemoteInterface(Path srcMain, ProjectAnalysisResult.RemoteInterfaceInfo ifaceInfo) throws IOException {
        String sourceCode = ifaceInfo.getSourceCode();
        if (sourceCode == null || sourceCode.isEmpty()) {
            log.warn("Source code absent pour l'interface @Remote : {}", ifaceInfo.getName());
            return;
        }

        // Migration du package et des imports
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".ejb.interfaces;\n\n");

        // Collecter les types references dans l'interface pour generer les imports
        Set<String> imports = new TreeSet<>();

        // Scanner le code source pour trouver les types utilises
        String[] lines = sourceCode.split("\n");
        boolean inInterface = false;
        StringBuilder interfaceBody = new StringBuilder();

        for (String line : lines) {
            String trimmed = line.trim();
            // Ignorer le package original et les imports originaux
            if (trimmed.startsWith("package ")) continue;
            if (trimmed.startsWith("import ")) {
                // Migrer javax → jakarta
                String importLine = trimmed.replace("javax.ejb.", "jakarta.ejb.")
                        .replace("javax.validation.", "jakarta.validation.")
                        .replace("javax.xml.bind.", "jakarta.xml.bind.");
                // Ignorer les imports EJB (@Remote, @Local, @Stateless etc.)
                if (!importLine.contains("jakarta.ejb.") && !importLine.contains("javax.ejb.")) {
                    // On ne garde pas les imports originaux, on les recalculera
                }
                continue;
            }
            // Supprimer l'annotation @Remote/@Local de l'interface
            if (trimmed.equals("@Remote") || trimmed.equals("@Local")) continue;
            if (trimmed.startsWith("@Remote(") || trimmed.startsWith("@Local(")) continue;

            interfaceBody.append(line).append("\n");
        }

        // Ecrire les imports (seront resolus par ImportResolver Phase 8)
        // Ajouter quelques imports standard courants
        imports.add("java.util.List");
        imports.add("java.math.BigDecimal");

        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }
        sb.append("\n");

        // Ajouter le corps de l'interface
        sb.append(interfaceBody);

        Files.writeString(srcMain.resolve("ejb/interfaces/" + ifaceInfo.getName() + ".java"), sb.toString());
        log.info("Interface @Remote generee : {}", ifaceInfo.getName());
    }

    // ===================== DTO (G1, G2, G3, BUG 10/11/12) =====================

    private void generateDtoClass(Path srcMain, DtoInfo dto) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".dto;\n\n");

        // G1 : Collecter TOUS les imports necessaires
        Set<String> imports = new TreeSet<>();

        // BUG 12 : VoIn ET VoOut implementent ValueObject
        boolean isVoIn = dto.getClassName().endsWith("VoIn") || dto.getClassName().endsWith("VOIn")
                || dto.getClassName().endsWith("Input") || dto.getClassName().endsWith("Request");
        boolean isVoOut = dto.getClassName().endsWith("VoOut") || dto.getClassName().endsWith("VOOut")
                || dto.getClassName().endsWith("Output") || dto.getClassName().endsWith("Response");
        boolean isDto = isVoIn || isVoOut || dto.getClassName().endsWith("Dto") || dto.getClassName().endsWith("DTO");

        if (isVoIn || isVoOut) {
            imports.add(BASE_PACKAGE + ".ejb.interfaces.ValueObject");
        } else if (isDto) {
            imports.add("java.io.Serializable");
        }

        // JAXB imports
        boolean hasJaxb = dto.hasJaxbAnnotations();
        // G2 : Utiliser des imports individuels au lieu du wildcard pour eviter les doublons
        if (hasJaxb) {
            if (dto.isHasXmlRootElement()) imports.add("jakarta.xml.bind.annotation.XmlRootElement");
            if (dto.isHasXmlAccessorType()) imports.add("jakarta.xml.bind.annotation.XmlAccessorType");
            if (dto.isHasXmlAccessorType()) imports.add("jakarta.xml.bind.annotation.XmlAccessType");
            if (dto.isHasXmlType()) imports.add("jakarta.xml.bind.annotation.XmlType");
            boolean hasXmlElement = dto.getFields().stream().anyMatch(DtoInfo.FieldInfo::isHasXmlElement);
            if (hasXmlElement) imports.add("jakarta.xml.bind.annotation.XmlElement");
            boolean hasXmlAttribute = dto.getFields().stream().anyMatch(DtoInfo.FieldInfo::isHasXmlAttribute);
            if (hasXmlAttribute) imports.add("jakarta.xml.bind.annotation.XmlAttribute");
            boolean hasXmlElementWrapper = dto.getFields().stream().anyMatch(DtoInfo.FieldInfo::isHasXmlElementWrapper);
            if (hasXmlElementWrapper) imports.add("jakarta.xml.bind.annotation.XmlElementWrapper");
            // BUG M : @XmlTransient import
            boolean hasXmlTransient = dto.getFields().stream().anyMatch(DtoInfo.FieldInfo::isHasXmlTransient);
            if (hasXmlTransient) imports.add("jakarta.xml.bind.annotation.XmlTransient");
        }
        if (dto.isHasXmlRootElement() || hasJaxb) {
            imports.add("com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlRootElement");
        }

        // G1 + BUG 10 : Collecter les imports pour les types ET les annotations
        // G2 : Utiliser un Set pour la deduplication
        Set<String> annotationsUsed = new LinkedHashSet<>();

        for (DtoInfo.FieldInfo field : dto.getFields()) {
            if (field.isStatic() && field.isFinal()) continue;
            if (field.getName().equals("serialVersionUID")) continue;
            if (isLoggerField(field)) continue;

            // Imports des types
            resolveTypeImports(field.getType(), imports);

            // BUG 10/11 : Tracking des annotations de validation
            if (field.isRequired()) {
                String baseType = extractBaseType(field.getType());
                if (baseType.equals("String")) {
                    annotationsUsed.add("NotBlank");
                    imports.add("jakarta.validation.constraints.NotBlank");
                } else if (baseType.equals("List") || baseType.equals("Set") || baseType.equals("Collection")) {
                    annotationsUsed.add("NotNull");
                    annotationsUsed.add("Size");
                    imports.add("jakarta.validation.constraints.NotNull");
                    imports.add("jakarta.validation.constraints.Size");
                } else if (!PRIMITIVE_TYPES.contains(baseType)) {
                    annotationsUsed.add("NotNull");
                    imports.add("jakarta.validation.constraints.NotNull");
                }
            }
        }

        // BUG 10 : Si @Size est utilise dans les annotations, s'assurer que l'import est present
        // (deja gere ci-dessus via le Set annotationsUsed)

        // BUG H : Imports pour les annotations custom de validation (@ValidIBAN, @ValidRIB, etc.)
        for (DtoInfo.FieldInfo field : dto.getFields()) {
            for (String customAnnot : field.getCustomAnnotations()) {
                imports.add(BASE_PACKAGE + ".validation." + customAnnot);
            }
        }

        // Ecrire les imports
        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }

        sb.append("\n");
        sb.append("/**\n");
        sb.append(" * DTO genere pour ").append(dto.getClassName()).append(".\n");
        sb.append(" */\n");

        // Annotations JAXB au niveau de la classe
        if (dto.isHasXmlRootElement()) {
            String rootName = dto.getXmlRootElementName() != null ? dto.getXmlRootElementName()
                    : Character.toLowerCase(dto.getClassName().charAt(0)) + dto.getClassName().substring(1);
            sb.append("@XmlRootElement(name = \"").append(rootName).append("\")\n");
            sb.append("@JacksonXmlRootElement(localName = \"").append(rootName).append("\")\n");
        } else if (hasJaxb) {
            String rootName = Character.toLowerCase(dto.getClassName().charAt(0)) + dto.getClassName().substring(1);
            sb.append("@XmlRootElement(name = \"").append(rootName).append("\")\n");
            sb.append("@JacksonXmlRootElement(localName = \"").append(rootName).append("\")\n");
        }

        if (dto.isHasXmlAccessorType()) {
            sb.append("@XmlAccessorType(").append(dto.getXmlAccessorTypeValue() != null ? dto.getXmlAccessorTypeValue() : "XmlAccessType.FIELD").append(")\n");
        } else if (hasJaxb) {
            sb.append("@XmlAccessorType(XmlAccessType.FIELD)\n");
        }

        if (dto.isHasXmlType()) {
            sb.append("@XmlType\n");
        }

        // Declaration de la classe
        sb.append("public class ").append(dto.getClassName());

        if (dto.getParentClassName() != null && !dto.getParentClassName().equals("Object")
                && !dto.getParentClassName().equals("ValueObject")) {
            sb.append(" extends ").append(dto.getParentClassName());
        }

        // BUG 12 : VoIn ET VoOut implementent ValueObject
        if (isVoIn || isVoOut) {
            sb.append(" implements ValueObject");
        } else if (isDto) {
            sb.append(" implements Serializable");
        }
        sb.append(" {\n\n");

        // BUG 12 : serialVersionUID pour les classes qui implementent Serializable/ValueObject
        if (isVoIn || isVoOut || isDto) {
            sb.append("    private static final long serialVersionUID = 1L;\n\n");
        }

        // Filtrer les champs
        List<DtoInfo.FieldInfo> instanceFields = new ArrayList<>();
        List<DtoInfo.FieldInfo> constantFields = new ArrayList<>();

        for (DtoInfo.FieldInfo field : dto.getFields()) {
            if (field.getName().equals("serialVersionUID")) continue;
            if (isLoggerField(field)) continue;
            if (field.isStatic() && field.isFinal()) {
                constantFields.add(field);
            } else {
                instanceFields.add(field);
            }
        }

        // Constantes metier
        for (DtoInfo.FieldInfo field : constantFields) {
            sb.append("    private static final ").append(field.getType()).append(" ").append(field.getName()).append(";\n");
        }
        if (!constantFields.isEmpty()) sb.append("\n");

        // Champs d'instance avec annotations
        for (DtoInfo.FieldInfo field : instanceFields) {
            // G2 : Deduplication des annotations via un Set
            Set<String> fieldAnnotations = new LinkedHashSet<>();

            // JAXB annotations
            if (field.isHasXmlElementWrapper()) {
                String wrapperAnnot = field.getXmlElementWrapperName() != null
                        ? "@XmlElementWrapper(name = \"" + field.getXmlElementWrapperName() + "\")"
                        : "@XmlElementWrapper";
                fieldAnnotations.add(wrapperAnnot);
            }
            if (field.isHasXmlElement()) {
                StringBuilder xmlEl = new StringBuilder("@XmlElement");
                List<String> attrs = new ArrayList<>();
                if (field.getXmlName() != null) attrs.add("name = \"" + field.getXmlName() + "\"");
                if (field.isRequired()) attrs.add("required = true");
                if (!attrs.isEmpty()) xmlEl.append("(").append(String.join(", ", attrs)).append(")");
                fieldAnnotations.add(xmlEl.toString());
            }
            if (field.isHasXmlAttribute()) {
                String attrAnnot = field.getXmlName() != null
                        ? "@XmlAttribute(name = \"" + field.getXmlName() + "\")"
                        : "@XmlAttribute";
                fieldAnnotations.add(attrAnnot);
            }

            // BUG M : @XmlTransient doit etre preserve (pas remplace par @JsonIgnore)
            if (field.isHasXmlTransient()) {
                fieldAnnotations.add("@XmlTransient");
            }

            // Validation annotations (BUG 10/11 : une seule fois, jamais de doublon)
            if (field.isRequired()) {
                String baseType = extractBaseType(field.getType());
                if (baseType.equals("String")) {
                    fieldAnnotations.add("@NotBlank");
                } else if (baseType.equals("List") || baseType.equals("Set") || baseType.equals("Collection")) {
                    fieldAnnotations.add("@NotNull");
                    fieldAnnotations.add("@Size(min = 1)");
                } else if (!PRIMITIVE_TYPES.contains(baseType)) {
                    fieldAnnotations.add("@NotNull");
                }
            }

            // BUG H : Annotations custom de validation (@ValidIBAN, @ValidRIB, etc.)
            for (String customAnnot : field.getCustomAnnotations()) {
                fieldAnnotations.add("@" + customAnnot);
            }

            // Ecrire les annotations (G2 : le Set garantit la deduplication)
            for (String annot : fieldAnnotations) {
                sb.append("    ").append(annot).append("\n");
            }

            sb.append("    private ").append(field.getType()).append(" ").append(field.getName()).append(";\n");
        }

        sb.append("\n");

        // Constructeur par defaut
        sb.append("    public ").append(dto.getClassName()).append("() {\n");
        sb.append("    }\n\n");

        // Getters et Setters
        for (DtoInfo.FieldInfo field : instanceFields) {
            String cap = Character.toUpperCase(field.getName().charAt(0)) + field.getName().substring(1);
            String prefix = field.getType().equals("boolean") ? "is" : "get";

            sb.append("    public ").append(field.getType()).append(" ").append(prefix).append(cap).append("() {\n");
            sb.append("        return ").append(field.getName()).append(";\n");
            sb.append("    }\n\n");

            sb.append("    public void set").append(cap).append("(").append(field.getType()).append(" ").append(field.getName()).append(") {\n");
            sb.append("        this.").append(field.getName()).append(" = ").append(field.getName()).append(";\n");
            sb.append("    }\n\n");
        }

        // toString
        sb.append("    @Override\n");
        sb.append("    public String toString() {\n");
        sb.append("        return \"").append(dto.getClassName()).append("{");
        for (int i = 0; i < instanceFields.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(instanceFields.get(i).getName()).append("='\" + ").append(instanceFields.get(i).getName()).append(" + \"'");
        }
        sb.append("}\";\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.writeString(srcMain.resolve("dto/" + dto.getClassName() + ".java"), sb.toString());
        log.info("DTO genere : {} (JAXB: {}, ValueObject: {})", dto.getClassName(), hasJaxb, isVoIn || isVoOut);
    }

    // ===================== GLOBAL EXCEPTION HANDLER (G9 enrichi) =====================

    private void generateGlobalExceptionHandler(Path srcMain, ProjectAnalysisResult analysisResult) throws IOException {
        // AXE 1.6 : Generer des handlers pour chaque exception custom detectee
        StringBuilder customHandlers = new StringBuilder();
        if (analysisResult != null && analysisResult.getDetectedExceptions() != null) {
            for (ProjectAnalysisResult.ExceptionInfo exc : analysisResult.getDetectedExceptions()) {
                String excName = exc.getName();
                String excLower = Character.toLowerCase(excName.charAt(0)) + excName.substring(1);
                // Determiner le HTTP status en fonction du nom de l'exception
                // BUG L : Mapping intelligent exception → code HTTP
                String httpStatus = resolveExceptionHttpStatus(excName);

                customHandlers.append("\n    @ExceptionHandler(").append(excName).append(".class)\n");
                customHandlers.append("    public ResponseEntity<Map<String, Object>> handle").append(excName).append("(").append(excName).append(" ex) {\n");
                customHandlers.append("        log.warn(\"").append(excName).append(" : {}\", ex.getMessage());\n");
                customHandlers.append("        return buildErrorResponse(").append(httpStatus).append(", ex.getMessage());\n");
                customHandlers.append("    }\n");
            }
        }
        String customHandlersStr = customHandlers.toString();

        String code = """
                package %s.exception;
                
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.http.HttpStatus;
                import org.springframework.http.ResponseEntity;
                import org.springframework.web.bind.MethodArgumentNotValidException;
                import org.springframework.web.bind.annotation.ControllerAdvice;
                import org.springframework.web.bind.annotation.ExceptionHandler;
                
                import java.time.LocalDateTime;
                import java.util.LinkedHashMap;
                import java.util.Map;
                import java.util.stream.Collectors;
                
                /**
                 * Gestionnaire global des exceptions (G9).
                 * Mappe les exceptions EJB/JPA/Validation vers des codes HTTP appropries.
                 */
                @ControllerAdvice
                public class GlobalExceptionHandler {
                
                    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
                
                    @ExceptionHandler(IllegalArgumentException.class)
                    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
                        log.warn("Argument invalide : {}", ex.getMessage());
                        return buildErrorResponse(HttpStatus.BAD_REQUEST, ex.getMessage());
                    }
                
                    @ExceptionHandler(SecurityException.class)
                    public ResponseEntity<Map<String, Object>> handleForbidden(SecurityException ex) {
                        log.warn("Acces refuse : {}", ex.getMessage());
                        return buildErrorResponse(HttpStatus.FORBIDDEN, ex.getMessage());
                    }
                
                    @ExceptionHandler(MethodArgumentNotValidException.class)
                    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
                        String errors = ex.getBindingResult().getFieldErrors().stream()
                                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                                .collect(Collectors.joining(", "));
                        log.warn("Erreur de validation : {}", errors);
                        return buildErrorResponse(HttpStatus.BAD_REQUEST, errors);
                    }
                
                    @ExceptionHandler(RuntimeException.class)
                    public ResponseEntity<Map<String, Object>> handleRuntime(RuntimeException ex) {
                        // G9 : Analyse du message pour determiner le code HTTP
                        String msg = ex.getMessage() != null ? ex.getMessage().toLowerCase() : "";
                        if (msg.contains("not found") || msg.contains("inexistant") || msg.contains("introuvable")) {
                            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage());
                        }
                        if (msg.contains("already exists") || msg.contains("existe deja") || msg.contains("conflict")) {
                            return buildErrorResponse(HttpStatus.CONFLICT, ex.getMessage());
                        }
                        if (msg.contains("unauthorized") || msg.contains("non autorise")) {
                            return buildErrorResponse(HttpStatus.UNAUTHORIZED, ex.getMessage());
                        }
                        if (msg.contains("insufficient") || msg.contains("insuffisant")) {
                            return buildErrorResponse(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
                        }
                        log.error("Erreur runtime", ex);
                        return buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
                    }
                
                    @ExceptionHandler(Exception.class)
                    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
                        // G9 : javax.naming.NamingException → 503
                        if (ex.getClass().getName().contains("NamingException")) {
                            log.error("Service EJB indisponible", ex);
                            return buildErrorResponse(HttpStatus.SERVICE_UNAVAILABLE, "Service EJB indisponible");
                        }
                        log.error("Erreur inattendue", ex);
                        return buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur interne du serveur");
                    }
                
                    %s
                    private ResponseEntity<Map<String, Object>> buildErrorResponse(HttpStatus status, String message) {
                        Map<String, Object> body = new LinkedHashMap<>();
                        body.put("timestamp", LocalDateTime.now().toString());
                        body.put("status", status.value());
                        body.put("error", status.getReasonPhrase());
                        body.put("message", message);
                        return new ResponseEntity<>(body, status);
                    }
                }
                """.formatted(BASE_PACKAGE, customHandlersStr);

        Files.writeString(srcMain.resolve("exception/GlobalExceptionHandler.java"), code);
    }

    // ===================== LOGGING ASPECT =====================

    private void generateLoggingAspect(Path srcMain) throws IOException {
        String code = """
                package %s.logging;
                
                import org.aspectj.lang.ProceedingJoinPoint;
                import org.aspectj.lang.annotation.Around;
                import org.aspectj.lang.annotation.Aspect;
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.stereotype.Component;
                
                @Aspect
                @Component
                public class LoggingAspect {
                
                    private static final Logger log = LoggerFactory.getLogger(LoggingAspect.class);
                
                    @Around("execution(* %s.controller..*(..))")
                    public Object logControllerCalls(ProceedingJoinPoint joinPoint) throws Throwable {
                        String methodName = joinPoint.getSignature().toShortString();
                        log.info(">> Entree : {}", methodName);
                        long startTime = System.currentTimeMillis();
                        try {
                            Object result = joinPoint.proceed();
                            log.info("<< Sortie : {} ({}ms)", methodName, System.currentTimeMillis() - startTime);
                            return result;
                        } catch (Throwable ex) {
                            log.error("!! Erreur : {} ({}ms) - {}", methodName, System.currentTimeMillis() - startTime, ex.getMessage());
                            throw ex;
                        }
                    }
                
                    @Around("execution(* %s.service..*(..))")
                    public Object logServiceCalls(ProceedingJoinPoint joinPoint) throws Throwable {
                        String methodName = joinPoint.getSignature().toShortString();
                        log.debug(">> Service : {}", methodName);
                        long startTime = System.currentTimeMillis();
                        try {
                            Object result = joinPoint.proceed();
                            log.debug("<< Service : {} ({}ms)", methodName, System.currentTimeMillis() - startTime);
                            return result;
                        } catch (Throwable ex) {
                            log.error("!! Service Erreur : {} ({}ms) - {}", methodName, System.currentTimeMillis() - startTime, ex.getMessage());
                            throw ex;
                        }
                    }
                }
                """.formatted(BASE_PACKAGE, BASE_PACKAGE, BASE_PACKAGE);

        Files.writeString(srcMain.resolve("logging/LoggingAspect.java"), code);
    }

    // ===================== EJB LOOKUP CONFIG =====================

    private void generateEjbLookupConfig(Path srcMain) throws IOException {
        String code = """
                package %s.config;
                
                import org.springframework.beans.factory.annotation.Value;
                import org.springframework.context.annotation.Configuration;
                
                @Configuration
                public class EjbLookupConfig {
                
                    @Value("${ejb.jndi.provider.url:localhost:1099}")
                    private String providerUrl;
                
                    @Value("${ejb.jndi.factory:org.jboss.naming.remote.client.InitialContextFactory}")
                    private String contextFactory;
                
                    public String getProviderUrl() { return providerUrl; }
                    public String getContextFactory() { return contextFactory; }
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(srcMain.resolve("config/EjbLookupConfig.java"), code);
    }

    // ===================== G14 : TRANSFORMATION_SUMMARY.md =====================

    private void generateTransformationSummary(Path projectRoot, ProjectAnalysisResult analysisResult, boolean hasXml) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Resume de la transformation EJB → REST API\n\n");

        sb.append("## Projet source\n");
        sb.append("- Package source : ").append(analysisResult.getSourceBasePackage() != null ? analysisResult.getSourceBasePackage() : "detecte automatiquement").append("\n");
        sb.append("- EJB detectes : ").append(analysisResult.getUseCases().size()).append("\n");
        sb.append("- DTOs detectes : ").append(analysisResult.getDtos().size()).append("\n");
        sb.append("- Entites JPA : ").append(analysisResult.getJpaEntityCount()).append("\n\n");

        sb.append("## Projet genere\n");
        sb.append("- Framework : Spring Boot 3.2.5\n");
        sb.append("- Package : ").append(BASE_PACKAGE).append("\n");
        sb.append("- Java : 21\n");
        sb.append("- Support XML/JAXB : ").append(hasXml ? "Oui" : "Non").append("\n\n");

        sb.append("## Mapping detaille\n\n");
        sb.append("| EJB Source | Type | Pattern | Endpoint REST | Methode | Code HTTP |\n");
        sb.append("|------------|------|---------|---------------|---------|----------|\n");
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            HttpMapping mapping = resolveHttpMappingForUseCase(uc.getClassName());
            sb.append("| ").append(uc.getClassName())
              .append(" | @").append(uc.getEjbType() != null ? uc.getEjbType().name() : "Stateless")
              .append(" | ").append(uc.getEjbPattern() != null ? uc.getEjbPattern().name() : "BASE_USE_CASE")
              .append(" | ").append(uc.getRestEndpoint())
              .append(" | ").append(mapping.method)
              .append(" | ").append(mapping.statusCode)
              .append(" |\n");
        }

        sb.append("\n## Conversions appliquees\n\n");
        sb.append("- javax.xml.bind → jakarta.xml.bind (G3)\n");
        sb.append("- @EJB → lookup JNDI via ServiceAdapter\n");
        sb.append("- @XmlRootElement → preserve + ajout @JacksonXmlRootElement\n");
        sb.append("- serialVersionUID → supprime des DTOs (inutile en REST)\n");
        sb.append("- Lombok → supprime (getters/setters generes explicitement)\n");
        sb.append("- Swagger/OpenAPI 3 → ajoute sur tous les endpoints (G11)\n\n");

        sb.append("## Points d'attention\n\n");
        long statefulCount = analysisResult.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.STATEFUL).count();
        long mdbCount = analysisResult.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN).count();
        if (statefulCount > 0) {
            sb.append("- ").append(statefulCount).append(" EJB @Stateful detecte(s) — l'etat conversationnel n'est pas reproduit dans la facade REST\n");
        }
        if (mdbCount > 0) {
            sb.append("- ").append(mdbCount).append(" EJB @MessageDriven detecte(s) \u2192 transforme(s) en Controller REST async + EventListener Spring\n");
            sb.append("  - Chaque MDB genere : Controller (POST 202 Accepted), Event Spring, EventListener (@Async), ServiceAdapter\n");
            sb.append("  - Les messages JMS sont remplaces par des appels HTTP POST asynchrones\n");
        }
        sb.append("- Les ServiceAdapters utilisent un lookup JNDI a chaque appel — prevoir un cache si necessaire\n");
        sb.append("- Les tests unitaires mockent les ServiceAdapters — les tests d'integration necessitent un serveur EJB\n");

        Files.writeString(projectRoot.resolve("TRANSFORMATION_SUMMARY.md"), sb.toString());
        log.info("TRANSFORMATION_SUMMARY.md genere");
    }

    // ===================== README =====================

    private void generateReadme(Path projectRoot, ProjectAnalysisResult analysisResult, boolean hasXml) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Generated REST API\n\n");
        sb.append("API REST generee automatiquement a partir d'un projet EJB.\n\n");

        sb.append("## Prerequis\n\n");
        sb.append("- Java 21\n- Maven 3.8+\n- Serveur d'applications EJB accessible via JNDI\n\n");

        sb.append("## Compilation et execution\n\n");
        sb.append("```bash\nmvn clean package\njava -jar target/generated-rest-api-1.0.0-SNAPSHOT.jar\n```\n\n");

        sb.append("## Documentation API (Swagger)\n\n");
        sb.append("Apres le demarrage, acceder a :\n");
        sb.append("- Swagger UI : http://localhost:8081/swagger-ui.html\n");
        sb.append("- OpenAPI JSON : http://localhost:8081/api-docs\n\n");

        sb.append("## Endpoints REST\n\n");
        sb.append("| UseCase | Endpoint | Methode | Format | HTTP Status |\n");
        sb.append("|---------|----------|---------|--------|-------------|\n");
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            if (uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN) {
                sb.append("| ").append(uc.getClassName()).append(" (MDB)")
                  .append(" | ").append(uc.getRestEndpoint())
                  .append(" | POST (async)")
                  .append(" | JSON")
                  .append(" | 202 Accepted")
                  .append(" |\n");
            } else {
                HttpMapping mapping = resolveHttpMappingForUseCase(uc.getClassName());
                sb.append("| ").append(uc.getClassName())
                  .append(" | ").append(uc.getRestEndpoint())
                  .append(" | ").append(mapping.method)
                  .append(" | ").append(uc.getSerializationFormat().getLabel())
                  .append(" | ").append(mapping.statusCode)
                  .append(" |\n");
            }
        }

        if (hasXml) {
            sb.append("\n## Negociation de contenu\n\n");
            sb.append("- En-tete Accept : `application/json` ou `application/xml`\n");
            sb.append("- Parametre : `?format=json` ou `?format=xml`\n");
        }

        sb.append("\n## Architecture\n\n");
        sb.append("```\nClient HTTP → Controller REST → ServiceAdapter → JNDI Lookup → EJB\n```\n");

        Files.writeString(projectRoot.resolve("README.md"), sb.toString());
        log.info("README.md genere");
    }

    // ===================== UTILITAIRES =====================

    /** G1 : Resout les imports necessaires pour un type donne */
    private void resolveTypeImports(String type, Set<String> imports) {
        if (type == null || type.isEmpty()) return;
        String baseType = extractBaseType(type);

        if (TYPE_IMPORT_MAP.containsKey(baseType)) {
            imports.add(TYPE_IMPORT_MAP.get(baseType));
        }

        // Generiques : extraire les types parametres entre < et >
        int openIdx = type.indexOf('<');
        int closeIdx = type.lastIndexOf('>');
        if (openIdx >= 0 && closeIdx > openIdx) {
            String genericPart = type.substring(openIdx + 1, closeIdx);
            // Split intelligent qui respecte les generiques imbriques
            int depth = 0;
            int start = 0;
            for (int i = 0; i < genericPart.length(); i++) {
                char c = genericPart.charAt(i);
                if (c == '<') depth++;
                else if (c == '>') depth--;
                else if (c == ',' && depth == 0) {
                    resolveTypeImports(genericPart.substring(start, i).trim(), imports);
                    start = i + 1;
                }
            }
            resolveTypeImports(genericPart.substring(start).trim(), imports);
        }
    }

    /** Extrait le type de base */
    private String extractBaseType(String type) {
        if (type == null) return "";
        if (type.contains("<")) return type.substring(0, type.indexOf('<')).trim();
        if (type.endsWith("[]")) return type.substring(0, type.length() - 2).trim();
        return type.trim();
    }

    /** Verifie si un champ est un logger */
    private boolean isLoggerField(DtoInfo.FieldInfo field) {
        String name = field.getName().toLowerCase();
        String type = field.getType().toLowerCase();
        return name.equals("logger") || name.equals("log") || name.equals("log_")
                || type.contains("logger") || type.contains("log4j");
    }

    /** Verifie si un type est un DTO */
    private boolean isDtoType(String type) {
        return type.endsWith("Vo") || type.endsWith("VoIn") || type.endsWith("VoOut")
                || type.endsWith("Dto") || type.endsWith("DTO")
                || type.endsWith("Input") || type.endsWith("Output")
                || type.endsWith("Request") || type.endsWith("Response");
    }

    // ===================== G6 : HTTP MAPPING INTELLIGENT =====================

    private record HttpMapping(String method, String springAnnotation, String statusCode, String responseExpression) {}

    private HttpMapping resolveHttpMappingForUseCase(String useCaseClassName) {
        String name = useCaseClassName.toLowerCase();
        if (name.contains("create") || name.contains("add") || name.contains("register")
                || name.contains("open") || name.contains("insert")) {
            return new HttpMapping("POST", "PostMapping", "201", "ResponseEntity.status(HttpStatus.CREATED).body(result)");
        }
        if (name.contains("delete") || name.contains("remove") || name.contains("close")) {
            return new HttpMapping("DELETE", "DeleteMapping", "204", "ResponseEntity.noContent().build()");
        }
        // BUG 7 : Toutes les autres operations (consultation, transfer, etc.) → 200 OK
        return new HttpMapping("POST", "PostMapping", "200", "ResponseEntity.ok(result)");
    }

    private HttpMapping resolveHttpMappingForMethod(String methodName) {
        String name = methodName.toLowerCase();
        for (Map.Entry<String, String> entry : HTTP_METHOD_PATTERNS) {
            String[] patterns = entry.getValue().split("\\|");
            for (String pattern : patterns) {
                if (name.startsWith(pattern)) {
                    return switch (entry.getKey()) {
                        case "GET" -> new HttpMapping("GET", "GetMapping", "200", "ResponseEntity.ok(result)");
                        case "POST_CREATED" -> new HttpMapping("POST", "PostMapping", "201", "ResponseEntity.status(HttpStatus.CREATED).body(result)");
                        case "PUT" -> new HttpMapping("PUT", "PutMapping", "200", "ResponseEntity.ok(result)");
                        case "PATCH" -> new HttpMapping("PATCH", "PatchMapping", "200", "ResponseEntity.ok(result)");
                        case "DELETE" -> new HttpMapping("DELETE", "DeleteMapping", "204", "ResponseEntity.noContent().build()");
                        default -> new HttpMapping("POST", "PostMapping", "200", "ResponseEntity.ok(result)");
                    };
                }
            }
        }
        return new HttpMapping("POST", "PostMapping", "200", "ResponseEntity.ok(result)");
    }

    /** G8 : Resout l'annotation de parametre */
    private String resolveParameterAnnotation(UseCaseInfo.ParameterInfo param, String httpMethod) {
        String name = param.getName().toLowerCase();
        String type = extractBaseType(param.getType());

        // Si c'est un DTO/objet complexe → @RequestBody
        if (isDtoType(type) || type.endsWith("ValueObject")) {
            return "@RequestBody ";
        }

        // Si le nom contient "id" → @PathVariable
        if (name.equals("id") || name.endsWith("id")) {
            return "@PathVariable ";
        }

        // GET/DELETE : parametres simples → @RequestParam
        if (httpMethod.equals("GET") || httpMethod.equals("DELETE")) {
            return "@RequestParam ";
        }

        // POST/PUT avec type simple → @RequestParam
        if (PRIMITIVE_TYPES.contains(type) || JAVA_LANG_TYPES.contains(type)
                || type.equals("BigDecimal") || type.equals("Date") || type.equals("LocalDate")) {
            return "@RequestParam ";
        }

        return "@RequestBody ";
    }

    /** G7 : Mappe le type de retour pour ResponseEntity */
    private String mapReturnType(String returnType) {
        if (returnType.equals("void")) return "Void";
        if (returnType.equals("int")) return "Integer";
        if (returnType.equals("long")) return "Long";
        if (returnType.equals("double")) return "Double";
        if (returnType.equals("float")) return "Float";
        if (returnType.equals("boolean")) return "Boolean";
        if (returnType.equals("byte[]")) return "byte[]";
        return returnType;
    }

    /** G5 : Derive le sous-chemin pour une methode multi-methodes */
    private String deriveSubPath(UseCaseInfo.MethodInfo method, HttpMapping mapping) {
        // Si la methode a un parametre "id" → ajouter /{id}
        boolean hasIdParam = method.getParameters().stream()
                .anyMatch(p -> p.getName().toLowerCase().equals("id") || p.getName().toLowerCase().endsWith("id"));

        String methodName = method.getName().toLowerCase();
        // Pour les methodes CRUD standard, pas de sous-chemin
        if (methodName.equals("findall") || methodName.equals("getall") || methodName.equals("listall")
                || methodName.equals("create") || methodName.equals("save") || methodName.equals("execute")) {
            if (hasIdParam && mapping.method.equals("GET")) return "/{" + getIdParamName(method) + "}";
            return "";
        }

        if (hasIdParam) {
            return "/{" + getIdParamName(method) + "}";
        }

        // Sinon, utiliser le nom de la methode comme sous-chemin
        return "/" + toKebabCase(method.getName());
    }

    // ===================== BUG N : resolveHttpMappingForMethod V2 (prend en compte returnType) =====================

    /**
     * BUG N : Version amelioree qui prend en compte le type de retour.
     * generate* + byte[] → GET (telechargement de fichier).
     */
    private HttpMapping resolveHttpMappingForMethod(String methodName, String returnType) {
        String name = methodName.toLowerCase();
        // BUG N : generate* + byte[] → GET (c'est un telechargement)
        if (name.startsWith("generate") && "byte[]".equals(returnType)) {
            return new HttpMapping("GET", "GetMapping", "200", "ResponseEntity.ok(result)");
        }
        // Deleguer a la version standard
        return resolveHttpMappingForMethod(methodName);
    }

    // ===================== BUG E : deriveSubPathV2 (deduplication des routes) =====================

    /**
     * BUG E : Version amelioree de deriveSubPath qui prend en compte
     * toutes les methodes du controller pour eviter les conflits.
     * BUG I : Genere des URLs RESTful (/{id} au lieu de /by-id/{id}).
     */
    private String deriveSubPathV2(UseCaseInfo.MethodInfo method, HttpMapping mapping,
                                    List<UseCaseInfo.MethodInfo> allMethods) {
        boolean hasIdParam = method.getParameters().stream()
                .anyMatch(p -> p.getName().toLowerCase().equals("id") || p.getName().toLowerCase().endsWith("id"));

        String methodName = method.getName().toLowerCase();

        // BUG I : CRUD standard → pas de sous-chemin (URL RESTful)
        if (methodName.equals("findall") || methodName.equals("getall") || methodName.equals("listall")
                || methodName.equals("list") || methodName.equals("findbyid") || methodName.equals("getbyid")
                || methodName.equals("create") || methodName.equals("save") || methodName.equals("execute")) {
            if (hasIdParam) return "/{" + getIdParamName(method) + "}";
            return "";
        }

        // BUG I : delete/update avec id → /{id} directement (RESTful)
        if ((methodName.startsWith("delete") || methodName.startsWith("remove")) && hasIdParam) {
            return "/{" + getIdParamName(method) + "}";
        }
        if ((methodName.startsWith("update") || methodName.startsWith("modify")) && hasIdParam) {
            return "/{" + getIdParamName(method) + "}";
        }

        // Methodes avec id mais pas CRUD standard → sous-chemin + /{id}
        if (hasIdParam) {
            return "/" + toKebabCase(method.getName()) + "/{" + getIdParamName(method) + "}";
        }

        // Sinon, utiliser le nom de la methode comme sous-chemin
        return "/" + toKebabCase(method.getName());
    }

    // ===================== BUG F + BUG J : resolveParameterAnnotationV2 =====================

    /**
     * BUG F : Garantit qu'un seul @RequestBody par methode.
     * BUG J : Les enums sont annotes @RequestParam, pas @RequestBody.
     */
    private String resolveParameterAnnotationV2(UseCaseInfo.ParameterInfo param, String httpMethod, boolean alreadyHasRequestBody) {
        String name = param.getName().toLowerCase();
        String type = extractBaseType(param.getType());

        // Si le nom contient "id" → @PathVariable
        if (name.equals("id") || name.endsWith("id")) {
            return "@PathVariable ";
        }

        // BUG J : Les enums sont des types simples → @RequestParam
        // Heuristique : type court sans suffixe DTO/Vo/Request, et pas un type Java standard
        // On verifie aussi si le type est un enum connu
        if (isEnumLikeType(type)) {
            return "@RequestParam ";
        }

        // Types primitifs et simples → @RequestParam
        if (PRIMITIVE_TYPES.contains(type) || JAVA_LANG_TYPES.contains(type)
                || type.equals("BigDecimal") || type.equals("Date") || type.equals("LocalDate")
                || type.equals("LocalDateTime")) {
            return "@RequestParam ";
        }

        // GET/DELETE : parametres simples → @RequestParam
        if (httpMethod.equals("GET") || httpMethod.equals("DELETE")) {
            return "@RequestParam ";
        }

        // BUG F : Si on a deja un @RequestBody, forcer @RequestParam
        if (alreadyHasRequestBody) {
            return "@RequestParam ";
        }

        // DTO/objet complexe → @RequestBody
        if (isDtoType(type) || type.endsWith("ValueObject")) {
            return "@RequestBody ";
        }

        return "@RequestBody ";
    }

    // ===================== BUG I : ensurePluralEndpoint =====================

    /**
     * BUG I : S'assure que l'endpoint REST est au pluriel (convention RESTful).
     * /api/account → /api/accounts
     */
    private String ensurePluralEndpoint(String endpoint) {
        if (endpoint == null || endpoint.isEmpty()) return endpoint;
        // Ne pas toucher si deja au pluriel
        if (endpoint.endsWith("s") || endpoint.endsWith("es")) return endpoint;
        // Regles simples de pluralisation
        if (endpoint.endsWith("y") && !endpoint.endsWith("ey") && !endpoint.endsWith("ay") && !endpoint.endsWith("oy")) {
            return endpoint.substring(0, endpoint.length() - 1) + "ies";
        }
        if (endpoint.endsWith("ch") || endpoint.endsWith("sh") || endpoint.endsWith("x") || endpoint.endsWith("z")) {
            return endpoint + "es";
        }
        return endpoint + "s";
    }

    // ===================== BUG J : Detection heuristique des enums =====================

    /**
     * BUG J : Detecte si un type est probablement un enum.
     * Heuristique : type court (1 mot), tout en majuscules, ou suffixe Type/Status/State/Mode/Kind.
     */
    private boolean isEnumLikeType(String type) {
        if (type == null || type.isEmpty()) return false;
        // Suffixes courants d'enum
        if (type.endsWith("Type") || type.endsWith("Status") || type.endsWith("State")
                || type.endsWith("Mode") || type.endsWith("Kind") || type.endsWith("Level")
                || type.endsWith("Category") || type.endsWith("Enum") || type.endsWith("Role")
                || type.endsWith("Direction") || type.endsWith("Format") || type.endsWith("Statut")
                || type.endsWith("Phase") || type.endsWith("Channel") || type.endsWith("Priority")
                || type.endsWith("Frequency") || type.endsWith("Currency")) {
            return true;
        }
        // Tout en majuscules (ex: DEVISE, PAYS)
        if (type.equals(type.toUpperCase()) && type.length() > 1 && !type.contains("[]")) {
            return true;
        }
        return false;
    }

    private String getIdParamName(UseCaseInfo.MethodInfo method) {
        return method.getParameters().stream()
                .filter(p -> p.getName().toLowerCase().equals("id") || p.getName().toLowerCase().endsWith("id"))
                .map(UseCaseInfo.ParameterInfo::getName)
                .findFirst()
                .orElse("id");
    }

    /** G4 : Genere le commentaire EJB type */
    private String generateEjbTypeComment(UseCaseInfo useCase) {
        if (useCase.getEjbType() == null) return "";
        return switch (useCase.getEjbType()) {
            case STATEFUL -> """
                    // ATTENTION: L'EJB source est @Stateful — l'etat conversationnel n'est pas
                    // reproduit dans cette facade REST stateless. Prevoir une gestion de session
                    // (token, cache Redis, etc.) si l'etat est necessaire.
                    """;
            case SINGLETON -> """
                    // EJB source @Singleton — le scope singleton est preserve cote Spring.
                    """;
            case MESSAGE_DRIVEN -> """
                    // L'EJB source est un @MessageDriven (MDB).
                    // Ce type d'EJB ne peut pas etre expose via REST.
                    """;
            default -> "";
        };
    }

    /** G11 : Derive un resume Swagger depuis le nom */
    private String deriveSwaggerSummary(String name) {
        // Retirer les suffixes courants
        String clean = name.replaceAll("(UC|Bean|Impl|Service|EJB)$", "");
        // CamelCase → mots separes
        String[] words = clean.split("(?=[A-Z])");
        return String.join(" ", words).trim().toLowerCase();
    }

    /** Convertit en kebab-case */
    private String toKebabCase(String camelCase) {
        // Supprimer les prefixes CRUD courants pour un kebab-case plus propre
        String clean = camelCase;
        return clean.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
    }

    /** Echappe les caracteres pour les strings Java */
    private String escapeJavaString(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ");
    }

    // ===================== BUG L : EXCEPTION → HTTP STATUS MAPPING =====================

    /**
     * BUG L : Mapping intelligent du nom d'exception vers le code HTTP.
     * Couvre les cas metier bancaires : AccountClosed→409, Unauthorized→403, etc.
     */
    private String resolveExceptionHttpStatus(String exceptionName) {
        String lower = exceptionName.toLowerCase();

        // 404 Not Found
        if (lower.contains("notfound") || lower.contains("inexistant") || lower.contains("introuvable")
                || lower.contains("unknown") || lower.contains("missing")) {
            return "HttpStatus.NOT_FOUND";
        }

        // 400 Bad Request
        if (lower.contains("validation") || lower.contains("invalid") || lower.contains("malformed")
                || lower.contains("badrequest") || lower.contains("illegalargument")) {
            return "HttpStatus.BAD_REQUEST";
        }

        // 403 Forbidden
        if (lower.contains("unauthorized") || lower.contains("forbidden") || lower.contains("access")
                || lower.contains("permission") || lower.contains("denied")) {
            return "HttpStatus.FORBIDDEN";
        }

        // 401 Unauthorized (authentification)
        if (lower.contains("authentication") || lower.contains("unauthenticated") || lower.contains("notauthenticated")) {
            return "HttpStatus.UNAUTHORIZED";
        }

        // 409 Conflict (etat incompatible, compte ferme, doublon)
        if (lower.contains("conflict") || lower.contains("duplicate") || lower.contains("closed")
                || lower.contains("already") || lower.contains("exists") || lower.contains("ferme")
                || lower.contains("cloture")) {
            return "HttpStatus.CONFLICT";
        }

        // 422 Unprocessable Entity (erreur metier, solde insuffisant)
        if (lower.contains("insufficient") || lower.contains("business") || lower.contains("insuffisant")
                || lower.contains("metier") || lower.contains("limit") || lower.contains("exceeded")
                || lower.contains("depasse")) {
            return "HttpStatus.UNPROCESSABLE_ENTITY";
        }

        // 503 Service Unavailable (service indisponible)
        if (lower.contains("unavailable") || lower.contains("indisponible") || lower.contains("timeout")
                || lower.contains("naming") || lower.contains("jndi")) {
            return "HttpStatus.SERVICE_UNAVAILABLE";
        }

        // 429 Too Many Requests
        if (lower.contains("ratelimit") || lower.contains("throttle") || lower.contains("toomany")) {
            return "HttpStatus.TOO_MANY_REQUESTS";
        }

        // Default : 500 Internal Server Error
        return "HttpStatus.INTERNAL_SERVER_ERROR";
    }
}
