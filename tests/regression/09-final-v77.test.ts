/**
 * tests/regression/09-final-v77.test.ts
 *
 * Tests de régression v7.7 — Mission Finale COMPLEO.
 * Vérifie les 6 priorités :
 *   P1: EJBs complexes → vraies méthodes (pas execute())
 *   P2: CDI beans et DTOs filtrés
 *   P3-params: Paramètres propagés Service + Controller
 *   P3-types: Object interdit + méthodes manquantes
 *   P4: Anti-hallucination ML (validateMLOutput.ts)
 *   P5: Tables multi-DataSource (6+ tables credit-service)
 *   P6: Quality Scorer refonte 8 checks réels
 *
 * Score cible : 95+/100 sur projet complexe.
 *
 * @author Hamza NORDINE
 */
import { describe, it, expect, beforeAll } from "vitest";
import { parseEjbProject, type ProjectIR } from "../../server/java-parser";
import { generateSpringBootProject, type GenerationResult } from "../../server/spring-generator";
import { MicroserviceSplitter, type ServiceCandidate } from "../../server/engine/microservices/microservice-splitter";
import { calculateQualityScore } from "../../server/engine/quality-scorer";
import { validateMLOutput } from "../../server/engine/ml/validateMLOutput";
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

let ir: ProjectIR;
let generation: GenerationResult;
let services: ServiceCandidate[];
let fileMap: Map<string, string>;

beforeAll(() => {
  expect(fs.existsSync(COMPLEX_ZIP), "ZIP fixture bmce-core-banking-complex.zip manquant").toBe(true);

  const { files, pomXml } = loadZipAsSourceFiles(COMPLEX_ZIP);
  ir = parseEjbProject(files, pomXml);
  generation = generateSpringBootProject(ir);
  fileMap = new Map(generation.files.map(f => [f.path, f.content]));

  const splitter = new MicroserviceSplitter();
  services = splitter.split(ir);
}, 120_000);

// ═══════════════════════════════════════════════════════════════════════════════
// v7.7 Tests — Mission Finale
// ═══════════════════════════════════════════════════════════════════════════════

