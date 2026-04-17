package com.bank.tools.generator.engine;

import com.bank.tools.generator.annotation.AnnotationPropagator;
import com.bank.tools.generator.bian.BianControllerGrouper;
import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.bian.BianMappingResolver;
import com.bank.tools.generator.engine.generators.*;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

import static com.bank.tools.generator.engine.constants.GeneratorConstants.DEFAULT_BASE_PACKAGE;
import static com.bank.tools.generator.engine.constants.GeneratorConstants.DEFAULT_BASE_PACKAGE_PATH;

/**
 * Orchestrateur de génération — Version refactored.
 *
 * Ce fichier ne contient AUCUNE logique de génération de code.
 * Il orchestre les sous-générateurs spécialisés dans le bon ordre.
 *
 * Pipeline :
 *   1. Créer la structure de répertoires
 *   2. Générer le POM
 *   3. Générer les configs Spring
 *   4. Générer les enums, exceptions, validateurs
 *   5. Générer les controllers et adapters (ou déléguer à l'ACL)
 *   6. Résoudre les imports
 *   7. Générer les rapports
 */
@Component("codeGenerationOrchestrator")
public class CodeGenerationOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(CodeGenerationOrchestrator.class);

    // --- Sous-générateurs ---
    private final PomGenerator pomGenerator;
    private final ConfigGenerator configGenerator;
    private final ControllerGenerator controllerGenerator;
    private final EnumExceptionGenerator enumExceptionGenerator;
    private final ExceptionHandlerGenerator exceptionHandlerGenerator;
    private final ImportResolver importResolver;

    // --- Modules optionnels ---
    @Autowired(required = false) private AclArchitectureGenerator aclGenerator;
    @Autowired(required = false) private BianControllerGrouper bianControllerGrouper;
    @Autowired(required = false) private BianMappingResolver bianMappingResolver;
    @Autowired(required = false) private AnnotationPropagator annotationPropagator;
    @Autowired(required = false) private BianServiceDomainMapper bianMapper;

    public CodeGenerationOrchestrator(
            PomGenerator pomGenerator,
            ConfigGenerator configGenerator,
            ControllerGenerator controllerGenerator,
            EnumExceptionGenerator enumExceptionGenerator,
            ExceptionHandlerGenerator exceptionHandlerGenerator,
            ImportResolver importResolver) {
        this.pomGenerator = pomGenerator;
        this.configGenerator = configGenerator;
        this.controllerGenerator = controllerGenerator;
        this.enumExceptionGenerator = enumExceptionGenerator;
        this.exceptionHandlerGenerator = exceptionHandlerGenerator;
        this.importResolver = importResolver;
    }

    /**
     * Point d'entrée principal — Génère un projet Spring Boot complet.
     *
     * @param analysisResult Résultat de l'analyse AST du projet EJB
     * @param outputDir      Répertoire de sortie
     * @param bianMode       true = mode BIAN avec ACL
     * @return Chemin du projet généré
     */
    public Path generateProject(ProjectAnalysisResult analysisResult, Path outputDir, boolean bianMode) throws IOException {
        log.info("=== DÉBUT GÉNÉRATION (BIAN={}, ACL={}) ===", bianMode, aclGenerator != null);

        Path projectRoot = outputDir.resolve("generated-api");
        Path srcMain = projectRoot.resolve("src/main/java/" + DEFAULT_BASE_PACKAGE_PATH);
        Path resourcesDir = projectRoot.resolve("src/main/resources");

        // --- 1. Structure de répertoires ---
        createDirectoryStructure(srcMain, resourcesDir);

        boolean hasXml = analysisResult.getUseCases().stream().anyMatch(UseCaseInfo::hasXmlSupport)
                || analysisResult.getDtos().stream().anyMatch(DtoInfo::hasJaxbAnnotations);

        // --- 2. POM ---
        pomGenerator.generate(projectRoot, analysisResult);

        // --- 3. Configs Spring ---
        configGenerator.generateAll(srcMain, resourcesDir, hasXml);

        // --- 4. Mode ACL ou mode couplé ---
        boolean useAcl = bianMode && aclGenerator != null;

        if (useAcl) {
            generateWithAcl(srcMain, analysisResult);
        } else {
            generateCoupled(srcMain, analysisResult, bianMode);
        }

        // --- 5. Validateurs (communs aux deux modes) ---
        for (var valInfo : analysisResult.getDetectedValidators()) {
            enumExceptionGenerator.generateValidator(srcMain, valInfo, DEFAULT_BASE_PACKAGE);
        }

        // --- 6. Résolution des imports ---
        int resolved = importResolver.resolveImports(projectRoot);
        log.info("[Phase 8] ImportResolver : {} fichiers corrigés", resolved);

        // --- 7. Rapports ---
        // (délégué au CodeGenerationEngine existant pour compatibilité)

        log.info("=== GÉNÉRATION TERMINÉE : {} ===", projectRoot);
        return projectRoot;
    }

    /**
     * Mode ACL — Architecture découplée (4 couches).
     * Délègue tout à l'AclArchitectureGenerator.
     */
    private void generateWithAcl(Path srcMain, ProjectAnalysisResult analysisResult) throws IOException {
        log.info("[ACL] Génération en mode découplé");

        // Construire le mapping BIAN
        Map<String, BianMapping> bianMappingMap = new LinkedHashMap<>();
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            if (uc.getBianMapping() != null) {
                bianMappingMap.put(uc.getClassName(), uc.getBianMapping());
            }
        }

        try {
            aclGenerator.generate(srcMain, analysisResult, bianMappingMap);
            log.info("[ACL] Architecture découplée générée avec succès");
        } catch (IOException | RuntimeException e) {
            log.error("[ACL] ERREUR : {}", e.getMessage(), e);
            throw new IOException("Échec de la génération ACL", e);
        }
    }

    /**
     * Mode couplé — Génération directe (controllers + adapters + DTOs).
     * Utilisé quand l'ACL n'est pas activée.
     */
    private void generateCoupled(Path srcMain, ProjectAnalysisResult analysisResult, boolean bianMode) throws IOException {
        log.info("[COUPLÉ] Génération en mode direct");

        // Enums + Exceptions
        enumExceptionGenerator.generateAll(srcMain, analysisResult, DEFAULT_BASE_PACKAGE);

        // GlobalExceptionHandler
        exceptionHandlerGenerator.generateGlobalExceptionHandler(srcMain, analysisResult, DEFAULT_BASE_PACKAGE);
        exceptionHandlerGenerator.generateLoggingAspect(srcMain, DEFAULT_BASE_PACKAGE);
        exceptionHandlerGenerator.generateCorrelationIdFilter(srcMain, DEFAULT_BASE_PACKAGE);

        // Controllers + Adapters
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            if (uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN) {
                // MDB — traitement spécial (délégué au CodeGenerationEngine legacy pour l'instant)
                log.info("[MDB] {} — utiliser CodeGenerationEngine legacy", uc.getClassName());
                continue;
            }

            boolean skipForBian = bianMode && bianControllerGrouper != null
                    && uc.getBianMapping() != null;

            if (!skipForBian) {
                if (uc.getEjbPattern() == UseCaseInfo.EjbPattern.BASE_USE_CASE) {
                    controllerGenerator.generateBaseUseCaseController(srcMain, uc, DEFAULT_BASE_PACKAGE);
                } else {
                    controllerGenerator.generateMultiMethodController(srcMain, uc, DEFAULT_BASE_PACKAGE);
                }
            }

            // ServiceAdapters (délégués au CodeGenerationEngine legacy pour l'instant)
        }

        // DTOs
        // (délégué au CodeGenerationEngine legacy pour l'instant)

        // BIAN controllers regroupés
        if (bianMode && bianControllerGrouper != null) {
            List<UseCaseInfo> bianUseCases = analysisResult.getUseCases().stream()
                    .filter(uc -> uc.getBianMapping() != null)
                    .collect(Collectors.toList());
            if (!bianUseCases.isEmpty()) {
                Map<String, List<UseCaseInfo>> grouped = bianControllerGrouper.groupByServiceDomain(bianUseCases);
                for (var entry : grouped.entrySet()) {
                    bianControllerGrouper.generateGroupedController(
                            srcMain, entry.getKey(), entry.getValue(), DEFAULT_BASE_PACKAGE);
                }
                log.info("[BIAN] {} controllers regroupés générés", grouped.size());
            }
        }
    }

    /**
     * Crée la structure de répertoires du projet généré.
     */
    private void createDirectoryStructure(Path srcMain, Path resourcesDir) throws IOException {
        for (String dir : List.of(
                "controller", "service", "dto", "config", "exception",
                "logging", "ejb/interfaces", "enums", "validation", "filter")) {
            Files.createDirectories(srcMain.resolve(dir));
        }
        Files.createDirectories(resourcesDir);
    }
}
