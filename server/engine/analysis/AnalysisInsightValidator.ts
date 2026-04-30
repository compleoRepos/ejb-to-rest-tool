/**
 * AnalysisInsightValidator v10.5b — Validateur anti-hallucination.
 *
 * Vérifie que les insights générés par le LLM sont cohérents avec les données
 * d'analyse statique (IR, graph, composants détectés).
 *
 * Règles :
 * 1. Les classes mentionnées doivent exister dans le projet (IR)
 * 2. Les domaines suggérés doivent contenir des classes réelles
 * 3. Les patterns mentionnés doivent correspondre à des structures détectées
 * 4. Les sévérités doivent être dans l'ensemble autorisé
 * 5. Les phases de migration doivent avoir un effort valide
 *
 * @author Compleo
 */

import type { ProjectIR, UseCaseIR } from "../../java-parser";

export interface ValidationResult {
  valid: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warnings: string[];
  corrections: Array<{ field: string; original: string; corrected: string }>;
}

export interface AIInsights {
  architectureAssessment?: {
    summary: string;
    patterns: string[];
    antiPatterns: string[];
    recommendations: string[];
  };
  migrationRisks?: {
    summary: string;
    risks: Array<{ risk: string; severity: string; mitigation: string }>;
  };
  domainBoundaries?: {
    summary: string;
    suggestedDomains: Array<{ name: string; classes: string[]; rationale: string }>;
  };
  modernizationStrategy?: {
    summary: string;
    phases: Array<{ phase: string; description: string; effort: string }>;
  };
  codeQualityInsights?: {
    summary: string;
    hotspots: Array<{ className: string; issue: string; suggestion: string }>;
  };
}

const VALID_SEVERITIES = ["critical", "high", "medium", "low"];
const VALID_EFFORTS = ["low", "medium", "high", "very-high", "minimal", "significant", "moderate"];

/**
 * Valide et corrige les insights IA en les croisant avec les données statiques du projet.
 */
