package com.bank.tools.generator.parser;

import com.bank.tools.generator.model.ProjectAnalysisResult;

import java.nio.file.Path;

/**
 * Interface de contrat pour le parseur de projets legacy.
 *
 * Permet de decoupler le pipeline de generation de l'implementation
 * concrete du parseur (EJB, Spring Legacy, SOAP, etc.).
 */
public interface ProjectParser {

    /**
     * Analyse un projet source et retourne le resultat structure.
     *
     * @param projectPath chemin racine du projet source
     * @return le resultat d'analyse contenant les UseCases, DTOs et exceptions detectes
     */
    ProjectAnalysisResult analyzeProject(Path projectPath);
}
