package com.bank.tools.generator.parser;

import com.bank.tools.generator.model.AdapterContractInfo;
import com.bank.tools.generator.model.AdapterContractInfo.EndpointInfo;
import com.bank.tools.generator.model.AdapterContractInfo.FieldInfo;
import org.junit.jupiter.api.*;

import java.io.IOException;
import java.nio.file.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour le parseur de contrats JSON d'adapter.
 */
@DisplayName("AdapterContractParser")
class AdapterContractParserTest {

    private final AdapterContractParser parser = new AdapterContractParser();

    // ============================================================
    // Parsing valide
    // ============================================================

    @Nested
    @DisplayName("Parsing de contrats valides")
    class ValidContracts {

        @Test
        @DisplayName("Parse un contrat complet avec tous les champs")
        void shouldParseCompleteContract() throws IOException {
            String json = """
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
                        { "name": "numeroCarte", "type": "String", "required": true, "description": "Numero de carte" },
                        { "name": "quantite", "type": "Integer", "required": true, "description": "Nombre de chequiers" },
                        { "name": "adresseLivraison", "type": "String", "required": false, "description": "Adresse" }
                      ],
                      "response_fields": [
                        { "name": "code", "type": "String", "description": "Code retour" },
                        { "name": "message", "type": "String", "description": "Message" },
                        { "name": "reference", "type": "String", "description": "Reference" }
                      ]
                    }
                  ]
                }
                """;

            AdapterContractInfo contract = parser.parseFromString(json);

            assertEquals("CommandChequier", contract.getAdapterName());
            assertEquals("http://websphere:9080/api/adapter", contract.getAdapterBaseUrl());
            assertEquals("Adapter pour la commande de chequiers", contract.getDescription());
            assertEquals("1.0.0", contract.getVersion());
            assertEquals(1, contract.getEndpoints().size());

            EndpointInfo ep = contract.getEndpoints().get(0);
            assertEquals("enrg_commande", ep.getOperation());
            assertEquals("POST", ep.getMethod());
            assertEquals("/command-chequier/enrg-commande", ep.getPath());
            assertTrue(ep.isIdempotent());
            assertEquals(30, ep.getTimeoutSeconds());
            assertEquals(3, ep.getMaxRetries());
            assertEquals(3, ep.getRequestFields().size());
            assertEquals(3, ep.getResponseFields().size());

            FieldInfo reqField = ep.getRequestFields().get(0);
            assertEquals("numeroCarte", reqField.getName());
            assertEquals("String", reqField.getType());
            assertTrue(reqField.isRequired());
        }

        @Test
        @DisplayName("Parse un contrat avec plusieurs endpoints")
        void shouldParseMultipleEndpoints() throws IOException {
            String json = """
                {
                  "adapter_name": "VirementNational",
                  "adapter_base_url": "http://websphere:9080/api/adapter",
                  "endpoints": [
                    {
                      "operation": "initier_virement",
                      "method": "POST",
                      "path": "/virement/initier",
                      "request_fields": [
                        { "name": "montant", "type": "BigDecimal", "required": true }
                      ],
                      "response_fields": [
                        { "name": "reference", "type": "String" }
                      ]
                    },
                    {
                      "operation": "consulter_virement",
                      "method": "GET",
                      "path": "/virement/{reference}",
                      "request_fields": [
                        { "name": "reference", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "statut", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            AdapterContractInfo contract = parser.parseFromString(json);
            assertEquals("VirementNational", contract.getAdapterName());
            assertEquals(2, contract.getEndpoints().size());
            assertEquals("initier_virement", contract.getEndpoints().get(0).getOperation());
            assertEquals("consulter_virement", contract.getEndpoints().get(1).getOperation());
        }

        @Test
        @DisplayName("Parse un contrat minimal (champs optionnels absents)")
        void shouldParseMinimalContract() throws IOException {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://localhost:9080",
                  "endpoints": [
                    {
                      "operation": "test_op",
                      "method": "POST",
                      "path": "/test",
                      "request_fields": [],
                      "response_fields": []
                    }
                  ]
                }
                """;

            AdapterContractInfo contract = parser.parseFromString(json);
            assertNotNull(contract);
            assertEquals("TestAdapter", contract.getAdapterName());
            assertEquals(1, contract.getEndpoints().size());
        }

        @Test
        @DisplayName("Parse depuis un fichier")
        void shouldParseFromFile() throws IOException {
            String json = """
                {
                  "adapter_name": "FileTest",
                  "adapter_base_url": "http://localhost:9080",
                  "endpoints": [
                    {
                      "operation": "file_op",
                      "method": "GET",
                      "path": "/file-test",
                      "request_fields": [],
                      "response_fields": [{ "name": "result", "type": "String" }]
                    }
                  ]
                }
                """;

            Path tempFile = Files.createTempFile("adapter-contract-", ".json");
            Files.writeString(tempFile, json);

            try {
                AdapterContractInfo contract = parser.parse(tempFile);
                assertEquals("FileTest", contract.getAdapterName());
            } finally {
                Files.deleteIfExists(tempFile);
            }
        }
    }

