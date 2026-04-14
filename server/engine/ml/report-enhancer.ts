/**
 * ReportEnhancer — Compleo v7.6
 *
 * Transforme les rapports mécaniques en conseil d'architecte senior.
 * Utilise un LLM local (Ollama) pour enrichir 5 rapports :
 *   - MIGRATION_REPORT.md
 *   - MICROSERVICES_REPORT.md
 *   - DATASOURCE_MIGRATION.md
 *   - QUALITY_SCORE.md
 *   - EXECUTIVE_SUMMARY.md
 *
 * v7.6 — Anti-hallucination renforcée :
 *   - Prompts ancrés avec noms réels des classes/méthodes/tables
 *   - validateMLOutput() bloque les classes inventées (UserService, OrderService)
 *   - BAM = Banque Al-Maghrib (pas "Bureau Automatisé des Mandats")
 *   - Aucune techno hors contexte (ASP.NET, PostgreSQL, etc.)
 *
 * Le ML est optionnel. Si Ollama est indisponible, les rapports
 * originaux sont retournés sans modification (fallback gracieux).
 *
 * @author Hamza NORDINE
 */

import type { ServiceCandidate, ParsedModule } from "../microservices/microservice-splitter";
import type { QualityReport, QualityCheck } from "../quality-scorer";
import { validateMLOutput as externalValidateML } from "./validateMLOutput";

// ── Configuration ────────────────────────────────────────────────

export interface ReportEnhancerConfig {
  ollamaUrl:   string;
  model:       string;   // qwen2.5:1.5b (léger, offline, gratuit)
  enabled:     boolean;
  language:    "fr" | "en";
  timeoutMs?:  number;   // défaut: 300_000 (5 min)
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
  // v7.6: Contexte réel pour ancrer les prompts ML
  realClassNames?:         string[];
  realMethodNames?:        string[];
  realTableNames?:         string[];
  realQueueNames?:         string[];
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

// ── Hallucinated patterns blacklist (v7.6 P3) ───────────────────

const HALLUCINATED_CLASS_NAMES = new Set([
  "UserService", "OrderService", "ProductService", "PaymentService",
  "CartService", "AuthService", "LoginService", "RegisterService",
  "CustomerService", "InvoiceService", "ShoppingCartService",
  "UserController", "OrderController", "ProductController",
  "UserRepository", "OrderRepository",
]);

const HALLUCINATED_METHOD_NAMES = new Set([
  "findUserById", "getUserById", "createUser", "deleteUser",
  "findOrderById", "createOrder", "deleteOrder",
  "findProductById", "createProduct", "addToCart",
]);

const OUT_OF_CONTEXT_TECH = [
  /ASP\.NET/i,
  /PostgreSQL/i,
  /MongoDB/i,
  /\.NET\s+Core/i,
  /C#/i,
  /Node\.?js/i,
  /Python/i,
  /Django/i,
  /Ruby\s+on\s+Rails/i,
  /Express\.?js/i,
  /Angular/i,
  /React/i,
  /Vue\.?js/i,
];

const BAM_WRONG_DEFINITIONS = [
  /Bureau\s+Automatisé\s+des\s+Mandats/i,
  /Bureau\s+d['']Audit\s+et\s+de\s+Management/i,
  /Business\s+Activity\s+Monitoring/i,
];

// ── ReportEnhancer ───────────────────────────────────────────────

export class ReportEnhancer {
  private config: ReportEnhancerConfig;
  private timeoutMs: number;

  constructor(config: ReportEnhancerConfig) {
    this.config    = config;
    this.timeoutMs = config.timeoutMs ?? 300_000;
  }

  // ── Point d'entrée principal ─────────────────────────────────

  async enhanceAll(context: ReportContext): Promise<EnhancedReports> {
    if (!this.config.enabled) {
      return { enhanced: false, reports: {} };
    }

    // v7.6: Enrichir le contexte avec les noms réels si pas déjà fournis
    this.enrichContextWithRealNames(context);

    // Exécution séquentielle — Ollama ne peut traiter qu'un prompt à la fois
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
        console.warn(`[ReportEnhancer] ${task.key} échoué: ${err instanceof Error ? err.message : String(err)}`);
        reports[task.key] = null;
      }
    }

