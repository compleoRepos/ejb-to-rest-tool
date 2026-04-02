package com.bank.tools.generator.model;

import com.bank.tools.generator.annotation.DetectedAnnotation;
import java.util.ArrayList;
import java.util.List;

/**
 * Resultat complet de l'analyse d'un projet EJB.
 * Contient les UseCases, DTOs, services, entites, enums, exceptions,
 * validateurs, interfaces @Remote et metadonnees necessaires a la
 * generation et au rapport TRANSFORMATION_SUMMARY (G14).
 */
public class ProjectAnalysisResult {

    private List<UseCaseInfo> useCases = new ArrayList<>();
    private List<DtoInfo> dtos = new ArrayList<>();
    private List<String> warnings = new ArrayList<>();
    private int totalFilesAnalyzed;
    private String projectPath;

    /** G14: Nom du projet source */
    private String sourceProjectName;

    /** G14: Package racine du projet source */
    private String sourceBasePackage;

    /** G14: Nombre total d'EJB detectes (UseCases + Services) */
    private int totalEjbCount;

    /** G14: Nombre d'entites JPA detectees */
    private int jpaEntityCount;

    /** G14: Noms des entites JPA */
    private List<String> jpaEntityNames = new ArrayList<>();

    /** G14: Conversions javax → jakarta appliquees */
    private List<String> conversionsApplied = new ArrayList<>();

    /** G14: Points d'attention */
    private List<String> attentionPoints = new ArrayList<>();

    /** G14: Nombre de services non-UseCase detectes */
    private int serviceCount;

    /** G14: Noms des services non-UseCase */
    private List<String> serviceNames = new ArrayList<>();

    /** Indique si des annotations JAXB ont ete detectees dans le projet */
    private boolean hasJaxbAnnotations;

    /** Indique si des annotations javax.* ont ete detectees */
    private boolean hasLegacyJavaxImports;

    // ==================== AXE 1 : ENUMS, EXCEPTIONS, VALIDATEURS ====================

    /** Enums JAXB detectes dans le projet source (@XmlEnum) */
    private List<EnumInfo> detectedEnums = new ArrayList<>();

    /** Exceptions custom detectees dans le projet source */
    private List<ExceptionInfo> detectedExceptions = new ArrayList<>();

    /** Validateurs custom detectes dans le projet source (@Constraint + ConstraintValidator) */
    private List<ValidatorInfo> detectedValidators = new ArrayList<>();

    /** Interfaces @Remote/@Local detectees dans le projet source */
    private List<RemoteInterfaceInfo> detectedRemoteInterfaces = new ArrayList<>();

    /** Annotations custom bancaires detectees dans le projet source */
    private List<DetectedAnnotation> detectedCustomAnnotations = new ArrayList<>();

    // ==================== BOA/EAI FRAMEWORK SUPPORT ====================

    /** Parent POM framework (groupId:artifactId:version) */
    private String parentPomGroupId;
    private String parentPomArtifactId;
    private String parentPomVersion;
    private boolean hasFrameworkParentPom;

    /** Imports framework detectes (ma.eai.*, com.eai.*, etc.) */
    private List<String> frameworkImports = new ArrayList<>();

    /** Dependances framework detectees dans le pom.xml source */
    private List<FrameworkDependency> frameworkDependencies = new ArrayList<>();

    /** Version Java du projet source */
    private String sourceJavaVersion;

    /** Inner class pour stocker une dependance framework */
    public static class FrameworkDependency {
        private String groupId;
        private String artifactId;
        private String version;

        public FrameworkDependency() {}
        public FrameworkDependency(String groupId, String artifactId, String version) {
            this.groupId = groupId; this.artifactId = artifactId; this.version = version;
        }

        public String getGroupId() { return groupId; }
        public void setGroupId(String groupId) { this.groupId = groupId; }
        public String getArtifactId() { return artifactId; }
        public void setArtifactId(String artifactId) { this.artifactId = artifactId; }
        public String getVersion() { return version; }
        public void setVersion(String version) { this.version = version; }
    }

    // ==================== INNER CLASSES ====================

    /**
     * Information sur un enum JAXB detecte dans le projet source.
     */
    public static class EnumInfo {
        private String name;
        private String packageName;
        private List<String> values = new ArrayList<>();
        private String sourceCode;

        public EnumInfo() {}
        public EnumInfo(String name, String packageName, List<String> values, String sourceCode) {
            this.name = name; this.packageName = packageName;
            this.values = values; this.sourceCode = sourceCode;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getPackageName() { return packageName; }
        public void setPackageName(String packageName) { this.packageName = packageName; }
        public List<String> getValues() { return values; }
        public void setValues(List<String> values) { this.values = values; }
        public String getSourceCode() { return sourceCode; }
        public void setSourceCode(String sourceCode) { this.sourceCode = sourceCode; }
    }

    /**
     * Information sur une exception custom detectee dans le projet source.
     */
    public static class ExceptionInfo {
        private String name;
        private String packageName;
        private String parentClass;
        private String errorCode;
        private String sourceCode;

