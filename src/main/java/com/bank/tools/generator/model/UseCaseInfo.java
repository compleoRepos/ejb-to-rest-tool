package com.bank.tools.generator.model;

import com.bank.tools.generator.bian.BianMapping;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Modele representant un EJB detecte lors de l'analyse statique.
 * Supporte les patterns BaseUseCase, Remote/Local interface, et services generiques.
 * Contient les metadonnees pour G4 (types EJB), G5 (patterns), G6 (HTTP mapping),
 * G11 (Swagger), G12 (URL REST).
 */
public class UseCaseInfo {

    // ==================== ENUMS ====================

    public enum SerializationFormat {
        JSON("JSON"), XML("XML"), BOTH("JSON + XML");
        private final String label;
        SerializationFormat(String label) { this.label = label; }
        public String getLabel() { return label; }
    }

    /** G4: Type d'EJB detecte */
    public enum EjbType {
        STATELESS("@Stateless"),
        STATEFUL("@Stateful"),
        SINGLETON("@Singleton"),
        MESSAGE_DRIVEN("@MessageDriven"),
        USE_CASE_CUSTOM("@UseCase (BOA/EAI)"),  // Framework interne BOA — equivalent de @Stateless
        SPRING_LEGACY("@Service + @Transactional (Spring Legacy)");
        private final String label;
        EjbType(String label) { this.label = label; }
        public String getLabel() { return label; }
    }

    /** G5: Pattern EJB detecte */
    public enum EjbPattern {
        BASE_USE_CASE("BaseUseCase avec execute()"),
        REMOTE_INTERFACE("Interface @Remote"),
        LOCAL_INTERFACE("Interface @Local"),
        GENERIC_SERVICE("Service generique (methodes publiques)"),
        DAO_REPOSITORY("DAO/Repository (CRUD)"),
        MULTI_METHOD_SERVICE("Service multi-methodes");
        private final String label;
        EjbPattern(String label) { this.label = label; }
        public String getLabel() { return label; }
    }

    // ==================== FIELDS ====================

    private String className;
    private String packageName;
    private String fullyQualifiedName;
    private String inputDtoClassName;
    private String outputDtoClassName;
    private String inputDtoPackage;
    private String outputDtoPackage;
    private String implementedInterface;
    private String restEndpoint;
    private String controllerName;
    private String serviceAdapterName;
    private String jndiName;
    private boolean stateless;
    private boolean hasExecuteMethod;
    private SerializationFormat serializationFormat = SerializationFormat.JSON;
    private boolean inputDtoHasJaxb;
    private boolean outputDtoHasJaxb;
    private boolean inputDtoHasRequiredFields;

    /** G4: Type d'EJB */
    private EjbType ejbType = EjbType.STATELESS;

    /** G5: Pattern EJB detecte */
    private EjbPattern ejbPattern = EjbPattern.BASE_USE_CASE;

    /** G5: Liste des methodes publiques de l'EJB (pour patterns non-BaseUseCase) */
    private List<MethodInfo> publicMethods = new ArrayList<>();

    /** G6: Methode HTTP principale (GET, POST, PUT, DELETE, PATCH) */
    private String httpMethod = "POST";

    /** G6: Code HTTP de retour (200, 201, 204) */
    private int httpStatusCode = 200;

    /** G11: Javadoc de la classe EJB source */
    private String javadoc;

    /** G11: Summary derive du nom du UseCase */
    private String swaggerSummary;

    /** G12: Indique si l'EJB est un sous-aspect d'une entite parente */
    private String parentEntityName;

    /** Interfaces implementees par l'EJB */
    private List<String> implementedInterfaces = new ArrayList<>();

    /** Annotations detectees sur l'EJB source */
    private List<String> sourceAnnotations = new ArrayList<>();

    /** AXE 4: Roles @RolesAllowed detectes sur la methode execute() ou la classe */
    private List<String> rolesAllowed = new ArrayList<>();

    /** AXE 3: Nom de l'interface @Remote implementee (pour services multi-methodes) */
    private String remoteInterfaceName;

    /** BIAN: Mapping vers le Service Domain BIAN */
    private BianMapping bianMapping;

    // ==================== CONSTRUCTORS ====================

    public UseCaseInfo() {}

    // ==================== BIAN ====================

    public BianMapping getBianMapping() { return bianMapping; }
    public void setBianMapping(BianMapping bianMapping) { this.bianMapping = bianMapping; }

    // ==================== GETTERS/SETTERS ====================

    public String getClassName() { return className; }
    public void setClassName(String className) { this.className = className; }

    public String getPackageName() { return packageName; }
    public void setPackageName(String packageName) { this.packageName = packageName; }

