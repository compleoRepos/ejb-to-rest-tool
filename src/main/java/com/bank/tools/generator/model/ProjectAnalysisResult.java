package com.bank.tools.generator.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Resultat complet de l'analyse d'un projet EJB.
 * Contient les UseCases, DTOs, services, entites et metadonnees
 * necessaires a la generation et au rapport TRANSFORMATION_SUMMARY (G14).
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

    // ==================== UTILITY METHODS ====================

    public void addUseCase(UseCaseInfo useCase) { this.useCases.add(useCase); }
    public void addDto(DtoInfo dto) { this.dtos.add(dto); }
    public void addWarning(String warning) { this.warnings.add(warning); }
    public void addConversion(String conversion) { this.conversionsApplied.add(conversion); }
    public void addAttentionPoint(String point) { this.attentionPoints.add(point); }
}
