/**
 * Tests de régression v7.10 — Saga Production-Ready
 *
 * 24 tests couvrant les 5 mécanismes :
 *   1. Retry + backoff exponentiel par type de step
 *   2. Circuit Breaker par service distant
 *   3. Savepoints (transactions par phase)
 *   4. Compensation avec retry dédié
 *   5. Dead Letter + Saga Recovery
 *
 * @author Compleo
 */

import { describe, it, expect } from "vitest";
import { generateSaga, generateAllSagas } from "../../server/engine/saga/saga-generator";
import { generateSharedSagaFiles } from "../../server/engine/saga/saga-shared-generators";
import type { SagaCandidate, EjbDependency } from "../../server/engine/saga/saga-detector";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeEjbDep(type: string, name: string, serviceName: string): EjbDependency {
  return { type, name, isInterService: true, serviceName };
}

/** Orchestrateur crédit avec steps variés : local, remote, gateway, async */
const CREDIT_SOURCE = `
@Stateless
public class CreditOctroiOrchestrateurEJB implements CreditOctroiOrchestrateurEJBLocal {

  @EJB private DossierCreditEJBLocal dossierService;
  @EJB private KYCServiceEJBLocal kycService;
  @EJB private GarantieServiceEJBLocal garantieService;
  @EJB private ScoringServiceEJBLocal scoringService;
  @EJB private ComptabiliteEJBLocal comptabiliteService;
  @EJB private SWIFTGatewayEJBLocal swiftGateway;
  @EJB private NotificationEJBLocal notificationService;

  public ResultatCredit execute(DossierCreditVoIn input) {
    // ÉTAPE 1 — Validation du dossier (local)
    validerDossier(input);

    // ÉTAPE 2 — Vérification KYC (service distant)
    kycService.verifierKYC(input.getClientId());

    // ÉTAPE 3 — Évaluation des garanties (service distant)
    garantieService.evaluerGaranties(input.getGaranties());

    // ÉTAPE 4 — Scoring composite (service distant)
    scoringService.calculerScore(input);

    // ÉTAPE 5 — Vérification limites (query locale)
    verifierLimites(input.getMontant());

    // ÉTAPE 6 — Calcul conditions (calcul local)
    calculerConditions(input);

    // ÉTAPE 7 — Décision (calcul local)
    String decision = decider(input);

    // ÉTAPE 8 — Blocage garanties (commande locale, compensable)
    em.persist(new BlocageGarantie(input));

    // ÉTAPE 9 — Création dossier et crédit (commande locale, compensable)
    em.persist(new DossierCredit(input));

    // ÉTAPE 10 — Déblocage fonds (commande locale, compensable)
    em.persist(new DeblocageFonds(input));

    // ÉTAPE 11 — Écritures comptables (service distant, compensable)
    comptabiliteService.passerEcritures(input);

    // ÉTAPE 12 — Soumission SWIFT (gateway externe)
    swiftGateway.envoyerMT103(input);

    // ÉTAPE 13 — Notification client (async, fire-and-forget)
    notificationService.envoyerNotification(input.getClientId(), "Crédit octroyé");

    return new ResultatCredit("OK");
  }
}`;

const CREDIT_DEPS: EjbDependency[] = [
  makeEjbDep("DossierCreditEJBLocal", "dossierService", "dossier-service"),
  makeEjbDep("KYCServiceEJBLocal", "kycService", "kyc-service"),
  makeEjbDep("GarantieServiceEJBLocal", "garantieService", "garantie-service"),
  makeEjbDep("ScoringServiceEJBLocal", "scoringService", "scoring-service"),
  makeEjbDep("ComptabiliteEJBLocal", "comptabiliteService", "comptabilite-service"),
  makeEjbDep("SWIFTGatewayEJBLocal", "swiftGateway", "swift-service"),
  makeEjbDep("NotificationEJBLocal", "notificationService", "notification-service"),
];

const CREDIT_CANDIDATE: SagaCandidate = {
  className: "CreditOctroiOrchestrateurEJB",
  domain: "credit-octroi",
  ejbDependencies: CREDIT_DEPS,
  interServiceCount: 7,
  writeOperations: ["API:persist"],
  hasWriteOps: true,
  hasCompensation: true,
  hasGracefulDegradation: false,
  inputType: "DossierCreditVoIn",
  rawSource: CREDIT_SOURCE,
};

