package com.bank.tools.generator.parser;

import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.model.UseCaseInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour le support du pattern SynchroneService + ActionHandler.
 * Couvre :
 * - Detection BIAN des noms de handlers BOA (MiseDisposition, ConsultationSolde, etc.)
 * - Champs UseCaseInfo specifiques au pattern ACTION_HANDLER
 * - Coherence du mapping BIAN pour les handlers
 */
@DisplayName("Pattern ActionHandler - SynchroneService")
class ActionHandlerPatternTest {

    private BianAutoDetector detector;

    @BeforeEach
    void setUp() {
        detector = new BianAutoDetector();
    }

    // ===================== HELPERS =====================

    private UseCaseInfo buildHandler(String className) {
        UseCaseInfo uc = new UseCaseInfo();
        uc.setClassName(className);
        uc.setEjbPattern(UseCaseInfo.EjbPattern.ACTION_HANDLER);
        return uc;
    }

    private UseCaseInfo buildHandlerFull(String className, String actionName,
                                          String parentService, String parentJndi) {
        UseCaseInfo uc = buildHandler(className);
        uc.setActionName(actionName);
        uc.setParentServiceClassName(parentService);
        uc.setParentServiceJndiName(parentJndi);
        return uc;
    }

    // ===================== BIAN DETECTION FOR HANDLERS =====================

    @Nested
    @DisplayName("Detection BIAN pour les handlers BOA")
    class BianDetectionForHandlers {

        @Test
        @DisplayName("MiseDispositionHandler → detecte un service domain (pas fallback)")
        void miseDispositionHandler() {
            UseCaseInfo uc = buildHandler("MiseDispositionHandler");
            String sd = detector.detectServiceDomain(uc);
            assertNotNull(sd);
            assertNotEquals("service-domain", sd, "Ne devrait pas tomber en fallback");
        }

        @Test
        @DisplayName("ConsultationSoldeHandler → current-account (via solde)")
        void consultationSoldeHandler() {
            assertEquals("current-account", detector.detectServiceDomain(buildHandler("ConsultationSoldeHandler")));
        }

        @Test
        @DisplayName("VirementHandler → payment-initiation (via virement)")
        void virementHandler() {
            assertEquals("payment-initiation", detector.detectServiceDomain(buildHandler("VirementHandler")));
        }

        @Test
        @DisplayName("ConsultationCompteHandler → current-account (via compte)")
        void consultationCompteHandler() {
            assertEquals("current-account", detector.detectServiceDomain(buildHandler("ConsultationCompteHandler")));
        }

        @Test
        @DisplayName("Handler avec suffixe retire correctement")
        void handlerSuffixRemoved() {
            BianMapping m = detector.autoDetect(buildHandler("ActiverCarteHandler"));
            assertEquals("card-management", m.getServiceDomain());
            assertEquals("execution", m.getAction());
        }
    }

    // ===================== ACTION DETECTION FOR HANDLERS =====================

    @Nested
    @DisplayName("Detection Action BIAN pour les handlers")
    class ActionDetectionForHandlers {

        @Test
        @DisplayName("ConsultationSoldeHandler → retrieval")
        void consultationIsRetrieval() {
            assertEquals("retrieval", detector.detectAction(buildHandler("ConsultationSoldeHandler")));
        }

        @Test
        @DisplayName("MiseDispositionHandler → action non-null")
        void miseDispositionHasAction() {
            String action = detector.detectAction(buildHandler("MiseDispositionHandler"));
            assertNotNull(action);
        }

        @Test
        @DisplayName("VirementHandler → initiation")
        void virementIsInitiation() {
            assertEquals("initiation", detector.detectAction(buildHandler("VirementHandler")));
        }
    }

    // ===================== USECASE INFO MODEL =====================

    @Nested
    @DisplayName("Modele UseCaseInfo pour ACTION_HANDLER")
    class UseCaseInfoModel {

        @Test
        @DisplayName("Pattern ACTION_HANDLER est bien defini")
        void patternActionHandler() {
            UseCaseInfo uc = buildHandlerFull("MiseDispositionHandler",
                    "MISE_DISPOSITION", "MadServices", "java:global/bank/MadServices");
            assertEquals(UseCaseInfo.EjbPattern.ACTION_HANDLER, uc.getEjbPattern());
            assertTrue(uc.isActionHandler());
            assertEquals("MISE_DISPOSITION", uc.getActionName());
            assertEquals("MadServices", uc.getParentServiceClassName());
            assertEquals("java:global/bank/MadServices", uc.getParentServiceJndiName());
        }

