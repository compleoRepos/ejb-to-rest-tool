/**
 * tests/helpers/index.ts
 *
 * 5 helpers pour les tests de régression Compleo :
 * 1. zip-helper    : convertit un fixture en SourceFile[] (format moteur)
 * 2. parse-helper  : parse un fixture en ProjectIR
 * 3. compile-helper: vérifie la syntaxe Java du code généré
 * 4. score-helper  : calcule et vérifie le score de validation
 * 5. snapshot-helper: gère les snapshots de sortie pour détection de régression
 *
 * + java-analyzer : analyse statique du Java généré (patterns invalides)
 * + runFullTest   : pipeline complet fixture → parse → generate → validate
 */

import { parseEjbProject, type ProjectIR } from "../../server/java-parser";
import { generateSpringBootProject, type GenerationResult, type GeneratedFile } from "../../server/spring-generator";
import { getEngine, type SourceFile, type GeneratedProject, type EngineValidationResult } from "../../server/engine/CompleoEngine";
import type { TestFixture } from "../fixtures";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ZIP-HELPER — Convertit un fixture en SourceFile[]
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convertit les fichiers d'un TestFixture en format SourceFile[] attendu par le moteur.
 */
export function fixtureToSourceFiles(fixture: TestFixture): SourceFile[] {
  return fixture.files.map((f) => ({
    path: f.path,
    content: f.content,
  }));
}

/**
 * Retourne le contenu pom.xml du fixture ou undefined.
 */
export function fixturePomXml(fixture: TestFixture): string | undefined {
  return fixture.pomXml;
}

/**
 * Écrit un projet généré dans un répertoire temporaire.
 */