        public ExceptionInfo() {}
        public ExceptionInfo(String name, String packageName, String parentClass, String errorCode, String sourceCode) {
            this.name = name; this.packageName = packageName;
            this.parentClass = parentClass; this.errorCode = errorCode;
            this.sourceCode = sourceCode;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getPackageName() { return packageName; }
        public void setPackageName(String packageName) { this.packageName = packageName; }
        public String getParentClass() { return parentClass; }
        public void setParentClass(String parentClass) { this.parentClass = parentClass; }
        public String getErrorCode() { return errorCode; }
        public void setErrorCode(String errorCode) { this.errorCode = errorCode; }
        public String getSourceCode() { return sourceCode; }
        public void setSourceCode(String sourceCode) { this.sourceCode = sourceCode; }
    }

    /**
     * Information sur un validateur custom detecte dans le projet source
     * (annotation @Constraint + classe ConstraintValidator).
     */
    public static class ValidatorInfo {
        private String annotationName;
        private String validatorName;
        private String packageName;
        private String annotationSource;
        private String validatorSource;

        public ValidatorInfo() {}
        public ValidatorInfo(String annotationName, String validatorName, String packageName,
                             String annotationSource, String validatorSource) {
            this.annotationName = annotationName; this.validatorName = validatorName;
            this.packageName = packageName; this.annotationSource = annotationSource;
            this.validatorSource = validatorSource;
        }

        public String getAnnotationName() { return annotationName; }
        public void setAnnotationName(String annotationName) { this.annotationName = annotationName; }
        public String getValidatorName() { return validatorName; }
        public void setValidatorName(String validatorName) { this.validatorName = validatorName; }
        public String getPackageName() { return packageName; }
        public void setPackageName(String packageName) { this.packageName = packageName; }
        public String getAnnotationSource() { return annotationSource; }
        public void setAnnotationSource(String annotationSource) { this.annotationSource = annotationSource; }
        public String getValidatorSource() { return validatorSource; }
        public void setValidatorSource(String validatorSource) { this.validatorSource = validatorSource; }
    }

    /**
     * Information sur une interface @Remote/@Local detectee dans le projet source.
     */
    public static class RemoteInterfaceInfo {
        private String name;
        private String packageName;
        private String sourceCode;

        public RemoteInterfaceInfo() {}
        public RemoteInterfaceInfo(String name, String packageName, String sourceCode) {
            this.name = name; this.packageName = packageName; this.sourceCode = sourceCode;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getPackageName() { return packageName; }
        public void setPackageName(String packageName) { this.packageName = packageName; }
        public String getSourceCode() { return sourceCode; }
        public void setSourceCode(String sourceCode) { this.sourceCode = sourceCode; }
    }

    public ProjectAnalysisResult() {}

    // ==================== GETTERS/SETTERS ====================

    public List<UseCaseInfo> getUseCases() { return useCases; }
    public void setUseCases(List<UseCaseInfo> useCases) { this.useCases = useCases; }

    public List<DtoInfo> getDtos() { return dtos; }
    public void setDtos(List<DtoInfo> dtos) { this.dtos = dtos; }

    public List<String> getWarnings() { return warnings; }
    public void setWarnings(List<String> warnings) { this.warnings = warnings; }

    public int getTotalFilesAnalyzed() { return totalFilesAnalyzed; }
    public void setTotalFilesAnalyzed(int totalFilesAnalyzed) { this.totalFilesAnalyzed = totalFilesAnalyzed; }

    public String getProjectPath() { return projectPath; }
    public void setProjectPath(String projectPath) { this.projectPath = projectPath; }

    public String getSourceProjectName() { return sourceProjectName; }
    public void setSourceProjectName(String sourceProjectName) { this.sourceProjectName = sourceProjectName; }

    public String getSourceBasePackage() { return sourceBasePackage; }
    public void setSourceBasePackage(String sourceBasePackage) { this.sourceBasePackage = sourceBasePackage; }

    public int getTotalEjbCount() { return totalEjbCount; }
    public void setTotalEjbCount(int totalEjbCount) { this.totalEjbCount = totalEjbCount; }

    public int getJpaEntityCount() { return jpaEntityCount; }
    public void setJpaEntityCount(int jpaEntityCount) { this.jpaEntityCount = jpaEntityCount; }

    public List<String> getJpaEntityNames() { return jpaEntityNames; }
    public void setJpaEntityNames(List<String> jpaEntityNames) { this.jpaEntityNames = jpaEntityNames; }

    public List<String> getConversionsApplied() { return conversionsApplied; }
    public void setConversionsApplied(List<String> conversionsApplied) { this.conversionsApplied = conversionsApplied; }

    public List<String> getAttentionPoints() { return attentionPoints; }
    public void setAttentionPoints(List<String> attentionPoints) { this.attentionPoints = attentionPoints; }

