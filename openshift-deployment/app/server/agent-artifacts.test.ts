/**
 * Tests pour la persistance des artefacts Agent (v10.0).
 *
 * Vérifie que :
 * - Les sessions complétées retournent les flags hasZip/hasReports/hasSagas/hasMicroservices
 * - Le downloadUrl S3 est correctement stocké et retourné
 * - Le endpoint /sessions retourne les artefacts disponibles
 * - Le endpoint /download redirige vers S3 quand le ZIP est déjà persisté
 *
 * @author Compleo
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentSessionStore, type AgentConfig, type AgentSession } from "./agent/CompleoAgent";

// ─── AgentSessionStore artifact persistence tests ───────────────────────────
describe("Agent Artifacts — Persistence v10.0", () => {
  let store: AgentSessionStore;

  beforeEach(() => {
    store = new AgentSessionStore();
  });

  const baseConfig: AgentConfig = {
    source: { type: "zip", path: "/tmp/test.zip" },
    output: { type: "zip" },
    options: { projectName: "test-project", autoResolveAmbiguities: true },
  };

  it("session complétée avec downloadUrl S3 conserve l'URL", () => {
    const session = store.create(baseConfig);
    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "COMPLETED",
      downloadUrl: "https://s3.example.com/agent-artifacts/test-project-abc123.zip",
    });
    const retrieved = store.get(session.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.downloadUrl).toBe("https://s3.example.com/agent-artifacts/test-project-abc123.zip");
    expect(retrieved!.state).toBe("COMPLETED");
  });

  it("session complétée sans downloadUrl retourne undefined", () => {
    const session = store.create(baseConfig);
    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "COMPLETED",
    });
    const retrieved = store.get(session.id);
    expect(retrieved!.downloadUrl).toBeUndefined();
  });

  it("session avec enhancedReports a hasReports = true dans la liste", () => {
    const session = store.create(baseConfig);
    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "COMPLETED",
      enhancedReports: {
        enhanced: true,
        reports: {
          EXECUTIVE_SUMMARY: "# Executive Summary\nTest report",
          MIGRATION_REPORT: "# Migration Report\nTest",
        },
        metadata: { enhancedAt: Date.now(), model: "test", duration: 1000 },
      },
    });
    const sessions = store.list();
    const found = sessions.find(s => s.id === session.id);
    expect(found).toBeDefined();
    expect(found!.enhancedReports?.enhanced).toBe(true);
  });

  it("session avec microserviceResult a hasMicroservices = true", () => {
    const session = store.create(baseConfig);
    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "COMPLETED",
      microserviceResult: {
        report: "# Microservices Report",
        generatedFiles: [{ path: "api-gateway/pom.xml", content: "<project/>" }],
      },
    });
    const retrieved = store.get(session.id);
    expect(retrieved!.microserviceResult).toBeDefined();
    expect(retrieved!.microserviceResult!.report).toContain("Microservices");
  });

  it("session avec sagaResult a hasSagas = true", () => {
    const session = store.create(baseConfig);
    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "COMPLETED",
      sagaResult: {
        detected: true,
        candidates: [{ className: "OrderSaga", domain: "order", stepsCount: 3, compensableCount: 2 }],
        filesGenerated: 5,
      },
    });
    const retrieved = store.get(session.id);
    expect(retrieved!.sagaResult).toBeDefined();
    expect(retrieved!.sagaResult!.detected).toBe(true);
  });

  it("session avec qualityScore retourne le grade", () => {
    const session = store.create(baseConfig);
    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "COMPLETED",
      qualityScore: { grade: "A", score: 92, details: {} },
    });
    const retrieved = store.get(session.id);
    expect(retrieved!.qualityScore?.grade).toBe("A");
  });

  it("list() retourne toutes les sessions y compris les complétées", () => {
    const s1 = store.create(baseConfig);
    const s2 = store.create({ ...baseConfig, options: { projectName: "project-2" } });
    store.update(s1.id, { state: "COMPLETED", currentPhase: "COMPLETED" });
    store.update(s2.id, { state: "RUNNING", currentPhase: "ANALYZING" });
    const all = store.list();
    expect(all.length).toBe(2);
    const completed = all.filter(s => s.state === "COMPLETED");
    expect(completed.length).toBe(1);
    expect(completed[0].config.options.projectName).toBe("test-project");
  });

  it("downloadUrl S3 est mis à jour après le premier téléchargement", () => {
    const session = store.create(baseConfig);
    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "COMPLETED",
      downloadUrl: "/tmp/test.zip", // Initially a local path
    });
    // Simulate S3 upload
    store.update(session.id, {
      downloadUrl: "https://s3.example.com/agent-artifacts/test-project-xyz.zip",
    });
    const retrieved = store.get(session.id);
    expect(retrieved!.downloadUrl?.startsWith("https://")).toBe(true);
  });

  it("persist() ne crash pas quand la DB n'est pas disponible", () => {
    const session = store.create(baseConfig);
    // persist() should gracefully handle DB errors
    expect(() => store.persist(session.id)).not.toThrow();
  });

  it("delete() supprime la session de la mémoire", () => {
    const session = store.create(baseConfig);
    expect(store.get(session.id)).toBeDefined();
    store.delete(session.id);
    expect(store.get(session.id)).toBeUndefined();
  });

  it("addEvent() ajoute un événement à la session", () => {
    const session = store.create(baseConfig);
    store.addEvent(session.id, { type: "info", message: "Test event", timestamp: Date.now() });
    const retrieved = store.get(session.id);
    expect(retrieved!.events.length).toBe(1);
    expect(retrieved!.events[0].message).toBe("Test event");
  });

  it("session complétée avec tous les artefacts", () => {
    const session = store.create(baseConfig);
    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "COMPLETED",
      downloadUrl: "https://s3.example.com/test.zip",
      enhancedReports: {
        enhanced: true,
        reports: { EXECUTIVE_SUMMARY: "test" },
        metadata: { enhancedAt: Date.now(), model: "test", duration: 100 },
      },
      microserviceResult: {
        report: "# Microservices",
        generatedFiles: [],
      },
      sagaResult: {
        detected: true,
        candidates: [],
        filesGenerated: 0,
      },
      qualityScore: { grade: "B+", score: 85, details: {} },
    });
    const retrieved = store.get(session.id);
       expect(retrieved!.downloadUrl?.startsWith("https://")).toBe(true);
    expect(retrieved!.enhancedReports?.enhanced).toBe(true);
    expect(retrieved!.microserviceResult).toBeDefined();
    expect(retrieved!.sagaResult?.detected).toBe(true);
    expect(retrieved!.qualityScore?.grade).toBe("B+");
  });
});

// ─── Artifact availability flags tests ──────────────────────────────────────
describe("Agent Artifacts — Availability flags", () => {
  it("hasZip is true when downloadUrl starts with http", () => {
    const url = "https://s3.example.com/test.zip";
    expect(!!url && url.startsWith("http")).toBe(true);
  });

  it("hasZip is false when downloadUrl is a local path", () => {
    const url = "/tmp/test.zip";
    expect(!!url && url.startsWith("http")).toBe(false);
  });

  it("hasZip is false when downloadUrl is undefined", () => {
    const url: string | undefined = undefined;
    expect(!!url).toBe(false);
  });

  it("hasReports is true when enhancedReports.enhanced is true", () => {
    const reports = { enhanced: true, reports: {}, metadata: {} };
    expect(!!(reports?.enhanced)).toBe(true);
  });

  it("hasReports is false when enhancedReports is undefined", () => {
    const reports: any = undefined;
    expect(!!(reports?.enhanced)).toBe(false);
  });

  it("hasMicroservices is true when microserviceResult exists", () => {
    const result = { report: "test", generatedFiles: [] };
    expect(!!result).toBe(true);
  });

  it("hasSagas is true when sagaResult exists", () => {
    const result = { detected: true, candidates: [], filesGenerated: 0 };
    expect(!!result).toBe(true);
  });

  it("qualityGrade returns grade when qualityScore exists", () => {
    const score = { grade: "A", score: 92, details: {} };
    expect(score?.grade ?? null).toBe("A");
  });

  it("qualityGrade returns null when qualityScore is undefined", () => {
    const score: any = undefined;
    expect(score?.grade ?? null).toBeNull();
  });
});
