package com.bank.tools.generator.integration;

import com.bank.tools.generator.service.GeneratorService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.IOException;
import java.nio.file.*;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Test d'integration E2E — Pipeline JSON Adapter → Main Pipeline :
 * cree un contrat JSON en memoire, genere via le pipeline principal,
 * puis verifie la structure du projet genere (meme sortie que ZIP/EJB).
 */
@SpringBootTest
@DisplayName("Pipeline JSON → Main Pipeline (E2E)")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class JsonPipelineIntegrationTest {

    @Autowired
    private GeneratorService service;

    private static Path generatedProject;

    private static final String JSON_CONTRACT = """
        {
          "adapter_name": "CommandChequier",
          "adapter_base_url": "http://websphere:9080/api/adapter",
          "description": "Adapter pour la commande de chequiers",
          "version": "1.0.0",
          "endpoints": [
            {
              "operation": "enrg_commande",
              "method": "POST",
              "path": "/command-chequier/enrg-commande",
              "summary": "Enregistrer une commande de chequier",
              "idempotent": true,
              "timeout_seconds": 30,
              "max_retries": 3,
              "request_fields": [
                { "name": "numeroCarte", "type": "String", "required": true, "description": "Numero de carte bancaire" },
                { "name": "quantite", "type": "Integer", "required": true, "description": "Nombre de chequiers" },
                { "name": "adresseLivraison", "type": "String", "required": false, "description": "Adresse de livraison" }
              ],
              "response_fields": [
                { "name": "code", "type": "String", "description": "Code retour (OK, KO)" },
                { "name": "message", "type": "String", "description": "Message descriptif" },
                { "name": "reference", "type": "String", "description": "Reference de la commande" }
              ]
            },
            {
              "operation": "consult_commande",
              "method": "GET",
              "path": "/command-chequier/consult/{reference}",
              "summary": "Consulter le statut d'une commande",
              "request_fields": [
                { "name": "reference", "type": "String", "required": true, "description": "Reference de la commande" }
              ],
              "response_fields": [
                { "name": "reference", "type": "String", "description": "Reference" },
                { "name": "statut", "type": "String", "description": "Statut (EN_COURS, LIVRE, ANNULE)" },
                { "name": "dateCreation", "type": "LocalDate", "description": "Date de creation" }
              ]
            }
          ]
        }
        """;

    @Test
    @Order(1)
    @DisplayName("Generation via pipeline principal a partir du contrat JSON")
    void shouldGenerateFromJsonContract() throws IOException {
        generatedProject = service.generateFromJsonContract(JSON_CONTRACT);

        assertNotNull(generatedProject, "Le chemin du projet genere ne doit pas etre null");
        assertTrue(Files.exists(generatedProject), "Le repertoire du projet genere doit exister");
    }

    @Test
    @Order(2)
    @DisplayName("Le projet genere contient un pom.xml")
    void shouldContainPomXml() {
        assertNotNull(generatedProject);
        Path pom = generatedProject.resolve("pom.xml");
        assertTrue(Files.exists(pom), "Le pom.xml doit etre genere");
    }

    @Test
    @Order(3)
    @DisplayName("Le projet genere contient des Controllers BIAN")
    void shouldContainControllers() throws IOException {
        assertNotNull(generatedProject);
        List<Path> controllers = findFiles(generatedProject, "*Controller.java");
        assertFalse(controllers.isEmpty(), "Au moins 1 Controller doit etre genere");
    }

    @Test
    @Order(4)
    @DisplayName("Le projet genere contient un RestAdapter")
    void shouldContainRestAdapter() throws IOException {
        assertNotNull(generatedProject);
        List<Path> adapters = findFiles(generatedProject, "*RestAdapter.java");
        assertFalse(adapters.isEmpty(), "Au moins 1 RestAdapter doit etre genere");

        // Verifier que le RestAdapter contient la bonne methode HTTP
        Path adapter = adapters.get(0);
        String content = Files.readString(adapter);
        assertTrue(content.contains("HttpMethod.GET") || content.contains("postForEntity"),
                "Le RestAdapter doit utiliser la bonne methode HTTP");
    }

    @Test
    @Order(5)
    @DisplayName("Le projet genere contient des DTOs Request et Response")
    void shouldContainDtos() throws IOException {
        assertNotNull(generatedProject);
        List<Path> requestDtos = findFiles(generatedProject, "*Request.java");
        List<Path> responseDtos = findFiles(generatedProject, "*Response.java");

        assertFalse(requestDtos.isEmpty(), "Au moins 1 DTO Request doit etre genere");
        assertFalse(responseDtos.isEmpty(), "Au moins 1 DTO Response doit etre genere");
    }

    @Test
    @Order(6)
    @DisplayName("Le projet genere contient des Service Interfaces")
    void shouldContainServiceInterfaces() throws IOException {
        assertNotNull(generatedProject);
        List<Path> services = findFiles(generatedProject, "*Service.java");
        assertFalse(services.isEmpty(), "Au moins 1 Service Interface doit etre genere");
    }

    @Test
    @Order(7)
    @DisplayName("Le projet genere contient la configuration application.properties")
    void shouldContainConfiguration() throws IOException {
        assertNotNull(generatedProject);
        List<Path> props = findFiles(generatedProject, "application*.properties");
        assertFalse(props.isEmpty(), "Au moins 1 fichier de configuration doit etre genere");
    }

    @Test
    @Order(8)
    @DisplayName("Le rapport d'amelioration IA est disponible")
    void shouldHaveEnhancementReport() {
        assertNotNull(service.getLastEnhancementReport(),
                "Le rapport d'amelioration IA doit etre disponible apres generation");
        assertTrue(service.getLastEnhancementReport().getQualityScore() > 0,
                "Le score de qualite doit etre positif");
    }

    // ============================================================
    // Helpers
    // ============================================================

    private List<Path> findFiles(Path root, String globPattern) throws IOException {
        try (Stream<Path> walk = Files.walk(root)) {
            PathMatcher matcher = FileSystems.getDefault().getPathMatcher("glob:" + globPattern);
            return walk
                    .filter(Files::isRegularFile)
                    .filter(p -> matcher.matches(p.getFileName()))
                    .collect(Collectors.toList());
        }
    }
}
