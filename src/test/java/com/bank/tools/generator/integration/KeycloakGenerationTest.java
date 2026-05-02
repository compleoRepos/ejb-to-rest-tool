package com.bank.tools.generator.integration;

import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.parser.JsonAdapterParser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class KeycloakGenerationTest {

    @Autowired
    private JsonAdapterParser parser;

    @Autowired
    private CodeGenerationEngine engine;

    @Test
    void testKeycloakSecurityGeneration() throws Exception {
        // Parse JSON with security block
        String json = Files.readString(Path.of("/home/ubuntu/test-keycloak.json"));
        ProjectAnalysisResult result = parser.parseFromString(json);

        // Verify security config was parsed
        assertNotNull(result.getAdapterDescriptor().getSecurity());
        assertEquals("keycloak", result.getAdapterDescriptor().getSecurity().getType());
        assertEquals("http://keycloak.bank.local:8080/realms/bank-realm",
                result.getAdapterDescriptor().getSecurity().getIssuerUri());

        // Generate API
        Path outputDir = Files.createTempDirectory("keycloak-test");
        engine.generateProject(result, outputDir, true, "REST");

        Path generated = outputDir.resolve("generated-api");
        Path srcMain = generated.resolve("src/main/java/com/bank/api");
        Path resources = generated.resolve("src/main/resources");

        // Check 1: SecurityConfig exists with Keycloak annotations
        Path securityConfig = srcMain.resolve("config/SecurityConfig.java");
        assertTrue(Files.exists(securityConfig), "SecurityConfig.java should exist");
        String secContent = Files.readString(securityConfig);
        assertTrue(secContent.contains("@Profile({\"dev\", \"mock\", \"test-e2e\", \"default\"})"),
                "Should have open profile for dev/mock");
        assertTrue(secContent.contains("@Profile({\"qualif\", \"prod\"})"),
                "Should have secured profile for qualif/prod");
        assertTrue(secContent.contains("oauth2ResourceServer"),
                "Should configure OAuth2 Resource Server");
        assertTrue(secContent.contains("jwtAuthenticationConverter"),
                "Should configure JWT authentication converter");
        assertTrue(secContent.contains("realm_access.roles"),
                "Should use the roles_claim from JSON");

        // Check 2: application-qualif.properties exists with JWT config
        Path qualifProps = resources.resolve("application-qualif.properties");
        assertTrue(Files.exists(qualifProps), "application-qualif.properties should exist");
        String qualifContent = Files.readString(qualifProps);
        assertTrue(qualifContent.contains("keycloak.bank.local:8080/realms/bank-realm"),
                "Should contain issuer URI");
        assertTrue(qualifContent.contains("app.security.enabled=true"),
                "Security should be enabled in qualif");

        // Check 3: application-prod.properties exists
        Path prodProps = resources.resolve("application-prod.properties");
        assertTrue(Files.exists(prodProps), "application-prod.properties should exist");
        String prodContent = Files.readString(prodProps);
        assertTrue(prodContent.contains("app.security.enabled=true"),
                "Security should be enabled in prod");

        // Check 4: application-dev.properties has security disabled
        Path devProps = resources.resolve("application-dev.properties");
        assertTrue(Files.exists(devProps), "application-dev.properties should exist");
        String devContent = Files.readString(devProps);
        assertTrue(devContent.contains("app.security.enabled=false"),
                "Security should be disabled in dev");

        // Check 5: application-mock.properties has security disabled
        Path mockProps = resources.resolve("application-mock.properties");
        assertTrue(Files.exists(mockProps), "application-mock.properties should exist");
        String mockContent = Files.readString(mockProps);
        assertTrue(mockContent.contains("app.security.enabled=false"),
                "Security should be disabled in mock");

        // Check 6: pom.xml has oauth2-resource-server dependency
        Path pom = generated.resolve("pom.xml");
        String pomContent = Files.readString(pom);
        assertTrue(pomContent.contains("spring-boot-starter-oauth2-resource-server"),
                "pom.xml should include oauth2-resource-server");
        assertTrue(pomContent.contains("spring-boot-starter-security"),
                "pom.xml should include spring-boot-starter-security");

        System.out.println("=== KEYCLOAK GENERATION TEST RESULTS ===");
        System.out.println("1. SecurityConfig with profiles:     PASS");
        System.out.println("2. application-qualif.properties:    PASS");
        System.out.println("3. application-prod.properties:      PASS");
        System.out.println("4. application-dev.properties:       PASS");
        System.out.println("5. application-mock.properties:      PASS");
        System.out.println("6. pom.xml with oauth2 dep:          PASS");
        System.out.println("=========================================");
        System.out.println("SCORE: 6/6 PASS");
    }
}
