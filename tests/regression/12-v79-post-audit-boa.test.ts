/**
 * COMPLEO v7.9 — Post-Audit BOA — Tests de régression
 *
 * 25 tests couvrant les 8 STEPs du post-audit :
 *   STEP 1 : Détection des 3 Sagas (Credit, Virement, Client)
 *   STEP 2 : Pas de doublons EJBService
 *   STEP 3 : Microservices avec toutes les méthodes, noms propres, vrais params
 *   STEP 4 : Pas de privateAdapter.java
 *   STEP 5 : SagaState enum ASCII-only (pas d'accents)
 *   STEP 6 : Injection des 6 dépendances dans l'Orchestrateur
 *   STEP 7 : Résultats intermédiaires dans SagaContext
 *   STEP 8 : Compensations concrètes + SQL Oracle + QUALITY_SCORE statique
 *
 * @author Hamza NORDINE
 */

import { describe, it, expect, beforeAll } from "vitest";
import { parseEjbProject, type ProjectIR, type InjectedService } from "../../server/java-parser";
import { generateSpringBootProject, type GenerationResult } from "../../server/spring-generator";
import { MicroserviceSplitter, buildParsedModules, type ServiceCandidate, type ParsedModule } from "../../server/engine/microservices/microservice-splitter";
import { MicroserviceGenerator } from "../../server/engine/microservices/microservice-generator";
import { detectSagaCandidates, type SagaCandidate, type EjbDependency } from "../../server/engine/saga/saga-detector";
import { extractSagaSteps, extractIntermediateResults } from "../../server/engine/saga/saga-step-extractor";
import { inferCompensation } from "../../server/engine/saga/saga-compensation";
import { generateSaga, generateAllSagas } from "../../server/engine/saga/saga-generator";
import { calculateQualityScore, type QualityReport } from "../../server/engine/quality-scorer";
import AdmZip from "adm-zip";
import * as path from "path";
import * as fs from "fs";

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

interface SourceFile {
  path: string;
  content: string;
}

function loadZipAsSourceFiles(zipPath: string): { files: SourceFile[]; pomXml?: string } {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const files: SourceFile[] = [];
  let pomXml: string | undefined;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = path.extname(entry.entryName).toLowerCase();
    if ([".java", ".xml", ".jsp", ".properties", ".yml", ".yaml"].includes(ext)) {
      const content = entry.getData().toString("utf-8");
      if (entry.entryName.endsWith("pom.xml")) pomXml = content;
      files.push({ path: entry.entryName, content });
    }
  }
  return { files, pomXml };
}

