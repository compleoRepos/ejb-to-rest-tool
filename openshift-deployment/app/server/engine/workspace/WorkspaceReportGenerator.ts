/**
 * WorkspaceReportGenerator — COMPLEO v13.2
 *
 * Consomme les outputs du DependencyAnalyzer + MigrationPlanner + LLM enrichments,
 * et produit un rapport HTML autonome (single-file, fonts CDN, prêt à imprimer en PDF).
 *
 * Architecture :
 *   1. Collecte les données structurées (graph, plan)
 *   2. Enrichit via 6 prompts LLM (avec fallback rule-based)
 *   3. Compile le template Handlebars avec les données
 *   4. Retourne le HTML final
 *
 * @author Compleo
 */

import Handlebars from "handlebars";
import { readFileSync } from "fs";
import { join } from "path";
import { llmGenerateJSON, isLLMAvailable } from "../ml/llm-adapter";
import type { WorkspaceGraph, ProjectNode, ExternalDep } from "./DependencyAnalyzer";
import type { MigrationPlan, FrameworkGroup } from "./MigrationPlanner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReportInput {
  workspaceName: string;
  reportDate: Date;
  reference: string;
  missionLabel?: string;
  graph: WorkspaceGraph;
  plan: MigrationPlan;
  enrichments?: EnrichmentData;
}

export interface EnrichmentData {
  executiveSummary?: string;
  findings?: Finding[];
  frameworkRoles?: FrameworkRole[];
  tierRationales?: TierRationale[];
  projectDescriptions?: ProjectDescription[];
  risks?: Risk[];
  callflowLines?: CallflowLine[];
  glossary?: GlossaryItem[];
}

export interface Finding {
  type: "strength" | "risk";
  title: string;
  body: string;
}

export interface FrameworkRole {
  package: string;
  classification: string;
  rationale: string;
  recommendedTarget: string;
}

export interface TierRationale {
  level: number;
  explanation: string;
}

export interface ProjectDescription {
  name: string;
  description: string;
  domain: string;
}

export interface Risk {
  level: "high" | "medium" | "low";
  title: string;
  description: string;
  mitigation: string;
  impact: string;
}

export interface CallflowLine {
  actor: string;
  target: string;
  comment?: string;
}

