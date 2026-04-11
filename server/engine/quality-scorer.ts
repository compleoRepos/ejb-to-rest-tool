/**
 * QualityScorer — Compleo v7.3 (FIX H)
 *
 * Score de qualité automatique post-génération (/100).
 * 8 critères vérifiés par analyse statique RÉELLE du code généré.
 * Aucune auto-évaluation : chaque check inspecte le code Java produit.
 *
 * Pondération (total = 100 pts) :
 *   - CHECK 1 — SQL_CONSTANTS        (25 pts)
 *   - CHECK 2 — NO_VOID_BUILDER      (15 pts)
 *   - CHECK 3 — NO_OBJECT_RETURN     (10 pts)
 *   - CHECK 4 — METHOD_PARAMS        (15 pts)
 *   - CHECK 5 — MS_NAMES             (10 pts)
 *   - CHECK 6 — ORACLE_KEYWORDS       (5 pts)
 *   - CHECK 7 — URL_CONFLICTS        (10 pts)
 *   - CHECK 8 — USECASES_DETECTED    (10 pts)
 *
 * @author Compleo Engine
 */

import type { GeneratedFile } from "../spring/shared";

// ── Types ────────────────────────────────────────────────────────────

export type CheckId =
  | "SQL_CONSTANTS"
  | "NO_VOID_BUILDER"
  | "NO_OBJECT_RETURN"
  | "METHOD_PARAMS"
  | "MS_NAMES"
  | "ORACLE_KEYWORDS"
  | "URL_CONFLICTS"
  | "USECASES_DETECTED";

export interface QualityCheck {
  id:          CheckId;
  description: string;
  passed:      boolean;
  detail:      string;
  points:      number;
  maxPoints:   number;
}

export interface TestRegressionResult {
  totalTests:   number;
  passedTests:  number;
  failedTests:  number;
  skippedTests: number;
  failedNames:  string[];
}

export interface QualityReport {
  score:       number;       // 0-100
  grade:       string;       // A+ / A / B / C / F
  checks:      QualityCheck[];
  issues:      string[];
  testResults?: TestRegressionResult;
  summary:     string;
  timestamp:   string;
  // Legacy aliases for backward compat
  totalScore:  number;
  maxScore:    number;
  criteria:    QualityCriterion[];
}

/** Legacy alias for backward compatibility with v7.2 tests */
export type CriterionId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
export interface QualityCriterion {
  id:          CriterionId;
  name:        string;
  maxPoints:   number;
  score:       number;
  passed:      number;
  total:       number;
  violations:  string[];
}

// ── Oracle keywords that must never appear as table names ────────────

const ORACLE_KEYWORDS = new Set([
  "DUAL", "SYSDATE", "SYSTIMESTAMP", "NOWAIT", "NEXTVAL", "CURRVAL",
  "ROWNUM", "ROWID", "LEVEL", "USER", "NULL", "TRUE", "FALSE",
  "DATE", "NUMBER", "VARCHAR2", "CLOB", "BLOB",
]);

// ── Main scorer ─────────────────────────────────────────────────────

