package com.bank.tools.generator.annotation;

import com.bank.tools.generator.annotation.CustomAnnotationDefinition.Category;
import com.bank.tools.generator.annotation.CustomAnnotationDefinition.PropagationStrategy;
import com.bank.tools.generator.annotation.DetectedAnnotation.RecognitionStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour le module de gestion des annotations custom bancaires.
 * Couvre : CustomAnnotationRegistry, AnnotationPropagator, DetectedAnnotation.
 */
class CustomAnnotationModuleTest {

    private CustomAnnotationRegistry registry;
    private AnnotationPropagator propagator;

    @BeforeEach
    void setUp() {
        registry = new CustomAnnotationRegistry();
        registry.loadFromClasspath();
        propagator = new AnnotationPropagator(registry);
    }

    // ==================== REGISTRY TESTS ====================

    @Nested
    @DisplayName("CustomAnnotationRegistry")
    class RegistryTests {

        @Test
        @DisplayName("Doit charger les annotations depuis custom-annotations.yml")
        void shouldLoadAnnotationsFromYaml() {
            assertTrue(registry.getTotalLoaded() > 0,
                    "Le registre doit contenir au moins une annotation");
            assertTrue(registry.getCategoryCount() > 0,
                    "Le registre doit couvrir au moins une categorie");
        }

        @Test
        @DisplayName("Doit reconnaitre BmceSecured comme annotation connue")
        void shouldRecognizeBmceSecured() {
            assertTrue(registry.isKnown("BmceSecured"));
            Optional<CustomAnnotationDefinition> def = registry.lookup("BmceSecured");
            assertTrue(def.isPresent());
            assertEquals(Category.SECURITY, def.get().getCategory());
            assertEquals(PropagationStrategy.TRANSFORM, def.get().getPropagation());
            assertTrue(def.get().hasSpringEquivalent());
        }

        @Test
        @DisplayName("Doit reconnaitre AuditLog comme annotation connue")
        void shouldRecognizeAuditLog() {
            assertTrue(registry.isKnown("AuditLog"));
            Optional<CustomAnnotationDefinition> def = registry.lookup("AuditLog");
            assertTrue(def.isPresent());
            assertEquals(Category.AUDIT, def.get().getCategory());
        }

        @Test
        @DisplayName("Doit reconnaitre les annotations standard Java/Spring")
        void shouldRecognizeStandardAnnotations() {
            assertTrue(registry.isStandardAnnotation("Stateless"));
            assertTrue(registry.isStandardAnnotation("Override"));
            assertTrue(registry.isStandardAnnotation("RestController"));
            assertTrue(registry.isStandardAnnotation("Transactional"));
            assertTrue(registry.isStandardAnnotation("Entity"));
        }

        @Test
        @DisplayName("Ne doit PAS reconnaitre les annotations custom comme standard")
        void shouldNotRecognizeCustomAsStandard() {
            assertFalse(registry.isStandardAnnotation("BmceSecured"));
            assertFalse(registry.isStandardAnnotation("AuditLog"));
            assertFalse(registry.isStandardAnnotation("RiskLevel"));
        }

        @Test
        @DisplayName("Doit classifier les packages internes correctement")
        void shouldClassifyInternalPackages() {
            assertTrue(registry.isInternalPackage("com.bmce.banking.security"));
            assertTrue(registry.isInternalPackage("ma.bmce.core.annotations"));
            assertFalse(registry.isInternalPackage("org.apache.commons"));
        }

        @Test
        @DisplayName("Doit classifier KNOWN pour les annotations du registre")
        void shouldClassifyKnown() {
            assertEquals(RecognitionStatus.KNOWN,
                    registry.classify("BmceSecured", "com.bmce.security"));
        }

        @Test
        @DisplayName("Doit classifier UNKNOWN_INTERNAL pour les annotations internes non declarees")
        void shouldClassifyUnknownInternal() {
            assertEquals(RecognitionStatus.UNKNOWN_INTERNAL,
                    registry.classify("CustomInternalAnnotation", "com.bmce.internal"));
        }

        @Test
        @DisplayName("Doit classifier UNKNOWN_EXTERNAL pour les annotations externes")
        void shouldClassifyUnknownExternal() {
            assertEquals(RecognitionStatus.UNKNOWN_EXTERNAL,
                    registry.classify("SomeExternalAnnotation", "org.external.lib"));
        }

        @Test
        @DisplayName("Doit retourner null pour les annotations standard")
        void shouldReturnNullForStandard() {
            assertNull(registry.classify("Stateless", "javax.ejb"));
        }

