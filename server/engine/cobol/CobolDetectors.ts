/**
 * CobolDetectors.ts — Détecteurs de technologies mainframe
 * 
 * Détecte les technologies utilisées dans les programmes COBOL :
 * DB2, CICS, VSAM, IMS/DL1, MQ Series, SORT, Batch, COBOL version.
 * 
 * @module server/engine/cobol
 */

import type { CobolProgramIR, CobolSQL } from './CobolParser';
import type { JclJob } from './JclParser';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface CobolTechDetection {
  technology: string;
  detected: boolean;
  count: number;
  programs: string[];
  details: string[];
  migrationImpact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  migrationNote: string;
}

// ─── Détecteurs ─────────────────────────────────────────────────────────────

export class CobolDetectors {
  /**
   * Exécute tous les détecteurs sur un ensemble de programmes COBOL.
   */
  detectAll(programs: CobolProgramIR[], jclJobs: JclJob[]): CobolTechDetection[] {
    return [
      this.detectDB2(programs),
      this.detectCICS(programs),
      this.detectVSAM(programs),
      this.detectIMS(programs),
      this.detectMQSeries(programs),
      this.detectSORT(programs, jclJobs),
      this.detectBatch(programs, jclJobs),
      this.detectCobolVersion(programs),
    ];
  }

  /**
   * Détecte l'utilisation de DB2 (EXEC SQL, INCLUDE SQLCA, curseurs).
   */
  detectDB2(programs: CobolProgramIR[]): CobolTechDetection {
    const detectedPrograms: string[] = [];
    const details: string[] = [];
    let totalCount = 0;
    const allTables = new Set<string>();
    const allCursors = new Set<string>();

    for (const prog of programs) {
      if (prog.sqlStatements.length === 0 && !prog.copybooks.includes('SQLCA')) continue;

      detectedPrograms.push(prog.programId);
      totalCount += prog.sqlStatements.length;

      for (const sql of prog.sqlStatements) {
        sql.tables.forEach(t => allTables.add(t));
        sql.cursors.forEach(c => allCursors.add(c));
      }
    }

    if (allTables.size > 0) {
      details.push(`Tables: ${[...allTables].join(', ')}`);
    }
    if (allCursors.size > 0) {
      details.push(`Curseurs: ${[...allCursors].join(', ')}`);
    }

    const selectCount = programs.flatMap(p => p.sqlStatements).filter(s => s.type === 'SELECT').length;
    const insertCount = programs.flatMap(p => p.sqlStatements).filter(s => s.type === 'INSERT').length;
    const updateCount = programs.flatMap(p => p.sqlStatements).filter(s => s.type === 'UPDATE').length;
    const deleteCount = programs.flatMap(p => p.sqlStatements).filter(s => s.type === 'DELETE').length;

    if (totalCount > 0) {
      details.push(`Requêtes: ${selectCount} SELECT, ${insertCount} INSERT, ${updateCount} UPDATE, ${deleteCount} DELETE`);
    }

    return {
      technology: 'DB2',
      detected: detectedPrograms.length > 0,
      count: totalCount,
      programs: detectedPrograms,
      details,
      migrationImpact: 'CRITICAL',
      migrationNote: detectedPrograms.length > 0
        ? `DB2 → JPA/Spring Data, ${allTables.size} tables détectées, ${allCursors.size} curseurs à convertir en requêtes paginées`
        : 'Aucun accès DB2 détecté',
    };
  }

