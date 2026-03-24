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

/**
 * Moteur de génération de code.
 * <p>
 * Génère un projet Spring Boot complet à partir du résultat de l'analyse
 * d'un projet EJB. Produit les controllers REST, les service adapters,
 * les DTO (avec support JSON et XML/JAXB), la configuration JNDI,
 * le logging, la gestion des exceptions, le pom.xml et le README.
 * </p>
 * <p>
 * Règles appliquées :
 * <ul>
 *   <li>R1 : Filtrage des champs static final (serialVersionUID, constantes, loggers)</li>
 *   <li>R2 : Résolution automatique des imports selon les types détectés</li>
 *   <li>R3 : Nommage cohérent des classes de test</li>
 *   <li>R4 : @NotBlank/@NotNull uniquement sur les champs required</li>
 *   <li>R5 : Codes HTTP adaptés au type d'opération</li>
 *   <li>R6 : Préservation de @XmlElementWrapper pour les listes</li>
 *   <li>R7 : Cast typé BaseUseCase dans les ServiceAdapters</li>
 *   <li>R8 : Pas de dépendance Maven inutilisée (Lombok supprimé)</li>
 * </ul>
 * </p>
 */
@Component
public class CodeGenerationEngine {

    private static final Logger log = LoggerFactory.getLogger(CodeGenerationEngine.class);

    private static final String BASE_PACKAGE = "com.bank.api";
    private static final String BASE_PACKAGE_PATH = "com/bank/api";

    /** RÈGLE 2 : Table de mapping type → import */
    private static final Map<String, String> TYPE_IMPORT_MAP = Map.ofEntries(
            Map.entry("BigDecimal", "java.math.BigDecimal"),
            Map.entry("BigInteger", "java.math.BigInteger"),
            Map.entry("List", "java.util.List"),
            Map.entry("ArrayList", "java.util.ArrayList"),
            Map.entry("Map", "java.util.Map"),
            Map.entry("HashMap", "java.util.HashMap"),
            Map.entry("Set", "java.util.Set"),
            Map.entry("HashSet", "java.util.HashSet"),
            Map.entry("Date", "java.util.Date"),
            Map.entry("LocalDate", "java.time.LocalDate"),
            Map.entry("LocalDateTime", "java.time.LocalDateTime"),
            Map.entry("Instant", "java.time.Instant"),
            Map.entry("Optional", "java.util.Optional"),
            Map.entry("Collection", "java.util.Collection")
    );

    /** Types du package java.lang qui ne nécessitent pas d'import */
    private static final Set<String> JAVA_LANG_TYPES = Set.of(
            "String", "Integer", "Long", "Double", "Float", "Boolean",
            "Byte", "Short", "Character", "Object", "Number", "Void"
    );

    /** Types primitifs Java */
    private static final Set<String> PRIMITIVE_TYPES = Set.of(
            "int", "long", "double", "float", "boolean", "byte", "short", "char"
    );

    /**
     * Génère le projet API REST complet.
     */
    public Path generateProject(ProjectAnalysisResult analysisResult, Path outputDir) throws IOException {
        log.info("Début de la génération du projet API REST");

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

        Path resourcesDir = projectRoot.resolve("src/main/resources");
        Files.createDirectories(resourcesDir);

        // Déterminer si le projet a besoin du support XML
        boolean projectHasXml = analysisResult.getUseCases().stream().anyMatch(UseCaseInfo::hasXmlSupport)
                || analysisResult.getDtos().stream().anyMatch(DtoInfo::hasJaxbAnnotations);

        // Déterminer si des champs ont des validations required
        boolean projectHasValidation = analysisResult.getDtos().stream()
                .flatMap(dto -> dto.getFields().stream())
                .anyMatch(DtoInfo.FieldInfo::isRequired);

        generatePomXml(projectRoot, projectHasXml, projectHasValidation);
        generateApplicationClass(srcMain);
        generateApplicationProperties(resourcesDir);
        generateGlobalExceptionHandler(srcMain);
        generateLoggingAspect(srcMain);
        generateEjbLookupConfig(srcMain);
        generateBaseUseCaseInterface(srcMain);
        generateValueObjectInterface(srcMain);

        if (projectHasXml) {
            generateXmlConfig(srcMain);
        }

        for (UseCaseInfo useCase : analysisResult.getUseCases()) {
            generateController(srcMain, useCase);
            generateServiceAdapter(srcMain, useCase);
        }

        for (DtoInfo dto : analysisResult.getDtos()) {
            generateDtoClass(srcMain, dto);
        }

        generateReadme(projectRoot, analysisResult, projectHasXml);

        log.info("Génération terminée dans : {}", projectRoot);
        return projectRoot;
    }

