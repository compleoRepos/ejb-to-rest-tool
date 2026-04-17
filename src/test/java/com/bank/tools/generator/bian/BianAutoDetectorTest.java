package com.bank.tools.generator.bian;

import com.bank.tools.generator.model.UseCaseInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour BianAutoDetector.
 * Couvre la detection automatique de :
 * - Service Domain BIAN
 * - Action BIAN
 * - Behavior Qualifier
 * - HTTP Method / Status
 * - Niveau de confiance
 */
class BianAutoDetectorTest {

    private BianAutoDetector detector;

    @BeforeEach
    void setUp() {
        detector = new BianAutoDetector();
    }

    // ===================== HELPERS =====================

    private UseCaseInfo buildUseCase(String className) {
        UseCaseInfo uc = new UseCaseInfo();
        uc.setClassName(className);
        return uc;
    }

    private UseCaseInfo buildUseCase(String className, String packageName) {
        UseCaseInfo uc = buildUseCase(className);
        uc.setPackageName(packageName);
        return uc;
    }

    private UseCaseInfo buildUseCase(String className, String packageName,
                                      String inputDto, String outputDto) {
        UseCaseInfo uc = buildUseCase(className, packageName);
        uc.setInputDtoClassName(inputDto);
        uc.setOutputDtoClassName(outputDto);
        return uc;
    }

    // ===================== SERVICE DOMAIN DETECTION =====================

    @Nested
    @DisplayName("Detection du Service Domain")
    class ServiceDomainDetection {

        @Test
        @DisplayName("ActiverCarteUC → card-management")
        void detectCardManagement() {
            assertEquals("card-management", detector.detectServiceDomain(buildUseCase("ActiverCarteUC")));
        }

        @Test
        @DisplayName("BloquerCarteUC → card-management")
        void detectCardManagementBloquer() {
            assertEquals("card-management", detector.detectServiceDomain(buildUseCase("BloquerCarteUC")));
        }

        @Test
        @DisplayName("ConsulterSoldeUC → current-account (via solde)")
        void detectCurrentAccountSolde() {
            assertEquals("current-account", detector.detectServiceDomain(buildUseCase("ConsulterSoldeUC")));
        }

        @Test
        @DisplayName("OuvrirCompteUC → current-account")
        void detectCurrentAccountOuvrir() {
            assertEquals("current-account", detector.detectServiceDomain(buildUseCase("OuvrirCompteUC")));
        }

        @Test
        @DisplayName("VirementSEPAOrchestrateurEJB → payment-initiation")
        void detectPaymentInitiation() {
            assertEquals("payment-initiation", detector.detectServiceDomain(buildUseCase("VirementSEPAOrchestrateurEJB")));
        }

        @Test
        @DisplayName("CreditScoringEJB → loan")
        void detectLoan() {
            assertEquals("loan", detector.detectServiceDomain(buildUseCase("CreditScoringEJB")));
        }

        @Test
        @DisplayName("NotificationMulticanalEJB → customer-notification")
        void detectCustomerNotification() {
            assertEquals("customer-notification", detector.detectServiceDomain(buildUseCase("NotificationMulticanalEJB")));
        }

        @Test
        @DisplayName("ComplianceLBCFTEJB → regulatory-compliance")
        void detectRegulatoryCompliance() {
            assertEquals("regulatory-compliance", detector.detectServiceDomain(buildUseCase("ComplianceLBCFTEJB")));
        }

        @Test
        @DisplayName("RiskManagementEJB → risk-management")
        void detectRiskManagement() {
            assertEquals("risk-management", detector.detectServiceDomain(buildUseCase("RiskManagementEJB")));
        }

        @Test
        @DisplayName("DeviseConversionEJB → currency-exchange")
        void detectCurrencyExchange() {
            assertEquals("currency-exchange", detector.detectServiceDomain(buildUseCase("DeviseConversionEJB")));
        }

        @Test
        @DisplayName("ChargerClientUC → party (via client)")
        void detectParty() {
            assertEquals("party", detector.detectServiceDomain(buildUseCase("ChargerClientUC")));
        }

