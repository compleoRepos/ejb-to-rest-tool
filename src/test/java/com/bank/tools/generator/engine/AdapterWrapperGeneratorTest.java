package com.bank.tools.generator.engine;

import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.model.AdapterContractInfo;
import com.bank.tools.generator.model.AdapterContractInfo.EndpointInfo;
import com.bank.tools.generator.model.AdapterContractInfo.FieldInfo;
import org.junit.jupiter.api.*;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour le generateur de Wrapper BIAN a partir de contrats d'adapter.
 */
@DisplayName("AdapterWrapperGenerator")
class AdapterWrapperGeneratorTest {

    private final AdapterWrapperGenerator generator = new AdapterWrapperGenerator(new BianAutoDetector());
    private Path outputDir;

    @BeforeEach
    void setUp() throws IOException {
        outputDir = Files.createTempDirectory("adapter-wrapper-test-");
    }

    @AfterEach
    void tearDown() throws IOException {
        if (outputDir != null && Files.exists(outputDir)) {
            try (Stream<Path> walk = Files.walk(outputDir)) {
                walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                    try { Files.deleteIfExists(p); } catch (IOException ignored) {}
                });
            }
        }
    }

    // ============================================================
    // Helper : creer un contrat de test
    // ============================================================

    private AdapterContractInfo createTestContract() {
        AdapterContractInfo contract = new AdapterContractInfo();
        contract.setAdapterName("CommandChequier");
        contract.setAdapterBaseUrl("http://websphere:9080/api/adapter");
        contract.setDescription("Adapter pour la commande de chequiers");
        contract.setVersion("1.0.0");

        EndpointInfo ep = new EndpointInfo();
        ep.setOperation("enrg_commande");
        ep.setMethod("POST");
        ep.setPath("/command-chequier/enrg-commande");
        ep.setSummary("Enregistrer une commande de chequier");
        ep.setIdempotent(true);
        ep.setTimeoutSeconds(30);
        ep.setMaxRetries(3);

        FieldInfo reqField1 = new FieldInfo();
        reqField1.setName("numeroCarte");
        reqField1.setType("String");
        reqField1.setRequired(true);
        reqField1.setDescription("Numero de carte");

        FieldInfo reqField2 = new FieldInfo();
        reqField2.setName("quantite");
        reqField2.setType("Integer");
        reqField2.setRequired(true);
        reqField2.setDescription("Nombre de chequiers");

        FieldInfo respField1 = new FieldInfo();
        respField1.setName("code");
        respField1.setType("String");
        respField1.setDescription("Code retour");

        FieldInfo respField2 = new FieldInfo();
        respField2.setName("reference");
        respField2.setType("String");
        respField2.setDescription("Reference de la commande");

        ep.setRequestFields(List.of(reqField1, reqField2));
        ep.setResponseFields(List.of(respField1, respField2));
        contract.setEndpoints(List.of(ep));

        return contract;
    }

    private AdapterContractInfo createMultiEndpointContract() {
        AdapterContractInfo contract = createTestContract();

        EndpointInfo ep2 = new EndpointInfo();
        ep2.setOperation("consult_commande");
        ep2.setMethod("GET");
        ep2.setPath("/command-chequier/consult/{reference}");
        ep2.setSummary("Consulter une commande");
        ep2.setIdempotent(false);
        ep2.setTimeoutSeconds(15);
        ep2.setMaxRetries(2);

        FieldInfo reqField = new FieldInfo();
        reqField.setName("reference");
        reqField.setType("String");
        reqField.setRequired(true);

        FieldInfo respField = new FieldInfo();
        respField.setName("statut");
        respField.setType("String");

        ep2.setRequestFields(List.of(reqField));
        ep2.setResponseFields(List.of(respField));

        List<EndpointInfo> endpoints = new ArrayList<>(contract.getEndpoints());
        endpoints.add(ep2);
        contract.setEndpoints(endpoints);

        return contract;
    }

    // ============================================================
    // Tests de generation
    // ============================================================

    @Nested
    @DisplayName("Generation du projet")
    class ProjectGeneration {

        @Test
        @DisplayName("Genere un projet complet avec la bonne structure")
        void shouldGenerateCompleteProject() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            assertNotNull(projectRoot);
            assertTrue(Files.exists(projectRoot));
            assertTrue(Files.isDirectory(projectRoot));
        }

        @Test
        @DisplayName("Genere le pom.xml avec Resilience4j")
        void shouldGeneratePomWithResilience4j() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);
            Path pomFile = projectRoot.resolve("pom.xml");

            assertTrue(Files.exists(pomFile), "pom.xml doit exister");
            String pomContent = Files.readString(pomFile);
            assertTrue(pomContent.contains("resilience4j"), "pom.xml doit contenir resilience4j");
            assertTrue(pomContent.contains("spring-boot-starter-web"), "pom.xml doit contenir spring-boot-starter-web");
        }

        @Test
        @DisplayName("Genere les classes d'enveloppe ApiRequest et ApiResponse")
        void shouldGenerateEnvelopeClasses() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                List<String> files = walk.filter(Files::isRegularFile)
                        .map(p -> p.getFileName().toString())
                        .toList();

                assertTrue(files.contains("ApiRequest.java"), "ApiRequest.java doit etre genere");
                assertTrue(files.contains("ApiResponse.java"), "ApiResponse.java doit etre genere");
            }
        }

        @Test
        @DisplayName("Genere le Controller BIAN")
        void shouldGenerateController() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                List<String> files = walk.filter(Files::isRegularFile)
                        .map(p -> p.getFileName().toString())
                        .toList();

                assertTrue(files.contains("CommandChequierController.java"),
                        "CommandChequierController.java doit etre genere");
            }
        }

        @Test
        @DisplayName("Genere le Service Interface")
        void shouldGenerateServiceInterface() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                List<String> files = walk.filter(Files::isRegularFile)
                        .map(p -> p.getFileName().toString())
                        .toList();

                assertTrue(files.contains("CommandChequierService.java"),
                        "CommandChequierService.java doit etre genere");
            }
        }

        @Test
        @DisplayName("Genere le RestAdapter avec resilience")
        void shouldGenerateRestAdapter() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                Optional<Path> adapter = walk.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().contains("RestAdapter"))
                        .findFirst();

                assertTrue(adapter.isPresent(), "RestAdapter doit etre genere");
                String content = Files.readString(adapter.get());
                assertTrue(content.contains("CircuitBreaker"), "RestAdapter doit contenir @CircuitBreaker");
                assertTrue(content.contains("Retry"), "RestAdapter doit contenir @Retry");
            }
        }

        @Test
        @DisplayName("Genere les DTOs Request et Response")
        void shouldGenerateDtos() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                List<String> files = walk.filter(Files::isRegularFile)
                        .map(p -> p.getFileName().toString())
                        .toList();

                assertTrue(files.contains("EnrgCommandeRequest.java"),
                        "EnrgCommandeRequest.java doit etre genere");
                assertTrue(files.contains("EnrgCommandeResponse.java"),
                        "EnrgCommandeResponse.java doit etre genere");
            }
        }

        @Test
        @DisplayName("Genere l'IdempotencyService")
        void shouldGenerateIdempotencyService() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                List<String> files = walk.filter(Files::isRegularFile)
                        .map(p -> p.getFileName().toString())
                        .toList();

                assertTrue(files.contains("IdempotencyService.java"),
                        "IdempotencyService.java doit etre genere");
            }
        }

        @Test
        @DisplayName("Genere les fichiers de configuration")
        void shouldGenerateConfiguration() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                List<String> files = walk.filter(Files::isRegularFile)
                        .map(p -> p.getFileName().toString())
                        .toList();

                assertTrue(files.contains("application.properties") || files.contains("application.yml"),
                        "Configuration Spring Boot doit etre generee");
            }
        }

        @Test
        @DisplayName("Genere les tests Pact")
        void shouldGeneratePactTests() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                List<String> files = walk.filter(Files::isRegularFile)
                        .map(p -> p.getFileName().toString())
                        .toList();

                assertTrue(files.stream().anyMatch(f -> f.contains("PactConsumerTest")),
                        "Tests Pact doivent etre generes");
            }
        }
    }

    // ============================================================
    // Tests multi-endpoints
    // ============================================================

    @Nested
    @DisplayName("Multi-endpoints")
    class MultiEndpoints {

        @Test
        @DisplayName("Genere les DTOs pour chaque endpoint")
        void shouldGenerateDtosForEachEndpoint() throws IOException {
            AdapterContractInfo contract = createMultiEndpointContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                List<String> files = walk.filter(Files::isRegularFile)
                        .map(p -> p.getFileName().toString())
                        .toList();

                assertTrue(files.contains("EnrgCommandeRequest.java"));
                assertTrue(files.contains("EnrgCommandeResponse.java"));
                assertTrue(files.contains("ConsultCommandeRequest.java"));
                assertTrue(files.contains("ConsultCommandeResponse.java"));
            }
        }

        @Test
        @DisplayName("Le Controller contient les methodes pour chaque endpoint")
        void shouldGenerateMethodsForEachEndpoint() throws IOException {
            AdapterContractInfo contract = createMultiEndpointContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                Optional<Path> controller = walk.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().contains("Controller"))
                        .findFirst();

                assertTrue(controller.isPresent());
                String content = Files.readString(controller.get());
                assertTrue(content.contains("enrgCommande"), "Controller doit contenir la methode enrgCommande");
                assertTrue(content.contains("consultCommande"), "Controller doit contenir la methode consultCommande");
            }
        }
    }

    // ============================================================
    // Tests de contenu du Controller
    // ============================================================

    @Nested
    @DisplayName("Contenu du Controller")
    class ControllerContent {

        @Test
        @DisplayName("Le Controller utilise l'enveloppe ApiRequest/ApiResponse")
        void shouldUseEnvelopeFormat() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                Optional<Path> controller = walk.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().contains("Controller"))
                        .findFirst();

                assertTrue(controller.isPresent());
                String content = Files.readString(controller.get());
                assertTrue(content.contains("ApiRequest"), "Controller doit utiliser ApiRequest");
                assertTrue(content.contains("ApiResponse"), "Controller doit utiliser ApiResponse");
            }
        }

        @Test
        @DisplayName("Le Controller a les annotations Spring correctes")
        void shouldHaveSpringAnnotations() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                Optional<Path> controller = walk.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().contains("Controller"))
                        .findFirst();

                assertTrue(controller.isPresent());
                String content = Files.readString(controller.get());
                assertTrue(content.contains("@RestController"), "Controller doit avoir @RestController");
                assertTrue(content.contains("@RequestMapping"), "Controller doit avoir @RequestMapping");
            }
        }
    }

    // ============================================================
    // Tests de contenu du RestAdapter
    // ============================================================

    @Nested
    @DisplayName("Contenu du RestAdapter")
    class RestAdapterContent {

        @Test
        @DisplayName("Le RestAdapter a les annotations de resilience")
        void shouldHaveResilienceAnnotations() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                Optional<Path> adapter = walk.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().contains("RestAdapter"))
                        .findFirst();

                assertTrue(adapter.isPresent());
                String content = Files.readString(adapter.get());
                assertTrue(content.contains("@CircuitBreaker"));
                assertTrue(content.contains("@Retry"));
                assertTrue(content.contains("@Bulkhead"));
            }
        }

        @Test
        @DisplayName("Le RestAdapter utilise RestTemplate")
        void shouldUseRestTemplate() throws IOException {
            AdapterContractInfo contract = createTestContract();
            Path projectRoot = generator.generate(contract, outputDir);

            try (Stream<Path> walk = Files.walk(projectRoot)) {
                Optional<Path> adapter = walk.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().contains("RestAdapter"))
                        .findFirst();

                assertTrue(adapter.isPresent());
                String content = Files.readString(adapter.get());
                assertTrue(content.contains("RestTemplate"), "RestAdapter doit utiliser RestTemplate");
            }
        }
    }
}
