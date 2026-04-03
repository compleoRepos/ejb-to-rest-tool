package com.bank.tools.generator.service;

import com.bank.tools.generator.ai.EnhancementReport;
import com.bank.tools.generator.ai.SmartCodeEnhancer;
import com.bank.tools.generator.config.AppConfig;
import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.engine.OpenApiClientGenerator;
import com.bank.tools.generator.engine.WsdlClientGenerator;
import com.bank.tools.generator.model.OpenApiContractInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.WsdlContractInfo;
import com.bank.tools.generator.parser.EjbProjectParser;
import com.bank.tools.generator.parser.OpenApiContractParser;
import com.bank.tools.generator.parser.WsdlContractParser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Service d'orchestration principal.
 * Coordonne l'upload, l'extraction, l'analyse, la generation
 * et l'amelioration IA du projet API REST a partir d'un projet EJB uploade.
 */
@Service
public class GeneratorService {

    private static final Logger log = LoggerFactory.getLogger(GeneratorService.class);

    private final AppConfig appConfig;
    private final EjbProjectParser parser;
    private final CodeGenerationEngine engine;
    private final SmartCodeEnhancer enhancer;
    private final OpenApiContractParser openApiParser;
    private final OpenApiClientGenerator openApiGenerator;
    private final WsdlContractParser wsdlParser;
    private final WsdlClientGenerator wsdlGenerator;

    public GeneratorService(AppConfig appConfig, EjbProjectParser parser,
                            CodeGenerationEngine engine, SmartCodeEnhancer enhancer,
                            OpenApiContractParser openApiParser, OpenApiClientGenerator openApiGenerator,
                            WsdlContractParser wsdlParser, WsdlClientGenerator wsdlGenerator) {
        this.appConfig = appConfig;
        this.parser = parser;
        this.engine = engine;
        this.enhancer = enhancer;
        this.openApiParser = openApiParser;
        this.openApiGenerator = openApiGenerator;
        this.wsdlParser = wsdlParser;
        this.wsdlGenerator = wsdlGenerator;
    }

    // ============================================================
    // Upload
    // ============================================================

