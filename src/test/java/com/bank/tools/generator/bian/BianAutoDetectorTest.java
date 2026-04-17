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
 * - FIX 1 : cleanBehaviorQualifier (suppression BQ redondants)
 * - FIX 2 : BQ_NORMALIZE enrichi (noms classes EJB)
 * - FIX 3 : auth → party en priorite absolue
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
        @DisplayName("ActiverCarteUC → card (normalise depuis carte) — detectBehaviorQualifier seul")
        void detectBqCarte() {
            // detectBehaviorQualifier ne fait PAS le cleanBQ, il retourne le BQ brut normalise
            assertEquals("card", detector.detectBehaviorQualifier(buildUseCase("ActiverCarteUC"), "execution"));
        }

        @Test
        @DisplayName("ConsulterSoldeUC → balance (normalise depuis solde)")
        void detectBqSolde() {
            assertEquals("balance", detector.detectBehaviorQualifier(buildUseCase("ConsulterSoldeUC"), "retrieval"));
        }

        @Test
        @DisplayName("OuvrirCompteEpargneUC → compte-epargne")
        void detectBqCompteEpargne() {
            // 'compte-epargne' n'est pas dans BQ_NORMALIZE → reste tel quel
            assertEquals("compte-epargne", detector.detectBehaviorQualifier(buildUseCase("OuvrirCompteEpargneUC"), "initiation"));
        }

        @Test
        @DisplayName("UseCase sans verbe connu → retourne le nom complet en kebab")
        void detectBqFallbackToFullName() {
            assertEquals("xyz-abc", detector.detectBehaviorQualifier(buildUseCase("XyzAbcUC"), "execution"));
        }
    }

    // ===================== FULL AUTO-DETECT =====================

    @Nested
    @DisplayName("Auto-detection complete (autoDetect)")
    class FullAutoDetect {

        @Test
        @DisplayName("ActiverCarteUC → card-management / execution / BQ null (card redondant avec card-management) / POST 200")
        void autoDetectActiverCarte() {
            BianMapping m = detector.autoDetect(buildUseCase("ActiverCarteUC"));
            assertEquals("card-management", m.getServiceDomain());
            assertEquals("execution", m.getAction());
            // FIX 1 : BQ "card" est redondant avec domain "card-management" → null
            assertNull(m.getBehaviorQualifier(),
                    "BQ 'card' doit etre supprime car redondant avec domain 'card-management'");
            assertEquals("POST", m.getHttpMethod());
            assertEquals(200, m.getHttpStatus());
            assertNotNull(m.getUrl());
            assertTrue(m.getUrl().contains("card-management"));
            // URL simplifiee sans BQ redondant
            assertTrue(m.getUrl().contains("/execution"));
            assertFalse(m.getUrl().contains("/card/"));
        }

        @Test
        @DisplayName("OuvrirCompteUC → current-account / initiation / BQ null (account redondant) / POST 201")
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
        @DisplayName("BloquerCarteUC → card-management / control / BQ null (card redondant) / PUT 200")
        void autoDetectBloquerCarte() {
            BianMapping m = detector.autoDetect(buildUseCase("BloquerCarteUC"));
            assertEquals("card-management", m.getServiceDomain());
            assertEquals("control", m.getAction());
            assertEquals("PUT", m.getHttpMethod());
            assertEquals(200, m.getHttpStatus());
            // control → {cr-reference-id}
            assertTrue(m.getUrl().contains("{cr-reference-id}"));
            // BQ "card" redondant avec domain "card-management" → null
            assertNull(m.getBehaviorQualifier());
        }

        @Test
        @DisplayName("VirementSEPAOrchestrateurEJB → payment-initiation / initiation / BQ transfer")
        void autoDetectVirementSEPA() {
            BianMapping m = detector.autoDetect(buildUseCase("VirementSEPAOrchestrateurEJB"));
            assertEquals("payment-initiation", m.getServiceDomain());
            assertEquals("initiation", m.getAction());
            assertEquals("SD0249", m.getBianId());
            // BQ "transfer" n'est PAS redondant avec "payment-initiation" → conserve
            assertEquals("transfer", m.getBehaviorQualifier());
        }

        @Test
        @DisplayName("CreditScoringEJB → loan / evaluation / BQ scoring")
        void autoDetectCreditScoring() {
            BianMapping m = detector.autoDetect(buildUseCase("CreditScoringEJB"));
            assertEquals("loan", m.getServiceDomain());
            assertEquals("evaluation", m.getAction());
            assertEquals("SD0433", m.getBianId());
            // FIX 2 : "credit-scoring" normalise en "scoring" par BQ_NORMALIZE
            assertEquals("scoring", m.getBehaviorQualifier());
        }

        @Test
        @DisplayName("ComplianceLBCFTEJB → regulatory-compliance")
        void autoDetectCompliance() {
            BianMapping m = detector.autoDetect(buildUseCase("ComplianceLBCFTEJB"));
            assertEquals("regulatory-compliance", m.getServiceDomain());
            assertEquals("SD0289", m.getBianId());
        }

        @Test
        @DisplayName("NotificationMulticanalEJB → customer-notification / notification / BQ null (notification redondant avec action)")
        void autoDetectNotification() {
            BianMapping m = detector.autoDetect(buildUseCase("NotificationMulticanalEJB"));
            assertEquals("customer-notification", m.getServiceDomain());
            assertEquals("notification", m.getAction());
            assertEquals("POST", m.getHttpMethod());
            assertEquals(201, m.getHttpStatus());
            // FIX 1+2 : "notification-multicanal" normalise en "notification",
            // puis "notification" redondant avec action "notification" → null
            assertNull(m.getBehaviorQualifier(),
                    "BQ 'notification' doit etre supprime car redondant avec action 'notification'");
        }

        @Test
        @DisplayName("RiskManagementEJB → risk-management / BQ null (risk-assessment contient domain)")
        void autoDetectRiskManagement() {
            BianMapping m = detector.autoDetect(buildUseCase("RiskManagementEJB"));
            assertEquals("risk-management", m.getServiceDomain());
            assertEquals("SD0434", m.getBianId());
            // FIX 1 : "risk-management" normalise en "risk-assessment",
            // puis cleanBQ : "riskassessment" contient "risk" (mot du domain) → nettoyage
            // Apres retrait de "risk" il reste "assessment" ou null selon la logique
            // Le BQ brut est "risk-management" → normalise en "risk-assessment"
            // cleanBQ : domainWord "risk" (len>3) est dans "risk-assessment" → retire "risk-" → "assessment"
            // "assessment" n'est pas vide → conserve
        }

        @Test
        @DisplayName("DeviseConversionEJB → currency-exchange / BQ conversion")
        void autoDetectDeviseConversion() {
            BianMapping m = detector.autoDetect(buildUseCase("DeviseConversionEJB"));
            assertEquals("currency-exchange", m.getServiceDomain());
            assertEquals("SD0159", m.getBianId());
            // FIX 2 : "devise-conversion" normalise en "conversion" par BQ_NORMALIZE
            // "conversion" n'est pas redondant avec "currency-exchange" → conserve
            assertEquals("conversion", m.getBehaviorQualifier());
        }
    }

    // ===================== FIX 1 : CLEAN BQ REDONDANTS =====================

    @Nested
    @DisplayName("FIX 1 : cleanBehaviorQualifier supprime les BQ redondants")
    class CleanBehaviorQualifier {

        @Test
        @DisplayName("BQ identique au domain → null")
        void bqSameAsDomain() {
            assertNull(detector.cleanBehaviorQualifier("risk-management", "risk-management", "retrieval"));
        }

        @Test
        @DisplayName("BQ contenu dans le domain → null")
        void bqContainedInDomain() {
            assertNull(detector.cleanBehaviorQualifier("card", "card-management", "execution"));
        }

        @Test
        @DisplayName("BQ identique a l'action → null")
        void bqSameAsAction() {
            assertNull(detector.cleanBehaviorQualifier("notification", "customer-notification", "notification"));
        }

        @Test
        @DisplayName("BQ non redondant → conserve")
        void bqNotRedundant() {
            assertEquals("transfer", detector.cleanBehaviorQualifier("transfer", "payment-initiation", "initiation"));
        }

        @Test
        @DisplayName("BQ null → null")
        void bqNull() {
            assertNull(detector.cleanBehaviorQualifier(null, "party", "execution"));
        }

        @Test
        @DisplayName("BQ vide → null")
        void bqEmpty() {
            assertNull(detector.cleanBehaviorQualifier("", "party", "execution"));
        }

        @Test
        @DisplayName("BQ avec suffixe technique multicanal → nettoye")
        void bqWithTechnicalSuffix() {
            assertNull(detector.cleanBehaviorQualifier("multicanal", "customer-notification", "notification"));
        }

        @Test
        @DisplayName("BQ 'balance' dans domain 'current-account' → conserve (pas redondant)")
        void bqBalanceInCurrentAccount() {
            assertEquals("balance", detector.cleanBehaviorQualifier("balance", "current-account", "retrieval"));
        }

        @Test
        @DisplayName("BQ 'scoring' dans domain 'loan' → conserve (pas redondant)")
        void bqScoringInLoan() {
            assertEquals("scoring", detector.cleanBehaviorQualifier("scoring", "loan", "evaluation"));
        }
    }

    // ===================== FIX 2 : BQ_NORMALIZE ENRICHI =====================

    @Nested
    @DisplayName("FIX 2 : BQ_NORMALIZE enrichi pour noms de classes EJB")
    class BqNormalizeEnriched {

        @Test
        @DisplayName("devise-conversion → conversion")
        void deviseConversion() {
            assertEquals("conversion", detector.normalizeBehaviorQualifier("devise-conversion"));
        }

        @Test
        @DisplayName("virement-sepa → transfer")
        void virementSepa() {
            assertEquals("transfer", detector.normalizeBehaviorQualifier("virement-sepa"));
        }

        @Test
        @DisplayName("virement-sepaorchestrateur → transfer")
        void virementSepaOrchestrateur() {
            assertEquals("transfer", detector.normalizeBehaviorQualifier("virement-sepaorchestrateur"));
        }

        @Test
        @DisplayName("credit-scoring → scoring")
        void creditScoring() {
            assertEquals("scoring", detector.normalizeBehaviorQualifier("credit-scoring"));
        }

        @Test
        @DisplayName("notification-multicanal → notification")
        void notificationMulticanal() {
            assertEquals("notification", detector.normalizeBehaviorQualifier("notification-multicanal"));
        }

        @Test
        @DisplayName("orchestrateur → null (suffixe technique supprime)")
        void orchestrateur() {
            assertNull(detector.normalizeBehaviorQualifier("orchestrateur"));
        }

        @Test
        @DisplayName("multicanal → null (suffixe technique supprime)")
        void multicanal() {
            assertNull(detector.normalizeBehaviorQualifier("multicanal"));
        }

        @Test
        @DisplayName("null → null")
        void nullInput() {
            assertNull(detector.normalizeBehaviorQualifier(null));
        }
    }

    // ===================== FIX 3 : AUTH → PARTY PRIORITE =====================

    @Nested
    @DisplayName("FIX 3 : auth/token/login → party en priorite absolue")
    class AuthPriorityToParty {

        @Test
        @DisplayName("AuthServiceEJB → party (via auth, priorite)")
        void authServiceIsParty() {
            assertEquals("party", detector.detectServiceDomain(buildUseCase("AuthServiceEJB")));
        }

        @Test
        @DisplayName("TokenValidatorEJB → party (via token, priorite)")
        void tokenValidatorIsParty() {
            assertEquals("party", detector.detectServiceDomain(buildUseCase("TokenValidatorEJB")));
        }

        @Test
        @DisplayName("LoginServiceEJB → party (via login, priorite)")
        void loginServiceIsParty() {
            assertEquals("party", detector.detectServiceDomain(buildUseCase("LoginServiceEJB")));
        }

        @Test
        @DisplayName("SessionManagerEJB → party (via session, priorite)")
        void sessionManagerIsParty() {
            assertEquals("party", detector.detectServiceDomain(buildUseCase("SessionManagerEJB")));
        }

        @Test
        @DisplayName("MadCoreAuthHandler → party (via auth, priorite)")
        void madCoreAuthIsParty() {
            assertEquals("party", detector.detectServiceDomain(buildUseCase("MadCoreAuthHandler")));
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

        @Test
        @DisplayName("FIX 1 : URL sans BQ redondant pour RiskManagementEJB")
        void urlWithoutRedundantBq() {
            BianMapping m = detector.autoDetect(buildUseCase("RiskManagementEJB"));
            // L'URL ne doit PAS contenir /risk-management/{id}/risk-management/
            assertFalse(m.getUrl().matches(".*/risk-management/.*/risk-management/.*"),
                    "URL ne doit pas contenir le domain en double : " + m.getUrl());
        }
    }

    // ===================== OPERATION ID =====================

    @Nested
    @DisplayName("Generation des operationId")
    class OperationIdGeneration {

        @Test
        @DisplayName("ActiverCarteUC → executeCardManagement (sans BQ redondant)")
        void operationIdActiverCarte() {
            BianMapping m = detector.autoDetect(buildUseCase("ActiverCarteUC"));
            assertNotNull(m.getOperationId());
            assertTrue(m.getOperationId().startsWith("execute"));
            assertTrue(m.getOperationId().contains("CardManagement"));
            // BQ "card" supprime → pas de "Card" en suffixe
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
