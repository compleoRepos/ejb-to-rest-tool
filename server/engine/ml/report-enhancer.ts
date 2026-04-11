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
  model:       string;   // llama3:8b-instruct-q4_K_M (meilleur pour le texte)
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

    const [migration, microservices, datasource, quality, executive] =
      await Promise.allSettled([
        this.enhanceMigrationReport(context),
        this.enhanceMicroservicesReport(context),
        this.enhanceDatasourceReport(context),
        this.enhanceQualityScore(context),
        this.generateExecutiveSummary(context),
      ]);

    return {
      enhanced: true,
      reports: {
        MIGRATION_REPORT:     this.unwrap(migration),
        MICROSERVICES_REPORT: this.unwrap(microservices),
        DATASOURCE_MIGRATION: this.unwrap(datasource),
        QUALITY_SCORE:        this.unwrap(quality),
        EXECUTIVE_SUMMARY:    this.unwrap(executive),
      },
    };
  }

  // ── MIGRATION_REPORT.md enrichi ──────────────────────────────

  async enhanceMigrationReport(ctx: ReportContext): Promise<string> {
    const prompt = this.buildMigrationPrompt(ctx);
    const raw    = await this.ollamaGenerate(prompt, {
      temperature: 0.3,
      num_predict: 2000,
    });
    return this.cleanMarkdown(raw);
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
    return this.cleanMarkdown(raw);
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
    return this.cleanMarkdown(raw);
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
    return this.cleanMarkdown(raw);
  }

  // ── EXECUTIVE_SUMMARY.md — nouveau fichier pour le DSI/COMEX ─

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
    return this.cleanMarkdown(raw);
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

  private unwrap<T>(result: PromiseSettledResult<T>): T | null {
    return result.status === "fulfilled" ? result.value : null;
  }
}
