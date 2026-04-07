package com.bank.tools.generator.report;

import com.bank.tools.generator.ai.EnhancementReport;
import com.bank.tools.generator.model.ProjectAnalysisResult;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Interface de contrat pour la generation de rapports de transformation.
 *
 * Permet de decoupler le pipeline de reporting de l'implementation
 * concrete (PDF, HTML, Markdown, etc.).
 */
public interface TransformationReportGenerator {

    /**
     * Genere un rapport de transformation.
     *
     * @param outputPath      chemin du fichier de sortie
     * @param analysis        resultat de l'analyse du projet source
     * @param enhancementReport rapport d'amelioration (peut etre null)
     * @param bianMode        true si le mode BIAN est actif
     * @throws IOException en cas d'erreur d'ecriture
     */
    void generateReport(Path outputPath, ProjectAnalysisResult analysis,
                        EnhancementReport enhancementReport) throws IOException;
}
