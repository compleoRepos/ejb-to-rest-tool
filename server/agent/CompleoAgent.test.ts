/**
 * Tests pour CompleoAgent — orchestrateur agent autonome.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { CompleoAgent, AgentSessionStore, type AgentConfig, type AgentEvent } from "./CompleoAgent";
import { CompleoEngine, getEngine } from "../engine/CompleoEngine";
import * as fs from "fs";
import * as path from "path";

// ─── Helper: collect all events from an async generator ─────────────────────

async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

// ─── Helper: read source files from a test project ──────────────────────────

function readSourceFiles(dirPath: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "target") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".java", ".xml", ".jsp", ".properties", ".yml", ".yaml"].includes(ext)) {
          try {
            const content = fs.readFileSync(full, "utf-8");
            const relativePath = path.relative(dirPath, full);
            files.push({ path: relativePath, content });
          } catch {
            // Skip
          }
        }
      }
    }
  };
  walk(dirPath);
  return files;
}

describe("CompleoAgent", () => {
  let engine: CompleoEngine;
  let store: AgentSessionStore;
  let agent: CompleoAgent;

  beforeAll(() => {
    engine = getEngine();
    store = new AgentSessionStore();
    agent = new CompleoAgent(engine, store);
  });

  describe("AgentSessionStore", () => {
    it("crée et récupère une session", () => {
      const config: AgentConfig = {
        source: { type: "zip", path: "/tmp/test" },
        output: { type: "zip" },
        options: { projectName: "test" },
      };
      const session = store.create(config);
      expect(session.id).toMatch(/^agent-/);
      expect(session.state).toBe("IDLE");
      expect(store.get(session.id)).toBeDefined();
    });

    it("met à jour une session", () => {
      const config: AgentConfig = {
        source: { type: "zip", path: "/tmp/test" },
        output: { type: "zip" },
        options: {},
      };
      const session = store.create(config);
      store.update(session.id, { state: "RUNNING", currentPhase: "ANALYZING" });
      const updated = store.get(session.id);
      expect(updated?.state).toBe("RUNNING");
      expect(updated?.currentPhase).toBe("ANALYZING");
    });

    it("liste les sessions triées par date", () => {
      const sessions = store.list();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      // Most recent first
      expect(sessions[0].createdAt).toBeGreaterThanOrEqual(sessions[1].createdAt);
    });

    it("ajoute des événements", () => {
      const config: AgentConfig = {
        source: { type: "zip", path: "/tmp/test" },
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
      expect(store.get(session.id)?.events.length).toBe(1);
    });
  });

  describe("Agent pipeline — ZIP source", () => {
    const testProjectPath = "/home/ubuntu/test-projects/projet-02-virement";

    it("exécute le pipeline complet avec auto-resolve", async () => {
      if (!fs.existsSync(testProjectPath)) return;

      const files = readSourceFiles(testProjectPath);
      const config: AgentConfig = {
        source: { type: "zip", path: testProjectPath, files },
        output: { type: "zip" },
        options: {
          autoResolveAmbiguities: true,
          maxCompilationAttempts: 3,
          projectName: "virement-test",
        },
      };

      const events = await collectEvents(agent.run(config));

      // Verify event sequence
      const phaseStarts = events.filter((e) => e.type === "PHASE_START");
      const phaseEnds = events.filter((e) => e.type === "PHASE_END");
      const successEvents = events.filter((e) => e.type === "SUCCESS");

      expect(phaseStarts.length).toBeGreaterThanOrEqual(4); // CLONING, ANALYZING, GENERATING, COMPILING
      expect(phaseEnds.length).toBeGreaterThanOrEqual(4);
      expect(successEvents.length).toBe(1);

      // Verify phases in order
      const phases = phaseStarts.map((e) => e.phase);
      expect(phases).toContain("CLONING");
      expect(phases).toContain("ANALYZING");
      expect(phases).toContain("GENERATING");
      expect(phases).toContain("COMPILING");

      // Verify the success event has data
      const success = successEvents[0];
      expect(success.data?.sessionId).toBeDefined();
      expect(success.data?.useCaseCount).toBeGreaterThan(0);
      expect(success.data?.fileCount).toBeGreaterThan(0);
    }, 30000);

    it("émet des événements LOG avec les bons niveaux", async () => {
      if (!fs.existsSync(testProjectPath)) return;

      const files = readSourceFiles(testProjectPath);
      const config: AgentConfig = {
        source: { type: "zip", path: testProjectPath, files },
        output: { type: "zip" },
        options: {
          autoResolveAmbiguities: true,
          projectName: "virement-logs",
        },
      };

      const events = await collectEvents(agent.run(config));
      const logs = events.filter((e) => e.type === "LOG");

      expect(logs.length).toBeGreaterThan(0);
      // At least one success log
      expect(logs.some((e) => e.level === "success")).toBe(true);
      // All logs have a message
      expect(logs.every((e) => typeof e.message === "string")).toBe(true);
    }, 30000);
  });

  describe("Agent cancellation", () => {
    it("annule une session en cours", () => {
      const config: AgentConfig = {
        source: { type: "zip", path: "/tmp/test" },
        output: { type: "zip" },
        options: {},
      };
      const session = store.create(config);
      store.update(session.id, { state: "RUNNING" });

      const cancelled = agent.cancel(session.id);
      expect(cancelled).toBe(true);
      expect(store.get(session.id)?.state).toBe("CANCELLED");
    });

    it("refuse d'annuler une session terminée", () => {
      const config: AgentConfig = {
        source: { type: "zip", path: "/tmp/test" },
        output: { type: "zip" },
        options: {},
      };
      const session = store.create(config);
      store.update(session.id, { state: "COMPLETED" });

      const cancelled = agent.cancel(session.id);
      expect(cancelled).toBe(false);
    });
  });

  describe("Agent status", () => {
    it("retourne le statut d'une session", () => {
      const config: AgentConfig = {
        source: { type: "zip", path: "/tmp/test" },
        output: { type: "zip" },
        options: { projectName: "status-test" },
      };
      const session = store.create(config);
      store.update(session.id, { state: "RUNNING", currentPhase: "ANALYZING" });

      const status = agent.getStatus(session.id);
      expect(status).toBeDefined();
      expect(status?.state).toBe("RUNNING");
      expect(status?.phase).toBe("ANALYZING");
    });

    it("retourne null pour une session inexistante", () => {
      const status = agent.getStatus("nonexistent");
      expect(status).toBeNull();
    });
  });
});
