/**
 * ReportEnhancer — Compleo v7.4
 *
 * Transforme les rapports mécaniques en conseil d'architecte senior.
 * Utilise un LLM local (Ollama) pour enrichir 5 rapports :
 *   - MIGRATION_REPORT.md
 *   - MICROSERVICES_REPORT.md
 *   - DATASOURCE_MIGRATION.md
 *   - QUALITY_SCORE.md
 *   - EXECUTIVE_SUMMARY.md (nouveau)
 *
 * Le ML est optionnel. Si Ollama est indisponible, les rapports
 * originaux sont retournés sans modification (fallback gracieux).
 *
 * @author Hamza NORDINE
 */

import type { ServiceCandidate, ParsedModule } from "../microservices/microservice-splitter";
import type { QualityReport, QualityCheck } from "../quality-scorer";

// ── Configuration ────────────────────────────────────────────────

export interface ReportEnhancerConfig {
  ollamaUrl:   string;
  model:       string;   // qwen2.5:1.5b (léger, offline, gratuit)
  enabled:     boolean;
  language:    "fr" | "en";
  timeoutMs?:  number;   // défaut: 180_000 (3 min)
}

// ── Types de contexte ────────────────────────────────────────────

export interface ReportContext {
  projectName:             string;
  modules:                 ReportModule[];
  services:                ReportService[];
  dataSources:             ReportDataSource[];
  useCasesCount:           number;
  confidenceScore:         number;
  qualityReport:           QualityReport;
  estimatedDuration:       number;
  criticalDependencies:    string[];
  requiredInfrastructure:  string[];
}

export interface ReportModule {
  id:            string;
  type:          string;
  writeTables?:  string[];
  readTables?:   string[];
  dataSources?:  string[];
  jmsQueues?:    string[];
  externalApis?: string[];
  sqlFeatures?:  string[];
  ejbCalls?:     string[];
}

export interface ReportService {
  name:             string;
  ejbs?:            string[];
  ownedTables?:     string[];
  readOnlyTables?:  string[];
  kafkaTopics?:     { name: string; direction: "PRODUCE" | "CONSUME" }[];
  restApis?:        { path: string }[];
  restDependencies?: { targetService: string; isCritical?: boolean }[];
  dbSchema?:        string;
  confidence:       number;
}

export interface ReportDataSource {
  jndi:        string;
  vendor:      string;
  schema:      string;
  tables:      string[];
  sqlFeatures: string[];
}

// ── Résultat ─────────────────────────────────────────────────────

export interface EnhancedReports {
  enhanced: boolean;
  reports:  Record<string, string | null>;
}

// ── ReportEnhancer ───────────────────────────────────────────────

export class ReportEnhancer {
  private config: ReportEnhancerConfig;
  private timeoutMs: number;

  constructor(config: ReportEnhancerConfig) {
    this.config    = config;
    this.timeoutMs = config.timeoutMs ?? 180_000;
  }

  // ── Point d'entrée principal ─────────────────────────────────

  async enhanceAll(context: ReportContext): Promise<EnhancedReports> {
    if (!this.config.enabled) {
      return { enhanced: false, reports: {} };
    }

    // Exécution séquentielle — Ollama ne peut traiter qu'un prompt à la fois
    // sur des machines à mémoire limitée (< 8 Go RAM).
    // Chaque rapport bénéficie ainsi de toute la mémoire GPU/CPU disponible.
    const reports: Record<string, string | null> = {
      MIGRATION_REPORT:     null,
      MICROSERVICES_REPORT: null,
      DATASOURCE_MIGRATION: null,
      QUALITY_SCORE:        null,
      EXECUTIVE_SUMMARY:    null,
    };

    const tasks: { key: string; fn: () => Promise<string> }[] = [
      { key: "MIGRATION_REPORT",     fn: () => this.enhanceMigrationReport(context) },
      { key: "MICROSERVICES_REPORT", fn: () => this.enhanceMicroservicesReport(context) },
      { key: "DATASOURCE_MIGRATION", fn: () => this.enhanceDatasourceReport(context) },
      { key: "QUALITY_SCORE",        fn: () => this.enhanceQualityScore(context) },
      { key: "EXECUTIVE_SUMMARY",    fn: () => this.generateExecutiveSummary(context) },
    ];

    for (const task of tasks) {
      try {
        reports[task.key] = await task.fn();
      } catch (err) {
        // Fallback gracieux : si un rapport échoue, on continue avec les suivants
        console.warn(`[ReportEnhancer] ${task.key} échoué: ${err instanceof Error ? err.message : String(err)}`);
        reports[task.key] = null;
      }
    }

    return { enhanced: true, reports };
  }