        @Test
        @DisplayName("SimulerCreditUC → loan (via credit)")
        void detectLoanSimuler() {
            assertEquals("loan", detector.detectServiceDomain(buildUseCase("SimulerCreditUC")));
        }

        @Test
        @DisplayName("GenererReleveUC → document-management (via releve)")
        void detectDocumentManagement() {
            assertEquals("document-management", detector.detectServiceDomain(buildUseCase("GenererReleveUC")));
        }

        @Test
        @DisplayName("GestionEpargneUC → savings-account")
        void detectSavingsAccount() {
            assertEquals("savings-account", detector.detectServiceDomain(buildUseCase("GestionEpargneUC")));
        }

        @Test
        @DisplayName("UseCase inconnu → service-domain (fallback)")
        void detectFallback() {
            assertEquals("service-domain", detector.detectServiceDomain(buildUseCase("XyzAbcUC")));
        }

        @Test
        @DisplayName("Detection via package quand le nom est ambigu")
        void detectViaPackage() {
            UseCaseInfo uc = buildUseCase("TraiterOperationUC", "com.bank.carte.usecase");
            assertEquals("card-management", detector.detectServiceDomain(uc));
        }

        @Test
        @DisplayName("Detection via VoIn quand le nom est ambigu")
        void detectViaVoIn() {
            UseCaseInfo uc = buildUseCase("TraiterOperationUC", "com.bank.usecase",
                    "CarteVoIn", "CarteVoOut");
            assertEquals("card-management", detector.detectServiceDomain(uc));
        }
    }

    // ===================== ACTION DETECTION =====================

    @Nested
    @DisplayName("Detection de l'Action BIAN")
    class ActionDetection {

        @Test
        @DisplayName("ActiverCarteUC → execution (activer)")
        void detectExecution() {
            assertEquals("execution", detector.detectAction(buildUseCase("ActiverCarteUC")));
        }

        @Test
        @DisplayName("OuvrirCompteUC → initiation (ouvrir)")
        void detectInitiation() {
            assertEquals("initiation", detector.detectAction(buildUseCase("OuvrirCompteUC")));
        }

        @Test
        @DisplayName("ConsulterSoldeUC → retrieval (consulter)")
        void detectRetrieval() {
            assertEquals("retrieval", detector.detectAction(buildUseCase("ConsulterSoldeUC")));
        }

        @Test
        @DisplayName("BloquerCarteUC → control (bloquer)")
        void detectControl() {
            assertEquals("control", detector.detectAction(buildUseCase("BloquerCarteUC")));
        }

        @Test
        @DisplayName("ModifierAdresseUC → update (modifier)")
        void detectUpdate() {
            assertEquals("update", detector.detectAction(buildUseCase("ModifierAdresseUC")));
        }

        @Test
        @DisplayName("CloturerCompteUC → termination (cloturer)")
        void detectTermination() {
            assertEquals("termination", detector.detectAction(buildUseCase("CloturerCompteUC")));
        }

        @Test
        @DisplayName("SimulerCreditUC → evaluation (simuler)")
        void detectEvaluation() {
            assertEquals("evaluation", detector.detectAction(buildUseCase("SimulerCreditUC")));
        }

        @Test
        @DisplayName("NotifierClientUC → notification (notifier)")
        void detectNotification() {
            assertEquals("notification", detector.detectAction(buildUseCase("NotifierClientUC")));
        }

        @Test
        @DisplayName("UseCase sans verbe connu et sans VoIn → retrieval (pas de VoIn = lecture)")
        void detectFallbackAction() {
            // Sans VoIn et sans verbe connu, le detecteur suppose une lecture (retrieval)
            assertEquals("retrieval", detector.detectAction(buildUseCase("XyzAbcUC")));
        }

        @Test
        @DisplayName("UseCase sans verbe connu mais avec VoIn → execution (fallback)")
        void detectFallbackWithVoIn() {
            UseCaseInfo uc = buildUseCase("XyzAbcUC", "com.bank.usecase", "XyzAbcVoIn", "XyzAbcVoOut");
            assertEquals("execution", detector.detectAction(uc));
        }

