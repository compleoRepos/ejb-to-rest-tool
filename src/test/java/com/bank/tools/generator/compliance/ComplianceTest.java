package com.bank.tools.generator.compliance;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests de non-regression pour les composants de conformite reglementaire.
 */
@DisplayName("Compliance - Composants de conformite")
class ComplianceTest {

    @TempDir
    Path tempDir;

    @Nested
    @DisplayName("AuditTrailGenerator")
    class AuditTrailTests {

        @Test
        @DisplayName("Genere AuditLog.java dans le bon package")
        void generatesAuditLog() throws IOException {
            AuditTrailGenerator gen = new AuditTrailGenerator();
            gen.generate(tempDir, "com.bank.api");

            Path auditLog = tempDir.resolve("src/main/java/com/bank/api/audit/AuditLog.java");
            assertTrue(Files.exists(auditLog));
            String content = Files.readString(auditLog);
            assertTrue(content.contains("class AuditLog"));
            assertTrue(content.contains("correlationId"));
        }

        @Test
        @DisplayName("Genere AuditInterceptor.java")
        void generatesAuditInterceptor() throws IOException {
            AuditTrailGenerator gen = new AuditTrailGenerator();
            gen.generate(tempDir, "com.bank.api");

            Path interceptor = tempDir.resolve("src/main/java/com/bank/api/audit/AuditInterceptor.java");
            assertTrue(Files.exists(interceptor));
            String content = Files.readString(interceptor);
            assertTrue(content.contains("HandlerInterceptor"));
        }

        @Test
        @DisplayName("Genere AuditConfig.java")
        void generatesAuditConfig() throws IOException {
            AuditTrailGenerator gen = new AuditTrailGenerator();
            gen.generate(tempDir, "com.bank.api");

            Path config = tempDir.resolve("src/main/java/com/bank/api/audit/AuditConfig.java");
            assertTrue(Files.exists(config));
            String content = Files.readString(config);
            assertTrue(content.contains("WebMvcConfigurer"));
        }
    }

    @Nested
    @DisplayName("DataMaskerGenerator")
    class DataMaskerTests {

        @Test
        @DisplayName("Genere DataMasker.java avec les patterns IBAN/RIB/Carte")
        void generatesDataMasker() throws IOException {
            DataMaskerGenerator gen = new DataMaskerGenerator();
            gen.generate(tempDir, "com.bank.api");

            Path masker = tempDir.resolve("src/main/java/com/bank/api/compliance/DataMasker.java");
            assertTrue(Files.exists(masker));
            String content = Files.readString(masker);
            assertTrue(content.contains("IBAN_PATTERN"));
            assertTrue(content.contains("RIB_PATTERN"));
            assertTrue(content.contains("CARD_PATTERN"));
        }

        @Test
        @DisplayName("Le DataMasker contient la methode maskAll")
        void containsMaskAllMethod() throws IOException {
            DataMaskerGenerator gen = new DataMaskerGenerator();
            gen.generate(tempDir, "com.bank.api");

            Path masker = tempDir.resolve("src/main/java/com/bank/api/compliance/DataMasker.java");
            String content = Files.readString(masker);
            assertTrue(content.contains("public static String maskAll"));
        }

        @Test
        @DisplayName("Le DataMasker contient la methode maskField")
        void containsMaskFieldMethod() throws IOException {
            DataMaskerGenerator gen = new DataMaskerGenerator();
            gen.generate(tempDir, "com.bank.api");

            Path masker = tempDir.resolve("src/main/java/com/bank/api/compliance/DataMasker.java");
            String content = Files.readString(masker);
            assertTrue(content.contains("public static String maskField"));
        }
    }

    @Nested
    @DisplayName("SecurityHeadersGenerator")
    class SecurityHeadersTests {

        @Test
        @DisplayName("Genere SecurityHeadersFilter.java avec headers OWASP")
        void generatesSecurityHeaders() throws IOException {
            SecurityHeadersGenerator gen = new SecurityHeadersGenerator();
            gen.generate(tempDir, "com.bank.api");

            Path filter = tempDir.resolve("src/main/java/com/bank/api/config/SecurityHeadersFilter.java");
            assertTrue(Files.exists(filter));
            String content = Files.readString(filter);
            assertTrue(content.contains("X-Content-Type-Options"));
            assertTrue(content.contains("Strict-Transport-Security"));
            assertTrue(content.contains("Content-Security-Policy"));
        }

        @Test
        @DisplayName("Le filtre implemente javax.servlet.Filter")
        void implementsFilter() throws IOException {
            SecurityHeadersGenerator gen = new SecurityHeadersGenerator();
            gen.generate(tempDir, "com.bank.api");

            Path filter = tempDir.resolve("src/main/java/com/bank/api/config/SecurityHeadersFilter.java");
            String content = Files.readString(filter);
            assertTrue(content.contains("implements Filter"));
        }
    }

    @Nested
    @DisplayName("ComplianceReportGenerator")
    class ComplianceReportTests {

        @Test
        @DisplayName("Genere un rapport Markdown non vide")
        void generatesMarkdownReport() {
            ComplianceReportGenerator gen = new ComplianceReportGenerator();
            String report = gen.generate(null, null);

            assertNotNull(report);
            assertTrue(report.contains("Rapport de Conformite"));
        }

        @Test
        @DisplayName("Le rapport contient un tableau de verifications")
        void reportContainsChecklist() {
            ComplianceReportGenerator gen = new ComplianceReportGenerator();
            String report = gen.generate(null, null);

            assertTrue(report.contains("Categorie"));
            assertTrue(report.contains("Regle"));
            assertTrue(report.contains("Statut"));
        }

        @Test
        @DisplayName("Le rapport ecrit COMPLIANCE_REPORT.md dans le repertoire")
        void writesReportFile() throws IOException {
            ComplianceReportGenerator gen = new ComplianceReportGenerator();
            gen.generate(tempDir, null);

            Path reportFile = tempDir.resolve("COMPLIANCE_REPORT.md");
            assertTrue(Files.exists(reportFile));
        }
    }
}
