package com.bank.tools.generator.ai;

import java.util.ArrayList;
import java.util.List;

/**
 * Rapport d'amélioration généré par le moteur IA interne (SmartCodeEnhancer).
 * <p>
 * Contient la liste de toutes les améliorations appliquées au projet généré,
 * organisées par catégorie, avec un score de qualité global.
 * </p>
 */
public class EnhancementReport {

    /**
     * Catégories de règles d'amélioration.
     */
    public enum Category {
        NAMING("Conventions de nommage"),
        HTTP_METHODS("Méthodes HTTP et codes de statut"),
        INPUT_VALIDATION("Validation des entrées"),
        ERROR_HANDLING("Gestion des erreurs"),
        SECURITY("Sécurité"),
        RESILIENCE("Résilience et fiabilité"),
        OBSERVABILITY("Observabilité et logging"),
        DOCUMENTATION("Documentation et spécification API"),
        CONTENT_NEGOTIATION("Négociation de contenu"),
        PROJECT_STRUCTURE("Structure du projet et configuration"),
        TESTING("Tests"),
        PERFORMANCE("Performance");

        private final String label;

        Category(String label) {
            this.label = label;
        }

        public String getLabel() {
            return label;
        }
    }

    /**
     * Sévérité d'une amélioration.
     */
    public enum Severity {
        INFO("Info"),
        SUGGESTION("Suggestion"),
        WARNING("Avertissement"),
        CRITICAL("Critique");

        private final String label;

        Severity(String label) {
            this.label = label;
        }

        public String getLabel() {
            return label;
        }
    }

    /**
     * Représente une amélioration individuelle appliquée.
     */
    public static class Enhancement {
        private String ruleId;
        private Category category;
        private Severity severity;
        private String description;
        private String filePath;
        private boolean applied;

        public Enhancement() {
        }

        public Enhancement(String ruleId, Category category, Severity severity,
                           String description, String filePath, boolean applied) {
            this.ruleId = ruleId;
            this.category = category;
            this.severity = severity;
            this.description = description;
            this.filePath = filePath;
            this.applied = applied;
        }

        public String getRuleId() { return ruleId; }
        public void setRuleId(String ruleId) { this.ruleId = ruleId; }
        public Category getCategory() { return category; }
        public void setCategory(Category category) { this.category = category; }
        public Severity getSeverity() { return severity; }
        public void setSeverity(Severity severity) { this.severity = severity; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public String getFilePath() { return filePath; }
        public void setFilePath(String filePath) { this.filePath = filePath; }
        public boolean isApplied() { return applied; }
        public void setApplied(boolean applied) { this.applied = applied; }
    }

    private List<Enhancement> enhancements = new ArrayList<>();
    private int totalRulesChecked;
    private int totalRulesApplied;
    private int qualityScore;

    public List<Enhancement> getEnhancements() { return enhancements; }
    public void setEnhancements(List<Enhancement> enhancements) { this.enhancements = enhancements; }
    public int getTotalRulesChecked() { return totalRulesChecked; }
    public void setTotalRulesChecked(int totalRulesChecked) { this.totalRulesChecked = totalRulesChecked; }
    public int getTotalRulesApplied() { return totalRulesApplied; }
    public void setTotalRulesApplied(int totalRulesApplied) { this.totalRulesApplied = totalRulesApplied; }
    public int getQualityScore() { return qualityScore; }
    public void setQualityScore(int qualityScore) { this.qualityScore = qualityScore; }

    public void addEnhancement(Enhancement enhancement) {
        this.enhancements.add(enhancement);
        if (enhancement.isApplied()) {
            this.totalRulesApplied++;
        }
        this.totalRulesChecked++;
    }

    public long countByCategory(Category category) {
        return enhancements.stream().filter(e -> e.getCategory() == category).count();
    }

    public long countApplied() {
        return enhancements.stream().filter(Enhancement::isApplied).count();
    }

    public long countBySeverity(Severity severity) {
        return enhancements.stream().filter(e -> e.getSeverity() == severity).count();
    }
}
