/**
 * Tests de regression v8.1 — Saga Final Bug Fixes
 *
 * 15 tests couvrant les 3 derniers bugs critiques + le validateur BLOCKER :
 *   - BUG-1: Deduplication par domaine (T30.1–T30.4)
 *   - BUG-2: SAGA_ID sur tables business (T31.1–T31.3)
 *   - BUG-3: T_SAGA_LOG dans compensations (T32.1–T32.3)
 *   - STEP 4: Validateur BLOCKER (T33.1–T33.5)
 *
 * @author Hamza NORDINE
 */
import { describe, it, expect } from "vitest";
import {
  generateSaga,
  generateAllSagas,
  deduplicateCandidatesByDomain,
} from "../../server/engine/saga/saga-generator";
import { generateFallbackEnrichment } from "../../server/engine/saga/ml/fallback";
import {
  validateSagaOrchestrator,
  validateSagaStateEnum,
  validateNoDuplicatePaths,
} from "../../server/engine/saga/saga-validator";
import type { SagaCandidate, EjbDependency } from "../../server/engine/saga/saga-detector";
import type { StepContext } from "../../server/engine/saga/ml/prompts";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeEjbDep(type: string, name: string, serviceName: string): EjbDependency {
  return { type, name, isInterService: true, serviceName };
}

