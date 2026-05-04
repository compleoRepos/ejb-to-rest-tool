/**
 * CobolMigrationReport.ts — Générateur de rapport de migration COBOL
 * 
 * Produit un rapport markdown complet en 10 sections :
 * Résumé exécutif, Inventaire, Cartographie données, Dépendances,
 * Complexité, Technologies, Recommandation stratégie, Estimation effort,
 * Plan de migration, Annexes.
 * 
 * @module server/engine/cobol
 */

import type { CobolProgramIR, CobolSQL, CobolCall } from './CobolParser';
import type { JclJob } from './JclParser';
import type { CobolTechDetection } from './CobolDetectors';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface CobolAnalysisReport {
  projectName: string;
  generatedAt: string;
  programs: CobolProgramIR[];
  jclJobs: JclJob[];
  techDetections: CobolTechDetection[];
  effortEstimates: ProgramEffort[];
  totalEffortJH: number;
  migrationReadinessScore: number;
  markdownReport: string;
}

export interface ProgramEffort {
  programId: string;
  strategy: 'REWRITE' | 'REFACTOR' | 'REHOST' | 'REPLACE';
  effortJH: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  justification: string;
}

// ─── Report Generator ───────────────────────────────────────────────────────

export class CobolMigrationReportGenerator {
  /**
   * Génère le rapport complet d'analyse de migration COBOL.
   */
  generate(
    projectName: string,
    programs: CobolProgramIR[],
    jclJobs: JclJob[],
    techDetections: CobolTechDetection[],
  ): CobolAnalysisReport {
    const effortEstimates = programs.map(p => this.estimateEffort(p, techDetections));
    const totalEffortJH = effortEstimates.reduce((sum, e) => sum + e.effortJH, 0);
    const migrationReadinessScore = this.calculateReadinessScore(programs, techDetections);

    const markdownReport = this.generateMarkdown(
      projectName, programs, jclJobs, techDetections, effortEstimates, totalEffortJH, migrationReadinessScore
    );

    return {
      projectName,
      generatedAt: new Date().toISOString(),
      programs,
      jclJobs,
      techDetections,
      effortEstimates,
      totalEffortJH,
      migrationReadinessScore,
      markdownReport,
    };
  }

  /**
   * Estime l'effort de migration pour un programme.
   */
  estimateEffort(program: CobolProgramIR, techs: CobolTechDetection[]): ProgramEffort {
    let baseJH = 0;

    // Base LOC
    if (program.loc < 500) baseJH = 3;
    else if (program.loc < 1500) baseJH = 8;
    else if (program.loc < 5000) baseJH = 20;
    else baseJH = 40;

    // Multiplicateurs technologiques
    const progTechs = techs.filter(t => t.detected && t.programs.includes(program.programId));

    if (progTechs.some(t => t.technology === 'CICS')) baseJH *= 1.5;
    if (progTechs.some(t => t.technology === 'DB2')) baseJH *= 1.3;
    if (progTechs.some(t => t.technology.startsWith('IMS'))) baseJH *= 2.0;
    if (progTechs.some(t => t.technology === 'MQ Series')) baseJH *= 1.2;
    if (program.complexity > 20) baseJH *= 1.4;
    if (program.complexity > 40) baseJH *= 1.3; // Additional for very complex

    const effortJH = Math.round(baseJH);

    // Determine strategy
    const strategy = this.recommendStrategy(program, progTechs);
    const risk = this.assessRisk(program, progTechs);
    const justification = this.buildJustification(program, progTechs, strategy);

    return { programId: program.programId, strategy, effortJH, risk, justification };
  }

  private recommendStrategy(
    program: CobolProgramIR,
    techs: CobolTechDetection[]
  ): ProgramEffort['strategy'] {
    // REPLACE : programmes très simples (< 200 LOC, pas de DB2/CICS)
    if (program.loc < 200 && techs.length === 0) return 'REPLACE';

    // REHOST : programmes batch simples sans logique métier complexe
    if (program.complexity < 5 && !techs.some(t => t.technology === 'CICS')) return 'REHOST';

    // REFACTOR : programmes modérément complexes avec DB2
    if (program.complexity <= 20 && techs.some(t => t.technology === 'DB2')) return 'REFACTOR';

    // REWRITE : programmes complexes ou avec CICS/IMS
    return 'REWRITE';
  }