export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface ReportOutput {
  html: string;
  warnings: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function padNum(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function formatNumber(n: number): string {
  return n.toLocaleString("fr-FR");
}

function getSizeClass(loc: number): { sizeClass: string; sizeLabel: string } {
  if (loc <= 3000) return { sizeClass: "ok", sizeLabel: "Petit" };
  if (loc <= 10000) return { sizeClass: "warn", sizeLabel: "Moyen" };
  return { sizeClass: "crit", sizeLabel: "Gros" };
}

function getRomanNum(n: number): string {
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
  return romans[n - 1] || String(n);
}

// ─── Default Fallbacks ───────────────────────────────────────────────────────

const DEFAULT_FINDINGS: Finding[] = [
  {
    type: "strength",
    title: "Cohérence architecturale forte",
    body: "Les services suivent un même pattern : EJB Stateless, UseCase pattern, Envelope EAI, ValueObject. Cette homogénéité est un atout — la migration de l'un éclaire la migration des autres.",
  },
  {
    type: "strength",
    title: "Frameworks à migrer en priorité",
    body: "Les frameworks transverses concentrent la majorité des imports cumulés. Leur migration en premier déverrouille l'ensemble des services métier.",
  },
  {
    type: "strength",
    title: "Services métier parallélisables",
    body: "Une fois les frameworks portés, les services sont indépendants entre eux — aucune dépendance horizontale détectée. Plusieurs équipes peuvent migrer en parallèle.",
  },
  {
    type: "risk",
    title: "Dépendance forte aux classes transverses",
    body: "Les imports répartis sur l'ensemble du portefeuille créent un couplage fort. Toute évolution du wrapper request/response impactera la majorité des services. La migration de ces classes doit être traitée comme un événement de plateforme.",
  },
];

const DEFAULT_RISKS: Risk[] = [
  {
    level: "high",
    title: "Cohérence cross-projet des classes partagées",
    description: "Les imports répartis sur la majorité des services créent un risque d'incompatibilités cachées entre services migrés et non migrés pendant la phase de transition.",
    mitigation: "MigrationRegistry trace les versions de chaque artefact migré et applique les remplacements aux dépendants. Tests de contrat sur les APIs partagées dès la première migration.",
    impact: "Tous les services",
  },
  {
    level: "medium",
    title: "Latence des connecteurs back-office",
    description: "Les connecteurs synchrones appellent des SI cœur avec des SLA hétérogènes. La transformation en clients Spring doit préserver les timeouts métier existants.",
    mitigation: "Extraction préalable des paramètres timeout depuis le code legacy. Mapping vers configuration Resilience4j. Tests de charge sur environnement iso-prod.",
    impact: "Performance",
  },
  {
    level: "medium",
    title: "Non-déterminisme de la génération LLM",
    description: "COMPLEO utilise un LLM pour les transformations sémantiques complexes. Chaque exécution produit une variante du code Spring généré — les tests de compilation montrent une stabilité variable.",
    mitigation: "Fine-tuning du modèle sur dataset spécifique en cours. Couche post-traitement déterministe (CompileAutoFixer) en filet de sécurité.",
    impact: "Productivité",
  },
  {
    level: "low",
    title: "Framework volumineux et hétérogène",
    description: "Le framework le plus large couvre des sous-domaines très différents. Une migration monolithique allongerait la Phase I et créerait un goulet d'étranglement.",
    mitigation: "Découpage par sous-package fonctionnel. Migration progressive avec releases successives au lieu d'un big-bang.",
    impact: "Calendrier",
  },
];

const DEFAULT_CALLFLOW: CallflowLine[] = [
  { actor: "Client", target: "POST /service/endpoint", comment: "Requête XML/JSON wrappée selon le contrat EAI" },
  { actor: "Servlet", target: "Parser.parse(req)", comment: "Extraction du payload depuis l'Envelope d'entrée" },
  { actor: "Parser", target: "Envelope envIn", comment: "Construction du wrapper request, en mémoire" },
  { actor: "Service", target: "BaseUseCase.run(envIn, envOut)", comment: "Dispatch vers le UseCase annoté @UseCase" },
  { actor: "UseCase Impl", target: "EaiLog.info(\"traceId=...\")", comment: "Trace d'audit en début de processing" },
  { actor: "UseCase Impl", target: "SynchroneService.call(\"CBS_OP\")", comment: "Appel synchrone au back-office via middleware" },
  { actor: "UseCase Impl", target: "Envelope envOut", comment: "Construction de la réponse, sérialisation Parser.format" },
  { actor: "Erreur métier", target: "throw FwkRollbackException", comment: "Rollback automatique sous @ContinueOrStartTransaction" },
];

const DEFAULT_GLOSSARY: GlossaryItem[] = [
  { term: "Envelope", definition: "Wrapper request/response du framework EAI. Encapsule header (métadonnées de routage, traceId, security) et body (payload métier)." },
  { term: "UseCase", definition: "Pattern structurant : chaque opération métier = une classe annotée @UseCase héritant de BaseUseCase, avec une méthode run(envIn, envOut). Équivalent au pattern Command." },
  { term: "ValueObject", definition: "Classe de base de tous les DTOs métier. Sérialisable, immutable conceptuellement, transportée à travers les couches." },
  { term: "EaiLog / Log", definition: "Deux loggers distincts coexistent : EaiLog (framework EAI, applicatif) et Log (middleware, système). À factoriser en SLF4J + MDC pendant la migration." },
  { term: "FwkRollbackException", definition: "Exception déclenchant un rollback de transaction. Cible Spring : RuntimeException standard sous @Transactional avec rollbackFor explicite." },
  { term: "@ContinueOrStartTransaction", definition: "Annotation EAI pilotant la propagation transactionnelle. Cible Spring : @Transactional(propagation=REQUIRED)." },
  { term: "SynchroneService", definition: "Connecteur d'appel synchrone vers un SI back-office. Bloquant. À migrer vers OpenFeign avec Resilience4j pour timeouts et circuit breakers." },
  { term: "DAG (Directed Acyclic Graph)", definition: "Graphe orienté sans cycle, représentant les dépendances entre projets. Permet le tri topologique qui donne l'ordre de migration optimal." },
  { term: "Tier de migration", definition: "Niveau dans le DAG. Tier 0 = projets sans dépendances entrantes (à migrer en premier). Tier N = projets dont toutes les dépendances sont en Tiers 0..N-1." },
  { term: "MigrationRegistry", definition: "Composant COMPLEO qui mémorise les migrations effectuées et applique automatiquement les remplacements de dépendances aux projets dépendants migrés ultérieurement." },
];

// ─── LLM Prompt Generators ───────────────────────────────────────────────────

async function generateFindings(graph: WorkspaceGraph, plan: MigrationPlan): Promise<Finding[] | null> {
  const topFrameworks = getTopFrameworksList(graph);
  const topClasses = getTopClassesList(graph, 5);

  const prompt = `Système : Tu es un consultant senior en modernisation système banking. Tu écris en français professionnel, ton sobre et précis. Pas de markdown, pas d'emoji.

Utilisateur :
Voici l'analyse d'un workspace de modernisation :
- ${graph.projects.length} projets
- ${plan.externalFrameworks.length} frameworks externes : ${topFrameworks}
- Top 5 classes les plus importées : ${topClasses}
- Tier 0 : ${plan.tiers[0]?.items.map(i => i.name).join(", ") || "aucun"}
- Tier 1 : ${plan.tiers.slice(1).flatMap(t => t.items).map(i => i.name).join(", ") || "aucun"}

Produis 4 findings pour la synthèse exécutive du rapport. 3 forces, 1 risque.
Chaque finding a un titre court (5-8 mots) et 2-3 phrases de prose.

Format JSON :
{
  "findings": [
    { "type": "strength" | "risk", "title": "...", "body": "..." }
  ]
}`;

  const result = await llmGenerateJSON<{ findings: Finding[] }>(prompt, { temperature: 0.4, maxTokens: 1200 });
  return result?.findings ?? null;
}

async function generateFrameworkRole(pkg: string, topClasses: { name: string; count: number }[]): Promise<FrameworkRole | null> {
  const classesStr = topClasses.map(c => `- ${c.name} (${c.count})`).join("\n");

  const prompt = `Système : Consultant senior banking. Français pro. 2-3 phrases.

Utilisateur :
Framework détecté : package ${pkg}
Top classes utilisées (avec count d'imports) :
${classesStr}

Produis : 
1. Classification courte (5-8 mots) — quel est le rôle de ce framework ?
2. Rationale (2-3 phrases) — pourquoi ces classes et imports indiquent ce rôle ?
3. Recommended target Spring Boot (5-10 mots)

Format JSON :
{
  "classification": "...",
  "rationale": "...",
  "recommendedTarget": "..."
}`;

  const result = await llmGenerateJSON<{ classification: string; rationale: string; recommendedTarget: string }>(prompt, { temperature: 0.3, maxTokens: 600 });
  if (!result) return null;
  return { package: pkg, ...result };
}

async function generateProjectDescription(project: ProjectNode, topImports: string[]): Promise<ProjectDescription | null> {
  const prompt = `Système : Consultant senior banking. Français pro.

Utilisateur :
Projet : ${project.name}
Fichiers : ${project.fileCount}
LOC : ${project.loc}
Top imports : ${topImports.join(", ")}

Produis une description métier en UNE phrase (10-15 mots) qui dit ce que fait ce service en termes business banking.

Exemples de bonnes descriptions :
- "Mise à jour coordonnées 3D Secure (paiements en ligne)"
- "Tokenisation de carte pour wallet (Apple Pay, etc.)"

Format JSON : { "description": "...", "domain": "..." }`;

  return await llmGenerateJSON<ProjectDescription>(prompt, { temperature: 0.3, maxTokens: 200 });
}

async function generateRisks(graph: WorkspaceGraph, plan: MigrationPlan): Promise<Risk[] | null> {
  const topFrameworks = getTopFrameworksList(graph);
  const topClasses = getTopClassesList(graph, 5);

  const prompt = `Système : Consultant senior en modernisation système banking. Français professionnel, ton sobre.

Utilisateur :
Workspace : ${graph.projects.length} projets, frameworks ${topFrameworks}, top classes critiques ${topClasses}.

Produis 4 risques de migration avec :
- niveau (high / medium / low)
- titre (5-8 mots)
- description (3-4 phrases)
- mitigation (2-3 phrases)
- impact court (3-5 mots, ex: "18/19 services", "Performance", "Calendrier")

Format JSON :
{
  "risks": [
    { "level": "high", "title": "...", "description": "...", "mitigation": "...", "impact": "..." }
  ]
}`;

  const result = await llmGenerateJSON<{ risks: Risk[] }>(prompt, { temperature: 0.4, maxTokens: 1500 });
  return result?.risks ?? null;
}

async function generateExecutiveSummary(graph: WorkspaceGraph, plan: MigrationPlan): Promise<{ title: string; lede: string; summary: string } | null> {
  const prompt = `Système : Consultant senior en modernisation système banking. Français professionnel.

Utilisateur :
Workspace de ${graph.projects.length} projets, ${plan.externalFrameworks.length} frameworks transverses, ${plan.tiers.length} tiers de migration.
Total : ${graph.projects.reduce((s, p) => s + p.fileCount, 0)} fichiers, ~${Math.round(graph.projects.reduce((s, p) => s + p.loc, 0) / 1000)}K LOC.

Produis :
1. Un titre de section exécutive (8-12 mots, avec un mot en emphase)
2. Un paragraphe d'introduction (2-3 phrases, 40-60 mots)
3. Un résumé exécutif pour la couverture (1-2 phrases, 30-40 mots)

Format JSON :
{
  "title": "...",
  "lede": "...",
  "summary": "..."
}`;

  return await llmGenerateJSON<{ title: string; lede: string; summary: string }>(prompt, { temperature: 0.4, maxTokens: 600 });
}

// ─── Utility extractors ──────────────────────────────────────────────────────

function getTopFrameworksList(graph: WorkspaceGraph): string {
  const allDeps: Map<string, number> = new Map();
  for (const [, deps] of graph.externalDependencies) {
    for (const dep of deps) {
      allDeps.set(dep.package, (allDeps.get(dep.package) || 0) + dep.importCount);
    }
  }
  return [...allDeps.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([pkg]) => pkg)
    .join(", ");
}

function getTopClassesList(graph: WorkspaceGraph, n: number): string {
  const allClasses: Map<string, number> = new Map();
  for (const [, deps] of graph.externalDependencies) {
    for (const dep of deps) {
      for (const cls of dep.classes) {
        allClasses.set(cls, (allClasses.get(cls) || 0) + dep.importCount);
      }
    }
  }
  return [...allClasses.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([cls, count]) => `${cls} (${count})`)
    .join(", ");
}

function getTopClassesForPackage(graph: WorkspaceGraph, rootPackage: string): { name: string; count: number }[] {
  const classes: Map<string, number> = new Map();
  for (const [, deps] of graph.externalDependencies) {
    for (const dep of deps) {
      if (dep.package.startsWith(rootPackage)) {
        for (const cls of dep.classes) {
          classes.set(cls, (classes.get(cls) || 0) + dep.importCount);
        }
      }
    }
  }
  return [...classes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

// ─── Main Generator ──────────────────────────────────────────────────────────

export class WorkspaceReportGenerator {
  private template: Handlebars.TemplateDelegate;

  constructor() {
    const templatePath = join(__dirname, "templates", "workspace-report.html.template");
    const templateSource = readFileSync(templatePath, "utf-8");

    // Register helpers
    Handlebars.registerHelper("padNum", (index: number) => padNum(index));
    Handlebars.registerHelper("formatNumber", (n: number) => formatNumber(n));

    this.template = Handlebars.compile(templateSource, { noEscape: true });
  }

  /**
   * Génère le rapport HTML complet.
   * Si enrichments est fourni, les utilise directement.
   * Sinon, appelle le LLM pour chaque section.
   */
  async generate(input: ReportInput): Promise<ReportOutput> {
    const warnings: string[] = [];
    const llmAvailable = await isLLMAvailable();

    // ─── Compute base metrics ─────────────────────────────────────────────
    const totalFiles = input.graph.projects.reduce((s, p) => s + p.fileCount, 0);
    const totalLoc = input.graph.projects.reduce((s, p) => s + p.loc, 0);
    const totalLocK = Math.round(totalLoc / 1000);
    const edgeCount = input.graph.dependencyEdges.length;

    // Count unique classes across all external deps
    const uniqueClassesSet = new Set<string>();
    for (const [, deps] of input.graph.externalDependencies) {
      for (const dep of deps) {
        dep.classes.forEach(c => uniqueClassesSet.add(c));
      }
    }
    const uniqueClasses = uniqueClassesSet.size;

    // Count total imports
    let totalImports = 0;
    for (const [, deps] of input.graph.externalDependencies) {
      for (const dep of deps) {
        totalImports += dep.importCount;
      }
    }

    // ─── LLM enrichments (or fallback) ────────────────────────────────────

    // Executive summary
    let executiveTitle = "Une plateforme en attente de sa modernisation.";
    let executiveLede = `Les ${input.graph.projects.length} services partagent une architecture cohérente, structurée autour de ${input.plan.externalFrameworks.length} frameworks propriétaires. Leur modernisation peut être conduite en ${input.plan.tiers.length} temps, avec un point de bascule technique clairement identifié.`;
    let executiveSummary = `Cartographie applicative, plan de migration par tiers topologiques, et stratégie de transformation Spring Boot pour ${input.graph.projects.length} services en production.`;

    if (input.enrichments?.executiveSummary) {
      executiveSummary = input.enrichments.executiveSummary;
    } else if (llmAvailable) {
      const execResult = await generateExecutiveSummary(input.graph, input.plan);
      if (execResult) {
        executiveTitle = execResult.title;
        executiveLede = execResult.lede;
        executiveSummary = execResult.summary;
      } else {
        warnings.push("LLM executive summary failed, using fallback");
      }
    } else {
      warnings.push("LLM unavailable for executive summary");
    }

    // Findings
    let findings: Finding[] = input.enrichments?.findings || [];
    if (findings.length === 0) {
      if (llmAvailable) {
        const llmFindings = await generateFindings(input.graph, input.plan);
        if (llmFindings && llmFindings.length >= 3) {
          findings = llmFindings;
        } else {
          findings = DEFAULT_FINDINGS;
          warnings.push("LLM findings failed, using fallback");
        }
      } else {
        findings = DEFAULT_FINDINGS;
        warnings.push("LLM unavailable for findings");
      }
    }

    // Framework roles
    let frameworkRoles: FrameworkRole[] = input.enrichments?.frameworkRoles || [];
    if (frameworkRoles.length === 0 && input.plan.externalFrameworks.length > 0) {
      if (llmAvailable) {
        for (const fw of input.plan.externalFrameworks.slice(0, 4)) {
          const topClasses = getTopClassesForPackage(input.graph, fw.rootPackage);
          const role = await generateFrameworkRole(fw.rootPackage, topClasses);
          if (role) {
            frameworkRoles.push(role);
          } else {
            frameworkRoles.push({
              package: fw.rootPackage,
              classification: `Framework ${fw.rootPackage.split(".").pop()}`,
              rationale: `Concentre ${fw.totalImports} imports sur ${fw.projectsUsing} projets. Classes principales : ${fw.topClasses.slice(0, 3).join(", ")}.`,
              recommendedTarget: fw.recommendedTargetName,
            });
            warnings.push(`LLM framework role failed for ${fw.rootPackage}`);
          }
        }
      } else {
        frameworkRoles = input.plan.externalFrameworks.slice(0, 4).map(fw => ({
          package: fw.rootPackage,
          classification: `Framework ${fw.rootPackage.split(".").pop()}`,
          rationale: `Concentre ${fw.totalImports} imports sur ${fw.projectsUsing} projets. Classes principales : ${fw.topClasses.slice(0, 3).join(", ")}.`,
          recommendedTarget: fw.recommendedTargetName,
        }));
        warnings.push("LLM unavailable for framework roles");
      }
    }

    // Project descriptions
    let projectDescriptions: ProjectDescription[] = input.enrichments?.projectDescriptions || [];
    if (projectDescriptions.length === 0) {
      if (llmAvailable) {
        for (const proj of input.graph.projects) {
          const topImports = (input.graph.externalDependencies.get(proj.name) || [])
            .sort((a, b) => b.importCount - a.importCount)
            .slice(0, 3)
            .map(d => d.package);
          const desc = await generateProjectDescription(proj, topImports);
          if (desc) {
            projectDescriptions.push({ ...desc, name: proj.name });
          } else {
            projectDescriptions.push({
              name: proj.name,
              description: `Service ${proj.name} (${proj.fileCount} fichiers, ${proj.loc} LOC)`,
              domain: "Service métier",
            });
          }
        }
      } else {
        projectDescriptions = input.graph.projects.map(p => ({
          name: p.name,
          description: `Service ${p.name} (${p.fileCount} fichiers, ${p.loc} LOC)`,
          domain: "Service métier",
        }));
        warnings.push("LLM unavailable for project descriptions");
      }
    }

    // Risks
    let risks: Risk[] = input.enrichments?.risks || [];
    if (risks.length === 0) {
      if (llmAvailable) {
        const llmRisks = await generateRisks(input.graph, input.plan);
        if (llmRisks && llmRisks.length >= 3) {
          risks = llmRisks;
        } else {
          risks = DEFAULT_RISKS;
          warnings.push("LLM risks failed, using fallback");
        }
      } else {
        risks = DEFAULT_RISKS;
        warnings.push("LLM unavailable for risks");
      }
    }

    // Callflow
    const callflowLines = input.enrichments?.callflowLines || DEFAULT_CALLFLOW;

    // Glossary
    const glossary = input.enrichments?.glossary || DEFAULT_GLOSSARY;

    // ─── Build template data ──────────────────────────────────────────────

    // DAG tier items
    const tier0Items = (input.plan.tiers[0]?.items || []).map(item => {
      const fwRole = frameworkRoles.find(r => r.package === item.name || item.name.includes(r.package.split(".").pop() || ""));
      return {
        name: item.name,
        role: fwRole?.classification || `Framework transverse`,
        stat: `${item.loc} LOC · ${item.fileCount} fichiers`,
      };
    });

    const tier1Items = input.plan.tiers.slice(1).flatMap(t => t.items).map(item => ({
      name: item.name,
      stat: `${item.loc} LOC · ${item.fileCount} fich.`,
    }));

    // Frameworks for template
    const frameworksData = frameworkRoles.map(fr => {
      const fw = input.plan.externalFrameworks.find(f => f.rootPackage === fr.package);
      const topClasses = getTopClassesForPackage(input.graph, fr.package);
      return {
        package: fr.package,
        title: fr.classification,
        imports: fw?.totalImports || 0,
        role: fr.rationale,
        target: `${fr.recommendedTarget}`,
        topClasses: topClasses.slice(0, 5),
      };
    });

    // Projects sorted by LOC ascending
    const sortedProjects = [...input.graph.projects].sort((a, b) => a.loc - b.loc);
    const projectsData = sortedProjects.map((proj, idx) => {
      const desc = projectDescriptions.find(d => d.name === proj.name);
      const { sizeClass, sizeLabel } = getSizeClass(proj.loc);
      return {
        num: padNum(idx),
        name: proj.name,
        description: desc?.description || `Service ${proj.name}`,
        domain: desc?.domain || "Service métier",
        locFormatted: formatNumber(proj.loc),
        fileCount: proj.fileCount,
        sizeClass,
        sizeLabel,
      };
    });

    // Risks for template
    const risksData = risks.map((r, idx) => ({
      num: idx + 1,
      levelClass: r.level === "high" ? "high" : r.level === "medium" ? "med" : "low",
      title: r.title,
      description: r.description,
      mitigation: r.mitigation,
      impact: r.impact,
    }));

    // Migration phases
    const phasesData = input.plan.tiers.map((tier, idx) => ({
      romanNum: getRomanNum(idx + 1),
      duration: tier.items.length <= 4 ? "8-12" : "12-16",
      title: tier.label || `Migration Tier ${tier.level}`,
      description: input.enrichments?.tierRationales?.[idx]?.explanation ||
        `Migration des ${tier.items.length} éléments de ce tier. ${tier.canParallelize ? "Parallélisable." : "Séquentiel."}`,
      items: tier.items.map(i => i.name),
      rationale: tier.rationale || "",
    }));

    // Cover title
    const workspaceSlug = input.workspaceName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const coverParts = input.workspaceName.split(/\s+/);
    const coverTitle = coverParts.slice(0, Math.ceil(coverParts.length / 2)).join(" ");
    const coverSubtitle = coverParts.slice(Math.ceil(coverParts.length / 2)).join(" ") || "Portfolio.";

    // Report date
    const reportDateStr = input.reportDate.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const reportMonth = input.reportDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

    // Callflow conclusion
    const callflowConclusion = `<strong style="color: var(--text);">Implication migration :</strong> chaque maillon a une cible Spring naturelle — Servlet → <code>@RestController</code>, Parser → Jackson, BaseUseCase → <code>@Service</code>, SynchroneService → OpenFeign, FwkRollbackException → <code>@Transactional(rollbackFor)</code>. Le mapping est <strong style="color: var(--mint);">direct et reproductible</strong>.`;

    // ─── Compile template ─────────────────────────────────────────────────

    const templateData = {
      workspaceName: input.workspaceName,
      workspaceSlug,
      reportDate: reportDateStr,
      reference: input.reference,
      missionLabel: input.missionLabel || `Programme de modernisation · ${reportMonth}`,
      reportMonth: `${reportMonth.charAt(0).toUpperCase()}${reportMonth.slice(1)}`,
      llmStatus: llmAvailable ? "OK" : "OFF",
      coverTitle,
      coverSubtitle,
      executiveSummary,
      executiveTitle,
      executiveLede,
      projectCount: input.graph.projects.length,
      totalFiles,
      totalLocK,
      frameworkCount: input.plan.externalFrameworks.length,
      tierCount: input.plan.tiers.length,
      uniqueClasses,
      totalImports,
      edgeCount,
      findings: findings.map(f => ({
        ...f,
        isCritical: f.type === "risk",
        tag: f.type === "risk" ? "Point d'attention" : "Atout stratégique",
      })),
      tier0Items,
      tier1Items,
      frameworks: frameworksData,
      callflowLines,
      callflowConclusion,
      planTitle: `${input.plan.tiers.length} phases, une trajectoire claire.`,
      phases: phasesData,
      projects: projectsData,
      riskCount: risks.length,
      risks: risksData,
      glossary,
      noLlmWarning: !llmAvailable && !input.enrichments,
    };

    const html = this.template(templateData);

    return { html, warnings };
  }
}
