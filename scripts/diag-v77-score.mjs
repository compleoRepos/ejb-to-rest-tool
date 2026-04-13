/**
 * Diagnostic v7.7 — Vérifier les tables credit-service et le score qualité
 */
import { parseEjbProject } from "../server/java-parser.ts";
import { generateSpringBootProject } from "../server/spring-generator.ts";
import { MicroserviceSplitter } from "../server/engine/microservices/microservice-splitter.ts";
import { calculateQualityScore } from "../server/engine/quality-scorer.ts";
import AdmZip from "adm-zip";
import * as path from "path";

const ZIP_PATH = "tests/fixtures/input/bmce-core-banking-complex.zip";
const zip = new AdmZip(ZIP_PATH);
const files = zip.getEntries()
  .filter(e => !e.isDirectory && [".java", ".xml", ".properties"].some(ext => e.entryName.endsWith(ext)))
  .map(e => ({ path: e.entryName, content: e.getData().toString("utf-8") }));
const pomXml = files.find(f => f.path.endsWith("pom.xml"))?.content;

const ir = parseEjbProject(files, pomXml);
const gen = generateSpringBootProject(ir);
const fileMap = new Map(gen.files.map(f => [f.path, f.content]));

// Diagnostic 1: credit-service tables
const splitter = new MicroserviceSplitter();
const services = splitter.split(ir);
const creditService = services.find(s => s.name === "credit-service");
console.log("=== credit-service ===");
console.log("tables:", JSON.stringify(creditService?.tables));
console.log("modules:", creditService?.modules?.map(m => m.name));
console.log("confidence:", creditService?.confidence);

// Diagnostic 2: calculateQualityScore
const report = calculateQualityScore(fileMap);
console.log("\n=== Quality Score ===");
console.log("Score:", report.score, "Grade:", report.grade);
for (const c of report.checks) {
  console.log(`  ${c.id}: ${c.passed ? "PASS" : "FAIL"} (${c.points}/${c.maxPoints}) — ${c.detail}`);
}

// Diagnostic 3: Vérifier les fichiers microservices dans fileMap
console.log("\n=== Fichiers microservices dans fileMap ===");
const msFiles = [...fileMap.keys()].filter(p => p.includes("microservices/"));
console.log("Nombre:", msFiles.length);
const msDirs = new Set(msFiles.map(p => p.match(/microservices\/([^/]+)\//)?.[1]).filter(Boolean));
console.log("Répertoires:", [...msDirs]);