  private assessRisk(
    program: CobolProgramIR,
    techs: CobolTechDetection[]
  ): ProgramEffort['risk'] {
    if (techs.some(t => t.technology.startsWith('IMS'))) return 'CRITICAL';
    if (techs.some(t => t.technology === 'CICS') && program.complexity > 30) return 'CRITICAL';
    if (techs.some(t => t.technology === 'CICS') || program.complexity > 20) return 'HIGH';
    if (techs.some(t => t.technology === 'DB2') || program.complexity > 10) return 'MEDIUM';
    return 'LOW';
  }

  private buildJustification(
    program: CobolProgramIR,
    techs: CobolTechDetection[],
    strategy: ProgramEffort['strategy']
  ): string {
    const parts: string[] = [];
    parts.push(`${program.loc} LOC, complexité ${program.complexity}`);

    if (techs.length > 0) {
      parts.push(`Technologies: ${techs.map(t => t.technology).join(', ')}`);
    }

    switch (strategy) {
      case 'REWRITE':
        parts.push('Réécriture complète recommandée (complexité élevée ou CICS)');
        break;
      case 'REFACTOR':
        parts.push('Refactoring progressif possible (structure modulaire)');
        break;
      case 'REHOST':
        parts.push('Rehost viable (logique simple, pas de dépendances critiques)');
        break;
      case 'REPLACE':
        parts.push('Remplacement par solution standard (programme trivial)');
        break;
    }

    return parts.join('. ');
  }

  /**
   * Calcule le score de migration-readiness (0-100).
   */
  private calculateReadinessScore(programs: CobolProgramIR[], techs: CobolTechDetection[]): number {
    let score = 100;

    // Pénalités par technologie critique
    const criticalTechs = techs.filter(t => t.detected && t.migrationImpact === 'CRITICAL');
    score -= criticalTechs.length * 15;

    const highTechs = techs.filter(t => t.detected && t.migrationImpact === 'HIGH');
    score -= highTechs.length * 8;

    // Pénalité complexité moyenne
    const avgComplexity = programs.reduce((s, p) => s + p.complexity, 0) / (programs.length || 1);
    if (avgComplexity > 30) score -= 20;
    else if (avgComplexity > 15) score -= 10;

    // Pénalité GO TO (COBOL 74 style)
    const hasGoTo = techs.some(t => t.technology.includes('COBOL 74'));
    if (hasGoTo) score -= 10;

    // Bonus : programmes bien structurés (sections nommées)
    const avgSections = programs.reduce((s, p) => s + p.paragraphCount, 0) / (programs.length || 1);
    if (avgSections > 5) score += 5; // Well structured

    return Math.max(0, Math.min(100, score));
  }

  // ─── Markdown Generation ────────────────────────────────────────────────────

  private generateMarkdown(
    projectName: string,
    programs: CobolProgramIR[],
    jclJobs: JclJob[],
    techs: CobolTechDetection[],
    efforts: ProgramEffort[],
    totalEffort: number,
    readinessScore: number,
  ): string {
    const sections: string[] = [];

    sections.push(`# Rapport d'Analyse COBOL — ${projectName}\n`);
    sections.push(`> Généré le ${new Date().toLocaleDateString('fr-FR')} | ${programs.length} programmes | ${readinessScore}/100 migration-readiness\n`);

    sections.push(this.section1_Resume(programs, techs, totalEffort, readinessScore));
    sections.push(this.section2_Inventaire(programs, efforts));
    sections.push(this.section3_Cartographie(programs, techs));
    sections.push(this.section4_Dependances(programs, jclJobs));
    sections.push(this.section5_Complexite(programs));
    sections.push(this.section6_Technologies(techs));
    sections.push(this.section7_Strategie(efforts));
    sections.push(this.section8_Effort(efforts, totalEffort));
    sections.push(this.section9_Plan(efforts, jclJobs));
    sections.push(this.section10_Annexes(programs, techs));

    return sections.join('\n---\n\n');
  }

