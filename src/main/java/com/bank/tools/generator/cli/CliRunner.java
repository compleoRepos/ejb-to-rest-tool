package com.bank.tools.generator.cli;

import com.bank.tools.generator.ai.EnhancementReport;
import com.bank.tools.generator.ai.SmartCodeEnhancer;
import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.model.InputMode;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import com.bank.tools.generator.parser.EjbProjectParser;
import com.bank.tools.generator.parser.JsonAdapterParser;
import com.bank.tools.generator.report.ReportPdfGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Mode CLI du generateur EJB-to-REST.
 * Active par le flag --cli sur la ligne de commande.
 *
 * <p>Supporte deux modes d'entree :</p>
 * <ul>
 *   <li><b>ZIP (EJB)</b> : Archive ZIP contenant le code source EJB legacy</li>
 *   <li><b>JSON (Adapter Contract)</b> : Fichier JSON decrivant un adapter REST backend</li>
 * </ul>
 *
 * <p>Le mode est auto-detecte a partir de l'extension du fichier d'entree (.zip ou .json).</p>
 *
 * Usage :
 *   java -jar ejb-to-rest-tool.jar --cli --input /path/to/file.zip --output /path/to/output [--bian] [--bian-mapping mapping.yaml] [--pdf]
 *   java -jar ejb-to-rest-tool.jar --cli --input /path/to/contract.json --output /path/to/output [--pdf]
 *
 * Options :
 *   --cli                  Active le mode ligne de commande (obligatoire)
 *   --input PATH           Chemin vers le ZIP EJB ou le contrat JSON (obligatoire)
 *   --output PATH          Repertoire de sortie (defaut : ./output)
 *   --bian                 Active le mode BIAN (ZIP uniquement, implicite pour JSON)
 *   --bian-mapping PATH    Fichier YAML de mapping BIAN (ZIP uniquement, implique --bian)
 *   --pdf                  Genere un rapport PDF
 */
