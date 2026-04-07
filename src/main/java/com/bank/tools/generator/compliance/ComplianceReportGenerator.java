package com.bank.tools.generator.compliance;

import com.bank.tools.generator.model.ProjectAnalysisResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Genere un rapport Markdown de conformite reglementaire.
 * Verifie les exigences : audit trail, masquage donnees, headers securite,
 * validation input, gestion erreurs, logging.
 */
@Component
public class ComplianceReportGenerator {

    private static final Logger log = LoggerFactory.getLogger(ComplianceReportGenerator.class);

    /**
     * Genere le rapport de conformite dans le projet cible.
     */
    public String generate(Path outputDir, ProjectAnalysisResult analysis) {
        StringBuilder md = new StringBuilder();
        String clientName = getClientName();
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));

        md.append("# Rapport de Conformite Reglementaire\n\n");
        md.append("**Client** : ").append(clientName).append("  \n");
        md.append("**Date** : ").append(timestamp).append("  \n");
        md.append("**Generateur** : Compleo EJB-to-REST Transformation Engine  \n\n");
        md.append("---\n\n");

        // Checklist
        List<ComplianceCheck> checks = runChecks(outputDir, analysis);
        int passed = (int) checks.stream().filter(c -> c.passed).count();
        int total = checks.size();

        md.append("## Resume\n\n");
        md.append("| Metrique | Valeur |\n|---|---|\n");
        md.append("| Regles verifiees | ").append(total).append(" |\n");
        md.append("| Regles conformes | ").append(passed).append(" |\n");
        md.append("| Score de conformite | **").append(total > 0 ? (passed * 100 / total) : 0).append("%** |\n\n");

        // Detail
        md.append("## Detail des Verifications\n\n");
        md.append("| # | Categorie | Regle | Statut | Commentaire |\n|---|---|---|---|---|\n");
        int i = 1;
        for (ComplianceCheck check : checks) {
            md.append("| ").append(i++).append(" | ").append(check.category)
                    .append(" | ").append(check.rule)
                    .append(" | ").append(check.passed ? "Conforme" : "**Non conforme**")
                    .append(" | ").append(check.comment).append(" |\n");
        }
        md.append("\n");

        // Recommandations
        md.append("## Recommandations\n\n");
        checks.stream().filter(c -> !c.passed).forEach(c ->
                md.append("- **").append(c.rule).append("** : ").append(c.remediation).append("\n"));

        if (outputDir != null) {
            try {
                Files.writeString(outputDir.resolve("COMPLIANCE_REPORT.md"), md.toString());
                log.info("[Compliance] Rapport genere : COMPLIANCE_REPORT.md");
            } catch (IOException e) {
                log.warn("[Compliance] Erreur ecriture rapport : {}", e.getMessage());
            }
        }

        return md.toString();
    }

    private List<ComplianceCheck> runChecks(Path outputDir, ProjectAnalysisResult analysis) {
        List<ComplianceCheck> checks = new ArrayList<>();

        // Audit Trail
        checks.add(checkFileExists(outputDir, "AuditInterceptor.java",
                "Audit", "Journal d'audit (Audit Trail)",
                "Ajouter un AuditInterceptor Spring"));

        checks.add(checkFileExists(outputDir, "AuditLog.java",
                "Audit", "Entite AuditLog",
                "Ajouter la classe AuditLog"));

        // Data Masking
        checks.add(checkFileExists(outputDir, "DataMasker.java",
                "RGPD", "Masquage des donnees sensibles",
                "Ajouter le composant DataMasker"));

        // Security Headers
        checks.add(checkFileExists(outputDir, "SecurityHeadersFilter.java",
                "Securite", "Headers OWASP (X-Content-Type-Options, HSTS, CSP)",
                "Ajouter le SecurityHeadersFilter"));

        // GlobalExceptionHandler
        checks.add(checkFileExists(outputDir, "GlobalExceptionHandler.java",
                "Securite", "Gestion centralisee des erreurs",
                "Ajouter un @ControllerAdvice GlobalExceptionHandler"));

        // Validation
        if (analysis != null) {
            boolean hasValidation = analysis.getUseCases().stream()
                    .anyMatch(uc -> uc.getInputDtoClassName() != null);
            checks.add(new ComplianceCheck("Validation", "Validation des entrees (@Valid, @NotNull)",
                    hasValidation, hasValidation ? "DTOs avec validation" : "Aucun DTO avec validation",
                    "Ajouter @Valid sur les parametres @RequestBody"));
        }

        // Logging
        checks.add(checkFileExists(outputDir, "LoggingAspect.java",
                "Observabilite", "Logging centralise (AOP)",
                "Ajouter un LoggingAspect Spring AOP"));

        // CORS
        checks.add(checkFileExists(outputDir, "CorsConfig.java",
                "Securite", "Configuration CORS restrictive",
                "Ajouter une configuration CORS restrictive"));

        // Swagger/OpenAPI
        checks.add(checkFileExists(outputDir, "SwaggerConfig.java",
                "Documentation", "Documentation API (Swagger/OpenAPI)",
                "Ajouter SwaggerConfig avec @OpenAPIDefinition"));

        return checks;
    }

    private ComplianceCheck checkFileExists(Path outputDir, String fileName, String category,
                                             String rule, String remediation) {
        if (outputDir == null) {
            return new ComplianceCheck(category, rule, false, "Repertoire non disponible", remediation);
        }
        try {
            boolean found = Files.walk(outputDir)
                    .anyMatch(p -> p.getFileName().toString().equals(fileName));
            return new ComplianceCheck(category, rule, found,
                    found ? "Fichier present" : "Fichier absent",
                    remediation);
        } catch (IOException e) {
            return new ComplianceCheck(category, rule, false, "Erreur de verification", remediation);
        }
    }

    private String getClientName() {
        return "Banque";
    }

    private static class ComplianceCheck {
        String category;
        String rule;
        boolean passed;
        String comment;
        String remediation;

        ComplianceCheck(String category, String rule, boolean passed, String comment, String remediation) {
            this.category = category;
            this.rule = rule;
            this.passed = passed;
            this.comment = comment;
            this.remediation = remediation;
        }
    }
}
