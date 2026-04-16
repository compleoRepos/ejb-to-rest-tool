/**
 * Tests de regression v8.2 — Saga Amelioration Ciblee
 *
 * 15 tests couvrant les 4 STEPs de la v8.2 :
 *   - STEP 1: SagaCandidateRegistry (T40.1–T40.4)
 *   - STEP 2: step-body-mapper integration (T41.1–T41.4)
 *   - STEP 3: compensation-mapper integration (T42.1–T42.4)
 *   - STEP 4: Context type + cleanup champs (T43.1–T43.3)
 *
 * @author Hamza NORDINE
 */
import { describe, it, expect } from "vitest";
import {
  generateSaga,
  generateAllSagas,
} from "../../server/engine/saga/saga-generator";
import { SagaCandidateRegistry } from "../../server/engine/saga/saga-candidate-registry";
import { getStepBody, getStepBodyMap, getAdditionalServicesForDomain } from "../../server/engine/saga/step-body-mapper";
import { getCompensationBody, getCompensationDescription } from "../../server/engine/saga/compensation-mapper";
import { extractIntermediateResults, extractSagaSteps } from "../../server/engine/saga/saga-step-extractor";
import type { SagaCandidate, EjbDependency } from "../../server/engine/saga/saga-detector";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeEjbDep(type: string, name: string, serviceName: string): EjbDependency {
  return { type, name, isInterService: true, serviceName };
}

const CREDIT_SOURCE = `
@Stateless
public class CreditOctroiEJB implements CreditOctroiEJBLocal {
  @EJB private KycRemediationEJBLocal kycService;
  @EJB private ScoringEJBLocal scoringService;
  @EJB private ComptabiliteEJBLocal comptabiliteService;
  @EJB private NotificationEJBLocal notificationService;
  public ResultatCredit execute(CreditVO input) {
    // ÉTAPE 1 — Validation dossier
    if (input.getCodeClient() == null) throw new DossierInvalidException("Code client obligatoire");
    // ÉTAPE 2 — Vérification éligibilité KYC
    kycService.verifierEligibiliteClient(input.getCodeClient());
    // ÉTAPE 3 — Évaluation des garanties
    BigDecimal valeur = garantieService.evaluerGaranties(input.getCodeClient(), input.getIdsGaranties());
    // ÉTAPE 4 — Scoring composite
    int score = scoringService.calculerScoreComposite(input.getCodeClient(), input.getMontantDemande(), input.getDureeMois());
    // ÉTAPE 5 — Vérification limites engagement
    // ÉTAPE 6 — Calcul conditions financières
    // ÉTAPE 7 — Décision
    // ÉTAPE 8 — Blocage garanties
    em.createQuery("UPDATE T_GARANTIES SET STATUT = 'BLOQUEE' WHERE ID_GARANTIE = :id").executeUpdate();
    // ÉTAPE 9 — Création dossier + ligne de crédit
    em.createQuery("INSERT INTO T_DOSSIERS_CREDIT ...").executeUpdate();
    // ÉTAPE 10 — Déblocage des fonds
    em.createQuery("UPDATE T_COMPTES SET SOLDE = SOLDE + :montant WHERE NUM_COMPTE = :compte").executeUpdate();
    // ÉTAPE 11 — Écritures comptables
    comptabiliteService.passerEcrituresOctroiCredit(idDossier, input.getCodeClient(), input.getMontantDemande(), BigDecimal.ZERO);
    // ÉTAPE 12 — Notification
    notificationService.notifierDecisionCredit(input.getCodeClient(), decision, input.getMontantDemande(), "Octroi credit");
    return new ResultatCredit("OK");
  }
}`;

const CREDIT_DEPS: EjbDependency[] = [
  makeEjbDep("KycRemediationEJBLocal", "kycService", "kyc-service"),
  makeEjbDep("ScoringEJBLocal", "scoringService", "scoring-service"),
  makeEjbDep("ComptabiliteEJBLocal", "comptabiliteService", "comptabilite-service"),
  makeEjbDep("NotificationEJBLocal", "notificationService", "notification-service"),
];

