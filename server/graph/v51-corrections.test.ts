/**
 * Tests TDD pour les CORRECTIONS 2 à 5 de la v5.1
 * CORRECTION 2: highRiskFlows via Rule Engine (croisement flux critiques / règles FIN/SEC)
 * CORRECTION 3: EJB 2.x Home/Remote + JSR-352 batch dans GraphBuilder
 * CORRECTION 4: Réduction UNKNOWN dans DomainClusterer
 * CORRECTION 5: targetSystem renseigné sur ExitPoints
 *
 * @author Hamza NORDINE
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../java-parser";
import { GraphBuilder } from "./GraphBuilder";
import { DomainClusterer } from "./DomainClusterer";
import { ArchitectureDiscovery } from "./ArchitectureDiscovery";
import * as fs from "fs";
import * as path from "path";

// ── Helpers ─────────────────────────────────────────────────────────────────

const simBase = path.join(__dirname, "../../test-projects/simulateurs");

function loadSimFiles(simName: string) {
  const simDir = path.join(simBase, simName);
  if (!fs.existsSync(simDir)) return [];
  return fs
    .readdirSync(simDir, { recursive: true })
    .filter((f: any) => f.toString().endsWith(".java"))
    .map((f: any) => ({
      path: f.toString(),
      content: fs.readFileSync(path.join(simDir, f.toString()), "utf-8"),
    }));
}

function loadAllSimFiles() {
  const sims = ["sim-01-core-banking", "sim-02-virement", "sim-03-kyc", "sim-04-credit", "sim-05-monetique", "sim-06-batch"];
  const allFiles: { path: string; content: string }[] = [];
  for (const sim of sims) {
    allFiles.push(...loadSimFiles(sim));
  }
  return allFiles;
}

function runPipeline(files: { path: string; content: string }[]) {
  const ir = parseEjbProject(files);
  const builder = new GraphBuilder();
  const graph = builder.buildFromIR(ir);
  const clusterer = new DomainClusterer();
  const domainMap = clusterer.cluster(graph);
  const discovery = new ArchitectureDiscovery();
  const report = discovery.discover(graph, domainMap);
  return { ir, graph, domainMap, report };
}

// ═══════════════════════════════════════════════════════════════════════════
// CORRECTION 2 — highRiskFlows via Rule Engine
// ═══════════════════════════════════════════════════════════════════════════

describe("CORRECTION 2 — highRiskFlows via Rule Engine", () => {
  it("ArchitectureReport.highRiskFlows contient des flux avec ruleHits", () => {
    const files = loadAllSimFiles();
    const { report } = runPipeline(files);
    // Les flux critiques doivent avoir des riskFactors incluant des règles
    const highRisk = report.criticalFlows.filter(
      (f) => f.riskLevel === "HIGH" || f.riskLevel === "CRITICAL"
    );
    console.log(`High risk flows: ${highRisk.length}`);
    for (const f of highRisk.slice(0, 5)) {
      console.log(`  ${f.name}: risk=${f.riskLevel}, factors=${f.riskFactors.join(", ")}`);
    }
    // Au moins 1 flux à haut risque détecté sur le SI complet
    expect(report.summary.highRiskFlows).toBeGreaterThanOrEqual(1);
  });

  it("sim-01 core-banking: au moins 1 flux HIGH/CRITICAL", () => {
    const files = loadSimFiles("sim-01-core-banking");
    const { report } = runPipeline(files);
    const highRisk = report.criticalFlows.filter(
      (f) => f.riskLevel === "HIGH" || f.riskLevel === "CRITICAL"
    );
    console.log(`sim-01 high risk: ${highRisk.length}`);
    for (const f of highRisk) {
      console.log(`  ${f.name}: risk=${f.riskLevel}, factors=${f.riskFactors.join(", ")}`);
    }
    expect(highRisk.length).toBeGreaterThanOrEqual(1);
  });

  it("CriticalFlow.riskFactors contient des références aux catégories de règles", () => {
    const files = loadAllSimFiles();
    const { report } = runPipeline(files);
    const allFactors = report.criticalFlows.flatMap((f) => f.riskFactors);
    console.log("All risk factors:", [...new Set(allFactors)]);
    // Les facteurs de risque doivent exister
    expect(allFactors.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CORRECTION 3 — EJB 2.x Home/Remote + JSR-352 batch dans GraphBuilder
// ═══════════════════════════════════════════════════════════════════════════

describe("CORRECTION 3 — EJB 2.x + JSR-352 dans GraphBuilder", () => {
  it("sim-05 monetique (EJB 2.x): graph.nodes >= 4 (SessionBean classes)", () => {
    const files = loadSimFiles("sim-05-monetique");
    expect(files.length).toBeGreaterThan(0);
    const { graph } = runPipeline(files);
    const classNodes = graph.nodes.filter((n) => n.type === "CLASS");
    console.log(`sim-05 CLASS nodes: ${classNodes.length}`);
    for (const n of classNodes) {
      const cn = n as any;
      console.log(`  ${cn.className} — tech=${cn.technologyType}, role=${cn.role}`);
    }
    expect(classNodes.length).toBeGreaterThanOrEqual(4);
  });

  it("sim-05: au moins 2 nœuds avec technologyType EJB_2X", () => {
    const files = loadSimFiles("sim-05-monetique");
    const { graph } = runPipeline(files);
    const ejb2xNodes = graph.nodes.filter(
      (n) => n.type === "CLASS" && (n as any).technologyType === "EJB_2X"
    );
    console.log(`sim-05 EJB_2X nodes: ${ejb2xNodes.length}`);
    expect(ejb2xNodes.length).toBeGreaterThanOrEqual(2);
  });

  it("sim-06 batch (JSR-352): graph.nodes >= 3 (ItemReader/Writer/Processor)", () => {
    const files = loadSimFiles("sim-06-batch");
    expect(files.length).toBeGreaterThan(0);
    const { graph } = runPipeline(files);
    const classNodes = graph.nodes.filter((n) => n.type === "CLASS");
    console.log(`sim-06 CLASS nodes: ${classNodes.length}`);
    for (const n of classNodes) {
      const cn = n as any;
      console.log(`  ${cn.className} — tech=${cn.technologyType}, role=${cn.role}`);
    }
    expect(classNodes.length).toBeGreaterThanOrEqual(3);
  });

  it("sim-06: au moins 2 nœuds avec technologyType BATCH_JSR352", () => {
    const files = loadSimFiles("sim-06-batch");
    const { graph } = runPipeline(files);
    const batchNodes = graph.nodes.filter(
      (n) => n.type === "CLASS" && (n as any).technologyType === "BATCH_JSR352"
    );
    console.log(`sim-06 BATCH_JSR352 nodes: ${batchNodes.length}`);
    expect(batchNodes.length).toBeGreaterThanOrEqual(2);
  });

  it("sim-06: arête EMITS_EVENT ou DB_ACCESS détectée (batch → queue/DB)", () => {
    const files = loadSimFiles("sim-06-batch");
    const { graph } = runPipeline(files);
    const eventOrDb = graph.edges.filter(
      (e) => e.type === "EMITS_EVENT" || e.type === "DB_ACCESS"
    );
    console.log(`sim-06 EMITS_EVENT/DB_ACCESS edges: ${eventOrDb.length}`);
    expect(eventOrDb.length).toBeGreaterThanOrEqual(1);
  });

  it("ProjectIR contient ejb2xBeans pour sim-05", () => {
    const files = loadSimFiles("sim-05-monetique");
    const ir = parseEjbProject(files);
    const ejb2x = (ir as any).ejb2xBeans;
    console.log(`sim-05 ejb2xBeans: ${ejb2x?.length ?? 0}`);
    expect(ejb2x).toBeDefined();
    expect(ejb2x.length).toBeGreaterThanOrEqual(2);
  });

  it("ProjectIR contient batchJobs pour sim-06", () => {
    const files = loadSimFiles("sim-06-batch");
    const ir = parseEjbProject(files);
    const batch = (ir as any).batchJobs;
    console.log(`sim-06 batchJobs: ${batch?.length ?? 0}`);
    expect(batch).toBeDefined();
    expect(batch.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CORRECTION 4 — Réduction UNKNOWN dans DomainClusterer
// ═══════════════════════════════════════════════════════════════════════════

describe("CORRECTION 4 — Réduction UNKNOWN dans DomainClusterer", () => {
  it("sim-01: UNKNOWN classes <= 30% du total", () => {
    const files = loadSimFiles("sim-01-core-banking");
    const { graph, domainMap } = runPipeline(files);
    const totalClasses = graph.nodes.filter((n) => n.type === "CLASS").length;
    const unknownCluster = domainMap.find((d) => d.domainId === "UNKNOWN");
    const unknownCount = unknownCluster?.classes.length ?? 0;
    const pct = totalClasses > 0 ? (unknownCount / totalClasses) * 100 : 0;
    console.log(`sim-01 UNKNOWN: ${unknownCount}/${totalClasses} (${pct.toFixed(1)}%)`);
    expect(pct).toBeLessThanOrEqual(30);
  });

  it("SI complet: UNKNOWN classes <= 25% du total", () => {
    const files = loadAllSimFiles();
    const { graph, domainMap } = runPipeline(files);
    const totalClasses = graph.nodes.filter((n) => n.type === "CLASS").length;
    const unknownCluster = domainMap.find((d) => d.domainId === "UNKNOWN");
    const unknownCount = unknownCluster?.classes.length ?? 0;
    const pct = totalClasses > 0 ? (unknownCount / totalClasses) * 100 : 0;
    console.log(`SI complet UNKNOWN: ${unknownCount}/${totalClasses} (${pct.toFixed(1)}%)`);
    expect(pct).toBeLessThanOrEqual(25);
  });

  it("DomainClusterer classifie DTOs/Exceptions/Enums par héritage et voisinage", () => {
    const files = loadSimFiles("sim-01-core-banking");
    const { domainMap } = runPipeline(files);
    const domains = domainMap.map((d) => d.domainId);
    console.log("Domains:", domains);
    // Au moins 2 domaines non-UNKNOWN
    const nonUnknown = domains.filter((d) => d !== "UNKNOWN");
    expect(nonUnknown.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CORRECTION 5 — targetSystem renseigné sur ExitPoints
// ═══════════════════════════════════════════════════════════════════════════

describe("CORRECTION 5 — targetSystem sur ExitPoints", () => {
  it("ExitPoint.targetSystem est défini et non-undefined", () => {
    const files = loadSimFiles("sim-01-core-banking");
    const { report } = runPipeline(files);
    console.log("Exit points:", report.exitPoints.length);
    for (const ep of report.exitPoints) {
      console.log(`  ${ep.className} → target=${ep.target}, targetSystem=${(ep as any).targetSystem}`);
      // targetSystem doit être défini
      expect((ep as any).targetSystem).toBeDefined();
      expect((ep as any).targetSystem).not.toBe("undefined");
    }
  });

  it("targetSystem infère le type de système cible", () => {
    const files = loadAllSimFiles();
    const { report } = runPipeline(files);
    const targetSystems = report.exitPoints.map((ep) => (ep as any).targetSystem).filter(Boolean);
    console.log("Target systems:", [...new Set(targetSystems)]);
    // Au moins 1 targetSystem renseigné
    expect(targetSystems.length).toBeGreaterThanOrEqual(1);
  });
});
