/**
 * Fixtures E2E — Données de test pour les 5 parcours utilisateur.
 * Fournit des mocks API réalistes pour simuler le pipeline sans LLM réel.
 */
import { Page, Route } from "@playwright/test";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MockConfig {
  llmAvailable?: boolean;
  llmLatency?: number;
  analysisDelay?: number;
  generationDelay?: number;
  compilationErrors?: number;
  workspaceProjects?: number;
}

// ─── Default Fixtures ───────────────────────────────────────────────────────

export const SINGLE_PROJECT_FIXTURE = {
  sessionId: "test-session-001",
  projectName: "avis-opere",
  analysisResult: {
    projectName: "avis-opere",
    detectedTechnologies: ["EJB 2.1", "Servlet", "JDBC", "JSP"],
    useCases: [
      { name: "AvisOpereService", type: "EJB_STATELESS", methods: ["createAvis", "getAvis", "updateAvis"] },
      { name: "AvisOpereServlet", type: "SERVLET", methods: ["doGet", "doPost"] },
    ],
    remoteInterfaces: [
      { name: "AvisOpereRemote", methods: ["createAvis", "getAvis"] },
    ],
    fileCount: 12,
    totalLines: 2450,
    complexity: "medium",
    maturityScore: { overall: 62, dimensions: { architecture: 55, code: 70, testing: 40, deployment: 65, observability: 80 } },
  },
  generationResult: {
    stats: { totalFiles: 18, totalLinesGenerated: 3200 },
    choicesApplied: 2,
    files: [
      { path: "src/main/java/com/bank/avisopere/controller/AvisOpereController.java", content: "// Generated REST controller", language: "java", linesOfCode: 85 },
      { path: "src/main/java/com/bank/avisopere/service/AvisOpereService.java", content: "// Generated service", language: "java", linesOfCode: 120 },
      { path: "src/main/java/com/bank/avisopere/entity/AvisOpere.java", content: "// Generated JPA entity", language: "java", linesOfCode: 45 },
      { path: "pom.xml", content: "<!-- Maven POM -->", language: "xml", linesOfCode: 80 },
      { path: "Dockerfile", content: "FROM eclipse-temurin:17", language: "dockerfile", linesOfCode: 12 },
    ],
    compilationResult: { success: true, errors: [], iterations: 1 },
  },
};

export const WORKSPACE_FIXTURE = {
  workspaceId: "ws-test-001",
  workspaceName: "BMCE Banking Suite",
  sessions: [
    { sessionId: "s1", projectName: "avis-opere", artifactId: "avis-opere", analysisStatus: "completed" },
    { sessionId: "s2", projectName: "commande-chequier", artifactId: "commande-chequier", analysisStatus: "completed" },
    { sessionId: "s3", projectName: "opposition-carte", artifactId: "opposition-carte", analysisStatus: "completed" },
  ],
  analysisResult: {
    graph: {
      nodes: [
        { id: "avis-opere", label: "avis-opere", type: "ejb" },
        { id: "commande-chequier", label: "commande-chequier", type: "ejb" },
        { id: "opposition-carte", label: "opposition-carte", type: "ejb" },
      ],
      edges: [
        { source: "avis-opere", target: "commande-chequier", label: "JNDI" },
        { source: "opposition-carte", target: "avis-opere", label: "JNDI" },
      ],
    },
    plan: {
      tiers: [
        { tier: 1, projects: ["opposition-carte"], effort: "low", frameworks: ["EJB 2.1"] },
        { tier: 2, projects: ["avis-opere"], effort: "medium", frameworks: ["EJB 2.1", "Servlet"] },
        { tier: 3, projects: ["commande-chequier"], effort: "high", frameworks: ["EJB 2.1", "JDBC"] },
      ],
      totalEffort: "3-5 sprints",
    },
    stubs: {
      files: [
        { path: "com/bank/avisopere/AvisOpereRemote.java", content: "// Stub", lines: 15 },
        { path: "com/bank/chequier/CommandeChequierRemote.java", content: "// Stub", lines: 12 },
      ],
      pomXml: "<project>...</project>",
    },
  },
};

