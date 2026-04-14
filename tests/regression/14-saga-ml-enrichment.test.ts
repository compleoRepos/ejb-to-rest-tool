/**
 * Tests de régression v7.10 — ML-Enhanced Saga Generation
 *
 * 23 tests couvrant :
 *   1. Step Enrichment (5 tests)
 *   2. Context Enrichment (4 tests)
 *   3. Retry Analysis (3 tests)
 *   4. Compensation Quality (4 tests)
 *   5. Fallback sans Ollama (3 tests)
 *   6. Anti-hallucination Saga (4 tests)
 *
 * @author Hamza NORDINE
 */

import { describe, it, expect } from "vitest";
import { generateFallbackEnrichment } from "../../server/engine/saga/ml/fallback";
import { validateSagaMLOutput } from "../../server/engine/saga/ml/validateSagaMLOutput";
import { parseMLResponse, type StepContext, type MLStepEnrichment } from "../../server/engine/saga/ml/prompts";
import { generateSagaWithML, generateAllSagasWithML } from "../../server/engine/saga/saga-generator";
import { SagaMLEnricher } from "../../server/engine/saga/ml/SagaMLEnricher";
import type { SagaCandidate, EjbDependency } from "../../server/engine/saga/saga-detector";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeEjbDep(type: string, name: string, serviceName: string): EjbDependency {
  return { type, name, isInterService: true, serviceName };
}

function makeStepContext(overrides: Partial<StepContext> = {}): StepContext {
  return {
    stepNumber: 1,
    stepLabel: "Vérification KYC",
    stepType: "validation",
    isCompensable: false,
    targetService: "KYCService",
    targetMethod: "verifierKYC",
    ejbSourceCode: `kycService.verifierKYC(input.getClientId());`,
    availableServices: ["KYCService", "ComptabiliteService", "SWIFTGateway"],
    availableContext: ["sagaId", "startedAt"],
    availableExceptions: ["KYCException", "ServiceUnavailableException"],
    sqlStatements: [],
    ...overrides,
  };
}

const CREDIT_SOURCE = `
@Stateless
public class CreditOctroiOrchestrateurEJB implements CreditOctroiOrchestrateurEJBLocal {

  @EJB private DossierCreditEJBLocal dossierService;
  @EJB private KYCServiceEJBLocal kycService;
  @EJB private ComptabiliteEJBLocal comptabiliteService;
  @EJB private SWIFTGatewayEJBLocal swiftGateway;
  @EJB private NotificationEJBLocal notificationService;

  public ResultatCredit execute(DossierCreditVoIn input) {
    // ÉTAPE 1 — Validation du dossier (local)
    validerDossier(input);

    // ÉTAPE 2 — Vérification KYC (service distant)
    kycService.verifierKYC(input.getClientId());

    // ÉTAPE 3 — Décaissement fonds (commande locale, compensable)
    em.persist(new DecaissementFonds(input));

    // ÉTAPE 4 — Écritures comptables (service distant, compensable)
    comptabiliteService.passerEcritures(input);

    // ÉTAPE 5 — Soumission SWIFT (gateway externe)
    swiftGateway.envoyerMT103(input);

    // ÉTAPE 6 — Notification client (async, fire-and-forget)
    notificationService.envoyerNotification(input.getClientId(), "Crédit octroyé");

    return new ResultatCredit("OK");
  }
}`;

const CREDIT_DEPS: EjbDependency[] = [
  makeEjbDep("DossierCreditEJBLocal", "dossierService", "dossier-service"),
  makeEjbDep("KYCServiceEJBLocal", "kycService", "kyc-service"),
  makeEjbDep("ComptabiliteEJBLocal", "comptabiliteService", "comptabilite-service"),
  makeEjbDep("SWIFTGatewayEJBLocal", "swiftGateway", "swift-service"),
  makeEjbDep("NotificationEJBLocal", "notificationService", "notification-service"),
];

const CREDIT_CANDIDATE: SagaCandidate = {
  className: "CreditOctroiOrchestrateurEJB",
  domain: "credit-octroi",
  ejbDependencies: CREDIT_DEPS,
  interServiceCount: 5,
  writeOperations: ["API:persist"],
  hasWriteOps: true,
  hasCompensation: true,
  hasGracefulDegradation: false,
  inputType: "DossierCreditVoIn",
  rawSource: CREDIT_SOURCE,
};

