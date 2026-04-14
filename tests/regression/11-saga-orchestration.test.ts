/**
 * Tests de régression v7.9 — Saga Orchestration
 *
 * 15 tests couvrant :
 *   - saga-detector.ts (détection candidats)
 *   - saga-step-extractor.ts (extraction steps)
 *   - saga-compensation.ts (inférence compensations)
 *   - saga-generator.ts (génération Java)
 *   - quality-scorer.ts (check SAGA_COVERAGE)
 *
 * @author Hamza NORDINE
 */

import { describe, it, expect } from "vitest";
import { detectSagaCandidates, type SagaCandidate, type EjbDependency } from "../../server/engine/saga/saga-detector";
import { extractSagaSteps, extractIntermediateResults } from "../../server/engine/saga/saga-step-extractor";
import { inferCompensation } from "../../server/engine/saga/saga-compensation";
import { generateSaga, generateAllSagas } from "../../server/engine/saga/saga-generator";
import { scoreGeneration } from "../../server/engine/quality-scorer";
import type { ProjectIR, UseCaseIR, InjectedService } from "../../server/java-parser";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeInjectedService(type: string, name: string): InjectedService {
  return { type, name };
}

function makeUseCaseIR(
  className: string,
  injected: InjectedService[],
  rawSource: string,
): UseCaseIR {
  return {
    className,
    packageName: "com.bmce.banking",
    methods: [
      { name: "execute", returnType: "void", params: [{ type: "VirementVO", name: "vo" }] },
    ],
    injectedServices: injected,
    sqlQueries: [],
    tables: [],
    rawSource,
    isStateless: true,
    isStateful: false,
    isMessageDriven: false,
    annotations: [],
    superClass: null,
    interfaces: [],
    fields: [],
    innerClasses: [],
    imports: [],
  } as unknown as UseCaseIR;
}

function makeProjectIR(useCases: UseCaseIR[]): ProjectIR {
  return {
    useCases,
    dtos: [],
    tables: [],
    groupId: "com.bmce.banking",
    artifactId: "core-banking",
    technologies: ["EJB"],
    _rawFiles: useCases.map(uc => ({ path: `src/${uc.className}.java`, content: uc.rawSource })),
  } as unknown as ProjectIR;
}

// ── Source fixtures avec opérations d'écriture ──────────────────────────────

/** EJB orchestrateur avec 4 deps inter-services + écriture (persist) + commentaires ÉTAPE */
const VIREMENT_SOURCE = `
@Stateless
public class VirementSEPAOrchestrateurEJB implements VirementSEPAOrchestrateurEJBLocal {

  @EJB private ComplianceLBCFTEJBLocal complianceService;
  @EJB private DebitCompteEJBLocal debitService;
  @EJB private SWIFTGatewayEJBLocal swiftGateway;
  @EJB private NotificationEJBLocal notificationService;

  public ResultatVirement executerVirement(VirementVO vo) {
    // ÉTAPE 1 — Validation compliance LBC-FT
    complianceService.verifierCompliance(vo.getCompte(), vo.getMontant());

    // ÉTAPE 2 — Débit du compte source
    debitService.debiterCompte(vo.getCompte(), vo.getMontant(), vo.getDevise());
    em.persist(new TransactionLog(vo));

    // ÉTAPE 3 — Envoi SWIFT MT103
    String swiftRef = swiftGateway.envoyerMT103(vo);

    // ÉTAPE 4 — Notification client
    notificationService.envoyerNotification(vo.getClient(), "Virement effectué");

    return new ResultatVirement(swiftRef);
  }
}`;

/** Simple DAO sans deps inter-services */
const SIMPLE_DAO_SOURCE = `
@Stateless
public class CompteDAOEJB implements CompteDAOEJBLocal {
  @PersistenceContext private EntityManager em;

  public Compte findById(Long id) {
    return em.find(Compte.class, id);
  }
}`;

/** 2 deps inter-services mais aucune opération d'écriture */
const TWO_DEPS_NO_WRITE = `
@Stateless
public class ConsultationEJB implements ConsultationEJBLocal {
  @EJB private CompteServiceEJBLocal compteService;
  @EJB private ClientServiceEJBLocal clientService;

  public InfoClient consulter(Long clientId) {
    Client c = clientService.getClient(clientId);
    Compte cpt = compteService.getCompte(c.getCompteId());
    return new InfoClient(c, cpt);
  }
}`;

