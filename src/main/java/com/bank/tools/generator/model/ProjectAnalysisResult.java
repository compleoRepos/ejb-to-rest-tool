package com.bank.tools.generator.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Résultat complet de l'analyse d'un projet EJB.
 * <p>
 * Contient la liste des UseCases détectés, les DTO identifiés,
 * et les éventuelles erreurs rencontrées lors de l'analyse.
 * </p>
 */
public class ProjectAnalysisResult {

    /** Liste des UseCases détectés */
    private List<UseCaseInfo> useCases = new ArrayList<>();

    /** Liste des DTO détectés */
    private List<DtoInfo> dtos = new ArrayList<>();

    /** Liste des erreurs ou avertissements */
    private List<String> warnings = new ArrayList<>();

    /** Nombre total de fichiers Java analysés */
    private int totalFilesAnalyzed;

    /** Chemin du projet uploadé */
    private String projectPath;

    public ProjectAnalysisResult() {
    }

    public List<UseCaseInfo> getUseCases() {
        return useCases;
    }

    public void setUseCases(List<UseCaseInfo> useCases) {
        this.useCases = useCases;
    }

    public List<DtoInfo> getDtos() {
        return dtos;
    }

    public void setDtos(List<DtoInfo> dtos) {
        this.dtos = dtos;
    }

    public List<String> getWarnings() {
        return warnings;
    }

    public void setWarnings(List<String> warnings) {
        this.warnings = warnings;
    }

    public int getTotalFilesAnalyzed() {
        return totalFilesAnalyzed;
    }

    public void setTotalFilesAnalyzed(int totalFilesAnalyzed) {
        this.totalFilesAnalyzed = totalFilesAnalyzed;
    }

    public String getProjectPath() {
        return projectPath;
    }

    public void setProjectPath(String projectPath) {
        this.projectPath = projectPath;
    }

    public void addUseCase(UseCaseInfo useCase) {
        this.useCases.add(useCase);
    }

    public void addDto(DtoInfo dto) {
        this.dtos.add(dto);
    }

    public void addWarning(String warning) {
        this.warnings.add(warning);
    }
}