        @Test
        @DisplayName("CreditScoringEJB → evaluation (scorer)")
        void detectScoringEvaluation() {
            assertEquals("evaluation", detector.detectAction(buildUseCase("CreditScoringEJB")));
        }

        @Test
        @DisplayName("VirementSEPAOrchestrateurEJB → initiation (virement)")
        void virementSEPA_shouldBeInitiation() {
            UseCaseInfo uc = new UseCaseInfo();
            uc.setClassName("VirementSEPAOrchestrateurEJB");
            BianMapping result = detector.autoDetect(uc);
            assertEquals("initiation", result.getAction());
            assertEquals("payment-initiation", result.getServiceDomain());
            assertFalse(result.getUrl().contains("{cr-reference-id}"));
        }

        @Test
        @DisplayName("TransfererFondsEJB → initiation (transferer)")
        void transfererFonds_shouldBeInitiation() {
            assertEquals("initiation", detector.detectAction(buildUseCase("TransfererFondsEJB")));
        }

        @Test
        @DisplayName("VirerMontantUC → initiation (virer)")
        void virerMontant_shouldBeInitiation() {
            assertEquals("initiation", detector.detectAction(buildUseCase("VirerMontantUC")));
        }
    }

    // ===================== BEHAVIOR QUALIFIER DETECTION =====================

    @Nested
    @DisplayName("Detection du Behavior Qualifier")
    class BehaviorQualifierDetection {

        @Test
        @DisplayName("ActiverCarteUC → carte")
        void detectBqCarte() {
            assertEquals("carte", detector.detectBehaviorQualifier(buildUseCase("ActiverCarteUC"), "execution"));
        }

        @Test
        @DisplayName("ConsulterSoldeUC → solde")
        void detectBqSolde() {
            assertEquals("solde", detector.detectBehaviorQualifier(buildUseCase("ConsulterSoldeUC"), "retrieval"));
        }

        @Test
        @DisplayName("OuvrirCompteEpargneUC → compte-epargne")
        void detectBqCompteEpargne() {
            assertEquals("compte-epargne", detector.detectBehaviorQualifier(buildUseCase("OuvrirCompteEpargneUC"), "initiation"));
        }

        @Test
        @DisplayName("UseCase sans verbe connu → retourne le nom complet en kebab")
        void detectBqFallbackToFullName() {
            // Fix 1 : quand aucun verbe n'est retire, on retourne le nom complet en kebab
            // au lieu de null, pour garantir un BQ unique par handler
            assertEquals("xyz-abc", detector.detectBehaviorQualifier(buildUseCase("XyzAbcUC"), "execution"));
        }
    }

    // ===================== FULL AUTO-DETECT =====================

    @Nested
    @DisplayName("Auto-detection complete (autoDetect)")
    class FullAutoDetect {

        @Test
        @DisplayName("ActiverCarteUC → card-management / execution / carte / POST 200")
        void autoDetectActiverCarte() {
            BianMapping m = detector.autoDetect(buildUseCase("ActiverCarteUC"));
            assertEquals("card-management", m.getServiceDomain());
            assertEquals("execution", m.getAction());
            assertEquals("carte", m.getBehaviorQualifier());
            assertEquals("POST", m.getHttpMethod());
            assertEquals(200, m.getHttpStatus());
            assertNotNull(m.getUrl());
            assertTrue(m.getUrl().contains("card-management"));
        }

        @Test
        @DisplayName("OuvrirCompteUC → current-account / initiation / compte / POST 201")
        void autoDetectOuvrirCompte() {
            BianMapping m = detector.autoDetect(buildUseCase("OuvrirCompteUC"));
            assertEquals("current-account", m.getServiceDomain());
            assertEquals("initiation", m.getAction());
            assertEquals("POST", m.getHttpMethod());
            assertEquals(201, m.getHttpStatus());
            // initiation → pas de {cr-reference-id}
            assertFalse(m.getUrl().contains("{cr-reference-id}"));
        }