/** 2 deps inter-services + opération d'écriture (UPDATE SQL) */
const TWO_DEPS_WITH_WRITE = `
@Stateless
public class TransfertInterneEJB implements TransfertInterneEJBLocal {
  @EJB private DebitCompteEJBLocal debitService;
  @EJB private CreditCompteEJBLocal creditService;

  public void transferer(TransfertVO vo) {
    // ÉTAPE 1 — Débit compte source
    debitService.debiterCompte(vo.getCompteSource(), vo.getMontant());
    // ÉTAPE 2 — Crédit compte destination
    creditService.crediterCompte(vo.getCompteDest(), vo.getMontant());
    UPDATE T_COMPTES SET SOLDE = SOLDE - vo.getMontant();
  }
}`;

// ── EjbDependency helpers ───────────────────────────────────────────────────

function makeEjbDep(type: string, name: string, serviceName: string): EjbDependency {
  return { type, name, isInterService: true, serviceName };
}

const VIREMENT_DEPS: EjbDependency[] = [
  makeEjbDep("ComplianceLBCFTEJBLocal", "complianceService", "compliance-service"),
  makeEjbDep("DebitCompteEJBLocal", "debitService", "debit-service"),
  makeEjbDep("SWIFTGatewayEJBLocal", "swiftGateway", "swift-service"),
  makeEjbDep("NotificationEJBLocal", "notificationService", "notification-service"),
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. SAGA DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

describe("Saga Detector v7.9", () => {
  it("TEST 1: détecte un EJB orchestrateur avec ≥2 deps inter-services + write ops", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("VirementSEPAOrchestrateurEJB", [
        makeInjectedService("ComplianceLBCFTEJBLocal", "complianceService"),
        makeInjectedService("DebitCompteEJBLocal", "debitService"),
        makeInjectedService("SWIFTGatewayEJBLocal", "swiftGateway"),
        makeInjectedService("NotificationEJBLocal", "notificationService"),
      ], VIREMENT_SOURCE),
    ]);

    const candidates = detectSagaCandidates(ir);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const c = candidates[0];
    expect(c.className).toBe("VirementSEPAOrchestrateurEJB");
    expect(c.interServiceCount).toBeGreaterThanOrEqual(2);
    expect(c.hasWriteOps).toBe(true);
    expect(c.domain).toBeTruthy();
  });

  it("TEST 2: ne détecte PAS un simple DAO avec 0 deps inter-services", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("CompteDAOEJB", [], SIMPLE_DAO_SOURCE),
    ]);

    const candidates = detectSagaCandidates(ir);
    expect(candidates.length).toBe(0);
  });

  it("TEST 3: ne détecte PAS un EJB avec 2 deps mais sans opération d'écriture", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("ConsultationEJB", [
        makeInjectedService("CompteServiceEJBLocal", "compteService"),
        makeInjectedService("ClientServiceEJBLocal", "clientService"),
      ], TWO_DEPS_NO_WRITE),
    ]);

    const candidates = detectSagaCandidates(ir);
    expect(candidates.length).toBe(0);
  });

  it("TEST 4: détecte un EJB avec 2 deps + opérations d'écriture", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("TransfertInterneEJB", [
        makeInjectedService("DebitCompteEJBLocal", "debitService"),
        makeInjectedService("CreditCompteEJBLocal", "creditService"),
      ], TWO_DEPS_WITH_WRITE),
    ]);

    const candidates = detectSagaCandidates(ir);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].className).toBe("TransfertInterneEJB");
    expect(candidates[0].hasWriteOps).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. SAGA STEP EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

