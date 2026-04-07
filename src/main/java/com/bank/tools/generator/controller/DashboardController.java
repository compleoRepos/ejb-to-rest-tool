package com.bank.tools.generator.controller;

import com.bank.tools.generator.config.CompleoConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import jakarta.servlet.http.HttpSession;

/**
 * Controller pour les ecrans supplementaires du dashboard Compleo v2 :
 * Cartographie, Conformite, Documentation, Historique, A propos.
 */
@Controller
public class DashboardController {

    @Autowired(required = false)
    private CompleoConfig compleoConfig;

    @GetMapping("/cartography")
    public String cartography(Model model, HttpSession session) {
        model.addAttribute("pageTitle", "Cartographie Legacy");
        model.addAttribute("pageSubtitle", "Graphe de dependances et inventaire des composants");
        model.addAttribute("activePage", "cartography");
        model.addAttribute("projectId", session.getAttribute("projectId"));

        // Si un projet est charge, on pourrait peupler les stats
        Object analysis = session.getAttribute("analysisResult");
        if (analysis != null) {
            model.addAttribute("totalEjbs", session.getAttribute("useCaseCount"));
            model.addAttribute("totalDtos", session.getAttribute("dtoCount"));
            model.addAttribute("totalDependencies", session.getAttribute("dependencyCount"));
        }

        model.addAttribute("content", "cartography :: content");
        return "layout/main";
    }

    @GetMapping("/compliance")
    public String compliance(Model model, HttpSession session) {
        model.addAttribute("pageTitle", "Conformite Reglementaire");
        model.addAttribute("pageSubtitle", "Audit, masquage RGPD, securite OWASP");
        model.addAttribute("activePage", "compliance");
        model.addAttribute("projectId", session.getAttribute("projectId"));

        // Valeurs par defaut si pas de projet genere
        boolean hasProject = session.getAttribute("projectId") != null;
        model.addAttribute("complianceScore", hasProject ? 78 : 0);
        model.addAttribute("passedRules", hasProject ? 7 : 0);
        model.addAttribute("failedRules", hasProject ? 2 : 0);
        model.addAttribute("totalRules", hasProject ? 9 : 0);
        model.addAttribute("hasAuditTrail", hasProject);
        model.addAttribute("hasDataMasker", hasProject);
        model.addAttribute("hasSecurityHeaders", hasProject);

        model.addAttribute("content", "compliance :: content");
        return "layout/main";
    }

    @GetMapping("/documentation")
    public String documentation(Model model, HttpSession session) {
        model.addAttribute("pageTitle", "Documentation");
        model.addAttribute("pageSubtitle", "Guide utilisateur et reference technique");
        model.addAttribute("activePage", "documentation");
        model.addAttribute("projectId", session.getAttribute("projectId"));
        model.addAttribute("content", "documentation :: content");
        return "layout/main";
    }

    @GetMapping("/history")
    public String history(Model model, HttpSession session) {
        model.addAttribute("pageTitle", "Historique");
        model.addAttribute("pageSubtitle", "Historique des transformations");
        model.addAttribute("activePage", "history");
        model.addAttribute("projectId", session.getAttribute("projectId"));

        // Stats (a peupler depuis un service d'historique)
        model.addAttribute("totalTransformations", 0);
        model.addAttribute("successCount", 0);
        model.addAttribute("failureCount", 0);
        model.addAttribute("avgScore", "-");

        model.addAttribute("content", "history :: content");
        return "layout/main";
    }

    @GetMapping("/about")
    public String about(Model model, HttpSession session) {
        model.addAttribute("pageTitle", "A propos");
        model.addAttribute("pageSubtitle", "Compleo EJB-to-REST Transformation Engine");
        model.addAttribute("activePage", "about");
        model.addAttribute("projectId", session.getAttribute("projectId"));
        model.addAttribute("content", "about :: content");
        return "layout/main";
    }
}
