package com.bank.tools.generator.annotation;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Represente une annotation detectee dans le code source EJB,
 * avec ses attributs resolus et sa classification.
 */
public class DetectedAnnotation {

    /** Statut de reconnaissance de l'annotation */
    public enum RecognitionStatus {
        KNOWN,          // Annotation declaree dans le registre
        UNKNOWN_INTERNAL, // Annotation interne banque non declaree (package interne)
        UNKNOWN_EXTERNAL  // Annotation externe non standard
    }

    // ==================== FIELDS ====================

    private String name;
    private String fullExpression;
    private String sourceClassName;
    private String sourceMethodName;
    private boolean classLevel;
    private RecognitionStatus status;
    private CustomAnnotationDefinition definition;
    private Map<String, String> resolvedAttributes = new LinkedHashMap<>();

    // ==================== CONSTRUCTORS ====================

    public DetectedAnnotation() {}

    public DetectedAnnotation(String name, String fullExpression, String sourceClassName,
                              boolean classLevel, RecognitionStatus status) {
        this.name = name;
        this.fullExpression = fullExpression;
        this.sourceClassName = sourceClassName;
        this.classLevel = classLevel;
        this.status = status;
    }

    // ==================== GETTERS/SETTERS ====================

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getFullExpression() { return fullExpression; }
    public void setFullExpression(String fullExpression) { this.fullExpression = fullExpression; }

    public String getSourceClassName() { return sourceClassName; }
    public void setSourceClassName(String sourceClassName) { this.sourceClassName = sourceClassName; }

    public String getSourceMethodName() { return sourceMethodName; }
    public void setSourceMethodName(String sourceMethodName) { this.sourceMethodName = sourceMethodName; }

    public boolean isClassLevel() { return classLevel; }
    public void setClassLevel(boolean classLevel) { this.classLevel = classLevel; }

    public RecognitionStatus getStatus() { return status; }
    public void setStatus(RecognitionStatus status) { this.status = status; }

    public CustomAnnotationDefinition getDefinition() { return definition; }
    public void setDefinition(CustomAnnotationDefinition definition) { this.definition = definition; }

    public Map<String, String> getResolvedAttributes() { return resolvedAttributes; }
    public void setResolvedAttributes(Map<String, String> resolvedAttributes) { this.resolvedAttributes = resolvedAttributes; }

    // ==================== UTILITY ====================

    public boolean isKnown() {
        return status == RecognitionStatus.KNOWN;
    }

    public boolean isUnknown() {
        return status != RecognitionStatus.KNOWN;
    }

    public boolean isSecurityRelated() {
        return definition != null && (
            definition.getCategory() == CustomAnnotationDefinition.Category.SECURITY ||
            definition.getCategory() == CustomAnnotationDefinition.Category.COMPLIANCE
        );
    }

    /**
     * Genere le code Java de propagation selon la strategie definie.
     */
    public String toGeneratedCode() {
        if (definition == null) {
            return "// TODO [ANNOTATION INCONNUE] " + fullExpression + " - Verifier et propager manuellement";
        }

        switch (definition.getPropagation()) {
            case TRANSFORM:
                return generateTransformedAnnotation();
            case COMMENT:
                return "// [" + definition.getCategory() + "] " + fullExpression +
                       " - " + definition.getDescription();
            case IGNORE:
                return null;
            default:
                return fullExpression;
        }
    }

    private String generateTransformedAnnotation() {
        if (!definition.hasSpringEquivalent()) {
            return fullExpression;
        }
        String result = definition.getSpringEquivalent();
        for (Map.Entry<String, String> attr : resolvedAttributes.entrySet()) {
            result = result.replace("${" + attr.getKey() + "}", attr.getValue());
        }
        return result;
    }

    @Override
    public String toString() {
        return fullExpression + " [" + status + (definition != null ? ", " + definition.getCategory() : "") + "]";
    }
}