describe("Saga Step Extractor v7.9", () => {
  it("TEST 5: extrait les steps depuis les commentaires ÉTAPE N", () => {
    const steps = extractSagaSteps(VIREMENT_SOURCE, "executerVirement", VIREMENT_DEPS);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    // First step should be validation/compliance
    expect(steps[0].order).toBe(1);
    // Steps should have sequential order
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].order).toBe(steps[i - 1].order + 1);
    }
  });

  it("TEST 6: extrait les résultats intermédiaires (variables assignées)", () => {
    const steps = extractSagaSteps(VIREMENT_SOURCE, "executerVirement", VIREMENT_DEPS);
    const results = extractIntermediateResults(VIREMENT_SOURCE, steps);
    // Should find swiftRef = swiftGateway.envoyerMT103(vo)
    expect(results.length).toBeGreaterThanOrEqual(1);
    const swiftResult = results.find(r =>
      r.fieldName.toLowerCase().includes("swift") || r.fieldName.includes("Ref")
    );
    expect(swiftResult).toBeTruthy();
    expect(swiftResult!.type).toBe("String");
  });

  it("TEST 7: les steps de type command sont marqués compensables", () => {
    const steps = extractSagaSteps(VIREMENT_SOURCE, "executerVirement", VIREMENT_DEPS);
    const compensableSteps = steps.filter(s => s.isCompensable);
    // At least one step should be compensable (debit, envoi)
    expect(compensableSteps.length).toBeGreaterThanOrEqual(1);
    // Each compensable step should have a compensation action
    for (const step of compensableSteps) {
      expect(step.compensation).toBeTruthy();
      expect(step.compensation!.method).toBeTruthy();
      expect(step.compensation!.description).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. SAGA COMPENSATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Saga Compensation v7.9", () => {
  it("TEST 8: infère compensation pour un débit compte", () => {
    const comp = inferCompensation("Débit du compte source", "debitService.debiterCompte()");
    expect(comp).not.toBeNull();
    expect(comp!.method).toBe("compenserDebitCompte");
    expect(comp!.description.toLowerCase()).toContain("crédit");
  });

  it("TEST 9: infère compensation SWIFT annulation pour envoi MT103", () => {
    const comp = inferCompensation("Envoi SWIFT MT103", "swiftGateway.envoyerMT103()");
    expect(comp).not.toBeNull();
    expect(comp!.method).toBe("envoyerAnnulationSEPA");
  });

  it("TEST 10: pas de compensation pour une validation (pas de pattern d'écriture)", () => {
    const comp = inferCompensation("Validation compliance LBC-FT", "complianceService.verifier()");
    // "Validation" ne matche aucune règle de compensation
    expect(comp).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. SAGA GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

describe("Saga Generator v7.9", () => {
  const candidate: SagaCandidate = {
    className: "VirementSEPAOrchestrateurEJB",
    domain: "virement-sepa",
    ejbDependencies: VIREMENT_DEPS,
    interServiceCount: 4,
    writeOperations: ["API:persist"],
    hasWriteOps: true,
    hasCompensation: true,
    hasGracefulDegradation: false,
    inputType: "VirementVO",
    rawSource: VIREMENT_SOURCE,
  };

  it("TEST 11: génère 5 fichiers (Orchestrator, State, Context, Log, SQL)", () => {
    const result = generateSaga(candidate, "com.bmce.banking.saga");
    expect(result.files.length).toBe(5);

    const categories = result.files.map(f => f.category);
    expect(categories).toContain("saga-orchestrator");
    expect(categories).toContain("saga-state");
    expect(categories).toContain("saga-context");
    expect(categories).toContain("saga-log");
    expect(categories).toContain("saga-migration");
  });

  it("TEST 12: l'Orchestrator contient @Service et le domaine dans le nom de classe", () => {
    const result = generateSaga(candidate, "com.bmce.banking.saga");
    const orchestrator = result.files.find(f => f.category === "saga-orchestrator")!;
    expect(orchestrator.content).toContain("@Service");
    expect(orchestrator.content).toContain("SagaOrchestrator");
    // Should contain the domain name
    expect(orchestrator.content).toContain("VirementSepa");
  });

  it("TEST 13: le State enum contient les états INITIATED, COMPLETED, COMPENSATING, FAILED", () => {
    const result = generateSaga(candidate, "com.bmce.banking.saga");
    const stateFile = result.files.find(f => f.category === "saga-state")!;
    expect(stateFile.content).toContain("INITIATED");
    expect(stateFile.content).toContain("COMPLETED");
    expect(stateFile.content).toContain("COMPENSATING");
    expect(stateFile.content).toContain("FAILED");
  });

  it("TEST 14: generateAllSagas traite plusieurs candidats", () => {
    const candidate2: SagaCandidate = {
      ...candidate,
      className: "TransfertInterneEJB",
      domain: "transfert-interne",
    };

    const results = generateAllSagas([candidate, candidate2], "com.bmce.banking.saga");
    expect(results.length).toBe(2);
    expect(results[0].domain).toBe("virement-sepa");
    expect(results[1].domain).toBe("transfert-interne");
    // Each should have 5 files
    expect(results[0].files.length).toBe(5);
    expect(results[1].files.length).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. QUALITY SCORER — SAGA_COVERAGE
// ═══════════════════════════════════════════════════════════════════════════

describe("Quality Scorer — SAGA_COVERAGE v7.9", () => {
  it("TEST 15: scoreGeneration inclut le check SAGA_COVERAGE (12 checks total)", () => {
    // Minimal files that pass all checks
    const files = [
      { path: "src/main/java/com/test/service/CompteService.java", content: "package com.test;\n@Service\npublic class CompteService {}" },
    ];

    const result = scoreGeneration(files);
    // Should have 12 checks now (8 original + 3 v7.8 + 1 v7.9)
    expect(result.checks.length).toBe(12);

    const sagaCheck = result.checks.find((c: { id: string }) => c.id === "SAGA_COVERAGE");
    expect(sagaCheck).toBeTruthy();
    expect(sagaCheck!.maxPoints).toBe(5);
    // With no multi-service EJBs, it should pass (noCandidates)
    expect(sagaCheck!.passed).toBe(true);
  });
});