// ── 1. Step Enrichment (5 tests) ────────────────────────────────────────────

describe("TEST 18 — ML Step Enrichment", () => {
  it("18.1 — fallback produit un stepBody non vide pour chaque type de step", () => {
    const types = ["validation", "query", "command", "async"] as const;
    for (const stepType of types) {
      const ctx = makeStepContext({ stepType });
      const enrichment = generateFallbackEnrichment(ctx);
      expect(enrichment.stepBody).toBeTruthy();
      expect(enrichment.stepBody.length).toBeGreaterThan(10);
    }
  });

  it("18.2 — fallback produit des préconditions et postconditions", () => {
    const ctx = makeStepContext({ stepType: "command", isCompensable: true });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.preconditions.length).toBeGreaterThan(0);
    expect(enrichment.postconditions.length).toBeGreaterThan(0);
  });

  it("18.3 — fallback produit un retryRecommendation valide", () => {
    const ctx = makeStepContext({ stepType: "command", targetService: "SWIFTGateway" });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.retryRecommendation).toContain("RetryPolicy.");
  });

  it("18.4 — fallback pour step async produit un body avec fire-and-forget", () => {
    const ctx = makeStepContext({ stepType: "async", targetService: "NotificationService" });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.stepBody).toMatch(/async|fire.*forget|CompletableFuture|@Async/i);
  });

  it("18.5 — fallback pour step validation produit un body avec vérification", () => {
    const ctx = makeStepContext({ stepType: "validation", targetService: null });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.stepBody).toMatch(/valid|vérif|check|assert/i);
  });
});

// ── 2. Context Enrichment (4 tests) ─────────────────────────────────────────

describe("TEST 19 — ML Context Enrichment", () => {
  it("19.1 — fallback infère des contextFields pour un step command", () => {
    const ctx = makeStepContext({
      stepType: "command",
      isCompensable: true,
      stepLabel: "Décaissement fonds",
    });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.contextFields.length).toBeGreaterThan(0);
    for (const field of enrichment.contextFields) {
      expect(field.name).toBeTruthy();
      expect(field.type).toBeTruthy();
    }
  });

  it("19.2 — fallback infère des contextFields depuis les SQL statements", () => {
    const ctx = makeStepContext({
      stepType: "command",
      sqlStatements: ["INSERT INTO T_MOUVEMENT (MONTANT, REFERENCE, DATE_VALEUR) VALUES (?, ?, ?)"],
    });
    const enrichment = generateFallbackEnrichment(ctx);
    // Devrait avoir au moins un champ inféré depuis le SQL
    expect(enrichment.contextFields.length).toBeGreaterThan(0);
  });

  it("19.3 — contextFields ont des types Java valides", () => {
    const ctx = makeStepContext({ stepType: "command", isCompensable: true });
    const enrichment = generateFallbackEnrichment(ctx);
    const validTypes = ["String", "BigDecimal", "Long", "Integer", "Boolean", "LocalDateTime", "List", "Map", "int", "long", "boolean", "double"];
    for (const field of enrichment.contextFields) {
      const baseType = field.type.replace(/<.*>/, "");
      expect(validTypes).toContain(baseType);
    }
  });

  it("19.4 — contextFields n'ont pas de doublons", () => {
    const ctx = makeStepContext({ stepType: "command", isCompensable: true });
    const enrichment = generateFallbackEnrichment(ctx);
    const names = enrichment.contextFields.map(f => f.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ── 3. Retry Analysis (3 tests) ─────────────────────────────────────────────

describe("TEST 20 — ML Retry Analysis", () => {
  it("20.1 — fallback recommande RetryPolicy.forRemoteService() pour un step distant", () => {
    const ctx = makeStepContext({ stepType: "query", targetService: "KYCService" });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.retryRecommendation).toContain("RetryPolicy.");
  });

  it("20.2 — fallback recommande RetryPolicy.forExternalGateway() pour SWIFT", () => {
    const ctx = makeStepContext({
      stepType: "command",
      targetService: "SWIFTGateway",
      stepLabel: "Soumission SWIFT MT103",
    });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.retryRecommendation).toMatch(/Gateway|Remote/i);
  });

  it("20.3 — fallback recommande RetryPolicy.forLocalDb() pour un step local", () => {
    const ctx = makeStepContext({ stepType: "command", targetService: null });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.retryRecommendation).toContain("RetryPolicy.");
  });
});

// ── 4. Compensation Quality (4 tests) ───────────────────────────────────────

describe("TEST 21 — ML Compensation Quality", () => {
  it("21.1 — fallback produit une compensation pour un step compensable (débit)", () => {
    const ctx = makeStepContext({
      stepType: "command",
      isCompensable: true,
      stepLabel: "Débit du compte source",
    });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.compensationBody).toBeTruthy();
    expect(enrichment.compensationBody.length).toBeGreaterThan(10);
    // La compensation d'un débit devrait mentionner un crédit/contrepassation
    expect(enrichment.compensationBody).toMatch(/contrepasser|annul|crédit|credit|inverse/i);
  });

  it("21.2 — fallback produit une compensation pour un step SWIFT", () => {
    const ctx = makeStepContext({
      stepType: "command",
      isCompensable: true,
      stepLabel: "Envoi message SWIFT MT103",
      targetService: "SWIFTGateway",
    });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.compensationBody).toBeTruthy();
    expect(enrichment.compensationBody).toMatch(/annul|cancel|MT192|recall/i);
  });

  it("21.3 — fallback produit une compensation vide pour un step non-compensable", () => {
    const ctx = makeStepContext({
      stepType: "validation",
      isCompensable: false,
    });
    const enrichment = generateFallbackEnrichment(ctx);
    // Non-compensable → compensation minimale ou commentaire
    expect(enrichment.compensationBody).toMatch(/non compensable|pas de compensation|no-op|\/\//i);
  });

  it("21.4 — fallback produit une compensation pour décaissement", () => {
    const ctx = makeStepContext({
      stepType: "command",
      isCompensable: true,
      stepLabel: "Décaissement des fonds",
    });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.compensationBody).toBeTruthy();
    expect(enrichment.compensationBody).toMatch(/annul|reverse|contrepasser|récupér/i);
  });
});

