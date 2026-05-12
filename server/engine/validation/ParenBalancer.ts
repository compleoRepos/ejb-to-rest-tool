/**
 * ParenBalancer : équilibre les parenthèses dans les statements Java.
 * 
 * Cible le bug récurrent : log.info(...) ou autre appel multi-ligne où
 * le LLM oublie la parenthèse fermante avant `;`.
 * 
 * Stratégie : scanner ligne par ligne, suivre la profondeur des parens
 * (en ignorant strings/comments), et quand on rencontre un `;` avec
 * depth > 0, insérer le bon nombre de `)` juste avant.
 * 
 * @version 12.12
 */
export class ParenBalancer {

  balance(javaSource: string): { fixed: string; fixCount: number } {
    const lines = javaSource.split('\n');
    let depth = 0;
    let fixCount = 0;
    let inBlockComment = false;
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const lineEffect = this.scanLine(line, inBlockComment);
      depth += lineEffect.parenDelta;
      inBlockComment = lineEffect.endsInComment;

      // v13.10.1: Lambda/anonymous class blocks: when we see '-> {' or similar,
      // save the current paren depth and reset to 0 for the lambda body.
      // The depth will be restored when we encounter the closing '};'
      const trimmedLine = line.trim().replace(/\r$/, '');
      if (depth > 0 && (trimmedLine.includes('-> {') || trimmedLine.includes('-> {'))) {
        // Don't accumulate paren depth inside lambda bodies
        // The lambda opener has ( from the method call, but the ; inside the lambda
        // should not trigger paren insertion
        depth = 0;
      }

      // Si la ligne contient un `;` (en dehors string/comment) et qu'on est en déséquilibre positif
      const semiPos = this.findStatementTerminator(line);
      if (semiPos !== -1 && depth > 0) {
        // Insérer `depth` parenthèses fermantes juste avant le ;
        const closing = ')'.repeat(depth);
        line = line.substring(0, semiPos) + closing + line.substring(semiPos);
        fixCount += depth;
        depth = 0;
      } else if (semiPos !== -1) {
        // Statement terminé proprement
        depth = 0;
      }

      // v13.10: Also treat '{' as a method signature terminator
      // Pattern: method(@Param Type a,\n  @Param Type b { → insert ')' before '{'
      // But NOT for lambdas (lines containing '->')
      if (depth > 0 && semiPos === -1 && !line.includes('->')) {
        const bracePos = this.findOpenBrace(line);
        if (bracePos !== -1) {
          const closing = ')'.repeat(depth);
          line = line.substring(0, bracePos) + closing + ' ' + line.substring(bracePos);
          fixCount += depth;
          depth = 0;
        }
      }

      result.push(line);
    }

    return { fixed: result.join('\n'), fixCount };
  }

  /** Compte le delta de profondeur de parens dans une ligne, hors strings/comments */
  private scanLine(line: string, inBlockComment: boolean): { parenDelta: number; endsInComment: boolean } {
    let delta = 0;
    let inString = false;
    let inChar = false;
    let escape = false;
    let inComment = inBlockComment;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const next = line[i + 1];

      if (escape) { escape = false; continue; }

      if (inComment) {
        if (c === '*' && next === '/') { inComment = false; i++; }
        continue;
      }
      if (inString) {
        if (c === '\\') { escape = true; continue; }
        if (c === '"') inString = false;
        continue;
      }
      if (inChar) {
        if (c === '\\') { escape = true; continue; }
        if (c === "'") inChar = false;
        continue;
      }

      // Pas dans string/char/comment
      if (c === '/' && next === '/') break; // line comment
      if (c === '/' && next === '*') { inComment = true; i++; continue; }
      if (c === '"') { inString = true; continue; }
      if (c === "'") { inChar = true; continue; }
      if (c === '(') delta++;
      if (c === ')') delta--;
    }

    return { parenDelta: delta, endsInComment: inComment };
  }

  /** Trouve la position du `{` qui ouvre un bloc, hors strings/comments */
  private findOpenBrace(line: string): number {
    let inString = false;
    let inChar = false;
    let escape = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const next = line[i + 1];

      if (escape) { escape = false; continue; }

      if (inString) {
        if (c === '\\') { escape = true; continue; }
        if (c === '"') inString = false;
        continue;
      }
      if (inChar) {
        if (c === '\\') { escape = true; continue; }
        if (c === "'") inChar = false;
        continue;
      }

      if (c === '/' && next === '/') return -1;
      if (c === '"') { inString = true; continue; }
      if (c === "'") { inChar = true; continue; }
      if (c === '{') return i;
    }

    return -1;
  }

  /** Trouve la position du `;` qui termine le statement, hors strings/comments */
  private findStatementTerminator(line: string): number {
    let inString = false;
    let inChar = false;
    let escape = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const next = line[i + 1];

      if (escape) { escape = false; continue; }

      if (inString) {
        if (c === '\\') { escape = true; continue; }
        if (c === '"') inString = false;
        continue;
      }
      if (inChar) {
        if (c === '\\') { escape = true; continue; }
        if (c === "'") inChar = false;
        continue;
      }

      if (c === '/' && next === '/') return -1; // ; après commentaire n'existe pas
      if (c === '"') { inString = true; continue; }
      if (c === "'") { inChar = true; continue; }
      if (c === ';') return i;
    }

    return -1;
  }
}
