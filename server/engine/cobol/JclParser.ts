/**
 * JclParser.ts — Parser JCL (Job Control Language)
 * 
 * Extrait les jobs, steps et DD statements des fichiers JCL.
 * Format JCL : lignes commençant par // (sauf //* = commentaire)
 * 
 * @module server/engine/cobol
 */

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface JclJob {
  jobName: string;
  steps: JclStep[];
  jobClass: string | null;
  msgClass: string | null;
  conditions: string[];
}

export interface JclStep {
  stepName: string;
  program: string;
  ddStatements: JclDD[];
  condition: string | null;
  region: string | null;
}

export interface JclDD {
  name: string;
  dsn: string;
  disp: string;
  type: 'INPUT' | 'OUTPUT' | 'INOUT' | 'SYSOUT';
}

// ─── Parser ─────────────────────────────────────────────────────────────────

export class JclParser {
  /**
   * Parse un fichier JCL et retourne les jobs extraits.
   */
  parse(content: string, fileName: string): JclJob[] {
    const lines = this.preprocessLines(content);
    const jobs: JclJob[] = [];
    let currentJob: JclJob | null = null;
    let currentStep: JclStep | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments
      if (line.startsWith('//*')) continue;
      if (!line.startsWith('//')) continue;

      // JOB statement
      const jobMatch = line.match(/^\/\/([A-Za-z0-9#$@]{1,8})\s+JOB\s*(.*)/i);
      if (jobMatch) {
        if (currentJob) {
          if (currentStep) {
            currentJob.steps.push(currentStep);
            currentStep = null;
          }
          jobs.push(currentJob);
        }
        currentJob = {
          jobName: jobMatch[1],
          steps: [],
          jobClass: this.extractParam(jobMatch[2], 'CLASS'),
          msgClass: this.extractParam(jobMatch[2], 'MSGCLASS'),
          conditions: [],
        };
        continue;
      }

      // EXEC statement (step)
      const execMatch = line.match(/^\/\/([A-Za-z0-9#$@]{1,8})\s+EXEC\s+(.*)/i);
      if (execMatch) {
        if (currentStep && currentJob) {
          currentJob.steps.push(currentStep);
        }

        const execParams = execMatch[2];
        const program = this.extractProgram(execParams);
        const condition = this.extractParam(execParams, 'COND');
        const region = this.extractParam(execParams, 'REGION');

        currentStep = {
          stepName: execMatch[1],
          program,
          ddStatements: [],
          condition,
          region,
        };
        continue;
      }

      // DD statement
      const ddMatch = line.match(/^\/\/([A-Za-z0-9#$@]{1,8})\s+DD\s+(.*)/i);
      if (ddMatch && currentStep) {
        const ddName = ddMatch[1];
        const ddParams = ddMatch[2];

        // Collect continuation lines
        let fullParams = ddParams;
        while (i + 1 < lines.length && lines[i + 1].match(/^\/\/\s{9,}/)) {
          i++;
          fullParams += lines[i].substring(2).trim();
        }

        const dd = this.parseDDStatement(ddName, fullParams);
        currentStep.ddStatements.push(dd);
        continue;
      }
    }

    // Close last step and job
    if (currentStep && currentJob) {
      currentJob.steps.push(currentStep);
    }
    if (currentJob) {
      jobs.push(currentJob);
    }

    return jobs;
  }

  /**
   * Prétraite les lignes JCL : gère les continuations (lignes terminant par ,)
   */
  private preprocessLines(content: string): string[] {
    const rawLines = content.split('\n').map(l => l.trimEnd());
    const merged: string[] = [];

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      // Continuation line: starts with // followed by spaces (no label)
      if (line.match(/^\/\/\s{2,}/) && !line.startsWith('//*') && merged.length > 0) {
        // Append continuation to previous line
        const continuation = line.replace(/^\/\/\s+/, '');
        merged[merged.length - 1] += ',' + continuation;
      } else {
        merged.push(line);
      }
    }

    return merged;
  }

  /**
   * Extrait un paramètre nommé d'une chaîne JCL (ex: CLASS=A)
   */
  private extractParam(params: string, name: string): string | null {
    const regex = new RegExp(`${name}=([^,)\\s]+)`, 'i');
    const match = params.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Extrait le nom du programme depuis EXEC PGM=xxx ou EXEC procname
   */
  private extractProgram(execParams: string): string {
    // PGM=PROGNAME
    const pgmMatch = execParams.match(/PGM=([A-Za-z0-9#$@]+)/i);
    if (pgmMatch) return pgmMatch[1];

    // PROC=PROCNAME or just PROCNAME
    const procMatch = execParams.match(/PROC=([A-Za-z0-9#$@]+)/i);
    if (procMatch) return procMatch[1];

    // First word (procedure name)
    const firstWord = execParams.match(/^([A-Za-z0-9#$@]+)/);
    if (firstWord) return firstWord[1];

    return 'UNKNOWN';
  }

  /**
   * Parse un DD statement et détermine son type (INPUT/OUTPUT/INOUT/SYSOUT).
   */
  private parseDDStatement(name: string, params: string): JclDD {
    // SYSOUT
    if (params.match(/SYSOUT=/i)) {
      return {
        name,
        dsn: '',
        disp: 'SYSOUT',
        type: 'SYSOUT',
      };
    }

    // DSN
    const dsnMatch = params.match(/DSN=([^,\s)]+)/i);
    const dsn = dsnMatch ? dsnMatch[1] : '';

    // DISP
    const dispMatch = params.match(/DISP=\(?([^,)\s]+)/i);
    const disp = dispMatch ? dispMatch[1].toUpperCase() : 'OLD';

    // Determine type based on DISP
    let type: JclDD['type'];
    switch (disp) {
      case 'SHR':
      case 'OLD':
        type = 'INPUT';
        break;
      case 'NEW':
        type = 'OUTPUT';
        break;
      case 'MOD':
        type = 'INOUT';
        break;
      default:
        // Check if it's a temp dataset
        if (dsn.startsWith('&&') || dsn === '') {
          type = 'OUTPUT';
        } else {
          type = 'INPUT';
        }
    }

    return { name, dsn, disp, type };
  }
}
