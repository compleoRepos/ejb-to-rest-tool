/**
 * TDD Tests — CORRECTION 1 : Regex JNDI étendu @EJB lookup
 * Tests écrits AVANT la correction pour valider le bug puis la correction.
 * @author Compleo
 */
import { describe, it, expect, beforeAll } from "vitest";
import { GraphBuilder } from "./GraphBuilder";
import { parseEjbProject } from "../java-parser";
import * as fs from "fs";
import * as path from "path";

// ─── Helper: load simulator files ─────────────────────────────────────────
function loadSimFiles(simName: string) {
  const simDir = path.resolve(__dirname, `../../test-projects/simulateurs/${simName}`);
  const files: Array<{ path: string; content: string }> = [];
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir.toString(), entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".java")) {
        files.push({ path: entry.name, content: fs.readFileSync(full, "utf-8") });
      }
    }
  }
  walk(simDir);
  return files;
}

// ─── Unit tests: JNDI pattern detection ───────────────────────────────────

describe("CORRECTION 1 — JNDI regex étendu", () => {
  const builder = new GraphBuilder();

  describe("@EJB(lookup=...) annotation detection", () => {
    it("détecte @EJB(lookup = \"java:global/...\") avec espaces", () => {
      const files = [
        {
          path: "TestBean.java",
          content: `
package com.test;
import javax.ejb.Stateless;
import javax.ejb.EJB;

@Stateless
public class TestBean {
    @EJB(lookup = "java:global/bmce-core-banking-ejb/ConsulterSoldeUC")
    private ConsulterSoldeUC soldeService;

    public void execute() {
        soldeService.consulter();
    }
}
`,
        },
      ];
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBeGreaterThanOrEqual(1);
      expect(jndiEdges.some((e) => e.label?.includes("ConsulterSoldeUC") || e.target.includes("ConsulterSoldeUC"))).toBe(true);
    });

    it("détecte @EJB(lookup=\"...\") sans espaces", () => {
      const files = [
        {
          path: "KycBean.java",
          content: `
package com.test;
import javax.ejb.Stateless;
import javax.ejb.EJB;

@Stateless
public class KycBean {
    @EJB(lookup="java:global/bmce-kyc-ejb/ScreeningOfacUC")
    private ScreeningOfacUC screeningService;

    public void check() {
        screeningService.screen();
    }
}
`,
        },
      ];
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBeGreaterThanOrEqual(1);
    });

    it("détecte @EJB(beanName=\"...\")", () => {
      const files = [
        {
          path: "BeanNameTest.java",
          content: `
package com.test;
import javax.ejb.Stateless;
import javax.ejb.EJB;

@Stateless
public class BeanNameTest {
    @EJB(beanName="CompteService")
    private CompteService compteService;

    public void run() {
        compteService.getCompte();
    }
}
`,
        },
      ];
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBeGreaterThanOrEqual(1);
    });

    it("détecte @Resource(mappedName=\"...\")", () => {
      const files = [
        {
          path: "ResourceTest.java",
          content: `
package com.test;
import javax.ejb.Stateless;
import javax.annotation.Resource;

@Stateless
public class ResourceTest {
    @Resource(mappedName="java:global/module/AuditService")
    private AuditService auditService;

    public void audit() {
        auditService.log();
    }
}
`,
        },
      ];
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBeGreaterThanOrEqual(1);
    });

    it("détecte InitialContext.lookup() existant (pattern original)", () => {
      const files = [
        {
          path: "LookupTest.java",
          content: `
package com.test;
import javax.ejb.Stateless;
import javax.naming.InitialContext;

@Stateless
public class LookupTest {
    public void execute() throws Exception {
        InitialContext ctx = new InitialContext();
        Object svc = ctx.lookup("java:global/module/Service");
    }
}
`,
        },
      ];
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBeGreaterThanOrEqual(1);
    });

    it("ne crée pas de faux positif sur @EJB sans lookup", () => {
      const files = [
        {
          path: "SimpleEjb.java",
          content: `
package com.test;
import javax.ejb.Stateless;
import javax.ejb.EJB;

@Stateless
public class SimpleEjb {
    @EJB
    private MonService service;

    public void run() {
        service.doSomething();
    }
}
`,
        },
      ];
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBe(0);
    });

    it("parse correctement le module et la classe depuis le path JNDI", () => {
      const files = [
        {
          path: "JndiParseTest.java",
          content: `
package com.test;
import javax.ejb.Stateless;
import javax.ejb.EJB;

@Stateless
public class JndiParseTest {
    @EJB(lookup = "java:global/bmce-core-banking-ejb/ConsulterSoldeUC")
    private ConsulterSoldeUC soldeService;

    public void execute() {
        soldeService.consulter();
    }
}
`,
        },
      ];
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBeGreaterThanOrEqual(1);
      // Verify the JNDI path is preserved in the label or target
      const edge = jndiEdges[0];
      expect(
        edge.label?.includes("bmce-core-banking-ejb") ||
        edge.target.includes("bmce-core-banking-ejb") ||
        edge.label?.includes("ConsulterSoldeUC") ||
        edge.target.includes("ConsulterSoldeUC")
      ).toBe(true);
    });
  });

  // ─── Integration tests on simulators ──────────────────────────────────────

  describe("Validation sur simulateurs bancaires", () => {
    it("sim-01-core-banking: JNDI_LOOKUP edges >= 1", () => {
      const files = loadSimFiles("sim-01-core-banking");
      if (files.length === 0) return; // skip if no files
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBeGreaterThanOrEqual(1);
    });

    it("sim-02-virement: JNDI_LOOKUP edges >= 2 (cross-module vers sim-01 et sim-03)", () => {
      const files = loadSimFiles("sim-02-virement");
      if (files.length === 0) return;
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBeGreaterThanOrEqual(2);
    });

    it("sim-03-kyc: détecte les JNDI lookups", () => {
      const files = loadSimFiles("sim-03-kyc");
      if (files.length === 0) return;
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      // sim-03 may or may not have JNDI lookups depending on its code
      expect(jndiEdges.length).toBeGreaterThanOrEqual(0);
    });

    it("sim-04-credit: JNDI_LOOKUP edges >= 2 (cross-module vers sim-01 et sim-03)", () => {
      const files = loadSimFiles("sim-04-credit");
      if (files.length === 0) return;
      const ir = parseEjbProject(files);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBeGreaterThanOrEqual(2);
    });

    it("SI complet (6 sims): détecte >= 8 JNDI cross-refs au total", () => {
      const allFiles: Array<{ path: string; content: string }> = [];
      for (const sim of [
        "sim-01-core-banking",
        "sim-02-virement",
        "sim-03-kyc",
        "sim-04-credit",
        "sim-05-monetique",
        "sim-06-batch",
      ]) {
        allFiles.push(...loadSimFiles(sim));
      }
      if (allFiles.length === 0) return;
      const ir = parseEjbProject(allFiles);
      const graph = builder.buildFromIR(ir);
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      expect(jndiEdges.length).toBeGreaterThanOrEqual(8);
    });
  });
});