        @Test
        @DisplayName("BloquerCarteUC → card-management / control / carte / PUT 200")
        void autoDetectBloquerCarte() {
            BianMapping m = detector.autoDetect(buildUseCase("BloquerCarteUC"));
            assertEquals("card-management", m.getServiceDomain());
            assertEquals("control", m.getAction());
            assertEquals("PUT", m.getHttpMethod());
            assertEquals(200, m.getHttpStatus());
            // control → {cr-reference-id}
            assertTrue(m.getUrl().contains("{cr-reference-id}"));
        }

        @Test
        @DisplayName("VirementSEPAOrchestrateurEJB → payment-initiation / execution")
        void autoDetectVirementSEPA() {
            BianMapping m = detector.autoDetect(buildUseCase("VirementSEPAOrchestrateurEJB"));
            assertEquals("payment-initiation", m.getServiceDomain());
            assertNotNull(m.getAction());
            assertEquals("SD0249", m.getBianId());
        }

        @Test
        @DisplayName("CreditScoringEJB → loan / evaluation")
        void autoDetectCreditScoring() {
            BianMapping m = detector.autoDetect(buildUseCase("CreditScoringEJB"));
            assertEquals("loan", m.getServiceDomain());
            assertEquals("evaluation", m.getAction());
            assertEquals("SD0433", m.getBianId());
        }

        @Test
        @DisplayName("ComplianceLBCFTEJB → regulatory-compliance")
        void autoDetectCompliance() {
            BianMapping m = detector.autoDetect(buildUseCase("ComplianceLBCFTEJB"));
            assertEquals("regulatory-compliance", m.getServiceDomain());
            assertEquals("SD0289", m.getBianId());
        }

        @Test
        @DisplayName("NotificationMulticanalEJB → customer-notification / notification / POST 201")
        void autoDetectNotification() {
            BianMapping m = detector.autoDetect(buildUseCase("NotificationMulticanalEJB"));
            assertEquals("customer-notification", m.getServiceDomain());
            assertEquals("notification", m.getAction());
            assertEquals("POST", m.getHttpMethod());
            assertEquals(201, m.getHttpStatus());
        }

        @Test
        @DisplayName("RiskManagementEJB → risk-management")
        void autoDetectRiskManagement() {
            BianMapping m = detector.autoDetect(buildUseCase("RiskManagementEJB"));
            assertEquals("risk-management", m.getServiceDomain());
            assertEquals("SD0434", m.getBianId());
        }

        @Test
        @DisplayName("DeviseConversionEJB → currency-exchange")
        void autoDetectDeviseConversion() {
            BianMapping m = detector.autoDetect(buildUseCase("DeviseConversionEJB"));
            assertEquals("currency-exchange", m.getServiceDomain());
            assertEquals("SD0159", m.getBianId());
        }
    }

    // ===================== CONFIDENCE =====================

    @Nested
    @DisplayName("Calcul du niveau de confiance")
    class ConfidenceCalculation {

        @Test
        @DisplayName("ActiverCarteUC avec package carte → confiance >= 70%")
        void highConfidence() {
            UseCaseInfo uc = buildUseCase("ActiverCarteUC", "com.bank.carte.usecase",
                    "ActiverCarteVoIn", "ActiverCarteVoOut");
            BianMapping m = detector.autoDetect(uc);
            int confidence = detector.calculateConfidence(uc, m);
            assertTrue(confidence >= 70, "Confiance attendue >= 70%, obtenue: " + confidence);
        }

        @Test
        @DisplayName("UseCase inconnu → confiance < 50%")
        void lowConfidence() {
            UseCaseInfo uc = buildUseCase("XyzAbcUC");
            BianMapping m = detector.autoDetect(uc);
            int confidence = detector.calculateConfidence(uc, m);
            assertTrue(confidence < 50, "Confiance attendue < 50%, obtenue: " + confidence);
        }