    public String getFullyQualifiedName() { return fullyQualifiedName; }
    public void setFullyQualifiedName(String fullyQualifiedName) { this.fullyQualifiedName = fullyQualifiedName; }

    public String getInputDtoClassName() { return inputDtoClassName; }
    public void setInputDtoClassName(String inputDtoClassName) { this.inputDtoClassName = inputDtoClassName; }

    public String getOutputDtoClassName() { return outputDtoClassName; }
    public void setOutputDtoClassName(String outputDtoClassName) { this.outputDtoClassName = outputDtoClassName; }

    public String getInputDtoPackage() { return inputDtoPackage; }
    public void setInputDtoPackage(String inputDtoPackage) { this.inputDtoPackage = inputDtoPackage; }

    public String getOutputDtoPackage() { return outputDtoPackage; }
    public void setOutputDtoPackage(String outputDtoPackage) { this.outputDtoPackage = outputDtoPackage; }

    public String getImplementedInterface() { return implementedInterface; }
    public void setImplementedInterface(String implementedInterface) { this.implementedInterface = implementedInterface; }

    public String getRestEndpoint() { return restEndpoint; }
    public void setRestEndpoint(String restEndpoint) { this.restEndpoint = restEndpoint; }

    public String getControllerName() { return controllerName; }
    public void setControllerName(String controllerName) { this.controllerName = controllerName; }

    public String getServiceAdapterName() { return serviceAdapterName; }
    public void setServiceAdapterName(String serviceAdapterName) { this.serviceAdapterName = serviceAdapterName; }

    public String getJndiName() { return jndiName; }
    public void setJndiName(String jndiName) { this.jndiName = jndiName; }

    public boolean isStateless() { return stateless; }
    public void setStateless(boolean stateless) { this.stateless = stateless; }

    public boolean isHasExecuteMethod() { return hasExecuteMethod; }
    public void setHasExecuteMethod(boolean hasExecuteMethod) { this.hasExecuteMethod = hasExecuteMethod; }

    public SerializationFormat getSerializationFormat() { return serializationFormat; }
    public void setSerializationFormat(SerializationFormat serializationFormat) { this.serializationFormat = serializationFormat; }

    public boolean isInputDtoHasJaxb() { return inputDtoHasJaxb; }
    public void setInputDtoHasJaxb(boolean inputDtoHasJaxb) { this.inputDtoHasJaxb = inputDtoHasJaxb; }

    public boolean isOutputDtoHasJaxb() { return outputDtoHasJaxb; }
    public void setOutputDtoHasJaxb(boolean outputDtoHasJaxb) { this.outputDtoHasJaxb = outputDtoHasJaxb; }

    public boolean isInputDtoHasRequiredFields() { return inputDtoHasRequiredFields; }
    public void setInputDtoHasRequiredFields(boolean inputDtoHasRequiredFields) { this.inputDtoHasRequiredFields = inputDtoHasRequiredFields; }

    public EjbType getEjbType() { return ejbType; }
    public void setEjbType(EjbType ejbType) { this.ejbType = ejbType; }

    public EjbPattern getEjbPattern() { return ejbPattern; }
    public void setEjbPattern(EjbPattern ejbPattern) { this.ejbPattern = ejbPattern; }

    public List<MethodInfo> getPublicMethods() { return publicMethods; }
    public void setPublicMethods(List<MethodInfo> publicMethods) { this.publicMethods = publicMethods; }

    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

    public int getHttpStatusCode() { return httpStatusCode; }
    public void setHttpStatusCode(int httpStatusCode) { this.httpStatusCode = httpStatusCode; }

    public String getJavadoc() { return javadoc; }
    public void setJavadoc(String javadoc) { this.javadoc = javadoc; }

    public String getSwaggerSummary() { return swaggerSummary; }
    public void setSwaggerSummary(String swaggerSummary) { this.swaggerSummary = swaggerSummary; }

    public String getParentEntityName() { return parentEntityName; }
    public void setParentEntityName(String parentEntityName) { this.parentEntityName = parentEntityName; }

    public List<String> getImplementedInterfaces() { return implementedInterfaces; }
    public void setImplementedInterfaces(List<String> implementedInterfaces) { this.implementedInterfaces = implementedInterfaces; }

    public List<String> getSourceAnnotations() { return sourceAnnotations; }
    public void setSourceAnnotations(List<String> sourceAnnotations) { this.sourceAnnotations = sourceAnnotations; }

    public List<String> getRolesAllowed() { return rolesAllowed; }
    public void setRolesAllowed(List<String> rolesAllowed) { this.rolesAllowed = rolesAllowed; }

    public String getRemoteInterfaceName() { return remoteInterfaceName; }
    public void setRemoteInterfaceName(String remoteInterfaceName) { this.remoteInterfaceName = remoteInterfaceName; }

    // ==================== UTILITY METHODS ====================