export const PARTIAL_RESULT_FIXTURE = {
  ...SINGLE_PROJECT_FIXTURE,
  generationResult: {
    ...SINGLE_PROJECT_FIXTURE.generationResult,
    compilationResult: {
      success: false,
      errors: [
        { file: "AvisOpereService.java", line: 42, message: "cannot find symbol: class AvisOpereRemote", severity: "error" },
        { file: "AvisOpereService.java", line: 58, message: "method createAvis not found", severity: "error" },
      ],
      iterations: 3,
    },
    todoMarkers: [
      { file: "AvisOpereService.java", line: 42, message: "TODO: Resolve missing dependency AvisOpereRemote", severity: "high" },
      { file: "AvisOpereController.java", line: 15, message: "TODO: Add input validation", severity: "low" },
    ],
  },
};

// ─── Mock API Setup ─────────────────────────────────────────────────────────

export async function setupMockApi(page: Page, config: MockConfig = {}) {
  const {
    llmAvailable = true,
    llmLatency = 50,
    analysisDelay = 100,
    generationDelay = 200,
  } = config;

  // Mock /api/status
  await page.route("**/api/status", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: "13.4.0",
        uptime: 3600,
        llm: { available: llmAvailable, model: "gpt-4o", latency: llmLatency },
        memory: { heapUsed: 128, heapTotal: 512 },
        activeSessions: 2,
        rulesCount: 47,
      }),
    });
  });

  // Mock /api/compleo/upload
  await page.route("**/api/compleo/upload", async (route: Route) => {
    await new Promise((r) => setTimeout(r, analysisDelay));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessionId: SINGLE_PROJECT_FIXTURE.sessionId }),
    });
  });

  // Mock /api/compleo/analyze
  await page.route("**/api/compleo/analyze/**", async (route: Route) => {
    await new Promise((r) => setTimeout(r, analysisDelay));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SINGLE_PROJECT_FIXTURE.analysisResult),
    });
  });

  // Mock /api/compleo/generate
  await page.route("**/api/compleo/generate/**", async (route: Route) => {
    await new Promise((r) => setTimeout(r, generationDelay));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SINGLE_PROJECT_FIXTURE.generationResult),
    });
  });

  // Mock /api/workspace endpoints
  await page.route("**/api/workspace", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: WORKSPACE_FIXTURE.workspaceId,
          name: WORKSPACE_FIXTURE.workspaceName,
          description: "Suite bancaire BMCE",
          sessionCount: 3,
          sessions: WORKSPACE_FIXTURE.sessions,
        }]),
      });
    } else {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: WORKSPACE_FIXTURE.workspaceId }),
      });
    }
  });

  // Mock /api/workspace/:id/analyze
  await page.route("**/api/workspace/*/analyze", async (route: Route) => {
    await new Promise((r) => setTimeout(r, analysisDelay));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(WORKSPACE_FIXTURE.analysisResult),
    });
  });

  // Mock /api/workspace/:id/report.html
  await page.route("**/api/workspace/*/report.html", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body><h1>Workspace Report</h1></body></html>",
    });
  });
}

export async function setupLlmDownMockApi(page: Page) {
  await setupMockApi(page, { llmAvailable: false });

  // Override analyze to return error
  await page.route("**/api/compleo/analyze/**", async (route: Route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "LLM service unavailable" }),
    });
  });
}

export async function setupWorkspacePartialMockApi(page: Page) {
  await setupMockApi(page);

  // Override workspace analyze to return partial results
  await page.route("**/api/workspace/*/analyze", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...WORKSPACE_FIXTURE.analysisResult,
        errors: ["commande-chequier: analysis timeout"],
        partial: true,
      }),
    });
  });
}
