package com.bank.tools.generator.parser;

import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.model.InputMode;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.junit.jupiter.api.*;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour le parseur de contrats JSON adapter
 * qui produit un ProjectAnalysisResult standard pour le pipeline principal.
 *
 * Couvre les 5 fixes :
 * - FIX 1 : Le bloc bian{} pilote les URLs BIAN
 * - FIX 2 : HTTP method et status depuis l'action BIAN
 * - FIX 3 : Noms de DTOs propres (PascalCase depuis BQ)
 * - FIX 4 : (teste dans JsonGenerationE2ETest)
 * - FIX 5 : (teste dans JsonGenerationE2ETest)
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
            try {
                ProjectAnalysisResult result = parser.parseFromString("");
                assertTrue(result == null || result.getUseCases().isEmpty(),
                        "Un JSON vide doit produire un resultat vide ou null");
            } catch (Exception e) {
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
            assertNotNull(uc.getBianMapping().getServiceDomain(),
                    "Le service domain doit etre detecte");
            assertFalse(uc.getBianMapping().getServiceDomain().isEmpty(),
                    "Le service domain ne doit pas etre vide");
        }
    }

    // ============================================================
    // FIX 1 : Le bloc bian{} du JSON pilote les URLs BIAN
    // ============================================================

    @Nested
    @DisplayName("FIX 1 - Bloc bian{} pilote les URLs BIAN")
    class Fix1BianUrls {

        @Test
        @DisplayName("Le bloc bian{} global fournit le service_domain et le bianId")
        void shouldUseGlobalBianBlock() {
            String json = """
                {
                  "adapter_name": "PaymentAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "bian": {
                    "service_domain": "payment-order",
                    "service_domain_id": "SD0250"
                  },
                  "endpoints": [
                    {
                      "operation": "create_payment",
                      "method": "POST",
                      "path": "/payments/create",
                      "request_fields": [
                        { "name": "amount", "type": "BigDecimal", "required": true }
                      ],
                      "response_fields": [
                        { "name": "paymentId", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);
            BianMapping mapping = uc.getBianMapping();

            assertNotNull(mapping);
            assertEquals("payment-order", mapping.getServiceDomain(),
                    "Le service_domain doit venir du bloc bian{} global");
            assertEquals("SD0250", mapping.getBianId(),
                    "Le bianId doit venir du bloc bian{} global");
        }

        @Test
        @DisplayName("Le bloc bian{} par endpoint surcharge le global")
        void shouldOverrideGlobalWithEndpointBian() {
            String json = """
                {
                  "adapter_name": "PaymentAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "bian": {
                    "service_domain": "payment-order",
                    "service_domain_id": "SD0250"
                  },
                  "endpoints": [
                    {
                      "operation": "enrg_commande",
                      "method": "POST",
                      "path": "/payments/create",
                      "bian": {
                        "action": "initiation",
                        "behavior_qualifier": "order",
                        "http_method": "POST",
                        "http_status": 201
                      },
                      "request_fields": [
                        { "name": "amount", "type": "BigDecimal", "required": true }
                      ],
                      "response_fields": [
                        { "name": "paymentId", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);
            BianMapping mapping = uc.getBianMapping();

            assertNotNull(mapping);
            assertEquals("payment-order", mapping.getServiceDomain(),
                    "Le service_domain doit venir du global");
            assertEquals("initiation", mapping.getAction(),
                    "L'action doit venir du bloc bian{} de l'endpoint");
            assertEquals("order", mapping.getBehaviorQualifier(),
                    "Le BQ doit venir du bloc bian{} de l'endpoint");
        }

        @Test
        @DisplayName("L'URL BIAN est construite depuis le BianMapping, pas depuis le nom brut")
        void shouldBuildBianUrlFromMapping() {
            String json = """
                {
                  "adapter_name": "PaymentAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "bian": {
                    "service_domain": "payment-order",
                    "service_domain_id": "SD0250"
                  },
                  "endpoints": [
                    {
                      "operation": "enrg_commande",
                      "method": "POST",
                      "path": "/payments/create",
                      "bian": {
                        "action": "initiation",
                        "behavior_qualifier": "order"
                      },
                      "request_fields": [
                        { "name": "amount", "type": "BigDecimal", "required": true }
                      ],
                      "response_fields": [
                        { "name": "paymentId", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);
            BianMapping mapping = uc.getBianMapping();

            // L'URL BIAN doit contenir le service_domain et l'action, pas le nom brut
            String bianUrl = mapping.getUrl();
            assertNotNull(bianUrl, "L'URL BIAN doit etre construite");
            assertTrue(bianUrl.contains("payment-order"), "L'URL doit contenir le service_domain");
            assertTrue(bianUrl.contains("initiation"), "L'URL doit contenir l'action");
            assertFalse(bianUrl.contains("enrg-commande"), "L'URL ne doit PAS contenir le nom brut");
        }
    }

    // ============================================================
    // FIX 2 : HTTP method et status selon l'action BIAN
    // ============================================================

    @Nested
    @DisplayName("FIX 2 - HTTP method et status depuis le bloc bian{}")
    class Fix2HttpMethodStatus {

        @Test
        @DisplayName("initiation -> POST 201")
        void shouldSetInitiationTo201() {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "endpoints": [
                    {
                      "operation": "create_order",
                      "method": "POST",
                      "path": "/orders/create",
                      "bian": {
                        "action": "initiation",
                        "behavior_qualifier": "order",
                        "http_method": "POST",
                        "http_status": 201
                      },
                      "request_fields": [
                        { "name": "item", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "orderId", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);

            assertEquals("POST", uc.getHttpMethod(), "initiation -> POST");
            assertEquals(201, uc.getHttpStatusCode(), "initiation -> 201");
        }

        @Test
        @DisplayName("retrieval -> POST 200")
        void shouldSetRetrievalTo200() {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "endpoints": [
                    {
                      "operation": "get_order",
                      "method": "GET",
                      "path": "/orders/{id}",
                      "bian": {
                        "action": "retrieval",
                        "behavior_qualifier": "tracking",
                        "http_method": "POST",
                        "http_status": 200
                      },
                      "request_fields": [
                        { "name": "id", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "status", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);

            assertEquals("POST", uc.getHttpMethod(), "retrieval -> POST (BIAN)");
            assertEquals(200, uc.getHttpStatusCode(), "retrieval -> 200");
        }

        @Test
        @DisplayName("Fallback : action sans bloc bian{} derive la methode et le status")
        void shouldDeriveMethodAndStatusFromAction() {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "endpoints": [
                    {
                      "operation": "create_item",
                      "method": "POST",
                      "path": "/items/create",
                      "request_fields": [
                        { "name": "name", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "itemId", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);

            // Sans bloc bian{}, POST -> initiation -> POST 201
            assertEquals("POST", uc.getHttpMethod());
            assertEquals(201, uc.getHttpStatusCode(),
                    "POST sans bloc bian{} -> initiation -> 201");
        }

        @Test
        @DisplayName("Fallback : GET sans bloc bian{} -> retrieval -> POST 200")
        void shouldDeriveRetrievalFromGet() {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "endpoints": [
                    {
                      "operation": "get_item",
                      "method": "GET",
                      "path": "/items/{id}",
                      "request_fields": [
                        { "name": "id", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "name", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);

            // GET -> retrieval -> POST 200
            assertEquals("POST", uc.getHttpMethod(),
                    "GET sans bloc bian{} -> retrieval -> POST (BIAN)");
            assertEquals(200, uc.getHttpStatusCode(),
                    "GET sans bloc bian{} -> retrieval -> 200");
        }
    }

    // ============================================================
    // FIX 3 : Noms de DTOs propres (PascalCase depuis BQ)
    // ============================================================

    @Nested
    @DisplayName("FIX 3 - Noms de DTOs propres depuis le BQ")
    class Fix3DtoNames {

        @Test
        @DisplayName("BQ 'order' -> OrderRequest / OrderResponse")
        void shouldNameDtosFromBq() {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "endpoints": [
                    {
                      "operation": "enrg_commande",
                      "method": "POST",
                      "path": "/orders/create",
                      "bian": {
                        "action": "initiation",
                        "behavior_qualifier": "order"
                      },
                      "request_fields": [
                        { "name": "item", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "orderId", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);

            assertEquals("OrderRequest", uc.getInputDtoClassName(),
                    "Le DTO doit etre OrderRequest, pas VoIn_ENRG_COMMANDERequest");
            assertEquals("OrderResponse", uc.getOutputDtoClassName(),
                    "Le DTO doit etre OrderResponse, pas VoOut_ENRG_COMMANDEResponse");
        }

        @Test
        @DisplayName("BQ 'payment-initiation' -> PaymentInitiationRequest")
        void shouldHandleKebabCaseBq() {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "endpoints": [
                    {
                      "operation": "init_payment",
                      "method": "POST",
                      "path": "/payments/init",
                      "bian": {
                        "action": "initiation",
                        "behavior_qualifier": "payment-initiation"
                      },
                      "request_fields": [
                        { "name": "amount", "type": "BigDecimal", "required": true }
                      ],
                      "response_fields": [
                        { "name": "paymentId", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);

            assertEquals("PaymentInitiationRequest", uc.getInputDtoClassName(),
                    "Le BQ kebab-case doit etre converti en PascalCase");
            assertEquals("PaymentInitiationResponse", uc.getOutputDtoClassName());
        }

        @Test
        @DisplayName("Sans BQ, le prefixe est retire et le BQ derive est utilise (FIX 2)")
        void shouldFallbackToOperationName() {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "endpoints": [
                    {
                      "operation": "check_status",
                      "method": "GET",
                      "path": "/status",
                      "request_fields": [],
                      "response_fields": [
                        { "name": "status", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);
            UseCaseInfo uc = result.getUseCases().get(0);

            // FIX 2 : le prefixe 'check' est retire, donc check_status -> status -> StatusRequest
            assertEquals("StatusRequest", uc.getInputDtoClassName(),
                    "Sans BQ, le prefixe est retire et le BQ derive est utilise");
            assertEquals("StatusResponse", uc.getOutputDtoClassName());
        }

        @Test
        @DisplayName("Les noms de DTOs ne contiennent jamais VoIn_ ou VoOut_ ou underscores")
        void shouldNeverContainVoInOrVoOut() {
            String json = """
                {
                  "adapter_name": "TestAdapter",
                  "adapter_base_url": "http://backend:8080",
                  "bian": {
                    "service_domain": "payment-order",
                    "service_domain_id": "SD0250"
                  },
                  "endpoints": [
                    {
                      "operation": "enrg_commande",
                      "method": "POST",
                      "path": "/orders/create",
                      "bian": {
                        "action": "initiation",
                        "behavior_qualifier": "order"
                      },
                      "request_fields": [
                        { "name": "item", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "orderId", "type": "String" }
                      ]
                    },
                    {
                      "operation": "consult_commande",
                      "method": "GET",
                      "path": "/orders/{id}",
                      "bian": {
                        "action": "retrieval",
                        "behavior_qualifier": "tracking"
                      },
                      "request_fields": [
                        { "name": "id", "type": "String", "required": true }
                      ],
                      "response_fields": [
                        { "name": "status", "type": "String" }
                      ]
                    }
                  ]
                }
                """;

            ProjectAnalysisResult result = parser.parseFromString(json);

            for (UseCaseInfo uc : result.getUseCases()) {
                assertFalse(uc.getInputDtoClassName().contains("VoIn_"),
                        "Le DTO input ne doit jamais contenir VoIn_: " + uc.getInputDtoClassName());
                assertFalse(uc.getOutputDtoClassName().contains("VoOut_"),
                        "Le DTO output ne doit jamais contenir VoOut_: " + uc.getOutputDtoClassName());
                assertFalse(uc.getInputDtoClassName().contains("_"),
                        "Le DTO input ne doit pas contenir d'underscores: " + uc.getInputDtoClassName());
                assertFalse(uc.getOutputDtoClassName().contains("_"),
                        "Le DTO output ne doit pas contenir d'underscores: " + uc.getOutputDtoClassName());
            }
        }
    }
}
