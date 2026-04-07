package com.bank.tools.generator.report;

import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour ImpactAnalysisReport.
 */
class ImpactAnalysisReportTest {

    @TempDir
    Path tempDir;

    private ProjectAnalysisResult createMinimalAnalysis() {
        ProjectAnalysisResult result = new ProjectAnalysisResult();
        result.setProjectPath("/test/project");
        result.setTotalFilesAnalyzed(10);

        UseCaseInfo uc = new UseCaseInfo();
        uc.setClassName("SimulerCredit");
        uc.setControllerName("SimulerCreditController");
        uc.setRestEndpoint("/api/simuler-credit");
        uc.setEjbType(UseCaseInfo.EjbType.STATELESS);
        uc.setEjbPattern(UseCaseInfo.EjbPattern.BASE_USE_CASE);
        uc.setServiceAdapterName("SimulerCreditService");

        DtoInfo dto = new DtoInfo();
        dto.setClassName("SimulerCreditVoIn");
        List<DtoInfo.FieldInfo> fields = new ArrayList<>();
        DtoInfo.FieldInfo f1 = new DtoInfo.FieldInfo();
        f1.setName("montant"); f1.setType("BigDecimal");
        DtoInfo.FieldInfo f2 = new DtoInfo.FieldInfo();
        f2.setName("duree"); f2.setType("int");
        fields.add(f1); fields.add(f2);
        dto.setFields(fields);

        result.setUseCases(List.of(uc));
        result.setDtos(List.of(dto));
        result.setDetectedExceptions(List.of(
                new ProjectAnalysisResult.ExceptionInfo("CreditException", "com.bank", "RuntimeException", null, null)
        ));
        return result;
    }

    @Test
    @DisplayName("Genere un rapport Markdown non vide")
    void generatesNonEmptyReport() throws IOException {
        ImpactAnalysisReport report = new ImpactAnalysisReport();
        Path output = tempDir.resolve("impact-report.md");
        report.generateReport(output, createMinimalAnalysis());

        assertTrue(Files.exists(output));
        String content = Files.readString(output);
        assertTrue(content.length() > 100);
    }

    @Test
    @DisplayName("Le rapport contient le titre principal")
    void reportContainsTitle() throws IOException {
        ImpactAnalysisReport report = new ImpactAnalysisReport();
        Path output = tempDir.resolve("impact-report.md");
        report.generateReport(output, createMinimalAnalysis());

        String content = Files.readString(output);
        assertTrue(content.contains("Analyse d'Impact"));
    }

    @Test
    @DisplayName("Le rapport contient le nom du UseCase")
    void reportContainsUseCaseName() throws IOException {
        ImpactAnalysisReport report = new ImpactAnalysisReport();
        Path output = tempDir.resolve("impact-report.md");
        report.generateReport(output, createMinimalAnalysis());

        String content = Files.readString(output);
        assertTrue(content.contains("SimulerCredit"));
    }

    @Test
    @DisplayName("Le rapport contient les DTOs")
    void reportContainsDtoSection() throws IOException {
        ImpactAnalysisReport report = new ImpactAnalysisReport();
        Path output = tempDir.resolve("impact-report.md");
        report.generateReport(output, createMinimalAnalysis());

        String content = Files.readString(output);
        assertTrue(content.contains("DTOs"));
    }

    @Test
    @DisplayName("Le rapport contient les exceptions")
    void reportContainsExceptionSection() throws IOException {
        ImpactAnalysisReport report = new ImpactAnalysisReport();
        Path output = tempDir.resolve("impact-report.md");
        report.generateReport(output, createMinimalAnalysis());

        String content = Files.readString(output);
        assertTrue(content.contains("Exception"));
    }
}
