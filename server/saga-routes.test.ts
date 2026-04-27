/**
 * Tests pour l'endpoint Saga (/api/agent/:id/sagas) — v7.9.
 *
 * Vérifie :
 * - Réponse quand aucune saga n'est détectée
 * - Réponse avec sagaResult stocké
 * - Extraction des détails depuis les événements SSE
 * - Session introuvable
 *
 * @author Compleo
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AgentSessionStore, type AgentConfig } from "./agent/CompleoAgent";

// ─── Helper ─────────────────────────────────────────────────────────────────

function createTestSession(store: AgentSessionStore) {
  const config: AgentConfig = {
    source: { type: "zip", path: "/tmp/test.zip" },
    output: { type: "zip" },
    options: { projectName: "test-saga" },
  };
  return store.create(config);
}

// ─── Saga endpoint logic tests ──────────────────────────────────────────────

describe("Saga Routes — sagaResult storage", () => {
  let store: AgentSessionStore;

  beforeEach(() => {
    store = new AgentSessionStore();
  });

  it("session sans sagaResult retourne detected: false", () => {
    const session = createTestSession(store);
    store.update(session.id, { state: "COMPLETED", currentPhase: "DONE" });

    const retrieved = store.get(session.id)!;
    expect(retrieved.sagaResult).toBeUndefined();

    // Simulate endpoint logic
    const response = retrieved.sagaResult
      ? { detected: true, candidates: retrieved.sagaResult.candidates }
      : { detected: false, candidates: [], filesGenerated: 0, report: null, details: [] };

    expect(response.detected).toBe(false);
    expect(response.candidates).toEqual([]);
  });

  it("session avec sagaResult retourne detected: true avec les candidats", () => {
    const session = createTestSession(store);
    const sagaResult = {
      candidates: [
        { className: "VirementSEPABean", domain: "virement-sepa", stepsCount: 7, compensableCount: 4 },
        { className: "CreditConsommationBean", domain: "credit-consommation", stepsCount: 5, compensableCount: 3 },
      ],
      filesGenerated: 10,
      report: "# Saga Report\n\n## Résumé\n- 2 sagas détectées",
    };

    store.update(session.id, {
      state: "COMPLETED",
      currentPhase: "DONE",
      sagaResult,
    });

    const retrieved = store.get(session.id)!;
    expect(retrieved.sagaResult).toBeDefined();
    expect(retrieved.sagaResult!.candidates).toHaveLength(2);
    expect(retrieved.sagaResult!.candidates[0].className).toBe("VirementSEPABean");
    expect(retrieved.sagaResult!.candidates[0].domain).toBe("virement-sepa");
    expect(retrieved.sagaResult!.candidates[0].stepsCount).toBe(7);
    expect(retrieved.sagaResult!.candidates[0].compensableCount).toBe(4);
    expect(retrieved.sagaResult!.filesGenerated).toBe(10);
    expect(retrieved.sagaResult!.report).toContain("Saga Report");
  });

  it("session introuvable retourne undefined", () => {
    expect(store.get("nonexistent-session")).toBeUndefined();
  });
});

// ─── Saga event extraction tests ────────────────────────────────────────────

describe("Saga Routes — Event extraction for details", () => {
  let store: AgentSessionStore;

  beforeEach(() => {
    store = new AgentSessionStore();
  });

  it("extrait les détails des steps depuis les événements MICROSERVICES", () => {
    const session = createTestSession(store);

    // Simulate saga events as they would be emitted by the agent
    store.addEvent(session.id, {
      type: "LOG",
      timestamp: Date.now(),
      level: "success",
      message: "Saga virement-sepa: 7 steps, 4 compensables",
      phase: "MICROSERVICES",
      data: {
        domain: "virement-sepa",
        sourceClass: "VirementSEPABean",
        steps: [
          { order: 1, name: "chargement-compte", type: "SERVICE_CALL", compensable: false },
          { order: 2, name: "controle-sanctions", type: "VALIDATION", compensable: false },
          { order: 3, name: "debit-compte", type: "DB_WRITE", compensable: true },
          { order: 4, name: "transformation-pain001", type: "TRANSFORMATION", compensable: false },
          { order: 5, name: "signature-xades", type: "EXTERNAL_CALL", compensable: false },
          { order: 6, name: "enregistrement-transaction", type: "DB_WRITE", compensable: true },
          { order: 7, name: "envoi-canal-routage", type: "EXTERNAL_CALL", compensable: true },
        ],
      },
    });

    store.addEvent(session.id, {
      type: "LOG",
      timestamp: Date.now(),
      level: "info",
      message: "Saga terminée",
      phase: "MICROSERVICES",
      // No data.domain → should be filtered out
    });

    const retrieved = store.get(session.id)!;

    // Simulate endpoint extraction logic
    const sagaEvents = retrieved.events.filter(
      (e) =>
        e.type === "LOG" &&
        e.phase === "MICROSERVICES" &&
        (e.data as any)?.domain,
    );

    expect(sagaEvents).toHaveLength(1);

    const details = sagaEvents.map((e) => {
      const data = e.data as any;
      return {
        domain: data.domain,
        sourceClass: data.sourceClass,
        steps: data.steps || [],
      };
    });

    expect(details).toHaveLength(1);
    expect(details[0].domain).toBe("virement-sepa");
    expect(details[0].sourceClass).toBe("VirementSEPABean");
    expect(details[0].steps).toHaveLength(7);
    expect(details[0].steps[0].name).toBe("chargement-compte");
    expect(details[0].steps[0].type).toBe("SERVICE_CALL");
    expect(details[0].steps[2].compensable).toBe(true);
    expect(details[0].steps[2].name).toBe("debit-compte");
  });

  it("retourne un tableau vide quand aucun événement saga n'est présent", () => {
    const session = createTestSession(store);

    store.addEvent(session.id, {
      type: "LOG",
      timestamp: Date.now(),
      level: "info",
      message: "Analyse terminée",
      phase: "ANALYZING",
    });

    const retrieved = store.get(session.id)!;
    const sagaEvents = retrieved.events.filter(
      (e) =>
        e.type === "LOG" &&
        e.phase === "MICROSERVICES" &&
        (e.data as any)?.domain,
    );

    expect(sagaEvents).toHaveLength(0);
  });

  it("extrait les détails de plusieurs sagas", () => {
    const session = createTestSession(store);

    // Saga 1
    store.addEvent(session.id, {
      type: "LOG",
      timestamp: Date.now(),
      level: "success",
      message: "Saga virement-sepa",
      phase: "MICROSERVICES",
      data: {
        domain: "virement-sepa",
        sourceClass: "VirementSEPABean",
        steps: [
          { order: 1, name: "step-1", type: "SERVICE_CALL", compensable: false },
          { order: 2, name: "step-2", type: "DB_WRITE", compensable: true },
        ],
      },
    });

    // Saga 2
    store.addEvent(session.id, {
      type: "LOG",
      timestamp: Date.now(),
      level: "success",
      message: "Saga credit-consommation",
      phase: "MICROSERVICES",
      data: {
        domain: "credit-consommation",
        sourceClass: "CreditConsommationBean",
        steps: [
          { order: 1, name: "scoring", type: "SERVICE_CALL", compensable: false },
          { order: 2, name: "decaissement", type: "DB_WRITE", compensable: true },
          { order: 3, name: "garantie", type: "DB_WRITE", compensable: true },
        ],
      },
    });

    const retrieved = store.get(session.id)!;
    const sagaEvents = retrieved.events.filter(
      (e) =>
        e.type === "LOG" &&
        e.phase === "MICROSERVICES" &&
        (e.data as any)?.domain,
    );

    expect(sagaEvents).toHaveLength(2);

    const details = sagaEvents.map((e) => {
      const data = e.data as any;
      return {
        domain: data.domain,
        sourceClass: data.sourceClass,
        steps: data.steps || [],
      };
    });

    expect(details[0].domain).toBe("virement-sepa");
    expect(details[0].steps).toHaveLength(2);
    expect(details[1].domain).toBe("credit-consommation");
    expect(details[1].steps).toHaveLength(3);
    expect(details[1].steps[1].name).toBe("decaissement");
    expect(details[1].steps[1].compensable).toBe(true);
  });
});

// ─── Saga candidate stats tests ─────────────────────────────────────────────

describe("Saga Routes — Candidate statistics", () => {
  it("calcule correctement les totaux des steps et compensables", () => {
    const candidates = [
      { className: "VirementSEPABean", domain: "virement-sepa", stepsCount: 7, compensableCount: 4 },
      { className: "CreditBean", domain: "credit", stepsCount: 5, compensableCount: 3 },
      { className: "ClientBean", domain: "client", stepsCount: 3, compensableCount: 1 },
    ];

    const totalSteps = candidates.reduce((sum, c) => sum + c.stepsCount, 0);
    const totalCompensable = candidates.reduce((sum, c) => sum + c.compensableCount, 0);

    expect(totalSteps).toBe(15);
    expect(totalCompensable).toBe(8);
  });
});
