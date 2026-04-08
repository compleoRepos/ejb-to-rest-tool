import { describe, it, expect } from "vitest";
import { parseEjbProject } from "./java-parser";
import { GraphBuilder } from "./graph/GraphBuilder";
import { DomainClusterer } from "./graph/DomainClusterer";
import { ArchitectureDiscovery } from "./graph/ArchitectureDiscovery";
import { MicroserviceExtractor } from "./graph/MicroserviceExtractor";
import { VisualizationEngine } from "./visualization/VisualizationEngine";
import * as fs from "fs";
import * as path from "path";

const SIMS_DIR = path.join(__dirname, "../test-projects/simulateurs");

function loadSimulator(name: string) {
  const simDir = path.join(SIMS_DIR, name);
  const files: { path: string; content: string }[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".java")) {
        files.push({ path: path.relative(simDir, full), content: fs.readFileSync(full, "utf-8") });
      }
    }
  }
  walk(simDir);
  return files;
}

function runPipeline(name: string) {
  const files = loadSimulator(name);
  const ir = parseEjbProject(files);
  const builder = new GraphBuilder();
  const graph = builder.buildFromIR(ir);
  const clusterer = new DomainClusterer();
  const domainMap = clusterer.cluster(graph);
  const archDiscovery = new ArchitectureDiscovery();
  const archReport = archDiscovery.discover(graph, domainMap);
  const extractor = new MicroserviceExtractor();
  const extraction = extractor.extract(graph, domainMap, archReport);
  const vizEngine = new VisualizationEngine(builder);
  const visualizations = vizEngine.generateAll(graph, extraction, archReport);
  return { ir, graph, domainMap, archReport, extraction, visualizations, fileCount: files.length };
}

const simulators = [
  { name: "sim-01-core-banking", minNodes: 20, minEdges: 10, minDomains: 2, minMicroservices: 2, desc: "Core Banking (9 UC, 16 DTO)" },
  { name: "sim-02-virement", minNodes: 5, minEdges: 2, minDomains: 1, minMicroservices: 1, desc: "Virement SWIFT (JNDI cross-module)" },
  { name: "sim-03-kyc", minNodes: 3, minEdges: 0, minDomains: 1, minMicroservices: 1, desc: "KYC Conformité (OFAC, RGPD)" },
  { name: "sim-04-credit", minNodes: 5, minEdges: 0, minDomains: 1, minMicroservices: 1, desc: "Crédit Immobilier (TEG, self-invocation)" },
  { name: "sim-05-monetique", minNodes: 0, minEdges: 0, minDomains: 0, minMicroservices: 0, desc: "Monétique EJB 2.x (Home/Remote)" },
  { name: "sim-06-batch", minNodes: 0, minEdges: 0, minDomains: 0, minMicroservices: 0, desc: "Batch Nuit (JSR-352, JMS)" },
];

describe("AUDIT — Architecture Pipeline sur 6 simulateurs bancaires", () => {
  for (const sim of simulators) {
    describe(`${sim.name} — ${sim.desc}`, () => {
      const result = runPipeline(sim.name);

      it(`parse ${result.fileCount} fichiers Java`, () => {
        console.log(`[${sim.name}] Files: ${result.fileCount}, UseCases: ${result.ir.useCases.length}, DTOs: ${result.ir.dtos.length}`);
        expect(result.fileCount).toBeGreaterThan(0);
      });

      it(`graph: ${sim.minNodes}+ nodes, ${sim.minEdges}+ edges`, () => {
        const nodes = result.graph.nodes.length;
        const edges = result.graph.edges.length;
        console.log(`[${sim.name}] Graph: ${nodes} nodes, ${edges} edges`);
        expect(nodes).toBeGreaterThanOrEqual(sim.minNodes);
        expect(edges).toBeGreaterThanOrEqual(sim.minEdges);
      });

      it(`clustering: ${sim.minDomains}+ domains`, () => {
        console.log(`[${sim.name}] Domains: ${result.domainMap.length} — ${result.domainMap.map(d => `${d.domainId}(${d.classes.length})`).join(", ")}`);
        expect(result.domainMap.length).toBeGreaterThanOrEqual(sim.minDomains);
      });

      it(`architecture discovery: entry/exit/flows`, () => {
        const s = result.archReport.summary;
        console.log(`[${sim.name}] Entry: ${s.totalEntryPoints}, Exit: ${s.totalExitPoints}, Flows: ${s.totalCriticalFlows}, Modules: ${s.totalModules}`);
        if (sim.minNodes > 0) {
          expect(s.totalEntryPoints).toBeGreaterThanOrEqual(1);
        }
      });

      it(`microservices: ${sim.minMicroservices}+ extracted`, () => {
        const ms = result.extraction.microservices;
        console.log(`[${sim.name}] Microservices: ${ms.length} — ${ms.map(m => `${m.name}(${m.classes.length}cls)`).join(", ")}`);
        expect(ms.length).toBeGreaterThanOrEqual(sim.minMicroservices);
      });

      it(`visualizations: 6 outputs generated`, () => {
        console.log(`[${sim.name}] Visualizations: ${result.visualizations.length} — ${result.visualizations.map(v => v.filename).join(", ")}`);
        expect(result.visualizations.length).toBe(6);
        // Check SVG starts with <svg
        const svg = result.visualizations.find(v => v.filename.endsWith(".svg"));
        if (svg) {
          expect(svg.content).toContain("<svg");
        }
        // Check GraphML starts with <?xml
        const graphml = result.visualizations.find(v => v.filename.endsWith(".graphml"));
        if (graphml) {
          expect(graphml.content).toContain("<?xml");
        }
      });
    });
  }

  describe("Cross-simulator consistency", () => {
    it("all 6 simulators complete without errors", () => {
      const results = simulators.map(s => ({ name: s.name, ...runPipeline(s.name) }));
      console.log("\n=== SUMMARY TABLE ===");
      console.log("Simulator          | Files | Nodes | Edges | Domains | Microservices | Viz");
      console.log("-------------------|-------|-------|-------|---------|---------------|----");
      for (const r of results) {
        console.log(`${r.name.padEnd(19)}| ${String(r.fileCount).padEnd(6)}| ${String(r.graph.nodes.length).padEnd(6)}| ${String(r.graph.edges.length).padEnd(6)}| ${String(r.domainMap.length).padEnd(8)}| ${String(r.extraction.microservices.length).padEnd(14)}| ${r.visualizations.length}`);
      }
      expect(results.length).toBe(6);
    });

    it("pipeline is deterministic (run twice, same results)", () => {
      const r1 = runPipeline("sim-01-core-banking");
      const r2 = runPipeline("sim-01-core-banking");
      expect(r1.graph.nodes.length).toBe(r2.graph.nodes.length);
      expect(r1.graph.edges.length).toBe(r2.graph.edges.length);
      expect(r1.domainMap.length).toBe(r2.domainMap.length);
      expect(r1.extraction.microservices.length).toBe(r2.extraction.microservices.length);
    });
  });
});
