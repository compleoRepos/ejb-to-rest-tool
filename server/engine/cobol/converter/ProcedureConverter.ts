/**
 * ProcedureConverter.ts — COBOL SECTION/PERFORM → Java methods
 * Converts COBOL procedural flow to structured Java methods.
 *
 * Strategy:
 *   - Each SECTION/PARAGRAPH → private method
 *   - PERFORM X → this.x()
 *   - PERFORM X THRU Y → this.x() (with comment about range)
 *   - PERFORM X VARYING → for loop
 *   - PERFORM X UNTIL → while loop
 *   - PERFORM X TIMES → for loop with count
 *   - GO TO → (flagged as warning, converted to method call)
 *   - EVALUATE → switch/case
 *   - IF/ELSE → if/else
 *   - MOVE → assignment
 *   - COMPUTE → arithmetic expression
 *   - STRING/UNSTRING → StringBuilder / split
 *   - DISPLAY → log.info()
 *   - STOP RUN → System.exit(0) or return
 *
 * @author Compleo v11.1
 */

import { cobolNameToJava } from "./DataItemMapper";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JavaMethod {
  name: string;
  visibility: "public" | "private" | "protected";
  returnType: string;
  body: string[];
  parameters: { name: string; type: string }[];
  javadoc?: string;
  annotations?: string[];
}

export interface ConversionContext {
  programName: string;
  sections: string[];
  performCalls: string[];
  dataItems: Map<string, string>; // COBOL name → Java type
}

// ─── Statement Conversion ───────────────────────────────────────────────────

/**
 * Convert a single COBOL statement line to Java code.
 */
