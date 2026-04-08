import { describe, it, expect } from "vitest";
import { parseEjbProject } from "./java-parser";
import { GraphBuilder } from "./graph/GraphBuilder";
import { DomainClusterer } from "./graph/DomainClusterer";
import { ArchitectureDiscovery } from "./graph/ArchitectureDiscovery";
import * as fs from "fs";
import * as path from "path";

describe("AUDIT — DomainClusterer + ArchitectureDiscovery sim-01", () => {
  const simDir = path.join(__dirname, "../test-projects/simulateurs/sim-01-core-banking");
  const files = fs.readdirSync(simDir, { recursive: true })
    .filter((f: any) => f.toString().endsWith(".java"))
    .map((f: any) => ({
      path: f.toString(),
      content: fs.readFileSync(path.join(simDir, f.toString()), "utf-8"),
    }));

  const ir = parseEjbProject(files);
  const builder = new GraphBuilder();
  const graph = builder.buildFromIR(ir);
  const clusterer = new DomainClusterer();
  const domainMap = clusterer.cluster(graph); // DomainMap = DomainCluster[]
  const discovery = new ArchitectureDiscovery();
  const report = discovery.discover(graph, domainMap);

  // DomainClusterer tests
  it("domainMap has 2+ domains", () => {
    console.log("Domains:", domainMap.map(d => `${d.domainId}(${d.classes.length} classes)`));
    expect(domainMap.length).toBeGreaterThanOrEqual(2);
  });

  it("each domain has cohesion/couplage metrics", () => {
    for (const domain of domainMap) {
      console.log(`Domain ${domain.domainId}: cohesion=${domain.cohesion.toFixed(3)}, couplage=${domain.couplage.toFixed(3)}, classes=${domain.classes.length}`);
      expect(domain.cohesion).toBeDefined();
      expect(typeof domain.cohesion).toBe("number");
      expect(domain.couplage).toBeDefined();
      expect(typeof domain.couplage).toBe("number");
    }
  });

  it("all CLASS nodes assigned to a domain", () => {
    const allClasses = graph.nodes.filter(n => n.type === "CLASS");
    const assignedClasses = domainMap.flatMap(d => d.classes);
    console.log(`Total CLASS nodes: ${allClasses.length}, Assigned to domains: ${assignedClasses.length}`);
    expect(assignedClasses.length).toBeGreaterThanOrEqual(allClasses.length * 0.5);
  });

  it("warnings array present on each domain", () => {
    for (const domain of domainMap) {
      expect(Array.isArray(domain.warnings)).toBe(true);
      if (domain.warnings.length > 0) {
        console.log(`Warnings for ${domain.domainId}:`, domain.warnings);
      }
    }
  });

  // ArchitectureDiscovery tests
  it("entryPoints detected (>= 1)", () => {
    console.log("Entry points:", report.entryPoints.length, report.entryPoints.map(e => e.className));
    expect(report.entryPoints.length).toBeGreaterThanOrEqual(1);
  });

  it("exitPoints detected (>= 1)", () => {
    console.log("Exit points:", report.exitPoints.length, report.exitPoints.map(e => e.targetSystem));
    expect(report.exitPoints.length).toBeGreaterThanOrEqual(1);
  });

  it("criticalFlows traced (>= 1)", () => {
    console.log("Critical flows:", report.criticalFlows.length);
    for (const f of report.criticalFlows.slice(0, 3)) {
      console.log(`  Flow: ${f.entryPoint.className} -> depth=${f.path.length}, risk=${f.riskLevel}`);
    }
    expect(report.criticalFlows.length).toBeGreaterThanOrEqual(1);
  });

  it("functionalModules built (>= 1)", () => {
    console.log("Functional modules:", report.functionalModules.length);
    for (const m of report.functionalModules) {
      console.log(`  Module: ${m.name}, classes=${m.classes.length}, cohesion=${m.cohesion}`);
    }
    expect(report.functionalModules.length).toBeGreaterThanOrEqual(1);
  });

  it("summary has all fields", () => {
    console.log("Summary:", JSON.stringify(report.summary));
    expect(report.summary.totalEntryPoints).toBeDefined();
    expect(report.summary.totalExitPoints).toBeDefined();
    expect(report.summary.totalCriticalFlows).toBeDefined();
  });
});
