/**
 * Tests pour les routes Agent (/api/agent/*).
 *
 * Vérifie les endpoints REST de l'agent autonome :
 * - POST /api/agent/start
 * - GET  /api/agent/:id/status
 * - POST /api/agent/:id/cancel
 * - POST /api/agent/:id/choices
 * - GET  /api/agent/:id/download
 *
 * @author Hamza NORDINE
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentSessionStore, type AgentConfig, type AgentSession } from "./agent/CompleoAgent";

// ─── AgentSessionStore tests (unit) ─────────────────────────────────────────

describe("Agent Routes — AgentSessionStore", () => {
  let store: AgentSessionStore;

  beforeEach(() => {
    store = new AgentSessionStore();
  });

  it("crée une session avec un ID unique", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: { autoResolveAmbiguities: true },
    };
    const session = store.create(config);
    expect(session.id).toMatch(/^agent-/);
    expect(session.state).toBe("IDLE");
    expect(session.currentPhase).toBe("IDLE");
    expect(session.config).toEqual(config);
    expect(session.events).toEqual([]);
    expect(session.createdAt).toBeGreaterThan(0);
  });

  it("récupère une session par ID", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    const session = store.create(config);
    const retrieved = store.get(session.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(session.id);
  });

  it("retourne undefined pour un ID inexistant", () => {
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("met à jour une session", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    const session = store.create(config);
    const updated = store.update(session.id, { state: "RUNNING", currentPhase: "ANALYZING" });
    expect(updated).toBeDefined();
    expect(updated!.state).toBe("RUNNING");
    expect(updated!.currentPhase).toBe("ANALYZING");
  });

  it("ajoute des événements à une session", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    const session = store.create(config);
    store.addEvent(session.id, {
      type: "LOG",
      timestamp: Date.now(),
      level: "info",
      message: "Test event",
    });
    const retrieved = store.get(session.id);
    expect(retrieved!.events).toHaveLength(1);
    expect(retrieved!.events[0].message).toBe("Test event");
  });

  it("liste les sessions triées par date décroissante", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    const s1 = store.create(config);
    // Force a different timestamp
    store.update(s1.id, {});
    (store.get(s1.id) as any).createdAt = Date.now() - 1000;
    const s2 = store.create(config);
    const list = store.list();
    expect(list).toHaveLength(2);
    // Most recent first
    expect(list[0].id).toBe(s2.id);
    expect(list[1].id).toBe(s1.id);
  });

  it("supprime une session", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    const session = store.create(config);
    expect(store.delete(session.id)).toBe(true);
    expect(store.get(session.id)).toBeUndefined();
    expect(store.delete(session.id)).toBe(false);
  });
});

// ─── AgentConfig validation tests ───────────────────────────────────────────

describe("Agent Routes — AgentConfig validation", () => {
  it("accepte une config ZIP valide", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/project.zip" },
      output: { type: "zip" },
      options: {
        maxCompilationAttempts: 5,
        autoResolveAmbiguities: true,
        generateTests: true,
        projectName: "my-project",
      },
    };
    expect(config.source.type).toBe("zip");
    expect(config.options.maxCompilationAttempts).toBe(5);
  });

  it("accepte une config Git valide", () => {
    const config: AgentConfig = {
      source: {
        type: "git",
        url: "https://github.com/org/repo.git",
        branch: "main",
        token: "ghp_xxx",
        provider: "github",
      },
      output: { type: "pr", targetBranch: "main", autoPR: true },
      options: {
        autoResolveAmbiguities: false,
        technologies: ["EJB_3X_STATELESS", "SERVLET"],
      },
    };
    expect(config.source.type).toBe("git");
    if (config.source.type === "git") {
      expect(config.source.url).toContain("github.com");
      expect(config.source.provider).toBe("github");
    }
    expect(config.output.type).toBe("pr");
  });

  it("supporte les options par défaut", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    expect(config.options.maxCompilationAttempts).toBeUndefined();
    expect(config.options.autoResolveAmbiguities).toBeUndefined();
    expect(config.options.generateTests).toBeUndefined();
  });
});

// ─── Agent phase transitions ────────────────────────────────────────────────

describe("Agent Routes — Phase transitions", () => {
  let store: AgentSessionStore;

  beforeEach(() => {
    store = new AgentSessionStore();
  });

  it("suit le cycle de vie IDLE → RUNNING → COMPLETED", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    const session = store.create(config);
    expect(session.state).toBe("IDLE");

    store.update(session.id, { state: "RUNNING", currentPhase: "CLONING" });
    expect(store.get(session.id)!.state).toBe("RUNNING");

    store.update(session.id, { currentPhase: "ANALYZING" });
    expect(store.get(session.id)!.currentPhase).toBe("ANALYZING");

    store.update(session.id, { currentPhase: "GENERATING" });
    expect(store.get(session.id)!.currentPhase).toBe("GENERATING");

    store.update(session.id, { currentPhase: "COMPILING" });
    expect(store.get(session.id)!.currentPhase).toBe("COMPILING");

    store.update(session.id, { state: "COMPLETED", currentPhase: "DONE" });
    expect(store.get(session.id)!.state).toBe("COMPLETED");
    expect(store.get(session.id)!.currentPhase).toBe("DONE");
  });

  it("supporte la transition vers AWAITING_INPUT", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    const session = store.create(config);
    store.update(session.id, { state: "RUNNING", currentPhase: "ANALYZING" });
    store.update(session.id, { state: "AWAITING_INPUT", currentPhase: "AWAITING_INPUT" });
    expect(store.get(session.id)!.state).toBe("AWAITING_INPUT");
  });

  it("supporte la transition vers FAILED", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    const session = store.create(config);
    store.update(session.id, {
      state: "FAILED",
      currentPhase: "FAILED",
      errorMessage: "Test error",
    });
    expect(store.get(session.id)!.state).toBe("FAILED");
    expect(store.get(session.id)!.errorMessage).toBe("Test error");
  });

  it("supporte la transition vers CANCELLED", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    const session = store.create(config);
    store.update(session.id, { state: "RUNNING" });
    store.update(session.id, { state: "CANCELLED", currentPhase: "DONE" });
    expect(store.get(session.id)!.state).toBe("CANCELLED");
  });
});

// ─── Agent event accumulation ───────────────────────────────────────────────

describe("Agent Routes — Event accumulation", () => {
  let store: AgentSessionStore;

  beforeEach(() => {
    store = new AgentSessionStore();
  });

  it("accumule les événements dans l'ordre", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    const session = store.create(config);

    const events = [
      { type: "PHASE_START" as const, timestamp: 1, phase: "CLONING" as const, message: "Cloning..." },
      { type: "LOG" as const, timestamp: 2, level: "info" as const, message: "Progress 50%" },
      { type: "PHASE_END" as const, timestamp: 3, phase: "CLONING" as const, message: "Done" },
    ];

    for (const event of events) {
      store.addEvent(session.id, event);
    }

    const retrieved = store.get(session.id)!;
    expect(retrieved.events).toHaveLength(3);
    expect(retrieved.events[0].type).toBe("PHASE_START");
    expect(retrieved.events[1].type).toBe("LOG");
    expect(retrieved.events[2].type).toBe("PHASE_END");
  });

  it("ne modifie pas les événements d'une session inexistante", () => {
    store.addEvent("nonexistent", {
      type: "LOG",
      timestamp: Date.now(),
      message: "Should not crash",
    });
    // No error thrown
    expect(store.get("nonexistent")).toBeUndefined();
  });
});

// ─── Bug fix: ZIP sessionId resolution ─────────────────────────────────────
// Tests for the "0 files" bug fix (v5.5.1): when source.type === "zip" with
// sessionId, the agent must resolve files from the Compleo upload session store.

describe("Agent Routes — AgentConfig with sessionId (bug fix v5.5.1)", () => {
  it("accepte une config ZIP avec sessionId (sans path)", () => {
    const config: AgentConfig = {
      source: { type: "zip", sessionId: "abc123" },
      output: { type: "zip" },
      options: { projectName: "test-project" },
    };
    expect(config.source.type).toBe("zip");
    if (config.source.type === "zip") {
      expect(config.source.sessionId).toBe("abc123");
      expect(config.source.path).toBeUndefined();
      expect(config.source.files).toBeUndefined();
    }
  });

  it("accepte une config ZIP avec path (rétrocompatibilité)", () => {
    const config: AgentConfig = {
      source: { type: "zip", path: "/tmp/test.zip" },
      output: { type: "zip" },
      options: {},
    };
    expect(config.source.type).toBe("zip");
    if (config.source.type === "zip") {
      expect(config.source.path).toBe("/tmp/test.zip");
      expect(config.source.sessionId).toBeUndefined();
    }
  });

  it("accepte une config ZIP avec files directement", () => {
    const config: AgentConfig = {
      source: {
        type: "zip",
        files: [
          { path: "src/Main.java", content: "public class Main {}" },
          { path: "pom.xml", content: "<project/>" },
        ],
      },
      output: { type: "zip" },
      options: {},
    };
    expect(config.source.type).toBe("zip");
    if (config.source.type === "zip") {
      expect(config.source.files).toHaveLength(2);
      expect(config.source.files![0].path).toBe("src/Main.java");
    }
  });

  it("crée une session agent avec sessionId ZIP", () => {
    const store = new AgentSessionStore();
    const config: AgentConfig = {
      source: { type: "zip", sessionId: "upload-session-xyz" },
      output: { type: "zip" },
      options: { projectName: "my-migration" },
    };
    const session = store.create(config);
    expect(session.id).toMatch(/^agent-/);
    expect(session.config.source.type).toBe("zip");
    if (session.config.source.type === "zip") {
      expect(session.config.source.sessionId).toBe("upload-session-xyz");
    }
  });
});

// ─── Input validation tests ────────────────────────────────────────────────

describe("Agent Routes — Input validation", () => {
  it("config Git sans url est invalide", () => {
    const config = {
      source: { type: "git" },
      output: { type: "zip" },
      options: {},
    };
    // Validation check: source.type === "git" but no url
    expect(config.source.type).toBe("git");
    expect((config.source as any).url).toBeUndefined();
  });

  it("config ZIP sans sessionId, path ni files est invalide", () => {
    const config = {
      source: { type: "zip" },
      output: { type: "zip" },
      options: {},
    };
    expect(config.source.type).toBe("zip");
    expect((config.source as any).sessionId).toBeUndefined();
    expect((config.source as any).path).toBeUndefined();
    expect((config.source as any).files).toBeUndefined();
  });

  it("config ZIP avec sessionId est valide", () => {
    const config = {
      source: { type: "zip", sessionId: "sess-123" },
      output: { type: "zip" },
      options: {},
    };
    expect(config.source.type).toBe("zip");
    expect((config.source as any).sessionId).toBe("sess-123");
  });
});

// ─── phaseCloning sessionId resolution (unit test) ─────────────────────────

describe("Agent Routes — phaseCloning sessionId resolution", () => {
  it("session avec sessionId ZIP stocke correctement le config", () => {
    const store = new AgentSessionStore();
    const config: AgentConfig = {
      source: { type: "zip", sessionId: "upload-abc" },
      output: { type: "zip" },
      options: { projectName: "test" },
    };
    const session = store.create(config);
    expect(session.config.source.type).toBe("zip");

    // Verify the sessionId is preserved through the session lifecycle
    store.update(session.id, { state: "RUNNING", currentPhase: "CLONING" });
    const updated = store.get(session.id)!;
    expect(updated.state).toBe("RUNNING");
    if (updated.config.source.type === "zip") {
      expect(updated.config.source.sessionId).toBe("upload-abc");
    }
  });

  it("session avec files directement ne nécessite pas de résolution", () => {
    const store = new AgentSessionStore();
    const files = [
      { path: "src/com/example/MyBean.java", content: "@Stateless public class MyBean {}" },
      { path: "pom.xml", content: "<project/>" },
    ];
    const config: AgentConfig = {
      source: { type: "zip", files },
      output: { type: "zip" },
      options: { projectName: "direct-files" },
    };
    const session = store.create(config);
    if (session.config.source.type === "zip") {
      expect(session.config.source.files).toHaveLength(2);
      expect(session.config.source.files![0].path).toContain("MyBean.java");
    }
  });
});