  /**
   * Détecte l'utilisation de CICS (EXEC CICS, DFHCOMMAREA, HANDLE CONDITION).
   */
  detectCICS(programs: CobolProgramIR[]): CobolTechDetection {
    const detectedPrograms: string[] = [];
    const details: string[] = [];
    let totalCount = 0;
    const cicsCommands = new Set<string>();

    for (const prog of programs) {
      const code = this.getProgramCode(prog);
      const cicsMatches = code.match(/EXEC\s+CICS\s+(\w+)/gi);

      if (!cicsMatches && !code.includes('DFHCOMMAREA') && !code.includes('DFHAID')) continue;

      detectedPrograms.push(prog.programId);

      if (cicsMatches) {
        totalCount += cicsMatches.length;
        for (const m of cicsMatches) {
          const cmd = m.match(/EXEC\s+CICS\s+(\w+)/i)?.[1];
          if (cmd) cicsCommands.add(cmd.toUpperCase());
        }
      }

      // Detect COMMAREA usage
      if (code.includes('DFHCOMMAREA')) {
        details.push(`${prog.programId}: utilise DFHCOMMAREA (online)`);
      }
    }

    if (cicsCommands.size > 0) {
      details.push(`Commandes CICS: ${[...cicsCommands].join(', ')}`);
    }

    const hasTransactional = cicsCommands.has('SYNCPOINT') || cicsCommands.has('RETURN');
    const hasScreen = cicsCommands.has('SEND') || cicsCommands.has('RECEIVE');

    return {
      technology: 'CICS',
      detected: detectedPrograms.length > 0,
      count: totalCount,
      programs: detectedPrograms,
      details,
      migrationImpact: 'CRITICAL',
      migrationNote: detectedPrograms.length > 0
        ? `CICS → Spring MVC/REST API. ${hasScreen ? 'Écrans BMS → Frontend React. ' : ''}${hasTransactional ? 'SYNCPOINT → @Transactional. ' : ''}${detectedPrograms.length} programmes online à convertir`
        : 'Aucun programme CICS détecté',
    };
  }

  /**
   * Détecte l'utilisation de VSAM (ORGANIZATION IS INDEXED, READ KEY, START).
   */
  detectVSAM(programs: CobolProgramIR[]): CobolTechDetection {
    const detectedPrograms: string[] = [];
    const details: string[] = [];
    let totalCount = 0;

    for (const prog of programs) {
      const vsamFiles = prog.fileDescriptions.filter(
        f => f.type === 'INDEXED' || f.type === 'RELATIVE' || f.type === 'VSAM'
      );

      if (vsamFiles.length === 0) continue;

      detectedPrograms.push(prog.programId);
      totalCount += vsamFiles.length;

      for (const f of vsamFiles) {
        details.push(`${prog.programId}: ${f.name} (${f.type}, clé: ${f.keyField || 'N/A'})`);
      }
    }

    return {
      technology: 'VSAM',
      detected: detectedPrograms.length > 0,
      count: totalCount,
      programs: detectedPrograms,
      details,
      migrationImpact: 'HIGH',
      migrationNote: detectedPrograms.length > 0
        ? `VSAM → Tables relationnelles (JPA). ${totalCount} fichiers VSAM à migrer vers des tables avec index`
        : 'Aucun fichier VSAM détecté',
    };
  }

  /**
   * Détecte l'utilisation d'IMS/DL1 (EXEC DLI, GU, GN, ISRT, segments).
   */
  detectIMS(programs: CobolProgramIR[]): CobolTechDetection {
    const detectedPrograms: string[] = [];
    const details: string[] = [];
    let totalCount = 0;

    for (const prog of programs) {
      const code = this.getProgramCode(prog);
      const dliMatches = code.match(/EXEC\s+DLI/gi);
      const imsCommands = code.match(/\b(GU|GN|GNP|GHU|GHN|ISRT|DLET|REPL)\b/g);

      if (!dliMatches && !imsCommands) continue;

      detectedPrograms.push(prog.programId);
      totalCount += (dliMatches?.length || 0) + (imsCommands?.length || 0);

      if (imsCommands) {
        const uniqueCmds = [...new Set(imsCommands)];
        details.push(`${prog.programId}: commandes DL/I: ${uniqueCmds.join(', ')}`);
      }
    }

    return {
      technology: 'IMS/DL1',
      detected: detectedPrograms.length > 0,
      count: totalCount,
      programs: detectedPrograms,
      details,
      migrationImpact: 'HIGH',
      migrationNote: detectedPrograms.length > 0
        ? `IMS/DL1 → JPA avec modèle relationnel. Structure hiérarchique à aplatir en tables. Complexité élevée.`
        : 'Aucun accès IMS/DL1 détecté',
    };
  }