    return { enhanced: true, reports };
  }

  // ── v7.6: Enrichir le contexte avec les noms réels ──────────

  private enrichContextWithRealNames(ctx: ReportContext): void {
    if (!ctx.realClassNames || ctx.realClassNames.length === 0) {
      ctx.realClassNames = [
        ...ctx.modules.map(m => m.id),
        ...ctx.services.flatMap(s => s.ejbs ?? []),
      ].filter(Boolean);
    }
    if (!ctx.realMethodNames || ctx.realMethodNames.length === 0) {
      // Extract method-like names from module IDs (ClassName_methodName pattern)
      ctx.realMethodNames = ctx.modules
        .map(m => m.id)
        .filter(id => id.includes("_"))
        .map(id => id.split("_").slice(1).join("_"))
        .filter(Boolean);
    }
    if (!ctx.realTableNames || ctx.realTableNames.length === 0) {
      ctx.realTableNames = [
        ...ctx.modules.flatMap(m => [...(m.writeTables ?? []), ...(m.readTables ?? [])]),
        ...ctx.dataSources.flatMap(ds => ds.tables),
      ].filter(Boolean);
    }
    if (!ctx.realQueueNames || ctx.realQueueNames.length === 0) {
      ctx.realQueueNames = ctx.modules
        .flatMap(m => m.jmsQueues ?? [])
        .filter(Boolean);
    }
  }

  // ── v7.6: Construire le bloc d'ancrage "classes réelles" ────

  private buildRealNamesAnchor(ctx: ReportContext): string {
    const classes = (ctx.realClassNames ?? []).slice(0, 15);
    const tables = [...new Set(ctx.realTableNames ?? [])].slice(0, 20);
    if (classes.length === 0 && tables.length === 0) return "";

    return `
IMPORTANT — Classes et tables RÉELLES du projet (NE PAS inventer d'autres noms) :
Classes: ${classes.join(", ")}
Tables: ${tables.join(", ")}
N'utilise QUE ces noms. Si tu ne connais pas un nom, ne l'invente pas.
`;
  }

  // ── MIGRATION_REPORT.md enrichi ──────────────────────────────

  async enhanceMigrationReport(ctx: ReportContext): Promise<string> {
    const prompt = this.buildMigrationPrompt(ctx);
    const raw    = await this.ollamaGenerate(prompt, {
      temperature: 0.3,
      num_predict: 1200,
    });
    return this.sanitizeOutput(raw, ctx);
  }

  private buildMigrationPrompt(ctx: ReportContext): string {
    const risks = this.extractRisks(ctx);
    const topModules = ctx.modules.slice(0, 8);
    const remaining = ctx.modules.length - topModules.length;

    return `Architecte Java EE senior, banques marocaines. Oracle RAC, BAM (Banque Al-Maghrib), WebLogic 12.2.
${this.buildRealNamesAnchor(ctx)}
## Projet
Banque: ${ctx.projectName} | ${ctx.modules.length} classes | ${ctx.useCasesCount} UseCases | Confiance: ${ctx.confidenceScore}%

## Modules principaux (${topModules.length}/${ctx.modules.length})
${topModules.map(m => `- **${m.id}** (${m.type}): Tables=${(m.writeTables?.length||0)+(m.readTables?.length||0)}, DS=${m.dataSources?.length||0}, EJB=${m.ejbCalls?.length||0}`).join("\n")}
${remaining > 0 ? `\n+ ${remaining} autres modules similaires\n` : ""}

## Risques
${risks.slice(0, 6).map(r => `- ${r}`).join("\n")}

Génère MIGRATION_REPORT.md en français:
1. Résumé exécutif (3 phrases pour DSI)
2. Risques par module, impact business, actions
3. Ordre de migration recommandé
4. Dépendances bloquantes
5. Décisions humaines nécessaires

Markdown ## ###. Max 500 mots.`;
  }

  // ── MICROSERVICES_REPORT.md enrichi ──────────────────────────

  async enhanceMicroservicesReport(ctx: ReportContext): Promise<string> {
    const prompt = `Architecte microservices senior. Découpage en ${ctx.services.length} services pour DSI.
BAM = Banque Al-Maghrib (régulateur bancaire marocain).
${this.buildRealNamesAnchor(ctx)}
## Services
${ctx.services.map(s => `- **${s.name}** (${s.confidence}%): ${s.ejbs?.length||0} modules, ${s.ownedTables?.length||0} tables, deps=${s.restDependencies?.length||0}`).join("\n")}

Génère MICROSERVICES_REPORT.md en français:
1. Explication du découpage (langage DSI)
2. Par service: périmètre, risques, ordre de démarrage
3. Décisions architecturales à valider
4. Infrastructure minimale requise
5. Timeline réaliste

Services confiance < 70%: expliquer options et trade-offs.
Markdown ## ###. Max 600 mots.`;

    const raw = await this.ollamaGenerate(prompt, {
      temperature: 0.3,
      num_predict: 1500,
    });
    return this.sanitizeOutput(raw, ctx);
  }

  // ── DATASOURCE_MIGRATION.md enrichi ──────────────────────────

  async enhanceDatasourceReport(ctx: ReportContext): Promise<string> {
    const dsDetails = ctx.dataSources.map(ds => ({
      jndi:     ds.jndi,
      vendor:   ds.vendor,
      schema:   ds.schema,
      tables:   ds.tables,
      features: ds.sqlFeatures,
    }));

    const prompt = `DBA Oracle senior, migration bases de données, institutions financières.
BAM = Banque Al-Maghrib (régulateur bancaire marocain).
${this.buildRealNamesAnchor(ctx)}
## DataSources détectées
${JSON.stringify(dsDetails, null, 2)}

Pour chaque DataSource, génère DATASOURCE_MIGRATION.md avec :
1. Spécificités SQL et équivalent Spring Boot
2. Configuration Spring Boot exacte (application.yml)
3. Plan de migration des données
4. Stratégie de cohabitation (Strangler Fig Pattern)

Oracle 19c, DB2 LUW 11.5, ojdbc11 v23.2.
Markdown technique. Max 500 mots.`;

     const raw = await this.ollamaGenerate(prompt, {
      temperature: 0.2,
      num_predict: 2000,
    });
    return this.sanitizeOutput(raw, ctx);
  }

  // ── QUALITY_SCORE.md — calculé statiquement (Post-Audit STEP 8c) ──────
  // Le QUALITY_SCORE est désormais généré par analyse statique du code,
  // PAS par le LLM Ollama. Cela évite les hallucinations, les répétitions
  // et les "[SUPPRIMÉ]" de l'anti-hallucination.

  async enhanceQualityScore(ctx: ReportContext): Promise<string> {
    // Génération statique — pas d'appel Ollama
    return this.generateStaticQualityScore(ctx);
  }

  private generateStaticQualityScore(ctx: ReportContext): string {
    const report = ctx.qualityReport;
    const lines: string[] = [
      `# Rapport Qualité — ${ctx.projectName}`,
      "",
      `> Généré automatiquement par Compleo (analyse statique du code Java généré)`,
      "",
      `## Score Global : ${report.score}/100 (${report.grade})`,
      "",
      `| Critère | Description | Score | Détail |`,
      `|---------|-------------|-------|--------|`,
    ];

    for (const c of report.checks) {
      const icon = c.passed ? "✅" : "❌";
      lines.push(`| ${icon} ${c.id} | ${c.description} | ${c.points}/${c.maxPoints} | ${c.detail} |`);
    }

    const failedChecks = report.checks.filter(c => !c.passed);
    if (failedChecks.length > 0) {
      lines.push("");
      lines.push("## Problèmes détectés");
      lines.push("");
      for (const c of failedChecks) {
        lines.push(`### ${c.id} — ${c.description}`);
        lines.push("");
        lines.push(`**Détail** : ${c.detail}`);
        lines.push(`**Impact** : -${c.maxPoints - c.points} pts`);
        lines.push(`**Action** : Corriger avant mise en production`);
        lines.push("");
      }
    }

    const passedChecks = report.checks.filter(c => c.passed);
    if (passedChecks.length > 0) {
      lines.push("");
      lines.push("## Critères validés");
      lines.push("");
      for (const c of passedChecks) {
        lines.push(`- ✅ **${c.id}** : ${c.description} (${c.points}/${c.maxPoints} pts)`);
      }
    }

    // Contexte du projet
    lines.push("");
    lines.push("## Contexte du projet");
    lines.push("");
    lines.push(`| Métrique | Valeur |`);
    lines.push(`|----------|--------|`);
    lines.push(`| Modules analysés | ${ctx.modules.length} |`);
    lines.push(`| Services générés | ${ctx.services.length} |`);
    lines.push(`| UseCases détectés | ${ctx.useCasesCount} |`);
    lines.push(`| Confiance globale | ${ctx.confidenceScore}% |`);
    lines.push(`| Durée estimée | ${ctx.estimatedDuration} semaines |`);

    // Checklist production
    lines.push("");
    lines.push("## Checklist prêt pour la production");
    lines.push("");
    const productionReady = report.score >= 85;
    lines.push(productionReady
      ? "> \u2705 Le code généré est déployable avec des corrections mineures."
      : "> \u26a0\ufe0f Des corrections sont nécessaires avant la mise en production.");
    lines.push("");
    lines.push(`- [${report.score >= 80 ? "x" : " "}] Score qualité \u2265 80/100`);
    lines.push(`- [${failedChecks.length <= 2 ? "x" : " "}] Moins de 3 critères échoués`);
    lines.push(`- [ ] Tests de régression validés manuellement`);
    lines.push(`- [ ] Revue de code par un architecte senior`);
    lines.push(`- [ ] Tests d'intégration exécutés`);

    return lines.join("\n");
  }

  /**
   * v7.6 P3: Prompt ancré avec les vrais noms de classes et méthodes.
   * Empêche le modèle d'inventer UserService, OrderService, etc.
   */
  private buildQualityPrompt(ctx: ReportContext, report: QualityReport): string {
    const realClasses = (ctx.realClassNames ?? []).slice(0, 12).join(", ");
    const realMethods = (ctx.realMethodNames ?? []).slice(0, 10).join(", ");

    return `Lead développeur Java Spring Boot. Score qualité migration.
${this.buildRealNamesAnchor(ctx)}
## Score : ${report.score}/100 (${report.grade})

## Checks
${report.checks.map((c: QualityCheck) => `- ${c.passed ? "✅" : "❌"} ${c.id} (${c.points}/${c.maxPoints} pts) ${c.description}`).join("\n")}

## Problèmes
${report.issues.join("\n")}

Génère QUALITY_SCORE.md en français:
1. Ce que ce score signifie en pratique
2. Pour chaque problème: impact, temps de correction, priorité
3. Ce qui peut être déployé en l'état
4. Checklist "prêt pour la production"

RÈGLES STRICTES:
- N'utilise QUE les noms de classes listés ci-dessus: ${realClasses}
- N'utilise QUE les noms de méthodes listés ci-dessus: ${realMethods}
- NE MENTIONNE PAS: UserService, OrderService, ProductService, findUserById
- NE MENTIONNE PAS: ASP.NET, PostgreSQL, MongoDB, Node.js, Python
- BAM = Banque Al-Maghrib (régulateur bancaire marocain)

Markdown. Max 500 mots.`;
  }

  // ── EXECUTIVE_SUMMARY.md (v7.6 P3: BAM défini, chiffres encadrés) ─

  async generateExecutiveSummary(ctx: ReportContext): Promise<string> {
    const prompt = this.buildExecutiveSummaryPrompt(ctx);
    const raw = await this.ollamaGenerate(prompt, {
      temperature: 0.4,
      num_predict: 1500,
    });
    return this.sanitizeOutput(raw, ctx);
  }

  /**
   * v7.6 P3: Prompt ancré pour Executive Summary.
   * BAM = Banque Al-Maghrib, chiffres encadrés, pas de % inventés.
   */
  private buildExecutiveSummaryPrompt(ctx: ReportContext): string {
    return `Consultant transformation digitale bancaire. Résumé exécutif pour DSI/COMEX.
${this.buildRealNamesAnchor(ctx)}
## Contexte
Projet: Migration SI Legacy → Microservices Spring Boot
Banque: ${ctx.projectName}
Modules: ${ctx.modules.length} | Services: ${ctx.services.length}
Score qualité: ${ctx.qualityReport.score}/100
Durée estimée: ${ctx.estimatedDuration} semaines

## Points clés
- Déployables rapidement: ${ctx.services.filter(s => s.confidence >= 85).map(s => s.name).join(", ") || "aucun"}
- Décision architecturale nécessaire: ${ctx.services.filter(s => s.confidence < 70).map(s => s.name).join(", ") || "aucun"}
- Dépendances critiques: ${ctx.criticalDependencies.join(", ") || "aucune"}
- Infrastructure: ${ctx.requiredInfrastructure.join(", ") || "non spécifiée"}

Génère EXECUTIVE_SUMMARY.md en français:
1. Résumé en 3 phrases
2. 3 bénéfices principaux (conformité BAM, coûts, agilité)
3. 3 risques principaux et mitigations
4. 3 décisions stratégiques pour le DSI
5. Calendrier en 3 phases
6. Investissement humain requis

RÈGLES STRICTES:
- BAM = Banque Al-Maghrib (régulateur bancaire marocain). JAMAIS "Bureau Automatisé des Mandats".
- N'invente PAS de pourcentages précis (ex: "taux de dépannage de 0%")
- N'utilise QUE les noms de services listés ci-dessus
- NE MENTIONNE PAS: ASP.NET, PostgreSQL, MongoDB, Node.js, Python, C#
- Ton: confiant, professionnel, honnête. Max 600 mots.`;
  }

  // ── Ollama API call ──────────────────────────────────────────

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
   */
  stripPromptLeak(output: string): string {
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
      // v7.6: Additional prompt leak patterns
      /^RÈGLES STRICTES\s*:?$/gm,
      /^IMPORTANT —.*$/gm,
      /^N'utilise QUE.*$/gm,
      /^NE MENTIONNE PAS.*$/gm,
      /^N'invente PAS.*$/gm,
      /^Classes\s*:.*$/gm,
      /^Tables\s*:.*$/gm,
    ];

    let cleaned = output;
    for (const pattern of promptPatterns) {
      cleaned = cleaned.replace(pattern, "");
    }

    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
    return cleaned.trim();
  }

  /**
   * v7.6 P3: Validate ML output — block hallucinated content.
   * Returns list of issues found. If critical issues, the output is rejected.
   */
  validateMLOutput(output: string, context: ReportContext): { warnings: string[]; critical: boolean } {
    const warnings: string[] = [];
    let critical = false;

    // 1. Check for hallucinated class names
    for (const name of HALLUCINATED_CLASS_NAMES) {
      if (output.includes(name)) {
        warnings.push(`Classe hallucinée détectée: ${name}`);
        critical = true;
      }
    }

    // 2. Check for hallucinated method names
    for (const name of HALLUCINATED_METHOD_NAMES) {
      if (output.includes(name)) {
        warnings.push(`Méthode hallucinée détectée: ${name}`);
      }
    }

    // 3. Check for out-of-context technologies
    for (const pattern of OUT_OF_CONTEXT_TECH) {
      if (pattern.test(output)) {
        warnings.push(`Technologie hors contexte détectée: ${pattern.source}`);
      }
    }

    // 4. Check for wrong BAM definitions
    for (const pattern of BAM_WRONG_DEFINITIONS) {
      if (pattern.test(output)) {
        warnings.push(`Définition BAM incorrecte détectée`);
      }
    }

    // 5. Check for invented percentages (taux de dépannage de 0%, etc.)
    if (/taux de dépannage de 0%/i.test(output)) {
      warnings.push(`Statistique inventée: taux de dépannage de 0%`);
    }

    return { warnings, critical };
  }

  /**
   * v7.6 P3: Remove hallucinated content from ML output.
   * Strips known hallucinated class/method names and replaces with real ones.
   */
  private removeHallucinatedContent(output: string, context: ReportContext): string {
    let cleaned = output;

    // Remove hallucinated class names
    for (const name of HALLUCINATED_CLASS_NAMES) {
      cleaned = cleaned.replace(new RegExp(`\\b${name}\\b`, "g"), "");
    }

    // Remove hallucinated method names
    for (const name of HALLUCINATED_METHOD_NAMES) {
      cleaned = cleaned.replace(new RegExp(`\\b${name}\\b`, "g"), "");
    }

    // Fix BAM definition
    for (const pattern of BAM_WRONG_DEFINITIONS) {
      cleaned = cleaned.replace(pattern, "Banque Al-Maghrib");
    }

    // Remove out-of-context tech mentions
    for (const pattern of OUT_OF_CONTEXT_TECH) {
      cleaned = cleaned.replace(pattern, "");
    }

    // Clean up artifacts (empty parentheses, double spaces, etc.)
    cleaned = cleaned
      .replace(/\(\s*\)/g, "")
      .replace(/,\s*,/g, ",")
      .replace(/\s{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n");

    return cleaned.trim();
  }

  /**
   * BUG-H v7.5: Detect hallucinated content in ML output.
   * Returns warnings for logging purposes.
   */
  detectHallucinations(output: string, context: ReportContext): string[] {
    const warnings: string[] = [];

    const knownModuleIds = new Set(context.modules.map(m => m.id.toLowerCase()));
    const knownServiceNames = new Set(context.services.map(s => s.name.toLowerCase()));

    const moduleRefs = output.match(/\b[A-Z][a-zA-Z]+(?:EJB|Service|Bean|Servlet|MDB|DAO)\b/g) ?? [];
    for (const ref of moduleRefs) {
      if (!knownModuleIds.has(ref.toLowerCase()) &&
          !knownServiceNames.has(ref.toLowerCase()) &&
          // v7.6: Also check against known class names
          !(context.realClassNames ?? []).some(c => c.toLowerCase() === ref.toLowerCase())) {
        warnings.push(`Module potentiellement halluciné : ${ref}`);
      }
    }

    const knownTables = new Set([
      ...context.modules.flatMap(m => [...(m.writeTables ?? []), ...(m.readTables ?? [])]),
      ...(context.realTableNames ?? []),
    ].map(t => t.toUpperCase()));
    const tableRefs = output.match(/\bT_[A-Z][A-Z0-9_]+\b/g) ?? [];
    for (const ref of tableRefs) {
      if (!knownTables.has(ref.toUpperCase())) {
        warnings.push(`Table potentiellement hallucinée : ${ref}`);
      }
    }

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
   * v7.6: Full sanitization pipeline for ML output.
   * 1. Clean markdown fences
   * 2. Strip prompt leak
   * 3. Validate ML output (block hallucinated classes)
   * 4. Remove hallucinated content
   * 5. Detect remaining hallucinations (log warnings)
   * 6. Validate minimum structure
   */
  sanitizeOutput(raw: string, context: ReportContext): string {
    let output = this.cleanMarkdown(raw);
    output = this.stripPromptLeak(output);

    // v7.6: Validate and clean hallucinated content
    const validation = this.validateMLOutput(output, context);
    if (validation.warnings.length > 0) {
      console.warn(`[ReportEnhancer] Validation warnings: ${validation.warnings.join("; ")}`);
    }

    // v7.7: External validateMLOutput (3-level anti-hallucination)
    const extValidation = externalValidateML(output, context.realClassNames ?? []);
    if (!extValidation.isValid) {
      console.warn(`[ReportEnhancer] v7.7 external validation: ${extValidation.hallucinations.length} hallucination(s)`);
      for (const h of extValidation.hallucinations) {
        console.warn(`  L${h.line}: [${h.type}] ${h.original}`);
      }
      output = extValidation.cleanedText;
    }

    // Always remove hallucinated content (even if not critical)
    output = this.removeHallucinatedContent(output, context);

    // Legacy hallucination detection (for logging)
    const warnings = this.detectHallucinations(output, context);
    if (warnings.length > 0) {
      console.warn(`[ReportEnhancer] Hallucination warnings: ${warnings.join("; ")}`);
    }

    // Validate minimum structure
    if (output.length < 100 || !output.includes("#")) {
      throw new Error("Output ML trop court ou sans structure Markdown");
    }

    return output;
  }

  private unwrap<T>(result: PromiseSettledResult<T>): T | null {
    return result.status === "fulfilled" ? result.value : null;
  }
}