        @Test
        @DisplayName("UseCase avec verbe connu mais domaine inconnu → confiance 40-60%")
        void mediumConfidence() {
            UseCaseInfo uc = buildUseCase("ConsulterXyzUC");
            BianMapping m = detector.autoDetect(uc);
            int confidence = detector.calculateConfidence(uc, m);
            assertTrue(confidence >= 40 && confidence <= 60,
                    "Confiance attendue 40-60%, obtenue: " + confidence);
        }
    }

    // ===================== URL GENERATION =====================

    @Nested
    @DisplayName("Generation des URLs BIAN")
    class UrlGeneration {

        @Test
        @DisplayName("initiation → pas de {cr-reference-id}")
        void initiationUrlNoCrRef() {
            BianMapping m = detector.autoDetect(buildUseCase("OuvrirCompteUC"));
            assertFalse(m.getUrl().contains("{cr-reference-id}"));
            assertTrue(m.getUrl().contains("/initiation"));
        }

        @Test
        @DisplayName("retrieval → {cr-reference-id} present")
        void retrievalUrlWithCrRef() {
            BianMapping m = detector.autoDetect(buildUseCase("ConsulterSoldeUC"));
            assertTrue(m.getUrl().contains("{cr-reference-id}"));
            assertTrue(m.getUrl().contains("/retrieval"));
        }

        @Test
        @DisplayName("URL contient le service domain en kebab-case")
        void urlContainsServiceDomain() {
            BianMapping m = detector.autoDetect(buildUseCase("ActiverCarteUC"));
            assertTrue(m.getUrl().contains("/card-management/"));
        }
    }

    // ===================== OPERATION ID =====================

    @Nested
    @DisplayName("Generation des operationId")
    class OperationIdGeneration {

        @Test
        @DisplayName("ActiverCarteUC → executeCardManagementCarte")
        void operationIdActiverCarte() {
            BianMapping m = detector.autoDetect(buildUseCase("ActiverCarteUC"));
            assertNotNull(m.getOperationId());
            assertTrue(m.getOperationId().startsWith("execute"));
            assertTrue(m.getOperationId().contains("CardManagement"));
        }

        @Test
        @DisplayName("OuvrirCompteUC → initiateCurrentAccount...")
        void operationIdOuvrirCompte() {
            BianMapping m = detector.autoDetect(buildUseCase("OuvrirCompteUC"));
            assertNotNull(m.getOperationId());
            assertTrue(m.getOperationId().startsWith("initiate"));
        }

        @Test
        @DisplayName("ConsulterSoldeUC → retrieveCurrentAccount...")
        void operationIdConsulterSolde() {
            BianMapping m = detector.autoDetect(buildUseCase("ConsulterSoldeUC"));
            assertNotNull(m.getOperationId());
            assertTrue(m.getOperationId().startsWith("retrieve"));
        }
    }

    // ===================== EDGE CASES =====================

    @Nested
    @DisplayName("Cas limites")
    class EdgeCases {

        @Test
        @DisplayName("Nom avec suffixe EJB")
        void ejbSuffix() {
            BianMapping m = detector.autoDetect(buildUseCase("CreditScoringEJB"));
            assertEquals("loan", m.getServiceDomain());
        }

        @Test
        @DisplayName("Nom avec suffixe Bean")
        void beanSuffix() {
            BianMapping m = detector.autoDetect(buildUseCase("ActiverCarteBean"));
            assertEquals("card-management", m.getServiceDomain());
        }

        @Test
        @DisplayName("Nom avec suffixe Impl")
        void implSuffix() {
            BianMapping m = detector.autoDetect(buildUseCase("ActiverCarteImpl"));
            assertEquals("card-management", m.getServiceDomain());
        }

        @Test
        @DisplayName("Nom tres court")
        void shortName() {
            BianMapping m = detector.autoDetect(buildUseCase("AB"));
            assertNotNull(m.getServiceDomain());
            assertNotNull(m.getAction());
        }

        @Test
        @DisplayName("Nom null-safe (className vide)")
        void emptyClassName() {
            UseCaseInfo uc = new UseCaseInfo();
            uc.setClassName("");
            BianMapping m = detector.autoDetect(uc);
            assertNotNull(m);
            assertNotNull(m.getAction());
        }
    }
}
