/**
 * tests/regression/07-complex-project.test.ts
 *
 * Tests de régression v7.5 — Projet Complexe BMCE Core Banking.
 * Vérifie les 10 bugs (BUG-A à BUG-J) corrigés pour les projets complexes
 * avec classes internes, CDI beans, DTOs multiples, multi-DataSource, etc.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { parseEjbProject, type ProjectIR } from "../../server/java-parser";
import { generateSpringBootProject, type GenerationResult } from "../../server/spring-generator";
import { MicroserviceSplitter, type ServiceCandidate, extractAllTablesFromClass } from "../../server/engine/microservices/microservice-splitter";
import AdmZip from "adm-zip";
import * as path from "path";
import * as fs from "fs";

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Load ZIP into SourceFile[] format
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
      if (entry.entryName.endsWith("pom.xml")) {
        pomXml = content;
      }
      files.push({ path: entry.entryName, content });
    }
  }
  return { files, pomXml };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Setup: Parse and generate once for all tests
// ═══════════════════════════════════════════════════════════════════════════════

const COMPLEX_ZIP = path.join(__dirname, "../fixtures/input/bmce-core-banking-complex.zip");

let ir: ProjectIR;
let generation: GenerationResult;
let services: ServiceCandidate[];
let fileMap: Map<string, string>;

beforeAll(() => {
  // Verify ZIP exists
  expect(fs.existsSync(COMPLEX_ZIP), "ZIP fixture bmce-core-banking-complex.zip manquant").toBe(true);

  // Load and parse
  const { files, pomXml } = loadZipAsSourceFiles(COMPLEX_ZIP);
  ir = parseEjbProject(files, pomXml);

  // Generate Spring Boot project
  generation = generateSpringBootProject(ir);

  // Build file map for easy lookup
  fileMap = new Map(generation.files.map(f => [f.path, f.content]));

  // Run microservice splitter
  const splitter = new MicroserviceSplitter();
  services = splitter.split(ir);
}, 120_000);

// ═══════════════════════════════════════════════════════════════════════════════
// Microservices — noms corrects
// ═══════════════════════════════════════════════════════════════════════════════

describe("Compleo v7.5 — Projet Complexe BMCE", () => {

  it("Au moins 6 microservices avec les bons noms", () => {
    const names = services.map(s => s.name).sort();
    expect(names.length).toBeGreaterThanOrEqual(6);
    expect(names).toContain("credit-service");
    expect(names).toContain("notification-service");
    expect(names).toContain("virement-service");
    expect(names).toContain("risque-service");
    expect(names).toContain("batch-service");
    // conformite ou compliance
    const hasConformite = names.some(n => /conformite|compliance/i.test(n));
    expect(hasConformite, "Doit avoir un service conformité/compliance").toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUG-A : Pas de Service pour les classes internes privées
  // ═══════════════════════════════════════════════════════════════════════════

  describe("BUG-A : Filtrer les classes internes privées", () => {

    it("Pas de Service pour ScoringContext (inner class de CreditScoringEJB)", () => {
      const files = [...fileMap.keys()];
      const scoringContextFiles = files.filter(f =>
        /ScoringContext(Service|Controller)\.java/.test(f)
      );
      expect(scoringContextFiles).toHaveLength(0);
    });

    it("Pas de Service pour CLOTransactionItem (inner class de CLOBatch)", () => {
      const files = [...fileMap.keys()];
      const cloItemFiles = files.filter(f =>
        /CLOTransactionItem(Service|Controller)\.java/.test(f)
      );
      expect(cloItemFiles).toHaveLength(0);
    });

    it("CreditService a les 3 vraies méthodes (calculerScoreCredit, getHistoriqueScores, simulerCredit)", () => {
      // Le service est nommé CreditService.java (pas CreditScoringEJBService.java)
      const svcEntry = [...fileMap.entries()]
        .find(([p]) => p.includes("CreditService.java") || (p.includes("Credit") && p.includes("Service.java")));
      expect(svcEntry, "CreditService.java doit exister").toBeDefined();
      const svc = svcEntry![1];
      expect(svc).toMatch(/calculerScoreCredit/);
      expect(svc).toMatch(/getHistoriqueScores/);
      expect(svc).toMatch(/simulerCredit/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUG-B : CDI @ApplicationScoped → @Component, pas de Controller
  // ═══════════════════════════════════════════════════════════════════════════

  describe("BUG-B : Distinguer CDI @ApplicationScoped de @Stateless EJB", () => {

    it("SEPATransformer → pas de Controller généré", () => {
      const files = [...fileMap.keys()];
      const sepaControllerFiles = files.filter(f =>
        /SEPATransformerController\.java/.test(f)
      );
      expect(sepaControllerFiles).toHaveLength(0);
    });

    it("SEPATransformer → @Component ou @Service (pas @RestController)", () => {
      const comp = [...fileMap.entries()]
        .find(([p]) => p.includes("SEPATransformer") && !p.includes("Controller") && p.endsWith(".java"));
      if (comp) {
        expect(comp[1]).toMatch(/@Component|@Service/);
        expect(comp[1]).not.toContain("@RestController");
      }
    });

    it("IBANValidator → pas de Controller généré", () => {
      const files = [...fileMap.keys()];
      const ibanControllerFiles = files.filter(f =>
        /IBANValidatorController\.java/.test(f)
      );
      expect(ibanControllerFiles).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUG-C : Aucun Service pour les DTOs VoIn/VoOut
  // ═══════════════════════════════════════════════════════════════════════════

  describe("BUG-C : Filtrer les DTOs du pipeline EJB", () => {

    it("Aucun Service généré pour ScoringRequestVoIn", () => {
      const files = [...fileMap.keys()];
      const voInServiceFiles = files.filter(f =>
        /ScoringRequestVoIn(Service|Controller)\.java/.test(f)
      );
      expect(voInServiceFiles).toHaveLength(0);
    });

    it("Aucun Service généré pour SimulationCreditVoIn", () => {
      const files = [...fileMap.keys()];
      const simServiceFiles = files.filter(f =>
        /SimulationCreditVoIn(Service|Controller)\.java/.test(f)
      );
      expect(simServiceFiles).toHaveLength(0);
    });

    it("Les DTOs sont bien générés comme DTOs (pas comme Services)", () => {
      // Vérifier que les DTOs du AllDTOs.java ne sont pas traités comme des Services
      const dtoServiceFiles = [...fileMap.keys()].filter(f =>
        /(VoIn|VoOut)(Service|Controller)\.java/.test(f)
      );
      expect(dtoServiceFiles).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUG-D : Kafka topics dédupliqués
  // ═══════════════════════════════════════════════════════════════════════════

  describe("BUG-D : Dédupliquer les Kafka topics", () => {

    it("virement-service n'a pas de Kafka topics dupliqués", () => {
      const vir = services.find(s => s.name === "virement-service");
      if (vir && vir.kafkaTopics && vir.kafkaTopics.length > 0) {
        const topicKeys = vir.kafkaTopics.map(t => `${t.direction}_${t.name}`);
        const unique = new Set(topicKeys);
        expect(unique.size).toBe(topicKeys.length);
      }
    });

    it("Aucun microservice n'a de topics Kafka dupliqués", () => {
      for (const svc of services) {
        if (svc.kafkaTopics && svc.kafkaTopics.length > 0) {
          const topicKeys = svc.kafkaTopics.map(t => `${t.direction}_${t.name}`);
          const unique = new Set(topicKeys);
          expect(unique.size, `${svc.name} a des topics dupliqués`).toBe(topicKeys.length);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUG-E/J : DashboardOperateurServlet → ops-service (pas auth-service)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("BUG-E/J : Servlet sans domaine → ops-service", () => {

    it("DashboardOperateurServlet pas dans auth-service", () => {
      const report = fileMap.get("MICROSERVICES_REPORT.md") ?? "";
      if (report.includes("auth-service")) {
        const authSection = report.split("### auth-service")[1]?.split("###")[0] ?? "";
        expect(authSection).not.toContain("DashboardOperateur");
      }
    });

    it("Servlet dashboard dans un service dédié ou ops-service (pas auth)", () => {
      // Le DashboardOperateurServlet doit être soit dans ops-service,
      // soit dans un service qui n'est pas auth-service
      const authService = services.find(s => s.name === "auth-service");
      if (authService && authService.modules) {
        const authModules = authService.modules.map(m => (m.className || m.ejbId || "").toLowerCase());
        expect(authModules.some(n => n.includes("dashboard"))).toBe(false);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUG-F : Capturer toutes les tables multi-DataSource
  // ═══════════════════════════════════════════════════════════════════════════

  describe("BUG-F : Capturer toutes les tables (méthodes privées incluses)", () => {

    it("extractAllTablesFromClass extrait les tables des méthodes privées", () => {
      // Charger le source de CreditScoringEJB
      const { files } = loadZipAsSourceFiles(COMPLEX_ZIP);
      const creditFile = files.find(f => f.path.includes("CreditScoringEJB.java"));
      expect(creditFile, "CreditScoringEJB.java doit exister dans le ZIP").toBeDefined();

      const tables = extractAllTablesFromClass(creditFile!.content);
      const allTables = [...tables.read, ...tables.write];
      // Doit avoir des tables (au minimum CREDIT_SCORING, HISTORIQUE_SCORES)
      expect(allTables.length).toBeGreaterThan(0);
    });

    it("credit-service confiance >= 40%", () => {
      const credit = services.find(s => s.name === "credit-service");
      expect(credit, "credit-service doit exister").toBeDefined();
      expect(credit!.confidence).toBeGreaterThanOrEqual(40);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUG-G/H : Validation ML output (prompt leak + hallucinations)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("BUG-G/H : Validation ML output", () => {

    it("BUG-G : QUALITY_SCORE.md sans prompt leak", () => {
      const qs = fileMap.get("QUALITY_SCORE.md") ?? "";
      if (qs.length > 0) {
        expect(qs).not.toMatch(/ta mission\s*:/i);
        expect(qs).not.toMatch(/génère un/i);
        expect(qs).not.toMatch(/tu es un/i);
        expect(qs).not.toMatch(/en tant qu'expert/i);
      }
    });

    it("BUG-H : QUALITY_SCORE.md sans hallucinations", () => {
      const qs = fileMap.get("QUALITY_SCORE.md") ?? "";
      if (qs.length > 0) {
        expect(qs).not.toMatch(/jenkins/i);
        expect(qs).not.toMatch(/tomcat/i);
      }
    });

    it("MIGRATION_REPORT.md sans prompt leak", () => {
      const mr = fileMap.get("MIGRATION_REPORT.md") ?? "";
      if (mr.length > 0) {
        expect(mr).not.toMatch(/ta mission\s*:/i);
        expect(mr).not.toMatch(/tu es un/i);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUG-I : Méthodes complexes → stub structuré
  // ═══════════════════════════════════════════════════════════════════════════

  describe("BUG-I : Méthodes complexes → stub structuré", () => {

    it("initierVirementSEPA a sa vraie signature (pas execute())", () => {
      // Le service est nommé VirementService.java
      const svcEntry = [...fileMap.entries()]
        .find(([p]) => (p.includes("Virement") && p.includes("Service.java")));
      if (svcEntry) {
        const svc = svcEntry[1];
        expect(svc).toMatch(/initierVirementSEPA/);
      }
    });

    it("Méthode complexe a des étapes commentées ou TODO structuré", () => {
      const svcEntry = [...fileMap.entries()]
        .find(([p]) => (p.includes("Virement") && p.includes("Service.java")));
      if (svcEntry) {
        const svc = svcEntry[1];
        // Doit avoir des étapes commentées ou des TODOs structurés
        expect(svc).toMatch(/ÉTAPE|Phase|TODO|Step/i);
      }
    });

    it("CreditService a les 3 méthodes (pas execute())", () => {
      const svcEntry = [...fileMap.entries()]
        .find(([p]) => p.includes("CreditService.java") || (p.includes("Credit") && p.includes("Service.java")));
      expect(svcEntry, "CreditService.java doit exister").toBeDefined();
      const svc = svcEntry![1];
      expect(svc).toMatch(/calculerScoreCredit/);
      expect(svc).toMatch(/getHistoriqueScores/);
      expect(svc).toMatch(/simulerCredit/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Invariants globaux
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Invariants globaux projet complexe", () => {

    it("Génère un pom.xml", () => {
      expect(fileMap.has("pom.xml")).toBe(true);
    });

    it("Génère un MIGRATION_REPORT.md", () => {
      const hasReport = [...fileMap.keys()].some(f => f.includes("MIGRATION_REPORT"));
      expect(hasReport).toBe(true);
    });

    it("Aucun fichier Java vide", () => {
      for (const [path, content] of fileMap.entries()) {
        if (path.endsWith(".java")) {
          expect(content.length, `${path} est vide`).toBeGreaterThan(10);
        }
      }
    });

    it("Score de génération > 0", () => {
      expect(generation.stats.totalFiles).toBeGreaterThan(0);
      expect(generation.stats.services).toBeGreaterThan(0);
    });
  });
});
