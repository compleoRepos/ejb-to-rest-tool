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
import java.util.List;

/**
 * Moteur de génération de code.
 * <p>
 * Génère un projet Spring Boot complet à partir du résultat de l'analyse
 * d'un projet EJB. Produit les controllers REST, les service adapters,
 * les DTO (avec support JSON et XML/JAXB), la configuration JNDI,
 * le logging, la gestion des exceptions, le pom.xml et le README.
 * </p>
 */
@Component
public class CodeGenerationEngine {

    private static final Logger log = LoggerFactory.getLogger(CodeGenerationEngine.class);

    private static final String BASE_PACKAGE = "com.bank.api";
    private static final String BASE_PACKAGE_PATH = "com/bank/api";

    /**
     * Génère le projet API REST complet.
     *
     * @param analysisResult résultat de l'analyse du projet EJB
     * @param outputDir      répertoire de sortie
     * @return chemin du projet généré
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

        Path resourcesDir = projectRoot.resolve("src/main/resources");
        Files.createDirectories(resourcesDir);

        // Déterminer si le projet a besoin du support XML
        boolean projectHasXml = analysisResult.getUseCases().stream().anyMatch(UseCaseInfo::hasXmlSupport)
                || analysisResult.getDtos().stream().anyMatch(DtoInfo::hasJaxbAnnotations);

        generatePomXml(projectRoot, projectHasXml);
        generateApplicationClass(srcMain);
        generateApplicationProperties(resourcesDir);
        generateGlobalExceptionHandler(srcMain);
        generateLoggingAspect(srcMain);
        generateEjbLookupConfig(srcMain);

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

    // ==================== POM.XML ====================

    private void generatePomXml(Path projectRoot, boolean includeXml) throws IOException {
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
                
                        <!-- Lombok -->
                        <dependency>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                            <optional>true</optional>
                        </dependency>
                
                        <!-- Jakarta EE API (pour JNDI) -->
                        <dependency>
                            <groupId>jakarta.platform</groupId>
                            <artifactId>jakarta.jakartaee-api</artifactId>
                            <version>10.0.0</version>
                            <scope>provided</scope>
                        </dependency>
                """);

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
                                <configuration>
                                    <excludes>
                                        <exclude>
                                            <groupId>org.projectlombok</groupId>
                                            <artifactId>lombok</artifactId>
                                        </exclude>
                                    </excludes>
                                </configuration>
                            </plugin>
                        </plugins>
                    </build>
                
                </project>
                """.formatted(deps.toString());

        Files.writeString(projectRoot.resolve("pom.xml"), pom);
        log.info("pom.xml généré (XML support: {})", includeXml);
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

    // ==================== XML CONFIGURATION ====================

    private void generateXmlConfig(Path srcMain) throws IOException {
        String code = """
                package %s.config;
                
                import com.fasterxml.jackson.dataformat.xml.XmlMapper;
                import com.fasterxml.jackson.dataformat.xml.ser.ToXmlGenerator;
                import org.springframework.context.annotation.Bean;
                import org.springframework.context.annotation.Configuration;
                import org.springframework.http.converter.HttpMessageConverter;
                import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
                import org.springframework.http.converter.xml.MappingJackson2XmlHttpMessageConverter;
                import org.springframework.web.servlet.config.annotation.ContentNegotiationConfigurer;
                import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
                import org.springframework.http.MediaType;
                
                import java.util.List;
                
                /**
                 * Configuration pour le support de la negociation de contenu JSON/XML.
                 * <p>
                 * Permet aux clients de l'API de choisir le format de reponse
                 * via l'en-tete Accept (application/json ou application/xml)
                 * ou via le parametre de requete ?format=xml.
                 * </p>
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

    // ==================== CONTROLLER ====================

    private void generateController(Path srcMain, UseCaseInfo useCase) throws IOException {
        String inputDto = useCase.getInputDtoClassName();
        String outputDto = useCase.getOutputDtoClassName();
        String controllerName = useCase.getControllerName();
        String adapterName = useCase.getServiceAdapterName();
        String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);
        String endpoint = useCase.getRestEndpoint();
        boolean hasXml = useCase.hasXmlSupport();

        // Construire les produces/consumes
        String producesConsumes = "";
        if (hasXml) {
            producesConsumes = """
                    ,
                        produces = { "application/json", "application/xml" },
                        consumes = { "application/json", "application/xml" }""";
        }

        String mediaTypeImport = hasXml ? "\nimport org.springframework.http.MediaType;" : "";

        String code = """
                package %s.controller;
                
                import %s.dto.%s;
                import %s.dto.%s;
                import %s.service.%s;
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.http.ResponseEntity;
                import org.springframework.web.bind.annotation.*;%s
                
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
                    public ResponseEntity<%s> execute(@RequestBody %s input) {
                        log.info("Requete recue sur %s");
                        try {
                            log.debug("Appel du UseCase %s avec input : {}", input);
                            %s result = %s.execute(input);
                            log.info("UseCase %s execute avec succes");
                            return ResponseEntity.ok(result);
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
                mediaTypeImport,
                useCase.getClassName(),
                endpoint,
                hasXml ? "\n * Supporte les formats JSON et XML (negociation de contenu)." : "",
                endpoint, producesConsumes,
                controllerName,
                controllerName,
                adapterName, adapterField,
                controllerName, adapterName, adapterField,
                adapterField, adapterField,
                outputDto, inputDto,
                endpoint,
                useCase.getClassName(),
                outputDto, adapterField,
                useCase.getClassName(),
                useCase.getClassName(),
                useCase.getClassName()
        );

        Files.writeString(srcMain.resolve("controller/" + controllerName + ".java"), code);
        log.info("Controller généré : {} (XML: {})", controllerName, hasXml);
    }

    // ==================== SERVICE ADAPTER ====================

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
                            Object lookup = ctx.lookup("%s");
                
                            log.debug("EJB %s trouve via JNDI");
                
                            // Cast vers l'interface du UseCase et appel de execute
                            @SuppressWarnings("unchecked")
                            var useCase = lookup;
                            var method = useCase.getClass().getMethod("execute", Object.class);
                            Object result = method.invoke(useCase, input);
                
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
        log.info("Service adapter généré : {}", adapterName);
    }

    // ==================== DTO ====================

    private void generateDtoClass(Path srcMain, DtoInfo dto) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".dto;\n\n");
        sb.append("import java.io.Serializable;\n");

        // Imports JAXB si nécessaire
        if (dto.hasJaxbAnnotations()) {
            sb.append("import jakarta.xml.bind.annotation.*;\n");
        }
        // Import Jackson XML si JAXB détecté (pour compatibilité JSON + XML)
        if (dto.hasJaxbAnnotations()) {
            sb.append("import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlRootElement;\n");
        }

        sb.append("\n");
        sb.append("/**\n");
        sb.append(" * DTO genere automatiquement pour ").append(dto.getClassName()).append(".\n");
        sb.append(" * Utilise comme objet d'echange ");
        if (dto.hasJaxbAnnotations()) {
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
        } else if (dto.hasJaxbAnnotations()) {
            // Ajouter @XmlRootElement même si absent dans l'original, pour que XML fonctionne
            String defaultName = Character.toLowerCase(dto.getClassName().charAt(0)) + dto.getClassName().substring(1);
            sb.append("@XmlRootElement(name = \"").append(defaultName).append("\")\n");
            sb.append("@JacksonXmlRootElement(localName = \"").append(defaultName).append("\")\n");
        }

        if (dto.isHasXmlAccessorType()) {
            sb.append("@XmlAccessorType(").append(dto.getXmlAccessorTypeValue() != null ? dto.getXmlAccessorTypeValue() : "XmlAccessType.FIELD").append(")\n");
        } else if (dto.hasJaxbAnnotations()) {
            sb.append("@XmlAccessorType(XmlAccessType.FIELD)\n");
        }

        if (dto.isHasXmlType()) {
            sb.append("@XmlType\n");
        }

        sb.append("public class ").append(dto.getClassName());

        if (dto.getParentClassName() != null && !dto.getParentClassName().equals("Object")) {
            sb.append(" extends ").append(dto.getParentClassName());
        }

        sb.append(" implements Serializable {\n\n");
        sb.append("    private static final long serialVersionUID = 1L;\n\n");

        // Champs avec annotations JAXB
        for (DtoInfo.FieldInfo field : dto.getFields()) {
            if (field.isHasXmlElement()) {
                if (field.getXmlName() != null) {
                    sb.append("    @XmlElement(name = \"").append(field.getXmlName()).append("\")\n");
                } else {
                    sb.append("    @XmlElement\n");
                }
            }
            if (field.isHasXmlAttribute()) {
                if (field.getXmlName() != null) {
                    sb.append("    @XmlAttribute(name = \"").append(field.getXmlName()).append("\")\n");
                } else {
                    sb.append("    @XmlAttribute\n");
                }
            }
            sb.append("    private ").append(field.getType()).append(" ").append(field.getName()).append(";\n");
        }

        sb.append("\n");

        // Constructeur par défaut
        sb.append("    public ").append(dto.getClassName()).append("() {\n");
        sb.append("    }\n\n");

        // Getters et Setters
        for (DtoInfo.FieldInfo field : dto.getFields()) {
            String capitalizedName = Character.toUpperCase(field.getName().charAt(0)) + field.getName().substring(1);

            sb.append("    public ").append(field.getType()).append(" get").append(capitalizedName).append("() {\n");
            sb.append("        return ").append(field.getName()).append(";\n");
            sb.append("    }\n\n");

            sb.append("    public void set").append(capitalizedName).append("(").append(field.getType()).append(" ").append(field.getName()).append(") {\n");
            sb.append("        this.").append(field.getName()).append(" = ").append(field.getName()).append(";\n");
            sb.append("    }\n\n");
        }

        // toString
        sb.append("    @Override\n");
        sb.append("    public String toString() {\n");
        sb.append("        return \"").append(dto.getClassName()).append("{");
        List<DtoInfo.FieldInfo> fields = dto.getFields();
        for (int i = 0; i < fields.size(); i++) {
            DtoInfo.FieldInfo field = fields.get(i);
            if (i > 0) sb.append(", ");
            sb.append(field.getName()).append("='\" + ").append(field.getName()).append(" + \"'");
        }
        sb.append("}\";\n");
        sb.append("    }\n");

        sb.append("}\n");

        Files.writeString(srcMain.resolve("dto/" + dto.getClassName() + ".java"), sb.toString());
        log.info("DTO généré : {} (JAXB: {})", dto.getClassName(), dto.hasJaxbAnnotations());
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
            sb.append("   GET /api/client-data?format=json\n");
            sb.append("   GET /api/client-data?format=xml\n");
            sb.append("   ```\n\n");
        }

        sb.append("## Endpoints REST\n\n");
        sb.append("| UseCase | Endpoint | Methode | DTO Entree | DTO Sortie | Format |\n");
        sb.append("|---------|----------|---------|------------|------------|--------|\n");
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            sb.append("| ").append(uc.getClassName())
              .append(" | ").append(uc.getRestEndpoint())
              .append(" | POST")
              .append(" | ").append(uc.getInputDtoClassName())
              .append(" | ").append(uc.getOutputDtoClassName())
              .append(" | ").append(uc.getSerializationFormat().getLabel())
              .append(" |\n");
        }

        if (hasXml) {
            sb.append("\n## Exemples d'appels\n\n");
            sb.append("### Requete JSON\n\n");
            sb.append("```bash\n");
            sb.append("curl -X POST http://localhost:8081/api/client-data \\\n");
            sb.append("  -H \"Content-Type: application/json\" \\\n");
            sb.append("  -H \"Accept: application/json\" \\\n");
            sb.append("  -d '{\"clientId\": \"123\"}'\n");
            sb.append("```\n\n");
            sb.append("### Requete XML\n\n");
            sb.append("```bash\n");
            sb.append("curl -X POST http://localhost:8081/api/client-data \\\n");
            sb.append("  -H \"Content-Type: application/xml\" \\\n");
            sb.append("  -H \"Accept: application/xml\" \\\n");
            sb.append("  -d '<clientDataVoIn><clientId>123</clientId></clientDataVoIn>'\n");
            sb.append("```\n\n");
        }

        sb.append("\n## Architecture\n\n");
        sb.append("```\n");
        sb.append("src/main/java/com/bank/api/\n");
        sb.append("  controller/    - Controllers REST\n");
        sb.append("  service/       - Service Adapters (JNDI lookup)\n");
        sb.append("  dto/           - Objets de transfert JSON");
        if (hasXml) sb.append("/XML");
        sb.append("\n");
        sb.append("  config/        - Configuration JNDI");
        if (hasXml) sb.append(" et negociation de contenu");
        sb.append("\n");
        sb.append("  exception/     - Gestion globale des erreurs\n");
        sb.append("  logging/       - Aspect de logging\n");
        sb.append("  Application.java\n");
        sb.append("```\n");

        Files.writeString(projectRoot.resolve("README.md"), sb.toString());
        log.info("README.md généré");
    }
}