  private section1_Resume(
    programs: CobolProgramIR[],
    techs: CobolTechDetection[],
    totalEffort: number,
    readinessScore: number
  ): string {
    const totalLoc = programs.reduce((s, p) => s + p.loc, 0);
    const totalSql = programs.reduce((s, p) => s + p.sqlStatements.length, 0);
    const detectedTechs = techs.filter(t => t.detected).map(t => t.technology);

    return `## 1. Résumé exécutif

| Métrique | Valeur |
|----------|--------|
| Programmes analysés | ${programs.length} |
| Lignes de code (LOC) | ${totalLoc.toLocaleString()} |
| Requêtes SQL | ${totalSql} |
| Technologies mainframe | ${detectedTechs.join(', ') || 'Aucune'} |
| Effort total estimé | ${totalEffort} j/h |
| Score migration-readiness | ${readinessScore}/100 |

${readinessScore >= 70 ? '**Conclusion** : Le portfolio est relativement prêt pour la migration. Les programmes sont bien structurés.' : readinessScore >= 40 ? '**Conclusion** : Migration faisable mais nécessite une planification rigoureuse. Plusieurs technologies critiques détectées.' : '**Conclusion** : Migration complexe. Présence de technologies critiques (CICS, IMS) nécessitant une expertise spécialisée.'}
`;
  }

  private section2_Inventaire(programs: CobolProgramIR[], efforts: ProgramEffort[]): string {
    let table = `## 2. Inventaire des programmes\n\n`;
    table += `| Programme | LOC | Sections | SQL | Appels | Complexité | Stratégie | Priorité |\n`;
    table += `|-----------|-----|----------|-----|--------|------------|-----------|----------|\n`;

    for (const prog of programs) {
      const effort = efforts.find(e => e.programId === prog.programId);
      table += `| ${prog.programId} | ${prog.loc} | ${prog.paragraphCount} | ${prog.sqlStatements.length} | ${prog.callStatements.length} | ${prog.complexity} | ${effort?.strategy || '-'} | ${effort?.risk || '-'} |\n`;
    }

    return table;
  }

  private section3_Cartographie(programs: CobolProgramIR[], techs: CobolTechDetection[]): string {
    let section = `## 3. Cartographie des données\n\n`;

    // 3.1 DB2
    const db2 = techs.find(t => t.technology === 'DB2');
    section += `### 3.1 DB2\n\n`;
    if (db2?.detected) {
      section += `${db2.details.join('\n\n')}\n\n`;
      // Tables par programme
      for (const prog of programs) {
        const tables = [...new Set(prog.sqlStatements.flatMap(s => s.tables))];
        if (tables.length > 0) {
          section += `- **${prog.programId}** : ${tables.join(', ')}\n`;
        }
      }
    } else {
      section += `Aucun accès DB2 détecté.\n`;
    }

    // 3.2 VSAM / Fichiers
    section += `\n### 3.2 VSAM / Fichiers\n\n`;
    const vsam = techs.find(t => t.technology === 'VSAM');
    if (vsam?.detected) {
      section += `${vsam.details.join('\n')}\n`;
    }

    // File descriptions
    for (const prog of programs) {
      if (prog.fileDescriptions.length > 0) {
        section += `\n**${prog.programId}** :\n`;
        for (const fd of prog.fileDescriptions) {
          section += `- ${fd.name} (${fd.type}${fd.keyField ? `, clé: ${fd.keyField}` : ''})\n`;
        }
      }
    }

    // 3.3 COPYBOOK
    section += `\n### 3.3 COPYBOOK\n\n`;
    const allCopybooks = new Map<string, string[]>();
    for (const prog of programs) {
      for (const cb of prog.copybooks) {
        if (!allCopybooks.has(cb)) allCopybooks.set(cb, []);
        allCopybooks.get(cb)!.push(prog.programId);
      }
    }
    if (allCopybooks.size > 0) {
      section += `| COPYBOOK | Utilisé par |\n|----------|-------------|\n`;
      for (const [cb, progs] of allCopybooks) {
        section += `| ${cb} | ${progs.join(', ')} |\n`;
      }
    } else {
      section += `Aucun COPYBOOK détecté.\n`;
    }

    return section;
  }