  /**
   * Détecte l'utilisation de MQ Series (CALL CSQBPUT, MQPUT, MQGET).
   */
  detectMQSeries(programs: CobolProgramIR[]): CobolTechDetection {
    const detectedPrograms: string[] = [];
    const details: string[] = [];
    let totalCount = 0;

    for (const prog of programs) {
      const code = this.getProgramCode(prog);
      const mqMatches = code.match(/\b(MQPUT|MQGET|MQOPEN|MQCLOSE|CSQBPUT|CSQBGET|MQCONN|MQDISC)\b/gi);
      const mqCalls = prog.callStatements.filter(c =>
        c.target.match(/^(CSQB|MQ)/i)
      );

      if (!mqMatches && mqCalls.length === 0) continue;

      detectedPrograms.push(prog.programId);
      totalCount += (mqMatches?.length || 0) + mqCalls.length;

      if (mqMatches) {
        const uniqueOps = [...new Set(mqMatches.map(m => m.toUpperCase()))];
        details.push(`${prog.programId}: opérations MQ: ${uniqueOps.join(', ')}`);
      }
    }

    return {
      technology: 'MQ Series',
      detected: detectedPrograms.length > 0,
      count: totalCount,
      programs: detectedPrograms,
      details,
      migrationImpact: 'MEDIUM',
      migrationNote: detectedPrograms.length > 0
        ? `MQ Series → Spring JMS/RabbitMQ/Kafka. ${totalCount} opérations messaging à migrer`
        : 'Aucune utilisation MQ Series détectée',
    };
  }

  /**
   * Détecte l'utilisation de SORT (SORT FIELDS, MERGE, PGM=SORT dans JCL).
   */
  detectSORT(programs: CobolProgramIR[], jclJobs: JclJob[]): CobolTechDetection {
    const detectedPrograms: string[] = [];
    const details: string[] = [];
    let totalCount = 0;

    for (const prog of programs) {
      const code = this.getProgramCode(prog);
      const sortMatches = code.match(/\bSORT\s+\S+/gi);
      const mergeMatches = code.match(/\bMERGE\s+\S+/gi);

      if (!sortMatches && !mergeMatches) continue;

      detectedPrograms.push(prog.programId);
      totalCount += (sortMatches?.length || 0) + (mergeMatches?.length || 0);
      details.push(`${prog.programId}: ${sortMatches?.length || 0} SORT, ${mergeMatches?.length || 0} MERGE`);
    }

    // Check JCL for SORT utilities
    for (const job of jclJobs) {
      for (const step of job.steps) {
        if (step.program.match(/^(SORT|DFSORT|ICEMAN|SYNCSORT)/i)) {
          totalCount++;
          details.push(`JCL ${job.jobName}/${step.stepName}: PGM=${step.program}`);
        }
      }
    }

    return {
      technology: 'SORT',
      detected: totalCount > 0,
      count: totalCount,
      programs: detectedPrograms,
      details,
      migrationImpact: 'MEDIUM',
      migrationNote: totalCount > 0
        ? `SORT → Java Stream.sorted() / SQL ORDER BY. ${totalCount} opérations de tri à migrer`
        : 'Aucune opération SORT détectée',
    };
  }

