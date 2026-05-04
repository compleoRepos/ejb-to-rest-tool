/**
 * CobolAnalyzer.ts — Orchestrateur principal de l'analyse COBOL
 * 
 * Coordonne le parsing, la détection de technologies et la génération du rapport.
 * Point d'entrée unique pour l'analyse d'un projet COBOL.
 * 
 * @module server/engine/cobol
 */

import { CobolParser, type CobolProgramIR } from './CobolParser';
import { JclParser, type JclJob } from './JclParser';
import { CobolDetectorsWithSource, type CobolTechDetection } from './CobolDetectors';
import { CobolMigrationReportGenerator, type CobolAnalysisReport } from './CobolMigrationReport';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface CobolProjectInput {
  projectName: string;
  files: CobolFileInput[];
}

export interface CobolFileInput {
  fileName: string;
  content: string;
  type: 'COBOL' | 'COPYBOOK' | 'JCL';
}

export interface CobolAnalysisResult {
  success: boolean;
  report: CobolAnalysisReport | null;
  errors: string[];
  warnings: string[];
  stats: {
    filesProcessed: number;
    programsParsed: number;
    jclJobsParsed: number;
    totalLoc: number;
    parseTimeMs: number;
  };
}

// ─── Analyzer ───────────────────────────────────────────────────────────────

export class CobolAnalyzer {
  private cobolParser: CobolParser;
  private jclParser: JclParser;
  private detectors: CobolDetectorsWithSource;
  private reportGenerator: CobolMigrationReportGenerator;

  constructor() {
    this.cobolParser = new CobolParser();
    this.jclParser = new JclParser();
    this.detectors = new CobolDetectorsWithSource();
    this.reportGenerator = new CobolMigrationReportGenerator();
  }

  /**
   * Analyse un projet COBOL complet et génère le rapport de migration.
   */
  analyze(input: CobolProjectInput): CobolAnalysisResult {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const programs: CobolProgramIR[] = [];
    const jclJobs: JclJob[] = [];

    // 1. Classifier les fichiers
    const cobolFiles = input.files.filter(f => f.type === 'COBOL');
    const copybookFiles = input.files.filter(f => f.type === 'COPYBOOK');
    const jclFiles = input.files.filter(f => f.type === 'JCL');

    // 2. Parser les COPYBOOK (pour résolution future)
    const copybookMap = new Map<string, string>();
    for (const cb of copybookFiles) {
      const name = cb.fileName.replace(/\.(cpy|CPY|copy|COPY)$/, '');
      copybookMap.set(name.toUpperCase(), cb.content);
    }

    // 3. Parser les programmes COBOL
    for (const file of cobolFiles) {
      try {
        // Collecter les COPY statements AVANT expansion (sinon ils disparaissent)
        const copybookRefs = this.extractCopybookRefs(file.content);

        // Résoudre les COPY statements inline (expansion basique)
        const expandedContent = this.expandCopybooks(file.content, copybookMap);
        const ir = this.cobolParser.parse(expandedContent, file.fileName);

        // Ajouter les copybooks détectés depuis le source original
        if (copybookRefs.length > 0 && ir.copybooks.length === 0) {
          ir.copybooks = copybookRefs;
        }

        programs.push(ir);

        // Enregistrer le source pour les détecteurs (source original pour détecter COPY)
        this.detectors.registerSource(ir.programId, file.content);
      } catch (err) {
        errors.push(`Erreur parsing ${file.fileName}: ${(err as Error).message}`);
      }
    }

    // 4. Parser les JCL
    for (const file of jclFiles) {
      try {
        const jobs = this.jclParser.parse(file.content, file.fileName);
        jclJobs.push(...jobs);
      } catch (err) {
        errors.push(`Erreur parsing JCL ${file.fileName}: ${(err as Error).message}`);
      }
    }

    // 5. Détection des technologies
    let techDetections: CobolTechDetection[] = [];
    try {
      techDetections = this.detectors.detectAll(programs, jclJobs);
    } catch (err) {
      errors.push(`Erreur détection technologies: ${(err as Error).message}`);
    }

    // 6. Générer le rapport
    let report: CobolAnalysisReport | null = null;
    if (programs.length > 0) {
      try {
        report = this.reportGenerator.generate(
          input.projectName,
          programs,
          jclJobs,
          techDetections,
        );
      } catch (err) {
        errors.push(`Erreur génération rapport: ${(err as Error).message}`);
      }
    } else {
      warnings.push('Aucun programme COBOL valide trouvé dans le projet');
    }

    // 7. Warnings
    if (copybookFiles.length === 0 && programs.some(p => p.copybooks.length > 0)) {
      warnings.push('Des COPY statements ont été détectés mais aucun fichier COPYBOOK fourni');
    }

    if (jclFiles.length === 0 && programs.length > 0) {
      warnings.push('Aucun JCL fourni — l\'analyse des chaînes batch est incomplète');
    }

    const parseTimeMs = Date.now() - startTime;

    return {
      success: errors.length === 0 && report !== null,
      report,
      errors,
      warnings,
      stats: {
        filesProcessed: input.files.length,
        programsParsed: programs.length,
        jclJobsParsed: jclJobs.length,
        totalLoc: programs.reduce((s, p) => s + p.loc, 0),
        parseTimeMs,
      },
    };
  }