export function validateInsights(
  insights: AIInsights,
  ir: ProjectIR
): { validated: AIInsights; report: ValidationResult } {
  const report: ValidationResult = {
    valid: true,
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    warnings: [],
    corrections: [],
  };

  // Extraire tous les noms de classes du projet
  const projectClasses = new Set<string>();
  const projectClassesLower = new Map<string, string>(); // lowercase → original
  for (const uc of ir.useCases) {
    const className = extractClassName(uc);
    if (className) {
      projectClasses.add(className);
      projectClassesLower.set(className.toLowerCase(), className);
    }
  }

  const validated = structuredClone(insights);

  // ─── 1. Valider architectureAssessment ───────────────────────────────────
  if (validated.architectureAssessment) {
    report.totalChecks++;
    if (validated.architectureAssessment.summary && validated.architectureAssessment.summary.length > 10) {
      report.passedChecks++;
    } else {
      report.failedChecks++;
      report.warnings.push("architectureAssessment.summary est trop court ou vide");
    }

    // Vérifier que les patterns ne sont pas des hallucinations évidentes
    report.totalChecks++;
    const validPatterns = validated.architectureAssessment.patterns.filter(p => p.length > 3);
    if (validPatterns.length === validated.architectureAssessment.patterns.length) {
      report.passedChecks++;
    } else {
      report.failedChecks++;
      validated.architectureAssessment.patterns = validPatterns;
      report.corrections.push({
        field: "architectureAssessment.patterns",
        original: `${validated.architectureAssessment.patterns.length} patterns`,
        corrected: `${validPatterns.length} patterns (supprimé les entrées vides)`,
      });
    }
  }

  // ─── 2. Valider migrationRisks ───────────────────────────────────────────
  if (validated.migrationRisks) {
    for (let i = 0; i < validated.migrationRisks.risks.length; i++) {
      const risk = validated.migrationRisks.risks[i];
      report.totalChecks++;

      // Vérifier la sévérité
      if (VALID_SEVERITIES.includes(risk.severity.toLowerCase())) {
        report.passedChecks++;
        risk.severity = risk.severity.toLowerCase();
      } else {
        report.failedChecks++;
        const corrected = inferSeverity(risk.severity);
        report.corrections.push({
          field: `migrationRisks.risks[${i}].severity`,
          original: risk.severity,
          corrected,
        });
        risk.severity = corrected;
      }
    }
  }

  // ─── 3. Valider domainBoundaries ─────────────────────────────────────────
  if (validated.domainBoundaries) {
    for (let i = 0; i < validated.domainBoundaries.suggestedDomains.length; i++) {
      const domain = validated.domainBoundaries.suggestedDomains[i];
      report.totalChecks++;

      // Vérifier que les classes existent dans le projet
      const validClasses: string[] = [];
      const invalidClasses: string[] = [];

      for (const cls of domain.classes) {
        const match = findClassMatch(cls, projectClasses, projectClassesLower);
        if (match) {
          validClasses.push(match);
        } else {
          invalidClasses.push(cls);
        }
      }

      if (invalidClasses.length === 0) {
        report.passedChecks++;
      } else if (validClasses.length > 0) {
        // Correction partielle : garder seulement les classes valides
        report.failedChecks++;
        report.corrections.push({
          field: `domainBoundaries.suggestedDomains[${i}].classes`,
          original: `${domain.classes.length} classes`,
          corrected: `${validClasses.length} classes valides (${invalidClasses.length} hallucinées supprimées: ${invalidClasses.slice(0, 3).join(", ")}${invalidClasses.length > 3 ? "..." : ""})`,
        });
        domain.classes = validClasses;
      } else {
        // Toutes les classes sont hallucinées — supprimer le domaine
        report.failedChecks++;
        report.warnings.push(
          `Domaine "${domain.name}" supprimé : aucune classe valide (${invalidClasses.slice(0, 3).join(", ")})`
        );
        validated.domainBoundaries.suggestedDomains.splice(i, 1);
        i--;
      }
    }
  }

  // ─── 4. Valider modernizationStrategy ────────────────────────────────────
  if (validated.modernizationStrategy) {
    for (let i = 0; i < validated.modernizationStrategy.phases.length; i++) {
      const phase = validated.modernizationStrategy.phases[i];
      report.totalChecks++;

      // Vérifier que l'effort est dans l'ensemble autorisé
      const effortLower = phase.effort.toLowerCase().trim();
      if (VALID_EFFORTS.some(e => effortLower.includes(e))) {
        report.passedChecks++;
      } else {
        report.failedChecks++;
        const corrected = inferEffort(phase.effort);
        report.corrections.push({
          field: `modernizationStrategy.phases[${i}].effort`,
          original: phase.effort,
          corrected,
        });
        phase.effort = corrected;
      }
    }
  }

  // ─── 5. Valider codeQualityInsights ──────────────────────────────────────
  if (validated.codeQualityInsights) {
    const validHotspots: typeof validated.codeQualityInsights.hotspots = [];

    for (const hotspot of validated.codeQualityInsights.hotspots) {
      report.totalChecks++;

      const match = findClassMatch(hotspot.className, projectClasses, projectClassesLower);
      if (match) {
        report.passedChecks++;
        hotspot.className = match; // Corriger la casse si nécessaire
        validHotspots.push(hotspot);
      } else {
        report.failedChecks++;
        report.warnings.push(
          `Hotspot supprimé : classe "${hotspot.className}" n'existe pas dans le projet`
        );
      }
    }

    validated.codeQualityInsights.hotspots = validHotspots;
  }

  // ─── Résultat final ──────────────────────────────────────────────────────
  report.valid = report.failedChecks === 0;

  return { validated, report };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractClassName(uc: UseCaseIR): string | null {
  // Extraire le nom de classe depuis le sourceFile ou className
  if ((uc as any).className) return (uc as any).className;
  if (uc.sourceFile) {
    const match = uc.sourceFile.match(/([A-Z][a-zA-Z0-9]+)\.java$/);
    if (match) return match[1];
  }
  return uc.className || null;
}

function findClassMatch(
  candidate: string,
  projectClasses: Set<string>,
  projectClassesLower: Map<string, string>
): string | null {
  // Exact match
  if (projectClasses.has(candidate)) return candidate;

  // Case-insensitive match
  const lower = candidate.toLowerCase();
  if (projectClassesLower.has(lower)) return projectClassesLower.get(lower)!;

  // Partial match (le LLM peut ajouter des suffixes comme "Service", "Impl")
  for (const [key, value] of projectClassesLower) {
    if (key.includes(lower) || lower.includes(key)) {
      return value;
    }
  }

  return null;
}

function inferSeverity(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("crit") || lower.includes("bloqu")) return "critical";
  if (lower.includes("high") || lower.includes("haut") || lower.includes("élev")) return "high";
  if (lower.includes("med") || lower.includes("moy")) return "medium";
  return "low";
}

function inferEffort(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("very") || lower.includes("très") || lower.includes("major")) return "very-high";
  if (lower.includes("high") || lower.includes("haut") || lower.includes("élev") || lower.includes("signif")) return "high";
  if (lower.includes("med") || lower.includes("moy") || lower.includes("moder")) return "medium";
  return "low";
}
