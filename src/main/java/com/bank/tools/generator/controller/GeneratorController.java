package com.bank.tools.generator.controller;

import com.bank.tools.generator.ai.EnhancementReport;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import com.bank.tools.generator.service.GeneratorService;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Controller web pour l'interface utilisateur multi-ecrans.
 * Gere les 8 ecrans de l'IHM : Dashboard, Import, Analyse, Configuration,
 * Generation, Resultats, Rapport IA, Telechargement, et Logs.
 */
@Controller
public class GeneratorController {

    private static final Logger log = LoggerFactory.getLogger(GeneratorController.class);

    private final GeneratorService generatorService;

    public GeneratorController(GeneratorService generatorService) {
        this.generatorService = generatorService;
    }

    // ============================================================
    // Helper : populate common model attributes
    // ============================================================
    private void populateCommon(Model model, HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");
        ProjectAnalysisResult analysisResult = (ProjectAnalysisResult) session.getAttribute("analysisResult");
        EnhancementReport enhancementReport = (EnhancementReport) session.getAttribute("enhancementReport");

        model.addAttribute("projectId", projectId);
        model.addAttribute("analysisResult", analysisResult);
        model.addAttribute("enhancementReport", enhancementReport);
        model.addAttribute("projectGenerated",
                projectId != null && generatorService.generatedProjectExists(projectId));
    }

    // ============================================================
    // 1. Dashboard
    // ============================================================
    @GetMapping({"/", "/dashboard"})
    public String dashboard(Model model, HttpSession session) {
        populateCommon(model, session);
        return "dashboard";
    }

    // ============================================================
    // 2. Import / Upload
    // ============================================================
    @GetMapping("/import")
    public String importPage(Model model, HttpSession session) {
        populateCommon(model, session);
        String projectId = (String) session.getAttribute("projectId");

        if (projectId != null) {
            try {
                List<String> fileTree = generatorService.getProjectFileTree(projectId);
                model.addAttribute("fileTree", fileTree);

                Map<String, Integer> fileStats = new HashMap<>();
                fileStats.put("totalFiles", fileTree.size());
                fileStats.put("javaFiles", (int) fileTree.stream().filter(f -> f.endsWith(".java")).count());
                model.addAttribute("fileStats", fileStats);
            } catch (Exception e) {
                log.warn("Impossible de lire l'arborescence : {}", e.getMessage());
            }
        }

        return "upload";
    }

    @PostMapping("/upload")
    public String uploadProject(@RequestParam("file") MultipartFile file,
                                RedirectAttributes redirectAttributes,
                                HttpSession session) {
        log.info("Upload du projet EJB : {}", file.getOriginalFilename());

        if (file.isEmpty()) {
            redirectAttributes.addFlashAttribute("error", "Veuillez selectionner un fichier ZIP.");
            return "redirect:/import";
        }

        if (!file.getOriginalFilename().endsWith(".zip")) {
            redirectAttributes.addFlashAttribute("error", "Le fichier doit etre au format ZIP.");
            return "redirect:/import";
        }

        try {
            String projectId = generatorService.uploadProject(file);
            session.setAttribute("projectId", projectId);
            session.removeAttribute("analysisResult");
            session.removeAttribute("enhancementReport");
            redirectAttributes.addFlashAttribute("success",
                    "Projet uploade avec succes : " + file.getOriginalFilename());
            log.info("Projet uploade avec l'ID : {}", projectId);
        } catch (Exception e) {
            log.error("Erreur lors de l'upload", e);
            redirectAttributes.addFlashAttribute("error",
                    "Erreur lors de l'upload : " + e.getMessage());
        }

        return "redirect:/import";
    }

    // ============================================================
    // 3. Analysis
    // ============================================================
    @GetMapping("/analysis")
    public String analysisPage(Model model, HttpSession session) {
        populateCommon(model, session);
        return "analysis";
    }

    @PostMapping("/scan")
    public String scanProject(RedirectAttributes redirectAttributes, HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");

        if (projectId == null) {
            redirectAttributes.addFlashAttribute("error", "Aucun projet uploade.");
            return "redirect:/analysis";
        }

        try {
            log.info("Scan du projet : {}", projectId);
            ProjectAnalysisResult result = generatorService.analyzeProject(projectId);
            session.setAttribute("analysisResult", result);

            if (result.getUseCases().isEmpty()) {
                redirectAttributes.addFlashAttribute("warning",
                        "Aucun UseCase detecte. Verifiez que le projet contient des classes annotees @Stateless ou implementant BaseUseCase.");
            } else {
                redirectAttributes.addFlashAttribute("success",
                        result.getUseCases().size() + " UseCase(s) detecte(s), " +
                        result.getDtos().size() + " DTO(s) detecte(s).");
            }
        } catch (Exception e) {
            log.error("Erreur lors du scan", e);
            redirectAttributes.addFlashAttribute("error",
                    "Erreur lors de l'analyse : " + e.getMessage());
        }

        return "redirect:/analysis";
    }