  private section4_Dependances(programs: CobolProgramIR[], jclJobs: JclJob[]): string {
    let section = `## 4. Cartographie des dépendances\n\n`;

    // 4.1 Appels inter-programmes (CALL)
    section += `### 4.1 Appels inter-programmes (CALL)\n\n`;
    const callGraph: string[] = [];
    for (const prog of programs) {
      for (const call of prog.callStatements) {
        callGraph.push(`${prog.programId} → ${call.target}`);
      }
    }
    if (callGraph.length > 0) {
      section += '```\n' + callGraph.join('\n') + '\n```\n\n';
    } else {
      section += 'Aucun appel inter-programmes détecté.\n\n';
    }

    // 4.2 PERFORM (intra-programme)
    section += `### 4.2 PERFORM (intra-programme)\n\n`;
    for (const prog of programs) {
      if (prog.performCalls.length > 0) {
        section += `**${prog.programId}** : ${prog.performCalls.length} PERFORM (${prog.performCalls.slice(0, 5).join(', ')}${prog.performCalls.length > 5 ? '...' : ''})\n\n`;
      }
    }

    // 4.3 JCL / Chaînes batch
    section += `### 4.3 JCL / Chaînes batch\n\n`;
    for (const job of jclJobs) {
      section += `**${job.jobName}** :\n`;
      for (let i = 0; i < job.steps.length; i++) {
        const step = job.steps[i];
        const arrow = i < job.steps.length - 1 ? ' →' : '';
        section += `  ${i + 1}. ${step.stepName} (PGM=${step.program})${arrow}\n`;
      }
      section += '\n';
    }

    return section;
  }

  private section5_Complexite(programs: CobolProgramIR[]): string {
    let section = `## 5. Évaluation de complexité\n\n`;
    section += `| Programme | LOC | Complexité | Niveau | GO TO | SQL | REDEFINES |\n`;
    section += `|-----------|-----|------------|--------|-------|-----|-----------|\n`;

    for (const prog of programs) {
      const level = prog.complexity <= 10 ? 'Simple' :
        prog.complexity <= 20 ? 'Moyen' :
          prog.complexity <= 40 ? 'Complexe' : 'Très complexe';

      const goToCount = prog.performCalls.filter(p => p.includes('GO')).length; // Approximation
      const redefinesCount = prog.dataItems.filter(d => d.redefines !== null).length;

      section += `| ${prog.programId} | ${prog.loc} | ${prog.complexity} | ${level} | ${goToCount} | ${prog.sqlStatements.length} | ${redefinesCount} |\n`;
    }

    return section;
  }

  private section6_Technologies(techs: CobolTechDetection[]): string {
    let section = `## 6. Technologies mainframe détectées\n\n`;
    section += `| Technologie | Détecté | Occurrences | Impact | Note de migration |\n`;
    section += `|-------------|---------|-------------|--------|-------------------|\n`;

    for (const tech of techs) {
      section += `| ${tech.technology} | ${tech.detected ? '✅' : '❌'} | ${tech.count} | ${tech.migrationImpact} | ${tech.migrationNote.substring(0, 60)}${tech.migrationNote.length > 60 ? '...' : ''} |\n`;
    }

    return section;
  }