export function scoreGeneration(
  files: GeneratedFile[],
  microserviceNames?: string[],
  detectedTables?: string[],
  legacyMethodCount?: number,
  testResults?: TestRegressionResult
): QualityReport {
  const checks: QualityCheck[] = [];

  // CHECK 1 — SQL constants at class level only (25 pts)
  const sqlResult = checkSqlConstants(files);
  checks.push({
    id: "SQL_CONSTANTS",
    description: "SQL constants private static final (pas dans les méthodes)",
    passed: sqlResult.duplicates === 0,
    detail: `${sqlResult.ok} OK, ${sqlResult.duplicates} dupliquée(s)`,
    points: sqlResult.duplicates === 0 ? 25 : Math.max(0, 25 - sqlResult.duplicates * 5),
    maxPoints: 25,
  });

  // CHECK 2 — No Void.builder() (15 pts)
  const voidResult = checkNoVoidBuilder(files);
  checks.push({
    id: "NO_VOID_BUILDER",
    description: "Aucun Void.builder() invalide",
    passed: voidResult.count === 0,
    detail: `${voidResult.count} occurrence(s)`,
    points: voidResult.count === 0 ? 15 : 0,
    maxPoints: 15,
  });

  // CHECK 3 — No Object return type (10 pts)
  const objectResult = checkNoObjectReturn(files);
  checks.push({
    id: "NO_OBJECT_RETURN",
    description: "Aucune méthode public Object",
    passed: objectResult.count === 0,
    detail: `${objectResult.count} méthode(s) retournant Object`,
    points: objectResult.count === 0 ? 10 : 0,
    maxPoints: 10,
  });

  // CHECK 4 — Method parameters propagated (15 pts)
  const paramsResult = checkMethodParams(files);
  checks.push({
    id: "METHOD_PARAMS",
    description: "Méthodes avec paramètres correctement propagés",
    passed: paramsResult.missing === 0,
    detail: `${paramsResult.missing} méthode(s) avec paramètres manquants`,
    points: paramsResult.missing === 0 ? 15 : Math.max(0, 15 - paramsResult.missing * 5),
    maxPoints: 15,
  });

  // CHECK 5 — Microservice names = EJB domain (10 pts)
  const msResult = checkMicroserviceNames(microserviceNames ?? []);
  checks.push({
    id: "MS_NAMES",
    description: "Noms microservices = domaine EJB",
    passed: msResult.invalid === 0,
    detail: msResult.total > 0
      ? `${msResult.invalid} nom(s) invalide(s) sur ${msResult.total}`
      : "Pas de microservices (monolithe)",
    points: msResult.invalid === 0 ? 10 : Math.max(0, 10 - msResult.invalid * 3),
    maxPoints: 10,
  });

  // CHECK 6 — No Oracle keywords as tables (5 pts)
  const oracleResult = checkOracleKeywords(detectedTables ?? []);
  checks.push({
    id: "ORACLE_KEYWORDS",
    description: "Pas de NOWAIT/SYSDATE/DUAL dans les noms de tables",
    passed: oracleResult.count === 0,
    detail: `${oracleResult.count} mot(s)-clé(s) Oracle dans les tables`,
    points: oracleResult.count === 0 ? 5 : 0,
    maxPoints: 5,
  });

  // CHECK 7 — No duplicate URL mappings (10 pts)
  const urlResult = checkUrlConflicts(files);
  checks.push({
    id: "URL_CONFLICTS",
    description: "Aucun @GetMapping/@PostMapping dupliqué",
    passed: urlResult.conflicts === 0,
    detail: `${urlResult.conflicts} conflit(s) URL`,
    points: urlResult.conflicts === 0 ? 10 : Math.max(0, 10 - urlResult.conflicts * 3),
    maxPoints: 10,
  });

  // CHECK 8 — UseCases detected > 0 (10 pts)
  const ucResult = checkUseCasesDetected(files, legacyMethodCount);
  checks.push({
    id: "USECASES_DETECTED",
    description: "UseCases détectés et générés",
    passed: ucResult.count > 0,
    detail: ucResult.expected
      ? `${ucResult.count}/${ucResult.expected} UseCase(s)`
      : `${ucResult.count} UseCase(s)`,
    points: ucResult.count > 0
      ? (ucResult.expected
          ? Math.round(10 * Math.min(ucResult.count / ucResult.expected, 1))
          : 10)
      : 0,
    maxPoints: 10,
  });

  const total = checks.reduce((sum, c) => sum + c.points, 0);
  const maxTotal = checks.reduce((sum, c) => sum + c.maxPoints, 0);
  const score = Math.round((total / maxTotal) * 100);
  const grade = score >= 95 ? "A+" : score >= 90 ? "A"
    : score >= 85 ? "B+" : score >= 80 ? "B"
    : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  const issues = checks.filter(c => !c.passed).map(c => `${c.description}: ${c.detail}`);

  // Build legacy criteria for backward compat
  const criteria = buildLegacyCriteria(checks);

  const summary = buildSummary(checks, score, grade, testResults);

  return {
    score,
    grade,
    checks,
    issues,
    testResults,
    summary,
    timestamp: new Date().toLocaleString("fr-FR"),
    totalScore: total,
    maxScore: maxTotal,
    criteria,
  };
}

// ── CHECK 1: SQL Constants ──────────────────────────────────────────

function checkSqlConstants(files: GeneratedFile[]): { ok: number; duplicates: number } {
  const serviceFiles = files.filter(f =>
    f.category === "service" && f.path.endsWith("Service.java")
  );

  let ok = 0;
  let duplicates = 0;

  for (const file of serviceFiles) {
    const methods = extractMethods(file.content);
    for (const method of methods) {
      const hasMethodLevelConstant =
        /(?:final\s+String\s+SQL_|String\s+SQL_)/i.test(method.body);
      if (hasMethodLevelConstant) {
        duplicates++;
      } else {
        ok++;
      }
    }
    // If no methods, check class-level constants
    if (methods.length === 0) {
      const hasClassConstants = /private\s+static\s+final\s+String\s+SQL_/i.test(file.content);
      if (hasClassConstants) ok++;
    }
  }

  return { ok, duplicates };
}

// ── CHECK 2: No Void.builder() ──────────────────────────────────────