        @Test
        @DisplayName("Doit retourner les annotations de securite")
        void shouldReturnSecurityAnnotations() {
            List<CustomAnnotationDefinition> security = registry.getSecurityAnnotations();
            assertFalse(security.isEmpty());
            assertTrue(security.stream().allMatch(d ->
                    d.getCategory() == Category.SECURITY || d.getCategory() == Category.COMPLIANCE));
        }
    }

    // ==================== PROPAGATOR TESTS ====================

    @Nested
    @DisplayName("AnnotationPropagator")
    class PropagatorTests {

        @Test
        @DisplayName("Doit detecter et classifier les annotations custom")
        void shouldDetectAndClassify() {
            List<String> names = List.of("Stateless", "BmceSecured", "AuditLog", "UnknownCustom");
            List<String> exprs = List.of("@Stateless", "@BmceSecured(\"AGENT_GUICHET\")",
                    "@AuditLog(action=\"MODIFICATION\", entity=\"COMPTE\")", "@UnknownCustom");

            List<DetectedAnnotation> detected = propagator.detectAndClassify(
                    names, exprs, "MonEjbService", true, "com.bmce.services");

            // Stateless est standard → ignore
            // BmceSecured → KNOWN
            // AuditLog → KNOWN
            // UnknownCustom → UNKNOWN_INTERNAL (package com.bmce)
            assertEquals(3, detected.size());

            DetectedAnnotation bmce = detected.stream()
                    .filter(da -> da.getName().equals("BmceSecured")).findFirst().orElse(null);
            assertNotNull(bmce);
            assertEquals(RecognitionStatus.KNOWN, bmce.getStatus());
            assertEquals("AGENT_GUICHET", bmce.getResolvedAttributes().get("value"));

            DetectedAnnotation audit = detected.stream()
                    .filter(da -> da.getName().equals("AuditLog")).findFirst().orElse(null);
            assertNotNull(audit);
            assertEquals(RecognitionStatus.KNOWN, audit.getStatus());
            assertEquals("MODIFICATION", audit.getResolvedAttributes().get("action"));

            DetectedAnnotation unknown = detected.stream()
                    .filter(da -> da.getName().equals("UnknownCustom")).findFirst().orElse(null);
            assertNotNull(unknown);
            assertEquals(RecognitionStatus.UNKNOWN_INTERNAL, unknown.getStatus());
        }

        @Test
        @DisplayName("Doit generer les annotations de classe pour PROPAGATE_CLASS et PROPAGATE_BOTH")
        void shouldGenerateClassLevelAnnotations() {
            List<DetectedAnnotation> detected = createSampleDetected();
            List<String> classAnnotations = propagator.getClassLevelAnnotations(detected);
            assertFalse(classAnnotations.isEmpty());
        }

        @Test
        @DisplayName("Doit generer les annotations de methode pour PROPAGATE_METHOD")
        void shouldGenerateMethodLevelAnnotations() {
            List<String> names = List.of("ChannelRestricted", "RiskLevel");
            List<String> exprs = List.of(
                    "@ChannelRestricted(channel={\"AGENCE\", \"WEB\"})",
                    "@RiskLevel(\"HIGH\")");

            List<DetectedAnnotation> detected = propagator.detectAndClassify(
                    names, exprs, "VirementService", false, "com.bmce.virement");

            List<String> methodAnnotations = propagator.getMethodLevelAnnotations(detected);
            assertFalse(methodAnnotations.isEmpty());
        }

        @Test
        @DisplayName("Doit transformer BmceSecured en @PreAuthorize")
        void shouldTransformBmceSecuredToPreAuthorize() {
            List<String> names = List.of("BmceSecured");
            List<String> exprs = List.of("@BmceSecured(\"AGENT_GUICHET\")");

            List<DetectedAnnotation> detected = propagator.detectAndClassify(
                    names, exprs, "MonService", true, "com.bmce.services");

            assertEquals(1, detected.size());
            String generated = detected.get(0).toGeneratedCode();
            assertNotNull(generated);
            assertTrue(generated.contains("@PreAuthorize"));
            assertTrue(generated.contains("AGENT_GUICHET"));
        }

