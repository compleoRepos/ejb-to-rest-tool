/**
 * Saga Validator — Compleo v8.0
 *
 * Post-generation validation for SagaOrchestrator Java files.
 * Catches the 4 bug categories that plagued v7.x:
 *   - BUG-1: Non-ASCII characters in enum constants
 *   - BUG-2: Java keywords used as variable/type names
 *   - BUG-3: Invalid method names (hyphens, accents), wrong variable names (context vs ctx)
 *   - BUG-4: Services referenced but not injected
 *
 * Integrated into the generation pipeline as a hard gate:
 * if validation fails, the file is NOT included in the output.
 *
 * @author Hamza NORDINE
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SagaValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  type:
    | "INVALID_IDENTIFIER"
    | "KEYWORD_AS_NAME"
    | "UNDEFINED_SERVICE"
    | "INVALID_METHOD_NAME"
    | "WRONG_VARIABLE_NAME"
    | "NON_ASCII_ENUM";
  line: number;
  detail: string;
  fix: string;
}

// ── Java Keywords ────────────────────────────────────────────────────────────

const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch",
  "char", "class", "const", "continue", "default", "do", "double",
  "else", "enum", "extends", "final", "finally", "float", "for",
  "goto", "if", "implements", "import", "instanceof", "int",
  "interface", "long", "native", "new", "package", "private",
  "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "try", "void", "volatile", "while",
  "true", "false", "null",
]);

// ── Standard Spring helpers that don't need explicit injection ───────────────

const STANDARD_SPRING_SERVICES = new Set([
  "log", "logger", "LOG", "LOGGER",
]);

// ── API publique ────────────────────────────────────────────────────────────

/**
 * Validates a generated SagaOrchestrator Java file.
 * Returns validation result with errors if any.
 */
export function validateSagaOrchestrator(content: string): SagaValidationResult {
  const errors: ValidationError[] = [];

  // CHECK 1: No Java keywords as variable/type names in field declarations
  checkKeywordAsName(content, errors);

  // CHECK 2: No hyphens in method calls (invalid Java identifiers)
  checkInvalidMethodNames(content, errors);

  // CHECK 3: No "context.get..." references (should be "ctx")
  checkWrongVariableName(content, errors);

  // CHECK 4: All services referenced are injected (or are standard)
  checkUndefinedServices(content, errors);

  // CHECK 5: No "localService" references (phantom fallback)
  checkLocalServiceFallback(content, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a SagaState enum file for ASCII-only constants.
 */
export function validateSagaStateEnum(content: string): SagaValidationResult {
  const errors: ValidationError[] = [];

  // Extract enum block
  const enumBlock = content.match(/SagaState\s*\{([\s\S]*?)public\s+boolean/)?.[1] ?? "";
  const enumLines = enumBlock.split("\n").filter(l => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith("//");
  });

  for (const line of enumLines) {
    const constName = line.trim().replace(/[,;]$/, "");
    if (constName && !/^[A-Z_0-9]+$/.test(constName)) {
      errors.push({
        type: "NON_ASCII_ENUM",
        line: findLineNumber(content, constName),
        detail: `Enum constant "${constName}" contains non-ASCII or lowercase characters`,
        fix: "Transliterate accents and use UPPER_SNAKE_CASE only",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ── Check implementations ───────────────────────────────────────────────────

function checkKeywordAsName(content: string, errors: ValidationError[]): void {
  const fieldDecls = content.matchAll(/private\s+final\s+(\w+)\s+(\w+)\s*;/g);
  for (const match of fieldDecls) {
    const type = match[1];
    const name = match[2];
    if (JAVA_KEYWORDS.has(type) || JAVA_KEYWORDS.has(name)) {
      errors.push({
        type: "KEYWORD_AS_NAME",
        line: findLineNumber(content, match[0]),
        detail: `Type "${type}" or variable "${name}" is a Java keyword`,
        fix: "Remove or rename this dependency",
      });
    }
  }
}

function checkInvalidMethodNames(content: string, errors: ValidationError[]): void {
  // Match method calls with hyphens: something.method-name(
  const methodCalls = content.matchAll(/\.(\w+-\w+)\s*\(/g);
  for (const match of methodCalls) {
    errors.push({
      type: "INVALID_METHOD_NAME",
      line: findLineNumber(content, match[0]),
      detail: `Invalid method name: ${match[1]} (hyphens not allowed in Java identifiers)`,
      fix: "Convert to camelCase",
    });
  }
}

function checkWrongVariableName(content: string, errors: ValidationError[]): void {
  // Match "context.getXxx()" patterns (should be "ctx.getXxx()")
  const contextRefs = content.matchAll(/\bcontext\.get\w+\(\)/g);
  for (const match of contextRefs) {
    errors.push({
      type: "WRONG_VARIABLE_NAME",
      line: findLineNumber(content, match[0]),
      detail: `Reference to "context" instead of "ctx"`,
      fix: 'Replace "context" with "ctx"',
    });
  }
}

function checkUndefinedServices(content: string, errors: ValidationError[]): void {
  // Extract injected services (field declarations)
  const injected = new Set<string>();
  const fieldMatches = content.matchAll(/private\s+final\s+(\w+)\s+(\w+)\s*;/g);
  for (const m of fieldMatches) {
    injected.add(m[2]); // field name
    injected.add(m[1].charAt(0).toLowerCase() + m[1].slice(1)); // type name lowercased
  }

  // Extract all service calls in the code
  const usedServices = content.matchAll(/(\w+(?:Service|Repository|Template))\.\w+\s*\(/g);
  for (const m of usedServices) {
    const svc = m[1];
    if (STANDARD_SPRING_SERVICES.has(svc)) continue;
    const isInjected = injected.has(svc) ||
      [...injected].some(i => i.toLowerCase() === svc.toLowerCase());
    if (!isInjected) {
      errors.push({
        type: "UNDEFINED_SERVICE",
        line: findLineNumber(content, svc + "."),
        detail: `Service "${svc}" is used but not injected`,
        fix: `Inject ${svc} in the constructor or use jdbcTemplate`,
      });
    }
  }
}

function checkLocalServiceFallback(content: string, errors: ValidationError[]): void {
  if (content.includes("localService.")) {
    errors.push({
      type: "UNDEFINED_SERVICE",
      line: findLineNumber(content, "localService."),
      detail: '"localService" is not a real injection - it is a generator fallback',
      fix: "Use a real service or jdbcTemplate",
    });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findLineNumber(content: string, search: string): number {
  const idx = content.indexOf(search);
  if (idx === -1) return -1;
  return content.substring(0, idx).split("\n").length;
}
