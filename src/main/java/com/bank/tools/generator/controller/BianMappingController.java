package com.bank.tools.generator.controller;

import com.bank.tools.generator.bian.*;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import com.bank.tools.generator.service.GeneratorService;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Controller pour l'ecran de mapping BIAN interactif.
 * Permet a l'utilisateur de visualiser, editer et valider
 * le mapping UseCase -> Service Domain / BQ / Action avant la generation.
 */
@Controller
public class BianMappingController {

    private static final Logger log = LoggerFactory.getLogger(BianMappingController.class);

    private final GeneratorService generatorService;

    public BianMappingController(GeneratorService generatorService) {
        this.generatorService = generatorService;
    }

    // ============================================================
    // Helper : populate common model attributes
    // ============================================================
    private void populateCommon(Model model, HttpSession session) {
        String projectId = (String) session.getAttribute("projectId");
        ProjectAnalysisResult analysisResult = (ProjectAnalysisResult) session.getAttribute("analysisResult");
        model.addAttribute("projectId", projectId);
        model.addAttribute("analysisResult", analysisResult);
        model.addAttribute("projectGenerated",
                projectId != null && generatorService.generatedProjectExists(projectId));
    }

    // ============================================================
    // GET /bian-mapping : afficher le tableau pre-rempli
    // ============================================================
    @GetMapping("/bian-mapping")
    public String bianMappingPage(Model model, HttpSession session) {
        populateCommon(model, session);

        ProjectAnalysisResult analysisResult = (ProjectAnalysisResult) session.getAttribute("analysisResult");
        if (analysisResult == null || analysisResult.getUseCases().isEmpty()) {
            model.addAttribute("error", "Veuillez d'abord analyser un projet.");
            return "bian-mapping";
        }

        // Verifier si un mapping valide existe deja en session
        @SuppressWarnings("unchecked")
        List<BianMappingEntry> validatedEntries = (List<BianMappingEntry>) session.getAttribute("bianMappingEntries");

        BianMappingForm form;
        if (validatedEntries != null && !validatedEntries.isEmpty()) {
            // Reutiliser le mapping deja valide
            form = new BianMappingForm(validatedEntries);
        } else {
            // Auto-detection initiale via BianAutoDetector
            form = buildAutoDetectedForm(analysisResult);
        }

        model.addAttribute("mappingForm", form);
        model.addAttribute("serviceDomains", BianMappingForm.getAvailableServiceDomains());
        model.addAttribute("actions", BianMappingForm.getAvailableActions());
        model.addAttribute("httpMethods", BianMappingForm.getAvailableHttpMethods());

        return "bian-mapping";
    }

    // ============================================================
    // POST /bian-mapping/validate : valider le mapping edite
    // ============================================================
    @PostMapping("/bian-mapping/validate")
    public String validateMapping(@ModelAttribute("mappingForm") BianMappingForm form,
                                  RedirectAttributes redirectAttributes,
                                  HttpSession session) {
        if (form == null || form.getEntries() == null || form.getEntries().isEmpty()) {
            redirectAttributes.addFlashAttribute("error", "Aucun mapping a valider.");
            return "redirect:/bian-mapping";
        }

        // Validation des entries
        List<String> errors = validateEntries(form.getEntries());
        if (!errors.isEmpty()) {
            redirectAttributes.addFlashAttribute("error",
                    "Erreurs de validation : " + String.join(", ", errors));
            return "redirect:/bian-mapping";
        }

        // Sauvegarder le mapping valide en session
        session.setAttribute("bianMappingEntries", form.getEntries());
        session.setAttribute("bianMappingValidated", true);

        // Appliquer le mapping aux UseCases dans l'analysisResult
        ProjectAnalysisResult analysisResult = (ProjectAnalysisResult) session.getAttribute("analysisResult");
        if (analysisResult != null) {
            applyMappingToUseCases(analysisResult, form.getEntries());
            session.setAttribute("analysisResult", analysisResult);
        }

        log.info("Mapping BIAN valide avec {} entries", form.getEntries().size());
        redirectAttributes.addFlashAttribute("success",
                "Mapping BIAN valide avec succes (" + form.getEntries().size() + " use cases). " +
                "Vous pouvez maintenant lancer la generation.");

        return "redirect:/generation";
    }

    // ============================================================
    // POST /bian-mapping/reset : reinitialiser le mapping
    // ============================================================
    @PostMapping("/bian-mapping/reset")
    public String resetMapping(RedirectAttributes redirectAttributes, HttpSession session) {
        session.removeAttribute("bianMappingEntries");
        session.removeAttribute("bianMappingValidated");
        redirectAttributes.addFlashAttribute("success", "Mapping reinitialise. Auto-detection relancee.");
        return "redirect:/bian-mapping";
    }

