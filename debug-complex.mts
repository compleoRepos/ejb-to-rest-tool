import { parseEjbProject } from "./server/java-parser";
import { generateSpringBootProject } from "./server/spring-generator";
import { MicroserviceSplitter } from "./server/engine/microservices/microservice-splitter";
import AdmZip from "adm-zip";

const zip = new AdmZip("tests/fixtures/input/bmce-core-banking-complex.zip");
const entries = zip.getEntries();
const files = entries
  .filter(e => !e.isDirectory && (e.entryName.endsWith(".java") || e.entryName.endsWith(".xml") || e.entryName.endsWith(".yml") || e.entryName.endsWith(".yaml") || e.entryName.endsWith(".properties")))
  .map(e => ({ path: e.entryName, content: e.getData().toString("utf-8") }));

const pomEntry = files.find(f => f.path.endsWith("pom.xml"));
const ir = parseEjbProject(files, pomEntry?.content);

console.log("=== UseCases ===");
ir.useCases.forEach(u => console.log(`  ${u.className} (methods: ${u.methods?.length || 0})`));

console.log("\n=== DirectEjbFiles ===");
(ir.directEjbFiles || []).forEach(f => console.log(`  ${f.className}`));

console.log("\n=== DTOs ===");
console.log(`  Count: ${ir.dtoFiles?.length || 0}`);
if (ir.dtoFiles) ir.dtoFiles.forEach(d => console.log(`  ${d.className}`));

const gen = generateSpringBootProject(ir);
const serviceFiles = gen.files.filter(f => f.path.includes("Service.java"));
console.log("\n=== Generated Services ===");
serviceFiles.forEach(f => console.log(`  ${f.path}`));

const allFiles = gen.files.map(f => f.path);
const creditFiles = allFiles.filter(f => f.toLowerCase().includes("credit"));
console.log("\n=== Files containing 'credit' ===");
creditFiles.forEach(f => console.log(`  ${f}`));

const splitter = new MicroserviceSplitter();
const services = splitter.split(ir);
console.log("\n=== Microservices ===");
services.forEach(s => {
  console.log(`  ${s.name} (confidence: ${s.confidence}, modules: ${(s.modules || []).length})`);
  (s.modules || []).forEach(m => console.log(`    - ${m.className || m.ejbId}`));
});
