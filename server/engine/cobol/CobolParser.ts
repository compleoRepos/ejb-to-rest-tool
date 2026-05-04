/**
 * CobolParser.ts — Parser COBOL regex-based
 * 
 * Approche pragmatique : regex couvrant 90% des cas COBOL standard.
 * Colonnes COBOL : 1-6 = numéro de ligne, 7 = indicateur (* = commentaire), 8-72 = code, 73-80 = ignored.
 * 
 * @module server/engine/cobol
 */

// ─── Interfaces IR ──────────────────────────────────────────────────────────

export interface CobolProgramIR {
  programId: string;
  fileName: string;
  divisions: {
    identification: boolean;
    environment: boolean;
    data: boolean;
    procedure: boolean;
  };
  dataItems: CobolDataItem[];
  copybooks: string[];
  fileDescriptions: CobolFileDesc[];
  sections: CobolSection[];
  performCalls: string[];
  callStatements: CobolCall[];
  sqlStatements: CobolSQL[];
  loc: number;
  commentLines: number;
  dataItemCount: number;
  paragraphCount: number;
  complexity: number;
}

export interface CobolDataItem {
  level: string;
  name: string;
  picture: string | null;
  usage: string | null;
  occurs: number | null;
  redefines: string | null;
  value: string | null;
}

export interface CobolSQL {
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CURSOR' | 'CALL' | 'OTHER';
  sql: string;
  tables: string[];
  cursors: string[];
  hostVars: string[];
  lineNumber: number;
}

export interface CobolCall {
  target: string;
  using: string[];
  lineNumber: number;
}

export interface CobolFileDesc {
  name: string;
  type: 'SEQUENTIAL' | 'INDEXED' | 'RELATIVE' | 'VSAM' | 'UNKNOWN';
  recordName: string;
  organization: string | null;
  accessMode: string | null;
  keyField: string | null;
}

export interface CobolSection {
  name: string;
  type: 'SECTION' | 'PARAGRAPH';
  statements: number;
  performs: string[];
  calls: CobolCall[];
  sqlCount: number;
  lineStart: number;
  lineEnd: number;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

export class CobolParser {
  /**
   * Parse un fichier COBOL et retourne l'IR.
   */
  parse(content: string, fileName: string): CobolProgramIR {
    const lines = content.split('\n');
    const codeLines = this.extractCodeLines(lines);
    const fullCode = codeLines.join('\n');

    const programId = this.extractProgramId(fullCode);
    const divisions = this.detectDivisions(fullCode);
    const dataItems = this.extractDataItems(codeLines);
    const copybooks = this.extractCopybooks(fullCode);
    const fileDescriptions = this.extractFileDescriptions(codeLines, fullCode);
    const sqlStatements = this.extractSqlStatements(codeLines);
    const callStatements = this.extractCallStatements(codeLines);
    const performCalls = this.extractPerformCalls(fullCode);
    const sections = this.extractSections(codeLines);
    const commentLines = this.countCommentLines(lines);
    const complexity = this.calculateComplexity(codeLines, sqlStatements, callStatements);

    return {
      programId,
      fileName,
      divisions,
      dataItems,
      copybooks,
      fileDescriptions,
      sections,
      performCalls,
      callStatements,
      sqlStatements,
      loc: codeLines.length,
      commentLines,
      dataItemCount: dataItems.length,
      paragraphCount: sections.length,
      complexity,
    };
  }

  /**
   * Extrait les lignes de code (ignore colonnes 1-6, indicateur col 7, et colonnes 73+).
   * Les lignes avec '*' ou '/' en col 7 sont des commentaires.
   */
  private extractCodeLines(lines: string[]): string[] {
    const codeLines: string[] = [];
    for (const line of lines) {
      if (line.length < 7) {
        codeLines.push('');
        continue;
      }
      const indicator = line.charAt(6);
      if (indicator === '*' || indicator === '/' || indicator === 'D' || indicator === 'd') {
        continue; // commentaire ou debug
      }
      // Extraire colonnes 7-72 (index 7 à 72)
      const codePart = line.substring(7, Math.min(line.length, 72)).trimEnd();
      codeLines.push(codePart);
    }
    return codeLines;
  }

