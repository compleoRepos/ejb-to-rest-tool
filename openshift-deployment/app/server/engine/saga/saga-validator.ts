/**
 * Saga Validator — Compleo v8.1
 *
 * Post-generation validation for SagaOrchestrator Java files.
 * Catches the bug categories that plagued v7.x and v8.0:
 *
 * v8.0 checks:
 *   - CHECK 1: No Java keywords as variable/type names
 *   - CHECK 2: No hyphens in method calls
 *   - CHECK 3: No "context.get..." (should be "ctx")
 *   - CHECK 4: All services referenced are injected
 *   - CHECK 5: No "localService" references
 *
 * v8.1 BLOCKER checks:
 *   - CHECK 6: No SAGA_ID on business tables (BUG-2)
 *   - CHECK 7: No T_SAGA_LOG in compensations (BUG-3)
 *   - CHECK 8: No duplicate file paths across sagas (BUG-1)
 *
 * Integrated into the generation pipeline as a hard gate:
 * if validation fails, the file is NOT included in the output.
 *
 * @author Compleo
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
    | "NON_ASCII_ENUM"
    | "SAGA_ID_ON_BUSINESS_TABLE"
    | "T_SAGA_LOG_IN_COMPENSATION"
    | "DUPLICATE_FILE_PATH";
  line: number;
  detail: string;
  fix: string;
  /** v8.1: severity level — BLOCKER errors MUST be fixed before release */
  severity: "BLOCKER" | "ERROR" | "WARNING";
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

// ── Known Saga infrastructure tables (SAGA_ID is valid on these) ─────────────

const SAGA_INFRASTRUCTURE_TABLES = new Set([
  "T_SAGA_LOG",
  "T_SAGA_STATE",
  "T_SAGA_RECOVERY",
  "T_SAGA_DEAD_LETTER",
]);

// ── API publique ────────────────────────────────────────────────────────────

/**
 * Validates a generated SagaOrchestrator Java file.
 * Returns validation result with errors if any.
 *
 * v8.1: Includes 3 new BLOCKER checks for BUG-2 and BUG-3.
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

  // v8.1 CHECK 6 (BLOCKER): No SAGA_ID on business tables
  checkSagaIdOnBusinessTables(content, errors);

  // v8.1 CHECK 7 (BLOCKER): No T_SAGA_LOG in compensation methods
  checkTSagaLogInCompensations(content, errors);

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
        severity: "ERROR",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * v8.1 CHECK 8 (BLOCKER): Validates that no duplicate file paths exist
 * across all generated saga results.
 */
export function validateNoDuplicatePaths(
  allFiles: Array<{ path: string; domain?: string }>,
): SagaValidationResult {
  const errors: ValidationError[] = [];
  const seen = new Map<string, string>(); // path → first domain

  for (const file of allFiles) {
    const existing = seen.get(file.path);
    if (existing) {
      errors.push({
        type: "DUPLICATE_FILE_PATH",
        line: 0,
        detail: `Duplicate path "${file.path}" — first seen in domain "${existing}", also in "${file.domain ?? "unknown"}"`,
        fix: "Deduplicate candidates by domain or use domain-specific paths",
        severity: "BLOCKER",
      });
    } else {
      seen.set(file.path, file.domain ?? "unknown");
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
        severity: "ERROR",
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
      severity: "ERROR",
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
      severity: "ERROR",
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
        severity: "ERROR",
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
      severity: "ERROR",
    });
  }
}

/**
 * v8.1 CHECK 6 (BLOCKER): No SAGA_ID on business tables.
 *
 * SAGA_ID is only valid on saga infrastructure tables (T_SAGA_LOG, T_SAGA_STATE).
 * Using it on business tables (T_ECHEANCIERS, T_COMPTES, T_CLIENTS, etc.)
 * means the column doesn't exist and the SQL will fail at runtime.
 */
function checkSagaIdOnBusinessTables(content: string, errors: ValidationError[]): void {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match SQL with SAGA_ID
    const sagaIdMatch = line.match(/WHERE\s+SAGA_ID\s*=\s*\?/i);
    if (!sagaIdMatch) continue;

    // Check if the table is a saga infrastructure table
    const tableMatch = line.match(/(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|FROM)\s+(\w+)/i);
    if (!tableMatch) continue;

    const tableName = tableMatch[1].toUpperCase();
    if (!SAGA_INFRASTRUCTURE_TABLES.has(tableName)) {
      errors.push({
        type: "SAGA_ID_ON_BUSINESS_TABLE",
        line: i + 1,
        detail: `SAGA_ID used on business table "${tableName}" — this column does not exist on business tables`,
        fix: `Replace SAGA_ID with the real business ID column (e.g., REFERENCE, ID_TRANSACTION, NUM_COMPTE)`,
        severity: "BLOCKER",
      });
    }
  }
}

/**
 * v8.1 CHECK 7 (BLOCKER): No T_SAGA_LOG in compensation methods.
 *
 * Compensation methods must call real business services or update real
 * business tables — never touch T_SAGA_LOG (that's the audit table,
 * managed by the orchestrator infrastructure, not by compensations).
 */
function checkTSagaLogInCompensations(content: string, errors: ValidationError[]): void {
  const lines = content.split("\n");
  let inCompensation = false;
  let compensationName = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect compensation method start
    const compStart = line.match(/private\s+void\s+(compensate\w+)\s*\(/);
    if (compStart) {
      inCompensation = true;
      compensationName = compStart[1];
      continue;
    }

    // Detect method end (closing brace at same indentation level)
    if (inCompensation && /^\s{4}\}/.test(line) && !/^\s{8}/.test(line)) {
      inCompensation = false;
      compensationName = "";
      continue;
    }

    // Check for T_SAGA_LOG reference inside compensation
    if (inCompensation && /T_SAGA_LOG/i.test(line)) {
      errors.push({
        type: "T_SAGA_LOG_IN_COMPENSATION",
        line: i + 1,
        detail: `Compensation "${compensationName}" touches T_SAGA_LOG — compensations must call real business services`,
        fix: "Replace T_SAGA_LOG with the real business table or service call",
        severity: "BLOCKER",
      });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findLineNumber(content: string, search: string): number {
  const idx = content.indexOf(search);
  if (idx === -1) return -1;
  return content.substring(0, idx).split("\n").length;
}
