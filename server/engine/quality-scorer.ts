/**
 * QualityScorer — Compleo v7.2
 *
 * Score de qualité automatique post-génération (/100).
 * Vérifie 4 critères issus des FIX v7.1 :
 *   - Critère A (25 pts) : SQL constants au niveau classe uniquement (pas de copie dans les méthodes)
 *   - Critère B (25 pts) : Types retour corrects (pas de void quand voOutType est défini)
 *   - Critère C (25 pts) : Noms microservices = domaine EJB (pas de className_methodName)
 *   - Critère D (25 pts) : Pas de mots-clés Oracle dans les tables détectées
 *
 * @author Compleo Engine
 */

import type { GeneratedFile } from "../spring/shared";

// ── Types ────────────────────────────────────────────────────────────

export interface QualityCriterion {
  id:          "A" | "B" | "C" | "D";
  name:        string;
  maxPoints:   number;
  score:       number;
  passed:      number;
  total:       number;
  violations:  string[];
}

export interface QualityReport {
  totalScore:   number;
  maxScore:     number;
  grade:        string;
  criteria:     QualityCriterion[];
  summary:      string;
}

// ── Oracle keywords that must never appear as table names ────────────

const ORACLE_KEYWORDS = new Set([
  "DUAL", "SYSDATE", "SYSTIMESTAMP", "NOWAIT", "NEXTVAL", "CURRVAL",
  "ROWNUM", "ROWID", "LEVEL", "USER", "NULL", "TRUE", "FALSE",
  "DATE", "NUMBER", "VARCHAR2", "CLOB", "BLOB",
]);

// ── Scorer ───────────────────────────────────────────────────────────

export function scoreGeneration(
  files: GeneratedFile[],
  microserviceNames?: string[],
  detectedTables?: string[]
): QualityReport {
  const criteria: QualityCriterion[] = [
    scoreCriterionA(files),
    scoreCriterionB(files),
    scoreCriterionC(microserviceNames ?? []),
    scoreCriterionD(detectedTables ?? []),
  ];

  const totalScore = criteria.reduce((sum, c) => sum + c.score, 0);
  const maxScore = criteria.reduce((sum, c) => sum + c.maxPoints, 0);

  return {
    totalScore,
    maxScore,
    grade: computeGrade(totalScore, maxScore),
    criteria,
    summary: buildSummary(criteria, totalScore, maxScore),
  };
}

// ── Critère A : SQL constants au niveau classe uniquement ────────────

function scoreCriterionA(files: GeneratedFile[]): QualityCriterion {
  const serviceFiles = files.filter(f =>
    f.category === "service" && f.path.endsWith("Service.java")
  );

  let passed = 0;
  let total = 0;
  const violations: string[] = [];

  for (const file of serviceFiles) {
    const methods = extractMethods(file.content);
    for (const method of methods) {
      total++;
      // Check for SQL constant declarations inside method body
      const hasMethodLevelConstant =
        /(?:final\s+String\s+SQL_|String\s+SQL_|\/\/\s*Migrated constant from)/i.test(method.body);
      if (hasMethodLevelConstant) {
        violations.push(`${extractClassName(file.path)}.${method.name}: SQL constant déclarée dans le body`);
      } else {
        passed++;
      }
    }
  }

  // If no methods found, check class-level constants exist
  if (total === 0) {
    for (const file of serviceFiles) {
      total++;
      const hasClassConstants = /private\s+static\s+final\s+String\s+SQL_/i.test(file.content);
      if (hasClassConstants) passed++;
    }
  }

  const ratio = total > 0 ? passed / total : 1;
  return {
    id: "A",
    name: "SQL constants au niveau classe uniquement",
    maxPoints: 25,
    score: Math.round(25 * ratio),
    passed,
    total,
    violations,
  };
}

// ── Critère B : Types retour corrects ────────────────────────────────

function scoreCriterionB(files: GeneratedFile[]): QualityCriterion {
  const serviceFiles = files.filter(f =>
    f.category === "service" && f.path.endsWith("Service.java")
  );
  const controllerFiles = files.filter(f =>
    f.category === "controller" && f.path.endsWith("Controller.java")
  );

  let passed = 0;
  let total = 0;
  const violations: string[] = [];

  // Check services: methods should not return void if they have a meaningful return
  for (const file of serviceFiles) {
    const methods = extractMethods(file.content);
    for (const method of methods) {
      total++;
      // A method returning void that has a "return" statement with a value is suspicious
      if (method.returnType === "void") {
        const hasReturnValue = /return\s+[^;]+;/.test(method.body) &&
          !/return\s*;/.test(method.body);
        if (hasReturnValue) {
          violations.push(`${extractClassName(file.path)}.${method.name}: retourne void mais contient un return avec valeur`);
        } else {
          passed++;
        }
      } else {
        passed++;
      }
    }
  }

  // Check controllers: ResponseEntity<Void> when service returns non-void
  for (const file of controllerFiles) {
    const hasVoidResponse = /ResponseEntity<Void>/g.test(file.content);
    const hasNonVoidService = serviceFiles.some(sf => {
      const methods = extractMethods(sf.content);
      return methods.some(m => m.returnType !== "void");
    });
    if (hasVoidResponse && hasNonVoidService) {
      total++;
      violations.push(`${extractClassName(file.path)}: ResponseEntity<Void> alors que le service retourne un type`);
    }
  }

  const ratio = total > 0 ? passed / total : 1;
  return {
    id: "B",
    name: "Types retour corrects (pas de void injustifié)",
    maxPoints: 25,
    score: Math.round(25 * ratio),
    passed,
    total,
    violations,
  };
}