export function convertStatement(line: string, ctx: ConversionContext): string {
  const trimmed = line.trim();

  // MOVE X TO Y → y = x;
  const moveMatch = trimmed.match(/^MOVE\s+(.+?)\s+TO\s+(.+?)\.?$/i);
  if (moveMatch) {
    return convertMove(moveMatch[1], moveMatch[2]);
  }

  // COMPUTE X = expression
  const computeMatch = trimmed.match(/^COMPUTE\s+(.+?)\s*=\s*(.+?)\.?$/i);
  if (computeMatch) {
    return convertCompute(computeMatch[1], computeMatch[2]);
  }

  // ADD X TO Y
  const addMatch = trimmed.match(/^ADD\s+(.+?)\s+TO\s+(.+?)\.?$/i);
  if (addMatch) {
    return `${cobolNameToJava(addMatch[2].trim())} += ${convertOperand(addMatch[1].trim())};`;
  }

  // SUBTRACT X FROM Y
  const subtractMatch = trimmed.match(/^SUBTRACT\s+(.+?)\s+FROM\s+(.+?)\.?$/i);
  if (subtractMatch) {
    return `${cobolNameToJava(subtractMatch[2].trim())} -= ${convertOperand(subtractMatch[1].trim())};`;
  }

  // MULTIPLY X BY Y GIVING Z
  const multiplyMatch = trimmed.match(/^MULTIPLY\s+(.+?)\s+BY\s+(.+?)(?:\s+GIVING\s+(.+?))?\.?$/i);
  if (multiplyMatch) {
    const target = multiplyMatch[3] || multiplyMatch[2];
    return `${cobolNameToJava(target.trim())} = ${convertOperand(multiplyMatch[1].trim())} * ${convertOperand(multiplyMatch[2].trim())};`;
  }

  // DIVIDE X BY Y GIVING Z REMAINDER R
  const divideMatch = trimmed.match(/^DIVIDE\s+(.+?)\s+BY\s+(.+?)\s+GIVING\s+(.+?)(?:\s+REMAINDER\s+(.+?))?\.?$/i);
  if (divideMatch) {
    const code = `${cobolNameToJava(divideMatch[3].trim())} = ${convertOperand(divideMatch[1].trim())} / ${convertOperand(divideMatch[2].trim())};`;
    if (divideMatch[4]) {
      return code + `\n        ${cobolNameToJava(divideMatch[4].trim())} = ${convertOperand(divideMatch[1].trim())} % ${convertOperand(divideMatch[2].trim())};`;
    }
    return code;
  }

  // DISPLAY → log.info
  const displayMatch = trimmed.match(/^DISPLAY\s+(.+?)\.?$/i);
  if (displayMatch) {
    const content = displayMatch[1].replace(/"/g, '\\"');
    return `log.info("${content}");`;
  }

  // PERFORM X (simple call)
  const performMatch = trimmed.match(/^PERFORM\s+([A-Za-z0-9-]+)(?:\s+THRU\s+[A-Za-z0-9-]+)?\.?$/i);
  if (performMatch) {
    return `${cobolNameToJava(performMatch[1])}();`;
  }

  // PERFORM X VARYING
  const performVaryingMatch = trimmed.match(/^PERFORM\s+([A-Za-z0-9-]+)\s+VARYING\s+([A-Za-z0-9-]+)\s+FROM\s+(\d+)\s+BY\s+(\d+)\s+UNTIL\s+(.+?)\.?$/i);
  if (performVaryingMatch) {
    const method = cobolNameToJava(performVaryingMatch[1]);
    const varName = cobolNameToJava(performVaryingMatch[2]);
    const from = performVaryingMatch[3];
    const by = performVaryingMatch[4];
    const until = convertCondition(performVaryingMatch[5]);
    return `for (int ${varName} = ${from}; !(${until}); ${varName} += ${by}) {\n            ${method}();\n        }`;
  }

  // PERFORM X UNTIL
  const performUntilMatch = trimmed.match(/^PERFORM\s+([A-Za-z0-9-]+)\s+UNTIL\s+(.+?)\.?$/i);
  if (performUntilMatch) {
    const method = cobolNameToJava(performUntilMatch[1]);
    const condition = convertCondition(performUntilMatch[2]);
    return `while (!(${condition})) {\n            ${method}();\n        }`;
  }

  // PERFORM X n TIMES
  const performTimesMatch = trimmed.match(/^PERFORM\s+([A-Za-z0-9-]+)\s+(\d+)\s+TIMES\.?$/i);
  if (performTimesMatch) {
    const method = cobolNameToJava(performTimesMatch[1]);
    return `for (int i = 0; i < ${performTimesMatch[2]}; i++) {\n            ${method}();\n        }`;
  }

  // STOP RUN → return
  if (/^STOP\s+RUN\.?$/i.test(trimmed)) {
    return "return; // STOP RUN";
  }

  // GOBACK → return
  if (/^GOBACK\.?$/i.test(trimmed)) {
    return "return; // GOBACK";
  }

  // GO TO → method call (with warning)
  const gotoMatch = trimmed.match(/^GO\s+TO\s+([A-Za-z0-9-]+)\.?$/i);
  if (gotoMatch) {
    return `${cobolNameToJava(gotoMatch[1])}(); // WARNING: GO TO converted to method call`;
  }

  // INITIALIZE X → reset to defaults
  const initMatch = trimmed.match(/^INITIALIZE\s+(.+?)\.?$/i);
  if (initMatch) {
    const vars = initMatch[1].split(/\s+/).filter(v => v && v !== ".");
    return vars.map(v => `${cobolNameToJava(v)} = null; // INITIALIZE`).join("\n        ");
  }

  // STRING ... DELIMITED BY ... INTO → StringBuilder
  if (/^STRING\s+/i.test(trimmed)) {
    return `// TODO: Convert STRING statement\n        // Original: ${trimmed}`;
  }

  // UNSTRING ... INTO → split
  if (/^UNSTRING\s+/i.test(trimmed)) {
    return `// TODO: Convert UNSTRING statement\n        // Original: ${trimmed}`;
  }

  // ACCEPT → input (rare in batch)
  if (/^ACCEPT\s+/i.test(trimmed)) {
    return `// TODO: Convert ACCEPT statement\n        // Original: ${trimmed}`;
  }

  // Default: comment out
  if (trimmed && !trimmed.startsWith("*") && trimmed !== ".") {
    return `// COBOL: ${trimmed}`;
  }

  return "";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function convertMove(source: string, target: string): string {
  const targets = target.split(/\s+/).filter(t => t && t !== ".");
  const src = convertOperand(source.trim());

  if (targets.length === 1) {
    return `${cobolNameToJava(targets[0])} = ${src};`;
  }
  return targets.map(t => `${cobolNameToJava(t)} = ${src};`).join("\n        ");
}

function convertCompute(target: string, expression: string): string {
  const javaTarget = cobolNameToJava(target.trim());
  const javaExpr = expression
    .replace(/\*\*/g, "Math.pow(") // Exponentiation (simplified)
    .replace(/([A-Za-z][A-Za-z0-9-]*)/g, (m) => cobolNameToJava(m));
  return `${javaTarget} = ${javaExpr};`;
}

function convertOperand(operand: string): string {
  // Numeric literal
  if (/^[+-]?\d+(\.\d+)?$/.test(operand)) return operand;
  // String literal
  if (/^["'].*["']$/.test(operand)) return operand;
  // SPACES, ZEROS
  if (/^SPACES?$/i.test(operand)) return '""';
  if (/^ZEROS?|ZEROES$/i.test(operand)) return "0";
  // Variable
  return cobolNameToJava(operand);
}

/**
 * Convert a COBOL condition to Java boolean expression.
 */
export function convertCondition(condition: string): string {
  let result = condition.trim();

  // EQUAL TO / = → ==
  result = result.replace(/\s+EQUAL\s+TO\s+/gi, " == ");
  result = result.replace(/\s+=\s+/g, " == ");

  // NOT EQUAL / NOT = → !=
  result = result.replace(/\s+NOT\s+EQUAL\s+TO\s+/gi, " != ");
  result = result.replace(/\s+NOT\s+=\s+/g, " != ");

  // GREATER THAN / > → >
  result = result.replace(/\s+GREATER\s+THAN\s+/gi, " > ");

  // LESS THAN / < → <
  result = result.replace(/\s+LESS\s+THAN\s+/gi, " < ");

  // NOT LESS THAN → >=
  result = result.replace(/\s+NOT\s+LESS\s+THAN\s+/gi, " >= ");

  // NOT GREATER THAN → <=
  result = result.replace(/\s+NOT\s+GREATER\s+THAN\s+/gi, " <= ");

  // AND / OR
  result = result.replace(/\s+AND\s+/gi, " && ");
  result = result.replace(/\s+OR\s+/gi, " || ");

  // NOT → !
  result = result.replace(/\bNOT\s+/gi, "!");

  // Convert variable names
  result = result.replace(/([A-Za-z][A-Za-z0-9-]+)/g, (m) => {
    if (["true", "false", "null", "instanceof"].includes(m.toLowerCase())) return m;
    if (/^[0-9]/.test(m)) return m;
    return cobolNameToJava(m);
  });

  return result;
}

/**
 * Convert a COBOL EVALUATE block to Java switch/case.
 */
export function convertEvaluate(evaluateVar: string, whenClauses: { value: string; body: string[] }[]): string {
  const javaVar = cobolNameToJava(evaluateVar);
  const lines: string[] = [];
  lines.push(`switch (${javaVar}) {`);

  for (const clause of whenClauses) {
    if (clause.value.toUpperCase() === "OTHER") {
      lines.push(`    default:`);
    } else {
      lines.push(`    case ${convertOperand(clause.value)}:`);
    }
    for (const bodyLine of clause.body) {
      lines.push(`        ${bodyLine}`);
    }
    lines.push(`        break;`);
  }

  lines.push(`}`);
  return lines.join("\n        ");
}

/**
 * Build a Java method from a COBOL section/paragraph.
 */
export function buildJavaMethod(
  sectionName: string,
  bodyLines: string[],
  ctx: ConversionContext
): JavaMethod {
  const methodName = cobolNameToJava(sectionName);
  const isMain = sectionName.includes("MAIN") || sectionName.includes("0000") || sectionName.includes("000-");

  return {
    name: methodName,
    visibility: isMain ? "public" : "private",
    returnType: "void",
    body: bodyLines,
    parameters: [],
    javadoc: `/** Converted from COBOL ${sectionName} */`,
    annotations: isMain ? [] : undefined,
  };
}