function checkNoVoidBuilder(files: GeneratedFile[]): { count: number; locations: string[] } {
  let count = 0;
  const locations: string[] = [];

  for (const file of files) {
    if (!file.path.endsWith(".java")) continue;
    const matches = file.content.match(/Void\.builder\(\)/g);
    if (matches) {
      count += matches.length;
      locations.push(`${extractClassName(file.path)}: ${matches.length} occurrence(s)`);
    }
  }

  return { count, locations };
}

// ── CHECK 3: No Object return ───────────────────────────────────────

function checkNoObjectReturn(files: GeneratedFile[]): { count: number; methods: string[] } {
  let count = 0;
  const methods: string[] = [];

  for (const file of files) {
    if (!file.path.endsWith("Service.java") && !file.path.endsWith("Controller.java")) continue;
    const objectMethods = file.content.match(/public\s+Object\s+\w+\s*\(/g);
    if (objectMethods) {
      count += objectMethods.length;
      for (const m of objectMethods) {
        methods.push(`${extractClassName(file.path)}: ${m.trim()}`);
      }
    }
  }

  return { count, methods };
}

// ── CHECK 4: Method parameters ──────────────────────────────────────

function checkMethodParams(files: GeneratedFile[]): { missing: number; details: string[] } {
  const serviceFiles = files.filter(f =>
    f.category === "service" && f.path.endsWith("Service.java")
  );

  let missing = 0;
  const details: string[] = [];

  for (const file of serviceFiles) {
    const methods = extractMethods(file.content);
    for (const method of methods) {
      const hasParams = method.params.trim().length > 0;
      const isListMethod = /^(?:list|getAll|findAll|count)/i.test(method.name);

      // Check if the method body references undeclared parameters
      if (!hasParams && !isListMethod) {
        const refsUndeclaredParam = /request\.\w+\(\)/.test(method.body) && !hasParams;
        if (refsUndeclaredParam) {
          missing++;
          details.push(`${extractClassName(file.path)}.${method.name}: référence request.xxx() sans paramètre`);
        }
      }
    }
  }

  return { missing, details };
}

// ── CHECK 5: Microservice names ─────────────────────────────────────

function checkMicroserviceNames(names: string[]): { invalid: number; total: number; badNames: string[] } {
  let invalid = 0;
  const badNames: string[] = [];

  for (const name of names) {
    if (name.includes("_") || /ejb/i.test(name) || name.length > 30) {
      invalid++;
      badNames.push(name);
    }
  }

  return { invalid, total: names.length, badNames };
}

// ── CHECK 6: Oracle keywords ────────────────────────────────────────

function checkOracleKeywords(tables: string[]): { count: number; keywords: string[] } {
  let count = 0;
  const keywords: string[] = [];

  for (const table of tables) {
    if (ORACLE_KEYWORDS.has(table.toUpperCase())) {
      count++;
      keywords.push(table);
    }
  }

  return { count, keywords };
}

// ── CHECK 7: URL conflicts ──────────────────────────────────────────

function checkUrlConflicts(files: GeneratedFile[]): { conflicts: number; details: string[] } {
  const controllerFiles = files.filter(f =>
    f.category === "controller" && f.path.endsWith("Controller.java")
  );

  const urlMap = new Map<string, string[]>();
  let conflicts = 0;
  const details: string[] = [];

  for (const file of controllerFiles) {
    // Extract class-level @RequestMapping
    const classMapping = file.content.match(/@RequestMapping\("([^"]+)"\)/);
    const basePath = classMapping ? classMapping[1] : "";

    // Extract method-level mappings
    const mappingRegex = /@(?:Get|Post|Put|Delete|Patch)Mapping\("([^"]*)"\)/g;
    let match;
    while ((match = mappingRegex.exec(file.content)) !== null) {
      // Find the HTTP method annotation
      const lineStart = file.content.lastIndexOf("\n", match.index);
      const annotationLine = file.content.substring(lineStart, match.index + match[0].length);
      const httpMethod = annotationLine.match(/@(Get|Post|Put|Delete|Patch)Mapping/)?.[1] || "GET";

      const fullUrl = `${httpMethod} ${basePath}${match[1]}`;
      const className = extractClassName(file.path);

      if (!urlMap.has(fullUrl)) {
        urlMap.set(fullUrl, []);
      }
      urlMap.get(fullUrl)!.push(className);
    }
  }

  for (const [url, controllers] of urlMap) {
    if (controllers.length > 1) {
      conflicts++;
      details.push(`${url} → ${controllers.join(", ")}`);
    }
  }

  return { conflicts, details };
}

// ── CHECK 8: UseCases detected ──────────────────────────────────────

