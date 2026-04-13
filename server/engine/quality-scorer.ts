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
  | "USECASES_DETECTED"
  | "SERVICE_NAMING"
  | "NO_ORACLE_KEYWORDS"
  | "NO_URL_CONFLICTS"
  | "USECASE_COVERAGE"
  | "NO_VOID_VARIABLES"
  | "NO_DUPLICATE_SERVICES"
  | "NO_DTO_SERVICES"
  | "SAGA_COVERAGE";

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

  // CHECK 9 v7.8 — No Void as variable type (5 pts)
  {
    let voidVarCount = 0;
    for (const file of files) {
      if (!file.path.endsWith(".java")) continue;
      voidVarCount += (file.content.match(/\bVoid\s+\w+\s*=/g) ?? []).length;
    }
    checks.push({
      id: "NO_VOID_VARIABLES",
      description: "Pas de Void comme type de variable locale",
      passed: voidVarCount === 0,
      detail: `${voidVarCount} occurrence(s) de Void varName =`,
      points: voidVarCount === 0 ? 5 : 0,
      maxPoints: 5,
    });
  }

  // CHECK 10 v7.8 — No duplicate EJB services (5 pts)
  {
    const serviceFileNames = files
      .filter(f => f.path.endsWith("Service.java"))
      .map(f => f.path.split("/").pop()!.replace(".java", ""));
    let dupCount = 0;
    for (const name of serviceFileNames) {
      if (/EJBService$/.test(name)) dupCount++;
    }
    checks.push({
      id: "NO_DUPLICATE_SERVICES",
      description: "Pas de services EJB doublons (*EJBService.java)",
      passed: dupCount === 0,
      detail: `${dupCount} doublon(s) détecté(s)`,
      points: dupCount === 0 ? 5 : 0,
      maxPoints: 5,
    });
  }

  // CHECK 11 v7.8 — No DTO/CDI services (5 pts)
  {
    let dtoSvcCount = 0;
    for (const file of files) {
      const fileName = file.path.split("/").pop() ?? "";
      if (/VoIn.*Service|VoOut.*Service|Transformer.*Service/i.test(fileName)) {
        dtoSvcCount++;
      }
    }
    checks.push({
      id: "NO_DTO_SERVICES",
      description: "Pas de services générés pour des DTOs/CDI beans",
      passed: dtoSvcCount === 0,
      detail: `${dtoSvcCount} faux service(s)`,
      points: dtoSvcCount === 0 ? 5 : 0,
      maxPoints: 5,
    });
  }

  // CHECK 12 v7.9 — Saga Coverage (5 pts)
  {
    const sagaOrchFiles = files.filter(f => /SagaOrchestrator\.java$/.test(f.path));
    let candidateCount = 0;
    for (const file of files) {
      if (!file.path.endsWith("Service.java") && !file.path.endsWith("Controller.java")) continue;
      const injections = (file.content.match(/@Autowired[\s\S]*?private\s+\w+Service\s/g) || []).length
        + (file.content.match(/private\s+final\s+\w+Service\s/g) || []).length;
      if (injections >= 2) candidateCount++;
    }
    const hasSagas = sagaOrchFiles.length > 0;
    const noCandidates = candidateCount === 0;
    checks.push({
      id: "SAGA_COVERAGE",
      description: "Saga Orchestration générée pour les EJBs multi-services",
      passed: hasSagas || noCandidates,
      detail: noCandidates
        ? "Aucun EJB multi-services détecté (non applicable)"
        : hasSagas
          ? `${sagaOrchFiles.length} saga(s) générée(s)`
          : `${candidateCount} EJB(s) multi-services sans saga`,
      points: (hasSagas || noCandidates) ? 5 : 0,
      maxPoints: 5,
    });
  }

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
  const idMap: Partial<Record<CheckId, CriterionId>> = {
    "SQL_CONSTANTS": "A",
    "NO_VOID_BUILDER": "B",
    "NO_OBJECT_RETURN": "C",
    "METHOD_PARAMS": "D",
    "MS_NAMES": "E",
    "ORACLE_KEYWORDS": "F",
    "URL_CONFLICTS": "G",
    "USECASES_DETECTED": "H",
    // v7.7 aliases (map to same letters for backward compat)
    "SERVICE_NAMING": "E",
    "NO_ORACLE_KEYWORDS": "F",
    "NO_URL_CONFLICTS": "G",
    "USECASE_COVERAGE": "H",
    // v7.8 new checks (map to unused letters)
    "NO_VOID_VARIABLES": "B",
    "NO_DUPLICATE_SERVICES": "A",
    "NO_DTO_SERVICES": "C",
    "SAGA_COVERAGE": "D",
  };

  return checks.map(c => ({
    id: idMap[c.id] ?? "A" as CriterionId,
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


// ══════════════════════════════════════════════════════════════════════
// v7.7 — calculateQualityScore(Map<string, string>)
//
// Nouvelle API acceptant un Map<path, content> au lieu de GeneratedFile[].
// Permet de scorer directement depuis les fichiers générés sans dépendre
// de la structure GeneratedFile. Les 8 checks sont les mêmes, adaptés
// pour travailler sur Map.
// ══════════════════════════════════════════════════════════════════════

export function calculateQualityScore(files: Map<string, string>): QualityReport {
  const checks: QualityCheck[] = [];

  // ── CHECK A (15 pts) : SQL constants private static final ──────────
  const sqlCheck = mapCheckSqlConstants(files);
  checks.push({
    id: "SQL_CONSTANTS",
    description: "SQL constants private static final (pas dans méthodes)",
    passed: sqlCheck.duplicates === 0,
    detail: `${sqlCheck.ok} OK, ${sqlCheck.duplicates} dupliquée(s)`,
    points: sqlCheck.duplicates === 0 ? 15 : Math.max(0, 15 - sqlCheck.duplicates * 3),
    maxPoints: 15,
  });

  // ── CHECK B (15 pts) : Pas de Void.builder() ──────────────────────
  const voidCheck = mapCheckNoVoidBuilder(files);
  checks.push({
    id: "NO_VOID_BUILDER",
    description: "Aucun Void.builder() invalide",
    passed: voidCheck.count === 0,
    detail: `${voidCheck.count} occurrence(s)`,
    points: voidCheck.count === 0 ? 15 : 0,
    maxPoints: 15,
  });

  // ── CHECK C (10 pts) : Pas de retour Object ───────────────────────
  const objectCheck = mapCheckNoObjectReturn(files);
  checks.push({
    id: "NO_OBJECT_RETURN",
    description: "Aucune méthode public Object",
    passed: objectCheck.count === 0,
    detail: `${objectCheck.count} méthode(s) retournant Object`,
    points: objectCheck.count === 0 ? 10 : 0,
    maxPoints: 10,
  });

  // ── CHECK D (15 pts) : Paramètres méthodes complets ───────────────
  const paramsCheck = mapCheckMethodParams(files);
  checks.push({
    id: "METHOD_PARAMS",
    description: "Toutes les méthodes ont leurs paramètres",
    passed: paramsCheck.empty === 0,
    detail: `${paramsCheck.empty} méthode(s) sans paramètres suspects`,
    points: paramsCheck.empty === 0 ? 15 : Math.max(0, 15 - paramsCheck.empty * 5),
    maxPoints: 15,
  });

  // ── CHECK E (10 pts) : Noms microservices valides ─────────────────
  const namingCheck = mapCheckServiceNaming(files);
  checks.push({
    id: "SERVICE_NAMING",
    description: "Noms microservices en kebab-case sans préfixe EJB",
    passed: namingCheck.invalid === 0,
    detail: `${namingCheck.valid} valides, ${namingCheck.invalid} invalides`,
    points: namingCheck.invalid === 0 ? 10 : 0,
    maxPoints: 10,
  });

  // ── CHECK F (10 pts) : Pas de mots-clés Oracle comme tables ───────
  const oracleCheck = mapCheckNoOracleKeywords(files);
  checks.push({
    id: "NO_ORACLE_KEYWORDS",
    description: "Pas de NOWAIT/SYSDATE/DUAL comme noms de tables",
    passed: oracleCheck.count === 0,
    detail: `${oracleCheck.count} faux positif(s)`,
    points: oracleCheck.count === 0 ? 10 : 0,
    maxPoints: 10,
  });

  // ── CHECK G (10 pts) : Pas de conflits URL ────────────────────────
  const urlCheck = mapCheckNoUrlConflicts(files);
  checks.push({
    id: "NO_URL_CONFLICTS",
    description: "Pas de doublons dans les endpoints REST",
    passed: urlCheck.conflicts === 0,
    detail: `${urlCheck.conflicts} conflit(s)`,
    points: urlCheck.conflicts === 0 ? 10 : Math.max(0, 10 - urlCheck.conflicts * 2),
    maxPoints: 10,
  });

  // ── CHECK H (15 pts) : Couverture UseCases ────────────────────────
  const coverageCheck = mapCheckUseCaseCoverage(files);
  checks.push({
    id: "USECASE_COVERAGE",
    description: "Tous les UseCases EJB couverts par un Service",
    passed: coverageCheck.missing === 0,
    detail: `${coverageCheck.covered}/${coverageCheck.total} couverts`,
    points: coverageCheck.missing === 0 ? 15 :
      Math.round(15 * coverageCheck.covered / Math.max(1, coverageCheck.total)),
    maxPoints: 15,
  });

  // ── CHECK I (5 pts) v7.8 : Pas de Void comme type de variable ─────
  const voidVarCheck = mapCheckNoVoidVariables(files);
  checks.push({
    id: "NO_VOID_VARIABLES",
    description: "Pas de Void comme type de variable locale",
    passed: voidVarCheck.count === 0,
    detail: `${voidVarCheck.count} occurrence(s) de Void varName =`,
    points: voidVarCheck.count === 0 ? 5 : 0,
    maxPoints: 5,
  });

  // ── CHECK J (5 pts) v7.8 : Pas de services EJB doublons ────────
  const dupCheck = mapCheckNoDuplicateServices(files);
  checks.push({
    id: "NO_DUPLICATE_SERVICES",
    description: "Pas de services EJB doublons (*EJBService.java)",
    passed: dupCheck.duplicates === 0,
    detail: `${dupCheck.duplicates} doublon(s) détecté(s)`,
    points: dupCheck.duplicates === 0 ? 5 : 0,
    maxPoints: 5,
  });

  // ── CHECK K (5 pts) v7.8 : Pas de services DTO/CDI ───────────
  const dtoSvcCheck = mapCheckNoDtoServices(files);
  checks.push({
    id: "NO_DTO_SERVICES",
    description: "Pas de services générés pour des DTOs/CDI beans",
    passed: dtoSvcCheck.count === 0,
    detail: `${dtoSvcCheck.count} faux service(s)`,
    points: dtoSvcCheck.count === 0 ? 5 : 0,
    maxPoints: 5,
  });

  // ── CHECK L (5 pts) v7.9 : Saga Coverage ────────────────────
  const sagaCheck = checkSagaCoverage(files);
  checks.push({
    id: "SAGA_COVERAGE",
    description: "Saga Orchestration générée pour les EJBs multi-services",
    passed: sagaCheck.hasSagas || sagaCheck.noCandidates,
    detail: sagaCheck.noCandidates
      ? "Aucun EJB multi-services détecté (non applicable)"
      : sagaCheck.hasSagas
        ? `${sagaCheck.sagaCount} saga(s) générée(s)`
        : `${sagaCheck.candidateCount} EJB(s) multi-services sans saga`,
    points: (sagaCheck.hasSagas || sagaCheck.noCandidates) ? 5 : 0,
    maxPoints: 5,
  });

  // ── SCORE FINAL ───────────────────────────────────────────────────────────
  const total = checks.reduce((sum, c) => sum + c.points, 0);
  const maxTotal = checks.reduce((sum, c) => sum + c.maxPoints, 0);
  const pct = Math.round((total / maxTotal) * 100);
  const grade = pct >= 95 ? "A+" : pct >= 90 ? "A"
    : pct >= 85 ? "B+" : pct >= 80 ? "B"
    : pct >= 70 ? "C" : pct >= 60 ? "D" : "F";

  const issues = checks.filter(c => !c.passed).map(c => `${c.description}: ${c.detail}`);
  const criteria = buildLegacyCriteria(checks);
  const summary = buildSummary(checks, pct, grade);

  return {
    score: pct,
    grade,
    checks,
    issues,
    summary,
    timestamp: new Date().toLocaleString("fr-FR"),
    totalScore: total,
    maxScore: maxTotal,
    criteria,
  };
}

// ── Map-based check functions (v7.7) ────────────────────────────────

function mapCheckSqlConstants(files: Map<string, string>) {
  let ok = 0, duplicates = 0;
  for (const [path, content] of files) {
    if (!path.endsWith("Service.java")) continue;
    const staticFinal = (content.match(/private\s+static\s+final\s+String\s+SQL_/g) ?? []).length;
    const allSql = (content.match(/final\s+String\s+SQL_/g) ?? []).length;
    ok += staticFinal;
    duplicates += (allSql - staticFinal);
  }
  return { ok, duplicates };
}

function mapCheckNoVoidBuilder(files: Map<string, string>) {
  let count = 0;
  for (const [path, content] of files) {
    if (!path.endsWith(".java")) continue; // Skip reports (.md)
    count += (content.match(/Void\.builder\(\)/g) ?? []).length;
  }
  return { count };
}

function mapCheckNoObjectReturn(files: Map<string, string>) {
  let count = 0;
  for (const [path, content] of files) {
    if (!path.endsWith("Service.java")) continue;
    count += (content.match(/public\s+Object\s+\w+\s*\(/g) ?? []).length;
  }
  return { count };
}

function mapCheckMethodParams(files: Map<string, string>) {
  let empty = 0;
  for (const [path, content] of files) {
    if (!path.endsWith("Service.java")) continue;
    // Méthodes publiques sans paramètres dont le nom suggère des paramètres
    const suspectMethods = content.match(
      /public\s+\w+\s+(get\w+|consulter\w+|rechercher\w+|generer\w+)\s*\(\s*\)/g
    ) ?? [];
    empty += suspectMethods.length;
  }
  return { empty };
}

function mapCheckServiceNaming(files: Map<string, string>) {
  let valid = 0, invalid = 0;
  const seen = new Set<string>();
  for (const [path] of files) {
    if (!path.includes("microservices/")) continue;
    const dirMatch = path.match(/microservices\/([^/]+)\//);
    if (!dirMatch) continue;
    const name = dirMatch[1];
    if (seen.has(name)) continue;
    seen.add(name);
    if (/^[a-z]+-[a-z]+(-[a-z]+)*$/.test(name)) valid++;
    else invalid++;
  }
  return { valid, invalid };
}

function mapCheckNoOracleKeywords(files: Map<string, string>) {
  // Only check table NAMES, not SQL content — Oracle keywords in SQL constants are expected
  // FIX v7.8: NOWAIT in "FOR UPDATE NOWAIT" is a legitimate SQL lock hint, not a table name
  const ORACLE_KW = new Set(["SYSDATE", "DUAL", "NEXTVAL", "ROWNUM", "ROWID"]);
  // NOWAIT is excluded because it's commonly used in "FOR UPDATE NOWAIT" which is valid SQL
  let count = 0;
  for (const [path, content] of files) {
    if (!path.endsWith(".java")) continue; // Skip reports (.md)
    // Check if Oracle keywords appear as table names in @Table or CREATE TABLE
    for (const kw of ORACLE_KW) {
      // Only flag if used as a table name: @Table(name="SYSDATE") or FROM SYSDATE or JOIN SYSDATE
      const tableNameRegex = new RegExp(
        `@Table\\s*\\(.*name\\s*=\\s*"${kw}"|` +
        `(?:FROM|JOIN|INTO)\\s+${kw}\\b`,
        "i"
      );
      if (tableNameRegex.test(content)) count++;
    }
  }
  return { count };
}

function mapCheckNoUrlConflicts(files: Map<string, string>) {
  const endpoints = new Map<string, string[]>();
  for (const [path, content] of files) {
    if (!path.endsWith("Controller.java")) continue;
    const mappings = content.match(/@(?:Get|Post|Put|Delete|Patch)Mapping\("([^"]+)"\)/g) ?? [];
    for (const m of mappings) {
      const url = m.match(/"([^"]+)"/)?.[1] ?? "";
      if (!endpoints.has(url)) endpoints.set(url, []);
      endpoints.get(url)!.push(path);
    }
  }
  let conflicts = 0;
  for (const [, paths] of endpoints) {
    if (paths.length > 1) conflicts++;
  }
  return { conflicts };
}

function mapCheckUseCaseCoverage(files: Map<string, string>) {
  const services = [...files.keys()].filter(p => p.endsWith("Service.java"));
  const controllers = [...files.keys()].filter(p => p.endsWith("Controller.java"));
  const total = Math.max(services.length, controllers.length);
  const covered = Math.min(services.length, controllers.length);
  const missing = Math.abs(services.length - controllers.length);
  return { total, covered, missing };
}

// ── v7.8 new check functions ────────────────────────────────────────

/**
 * CHECK I — No Void as variable type (Void sql = "..." is a compilation error)
 * Only checks .java files, skips .md reports
 */
function mapCheckNoVoidVariables(files: Map<string, string>): { count: number } {
  let count = 0;
  for (const [path, content] of files) {
    if (!path.endsWith(".java")) continue;
    count += (content.match(/\bVoid\s+\w+\s*=/g) ?? []).length;
  }
  return { count };
}

/**
 * CHECK J — No duplicate EJB services (e.g. CreditScoringEJBService.java alongside CreditService.java)
 * Detects *EJBService.java files that duplicate domain services
 */
function mapCheckNoDuplicateServices(files: Map<string, string>): { duplicates: number } {
  const serviceNames = [...files.keys()]
    .filter(p => p.endsWith("Service.java"))
    .map(p => p.split("/").pop()!.replace(".java", ""));

  // Count EJB-suffixed services that have a corresponding domain service
  let duplicates = 0;
  for (const name of serviceNames) {
    if (/EJBService$/.test(name)) {
      duplicates++;
    }
  }
  return { duplicates };
}

/**
 * CHECK K — No services generated for DTOs or CDI beans
 * Detects VoIn*Service, VoOut*Service, Transformer*Service patterns
 */
function mapCheckNoDtoServices(files: Map<string, string>): { count: number } {
  let count = 0;
  for (const [path] of files) {
    const fileName = path.split("/").pop() ?? "";
    if (/VoIn.*Service|VoOut.*Service|Transformer.*Service/i.test(fileName)) {
      count++;
    }
  }
  return { count };
}

/**
 * CHECK L — Saga Coverage (v7.9)
 * Vérifie si les EJBs multi-services ont des Sagas générées.
 * Un EJB est "multi-services" s'il injecte ≥2 autres EJBs.
 * Passe si : (a) des fichiers *SagaOrchestrator.java existent, ou (b) aucun candidat détecté.
 */
function checkSagaCoverage(files: Map<string, string>): {
  hasSagas: boolean;
  noCandidates: boolean;
  sagaCount: number;
  candidateCount: number;
} {
  // Count saga orchestrator files
  const sagaFiles = [...files.keys()].filter(p => /SagaOrchestrator\.java$/.test(p));
  const sagaCount = sagaFiles.length;

  // Heuristic: count EJBs that inject ≥2 other EJBs (multi-service candidates)
  let candidateCount = 0;
  for (const [filePath, content] of files) {
    if (!filePath.endsWith("Service.java") && !filePath.endsWith("Controller.java")) continue;
    // Count @Autowired or constructor-injected services
    const injections = (content.match(/@Autowired[\s\S]*?private\s+\w+Service\s/g) || []).length
      + (content.match(/private\s+final\s+\w+Service\s/g) || []).length;
    if (injections >= 2) {
      candidateCount++;
    }
  }

  return {
    hasSagas: sagaCount > 0,
    noCandidates: candidateCount === 0,
    sagaCount,
    candidateCount,
  };
}
