package com.bank.tools.generator.model;

import java.util.Objects;

/**
 * Modèle représentant un UseCase EJB détecté lors de l'analyse statique.
 * <p>
 * Contient toutes les informations nécessaires à la génération
 * du controller REST et du service adapter correspondants.
 * Supporte la détection du format de sérialisation (JSON, XML ou les deux).
 * </p>
 */
public class UseCaseInfo {

    /**
     * Enumération des formats de sérialisation détectés.
     */
    public enum SerializationFormat {
        JSON("JSON"),
        XML("XML"),
        BOTH("JSON + XML");

        private final String label;

        SerializationFormat(String label) {
            this.label = label;
        }

        public String getLabel() {
            return label;
        }
    }

    /** Nom complet de la classe UseCase (ex: ClientDataUC) */
    private String className;

    /** Package de la classe UseCase */
    private String packageName;

    /** Nom complet qualifié (ex: com.bank.ejb.usecase.ClientDataUC) */
    private String fullyQualifiedName;

    /** Nom de la classe DTO d'entrée (ex: ClientDataVoIn) */
    private String inputDtoClassName;

    /** Nom de la classe DTO de sortie (ex: ClientDataVoOut) */
    private String outputDtoClassName;

    /** Package du DTO d'entrée */
    private String inputDtoPackage;

    /** Package du DTO de sortie */
    private String outputDtoPackage;

    /** Nom de l'interface métier implémentée (ex: BaseUseCase) */
    private String implementedInterface;

    /** Nom du endpoint REST généré (ex: /api/client-data) */
    private String restEndpoint;

    /** Nom du controller REST généré (ex: ClientDataController) */
    private String controllerName;

    /** Nom du service adapter généré (ex: ClientDataServiceAdapter) */
    private String serviceAdapterName;

    /** Nom JNDI pour le lookup EJB */
    private String jndiName;

    /** Indique si la classe est annotée @Stateless */
    private boolean stateless;

    /** Indique si la classe possède une méthode execute */
    private boolean hasExecuteMethod;

    /** Format de sérialisation détecté pour les DTO (JSON, XML ou les deux) */
    private SerializationFormat serializationFormat = SerializationFormat.JSON;

    /** Indique si le DTO d'entrée utilise des annotations JAXB */
    private boolean inputDtoHasJaxb;

    /** Indique si le DTO de sortie utilise des annotations JAXB */
    private boolean outputDtoHasJaxb;

    /** Indique si le DTO d'entrée possède des champs required (pour @Valid) */
    private boolean inputDtoHasRequiredFields;

    public UseCaseInfo() {
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

    public String getInputDtoClassName() {
        return inputDtoClassName;
    }

    public void setInputDtoClassName(String inputDtoClassName) {
        this.inputDtoClassName = inputDtoClassName;
    }

    public String getOutputDtoClassName() {
        return outputDtoClassName;
    }

    public void setOutputDtoClassName(String outputDtoClassName) {
        this.outputDtoClassName = outputDtoClassName;
    }

    public String getInputDtoPackage() {
        return inputDtoPackage;
    }

    public void setInputDtoPackage(String inputDtoPackage) {
        this.inputDtoPackage = inputDtoPackage;
    }

    public String getOutputDtoPackage() {
        return outputDtoPackage;
    }

    public void setOutputDtoPackage(String outputDtoPackage) {
        this.outputDtoPackage = outputDtoPackage;
    }

    public String getImplementedInterface() {
        return implementedInterface;
    }

    public void setImplementedInterface(String implementedInterface) {
        this.implementedInterface = implementedInterface;
    }

    public String getRestEndpoint() {
        return restEndpoint;
    }

    public void setRestEndpoint(String restEndpoint) {
        this.restEndpoint = restEndpoint;
    }

    public String getControllerName() {
        return controllerName;
    }

    public void setControllerName(String controllerName) {
        this.controllerName = controllerName;
    }

    public String getServiceAdapterName() {
        return serviceAdapterName;
    }

    public void setServiceAdapterName(String serviceAdapterName) {
        this.serviceAdapterName = serviceAdapterName;
    }

    public String getJndiName() {
        return jndiName;
    }

    public void setJndiName(String jndiName) {
        this.jndiName = jndiName;
    }

    public boolean isStateless() {
        return stateless;
    }

    public void setStateless(boolean stateless) {
        this.stateless = stateless;
    }

    public boolean isHasExecuteMethod() {
        return hasExecuteMethod;
    }

    public void setHasExecuteMethod(boolean hasExecuteMethod) {
        this.hasExecuteMethod = hasExecuteMethod;
    }

    public SerializationFormat getSerializationFormat() {
        return serializationFormat;
    }

    public void setSerializationFormat(SerializationFormat serializationFormat) {
        this.serializationFormat = serializationFormat;
    }

    public boolean isInputDtoHasJaxb() {
        return inputDtoHasJaxb;
    }

    public void setInputDtoHasJaxb(boolean inputDtoHasJaxb) {
        this.inputDtoHasJaxb = inputDtoHasJaxb;
    }

    public boolean isOutputDtoHasJaxb() {
        return outputDtoHasJaxb;
    }

    public void setOutputDtoHasJaxb(boolean outputDtoHasJaxb) {
        this.outputDtoHasJaxb = outputDtoHasJaxb;
    }

    public boolean isInputDtoHasRequiredFields() {
        return inputDtoHasRequiredFields;
    }

    public void setInputDtoHasRequiredFields(boolean inputDtoHasRequiredFields) {
        this.inputDtoHasRequiredFields = inputDtoHasRequiredFields;
    }

    /**
     * Indique si au moins un DTO utilise JAXB (XML).
     */
    public boolean hasXmlSupport() {
        return inputDtoHasJaxb || outputDtoHasJaxb ||
               serializationFormat == SerializationFormat.XML ||
               serializationFormat == SerializationFormat.BOTH;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        UseCaseInfo that = (UseCaseInfo) o;
        return Objects.equals(fullyQualifiedName, that.fullyQualifiedName);
    }

    @Override
    public int hashCode() {
        return Objects.hash(fullyQualifiedName);
    }

    @Override
    public String toString() {
        return "UseCaseInfo{" +
                "className='" + className + '\'' +
                ", inputDto='" + inputDtoClassName + '\'' +
                ", outputDto='" + outputDtoClassName + '\'' +
                ", endpoint='" + restEndpoint + '\'' +
                ", format=" + serializationFormat +
                '}';
    }
}
