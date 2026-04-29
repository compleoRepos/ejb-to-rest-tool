package com.bank.tools.generator.integration;

import com.bank.tools.generator.ai.EnhancementReport;
import com.bank.tools.generator.ai.SmartCodeEnhancer;
import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.model.InputMode;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.parser.JsonAdapterParser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Test E2E : genere l'API depuis le JSON de test et verifie les 5 fixes.
 */
@SpringBootTest(properties = {"cli.enabled=false", "server.port=0"})
class JsonGenerationE2ETest {

    @Autowired
    private JsonAdapterParser jsonAdapterParser;

    @Autowired
    private CodeGenerationEngine engine;

    @Autowired
    private SmartCodeEnhancer enhancer;

    private static final String TEST_JSON = """
            {
              "adapter_name": "CommandChequier",
              "adapter_base_url": "http://websphere-host:9080/api/adapter",
              "description": "Adapter pour la commande de chequiers",
              "version": "1.0.0",
              "bian": {
                "service_domain": "payment-order",
                "service_domain_id": "SD0250"
              },
              "endpoints": [
                {
                  "operation": "enrg_commande",
                  "method": "POST",
                  "path": "/command-chequier/enrg-commande",
                  "summary": "Enregistrer une commande de chequier",
                  "idempotent": true,
                  "timeout_seconds": 30,
                  "max_retries": 3,
                  "bian": {
                    "action": "initiation",
                    "behavior_qualifier": "order",
                    "http_method": "POST",
                    "http_status": 201,
                    "has_cr_reference_id": false
                  },
                  "request_fields": [
                    { "name": "numeroCarte", "type": "String", "required": true },
                    { "name": "quantite", "type": "Integer", "required": true },
                    { "name": "adresseLivraison", "type": "String", "required": false }
                  ],
                  "response_fields": [
                    { "name": "code", "type": "String" },
                    { "name": "message", "type": "String" },
                    { "name": "reference", "type": "String" }
                  ]
                },
                {
                  "operation": "consult_commande",
                  "method": "GET",
                  "path": "/command-chequier/consult/{reference}",
                  "summary": "Consulter le statut d'une commande",
                  "idempotent": false,
                  "timeout_seconds": 15,
                  "max_retries": 2,
                  "bian": {
                    "action": "retrieval",
                    "behavior_qualifier": "tracking",
                    "http_method": "POST",
                    "http_status": 200,
                    "has_cr_reference_id": true
                  },
                  "request_fields": [
                    { "name": "reference", "type": "String", "required": true }
                  ],
                  "response_fields": [
                    { "name": "reference", "type": "String" },
                    { "name": "statut", "type": "String" },
                    { "name": "dateCreation", "type": "date" },
                    { "name": "dateLivraison", "type": "date" }
                  ]
                }
              ]
            }
            """;