    // ============================================================
    // 4. Configuration
    // ============================================================
    @GetMapping("/configuration")
    public String configurationPage(Model model, HttpSession session) {
        populateCommon(model, session);

        ProjectAnalysisResult analysisResult = (ProjectAnalysisResult) session.getAttribute("analysisResult");
        if (analysisResult != null) {
            boolean hasJaxb = analysisResult.getUseCases().stream().anyMatch(UseCaseInfo::hasXmlSupport);
            model.addAttribute("hasJaxbDtos", hasJaxb);
        }

        return "configuration";
    }

    @PostMapping("/save-config")
    public String saveConfig(RedirectAttributes redirectAttributes, HttpSession session,
                             @RequestParam Map<String, String> params) {
        session.setAttribute("generationConfig", params);
        redirectAttributes.addFlashAttribute("success", "Configuration sauvegardee avec succes.");
        return "redirect:/configuration";
    }

    // ============================================================
    // 5. Generation / Transformation
    // ============================================================
    @GetMapping("/generation")
    public String generationPage(Model model, HttpSession session) {
        populateCommon(model, session);
        return "generation";
    }

    @PostMapping("/generate")
    public String generateProject(RedirectAttributes redirectAttributes, HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");
        ProjectAnalysisResult analysisResult = (ProjectAnalysisResult) session.getAttribute("analysisResult");

        if (projectId == null || analysisResult == null) {
            redirectAttributes.addFlashAttribute("error",
                    "Veuillez d'abord uploader et scanner un projet.");
            return "redirect:/generation";
        }

        if (analysisResult.getUseCases().isEmpty()) {
            redirectAttributes.addFlashAttribute("error",
                    "Aucun UseCase a generer. Veuillez scanner le projet d'abord.");
            return "redirect:/generation";
        }

        try {
            log.info("Generation du projet API pour : {}", projectId);
            generatorService.generateProject(projectId, analysisResult);

            EnhancementReport report = generatorService.enhanceProject(projectId, analysisResult);
            session.setAttribute("enhancementReport", report);

            redirectAttributes.addFlashAttribute("success",
                    "Projet API REST genere et ameliore par l'IA ! Score qualite : " +
                    report.getQualityScore() + "/100, " +
                    report.getTotalRulesApplied() + "/" + report.getTotalRulesChecked() +
                    " regles appliquees.");
        } catch (Exception e) {
            log.error("Erreur lors de la generation", e);
            redirectAttributes.addFlashAttribute("error",
                    "Erreur lors de la generation : " + e.getMessage());
        }

        return "redirect:/generation";
    }

    /**
     * API JSON pour la generation via AJAX.
     * Retourne le resultat en JSON pour permettre au JS de synchroniser
     * l'animation de progression avec la reponse serveur.
     */
    @PostMapping("/api/generate")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> generateProjectApi(HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");
        ProjectAnalysisResult analysisResult = (ProjectAnalysisResult) session.getAttribute("analysisResult");

        Map<String, Object> response = new HashMap<>();

        if (projectId == null || analysisResult == null) {
            response.put("success", false);
            response.put("error", "Veuillez d'abord uploader et scanner un projet.");
            return ResponseEntity.badRequest().body(response);
        }

        if (analysisResult.getUseCases().isEmpty()) {
            response.put("success", false);
            response.put("error", "Aucun UseCase a generer.");
            return ResponseEntity.badRequest().body(response);
        }

        try {
            log.info("[API] Generation du projet API pour : {}", projectId);
            generatorService.generateProject(projectId, analysisResult);

            EnhancementReport report = generatorService.enhanceProject(projectId, analysisResult);
            session.setAttribute("enhancementReport", report);

            response.put("success", true);
            response.put("qualityScore", report.getQualityScore());
            response.put("totalRulesApplied", report.getTotalRulesApplied());
            response.put("totalRulesChecked", report.getTotalRulesChecked());
            response.put("message", "Projet API REST genere et ameliore par l'IA ! Score qualite : " +
                    report.getQualityScore() + "/100");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("[API] Erreur lors de la generation", e);
            response.put("success", false);
            response.put("error", "Erreur lors de la generation : " + e.getMessage());
            return ResponseEntity.internalServerError().body(response);
        }
    }

