package com.bank.tools.generator.model;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Modèle représentant un DTO (Value Object) détecté dans le projet EJB.
 * <p>
 * Les DTO sont utilisés comme objets d'échange JSON et/ou XML dans l'API REST générée.
 * La détection des annotations JAXB permet de générer le support XML automatiquement.
 * </p>
 */
public class DtoInfo {

    /** Nom de la classe DTO (ex: ClientDataVoIn) */
    private String className;

    /** Package de la classe DTO */
    private String packageName;

    /** Nom complet qualifié */
    private String fullyQualifiedName;

    /** Liste des champs du DTO */
    private List<FieldInfo> fields = new ArrayList<>();

    /** Classe parente si héritage */
    private String parentClassName;

    /** Code source original */
    private String sourceCode;

    /** Indique si la classe porte l'annotation @XmlRootElement */
    private boolean hasXmlRootElement;

    /** Indique si la classe porte l'annotation @XmlType */
    private boolean hasXmlType;

    /** Indique si la classe porte l'annotation @XmlAccessorType */
    private boolean hasXmlAccessorType;

    /** Valeur de l'attribut name de @XmlRootElement si présent */
    private String xmlRootElementName;

    /** Valeur de @XmlAccessorType si présent (ex: FIELD, PROPERTY) */
    private String xmlAccessorTypeValue;

    /** Liste des annotations JAXB détectées sur la classe */
    private List<String> jaxbAnnotations = new ArrayList<>();

    public DtoInfo() {
    }

    public String getClassName() {
        return className;
    }

    public void setClassName(String className) {
        this.className = className;
    }

    public String getPackageName() {
        return packageName;
    }

    public void setPackageName(String packageName) {
        this.packageName = packageName;
    }

    public String getFullyQualifiedName() {
        return fullyQualifiedName;
    }

    public void setFullyQualifiedName(String fullyQualifiedName) {
        this.fullyQualifiedName = fullyQualifiedName;
    }

    public List<FieldInfo> getFields() {
        return fields;
    }

    public void setFields(List<FieldInfo> fields) {
        this.fields = fields;
    }

    public String getParentClassName() {
        return parentClassName;
    }

    public void setParentClassName(String parentClassName) {
        this.parentClassName = parentClassName;
    }

    public String getSourceCode() {
        return sourceCode;
    }

    public void setSourceCode(String sourceCode) {
        this.sourceCode = sourceCode;
    }

    public boolean isHasXmlRootElement() {
        return hasXmlRootElement;
    }

    public void setHasXmlRootElement(boolean hasXmlRootElement) {
        this.hasXmlRootElement = hasXmlRootElement;
    }

    public boolean isHasXmlType() {
        return hasXmlType;
    }

    public void setHasXmlType(boolean hasXmlType) {
        this.hasXmlType = hasXmlType;
    }

    public boolean isHasXmlAccessorType() {
        return hasXmlAccessorType;
    }

    public void setHasXmlAccessorType(boolean hasXmlAccessorType) {
        this.hasXmlAccessorType = hasXmlAccessorType;
    }

    public String getXmlRootElementName() {
        return xmlRootElementName;
    }

    public void setXmlRootElementName(String xmlRootElementName) {
        this.xmlRootElementName = xmlRootElementName;
    }

    public String getXmlAccessorTypeValue() {
        return xmlAccessorTypeValue;
    }

    public void setXmlAccessorTypeValue(String xmlAccessorTypeValue) {
        this.xmlAccessorTypeValue = xmlAccessorTypeValue;
    }

    public List<String> getJaxbAnnotations() {
        return jaxbAnnotations;
    }

    public void setJaxbAnnotations(List<String> jaxbAnnotations) {
        this.jaxbAnnotations = jaxbAnnotations;
    }

    /**
     * Indique si ce DTO utilise des annotations JAXB (XML).
     */
    public boolean hasJaxbAnnotations() {
        return hasXmlRootElement || hasXmlType || hasXmlAccessorType || !jaxbAnnotations.isEmpty();
    }

