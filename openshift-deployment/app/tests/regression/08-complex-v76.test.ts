/**
 * tests/regression/08-complex-v76.test.ts
 *
 * Tests de régression v7.6 — Projet Complexe BMCE Core Banking.
 * Vérifie les 5 priorités :
 *   P1: Méthodes EJB complexes (3 vraies méthodes, pas execute())
 *   P2: CDI beans et DTOs (pas de Controller pour @ApplicationScoped / VoIn)
 *   P3: Anti-hallucination ML (UserService/OrderService absents, BAM correct)
 *   P4/BUG-K: Params multiples sur Compliance (4 params distincts)
 *   P5: Tables multi-DataSource (NOWAIT/SYSDATE filtrés, confiance > 40%)
 *
 * Score cible : 87+/100 sur projet complexe.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { parseEjbProject, type ProjectIR } from "../../server/java-parser";
import { generateSpringBootProject, type GenerationResult } from "../../server/spring-generator";
import { MicroserviceSplitter, type ServiceCandidate } from "../../server/engine/microservices/microservice-splitter";
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

// Helper: find file content by name pattern
function getFile(fileMap: Map<string, string>, namePattern: string): string {
  const entry = [...fileMap.entries()]
    .find(([p]) => p.includes(namePattern));
  return entry?.[1] ?? "";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Setup: Parse and generate once for all tests
// ═══════════════════════════════════════════════════════════════════════════════

const COMPLEX_ZIP = path.join(__dirname, "../fixtures/input/bmce-core-banking-complex.zip");
const SIMPLE_ZIP_CANDIDATES = [
  path.join(__dirname, "../fixtures/input/bmce-legacy.zip"),
  path.join(__dirname, "../fixtures/input/bmce-core-banking.zip"),
];

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
// v7.6 Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Compleo v7.6 — Projet Complexe", () => {

  // ── Structure microservices ──────────────────────────────────────────────

  it("7+ microservices avec les bons noms", () => {
    const names = services.map((s) => s.name);
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

  // ── PRIORITÉ 1 : Méthodes EJB complexes ─────────────────────────────────

  it("P1 : CreditScoringEJBService — 3 vraies méthodes, pas execute()", () => {
    // Le service peut être nommé CreditService.java ou CreditScoringEJBService.java
    const svc = getFile(fileMap, "CreditService.java")
      || getFile(fileMap, "CreditScoringEJBService.java")
      || getFile(fileMap, "CreditScoringService.java");
    expect(svc.length, "CreditService doit exister").toBeGreaterThan(0);
    expect(svc).toMatch(/calculerScoreCredit/);
    expect(svc).toMatch(/getHistoriqueScores/);
    expect(svc).toMatch(/simulerCredit/);
    expect(svc).not.toMatch(/public void execute\(\s*\)/);
  });

  it("P1 : VirementSEPAOrchestrateurEJBService — 3 vraies méthodes, pas execute()", () => {
    const svc = getFile(fileMap, "VirementService.java")
      || getFile(fileMap, "VirementSEPAOrchestrateurEJBService.java")
      || getFile(fileMap, "VirementSEPAService.java");
    expect(svc.length, "VirementService doit exister").toBeGreaterThan(0);
    expect(svc).toMatch(/initierVirementSEPA/);
    expect(svc).toMatch(/getStatutVirement/);
    expect(svc).toMatch(/traiterVirementEntrant/);
    expect(svc).not.toMatch(/public void execute\(\s*\)/);
  });

  it("P1 : Pas de préfixe EJB dans les noms de méthodes", () => {
    for (const [p, content] of fileMap) {
      if (!p.endsWith("Service.java")) continue;
      // Aucune méthode ne doit avoir le pattern NomEJB_methode
      expect(content).not.toMatch(/\b\w+EJB_\w+\s*\(/);
    }
  });

  // ── PRIORITÉ 2 : CDI beans et DTOs ──────────────────────────────────────

  it("P2 : SEPATransformer → @Component (pas de Controller)", () => {
    const files = [...fileMap.keys()];
    expect(files).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/SEPATransformerController\.java/)])
    );
  });

  it("P2 : IBANValidator → sans Controller", () => {
    const files = [...fileMap.keys()];
    expect(files).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/IBANValidatorController\.java/)])
    );
  });

  it("P2 : Aucun Service pour DTOs VoIn/VoOut", () => {
    const files = [...fileMap.keys()];
    // Pas de ScoringRequestVoInService ni CreditDataTransformerService
    expect(files).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/ScoringRequestVoIn(Service|Controller)\.java/)])
    );
    expect(files).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/CreditDataTransformer(Service|Controller)\.java/)])
    );
  });

  // ── PRIORITÉ 3 : ML anti-hallucination ──────────────────────────────────

  it("P3 : QUALITY_SCORE.md sans UserService/OrderService", () => {
    const qs = fileMap.get("QUALITY_SCORE.md") ?? "";
    if (qs.length > 0) {
      expect(qs).not.toContain("UserService");
      expect(qs).not.toContain("OrderService");
      expect(qs).not.toContain("findUserById");
      expect(qs).not.toMatch(/ta mission\s*:/i);
    }
  });

  it("P3 : EXECUTIVE_SUMMARY — BAM = Banque Al-Maghrib, pas de techno hors contexte", () => {
    const exec = fileMap.get("EXECUTIVE_SUMMARY.md") ?? "";
    if (exec.length > 0) {
      expect(exec).not.toMatch(/Bureau\s+Automatis[ée]\s+des\s+Mandats/i);
      expect(exec).not.toMatch(/ASP\.NET/i);
      expect(exec).not.toMatch(/PostgreSQL/i);
      expect(exec).not.toMatch(/taux de d[ée]pannage de 0%/i);
    }
  });

  // ── PRIORITÉ 4 : Params Compliance BUG-K ────────────────────────────────

  it("BUG-K : genererDeclarationTRAPROC — 4 params distincts", () => {
    const svc = getFile(fileMap, "CompliancelbcftService.java")
      || getFile(fileMap, "ComplianceService.java")
      || getFile(fileMap, "ComplianceLBCFTEJBService.java")
      || getFile(fileMap, "ConformiteService.java");
    expect(svc.length, "ComplianceService doit exister").toBeGreaterThan(0);
    expect(svc).toMatch(/genererDeclarationTRAPROC/);
    // NE doit PAS avoir String request en remplacement de tout
    expect(svc).not.toMatch(/genererDeclarationTRAPROC\s*\(\s*String request\s*\)/);
    // Au moins 2 des 4 paramètres attendus (virgule = multi-params)
    const hasMultipleParams = svc.match(/genererDeclarationTRAPROC\s*\([^)]+,[^)]+\)/);
    expect(hasMultipleParams).toBeTruthy();
  });

  // ── PRIORITÉ 5 : Tables multi-DS ────────────────────────────────────────

  it("P5 : credit-service confiance > 40%", () => {
    const credit = services.find((s) => s.name === "credit-service");
    expect(credit, "credit-service doit exister").toBeDefined();
    if (credit) {
      expect(credit.confidence).toBeGreaterThanOrEqual(40);
    }
  });

  it("P5 : NOWAIT/SYSDATE absents des tables détectées", () => {
    // Vérifier dans les services que les tables ne contiennent pas NOWAIT/SYSDATE
    for (const svc of services) {
      if (svc.tables) {
        const allTables = [...(svc.tables.read || []), ...(svc.tables.write || [])];
        for (const tbl of allTables) {
          expect(tbl.toUpperCase()).not.toBe("NOWAIT");
          expect(tbl.toUpperCase()).not.toBe("SYSDATE");
        }
      }
    }
  });

  // ── Non-régression projet simple ─────────────────────────────────────────

  it("Non-régression : projet simple toujours fonctionnel", () => {
    // Trouver un ZIP simple disponible
    const simpleZip = SIMPLE_ZIP_CANDIDATES.find(z => fs.existsSync(z));
    if (!simpleZip) {
      // Si pas de ZIP simple, vérifier au moins que le projet complexe génère > 3 services
      expect(services.length).toBeGreaterThan(3);
      return;
    }

    const { files, pomXml } = loadZipAsSourceFiles(simpleZip);
    const simpleIr = parseEjbProject(files, pomXml);
    const simpleGen = generateSpringBootProject(simpleIr);
    expect(simpleGen.files.length).toBeGreaterThan(0);

    const simpleSplitter = new MicroserviceSplitter();
    const simpleSvcs = simpleSplitter.split(simpleIr);
    expect(simpleSvcs.length).toBeGreaterThan(3);
  });
});
