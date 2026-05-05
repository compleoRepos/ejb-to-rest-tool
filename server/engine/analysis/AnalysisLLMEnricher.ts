/**
 * AnalysisLLMEnricher — Enrichit les résultats d'analyse avec des insights LLM.
 *
 * Le LLM NE VOIT PAS le code source brut — il reçoit les métadonnées
 * structurées extraites par les couches 1-2. Ceci pour :
 * 1. Réduire le nombre de tokens (code source = trop long)
 * 2. Éviter les hallucinations sur du code
 * 3. Garder le LLM focalisé sur l'ANALYSE, pas le PARSING
 *
 * @version v10.5b
 */

import { llmGenerate, llmGenerateJSON, isLLMAvailable } from "../ml/llm-adapter";
import type { ProjectIR, UseCaseIR } from "../../java-parser";
import type { AnalysisResult } from "../CompleoEngine";
import type { TechnologyType } from "../registry/types";

// ═══════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════

export interface AIAnalysisInsights {
  projectSummary: string;
  domainInsights: DomainInsight[];
  riskAssessment: RiskInsight[];
  migrationStrategy: MigrationStep[];
  recommendationNotes: Record<string, string>;
  architecteComment: string;
  estimatedComplexity: string;
}

export interface DomainInsight {
  domain: string;
  label: string;
  businessRole: string;
  criticality: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  dependencies: string[];
  migrationNote: string;
}

export interface RiskInsight {
  risk: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  mitigation: string;
  affectedDomains: string[];
}

export interface MigrationStep {
  order: number;
  phase: string;
  domains: string[];
  description: string;
  duration: string;
  reason: string;
}

interface AnalysisContext {
  project: {
    name: string;
    files: number;
    loc: number;
    language: string;
  };
  technologies: Array<{
    name: TechnologyType;
    count: number;
    components: string[];
  }>;
  domains: Array<{
    name: string;
    useCases: number;
    classes: string[];
    tables: string[];
  }>;
  scores: {
    maturity: number;
    grade: string;
    dimensions: Record<string, number>;
  };
  sagaCandidates: string[];
  classNames: string[];
  methodSignatures: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// ENRICHER CLASS
// ═══════════════════════════════════════════════════════════════════════

export class AnalysisLLMEnricher {
  private llmAvailable: boolean = false;

  constructor(private ollamaUrl: string | null = null) {
    this.llmAvailable = true; // Will be checked at runtime
  }