        @Test
        @DisplayName("Doit transformer TransactionScope en @Transactional")
        void shouldTransformTransactionScope() {
            List<String> names = List.of("TransactionScope");
            List<String> exprs = List.of("@TransactionScope(scope=\"REQUIRES_NEW\")");

            List<DetectedAnnotation> detected = propagator.detectAndClassify(
                    names, exprs, "MonService", true, "com.bmce.services");

            assertEquals(1, detected.size());
            String generated = detected.get(0).toGeneratedCode();
            assertNotNull(generated);
            assertTrue(generated.contains("@Transactional"));
            assertTrue(generated.contains("REQUIRES_NEW"));
        }

        @Test
        @DisplayName("Doit generer des TODOs pour les annotations inconnues")
        void shouldGenerateTodosForUnknown() {
            List<String> names = List.of("MyInternalAnnotation");
            List<String> exprs = List.of("@MyInternalAnnotation");

            List<DetectedAnnotation> detected = propagator.detectAndClassify(
                    names, exprs, "MonService", true, "com.bmce.custom");

            List<String> todos = propagator.getUnknownAnnotationTodos(detected);
            assertFalse(todos.isEmpty());
            assertTrue(todos.get(0).contains("TODO"));
            assertTrue(todos.get(0).contains("ANNOTATION INCONNUE"));
        }

        @Test
        @DisplayName("Doit generer les imports requis pour les transformations")
        void shouldGenerateRequiredImports() {
            List<String> names = List.of("BmceSecured", "TransactionScope", "BankCache");
            List<String> exprs = List.of(
                    "@BmceSecured(\"ADMIN\")",
                    "@TransactionScope(scope=\"REQUIRED\")",
                    "@BankCache(cacheName=\"ref\", ttlMinutes=5)");

            List<DetectedAnnotation> detected = propagator.detectAndClassify(
                    names, exprs, "MonService", true, "com.bmce.services");

            Set<String> imports = propagator.getRequiredImports(detected);
            assertTrue(imports.contains("org.springframework.security.access.prepost.PreAuthorize"));
            assertTrue(imports.contains("org.springframework.transaction.annotation.Transactional"));
            assertTrue(imports.contains("org.springframework.cache.annotation.Cacheable"));
        }
    }

    // ==================== REPORT TESTS ====================

    @Nested
    @DisplayName("AnnotationReport")
    class ReportTests {

        @Test
        @DisplayName("Doit generer un rapport correct")
        void shouldGenerateCorrectReport() {
            List<DetectedAnnotation> detected = createMixedDetected();
            AnnotationPropagator.AnnotationReport report = propagator.generateReport(detected);

            assertTrue(report.totalDetected > 0);
            assertTrue(report.totalKnown > 0);
            assertFalse(report.knownByCategory.isEmpty());
        }

        @Test
        @DisplayName("Doit generer un rapport Markdown valide")
        void shouldGenerateValidMarkdown() {
            List<DetectedAnnotation> detected = createMixedDetected();
            AnnotationPropagator.AnnotationReport report = propagator.generateReport(detected);
            String markdown = report.toMarkdown();

            assertNotNull(markdown);
            assertTrue(markdown.contains("# Rapport Annotations Custom Bancaires"));
            assertTrue(markdown.contains("## Synthese"));
            assertTrue(markdown.contains("Total detectees"));
        }

        @Test
        @DisplayName("Doit detecter le niveau d'alerte correct")
        void shouldDetectCorrectAlertLevel() {
            // Avec annotations inconnues internes → niveau 2
            List<DetectedAnnotation> withUnknown = createMixedDetected();
            AnnotationPropagator.AnnotationReport report = propagator.generateReport(withUnknown);
            assertTrue(report.getAlertLevel() >= 1);
        }
    }

    // ==================== HELPERS ====================

    private List<DetectedAnnotation> createSampleDetected() {
        List<String> names = List.of("BmceSecured", "BankingOperation");
        List<String> exprs = List.of(
                "@BmceSecured(\"AGENT_GUICHET\")",
                "@BankingOperation(code=\"VIR_INT\", family=\"VIREMENT\")");
        return propagator.detectAndClassify(names, exprs, "VirementService", true, "com.bmce.virement");
    }

    private List<DetectedAnnotation> createMixedDetected() {
        List<String> names = List.of("BmceSecured", "AuditLog", "UnknownBmceAnnotation", "ExternalLib");
        List<String> exprs = List.of(
                "@BmceSecured(\"ADMIN\")",
                "@AuditLog(action=\"CREATION\", entity=\"VIREMENT\")",
                "@UnknownBmceAnnotation",
                "@ExternalLib");
        return propagator.detectAndClassify(names, exprs, "VirementService", true, "com.bmce.virement");
    }
}