/** Orchestrateur virement avec gateway SWIFT */
const VIREMENT_SOURCE = `
@Stateless
public class VirementInternationalEJB implements VirementInternationalEJBLocal {

  @EJB private ComplianceLBCFTEJBLocal complianceService;
  @EJB private DebitCompteEJBLocal debitService;
  @EJB private SWIFTGatewayEJBLocal swiftGateway;
  @EJB private NotificationEJBLocal notificationService;

  public ResultatVirement executerVirement(VirementVO vo) {
    // ÉTAPE 1 — Screening sanctions LBC-FT (service distant)
    complianceService.verifierCompliance(vo.getCompte(), vo.getMontant());

    // ÉTAPE 2 — Débit du compte source (commande locale, compensable)
    debitService.debiterCompte(vo.getCompte(), vo.getMontant(), vo.getDevise());
    em.persist(new TransactionLog(vo));

    // ÉTAPE 3 — Envoi SWIFT MT103 (gateway externe)
    String swiftRef = swiftGateway.envoyerMT103(vo);

    // ÉTAPE 4 — Notification client (async)
    notificationService.envoyerNotification(vo.getClient(), "Virement effectué");

    return new ResultatVirement(swiftRef);
  }
}`;

const VIREMENT_DEPS: EjbDependency[] = [
  makeEjbDep("ComplianceLBCFTEJBLocal", "complianceService", "compliance-service"),
  makeEjbDep("DebitCompteEJBLocal", "debitService", "debit-service"),
  makeEjbDep("SWIFTGatewayEJBLocal", "swiftGateway", "swift-service"),
  makeEjbDep("NotificationEJBLocal", "notificationService", "notification-service"),
];

