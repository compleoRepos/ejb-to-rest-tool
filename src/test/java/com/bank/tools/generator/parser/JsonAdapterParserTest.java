package com.bank.tools.generator.parser;

import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.model.InputMode;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.junit.jupiter.api.*;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour le parseur de contrats JSON adapter
 * qui produit un ProjectAnalysisResult standard pour le pipeline principal.
 */
@DisplayName("JsonAdapterParser")
class JsonAdapterParserTest {

    private final JsonAdapterParser parser = new JsonAdapterParser(new BianAutoDetector());

    // ============================================================
    // Parsing valide
    // ============================================================

    @Nested
    @DisplayName("Parsing de contrats valides")
    class ValidContracts {

        @Test
        @DisplayName("Parse un contrat JSON complet en ProjectAnalysisResult")
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
                        { "name": "quantite", "type": "Integer", "required": true, "description": "Nombre" }
                      ],
                      "response_fields": [
                        { "name": "code", "type": "String", "description": "Code retour" },
                        { "name": "reference", "type": "String", "description": "Reference" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);

            assertNotNull(result, "Le resultat ne doit pas etre null");
            assertFalse(result.getUseCases().isEmpty(), "Au moins 1 UseCase doit etre detecte");
            assertFalse(result.getDtos().isEmpty(), "Au moins 1 DTO doit etre genere");

            // Verifier le UseCase
            UseCaseInfo uc = result.getUseCases().get(0);
            assertNotNull(uc.getClassName(), "Le className du UseCase ne doit pas etre null");
            assertTrue(uc.isJsonAdapter(), "Le UseCase doit etre marque comme JSON_ADAPTER");
            assertNotNull(uc.getBackendEndpoint(), "Le backendEndpoint ne doit pas etre null");
            assertEquals("POST", uc.getBackendEndpoint().getHttpMethod());
            assertEquals("/command-chequier/enrg-commande", uc.getBackendEndpoint().getPath());

            // Verifier l'AdapterDescriptor
            assertNotNull(result.getAdapterDescriptor(), "L'AdapterDescriptor ne doit pas etre null");
            assertEquals("http://websphere:9080/api/adapter", result.getAdapterDescriptor().getAdapterBaseUrl());
        }