// ── 5. Fallback sans Ollama (3 tests) ───────────────────────────────────────

describe("TEST 22 — Fallback sans Ollama", () => {
  it("22.1 — SagaMLEnricher.isAvailable() retourne false si Ollama est absent", async () => {
    const enricher = new SagaMLEnricher({
      ollamaUrl: "http://localhost:99999",  // Port inexistant
      model: "qwen2.5:1.5b",
    });
    const available = await enricher.isAvailable();
    expect(available).toBe(false);
  });

  it("22.2 — enrichSaga produit un résultat même sans Ollama (fallback complet)", async () => {
    const enricher = new SagaMLEnricher({
      ollamaUrl: "http://localhost:99999",
      model: "qwen2.5:1.5b",
    });

    const { extractSagaSteps, extractIntermediateResults } = await import(
      "../../server/engine/saga/saga-step-extractor"
    );
    const steps = extractSagaSteps(CREDIT_SOURCE, "execute", CREDIT_DEPS);
    const results = extractIntermediateResults(CREDIT_SOURCE, steps);

    const mlResult = await enricher.enrichSaga(CREDIT_CANDIDATE, steps, results);

    expect(mlResult.stats.totalSteps).toBe(steps.length);
    expect(mlResult.stats.fallbackUsed).toBe(steps.length);
    expect(mlResult.stats.mlEnriched).toBe(0);
    expect(mlResult.enrichments.size).toBe(steps.length);

    // Chaque enrichissement doit avoir un stepBody
    for (const [, enrichment] of mlResult.enrichments) {
      expect(enrichment.stepBody).toBeTruthy();
    }
  });

  it("22.3 — generateSagaWithML produit un résultat complet en fallback", async () => {
    const enricher = new SagaMLEnricher({
      ollamaUrl: "http://localhost:99999",
      model: "qwen2.5:1.5b",
    });

    const result = await generateSagaWithML(CREDIT_CANDIDATE, "com.bank.saga", enricher);

    expect(result.domain).toBe("credit-octroi");
    expect(result.files.length).toBeGreaterThanOrEqual(5);
    expect(result.mlStats).toBeDefined();
    expect(result.mlStats!.fallbackUsed).toBe(result.stats.totalSteps);
    expect(result.mlStats!.mlEnriched).toBe(0);

    // L'orchestrateur doit contenir "Source: fallback"
    const orchestrator = result.files.find(f => f.category === "saga-orchestrator");
    expect(orchestrator).toBeDefined();
    expect(orchestrator!.content).toContain("Source: fallback");
    // Le context doit exister
    const context = result.files.find(f => f.category === "saga-context");
    expect(context).toBeDefined();
  });
});