  /**
   * Extrait les noms de COPYBOOK référencés dans le source AVANT expansion.
   */
  private extractCopybookRefs(content: string): string[] {
    const refs: string[] = [];
    const regex = /COPY\s+([A-Za-z0-9-]+)/gi;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1].toUpperCase();
      if (!refs.includes(name)) refs.push(name);
    }
    return refs;
  }

  /**
   * Expansion basique des COPY statements.
   * Remplace `COPY COPYNAME.` par le contenu du copybook.
   */
  private expandCopybooks(content: string, copybookMap: Map<string, string>): string {
    // Pattern: COPY name [REPLACING ==:TAG:== BY ==prefix==].
    const copyRegex = /COPY\s+([A-Za-z0-9-]+)(?:\s+REPLACING\s+([^.]+))?\s*\./gi;
    let result = content.replace(copyRegex, (match, name, replacingClause) => {
      let cbContent = copybookMap.get(name.toUpperCase());
      if (!cbContent) return match;

      // Apply REPLACING if present
      if (replacingClause) {
        // Parse REPLACING pairs: ==:TAG:== BY ==CD-==
        const pairRegex = /==([^=]+)==\s+BY\s+==([^=]*)==/gi;
        let pairMatch;
        while ((pairMatch = pairRegex.exec(replacingClause)) !== null) {
          const from = pairMatch[1];
          const to = pairMatch[2];
          // Replace all occurrences of the tag in the copybook content
          cbContent = cbContent.split(from).join(to);
        }
      }

      // Recursive expansion: if the copybook itself contains COPY statements
      if (/COPY\s+[A-Za-z0-9-]+/i.test(cbContent)) {
        cbContent = this.expandCopybooks(cbContent, copybookMap);
      }

      return cbContent;
    });
    return result;
  }

  /**
   * Détecte le type de fichier à partir de son extension ou contenu.
   */
  static detectFileType(fileName: string, content: string): CobolFileInput['type'] {
    const ext = fileName.toLowerCase().split('.').pop() || '';

    // Par extension
    if (['cbl', 'cob', 'cobol'].includes(ext)) return 'COBOL';
    if (['cpy', 'copy', 'cpb'].includes(ext)) return 'COPYBOOK';
    if (['jcl', 'job', 'proc'].includes(ext)) return 'JCL';

    // Par contenu
    if (content.includes('IDENTIFICATION DIVISION') || content.includes('PROGRAM-ID')) return 'COBOL';
    if (content.match(/^\/\/\w+\s+JOB/m)) return 'JCL';
    if (content.match(/^\d{6}\s*01\s+/m)) return 'COPYBOOK';

    // Default
    return 'COBOL';
  }
}

// ─── Export barrel ──────────────────────────────────────────────────────────

export { CobolParser, type CobolProgramIR } from './CobolParser';
export { JclParser, type JclJob } from './JclParser';
export { CobolDetectors, CobolDetectorsWithSource, type CobolTechDetection } from './CobolDetectors';
export { CobolMigrationReportGenerator, type CobolAnalysisReport, type ProgramEffort } from './CobolMigrationReport';