    /**
     * Retourne le label du format de sérialisation détecté.
     */
    public String getSerializationLabel() {
        return hasJaxbAnnotations() ? "XML (JAXB)" : "JSON";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        DtoInfo dtoInfo = (DtoInfo) o;
        return Objects.equals(fullyQualifiedName, dtoInfo.fullyQualifiedName);
    }

    @Override
    public int hashCode() {
        return Objects.hash(fullyQualifiedName);
    }

    @Override
    public String toString() {
        return "DtoInfo{" +
                "className='" + className + '\'' +
                ", fields=" + fields.size() +
                ", jaxb=" + hasJaxbAnnotations() +
                '}';
    }

    /**
     * Représente un champ d'un DTO.
     */
    public static class FieldInfo {

        private String name;
        private String type;
        private String accessModifier;

        /** Indique si le champ est static */
        private boolean isStatic;

        /** Indique si le champ est final */
        private boolean isFinal;

        /** Indique si le champ porte @XmlElement */
        private boolean hasXmlElement;

        /** Indique si le champ porte @XmlAttribute */
        private boolean hasXmlAttribute;

        /** Indique si le champ porte @XmlTransient */
        private boolean hasXmlTransient;

        /** Indique si le champ porte @XmlElementWrapper */
        private boolean hasXmlElementWrapper;

        /** Nom du wrapper XML si défini via @XmlElementWrapper(name=...) */
        private String xmlElementWrapperName;

        /** Nom XML personnalisé si défini via @XmlElement(name=...) */
        private String xmlName;

        /** Indique si le champ est requis (@XmlElement(required=true) ou vérifié dans execute()) */
        private boolean required;

        public FieldInfo() {
        }

        public FieldInfo(String name, String type, String accessModifier) {
            this.name = name;
            this.type = type;
            this.accessModifier = accessModifier;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getAccessModifier() {
            return accessModifier;
        }

        public void setAccessModifier(String accessModifier) {
            this.accessModifier = accessModifier;
        }

        public boolean isStatic() {
            return isStatic;
        }

        public void setStatic(boolean isStatic) {
            this.isStatic = isStatic;
        }

        public boolean isFinal() {
            return isFinal;
        }

        public void setFinal(boolean isFinal) {
            this.isFinal = isFinal;
        }

        public boolean isHasXmlElement() {
            return hasXmlElement;
        }

        public void setHasXmlElement(boolean hasXmlElement) {
            this.hasXmlElement = hasXmlElement;
        }

        public boolean isHasXmlAttribute() {
            return hasXmlAttribute;
        }

        public void setHasXmlAttribute(boolean hasXmlAttribute) {
            this.hasXmlAttribute = hasXmlAttribute;
        }

        public boolean isHasXmlTransient() {
            return hasXmlTransient;
        }

        public void setHasXmlTransient(boolean hasXmlTransient) {
            this.hasXmlTransient = hasXmlTransient;
        }

        public boolean isHasXmlElementWrapper() {
            return hasXmlElementWrapper;
        }

        public void setHasXmlElementWrapper(boolean hasXmlElementWrapper) {
            this.hasXmlElementWrapper = hasXmlElementWrapper;
        }

        public String getXmlElementWrapperName() {
            return xmlElementWrapperName;
        }

        public void setXmlElementWrapperName(String xmlElementWrapperName) {
            this.xmlElementWrapperName = xmlElementWrapperName;
        }

        public String getXmlName() {
            return xmlName;
        }

        public void setXmlName(String xmlName) {
            this.xmlName = xmlName;
        }

        public boolean isRequired() {
            return required;
        }

        public void setRequired(boolean required) {
            this.required = required;
        }

        public boolean hasJaxbAnnotation() {
            return hasXmlElement || hasXmlAttribute || hasXmlElementWrapper || hasXmlTransient;
        }

        /**
         * Indique si ce champ est un champ de sérialisation (serialVersionUID).
         * Ces champs doivent être exclus de la génération de champs d'instance.
         */
        public boolean isSerializationField() {
            return "serialVersionUID".equals(name) && isStatic && isFinal;
        }

        @Override
        public String toString() {
            return type + " " + name + (hasJaxbAnnotation() ? " [JAXB]" : "");
        }
    }
}