  // ── MIGRATION_REPORT.md enrichi ──────────────────────────────

  async enhanceMigrationReport(ctx: ReportContext): Promise<string> {
    const prompt = this.buildMigrationPrompt(ctx);
    const raw    = await this.ollamaGenerate(prompt, {
      temperature: 0.3,
      num_predict: 2000,
    });
    return this.sanitizeOutput(raw, ctx); // BUG-G/H v7.5
  }

  private buildMigrationPrompt(ctx: ReportContext): string {
    const risks = this.extractRisks(ctx);

    return `Tu es un architecte Java EE senior spécialisé dans les banques marocaines. Tu connais Oracle RAC, la directive BAM, WebLogic 12.2, et les contraintes des SI bancaires africains.

## Projet analysé
Banque : ${ctx.projectName}
Modules détectés : ${ctx.modules.length} classes Java EE
UseCases migrés  : ${ctx.useCasesCount}
Score confiance  : ${ctx.confidenceScore}%

## Modules et leurs caractéristiques
${ctx.modules.map(m => `
### ${m.id} (${m.type})
- Tables propriétaires : ${m.writeTables?.join(", ") || "aucune"}
- Tables lues : ${m.readTables?.join(", ") || "aucune"}
- DataSources : ${m.dataSources?.join(", ") || "aucune"}
- JMS : ${m.jmsQueues?.join(", ") || "aucune"}
- APIs externes : ${m.externalApis?.join(", ") || "aucune"}
- Features SQL : ${m.sqlFeatures?.join(", ") || "aucune"}
- Appels @EJB : ${m.ejbCalls?.join(", ") || "aucun"}
`).join("")}

## Risques détectés automatiquement
${risks.map(r => `- ${r}`).join("\n")}

## Ta mission
Génère un MIGRATION_REPORT.md enrichi en français avec :

1. Un résumé exécutif de 3-4 phrases (pour le DSI, pas le développeur)
2. Pour chaque module : les risques réels, leur impact business, les actions concrètes
3. L'ordre de migration recommandé avec justification
4. Les dépendances bloquantes entre modules
5. Les points nécessitant une décision humaine (pas automatisables)

Ton : direct, professionnel, orienté action. Évite le jargon.
Format : Markdown avec ## et ###. Max 800 mots.

Génère le rapport :`;
  }

  // ── MICROSERVICES_REPORT.md enrichi ──────────────────────────

  async enhanceMicroservicesReport(ctx: ReportContext): Promise<string> {
    const prompt = `Tu es un architecte microservices senior.
Tu dois expliquer à un DSI pourquoi ce découpage en ${ctx.services.length} services est la bonne décision, et ce qu'il doit savoir avant de l'approuver.

## Découpage proposé
${ctx.services.map(s => `
### ${s.name} (confiance ${s.confidence}%)
- Modules inclus : ${s.ejbs?.join(", ") || "aucun"}
- Tables propriétaires : ${s.ownedTables?.join(", ") || "aucune"}
- Tables dépendantes : ${s.readOnlyTables?.join(", ") || "aucune"}
- APIs exposées : ${s.restApis?.map(a => a.path).join(", ") || "aucune"}
- Dépendances : ${s.restDependencies?.map(d =>
    d.targetService + (d.isCritical ? " ⚡CRITIQUE" : "")).join(", ") || "aucune"}
- Kafka : ${s.kafkaTopics?.map(t =>
    (t.direction === "PRODUCE" ? "→" : "←") + " " + t.name).join(", ") || "aucun"}
`).join("")}

## Ta mission
Génère un MICROSERVICES_REPORT.md enrichi en français avec :

1. Explication du découpage en langage DSI (pas développeur)
2. Pour chaque service :
   - Pourquoi ce périmètre (justification data-driven)
   - Ce qui peut mal se passer (risques spécifiques)
   - Par quel service commencer et pourquoi
3. Les décisions architecturales que le DSI doit valider
4. L'infrastructure minimale nécessaire (ce qui doit exister avant de déployer)
5. Timeline réaliste avec les dépendances entre services

Pour les services à confiance < 70% : expliquer le problème clairement et donner les 2-3 options avec leurs trade-offs.

Format : Markdown. Ton : conseil senior, direct, honnête sur les risques.
Max 1000 mots.

Génère le rapport :`;

    const raw = await this.ollamaGenerate(prompt, {
      temperature: 0.3,
      num_predict: 2500,
    });
    return this.sanitizeOutput(raw, ctx); // BUG-G/H v7.5
  }
  // ── DATASOURCE_MIGRATION.md enrichii ──────────────────────────

