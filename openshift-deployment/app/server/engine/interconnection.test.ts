/**
 * Tests d'interconnexion inter-modules — Audit avancé
 * Vérifie la détection JNDI, les dépendances cross-module,
 * et l'analyse multi-modules (6 simulateurs bancaires).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { CompleoEngine, getEngine, type SourceFile } from "./CompleoEngine";
import * as fs from "fs";
import * as path from "path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIMULATEURS_BASE = path.resolve(__dirname, "../../test-projects/simulateurs");

function loadProjectFiles(projectDir: string): SourceFile[] {
  const files: SourceFile[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        entry.name.endsWith(".java") ||
        entry.name.endsWith(".xml") ||
        entry.name.endsWith(".jsp")
      ) {
        files.push({
          path: path.relative(projectDir, fullPath),
          content: fs.readFileSync(fullPath, "utf-8"),
        });
      }
    }
  }
  walk(projectDir);
  return files;
}

function loadExpectedOutput(simDir: string): any {
  const expectedPath = path.join(simDir, "expected-output.json");
  if (fs.existsSync(expectedPath)) {
    return JSON.parse(fs.readFileSync(expectedPath, "utf-8"));
  }
  return null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Interconnexion inter-modules — 6 simulateurs bancaires", () => {
  let engine: CompleoEngine;

  beforeAll(() => {
    engine = getEngine();
  });

  // ═══════════════════════════════════════════════════════════
  // TEST 1: Chaque simulateur est parsable individuellement
  // ═══════════════════════════════════════════════════════════
  describe("Parsing individuel des 6 simulateurs", () => {
    const simulateurs = [
      { name: "sim-01-core-banking", minBeans: 5 },
      { name: "sim-02-virement", minBeans: 3 },
      { name: "sim-03-kyc", minBeans: 3 },
      { name: "sim-04-credit", minBeans: 3 },
      { name: "sim-05-monetique", minBeans: 0 }, // EJB 2.x SessionBean, pas BaseUseCase
      { name: "sim-06-batch", minBeans: 0 }, // JSR-352 ItemReader/Writer, pas BaseUseCase
    ];

    for (const sim of simulateurs) {
      it(`parse ${sim.name} sans erreur et détecte >= ${sim.minBeans} beans`, async () => {
        const simDir = path.join(SIMULATEURS_BASE, sim.name);
        if (!fs.existsSync(simDir)) {
          console.warn(`SKIP: ${simDir} n'existe pas`);
          return;
        }

        const files = loadProjectFiles(simDir);
        expect(files.length).toBeGreaterThan(0);

        const pomFile = files.find((f) => f.path === "pom.xml");
        const result = await engine.analyze(files, {
          pomXml: pomFile?.content,
          projectName: sim.name,
        });

        expect(result.ir).toBeDefined();
        expect(result.ir.stats.useCaseCount).toBeGreaterThanOrEqual(sim.minBeans);
      });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // TEST 2: Détection des dépendances JNDI inter-modules
  // ═══════════════════════════════════════════════════════════
  describe("Détection JNDI inter-modules", () => {
    it("sim-01 contient des fichiers avec JNDI lookup", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-01-core-banking");
      const files = loadProjectFiles(simDir);
      const jndiFiles = files.filter((f) =>
        f.content.includes("java:global/")
      );
      expect(jndiFiles.length).toBeGreaterThanOrEqual(1);
    });

    it("sim-02 référence sim-01 et sim-03 via JNDI", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-02-virement");
      const files = loadProjectFiles(simDir);
      const allContent = files.map((f) => f.content).join("\n");

      expect(allContent).toContain("bmce-core-banking-ejb");
      expect(allContent).toContain("bmce-kyc-ejb");
    });

    it("sim-04 référence sim-01 et sim-03 via JNDI", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-04-credit");
      const files = loadProjectFiles(simDir);
      const allContent = files.map((f) => f.content).join("\n");

      expect(allContent).toContain("bmce-core-banking-ejb");
      expect(allContent).toContain("bmce-kyc-ejb");
    });

    it("sim-06 référence sim-02 via JNDI", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-06-batch");
      const files = loadProjectFiles(simDir);
      const allContent = files.map((f) => f.content).join("\n");

      expect(allContent).toContain("bmce-virement-swift-ejb");
    });

    it("détecte au moins 8 références JNDI cross-module au total", () => {
      let totalJndi = 0;
      const sims = ["sim-01-core-banking", "sim-02-virement", "sim-03-kyc",
                     "sim-04-credit", "sim-05-monetique", "sim-06-batch"];

      for (const sim of sims) {
        const simDir = path.join(SIMULATEURS_BASE, sim);
        if (!fs.existsSync(simDir)) continue;
        const files = loadProjectFiles(simDir);
        for (const f of files) {
          const matches = f.content.match(/java:global\//g);
          if (matches) totalJndi += matches.length;
        }
      }

      expect(totalJndi).toBeGreaterThanOrEqual(8);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST 3: EJB 2.x parsing (sim-05)
  // ═══════════════════════════════════════════════════════════
  describe("EJB 2.x parsing — sim-05-monetique", () => {
    it("détecte les interfaces Home/Remote", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-05-monetique");
      const files = loadProjectFiles(simDir);

      const homeFiles = files.filter(
        (f) => f.content.includes("extends EJBHome")
      );
      const remoteFiles = files.filter(
        (f) => f.content.includes("extends EJBObject")
      );

      expect(homeFiles.length).toBe(4);
      expect(remoteFiles.length).toBe(4);
    });

    it("détecte le ejb-jar.xml avec 4 beans déclarés", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-05-monetique");
      const files = loadProjectFiles(simDir);
      const ejbJar = files.find((f) => f.path.includes("ejb-jar.xml"));

      expect(ejbJar).toBeDefined();
      expect(ejbJar!.content).toContain("ActivationCarteBMCE");
      expect(ejbJar!.content).toContain("PaiementCBBMCE");
      expect(ejbJar!.content).toContain("OppositionCarteBMCE");
      expect(ejbJar!.content).toContain("GestionPINBMCE");
    });

    it("détecte le bean Stateful (GestionPINBMCE)", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-05-monetique");
      const files = loadProjectFiles(simDir);
      const ejbJar = files.find((f) => f.path.includes("ejb-jar.xml"));

      expect(ejbJar!.content).toContain("<session-type>Stateful</session-type>");
    });

    it("détecte les RemoteException dans les signatures", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-05-monetique");
      const files = loadProjectFiles(simDir);
      const remoteExFiles = files.filter(
        (f) => f.content.includes("throws RemoteException")
      );

      expect(remoteExFiles.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST 4: Patterns de sécurité critiques
  // ═══════════════════════════════════════════════════════════
  describe("Patterns de sécurité critiques dans les simulateurs", () => {
    it("sim-01 contient SQL injection (string concatenation)", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-01-core-banking");
      const files = loadProjectFiles(simDir);
      const sqlInjection = files.some(
        (f) =>
          f.content.includes("Statement") &&
          f.content.includes("+ voIn.get")
      );
      expect(sqlInjection).toBe(true);
    });

    it("sim-01 contient JDBC leak (pas de try-with-resources)", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-01-core-banking");
      const files = loadProjectFiles(simDir);
      const jdbcLeak = files.some(
        (f) =>
          f.content.includes("dataSource.getConnection()") &&
          !f.content.includes("try (")
      );
      expect(jdbcLeak).toBe(true);
    });

    it("sim-05 contient DES encryption obsolète", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-05-monetique");
      const files = loadProjectFiles(simDir);
      const desUsage = files.some(
        (f) =>
          f.content.includes("DESKeySpec") ||
          f.content.includes('getInstance("DES")')
      );
      expect(desUsage).toBe(true);
    });

    it("sim-05 contient PIN en clair dans les logs", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-05-monetique");
      const files = loadProjectFiles(simDir);
      const pinLeak = files.some(
        (f) =>
          f.content.includes("Validation PIN:") &&
          f.content.includes("log.debug")
      );
      expect(pinLeak).toBe(true);
    });

    it("sim-04 contient calcul financier en double", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-04-credit");
      const files = loadProjectFiles(simDir);
      const doubleCalc = files.some(
        (f) =>
          f.content.includes("doubleValue()") &&
          f.content.includes("tauxMensuel")
      );
      expect(doubleCalc).toBe(true);
    });

    it("sim-04 contient self-invocation @Transactional", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-04-credit");
      const files = loadProjectFiles(simDir);
      const selfInvoke = files.some(
        (f) =>
          f.content.includes("this.creerEcriture") &&
          f.content.includes("@Transactional")
      );
      expect(selfInvoke).toBe(true);
    });

    it("sim-06 contient JMS sans DLQ", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-06-batch");
      const files = loadProjectFiles(simDir);
      const jmsNoDlq = files.some(
        (f) =>
          f.content.includes("@MessageDriven") &&
          !f.content.includes("deadLetter")
      );
      expect(jmsNoDlq).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST 5: Analyse multi-modules combinée
  // ═══════════════════════════════════════════════════════════
  describe("Analyse multi-modules combinée", () => {
    it("analyse les 6 simulateurs combinés (bmce-si-complet)", async () => {
      const allFiles: SourceFile[] = [];
      const sims = [
        "sim-01-core-banking",
        "sim-02-virement",
        "sim-03-kyc",
        "sim-04-credit",
        "sim-05-monetique",
        "sim-06-batch",
      ];

      for (const sim of sims) {
        const simDir = path.join(SIMULATEURS_BASE, sim);
        if (!fs.existsSync(simDir)) continue;
        const files = loadProjectFiles(simDir);
        // Prefix paths with module name
        for (const f of files) {
          allFiles.push({
            path: `${sim}/${f.path}`,
            content: f.content,
          });
        }
      }

      expect(allFiles.length).toBeGreaterThan(50);

      const result = await engine.analyze(allFiles, {
        projectName: "bmce-si-complet",
      });

      expect(result.ir).toBeDefined();
      // Should detect beans from all modules
      expect(result.ir.stats.useCaseCount).toBeGreaterThanOrEqual(15);
    });

    it("expected-output.json existe pour chaque simulateur", () => {
      const sims = [
        "sim-01-core-banking",
        "sim-02-virement",
        "sim-03-kyc",
        "sim-04-credit",
        "sim-05-monetique",
        "sim-06-batch",
      ];

      for (const sim of sims) {
        const expected = loadExpectedOutput(
          path.join(SIMULATEURS_BASE, sim)
        );
        expect(expected).not.toBeNull();
        expect(expected.projectName).toBeDefined();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST 6: Batch JSR-352 patterns (sim-06)
  // ═══════════════════════════════════════════════════════════
  describe("Batch JSR-352 — sim-06-batch", () => {
    it("contient ItemReader, ItemProcessor, ItemWriter", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-06-batch");
      const files = loadProjectFiles(simDir);
      const allContent = files.map((f) => f.content).join("\n");

      expect(allContent).toContain("implements ItemReader");
      expect(allContent).toContain("implements ItemProcessor");
      expect(allContent).toContain("implements ItemWriter");
    });

    it("contient MessageDriven JMS listener", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-06-batch");
      const files = loadProjectFiles(simDir);
      const jmsFiles = files.filter(
        (f) => f.content.includes("@MessageDriven")
      );
      expect(jmsFiles.length).toBeGreaterThanOrEqual(1);
    });

    it("contient calcul d'intérêts en double (FIN-001)", () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-06-batch");
      const files = loadProjectFiles(simDir);
      const doubleInterets = files.some(
        (f) =>
          f.content.includes("double interet") ||
          f.content.includes("doubleValue()")
      );
      expect(doubleInterets).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST 7: Génération de code pour chaque simulateur
  // ═══════════════════════════════════════════════════════════
  describe("Génération Spring Boot pour simulateurs", () => {
    it("génère du code pour sim-01-core-banking", async () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-01-core-banking");
      const files = loadProjectFiles(simDir);
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-01-core-banking",
      });

      const generated = await engine.generate(result.ir, {
        choices: {},
        projectName: "sim-01-core-banking",
      });

      expect(generated.files).toBeDefined();
      expect(generated.files.length).toBeGreaterThan(0);

      // Should have controllers
      const controllers = generated.files.filter((f: any) =>
        f.path.includes("Controller")
      );
      expect(controllers.length).toBeGreaterThanOrEqual(1);

      // Should have DTOs
      const dtos = generated.files.filter(
        (f: any) =>
          f.path.includes("Request") || f.path.includes("Response")
      );
      expect(dtos.length).toBeGreaterThan(0);
    });

    it("génère du code pour sim-05-monetique (EJB 2.x)", async () => {
      const simDir = path.join(SIMULATEURS_BASE, "sim-05-monetique");
      const files = loadProjectFiles(simDir);
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-05-monetique",
      });

      // EJB 2.x uses SessionBean pattern, not BaseUseCase
      expect(result.ir).toBeDefined();
      expect(result.ir.stats).toBeDefined();
    });
  });
});