// ── Critère C : Noms microservices = domaine EJB ─────────────────────

function scoreCriterionC(microserviceNames: string[]): QualityCriterion {
  let passed = 0;
  let total = microserviceNames.length;
  const violations: string[] = [];

  for (const name of microserviceNames) {
    // Bad patterns: contains underscore (className_methodName format)
    if (name.includes("_")) {
      violations.push(`${name}: contient un underscore (format className_methodName)`);
    }
    // Bad patterns: contains EJB in the name
    else if (/ejb/i.test(name)) {
      violations.push(`${name}: contient 'EJB' dans le nom`);
    }
    // Bad patterns: name is too long (likely concatenated)
    else if (name.length > 30) {
      violations.push(`${name}: nom trop long (>30 chars), probablement concaténé`);
    }
    else {
      passed++;
    }
  }

  // If no microservices, give full score (not applicable)
  if (total === 0) {
    return {
      id: "C",
      name: "Noms microservices = domaine EJB",
      maxPoints: 25,
      score: 25,
      passed: 0,
      total: 0,
      violations: [],
    };
  }

  const ratio = passed / total;
  return {
    id: "C",
    name: "Noms microservices = domaine EJB",
    maxPoints: 25,
    score: Math.round(25 * ratio),
    passed,
    total,
    violations,
  };
}

// ── Critère D : Pas de mots-clés Oracle dans les tables ──────────────

function scoreCriterionD(detectedTables: string[]): QualityCriterion {
  let passed = 0;
  let total = detectedTables.length;
  const violations: string[] = [];

  for (const table of detectedTables) {
    if (ORACLE_KEYWORDS.has(table.toUpperCase())) {
      violations.push(`${table}: mot-clé Oracle détecté comme table`);
    } else {
      passed++;
    }
  }

  // If no tables, give full score (not applicable)
  if (total === 0) {
    return {
      id: "D",
      name: "Pas de mots-clés Oracle dans les tables",
      maxPoints: 25,
      score: 25,
      passed: 0,
      total: 0,
      violations: [],
    };
  }

  const ratio = passed / total;
  return {
    id: "D",
    name: "Pas de mots-clés Oracle dans les tables",
    maxPoints: 25,
    score: Math.round(25 * ratio),
    passed,
    total,
    violations,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

interface MethodInfo {
  name:       string;
  returnType: string;
  body:       string;
}

function extractMethods(javaContent: string): MethodInfo[] {
  const methods: MethodInfo[] = [];
  // Match Java method signatures: access modifier + return type + method name + params + body
  const methodRegex = /(?:public|protected|private)\s+([\w<>\[\],\s?]+?)\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
  let match;

  while ((match = methodRegex.exec(javaContent)) !== null) {
    const returnType = match[1].trim();
    const methodName = match[2];

    // Skip constructors and common non-business methods
    if (methodName === "main" || methodName === "toString" ||
        methodName === "hashCode" || methodName === "equals") continue;

    // Extract body by counting braces
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

function computeGrade(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 95) return "A+";
  if (pct >= 90) return "A";
  if (pct >= 85) return "B+";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

function buildSummary(
  criteria: QualityCriterion[],
  totalScore: number,
  maxScore: number
): string {
  const lines: string[] = [
    `## Score de Qualité : ${totalScore}/${maxScore} (${computeGrade(totalScore, maxScore)})`,
    "",
    "| Critère | Description | Score | Détail |",
    "|---------|-------------|-------|--------|",
  ];

  for (const c of criteria) {
    const detail = c.total > 0
      ? `${c.passed}/${c.total} passent`
      : "N/A";
    const icon = c.score === c.maxPoints ? "✅" : c.score > 0 ? "⚠️" : "❌";
    lines.push(
      `| ${icon} ${c.id} | ${c.name} | ${c.score}/${c.maxPoints} | ${detail} |`
    );
  }

  const violationCount = criteria.reduce((sum, c) => sum + c.violations.length, 0);
  if (violationCount > 0) {
    lines.push("");
    lines.push("### Violations détectées");
    lines.push("");
    for (const c of criteria) {
      for (const v of c.violations) {
        lines.push(`- **[${c.id}]** ${v}`);
      }
    }
  }

  return lines.join("\n");
}

// ── Export for report generation ──────────────────────────────────────

export function generateQualitySection(report: QualityReport): string {
  return report.summary;
}
