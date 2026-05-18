/**
 * WorkspaceReportGenerator — Tests unitaires v13.2
 *
 * Test 1: Rendering sur workspace BMCE (19 projets)
 * Test 2: Rendering sur workspace mono-projet
 * Test 3: Fallback LLM (LLM indisponible)
 * Test 4: Validation structure HTML (pas de placeholders non remplacés)
 *
 * @author Compleo
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { WorkspaceReportGenerator } from "./WorkspaceReportGenerator";
import type { ReportInput, EnrichmentData } from "./WorkspaceReportGenerator";
import type { WorkspaceGraph, ProjectNode, ExternalDep, DependencyEdge } from "./DependencyAnalyzer";
import type { MigrationPlan, FrameworkGroup } from "./MigrationPlanner";

// ─── Mock LLM adapter ─────────────────────────────────────────────────────────

vi.mock("../ml/llm-adapter", () => ({
  llmGenerateJSON: vi.fn().mockResolvedValue(null),
  isLLMAvailable: vi.fn().mockResolvedValue(false),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function createBMCEGraph(): WorkspaceGraph {
  const projectNames = [
    "interface-credit-jocker", "interface-send-sms", "transfert-euro-bmce-direct",
    "commande-chequier", "souscription-assistance", "souscription-opv",
    "opposition-carte", "demande-dotation", "mise-a-jour-3ds",
    "tokenisation-carte", "souscription-pack", "souscription-carte-prepayee",
    "demande-credit-conso", "virement-international", "consultation-solde",
    "historique-operations", "gestion-beneficiaires", "activation-service",
    "parametrage-alertes",
  ];

  const projects: ProjectNode[] = projectNames.map((name, i) => ({
    name,
    fileCount: 40 + i * 5,
    loc: 1500 + i * 300,
    classCount: 10 + i * 2,
    packageName: `com.bmce.${name.replace(/-/g, ".")}`,
  }));

  const edges: DependencyEdge[] = [
    { from: "commande-chequier", to: "interface-send-sms", type: "IMPORT", sharedClasses: ["SmsNotifier"] },
    { from: "souscription-opv", to: "interface-credit-jocker", type: "IMPORT", sharedClasses: ["CreditValidator"] },
  ];

  const externalDependencies = new Map<string, ExternalDep[]>();
  for (const proj of projects) {
    externalDependencies.set(proj.name, [
      {
        package: "com.bmce.eai.framework",
        importCount: 15 + Math.floor(Math.random() * 10),
        classes: ["Envelope", "BaseUseCase", "Parser", "ValueObject"],
      },
      {
        package: "com.bmce.eai.log",
        importCount: 5 + Math.floor(Math.random() * 5),
        classes: ["EaiLog", "LogLevel"],
      },
      {
        package: "com.bmce.eai.connector",
        importCount: 8 + Math.floor(Math.random() * 5),
        classes: ["SynchroneService", "ConnectorConfig"],
      },
      {
        package: "com.bmce.eai.transaction",
        importCount: 3 + Math.floor(Math.random() * 3),
        classes: ["FwkRollbackException", "ContinueOrStartTransaction"],
      },
    ]);
  }

  return { projects, dependencyEdges: edges, externalDependencies };
}

function createBMCEPlan(graph: WorkspaceGraph): MigrationPlan {
  const externalFrameworks: FrameworkGroup[] = [
    {
      rootPackage: "com.bmce.eai.framework",
      totalImports: 380,
      projectsUsing: 19,
      topClasses: ["Envelope", "BaseUseCase", "Parser", "ValueObject"],
      recommendedTargetName: "Spring Boot Starter + Jackson",
    },
    {
      rootPackage: "com.bmce.eai.log",
      totalImports: 120,
      projectsUsing: 19,
      topClasses: ["EaiLog", "LogLevel"],
      recommendedTargetName: "SLF4J + Logback MDC",
    },
    {
      rootPackage: "com.bmce.eai.connector",
      totalImports: 200,
      projectsUsing: 19,
      topClasses: ["SynchroneService", "ConnectorConfig"],
      recommendedTargetName: "OpenFeign + Resilience4j",
    },
    {
      rootPackage: "com.bmce.eai.transaction",
      totalImports: 80,
      projectsUsing: 19,
      topClasses: ["FwkRollbackException", "ContinueOrStartTransaction"],
      recommendedTargetName: "Spring @Transactional",
    },
  ];

  return {
    tiers: [
      {
        level: 0,
        label: "Frameworks transverses",
        items: externalFrameworks.map(fw => ({
          name: fw.rootPackage,
          loc: 2000,
          fileCount: 30,
          reason: "Framework partagé par tous les projets",
        })),
        canParallelize: false,
        rationale: "Les frameworks doivent être migrés en premier car tous les projets en dépendent.",
      },
      {
        level: 1,
        label: "Services métier",
        items: graph.projects.map(p => ({
          name: p.name,
          loc: p.loc,
          fileCount: p.fileCount,
          reason: "Service métier indépendant",
        })),
        canParallelize: true,
        rationale: "Services indépendants, parallélisables une fois les frameworks migrés.",
      },
    ],
    externalFrameworks,
    totalEffortDays: 180,
    summary: "Migration en 2 tiers : frameworks d'abord, puis services métier en parallèle.",
  };
}

function createSingleProjectGraph(): WorkspaceGraph {
  const projects: ProjectNode[] = [{
    name: "mon-service",
    fileCount: 25,
    loc: 2000,
    classCount: 8,
    packageName: "com.example.monservice",
  }];

  const externalDependencies = new Map<string, ExternalDep[]>();
  externalDependencies.set("mon-service", [
    { package: "javax.ejb", importCount: 10, classes: ["Stateless", "EJB", "Remote"] },
  ]);

  return { projects, dependencyEdges: [], externalDependencies };
}

function createSingleProjectPlan(): MigrationPlan {
  return {
    tiers: [{
      level: 0,
      label: "Service unique",
      items: [{ name: "mon-service", loc: 2000, fileCount: 25, reason: "Seul projet" }],
      canParallelize: false,
      rationale: "Projet unique, migration directe.",
    }],
    externalFrameworks: [{
      rootPackage: "javax.ejb",
      totalImports: 10,
      projectsUsing: 1,
      topClasses: ["Stateless", "EJB", "Remote"],
      recommendedTargetName: "Spring @Service",
    }],
    totalEffortDays: 15,
    summary: "Migration directe d'un projet unique.",
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WorkspaceReportGenerator", () => {
  let generator: WorkspaceReportGenerator;

  beforeAll(() => {
    generator = new WorkspaceReportGenerator();
  });

  // Test 1 — Rendering sur workspace BMCE (19 projets)
  it("should render BMCE workspace with 19 projects correctly", async () => {
    const graph = createBMCEGraph();
    const plan = createBMCEPlan(graph);

    const input: ReportInput = {
      workspaceName: "BMCEDirect Banking Portfolio",
      reportDate: new Date("2026-05-12"),
      reference: "WSA-2026-05-12",
      graph,
      plan,
    };

    const { html, warnings } = await generator.generate(input);

    // 19 projets dans la table (div.project-row dans le template)
    const projectRowMatches = html.match(/class="project-row"/g);
    expect(projectRowMatches?.length || 0).toBeGreaterThanOrEqual(19);

    // 4 cartes de frameworks (class="framework" dans le template)
    const frameworkCardMatches = html.match(/class="framework"/g);
    expect(frameworkCardMatches?.length || 0).toBeGreaterThanOrEqual(4);

    // Au moins 3 findings dans executive summary (class="finding..." dans le template)
    const findingMatches = html.match(/class="finding/g);
    expect(findingMatches?.length || 0).toBeGreaterThanOrEqual(3);

    // Le mot "BMCEDirect" dans le cover title
    expect(html).toContain("BMCEDirect");

    // Pas de placeholder {{...}} non remplacé
    const unreplacedPlaceholders = html.match(/\{\{[^}]+\}\}/g);
    expect(unreplacedPlaceholders).toBeNull();

    // HTML non vide et bien formé
    expect(html.length).toBeGreaterThan(10000);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  // Test 2 — Rendering sur workspace mono-projet
  it("should render single-project workspace without crash", async () => {
    const graph = createSingleProjectGraph();
    const plan = createSingleProjectPlan();

    const input: ReportInput = {
      workspaceName: "Mon Service Unique",
      reportDate: new Date("2026-05-12"),
      reference: "WSA-2026-05-12-SINGLE",
      graph,
      plan,
    };

    const { html, warnings } = await generator.generate(input);

    // HTML généré sans crash
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(5000);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Mon Service Unique");

    // 1 projet dans la table (div.project-row dans le template)
    const projectRowMatches = html.match(/class="project-row"/g);
    expect(projectRowMatches?.length || 0).toBeGreaterThanOrEqual(1);

    // Pas de placeholder non remplacé
    const unreplacedPlaceholders = html.match(/\{\{[^}]+\}\}/g);
    expect(unreplacedPlaceholders).toBeNull();
  });

  // Test 3 — Fallback LLM (LLM indisponible)
  it("should generate report with fallback prose when LLM is unavailable", async () => {
    const graph = createBMCEGraph();
    const plan = createBMCEPlan(graph);

    const input: ReportInput = {
      workspaceName: "BMCEDirect Banking Portfolio",
      reportDate: new Date("2026-05-12"),
      reference: "WSA-2026-05-12-NOLLM",
      graph,
      plan,
      // Pas d'enrichments fournis, LLM mocké comme indisponible
    };

    const { html, warnings } = await generator.generate(input);

    // HTML généré avec prose par défaut
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(10000);

    // Warnings indiquent que le LLM était indisponible
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.includes("LLM unavailable"))).toBe(true);

    // Les findings par défaut sont présents
    expect(html).toContain("Cohérence architecturale forte");

    // Les risques par défaut sont présents
    expect(html).toContain("Cohérence cross-projet");
  });

  // Test 4 — Validation structure HTML complète
  it("should produce valid HTML structure with all required sections", async () => {
    const graph = createBMCEGraph();
    const plan = createBMCEPlan(graph);

    // Fournir des enrichments pré-calculés
    const enrichments: EnrichmentData = {
      findings: [
        { type: "strength", title: "Architecture homogène", body: "Les services suivent un pattern cohérent." },
        { type: "strength", title: "Frameworks identifiés", body: "4 frameworks transverses clairement délimités." },
        { type: "strength", title: "Parallélisation possible", body: "Services indépendants après migration frameworks." },
        { type: "risk", title: "Couplage transverse", body: "Dépendance forte aux classes partagées." },
      ],
      frameworkRoles: [
        { package: "com.bmce.eai.framework", classification: "Framework EAI structurant", rationale: "Concentre les patterns UseCase/Envelope.", recommendedTarget: "Spring Boot Starter + Jackson" },
        { package: "com.bmce.eai.log", classification: "Logging applicatif EAI", rationale: "Logger propriétaire à migrer vers SLF4J.", recommendedTarget: "SLF4J + Logback MDC" },
        { package: "com.bmce.eai.connector", classification: "Connecteur synchrone back-office", rationale: "Appels bloquants vers SI cœur.", recommendedTarget: "OpenFeign + Resilience4j" },
        { package: "com.bmce.eai.transaction", classification: "Gestion transactionnelle EAI", rationale: "Propagation et rollback propriétaires.", recommendedTarget: "Spring @Transactional" },
      ],
      risks: [
        { level: "high", title: "Cohérence cross-projet", description: "Risque d'incompatibilités.", mitigation: "MigrationRegistry.", impact: "19/19 services" },
        { level: "medium", title: "Latence connecteurs", description: "SLA hétérogènes.", mitigation: "Resilience4j.", impact: "Performance" },
        { level: "medium", title: "Non-déterminisme LLM", description: "Variabilité de génération.", mitigation: "CompileAutoFixer.", impact: "Productivité" },
        { level: "low", title: "Framework volumineux", description: "Sous-domaines hétérogènes.", mitigation: "Découpage par sous-package.", impact: "Calendrier" },
      ],
    };

    const input: ReportInput = {
      workspaceName: "BMCEDirect Banking Portfolio",
      reportDate: new Date("2026-05-12"),
      reference: "WSA-2026-05-12-FULL",
      graph,
      plan,
      enrichments,
    };

    const { html, warnings } = await generator.generate(input);

    // Sections obligatoires présentes
    expect(html).toContain("cover");
    expect(html).toContain("executive");
    expect(html).toContain("metrics");
    expect(html).toContain("dag");
    expect(html).toContain("framework");
    expect(html).toContain("callflow");
    expect(html).toContain("migration");
    expect(html).toContain("projects");
    expect(html).toContain("risks");
    expect(html).toContain("glossary");

    // Contient les données enrichies
    expect(html).toContain("Architecture homogène");
    expect(html).toContain("Framework EAI structurant");
    expect(html).toContain("Spring Boot Starter + Jackson");

    // Pas de warnings quand enrichments fournis
    // (peut avoir des warnings pour project descriptions si non fournis)
    expect(warnings.filter(w => w.includes("findings") || w.includes("risks")).length).toBe(0);
  });
});