    public boolean hasXmlSupport() {
        return inputDtoHasJaxb || outputDtoHasJaxb ||
               serializationFormat == SerializationFormat.XML ||
               serializationFormat == SerializationFormat.BOTH;
    }

    public boolean isBaseUseCasePattern() {
        return ejbPattern == EjbPattern.BASE_USE_CASE;
    }

    public boolean isMessageDriven() {
        return ejbType == EjbType.MESSAGE_DRIVEN;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        UseCaseInfo that = (UseCaseInfo) o;
        return Objects.equals(fullyQualifiedName, that.fullyQualifiedName);
    }

    @Override
    public int hashCode() { return Objects.hash(fullyQualifiedName); }

    @Override
    public String toString() {
        return "UseCaseInfo{className='" + className + "', ejbType=" + ejbType +
                ", pattern=" + ejbPattern + ", endpoint='" + restEndpoint +
                "', httpMethod=" + httpMethod + ", format=" + serializationFormat + '}';
    }

    // ==================== INNER CLASS: MethodInfo ====================

    /**
     * Represente une methode publique d'un EJB (pour G5/G6/G7/G8).
     */
    public static class MethodInfo {
        private String name;
        private String returnType;
        private List<ParameterInfo> parameters = new ArrayList<>();
        private String httpMethod = "POST";
        private int httpStatusCode = 200;
        private String restPath;
        private String javadoc;
        private List<String> rolesAllowed = new ArrayList<>();
        private List<String> throwsExceptions = new ArrayList<>();

        public MethodInfo() {}

        public MethodInfo(String name, String returnType) {
            this.name = name;
            this.returnType = returnType;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getReturnType() { return returnType; }
        public void setReturnType(String returnType) { this.returnType = returnType; }

        public List<ParameterInfo> getParameters() { return parameters; }
        public void setParameters(List<ParameterInfo> parameters) { this.parameters = parameters; }

        public String getHttpMethod() { return httpMethod; }
        public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

        public int getHttpStatusCode() { return httpStatusCode; }
        public void setHttpStatusCode(int httpStatusCode) { this.httpStatusCode = httpStatusCode; }

        public String getRestPath() { return restPath; }
        public void setRestPath(String restPath) { this.restPath = restPath; }

        public String getJavadoc() { return javadoc; }
        public void setJavadoc(String javadoc) { this.javadoc = javadoc; }

        public List<String> getRolesAllowed() { return rolesAllowed; }
        public void setRolesAllowed(List<String> rolesAllowed) { this.rolesAllowed = rolesAllowed; }

        public List<String> getThrowsExceptions() { return throwsExceptions; }
        public void setThrowsExceptions(List<String> throwsExceptions) { this.throwsExceptions = throwsExceptions; }

        public boolean isVoidReturn() { return "void".equals(returnType); }
        public boolean isByteArrayReturn() { return "byte[]".equals(returnType); }
        public boolean isPrimitiveOrStringReturn() {
            return returnType != null && (returnType.equals("String") || returnType.equals("boolean")
                    || returnType.equals("int") || returnType.equals("long") || returnType.equals("double")
                    || returnType.equals("float") || returnType.equals("Boolean") || returnType.equals("Integer")
                    || returnType.equals("Long") || returnType.equals("Double"));
        }
        public boolean isListReturn() { return returnType != null && returnType.startsWith("List<"); }

        @Override
        public String toString() { return returnType + " " + name + "(...)"; }
    }

    /**
     * Represente un parametre d'une methode EJB (pour G8).
     */
    public static class ParameterInfo {
        private String name;
        private String type;
        private boolean isIdParam;
        private boolean isComplexType;

        public ParameterInfo() {}

        public ParameterInfo(String name, String type) {
            this.name = name;
            this.type = type;
            this.isIdParam = name.toLowerCase().endsWith("id") || name.equalsIgnoreCase("id");
            this.isComplexType = !isPrimitiveOrString(type);
        }

        private static boolean isPrimitiveOrString(String type) {
            return type != null && (type.equals("String") || type.equals("int") || type.equals("long")
                    || type.equals("boolean") || type.equals("double") || type.equals("float")
                    || type.equals("Integer") || type.equals("Long") || type.equals("Boolean")
                    || type.equals("Double") || type.equals("BigDecimal") || type.equals("BigInteger")
                    || type.equals("UUID") || type.equals("Date") || type.equals("LocalDate")
                    || type.equals("LocalDateTime"));
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public boolean isIdParam() { return isIdParam; }
        public void setIdParam(boolean idParam) { isIdParam = idParam; }

        public boolean isComplexType() { return isComplexType; }
        public void setComplexType(boolean complexType) { isComplexType = complexType; }

        @Override
        public String toString() { return type + " " + name; }
    }
}
