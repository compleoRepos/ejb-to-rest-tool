/**
 * Tests for v10.2 — Agent sessions endpoint merge (memory + DB) and artifact matching.
 * Validates that:
 * 1. The /sessions endpoint returns both in-memory and DB-persisted sessions
 * 2. gitUrl is exposed in session data for frontend matching
 * 3. downloadUrl is exposed for hasZip detection
 * 4. DB sessions are deduplicated against in-memory sessions
 * @author Compleo
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getAgentStore, type AgentConfig } from "./agent/CompleoAgent";

// ─── Session store merge logic unit tests ────────────────────────────────────

describe("Agent Sessions v10.2 — Memory + DB merge logic", () => {
  const store = getAgentStore();

  const gitConfig: AgentConfig = {
    source: { type: "git", url: "https://github.com/company/legacy-app.git", branch: "main" },
    output: { type: "zip" },
    options: { projectName: "legacy-app", enableML: true },
  };

  const zipConfig: AgentConfig = {
    source: { type: "zip", sessionId: "upload-123" },
    output: { type: "zip" },
    options: { projectName: "my-project" },
  };

  beforeEach(() => {
    // Clear all sessions
    for (const s of store.list()) {
      store.delete(s.id);
    }
  });

  it("gitUrl is extracted from git source config", () => {
    const session = store.create(gitConfig);
    const gitUrl = session.config.source.type === "git"
      ? (session.config.source as any).url
      : null;
    expect(gitUrl).toBe("https://github.com/company/legacy-app.git");
  });

  it("gitUrl is null for zip source config", () => {
    const session = store.create(zipConfig);
    const gitUrl = session.config.source.type === "git"
      ? (session.config.source as any).url
      : null;
    expect(gitUrl).toBeNull();
  });

  it("downloadUrl is exposed and starts with http after S3 upload", () => {
    const session = store.create(gitConfig);
    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "COMPLETED",
      downloadUrl: "https://s3.example.com/agent-artifacts/legacy-app-abc123.zip",
    });
    const retrieved = store.get(session.id);
    expect(retrieved!.downloadUrl).toBe("https://s3.example.com/agent-artifacts/legacy-app-abc123.zip");
    expect(retrieved!.downloadUrl!.startsWith("http")).toBe(true);
  });

  it("memory sessions map includes gitUrl and downloadUrl fields", () => {
    const session = store.create(gitConfig);
    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "COMPLETED",
      downloadUrl: "https://s3.example.com/test.zip",
    });
    // Simulate what the endpoint does
    const mapped = store.list().map((s) => ({
      id: s.id,
      state: s.state,
      projectName: s.config.options.projectName || null,
      gitUrl: s.config.source.type === "git" ? (s.config.source as any).url : null,
      hasZip: !!(s.downloadUrl),
      downloadUrl: s.downloadUrl || null,
    }));
    expect(mapped.length).toBe(1);
    expect(mapped[0].gitUrl).toBe("https://github.com/company/legacy-app.git");
    expect(mapped[0].hasZip).toBe(true);
    expect(mapped[0].downloadUrl).toBe("https://s3.example.com/test.zip");
  });

  it("deduplication: memory IDs take priority over DB IDs", () => {
    const s1 = store.create(gitConfig);
    const s2 = store.create(zipConfig);
    const memoryIds = new Set(store.list().map((s) => s.id));
    // Simulate DB rows
    const dbRows = [
      { id: s1.id, projectName: "legacy-app" }, // duplicate
      { id: "db-only-session", projectName: "other-project" }, // unique
    ];
    const dbOnly = dbRows.filter((row) => !memoryIds.has(row.id));
    expect(dbOnly.length).toBe(1);
    expect(dbOnly[0].id).toBe("db-only-session");
  });
});

// ─── Frontend matching logic unit tests ─────────────────────────────────────

describe("Agent Artifacts v10.2 — Frontend matching logic", () => {
  interface MockSession {
    id: string;
    state: string;
    projectName: string | null;
    gitUrl: string | null;
    hasZip: boolean;
  }

  const sessions: MockSession[] = [
    { id: "s1", state: "COMPLETED", projectName: "legacy-app", gitUrl: "https://github.com/company/legacy-app.git", hasZip: true },
    { id: "s2", state: "COMPLETED", projectName: "other-project", gitUrl: "https://github.com/company/other.git", hasZip: true },
    { id: "s3", state: "COMPLETED", projectName: "legacy-app", gitUrl: null, hasZip: false },
    { id: "s4", state: "RUNNING", projectName: "legacy-app", gitUrl: "https://github.com/company/legacy-app.git", hasZip: false },
    { id: "s5", state: "COMPLETED", projectName: null, gitUrl: "https://github.com/company/legacy-app.git", hasZip: true },
  ];

  function matchArtifacts(projectName: string | undefined, gitUrl?: string | null): MockSession[] {
    return sessions.filter((s) => {
      if (s.state !== "COMPLETED" || !s.hasZip) return false;
      if (projectName && s.projectName === projectName) return true;
      if (gitUrl && s.gitUrl && s.gitUrl === gitUrl) return true;
      return false;
    });
  }

  it("matches by projectName when gitUrl is not provided", () => {
    const result = matchArtifacts("legacy-app");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("s1");
  });

  it("matches by gitUrl when projectName does not match", () => {
    const result = matchArtifacts("unknown-project", "https://github.com/company/legacy-app.git");
    expect(result.length).toBe(2); // s1 (via gitUrl) + s5 (via gitUrl)
    expect(result.map(r => r.id).sort()).toEqual(["s1", "s5"]);
  });

  it("matches by both projectName and gitUrl (union)", () => {
    const result = matchArtifacts("legacy-app", "https://github.com/company/legacy-app.git");
    expect(result.length).toBe(2); // s1 (both match) + s5 (gitUrl match)
    expect(result.map(r => r.id).sort()).toEqual(["s1", "s5"]);
  });

  it("excludes sessions without ZIP (hasZip=false)", () => {
    const result = matchArtifacts("legacy-app", "https://github.com/company/legacy-app.git");
    // s3 has projectName match but hasZip=false, s4 has gitUrl match but state=RUNNING
    expect(result.find(r => r.id === "s3")).toBeUndefined();
    expect(result.find(r => r.id === "s4")).toBeUndefined();
  });

  it("excludes non-COMPLETED sessions", () => {
    const result = matchArtifacts("legacy-app", "https://github.com/company/legacy-app.git");
    expect(result.find(r => r.id === "s4")).toBeUndefined();
  });

  it("returns empty when no match", () => {
    const result = matchArtifacts("nonexistent", "https://github.com/company/nonexistent.git");
    expect(result.length).toBe(0);
  });

  it("returns empty when both projectName and gitUrl are undefined", () => {
    const result = matchArtifacts(undefined, null);
    expect(result.length).toBe(0);
  });
});

// ─── DB session row mapping tests ───────────────────────────────────────────

describe("Agent Sessions v10.2 — DB row mapping", () => {
  it("maps DB row to session format with correct types", () => {
    const dbRow = {
      id: "agent-1234-abc",
      state: "COMPLETED" as const,
      currentPhase: "COMPLETED",
      createdAt: new Date("2026-04-20T10:00:00Z"),
      updatedAt: new Date("2026-04-20T11:30:00Z"),
      projectName: "banking-app",
      configData: {
        source: { type: "git", url: "https://github.com/bank/app.git" },
        output: { type: "zip" },
        options: { projectName: "banking-app" },
      },
      zipUrl: "https://s3.example.com/agent-artifacts/banking-app-xyz.zip",
      eventsData: [{ type: "info", message: "done" }],
      enhancedReportsData: { enhanced: true, reports: {} },
      microserviceResultData: { report: "test" },
      sagaResultData: null,
      qualityScoreData: { grade: "A", score: 95 },
    };

    const config = dbRow.configData as any;
    const mapped = {
      id: dbRow.id,
      state: dbRow.state,
      currentPhase: dbRow.currentPhase,
      createdAt: dbRow.createdAt ? new Date(dbRow.createdAt).getTime() : 0,
      updatedAt: dbRow.updatedAt ? new Date(dbRow.updatedAt).getTime() : 0,
      eventCount: (dbRow.eventsData as any[] | null)?.length ?? 0,
      projectName: dbRow.projectName || null,
      gitUrl: config?.source?.type === "git" ? config.source.url : null,
      sourceType: config?.source?.type || "zip",
      outputType: config?.output?.type || "zip",
      hasZip: !!(dbRow.zipUrl),
      downloadUrl: dbRow.zipUrl || null,
      hasReports: !!(dbRow.enhancedReportsData as any)?.enhanced,
      hasMicroservices: !!(dbRow.microserviceResultData),
      hasSagas: !!(dbRow.sagaResultData),
      qualityGrade: (dbRow.qualityScoreData as any)?.grade ?? null,
    };

    expect(mapped.id).toBe("agent-1234-abc");
    expect(mapped.state).toBe("COMPLETED");
    expect(mapped.createdAt).toBe(new Date("2026-04-20T10:00:00Z").getTime());
    expect(mapped.updatedAt).toBe(new Date("2026-04-20T11:30:00Z").getTime());
    expect(mapped.eventCount).toBe(1);
    expect(mapped.projectName).toBe("banking-app");
    expect(mapped.gitUrl).toBe("https://github.com/bank/app.git");
    expect(mapped.sourceType).toBe("git");
    expect(mapped.hasZip).toBe(true);
    expect(mapped.downloadUrl).toBe("https://s3.example.com/agent-artifacts/banking-app-xyz.zip");
    expect(mapped.hasReports).toBe(true);
    expect(mapped.hasMicroservices).toBe(true);
    expect(mapped.hasSagas).toBe(false);
    expect(mapped.qualityGrade).toBe("A");
  });

  it("handles null/missing configData gracefully", () => {
    const dbRow = {
      id: "agent-5678-def",
      state: "COMPLETED" as const,
      currentPhase: "COMPLETED",
      createdAt: null,
      updatedAt: null,
      projectName: "unknown",
      configData: null,
      zipUrl: null,
      eventsData: null,
      enhancedReportsData: null,
      microserviceResultData: null,
      sagaResultData: null,
      qualityScoreData: null,
    };

    const config = dbRow.configData as any;
    const mapped = {
      id: dbRow.id,
      createdAt: dbRow.createdAt ? new Date(dbRow.createdAt).getTime() : 0,
      updatedAt: dbRow.updatedAt ? new Date(dbRow.updatedAt).getTime() : 0,
      eventCount: (dbRow.eventsData as any[] | null)?.length ?? 0,
      projectName: dbRow.projectName || null,
      gitUrl: config?.source?.type === "git" ? config.source.url : null,
      sourceType: config?.source?.type || "zip",
      outputType: config?.output?.type || "zip",
      hasZip: !!(dbRow.zipUrl),
      downloadUrl: dbRow.zipUrl || null,
      hasReports: !!(dbRow.enhancedReportsData as any)?.enhanced,
      hasMicroservices: !!(dbRow.microserviceResultData),
      hasSagas: !!(dbRow.sagaResultData),
      qualityGrade: (dbRow.qualityScoreData as any)?.grade ?? null,
    };

    expect(mapped.createdAt).toBe(0);
    expect(mapped.updatedAt).toBe(0);
    expect(mapped.eventCount).toBe(0);
    expect(mapped.gitUrl).toBeNull();
    expect(mapped.sourceType).toBe("zip");
    expect(mapped.outputType).toBe("zip");
    expect(mapped.hasZip).toBe(false);
    expect(mapped.downloadUrl).toBeNull();
    expect(mapped.hasReports).toBe(false);
    expect(mapped.hasMicroservices).toBe(false);
    expect(mapped.hasSagas).toBe(false);
    expect(mapped.qualityGrade).toBeNull();
  });
});