    public int getServiceCount() { return serviceCount; }
    public void setServiceCount(int serviceCount) { this.serviceCount = serviceCount; }

    public List<String> getServiceNames() { return serviceNames; }
    public void setServiceNames(List<String> serviceNames) { this.serviceNames = serviceNames; }

    public boolean isHasJaxbAnnotations() { return hasJaxbAnnotations; }
    public void setHasJaxbAnnotations(boolean hasJaxbAnnotations) { this.hasJaxbAnnotations = hasJaxbAnnotations; }

    public boolean isHasLegacyJavaxImports() { return hasLegacyJavaxImports; }
    public void setHasLegacyJavaxImports(boolean hasLegacyJavaxImports) { this.hasLegacyJavaxImports = hasLegacyJavaxImports; }

    public List<EnumInfo> getDetectedEnums() { return detectedEnums; }
    public void setDetectedEnums(List<EnumInfo> detectedEnums) { this.detectedEnums = detectedEnums; }

    public List<ExceptionInfo> getDetectedExceptions() { return detectedExceptions; }
    public void setDetectedExceptions(List<ExceptionInfo> detectedExceptions) { this.detectedExceptions = detectedExceptions; }

    public List<ValidatorInfo> getDetectedValidators() { return detectedValidators; }
    public void setDetectedValidators(List<ValidatorInfo> detectedValidators) { this.detectedValidators = detectedValidators; }

    public List<RemoteInterfaceInfo> getDetectedRemoteInterfaces() { return detectedRemoteInterfaces; }
    public void setDetectedRemoteInterfaces(List<RemoteInterfaceInfo> detectedRemoteInterfaces) { this.detectedRemoteInterfaces = detectedRemoteInterfaces; }

    // ==================== UTILITY METHODS ====================

    public void addUseCase(UseCaseInfo useCase) { this.useCases.add(useCase); }
    public void addDto(DtoInfo dto) { this.dtos.add(dto); }
    public void addWarning(String warning) { this.warnings.add(warning); }
    public void addConversion(String conversion) { this.conversionsApplied.add(conversion); }
    public void addAttentionPoint(String point) { this.attentionPoints.add(point); }
    public void addEnum(EnumInfo enumInfo) { this.detectedEnums.add(enumInfo); }
    public void addException(ExceptionInfo exceptionInfo) { this.detectedExceptions.add(exceptionInfo); }
    public void addValidator(ValidatorInfo validatorInfo) { this.detectedValidators.add(validatorInfo); }
    public void addRemoteInterface(RemoteInterfaceInfo remoteInterfaceInfo) { this.detectedRemoteInterfaces.add(remoteInterfaceInfo); }

    public List<DetectedAnnotation> getDetectedCustomAnnotations() { return detectedCustomAnnotations; }
    public void setDetectedCustomAnnotations(List<DetectedAnnotation> detectedCustomAnnotations) { this.detectedCustomAnnotations = detectedCustomAnnotations; }
    public void addCustomAnnotation(DetectedAnnotation annotation) { this.detectedCustomAnnotations.add(annotation); }
    public void addCustomAnnotations(List<DetectedAnnotation> annotations) { this.detectedCustomAnnotations.addAll(annotations); }

    // ==================== BOA/EAI GETTERS/SETTERS ====================

    public String getParentPomGroupId() { return parentPomGroupId; }
    public void setParentPomGroupId(String parentPomGroupId) { this.parentPomGroupId = parentPomGroupId; }

    public String getParentPomArtifactId() { return parentPomArtifactId; }
    public void setParentPomArtifactId(String parentPomArtifactId) { this.parentPomArtifactId = parentPomArtifactId; }

    public String getParentPomVersion() { return parentPomVersion; }
    public void setParentPomVersion(String parentPomVersion) { this.parentPomVersion = parentPomVersion; }

    public boolean isHasFrameworkParentPom() { return hasFrameworkParentPom; }
    public void setHasFrameworkParentPom(boolean hasFrameworkParentPom) { this.hasFrameworkParentPom = hasFrameworkParentPom; }

    public List<String> getFrameworkImports() { return frameworkImports; }
    public void setFrameworkImports(List<String> frameworkImports) { this.frameworkImports = frameworkImports; }
    public void addFrameworkImport(String importName) {
        if (!this.frameworkImports.contains(importName)) {
            this.frameworkImports.add(importName);
        }
    }

    public List<FrameworkDependency> getFrameworkDependencies() { return frameworkDependencies; }
    public void setFrameworkDependencies(List<FrameworkDependency> frameworkDependencies) { this.frameworkDependencies = frameworkDependencies; }
    public void addFrameworkDependency(String groupId, String artifactId, String version) {
        this.frameworkDependencies.add(new FrameworkDependency(groupId, artifactId, version));
    }

    public String getSourceJavaVersion() { return sourceJavaVersion; }
    public void setSourceJavaVersion(String sourceJavaVersion) { this.sourceJavaVersion = sourceJavaVersion; }
}