    public String uploadProject(MultipartFile file) throws IOException {
        String projectId = UUID.randomUUID().toString();
        Path uploadDir = Path.of(appConfig.getUploadDir(), projectId);
        Files.createDirectories(uploadDir);

        try (ZipInputStream zis = new ZipInputStream(file.getInputStream())) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                Path entryPath = uploadDir.resolve(entry.getName()).normalize();

                if (!entryPath.startsWith(uploadDir)) {
                    throw new IOException("Entree ZIP invalide : " + entry.getName());
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

        log.info("Projet uploade et extrait : {}", projectId);
        return projectId;
    }

    // ============================================================
    // Analysis
    // ============================================================

    public ProjectAnalysisResult analyzeProject(String projectId) {
        Path projectPath = Path.of(appConfig.getUploadDir(), projectId);
        if (!Files.exists(projectPath)) {
            throw new IllegalArgumentException("Projet non trouve : " + projectId);
        }
        return parser.analyzeProject(projectPath);
    }

    // ============================================================
    // Generation
    // ============================================================

    // Dernier rapport d'amelioration genere (accessible apres generateProject)
    private EnhancementReport lastEnhancementReport;

    public EnhancementReport getLastEnhancementReport() {
        return lastEnhancementReport;
    }

    public Path generateProject(String projectId, ProjectAnalysisResult analysisResult, boolean bianMode) throws IOException {
        Path outputDir = Path.of(appConfig.getOutputDir(), projectId);
        Files.createDirectories(outputDir);

        Path projectRoot = engine.generateProject(analysisResult, outputDir, bianMode);
        log.info("Etape 1/2 : Code de base genere dans {}", projectRoot);

        EnhancementReport report = enhancer.enhance(projectRoot, analysisResult);
        log.info("Etape 2/2 : Ameliorations IA appliquees - Score: {}/100, Regles: {}/{}",
                report.getQualityScore(), report.getTotalRulesApplied(), report.getTotalRulesChecked());

        generateEnhancementReportFile(projectRoot, report);
        this.lastEnhancementReport = report;
        return projectRoot;
    }

    public EnhancementReport enhanceProject(String projectId, ProjectAnalysisResult analysisResult) throws IOException {
        Path projectRoot = Path.of(appConfig.getOutputDir(), projectId, "generated-api");
        if (!Files.exists(projectRoot)) {
            throw new IllegalArgumentException("Projet genere non trouve : " + projectId);
        }
        EnhancementReport report = enhancer.enhance(projectRoot, analysisResult);
        generateEnhancementReportFile(projectRoot, report);
        return report;
    }

    private void generateEnhancementReportFile(Path projectRoot, EnhancementReport report) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Rapport d'Amelioration IA\n\n");
        sb.append("**Moteur** : SmartCodeEnhancer (moteur de regles interne, sans IA externe)\n\n");
        sb.append("## Resume\n\n");
        sb.append("| Metrique | Valeur |\n");
        sb.append("|----------|--------|\n");
        sb.append("| Score de qualite | **").append(report.getQualityScore()).append("/100** |\n");
        sb.append("| Regles verifiees | ").append(report.getTotalRulesChecked()).append(" |\n");
        sb.append("| Regles appliquees | ").append(report.getTotalRulesApplied()).append(" |\n");
        sb.append("| Regles avec details | ").append(report.countWithDetails()).append(" |\n");
        sb.append("| Ameliorations critiques | ").append(report.countBySeverity(EnhancementReport.Severity.CRITICAL)).append(" |\n");
        sb.append("| Avertissements | ").append(report.countBySeverity(EnhancementReport.Severity.WARNING)).append(" |\n");
        sb.append("| Suggestions | ").append(report.countBySeverity(EnhancementReport.Severity.SUGGESTION)).append(" |\n\n");

        sb.append("## Detail par categorie\n\n");
        for (EnhancementReport.Category cat : EnhancementReport.Category.values()) {
            long count = report.countByCategory(cat);
            if (count > 0) {
                sb.append("### ").append(cat.getLabel()).append(" (").append(count).append(" regles)\n\n");
                sb.append("| Regle | Severite | Description | Fichier | Appliquee |\n");
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

                // Ajouter les details enrichis pour chaque regle de cette categorie
                for (EnhancementReport.Enhancement e : report.getEnhancements()) {
                    if (e.getCategory() == cat && e.hasDetails()) {
                        sb.append("#### ").append(e.getRuleId()).append(" - ").append(e.getDescription()).append("\n\n");
                        if (e.getJustification() != null && !e.getJustification().isEmpty()) {
                            sb.append("**Pourquoi cette regle ?**\n\n");
                            sb.append("> ").append(e.getJustification()).append("\n\n");
                        }
                        if (e.getActionTaken() != null && !e.getActionTaken().isEmpty()) {
                            sb.append("**Action realisee :** ").append(e.getActionTaken()).append("\n\n");
                        }
                        if (e.getBeforeSnippet() != null && !e.getBeforeSnippet().isEmpty()) {
                            sb.append("**Avant :**\n```java\n").append(e.getBeforeSnippet()).append("\n```\n\n");
                        }
                        if (e.getAfterSnippet() != null && !e.getAfterSnippet().isEmpty()) {
                            sb.append("**Apres :**\n```java\n").append(e.getAfterSnippet()).append("\n```\n\n");
                        }
                        if (e.getReference() != null && !e.getReference().isEmpty()) {
                            sb.append("**Reference :** *").append(e.getReference()).append("*\n\n");
                        }
                        sb.append("---\n\n");
                    }
                }
            }
        }

        Files.writeString(projectRoot.resolve("ENHANCEMENT_REPORT.md"), sb.toString());
        log.info("Rapport d'amelioration IA genere : ENHANCEMENT_REPORT.md ({} regles avec details)",
                report.countWithDetails());
    }

    // ============================================================
    // Download
    // ============================================================

