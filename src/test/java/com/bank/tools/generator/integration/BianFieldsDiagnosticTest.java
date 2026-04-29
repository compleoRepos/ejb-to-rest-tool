package com.bank.tools.generator.integration;

import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.parser.JsonAdapterParser;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Test de diagnostic pour verifier les 3 champs BIAN ignores.
 */
@SpringBootTest
@DisplayName("Diagnostic BIAN Fields")
class BianFieldsDiagnosticTest {

    @Autowired
    private CodeGenerationEngine engine;

    private static final String JSON = """
        {
          "adapter_name": "CommandChequier",
          "adapter_base_url": "http://websphere:9080/api/adapter",
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
              "summary": "Enregistrer une commande",
              "bian": {
                "action": "initiation",
                "behavior_qualifier": "order",
                "http_method": "POST",
                "http_status": 201,
                "has_cr_reference_id": false
              },
              "request_fields": [
                { "name": "numeroCarte", "type": "String", "required": true },
                { "name": "quantite", "type": "Integer", "required": true }
              ],
              "response_fields": [
                { "name": "code", "type": "String" },
                { "name": "reference", "type": "String" }
              ]
            },
            {
              "operation": "consult_commande",
              "method": "GET",
              "path": "/command-chequier/consult-commande",
              "summary": "Consulter une commande",
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
                { "name": "statut", "type": "String" },
                { "name": "dateCreation", "type": "String" }
              ]
            }
          ]
        }
        """;

    @Test
    @DisplayName("Diagnostic complet des 3 champs BIAN")
    void diagnosticBianFields() throws Exception {
        // Parse
        JsonAdapterParser parser = new JsonAdapterParser(new BianAutoDetector());
        ProjectAnalysisResult analysis = parser.parseFromString(JSON);

        // Generate
        Path outputDir = Files.createTempDirectory("diag-bian");
        engine.generateProject(analysis, outputDir, true, "REST");

        // Collect all generated files
        Map<String, String> files = new HashMap<>();
        Files.walkFileTree(outputDir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                String relativePath = outputDir.relativize(file).toString();
                files.put(relativePath, Files.readString(file));
                return FileVisitResult.CONTINUE;
            }
        });

        // === CHECK 1: Service Domain -> @RequestMapping + noms des classes ===
        System.out.println("=== CHECK 1: Service Domain ===");

        // Find controller files
        List<String> controllerFiles = files.keySet().stream()
                .filter(f -> f.contains("controller") && f.endsWith("Controller.java") && !f.contains("test"))
                .collect(Collectors.toList());
        System.out.println("Controller files: " + controllerFiles);

        // Check controller name
        boolean hasPaymentOrderController = controllerFiles.stream()
                .anyMatch(f -> f.contains("PaymentOrderController"));
        boolean hasCommandChequierController = controllerFiles.stream()
                .anyMatch(f -> f.contains("CommandChequierController"));
        System.out.println("PaymentOrderController found: " + hasPaymentOrderController);
        System.out.println("CommandChequierController found: " + hasCommandChequierController);

        // Check @RequestMapping
        for (String path : controllerFiles) {
            String content = files.get(path);
            if (content.contains("@RequestMapping")) {
                String line = Arrays.stream(content.split("\n"))
                        .filter(l -> l.contains("@RequestMapping"))
                        .findFirst().orElse("");
                System.out.println("@RequestMapping in " + path + ": " + line.trim());
            }
        }

        // === CHECK 2: BQ in URL ===
        System.out.println("\n=== CHECK 2: BQ in URL ===");
        for (String path : controllerFiles) {
            String content = files.get(path);
            Arrays.stream(content.split("\n"))
                    .filter(l -> l.contains("@PostMapping") || l.contains("@PutMapping") || l.contains("@GetMapping"))
                    .forEach(l -> System.out.println("  " + l.trim()));
        }

        // === CHECK 3: DTO names ===
        System.out.println("\n=== CHECK 3: DTO names ===");
        List<String> requestDtos = files.keySet().stream()
                .filter(f -> f.contains("dto/request") || f.contains("dto\\request"))
                .collect(Collectors.toList());
        List<String> responseDtos = files.keySet().stream()
                .filter(f -> f.contains("dto/response") || f.contains("dto\\response"))
                .collect(Collectors.toList());
        System.out.println("Request DTOs: " + requestDtos);
        System.out.println("Response DTOs: " + responseDtos);

        boolean hasCommande = files.keySet().stream()
                .filter(f -> f.contains("dto"))
                .anyMatch(f -> f.contains("Commande"));
        System.out.println("Contains 'Commande' in DTO names: " + hasCommande);

        // === ASSERTIONS ===
        assertTrue(hasPaymentOrderController,
                "FIX 1 FAIL: Controller should be PaymentOrderController, not CommandChequierController");
        assertFalse(hasCommandChequierController,
                "FIX 1 FAIL: CommandChequierController should NOT exist");

        // Check @RequestMapping contains payment-order
        String controllerContent = files.entrySet().stream()
                .filter(e -> e.getKey().contains("Controller.java") && !e.getKey().contains("test"))
                .map(Map.Entry::getValue)
                .filter(c -> c.contains("@RequestMapping"))
                .findFirst().orElse("");
        assertTrue(controllerContent.contains("/api/v1/payment-order"),
                "FIX 1 FAIL: @RequestMapping should be /api/v1/payment-order");
        assertFalse(controllerContent.contains("command-chequier"),
                "FIX 1 FAIL: @RequestMapping should NOT contain command-chequier");

        // Check BQ in URLs
        assertTrue(controllerContent.contains("/order/initiation"),
                "FIX 2 FAIL: URL should contain /order/initiation");
        assertTrue(controllerContent.contains("/tracking/retrieval"),
                "FIX 2 FAIL: URL should contain /tracking/retrieval");

        // Check DTO names
        assertFalse(hasCommande, "FIX 3 FAIL: DTOs should NOT contain 'Commande'");
        assertTrue(requestDtos.stream().anyMatch(f -> f.contains("OrderRequest")),
                "FIX 3 FAIL: OrderRequest.java should exist");
        assertTrue(requestDtos.stream().anyMatch(f -> f.contains("TrackingRequest")),
                "FIX 3 FAIL: TrackingRequest.java should exist");

        // Cleanup
        deleteRecursive(outputDir);
    }

    private void deleteRecursive(Path dir) throws IOException {
        if (Files.exists(dir)) {
            Files.walkFileTree(dir, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.delete(file);
                    return FileVisitResult.CONTINUE;
                }
                @Override
                public FileVisitResult postVisitDirectory(Path d, IOException exc) throws IOException {
                    Files.delete(d);
                    return FileVisitResult.CONTINUE;
                }
            });
        }
    }
}
