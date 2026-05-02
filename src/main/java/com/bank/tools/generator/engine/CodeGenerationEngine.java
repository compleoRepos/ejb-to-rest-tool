package com.bank.tools.generator.engine;

import com.bank.tools.generator.annotation.AnnotationPropagator;
import com.bank.tools.generator.annotation.CustomAnnotationRegistry;
import com.bank.tools.generator.annotation.DetectedAnnotation;
import com.bank.tools.generator.bian.BianControllerGrouper;
import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.bian.BianMappingConfig;
import com.bank.tools.generator.bian.BianMappingResolver;
import com.bank.tools.generator.model.AdapterDescriptor;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
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
    private final BianServiceDomainMapper bianMapper;

    /** Module de propagation des annotations custom bancaires */
    private AnnotationPropagator annotationPropagator;

    /** Module de regroupement des controllers par Service Domain BIAN */
    private BianControllerGrouper bianControllerGrouper;

    /** Module de resolution du mapping BIAN */
    private BianMappingResolver bianMappingResolver;

    /** Module de generation de l'architecture decouplée ACL */
    private AclArchitectureGenerator aclArchitectureGenerator;

    public CodeGenerationEngine(ImportResolver importResolver, BianServiceDomainMapper bianMapper) {
        this.importResolver = importResolver;
        this.bianMapper = bianMapper;
    }

    @Autowired(required = false)
    public void setAnnotationPropagator(AnnotationPropagator annotationPropagator) {
        this.annotationPropagator = annotationPropagator;
    }

    @Autowired(required = false)
    public void setBianControllerGrouper(BianControllerGrouper bianControllerGrouper) {
        this.bianControllerGrouper = bianControllerGrouper;
    }

    @Autowired(required = false)
    public void setBianMappingResolver(BianMappingResolver bianMappingResolver) {
        this.bianMappingResolver = bianMappingResolver;
    }

    @Autowired(required = false)
    public void setAclArchitectureGenerator(AclArchitectureGenerator aclArchitectureGenerator) {
        this.aclArchitectureGenerator = aclArchitectureGenerator;
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

    public Path generateProject(ProjectAnalysisResult analysisResult, Path outputDir, boolean bianMode) throws IOException {
        return generateProject(analysisResult, outputDir, bianMode, "jndi");
    }

    public Path generateProject(ProjectAnalysisResult analysisResult, Path outputDir, boolean bianMode, String transportMode) throws IOException {
        log.info("Debut de la generation du projet API REST (v3 - G1-G14, BIAN={}, transport={})", bianMode, transportMode);

        Path projectRoot = outputDir.resolve("generated-api");
        Files.createDirectories(projectRoot);

        Path srcMain = projectRoot.resolve("src/main/java/" + BASE_PACKAGE_PATH);
        boolean aclActive = bianMode && aclArchitectureGenerator != null;

        if (!aclActive) {
            // Mode legacy : creer les repertoires legacy
            Files.createDirectories(srcMain.resolve("controller"));
            Files.createDirectories(srcMain.resolve("service"));
            Files.createDirectories(srcMain.resolve("dto"));
            Files.createDirectories(srcMain.resolve("config"));
            Files.createDirectories(srcMain.resolve("exception"));
            Files.createDirectories(srcMain.resolve("logging"));
            Files.createDirectories(srcMain.resolve("ejb/interfaces"));
            Files.createDirectories(srcMain.resolve("enums"));
            Files.createDirectories(srcMain.resolve("validation"));
        } else {
            // Mode ACL : seuls les repertoires ACL sont crees par l'AclArchitectureGenerator
            Files.createDirectories(srcMain);
            log.info("[ACL] Mode ACL actif : aucun repertoire legacy cree");
        }

        Path resourcesDir = projectRoot.resolve("src/main/resources");
        Files.createDirectories(resourcesDir);

        boolean projectHasXml = analysisResult.getUseCases().stream().anyMatch(UseCaseInfo::hasXmlSupport)
                || analysisResult.getDtos().stream().anyMatch(DtoInfo::hasJaxbAnnotations);

        boolean projectHasValidation = analysisResult.getDtos().stream()
                .flatMap(dto -> dto.getFields().stream())
                .anyMatch(DtoInfo.FieldInfo::isRequired);

        // Generer les fichiers de base
        generatePomXml(projectRoot, projectHasXml, projectHasValidation, analysisResult);
        generateApplicationClass(srcMain);
        generateServletInitializer(srcMain);
        generateApplicationProperties(resourcesDir, analysisResult.isJsonAdapterMode());
        // FIX 4 : Liberty/JNDI uniquement en mode non-JSON
        if (!analysisResult.isJsonAdapterMode()) {
            generateLibertyProfile(srcMain, resourcesDir);
        }
        // FIX 4 : HealthIndicator adapte au mode de transport
        if ("rest".equalsIgnoreCase(transportMode) || analysisResult.isJsonAdapterMode()) {
            generateAdapterHealthIndicator(srcMain, analysisResult);
        } else {
            generateJndiHealthIndicator(srcMain);
        }

        if (!aclActive) {
            // Mode legacy uniquement
            generateGlobalExceptionHandler(srcMain, analysisResult);
            generateLoggingAspect(srcMain);
            generateEjbLookupConfig(srcMain);
            generateBaseUseCaseInterface(srcMain);
            generateValueObjectInterface(srcMain);

            if (projectHasXml) {
                generateXmlConfig(srcMain);
            }

            for (ProjectAnalysisResult.EnumInfo enumInfo : analysisResult.getDetectedEnums()) {
                generateEnumClass(srcMain, enumInfo);
            }

            for (ProjectAnalysisResult.ExceptionInfo excInfo : analysisResult.getDetectedExceptions()) {
                generateExceptionClass(srcMain, excInfo);
            }

            for (ProjectAnalysisResult.ValidatorInfo valInfo : analysisResult.getDetectedValidators()) {
                generateValidatorClasses(srcMain, valInfo);
            }

            for (ProjectAnalysisResult.RemoteInterfaceInfo ifaceInfo : analysisResult.getDetectedRemoteInterfaces()) {
                generateRemoteInterface(srcMain, ifaceInfo);
            }
        } else {
            log.info("[ACL] Fichiers legacy (GlobalExceptionHandler, LoggingAspect, EjbLookupConfig, enums, exceptions, validators, remote interfaces) non generes - remplaces par l'architecture ACL");
        }

        // Collecter les mappings BIAN si le mode est active
        List<BianServiceDomainMapper.BianMapping> bianMappings = new ArrayList<>();

        if (aclActive) {
            // ===================== MODE ACL EXCLUSIF =====================
            // Seul le pipeline ACL genere les fichiers (0 fichier legacy)
            log.info("[ACL] Mode ACL exclusif : aucun controller/service/dto legacy genere");

            List<UseCaseInfo> bianUseCases = analysisResult.getUseCases().stream()
                    .filter(uc -> uc.getBianMapping() != null)
                    .collect(Collectors.toList());

            if (!bianUseCases.isEmpty()) {
                Map<String, BianMapping> bianMappingMap = new LinkedHashMap<>();
                for (UseCaseInfo uc : bianUseCases) {
                    bianMappingMap.put(uc.getClassName(), uc.getBianMapping());
                }
                try {
                    aclArchitectureGenerator.generate(srcMain, analysisResult, bianMappingMap, transportMode);
                    log.info("[ACL] Architecture decouplée generee avec succes ({} UseCases)", bianUseCases.size());
                } catch (Exception e) {
                    log.error("[ACL] Erreur lors de la generation ACL : {}", e.getMessage(), e);
                }
            }

            // Collecter les mappings BIAN pour le rapport
            for (UseCaseInfo useCase : analysisResult.getUseCases()) {
                if (useCase.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN) continue;
                BianServiceDomainMapper.BianMapping bm = bianMapper.mapToBian(useCase);
                if (bm.isBianCompliant) bianMappings.add(bm);
            }

        } else {
            // ===================== MODE LEGACY =====================
            for (UseCaseInfo useCase : analysisResult.getUseCases()) {
                if (useCase.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN) {
                    generateMdbController(srcMain, useCase);
                    generateMdbEventClass(srcMain, useCase);
                    generateMdbEventListener(srcMain, useCase);
                    generateMdbServiceAdapter(srcMain, useCase);
                    continue;
                }

                BianServiceDomainMapper.BianMapping bianMapping = null;
                if (bianMode) {
                    bianMapping = bianMapper.mapToBian(useCase);
                    if (bianMapping.isBianCompliant) bianMappings.add(bianMapping);
                }

                boolean skipIndividualController = bianMode && bianControllerGrouper != null
                        && bianMapping != null && bianMapping.isBianCompliant;

                if (useCase.getEjbPattern() == UseCaseInfo.EjbPattern.BASE_USE_CASE) {
                    if (!skipIndividualController) generateController(srcMain, useCase);
                    generateServiceAdapter(srcMain, useCase);
                } else {
                    if (!skipIndividualController) {
                        if (bianMode && bianMapping != null && bianMapping.isBianCompliant) {
                            generateBianController(srcMain, useCase, bianMapping);
                        } else {
                            generateMultiMethodController(srcMain, useCase);
                        }
                    }
                    generateMultiMethodServiceAdapter(srcMain, useCase);
                }
            }

            for (DtoInfo dto : analysisResult.getDtos()) {
                generateDtoClass(srcMain, dto);
            }

            if (bianMode && bianControllerGrouper != null) {
                List<UseCaseInfo> bianUseCases = analysisResult.getUseCases().stream()
                        .filter(uc -> uc.getBianMapping() != null)
                        .collect(Collectors.toList());
                if (!bianUseCases.isEmpty()) {
                    Map<String, List<UseCaseInfo>> grouped = bianControllerGrouper.groupByServiceDomain(bianUseCases);
                    for (Map.Entry<String, List<UseCaseInfo>> entry : grouped.entrySet()) {
                        bianControllerGrouper.generateGroupedController(
                                srcMain, entry.getKey(), entry.getValue(), BASE_PACKAGE);
                    }
                    log.info("[BIAN v2] {} controllers regroupes generes", grouped.size());
                }
            }
        }

        // Keycloak SecurityConfig conditionne par profil (apres ACL pour ne pas etre ecrase)
        generateSecurityConfig(srcMain, resourcesDir, analysisResult);

        // BIAN : Generer le BianHeaderFilter
        if (bianMode && !aclActive) {
            generateBianHeaderFilter(srcMain);
        }

        // G14 : TRANSFORMATION_SUMMARY.md
        generateTransformationSummary(projectRoot, analysisResult, projectHasXml);
        // README : ne pas ecraser le README BIAN genere par AclArchitectureGenerator
        if (!aclActive) {
            generateReadme(projectRoot, analysisResult, projectHasXml);
        }

        // BIAN : Generer le rapport de mapping BIAN
        if (bianMode && !bianMappings.isEmpty()) {
            generateBianMappingReport(projectRoot, bianMappings, analysisResult);
            // Generer aussi le rapport BIAN v2 avec les nouveaux mappings
            generateBianV2MappingReport(projectRoot, analysisResult);
            log.info("[BIAN] Rapport BIAN_MAPPING.md genere pour {} Service Domains", bianMappings.size());
        }

        // CUSTOM ANNOTATIONS : Generer le rapport d'annotations et propager
        if (annotationPropagator != null && !analysisResult.getDetectedCustomAnnotations().isEmpty()) {
            AnnotationPropagator.AnnotationReport annotReport =
                    annotationPropagator.generateReport(analysisResult.getDetectedCustomAnnotations());
            generateAnnotationReport(projectRoot, annotReport, analysisResult);

            // Propager les annotations sur les controllers generes
            propagateAnnotationsToControllers(srcMain, analysisResult);

            log.info("[ANNOTATIONS] Rapport genere : {} detectees, {} connues, {} inconnues internes, {} inconnues externes",
                    annotReport.totalDetected, annotReport.totalKnown,
                    annotReport.totalUnknownInternal, annotReport.totalUnknownExternal);
        }

        // PHASE 8 : Resolution systemique des imports post-generation
        int resolvedCount = importResolver.resolveImports(projectRoot);
        log.info("[Phase 8] ImportResolver : {} fichiers corriges", resolvedCount);

        log.info("Generation terminee dans : {}", projectRoot);
        return projectRoot;
    }

    // ===================== POM.XML =====================

    private void generatePomXml(Path projectRoot, boolean includeXml, boolean includeValidation,
                                    ProjectAnalysisResult analysisResult) throws IOException {
        boolean jsonMode = analysisResult.isJsonAdapterMode();
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
                        </dependency>""");

        // FIX 4 : Jakarta EE (JNDI) uniquement en mode non-JSON
        if (!jsonMode) {
            deps.append("""
                
                        <!-- Jakarta EE API (pour JNDI) -->
                        <dependency>
                            <groupId>jakarta.platform</groupId>
                            <artifactId>jakarta.jakartaee-api</artifactId>
                            <version>10.0.0</version>
                            <scope>provided</scope>
                        </dependency>""");
        }

        deps.append("""
                
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

        // Resilience4j (Circuit Breaker, Retry, Bulkhead, TimeLimiter)
        deps.append("""
                
                        <!-- Resilience4j (Circuit Breaker, Retry, Bulkhead, TimeLimiter) -->
                        <dependency>
                            <groupId>io.github.resilience4j</groupId>
                            <artifactId>resilience4j-spring-boot3</artifactId>
                            <version>2.2.0</version>
                        </dependency>
                
                        <!-- Spring Boot Actuator (Health Checks, Metriques) -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-actuator</artifactId>
                        </dependency>
                """);

        deps.append("""
                
                        <!-- Testing -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-test</artifactId>
                            <scope>test</scope>
                        </dependency>
                
                        <!-- Pact Consumer Tests (contrats avec l'adapter WebSphere) -->
                        <dependency>
                            <groupId>au.com.dius.pact.consumer</groupId>
                            <artifactId>junit5</artifactId>
                            <version>4.6.7</version>
                            <scope>test</scope>
                        </dependency>
                """);

        // Keycloak / OAuth2 Security (conditionnel)
        if (analysisResult != null && analysisResult.getAdapterDescriptor() != null
                && analysisResult.getAdapterDescriptor().getSecurity() != null
                && analysisResult.getAdapterDescriptor().getSecurity().getIssuerUri() != null) {
            deps.append("""
                    
                            <!-- Spring Security -->
                            <dependency>
                                <groupId>org.springframework.boot</groupId>
                                <artifactId>spring-boot-starter-security</artifactId>
                            </dependency>
                    
                            <!-- OAuth2 Resource Server (JWT / Keycloak) -->
                            <dependency>
                                <groupId>org.springframework.boot</groupId>
                                <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
                            </dependency>
                    """);
        }

        // DECOUPLAGE : Les dependances ma.eai.* ne sont plus ajoutees au POM genere.
        // L'API est 100% autonome et ne depend plus du framework EJB (ma.eai.*).
        // Le ServiceAdapter utilise la reflection pour appeler l'EJB distant.
        if (analysisResult != null && !analysisResult.getFrameworkDependencies().isEmpty()) {
            log.info("[DECOUPLAGE] {} dependances framework EAI detectees mais NON ajoutees au POM (API autonome)",
                    analysisResult.getFrameworkDependencies().size());
        }

        // DECOUPLAGE : Toujours utiliser Spring Boot comme parent POM
        // Le parent POM framework EAI n'est plus utilise pour garantir l'autonomie de l'API
        String parentBlock = """
                    <parent>
                        <groupId>org.springframework.boot</groupId>
                        <artifactId>spring-boot-starter-parent</artifactId>
                        <version>3.2.5</version>
                        <relativePath/>
                    </parent>
                """;
        if (analysisResult != null && analysisResult.isHasFrameworkParentPom()) {
            log.info("[DECOUPLAGE] Parent POM framework {}:{} detecte mais NON utilise (Spring Boot parent a la place)",
                    analysisResult.getParentPomGroupId(), analysisResult.getParentPomArtifactId());
        }

        // BOA/EAI : Determiner la version Java
        String javaVersion = "21";
        if (analysisResult != null && analysisResult.getSourceJavaVersion() != null) {
            javaVersion = analysisResult.getSourceJavaVersion();
            log.info("[BOA/EAI] Version Java du projet source conservee : {}", javaVersion);
        }

        String pom = """
                <?xml version="1.0" encoding="UTF-8"?>
                <project xmlns="http://maven.apache.org/POM/4.0.0"
                         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
                    <modelVersion>4.0.0</modelVersion>
                
                %s
                
                    <groupId>com.bank.api</groupId>
                    <artifactId>generated-rest-api</artifactId>
                    <version>1.0.0-SNAPSHOT</version>
                    <packaging>jar</packaging>
                    <name>Generated REST API</name>
                    <description>API REST generee automatiquement a partir du projet EJB</description>
                
                    <properties>
                        <java.version>%s</java.version>
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
                
                    %s
                
                </project>
                """.formatted(parentBlock, javaVersion, deps.toString(), jsonMode ? "" : """
                    <!-- Profil WebSphere Liberty (mvn clean package -Pliberty) -->
                    <profiles>
                        <profile>
                            <id>liberty</id>
                            <properties>
                                <packaging.type>war</packaging.type>
                            </properties>
                            <dependencies>
                                <dependency>
                                    <groupId>org.springframework.boot</groupId>
                                    <artifactId>spring-boot-starter-tomcat</artifactId>
                                    <scope>provided</scope>
                                </dependency>
                            </dependencies>
                            <build>
                                <plugins>
                                    <plugin>
                                        <groupId>io.openliberty.tools</groupId>
                                        <artifactId>liberty-maven-plugin</artifactId>
                                        <version>3.10</version>
                                        <configuration>
                                            <serverName>defaultServer</serverName>
                                            <configDirectory>src/main/liberty/config</configDirectory>
                                            <runtimeArtifact>
                                                <groupId>io.openliberty</groupId>
                                                <artifactId>openliberty-runtime</artifactId>
                                                <version>24.0.0.1</version>
                                                <type>zip</type>
                                            </runtimeArtifact>
                                        </configuration>
                                    </plugin>
                                    <plugin>
                                        <groupId>org.apache.maven.plugins</groupId>
                                        <artifactId>maven-war-plugin</artifactId>
                                        <version>3.4.0</version>
                                        <configuration>
                                            <failOnMissingWebXml>false</failOnMissingWebXml>
                                        </configuration>
                                    </plugin>
                                </plugins>
                            </build>
                        </profile>
                    </profiles>""");

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

    /**
     * Genere le ServletInitializer pour le deploiement WAR sur WebSphere Liberty.
     */
    private void generateServletInitializer(Path srcMain) throws IOException {
        String code = """
                package %s;
                
                import org.springframework.boot.builder.SpringApplicationBuilder;
                import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;
                
                /**
                 * Initializer pour le deploiement WAR sur WebSphere Liberty.
                 * Permet a Spring Boot de demarrer dans un conteneur de servlets externe.
                 * Utilisation : mvn clean package -Pliberty
                 */
                public class ServletInitializer extends SpringBootServletInitializer {
                    @Override
                    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
                        return application.sources(Application.class);
                    }
                }
                """.formatted(BASE_PACKAGE);
        Files.writeString(srcMain.resolve("ServletInitializer.java"), code);
        log.info("ServletInitializer genere (deploiement WAR Liberty)");
    }

    /**
     * Genere le profil Spring Liberty et les fichiers de configuration Liberty
     * (server.xml, jvm.options, bootstrap.properties).
     */
    private void generateLibertyProfile(Path srcMain, Path resourcesDir) throws IOException {
        // application-liberty.properties
        Files.writeString(resourcesDir.resolve("application-liberty.properties"), """
                # Profil WebSphere Liberty
                # Activer avec : --spring.profiles.active=liberty,jndi
                server.port=-1
                ejb.jndi.factory=com.ibm.websphere.naming.WsnInitialContextFactory
                ejb.jndi.provider.url=corbaloc:iiop:localhost:2809
                logging.level.root=INFO
                logging.level.com.bank.api=INFO
                management.endpoints.web.exposure.include=health,info,metrics
                management.endpoint.health.show-details=always
                springdoc.swagger-ui.enabled=${SWAGGER_ENABLED:false}
                springdoc.api-docs.enabled=${SWAGGER_ENABLED:false}
                """);

        // Liberty config directory
        String srcMainStr = srcMain.toString().replace("\\\\", "/");
        int javaIdx = srcMainStr.indexOf("src/main/java");
        Path libertyDir;
        if (javaIdx >= 0) {
            libertyDir = Path.of(srcMainStr.substring(0, javaIdx), "src/main/liberty/config");
        } else {
            libertyDir = srcMain.getParent().resolve("liberty/config");
        }
        Files.createDirectories(libertyDir);

        Files.writeString(libertyDir.resolve("server.xml"), """
                <?xml version="1.0" encoding="UTF-8"?>
                <server description="Generated REST API on Liberty">
                    <featureManager>
                        <feature>springBoot-3.0</feature>
                        <feature>servlet-6.0</feature>
                        <feature>jndi-1.0</feature>
                        <feature>transportSecurity-1.0</feature>
                        <feature>mpHealth-4.0</feature>
                        <feature>mpMetrics-5.0</feature>
                        <feature>jsonp-2.1</feature>
                        <feature>jsonb-3.0</feature>
                    </featureManager>
                    <httpEndpoint id="defaultHttpEndpoint" host="*"
                                  httpPort="${http.port:9080}" httpsPort="${https.port:9443}" />
                    <springBootApplication id="generated-rest-api"
                                           location="generated-rest-api-1.0.0-SNAPSHOT.war"
                                           name="generated-rest-api">
                        <classloader delegation="parentLast" />
                    </springBootApplication>
                    <jndiEntry jndiName="ejb/jndi/provider/url" value="${env.EJB_JNDI_URL}" />
                    <jndiEntry jndiName="ejb/jndi/factory" value="${env.EJB_JNDI_FACTORY}" />
                    <logging consoleLogLevel="INFO" traceSpecification="com.bank.api.*=info"
                             maxFileSize="50" maxFiles="10" />
                </server>
                """);

        Files.writeString(libertyDir.resolve("jvm.options"), """
                -Xms512m
                -Xmx1024m
                -XX:+UseG1GC
                -XX:MaxGCPauseMillis=200
                -Dfile.encoding=UTF-8
                -Dspring.profiles.active=liberty,jndi
                -Duser.timezone=Africa/Casablanca
                """);

        Files.writeString(libertyDir.resolve("bootstrap.properties"), """
                http.port=9080
                https.port=9443
                env.EJB_JNDI_URL=corbaloc:iiop:localhost:2809
                env.EJB_JNDI_FACTORY=com.ibm.websphere.naming.WsnInitialContextFactory
                """);

        log.info("Profil Liberty genere (application-liberty.properties, server.xml, jvm.options, bootstrap.properties)");
    }

    // ===================== APPLICATION PROPERTIES =====================

    private void generateApplicationProperties(Path resourcesDir) throws IOException {
        generateApplicationProperties(resourcesDir, false);
    }

    private void generateApplicationProperties(Path resourcesDir, boolean jsonMode) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("""
                # Generated REST API - Configuration
                server.port=8081
                """);

        if (!jsonMode) {
            sb.append("""
                
                # JNDI Configuration
                ejb.jndi.provider.url=localhost:1099
                ejb.jndi.factory=org.jboss.naming.remote.client.InitialContextFactory
                """);
        }

        sb.append("""
                
                # Logging
                logging.level.com.bank.api=DEBUG
                logging.pattern.console=%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger{36} - %msg%n
                
                # Swagger / OpenAPI 3
                springdoc.api-docs.path=/v3/api-docs
                springdoc.swagger-ui.path=/swagger-ui.html
                springdoc.swagger-ui.url=/v3/api-docs
                
                # ===================== Resilience4j =====================
                """);

        String instanceName = jsonMode ? "restAdapter" : "ejbService";
        sb.append(String.format("""
                
                # Circuit Breaker
                resilience4j.circuitbreaker.instances.%s.slidingWindowSize=10
                resilience4j.circuitbreaker.instances.%s.failureRateThreshold=50
                resilience4j.circuitbreaker.instances.%s.waitDurationInOpenState=30s
                resilience4j.circuitbreaker.instances.%s.permittedNumberOfCallsInHalfOpenState=3
                resilience4j.circuitbreaker.instances.%s.slidingWindowType=COUNT_BASED
                resilience4j.circuitbreaker.instances.%s.registerHealthIndicator=true
                
                # Retry
                resilience4j.retry.instances.%s.maxAttempts=3
                resilience4j.retry.instances.%s.waitDuration=2s
                resilience4j.retry.instances.%s.enableExponentialBackoff=true
                resilience4j.retry.instances.%s.exponentialBackoffMultiplier=2
                """, instanceName, instanceName, instanceName, instanceName, instanceName, instanceName,
                instanceName, instanceName, instanceName, instanceName));

        if (!jsonMode) {
            sb.append(String.format("""
                resilience4j.retry.instances.%s.retryExceptions=java.net.ConnectException,javax.naming.CommunicationException
                """, instanceName));
        } else {
            sb.append(String.format("""
                resilience4j.retry.instances.%s.retryExceptions=org.springframework.web.client.HttpServerErrorException,org.springframework.web.client.ResourceAccessException
                """, instanceName));
        }

        sb.append(String.format("""
                
                # TimeLimiter
                resilience4j.timelimiter.instances.%s.timeoutDuration=30s
                resilience4j.timelimiter.instances.%s.cancelRunningFuture=true
                
                # Bulkhead
                resilience4j.bulkhead.instances.%s.maxConcurrentCalls=10
                resilience4j.bulkhead.instances.%s.maxWaitDuration=500ms
                
                # ===================== Actuator =====================
                
                management.endpoints.web.exposure.include=health,info,metrics,circuitbreakers,retries,bulkheads
                management.endpoint.health.show-details=always
                management.health.circuitbreakers.enabled=true
                """, instanceName, instanceName, instanceName, instanceName));

        if (!jsonMode) {
            sb.append("\nspring.profiles.group.prod=jndi\n");
        } else {
            sb.append("\nspring.profiles.group.prod=rest\n");
        }

        Files.writeString(resourcesDir.resolve("application.properties"), sb.toString());
    }

    // ===================== JNDI HEALTH INDICATOR (Resilience) =====================

    /**
     * Genere un JndiHealthIndicator custom qui verifie la connectivite JNDI
     * et expose le resultat via /actuator/health.
     * Permet de detecter si le serveur EJB/WAS est accessible.
     */
    private void generateJndiHealthIndicator(Path srcMain) throws IOException {
        Path healthDir = srcMain.resolve("health");
        Files.createDirectories(healthDir);

        String code = """
                package %s.health;
                
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.beans.factory.annotation.Value;
                import org.springframework.boot.actuate.health.Health;
                import org.springframework.boot.actuate.health.HealthIndicator;
                import org.springframework.stereotype.Component;
                
                import javax.naming.Context;
                import javax.naming.InitialContext;
                import java.util.Properties;
                
                /**
                 * Health Indicator custom pour verifier la connectivite JNDI vers le serveur EJB/WAS.
                 * Expose via /actuator/health sous la cle "jndi".
                 *
                 * Etats possibles :
                 * - UP : le serveur EJB est accessible via JNDI
                 * - DOWN : le serveur EJB est inaccessible (timeout, connexion refusee, etc.)
                 */
                @Component
                public class JndiHealthIndicator implements HealthIndicator {
                
                    private static final Logger log = LoggerFactory.getLogger(JndiHealthIndicator.class);
                
                    @Value("${ejb.jndi.provider.url:localhost:1099}")
                    private String jndiProviderUrl;
                
                    @Value("${ejb.jndi.factory:org.jboss.naming.remote.client.InitialContextFactory}")
                    private String jndiFactory;
                
                    @Override
                    public Health health() {
                        long start = System.currentTimeMillis();
                        try {
                            Properties props = new Properties();
                            props.put(Context.INITIAL_CONTEXT_FACTORY, jndiFactory);
                            props.put(Context.PROVIDER_URL, jndiProviderUrl);
                            // Timeout de 5 secondes pour le health check
                            props.put("jndi.connection.timeout", "5000");
                
                            InitialContext ctx = new InitialContext(props);
                            ctx.close();
                
                            long duration = System.currentTimeMillis() - start;
                            log.debug("[HEALTH-JNDI] Connexion JNDI OK en {}ms", duration);
                            return Health.up()
                                    .withDetail("jndiProviderUrl", jndiProviderUrl)
                                    .withDetail("responseTime", duration + "ms")
                                    .build();
                        } catch (Exception e) {
                            long duration = System.currentTimeMillis() - start;
                            log.warn("[HEALTH-JNDI] Connexion JNDI echouee en {}ms : {}", duration, e.getMessage());
                            return Health.down()
                                    .withDetail("jndiProviderUrl", jndiProviderUrl)
                                    .withDetail("error", e.getMessage())
                                    .withDetail("responseTime", duration + "ms")
                                    .build();
                        }
                    }
                }
                """.formatted(BASE_PACKAGE);

        Files.writeString(healthDir.resolve("JndiHealthIndicator.java"), code);
        log.info("JndiHealthIndicator genere dans le package health");
    }

    /**
     * FIX 4 : Genere un AdapterHealthIndicator REST qui verifie la connectivite
     * avec le backend REST via HTTP GET /health.
     * Utilise a la place de JndiHealthIndicator quand le transport est REST.
     */
    private void generateAdapterHealthIndicator(Path srcMain, ProjectAnalysisResult analysisResult) throws IOException {
        Path healthDir = srcMain.resolve("health");
        Files.createDirectories(healthDir);

        // Determiner l'URL par defaut du backend
        String defaultBaseUrl = "http://localhost:9080";
        if (analysisResult.getAdapterDescriptor() != null
                && analysisResult.getAdapterDescriptor().getAdapterBaseUrl() != null) {
            defaultBaseUrl = analysisResult.getAdapterDescriptor().getAdapterBaseUrl();
        }

        String adapterName = "REST Backend";
        if (analysisResult.getAdapterDescriptor() != null
                && analysisResult.getAdapterDescriptor().getAdapterName() != null) {
            adapterName = analysisResult.getAdapterDescriptor().getAdapterName();
        }

        String code = """
                package %s.health;
                
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.beans.factory.annotation.Value;
                import org.springframework.boot.actuate.health.Health;
                import org.springframework.boot.actuate.health.HealthIndicator;
                import org.springframework.boot.web.client.RestTemplateBuilder;
                import org.springframework.stereotype.Component;
                import org.springframework.web.client.RestTemplate;
                
                import java.time.Duration;
                
                /**
                 * Health Indicator REST pour verifier la connectivite avec le backend adapter.
                 * Expose via /actuator/health sous la cle "adapter".
                 *
                 * Etats possibles :
                 * - UP : le backend REST est accessible
                 * - DOWN : le backend REST est inaccessible (timeout, connexion refusee, etc.)
                 */
                @Component
                public class AdapterHealthIndicator implements HealthIndicator {
                
                    private static final Logger log = LoggerFactory.getLogger(AdapterHealthIndicator.class);
                
                    @Value("${adapter.websphere.base-url:%s}")
                    private String adapterBaseUrl;
                
                    private final RestTemplate restTemplate;
                
                    public AdapterHealthIndicator(RestTemplateBuilder restTemplateBuilder) {
                        this.restTemplate = restTemplateBuilder
                                .setConnectTimeout(Duration.ofSeconds(5))
                                .setReadTimeout(Duration.ofSeconds(5))
                                .build();
                    }
                
                    @Override
                    public Health health() {
                        long start = System.currentTimeMillis();
                        try {
                            restTemplate.getForEntity(adapterBaseUrl + "/health", String.class);
                            long duration = System.currentTimeMillis() - start;
                            log.debug("[HEALTH-REST] Backend accessible en {}ms", duration);
                            return Health.up()
                                    .withDetail("adapterBaseUrl", adapterBaseUrl)
                                    .withDetail("adapterName", "%s")
                                    .withDetail("responseTime", duration + "ms")
                                    .build();
                        } catch (Exception e) {
                            long duration = System.currentTimeMillis() - start;
                            log.warn("[HEALTH-REST] Backend inaccessible en {}ms : {}", duration, e.getMessage());
                            return Health.down()
                                    .withDetail("adapterBaseUrl", adapterBaseUrl)
                                    .withDetail("adapterName", "%s")
                                    .withDetail("error", e.getMessage())
                                    .withDetail("responseTime", duration + "ms")
                                    .build();
                        }
                    }
                }
                """.formatted(BASE_PACKAGE, defaultBaseUrl, adapterName, adapterName);

        Files.writeString(healthDir.resolve("AdapterHealthIndicator.java"), code);
        log.info("[FIX-4] AdapterHealthIndicator REST genere (base-url={}, adapter={})", defaultBaseUrl, adapterName);
    }

    // ===================== BASE INTERFACES =====================

    /**
     * DECOUPLAGE : BaseUseCase n'est plus genere.
     * Le ServiceAdapter utilise la reflection pour appeler l'EJB distant,
     * ce qui rend l'API 100%% autonome sans dependance ma.eai.*.
     */
    private void generateBaseUseCaseInterface(Path srcMain) throws IOException {
        // Ne plus generer BaseUseCase — l'API est decouplée du framework EJB
        log.info("[DECOUPLAGE] BaseUseCase non genere — l'API est autonome");
    }

    /**
     * DECOUPLAGE : ValueObject n'est plus genere.
     * Les DTOs implementent directement Serializable.
     */
    private void generateValueObjectInterface(Path srcMain) throws IOException {
        // Ne plus generer ValueObject — les DTOs sont des POJOs Serializable
        log.info("[DECOUPLAGE] ValueObject non genere — les DTOs sont des POJOs Serializable");
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

    /**
     * DECOUPLAGE : ServiceAdapter utilise la reflection pure.
     * Aucune dependance vers BaseUseCase, ValueObject ou ma.eai.*.
     * L'EJB est appele via reflection : Object.getClass().getMethod("execute", Object.class).invoke()
     * Le resultat est converti en DTO via Jackson ObjectMapper.
     */
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
        sb.append("import com.fasterxml.jackson.databind.ObjectMapper;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.beans.factory.annotation.Value;\n");
        sb.append("import org.springframework.stereotype.Service;\n");
        if (!scopeAnnotation.isEmpty()) {
            sb.append("import org.springframework.context.annotation.Scope;\n");
        }
        // Resilience4j imports
        sb.append("import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;\n");
        sb.append("import io.github.resilience4j.retry.annotation.Retry;\n");
        sb.append("import io.github.resilience4j.bulkhead.annotation.Bulkhead;\n");
        sb.append("import io.github.resilience4j.timelimiter.annotation.TimeLimiter;\n");
        sb.append("\nimport javax.naming.Context;\n");
        sb.append("import javax.naming.InitialContext;\n");
        sb.append("import javax.naming.NamingException;\n");
        sb.append("import java.lang.reflect.Method;\n");
        sb.append("import java.util.Properties;\n\n");

        sb.append("/**\n");
        sb.append(" * Service adapter decouple pour ").append(useCase.getClassName()).append(".\n");
        sb.append(" * Utilise la reflection pour appeler l'EJB distant via JNDI.\n");
        sb.append(" * Aucune dependance vers le framework EJB (ma.eai.*).\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        if (!scopeAnnotation.isEmpty()) {
            sb.append(scopeAnnotation);
        }
        sb.append("public class ").append(adapterName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n");
        sb.append("    private static final ObjectMapper objectMapper = new ObjectMapper();\n\n");
        sb.append("    @Value(\"${ejb.jndi.provider.url:localhost:1099}\")\n");
        sb.append("    private String jndiProviderUrl;\n\n");
        sb.append("    @Value(\"${ejb.jndi.factory:org.jboss.naming.remote.client.InitialContextFactory}\")\n");
        sb.append("    private String jndiFactory;\n\n");
        // Cache JNDI : contexte et stub EJB reutilisables (volatile pour thread-safety)
        sb.append("    /** Contexte JNDI cache — initialise une seule fois (lazy) et reutilise. */\n");
        sb.append("    private volatile InitialContext cachedContext;\n");
        sb.append("    /** Stub EJB cache — evite un lookup a chaque appel. */\n");
        sb.append("    private volatile Object cachedEjb;\n");
        sb.append("    private final Object lock = new Object();\n\n");
        // Methode getOrCreateContext
        sb.append("    /**\n");
        sb.append("     * Retourne le contexte JNDI cache ou en cree un nouveau (double-checked locking).\n");
        sb.append("     * En cas d'erreur, invalide le cache et retente une creation.\n");
        sb.append("     */\n");
        sb.append("    private InitialContext getOrCreateContext() throws NamingException {\n");
        sb.append("        InitialContext ctx = cachedContext;\n");
        sb.append("        if (ctx != null) return ctx;\n");
        sb.append("        synchronized (lock) {\n");
        sb.append("            if (cachedContext != null) return cachedContext;\n");
        sb.append("            Properties props = new Properties();\n");
        sb.append("            props.put(Context.INITIAL_CONTEXT_FACTORY, jndiFactory);\n");
        sb.append("            props.put(Context.PROVIDER_URL, jndiProviderUrl);\n");
        sb.append("            cachedContext = new InitialContext(props);\n");
        sb.append("            log.info(\"[JNDI-CACHE] Nouveau contexte JNDI cree\");\n");
        sb.append("            return cachedContext;\n");
        sb.append("        }\n");
        sb.append("    }\n\n");
        // Methode lookupEjbCached
        sb.append("    /**\n");
        sb.append("     * Retourne le stub EJB cache ou effectue un lookup JNDI (une seule fois).\n");
        sb.append("     * Si le lookup echoue, invalide le cache contexte pour forcer une reconnexion.\n");
        sb.append("     */\n");
        sb.append("    private Object lookupEjbCached() throws NamingException {\n");
        sb.append("        Object ejb = cachedEjb;\n");
        sb.append("        if (ejb != null) return ejb;\n");
        sb.append("        synchronized (lock) {\n");
        sb.append("            if (cachedEjb != null) return cachedEjb;\n");
        sb.append("            try {\n");
        sb.append("                InitialContext ctx = getOrCreateContext();\n");
        sb.append("                cachedEjb = ctx.lookup(\"").append(jndiName).append("\");\n");
        sb.append("                log.info(\"[JNDI-CACHE] Stub EJB cache pour ").append(jndiName).append("\");\n");
        sb.append("                return cachedEjb;\n");
        sb.append("            } catch (NamingException e) {\n");
        sb.append("                log.warn(\"[JNDI-CACHE] Lookup echoue, invalidation du cache\");\n");
        sb.append("                invalidateCache();\n");
        sb.append("                throw e;\n");
        sb.append("            }\n");
        sb.append("        }\n");
        sb.append("    }\n\n");
        // Methode invalidateCache
        sb.append("    /** Invalide le cache JNDI (contexte + stub) pour forcer une reconnexion au prochain appel. */\n");
        sb.append("    private void invalidateCache() {\n");
        sb.append("        synchronized (lock) {\n");
        sb.append("            if (cachedContext != null) {\n");
        sb.append("                try { cachedContext.close(); } catch (Exception ignored) {}\n");
        sb.append("            }\n");
        sb.append("            cachedContext = null;\n");
        sb.append("            cachedEjb = null;\n");
        sb.append("            log.info(\"[JNDI-CACHE] Cache invalide — reconnexion au prochain appel\");\n");
        sb.append("        }\n");
        sb.append("    }\n\n");

        // Resilience4j annotations sur la methode execute()
        sb.append("    @CircuitBreaker(name = \"ejbService\", fallbackMethod = \"executeFallback\")\n");
        sb.append("    @Retry(name = \"ejbService\")\n");
        sb.append("    @Bulkhead(name = \"ejbService\")\n");
        sb.append("    public ").append(outputDto).append(" execute(").append(inputDto).append(" input) throws Exception {\n");
        sb.append("        // [EJB-CALL] Debut de l'appel EJB\n");
        sb.append("        log.info(\"[EJB-CALL] Appel de ").append(useCase.getClassName()).append(".execute() — JNDI: ").append(jndiName).append("\");\n\n");
        sb.append("        try {\n");
        sb.append("            // [EJB-LOOKUP] Recuperation du stub EJB depuis le cache\n");
        sb.append("            Object ejb = lookupEjbCached();\n");
        sb.append("            log.debug(\"[EJB-LOOKUP] EJB trouve (cache) : {}\", ejb.getClass().getName());\n\n");
        sb.append("            // [EJB-EXECUTE] Appel par reflection — decouple du framework EJB\n");
        sb.append("            log.debug(\"[EJB-EXECUTE] Execution de execute() avec input : {}\", input);\n");
        sb.append("            long start = System.currentTimeMillis();\n");
        sb.append("            Method executeMethod = findExecuteMethod(ejb);\n");
        sb.append("            Object result = executeMethod.invoke(ejb, input);\n");
        sb.append("            long duration = System.currentTimeMillis() - start;\n\n");
        sb.append("            // [EJB-RESPONSE] Conversion du resultat en DTO via Jackson\n");
        sb.append("            log.info(\"[EJB-RESPONSE] execute() termine en {}ms\", duration);\n");
        sb.append("            log.debug(\"[EJB-RESPONSE] Resultat brut : {}\", result);\n");
        sb.append("            return objectMapper.convertValue(result, ").append(outputDto).append(".class);\n");
        sb.append("        } catch (NamingException e) {\n");
        sb.append("            // [EJB-ERROR] Erreur de lookup — invalidation du cache\n");
        sb.append("            log.error(\"[EJB-ERROR] Lookup JNDI echoue pour ").append(jndiName).append(" : {}\", e.getMessage());\n");
        sb.append("            invalidateCache();\n");
        sb.append("            throw new RuntimeException(\"Service EJB indisponible : ").append(jndiName).append("\", e);\n");
        sb.append("        } catch (java.rmi.ConnectException | java.rmi.NoSuchObjectException e) {\n");
        sb.append("            // [EJB-ERROR] Stub EJB perime — invalidation du cache et retry\n");
        sb.append("            log.warn(\"[EJB-ERROR] Stub EJB perime, invalidation du cache : {}\", e.getMessage());\n");
        sb.append("            invalidateCache();\n");
        sb.append("            throw e;\n");
        sb.append("        } catch (Exception e) {\n");
        sb.append("            // [EJB-ERROR] Erreur d'execution\n");
        sb.append("            log.error(\"[EJB-ERROR] Erreur execute() sur ").append(useCase.getClassName()).append(" : {}\", e.getMessage());\n");
        sb.append("            throw e;\n");
        sb.append("        }\n");
        sb.append("    }\n\n");

        // Methode utilitaire pour trouver execute() ou process() par reflection
        sb.append("    /**\n");
        sb.append("     * Recherche la methode 'execute' ou 'process' sur l'EJB distant par reflection.\n");
        sb.append("     * Compatible avec les patterns BaseUseCase (execute) et SynchroneService (process).\n");
        sb.append("     */\n");
        sb.append("    private Method findExecuteMethod(Object ejb) throws NoSuchMethodException {\n");
        sb.append("        // Chercher 'execute' d'abord, puis 'process'\n");
        sb.append("        for (String methodName : new String[]{\"execute\", \"process\"}) {\n");
        sb.append("            for (Method m : ejb.getClass().getMethods()) {\n");
        sb.append("                if (m.getName().equals(methodName) && m.getParameterCount() == 1) {\n");
        sb.append("                    log.debug(\"[EJB-LOOKUP] Methode trouvee : {}({})\", methodName, m.getParameterTypes()[0].getSimpleName());\n");
        sb.append("                    return m;\n");
        sb.append("                }\n");
        sb.append("            }\n");
        sb.append("        }\n");
        sb.append("        throw new NoSuchMethodException(\"Aucune methode execute() ou process() trouvee sur \" + ejb.getClass().getName());\n");
        sb.append("    }\n\n");

        // Methode fallback Resilience4j
        sb.append("    /**\n");
        sb.append("     * Fallback appele automatiquement par Resilience4j lorsque :\n");
        sb.append("     * - Le circuit breaker est ouvert (serveur EJB/WAS indisponible)\n");
        sb.append("     * - Les retries sont epuises\n");
        sb.append("     * - Le bulkhead est sature (trop d'appels concurrents)\n");
        sb.append("     * Retourne une reponse degradee plutot qu'une erreur 500.\n");
        sb.append("     */\n");
        sb.append("    public ").append(outputDto).append(" executeFallback(").append(inputDto).append(" input, Throwable t) {\n");
        sb.append("        log.error(\"[RESILIENCE-FALLBACK] Service EJB indisponible pour ").append(useCase.getClassName()).append(" — cause : {}\", t.getMessage());\n");
        sb.append("        log.warn(\"[RESILIENCE-FALLBACK] Retour d'une reponse degradee pour ").append(useCase.getClassName()).append("\");\n");
        sb.append("        throw new RuntimeException(\"Service EJB temporairement indisponible (").append(useCase.getClassName()).append("). Veuillez reessayer plus tard.\", t);\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.writeString(srcMain.resolve("service/" + adapterName + ".java"), sb.toString());
        log.info("Service adapter decouple genere : {}", adapterName);
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
        // Resilience4j imports
        imports.add("io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker");
        imports.add("io.github.resilience4j.retry.annotation.Retry");
        imports.add("io.github.resilience4j.bulkhead.annotation.Bulkhead");

        // AXE 2 : Importer l'interface @Remote si connue
        String remoteIfaceName = useCase.getRemoteInterfaceName();
        if (remoteIfaceName != null && !remoteIfaceName.isEmpty()) {
            // L'interface @Remote est dans le package ejb.interfaces
            imports.add(BASE_PACKAGE + ".ejb.interfaces." + remoteIfaceName);
        }

        // Collecter les imports des types
        boolean hasFrameworkType = false;
        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            if (isFrameworkType(method.getReturnType())) hasFrameworkType = true;
            resolveTypeImports(replaceFrameworkType(method.getReturnType()), imports);
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                if (isFrameworkType(param.getType())) hasFrameworkType = true;
                resolveTypeImports(replaceFrameworkType(param.getType()), imports);
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
        // Cache JNDI : contexte et stub EJB reutilisables (volatile pour thread-safety)
        sb.append("    /** Contexte JNDI cache — initialise une seule fois (lazy) et reutilise. */\n");
        sb.append("    private volatile InitialContext cachedContext;\n");
        sb.append("    /** Stub EJB cache — evite un lookup a chaque appel. */\n");
        sb.append("    private volatile Object cachedEjb;\n");
        sb.append("    private final Object lock = new Object();\n\n");
        // Methode getOrCreateContext
        sb.append("    /**\n");
        sb.append("     * Retourne le contexte JNDI cache ou en cree un nouveau (double-checked locking).\n");
        sb.append("     */\n");
        sb.append("    private InitialContext getOrCreateContext() throws NamingException {\n");
        sb.append("        InitialContext ctx = cachedContext;\n");
        sb.append("        if (ctx != null) return ctx;\n");
        sb.append("        synchronized (lock) {\n");
        sb.append("            if (cachedContext != null) return cachedContext;\n");
        sb.append("            Properties props = new Properties();\n");
        sb.append("            props.put(Context.INITIAL_CONTEXT_FACTORY, jndiFactory);\n");
        sb.append("            props.put(Context.PROVIDER_URL, jndiProviderUrl);\n");
        sb.append("            cachedContext = new InitialContext(props);\n");
        sb.append("            log.info(\"[JNDI-CACHE] Nouveau contexte JNDI cree\");\n");
        sb.append("            return cachedContext;\n");
        sb.append("        }\n");
        sb.append("    }\n\n");
        // Methode lookupEjb avec cache
        sb.append("    /**\n");
        sb.append("     * Retourne le stub EJB cache ou effectue un lookup JNDI (une seule fois).\n");
        sb.append("     * Si le lookup echoue, invalide le cache pour forcer une reconnexion.\n");
        sb.append("     */\n");
        sb.append("    private Object lookupEjb() throws NamingException {\n");
        sb.append("        Object ejb = cachedEjb;\n");
        sb.append("        if (ejb != null) return ejb;\n");
        sb.append("        synchronized (lock) {\n");
        sb.append("            if (cachedEjb != null) return cachedEjb;\n");
        sb.append("            try {\n");
        sb.append("                InitialContext ctx = getOrCreateContext();\n");
        sb.append("                cachedEjb = ctx.lookup(\"").append(jndiName).append("\");\n");
        sb.append("                log.info(\"[JNDI-CACHE] Stub EJB cache pour ").append(jndiName).append("\");\n");
        sb.append("                return cachedEjb;\n");
        sb.append("            } catch (NamingException e) {\n");
        sb.append("                log.warn(\"[JNDI-CACHE] Lookup echoue, invalidation du cache\");\n");
        sb.append("                invalidateCache();\n");
        sb.append("                throw e;\n");
        sb.append("            }\n");
        sb.append("        }\n");
        sb.append("    }\n\n");
        // Methode invalidateCache
        sb.append("    /** Invalide le cache JNDI (contexte + stub) pour forcer une reconnexion au prochain appel. */\n");
        sb.append("    private void invalidateCache() {\n");
        sb.append("        synchronized (lock) {\n");
        sb.append("            if (cachedContext != null) {\n");
        sb.append("                try { cachedContext.close(); } catch (Exception ignored) {}\n");
        sb.append("            }\n");
        sb.append("            cachedContext = null;\n");
        sb.append("            cachedEjb = null;\n");
        sb.append("            log.info(\"[JNDI-CACHE] Cache invalide — reconnexion au prochain appel\");\n");
        sb.append("        }\n");
        sb.append("    }\n");

        // Generer chaque methode
        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            sb.append("\n");

            // FIX P0-1b: Remplacer les types framework (Envelope, etc.) par Map<String, Object>
            // pour eviter les dependances vers ma.eai.*
            String returnType = replaceFrameworkType(method.getReturnType());
            String params = method.getParameters().stream()
                    .map(p -> replaceFrameworkType(p.getType()) + " " + p.getName())
                    .collect(Collectors.joining(", "));
            String args = method.getParameters().stream()
                    .map(UseCaseInfo.ParameterInfo::getName)
                    .collect(Collectors.joining(", "));

            // Resilience4j annotations
            String fallbackName = method.getName() + "Fallback";
            sb.append("    @CircuitBreaker(name = \"ejbService\", fallbackMethod = \"").append(fallbackName).append("\")\n");
            sb.append("    @Retry(name = \"ejbService\")\n");
            sb.append("    @Bulkhead(name = \"ejbService\")\n");
            sb.append("    public ").append(returnType).append(" ").append(method.getName()).append("(").append(params).append(") throws Exception {\n");
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
                    sb.append("        ").append(returnType).append(" result = ejb.").append(method.getName()).append("(").append(args).append(");\n");
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
                    // FIX P0-1b: Pour la reflection, utiliser Object.class quand le type original est un type framework
                    // car le type exact n'est pas disponible dans le classpath du projet genere
                    String paramBaseType = extractBaseType(param.getType());
                    if (FRAMEWORK_TYPES_SET.contains(paramBaseType)) {
                        sb.append(", Object.class");
                    } else {
                        sb.append(", ").append(paramBaseType).append(".class");
                    }
                }
                sb.append(");\n");
                if (method.getReturnType().equals("void")) {
                    sb.append("        m.invoke(ejb").append(args.isEmpty() ? "" : ", " + args).append(");\n");
                    sb.append("        long duration = System.currentTimeMillis() - start;\n");
                    sb.append("        log.info(\"[EJB-EXECUTE] ").append(method.getName()).append("() termine en {}ms\", duration);\n");
                } else {
                    sb.append("        ").append(returnType).append(" result = (").append(returnType).append(") m.invoke(ejb").append(args.isEmpty() ? "" : ", " + args).append(");\n");
                    sb.append("        long duration = System.currentTimeMillis() - start;\n");
                    sb.append("        log.info(\"[EJB-EXECUTE] ").append(method.getName()).append("() termine en {}ms\", duration);\n");
                    sb.append("        // --- REPONSE EJB ---\n");
                    sb.append("        log.debug(\"[EJB-RESPONSE] Resultat : {}\", result);\n");
                    sb.append("        return result;\n");
                }
            }
            sb.append("    }\n");

            // Methode fallback Resilience4j pour cette methode
            sb.append("\n");
            sb.append("    /**\n");
            sb.append("     * Fallback Resilience4j pour ").append(method.getName()).append("().\n");
            sb.append("     * Appele quand le circuit breaker est ouvert, les retries epuises ou le bulkhead sature.\n");
            sb.append("     */\n");
            String fallbackParams = params.isEmpty() ? "Throwable t" : params + ", Throwable t";
            sb.append("    public ").append(returnType).append(" ").append(fallbackName).append("(").append(fallbackParams).append(") {\n");
            sb.append("        log.error(\"[RESILIENCE-FALLBACK] Service EJB indisponible pour ").append(useCase.getClassName()).append(".").append(method.getName()).append(" \u2014 cause : {}\", t.getMessage());\n");
            if (method.getReturnType().equals("void")) {
                sb.append("        throw new RuntimeException(\"Service EJB temporairement indisponible (").append(useCase.getClassName()).append(".").append(method.getName()).append("). Veuillez reessayer plus tard.\", t);\n");
            } else {
                sb.append("        throw new RuntimeException(\"Service EJB temporairement indisponible (").append(useCase.getClassName()).append(".").append(method.getName()).append("). Veuillez reessayer plus tard.\", t);\n");
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

        // DECOUPLAGE : Tous les DTOs implementent Serializable (plus de ValueObject)
        boolean isVoIn = dto.getClassName().endsWith("VoIn") || dto.getClassName().endsWith("VOIn")
                || dto.getClassName().endsWith("Input") || dto.getClassName().endsWith("Request");
        boolean isVoOut = dto.getClassName().endsWith("VoOut") || dto.getClassName().endsWith("VOOut")
                || dto.getClassName().endsWith("Output") || dto.getClassName().endsWith("Response");
        boolean isDto = isVoIn || isVoOut || dto.getClassName().endsWith("Dto") || dto.getClassName().endsWith("DTO");

        if (isVoIn || isVoOut || isDto) {
            imports.add("java.io.Serializable");
        }

        // JAXB imports
        boolean hasJaxb = dto.hasJaxbAnnotations();
        // G2 : Utiliser des imports individuels au lieu du wildcard pour eviter les doublons
        if (hasJaxb) {
            // FIX: Toujours importer XmlRootElement quand hasJaxb est true,
            // car on genere @XmlRootElement meme si le DTO original ne l'avait pas (branche else if hasJaxb, ligne ~1710)
            imports.add("jakarta.xml.bind.annotation.XmlRootElement");
            // FIX: Toujours importer XmlAccessorType/XmlAccessType quand hasJaxb est true,
            // car on genere @XmlAccessorType(XmlAccessType.FIELD) par defaut meme si le DTO original ne l'avait pas
            imports.add("jakarta.xml.bind.annotation.XmlAccessorType");
            imports.add("jakarta.xml.bind.annotation.XmlAccessType");
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

        // DECOUPLAGE : Filtrer les classes parentes EJB framework
        String parentClass = dto.getParentClassName();
        boolean isEjbFrameworkParent = parentClass == null
                || parentClass.equals("Object")
                || parentClass.equals("ValueObject")
                || parentClass.equals("UCStrategie")
                || parentClass.equals("BaseUseCase")
                || parentClass.equals("AbstractUseCase")
                || parentClass.equals("SynchroneService")
                || parentClass.equals("AsynchroneService")
                || parentClass.equals("Envelope")
                || parentClass.equals("EaiLog")
                || parentClass.equals("CommonFunction");
        if (!isEjbFrameworkParent) {
            sb.append(" extends ").append(parentClass);
        }

        // DECOUPLAGE : Tous les DTOs implementent Serializable (POJO autonome)
        if (isVoIn || isVoOut || isDto) {
            sb.append(" implements Serializable");
        }
        sb.append(" {\n\n");

        // serialVersionUID pour les classes qui implementent Serializable
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
        log.info("DTO genere : {} (JAXB: {}, Serializable: {})", dto.getClassName(), hasJaxb, isVoIn || isVoOut || isDto);
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
                
                        // BOA/EAI : FwkRollbackException → 409 Conflict (erreur metier framework)
                        String exceptionName = ex.getClass().getSimpleName();
                        if (exceptionName.equals("FwkRollbackException") || exceptionName.contains("FwkRollback")) {
                            log.error("[BOA/EAI] FwkRollbackException : {}", ex.getMessage());
                            return buildErrorResponse(HttpStatus.CONFLICT, ex.getMessage());
                        }
                
                        // BOA/EAI : Autres exceptions framework EAI
                        if (exceptionName.contains("Parsing") || exceptionName.equals("ParsingException")) {
                            log.error("[BOA/EAI] ParsingException : {}", ex.getMessage());
                            return buildErrorResponse(HttpStatus.BAD_REQUEST, "Erreur de parsing : " + ex.getMessage());
                        }
                
                        // Analyse du message pour les autres cas
                        String msg = ex.getMessage() != null ? ex.getMessage().toLowerCase() : "";
                        if (msg.contains("introuvable") || msg.contains("not found")) {
                            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage());
                        }
                        if (msg.contains("insuffisant") || msg.contains("insufficient")) {
                            return buildErrorResponse(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
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
        sb.append("- Les ServiceAdapters utilisent un lookup JNDI a chaque appel — prevoir un cache si necessaire\n");        sb.append("- Les tests unitaires mockent les ServiceAdapters \u2014 les tests d'integration necessitent un serveur EJB\n");

        // ===== SECTION BIAN =====
        long bianMapped = analysisResult.getUseCases().stream()
                .filter(uc -> uc.getBianMapping() != null).count();
        if (bianMapped > 0) {
            sb.append("\n## Conformite BIAN\n\n");
            sb.append("L'outil a genere des wrappers conformes au standard BIAN v12.0.\n\n");

            sb.append("### Mapping UseCase \u2192 Service Domain BIAN\n\n");
            sb.append("| UseCase Source | Service Domain | BIAN ID | Action | BQ | HTTP | URL BIAN |\n");
            sb.append("|---------------|---------------|---------|--------|----|----|----------|\n");
            for (UseCaseInfo uc : analysisResult.getUseCases()) {
                BianMapping bm = uc.getBianMapping();
                if (bm == null) continue;
                sb.append("| ").append(uc.getClassName());
                sb.append(" | ").append(bm.getServiceDomainTitle());
                sb.append(" | ").append(bm.getBianId() != null ? bm.getBianId() : "-");
                sb.append(" | ").append(bm.getAction());
                sb.append(" | ").append(bm.getBehaviorQualifier() != null ? bm.getBehaviorQualifier() : "-");
                sb.append(" | ").append(bm.getHttpMethod()).append(" ").append(bm.getHttpStatus());
                sb.append(" | `").append(bm.buildUrl("/api/v1")).append("`");
                sb.append(" |\n");
            }

            sb.append("\n### Headers HTTP BIAN\n\n");
            sb.append("Le `BianHeaderFilter` injecte automatiquement les headers suivants sur chaque reponse :\n\n");
            sb.append("| Header | Description |\n");
            sb.append("|--------|-------------|\n");
            sb.append("| `X-BIAN-Version` | Version du standard BIAN (12.0) |\n");
            sb.append("| `X-BIAN-Service-Domain` | Nom du Service Domain |\n");
            sb.append("| `X-BIAN-Service-Domain-ID` | Identifiant BIAN officiel (SDxxxx) |\n");
            sb.append("| `X-BIAN-Action` | Action BIAN executee |\n");
            sb.append("| `X-BIAN-Behavior-Qualifier` | Behavior Qualifier (si applicable) |\n");

            sb.append("\n### Swagger BIAN\n\n");
            sb.append("Les endpoints Swagger sont organises par Service Domain BIAN :\n");
            sb.append("- Chaque controller est annote `@Tag(name = \"Service Domain\")` pour le regroupement Swagger\n");
            sb.append("- Chaque endpoint a un `operationId` au format BIAN : `{action}{ServiceDomain}{BQ}`\n");
            sb.append("- Les `@ApiResponse` incluent les codes HTTP BIAN standards\n");
            sb.append("- Swagger UI : http://localhost:8081/swagger-ui.html\n\n");

            sb.append("### Statistiques BIAN\n\n");
            sb.append("- UseCases mappes : ").append(bianMapped).append("/").append(analysisResult.getUseCases().size()).append("\n");
            long explicit = analysisResult.getUseCases().stream()
                    .filter(uc -> uc.getBianMapping() != null && uc.getBianMapping().isExplicit()).count();
            sb.append("- Mappings explicites (bian-mapping.yml) : ").append(explicit).append("\n");
            sb.append("- Mappings automatiques (par mots-cles) : ").append(bianMapped - explicit).append("\n");

            // Regroupement par Service Domain
            Map<String, Long> domainCount = analysisResult.getUseCases().stream()
                    .filter(uc -> uc.getBianMapping() != null)
                    .collect(Collectors.groupingBy(uc -> uc.getBianMapping().getServiceDomainTitle(), Collectors.counting()));
            sb.append("- Service Domains couverts : ").append(domainCount.size()).append("\n");
            for (Map.Entry<String, Long> entry : domainCount.entrySet()) {
                sb.append("  - ").append(entry.getKey()).append(" : ").append(entry.getValue()).append(" endpoints\n");
            }
        }

        Files.writeString(projectRoot.resolve("TRANSFORMATION_SUMMARY.md"), sb.toString());     log.info("TRANSFORMATION_SUMMARY.md genere");
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

    // ===================== BIAN CONTROLLER GENERATION =====================

    /**
     * Genere un controller REST conforme au standard BIAN.
     * URLs au format : /{service-domain}/{cr-plural}/{cr-id}/{behavior-qualifier}/{action-suffix}
     */
    private void generateBianController(Path srcMain, UseCaseInfo useCase,
                                         BianServiceDomainMapper.BianMapping bianMapping) throws IOException {
        String controllerName = useCase.getControllerName();
        String adapterName = useCase.getServiceAdapterName();
        String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);
        String baseEndpoint = bianMapping.baseUrl;
        String ejbTypeComment = generateEjbTypeComment(useCase);

        Set<String> imports = new TreeSet<>();
        imports.add(BASE_PACKAGE + ".service." + adapterName);
        imports.add("org.slf4j.Logger");
        imports.add("org.slf4j.LoggerFactory");
        imports.add("org.springframework.http.ResponseEntity");
        imports.add("org.springframework.http.HttpStatus");
        imports.add("org.springframework.web.bind.annotation.*");
        imports.add("io.swagger.v3.oas.annotations.Operation");
        imports.add("io.swagger.v3.oas.annotations.tags.Tag");

        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            resolveTypeImports(method.getReturnType(), imports);
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                resolveTypeImports(param.getType(), imports);
            }
            String returnBase = extractBaseType(method.getReturnType());
            if (isDtoType(returnBase)) imports.add(BASE_PACKAGE + ".dto." + returnBase);
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                String paramBase = extractBaseType(param.getType());
                if (isDtoType(paramBase)) imports.add(BASE_PACKAGE + ".dto." + paramBase);
            }
        }

        boolean hasByteArrayReturn = useCase.getPublicMethods().stream()
                .anyMatch(m -> m.getReturnType().equals("byte[]"));
        if (hasByteArrayReturn) {
            imports.add("org.springframework.http.HttpHeaders");
            imports.add("org.springframework.http.MediaType");
        }

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".controller;\n\n");
        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }
        sb.append("\n");
        sb.append(ejbTypeComment);
        sb.append("/**\n");
        sb.append(" * Controller REST conforme BIAN pour ").append(useCase.getClassName()).append(".\n");
        sb.append(" * Service Domain : ").append(bianMapping.serviceDomain.displayName).append("\n");
        sb.append(" * Control Record  : ").append(bianMapping.serviceDomain.controlRecord).append("\n");
        sb.append(" * Pattern          : ").append(bianMapping.serviceDomain.functionalPattern).append("\n");
        sb.append(" *\n");
        sb.append(" * Reference : BIAN Semantic API Practitioner Guide V8.1\n");
        sb.append(" */\n");
        sb.append("@RestController\n");
        sb.append("@RequestMapping(\"" + baseEndpoint + "\")\n");
        sb.append("@Tag(name = \"" + bianMapping.serviceDomain.displayName + "\", ");
        sb.append("description = \"BIAN Service Domain - " + bianMapping.serviceDomain.displayName + "\")\n");
        sb.append("public class ").append(controllerName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(controllerName).append(".class);\n\n");
        sb.append("    private final ").append(adapterName).append(" ").append(adapterField).append(";\n\n");
        sb.append("    public ").append(controllerName).append("(").append(adapterName).append(" ").append(adapterField).append(") {\n");
        sb.append("        this.").append(adapterField).append(" = ").append(adapterField).append(";\n");
        sb.append("    }\n");

        // Generer une route BIAN par methode
        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            BianServiceDomainMapper.BianMethodMapping mm = bianMapping.methodMappings.get(method.getName());
            if (mm == null) continue;

            sb.append("\n");
            // Swagger avec Action Term BIAN
            sb.append("    @Operation(summary = \"BIAN ").append(mm.actionTerm.actionTerm);
            sb.append(" - ").append(deriveSwaggerSummary(method.getName())).append("\")\n");

            // Annotation HTTP BIAN
            sb.append("    @").append(mm.springAnnotation);
            if (!mm.fullUrl.isEmpty()) {
                sb.append("(\"").append(mm.fullUrl).append("\"");
            }
            sb.append(")\n");

            // Type de retour
            String returnType = method.getReturnType();
            String responseType = mapReturnType(returnType);

            sb.append("    public ResponseEntity<").append(responseType).append("> ").append(method.getName()).append("(");

            // Parametres
            List<String> paramDecls = new ArrayList<>();
            boolean hasRequestBody = false;
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                // BIAN : les IDs dans l'URL deviennent @PathVariable
                String paramNameLower = param.getName().toLowerCase();
                boolean isPathVar = paramNameLower.equals("id") || paramNameLower.endsWith("id")
                        || paramNameLower.endsWith("number") || paramNameLower.endsWith("code");
                String annotation;
                if (isPathVar && mm.fullUrl.contains("{" + param.getName() + "}")) {
                    annotation = "@PathVariable ";
                } else {
                    annotation = resolveParameterAnnotationV2(param, mm.httpMethod, hasRequestBody);
                    if (annotation.contains("@RequestBody")) hasRequestBody = true;
                }
                paramDecls.add(annotation + param.getType() + " " + param.getName());
            }
            sb.append(String.join(",\n            ", paramDecls));
            sb.append(") {\n");

            // Tracabilite BIAN
            sb.append("        log.info(\"[BIAN-IN] ").append(mm.actionTerm.actionTerm);
            sb.append(" ").append(baseEndpoint).append(mm.fullUrl);
            sb.append(" - ").append(method.getName()).append("\");\n");
            sb.append("        try {\n");

            // Corps
            String args = method.getParameters().stream().map(UseCaseInfo.ParameterInfo::getName).collect(Collectors.joining(", "));
            if (returnType.equals("void")) {
                sb.append("            ").append(adapterField).append(".").append(method.getName()).append("(").append(args).append(");\n");
                sb.append("            log.info(\"[BIAN-OUT] 204 No Content\");\n");
                sb.append("            return ResponseEntity.noContent().build();\n");
            } else if (returnType.equals("byte[]")) {
                sb.append("            byte[] data = ").append(adapterField).append(".").append(method.getName()).append("(").append(args).append(");\n");
                sb.append("            log.info(\"[BIAN-OUT] 200 OK - {} octets\", data.length);\n");
                sb.append("            return ResponseEntity.ok()\n");
                sb.append("                .header(HttpHeaders.CONTENT_DISPOSITION, \"attachment; filename=export.bin\")\n");
                sb.append("                .contentType(MediaType.APPLICATION_OCTET_STREAM)\n");
                sb.append("                .body(data);\n");
            } else {
                sb.append("            ").append(returnType).append(" result = ").append(adapterField).append(".").append(method.getName()).append("(").append(args).append(");\n");
                sb.append("            log.info(\"[BIAN-OUT] 200 OK - ").append(method.getName()).append("\");\n");
                sb.append("            return ResponseEntity.ok(result);\n");
            }

            sb.append("        } catch (Exception e) {\n");
            sb.append("            log.error(\"[BIAN-ERROR] ").append(method.getName()).append(" : {}\", e.getMessage());\n");
            sb.append("            throw new RuntimeException(e.getMessage(), e);\n");
            sb.append("        }\n");
            sb.append("    }\n");
        }

        sb.append("}\n");

        Files.writeString(srcMain.resolve("controller/" + controllerName + ".java"), sb.toString());
        log.info("[BIAN] Controller genere : {} ({} routes BIAN)", controllerName, useCase.getPublicMethods().size());
    }

    // ===================== BIAN MAPPING REPORT =====================

    /**
     * Genere le fichier BIAN_MAPPING.md avec le detail du mapping EJB → BIAN.
     */
    private void generateBianMappingReport(Path projectRoot,
                                            List<BianServiceDomainMapper.BianMapping> bianMappings,
                                            ProjectAnalysisResult analysisResult) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Rapport de Mapping BIAN\n\n");
        sb.append("Ce document detaille le mapping entre les EJB source et les Service Domains BIAN.\n");
        sb.append("Genere automatiquement par l'outil EJB-to-REST Generator en mode BIAN.\n\n");
        sb.append("**Reference** : BIAN Semantic API Practitioner Guide V8.1\n\n");
        sb.append("---\n\n");

        // Resume
        sb.append("## Resume\n\n");
        sb.append("| Metrique | Valeur |\n");
        sb.append("|----------|--------|\n");
        sb.append("| Service Domains identifies | ").append(bianMappings.size()).append(" |\n");
        int totalRoutes = bianMappings.stream().mapToInt(m -> m.methodMappings.size()).sum();
        sb.append("| Routes BIAN generees | ").append(totalRoutes).append(" |\n");
        sb.append("| UseCases totaux | ").append(analysisResult.getUseCases().size()).append(" |\n");
        sb.append("\n");

        // Detail par Service Domain
        sb.append("## Detail par Service Domain\n\n");
        for (BianServiceDomainMapper.BianMapping mapping : bianMappings) {
            sb.append("### ").append(mapping.serviceDomain.displayName).append("\n\n");
            sb.append("| Propriete | Valeur |\n");
            sb.append("|-----------|--------|\n");
            sb.append("| **Domain Name** | ").append(mapping.serviceDomain.domainName).append(" |\n");
            sb.append("| **Control Record** | ").append(mapping.serviceDomain.controlRecord).append(" |\n");
            sb.append("| **Functional Pattern** | ").append(mapping.serviceDomain.functionalPattern).append(" |\n");
            sb.append("| **Base URL** | `").append(mapping.baseUrl).append("` |\n");
            sb.append("\n");

            sb.append("#### Routes\n\n");
            sb.append("| Methode EJB | Action Term | HTTP | URL BIAN | Behavior Qualifier |\n");
            sb.append("|-------------|-------------|------|----------|-------------------|\n");
            for (BianServiceDomainMapper.BianMethodMapping mm : mapping.methodMappings.values()) {
                sb.append("| `").append(mm.methodName).append("` ");
                sb.append("| ").append(mm.actionTerm.actionTerm).append(" ");
                sb.append("| ").append(mm.httpMethod).append(" ");
                sb.append("| `").append(mapping.baseUrl).append(mm.fullUrl).append("` ");
                sb.append("| ").append(mm.behaviorQualifier != null ? mm.behaviorQualifier : "-").append(" |\n");
            }
            sb.append("\n");
        }

        // Glossaire BIAN
        sb.append("## Glossaire BIAN\n\n");
        sb.append("| Terme | Definition |\n");
        sb.append("|-------|-----------|\n");
        sb.append("| **Service Domain** | Unite fonctionnelle autonome dans l'architecture BIAN |\n");
        sb.append("| **Control Record** | Objet metier principal gere par le Service Domain |\n");
        sb.append("| **Behavior Qualifier** | Sous-aspect du Control Record (ex: balances, payments) |\n");
        sb.append("| **Action Term** | Verbe standardise BIAN (Initiate, Retrieve, Update, Execute, Control) |\n");
        sb.append("| **Functional Pattern** | Categorisation du comportement du Service Domain (FULFILL, PROCESS, etc.) |\n");
        sb.append("\n");

        Files.writeString(projectRoot.resolve("BIAN_MAPPING.md"), sb.toString());
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

    /** FIX P0-1b: Liste des types framework EAI qui doivent etre remplaces par Map<String, Object> */
    private static final Set<String> FRAMEWORK_TYPES_SET = Set.of(
            "Envelope", "Parser", "ParsingException", "UtilHash",
            "SynchroneService", "Services", "Log", "EaiLog",
            "FwkRollbackException", "BaseUseCase", "ValueObject"
    );

    /** FIX P0-1b: Verifie si un type est un type framework EAI */
    private boolean isFrameworkType(String type) {
        if (type == null) return false;
        String baseType = extractBaseType(type);
        return FRAMEWORK_TYPES_SET.contains(baseType);
    }

    /** FIX P0-1b: Remplace les types framework EAI par Map<String, Object> */
    private String replaceFrameworkType(String type) {
        if (type == null) return type;
        String baseType = extractBaseType(type);
        if (FRAMEWORK_TYPES_SET.contains(baseType)) {
            return "Map<String, Object>";
        }
        return type;
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

        // 401 Unauthorized (authentification — FR + EN)
        if (lower.contains("authentification") || lower.contains("authentication") || lower.contains("unauthenticated")
                || lower.contains("notauthenticated") || lower.contains("auth") || lower.contains("login")
                || lower.contains("token") || lower.contains("credentials") || lower.contains("session")) {
            return "HttpStatus.UNAUTHORIZED";
        }

        // 403 Forbidden (permission — FR + EN)
        if (lower.contains("interdit") || lower.contains("nonautorise") || lower.contains("nonhabilite")) {
            return "HttpStatus.FORBIDDEN";
        }

        // 409 Conflict (etat incompatible, compte ferme, doublon, rollback framework, deja actif)
        if (lower.contains("conflict") || lower.contains("duplicate") || lower.contains("closed")
                || lower.contains("already") || lower.contains("exists") || lower.contains("ferme")
                || lower.contains("cloture") || lower.contains("fwkrollback") || lower.contains("rollback")
                || lower.contains("deja") || lower.contains("doublon") || lower.contains("active")
                || lower.contains("business") || lower.contains("metier")) {
            return "HttpStatus.CONFLICT";
        }

        // BOA/EAI : 400 Bad Request (parsing, technique)
        if (lower.contains("parsing") || lower.contains("technique") || lower.contains("format")
                || lower.contains("conversion") || lower.contains("mapping")) {
            return "HttpStatus.BAD_REQUEST";
        }

        // BOA/EAI : 422 Unprocessable Entity (fonctionnel, metier, regle)
        if (lower.contains("fonctionnel") || lower.contains("regle") || lower.contains("controle")
                || lower.contains("plafond") || lower.contains("seuil")) {
            return "HttpStatus.UNPROCESSABLE_ENTITY";
        }

        // 422 Unprocessable Entity (solde insuffisant, limite depassee)
        if (lower.contains("insufficient") || lower.contains("insuffisant")
                || lower.contains("limit") || lower.contains("exceeded")
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

    // ===================== CUSTOM ANNOTATIONS : RAPPORT =====================

    /**
     * Genere le rapport CUSTOM_ANNOTATIONS_REPORT.md dans le projet genere.
     */
    private void generateAnnotationReport(Path projectRoot,
                                          AnnotationPropagator.AnnotationReport report,
                                          ProjectAnalysisResult analysisResult) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append(report.toMarkdown());

        // Ajouter une section avec les actions recommandees
        sb.append("## Actions Recommandees\n\n");

        if (report.hasUnknownAnnotations()) {
            sb.append("### Annotations Internes Non Declarees\n\n");
            sb.append("Les annotations suivantes proviennent de packages internes de la banque ");
            sb.append("mais ne sont pas declarees dans `custom-annotations.yml`.\n\n");
            sb.append("Pour chaque annotation, ajoutez une entree dans le fichier YAML avec :\n");
            sb.append("- `name` : Nom de l'annotation\n");
            sb.append("- `category` : SECURITY, AUDIT, TRANSACTION, CHANNEL, RISK, COMPLIANCE, CACHING, MONITORING, BUSINESS\n");
            sb.append("- `propagation` : PROPAGATE_CLASS, PROPAGATE_METHOD, PROPAGATE_BOTH, TRANSFORM, COMMENT, IGNORE\n");
            sb.append("- `spring-equivalent` : (optionnel) Equivalent Spring Boot\n\n");

            sb.append("```yaml\n");
            for (DetectedAnnotation da : report.unknownInternal) {
                sb.append("  - name: \"").append(da.getName()).append("\"\n");
                sb.append("    category: CUSTOM  # A preciser\n");
                sb.append("    description: \"Detectee sur ").append(da.getSourceClassName()).append("\"\n");
                sb.append("    propagation: PROPAGATE_METHOD  # A preciser\n");
                sb.append("    example: \"").append(da.getFullExpression()).append("\"\n\n");
            }
            sb.append("```\n\n");
        }

        // Synthese des propagations effectuees
        sb.append("### Propagations Effectuees\n\n");
        List<DetectedAnnotation> known = analysisResult.getDetectedCustomAnnotations().stream()
                .filter(DetectedAnnotation::isKnown)
                .collect(Collectors.toList());

        if (!known.isEmpty()) {
            sb.append("| Annotation Source | Classe | Strategie | Code Genere |\n");
            sb.append("|-------------------|--------|-----------|-------------|\n");
            for (DetectedAnnotation da : known) {
                String generated = da.toGeneratedCode();
                sb.append("| `").append(da.getFullExpression()).append("` | ");
                sb.append(da.getSourceClassName()).append(" | ");
                sb.append(da.getDefinition().getPropagation()).append(" | ");
                sb.append("`").append(generated != null ? generated : "IGNORE").append("` |\n");
            }
        } else {
            sb.append("Aucune annotation custom connue detectee.\n");
        }

        Files.writeString(projectRoot.resolve("CUSTOM_ANNOTATIONS_REPORT.md"), sb.toString());
        log.info("[ANNOTATIONS] Rapport CUSTOM_ANNOTATIONS_REPORT.md genere");
    }

    /**
     * Propage les annotations custom detectees sur les controllers generes.
     * Injecte les annotations transformees/propagees en tete des fichiers controller.
     */
    private void propagateAnnotationsToControllers(Path srcMain,
                                                   ProjectAnalysisResult analysisResult) throws IOException {
        if (annotationPropagator == null) return;

        // Grouper les annotations par classe source
        Map<String, List<DetectedAnnotation>> byClass = analysisResult.getDetectedCustomAnnotations().stream()
                .collect(Collectors.groupingBy(DetectedAnnotation::getSourceClassName));

        Path controllerDir = srcMain.resolve("controller");
        if (!Files.exists(controllerDir)) return;

        for (Map.Entry<String, List<DetectedAnnotation>> entry : byClass.entrySet()) {
            String className = entry.getKey();
            List<DetectedAnnotation> annotations = entry.getValue();

            // Trouver le fichier controller correspondant
            String controllerFileName = className + "Controller.java";
            Path controllerFile = controllerDir.resolve(controllerFileName);
            if (!Files.exists(controllerFile)) {
                // Essayer avec le suffixe "RestController"
                controllerFile = controllerDir.resolve(className.replace("UseCase", "") + "Controller.java");
                if (!Files.exists(controllerFile)) continue;
            }

            // Lire le contenu existant
            String content = Files.readString(controllerFile);

            // Generer les annotations de classe
            List<String> classAnnotations = annotationPropagator.getClassLevelAnnotations(annotations);
            List<String> methodAnnotations = annotationPropagator.getMethodLevelAnnotations(annotations);
            List<String> comments = annotationPropagator.getCommentAnnotations(annotations);
            List<String> todos = annotationPropagator.getUnknownAnnotationTodos(annotations);
            Set<String> imports = annotationPropagator.getRequiredImports(annotations);

            // Injecter les imports
            if (!imports.isEmpty()) {
                StringBuilder importBlock = new StringBuilder();
                for (String imp : imports) {
                    String importLine = "import " + imp + ";";
                    if (!content.contains(importLine)) {
                        importBlock.append(importLine).append("\n");
                    }
                }
                if (importBlock.length() > 0) {
                    // Inserer apres le dernier import existant
                    int lastImport = content.lastIndexOf("import ");
                    if (lastImport >= 0) {
                        int endOfLine = content.indexOf("\n", lastImport);
                        content = content.substring(0, endOfLine + 1) +
                                  importBlock +
                                  content.substring(endOfLine + 1);
                    }
                }
            }

            // Injecter les annotations de classe (avant @RestController ou @Controller)
            if (!classAnnotations.isEmpty() || !comments.isEmpty() || !todos.isEmpty()) {
                StringBuilder annotBlock = new StringBuilder();
                annotBlock.append("\n    // === ANNOTATIONS CUSTOM BANCAIRES (propagees automatiquement) ===\n");
                for (String comment : comments) {
                    annotBlock.append("    ").append(comment).append("\n");
                }
                for (String todo : todos) {
                    annotBlock.append("    ").append(todo).append("\n");
                }
                for (String ann : classAnnotations) {
                    annotBlock.append("    ").append(ann).append("\n");
                }

                // Inserer avant @RestController
                int restControllerIdx = content.indexOf("@RestController");
                if (restControllerIdx >= 0) {
                    content = content.substring(0, restControllerIdx) +
                              annotBlock +
                              content.substring(restControllerIdx);
                }
            }

            // Injecter les annotations de methode (avant chaque @PostMapping/@GetMapping/etc.)
            if (!methodAnnotations.isEmpty()) {
                for (String ann : methodAnnotations) {
                    // Injecter avant chaque mapping HTTP
                    for (String mapping : List.of("@PostMapping", "@GetMapping", "@PutMapping",
                            "@DeleteMapping", "@PatchMapping", "@RequestMapping")) {
                        content = content.replace(
                                "    " + mapping,
                                "    " + ann + "\n    " + mapping
                        );
                    }
                }
            }

            // Ecrire le fichier modifie
            Files.writeString(controllerFile, content);
            log.info("[ANNOTATIONS] Annotations propagees sur : {}", controllerFile.getFileName());
        }
    }

    // ===================== BIAN v2 : HEADER FILTER =====================

    /**
     * Genere le BianHeaderFilter : filtre HTTP qui injecte les headers X-BIAN-*
     * sur chaque reponse REST.
     */
    private void generateBianHeaderFilter(Path srcMain) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".config;\n\n");
        sb.append("import jakarta.servlet.*;\n");
        sb.append("import jakarta.servlet.http.HttpServletRequest;\n");
        sb.append("import jakarta.servlet.http.HttpServletResponse;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.core.annotation.Order;\n");
        sb.append("import org.springframework.stereotype.Component;\n\n");
        sb.append("import java.io.IOException;\n");
        sb.append("import java.util.Map;\n\n");

        sb.append("/**\n");
        sb.append(" * Filtre HTTP BIAN — Injecte les headers X-BIAN-* sur chaque reponse.\n");
        sb.append(" *\n");
        sb.append(" * Headers injectes :\n");
        sb.append(" *   X-BIAN-Service-Domain : nom du Service Domain (ex: current-account)\n");
        sb.append(" *   X-BIAN-Service-Domain-ID : identifiant BIAN (ex: SD0152)\n");
        sb.append(" *   X-BIAN-Action : action BIAN (ex: retrieval, initiation)\n");
        sb.append(" *   X-BIAN-Behavior-Qualifier : behavior qualifier (ex: balance, transaction)\n");
        sb.append(" *   X-BIAN-Version : version du standard BIAN utilise\n");
        sb.append(" *\n");
        sb.append(" * @generated par Compleo — Direction Digitale Factory BMCE Bank\n");
        sb.append(" */\n");
        sb.append("@Component\n");
        sb.append("@Order(1)\n");
        sb.append("public class BianHeaderFilter implements Filter {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(BianHeaderFilter.class);\n\n");

        sb.append("    private static final String BIAN_VERSION = \"12.0\";\n\n");

        sb.append("    // Mapping URL prefix → Service Domain\n");
        sb.append("    private static final Map<String, String[]> DOMAIN_MAP = Map.ofEntries(\n");
        sb.append("        Map.entry(\"/api/v1/current-account\", new String[]{\"current-account\", \"SD0152\"}),\n");
        sb.append("        Map.entry(\"/api/v1/savings-account\", new String[]{\"savings-account\", \"SD0155\"}),\n");
        sb.append("        Map.entry(\"/api/v1/payment-initiation\", new String[]{\"payment-initiation\", \"SD0249\"}),\n");
        sb.append("        Map.entry(\"/api/v1/card-management\", new String[]{\"card-management\", \"SD0070\"}),\n");
        sb.append("        Map.entry(\"/api/v1/party\", new String[]{\"party\", \"SD0254\"}),\n");
        sb.append("        Map.entry(\"/api/v1/loan\", new String[]{\"loan\", \"SD0433\"}),\n");
        sb.append("        Map.entry(\"/api/v1/customer-notification\", new String[]{\"customer-notification\", \"SD0121\"}),\n");
        sb.append("        Map.entry(\"/api/v1/document-management\", new String[]{\"document-management\", \"SD0281\"}),\n");
        sb.append("        Map.entry(\"/api/v1/product-directory\", new String[]{\"product-directory\", \"SD0313\"}),\n");
        sb.append("        Map.entry(\"/api/v1/currency-exchange\", new String[]{\"currency-exchange\", \"SD0159\"})\n");
        sb.append("    );\n\n");

        sb.append("    // Mapping action keywords dans l'URL\n");
        sb.append("    private static final Map<String, String> ACTION_MAP = Map.of(\n");
        sb.append("        \"initiation\", \"initiation\",\n");
        sb.append("        \"retrieval\", \"retrieval\",\n");
        sb.append("        \"update\", \"update\",\n");
        sb.append("        \"execution\", \"execution\",\n");
        sb.append("        \"termination\", \"termination\",\n");
        sb.append("        \"evaluation\", \"evaluation\",\n");
        sb.append("        \"notification\", \"notification\",\n");
        sb.append("        \"control\", \"control\"\n");
        sb.append("    );\n\n");

        sb.append("    @Override\n");
        sb.append("    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)\n");
        sb.append("            throws IOException, ServletException {\n\n");
        sb.append("        HttpServletRequest httpRequest = (HttpServletRequest) request;\n");
        sb.append("        HttpServletResponse httpResponse = (HttpServletResponse) response;\n");
        sb.append("        String uri = httpRequest.getRequestURI();\n\n");

        sb.append("        // Injecter les headers BIAN\n");
        sb.append("        httpResponse.setHeader(\"X-BIAN-Version\", BIAN_VERSION);\n\n");

        sb.append("        for (Map.Entry<String, String[]> entry : DOMAIN_MAP.entrySet()) {\n");
        sb.append("            if (uri.startsWith(entry.getKey())) {\n");
        sb.append("                httpResponse.setHeader(\"X-BIAN-Service-Domain\", entry.getValue()[0]);\n");
        sb.append("                httpResponse.setHeader(\"X-BIAN-Service-Domain-ID\", entry.getValue()[1]);\n\n");

        sb.append("                // Detecter l'action BIAN dans l'URL\n");
        sb.append("                for (Map.Entry<String, String> actionEntry : ACTION_MAP.entrySet()) {\n");
        sb.append("                    if (uri.contains(\"/\" + actionEntry.getKey())) {\n");
        sb.append("                        httpResponse.setHeader(\"X-BIAN-Action\", actionEntry.getValue());\n");
        sb.append("                        break;\n");
        sb.append("                    }\n");
        sb.append("                }\n\n");

        sb.append("                // Detecter le Behavior Qualifier (segment entre le cr-reference-id et l'action)\n");
        sb.append("                String subPath = uri.substring(entry.getKey().length());\n");
        sb.append("                String[] segments = subPath.split(\"/\");\n");
        sb.append("                // Pattern: /{cr-ref-id}/{bq}/{action} → segments[2] = bq\n");
        sb.append("                if (segments.length >= 3 && !ACTION_MAP.containsKey(segments[2])) {\n");
        sb.append("                    httpResponse.setHeader(\"X-BIAN-Behavior-Qualifier\", segments[2]);\n");
        sb.append("                }\n\n");

        sb.append("                break;\n");
        sb.append("            }\n");
        sb.append("        }\n\n");

        sb.append("        chain.doFilter(request, response);\n");
        sb.append("    }\n");
        sb.append("}\n");

        Path configDir = srcMain.resolve("config");
        Files.createDirectories(configDir);
        Files.writeString(configDir.resolve("BianHeaderFilter.java"), sb.toString());
        log.info("[BIAN] BianHeaderFilter genere");
    }

    // ===================== BIAN v2 : RAPPORT DE MAPPING =====================

    /**
     * Genere le rapport BIAN_MAPPING_V2.md avec le mapping detaille
     * de chaque UseCase vers son Service Domain, action, URL et operationId.
     */
    private void generateBianV2MappingReport(Path projectRoot,
                                              ProjectAnalysisResult analysisResult) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Rapport de Mapping BIAN v2\n\n");
        sb.append("Ce rapport detaille le mapping BIAN complet genere par Compleo.\n\n");

        // Regrouper par Service Domain
        Map<String, List<UseCaseInfo>> grouped = new LinkedHashMap<>();
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            BianMapping mapping = uc.getBianMapping();
            if (mapping != null) {
                grouped.computeIfAbsent(mapping.getServiceDomain(), k -> new ArrayList<>()).add(uc);
            }
        }

        // Tableau de synthese
        sb.append("## Synthese\n\n");
        sb.append("| Service Domain | BIAN ID | Nb Endpoints | Controller Genere |\n");
        sb.append("|----------------|---------|-------------|-------------------|\n");
        for (Map.Entry<String, List<UseCaseInfo>> entry : grouped.entrySet()) {
            BianMapping first = entry.getValue().get(0).getBianMapping();
            sb.append("| ").append(first.getServiceDomainTitle());
            sb.append(" | ").append(first.getBianId() != null ? first.getBianId() : "-");
            sb.append(" | ").append(entry.getValue().size());
            sb.append(" | ").append(first.buildControllerName());
            sb.append(" |\n");
        }

        // Detail par Service Domain
        sb.append("\n## Detail par Service Domain\n\n");
        for (Map.Entry<String, List<UseCaseInfo>> entry : grouped.entrySet()) {
            BianMapping first = entry.getValue().get(0).getBianMapping();
            sb.append("### ").append(first.getServiceDomainTitle());
            if (first.getBianId() != null && !first.getBianId().isEmpty()) {
                sb.append(" (").append(first.getBianId()).append(")");
            }
            sb.append("\n\n");

            sb.append("| UseCase Source | Action | BQ | HTTP | URL BIAN | operationId |\n");
            sb.append("|---------------|--------|----|----|----------|-------------|\n");
            for (UseCaseInfo uc : entry.getValue()) {
                BianMapping m = uc.getBianMapping();
                sb.append("| ").append(uc.getClassName());
                sb.append(" | ").append(m.getAction());
                sb.append(" | ").append(m.getBehaviorQualifier() != null ? m.getBehaviorQualifier() : "-");
                sb.append(" | ").append(m.getHttpMethod()).append(" ").append(m.getHttpStatus());
                sb.append(" | `").append(m.buildUrl("/api/v1")).append("`");
                sb.append(" | ").append(m.buildOperationId());
                sb.append(" |\n");
            }
            sb.append("\n");
        }

        // Headers BIAN
        sb.append("## Headers HTTP BIAN\n\n");
        sb.append("Le `BianHeaderFilter` injecte automatiquement les headers suivants :\n\n");
        sb.append("| Header | Description | Exemple |\n");
        sb.append("|--------|-------------|---------|\n");
        sb.append("| `X-BIAN-Version` | Version du standard BIAN | `12.0` |\n");
        sb.append("| `X-BIAN-Service-Domain` | Nom du Service Domain | `current-account` |\n");
        sb.append("| `X-BIAN-Service-Domain-ID` | Identifiant BIAN officiel | `SD0152` |\n");
        sb.append("| `X-BIAN-Action` | Action BIAN executee | `retrieval` |\n");
        sb.append("| `X-BIAN-Behavior-Qualifier` | Behavior Qualifier (si applicable) | `balance` |\n");

        Files.writeString(projectRoot.resolve("BIAN_MAPPING_V2.md"), sb.toString());
        log.info("[BIAN v2] Rapport BIAN_MAPPING_V2.md genere");
    }

    // =====================================================================
    // KEYCLOAK / OAUTH2 — SecurityConfig conditionne par profil
    // =====================================================================

    /**
     * Genere un SecurityConfig conditionne par profil Spring :
     * - dev, mock, test-e2e, default : OUVERT (permitAll)
     * - qualif, prod : SECURISE avec OAuth2 Resource Server + JWT Keycloak
     *
     * Si aucun bloc security{} n'est present dans le JSON, genere un SecurityConfig
     * basique (permitAll) pour tous les profils.
     */
    private void generateSecurityConfig(Path srcMain, Path resourcesDir, ProjectAnalysisResult analysisResult) throws IOException {
        Path configDir = srcMain.resolve("config");
        Files.createDirectories(configDir);

        // Determiner si on a une config Keycloak
        AdapterDescriptor.SecurityConfig sec = null;
        if (analysisResult.getAdapterDescriptor() != null) {
            sec = analysisResult.getAdapterDescriptor().getSecurity();
        }

        String code;
        if (sec != null && sec.getIssuerUri() != null) {
            // Mode Keycloak : profils ouverts + profils securises
            String rolesClaim = sec.getRolesClaim() != null ? sec.getRolesClaim() : "realm_access.roles";
            code = """
                    package %s.config;
                    
                    import org.springframework.context.annotation.Bean;
                    import org.springframework.context.annotation.Configuration;
                    import org.springframework.context.annotation.Profile;
                    import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
                    import org.springframework.security.config.annotation.web.builders.HttpSecurity;
                    import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
                    import org.springframework.security.config.http.SessionCreationPolicy;
                    import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
                    import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
                    import org.springframework.security.web.SecurityFilterChain;
                    
                    /**
                     * Configuration de securite conditionnee par profil Spring :
                     * - Profils dev, mock, test-e2e : API ouverte (permitAll)
                     * - Profils qualif, prod : API securisee avec Keycloak OAuth2/JWT
                     *
                     * Activation : --spring.profiles.active=qualif,rest
                     */
                    @Configuration
                    @EnableWebSecurity
                    @EnableMethodSecurity
                    public class SecurityConfig {
                    
                        // ==================== PROFILS OUVERTS (dev, mock, test-e2e) ====================
                    
                        @Bean
                        @Profile({"dev", "mock", "test-e2e", "default"})
                        public SecurityFilterChain openFilterChain(HttpSecurity http) throws Exception {
                            http
                                .csrf(csrf -> csrf.disable())
                                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                                .authorizeHttpRequests(auth -> auth
                                    .anyRequest().permitAll()
                                );
                            return http.build();
                        }
                    
                        // ==================== PROFILS SECURISES (qualif, prod) ====================
                    
                        @Bean
                        @Profile({"qualif", "prod"})
                        public SecurityFilterChain securedFilterChain(HttpSecurity http) throws Exception {
                            http
                                .csrf(csrf -> csrf.disable())
                                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                                .authorizeHttpRequests(auth -> auth
                                    .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                                    .requestMatchers("/actuator/**").permitAll()
                                    .requestMatchers("/api/v1/**").authenticated()
                                    .anyRequest().denyAll()
                                )
                                .oauth2ResourceServer(oauth2 -> oauth2
                                    .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
                                );
                            return http.build();
                        }
                    
                        @Bean
                        @Profile({"qualif", "prod"})
                        public JwtAuthenticationConverter jwtAuthenticationConverter() {
                            JwtGrantedAuthoritiesConverter grantedAuthoritiesConverter = new JwtGrantedAuthoritiesConverter();
                            grantedAuthoritiesConverter.setAuthoritiesClaimName("%s");
                            grantedAuthoritiesConverter.setAuthorityPrefix("ROLE_");
                    
                            JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
                            converter.setJwtGrantedAuthoritiesConverter(grantedAuthoritiesConverter);
                            return converter;
                        }
                    }
                    """.formatted(BASE_PACKAGE, rolesClaim);

            // Generer les profils qualif/prod properties dans le dossier resources
            Files.createDirectories(resourcesDir);

            String issuerUri = sec.getIssuerUri();
            String jwkSetUri = sec.getJwkSetUri() != null
                    ? sec.getJwkSetUri()
                    : issuerUri + "/protocol/openid-connect/certs";

            String keycloakQualif = """
                    \n# --- Keycloak/OAuth2 ---
                    app.security.enabled=true
                    spring.security.oauth2.resourceserver.jwt.issuer-uri=%s
                    spring.security.oauth2.resourceserver.jwt.jwk-set-uri=%s
                    logging.level.org.springframework.security=DEBUG
                    """.formatted(issuerUri, jwkSetUri);

            String keycloakProd = """
                    \n# --- Keycloak/OAuth2 ---
                    app.security.enabled=true
                    spring.security.oauth2.resourceserver.jwt.issuer-uri=%s
                    spring.security.oauth2.resourceserver.jwt.jwk-set-uri=%s
                    logging.level.org.springframework.security=WARN
                    """.formatted(issuerUri, jwkSetUri);

            String securityDisabled = "\n# --- Security ---\napp.security.enabled=false\n";

            // Append aux fichiers existants ou creer
            Path qualifProps = resourcesDir.resolve("application-qualif.properties");
            if (Files.exists(qualifProps)) {
                Files.writeString(qualifProps, Files.readString(qualifProps) + keycloakQualif);
            } else {
                Files.writeString(qualifProps, keycloakQualif);
            }

            Path prodProps = resourcesDir.resolve("application-prod.properties");
            if (Files.exists(prodProps)) {
                Files.writeString(prodProps, Files.readString(prodProps) + keycloakProd);
            } else {
                Files.writeString(prodProps, keycloakProd);
            }

            Path devProps = resourcesDir.resolve("application-dev.properties");
            if (Files.exists(devProps)) {
                Files.writeString(devProps, Files.readString(devProps) + securityDisabled);
            } else {
                Files.writeString(devProps, securityDisabled);
            }

            Path mockProps = resourcesDir.resolve("application-mock.properties");
            if (Files.exists(mockProps)) {
                Files.writeString(mockProps, Files.readString(mockProps) + securityDisabled);
            } else {
                Files.writeString(mockProps, securityDisabled);
            }

            log.info("[SECURITY] SecurityConfig Keycloak genere (ouvert en dev/mock, securise en qualif/prod)");
        } else {
            // Pas de bloc security dans le JSON : pas de SecurityConfig genere
            // L'API est naturellement ouverte sans Spring Security
            log.info("[SECURITY] Pas de bloc security dans le JSON — API ouverte (pas de SecurityConfig genere)");
            return;
        }

        Files.writeString(configDir.resolve("SecurityConfig.java"), code);
    }
}