    // ============================================================
    // Validation des erreurs
    // ============================================================

    @Nested
    @DisplayName("Validation des erreurs")
    class ValidationErrors {

        @Test
        @DisplayName("Rejette un JSON vide")
        void shouldRejectEmptyJson() {
            assertThrows(IOException.class, () -> parser.parseFromString("{}"));
        }

        @Test
        @DisplayName("Rejette un JSON sans adapter_name")
        void shouldRejectMissingAdapterName() {
            String json = """
                {
                  "adapter_base_url": "http://localhost:9080",
                  "endpoints": [{ "operation": "op", "method": "POST", "path": "/test", "request_fields": [], "response_fields": [] }]
                }
                """;
            assertThrows(IOException.class, () -> parser.parseFromString(json));
        }

        @Test
        @DisplayName("Rejette un JSON sans endpoints")
        void shouldRejectMissingEndpoints() {
            String json = """
                {
                  "adapter_name": "Test",
                  "adapter_base_url": "http://localhost:9080"
                }
                """;
            assertThrows(IOException.class, () -> parser.parseFromString(json));
        }

        @Test
        @DisplayName("Rejette un JSON invalide (syntaxe)")
        void shouldRejectInvalidJsonSyntax() {
            assertThrows(IOException.class, () -> parser.parseFromString("{ invalid json }"));
        }
    }

    // ============================================================
    // Methodes utilitaires du modele
    // ============================================================

    @Nested
    @DisplayName("Methodes utilitaires AdapterContractInfo")
    class ModelUtilities {

        @Test
        @DisplayName("toKebabCase convertit correctement")
        void shouldConvertToKebabCase() {
            AdapterContractInfo info = new AdapterContractInfo();
            info.setAdapterName("CommandChequier");
            assertEquals("command-chequier", info.toKebabCase());
        }

        @Test
        @DisplayName("toControllerName genere le bon nom")
        void shouldGenerateControllerName() {
            AdapterContractInfo info = new AdapterContractInfo();
            info.setAdapterName("CommandChequier");
            assertEquals("CommandChequierController", info.toControllerName());
        }

        @Test
        @DisplayName("toServiceName genere le bon nom")
        void shouldGenerateServiceName() {
            AdapterContractInfo info = new AdapterContractInfo();
            info.setAdapterName("VirementNational");
            assertEquals("VirementNationalService", info.toServiceName());
        }

        @Test
        @DisplayName("EndpointInfo.toMethodName convertit snake_case en camelCase")
        void shouldConvertOperationToMethodName() {
            EndpointInfo ep = new EndpointInfo();
            ep.setOperation("enrg_commande");
            assertEquals("enrgCommande", ep.toMethodName());
        }

        @Test
        @DisplayName("EndpointInfo.toRequestDtoName genere le bon nom")
        void shouldGenerateRequestDtoName() {
            EndpointInfo ep = new EndpointInfo();
            ep.setOperation("enrg_commande");
            assertEquals("EnrgCommandeRequest", ep.toRequestDtoName());
        }

        @Test
        @DisplayName("EndpointInfo.toResponseDtoName genere le bon nom")
        void shouldGenerateResponseDtoName() {
            EndpointInfo ep = new EndpointInfo();
            ep.setOperation("enrg_commande");
            assertEquals("EnrgCommandeResponse", ep.toResponseDtoName());
        }

        @Test
        @DisplayName("FieldInfo.toJavaType convertit les types correctement")
        void shouldConvertFieldTypes() {
            assertJavaType("String", "String");
            assertJavaType("Integer", "Integer");
            assertJavaType("Integer", "int");
            assertJavaType("Long", "Long");
            assertJavaType("Double", "Double");
            assertJavaType("Double", "number");
            assertJavaType("Boolean", "Boolean");
            assertJavaType("Boolean", "bool");
            assertJavaType("java.math.BigDecimal", "BigDecimal");
            assertJavaType("java.math.BigDecimal", "decimal");
            assertJavaType("java.time.LocalDate", "LocalDate");
            assertJavaType("java.time.LocalDate", "date");
            assertJavaType("java.time.LocalDateTime", "LocalDateTime");
            assertJavaType("java.time.LocalDateTime", "datetime");
            assertJavaType("String", "unknown_type");
        }

        private void assertJavaType(String expected, String inputType) {
            FieldInfo field = new FieldInfo();
            field.setType(inputType);
            assertEquals(expected, field.toJavaType(), "Type '" + inputType + "' devrait donner '" + expected + "'");
        }
    }
}