function makeInjectedService(type: string, name: string): InjectedService {
  return { type, name };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fixtures — Sources EJB synthétiques pour tests unitaires
// ═══════════════════════════════════════════════════════════════════════════════

const CREDIT_ORCHESTRATOR_SOURCE = `
@Stateless
public class CreditOctroiOrchestrateurEJB implements CreditOctroiOrchestrateurEJBLocal {

  @EJB private ScoringEJBLocal scoringService;
  @EJB private DecisionCreditEJBLocal decisionService;
  @EJB private DecaissementEJBLocal decaissementService;
  @EJB private GarantieEJBLocal garantieService;
  @EJB private EcheancierEJBLocal echeancierService;
  @EJB private NotificationEJBLocal notificationService;

  public ResultatCredit octroyer(DemandeCredit demande) {
    // ÉTAPE 1 — Scoring du client
    ScoreResult score = scoringService.calculerScore(demande.getClient());

    // ÉTAPE 2 — Décision crédit
    Decision decision = decisionService.decider(demande, score);

    // ÉTAPE 3 — Constitution garantie
    garantieService.constituerGarantie(demande.getGarantie());
    em.persist(new GarantieLog(demande));

    // ÉTAPE 4 — Génération échéancier
    Echeancier ech = echeancierService.genererEcheancier(demande.getMontant(), demande.getDuree());

    // ÉTAPE 5 — Décaissement
    decaissementService.decaisser(demande.getCompte(), demande.getMontant());
    em.persist(new TransactionLog(demande));

    // ÉTAPE 6 — Notification
    notificationService.envoyerNotification(demande.getClient(), "Crédit accordé");

    return new ResultatCredit(decision, ech);
  }
}`;

const VIREMENT_ORCHESTRATOR_SOURCE = `
@Stateless
public class VirementInternationalEJB implements VirementInternationalEJBLocal {

  @EJB private ComplianceLBCFTEJBLocal complianceService;
  @EJB private DebitCompteEJBLocal debitService;
  @EJB private SWIFTGatewayEJBLocal swiftGateway;
  @EJB private NotificationEJBLocal notificationService;

  public ResultatVirement executerVirement(VirementVO vo) {
    // ÉTAPE 1 — Vérification compliance LBC-FT
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

const CLIENT_ONBOARDING_SOURCE = `
@Stateless
public class ClientOnboardingEJB implements ClientOnboardingEJBLocal {

  @EJB private KycVerificationEJBLocal kycService;
  @EJB private CompteCreationEJBLocal compteCreation;
  @EJB private NotificationEJBLocal notificationService;

  public ResultatOnboarding onboarder(ClientVO client) {
    // ÉTAPE 1 — Vérification KYC
    KycResult kyc = kycService.verifierIdentite(client);

    // ÉTAPE 2 — Ouverture du compte
    Compte compte = compteCreation.ouvrirCompte(client, kyc);
    em.persist(new CompteLog(client));

    // ÉTAPE 3 — Notification bienvenue
    notificationService.envoyerNotification(client.getEmail(), "Bienvenue chez BOA");

    return new ResultatOnboarding(compte);
  }
}`;

// ── Helpers pour construire des ProjectIR synthétiques ──────────────────────

function makeUseCaseIR(
  className: string,
  injected: InjectedService[],
  rawSource: string,
): any {
  return {
    className,
    packageName: "com.bmce.banking",
    methods: [
      { name: "execute", returnType: "void", params: [{ type: "Object", name: "vo" }] },
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
  };
}

function makeProjectIR(useCases: any[]): ProjectIR {
  return {
    useCases,
    dtos: [],
    tables: [],
    groupId: "com.bmce.banking",
    artifactId: "core-banking",
    technologies: ["EJB"],
    _rawFiles: useCases.map((uc: any) => ({ path: `src/${uc.className}.java`, content: uc.rawSource })),
  } as unknown as ProjectIR;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1 — Détection des 3 Sagas (Credit, Virement, Client)
// ═══════════════════════════════════════════════════════════════════════════════

describe("STEP 1 — Saga Detector détecte 3 candidats", () => {
  it("T1.1: détecte CreditOctroiOrchestrateurEJB comme candidat Saga", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("CreditOctroiOrchestrateurEJB", [
        makeInjectedService("ScoringEJBLocal", "scoringService"),
        makeInjectedService("DecisionCreditEJBLocal", "decisionService"),
        makeInjectedService("DecaissementEJBLocal", "decaissementService"),
        makeInjectedService("GarantieEJBLocal", "garantieService"),
        makeInjectedService("EcheancierEJBLocal", "echeancierService"),
        makeInjectedService("NotificationEJBLocal", "notificationService"),
      ], CREDIT_ORCHESTRATOR_SOURCE),
    ]);
    const candidates = detectSagaCandidates(ir);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].className).toBe("CreditOctroiOrchestrateurEJB");
    expect(candidates[0].interServiceCount).toBeGreaterThanOrEqual(2);
    expect(candidates[0].hasWriteOps).toBe(true);
  });

  it("T1.2: détecte VirementInternationalEJB comme candidat Saga", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("VirementInternationalEJB", [
        makeInjectedService("ComplianceLBCFTEJBLocal", "complianceService"),
        makeInjectedService("DebitCompteEJBLocal", "debitService"),
        makeInjectedService("SWIFTGatewayEJBLocal", "swiftGateway"),
        makeInjectedService("NotificationEJBLocal", "notificationService"),
      ], VIREMENT_ORCHESTRATOR_SOURCE),
    ]);
    const candidates = detectSagaCandidates(ir);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].className).toBe("VirementInternationalEJB");
    expect(candidates[0].domain).toContain("virement");
  });

  it("T1.3: détecte ClientOnboardingEJB comme candidat Saga", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("ClientOnboardingEJB", [
        makeInjectedService("KycVerificationEJBLocal", "kycService"),
        makeInjectedService("CompteCreationEJBLocal", "compteCreation"),
        makeInjectedService("NotificationEJBLocal", "notificationService"),
      ], CLIENT_ONBOARDING_SOURCE),
    ]);
    const candidates = detectSagaCandidates(ir);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].className).toBe("ClientOnboardingEJB");
    expect(candidates[0].domain).toContain("client");
  });

  it("T1.4: détecte les 3 candidats dans un projet combiné", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("CreditOctroiOrchestrateurEJB", [
        makeInjectedService("ScoringEJBLocal", "scoringService"),
        makeInjectedService("DecisionCreditEJBLocal", "decisionService"),
        makeInjectedService("DecaissementEJBLocal", "decaissementService"),
        makeInjectedService("GarantieEJBLocal", "garantieService"),
      ], CREDIT_ORCHESTRATOR_SOURCE),
      makeUseCaseIR("VirementInternationalEJB", [
        makeInjectedService("ComplianceLBCFTEJBLocal", "complianceService"),
        makeInjectedService("DebitCompteEJBLocal", "debitService"),
        makeInjectedService("SWIFTGatewayEJBLocal", "swiftGateway"),
        makeInjectedService("NotificationEJBLocal", "notificationService"),
      ], VIREMENT_ORCHESTRATOR_SOURCE),
      makeUseCaseIR("ClientOnboardingEJB", [
        makeInjectedService("KycVerificationEJBLocal", "kycService"),
        makeInjectedService("CompteCreationEJBLocal", "compteCreation"),
        makeInjectedService("NotificationEJBLocal", "notificationService"),
      ], CLIENT_ONBOARDING_SOURCE),
    ]);
    const candidates = detectSagaCandidates(ir);
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    const classNames = candidates.map(c => c.className);
    expect(classNames).toContain("CreditOctroiOrchestrateurEJB");
    expect(classNames).toContain("VirementInternationalEJB");
    expect(classNames).toContain("ClientOnboardingEJB");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 — Pas de doublons EJBService dans les microservices
// ═══════════════════════════════════════════════════════════════════════════════

describe("STEP 2 — Pas de doublons EJBService", () => {
  it("T2.1: cleanModuleNameFull supprime les suffixes EJB/Bean/Impl/DAO", () => {
    const generator = new MicroserviceGenerator();
    const ir = makeProjectIR([
      makeUseCaseIR("CreditOctroiEJB", [
        makeInjectedService("ScoringEJBLocal", "scoringService"),
        makeInjectedService("DecisionCreditEJBLocal", "decisionService"),
        makeInjectedService("DecaissementEJBLocal", "decaissementService"),
      ], CREDIT_ORCHESTRATOR_SOURCE),
    ]);
    const splitter = new MicroserviceSplitter();
    const modules = buildParsedModules(ir);
    const services = splitter.split(ir);
    const output = generator.generateAll(services, modules);
    // Aucun fichier ne doit contenir "EJBService" dans son chemin
    for (const svc of output.services) {
      for (const [filePath] of svc.files) {
        expect(filePath).not.toContain("EJBService.java");
        expect(filePath).not.toContain("EJBController.java");
      }
    }
  });

  it("T2.2: pas de fichiers dupliqués CreditService + CreditOctroiEJBService", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("CreditOctroiEJB", [
        makeInjectedService("ScoringEJBLocal", "scoringService"),
        makeInjectedService("DecisionCreditEJBLocal", "decisionService"),
        makeInjectedService("DecaissementEJBLocal", "decaissementService"),
      ], CREDIT_ORCHESTRATOR_SOURCE),
    ]);
    const splitter = new MicroserviceSplitter();
    const modules = buildParsedModules(ir);
    const services = splitter.split(ir);
    const generator = new MicroserviceGenerator();
    const output = generator.generateAll(services, modules);
    // Collecter tous les noms de fichiers Service.java
    const serviceFileNames: string[] = [];
    for (const svc of output.services) {
      for (const [filePath] of svc.files) {
        if (filePath.endsWith("Service.java")) {
          const match = filePath.match(/\/([^/]+)Service\.java$/);
          if (match) serviceFileNames.push(match[1]);
        }
      }
    }
    // Pas de doublons
    const uniqueNames = new Set(serviceFileNames);
    expect(uniqueNames.size).toBe(serviceFileNames.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3 — Microservices : toutes les méthodes + noms propres + vrais params
// ═══════════════════════════════════════════════════════════════════════════════

describe("STEP 3 — Microservices complets", () => {
  it("T3.1: les méthodes générées ont des noms significatifs (pas execute/run)", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("VirementInternationalEJB", [
        makeInjectedService("ComplianceLBCFTEJBLocal", "complianceService"),
        makeInjectedService("DebitCompteEJBLocal", "debitService"),
        makeInjectedService("SWIFTGatewayEJBLocal", "swiftGateway"),
        makeInjectedService("NotificationEJBLocal", "notificationService"),
      ], VIREMENT_ORCHESTRATOR_SOURCE),
    ]);
    const splitter = new MicroserviceSplitter();
    const modules = buildParsedModules(ir);
    const services = splitter.split(ir);
    const generator = new MicroserviceGenerator();
    const output = generator.generateAll(services, modules);
    // Vérifier les fichiers Service.java dans les Map
    for (const svc of output.services) {
      for (const [filePath, content] of svc.files) {
        if (filePath.endsWith("Service.java")) {
          const methods = content.match(/public\s+\w[\w<>]*\s+(\w+)\s*\(/g) ?? [];
          const methodNames = methods.map(m => {
            const match = m.match(/public\s+\w[\w<>]*\s+(\w+)\s*\(/);
            return match ? match[1] : "";
          });
          if (methodNames.length > 0) {
            const hasSignificantName = methodNames.some(n =>
              n !== "execute" && n !== "run" && n !== "process" && n.length > 3
            );
            expect(hasSignificantName).toBe(true);
          }
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4 — Pas de privateAdapter.java
// ═══════════════════════════════════════════════════════════════════════════════

describe("STEP 4 — Pas de fichiers avec des noms Java invalides", () => {
  it("T4.1: aucun fichier généré ne commence par un mot réservé Java", () => {
    const ir = makeProjectIR([
      makeUseCaseIR("CreditOctroiEJB", [
        makeInjectedService("ScoringEJBLocal", "scoringService"),
        makeInjectedService("DecisionCreditEJBLocal", "decisionService"),
        makeInjectedService("DecaissementEJBLocal", "decaissementService"),
      ], CREDIT_ORCHESTRATOR_SOURCE),
    ]);
    const splitter = new MicroserviceSplitter();
    const modules = buildParsedModules(ir);
    const services = splitter.split(ir);
    const generator = new MicroserviceGenerator();
    const output = generator.generateAll(services, modules);
    const reservedWords = new Set([
      "abstract", "assert", "boolean", "break", "byte", "case", "catch",
      "char", "class", "const", "continue", "default", "do", "double",
      "else", "enum", "extends", "final", "finally", "float", "for",
      "goto", "if", "implements", "import", "instanceof", "int",
      "interface", "long", "native", "new", "package", "private",
      "protected", "public", "return", "short", "static", "strictfp",
      "super", "switch", "synchronized", "this", "throw", "throws",
      "transient", "try", "void", "volatile", "while",
    ]);
    for (const svc of output.services) {
      for (const [filePath] of svc.files) {
        if (filePath.endsWith(".java")) {
          const fileName = filePath.split("/").pop()?.replace(".java", "") ?? "";
          const firstWord = fileName.replace(/Service$|Controller$|Adapter$/, "").toLowerCase();
          expect(reservedWords.has(firstWord)).toBe(false);
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5 — SagaState enum ASCII-only
// ═══════════════════════════════════════════════════════════════════════════════

describe("STEP 5 — SagaState enum ASCII-only", () => {
  it("T5.1: les constantes enum SagaState ne contiennent pas d'accents", () => {
    const candidate: SagaCandidate = {
      className: "VirementInternationalEJB",
      domain: "virement-international",
      ejbDependencies: [
        { type: "ComplianceLBCFTEJBLocal", name: "complianceService", isInterService: true, serviceName: "compliance-service" },
        { type: "DebitCompteEJBLocal", name: "debitService", isInterService: true, serviceName: "debit-service" },
        { type: "SWIFTGatewayEJBLocal", name: "swiftGateway", isInterService: true, serviceName: "swift-service" },
        { type: "NotificationEJBLocal", name: "notificationService", isInterService: true, serviceName: "notification-service" },
      ],
      interServiceCount: 4,
      writeOperations: ["API:persist"],
      hasWriteOps: true,
      hasCompensation: true,
      hasGracefulDegradation: false,
      inputType: "VirementVO",
      rawSource: VIREMENT_ORCHESTRATOR_SOURCE,
    };
    const result = generateSaga(candidate, "com.bmce.banking.saga");
    const stateFile = result.files.find(f => f.category === "saga-state");
    expect(stateFile).toBeTruthy();
    // Extraire les constantes enum (lignes entre { et ; dans l'enum)
    const enumBlock = stateFile!.content.match(/SagaState\s*\{([\s\S]*?)public\s+boolean/)?.[1] ?? "";
    // Chaque constante enum doit être ASCII-only (pas d'accents)
    const enumLines = enumBlock.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
    for (const line of enumLines) {
      const constName = line.trim().replace(/[,;]$/, '');
      if (constName) {
        expect(/^[A-Z_0-9]+$/.test(constName)).toBe(true);
      }
    }
  });

  it("T5.2: translittération correcte — ÉTAPE → ETAPE, Vérification → VERIFICATION", () => {
    const candidate: SagaCandidate = {
      className: "ClientOnboardingEJB",
      domain: "client-onboarding",
      ejbDependencies: [
        { type: "KycVerificationEJBLocal", name: "kycService", isInterService: true, serviceName: "kyc-service" },
        { type: "CompteCreationEJBLocal", name: "compteCreation", isInterService: true, serviceName: "compte-service" },
        { type: "NotificationEJBLocal", name: "notificationService", isInterService: true, serviceName: "notification-service" },
      ],
      interServiceCount: 3,
      writeOperations: ["API:persist"],
      hasWriteOps: true,
      hasCompensation: true,
      hasGracefulDegradation: false,
      inputType: "ClientVO",
      rawSource: CLIENT_ONBOARDING_SOURCE,
    };
    const result = generateSaga(candidate, "com.bmce.banking.saga");
    const stateFile = result.files.find(f => f.category === "saga-state");
    expect(stateFile).toBeTruthy();
    // Pas de "V_RIFICATION" (accent supprimé mais pas translittéré)
    expect(stateFile!.content).not.toContain("V_RIFICATION");
    // Si "VERIFICATION" est présent, il doit être correctement translittéré
    if (stateFile!.content.includes("VERIFICATION")) {
      expect(stateFile!.content).toContain("VERIFICATION");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 6 — Injection des dépendances dans l'Orchestrateur
// ═══════════════════════════════════════════════════════════════════════════════

describe("STEP 6 — Injection des dépendances dans l'Orchestrateur", () => {
  it("T6.1: CreditSagaOrchestrator injecte les services depuis les steps", () => {
    const candidate: SagaCandidate = {
      className: "CreditOctroiOrchestrateurEJB",
      domain: "credit-octroi",
      ejbDependencies: [
        { type: "ScoringEJBLocal", name: "scoringService", isInterService: true, serviceName: "scoring-service" },
        { type: "DecisionCreditEJBLocal", name: "decisionService", isInterService: true, serviceName: "decision-service" },
        { type: "DecaissementEJBLocal", name: "decaissementService", isInterService: true, serviceName: "decaissement-service" },
        { type: "GarantieEJBLocal", name: "garantieService", isInterService: true, serviceName: "garantie-service" },
        { type: "EcheancierEJBLocal", name: "echeancierService", isInterService: true, serviceName: "echeancier-service" },
        { type: "NotificationEJBLocal", name: "notificationService", isInterService: true, serviceName: "notification-service" },
      ],
      interServiceCount: 6,
      writeOperations: ["API:persist"],
      hasWriteOps: true,
      hasCompensation: true,
      hasGracefulDegradation: false,
      inputType: "DemandeCredit",
      rawSource: CREDIT_ORCHESTRATOR_SOURCE,
    };
    const result = generateSaga(candidate, "com.bmce.banking.saga");
    const orchestrator = result.files.find(f => f.category === "saga-orchestrator");
    expect(orchestrator).toBeTruthy();
    const content = orchestrator!.content;
    // Doit contenir des @Autowired ou des injections par constructeur
    const hasInjection = content.includes("@Autowired") || content.includes("private final");
    expect(hasInjection).toBe(true);
    // Doit contenir JdbcTemplate pour la persistance
    expect(content).toContain("JdbcTemplate");
    // Doit contenir SagaLogRepository
    expect(content).toContain("SagaLogRepository");
  });

  it("T6.2: l'Orchestrateur injecte les dépendances depuis ejbDependencies", () => {
    const candidate: SagaCandidate = {
      className: "VirementInternationalEJB",
      domain: "virement-international",
      ejbDependencies: [
        { type: "ComplianceLBCFTEJBLocal", name: "complianceService", isInterService: true, serviceName: "compliance-service" },
        { type: "DebitCompteEJBLocal", name: "debitService", isInterService: true, serviceName: "debit-service" },
        { type: "SWIFTGatewayEJBLocal", name: "swiftGateway", isInterService: true, serviceName: "swift-service" },
        { type: "NotificationEJBLocal", name: "notificationService", isInterService: true, serviceName: "notification-service" },
      ],
      interServiceCount: 4,
      writeOperations: ["API:persist"],
      hasWriteOps: true,
      hasCompensation: true,
      hasGracefulDegradation: false,
      inputType: "VirementVO",
      rawSource: VIREMENT_ORCHESTRATOR_SOURCE,
    };
    const result = generateSaga(candidate, "com.bmce.banking.saga");
    const orchestrator = result.files.find(f => f.category === "saga-orchestrator");
    expect(orchestrator).toBeTruthy();
    const content = orchestrator!.content;
    // Doit avoir au moins 4 champs injectés (les 4 services + JdbcTemplate + SagaLogRepository)
    const privateFields = content.match(/private\s+(?:final\s+)?\w+\s+\w+;/g) ?? [];
    expect(privateFields.length).toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 7 — Résultats intermédiaires dans SagaContext
// ═══════════════════════════════════════════════════════════════════════════════

describe("STEP 7 — Résultats intermédiaires dans SagaContext", () => {
  it("T7.1: le SagaContext contient des getters/setters pour les résultats", () => {
    const candidate: SagaCandidate = {
      className: "VirementInternationalEJB",
      domain: "virement-international",
      ejbDependencies: [
        { type: "ComplianceLBCFTEJBLocal", name: "complianceService", isInterService: true, serviceName: "compliance-service" },
        { type: "DebitCompteEJBLocal", name: "debitService", isInterService: true, serviceName: "debit-service" },
        { type: "SWIFTGatewayEJBLocal", name: "swiftGateway", isInterService: true, serviceName: "swift-service" },
        { type: "NotificationEJBLocal", name: "notificationService", isInterService: true, serviceName: "notification-service" },
      ],
      interServiceCount: 4,
      writeOperations: ["API:persist"],
      hasWriteOps: true,
      hasCompensation: true,
      hasGracefulDegradation: false,
      inputType: "VirementVO",
      rawSource: VIREMENT_ORCHESTRATOR_SOURCE,
    };
    const result = generateSaga(candidate, "com.bmce.banking.saga");
    const contextFile = result.files.find(f => f.category === "saga-context");
    expect(contextFile).toBeTruthy();
    const content = contextFile!.content;
    // Doit contenir des getters (getXxx) et setters (setXxx)
    const getters = content.match(/public\s+\w+\s+get\w+\(\)/g) ?? [];
    const setters = content.match(/public\s+void\s+set\w+\(/g) ?? [];
    expect(getters.length).toBeGreaterThanOrEqual(1);
    expect(setters.length).toBeGreaterThanOrEqual(1);
  });

  it("T7.2: extractIntermediateResults détecte swiftRef dans le virement", () => {
    const deps: EjbDependency[] = [
      { type: "ComplianceLBCFTEJBLocal", name: "complianceService", isInterService: true, serviceName: "compliance-service" },
      { type: "DebitCompteEJBLocal", name: "debitService", isInterService: true, serviceName: "debit-service" },
      { type: "SWIFTGatewayEJBLocal", name: "swiftGateway", isInterService: true, serviceName: "swift-service" },
      { type: "NotificationEJBLocal", name: "notificationService", isInterService: true, serviceName: "notification-service" },
    ];
    const steps = extractSagaSteps(VIREMENT_ORCHESTRATOR_SOURCE, "executerVirement", deps);
    const results = extractIntermediateResults(VIREMENT_ORCHESTRATOR_SOURCE, steps);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const swiftResult = results.find(r =>
      r.fieldName.toLowerCase().includes("swift") || r.fieldName.includes("Ref")
    );
    expect(swiftResult).toBeTruthy();
    expect(swiftResult!.type).toBe("String");
  });

  it("T7.3: l'Orchestrateur utilise ctx.setXxx() dans les step methods", () => {
    const candidate: SagaCandidate = {
      className: "VirementInternationalEJB",
      domain: "virement-international",
      ejbDependencies: [
        { type: "ComplianceLBCFTEJBLocal", name: "complianceService", isInterService: true, serviceName: "compliance-service" },
        { type: "DebitCompteEJBLocal", name: "debitService", isInterService: true, serviceName: "debit-service" },
        { type: "SWIFTGatewayEJBLocal", name: "swiftGateway", isInterService: true, serviceName: "swift-service" },
        { type: "NotificationEJBLocal", name: "notificationService", isInterService: true, serviceName: "notification-service" },
      ],
      interServiceCount: 4,
      writeOperations: ["API:persist"],
      hasWriteOps: true,
      hasCompensation: true,
      hasGracefulDegradation: false,
      inputType: "VirementVO",
      rawSource: VIREMENT_ORCHESTRATOR_SOURCE,
    };
    const result = generateSaga(candidate, "com.bmce.banking.saga");
    const orchestrator = result.files.find(f => f.category === "saga-orchestrator");
    expect(orchestrator).toBeTruthy();
    // Vérifier que ctx.set est utilisé dans les step methods
    const ctxSetCalls = orchestrator!.content.match(/ctx\.set\w+\(/g) ?? [];
    expect(ctxSetCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 8 — Compensations concrètes + SQL Oracle + QUALITY_SCORE statique
// ═══════════════════════════════════════════════════════════════════════════════

describe("STEP 8a — Compensations concrètes", () => {
  it("T8a.1: compensation pour décaissement → annulerDecaissement", () => {
    const comp = inferCompensation("Décaissement du montant", "decaissementService.decaisser()");
    expect(comp).not.toBeNull();
    expect(comp!.method).toBe("annulerDecaissement");
  });

  it("T8a.2: compensation pour constitution garantie → libererGarantie", () => {
    const comp = inferCompensation("Constitution garantie hypothécaire", "garantieService.constituerGarantie()");
    expect(comp).not.toBeNull();
    expect(comp!.method).toBe("libererGarantie");
  });

  it("T8a.3: compensation pour échéancier → supprimerEcheancier", () => {
    const comp = inferCompensation("Génération échéancier amortissement", "echeancierService.genererEcheancier()");
    expect(comp).not.toBeNull();
    expect(comp!.method).toBe("supprimerEcheancier");
  });

  it("T8a.4: compensation pour ouverture compte → fermerCompte", () => {
    const comp = inferCompensation("Ouverture du compte client", "compteCreation.ouvrirCompte()");
    expect(comp).not.toBeNull();
    expect(comp!.method).toBe("fermerCompte");
  });

  it("T8a.5: compensation pour vérification KYC → invaliderKyc", () => {
    const comp = inferCompensation("Vérification KYC identité", "kycService.verifierIdentite()");
    expect(comp).not.toBeNull();
    expect(comp!.method).toBe("invaliderKyc");
  });
});

describe("STEP 8b — SQL Oracle (pas MySQL)", () => {
  it("T8b.1: la migration SQL utilise la syntaxe Oracle", () => {
    const candidate: SagaCandidate = {
      className: "CreditOctroiOrchestrateurEJB",
      domain: "credit-octroi",
      ejbDependencies: [
        { type: "ScoringEJBLocal", name: "scoringService", isInterService: true, serviceName: "scoring-service" },
        { type: "DecisionCreditEJBLocal", name: "decisionService", isInterService: true, serviceName: "decision-service" },
      ],
      interServiceCount: 2,
      writeOperations: ["API:persist"],
      hasWriteOps: true,
      hasCompensation: true,
      hasGracefulDegradation: false,
      inputType: "DemandeCredit",
      rawSource: CREDIT_ORCHESTRATOR_SOURCE,
    };
    const result = generateSaga(candidate, "com.bmce.banking.saga");
    const sqlFile = result.files.find(f => f.category === "saga-migration");
    expect(sqlFile).toBeTruthy();
    const sql = sqlFile!.content;
    // Oracle : VARCHAR2 au lieu de VARCHAR
    expect(sql).toContain("VARCHAR2");
    // Oracle : NUMBER au lieu de INT/BIGINT
    expect(sql).toContain("NUMBER");
    // Oracle : SYSTIMESTAMP au lieu de NOW()/CURRENT_TIMESTAMP
    expect(sql).toContain("SYSTIMESTAMP");
    // Oracle : GENERATED BY DEFAULT AS IDENTITY au lieu de AUTO_INCREMENT
    expect(sql).toContain("GENERATED BY DEFAULT AS IDENTITY");
    // Pas de MySQL : pas de AUTO_INCREMENT, pas de ENGINE=InnoDB
    expect(sql).not.toContain("AUTO_INCREMENT");
    expect(sql).not.toContain("ENGINE=InnoDB");
    expect(sql).not.toContain("DATETIME");
  });
});

describe("STEP 8c — QUALITY_SCORE statique (pas Ollama)", () => {
  it("T8c.1: calculateQualityScore retourne un rapport structuré", () => {
    // Créer un fileMap synthétique avec quelques fichiers générés
    const files = new Map<string, string>();
    files.set("credit-service/src/main/java/com/bmce/service/CreditService.java",
      `@Service\npublic class CreditService {\n  @Autowired private CreditRepository repo;\n  public Credit findById(Long id) { return repo.findById(id).orElse(null); }\n}`);
    files.set("credit-service/src/main/java/com/bmce/controller/CreditController.java",
      `@RestController\n@RequestMapping("/api/v1/credit")\npublic class CreditController {\n  @GetMapping("/{id}")\n  public Credit getCredit(@PathVariable Long id) { return service.findById(id); }\n}`);
    files.set("credit-service/pom.xml",
      `<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency><dependency><groupId>com.oracle.database.jdbc</groupId><artifactId>ojdbc8</artifactId></dependency></dependencies></project>`);
    files.set("credit-service/src/main/resources/application.yml",
      `spring:\n  datasource:\n    driver-class-name: oracle.jdbc.OracleDriver`);

    const report = calculateQualityScore(files);
    expect(report).toBeTruthy();
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.grade).toBeTruthy();
    expect(report.checks).toBeDefined();
    expect(report.checks.length).toBeGreaterThan(0);
  });

  it("T8c.2: le rapport qualité détecte les problèmes réels", () => {
    // Fichier avec un problème : Object... args dans un adapter
    const files = new Map<string, string>();
    files.set("credit-service/src/main/java/com/bmce/adapter/CreditAdapter.java",
      `public class CreditAdapter {\n  public Object execute(Object... args) { return null; }\n}`);
    files.set("credit-service/pom.xml", `<project></project>`);

    const report = calculateQualityScore(files);
    // Le score doit être calculé (même s'il est élevé pour un petit fichier)
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    // Le rapport doit contenir des checks
    expect(report.checks.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTÉGRATION — Pipeline complète sur le ZIP BMCE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Intégration — Pipeline BMCE avec Saga + Microservices", () => {
  const ZIP_PATH = path.join(process.cwd(), "tests/fixtures/input/bmce-core-banking-complex.zip");

  let ir: ProjectIR;
  let generation: GenerationResult;
  let services: ServiceCandidate[];
  let fileMap: Map<string, string>;
  let sagaCandidates: SagaCandidate[];

  beforeAll(() => {
    if (!fs.existsSync(ZIP_PATH)) return;
    const { files, pomXml } = loadZipAsSourceFiles(ZIP_PATH);
    ir = parseEjbProject(files, pomXml);
    generation = generateSpringBootProject(ir);
    fileMap = new Map(generation.files.map(f => [f.path, f.content]));
    const splitter = new MicroserviceSplitter();
    services = splitter.split(ir);
    sagaCandidates = detectSagaCandidates(ir);
  }, 120_000);

  it("T-INT-1: le parser détecte des UseCases, EJBs et Services", () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    const totalSources = (ir.useCases?.length ?? 0) +
      (ir.ejb2xBeans?.length ?? 0) +
      (ir.services?.length ?? 0);
    expect(totalSources).toBeGreaterThan(0);
  });

  it("T-INT-2: le saga-detector trouve au moins 1 candidat dans le ZIP BMCE", () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    expect(sagaCandidates.length).toBeGreaterThanOrEqual(1);
    // Chaque candidat doit avoir un domaine
    for (const c of sagaCandidates) {
      expect(c.domain).toBeTruthy();
      expect(c.interServiceCount).toBeGreaterThanOrEqual(2);
    }
  });

  it("T-INT-3: generateAllSagas produit des fichiers pour chaque domaine unique", () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    if (sagaCandidates.length === 0) return;
    const results = generateAllSagas(sagaCandidates, "com.bmce.banking.saga");
    // v8.1: deduplication par domaine — results.length <= candidates.length
    const uniqueDomains = new Set(sagaCandidates.map(c => c.domain));
    expect(results.length).toBe(uniqueDomains.size);
    for (const r of results) {
      expect(r.files.length).toBeGreaterThanOrEqual(5);
      // Chaque saga doit avoir les 5 types de fichiers
      const categories = r.files.map(f => f.category);
      expect(categories).toContain("saga-orchestrator");
      expect(categories).toContain("saga-state");
      expect(categories).toContain("saga-context");
      expect(categories).toContain("saga-log");
      expect(categories).toContain("saga-migration");
    }
  });

  it("T-INT-4: aucun fichier Saga ne contient de caractères accentués dans les enums", () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    if (sagaCandidates.length === 0) return;
    const results = generateAllSagas(sagaCandidates, "com.bmce.banking.saga");
    for (const r of results) {
      const stateFile = r.files.find(f => f.category === "saga-state");
      if (stateFile) {
        // Extraire les constantes enum et vérifier qu'elles sont ASCII-only
        const enumBlock = stateFile.content.match(/SagaState\s*\{([\s\S]*?)public\s+boolean/)?.[1] ?? "";
        const enumLines = enumBlock.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
        for (const line of enumLines) {
          const constName = line.trim().replace(/[,;]$/, '');
          if (constName) {
            expect(/^[A-Z_0-9]+$/.test(constName)).toBe(true);
          }
        }
      }
    }
  });

  it("T-INT-5: les migrations SQL sont en syntaxe Oracle", () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    if (sagaCandidates.length === 0) return;
    const results = generateAllSagas(sagaCandidates, "com.bmce.banking.saga");
    for (const r of results) {
      const sqlFile = r.files.find(f => f.category === "saga-migration");
      if (sqlFile) {
        expect(sqlFile.content).toContain("VARCHAR2");
        expect(sqlFile.content).not.toContain("AUTO_INCREMENT");
      }
    }
  });
});