  /**
   * Enrichit les résultats d'analyse avec des insights LLM.
   * Retourne null si le LLM n'est pas disponible.
   */
  async enrich(
    analysisResult: AnalysisResult,
    projectIR: ProjectIR,
  ): Promise<AIAnalysisInsights | null> {
    // Check LLM availability at runtime
    const available = await isLLMAvailable();
    if (!available) {
      console.log("[AI-ANALYSIS] LLM non disponible — skip enrichissement");
      return null;
    }

    console.log("[AI-ANALYSIS] Enrichissement IA en cours...");
    const startTime = Date.now();

    // Construire le contexte structuré pour le LLM
    const context = this.buildAnalysisContext(analysisResult, projectIR);

    // Lancer les 5 prompts en parallèle (indépendants)
    const [summary, domains, risks, strategy, justifications] = await Promise.allSettled([
      this.analyzeProjectSummary(context),
      this.analyzeDomains(context),
      this.analyzeRisks(context),
      this.analyzeMigrationStrategy(context),
      this.justifyRecommendations(context),
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`[AI-ANALYSIS] Enrichissement terminé en ${elapsed}ms`);

    return {
      projectSummary:
        summary.status === "fulfilled" && summary.value
          ? summary.value
          : this.fallbackSummary(context),
      domainInsights:
        domains.status === "fulfilled" && domains.value ? domains.value : [],
      riskAssessment:
        risks.status === "fulfilled" && risks.value ? risks.value : [],
      migrationStrategy:
        strategy.status === "fulfilled" && strategy.value ? strategy.value : [],
      recommendationNotes:
        justifications.status === "fulfilled" && justifications.value
          ? justifications.value
          : {},
      architecteComment: this.buildArchitecteComment(context),
      estimatedComplexity: this.estimateComplexity(context),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONTEXT BUILDER
  // ═══════════════════════════════════════════════════════════════════════

  private buildAnalysisContext(
    result: AnalysisResult,
    ir: ProjectIR,
  ): AnalysisContext {
    // Extract domains from use cases
    const domainMap = new Map<string, { useCases: number; classes: Set<string>; tables: Set<string> }>();
    for (const uc of ir.useCases) {
      const d = uc.domain || "unknown";
      if (!domainMap.has(d)) {
        domainMap.set(d, { useCases: 0, classes: new Set(), tables: new Set() });
      }
      const entry = domainMap.get(d)!;
      entry.useCases++;
      entry.classes.add(uc.className);
      // Extract table names from SQL annotations if available
      for (const svc of uc.injectedServices || []) {
        if (svc.type.toLowerCase().includes("dao") || svc.type.toLowerCase().includes("repository")) {
          entry.tables.add(svc.type);
        }
      }
    }

    // Build technology summary
    const techCounts = new Map<TechnologyType, { count: number; components: string[] }>();
    for (const comp of result.multiTech.detectedComponents) {
      const tech = comp.technology;
      if (!techCounts.has(tech)) {
        techCounts.set(tech, { count: 0, components: [] });
      }
      const entry = techCounts.get(tech)!;
      entry.count++;
      if (entry.components.length < 10) {
        entry.components.push(comp.className);
      }
    }

    const maturity = result.multiTech.maturityScore;

    return {
      project: {
        name: ir.projectName || "unknown",
        files: ir.useCases.length + ir.dtos.length + ir.services.length,
        loc: ir.stats?.totalLines || 0,
        language: "Java EE / J2EE",
      },
      technologies: Array.from(techCounts.entries()).map(([name, data]) => ({
        name,
        count: data.count,
        components: data.components,
      })),
      domains: Array.from(domainMap.entries()).map(([name, data]) => ({
        name,
        useCases: data.useCases,
        classes: Array.from(data.classes).slice(0, 10),
        tables: Array.from(data.tables).slice(0, 10),
      })),
      scores: {
        maturity: maturity?.global ?? 50,
        grade: maturity?.label ?? "B",
        dimensions: maturity?.dimensions ?? {},
      },
      sagaCandidates: [],
      classNames: ir.useCases.map((c) => c.className).slice(0, 50),
      methodSignatures: ir.useCases
        .map(
          (uc) =>
            `${uc.className}.${uc.useCaseDescription || uc.voInType}(${(uc.methodParameters || []).map((p: { name: string; type: string }) => p.type).join(", ")})`,
        )
        .slice(0, 30),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROMPT 1 — Résumé du projet
  // ═══════════════════════════════════════════════════════════════════════

  private async analyzeProjectSummary(ctx: AnalysisContext): Promise<string | null> {
    const prompt = `Tu es un architecte Java senior spécialisé en modernisation de systèmes bancaires.

PROJET ANALYSÉ :
- Nom : ${ctx.project.name}
- ${ctx.project.files} fichiers Java, ${ctx.project.loc} lignes de code
- Technologies détectées : ${ctx.technologies.map((t) => `${t.name} (${t.count})`).join(", ")}
- Domaines métier : ${ctx.domains.map((d) => `${d.name} (${d.useCases} use cases)`).join(", ")}
- Score maturité : ${ctx.scores.maturity}/100 (${ctx.scores.grade})

Rédige un résumé de 3-4 phrases qui explique :
1. Ce que fait ce projet (en termes métier, pas technique)
2. Son niveau de complexité pour la migration
3. Les points d'attention principaux

Écris comme un architecte qui parle à un chef de projet. Pas de bullet points.
Réponds UNIQUEMENT le texte du résumé, rien d'autre.`;

    return await llmGenerate(prompt, { temperature: 0.3, maxTokens: 500 });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROMPT 2 — Analyse des domaines métier
  // ═══════════════════════════════════════════════════════════════════════

  private async analyzeDomains(ctx: AnalysisContext): Promise<DomainInsight[] | null> {
    if (ctx.domains.length === 0) return [];

    const prompt = `Tu es un architecte Java senior spécialisé en systèmes bancaires core banking.

DOMAINES DÉTECTÉS dans le projet ${ctx.project.name} :
${ctx.domains
  .map(
    (d) => `- ${d.name} : ${d.useCases} use cases
  Classes : ${d.classes.join(", ")}
  Tables SQL : ${d.tables.join(", ") || "aucune détectée"}`,
  )
  .join("\n")}

Pour CHAQUE domaine, analyse :
1. Son rôle métier en 1 phrase
2. Sa criticité (CRITICAL / HIGH / MEDIUM / LOW) — CRITICAL si touche à l'argent ou conformité
3. Ses dépendances vers les autres domaines
4. Une note de migration (risque spécifique)

Réponds en JSON strict :
\`\`\`json
[
  {
    "domain": "nom_domaine",
    "label": "Label métier lisible",
    "businessRole": "Explication du rôle métier",
    "criticality": "HIGH",
    "dependencies": ["autre_domaine"],
    "migrationNote": "Risque ou attention particulière"
  }
]
\`\`\``;

    return await llmGenerateJSON<DomainInsight[]>(prompt, {
      temperature: 0.2,
      maxTokens: 2000,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROMPT 3 — Évaluation des risques
  // ═══════════════════════════════════════════════════════════════════════

  private async analyzeRisks(ctx: AnalysisContext): Promise<RiskInsight[] | null> {
    const prompt = `Tu es un architecte Java senior. Analyse les risques de migration pour ce projet.

PROJET : ${ctx.project.name}
- ${ctx.project.files} fichiers, ${ctx.project.loc} LOC
- Technologies : ${ctx.technologies.map((t) => t.name).join(", ")}
- Domaines : ${ctx.domains.map((d) => d.name).join(", ")}
- Score maturité : ${ctx.scores.maturity}/100
- Classes principales : ${ctx.classNames.slice(0, 20).join(", ")}

Identifie les 3-5 risques principaux de la migration. Pour chaque risque :
1. Nom court du risque
2. Sévérité (HIGH / MEDIUM / LOW)
3. Description (2 phrases max)
4. Mitigation recommandée (1 phrase)
5. Domaines affectés

Réponds en JSON strict :
\`\`\`json
[
  {
    "risk": "Nom du risque",
    "severity": "HIGH",
    "description": "Description du risque",
    "mitigation": "Action recommandée",
    "affectedDomains": ["domaine1"]
  }
]
\`\`\``;

    return await llmGenerateJSON<RiskInsight[]>(prompt, {
      temperature: 0.3,
      maxTokens: 1500,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROMPT 4 — Stratégie de migration
  // ═══════════════════════════════════════════════════════════════════════

  private async analyzeMigrationStrategy(ctx: AnalysisContext): Promise<MigrationStep[] | null> {
    if (ctx.domains.length < 2) return [];

    const prompt = `Tu es un architecte Java senior. Propose un plan de migration par phases.

PROJET : ${ctx.project.name}
- Domaines : ${ctx.domains.map((d) => `${d.name} (${d.useCases} UC)`).join(", ")}
- Technologies : ${ctx.technologies.map((t) => t.name).join(", ")}
- Score maturité : ${ctx.scores.maturity}/100

Règles :
- Commencer par les domaines sans dépendances entrantes
- Grouper les domaines par affinité fonctionnelle
- Les domaines critiques (argent, conformité) en dernier
- Max 4 phases

Réponds en JSON strict :
\`\`\`json
[
  {
    "order": 1,
    "phase": "Phase 1 — Socle",
    "domains": ["common", "notification"],
    "description": "Commencer par les domaines transversaux",
    "duration": "1-2 semaines",
    "reason": "Pas de dépendance entrante"
  }
]
\`\`\``;

    return await llmGenerateJSON<MigrationStep[]>(prompt, {
      temperature: 0.3,
      maxTokens: 1500,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROMPT 5 — Justification des recommandations
  // ═══════════════════════════════════════════════════════════════════════

  private async justifyRecommendations(
    ctx: AnalysisContext,
  ): Promise<Record<string, string> | null> {
    const recommendations = [
      "microservices",
      "saga-orchestration",
      "kafka-integration",
      "api-gateway",
      "circuit-breaker",
    ];

    const prompt = `Tu es un architecte Java senior. Justifie les recommandations suivantes pour ce projet.

PROJET : ${ctx.project.name}
- ${ctx.project.files} fichiers, ${ctx.project.loc} LOC
- Technologies : ${ctx.technologies.map((t) => t.name).join(", ")}
- Domaines : ${ctx.domains.map((d) => `${d.name} (${d.useCases} UC)`).join(", ")}
- Score maturité : ${ctx.scores.maturity}/100

RECOMMANDATIONS à justifier :
${recommendations.map((r) => `- ${r}`).join("\n")}

Pour chaque recommandation, écris 1-2 phrases de justification MÉTIER (pas technique).
Explique POURQUOI c'est pertinent pour CE projet spécifique.

Réponds en JSON strict :
\`\`\`json
{
  "microservices": "Justification...",
  "saga-orchestration": "Justification..."
}
\`\`\``;

    return await llmGenerateJSON<Record<string, string>>(prompt, {
      temperature: 0.3,
      maxTokens: 1000,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FALLBACKS (quand le LLM échoue ou est absent)
  // ═══════════════════════════════════════════════════════════════════════

  private fallbackSummary(ctx: AnalysisContext): string {
    const techList = ctx.technologies.map((t) => t.name).join(", ");
    const domainList = ctx.domains.map((d) => d.name).join(", ");
    return `Projet ${ctx.project.name} composé de ${ctx.project.files} fichiers Java (${ctx.project.loc} lignes). Technologies legacy détectées : ${techList}. Domaines métier identifiés : ${domainList}. Score de maturité : ${ctx.scores.maturity}/100 (${ctx.scores.grade}).`;
  }

  private buildArchitecteComment(ctx: AnalysisContext): string {
    const complexity =
      ctx.project.loc > 10000
        ? "élevée"
        : ctx.project.loc > 3000
          ? "moyenne"
          : "faible";
    const techCount = ctx.technologies.length;
    const domainCount = ctx.domains.length;

    return `Projet de complexité ${complexity} avec ${techCount} technologies legacy et ${domainCount} domaines métier. La migration nécessitera une attention particulière sur la cohérence transactionnelle inter-domaines.`;
  }

  private estimateComplexity(ctx: AnalysisContext): string {
    const loc = ctx.project.loc;
    const techs = ctx.technologies.length;
    const domains = ctx.domains.length;

    if (loc > 10000 || techs > 5 || domains > 8) {
      return "Projet de complexité élevée — migration en plusieurs itérations recommandée";
    }
    if (loc > 3000 || techs > 3 || domains > 4) {
      return "Projet de complexité moyenne — migration réalisable en une itération avec attention";
    }
    return "Projet de complexité faible — migration directe possible";
  }
}
