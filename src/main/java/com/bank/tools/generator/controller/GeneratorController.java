package com.bank.tools.generator.controller;

import com.bank.tools.generator.model.ProjectAnalysisResult;
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

import java.nio.file.Path;

/**
 * Controller web pour l'interface utilisateur de l'outil de génération.
 * <p>
 * Gère les interactions de l'IHM Thymeleaf :
 * upload, scan, affichage des résultats, génération et téléchargement.
 * </p>
 */
@Controller
@RequestMapping("/")
public class GeneratorController {

    private static final Logger log = LoggerFactory.getLogger(GeneratorController.class);

    private final GeneratorService generatorService;

    public GeneratorController(GeneratorService generatorService) {
        this.generatorService = generatorService;
    }

    /**
     * Affiche la page d'accueil.
     */
    @GetMapping
    public String index(Model model, HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");
        ProjectAnalysisResult analysisResult = (ProjectAnalysisResult) session.getAttribute("analysisResult");

        model.addAttribute("projectId", projectId);
        model.addAttribute("analysisResult", analysisResult);
        model.addAttribute("projectUploaded", projectId != null);
        model.addAttribute("projectAnalyzed", analysisResult != null);
        model.addAttribute("projectGenerated",
                projectId != null && generatorService.generatedProjectExists(projectId));

        return "index";
    }

    /**
     * Upload d'un projet EJB (fichier ZIP).
     */
    @PostMapping("/upload")
    public String uploadProject(@RequestParam("file") MultipartFile file,
                                RedirectAttributes redirectAttributes,
                                HttpSession session) {
        log.info("Upload du projet EJB : {}", file.getOriginalFilename());

        if (file.isEmpty()) {
            redirectAttributes.addFlashAttribute("error", "Veuillez sélectionner un fichier ZIP.");
            return "redirect:/";
        }

        if (!file.getOriginalFilename().endsWith(".zip")) {
            redirectAttributes.addFlashAttribute("error", "Le fichier doit être au format ZIP.");
            return "redirect:/";
        }

        try {
            String projectId = generatorService.uploadProject(file);
            session.setAttribute("projectId", projectId);
            session.removeAttribute("analysisResult");
            redirectAttributes.addFlashAttribute("success",
                    "Projet uploadé avec succès : " + file.getOriginalFilename());
            log.info("Projet uploadé avec l'ID : {}", projectId);
        } catch (Exception e) {
            log.error("Erreur lors de l'upload", e);
            redirectAttributes.addFlashAttribute("error",
                    "Erreur lors de l'upload : " + e.getMessage());
        }

        return "redirect:/";
    }

    /**
     * Scan du projet EJB uploadé.
     */
    @PostMapping("/scan")
    public String scanProject(RedirectAttributes redirectAttributes, HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");

        if (projectId == null) {
            redirectAttributes.addFlashAttribute("error", "Aucun projet uploadé.");
            return "redirect:/";
        }

        try {
            log.info("Scan du projet : {}", projectId);
            ProjectAnalysisResult result = generatorService.analyzeProject(projectId);
            session.setAttribute("analysisResult", result);

            if (result.getUseCases().isEmpty()) {
                redirectAttributes.addFlashAttribute("warning",
                        "Aucun UseCase détecté. Vérifiez que le projet contient des classes annotées @Stateless ou implémentant BaseUseCase.");
            } else {
                redirectAttributes.addFlashAttribute("success",
                        result.getUseCases().size() + " UseCase(s) détecté(s), " +
                        result.getDtos().size() + " DTO(s) détecté(s).");
            }
        } catch (Exception e) {
            log.error("Erreur lors du scan", e);
            redirectAttributes.addFlashAttribute("error",
                    "Erreur lors de l'analyse : " + e.getMessage());
        }

        return "redirect:/";
    }

    /**
     * Génération du projet API REST.
     */
    @PostMapping("/generate")
    public String generateProject(RedirectAttributes redirectAttributes, HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");
        ProjectAnalysisResult analysisResult = (ProjectAnalysisResult) session.getAttribute("analysisResult");

        if (projectId == null || analysisResult == null) {
            redirectAttributes.addFlashAttribute("error",
                    "Veuillez d'abord uploader et scanner un projet.");
            return "redirect:/";
        }

        if (analysisResult.getUseCases().isEmpty()) {
            redirectAttributes.addFlashAttribute("error",
                    "Aucun UseCase à générer. Veuillez scanner le projet d'abord.");
            return "redirect:/";
        }

        try {
            log.info("Génération du projet API pour : {}", projectId);
            generatorService.generateProject(projectId, analysisResult);
            redirectAttributes.addFlashAttribute("success",
                    "Projet API REST généré avec succès !");
        } catch (Exception e) {
            log.error("Erreur lors de la génération", e);
            redirectAttributes.addFlashAttribute("error",
                    "Erreur lors de la génération : " + e.getMessage());
        }

        return "redirect:/";
    }

    /**
     * Téléchargement du projet API généré (ZIP).
     */
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
            log.error("Erreur lors du téléchargement", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Réinitialise la session.
     */
    @PostMapping("/reset")
    public String resetSession(HttpSession session, RedirectAttributes redirectAttributes) {
        session.invalidate();
        redirectAttributes.addFlashAttribute("success", "Session réinitialisée.");
        return "redirect:/";
    }
}