function makeStepContext(overrides: Partial<StepContext> = {}): StepContext {
  return {
    stepNumber: 1,
    stepLabel: "Verification KYC",
    stepType: "validation",
    isCompensable: true,
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

const VIREMENT_SOURCE = `
@Stateless
public class VirementSEPAOrchestrateurEJB implements VirementSEPAOrchestrateurEJBLocal {
  @EJB private ComplianceLBCFTEJBLocal complianceService;
  @EJB private CompteServiceEJBLocal compteService;
  @EJB private SWIFTGatewayEJBLocal swiftGateway;
  @EJB private NotificationEJBLocal notificationService;
  public ResultatVirement execute(VirementVO input) {
    complianceService.verifierCompliance(input);
    em.createQuery("UPDATE T_COMPTES SET SOLDE = SOLDE - :montant WHERE NUM_COMPTE = :compte")
      .setParameter("montant", input.getMontant())
      .executeUpdate();
    swiftGateway.envoyerMT103(input);
    notificationService.envoyerNotification(input.getClientId(), "Virement effectue");
    return new ResultatVirement("OK");
  }
}`;

const VIREMENT_DEPS: EjbDependency[] = [
  makeEjbDep("ComplianceLBCFTEJBLocal", "complianceService", "compliance-service"),
  makeEjbDep("CompteServiceEJBLocal", "compteService", "compte-service"),
  makeEjbDep("SWIFTGatewayEJBLocal", "swiftGateway", "swift-service"),
  makeEjbDep("NotificationEJBLocal", "notificationService", "notification-service"),
];

const CREDIT_SOURCE = `
@Stateless
public class CreditScoringEJB implements CreditScoringEJBLocal {
  @EJB private ScoringEJBLocal scoringService;
  @EJB private DecisionCreditEJBLocal decisionService;
  @EJB private ComptabiliteEJBLocal comptabiliteService;
  public ScoreResult calculerScoreCredit(ClientVO input) {
    scoringService.calculerScore(input);
    decisionService.prendreDecision(input);
    comptabiliteService.enregistrerDecision(input);
    return new ScoreResult("OK");
  }
}`;

const CREDIT_DEPS: EjbDependency[] = [
  makeEjbDep("ScoringEJBLocal", "scoringService", "scoring-service"),
  makeEjbDep("DecisionCreditEJBLocal", "decisionService", "decision-service"),
  makeEjbDep("ComptabiliteEJBLocal", "comptabiliteService", "comptabilite-service"),
];

function makeCandidate(
  className: string,
  domain: string,
  source: string,
  deps: EjbDependency[],
  writeOps: string[] = ["API:persist"],
): SagaCandidate {
  return {
    className,
    domain,
    ejbDependencies: deps,
    interServiceCount: deps.length,
    writeOperations: writeOps,
    hasWriteOps: true,
    hasCompensation: true,
    hasGracefulDegradation: false,
    inputType: "Object",
    rawSource: source,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. BUG-1 — Deduplication par domaine
// ═══════════════════════════════════════════════════════════════════════════

describe("BUG-1: Deduplication par domaine v8.1", () => {
  it("T30.1: deduplicateCandidatesByDomain garde 1 candidat par domaine", () => {
    const c1 = makeCandidate("CreditEJB_method1", "credit", CREDIT_SOURCE, CREDIT_DEPS, ["API:persist"]);
    const c2 = makeCandidate("CreditEJB_method2", "credit", CREDIT_SOURCE, CREDIT_DEPS, ["API:persist"]);
    const c3 = makeCandidate("VirementEJB_method1", "virement", VIREMENT_SOURCE, VIREMENT_DEPS, ["SQL:UPDATE", "SQL:INSERT", "API:persist", "SQL:UPDATE", "SQL:DELETE"]);

    const result = deduplicateCandidatesByDomain([c1, c2, c3]);
    expect(result.length).toBe(2);
    expect(result.map(r => r.domain).sort()).toEqual(["credit", "virement"]);
  });

  it("T30.2: deduplicateCandidatesByDomain garde le candidat le plus riche", () => {
    const poor = makeCandidate("CreditEJB_simple", "credit", CREDIT_SOURCE, CREDIT_DEPS, ["API:persist"]);
    const rich = makeCandidate("CreditEJB_complex", "credit", CREDIT_SOURCE, CREDIT_DEPS, ["SQL:UPDATE", "SQL:INSERT", "API:persist"]);

    const result = deduplicateCandidatesByDomain([poor, rich]);
    expect(result.length).toBe(1);
    expect(result[0].className).toBe("CreditEJB_complex");
  });

  it("T30.3: generateAllSagas deduplique et produit 0 path duplique", () => {
    // 6 candidats (3 credit + 3 virement) → 2 resultats
    const candidates = [
      makeCandidate("CreditEJB_m1", "credit", CREDIT_SOURCE, CREDIT_DEPS),
      makeCandidate("CreditEJB_m2", "credit", CREDIT_SOURCE, CREDIT_DEPS),
      makeCandidate("CreditEJB_m3", "credit", CREDIT_SOURCE, CREDIT_DEPS),
      makeCandidate("VirementEJB_m1", "virement", VIREMENT_SOURCE, VIREMENT_DEPS),
      makeCandidate("VirementEJB_m2", "virement", VIREMENT_SOURCE, VIREMENT_DEPS),
      makeCandidate("VirementEJB_m3", "virement", VIREMENT_SOURCE, VIREMENT_DEPS),
    ];

    const results = generateAllSagas(candidates, "com.bmce.banking.saga");
    expect(results.length).toBe(2);

    // Verify no duplicate paths
    const allPaths = results.flatMap(r => r.files.map(f => f.path));
    const uniquePaths = new Set(allPaths);
    expect(allPaths.length).toBe(uniquePaths.size);
  });

  it("T30.4: paths de migration SQL sont uniques par domaine", () => {
    const candidates = [
      makeCandidate("CreditEJB", "credit", CREDIT_SOURCE, CREDIT_DEPS),
      makeCandidate("VirementEJB", "virement", VIREMENT_SOURCE, VIREMENT_DEPS),
    ];

    const results = generateAllSagas(candidates, "com.bmce.banking.saga");
    const migrationFiles = results.flatMap(r =>
      r.files.filter(f => f.category === "saga-migration"),
    );

    // Domain-specific V3 migrations + shared V4 state migration
    expect(migrationFiles.length).toBeGreaterThanOrEqual(2);

    // Filter domain-specific saga_log migrations
    const domainMigrations = migrationFiles.filter(f => f.path.includes("saga_log"));
    expect(domainMigrations.length).toBe(2);
    const domainPaths = domainMigrations.map(f => f.path);
    expect(domainPaths[0]).not.toBe(domainPaths[1]);
    expect(domainPaths.some(p => p.includes("credit"))).toBe(true);
    expect(domainPaths.some(p => p.includes("virement"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. BUG-2 — SAGA_ID sur tables business
// ═══════════════════════════════════════════════════════════════════════════

describe("BUG-2: SAGA_ID sur tables business v8.1", () => {
  it("T31.1: aucune compensation fallback n'utilise SAGA_ID sur une table business", () => {
    const businessLabels = [
      "echeancier",
      "conversion devise",
      "scoring",
      "creation dossier credit",
      "decision",
      "calcul conditions financieres",
      "enregistrement virement",
      "creation client",
    ];

    for (const label of businessLabels) {
      const ctx = makeStepContext({
        stepLabel: label,
        stepType: "command",
        isCompensable: true,
      });
      const enrichment = generateFallbackEnrichment(ctx);
      const body = enrichment.compensationBody;

      // Should NOT contain SAGA_ID on business tables
      const sagaIdOnBusiness = /WHERE\s+SAGA_ID\s*=/i.test(body)
        && !/T_SAGA_LOG|T_SAGA_STATE/i.test(body);
      expect(sagaIdOnBusiness, `Label "${label}" uses SAGA_ID on business table: ${body}`).toBe(false);
    }
  });

  it("T31.2: compensations utilisent des IDs metier reels (REFERENCE, ID_*, NUM_*)", () => {
    const testCases = [
      { label: "echeancier", expectedId: "REFERENCE_CREDIT" },
      { label: "conversion devise", expectedId: "REFERENCE_CONVERSION" },
      { label: "scoring", expectedId: "REFERENCE_SCORE" },
      { label: "creation dossier credit", expectedId: "ID_DOSSIER" },
      { label: "decision", expectedId: "REFERENCE_DECISION" },
      { label: "enregistrement virement", expectedId: "REFERENCE_VIREMENT" },
      { label: "creation client", expectedId: "ID_CLIENT" },
    ];

    for (const tc of testCases) {
      const ctx = makeStepContext({
        stepLabel: tc.label,
        stepType: "command",
        isCompensable: true,
      });
      const enrichment = generateFallbackEnrichment(ctx);
      expect(
        enrichment.compensationBody.includes(tc.expectedId),
        `Label "${tc.label}" should use ${tc.expectedId}, got: ${enrichment.compensationBody}`,
      ).toBe(true);
    }
  });

  it("T31.3: le validateur detecte SAGA_ID sur table business comme BLOCKER", () => {
    const badCode = `
public class TestSagaOrchestrator {
    private final JdbcTemplate jdbcTemplate;
    public TestSagaOrchestrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }
    private void compensateStep1(SagaContext ctx) {
        jdbcTemplate.update("UPDATE T_ECHEANCIERS SET STATUT = 'ANNULE' WHERE SAGA_ID = ?", ctx.getSagaId());
    }
}`;
    const result = validateSagaOrchestrator(badCode);
    expect(result.valid).toBe(false);
    const blocker = result.errors.find(e => e.type === "SAGA_ID_ON_BUSINESS_TABLE");
    expect(blocker).toBeTruthy();
    expect(blocker!.severity).toBe("BLOCKER");
    expect(blocker!.detail).toContain("T_ECHEANCIERS");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. BUG-3 — T_SAGA_LOG dans compensations
// ═══════════════════════════════════════════════════════════════════════════

describe("BUG-3: T_SAGA_LOG dans compensations v8.1", () => {
  it("T32.1: aucune compensation fallback ne touche T_SAGA_LOG", () => {
    const allLabels = [
      "mise a jour statut",
      "verification eligibilite",
      "limite engagement",
      "evaluation",
      "validation pieces",
    ];

    for (const label of allLabels) {
      const ctx = makeStepContext({
        stepLabel: label,
        stepType: "command",
        isCompensable: true,
      });
      const enrichment = generateFallbackEnrichment(ctx);
      expect(
        enrichment.compensationBody.includes("T_SAGA_LOG"),
        `Label "${label}" touches T_SAGA_LOG: ${enrichment.compensationBody}`,
      ).toBe(false);
    }
  });

  it("T32.2: le fallback generique n'utilise pas T_SAGA_LOG", () => {
    const ctx = makeStepContext({
      stepLabel: "operation inconnue custom",
      stepType: "command",
      isCompensable: true,
      targetService: "CustomService",
      targetMethod: "doSomething",
    });
    const enrichment = generateFallbackEnrichment(ctx);
    expect(enrichment.compensationBody).not.toContain("T_SAGA_LOG");
  });

  it("T32.3: le validateur detecte T_SAGA_LOG dans compensation comme BLOCKER", () => {
    const badCode = `
public class TestSagaOrchestrator {
    private final JdbcTemplate jdbcTemplate;
    public TestSagaOrchestrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }
    private void compensateVerification(SagaContext ctx) {
        jdbcTemplate.update("UPDATE T_SAGA_LOG SET STATUT = 'ROLLBACK' WHERE SAGA_ID = ?", ctx.getSagaId());
    }
}`;
    const result = validateSagaOrchestrator(badCode);
    expect(result.valid).toBe(false);
    const blocker = result.errors.find(e => e.type === "T_SAGA_LOG_IN_COMPENSATION");
    expect(blocker).toBeTruthy();
    expect(blocker!.severity).toBe("BLOCKER");
    expect(blocker!.detail).toContain("compensateVerification");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. STEP 4 — Validateur BLOCKER
// ═══════════════════════════════════════════════════════════════════════════

describe("STEP 4: Validateur BLOCKER v8.1", () => {
  it("T33.1: validateNoDuplicatePaths detecte les doublons", () => {
    const files = [
      { path: "src/main/java/saga/CreditSagaState.java", domain: "credit" },
      { path: "src/main/java/saga/CreditSagaState.java", domain: "credit" },
      { path: "src/main/java/saga/VirementSagaState.java", domain: "virement" },
    ];

    const result = validateNoDuplicatePaths(files);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].type).toBe("DUPLICATE_FILE_PATH");
    expect(result.errors[0].severity).toBe("BLOCKER");
  });

  it("T33.2: validateNoDuplicatePaths passe avec des paths uniques", () => {
    const files = [
      { path: "src/main/java/saga/CreditSagaState.java", domain: "credit" },
      { path: "src/main/java/saga/VirementSagaState.java", domain: "virement" },
    ];

    const result = validateNoDuplicatePaths(files);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("T33.3: SAGA_ID sur T_SAGA_LOG est valide (table infrastructure)", () => {
    const goodCode = `
public class TestSagaOrchestrator {
    private final JdbcTemplate jdbcTemplate;
    public TestSagaOrchestrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }
    private void logSagaStep(SagaContext ctx) {
        jdbcTemplate.update("UPDATE T_SAGA_LOG SET STATUT = 'COMPLETED' WHERE SAGA_ID = ?", ctx.getSagaId());
    }
}`;
    const result = validateSagaOrchestrator(goodCode);
    // SAGA_ID on T_SAGA_LOG is fine (infrastructure table)
    const sagaIdErrors = result.errors.filter(e => e.type === "SAGA_ID_ON_BUSINESS_TABLE");
    expect(sagaIdErrors.length).toBe(0);
  });

  it("T33.4: un orchestrateur propre passe toutes les validations", () => {
    const cleanCode = `
public class VirementSagaOrchestrator {
    private final JdbcTemplate jdbcTemplate;
    private final CompteService compteService;
    public VirementSagaOrchestrator(JdbcTemplate jdbcTemplate, CompteService compteService) {
        this.jdbcTemplate = jdbcTemplate;
        this.compteService = compteService;
    }
    private void compensateDebit(SagaContext ctx) {
        log.info("Compensation debit");
        jdbcTemplate.update("UPDATE T_ECRITURES SET STATUT = 'ANNULE' WHERE REFERENCE = ?", ctx.getReferenceEcriture());
    }
    private void compensateReservation(SagaContext ctx) {
        log.info("Compensation reservation");
        compteService.libererFonds(ctx);
    }
}`;
    const result = validateSagaOrchestrator(cleanCode);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("T33.5: toutes les erreurs v8.1 ont une severity BLOCKER", () => {
    const badCode = `
public class BadSagaOrchestrator {
    private final JdbcTemplate jdbcTemplate;
    public BadSagaOrchestrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }
    private void compensateStep1(SagaContext ctx) {
        jdbcTemplate.update("UPDATE T_CLIENTS SET STATUT = 'ARCHIVE' WHERE SAGA_ID = ?", ctx.getSagaId());
    }
    private void compensateStep2(SagaContext ctx) {
        jdbcTemplate.update("UPDATE T_SAGA_LOG SET STATUT = 'ROLLBACK' WHERE SAGA_ID = ?", ctx.getSagaId());
    }
}`;
    const result = validateSagaOrchestrator(badCode);
    expect(result.valid).toBe(false);

    const blockers = result.errors.filter(e => e.severity === "BLOCKER");
    expect(blockers.length).toBeGreaterThanOrEqual(2);

    // Should have both types of BLOCKER
    const types = blockers.map(e => e.type);
    expect(types).toContain("SAGA_ID_ON_BUSINESS_TABLE");
    expect(types).toContain("T_SAGA_LOG_IN_COMPENSATION");
  });
});