    // ============================================================
    // 6. Results
    // ============================================================
    @GetMapping("/results")
    public String resultsPage(Model model, HttpSession session) {
        populateCommon(model, session);
        String projectId = (String) session.getAttribute("projectId");

        if (projectId != null && generatorService.generatedProjectExists(projectId)) {
            try {
                List<String> generatedFiles = generatorService.getGeneratedFileTree(projectId);
                model.addAttribute("generatedFiles", generatedFiles);

                long testCount = generatedFiles.stream()
                        .filter(f -> f.contains("src/test/") && f.endsWith(".java"))
                        .count();
                model.addAttribute("testCount", testCount);
            } catch (Exception e) {
                log.warn("Impossible de lire les fichiers generes : {}", e.getMessage());
            }
        }

        return "results";
    }

    // API: Get file content for preview
    @GetMapping("/api/file-content")
    @ResponseBody
    public ResponseEntity<String> getFileContent(@RequestParam String path, HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");
        if (projectId == null) {
            return ResponseEntity.badRequest().body("Aucun projet charge");
        }

        try {
            String content = generatorService.getGeneratedFileContent(projectId, path);
            return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(content);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Erreur : " + e.getMessage());
        }
    }

    // API: Get diff (original EJB vs generated REST)
    @GetMapping("/api/diff")
    @ResponseBody
    public ResponseEntity<Map<String, String>> getDiff(@RequestParam String useCase, HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");
        if (projectId == null) {
            return ResponseEntity.badRequest().build();
        }

        try {
            Map<String, String> diff = generatorService.getUseCaseDiff(projectId, useCase);
            return ResponseEntity.ok(diff);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ============================================================
    // 7. Report
    // ============================================================
    @GetMapping("/report")
    public String reportPage(Model model, HttpSession session) {
        populateCommon(model, session);

        EnhancementReport report = (EnhancementReport) session.getAttribute("enhancementReport");
        if (report != null) {
            model.addAttribute("criticalCount", report.countBySeverity(EnhancementReport.Severity.CRITICAL));
            model.addAttribute("warningCount", report.countBySeverity(EnhancementReport.Severity.WARNING));
            model.addAttribute("suggestionCount", report.countBySeverity(EnhancementReport.Severity.SUGGESTION));

            // Build category info list
            List<Map<String, Object>> categories = new ArrayList<>();
            for (EnhancementReport.Category cat : EnhancementReport.Category.values()) {
                long count = report.countByCategory(cat);
                Map<String, Object> catInfo = new HashMap<>();
                catInfo.put("key", cat.name());
                catInfo.put("label", cat.getLabel());
                catInfo.put("count", count);
                categories.add(catInfo);
            }
            model.addAttribute("categories", categories);
        }

        return "report";
    }

    // ============================================================
    // 8. Export / Download
    // ============================================================
    @GetMapping("/export")
    public String exportPage(Model model, HttpSession session) {
        populateCommon(model, session);
        String projectId = (String) session.getAttribute("projectId");

        if (projectId != null && generatorService.generatedProjectExists(projectId)) {
            try {
                List<String> generatedFiles = generatorService.getGeneratedFileTree(projectId);
                model.addAttribute("generatedFiles", generatedFiles);
            } catch (Exception e) {
                log.warn("Impossible de lire les fichiers generes : {}", e.getMessage());
            }
        }

        return "export";
    }

    @GetMapping("/download")
    public ResponseEntity<Resource> downloadProject(HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");

        if (projectId == null || !generatorService.generatedProjectExists(projectId)) {
            return ResponseEntity.notFound().build();
        }

        try {
            Path zipPath = generatorService.createDownloadZip(projectId);
            Resource resource = new FileSystemResource(zipPath.toFile());

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"generated-api.zip\"")
                    .body(resource);
        } catch (Exception e) {
            log.error("Erreur lors du telechargement", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    // ============================================================
    // Logs
    // ============================================================
    @GetMapping("/logs")
    public String logsPage(Model model, HttpSession session) {
        populateCommon(model, session);
        return "logs";
    }

    // ============================================================
    // Reset
    // ============================================================
    @PostMapping("/reset")
    public String resetSession(HttpSession session, RedirectAttributes redirectAttributes) {
        session.invalidate();
        redirectAttributes.addFlashAttribute("success", "Session reinitialisee.");
        return "redirect:/dashboard";
    }
}