export function writeTmpProject(files: GeneratedFile[], projectName: string): string {
  const tmpDir = path.join("/tmp", `compleo-test-${projectName}-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const file of files) {
    const fullPath = path.join(tmpDir, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, "utf-8");
  }
  return tmpDir;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PARSE-HELPER — Parse un fixture en ProjectIR
// ═══════════════════════════════════════════════════════════════════════════════

export interface ParseResult {
  ir: ProjectIR;
  files: SourceFile[];
  parseTimeMs: number;
}

/**
 * Parse un fixture et retourne le ProjectIR + métriques.
 */
export function parseFixture(fixture: TestFixture): ParseResult {
  const files = fixtureToSourceFiles(fixture);
  const t0 = Date.now();
  const ir = parseEjbProject(files, fixture.pomXml);
  const parseTimeMs = Date.now() - t0;
  return { ir, files, parseTimeMs };
}

/**
 * Parse et retourne les compteurs de base pour assertions rapides.
 */
export function parseAndAssert(fixture: TestFixture): {
  ir: ProjectIR;
  useCaseCount: number;
  dtoCount: number;
  enumCount: number;
  exceptionCount: number;
  domains: string[];
} {
  const { ir } = parseFixture(fixture);
  const useCaseCount = ir.useCases?.length ?? 0;
  const dtoCount = ir.dtos?.length ?? 0;
  const enumCount = ir.enums?.length ?? 0;
  const exceptionCount = ir.exceptions?.length ?? 0;
  const domains = Array.from(new Set((ir.useCases || []).map((uc) => uc.domain || "general")));
  return { ir, useCaseCount, dtoCount, enumCount, exceptionCount, domains };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. COMPILE-HELPER — Vérifie la syntaxe Java du code généré
// ═══════════════════════════════════════════════════════════════════════════════

export interface CompileCheckResult {
  totalFiles: number;
  passedFiles: number;
  failedFiles: string[];
  errors: Array<{ file: string; message: string }>;
  hasBraceImbalance: boolean;
  hasDuplicateImports: boolean;
  hasObjectTypes: boolean;
  objectCount: number;
  duplicateImportCount: number;
  hasVoidBuilder: boolean;
}

/**
 * Vérifie la syntaxe basique des fichiers Java générés.
 */
export function checkCompilation(files: GeneratedFile[]): CompileCheckResult {
  const javaFiles = files.filter((f) => f.path.endsWith(".java"));
  const failedFiles: string[] = [];
  const errors: Array<{ file: string; message: string }> = [];
  let hasBraceImbalance = false;
  let hasDuplicateImports = false;
  let hasObjectTypes = false;
  let objectCount = 0;
  let duplicateImportCount = 0;
  let hasVoidBuilder = false;

  for (const file of javaFiles) {
    const lines = file.content.split("\n");
    let fileFailed = false;

    // 1. Accolades équilibrées
    let depth = 0;
    for (const line of lines) {
      const stripped = line.replace(/\/\/.*$/, "").replace(/"[^"]*"/g, "").replace(/'[^']*'/g, "");
      for (const ch of stripped) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
      }
    }
    if (depth !== 0) {
      hasBraceImbalance = true;
      fileFailed = true;
      errors.push({ file: file.path, message: `Accolades déséquilibrées (depth=${depth})` });
    }

    // 2. Imports dupliqués
    const imports = lines.filter((l) => l.trim().startsWith("import "));
    const importSet = new Set<string>();
    for (const imp of imports) {
      const normalized = imp.trim();
      if (importSet.has(normalized)) {
        duplicateImportCount++;
        hasDuplicateImports = true;
        errors.push({ file: file.path, message: `Import dupliqué: ${normalized}` });
      }
      importSet.add(normalized);
    }

    // 3. Types Object non résolus
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
      const stripped = line.replace(/\/\/.*$/, "").replace(/"[^"]*"/g, "").replace(/\/\*.*?\*\//g, "");
      if (stripped.includes("Map<String, Object>") || stripped.includes("Object.class") || stripped.includes("instanceof Object")) continue;
      const realMatches = stripped.match(/\bObject\b/g);
      if (realMatches) {
        objectCount += realMatches.length;
        hasObjectTypes = true;
      }
    }

    // 4. Void.builder()
    if (file.content.includes("Void.builder()") || file.content.includes("Void.VoidBuilder")) {
      hasVoidBuilder = true;
      fileFailed = true;
      errors.push({ file: file.path, message: "Void.builder() détecté — ne compile pas" });
    }

    if (fileFailed && !failedFiles.includes(file.path)) {
      failedFiles.push(file.path);
    }
  }

  return {
    totalFiles: javaFiles.length,
    passedFiles: javaFiles.length - failedFiles.length,
    failedFiles,
    errors,
    hasBraceImbalance,
    hasDuplicateImports,
    hasObjectTypes,
    objectCount,
    duplicateImportCount,
    hasVoidBuilder,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SCORE-HELPER — Calcule le score de validation
// ═══════════════════════════════════════════════════════════════════════════════

export interface ScoreBreakdown {
  useCasesDetected: number;
  compilesSuccessfully: number;
  correctReturnTypes: number;
  noUrlConflicts: number;
  kafkaDepsPresent: number;
  batchDepsPresent: number;
  dbDriverPresent: number;
  sqlConstantsAtClass: number;
  methodSignaturesValid: number;
  domainsCorrect: number;
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreBreakdown;
  issues: string[];
  passed: string[];
  status: "PASS" | "WARN" | "FAIL";
}

/**
 * Calcule un score de qualité (0-100) à partir des fichiers générés.
 */
export function calculateScore(
  generatedFiles: GeneratedFile[],
  compileResult: CompileCheckResult
): ScoreResult {
  const bd: ScoreBreakdown = {
    useCasesDetected: 0, compilesSuccessfully: 0, correctReturnTypes: 0,
    noUrlConflicts: 0, kafkaDepsPresent: 0, batchDepsPresent: 0,
    dbDriverPresent: 0, sqlConstantsAtClass: 0, methodSignaturesValid: 0,
    domainsCorrect: 0,
  };
  const issues: string[] = [];
  const passed: string[] = [];

  const fileMap = new Map<string, string>();
  for (const f of generatedFiles) fileMap.set(f.path, f.content);

  const report = Array.from(fileMap.entries()).find(([p]) => p.includes("MIGRATION_REPORT"))?.[1] ?? "";

  // 1. UseCases détectés (0-20)
  const ucMatch = report.match(/UseCases detectes\s*\|\s*(\d+)/);
  const ucCount = ucMatch ? parseInt(ucMatch[1]) : 0;
  if (ucCount > 0) {
    bd.useCasesDetected = Math.min(20, ucCount * 2);
    passed.push(`${ucCount} UseCases détectés`);
  } else {
    issues.push("0 UseCases détectés");
  }

  // 2. Compilation (0-30)
  if (compileResult.failedFiles.length === 0) {
    bd.compilesSuccessfully = 30;
    passed.push("Compilation syntaxique OK");
  } else {
    issues.push(`Compilation échouée : ${compileResult.failedFiles.length} fichiers`);
  }

  // 3. Types de retour corrects (0-10)
  const hasVoidBuilder = Array.from(fileMap.values()).some(
    (c) => c.includes("Void.builder()") || c.includes("Void.VoidBuilder")
  );
  const hasObjectReturn = Array.from(fileMap.values()).some((c) => /public Object \w+\(/.test(c));
  if (!hasVoidBuilder && !hasObjectReturn) {
    bd.correctReturnTypes = 10;
    passed.push("Types de retour corrects");
  } else {
    if (hasVoidBuilder) issues.push("Void.builder() détecté");
    if (hasObjectReturn) issues.push("public Object retour non typé");
  }

  // 4. Pas de conflits URL (0-10)
  let hasConflicts = false;
  for (const [p, content] of Array.from(fileMap.entries())) {
    if (!p.includes("/controller/") && !p.includes("Controller.java")) continue;
    const mappings = [
      ...(content.match(/@GetMapping\("[^"]*"\)/g) ?? []),
      ...(content.match(/@PostMapping\("[^"]*"\)/g) ?? []),
      ...(content.match(/@PutMapping\("[^"]*"\)/g) ?? []),
      ...(content.match(/@DeleteMapping\("[^"]*"\)/g) ?? []),
    ];
    if (new Set(mappings).size !== mappings.length) {
      hasConflicts = true;
      issues.push(`Conflits URL dans ${p}`);
    }
  }
  if (!hasConflicts) {
    bd.noUrlConflicts = 10;
    passed.push("Aucun conflit URL");
  }

  // 5. Kafka si JMS (0-5)
  const pom = fileMap.get("pom.xml") ?? "";
  const hasJms = report.includes("jms/") || report.includes("JMS");
  if (!hasJms || pom.includes("spring-kafka")) {
    bd.kafkaDepsPresent = 5;
    if (hasJms) passed.push("spring-kafka présent");
  } else {
    issues.push("spring-kafka absent alors que JMS détecté");
  }

  // 6. Spring Batch si JSR-352 (0-5)
  const hasBatch = report.includes("JSR-352") || report.includes("ItemReader");
  if (!hasBatch || pom.includes("spring-boot-starter-batch")) {
    bd.batchDepsPresent = 5;
    if (hasBatch) passed.push("spring-batch présent");
  } else {
    issues.push("spring-batch absent alors que JSR-352 détecté");
  }

  // 7. Driver DB correct (0-5)
  const yml = Array.from(fileMap.entries()).find(([p]) => p.includes("application.yml"))?.[1] ?? "";
  if (yml.includes("oracle.jdbc.OracleDriver") || pom.includes("ojdbc") || pom.includes("mysql-connector") || pom.includes("jcc")) {
    bd.dbDriverPresent = 5;
    passed.push("Driver DB correct");
  } else {
    issues.push("Driver DB absent ou incorrect");
  }

  // 8. SQL constants au niveau classe (0-5)
  const hasDuplicateConsts = Array.from(fileMap.values()).some((c) => {
    const localConsts = (c.match(/\bfinal String SQL_\w+\s*=/g) ?? []).length;
    const classConsts = (c.match(/static final String SQL_\w+\s*=/g) ?? []).length;
    return localConsts > classConsts;
  });
  if (!hasDuplicateConsts) {
    bd.sqlConstantsAtClass = 5;
    passed.push("SQL constants au niveau classe");
  } else {
    issues.push("SQL constants dupliquées dans les méthodes");
  }

  // 9. Signatures méthodes valides (0-5)
  const hasUndeclaredRequest = Array.from(fileMap.values()).some((c) =>
    /public\s+\w[\w<>]*\s+\w+\(\)\s*\{[\s\S]*?request\./m.test(c)
  );
  if (!hasUndeclaredRequest) {
    bd.methodSignaturesValid = 5;
    passed.push("Signatures méthodes valides");
  } else {
    issues.push("Méthodes sans paramètre qui référencent 'request'");
  }

  // 10. Domaines corrects (0-5)
  const generalCtrlEntry = Array.from(fileMap.entries()).find(([p]) => p.includes("GeneralController.java"));
  const generalContent = generalCtrlEntry?.[1] ?? "";
  if (!generalContent.includes("Reporting") && !generalContent.includes("Session")) {
    bd.domainsCorrect = 5;
    passed.push("Domaines corrects");
  } else {
    issues.push("Reporting/Session mal routés dans GeneralController");
  }

  const total = Object.values(bd).reduce((a, b) => a + b, 0);
  const status: ScoreResult["status"] = total >= 80 ? "PASS" : total >= 50 ? "WARN" : "FAIL";

  return { total, breakdown: bd, issues, passed, status };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SNAPSHOT-HELPER — Gère les snapshots de sortie
// ═══════════════════════════════════════════════════════════════════════════════

const SNAPSHOTS_DIR = path.resolve(__dirname, "..", "snapshots");

export interface Snapshot {
  fixtureId: string;
  timestamp: string;
  useCaseCount: number;
  dtoCount: number;
  enumCount: number;
  exceptionCount: number;
  generatedFileCount: number;
  generatedFilePaths: string[];
  score: number;
  status: string;
}

export function saveSnapshot(fixtureId: string, data: Omit<Snapshot, "fixtureId" | "timestamp">): void {
  if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const snapshot: Snapshot = { fixtureId, timestamp: new Date().toISOString(), ...data };
  fs.writeFileSync(path.join(SNAPSHOTS_DIR, `${fixtureId}.json`), JSON.stringify(snapshot, null, 2));
}

export function loadSnapshot(fixtureId: string): Snapshot | null {
  const filePath = path.join(SNAPSHOTS_DIR, `${fixtureId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function compareWithSnapshot(
  fixtureId: string,
  current: Omit<Snapshot, "fixtureId" | "timestamp">
): { hasRegression: boolean; diffs: string[] } {
  const previous = loadSnapshot(fixtureId);
  if (!previous) return { hasRegression: false, diffs: ["Pas de snapshot précédent — première exécution"] };

  const diffs: string[] = [];
  if (current.useCaseCount !== previous.useCaseCount) diffs.push(`UseCases: ${previous.useCaseCount} → ${current.useCaseCount}`);
  if (current.dtoCount !== previous.dtoCount) diffs.push(`DTOs: ${previous.dtoCount} → ${current.dtoCount}`);
  if (current.enumCount !== previous.enumCount) diffs.push(`Enums: ${previous.enumCount} → ${current.enumCount}`);
  if (current.exceptionCount !== previous.exceptionCount) diffs.push(`Exceptions: ${previous.exceptionCount} → ${current.exceptionCount}`);
  if (current.generatedFileCount !== previous.generatedFileCount) diffs.push(`Fichiers générés: ${previous.generatedFileCount} → ${current.generatedFileCount}`);
  if (current.score < previous.score) diffs.push(`Score régressé: ${previous.score} → ${current.score}`);

  const missingFiles = previous.generatedFilePaths.filter((f) => !current.generatedFilePaths.includes(f));
  if (missingFiles.length > 0) diffs.push(`Fichiers manquants: ${missingFiles.join(", ")}`);
  const newFiles = current.generatedFilePaths.filter((f) => !previous.generatedFilePaths.includes(f));
  if (newFiles.length > 0) diffs.push(`Nouveaux fichiers: ${newFiles.join(", ")}`);

  const hasRegression = diffs.some((d) => d.includes("régressé") || d.includes("manquants") || d.startsWith("UseCases:") || d.startsWith("DTOs:"));
  return { hasRegression, diffs };
}

// ═══════════════════════════════════════════════════════════════════════════════
// JAVA-ANALYZER — Analyse statique du Java généré
// ═══════════════════════════════════════════════════════════════════════════════

export interface JavaIssue {
  file: string;
  line: number;
  type: string;
  message: string;
  bugId: string;
}

export interface JavaAnalysis {
  hasVoidBuilder: boolean;
  hasUndeclaredRequest: boolean;
  hasSlashInMethodName: boolean;
  hasDoubleSlashMapping: boolean;
  hasObjectReturn: boolean;
  hasDuplicateMappings: boolean;
  hasDuplicateConstants: boolean;
  hasLifecycleMethods: boolean;
  hasRawTypes: boolean;
  issues: JavaIssue[];
}

export function analyzeJavaFiles(files: GeneratedFile[]): JavaAnalysis {
  const analysis: JavaAnalysis = {
    hasVoidBuilder: false, hasUndeclaredRequest: false, hasSlashInMethodName: false,
    hasDoubleSlashMapping: false, hasObjectReturn: false, hasDuplicateMappings: false,
    hasDuplicateConstants: false, hasLifecycleMethods: false, hasRawTypes: false, issues: [],
  };

  for (const file of files) {
    if (!file.path.endsWith(".java")) continue;
    const content = file.content;
    const lines = content.split("\n");

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      if (line.includes("Void.builder()") || line.includes("Void.VoidBuilder")) {
        analysis.hasVoidBuilder = true;
        analysis.issues.push({ file: file.path, line: lineNum, type: "VOID_BUILDER", message: "Void.builder() invalide", bugId: "BUG-V7C-001" });
      }
      if (/public\s+\w+\s+\w*\/\w*\(/.test(line)) {
        analysis.hasSlashInMethodName = true;
        analysis.issues.push({ file: file.path, line: lineNum, type: "SLASH_IN_METHOD", message: "Slash dans nom de méthode Java", bugId: "BUG-V7B-001" });
      }
      if (/@\w+Mapping\("\/\//.test(line)) {
        analysis.hasDoubleSlashMapping = true;
        analysis.issues.push({ file: file.path, line: lineNum, type: "DOUBLE_SLASH", message: "Double slash dans mapping URL", bugId: "BUG-V7B-002" });
      }
      if (/public Object \w+\(/.test(line)) {
        analysis.hasObjectReturn = true;
        analysis.issues.push({ file: file.path, line: lineNum, type: "OBJECT_RETURN", message: "Retour Object non typé", bugId: "BUG-GEN-001" });
      }
      if (/public void ejbCreate|public void ejbRemove|public void ejbActivate|public void ejbPassivate/.test(line)) {
        analysis.hasLifecycleMethods = true;
        analysis.issues.push({ file: file.path, line: lineNum, type: "EJB_LIFECYCLE", message: "Méthode lifecycle EJB dans code Spring", bugId: "BUG-EJB-LIFECYCLE" });
      }
    });

    const localConsts = (content.match(/\bfinal String SQL_\w+\s*=/g) ?? []).length;
    const staticConsts = (content.match(/static final String SQL_\w+\s*=/g) ?? []).length;
    if (localConsts > staticConsts * 2) {
      analysis.hasDuplicateConstants = true;
      analysis.issues.push({ file: file.path, line: 0, type: "DUPLICATE_CONSTANTS", message: `${localConsts} constantes locales vs ${staticConsts} statiques`, bugId: "BUG-V7C-004" });
    }

    if (file.path.includes("Controller")) {
      const mappings = [
        ...(content.match(/@GetMapping\("[^"]*"\)/g) ?? []),
        ...(content.match(/@PostMapping\("[^"]*"\)/g) ?? []),
        ...(content.match(/@PutMapping\("[^"]*"\)/g) ?? []),
        ...(content.match(/@DeleteMapping\("[^"]*"\)/g) ?? []),
      ];
      if (new Set(mappings).size !== mappings.length) {
        analysis.hasDuplicateMappings = true;
        analysis.issues.push({ file: file.path, line: 0, type: "DUPLICATE_MAPPINGS", message: "Mappings URL dupliqués", bugId: "BUG-V7C-003" });
      }
    }
  }

  return analysis;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL PIPELINE HELPER
// ═══════════════════════════════════════════════════════════════════════════════

export interface FullTestResult {
  fixture: TestFixture;
  ir: ProjectIR;
  generation: GenerationResult;
  compileCheck: CompileCheckResult;
  scoreResult: ScoreResult;
  javaAnalysis: JavaAnalysis;
  engineValidation?: EngineValidationResult;
}

/**
 * Exécute le pipeline complet pour un fixture (synchrone) :
 * parse → generate → compile-check → score → java-analysis.
 */
export function runFullTest(fixture: TestFixture): FullTestResult {
  const { ir } = parseFixture(fixture);
  const generation = generateSpringBootProject(ir);
  const compileCheck = checkCompilation(generation.files);
  const scoreResult = calculateScore(generation.files, compileCheck);
  const javaAnalysis = analyzeJavaFiles(generation.files);
  return { fixture, ir, generation, compileCheck, scoreResult, javaAnalysis };
}

/**
 * Exécute le pipeline complet via le CompleoEngine (async).
 */
export async function runFullEngineTest(fixture: TestFixture): Promise<FullTestResult & { engineValidation: EngineValidationResult }> {
  const engine = getEngine();
  const files = fixtureToSourceFiles(fixture);
  const analysis = await engine.analyze(files, { pomXml: fixture.pomXml, projectName: fixture.id });
  const project = await engine.generate(analysis.ir);
  const engineValidation = await engine.validate(project);
  const compileCheck = checkCompilation(project.files);
  const scoreResult = calculateScore(project.files, compileCheck);
  const javaAnalysis = analyzeJavaFiles(project.files);
  const generation: GenerationResult = { files: project.files, stats: project.stats, warnings: project.warnings };
  return { fixture, ir: analysis.ir, generation, compileCheck, scoreResult, javaAnalysis, engineValidation };
}

/**
 * Exécute le pipeline complet et sauvegarde le snapshot.
 */
export function runFullTestAndSnapshot(fixture: TestFixture): FullTestResult {
  const result = runFullTest(fixture);
  saveSnapshot(fixture.id, {
    useCaseCount: result.ir.useCases?.length ?? 0,
    dtoCount: result.ir.dtos?.length ?? 0,
    enumCount: result.ir.enums?.length ?? 0,
    exceptionCount: result.ir.exceptions?.length ?? 0,
    generatedFileCount: result.generation.files.length,
    generatedFilePaths: result.generation.files.map((f) => f.path),
    score: result.scoreResult.total,
    status: result.scoreResult.status,
  });
  return result;
}