  async enhanceDatasourceReport(ctx: ReportContext): Promise<string> {
    const dsDetails = ctx.dataSources.map(ds => ({
      jndi:     ds.jndi,
      vendor:   ds.vendor,
      schema:   ds.schema,
      tables:   ds.tables,
      features: ds.sqlFeatures,
    }));

    const prompt = `Tu es un DBA Oracle senior et expert en migration de bases de données pour les institutions financières.

## DataSources détectées
${JSON.stringify(dsDetails, null, 2)}

## Ta mission
Pour chaque DataSource, génère une section dans DATASOURCE_MIGRATION.md avec :

1. Les spécificités SQL détectées et leur équivalent Spring Boot
   Exemples :
   - Oracle FOR UPDATE NOWAIT → @Lock(PESSIMISTIC_WRITE) avec QueryHint
   - DB2 YEAR(date) → @Query(nativeQuery=true) ou EXTRACT(YEAR FROM date)
   - Oracle ROWNUM → FETCH FIRST n ROWS ONLY (déjà standard)
   - Oracle SYSDATE → LocalDateTime.now() ou CURRENT_TIMESTAMP

2. La configuration Spring Boot exacte (application.yml)
   Avec les valeurs correctes pour Oracle 19c RAC et DB2 LUW 11.5

3. Le plan de migration des données
   - Ce qui peut être automatisé
   - Ce qui nécessite un DBA
   - Les risques de perte de données
   - La durée estimée réaliste

4. La stratégie de cohabitation pendant la transition
   (Strangler Fig Pattern — l'ancien et le nouveau coexistent)

Sois précis sur les versions : Oracle 19c, DB2 LUW 11.5, ojdbc11 v23.2.
Format : Markdown technique mais lisible par un chef de projet.

Génère le rapport :`;

     const raw = await this.ollamaGenerate(prompt, {
      temperature: 0.2,
      num_predict: 2000,
    });
    return this.sanitizeOutput(raw, ctx); // BUG-G/H v7.5
  }
  // ── QUALITY_SCORE.md enrichi ─────────────────────────────────

  async enhanceQualityScore(ctx: ReportContext): Promise<string> {
    const report = ctx.qualityReport;

    const prompt = `Tu es un lead développeur Java Spring Boot.
Tu dois expliquer à un responsable technique ce que signifie ce score de qualité en termes concrets et ce qu'il faut faire.

## Score calculé : ${report.score}/100 (${report.grade})

## Détail des checks
${report.checks.map((c: QualityCheck) => `
- ${c.passed ? "✅" : "❌"} ${c.id} (${c.points}/${c.maxPoints} pts)
  ${c.description}
  Détail : ${c.detail}
`).join("")}

## Problèmes détectés
${report.issues.join("\n")}

## Ta mission
Génère un QUALITY_SCORE.md enrichi en français avec :

1. Ce que ce score signifie en pratique
   (peut-on déployer ? qu'est-ce qui risque de casser ?)

2. Pour chaque problème détecté :
   - Impact concret sur le comportement de l'application
   - Temps estimé pour le corriger (en heures)
   - Priorité : BLOQUANT / IMPORTANT / MINEUR

3. Ce qui peut être déployé en l'état sans risque

4. La checklist "prêt pour la production"
   avec les items restants à compléter

Sois honnête : si le code n'est pas prêt à déployer, dis-le clairement.
Format : Markdown. Max 500 mots.

Génère le rapport :`;

    const raw = await this.ollamaGenerate(prompt, {
      temperature: 0.2,
      num_predict: 1200,
    });
    return this.sanitizeOutput(raw, ctx); // BUG-G/H v7.5
  }
  // ── EXECUTIVE_SUMMARY.mdd — nouveau fichier pour le DSI/COMEX ─