  private section7_Strategie(efforts: ProgramEffort[]): string {
    let section = `## 7. Recommandation de stratégie\n\n`;

    const byStrategy = new Map<string, ProgramEffort[]>();
    for (const e of efforts) {
      if (!byStrategy.has(e.strategy)) byStrategy.set(e.strategy, []);
      byStrategy.get(e.strategy)!.push(e);
    }

    for (const [strategy, progs] of byStrategy) {
      section += `### ${strategy} (${progs.length} programmes)\n\n`;
      for (const p of progs) {
        section += `- **${p.programId}** : ${p.justification}\n`;
      }
      section += '\n';
    }

    return section;
  }

  private section8_Effort(efforts: ProgramEffort[], totalEffort: number): string {
    let section = `## 8. Estimation d'effort\n\n`;
    section += `| Programme | Stratégie | Effort (j/h) | Risque |\n`;
    section += `|-----------|-----------|--------------|--------|\n`;

    for (const e of efforts) {
      section += `| ${e.programId} | ${e.strategy} | ${e.effortJH} | ${e.risk} |\n`;
    }

    section += `\n**Total portfolio : ${totalEffort} j/h** (≈ ${Math.ceil(totalEffort / 8)} jours, ≈ ${Math.ceil(totalEffort / 40)} semaines)\n`;

    return section;
  }

  private section9_Plan(efforts: ProgramEffort[], jclJobs: JclJob[]): string {
    let section = `## 9. Plan de migration proposé\n\n`;

    // Phase 1 : programmes simples (REPLACE/REHOST)
    const phase1 = efforts.filter(e => e.strategy === 'REPLACE' || e.strategy === 'REHOST');
    // Phase 2 : REFACTOR
    const phase2 = efforts.filter(e => e.strategy === 'REFACTOR');
    // Phase 3 : REWRITE
    const phase3 = efforts.filter(e => e.strategy === 'REWRITE');

    if (phase1.length > 0) {
      section += `### Phase 1 — Quick Wins (${phase1.reduce((s, e) => s + e.effortJH, 0)} j/h)\n\n`;
      section += `Programmes simples à migrer en premier pour démontrer la faisabilité.\n\n`;
      for (const e of phase1) section += `- ${e.programId} (${e.strategy}, ${e.effortJH} j/h)\n`;
      section += '\n';
    }

    if (phase2.length > 0) {
      section += `### Phase 2 — Refactoring (${phase2.reduce((s, e) => s + e.effortJH, 0)} j/h)\n\n`;
      section += `Programmes avec accès DB2 à refactorer progressivement.\n\n`;
      for (const e of phase2) section += `- ${e.programId} (${e.strategy}, ${e.effortJH} j/h)\n`;
      section += '\n';
    }

    if (phase3.length > 0) {
      section += `### Phase 3 — Réécriture (${phase3.reduce((s, e) => s + e.effortJH, 0)} j/h)\n\n`;
      section += `Programmes complexes nécessitant une réécriture complète.\n\n`;
      for (const e of phase3) section += `- ${e.programId} (${e.strategy}, ${e.effortJH} j/h)\n`;
      section += '\n';
    }

    return section;
  }

  private section10_Annexes(programs: CobolProgramIR[], techs: CobolTechDetection[]): string {
    let section = `## 10. Annexes\n\n`;

    // Liste des COPYBOOK
    const allCopybooks = [...new Set(programs.flatMap(p => p.copybooks))];
    if (allCopybooks.length > 0) {
      section += `### A. Liste des COPYBOOK\n\n${allCopybooks.map(c => `- ${c}`).join('\n')}\n\n`;
    }

    // Liste des tables DB2
    const allTables = [...new Set(programs.flatMap(p => p.sqlStatements.flatMap(s => s.tables)))];
    if (allTables.length > 0) {
      section += `### B. Liste des tables DB2\n\n${allTables.map(t => `- ${t}`).join('\n')}\n\n`;
    }

    // Liste des fichiers
    const allFiles = programs.flatMap(p => p.fileDescriptions);
    if (allFiles.length > 0) {
      section += `### C. Liste des fichiers\n\n`;
      for (const f of allFiles) {
        section += `- ${f.name} (${f.type}${f.keyField ? `, clé: ${f.keyField}` : ''})\n`;
      }
    }

    return section;
  }
}