const VIREMENT_SOURCE = `
@Stateless
public class VirementInternationalEJB implements VirementInternationalEJBLocal {
  @EJB private ComplianceEJBLocal complianceService;
  @EJB private CompteServiceEJBLocal compteService;
  @EJB private SWIFTGatewayEJBLocal swiftGateway;
  @EJB private NotificationEJBLocal notificationService;
  public ResultatVirement execute(VirementVO input) {
    complianceService.verifierCompliance(input);
    em.createQuery("UPDATE T_COMPTES SET SOLDE = SOLDE - :montant WHERE NUM_COMPTE = :compte").executeUpdate();
    swiftGateway.envoyerMT103(input);
    notificationService.envoyerNotification(input.getClientId(), "Virement effectue");
    return new ResultatVirement("OK");
  }
}`;

const VIREMENT_DEPS: EjbDependency[] = [
  makeEjbDep("ComplianceEJBLocal", "complianceService", "compliance-service"),
  makeEjbDep("CompteServiceEJBLocal", "compteService", "compte-service"),
  makeEjbDep("SWIFTGatewayEJBLocal", "swiftGateway", "swift-service"),
  makeEjbDep("NotificationEJBLocal", "notificationService", "notification-service"),
];

const CLIENT_SOURCE = `
@Stateless
public class ClientOnboardingEJB implements ClientOnboardingEJBLocal {
  @EJB private KycEJBLocal kycService;
  @EJB private CompteServiceEJBLocal compteService;
  @EJB private NotificationEJBLocal notificationService;
  public ResultatClient execute(ClientVO input) {
    kycService.verifierIdentite(input);
    em.createQuery("INSERT INTO T_CLIENTS ...").executeUpdate();
    compteService.ouvrirCompte(input);
    notificationService.envoyerBienvenue(input);
    return new ResultatClient("OK");
  }
}`;

