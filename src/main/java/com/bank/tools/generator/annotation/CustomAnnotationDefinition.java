package com.bank.tools.generator.annotation;

import java.util.ArrayList;
import java.util.List;

/**
 * Definition d'une annotation custom bancaire telle que declaree
 * dans le fichier custom-annotations.yml.
 */
public class CustomAnnotationDefinition {

    // ==================== ENUMS ====================

    /** Categorie fonctionnelle de l'annotation */
    public enum Category {
        SECURITY, AUDIT, TRANSACTION, CHANNEL, RISK,
        COMPLIANCE, CACHING, MONITORING, BUSINESS, CUSTOM
    }

    /** Strategie de propagation vers le code genere */
    public enum PropagationStrategy {
        PROPAGATE_CLASS,    // Propager sur la classe controller/service
        PROPAGATE_METHOD,   // Propager sur chaque methode
        PROPAGATE_BOTH,     // Propager sur classe ET methodes
        TRANSFORM,          // Transformer en equivalent Spring
        COMMENT,            // Ajouter en commentaire
        IGNORE              // Ignorer completement
    }

    // ==================== FIELDS ====================

    private String name;
    private Category category;
    private String description;
    private PropagationStrategy propagation;
    private String springEquivalent;
    private String example;
    private List<AttributeDefinition> attributes = new ArrayList<>();

    // ==================== INNER CLASS ====================

    /**
     * Definition d'un attribut d'annotation custom.
     */
    public static class AttributeDefinition {
        private String name;
        private String type;
        private String description;
        private String defaultValue;

        public AttributeDefinition() {}

        public AttributeDefinition(String name, String type, String description, String defaultValue) {
            this.name = name;
            this.type = type;
            this.description = description;
            this.defaultValue = defaultValue;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }

        public String getDefaultValue() { return defaultValue; }
        public void setDefaultValue(String defaultValue) { this.defaultValue = defaultValue; }
    }

    // ==================== CONSTRUCTORS ====================

    public CustomAnnotationDefinition() {}

    // ==================== GETTERS/SETTERS ====================

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Category getCategory() { return category; }
    public void setCategory(Category category) { this.category = category; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public PropagationStrategy getPropagation() { return propagation; }
    public void setPropagation(PropagationStrategy propagation) { this.propagation = propagation; }

    public String getSpringEquivalent() { return springEquivalent; }
    public void setSpringEquivalent(String springEquivalent) { this.springEquivalent = springEquivalent; }

    public String getExample() { return example; }
    public void setExample(String example) { this.example = example; }

    public List<AttributeDefinition> getAttributes() { return attributes; }
    public void setAttributes(List<AttributeDefinition> attributes) { this.attributes = attributes; }

    // ==================== UTILITY ====================

    public boolean hasSpringEquivalent() {
        return springEquivalent != null && !springEquivalent.isBlank();
    }

    public boolean isTransformable() {
        return propagation == PropagationStrategy.TRANSFORM && hasSpringEquivalent();
    }

    @Override
    public String toString() {
        return "@" + name + " [" + category + ", " + propagation + "]";
    }
}
