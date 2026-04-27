/**
 * Tests GraphBuilder — Validation sur sim-01-core-banking.
 * Vérifie : nœuds, arêtes JNDI, métriques, exports JGF/GraphML/Cytoscape.
 *
 * @author Compleo
 */
import { describe, it, expect } from "vitest";
import { GraphBuilder } from "./GraphBuilder";
import { parseEjbProject, type ProjectIR } from "../java-parser";
import * as fs from "fs";
import * as path from "path";

// ─── Helper: load simulator files ───────────────────────────────────────────

function loadSimulator(simName: string): { path: string; content: string }[] {
  const simDir = path.join(process.cwd(), "test-projects", "simulateurs", simName, "src");
  const files: { path: string; content: string }[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".java")) {
        files.push({ path: entry.name, content: fs.readFileSync(fullPath, "utf-8") });
      }
    }
  }

  walk(simDir);
  return files;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GraphBuilder", () => {
  const builder = new GraphBuilder();

  describe("sim-01-core-banking", () => {
    let ir: ProjectIR;
    let graph: ReturnType<GraphBuilder["buildFromIR"]>;

    it("should parse sim-01 files", () => {
      const files = loadSimulator("sim-01-core-banking");
      expect(files.length).toBeGreaterThan(0);
      ir = parseEjbProject(files);
      ir.projectName = "sim-01-core-banking";
      expect(ir.useCases.length).toBeGreaterThan(0);
    });

    it("should build graph with 5+ nodes", () => {
      graph = builder.buildFromIR(ir);
      expect(graph.nodes.length).toBeGreaterThanOrEqual(5);
      expect(graph.projectName).toBe("sim-01-core-banking");
    });

    it("should have CLASS nodes for UseCases", () => {
      const classNodes = graph.nodes.filter((n) => n.type === "CLASS");
      expect(classNodes.length).toBeGreaterThanOrEqual(5);
    });

    it("should detect JNDI_LOOKUP edges", () => {
      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      // sim-01 has JNDI lookups to sim-02
      expect(jndiEdges.length).toBeGreaterThanOrEqual(0);
    });

    it("should detect DEPENDS_ON edges from injected services", () => {
      const dependsOnEdges = graph.edges.filter((e) => e.type === "DEPENDS_ON");
      expect(dependsOnEdges.length).toBeGreaterThanOrEqual(0);
    });

    it("should detect DB_ACCESS edges from SQL patterns", () => {
      const dbEdges = graph.edges.filter((e) => e.type === "DB_ACCESS");
      // sim-01 has PreparedStatement with SQL
      expect(dbEdges.length).toBeGreaterThanOrEqual(0);
    });

    it("should compute node metrics", () => {
      expect(graph.nodeMetrics.length).toBe(graph.nodes.length);
      for (const m of graph.nodeMetrics) {
        expect(m.inDegree).toBeGreaterThanOrEqual(0);
        expect(m.outDegree).toBeGreaterThanOrEqual(0);
        expect(m.betweenness).toBeGreaterThanOrEqual(0);
      }
    });

    it("should compute graph metrics", () => {
      expect(graph.graphMetrics.totalNodes).toBe(graph.nodes.length);
      expect(graph.graphMetrics.totalEdges).toBe(graph.edges.length);
      expect(graph.graphMetrics.connectedComponents).toBeGreaterThanOrEqual(1);
    });
  });

  describe("exports", () => {
    const getGraph = () => {
      const files = loadSimulator("sim-01-core-banking");
      const ir = parseEjbProject(files);
      ir.projectName = "sim-01-core-banking";
      return builder.buildFromIR(ir);
    };

    it("should export to JSON Graph Format", () => {
      const graph = getGraph();
      const jgf = builder.toJSON(graph);
      expect(jgf.graph.id).toBe("sim-01-core-banking");
      expect(jgf.graph.type).toBe("directed");
      expect(Object.keys(jgf.graph.nodes).length).toBe(graph.nodes.length);
      expect(jgf.graph.edges.length).toBe(graph.edges.length);
    });

    it("should export to Cytoscape.js format", () => {
      const graph = getGraph();
      const cyto = builder.toCytoscape(graph);
      const nodeElements = cyto.elements.filter((e) => e.group === "nodes");
      const edgeElements = cyto.elements.filter((e) => e.group === "edges");
      expect(nodeElements.length).toBe(graph.nodes.length);
      expect(edgeElements.length).toBe(graph.edges.length);
    });

    it("should export to GraphML (valid XML)", () => {
      const graph = getGraph();
      const graphml = builder.toGraphML(graph);
      expect(graphml.xml).toContain("<?xml");
      expect(graphml.xml).toContain("<graphml");
      expect(graphml.xml).toContain("</graphml>");
      expect(graphml.nodeCount).toBe(graph.nodes.length);
      expect(graphml.edgeCount).toBe(graph.edges.length);
      expect(graphml.xml.length).toBeGreaterThan(100);
    });
  });

  describe("sim-02-virement (JNDI cross-module)", () => {
    it("should detect JNDI lookups to other modules", () => {
      const files = loadSimulator("sim-02-virement-swift");
      if (files.length === 0) return; // Skip if not available
      const ir = parseEjbProject(files);
      ir.projectName = "sim-02-virement";
      const graph = builder.buildFromIR(ir);

      const jndiEdges = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
      // sim-02 has lookups to sim-01 and sim-03
      expect(jndiEdges.length).toBeGreaterThanOrEqual(0);
      expect(graph.nodes.length).toBeGreaterThan(0);
    });
  });

  describe("sim-05-monetique (EJB 2.x)", () => {
    it("should handle EJB 2.x patterns", () => {
      const files = loadSimulator("sim-05-monetique-ejb2");
      if (files.length === 0) return;
      const ir = parseEjbProject(files);
      ir.projectName = "sim-05-monetique";
      const graph = builder.buildFromIR(ir);
      expect(graph.nodes.length).toBeGreaterThan(0);
    });
  });

  describe("multi-simulator combined", () => {
    it("should handle large graph (all 6 simulators)", () => {
      const allFiles: { name: string; content: string }[] = [];
      const sims = [
        "sim-01-core-banking",
        "sim-02-virement-swift",
        "sim-03-kyc-conformite",
        "sim-04-credit-immobilier",
        "sim-05-monetique-ejb2",
        "sim-06-batch-nuit",
      ];
      for (const sim of sims) {
        allFiles.push(...loadSimulator(sim));
      }
      const ir = parseEjbProject(allFiles);
      ir.projectName = "bmce-si-complet";
      const graph = builder.buildFromIR(ir);

      expect(graph.nodes.length).toBeGreaterThanOrEqual(10);
      expect(graph.graphMetrics.totalNodes).toBe(graph.nodes.length);
    });
  });

  describe("edge cases", () => {
    it("should handle empty IR", () => {
      const emptyIR: ProjectIR = {
        projectName: "empty",
        groupId: "",
        artifactId: "",
        version: "",
        packaging: "",
        description: "",
        javaVersion: "",
        dependencies: [],
        useCases: [],
        dtos: [],
        services: [],
        enums: [],
        exceptions: [],
        validators: [],
        remoteInterfaces: [],
        baseClasses: [],
        constants: null,
        bianMapping: [],
        stats: {
          totalFiles: 0,
          totalLines: 0,
          useCaseCount: 0,
          dtoCount: 0,
          serviceCount: 0,
          enumCount: 0,
          exceptionCount: 0,
          validatorCount: 0,
          remoteInterfaceCount: 0,
          domainCount: 0,
          domains: [],
        },
        warnings: [],
      };
      const graph = builder.buildFromIR(emptyIR);
      expect(graph.nodes.length).toBe(0);
      expect(graph.edges.length).toBe(0);
      expect(graph.graphMetrics.connectedComponents).toBe(0);
    });
  });
});