    // ==================== POM.XML (RÈGLE 8 : pas de Lombok) ====================

    private void generatePomXml(Path projectRoot, boolean includeXml, boolean includeValidation) throws IOException {
        StringBuilder deps = new StringBuilder();
        deps.append("""
                        <!-- Spring Boot Web -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-web</artifactId>
                        </dependency>
                
                        <!-- Spring Boot AOP (pour le logging aspect) -->
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
                """);

        if (includeValidation) {
            deps.append("""
                
                        <!-- Bean Validation (pour @NotBlank, @NotNull) -->
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
                
                        <!-- Jackson XML (pour le support JSON + XML dans Spring) -->
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
        log.info("pom.xml généré (XML: {}, Validation: {}, Lombok: supprimé)", includeXml, includeValidation);
    }

    // ==================== APPLICATION CLASS ====================

    private void generateApplicationClass(Path srcMain) throws IOException {
        String code = """
                package %s;
                
                import org.springframework.boot.SpringApplication;
                import org.springframework.boot.autoconfigure.SpringBootApplication;
                
                /**
                 * Point d'entree de l'API REST generee.
                 */
                @SpringBootApplication
                public class Application {
                
                    public static void main(String[] args) {
                        SpringApplication.run(Application.class, args);
                    }
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(srcMain.resolve("Application.java"), code);
    }

    // ==================== APPLICATION PROPERTIES ====================

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
                """;

        Files.writeString(resourcesDir.resolve("application.properties"), props);
    }

    // ==================== RÈGLE 7 : BaseUseCase et ValueObject interfaces ====================

    private void generateBaseUseCaseInterface(Path srcMain) throws IOException {
        String code = """
                package %s.ejb.interfaces;
                
                /**
                 * Interface BaseUseCase recopiee depuis le projet EJB source.
                 * Permet le cast type lors du lookup JNDI des EJB.
                 */
                public interface BaseUseCase {
                
                    /**
                     * Execute le cas d'utilisation.
                     *
                     * @param input ValueObject d'entree
                     * @return ValueObject de sortie
                     * @throws Exception en cas d'erreur metier
                     */
                    ValueObject execute(ValueObject input) throws Exception;
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(srcMain.resolve("ejb/interfaces/BaseUseCase.java"), code);
        log.info("Interface BaseUseCase générée");
    }

    private void generateValueObjectInterface(Path srcMain) throws IOException {
        String code = """
                package %s.ejb.interfaces;
                
                import java.io.Serializable;
                
                /**
                 * Interface ValueObject recopiee depuis le projet EJB source.
                 * Tous les DTOs VoIn/VoOut implementent cette interface.
                 */
                public interface ValueObject extends Serializable {
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(srcMain.resolve("ejb/interfaces/ValueObject.java"), code);
        log.info("Interface ValueObject générée");
    }

    // ==================== XML CONFIGURATION ====================

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
                
                /**
                 * Configuration pour le support de la negociation de contenu JSON/XML.
                 */
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
        log.info("ContentNegotiationConfig généré (support JSON + XML)");
    }

    // ==================== CONTROLLER (RÈGLE 5 : codes HTTP adaptés) ====================

    private void generateController(Path srcMain, UseCaseInfo useCase) throws IOException {
        String inputDto = useCase.getInputDtoClassName();
        String outputDto = useCase.getOutputDtoClassName();
        String controllerName = useCase.getControllerName();
        String adapterName = useCase.getServiceAdapterName();
        String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);
        String endpoint = useCase.getRestEndpoint();
        boolean hasXml = useCase.hasXmlSupport();

        // RÈGLE 5 : Déterminer le code HTTP selon le type d'opération
        String httpStatusCode = determineHttpStatus(useCase.getClassName());
        String httpStatusImport = httpStatusCode.equals("ResponseEntity.ok(result)")
                ? "" : "\nimport org.springframework.http.HttpStatus;";

        // Construire les produces/consumes
        String producesConsumes = "";
        if (hasXml) {
            producesConsumes = """
                    ,
                        produces = { "application/json", "application/xml" },
                        consumes = { "application/json", "application/xml" }""";
        }

        // Déterminer si le VoIn a des validations
        boolean hasValidation = useCase.isInputDtoHasRequiredFields();
        String validAnnotation = hasValidation ? "@Valid " : "";
        String validImport = hasValidation ? "\nimport jakarta.validation.Valid;" : "";

        String code = """
                package %s.controller;
                
                import %s.dto.%s;
                import %s.dto.%s;
                import %s.service.%s;
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.http.ResponseEntity;
                import org.springframework.web.bind.annotation.*;%s%s
                
                /**
                 * Controller REST pour le UseCase %s.
                 * Expose le endpoint %s en POST.%s
                 */
                @RestController
                @RequestMapping(value = "%s"%s)
                public class %s {
                
                    private static final Logger log = LoggerFactory.getLogger(%s.class);
                
                    private final %s %s;
                
                    public %s(%s %s) {
                        this.%s = %s;
                    }
                
                    @PostMapping
                    public ResponseEntity<%s> execute(%s@RequestBody %s input) {
                        log.info("Requete recue sur %s");
                        try {
                            log.debug("Appel du UseCase %s avec input : {}", input);
                            %s result = %s.execute(input);
                            log.info("UseCase %s execute avec succes");
                            return %s;
                        } catch (Exception e) {
                            log.error("Erreur lors de l'execution du UseCase %s", e);
                            throw new RuntimeException("Erreur lors de l'appel au UseCase %s", e);
                        }
                    }
                }
                """.formatted(
                BASE_PACKAGE,
                BASE_PACKAGE, inputDto,
                BASE_PACKAGE, outputDto,
                BASE_PACKAGE, adapterName,
                httpStatusImport, validImport,
                useCase.getClassName(),
                endpoint,
                hasXml ? "\n * Supporte les formats JSON et XML (negociation de contenu)." : "",
                endpoint, producesConsumes,
                controllerName,
                controllerName,
                adapterName, adapterField,
                controllerName, adapterName, adapterField,
                adapterField, adapterField,
                outputDto, validAnnotation, inputDto,
                endpoint,
                useCase.getClassName(),
                outputDto, adapterField,
                useCase.getClassName(),
                httpStatusCode,
                useCase.getClassName(),
                useCase.getClassName()
        );

        Files.writeString(srcMain.resolve("controller/" + controllerName + ".java"), code);
        log.info("Controller généré : {} (XML: {}, HTTP: {})", controllerName, hasXml, httpStatusCode);
    }

    /**
     * RÈGLE 5 : Détermine le code HTTP selon le nom du UseCase.
     */
    private String determineHttpStatus(String useCaseClassName) {
        String name = useCaseClassName.toLowerCase();
        if (name.contains("create") || name.contains("add") || name.contains("register")
                || name.contains("open") || name.contains("insert") || name.contains("souscri")) {
            return "ResponseEntity.status(HttpStatus.CREATED).body(result)";
        }
        if (name.contains("delete") || name.contains("remove") || name.contains("close")) {
            return "ResponseEntity.noContent().build()";
        }
        // Par défaut : consultation ou mise à jour → 200 OK
        return "ResponseEntity.ok(result)";
    }

    // ==================== SERVICE ADAPTER (RÈGLE 7 : cast typé) ====================

    private void generateServiceAdapter(Path srcMain, UseCaseInfo useCase) throws IOException {
        String inputDto = useCase.getInputDtoClassName();
        String outputDto = useCase.getOutputDtoClassName();
        String adapterName = useCase.getServiceAdapterName();
        String jndiName = useCase.getJndiName();
        String ucClassName = useCase.getClassName();

        String code = """
                package %s.service;
                
                import %s.dto.%s;
                import %s.dto.%s;
                import %s.ejb.interfaces.BaseUseCase;
                import %s.ejb.interfaces.ValueObject;
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.beans.factory.annotation.Value;
                import org.springframework.stereotype.Service;
                
                import javax.naming.Context;
                import javax.naming.InitialContext;
                import javax.naming.NamingException;
                import java.util.Properties;
                
                /**
                 * Service adapter pour le UseCase %s.
                 * Realise le lookup JNDI pour appeler l'EJB distant.
                 * Utilise un cast type vers BaseUseCase (pas de reflexion).
                 */
                @Service
                public class %s {
                
                    private static final Logger log = LoggerFactory.getLogger(%s.class);
                
                    @Value("${ejb.jndi.provider.url:localhost:1099}")
                    private String jndiProviderUrl;
                
                    @Value("${ejb.jndi.factory:org.jboss.naming.remote.client.InitialContextFactory}")
                    private String jndiFactory;
                
                    /**
                     * Execute le UseCase EJB via lookup JNDI.
                     * Cast direct vers BaseUseCase au lieu de la reflexion.
                     *
                     * @param input DTO d'entree
                     * @return DTO de sortie
                     * @throws Exception en cas d'erreur JNDI ou metier
                     */
                    public %s execute(%s input) throws Exception {
                        log.info("Lookup JNDI pour %s");
                
                        Properties props = new Properties();
                        props.put(Context.INITIAL_CONTEXT_FACTORY, jndiFactory);
                        props.put(Context.PROVIDER_URL, jndiProviderUrl);
                
                        InitialContext ctx = null;
                        try {
                            ctx = new InitialContext(props);
                            // Cast direct vers l'interface BaseUseCase
                            BaseUseCase useCase = (BaseUseCase) ctx.lookup("%s");
                            log.debug("EJB %s trouve via JNDI");
                
                            // Appel typé de execute(ValueObject)
                            ValueObject result = useCase.execute(input);
                            return (%s) result;
                        } finally {
                            if (ctx != null) {
                                try {
                                    ctx.close();
                                } catch (NamingException e) {
                                    log.warn("Erreur lors de la fermeture du contexte JNDI", e);
                                }
                            }
                        }
                    }
                }
                """.formatted(
                BASE_PACKAGE,
                BASE_PACKAGE, inputDto,
                BASE_PACKAGE, outputDto,
                BASE_PACKAGE,
                BASE_PACKAGE,
                ucClassName,
                adapterName,
                adapterName,
                outputDto, inputDto,
                ucClassName,
                jndiName,
                ucClassName,
                outputDto
        );

        Files.writeString(srcMain.resolve("service/" + adapterName + ".java"), code);
        log.info("Service adapter généré : {} (cast typé BaseUseCase)", adapterName);
    }

    // ==================== DTO (RÈGLES 1, 2, 4, 6) ====================

    private void generateDtoClass(Path srcMain, DtoInfo dto) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".dto;\n\n");

        // RÈGLE 2 : Collecter les imports nécessaires
        Set<String> imports = new TreeSet<>();
        // Serializable n'est plus nécessaire pour les DTOs REST (Jackson/JAXB gèrent la sérialisation)

        // Import de l'interface ValueObject pour les VoIn (pour le cast dans ServiceAdapter)
        boolean isVoIn = dto.getClassName().endsWith("VoIn") || dto.getClassName().endsWith("VOIn")
                || dto.getClassName().endsWith("Input") || dto.getClassName().endsWith("Request");
        if (isVoIn) {
            imports.add(BASE_PACKAGE + ".ejb.interfaces.ValueObject");
        }

        // Imports JAXB si nécessaire
        boolean hasJaxb = dto.hasJaxbAnnotations();
        if (hasJaxb) {
            imports.add("jakarta.xml.bind.annotation.*");
        }
        // Import Jackson XML si JAXB détecté
        if (dto.isHasXmlRootElement() || hasJaxb) {
            imports.add("com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlRootElement");
        }

        // RÈGLE 6 : Vérifier si @XmlElementWrapper est utilisé
        boolean hasXmlElementWrapper = dto.getFields().stream()
                .anyMatch(DtoInfo.FieldInfo::isHasXmlElementWrapper);
        if (hasXmlElementWrapper && !hasJaxb) {
            // Si pas déjà importé via le wildcard
            imports.add("jakarta.xml.bind.annotation.XmlElementWrapper");
            imports.add("jakarta.xml.bind.annotation.XmlElement");
        }

        // RÈGLE 4 : Imports de validation si des champs sont required
        boolean hasRequiredStringFields = false;
        boolean hasRequiredNonStringFields = false;
        boolean hasRequiredListFields = false;

        for (DtoInfo.FieldInfo field : dto.getFields()) {
            // Ignorer les champs static final (RÈGLE 1)
            if (field.isStatic() && field.isFinal()) continue;

            if (field.isRequired()) {
                String baseType = extractBaseType(field.getType());
                if (baseType.equals("String")) {
                    hasRequiredStringFields = true;
                } else if (baseType.equals("List") || baseType.equals("Set") || baseType.equals("Collection")) {
                    hasRequiredListFields = true;
                } else if (!PRIMITIVE_TYPES.contains(baseType)) {
                    hasRequiredNonStringFields = true;
                }
            }

            // RÈGLE 2 : Résoudre les imports pour chaque type de champ
            resolveTypeImports(field.getType(), imports);
        }

        if (hasRequiredStringFields) {
            imports.add("jakarta.validation.constraints.NotBlank");
        }
        if (hasRequiredNonStringFields || hasRequiredListFields) {
            imports.add("jakarta.validation.constraints.NotNull");
        }
        if (hasRequiredListFields) {
            imports.add("jakarta.validation.constraints.Size");
        }

        // Écrire les imports
        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }

        sb.append("\n");
        sb.append("/**\n");
        sb.append(" * DTO genere automatiquement pour ").append(dto.getClassName()).append(".\n");
        sb.append(" * Utilise comme objet d'echange ");
        if (hasJaxb) {
            sb.append("JSON et XML ");
        } else {
            sb.append("JSON ");
        }
        sb.append("dans l'API REST.\n");
        sb.append(" */\n");

        // Annotations JAXB au niveau de la classe
        if (dto.isHasXmlRootElement()) {
            if (dto.getXmlRootElementName() != null) {
                sb.append("@XmlRootElement(name = \"").append(dto.getXmlRootElementName()).append("\")\n");
                sb.append("@JacksonXmlRootElement(localName = \"").append(dto.getXmlRootElementName()).append("\")\n");
            } else {
                String defaultName = Character.toLowerCase(dto.getClassName().charAt(0)) + dto.getClassName().substring(1);
                sb.append("@XmlRootElement(name = \"").append(defaultName).append("\")\n");
                sb.append("@JacksonXmlRootElement(localName = \"").append(defaultName).append("\")\n");
            }
        } else if (hasJaxb) {
            String defaultName = Character.toLowerCase(dto.getClassName().charAt(0)) + dto.getClassName().substring(1);
            sb.append("@XmlRootElement(name = \"").append(defaultName).append("\")\n");
            sb.append("@JacksonXmlRootElement(localName = \"").append(defaultName).append("\")\n");
        }

        if (dto.isHasXmlAccessorType()) {
            sb.append("@XmlAccessorType(").append(dto.getXmlAccessorTypeValue() != null ? dto.getXmlAccessorTypeValue() : "XmlAccessType.FIELD").append(")\n");
        } else if (hasJaxb) {
            sb.append("@XmlAccessorType(XmlAccessType.FIELD)\n");
        }

        if (dto.isHasXmlType()) {
            sb.append("@XmlType\n");
        }

        // Déclaration de la classe
        sb.append("public class ").append(dto.getClassName());

        if (dto.getParentClassName() != null && !dto.getParentClassName().equals("Object")
                && !dto.getParentClassName().equals("ValueObject")) {
            sb.append(" extends ").append(dto.getParentClassName());
        }

        // Les VoIn implémentent ValueObject pour le cast dans ServiceAdapter
        if (isVoIn) {
            sb.append(" implements ValueObject");
        }
        // Note : pas de Serializable car les DTOs REST utilisent Jackson/JAXB, pas la sérialisation Java native
        sb.append(" {\n\n");

        // RÈGLE 1 : Filtrer les champs - exclure serialVersionUID, loggers, et champs static final inutiles
        // Les DTOs REST n'ont pas besoin de serialVersionUID (pas de sérialisation Java native)
        List<DtoInfo.FieldInfo> instanceFields = new ArrayList<>();
        List<DtoInfo.FieldInfo> constantFields = new ArrayList<>();

        for (DtoInfo.FieldInfo field : dto.getFields()) {
            // Exclure serialVersionUID (inutile en REST)
            if (field.getName().equals("serialVersionUID")) continue;
            // Exclure les loggers
            if (isLoggerField(field)) continue;
            // Séparer les constantes des champs d'instance
            if (field.isStatic() && field.isFinal()) {
                constantFields.add(field);
            } else {
                instanceFields.add(field);
            }
        }

        // Écrire les constantes métier (pas serialVersionUID, pas logger)
        for (DtoInfo.FieldInfo field : constantFields) {
            sb.append("    private static final ").append(field.getType()).append(" ").append(field.getName());
            sb.append(";\n");
        }
        if (!constantFields.isEmpty()) {
            sb.append("\n");
        }

        // Écrire les champs d'instance avec annotations JAXB et validation
        for (DtoInfo.FieldInfo field : instanceFields) {
            // RÈGLE 6 : @XmlElementWrapper avant @XmlElement pour les listes
            if (field.isHasXmlElementWrapper()) {
                if (field.getXmlElementWrapperName() != null) {
                    sb.append("    @XmlElementWrapper(name = \"").append(field.getXmlElementWrapperName()).append("\")\n");
                } else {
                    sb.append("    @XmlElementWrapper\n");
                }
            }

            // @XmlElement
            if (field.isHasXmlElement()) {
                StringBuilder xmlElementAnnot = new StringBuilder("    @XmlElement");
                List<String> xmlElementAttrs = new ArrayList<>();
                if (field.getXmlName() != null) {
                    xmlElementAttrs.add("name = \"" + field.getXmlName() + "\"");
                }
                if (field.isRequired()) {
                    xmlElementAttrs.add("required = true");
                }
                if (!xmlElementAttrs.isEmpty()) {
                    xmlElementAnnot.append("(").append(String.join(", ", xmlElementAttrs)).append(")");
                }
                sb.append(xmlElementAnnot).append("\n");
            }

            // @XmlAttribute
            if (field.isHasXmlAttribute()) {
                if (field.getXmlName() != null) {
                    sb.append("    @XmlAttribute(name = \"").append(field.getXmlName()).append("\")\n");
                } else {
                    sb.append("    @XmlAttribute\n");
                }
            }

            // RÈGLE 4 : Annotations de validation uniquement sur les champs required
            if (field.isRequired()) {
                String baseType = extractBaseType(field.getType());
                if (baseType.equals("String")) {
                    sb.append("    @NotBlank\n");
                } else if (baseType.equals("List") || baseType.equals("Set") || baseType.equals("Collection")) {
                    sb.append("    @NotNull\n");
                    sb.append("    @Size(min = 1)\n");
                } else if (!PRIMITIVE_TYPES.contains(baseType)) {
                    sb.append("    @NotNull\n");
                }
            }

            sb.append("    private ").append(field.getType()).append(" ").append(field.getName()).append(";\n");
        }

        sb.append("\n");

        // Constructeur par défaut
        sb.append("    public ").append(dto.getClassName()).append("() {\n");
        sb.append("    }\n\n");

        // RÈGLE 1 : Getters et Setters UNIQUEMENT pour les champs d'instance
        for (DtoInfo.FieldInfo field : instanceFields) {
            String capitalizedName = Character.toUpperCase(field.getName().charAt(0)) + field.getName().substring(1);
            String getterPrefix = field.getType().equals("boolean") ? "is" : "get";

            sb.append("    public ").append(field.getType()).append(" ").append(getterPrefix).append(capitalizedName).append("() {\n");
            sb.append("        return ").append(field.getName()).append(";\n");
            sb.append("    }\n\n");

            sb.append("    public void set").append(capitalizedName).append("(").append(field.getType()).append(" ").append(field.getName()).append(") {\n");
            sb.append("        this.").append(field.getName()).append(" = ").append(field.getName()).append(";\n");
            sb.append("    }\n\n");
        }

        // RÈGLE 1 : toString UNIQUEMENT avec les champs d'instance
        sb.append("    @Override\n");
        sb.append("    public String toString() {\n");
        sb.append("        return \"").append(dto.getClassName()).append("{");
        for (int i = 0; i < instanceFields.size(); i++) {
            DtoInfo.FieldInfo field = instanceFields.get(i);
            if (i > 0) sb.append(", ");
            sb.append(field.getName()).append("='\" + ").append(field.getName()).append(" + \"'");
        }
        sb.append("}\";\n");
        sb.append("    }\n");

        sb.append("}\n");

        Files.writeString(srcMain.resolve("dto/" + dto.getClassName() + ".java"), sb.toString());
        log.info("DTO généré : {} (JAXB: {}, champs instance: {}, constantes: {})",
                dto.getClassName(), hasJaxb, instanceFields.size(), constantFields.size());
    }

    /**
     * RÈGLE 2 : Résout les imports nécessaires pour un type donné.
     */
    private void resolveTypeImports(String type, Set<String> imports) {
        // Extraire le type de base (avant les génériques)
        String baseType = extractBaseType(type);

        // Vérifier si le type de base nécessite un import
        if (TYPE_IMPORT_MAP.containsKey(baseType)) {
            imports.add(TYPE_IMPORT_MAP.get(baseType));
        }

        // Traiter les types génériques : List<String>, Map<String, BigDecimal>, etc.
        if (type.contains("<")) {
            String genericPart = type.substring(type.indexOf('<') + 1, type.lastIndexOf('>'));
            // Gérer les types multiples séparés par des virgules
            for (String paramType : genericPart.split(",")) {
                String trimmed = paramType.trim();
                // Récursion pour les types imbriqués
                resolveTypeImports(trimmed, imports);
            }
        }
    }

    /**
     * Extrait le type de base d'un type potentiellement générique.
     * Ex: "List<String>" → "List", "BigDecimal" → "BigDecimal"
     */
    private String extractBaseType(String type) {
        if (type.contains("<")) {
            return type.substring(0, type.indexOf('<')).trim();
        }
        return type.trim();
    }

    /**
     * RÈGLE 1 : Vérifie si un champ est un logger.
     */
    private boolean isLoggerField(DtoInfo.FieldInfo field) {
        String name = field.getName().toLowerCase();
        String type = field.getType().toLowerCase();
        return name.equals("logger") || name.equals("log") || name.equals("log_")
                || type.contains("logger") || type.contains("log4j");
    }

    // ==================== GLOBAL EXCEPTION HANDLER ====================

    private void generateGlobalExceptionHandler(Path srcMain) throws IOException {
        String code = """
                package %s.exception;
                
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.http.HttpStatus;
                import org.springframework.http.ResponseEntity;
                import org.springframework.web.bind.annotation.ControllerAdvice;
                import org.springframework.web.bind.annotation.ExceptionHandler;
                
                import java.time.LocalDateTime;
                import java.util.LinkedHashMap;
                import java.util.Map;
                
                /**
                 * Gestionnaire global des exceptions.
                 * Intercepte toutes les exceptions non gerees et retourne
                 * des reponses JSON/XML structurees.
                 */
                @ControllerAdvice
                public class GlobalExceptionHandler {
                
                    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
                
                    @ExceptionHandler(RuntimeException.class)
                    public ResponseEntity<Map<String, Object>> handleRuntimeException(RuntimeException ex) {
                        log.error("Erreur runtime interceptee", ex);
                        return buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
                    }
                
                    @ExceptionHandler(IllegalArgumentException.class)
                    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
                        log.warn("Argument invalide", ex);
                        return buildErrorResponse(HttpStatus.BAD_REQUEST, ex.getMessage());
                    }
                
                    @ExceptionHandler(Exception.class)
                    public ResponseEntity<Map<String, Object>> handleGenericException(Exception ex) {
                        log.error("Erreur inattendue", ex);
                        return buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur interne du serveur");
                    }
                
                    private ResponseEntity<Map<String, Object>> buildErrorResponse(HttpStatus status, String message) {
                        Map<String, Object> body = new LinkedHashMap<>();
                        body.put("timestamp", LocalDateTime.now().toString());
                        body.put("status", status.value());
                        body.put("error", status.getReasonPhrase());
                        body.put("message", message);
                        return new ResponseEntity<>(body, status);
                    }
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(srcMain.resolve("exception/GlobalExceptionHandler.java"), code);
    }

    // ==================== LOGGING ASPECT ====================

    private void generateLoggingAspect(Path srcMain) throws IOException {
        String code = """
                package %s.logging;
                
                import org.aspectj.lang.ProceedingJoinPoint;
                import org.aspectj.lang.annotation.Around;
                import org.aspectj.lang.annotation.Aspect;
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.stereotype.Component;
                
                /**
                 * Aspect de logging transversal.
                 * Intercepte tous les appels aux controllers et services
                 * pour logger automatiquement les entrees/sorties.
                 */
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
                            long duration = System.currentTimeMillis() - startTime;
                            log.info("<< Sortie : {} ({}ms)", methodName, duration);
                            return result;
                        } catch (Throwable ex) {
                            long duration = System.currentTimeMillis() - startTime;
                            log.error("!! Erreur : {} ({}ms) - {}", methodName, duration, ex.getMessage());
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
                            long duration = System.currentTimeMillis() - startTime;
                            log.debug("<< Service : {} ({}ms)", methodName, duration);
                            return result;
                        } catch (Throwable ex) {
                            long duration = System.currentTimeMillis() - startTime;
                            log.error("!! Service Erreur : {} ({}ms) - {}", methodName, duration, ex.getMessage());
                            throw ex;
                        }
                    }
                }
                """.formatted(BASE_PACKAGE, BASE_PACKAGE, BASE_PACKAGE);

        Files.writeString(srcMain.resolve("logging/LoggingAspect.java"), code);
    }

    // ==================== EJB LOOKUP CONFIG ====================

    private void generateEjbLookupConfig(Path srcMain) throws IOException {
        String code = """
                package %s.config;
                
                import org.springframework.beans.factory.annotation.Value;
                import org.springframework.context.annotation.Configuration;
                
                /**
                 * Configuration centralisee pour les lookups JNDI EJB.
                 * Les proprietes sont definies dans application.properties.
                 */
                @Configuration
                public class EjbLookupConfig {
                
                    @Value("${ejb.jndi.provider.url:localhost:1099}")
                    private String providerUrl;
                
                    @Value("${ejb.jndi.factory:org.jboss.naming.remote.client.InitialContextFactory}")
                    private String contextFactory;
                
                    public String getProviderUrl() {
                        return providerUrl;
                    }
                
                    public String getContextFactory() {
                        return contextFactory;
                    }
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(srcMain.resolve("config/EjbLookupConfig.java"), code);
    }

    // ==================== README ====================

    private void generateReadme(Path projectRoot, ProjectAnalysisResult analysisResult, boolean hasXml) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Generated REST API\n\n");
        sb.append("API REST generee automatiquement a partir d'un projet EJB.\n\n");

        sb.append("## Prerequis\n\n");
        sb.append("- Java 21\n");
        sb.append("- Maven 3.8+\n");
        sb.append("- Serveur d'applications EJB accessible via JNDI\n\n");

        sb.append("## Compilation\n\n");
        sb.append("```bash\nmvn clean package\n```\n\n");

        sb.append("## Execution\n\n");
        sb.append("```bash\njava -jar target/generated-rest-api-1.0.0-SNAPSHOT.jar\n```\n\n");

        sb.append("## Configuration\n\n");
        sb.append("Modifier `src/main/resources/application.properties` pour configurer :\n\n");
        sb.append("- `server.port` : port du serveur (defaut: 8081)\n");
        sb.append("- `ejb.jndi.provider.url` : URL du serveur JNDI\n");
        sb.append("- `ejb.jndi.factory` : factory JNDI\n\n");

        sb.append("## Architecture\n\n");
        sb.append("Le projet utilise le pattern **Strangler Fig** via JNDI :\n\n");
        sb.append("```\n");
        sb.append("Client HTTP → Controller REST → ServiceAdapter → JNDI Lookup → EJB\n");
        sb.append("```\n\n");
        sb.append("Les ServiceAdapters utilisent un **cast typé** vers l'interface `BaseUseCase`\n");
        sb.append("(pas de réflexion), ce qui garantit la sécurité de type à la compilation.\n\n");

        // Section formats supportés
        sb.append("## Formats supportes\n\n");
        sb.append("L'API supporte les formats suivants :\n\n");
        sb.append("- **JSON** (par defaut) : `Content-Type: application/json`\n");
        if (hasXml) {
            sb.append("- **XML** : `Content-Type: application/xml`\n\n");
            sb.append("### Negociation de contenu\n\n");
            sb.append("Le format de reponse peut etre choisi de deux manieres :\n\n");
            sb.append("1. **En-tete Accept** :\n");
            sb.append("   ```\n");
            sb.append("   Accept: application/json\n");
            sb.append("   Accept: application/xml\n");
            sb.append("   ```\n\n");
            sb.append("2. **Parametre de requete** :\n");
            sb.append("   ```\n");
            sb.append("   GET /api/endpoint?format=json\n");
            sb.append("   GET /api/endpoint?format=xml\n");
            sb.append("   ```\n\n");
        }

        sb.append("## Endpoints REST\n\n");
        sb.append("| UseCase | Endpoint | Methode | DTO Entree | DTO Sortie | Format | HTTP Status |\n");
        sb.append("|---------|----------|---------|------------|------------|--------|-------------|\n");
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            String httpCode = determineHttpStatusLabel(uc.getClassName());
            sb.append("| ").append(uc.getClassName())
              .append(" | ").append(uc.getRestEndpoint())
              .append(" | POST")
              .append(" | ").append(uc.getInputDtoClassName())
              .append(" | ").append(uc.getOutputDtoClassName())
              .append(" | ").append(uc.getSerializationFormat().getLabel())
              .append(" | ").append(httpCode)
              .append(" |\n");
        }

        sb.append("\n## Structure du projet\n\n");
        sb.append("```\n");
        sb.append("src/main/java/com/bank/api/\n");
        sb.append("  controller/       - Controllers REST\n");
        sb.append("  service/          - Service Adapters (JNDI lookup avec cast type)\n");
        sb.append("  dto/              - Objets de transfert JSON");
        if (hasXml) sb.append("/XML");
        sb.append("\n");
        sb.append("  config/           - Configuration JNDI");
        if (hasXml) sb.append(" et negociation de contenu");
        sb.append("\n");
        sb.append("  ejb/interfaces/   - Interfaces BaseUseCase et ValueObject\n");
        sb.append("  exception/        - Gestion globale des erreurs\n");
        sb.append("  logging/          - Aspect de logging\n");
        sb.append("  Application.java\n");
        sb.append("```\n");

        Files.writeString(projectRoot.resolve("README.md"), sb.toString());
        log.info("README.md généré");
    }

    private String determineHttpStatusLabel(String useCaseClassName) {
        String name = useCaseClassName.toLowerCase();
        if (name.contains("create") || name.contains("add") || name.contains("register")
                || name.contains("open") || name.contains("insert") || name.contains("souscri")) {
            return "201 CREATED";
        }
        if (name.contains("delete") || name.contains("remove") || name.contains("close")) {
            return "204 NO_CONTENT";
        }
        return "200 OK";
    }
}