  private countCommentLines(lines: string[]): number {
    let count = 0;
    for (const line of lines) {
      if (line.length >= 7 && (line.charAt(6) === '*' || line.charAt(6) === '/')) {
        count++;
      }
    }
    return count;
  }

  private extractProgramId(code: string): string {
    const match = code.match(/PROGRAM-ID\.\s+([A-Za-z0-9-]+)/i);
    return match ? match[1] : 'UNKNOWN';
  }

  private detectDivisions(code: string): CobolProgramIR['divisions'] {
    return {
      identification: /IDENTIFICATION\s+DIVISION/i.test(code),
      environment: /ENVIRONMENT\s+DIVISION/i.test(code),
      data: /DATA\s+DIVISION/i.test(code),
      procedure: /PROCEDURE\s+DIVISION/i.test(code),
    };
  }

  /**
   * Extrait les data items (niveaux 01-88) avec PIC, USAGE, OCCURS, REDEFINES, VALUE.
   */
  extractDataItems(codeLines: string[]): CobolDataItem[] {
    const items: CobolDataItem[] = [];
    const dataItemRegex = /^\s*(\d{2})\s+([A-Za-z0-9-]+)/;

    let inDataDivision = false;
    let inProcedureDivision = false;

    for (const line of codeLines) {
      if (/DATA\s+DIVISION/i.test(line)) inDataDivision = true;
      if (/PROCEDURE\s+DIVISION/i.test(line)) {
        inDataDivision = false;
        inProcedureDivision = true;
      }
      if (!inDataDivision || inProcedureDivision) continue;

      const match = line.match(dataItemRegex);
      if (!match) continue;

      const level = match[1];
      const name = match[2];
      if (name === 'FILLER') continue; // Skip FILLER items optionally

      const picture = this.extractPicture(line);
      const usage = this.extractUsage(line);
      const occurs = this.extractOccurs(line);
      const redefines = this.extractRedefines(line);
      const value = this.extractValue(line);

      items.push({ level, name, picture, usage, occurs, redefines, value });
    }
    return items;
  }

  private extractPicture(line: string): string | null {
    const match = line.match(/PIC(?:TURE)?\s+IS\s+(\S+)|PIC(?:TURE)?\s+(\S+)/i);
    if (!match) return null;
    let pic = (match[1] || match[2]).replace(/\.$/, '');
    return pic || null;
  }

  private extractUsage(line: string): string | null {
    const match = line.match(/USAGE\s+(?:IS\s+)?(\S+)|(?:COMP-3|COMP-5|COMP|BINARY|PACKED-DECIMAL|DISPLAY)/i);
    if (!match) return null;
    if (match[1]) return match[1].replace(/\.$/, '');
    return match[0].replace(/\.$/, '');
  }