  async generateExecutiveSummary(ctx: ReportContext): Promise<string> {
    const prompt = `Tu es consultant en transformation digitale bancaire.
Tu dois écrire un résumé exécutif d'une page destiné au DSI ou au COMEX d'une banque marocaine. Pas de jargon technique. Focus sur la valeur, les risques, et les décisions à prendre.

## Contexte
Projet : Migration SI Legacy → Architecture Microservices Spring Boot
Banque : ${ctx.projectName}
Modules analysés : ${ctx.modules.length}
Services microservices proposés : ${ctx.services.length}
Score qualité global : ${ctx.qualityReport.score}/100
Durée estimée totale : ${ctx.estimatedDuration} semaines

## Points clés techniques (à traduire en langage DSI)
- Modules à faible risque (déployables rapidement) : ${
  ctx.services.filter(s => s.confidence >= 85).map(s => s.name).join(", ") || "aucun"
}
- Modules nécessitant une décision architecturale : ${
  ctx.services.filter(s => s.confidence < 70).map(s => s.name).join(", ") || "aucun"
}
- Dépendances critiques identifiées : ${ctx.criticalDependencies.join(", ") || "aucune"}
- Infrastructure requise : ${ctx.requiredInfrastructure.join(", ") || "non spécifiée"}

## Ta mission
Génère un EXECUTIVE_SUMMARY.md avec :

1. Résumé en 3 phrases (ce qu'on fait, pourquoi, en combien de temps)

2. Les 3 bénéfices principaux pour la banque
   (conformité BAM, réduction des coûts, agilité — avec des chiffres réalistes)

3. Les 3 risques principaux et leurs mitigations
   (pas plus — les DSI n'ont pas le temps pour des listes de 20 points)

4. Les 3 décisions que le DSI doit prendre maintenant
   (pas les décisions techniques — les décisions stratégiques)

5. Le calendrier en 3 phases (rapide/moyen/long terme)
   Avec des jalons clairs et mesurables

6. L'investissement humain requis
   (combien de développeurs, pendant combien de temps)

Ton : confiant, professionnel, honnête sur les risques.
Aucun acronyme sans explication. Max 600 mots.

Génère le résumé exécutif :`;

    const raw = await this.ollamaGenerate(prompt, {
      temperature: 0.4,
      num_predict: 1500,
    });
    return this.sanitizeOutput(raw, ctx); // BUG-G/H v7.5
  }
  // ── Ollama API calll ──────────────────────────────────────────