const CLIENT_DEPS: EjbDependency[] = [
  makeEjbDep("KycEJBLocal", "kycService", "kyc-service"),
  makeEjbDep("CompteServiceEJBLocal", "compteService", "compte-service"),
  makeEjbDep("NotificationEJBLocal", "notificationService", "notification-service"),
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
// 1. STEP 1 — SagaCandidateRegistry
// ═══════════════════════════════════════════════════════════════════════════

describe("STEP 1: SagaCandidateRegistry v8.2", () => {
  it("T40.1: le registre enregistre et deduplique par domaine", () => {
    const registry = new SagaCandidateRegistry();
    const c1 = makeCandidate("CreditEJB_m1", "credit", CREDIT_SOURCE, CREDIT_DEPS);
    const c2 = makeCandidate("CreditEJB_m2", "credit", CREDIT_SOURCE, CREDIT_DEPS);
    const c3 = makeCandidate("VirementEJB_m1", "virement", VIREMENT_SOURCE, VIREMENT_DEPS);

    registry.register(c1);
    registry.register(c2); // doublon — ignore
    registry.register(c3);

    expect(registry.size).toBe(2);
    const entries = registry.getAll();
    expect(entries.map(e => e.domain).sort()).toEqual(["credit", "virement"]);
  });

  it("T40.2: markGenerated et markFailed mettent a jour l'etat", () => {
    const registry = new SagaCandidateRegistry();
    registry.register(makeCandidate("CreditEJB", "credit", CREDIT_SOURCE, CREDIT_DEPS));
    registry.register(makeCandidate("VirementEJB", "virement", VIREMENT_SOURCE, VIREMENT_DEPS));

    registry.markGenerated("credit", ["CreditSagaOrchestrator.java", "CreditSagaState.java"]);
    registry.markFailed("virement", "Erreur generation");

    const summary = registry.getSummary();
    expect(summary.total).toBe(2);
    expect(summary.generated).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.missing.length).toBe(1);
    expect(summary.missing[0]).toContain("virement");
  });

  it("T40.3: getSummary retourne 0 failed quand tout est genere", () => {
    const registry = new SagaCandidateRegistry();
    registry.register(makeCandidate("CreditEJB", "credit", CREDIT_SOURCE, CREDIT_DEPS));
    registry.register(makeCandidate("VirementEJB", "virement", VIREMENT_SOURCE, VIREMENT_DEPS));
    registry.register(makeCandidate("ClientEJB", "client", CLIENT_SOURCE, CLIENT_DEPS));

    registry.markGenerated("credit", ["f1.java"]);
    registry.markGenerated("virement", ["f2.java"]);
    registry.markGenerated("client", ["f3.java"]);

    const summary = registry.getSummary();
    expect(summary.total).toBe(3);
    expect(summary.generated).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.missing).toEqual([]);
  });

  it("T40.4: registre vide retourne summary 0/0/0", () => {
    const registry = new SagaCandidateRegistry();
    const summary = registry.getSummary();
    expect(summary.total).toBe(0);
    expect(summary.generated).toBe(0);
    expect(summary.failed).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. STEP 2 — step-body-mapper integration
// ═══════════════════════════════════════════════════════════════════════════

describe("STEP 2: step-body-mapper v8.2", () => {
  it("T41.1: getStepBody retourne du code reel pour les steps Credit connus", () => {
    // Step 2 — Verification KYC
    const body2 = getStepBody("credit", 2);
    expect(body2).not.toBeNull();
    expect(body2).toContain("kycRemediationService");
    expect(body2).toContain("verifierEligibiliteClient");

    // Step 11 — Ecritures comptables
    const body11 = getStepBody("credit", 11);
    expect(body11).not.toBeNull();
    expect(body11).toContain("comptabiliteGeneraleService");
    expect(body11).toContain("passerEcrituresOctroiCredit");
  });

  it("T41.2: getStepBody retourne null pour un domaine inconnu", () => {
    const body = getStepBody("assurance", 1);
    expect(body).toBeNull();
  });

  it("T41.3: getAdditionalServicesForDomain retourne les services du Credit", () => {
    const services = getAdditionalServicesForDomain("credit");
    expect(services.length).toBeGreaterThan(0);
    expect(services).toContain("kycRemediationService");
    expect(services).toContain("comptabiliteGeneraleService");
    expect(services).toContain("notificationService");
  });

  it("T41.4: l'orchestrateur Credit genere contient les appels services reels (pas de TODO)", () => {
    const candidate = makeCandidate(
      "CreditOctroiEJB", "credit", CREDIT_SOURCE, CREDIT_DEPS,
      ["SQL:UPDATE", "SQL:INSERT", "API:persist"],
    );
    const result = generateSaga(candidate, "com.bmce.banking");
    const orchestrator = result.files.find(f => f.category === "saga-orchestrator");
    expect(orchestrator).toBeTruthy();

    const content = orchestrator!.content;

    // Step 2 doit contenir l'appel reel
    expect(content).toContain("kycRemediationService.verifierEligibiliteClient");

    // Step 11 doit contenir l'appel reel
    expect(content).toContain("comptabiliteGeneraleService.passerEcrituresOctroiCredit");

    // Step 12 doit contenir l'appel reel
    expect(content).toContain("notificationService.notifierDecisionCredit");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. STEP 3 — compensation-mapper integration
// ═══════════════════════════════════════════════════════════════════════════

describe("STEP 3: compensation-mapper v8.2", () => {
  it("T42.1: getCompensationBody retourne du code reel pour les steps Credit compensables", () => {
    // Step 9 — Annulation dossier credit
    const body9 = getCompensationBody("credit", 9);
    expect(body9).not.toBeNull();
    expect(body9).toContain("T_DOSSIERS_CREDIT");
    expect(body9).toContain("ANNULE");
    expect(body9).toContain("SAGA_COMPENSATION");

    // Step 11 — Contre-passation ecritures
    const body11 = getCompensationBody("credit", 11);
    expect(body11).not.toBeNull();
    expect(body11).toContain("contrePasserEcriture");
    expect(body11).toContain("SAGA_COMPENSATION");
  });

  it("T42.2: getCompensationBody retourne du code reel pour les steps Virement compensables", () => {
    // Step 3 — Re-credit compte
    const body3 = getCompensationBody("virement", 3);
    expect(body3).not.toBeNull();
    expect(body3).toContain("T_COMPTES");
    expect(body3).toContain("SOLDE + ?");

    // Step 7 — PAIN.002 annulation SWIFT
    const body7 = getCompensationBody("virement", 7);
    expect(body7).not.toBeNull();
    expect(body7).toContain("PAIN.002");
  });

  it("T42.3: getCompensationBody retourne null pour un step non mappe", () => {
    // Step 1 (validation) n'a pas de compensation
    const body = getCompensationBody("credit", 1);
    expect(body).toBeNull();

    // Domaine inconnu
    const body2 = getCompensationBody("assurance", 5);
    expect(body2).toBeNull();
  });

  it("T42.4: l'orchestrateur Credit genere contient les compensations reelles", () => {
    const candidate = makeCandidate(
      "CreditOctroiEJB", "credit", CREDIT_SOURCE, CREDIT_DEPS,
      ["SQL:UPDATE", "SQL:INSERT", "API:persist"],
    );
    const result = generateSaga(candidate, "com.bmce.banking");
    const orchestrator = result.files.find(f => f.category === "saga-orchestrator");
    expect(orchestrator).toBeTruthy();

    const content = orchestrator!.content;

    // Les compensations doivent contenir du code reel
    // Step 11 compensation — contrePasserEcriture
    expect(content).toContain("contrePasserEcriture");

    // Aucune compensation ne doit contenir SAGA_ID sur table business
    const lines = content.split("\n");
    const compensationLines = lines.filter(l =>
      l.includes("compensateStep") || l.includes("SAGA_COMPENSATION"),
    );
    for (const line of compensationLines) {
      const hasSagaIdOnBusiness = /WHERE\s+SAGA_ID\s*=/i.test(line)
        && !/T_SAGA_LOG|T_SAGA_STATE/i.test(line);
      expect(hasSagaIdOnBusiness, `Line uses SAGA_ID on business table: ${line}`).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. STEP 4 — Context type + cleanup champs
// ═══════════════════════════════════════════════════════════════════════════

describe("STEP 4: Context type + cleanup v8.2", () => {
  it("T43.1: le context Credit contient les champs types v8.2", () => {
    const candidate = makeCandidate(
      "CreditOctroiEJB", "credit", CREDIT_SOURCE, CREDIT_DEPS,
      ["SQL:UPDATE", "SQL:INSERT", "API:persist"],
    );
    const result = generateSaga(candidate, "com.bmce.banking");
    const context = result.files.find(f => f.category === "saga-context");
    expect(context).toBeTruthy();

    const content = context!.content;

    // Champs types Credit v8.2
    expect(content).toContain("scoreComposite");
    expect(content).toContain("decisionCredit");
    expect(content).toContain("kycValide");
  });

  it("T43.2: extractIntermediateResults produit les champs types pour le Credit", () => {
    const steps = extractSagaSteps(CREDIT_SOURCE, "execute", CREDIT_DEPS);
    const results = extractIntermediateResults(CREDIT_SOURCE, steps);

    const fieldNames = results.map(r => r.fieldName);

    // Champs v8.2 attendus
    expect(fieldNames).toContain("scoreComposite");
    expect(fieldNames).toContain("decisionCredit");
    expect(fieldNames).toContain("kycValide");
  });

  it("T43.3: les champs v8.2 ont les bons types Java", () => {
    const steps = extractSagaSteps(CREDIT_SOURCE, "execute", CREDIT_DEPS);
    const results = extractIntermediateResults(CREDIT_SOURCE, steps);

    const byField = new Map(results.map(r => [r.fieldName, r.type]));

    // scoreComposite doit etre int (pas Integer ni String)
    if (byField.has("scoreComposite")) {
      expect(byField.get("scoreComposite")).toBe("int");
    }

    // kycValide doit etre Boolean
    if (byField.has("kycValide")) {
      expect(byField.get("kycValide")).toBe("Boolean");
    }

    // decisionCredit doit etre String
    if (byField.has("decisionCredit")) {
      expect(byField.get("decisionCredit")).toBe("String");
    }
  });
});