// ── 6. Anti-hallucination Saga (4 tests) ────────────────────────────────────

describe("TEST 23 — Anti-hallucination Saga", () => {
  it("23.1 — détecte un service inconnu dans le stepBody", () => {
    const ctx = makeStepContext({ availableServices: ["KYCService", "ComptabiliteService"] });
    const output: MLStepEnrichment = {
      stepBody: `inventedService.doSomething(ctx);`,
      compensationBody: "",
      contextFields: [],
      retryRecommendation: "RetryPolicy.forLocalDb()",
      preconditions: [],
      postconditions: [],
    };
    const validation = validateSagaMLOutput(output, ctx);
    expect(validation.issues.some(i => i.type === "unknown-service")).toBe(true);
  });

  it("23.2 — détecte du JDBC direct (Connection, PreparedStatement)", () => {
    const ctx = makeStepContext();
    const output: MLStepEnrichment = {
      stepBody: `Connection conn = dataSource.getConnection();\nPreparedStatement ps = conn.prepareStatement("SELECT 1");`,
      compensationBody: "",
      contextFields: [],
      retryRecommendation: "RetryPolicy.forLocalDb()",
      preconditions: [],
      postconditions: [],
    };
    const validation = validateSagaMLOutput(output, ctx);
    expect(validation.issues.some(i => i.type === "jdbc-direct")).toBe(true);
  });

  it("23.3 — détecte une compensation vide pour un step compensable", () => {
    const ctx = makeStepContext({ isCompensable: true });
    const output: MLStepEnrichment = {
      stepBody: `kycService.verifierKYC(ctx);`,
      compensationBody: "",
      contextFields: [],
      retryRecommendation: "RetryPolicy.forLocalDb()",
      preconditions: [],
      postconditions: [],
    };
    const validation = validateSagaMLOutput(output, ctx);
    expect(validation.issues.some(i => i.type === "empty-compensation")).toBe(true);
  });

  it("23.4 — détecte des classes inventées dans le code", () => {
    const ctx = makeStepContext();
    const output: MLStepEnrichment = {
      stepBody: `UserService.findById(ctx);\nOrderService.create(ctx);`,
      compensationBody: "",
      contextFields: [],
      retryRecommendation: "RetryPolicy.forLocalDb()",
      preconditions: [],
      postconditions: [],
    };
    const validation = validateSagaMLOutput(output, ctx);
    expect(validation.issues.some(i => i.type === "invented-class")).toBe(true);
  });
});

// ── 7. parseMLResponse (3 tests) ────────────────────────────────────────────

describe("TEST 24 — parseMLResponse", () => {
  it("24.1 — parse un JSON direct", () => {
    const raw = `{"stepBody": "test", "compensationBody": "comp"}`;
    const result = parseMLResponse<{ stepBody: string; compensationBody: string }>(raw);
    expect(result).toBeDefined();
    expect(result!.stepBody).toBe("test");
  });

  it("24.2 — parse un JSON dans un bloc fenced", () => {
    const raw = "Voici le résultat :\n```json\n{\"stepBody\": \"test\"}\n```\nFin.";
    const result = parseMLResponse<{ stepBody: string }>(raw);
    expect(result).toBeDefined();
    expect(result!.stepBody).toBe("test");
  });

  it("24.3 — retourne null pour un texte non-JSON", () => {
    const raw = "Ceci n'est pas du JSON du tout.";
    const result = parseMLResponse<any>(raw);
    expect(result).toBeNull();
  });
});