  private async ollamaGenerate(
    prompt: string,
    options: { temperature: number; num_predict: number }
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.config.ollamaUrl}/api/generate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          model:   this.config.model,
          prompt,
          stream:  false,
          options: {
            temperature: options.temperature,
            num_predict: options.num_predict,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Ollama generate failed: ${res.status}`);
      }

      const data = await res.json() as { response: string };
      return data.response;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  extractRisks(ctx: ReportContext): string[] {
    const risks: string[] = [];

    for (const mod of ctx.modules) {
      if (mod.sqlFeatures?.includes("FOR UPDATE NOWAIT")) {
        risks.push(`${mod.id} : verrou Oracle FOR UPDATE NOWAIT — comportement différent en microservices`);
      }
      if (mod.dataSources?.some(ds => ds.includes("DB2"))) {
        risks.push(`${mod.id} : IBM DB2 LUW — syntaxe SQL non standard, migration spécifique nécessaire`);
      }
      if ((mod.dataSources?.length ?? 0) > 2) {
        risks.push(`${mod.id} : ${mod.dataSources!.length} DataSources — transaction distribuée complexe`);
      }
      if (mod.externalApis?.some(api => api.includes("SOAP"))) {
        risks.push(`${mod.id} : WebService SOAP externe — générer un stub adapter, tester l'intégration`);
      }
      if ((mod.ejbCalls?.length ?? 0) > 2) {
        risks.push(`${mod.id} : ${mod.ejbCalls!.length} appels @EJB — fort couplage, risque de découpage`);
      }
    }

    return risks;
  }

  estimateDuration(ctx: ReportContext): number {
    return ctx.services.length * 2 + 4;
  }

  cleanMarkdown(raw: string): string {
    return raw
      .replace(/```markdown\s*/g, "")
      .replace(/```\s*$/g, "")
      .trim();
  }

  /**
   * BUG-G v7.5: Detect and strip prompt leak from ML output.
   * The LLM sometimes echoes back parts of the system prompt.
   */
  stripPromptLeak(output: string): string {
    // Remove lines that look like prompt instructions
    const promptPatterns = [
      /^Tu es un architecte.*$/gm,
      /^Tu dois .*$/gm,
      /^## Ta mission$/gm,
      /^Génère (?:un|le) (?:rapport|résumé).*:$/gm,
      /^Ton\s*:.*$/gm,
      /^Format\s*:.*$/gm,
      /^Sois honnête\s*:.*$/gm,
      /^Aucun acronyme.*$/gm,
      /^Max \d+ mots\.?$/gm,
    ];

    let cleaned = output;
    for (const pattern of promptPatterns) {
      cleaned = cleaned.replace(pattern, "");
    }

    // Remove consecutive blank lines (artifact of stripping)
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
    return cleaned.trim();
  }

  /**
   * BUG-H v7.5: Detect hallucinated content in ML output.
   * Returns true if the output contains suspicious patterns.
   */
  detectHallucinations(output: string, context: ReportContext): string[] {
    const warnings: string[] = [];

    // Check for invented module names not in the context
    const knownModuleIds = new Set(context.modules.map(m => m.id.toLowerCase()));
    const knownServiceNames = new Set(context.services.map(s => s.name.toLowerCase()));

    // Extract module-like references from the output (PascalCase words ending with EJB/Service/Bean)
    const moduleRefs = output.match(/\b[A-Z][a-zA-Z]+(?:EJB|Service|Bean|Servlet|MDB|DAO)\b/g) ?? [];
    for (const ref of moduleRefs) {
      if (!knownModuleIds.has(ref.toLowerCase()) &&
          !knownServiceNames.has(ref.toLowerCase())) {
        warnings.push(`Module potentiellement halluciné : ${ref}`);
      }
    }

    // Check for invented table names (ALL_CAPS_SNAKE_CASE that look like tables)
    const knownTables = new Set([
      ...context.modules.flatMap(m => [...(m.writeTables ?? []), ...(m.readTables ?? [])]),
    ].map(t => t.toUpperCase()));
    const tableRefs = output.match(/\bT_[A-Z][A-Z0-9_]+\b/g) ?? [];
    for (const ref of tableRefs) {
      if (!knownTables.has(ref.toUpperCase())) {
        warnings.push(`Table potentiellement hallucinée : ${ref}`);
      }
    }

    // Check for invented percentages or numbers that seem too precise
    const percentages = output.match(/\d{2,3}(?:\.\d+)?\s*%/g) ?? [];
    for (const pct of percentages) {
      const num = parseFloat(pct);
      if (num > 100) {
        warnings.push(`Pourcentage suspect : ${pct}`);
      }
    }

    return warnings;
  }

  /**
   * BUG-G/H v7.5: Full sanitization pipeline for ML output.
   * 1. Clean markdown fences
   * 2. Strip prompt leak
   * 3. Detect hallucinations (log warnings but don't reject)
   * 4. Validate minimum structure
   */
  sanitizeOutput(raw: string, context: ReportContext): string {
    let output = this.cleanMarkdown(raw);
    output = this.stripPromptLeak(output);

    const warnings = this.detectHallucinations(output, context);
    if (warnings.length > 0) {
      console.warn(`[ReportEnhancer] Hallucination warnings: ${warnings.join("; ")}`);
    }

    // Validate minimum structure: must have at least one heading and 100 chars
    if (output.length < 100 || !output.includes("#")) {
      throw new Error("Output ML trop court ou sans structure Markdown");
    }

    return output;
  }

  private unwrap<T>(result: PromiseSettledResult<T>): T | null {
    return result.status === "fulfilled" ? result.value : null;
  }
}
