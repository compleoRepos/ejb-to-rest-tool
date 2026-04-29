package com.bank.tools.generator.integration;

import com.bank.tools.generator.ai.SmartCodeEnhancer;
import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.parser.JsonAdapterParser;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.*;

/**
 * Genere l'API dans /tmp/test-out pour la boucle finale.
 */
@SpringBootTest
@DisplayName("Generate to Folder")
class GenerateToFolderTest {

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
    @DisplayName("Generate API to /tmp/test-out")
    void generateToFolder() throws Exception {
        Path outputDir = Path.of("/tmp/test-out");
        // Clean
        if (Files.exists(outputDir)) {
            Files.walk(outputDir).sorted(java.util.Comparator.reverseOrder())
                    .map(Path::toFile).forEach(java.io.File::delete);
        }
        Files.createDirectories(outputDir);

        // Parse
        JsonAdapterParser parser = new JsonAdapterParser(new BianAutoDetector());
        ProjectAnalysisResult analysis = parser.parseFromString(JSON);

        // Generate
        Path projectDir = engine.generateProject(analysis, outputDir, true, "REST");

        // Enhance
        enhancer.enhance(projectDir, analysis);

        System.out.println("API generee dans : " + projectDir);
        System.out.println("DONE");
    }
}