function checkUseCasesDetected(
  files: GeneratedFile[],
  legacyMethodCount?: number
): { count: number; expected?: number } {
  const serviceFiles = files.filter(f =>
    f.category === "service" && f.path.endsWith("Service.java")
  );

  let count = 0;
  for (const file of serviceFiles) {
    const methods = extractMethods(file.content);
    count += methods.length;
  }

  return { count, expected: legacyMethodCount };
}

// ── Helpers ─────────────────────────────────────────────────────────

interface MethodInfo {
  name:       string;
  returnType: string;
  params:     string;
  body:       string;
}

function extractMethods(javaContent: string): MethodInfo[] {
  const methods: MethodInfo[] = [];
  const methodRegex = /(?:public|protected|private)\s+([\w<>\[\],\s?]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
  let match;

  while ((match = methodRegex.exec(javaContent)) !== null) {
    const returnType = match[1].trim();
    const methodName = match[2];
    const params = match[3] || "";

    if (methodName === "main" || methodName === "toString" ||
        methodName === "hashCode" || methodName === "equals") continue;

    const startIdx = match.index + match[0].length;
    let braceCount = 1;
    let endIdx = startIdx;
    while (braceCount > 0 && endIdx < javaContent.length) {
      if (javaContent[endIdx] === "{") braceCount++;
      if (javaContent[endIdx] === "}") braceCount--;
      endIdx++;
    }

    methods.push({
      name: methodName,
      returnType,
      params,
      body: javaContent.substring(startIdx, endIdx - 1),
    });
  }

  return methods;
}

function extractClassName(filePath: string): string {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1];
  return fileName.replace(".java", "");
}

// ── Legacy criteria builder (backward compat with v7.2 tests) ───────

function buildLegacyCriteria(checks: QualityCheck[]): QualityCriterion[] {
  const idMap: Record<CheckId, CriterionId> = {
    "SQL_CONSTANTS": "A",
    "NO_VOID_BUILDER": "B",
    "NO_OBJECT_RETURN": "C",
    "METHOD_PARAMS": "D",
    "MS_NAMES": "E",
    "ORACLE_KEYWORDS": "F",
    "URL_CONFLICTS": "G",
    "USECASES_DETECTED": "H",
  };

  return checks.map(c => ({
    id: idMap[c.id],
    name: c.description,
    maxPoints: c.maxPoints,
    score: c.points,
    passed: c.passed ? 1 : 0,
    total: 1,
    violations: c.passed ? [] : [c.detail],
  }));
}

// ── Summary builder ─────────────────────────────────────────────────

function buildSummary(
  checks: QualityCheck[],
  score: number,
  grade: string,
  testResults?: TestRegressionResult
): string {
  const lines: string[] = [
    `## Score de Qualité : ${score}/100 (${grade})`,
    "",
  ];

  // FIX H: If test results are available, show them first
  if (testResults) {
    const testPct = testResults.totalTests > 0
      ? Math.round((testResults.passedTests / testResults.totalTests) * 100)
      : 0;
    lines.push(`### Résultats des tests de régression`);
    lines.push("");
    lines.push(`| Métrique | Valeur |`);
    lines.push(`|----------|--------|`);
    lines.push(`| Tests exécutés | ${testResults.totalTests} |`);
    lines.push(`| Tests passés | ${testResults.passedTests} (${testPct}%) |`);
    lines.push(`| Tests échoués | ${testResults.failedTests} |`);
    lines.push(`| Tests ignorés | ${testResults.skippedTests} |`);
    if (testResults.failedNames.length > 0) {
      lines.push("");
      lines.push("**Tests échoués :**");
      for (const name of testResults.failedNames.slice(0, 10)) {
        lines.push(`- \`${name}\``);
      }
    }
    lines.push("");
  }

  lines.push("### Critères d'analyse statique");
  lines.push("");
  lines.push("| Critère | Description | Score | Détail |");
  lines.push("|---------|-------------|-------|--------|");

  for (const c of checks) {
    const icon = c.passed ? "\u2705" : "\u274c";
    lines.push(`| ${icon} ${c.id} | ${c.description} | ${c.points}/${c.maxPoints} | ${c.detail} |`);
  }

  const failedChecks = checks.filter(c => !c.passed);
  if (failedChecks.length > 0) {
    lines.push("");
    lines.push("### Problèmes détectés");
    lines.push("");
    for (const c of failedChecks) {
      lines.push(`- **${c.id}** : ${c.description} — ${c.detail}`);
    }
  }

  return lines.join("\n");
}

// ── Export for report generation ─────────────────────────────────────

export function generateQualitySection(report: QualityReport): string {
  return report.summary;
}