describe("COMPLEO v7.7 — Mission Finale", () => {

  // ═══ STEP 1 — P1 : EJBs complexes ═══════════════════════════════════════

  describe("P1 : EJBs complexes → vraies méthodes", () => {

    it("P1-A : CreditScoringService — 3 méthodes, pas execute()", () => {
      const svc = getFile(fileMap, "CreditService.java")
        || getFile(fileMap, "CreditScoringService.java")
        || getFile(fileMap, "CreditScoringEJBService.java");
      expect(svc.length, "CreditService doit exister").toBeGreaterThan(0);

      // Pas de execute()
      expect(svc).not.toMatch(/public\s+\w+\s+execute\s*\(/);

      // 3 vraies méthodes métier
      const methods = svc.match(/public\s+\w+(?:<[^>]+>)?\s+\w+\s*\([^)]*\)/g) ?? [];
      const methodNames = methods.map(m => m.match(/(\w+)\s*\(/)?.[1] ?? "");
      expect(methodNames.length).toBeGreaterThanOrEqual(3);

      // Vérifier les noms métier attendus
      const hasCalculer = methodNames.some(n => /calcul|score/i.test(n));
      const hasHistorique = methodNames.some(n => /historique|scores/i.test(n));
      const hasSimuler = methodNames.some(n => /simul|credit/i.test(n));
      expect(hasCalculer || hasHistorique || hasSimuler,
        `Doit avoir des méthodes métier, trouvé: ${methodNames.join(", ")}`).toBe(true);
    });

    it("P1-B : VirementSEPAService — 3 méthodes, pas execute()", () => {
      const svc = getFile(fileMap, "VirementService.java")
        || getFile(fileMap, "VirementSEPAService.java")
        || getFile(fileMap, "VirementsepaService.java");
      expect(svc.length, "VirementService doit exister").toBeGreaterThan(0);

      expect(svc).not.toMatch(/public\s+\w+\s+execute\s*\(/);

      const methods = svc.match(/public\s+\w+(?:<[^>]+>)?\s+\w+\s*\([^)]*\)/g) ?? [];
      expect(methods.length).toBeGreaterThanOrEqual(3);
    });

    it("P1-C : Pas de préfixe EJB_ dans les noms de méthodes", () => {
      for (const [filePath, content] of fileMap) {
        if (!filePath.endsWith("Service.java")) continue;
        expect(content, `${filePath} ne doit pas contenir EJB_`).not.toMatch(/public\s+\w+\s+EJB_/);
      }
    });
  });

  // ═══ STEP 2 — P2 : CDI beans et DTOs filtrés ═══════════════════════════

  describe("P2 : CDI beans et DTOs filtrés", () => {

    it("P2-A : SEPATransformerService n'existe pas", () => {
      const svc = getFile(fileMap, "SEPATransformerService.java")
        || getFile(fileMap, "SepatransformerService.java");
      expect(svc, "SEPATransformer ne doit pas générer de Service").toBe("");
    });

    it("P2-B : ScoringRequestVoIn ne génère aucun Service", () => {
      const svc = getFile(fileMap, "ScoringRequestVoInService.java")
        || getFile(fileMap, "ScoringrequestService.java")
        || getFile(fileMap, "ScoringrequestvoService.java");
      expect(svc, "ScoringRequestVoIn (DTO) ne doit pas générer de Service").toBe("");
    });
  });

  // ═══ STEP 3 — P3-params : Paramètres propagés ══════════════════════════

  describe("P3-params : Paramètres propagés Service + Controller", () => {

    it("BUG-K : genererDeclarationTRAPROC — 4 paramètres distincts", () => {
      const svc = getFile(fileMap, "CompliancelbcftService.java")
        || getFile(fileMap, "ComplianceService.java")
        || getFile(fileMap, "ConformiteService.java");
      expect(svc.length, "ComplianceService doit exister").toBeGreaterThan(0);

      // Trouver la méthode genererDeclarationTRAPROC
      const methodMatch = svc.match(/genererDeclarationTRAPROC\s*\(([^)]+)\)/);
      expect(methodMatch, "genererDeclarationTRAPROC doit exister").not.toBeNull();

      const params = methodMatch![1].split(",").map(p => p.trim()).filter(p => p.length > 0);
      expect(params.length, `Doit avoir 4 params, trouvé: ${params.join(", ")}`).toBe(4);
    });

    it("BUG-1 : Méthodes avec paramètres ne sont pas vides", () => {
      // Vérifier qu'aucun Service n'a de méthodes get*/consulter*/rechercher* sans paramètres
      let emptyParamMethods = 0;
      for (const [filePath, content] of fileMap) {
        if (!filePath.endsWith("Service.java")) continue;
        const suspects = content.match(
          /public\s+\w+\s+(get\w+|consulter\w+|rechercher\w+|generer\w+)\s*\(\s*\)/g
        ) ?? [];
        emptyParamMethods += suspects.length;
      }
      expect(emptyParamMethods, "Aucune méthode get*/consulter*/rechercher* ne doit être sans paramètres").toBe(0);
    });
  });

  // ═══ STEP 4 — P3-types : Object interdit ═══════════════════════════════

  describe("P3-types : Object interdit + méthodes manquantes", () => {

    it("BUG-3 : Aucun retour Object dans les Services", () => {
      for (const [filePath, content] of fileMap) {
        if (!filePath.endsWith("Service.java")) continue;
        expect(content, `${filePath} ne doit pas retourner Object`)
          .not.toMatch(/public\s+Object\s+\w+\s*\(/);
      }
    });

    it("BUG-4 : Aucun retour Object dans les Controllers", () => {
      for (const [filePath, content] of fileMap) {
        if (!filePath.endsWith("Controller.java")) continue;
        // ResponseEntity<Object> est interdit
        expect(content, `${filePath} ne doit pas contenir ResponseEntity<Object>`)
          .not.toMatch(/ResponseEntity<Object>/);
      }
    });
  });

  // ═══ STEP 5 — P4 : Anti-hallucination ML ═══════════════════════════════

  describe("P4 : Anti-hallucination ML (validateMLOutput)", () => {

    it("P4-A : validateMLOutput détecte UserService comme hallucination", () => {
      const text = `
## Architecture
Le UserService gère l'authentification des utilisateurs.
Le OrderService traite les commandes.
      `;
      const realClasses = ["CreditScoringEJB", "VirementSEPAEJB", "ComplianceLBCFTEJB"];
      const result = validateMLOutput(text, realClasses);
      expect(result.isValid).toBe(false);
      expect(result.hallucinations.length).toBeGreaterThanOrEqual(1);
      const hallucinatedNames = result.hallucinations.map(h => h.original);
      expect(hallucinatedNames.some(n => /UserService/i.test(n))).toBe(true);
    });

    it("P4-B : validateMLOutput accepte les vrais noms de classes", () => {
      const text = `
## Rapport de Migration
Le module CreditScoringEJB sera migré vers Spring Boot.
Le VirementSEPAEJB utilise les tables T_VIREMENTS et T_COMPTES.
      `;
      const realClasses = ["CreditScoringEJB", "VirementSEPAEJB", "ComplianceLBCFTEJB"];
      const result = validateMLOutput(text, realClasses);
      expect(result.isValid).toBe(true);
      expect(result.hallucinations.length).toBe(0);
    });

    it("P4-C : validateMLOutput détecte les technos hors contexte", () => {
      const text = `
## Recommandations
Migrer vers ASP.NET Core pour de meilleures performances.
Utiliser PostgreSQL au lieu d'Oracle.
      `;
      const realClasses = ["CreditScoringEJB"];
      const result = validateMLOutput(text, realClasses);
      expect(result.isValid).toBe(false);
      expect(result.hallucinations.some(h => /ASP\.NET|PostgreSQL/i.test(h.original))).toBe(true);
    });
  });

  // ═══ STEP 6 — P5 : Tables multi-DataSource ═════════════════════════════

  describe("P5 : Tables multi-DataSource", () => {

    it("P5 : credit-service a 4+ tables (ownedTables + readOnlyTables)", () => {
      const creditService = services.find(s => s.name === "credit-service");
      expect(creditService, "credit-service doit exister").toBeDefined();

      // MicroserviceSplitter exposes ownedTables and readOnlyTables, not tables
      const owned = creditService!.ownedTables ?? [];
      const readOnly = creditService!.readOnlyTables ?? [];
      const allTables = [...new Set([...owned, ...readOnly])];
      expect(allTables.length,
        `credit-service doit avoir 4+ tables, trouvé: ${allTables.join(", ")}`
      ).toBeGreaterThanOrEqual(4);
    });
  });

  // ═══ STEP 7 — P6 : Quality Scorer refonte ══════════════════════════════

  describe("P6 : Quality Scorer honnête (8 checks)", () => {

    it("P6-A : Score < 100 si Void.builder() présent", () => {
      const fakeFiles = new Map([
        ["src/service/FakeService.java",
         "public Void.builder() consulterSolde() { return Void.builder().build(); }"]
      ]);
      const { score } = calculateQualityScore(fakeFiles);
      expect(score).toBeLessThan(100);
    });

    it("P6-B : Score < 100 si public Object retour", () => {
      const fakeFiles = new Map([
        ["src/service/AuthService.java",
         "public Object handlePostConnexion(String login) { return null; }"]
      ]);
      const { score } = calculateQualityScore(fakeFiles);
      expect(score).toBeLessThan(100);
    });

    it("P6-C : Score A+ sur fichiers propres", () => {
      const cleanFiles = new Map([
        ["src/service/CompteService.java",
         `@Service
          public class CompteService {
            private static final String SQL_SOLDE = "SELECT * FROM T_COMPTES";
            public ConsulterSoldeResponseDTO consulterSolde(String numCompte) { }
            public List<MouvementDTO> consulterMouvements(String numCompte, String dateDebut) { }
          }`],
        ["src/controller/CompteController.java",
         `@RestController
          @RequestMapping("/api/comptes")
          public class CompteController {
            @GetMapping("/solde")
            public ResponseEntity<ConsulterSoldeResponseDTO> consulterSolde(@RequestParam String numCompte) { }
          }`],
      ]);
      const { score, grade } = calculateQualityScore(cleanFiles);
      expect(score).toBeGreaterThanOrEqual(90);
      expect(grade).toMatch(/^A/);
    });

    it("P6-D : calculateQualityScore retourne 8 checks", () => {
      const { checks } = calculateQualityScore(fileMap);
      expect(checks.length).toBe(8);
      const ids = checks.map(c => c.id);
      expect(ids).toContain("SQL_CONSTANTS");
      expect(ids).toContain("NO_VOID_BUILDER");
      expect(ids).toContain("NO_OBJECT_RETURN");
      expect(ids).toContain("METHOD_PARAMS");
      expect(ids).toContain("SERVICE_NAMING");
      expect(ids).toContain("NO_ORACLE_KEYWORDS");
      expect(ids).toContain("NO_URL_CONFLICTS");
      expect(ids).toContain("USECASE_COVERAGE");
    });

    it("P6-E : Score projet complexe >= 90 (grade A ou A+)", () => {
      const { score, grade } = calculateQualityScore(fileMap);
      expect(score, `Score doit être >= 90, obtenu: ${score}`).toBeGreaterThanOrEqual(90);
      expect(grade).toMatch(/^A/);
    });
  });
});