    @Test
    void shouldGenerateCompilableApiFromJsonContract(@TempDir Path tempDir) throws IOException {
        // 1. Parse
        ProjectAnalysisResult result = jsonAdapterParser.parseFromString(TEST_JSON);
        result.setInputMode(InputMode.JSON_ADAPTER);

        assertEquals(2, result.getUseCases().size());
        assertEquals(InputMode.JSON_ADAPTER, result.getInputMode());

        // FIX 3 : Noms de DTOs propres (PascalCase depuis BQ)
        var uc0 = result.getUseCases().get(0);
        var uc1 = result.getUseCases().get(1);

        assertEquals("OrderRequest", uc0.getInputDtoClassName(), "FIX 3: DTO doit etre OrderRequest, pas VoIn_ENRG_COMMANDERequest");
        assertEquals("OrderResponse", uc0.getOutputDtoClassName(), "FIX 3: DTO doit etre OrderResponse");
        assertEquals("TrackingRequest", uc1.getInputDtoClassName(), "FIX 3: DTO doit etre TrackingRequest");
        assertEquals("TrackingResponse", uc1.getOutputDtoClassName(), "FIX 3: DTO doit etre TrackingResponse");

        // FIX 2 : HTTP method et status depuis le bloc bian{} de l'endpoint
        assertEquals("POST", uc0.getHttpMethod(), "FIX 2: initiation -> POST");
        assertEquals(201, uc0.getHttpStatusCode(), "FIX 2: initiation -> 201");
        assertEquals("POST", uc1.getHttpMethod(), "FIX 2: retrieval -> POST");
        assertEquals(200, uc1.getHttpStatusCode(), "FIX 2: retrieval -> 200");

        // FIX 1 : BianMapping complet avec service_domain, action, BQ
        assertNotNull(uc0.getBianMapping(), "FIX 1: BianMapping doit exister");
        assertEquals("payment-order", uc0.getBianMapping().getServiceDomain());
        assertEquals("initiation", uc0.getBianMapping().getAction());
        assertEquals("order", uc0.getBianMapping().getBehaviorQualifier());
        assertEquals("SD0250", uc0.getBianMapping().getBianId());

        assertNotNull(uc1.getBianMapping(), "FIX 1: BianMapping doit exister");
        assertEquals("retrieval", uc1.getBianMapping().getAction());
        assertEquals("tracking", uc1.getBianMapping().getBehaviorQualifier());

        // 2. Generate
        Path generatedProject = engine.generateProject(result, tempDir, true, "rest");
        assertNotNull(generatedProject);
        assertTrue(Files.exists(generatedProject));

        // 3. Enhance
        EnhancementReport report = enhancer.enhance(generatedProject, result);
        assertNotNull(report);

        // 4. Verify generated files
        List<String> allFiles = listFiles(generatedProject);

        // FIX 4 : AdapterHealthIndicator au lieu de JndiHealthIndicator
        assertTrue(allFiles.stream().anyMatch(f -> f.contains("AdapterHealthIndicator.java")),
                "FIX 4: AdapterHealthIndicator.java doit exister");
        assertFalse(allFiles.stream().anyMatch(f -> f.contains("JndiHealthIndicator.java")),
                "FIX 4: JndiHealthIndicator.java ne doit PAS exister en mode REST");

        // FIX 3 : DTOs propres
        assertTrue(allFiles.stream().anyMatch(f -> f.contains("OrderRequest.java")),
                "FIX 3: OrderRequest.java doit exister");
        assertTrue(allFiles.stream().anyMatch(f -> f.contains("TrackingResponse.java")),
                "FIX 3: TrackingResponse.java doit exister");

        // FIX 5 : RestAdapter existe
        assertTrue(allFiles.stream().anyMatch(f -> f.contains("RestAdapter.java")),
                "FIX 5: RestAdapter.java doit exister");

        // Verifier le contenu du RestAdapter pour FIX 5
        Path restAdapterFile = allFiles.stream()
                .filter(f -> f.contains("RestAdapter.java"))
                .map(Path::of)
                .findFirst()
                .orElseThrow();
        String restAdapterContent = Files.readString(restAdapterFile);
        assertTrue(restAdapterContent.contains("/command-chequier/enrg-commande"),
                "FIX 5: RestAdapter doit contenir l'URL brute du JSON");
        assertTrue(restAdapterContent.contains("/command-chequier/consult/{reference}"),
                "FIX 5: RestAdapter doit contenir l'URL brute du JSON pour consult");

        // Verifier le contenu du Controller pour FIX 1
        Path controllerFile = allFiles.stream()
                .filter(f -> f.contains("Controller.java") && f.contains("PaymentOrder"))
                .map(Path::of)
                .findFirst()
                .orElseThrow();
        String controllerContent = Files.readString(controllerFile);
        assertTrue(controllerContent.contains("/api/v1/payment-order"),
                "FIX 1: Controller doit avoir l'URL BIAN /api/v1/payment-order");
        assertFalse(controllerContent.contains("enrg-commande"),
                "FIX 1: Controller ne doit PAS contenir le nom brut enrg-commande");
        assertFalse(controllerContent.contains("consult-commande"),
                "FIX 1: Controller ne doit PAS contenir le nom brut consult-commande");

        // Verifier le contenu du AdapterHealthIndicator pour FIX 4
        Path healthFile = allFiles.stream()
                .filter(f -> f.contains("AdapterHealthIndicator.java"))
                .map(Path::of)
                .findFirst()
                .orElseThrow();
        String healthContent = Files.readString(healthFile);
        assertTrue(healthContent.contains("RestTemplate"),
                "FIX 4: AdapterHealthIndicator doit utiliser RestTemplate");
        assertTrue(healthContent.contains("websphere-host:9080"),
                "FIX 4: AdapterHealthIndicator doit avoir l'URL du JSON");
        assertFalse(healthContent.contains("JNDI"),
                "FIX 4: AdapterHealthIndicator ne doit PAS mentionner JNDI");

        System.out.println("=== ALL 5 FIXES VERIFIED ===");
        System.out.println("Generated files: " + allFiles.size());
        allFiles.forEach(f -> System.out.println("  " + f));
    }

    private List<String> listFiles(Path dir) throws IOException {
        List<String> files = new ArrayList<>();
        Files.walkFileTree(dir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                files.add(file.toString());
                return FileVisitResult.CONTINUE;
            }
        });
        return files;
    }
}
