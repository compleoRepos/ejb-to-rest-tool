package com.bank.tools.generator.service;

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
 * Coordonne l'upload, l'extraction, l'analyse et la génération
 * du projet API REST à partir d'un projet EJB uploadé.
 * </p>
 */
@Service
public class GeneratorService {

    private static final Logger log = LoggerFactory.getLogger(GeneratorService.class);

    private final AppConfig appConfig;
    private final EjbProjectParser parser;
    private final CodeGenerationEngine engine;

    public GeneratorService(AppConfig appConfig, EjbProjectParser parser, CodeGenerationEngine engine) {
        this.appConfig = appConfig;
        this.parser = parser;
        this.engine = engine;
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
     * Génère le projet API REST à partir du résultat de l'analyse.
     *
     * @param projectId      identifiant du projet
     * @param analysisResult résultat de l'analyse
     * @return chemin du projet généré
     */
    public Path generateProject(String projectId, ProjectAnalysisResult analysisResult) throws IOException {
        Path outputDir = Path.of(appConfig.getOutputDir(), projectId);
        Files.createDirectories(outputDir);
        return engine.generateProject(analysisResult, outputDir);
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