    public Path createDownloadZip(String projectId) throws IOException {
        Path generatedDir = Path.of(appConfig.getOutputDir(), projectId, "generated-api");
        if (!Files.exists(generatedDir)) {
            throw new IllegalArgumentException("Projet genere non trouve : " + projectId);
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
                            log.error("Erreur lors de la creation du ZIP", e);
                        }
                    });
        }

        log.info("ZIP de telechargement cree : {}", zipFile);
        return zipFile;
    }

    // ============================================================
    // OpenAPI Client Generation
    // ============================================================

    /**
     * Upload et parse un contrat OpenAPI/Swagger, puis genere le client REST Feign.
     *
     * @param file fichier JSON OpenAPI/Swagger
     * @param partnerName nom du partenaire (ex: "MAGIX", "CMI")
     * @param bianMode activer le mapping BIAN
     * @return chemin du projet client genere
     */
    public Path generateOpenApiClient(MultipartFile file, String partnerName, boolean bianMode) throws IOException {
        // 1. Sauvegarder le fichier
        String projectId = "openapi-" + partnerName.toLowerCase() + "-" + UUID.randomUUID().toString().substring(0, 8);
        Path uploadDir = Path.of(appConfig.getUploadDir(), projectId);
        Files.createDirectories(uploadDir);
        Path contractFile = uploadDir.resolve(file.getOriginalFilename());
        Files.copy(file.getInputStream(), contractFile, StandardCopyOption.REPLACE_EXISTING);

        log.info("[OpenAPI] Contrat uploade : {} (partenaire: {})", contractFile.getFileName(), partnerName);

        // 2. Parser le contrat
        OpenApiContractInfo contract = openApiParser.parse(contractFile, partnerName);

        // 3. Generer le client
        Path outputDir = Path.of(appConfig.getOutputDir(), projectId);
        Files.createDirectories(outputDir);
        Path clientProject = openApiGenerator.generateClient(contract, outputDir, bianMode);

        log.info("[OpenAPI] Client genere pour {} : {} endpoints, {} schemas",
                partnerName, contract.getEndpoints().size(), contract.getSchemas().size());

        return clientProject;
    }

    /**
     * Parse un contrat OpenAPI deja present sur le filesystem.
     */
    public OpenApiContractInfo parseOpenApiContract(Path contractFile, String partnerName) throws IOException {
        return openApiParser.parse(contractFile, partnerName);
    }

    // ============================================================
    // WSDL Client Generation
    // ============================================================

    /**
     * Upload et parse un contrat WSDL, puis genere le client SOAP JAX-WS/CXF.
     *
     * @param file fichier WSDL
     * @param partnerName nom du partenaire (ex: "RMA", "HPS")
     * @param bianMode activer le mapping BIAN + facade REST
     * @return chemin du projet client genere
     */
    public Path generateWsdlClient(MultipartFile file, String partnerName, boolean bianMode) throws IOException {
        // 1. Sauvegarder le fichier
        String projectId = "wsdl-" + partnerName.toLowerCase() + "-" + UUID.randomUUID().toString().substring(0, 8);
        Path uploadDir = Path.of(appConfig.getUploadDir(), projectId);
        Files.createDirectories(uploadDir);
        Path contractFile = uploadDir.resolve(file.getOriginalFilename());
        Files.copy(file.getInputStream(), contractFile, StandardCopyOption.REPLACE_EXISTING);

        log.info("[WSDL] Contrat uploade : {} (partenaire: {})", contractFile.getFileName(), partnerName);

        // 2. Parser le contrat
        WsdlContractInfo contract = wsdlParser.parse(contractFile, partnerName);

        // 3. Generer le client
        Path outputDir = Path.of(appConfig.getOutputDir(), projectId);
        Files.createDirectories(outputDir);
        Path clientProject = wsdlGenerator.generateClient(contract, outputDir, bianMode);

        log.info("[WSDL] Client genere pour {} : {} operations, {} types complexes",
                partnerName, contract.getOperations().size(), contract.getComplexTypes().size());

        return clientProject;
    }

    /**
     * Parse un contrat WSDL deja present sur le filesystem.
     */
    public WsdlContractInfo parseWsdlContract(Path contractFile, String partnerName) throws IOException {
        return wsdlParser.parse(contractFile, partnerName);
    }

    /**
     * Cree un ZIP de telechargement pour un client partenaire genere.
     */
    public Path createPartnerClientZip(Path clientProjectDir) throws IOException {
        Path zipFile = clientProjectDir.getParent().resolve(clientProjectDir.getFileName() + ".zip");

        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            Files.walk(clientProjectDir)
                    .filter(Files::isRegularFile)
                    .forEach(file -> {
                        try {
                            String entryName = clientProjectDir.relativize(file).toString();
                            zos.putNextEntry(new ZipEntry(entryName));
                            Files.copy(file, zos);
                            zos.closeEntry();
                        } catch (IOException e) {
                            log.error("Erreur lors de la creation du ZIP partenaire", e);
                        }
                    });
        }

        log.info("ZIP client partenaire cree : {}", zipFile);
        return zipFile;
    }

    // ============================================================
    // File Tree & Content (for IHM)
    // ============================================================

    /**
     * Retourne l'arborescence des fichiers du projet uploade.
     */
    public List<String> getProjectFileTree(String projectId) throws IOException {
        Path projectPath = Path.of(appConfig.getUploadDir(), projectId);
        if (!Files.exists(projectPath)) {
            return Collections.emptyList();
        }
        try (Stream<Path> walk = Files.walk(projectPath)) {
            return walk
                    .filter(Files::isRegularFile)
                    .map(p -> projectPath.relativize(p).toString())
                    .sorted()
                    .collect(Collectors.toList());
        }
    }

    /**
     * Retourne l'arborescence des fichiers du projet genere.
     */
    public List<String> getGeneratedFileTree(String projectId) throws IOException {
        Path generatedDir = Path.of(appConfig.getOutputDir(), projectId, "generated-api");
        if (!Files.exists(generatedDir)) {
            return Collections.emptyList();
        }
        try (Stream<Path> walk = Files.walk(generatedDir)) {
            return walk
                    .filter(Files::isRegularFile)
                    .map(p -> generatedDir.relativize(p).toString())
                    .sorted()
                    .collect(Collectors.toList());
        }
    }

    /**
     * Retourne le contenu d'un fichier du projet genere.
     */
    public String getGeneratedFileContent(String projectId, String relativePath) throws IOException {
        Path filePath = Path.of(appConfig.getOutputDir(), projectId, "generated-api", relativePath).normalize();
        Path generatedDir = Path.of(appConfig.getOutputDir(), projectId, "generated-api");

        // Security: ensure path is within generated dir
        if (!filePath.startsWith(generatedDir)) {
            throw new SecurityException("Acces refuse : chemin hors du projet genere");
        }

        if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
            throw new FileNotFoundException("Fichier non trouve : " + relativePath);
        }

        return Files.readString(filePath);
    }

    /**
     * Retourne le contenu d'un fichier du projet uploade (original EJB).
     */
    public String getUploadedFileContent(String projectId, String relativePath) throws IOException {
        Path filePath = Path.of(appConfig.getUploadDir(), projectId, relativePath).normalize();
        Path uploadDir = Path.of(appConfig.getUploadDir(), projectId);

        if (!filePath.startsWith(uploadDir)) {
            throw new SecurityException("Acces refuse : chemin hors du projet uploade");
        }

        if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
            throw new FileNotFoundException("Fichier non trouve : " + relativePath);
        }

        return Files.readString(filePath);
    }

    /**
     * Retourne le diff entre le code EJB original et le controller REST genere
     * pour un UseCase donne.
     */
    public Map<String, String> getUseCaseDiff(String projectId, String useCaseClassName) throws IOException {
        Map<String, String> result = new HashMap<>();

        // Find original EJB file
        Path uploadDir = Path.of(appConfig.getUploadDir(), projectId);
        String originalContent = findFileContent(uploadDir, useCaseClassName + ".java");
        result.put("original", originalContent != null ? originalContent : "// Fichier original non trouve");

        // Find generated controller
        Path generatedDir = Path.of(appConfig.getOutputDir(), projectId, "generated-api");
        String controllerName = useCaseClassName.replace("UC", "") + "Controller.java";
        String generatedContent = findFileContent(generatedDir, controllerName);
        result.put("generated", generatedContent != null ? generatedContent : "// Controller genere non trouve");

        result.put("originalName", useCaseClassName + ".java");
        result.put("generatedName", controllerName);

        return result;
    }

    /**
     * Recherche un fichier par nom dans une arborescence et retourne son contenu.
     */
    private String findFileContent(Path rootDir, String fileName) throws IOException {
        if (!Files.exists(rootDir)) return null;

        try (Stream<Path> walk = Files.walk(rootDir)) {
            Optional<Path> found = walk
                    .filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().equals(fileName))
                    .findFirst();

            if (found.isPresent()) {
                return Files.readString(found.get());
            }
        }
        return null;
    }

    // ============================================================
    // Status checks
    // ============================================================

    public boolean projectExists(String projectId) {
        return Files.exists(Path.of(appConfig.getUploadDir(), projectId));
    }

    public boolean generatedProjectExists(String projectId) {
        return Files.exists(Path.of(appConfig.getOutputDir(), projectId, "generated-api"));
    }
}
