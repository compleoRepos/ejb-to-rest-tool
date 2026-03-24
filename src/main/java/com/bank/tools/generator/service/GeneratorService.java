package com.bank.tools.generator.service;

import com.bank.tools.generator.ai.EnhancementReport;
import com.bank.tools.generator.ai.SmartCodeEnhancer;
import com.bank.tools.generator.config.AppConfig;
import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.parser.EjbProjectParser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.*;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Service d'orchestration principal.
 * <p>
 * Coordonne l'upload, l'extraction, l'analyse, la génération
 * et l'amélioration IA du projet API REST à partir d'un projet EJB uploadé.
 * </p>
 */
@Service
public class GeneratorService {

    private static final Logger log = LoggerFactory.getLogger(GeneratorService.class);

    private final AppConfig appConfig;
    private final EjbProjectParser parser;
    private final CodeGenerationEngine engine;
    private final SmartCodeEnhancer enhancer;

    public GeneratorService(AppConfig appConfig, EjbProjectParser parser,
                            CodeGenerationEngine engine, SmartCodeEnhancer enhancer) {
        this.appConfig = appConfig;
        this.parser = parser;
        this.engine = engine;
        this.enhancer = enhancer;
    }

    /**
     * Upload et extrait un projet EJB à partir d'un fichier ZIP.
     *
     * @param file fichier ZIP uploadé
     * @return identifiant unique du projet uploadé
     */
    public String uploadProject(MultipartFile file) throws IOException {
        String projectId = UUID.randomUUID().toString();
        Path uploadDir = Path.of(appConfig.getUploadDir(), projectId);
        Files.createDirectories(uploadDir);

        // Extraire le ZIP
        try (ZipInputStream zis = new ZipInputStream(file.getInputStream())) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                Path entryPath = uploadDir.resolve(entry.getName()).normalize();

                // Protection contre les attaques de type Zip Slip
                if (!entryPath.startsWith(uploadDir)) {
                    throw new IOException("Entrée ZIP invalide : " + entry.getName());
                }

                if (entry.isDirectory()) {
                    Files.createDirectories(entryPath);
                } else {
                    Files.createDirectories(entryPath.getParent());
                    try (OutputStream os = Files.newOutputStream(entryPath)) {
                        zis.transferTo(os);
                    }
                }
                zis.closeEntry();
            }
        }

        log.info("Projet uploadé et extrait : {}", projectId);
        return projectId;
    }

    /**
     * Analyse un projet EJB précédemment uploadé.
     *
     * @param projectId identifiant du projet
     * @return résultat de l'analyse
     */
    public ProjectAnalysisResult analyzeProject(String projectId) {
        Path projectPath = Path.of(appConfig.getUploadDir(), projectId);
        if (!Files.exists(projectPath)) {
            throw new IllegalArgumentException("Projet non trouvé : " + projectId);
        }
        return parser.analyzeProject(projectPath);
    }

    /**
     * Génère le projet API REST puis applique les améliorations IA.
     * <p>
     * Pipeline : CodeGenerationEngine → SmartCodeEnhancer
     * </p>
     *
     * @param projectId      identifiant du projet
     * @param analysisResult résultat de l'analyse
     * @return chemin du projet généré et amélioré
     */
    public Path generateProject(String projectId, ProjectAnalysisResult analysisResult) throws IOException {
        Path outputDir = Path.of(appConfig.getOutputDir(), projectId);
        Files.createDirectories(outputDir);

        // Étape 1 : Génération du code de base
        Path projectRoot = engine.generateProject(analysisResult, outputDir);
        log.info("Étape 1/2 : Code de base généré dans {}", projectRoot);

        // Étape 2 : Amélioration IA (moteur de règles interne)
        EnhancementReport report = enhancer.enhance(projectRoot, analysisResult);
        log.info("Étape 2/2 : Améliorations IA appliquées - Score: {}/100, Règles: {}/{}",
                report.getQualityScore(), report.getTotalRulesApplied(), report.getTotalRulesChecked());

        // Sauvegarder le rapport d'amélioration
        generateEnhancementReportFile(projectRoot, report);

        return projectRoot;
    }

    /**
     * Applique uniquement les améliorations IA sur un projet déjà généré.
     *
     * @param projectId      identifiant du projet
     * @param analysisResult résultat de l'analyse
     * @return rapport d'amélioration
     */
    public EnhancementReport enhanceProject(String projectId, ProjectAnalysisResult analysisResult) throws IOException {
        Path projectRoot = Path.of(appConfig.getOutputDir(), projectId, "generated-api");
        if (!Files.exists(projectRoot)) {
            throw new IllegalArgumentException("Projet généré non trouvé : " + projectId);
        }
        EnhancementReport report = enhancer.enhance(projectRoot, analysisResult);
        generateEnhancementReportFile(projectRoot, report);
        return report;
    }

    /**
     * Génère le fichier de rapport d'amélioration dans le projet.
     */
    private void generateEnhancementReportFile(Path projectRoot, EnhancementReport report) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Rapport d'Amélioration IA\n\n");
        sb.append("**Moteur** : SmartCodeEnhancer (moteur de règles interne, sans IA externe)\n\n");
        sb.append("## Résumé\n\n");
        sb.append("| Métrique | Valeur |\n");
        sb.append("|----------|--------|\n");
        sb.append("| Score de qualité | **").append(report.getQualityScore()).append("/100** |\n");
        sb.append("| Règles vérifiées | ").append(report.getTotalRulesChecked()).append(" |\n");
        sb.append("| Règles appliquées | ").append(report.getTotalRulesApplied()).append(" |\n");
        sb.append("| Améliorations critiques | ").append(report.countBySeverity(EnhancementReport.Severity.CRITICAL)).append(" |\n");
        sb.append("| Avertissements | ").append(report.countBySeverity(EnhancementReport.Severity.WARNING)).append(" |\n");
        sb.append("| Suggestions | ").append(report.countBySeverity(EnhancementReport.Severity.SUGGESTION)).append(" |\n\n");

        sb.append("## Détail par catégorie\n\n");
        for (EnhancementReport.Category cat : EnhancementReport.Category.values()) {
            long count = report.countByCategory(cat);
            if (count > 0) {
                sb.append("### ").append(cat.getLabel()).append(" (").append(count).append(" règles)\n\n");
                sb.append("| Règle | Sévérité | Description | Fichier | Appliquée |\n");
                sb.append("|-------|----------|-------------|---------|----------|\n");
                for (EnhancementReport.Enhancement e : report.getEnhancements()) {
                    if (e.getCategory() == cat) {
                        sb.append("| ").append(e.getRuleId())
                          .append(" | ").append(e.getSeverity().getLabel())
                          .append(" | ").append(e.getDescription())
                          .append(" | ").append(e.getFilePath())
                          .append(" | ").append(e.isApplied() ? "Oui" : "Non")
                          .append(" |\n");
                    }
                }
                sb.append("\n");
            }
        }

        Files.writeString(projectRoot.resolve("ENHANCEMENT_REPORT.md"), sb.toString());
        log.info("Rapport d'amélioration IA généré : ENHANCEMENT_REPORT.md");
    }

    /**
     * Crée un fichier ZIP du projet généré pour le téléchargement.
     *
     * @param projectId identifiant du projet
     * @return chemin du fichier ZIP
     */
    public Path createDownloadZip(String projectId) throws IOException {
        Path generatedDir = Path.of(appConfig.getOutputDir(), projectId, "generated-api");
        if (!Files.exists(generatedDir)) {
            throw new IllegalArgumentException("Projet généré non trouvé : " + projectId);
        }

        Path zipFile = Path.of(appConfig.getOutputDir(), projectId, "generated-api.zip");

        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            Files.walk(generatedDir)
                    .filter(Files::isRegularFile)
                    .forEach(file -> {
                        try {
                            String entryName = generatedDir.relativize(file).toString();
                            zos.putNextEntry(new ZipEntry(entryName));
                            Files.copy(file, zos);
                            zos.closeEntry();
                        } catch (IOException e) {
                            log.error("Erreur lors de la création du ZIP", e);
                        }
                    });
        }

        log.info("ZIP de téléchargement créé : {}", zipFile);
        return zipFile;
    }

    /**
     * Vérifie si un projet a été uploadé.
     */
    public boolean projectExists(String projectId) {
        return Files.exists(Path.of(appConfig.getUploadDir(), projectId));
    }

    /**
     * Vérifie si un projet a été généré.
     */
    public boolean generatedProjectExists(String projectId) {
        return Files.exists(Path.of(appConfig.getOutputDir(), projectId, "generated-api"));
    }
}