@Component
@ConditionalOnProperty(name = "cli.enabled", havingValue = "true", matchIfMissing = false)
public class CliRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(CliRunner.class);

    private final EjbProjectParser parser;
    private final CodeGenerationEngine engine;
    private final SmartCodeEnhancer enhancer;
    private final ReportPdfGenerator pdfGenerator;
    private final JsonAdapterParser jsonAdapterParser;

    public CliRunner(EjbProjectParser parser,
                     CodeGenerationEngine engine,
                     SmartCodeEnhancer enhancer,
                     ReportPdfGenerator pdfGenerator,
                     JsonAdapterParser jsonAdapterParser) {
        this.parser = parser;
        this.engine = engine;
        this.enhancer = enhancer;
        this.pdfGenerator = pdfGenerator;
        this.jsonAdapterParser = jsonAdapterParser;
    }

    @Override
    public void run(String... args) throws Exception {
        String inputPath = null;
        String outputPath = "./output";
        boolean bianMode = false;
        boolean generatePdf = false;
        String bianMappingPath = null;

        // Parse arguments
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--input" -> {
                    if (i + 1 < args.length) inputPath = args[++i];
                }
                case "--output" -> {
                    if (i + 1 < args.length) outputPath = args[++i];
                }
                case "--bian" -> bianMode = true;
                case "--bian-mapping" -> {
                    if (i + 1 < args.length) {
                        bianMappingPath = args[++i];
                        bianMode = true; // --bian-mapping implies --bian
                    }
                }
                case "--pdf" -> generatePdf = true;
                case "--cli" -> { /* already handled by Spring property */ }
                default -> log.warn("[CLI] Argument inconnu : {}", args[i]);
            }
        }

        if (inputPath == null) {
            printUsage();
            System.exit(1);
            return;
        }

        Path inputFile = Path.of(inputPath);
        if (!Files.exists(inputFile)) {
            log.error("[CLI] ERREUR : Fichier introuvable : {}", inputPath);
            System.exit(1);
            return;
        }

        Path outputDir = Path.of(outputPath);
        Files.createDirectories(outputDir);

        // Auto-detection du mode d'entree
        InputMode inputMode = InputMode.detectFromFilename(inputFile.getFileName().toString());

        log.info("=== EJB-to-REST Generator — Mode CLI ===");
        log.info("Input  : {} (mode={})", inputFile.toAbsolutePath(), inputMode.getLabel());
        log.info("Output : {}", outputDir.toAbsolutePath());

        if (inputMode == InputMode.JSON_ADAPTER) {
            runJsonPipeline(inputFile, outputDir, generatePdf);
        } else {
            runZipPipeline(inputFile, outputDir, bianMode, bianMappingPath, generatePdf);
        }
    }

    // ============================================================
    // Pipeline JSON (Adapter Contract -> Main Pipeline)
    // ============================================================

    private void runJsonPipeline(Path inputFile, Path outputDir, boolean generatePdf) throws Exception {
        log.info("[CLI] Mode JSON Adapter : pipeline principal (BIAN + ACL)");

        // Etape 1 : Lecture du contrat JSON
        log.info("[CLI] Etape 1/4 : Lecture du contrat JSON...");
        String jsonContent = Files.readString(inputFile);
        log.info("[CLI] Contrat JSON lu : {} octets", jsonContent.length());

        // Etape 2 : Parsing du contrat JSON en ProjectAnalysisResult
        log.info("[CLI] Etape 2/4 : Parsing du contrat JSON...");
        ProjectAnalysisResult analysis = jsonAdapterParser.parseFromString(jsonContent);
        analysis.setInputMode(InputMode.JSON_ADAPTER);
        log.info("[CLI] Contrat parse : {} UseCases, {} DTOs",
                analysis.getUseCases().size(), analysis.getDtos().size());

        // Etape 3 : Generation via le pipeline principal (bianMode=true, transport=rest)
        log.info("[CLI] Etape 3/4 : Generation du projet Spring Boot (BIAN + ACL + REST)...");
        Path generatedProject = engine.generateProject(analysis, outputDir, true, "rest");
        log.info("[CLI] Projet genere dans : {}", generatedProject);

        // Etape 4 : Enhancement IA
        log.info("[CLI] Etape 4/4 : Amelioration SmartCodeEnhancer...");
        EnhancementReport report = enhancer.enhance(generatedProject, analysis);
        log.info("[CLI] Score qualite : {}/{} ({} regles appliquees sur {} verifiees)",
                report.getQualityScore(), report.getTotalRulesChecked(),
                report.getTotalRulesApplied(), report.getTotalRulesChecked());

        // Rapport PDF (optionnel)
        if (generatePdf) {
            log.info("[CLI] Generation du rapport PDF...");
            Path pdfPath = generatedProject.resolve("TRANSFORMATION_REPORT.pdf");
            pdfGenerator.generateReport(pdfPath, analysis, report);
            log.info("[CLI] Rapport PDF genere : {}", pdfPath);
        }

        log.info("=== Generation terminee avec succes (JSON Adapter -> Main Pipeline) ===");
        log.info("Projet genere : {}", generatedProject.toAbsolutePath());
        log.info("Score qualite : {}/{}", report.getTotalRulesApplied(), report.getTotalRulesChecked());

        System.exit(0);
    }

    // ============================================================
    // Pipeline ZIP (EJB -> Main Pipeline)
    // ============================================================

    private void runZipPipeline(Path inputFile, Path outputDir, boolean bianMode,
                                String bianMappingPath, boolean generatePdf) throws Exception {
        log.info("BIAN   : {}", bianMode);
        log.info("BIAN Mapping : {}", bianMappingPath != null ? bianMappingPath : "(auto-detect)");
        log.info("PDF    : {}", generatePdf);

        // Etape 1 : Extraction du ZIP
        log.info("[CLI] Etape 1/5 : Extraction du projet EJB...");
        Path extractDir = outputDir.resolve("extracted");
        extractZip(inputFile, extractDir);
        log.info("[CLI] Projet extrait dans : {}", extractDir);

        // Etape 2 : Analyse
        log.info("[CLI] Etape 2/5 : Analyse du projet EJB...");
        ProjectAnalysisResult analysis = parser.analyzeProject(extractDir);
        log.info("[CLI] Analyse terminee : {} UseCases, {} DTOs, {} exceptions",
                analysis.getUseCases().size(),
                analysis.getDtos().size(),
                analysis.getDetectedExceptions().size());

        // Etape 2b : Appliquer le mapping BIAN depuis fichier YAML si fourni
        if (bianMappingPath != null) {
            Path mappingFile = Path.of(bianMappingPath);
            if (!Files.exists(mappingFile)) {
                log.error("[CLI] ERREUR : Fichier de mapping BIAN introuvable : {}", bianMappingPath);
                System.exit(1);
                return;
            }
            log.info("[CLI] Application du mapping BIAN depuis : {}", mappingFile.toAbsolutePath());
            applyBianMappingFromYaml(analysis, mappingFile);
        }

        // Etape 3 : Generation
        log.info("[CLI] Etape 3/5 : Generation du projet Spring Boot...");
        Path generatedProject = engine.generateProject(analysis, outputDir, bianMode);
        log.info("[CLI] Projet genere dans : {}", generatedProject);

        // Etape 4 : Enhancement IA
        log.info("[CLI] Etape 4/5 : Amelioration SmartCodeEnhancer...");
        EnhancementReport report = enhancer.enhance(generatedProject, analysis);
        log.info("[CLI] Score qualite : {}/{} ({} regles appliquees sur {} verifiees)",
                report.getTotalRulesApplied(), report.getTotalRulesChecked(),
                report.getTotalRulesApplied(), report.getTotalRulesChecked());

        // Etape 5 : Rapport PDF (optionnel)
        if (generatePdf) {
            log.info("[CLI] Etape 5/5 : Generation du rapport PDF...");
            Path pdfPath = generatedProject.resolve("TRANSFORMATION_REPORT.pdf");
            pdfGenerator.generateReport(pdfPath, analysis, report);
            log.info("[CLI] Rapport PDF genere : {}", pdfPath);
        } else {
            log.info("[CLI] Etape 5/5 : Generation PDF ignoree (--pdf non specifie)");
        }

        log.info("=== Generation terminee avec succes ===");
        log.info("Projet genere : {}", generatedProject.toAbsolutePath());
        log.info("Score qualite : {}/{}", report.getTotalRulesApplied(), report.getTotalRulesChecked());

        System.exit(0);
    }

    // ============================================================
    // Usage
    // ============================================================

    private void printUsage() {
        log.error("Usage: java -jar ejb-to-rest-tool.jar --cli --input <path.zip|path.json> [--output <dir>] [--bian] [--bian-mapping <file.yaml>] [--pdf]");
        log.error("");
        log.error("  --input          Chemin vers le ZIP du projet EJB ou le contrat JSON adapter (obligatoire)");
        log.error("                   L'extension du fichier determine le mode :");
        log.error("                     .zip  -> Pipeline EJB (analyse + generation)");
        log.error("                     .json -> Pipeline JSON Adapter (contrat -> BIAN ACL)");
        log.error("  --output         Repertoire de sortie (defaut: ./output)");
        log.error("  --bian           Active le mode BIAN (ZIP uniquement, implicite pour JSON)");
        log.error("  --bian-mapping   Fichier YAML de mapping BIAN (ZIP uniquement, implique --bian)");
        log.error("  --pdf            Genere un rapport PDF");
    }

    // ============================================================
    // BIAN YAML Mapping
    // ============================================================

    /**
     * Applique un mapping BIAN depuis un fichier YAML aux UseCases de l'analyse.
     * Format YAML attendu (simple, sans dependance SnakeYAML) :
     * <pre>
     * mappings:
     *   - useCase: MaClasse
     *     serviceDomain: current-account
     *     behaviorQualifier: balance
     *     action: retrieval
     *     httpMethod: GET
     *     endpoint: /current-account/{cr-reference-id}/balance/retrieval
     *     controllerName: CurrentAccountController
     * </pre>
     */
    private void applyBianMappingFromYaml(ProjectAnalysisResult analysis, Path yamlFile) throws IOException {
        List<String> lines = Files.readAllLines(yamlFile);
        Map<String, Map<String, String>> mappings = parseSimpleYaml(lines);

        int applied = 0;
        for (UseCaseInfo uc : analysis.getUseCases()) {
            Map<String, String> entry = mappings.get(uc.getClassName());
            if (entry != null) {
                String sd = entry.getOrDefault("serviceDomain", "");
                String action = entry.getOrDefault("action", "");
                String bq = entry.getOrDefault("behaviorQualifier", "");

                BianMapping mapping = new BianMapping(sd, action, bq);
                mapping.setUseCaseName(uc.getClassName());
                mapping.setHttpMethod(entry.getOrDefault("httpMethod", "GET"));
                mapping.setUrl(entry.getOrDefault("endpoint", ""));
                mapping.setControllerName(entry.getOrDefault("controllerName", ""));
                mapping.setExplicit(true);

                uc.setBianMapping(mapping);
                if (mapping.getUrl() != null && !mapping.getUrl().isEmpty()) {
                    uc.setRestEndpoint(mapping.getUrl());
                }
                if (mapping.getHttpMethod() != null) {
                    uc.setHttpMethod(mapping.getHttpMethod());
                }
                applied++;
                log.info("[CLI] Mapping BIAN applique : {} -> {} / {} / {}",
                        uc.getClassName(), sd, bq, action);
            }
        }
        log.info("[CLI] {} mapping(s) BIAN applique(s) depuis le fichier YAML", applied);
    }

    /**
     * Parse simple YAML mapping file without external dependencies.
     * Returns a map of useCase name -> field map.
     */
    private Map<String, Map<String, String>> parseSimpleYaml(List<String> lines) {
        Map<String, Map<String, String>> result = new LinkedHashMap<>();
        Map<String, String> current = null;

        Pattern fieldPattern = Pattern.compile("^\\s+(\\w+):\\s*(.+)$");

        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("#") || trimmed.isEmpty() || trimmed.equals("mappings:")) {
                continue;
            }
            if (trimmed.startsWith("- useCase:")) {
                current = new LinkedHashMap<>();
                String useCase = trimmed.substring("- useCase:".length()).trim();
                current.put("useCase", useCase);
                result.put(useCase, current);
                continue;
            }
            if (current != null) {
                Matcher m = fieldPattern.matcher(line);
                if (m.matches()) {
                    current.put(m.group(1), m.group(2).trim());
                }
            }
        }
        return result;
    }

    /**
     * Extrait un fichier ZIP dans le repertoire cible.
     */
    private void extractZip(Path zipFile, Path targetDir) throws IOException {
        if (Files.exists(targetDir)) {
            Files.walkFileTree(targetDir, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.delete(file);
                    return FileVisitResult.CONTINUE;
                }
                @Override
                public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                    Files.delete(dir);
                    return FileVisitResult.CONTINUE;
                }
            });
        }
        Files.createDirectories(targetDir);

        try (ZipInputStream zis = new ZipInputStream(Files.newInputStream(zipFile))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                Path entryPath = targetDir.resolve(entry.getName()).normalize();
                // Security : prevent zip slip
                if (!entryPath.startsWith(targetDir)) {
                    throw new IOException("Zip entry outside target directory: " + entry.getName());
                }
                if (entry.isDirectory()) {
                    Files.createDirectories(entryPath);
                } else {
                    Files.createDirectories(entryPath.getParent());
                    Files.copy(zis, entryPath, StandardCopyOption.REPLACE_EXISTING);
                }
                zis.closeEntry();
            }
        }
    }
}
