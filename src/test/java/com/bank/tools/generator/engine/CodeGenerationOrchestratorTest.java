package com.bank.tools.generator.engine;

import com.bank.tools.generator.engine.generators.*;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour le CodeGenerationOrchestrator.
 * Vérifie que la structure du projet généré est correcte.
 */
@DisplayName("CodeGenerationOrchestrator — Génération de projet")
class CodeGenerationOrchestratorTest {

    @TempDir
    Path tempDir;

    private CodeGenerationOrchestrator orchestrator;

    @BeforeEach
    void setup() {
        // Injection manuelle pour les tests unitaires (sans Spring)
        PomGenerator pom = new PomGenerator();
        ConfigGenerator config = new ConfigGenerator();
        ControllerGenerator ctrl = new ControllerGenerator();
        EnumExceptionGenerator enumExc = new EnumExceptionGenerator();
        ExceptionHandlerGenerator excHandler = new ExceptionHandlerGenerator();
        ImportResolver importResolver = new ImportResolver();

        orchestrator = new CodeGenerationOrchestrator(
                pom, config, ctrl, enumExc, excHandler, importResolver);
    }

    private ProjectAnalysisResult createMinimalAnalysis() {
        ProjectAnalysisResult result = new ProjectAnalysisResult();

        UseCaseInfo uc = new UseCaseInfo();
        uc.setClassName("TestUC");
        uc.setEjbPattern(UseCaseInfo.EjbPattern.BASE_USE_CASE);
        uc.setEjbType(UseCaseInfo.EjbType.STATELESS);
        uc.setInputDtoClassName("TestVoIn");
        uc.setOutputDtoClassName("TestVoOut");
        uc.setRestEndpoint("/api/test");
        uc.setServiceAdapterName("TestServiceAdapter");
        uc.setControllerName("TestController");

        result.setUseCases(List.of(uc));
        result.setDtos(List.of());
        result.setDetectedEnums(List.of());
        result.setDetectedExceptions(List.of());
        result.setDetectedValidators(List.of());
        result.setDetectedRemoteInterfaces(List.of());
        result.setDetectedCustomAnnotations(List.of());
        result.setFrameworkDependencies(List.of());

        return result;
    }

    @Test
    @DisplayName("Génère la structure de répertoires correcte")
    void shouldCreateDirectoryStructure() throws IOException {
        ProjectAnalysisResult analysis = createMinimalAnalysis();
        Path result = orchestrator.generateProject(analysis, tempDir, false);

        assertTrue(Files.exists(result.resolve("pom.xml")), "pom.xml");
        assertTrue(Files.isDirectory(result.resolve("src/main/java/com/bank/api/controller")), "controller/");
        assertTrue(Files.isDirectory(result.resolve("src/main/java/com/bank/api/service")), "service/");
        assertTrue(Files.isDirectory(result.resolve("src/main/java/com/bank/api/dto")), "dto/");
        assertTrue(Files.isDirectory(result.resolve("src/main/java/com/bank/api/config")), "config/");
        assertTrue(Files.isDirectory(result.resolve("src/main/java/com/bank/api/exception")), "exception/");
        assertTrue(Files.isDirectory(result.resolve("src/main/java/com/bank/api/enums")), "enums/");
        assertTrue(Files.isDirectory(result.resolve("src/main/java/com/bank/api/validation")), "validation/");
        assertTrue(Files.isDirectory(result.resolve("src/main/resources")), "resources/");
    }

    @Test
    @DisplayName("Génère le POM avec les bonnes dépendances")
    void shouldGeneratePomWithDependencies() throws IOException {
        ProjectAnalysisResult analysis = createMinimalAnalysis();
        Path result = orchestrator.generateProject(analysis, tempDir, false);

        String pom = Files.readString(result.resolve("pom.xml"));
        assertTrue(pom.contains("spring-boot-starter-web"), "Doit contenir spring-boot-starter-web");
        assertTrue(pom.contains("springdoc-openapi"), "Doit contenir springdoc-openapi");
        assertTrue(pom.contains("spring-boot-starter-security"), "Doit contenir spring-boot-starter-security");
        assertTrue(pom.contains("spring-boot-starter-actuator"), "Doit contenir spring-boot-starter-actuator");
    }

    @Test
    @DisplayName("Génère les profils Spring (jndi, mock, http, test-e2e)")
    void shouldGenerateSpringProfiles() throws IOException {
        ProjectAnalysisResult analysis = createMinimalAnalysis();
        Path result = orchestrator.generateProject(analysis, tempDir, false);

        Path resources = result.resolve("src/main/resources");
        assertTrue(Files.exists(resources.resolve("application.properties")));
        assertTrue(Files.exists(resources.resolve("application-jndi.properties")));
        assertTrue(Files.exists(resources.resolve("application-mock.properties")));
        assertTrue(Files.exists(resources.resolve("application-http.properties")));
        assertTrue(Files.exists(resources.resolve("application-test-e2e.properties")));
    }

    @Test
    @DisplayName("Génère Application.java")
    void shouldGenerateApplicationClass() throws IOException {
        ProjectAnalysisResult analysis = createMinimalAnalysis();
        Path result = orchestrator.generateProject(analysis, tempDir, false);

        Path app = result.resolve("src/main/java/com/bank/api/Application.java");
        assertTrue(Files.exists(app));
        String content = Files.readString(app);
        assertTrue(content.contains("@SpringBootApplication"));
        assertTrue(content.contains("SpringApplication.run"));
    }

    @Test
    @DisplayName("Génère SecurityConfig.java")
    void shouldGenerateSecurityConfig() throws IOException {
        ProjectAnalysisResult analysis = createMinimalAnalysis();
        Path result = orchestrator.generateProject(analysis, tempDir, false);

        Path sec = result.resolve("src/main/java/com/bank/api/config/SecurityConfig.java");
        assertTrue(Files.exists(sec));
        String content = Files.readString(sec);
        assertTrue(content.contains("@EnableWebSecurity"));
        assertTrue(content.contains("swagger-ui"));
    }

    @Test
    @DisplayName("En mode couplé, génère un controller par UseCase")
    void shouldGenerateControllerInCoupledMode() throws IOException {
        ProjectAnalysisResult analysis = createMinimalAnalysis();
        Path result = orchestrator.generateProject(analysis, tempDir, false);

        Path ctrl = result.resolve("src/main/java/com/bank/api/controller");
        long count;
        try (var stream = Files.list(ctrl)) {
            count = stream.filter(p -> p.toString().endsWith("Controller.java")).count();
        }
        assertTrue(count >= 1, "Au moins 1 controller doit être généré");
    }

    @Test
    @DisplayName("En mode ACL sans AclGenerator, fallback sur mode couplé")
    void shouldFallbackToCoupledWhenNoAclGenerator() throws IOException {
        ProjectAnalysisResult analysis = createMinimalAnalysis();
        // bianMode=true mais pas d'AclGenerator injecté → fallback couplé
        Path result = orchestrator.generateProject(analysis, tempDir, true);
        assertTrue(Files.exists(result.resolve("pom.xml")));
    }
}