        @Test
        @DisplayName("EnvelopeFieldInfo stocke les champs correctement")
        void envelopeFieldInfo() {
            UseCaseInfo.EnvelopeFieldInfo field = new UseCaseInfo.EnvelopeFieldInfo();
            field.setFieldName("montant");
            field.setJavaType("BigDecimal");

            assertEquals("montant", field.getFieldName());
            assertEquals("BigDecimal", field.getJavaType());
        }

        @Test
        @DisplayName("EnvelopeFieldInfo avec constructeur")
        void envelopeFieldInfoConstructor() {
            UseCaseInfo.EnvelopeFieldInfo field = new UseCaseInfo.EnvelopeFieldInfo("rib", "String");
            assertEquals("rib", field.getFieldName());
            assertEquals("String", field.getJavaType());
        }

        @Test
        @DisplayName("Liste des EnvelopeFields sur un UseCaseInfo")
        void envelopeFieldsList() {
            UseCaseInfo uc = buildHandler("MiseDispositionHandler");

            UseCaseInfo.EnvelopeFieldInfo f1 = new UseCaseInfo.EnvelopeFieldInfo("rib", "String");
            UseCaseInfo.EnvelopeFieldInfo f2 = new UseCaseInfo.EnvelopeFieldInfo("montant", "BigDecimal");

            uc.setEnvelopeFields(List.of(f1, f2));

            assertNotNull(uc.getEnvelopeFields());
            assertEquals(2, uc.getEnvelopeFields().size());
            assertEquals("rib", uc.getEnvelopeFields().get(0).getFieldName());
            assertEquals("montant", uc.getEnvelopeFields().get(1).getFieldName());
        }

        @Test
        @DisplayName("inputDtoClassName et outputDtoClassName pour Envelope")
        void envelopeDtoTypes() {
            UseCaseInfo uc = buildHandler("MiseDispositionHandler");
            uc.setInputDtoClassName("Envelope");
            uc.setOutputDtoClassName("Envelope");

            assertEquals("Envelope", uc.getInputDtoClassName());
            assertEquals("Envelope", uc.getOutputDtoClassName());
        }

        @Test
        @DisplayName("isActionHandler retourne true pour ACTION_HANDLER")
        void isActionHandlerTrue() {
            UseCaseInfo uc = buildHandler("TestHandler");
            assertTrue(uc.isActionHandler());
        }

        @Test
        @DisplayName("isActionHandler retourne false pour BASE_USE_CASE")
        void isActionHandlerFalseForBaseUseCase() {
            UseCaseInfo uc = new UseCaseInfo();
            uc.setClassName("TestUC");
            uc.setEjbPattern(UseCaseInfo.EjbPattern.BASE_USE_CASE);
            assertFalse(uc.isActionHandler());
        }
    }

    // ===================== FULL AUTO-DETECT =====================

    @Nested
    @DisplayName("Auto-detection complete pour handlers")
    class FullAutoDetect {

        @Test
        @DisplayName("autoDetect produit un mapping coherent pour un handler")
        void fullAutoDetectHandler() {
            UseCaseInfo uc = buildHandler("ConsultationSoldeHandler");
            BianMapping m = detector.autoDetect(uc);

            assertNotNull(m);
            assertEquals("current-account", m.getServiceDomain());
            assertEquals("retrieval", m.getAction());
            assertNotNull(m.getUrl());
            assertTrue(m.getUrl().startsWith("/"));
            assertNotNull(m.getOperationId());
        }

        @Test
        @DisplayName("autoDetect pour VirementHandler → payment-initiation + initiation")
        void fullAutoDetectVirement() {
            BianMapping m = detector.autoDetect(buildHandler("VirementHandler"));
            assertEquals("payment-initiation", m.getServiceDomain());
            assertEquals("initiation", m.getAction());
            // initiation n'a pas de cr-reference-id
            assertFalse(m.getUrl().contains("{cr-reference-id}"));
        }
    }
}
