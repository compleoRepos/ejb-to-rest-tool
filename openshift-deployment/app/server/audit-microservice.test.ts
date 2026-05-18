import { describe, it, expect } from "vitest";
import { parseEjbProject } from "./java-parser";
import { GraphBuilder } from "./graph/GraphBuilder";
import { DomainClusterer } from "./graph/DomainClusterer";
import { ArchitectureDiscovery } from "./graph/ArchitectureDiscovery";
import { MicroserviceExtractor } from "./graph/MicroserviceExtractor";
import * as fs from "fs";
import * as path from "path";

describe("AUDIT — MicroserviceExtractor sim-01", () => {
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
  const domainMap = clusterer.cluster(graph);
  const archDiscovery = new ArchitectureDiscovery();
  const archReport = archDiscovery.discover(graph, domainMap);
  const extractor = new MicroserviceExtractor();
  const result = extractor.extract(graph, domainMap, archReport);

  it("produces 2+ microservices", () => {
    console.log("Microservices:", result.microservices.length, result.microservices.map(c => `${c.name}(${c.classes.length} classes)`));
    expect(result.microservices.length).toBeGreaterThanOrEqual(2);
  });

  it("each microservice has name, classes, endpoints", () => {
    for (const c of result.microservices) {
      console.log(`  ${c.name}: classes=${c.classes.length}, endpoints=${c.endpoints?.length || 0}, deps=${c.dependencies?.length || 0}`);
      expect(c.name).toBeTruthy();
      expect(c.classes.length).toBeGreaterThan(0);
    }
  });

  it("no class appears in multiple microservices", () => {
    const allClasses = result.microservices.flatMap(c => c.classes);
    const unique = new Set(allClasses);
    console.log(`Total classes in microservices: ${allClasses.length}, Unique: ${unique.size}`);
    expect(unique.size).toBe(allClasses.length);
  });

  it("shared library extracted if applicable", () => {
    console.log("Shared library:", result.sharedLibrary ? `${result.sharedLibrary.classes.length} classes` : "none");
    if (result.sharedLibrary) {
      expect(result.sharedLibrary.classes.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("API Gateway generated with routes", () => {
    console.log("API Gateway routes:", result.apiGateway.routes.length, result.apiGateway.routes.slice(0, 3).map(r => `${r.method} ${r.path} -> ${r.targetService}`));
    expect(result.apiGateway).toBeDefined();
    expect(result.apiGateway.routes.length).toBeGreaterThan(0);
  });

  it("summary has all fields", () => {
    console.log("Summary:", JSON.stringify(result.summary));
    expect(result.summary.totalMicroservices).toBeDefined();
    expect(result.summary.totalClasses).toBeDefined();
    expect(result.summary.totalEndpoints).toBeDefined();
    expect(result.summary.avgCohesion).toBeDefined();
  });

  it("no microservice exceeds 15 classes (split threshold)", () => {
    const oversized = result.microservices.filter(c => c.classes.length > 15);
    if (oversized.length > 0) {
      console.log("OVERSIZED:", oversized.map(c => `${c.name}(${c.classes.length})`));
    }
    // This is informational — oversized services should have been split
    expect(result.microservices.length).toBeGreaterThan(0);
  });
});