  private extractOccurs(line: string): number | null {
    const match = line.match(/OCCURS\s+(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  private extractRedefines(line: string): string | null {
    const match = line.match(/REDEFINES\s+([A-Za-z0-9-]+)/i);
    return match ? match[1] : null;
  }

  private extractValue(line: string): string | null {
    const match = line.match(/VALUE\s+(?:IS\s+)?(.+?)(?:\.|$)/i);
    if (!match) return null;
    return match[1].trim().replace(/\.$/, '') || null;
  }

  /**
   * Extrait les COPY statements.
   */
  extractCopybooks(code: string): string[] {
    const copies: string[] = [];
    const regex = /COPY\s+([A-Za-z0-9-]+)/gi;
    let match;
    while ((match = regex.exec(code)) !== null) {
      copies.push(match[1]);
    }
    return [...new Set(copies)];
  }

  /**
   * Extrait les File Descriptions (FD) et les SELECT/ASSIGN.
   */
  extractFileDescriptions(codeLines: string[], fullCode: string): CobolFileDesc[] {
    const files: CobolFileDesc[] = [];
    const selectRegex = /SELECT\s+([A-Za-z0-9-]+)\s+ASSIGN\s+TO\s+([A-Za-z0-9-]+)/gi;
    const fileInfoMap = new Map<string, Partial<CobolFileDesc>>();

    // Parse SELECT statements for organization, access mode, key
    let match;
    while ((match = selectRegex.exec(fullCode)) !== null) {
      const fileName = match[1];
      const info: Partial<CobolFileDesc> = { name: fileName };

      // Check organization
      const orgRegex = new RegExp(`SELECT\\s+${fileName}[\\s\\S]*?(?=SELECT|DATA\\s+DIVISION)`, 'i');
      const selectBlock = fullCode.match(orgRegex)?.[0] || '';

      const orgMatch = selectBlock.match(/ORGANIZATION\s+IS\s+(\S+)/i);
      if (orgMatch) info.organization = orgMatch[1].replace(/\.$/, '');

      const accessMatch = selectBlock.match(/ACCESS\s+MODE\s+IS\s+(\S+)/i);
      if (accessMatch) info.accessMode = accessMatch[1].replace(/\.$/, '');

      const keyMatch = selectBlock.match(/RECORD\s+KEY\s+IS\s+([A-Za-z0-9-]+)/i);
      if (keyMatch) info.keyField = keyMatch[1];

      // Determine type
      if (info.organization?.toUpperCase() === 'INDEXED') {
        info.type = 'INDEXED';
      } else if (info.organization?.toUpperCase() === 'RELATIVE') {
        info.type = 'RELATIVE';
      } else {
        info.type = 'SEQUENTIAL';
      }

      fileInfoMap.set(fileName, info);
    }

    // Parse FD statements for record names
    const fdRegex = /^\s*FD\s+([A-Za-z0-9-]+)/i;
    for (let i = 0; i < codeLines.length; i++) {
      const fdMatch = codeLines[i].match(fdRegex);
      if (!fdMatch) continue;

      const fdName = fdMatch[1];
      let recordName = '';

      // Look for 01 level after FD
      for (let j = i + 1; j < Math.min(i + 5, codeLines.length); j++) {
        const recMatch = codeLines[j].match(/^\s*01\s+([A-Za-z0-9-]+)/);
        if (recMatch) {
          recordName = recMatch[1];
          break;
        }
      }

      const existing = fileInfoMap.get(fdName) || {};
      files.push({
        name: fdName,
        type: (existing.type as CobolFileDesc['type']) || 'UNKNOWN',
        recordName,
        organization: existing.organization || null,
        accessMode: existing.accessMode || null,
        keyField: existing.keyField || null,
      });
    }

    return files;
  }

  /**
   * Extrait les EXEC SQL ... END-EXEC.
   */
  extractSqlStatements(codeLines: string[]): CobolSQL[] {
    const statements: CobolSQL[] = [];
    const fullCode = codeLines.join('\n');
    const sqlRegex = /EXEC\s+SQL([\s\S]*?)END-EXEC/gi;

    let match;
    while ((match = sqlRegex.exec(fullCode)) !== null) {
      const sqlBody = match[1].trim();
      const lineNumber = fullCode.substring(0, match.index).split('\n').length;

      const type = this.classifySqlType(sqlBody);
      const tables = this.extractSqlTables(sqlBody);
      const cursors = this.extractCursors(sqlBody);
      const hostVars = this.extractHostVars(sqlBody);

      statements.push({
        type,
        sql: sqlBody,
        tables,
        cursors,
        hostVars,
        lineNumber,
      });
    }
    return statements;
  }

  private classifySqlType(sql: string): CobolSQL['type'] {
    const upper = sql.toUpperCase().trim();
    if (upper.startsWith('SELECT') || upper.startsWith('FETCH')) return 'SELECT';
    if (upper.startsWith('INSERT')) return 'INSERT';
    if (upper.startsWith('UPDATE')) return 'UPDATE';
    if (upper.startsWith('DELETE')) return 'DELETE';
    if (upper.includes('CURSOR') || upper.startsWith('DECLARE') || upper.startsWith('OPEN') || upper.startsWith('CLOSE')) return 'CURSOR';
    if (upper.startsWith('CALL')) return 'CALL';
    return 'OTHER';
  }

  private extractSqlTables(sql: string): string[] {
    const tables: Set<string> = new Set();
    // FROM table, JOIN table, INTO table, UPDATE table
    const patterns = [
      /FROM\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
      /JOIN\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
      /INTO\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
      /UPDATE\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
      /INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
      /DELETE\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
    ];
    for (const pattern of patterns) {
      let m;
      while ((m = pattern.exec(sql)) !== null) {
        const table = m[1].toUpperCase();
        // Filter out SQL keywords that might match
        if (!['INTO', 'FROM', 'WHERE', 'SET', 'VALUES', 'SELECT', 'NULL'].includes(table)) {
          tables.add(table);
        }
      }
    }
    return [...tables];
  }

  private extractCursors(sql: string): string[] {
    const cursors: string[] = [];
    const regex = /(?:DECLARE|OPEN|CLOSE|FETCH)\s+([A-Za-z0-9-]+)\s+(?:CURSOR|RECORD)?/gi;
    let match;
    while ((match = regex.exec(sql)) !== null) {
      cursors.push(match[1]);
    }
    return [...new Set(cursors)];
  }

  private extractHostVars(sql: string): string[] {
    const vars: Set<string> = new Set();
    const regex = /:([A-Za-z0-9-]+)/g;
    let match;
    while ((match = regex.exec(sql)) !== null) {
      vars.add(match[1]);
    }
    return [...vars];
  }

  /**
   * Extrait les CALL statements.
   */
  extractCallStatements(codeLines: string[]): CobolCall[] {
    const calls: CobolCall[] = [];
    const callRegex = /CALL\s+['"]?([A-Za-z0-9-]+)['"]?(?:\s+USING\s+(.*))?/i;

    for (let i = 0; i < codeLines.length; i++) {
      const match = codeLines[i].match(callRegex);
      if (!match) continue;

      const target = match[1];
      const usingStr = match[2] || '';
      const using = usingStr
        .split(/[\s,]+/)
        .filter(s => s.length > 0 && s !== '.')
        .map(s => s.replace(/\.$/, ''));

      calls.push({ target, using, lineNumber: i + 1 });
    }
    return calls;
  }

  /**
   * Extrait les PERFORM calls.
   */
  extractPerformCalls(code: string): string[] {
    const performs: Set<string> = new Set();
    const regex = /PERFORM\s+([A-Za-z0-9-]+)/gi;
    let match;
    while ((match = regex.exec(code)) !== null) {
      const target = match[1].toUpperCase();
      if (!['UNTIL', 'VARYING', 'WITH', 'TIMES', 'TEST'].includes(target)) {
        performs.add(match[1]);
      }
    }
    return [...performs];
  }

  /**
   * Extrait les sections et paragraphes de la PROCEDURE DIVISION.
   */
  extractSections(codeLines: string[]): CobolSection[] {
    const sections: CobolSection[] = [];
    let inProcedure = false;
    let currentSection: Partial<CobolSection> | null = null;

    const sectionRegex = /^\s*([A-Za-z0-9-]+)\s+SECTION\s*\.?\s*$/i;
    const paragraphRegex = /^\s*([A-Za-z0-9-]+)\s*\.\s*$/;

    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];

      if (/PROCEDURE\s+DIVISION/i.test(line)) {
        inProcedure = true;
        continue;
      }
      if (!inProcedure) continue;

      // Detect SECTION
      const secMatch = line.match(sectionRegex);
      if (secMatch) {
        if (currentSection) {
          currentSection.lineEnd = i;
          sections.push(this.finalizeSection(currentSection, codeLines));
        }
        currentSection = {
          name: secMatch[1],
          type: 'SECTION',
          lineStart: i + 1,
          performs: [],
          calls: [],
        };
        continue;
      }

      // Detect PARAGRAPH (name followed by period, at start of line)
      const paraMatch = line.match(paragraphRegex);
      if (paraMatch && !line.match(/^\s*(IF|ELSE|END-|EVALUATE|WHEN|PERFORM|MOVE|COMPUTE|ADD|SUBTRACT|MULTIPLY|DIVIDE|DISPLAY|ACCEPT|READ|WRITE|OPEN|CLOSE|CALL|EXEC|STOP|GO|STRING|INSPECT|UNSTRING|SET|INITIALIZE)/i)) {
        if (currentSection) {
          currentSection.lineEnd = i;
          sections.push(this.finalizeSection(currentSection, codeLines));
        }
        currentSection = {
          name: paraMatch[1],
          type: 'PARAGRAPH',
          lineStart: i + 1,
          performs: [],
          calls: [],
        };
        continue;
      }
    }

    // Close last section
    if (currentSection) {
      currentSection.lineEnd = codeLines.length;
      sections.push(this.finalizeSection(currentSection, codeLines));
    }

    return sections;
  }

  private finalizeSection(partial: Partial<CobolSection>, codeLines: string[]): CobolSection {
    const start = partial.lineStart! - 1;
    const end = partial.lineEnd || codeLines.length;
    const sectionLines = codeLines.slice(start, end);
    const sectionCode = sectionLines.join('\n');

    // Count statements (rough: non-empty lines that aren't section/paragraph headers)
    const statements = sectionLines.filter(l => l.trim().length > 0).length;

    // Extract PERFORMs within this section
    const performs: string[] = [];
    const perfRegex = /PERFORM\s+([A-Za-z0-9-]+)/gi;
    let m;
    while ((m = perfRegex.exec(sectionCode)) !== null) {
      if (!['UNTIL', 'VARYING', 'WITH', 'TIMES', 'TEST'].includes(m[1].toUpperCase())) {
        performs.push(m[1]);
      }
    }

    // Extract CALLs within this section
    const calls: CobolCall[] = [];
    const callRegex = /CALL\s+['"]?([A-Za-z0-9-]+)['"]?(?:\s+USING\s+(.*))?/gi;
    while ((m = callRegex.exec(sectionCode)) !== null) {
      const using = (m[2] || '').split(/[\s,]+/).filter(s => s.length > 0 && s !== '.');
      calls.push({ target: m[1], using, lineNumber: start + 1 });
    }

    // Count SQL
    const sqlCount = (sectionCode.match(/EXEC\s+SQL/gi) || []).length;

    return {
      name: partial.name!,
      type: partial.type!,
      statements,
      performs,
      calls,
      sqlCount,
      lineStart: partial.lineStart!,
      lineEnd: end,
    };
  }

  /**
   * Calcule la complexité cyclomatique (McCabe-like).
   * Basé sur : IF, EVALUATE/WHEN, PERFORM UNTIL, GO TO, EXEC SQL, CALL
   */
  calculateComplexity(codeLines: string[], sql: CobolSQL[], calls: CobolCall[]): number {
    let complexity = 1; // Base

    const code = codeLines.join('\n');

    // Decision points
    complexity += (code.match(/\bIF\b/gi) || []).length;
    complexity += (code.match(/\bEVALUATE\b/gi) || []).length;
    complexity += (code.match(/\bWHEN\b/gi) || []).length;
    complexity += (code.match(/\bPERFORM\s+\S+\s+UNTIL\b/gi) || []).length;
    complexity += (code.match(/\bGO\s+TO\b/gi) || []).length * 2; // GO TO adds extra complexity

    // External interactions
    complexity += sql.length;
    complexity += calls.length;

    return complexity;
  }
}