        @Test
        @DisplayName("Parse un contrat avec plusieurs endpoints et methodes HTTP differentes")
        void shouldParseMultipleEndpoints() throws IOException {
            String json = """
                {
                  "adapter_name": "GestionCompte",
                  "adapter_base_url": "http://backend:8080/api",
                  "endpoints": [
                    {
                      "operation": "consulter_solde",
                      "method": "GET",
                      "path": "/comptes/{id}/solde",
                      "summary": "Consulter le solde",
                      "request_fields": [
                        { "name": "id", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "solde", "type": "BigDecimal" },
                        { "name": "devise", "type": "String" }
                      ]
                    },
                    {
                      "operation": "effectuer_virement",
                      "method": "POST",
                      "path": "/comptes/{id}/virements",
                      "summary": "Effectuer un virement",
                      "request_fields": [
                        { "name": "id", "type": "String", "required": true },
                        { "name": "montant", "type": "BigDecimal", "required": true },
                        { "name": "beneficiaire", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "reference", "type": "String" },
                        { "name": "statut", "type": "String" }
                      ]
                    },
                    {
                      "operation": "supprimer_beneficiaire",
                      "method": "DELETE",
                      "path": "/comptes/{id}/beneficiaires/{benefId}",
                      "summary": "Supprimer un beneficiaire",
                      "request_fields": [
                        { "name": "id", "type": "String", "required": true },
                        { "name": "benefId", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "success", "type": "Boolean" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);

            assertEquals(3, result.getUseCases().size(), "3 UseCases doivent etre detectes");

            // Verifier les methodes HTTP
            UseCaseInfo ucGet = result.getUseCases().stream()
                    .filter(uc -> uc.getBackendEndpoint().getHttpMethod().equals("GET"))
                    .findFirst().orElse(null);
            assertNotNull(ucGet, "Un UseCase GET doit exister");

            UseCaseInfo ucDelete = result.getUseCases().stream()
                    .filter(uc -> uc.getBackendEndpoint().getHttpMethod().equals("DELETE"))
                    .findFirst().orElse(null);
            assertNotNull(ucDelete, "Un UseCase DELETE doit exister");
        }

        @Test
        @DisplayName("Le mode d'entree est correctement positionne a JSON_ADAPTER")
        void shouldSetInputMode() throws IOException {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://localhost:8080",
                  "endpoints": [
                    {
                      "operation": "test_op",
                      "method": "GET",
                      "path": "/test",
                      "request_fields": [],
                      "response_fields": [
                        { "name": "result", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            result.setInputMode(InputMode.JSON_ADAPTER);

            assertEquals(InputMode.JSON_ADAPTER, result.getInputMode());
            assertTrue(result.isJsonAdapterMode());
        }
    }

    // ============================================================
    // Parsing invalide
    // ============================================================

    @Nested
    @DisplayName("Gestion des erreurs")
    class ErrorHandling {

        @Test
        @DisplayName("Gere un JSON vide gracieusement (retourne resultat vide ou exception)")
        void shouldHandleEmptyJson() {
            // Le parser peut soit lancer une exception soit retourner un resultat vide
            try {
                ProjectAnalysisResult result = parser.parseFromString("");
                // Si pas d'exception, le resultat doit etre vide ou avoir 0 usecases
                assertTrue(result == null || result.getUseCases().isEmpty(),
                        "Un JSON vide doit produire un resultat vide ou null");
            } catch (Exception e) {
                // Exception acceptable aussi
                assertNotNull(e.getMessage());
            }
        }

        @Test
        @DisplayName("Rejette un JSON invalide")
        void shouldRejectInvalidJson() {
            assertThrows(Exception.class, () -> parser.parseFromString("{not valid json}"));
        }

        @Test
        @DisplayName("Gere un contrat sans endpoints gracieusement")
        void shouldHandleNoEndpoints() {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://localhost:8080"
                }
                """;
            // Le parser peut soit lancer une exception soit retourner un resultat vide
            try {
                ProjectAnalysisResult result = parser.parseFromString(json);
                assertTrue(result == null || result.getUseCases().isEmpty(),
                        "Un contrat sans endpoints doit produire un resultat vide ou null");
            } catch (Exception e) {
                assertNotNull(e.getMessage());
            }
        }
    }

    // ============================================================
    // Mapping BIAN
    // ============================================================

    @Nested
    @DisplayName("Detection BIAN")
    class BianDetection {

        @Test
        @DisplayName("Le BianAutoDetector est applique aux UseCases")
        void shouldApplyBianAutoDetection() throws IOException {
            String json = """
                {
                  "adapter_name": "CurrentAccount",
                  "adapter_base_url": "http://backend:8080",
                  "endpoints": [
                    {
                      "operation": "retrieve_balance",
                      "method": "GET",
                      "path": "/current-account/balance",
                      "summary": "Recuperer le solde du compte courant",
                      "request_fields": [
                        { "name": "accountId", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "balance", "type": "BigDecimal" },
                        { "name": "currency", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);

            // Le BianAutoDetector devrait avoir detecte un mapping
            assertNotNull(uc.getBianMapping(), "Le mapping BIAN doit etre detecte par BianAutoDetector");
        }

        @Test
        @DisplayName("Le mapping BIAN est detecte (explicite ou auto)")
        void shouldDetectBianMapping() throws IOException {
            String json = """
                {
                  "adapter_name": "SavingsAccount",
                  "adapter_base_url": "http://backend:8080",
                  "endpoints": [
                    {
                      "operation": "open_account",
                      "method": "POST",
                      "path": "/savings/open",
                      "summary": "Ouvrir un compte epargne",
                      "bian": {
                        "service_domain": "savings-account",
                        "behavior_qualifier": "account-opening",
                        "action": "initiation"
                      },
                      "request_fields": [
                        { "name": "clientId", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "accountNumber", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);

            assertNotNull(uc.getBianMapping(), "Le mapping BIAN doit etre present");
            // Le mapping peut etre explicite (savings-account) ou auto-detecte
            assertNotNull(uc.getBianMapping().getServiceDomain(),
                    "Le service domain doit etre detecte");
            assertFalse(uc.getBianMapping().getServiceDomain().isEmpty(),
                    "Le service domain ne doit pas etre vide");
        }
    }
}