  /**
   * Détecte les patterns batch (JCL avec EXEC PGM, COND, RESTART).
   */
  detectBatch(programs: CobolProgramIR[], jclJobs: JclJob[]): CobolTechDetection {
    const details: string[] = [];
    let totalSteps = 0;
    const batchPrograms: string[] = [];

    for (const job of jclJobs) {
      totalSteps += job.steps.length;
      details.push(`Job ${job.jobName}: ${job.steps.length} steps`);

      for (const step of job.steps) {
        if (!batchPrograms.includes(step.program)) {
          batchPrograms.push(step.program);
        }
      }
    }

    // Programs not in CICS are batch by default
    const nonCicsPrograms = programs.filter(p => {
      const code = this.getProgramCode(p);
      return !code.includes('EXEC CICS') && !code.includes('DFHCOMMAREA');
    });

    for (const prog of nonCicsPrograms) {
      if (!batchPrograms.includes(prog.programId)) {
        batchPrograms.push(prog.programId);
      }
    }

    return {
      technology: 'Batch',
      detected: jclJobs.length > 0 || nonCicsPrograms.length > 0,
      count: totalSteps,
      programs: batchPrograms,
      details,
      migrationImpact: 'HIGH',
      migrationNote: totalSteps > 0
        ? `Batch JCL → Spring Batch. ${jclJobs.length} jobs, ${totalSteps} steps à orchestrer. Scheduling via Quartz/cron.`
        : 'Programmes batch sans JCL → Spring Boot CLI ou @Scheduled',
    };
  }

  /**
   * Détecte la version COBOL (85 vs 74) basé sur les constructions utilisées.
   */
  detectCobolVersion(programs: CobolProgramIR[]): CobolTechDetection {
    const details: string[] = [];
    let cobol85Count = 0;
    let cobol74Count = 0;
    const cobol85Programs: string[] = [];

    for (const prog of programs) {
      const code = this.getProgramCode(prog);

      // COBOL 85 features
      const has85 = /\b(EVALUATE|END-IF|END-PERFORM|END-READ|END-EVALUATE|CONTINUE|INITIALIZE|STRING|INSPECT|REFERENCE)\b/i.test(code);
      // COBOL 74 indicators
      const has74 = /\bGO\s+TO\b/i.test(code) && !/\bEVALUATE\b/i.test(code);

      if (has85) {
        cobol85Count++;
        cobol85Programs.push(prog.programId);
      }
      if (has74) cobol74Count++;
    }

    const version = cobol85Count > cobol74Count ? 'COBOL 85+' : 'COBOL 74';
    details.push(`${cobol85Count} programmes COBOL 85+, ${cobol74Count} programmes COBOL 74 style`);

    return {
      technology: `COBOL Version (${version})`,
      detected: true,
      count: programs.length,
      programs: cobol85Programs,
      details,
      migrationImpact: 'LOW',
      migrationNote: version === 'COBOL 85+'
        ? 'COBOL 85 : structures modernes (EVALUATE, END-IF), migration plus directe vers Java'
        : 'COBOL 74 : GO TO fréquents, refactoring nécessaire avant migration',
    };
  }

  /**
   * Helper : reconstruit le code source à partir de l'IR pour la détection de patterns.
   * En production, on passerait le code source brut. Ici on utilise les sections.
   */
  protected getProgramCode(prog: CobolProgramIR): string {
    // Reconstruct from available data
    const parts: string[] = [];

    // Copybooks
    for (const cb of prog.copybooks) {
      parts.push(`COPY ${cb}`);
    }

    // SQL statements
    for (const sql of prog.sqlStatements) {
      parts.push(`EXEC SQL ${sql.sql} END-EXEC`);
    }

    // Call statements
    for (const call of prog.callStatements) {
      parts.push(`CALL '${call.target}' USING ${call.using.join(' ')}`);
    }

    // Section content (from performs)
    for (const sec of prog.sections) {
      parts.push(sec.name);
      for (const p of sec.performs) {
        parts.push(`PERFORM ${p}`);
      }
    }

    // PERFORM calls
    for (const p of prog.performCalls) {
      parts.push(`PERFORM ${p}`);
    }

    return parts.join('\n');
  }
}

/**
 * Version améliorée qui accepte le code source brut pour une détection plus précise.
 */
export class CobolDetectorsWithSource extends CobolDetectors {
  private sourceMap = new Map<string, string>();

  /**
   * Enregistre le code source brut d'un programme pour une détection précise.
   */
  registerSource(programId: string, source: string): void {
    this.sourceMap.set(programId, source);
  }

  protected override getProgramCode(prog: CobolProgramIR): string {
    return this.sourceMap.get(prog.programId) || super.getProgramCode(prog);
  }
}