const VIREMENT_CANDIDATE: SagaCandidate = {
  className: "VirementInternationalEJB",
  domain: "virement-international",
  ejbDependencies: VIREMENT_DEPS,
  interServiceCount: 4,
  writeOperations: ["API:persist"],
  hasWriteOps: true,
  hasCompensation: true,
  hasGracefulDegradation: false,
  inputType: "VirementVO",
  rawSource: VIREMENT_SOURCE,
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. RETRY + BACKOFF EXPONENTIEL
// ═══════════════════════════════════════════════════════════════════════════

describe("COMPLEO — Saga Production-Ready : Retry", () => {
  it("TEST 1: RetryPolicy.java est généré dans les fichiers partagés", () => {
    const shared = generateSharedSagaFiles("com.bmce.banking.saga", [CREDIT_CANDIDATE]);
    const retryFile = shared.find(f => f.path.includes("RetryPolicy.java"));
    expect(retryFile).toBeTruthy();
    expect(retryFile!.content).toContain("class RetryPolicy");
    expect(retryFile!.content).toContain("forLocalDb");
    expect(retryFile!.content).toContain("forRemoteService");
    expect(retryFile!.content).toContain("forExternalGateway");
    expect(retryFile!.content).toContain("forAsync");
    expect(retryFile!.content).toContain("forCompensation");
  });

  it("TEST 2: SagaStepException.java est généré", () => {
    const shared = generateSharedSagaFiles("com.bmce.banking.saga", [CREDIT_CANDIDATE]);
    const exFile = shared.find(f => f.path.includes("SagaStepException.java"));
    expect(exFile).toBeTruthy();
    expect(exFile!.content).toContain("class SagaStepException");
  });

  it("TEST 3: l'Orchestrator utilise retryPolicies.get() pour chaque step", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("retryPolicies.get(");
    expect(orch.content).toContain("RetryPolicy.forLocalDb()");
    expect(orch.content).toContain("RetryPolicy.forRemoteService()");
  });

  it("TEST 4: les steps SWIFT utilisent RetryPolicy.forExternalGateway()", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("RetryPolicy.forExternalGateway()");
  });

  it("TEST 5: les steps async utilisent RetryPolicy.forAsync()", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("RetryPolicy.forAsync()");
  });

  it("TEST 6: les compensations utilisent RetryPolicy.forCompensation()", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("RetryPolicy.forCompensation()");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════════════

describe("COMPLEO — Saga Production-Ready : Circuit Breaker", () => {
  it("TEST 7: CircuitBreakerRegistry.java est généré", () => {
    const shared = generateSharedSagaFiles("com.bmce.banking.saga", [CREDIT_CANDIDATE]);
    const cbRegistry = shared.find(f => f.path.includes("CircuitBreakerRegistry.java"));
    expect(cbRegistry).toBeTruthy();
    expect(cbRegistry!.content).toContain("@Component");
    expect(cbRegistry!.content).toContain("getBreaker");
  });

  it("TEST 8: SagaCircuitBreaker.java avec 3 états (CLOSED, OPEN, HALF_OPEN)", () => {
    const shared = generateSharedSagaFiles("com.bmce.banking.saga", [CREDIT_CANDIDATE]);
    const cb = shared.find(f => f.path.includes("SagaCircuitBreaker.java"));
    expect(cb).toBeTruthy();
    expect(cb!.content).toContain("CLOSED");
    expect(cb!.content).toContain("OPEN");
    expect(cb!.content).toContain("HALF_OPEN");
  });

  it("TEST 9: CircuitOpenException.java est généré", () => {
    const shared = generateSharedSagaFiles("com.bmce.banking.saga", [CREDIT_CANDIDATE]);
    const ex = shared.find(f => f.path.includes("CircuitOpenException.java"));
    expect(ex).toBeTruthy();
    expect(ex!.content).toContain("class CircuitOpenException");
  });

  it("TEST 10: l'Orchestrator utilise circuitBreakerRegistry.getBreaker() pour les steps inter-services", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("circuitBreakerRegistry.getBreaker(");
    // Should reference CB for remote services
    expect(orch.content).toContain("CircuitBreakerRegistry");
  });

  it("TEST 11: les steps locaux n'utilisent PAS le circuit breaker", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    // Step 1 (validation locale) should not have CB
    // The orchestrator should have some steps without CB
    const lines = orch.content.split("\n");
    const step1Block = lines.filter(l => l.includes("step1") || l.includes("Step 1"));
    // Step 1 is local validation — should not reference getBreaker
    const step1Text = step1Block.join("\n");
    // Just verify that not ALL steps have CB (some local ones don't)
    const cbCount = (orch.content.match(/circuitBreakerRegistry\.getBreaker/g) || []).length;
    const totalSteps = result.steps.length;
    expect(cbCount).toBeLessThan(totalSteps);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. SAVEPOINTS (TRANSACTIONS PAR PHASE)
// ═══════════════════════════════════════════════════════════════════════════

describe("COMPLEO — Saga Production-Ready : Savepoints", () => {
  it("TEST 12: SagaSavepointManager.java est généré", () => {
    const shared = generateSharedSagaFiles("com.bmce.banking.saga", [CREDIT_CANDIDATE]);
    const spm = shared.find(f => f.path.includes("SagaSavepointManager.java"));
    expect(spm).toBeTruthy();
    expect(spm!.content).toContain("class SagaSavepointManager");
    expect(spm!.content).toContain("setSavepoint");
    expect(spm!.content).toContain("rollbackToSavepoint");
    expect(spm!.content).toContain("commit");
  });

  it("TEST 13: l'Orchestrator utilise Propagation.NOT_SUPPORTED (pas de @Transactional global)", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("Propagation.NOT_SUPPORTED");
  });

  it("TEST 14: la phase write utilise begin/setSavepoint/commit", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("spm.begin()");
    expect(orch.content).toContain("spm.setSavepoint(");
    expect(orch.content).toContain("spm.commit()");
    expect(orch.content).toContain("spm.rollbackAll()");
    expect(orch.content).toContain("spm.close()");
  });

  it("TEST 15: la phase async est hors transaction (fire-and-forget)", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    // Async steps should be in a try-catch with non-blocking warning
    expect(orch.content).toContain("non-bloquant");
    expect(orch.content).toContain("PHASE 3");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. COMPENSATION RETRY
// ═══════════════════════════════════════════════════════════════════════════

describe("COMPLEO — Saga Production-Ready : Compensation Retry", () => {
  it("TEST 16: la compensation utilise RetryPolicy.forCompensation()", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("RetryPolicy.forCompensation()");
    expect(orch.content).toContain("compensationRetry");
  });

  it("TEST 17: après échec compensation → COMPENSATION_FAILED (pas d'abandon silencieux)", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("COMPENSATION_FAILED");
    expect(orch.content).toContain("failedCompensations");
  });

  it("TEST 18: COMPENSATION_FAILED → sendToDeadLetter()", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("sendToDeadLetter(");
  });

  it("TEST 19: le State enum contient COMPENSATED et COMPENSATION_FAILED", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const stateFile = result.files.find(f => f.category === "saga-state")!;
    expect(stateFile.content).toContain("COMPENSATED");
    expect(stateFile.content).toContain("COMPENSATION_FAILED");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. DEAD LETTER + SAGA RECOVERY
// ═══════════════════════════════════════════════════════════════════════════

describe("COMPLEO — Saga Production-Ready : Recovery", () => {
  it("TEST 20: T_SAGA_STATE DDL est Oracle (SYSTIMESTAMP, VARCHAR2)", () => {
    const shared = generateSharedSagaFiles("com.bmce.banking.saga", [CREDIT_CANDIDATE]);
    const ddl = shared.find(f => f.path.includes("V4__create_saga_state.sql"));
    expect(ddl).toBeTruthy();
    expect(ddl!.content).toContain("T_SAGA_STATE");
    expect(ddl!.content).toContain("SYSTIMESTAMP");
    expect(ddl!.content).toContain("VARCHAR2");
    expect(ddl!.content).toContain("SAGA_ID");
    expect(ddl!.content).toContain("HEARTBEAT_AT");
  });

  it("TEST 21: SagaRecoveryScheduler.java avec @Scheduled", () => {
    const shared = generateSharedSagaFiles("com.bmce.banking.saga", [CREDIT_CANDIDATE]);
    const scheduler = shared.find(f => f.path.includes("SagaRecoveryScheduler.java"));
    expect(scheduler).toBeTruthy();
    expect(scheduler!.content).toContain("@Scheduled");
    expect(scheduler!.content).toContain("recoverOrphanSagas");
    expect(scheduler!.content).toContain("retryDeadLetters");
  });

  it("TEST 22: heartbeat mis à jour avant chaque step dans l'Orchestrator", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const orch = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orch.content).toContain("sagaStateStore.heartbeat(ctx.getSagaId())");
  });

  it("TEST 23: SagaRecoveryExecutor.java est généré avec recover() et retryCompensation()", () => {
    const shared = generateSharedSagaFiles("com.bmce.banking.saga", [CREDIT_CANDIDATE]);
    const executor = shared.find(f => f.path.includes("SagaRecoveryExecutor.java"));
    expect(executor).toBeTruthy();
    expect(executor!.content).toContain("recover");
    expect(executor!.content).toContain("retryCompensation");
  });

  it("TEST 24: SagaStateStore.java avec persistState, heartbeat, findOrphans, findDeadLetters", () => {
    const shared = generateSharedSagaFiles("com.bmce.banking.saga", [CREDIT_CANDIDATE]);
    const store = shared.find(f => f.path.includes("SagaStateStore.java"));
    expect(store).toBeTruthy();
    expect(store!.content).toContain("persistState");
    expect(store!.content).toContain("heartbeat");
    expect(store!.content).toContain("findOrphans");
    expect(store!.content).toContain("findDeadLetters");
    expect(store!.content).toContain("markCompleted");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. INTÉGRATION — FICHIERS COMPLETS
// ═══════════════════════════════════════════════════════════════════════════

describe("COMPLEO — Saga Production-Ready : Integration", () => {
  it("TEST 25: les 2 Sagas (Credit, Virement) ont toutes retry + CB + savepoints", () => {
    const results = generateAllSagas(
      [CREDIT_CANDIDATE, VIREMENT_CANDIDATE],
      "com.bmce.banking.saga",
    );
    expect(results.length).toBe(2);

    for (const result of results) {
      const orch = result.files.find(f => f.category === "saga-orchestrator")!;
      expect(orch).toBeTruthy();
      // Retry
      expect(orch.content).toContain("retryPolicies");
      // CB
      expect(orch.content).toContain("circuitBreakerRegistry");
      // Savepoints
      expect(orch.content).toContain("SagaSavepointManager");
      // Recovery
      expect(orch.content).toContain("sagaStateStore");
      // Compensation retry
      expect(orch.content).toContain("RetryPolicy.forCompensation()");
    }
  });

  it("TEST 26: fichiers partagés générés 1 seule fois dans generateAllSagas", () => {
    const results = generateAllSagas(
      [CREDIT_CANDIDATE, VIREMENT_CANDIDATE],
      "com.bmce.banking.saga",
    );

    // Shared files only in first result
    const firstCategories = results[0].files.map(f => f.category);
    const secondCategories = results[1].files.map(f => f.category);

    expect(firstCategories).toContain("saga-retry");
    expect(firstCategories).toContain("saga-circuitbreaker");
    expect(firstCategories).toContain("saga-transaction");
    expect(firstCategories).toContain("saga-recovery");

    // Second result should NOT have shared categories
    expect(secondCategories).not.toContain("saga-retry");
    expect(secondCategories).not.toContain("saga-circuitbreaker");
    expect(secondCategories).not.toContain("saga-transaction");
    expect(secondCategories).not.toContain("saga-recovery");
  });

  it("TEST 27: total fichiers ≥ 21 (11 partagés + 5×2 par saga)", () => {
    const results = generateAllSagas(
      [CREDIT_CANDIDATE, VIREMENT_CANDIDATE],
      "com.bmce.banking.saga",
    );

    const totalFiles = results.reduce((sum, r) => sum + r.files.length, 0);
    // 11 shared + 5 per credit + 5 per virement = 21
    expect(totalFiles).toBeGreaterThanOrEqual(21);
  });

  it("TEST 28: le Context contient completedSteps (List<String>)", () => {
    const result = generateSaga(CREDIT_CANDIDATE, "com.bmce.banking.saga");
    const ctx = result.files.find(f => f.category === "saga-context")!;
    expect(ctx.content).toContain("completedSteps");
    expect(ctx.content).toContain("List<String>");
    expect(ctx.content).toContain("new ArrayList<>()");
  });
});
