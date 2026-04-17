package com.bank.tools.generator.ai;

import com.bank.tools.generator.model.ProjectAnalysisResult;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Interface de contrat pour l'amelioration automatique du code genere.
 *
 * Permet de decoupler le pipeline d'amelioration de l'implementation
 * concrete (regles statiques, IA, etc.).
 */
public interface CodeEnhancer {

    /**
     * Ameliore le code genere en appliquant des regles de qualite.
     *
     * @param projectRoot     chemin racine du projet genere
     * @param analysisResult  resultat de l'analyse du projet source
     * @return le rapport d'amelioration
     * @throws IOException en cas d'erreur de lecture/ecriture
     */
    EnhancementReport enhance(Path projectRoot, ProjectAnalysisResult analysisResult) throws IOException;
}
