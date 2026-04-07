package com.bank.tools.generator.engine;

import com.bank.tools.generator.model.ProjectAnalysisResult;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Interface de contrat pour le generateur de code REST.
 *
 * Permet de decoupler le pipeline de generation de l'implementation
 * concrete du moteur (mode couple, mode ACL, etc.).
 */
public interface CodeGenerator {

    /**
     * Genere le projet REST a partir du resultat d'analyse.
     *
     * @param analysisResult resultat de l'analyse du projet source
     * @param outputDir      repertoire de sortie
     * @param bianMode       true pour activer le mode BIAN
     * @return le chemin du projet genere
     * @throws IOException en cas d'erreur d'ecriture
     */
    Path generateProject(ProjectAnalysisResult analysisResult, Path outputDir, boolean bianMode) throws IOException;
}
