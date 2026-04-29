package com.bank.tools.generator.integration;

import com.bank.tools.generator.ai.SmartCodeEnhancer;
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
 * Boucle finale : genere l'API depuis le JSON de test et verifie les 7 checks.
 */
@SpringBootTest
@DisplayName("Boucle Finale - 7 Checks")
class FullLoopTest {

    @Autowired
    private CodeGenerationEngine engine;

    @Autowired
    private SmartCodeEnhancer enhancer;

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
    @DisplayName("7 checks de la boucle finale")
    void fullLoop() throws Exception {
        // Parse
        JsonAdapterParser parser = new JsonAdapterParser(new BianAutoDetector());
        ProjectAnalysisResult analysis = parser.parseFromString(JSON);

        // Generate
        Path outputDir = Files.createTempDirectory("full-loop");
        Path projectDir = engine.generateProject(analysis, outputDir, true, "REST");

        // Enhance
        enhancer.enhance(projectDir, analysis);

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

        // === CHECK 1: Service Domain → @RequestMapping ===
        System.out.println("=== 1. Service Domain ===");
        String controllerContent = files.entrySet().stream()
                .filter(e -> e.getKey().contains("controller") && e.getKey().endsWith("Controller.java")
                        && !e.getKey().contains("test") && !e.getKey().contains("Test"))
                .map(Map.Entry::getValue)
                .findFirst().orElse("");
        String requestMapping = Arrays.stream(controllerContent.split("\n"))
                .filter(l -> l.contains("@RequestMapping"))
                .findFirst().orElse("NOT FOUND");
        System.out.println("  " + requestMapping.trim());
        assertTrue(requestMapping.contains("/api/v1/payment-order"),
                "CHECK 1 FAIL: @RequestMapping doit etre /api/v1/payment-order");

        // === CHECK 2: Controller name ===
        System.out.println("=== 2. Controller name ===");
        List<String> controllerFiles = files.keySet().stream()
                .filter(f -> f.contains("controller") && f.endsWith("Controller.java")
                        && !f.contains("test") && !f.contains("Test"))
                .collect(Collectors.toList());
        controllerFiles.forEach(f -> System.out.println("  " + Paths.get(f).getFileName()));
        assertTrue(controllerFiles.stream().anyMatch(f -> f.contains("PaymentOrderController")),
                "CHECK 2 FAIL: PaymentOrderController.java doit exister");

        // === CHECK 3: URLs avec BQ ===
        System.out.println("=== 3. URLs avec BQ ===");
        Arrays.stream(controllerContent.split("\n"))
                .filter(l -> l.contains("@PostMapping") || l.contains("@PutMapping") || l.contains("@GetMapping"))
                .forEach(l -> System.out.println("  " + l.trim()));
        assertTrue(controllerContent.contains("/order/initiation"),
                "CHECK 3 FAIL: URL doit contenir /order/initiation");
        assertTrue(controllerContent.contains("/tracking/retrieval"),
                "CHECK 3 FAIL: URL doit contenir /tracking/retrieval");

        // === CHECK 4: DTOs ===
        System.out.println("=== 4. DTOs ===");
        List<String> requestDtos = files.keySet().stream()
                .filter(f -> f.contains("dto") && f.contains("request") && f.endsWith(".java"))
                .collect(Collectors.toList());
        List<String> responseDtos = files.keySet().stream()
                .filter(f -> f.contains("dto") && f.contains("response") && f.endsWith(".java"))
                .collect(Collectors.toList());
        requestDtos.forEach(f -> System.out.println("  Request: " + Paths.get(f).getFileName()));
        responseDtos.forEach(f -> System.out.println("  Response: " + Paths.get(f).getFileName()));
        assertTrue(requestDtos.stream().anyMatch(f -> f.contains("OrderRequest")),
                "CHECK 4 FAIL: OrderRequest.java doit exister");
        assertTrue(requestDtos.stream().anyMatch(f -> f.contains("TrackingRequest")),
                "CHECK 4 FAIL: TrackingRequest.java doit exister");
        assertTrue(responseDtos.stream().anyMatch(f -> f.contains("OrderResponse")),
                "CHECK 4 FAIL: OrderResponse.java doit exister");
        assertTrue(responseDtos.stream().anyMatch(f -> f.contains("TrackingResponse")),
                "CHECK 4 FAIL: TrackingResponse.java doit exister");
        assertFalse(files.keySet().stream().filter(f -> f.contains("dto")).anyMatch(f -> f.contains("Commande")),
                "CHECK 4 FAIL: Aucun DTO ne doit contenir 'Commande'");

        // === CHECK 5: Compilation (vérifier que le pom.xml est present) ===
        System.out.println("=== 5. Compilation (pom.xml present) ===");
        assertTrue(files.keySet().stream().anyMatch(f -> f.endsWith("pom.xml")),
                "CHECK 5 FAIL: pom.xml doit exister");
        System.out.println("  pom.xml present: OK");

        // === CHECK 6: Service interface ===
        System.out.println("=== 6. Service interface ===");
        List<String> serviceFiles = files.keySet().stream()
                .filter(f -> f.contains("service") && f.endsWith("Service.java") && !f.contains("test"))
                .collect(Collectors.toList());
        serviceFiles.forEach(f -> System.out.println("  " + Paths.get(f).getFileName()));
        assertTrue(serviceFiles.stream().anyMatch(f -> f.contains("PaymentOrderService")),
                "CHECK 6 FAIL: PaymentOrderService.java doit exister");

        // === CHECK 7: RestAdapter ===
        System.out.println("=== 7. RestAdapter ===");
        List<String> adapterFiles = files.keySet().stream()
                .filter(f -> f.contains("RestAdapter") && f.endsWith(".java"))
                .collect(Collectors.toList());
        adapterFiles.forEach(f -> System.out.println("  " + Paths.get(f).getFileName()));
        assertTrue(adapterFiles.stream().anyMatch(f -> f.contains("PaymentOrderRestAdapter")),
                "CHECK 7 FAIL: PaymentOrderRestAdapter.java doit exister");

        // Verifier que le RestAdapter contient les URLs brutes du JSON
        String restAdapterContent = files.entrySet().stream()
                .filter(e -> e.getKey().contains("RestAdapter"))
                .map(Map.Entry::getValue)
                .findFirst().orElse("");
        assertTrue(restAdapterContent.contains("/command-chequier/enrg-commande"),
                "CHECK 7 FAIL: RestAdapter doit contenir l'URL brute /command-chequier/enrg-commande");

        System.out.println("\n=== TOUS LES 7 CHECKS PASSENT ===");

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