    // ============================================================
    // API JSON : auto-detect pour un UseCase specifique
    // ============================================================
    @PostMapping(value = "/api/bian-mapping/auto-detect", produces = "application/json")
    @ResponseBody
    public ResponseEntity<Map<String, String>> autoDetectSingle(
            @RequestParam("useCaseName") String useCaseName,
            HttpSession session) {

        ProjectAnalysisResult analysisResult = (ProjectAnalysisResult) session.getAttribute("analysisResult");
        if (analysisResult == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Aucun projet analyse."));
        }

        Optional<UseCaseInfo> uc = analysisResult.getUseCases().stream()
                .filter(u -> u.getClassName().equals(useCaseName))
                .findFirst();

        if (uc.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "UseCase non trouve : " + useCaseName));
        }

        BianAutoDetector detector = new BianAutoDetector();
        BianMapping mapping = detector.autoDetect(uc.get());

        Map<String, String> result = new HashMap<>();
        result.put("serviceDomain", mapping.getServiceDomain());
        result.put("behaviorQualifier", mapping.getBehaviorQualifier());
        result.put("action", mapping.getAction());
        result.put("httpMethod", mapping.getHttpMethod());
        result.put("generatedUrl", mapping.getUrl());
        result.put("controllerName", mapping.getControllerName());

        return ResponseEntity.ok(result);
    }

    // ============================================================
    // API JSON : export du mapping en YAML
    // ============================================================
    @GetMapping(value = "/api/bian-mapping/export-yaml", produces = "text/yaml")
    @ResponseBody
    public ResponseEntity<String> exportYaml(HttpSession session) {
        @SuppressWarnings("unchecked")
        List<BianMappingEntry> entries = (List<BianMappingEntry>) session.getAttribute("bianMappingEntries");

        if (entries == null || entries.isEmpty()) {
            return ResponseEntity.badRequest().body("# Aucun mapping valide en session");
        }

        StringBuilder yaml = new StringBuilder();
        yaml.append("# BIAN Mapping - Generated by Compleo\n");
        yaml.append("# Date: ").append(java.time.LocalDate.now()).append("\n\n");
        yaml.append("mappings:\n");

        for (BianMappingEntry entry : entries) {
            yaml.append("  - useCase: ").append(entry.getUseCaseName()).append("\n");
            yaml.append("    serviceDomain: ").append(entry.getServiceDomain()).append("\n");
            yaml.append("    behaviorQualifier: ").append(entry.getBehaviorQualifier()).append("\n");
            yaml.append("    action: ").append(entry.getAction()).append("\n");
            yaml.append("    httpMethod: ").append(entry.getHttpMethod()).append("\n");
            yaml.append("    endpoint: ").append(entry.getGeneratedUrl()).append("\n");
            yaml.append("    controllerName: ").append(entry.getControllerName()).append("\n");
            if (entry.isExcluded()) {
                yaml.append("    excluded: true\n");
            }
            yaml.append("\n");
        }

        return ResponseEntity.ok(yaml.toString());
    }

    // ============================================================
    // Private helpers
    // ============================================================

    /**
     * Construit le formulaire de mapping a partir de l'auto-detection.
     */
    private BianMappingForm buildAutoDetectedForm(ProjectAnalysisResult analysisResult) {
        BianAutoDetector detector = new BianAutoDetector();
        List<BianMappingEntry> entries = new ArrayList<>();

        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            BianMapping mapping = detector.autoDetect(uc);

            BianMappingEntry entry = BianMappingEntry.fromBianMapping(mapping);
            entry.setEjbClassName(uc.getClassName());
            entry.setPackageName(uc.getPackageName());
            entry.setInputDto(uc.getInputDtoClassName());
            entry.setOutputDto(uc.getOutputDtoClassName());
            entry.setExcluded(false);

            entries.add(entry);
        }

        return new BianMappingForm(entries);
    }

    /**
     * Valide les entries du formulaire.
     */
    private List<String> validateEntries(List<BianMappingEntry> entries) {
        List<String> errors = new ArrayList<>();

        // Verifier les doublons d'endpoints
        Map<String, Long> endpointCounts = entries.stream()
                .filter(e -> !e.isExcluded())
                .collect(Collectors.groupingBy(
                        e -> e.getHttpMethod() + " " + e.getGeneratedUrl(),
                        Collectors.counting()));

        endpointCounts.entrySet().stream()
                .filter(e -> e.getValue() > 1)
                .forEach(e -> errors.add("Endpoint en doublon : " + e.getKey()));

        // Verifier les champs obligatoires
        for (BianMappingEntry entry : entries) {
            if (entry.isExcluded()) continue;

            if (entry.getServiceDomain() == null || entry.getServiceDomain().isBlank()) {
                errors.add("Service Domain manquant pour " + entry.getUseCaseName());
            }
            if (entry.getBehaviorQualifier() == null || entry.getBehaviorQualifier().isBlank()) {
                errors.add("Behavior Qualifier manquant pour " + entry.getUseCaseName());
            }
            if (entry.getAction() == null || entry.getAction().isBlank()) {
                errors.add("Action manquante pour " + entry.getUseCaseName());
            }
        }

        return errors;
    }

    /**
     * Applique le mapping valide aux UseCases de l'analysisResult.
     * Convertit chaque BianMappingEntry en BianMapping et l'associe au UseCase.
     */
    private void applyMappingToUseCases(ProjectAnalysisResult analysisResult, List<BianMappingEntry> entries) {
        Map<String, BianMappingEntry> entryMap = entries.stream()
                .collect(Collectors.toMap(BianMappingEntry::getUseCaseName, e -> e, (a, b) -> a));

        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            BianMappingEntry entry = entryMap.get(uc.getClassName());
            if (entry != null && !entry.isExcluded()) {
                uc.setBianMapping(entry.toBianMapping());
            }
        }
    }
}
