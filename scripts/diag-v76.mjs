import { parseEjbProject } from "../server/java-parser.ts";
import { generateSpringBootProject } from "../server/spring-generator.ts";
import { MicroserviceSplitter } from "../server/engine/microservices/microservice-splitter.ts";
import AdmZip from "adm-zip";

const zip = new AdmZip("tests/fixtures/input/bmce-core-banking-complex.zip");
const files = [];
let pomXml;
for (const entry of zip.getEntries()) {
  if (entry.isDirectory) continue;
  const ext = entry.entryName.split(".").pop();
  if (["java", "xml", "properties", "yml", "yaml", "jsp"].includes(ext)) {
    const content = entry.getData().toString("utf-8");
    if (entry.entryName.endsWith("pom.xml")) pomXml = content;
    files.push({ path: entry.entryName, content });
  }
}

const ir = parseEjbProject(files, pomXml);

console.log("=== UseCases ===");
for (const uc of ir.useCases) {
  console.log(`  ${uc.className} | voIn: ${uc.voInType} | voOut: ${uc.voOutType} | params: ${JSON.stringify(uc.methodParameters)}`);
}

console.log("\n=== Generation ===");
const gen = generateSpringBootProject(ir);
const fileMap = new Map(gen.files.map(f => [f.path, f.content]));

// Check Compliance service
console.log("\n=== Compliance Service ===");
for (const [p, c] of fileMap) {
  if (p.includes("Compliance") && p.includes("Service.java")) {
    console.log(`File: ${p}`);
    // Find genererDeclarationTRAPROC
    const lines = c.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("genererDeclarationTRAPROC")) {
        console.log(lines.slice(Math.max(0, i - 1), i + 5).join("\n"));
      }
    }
  }
}

// Check for EJB_ prefix in method names
console.log("\n=== EJB_ prefix check ===");
for (const [p, c] of fileMap) {
  if (p.endsWith("Service.java")) {
    const matches = c.match(/\bEJB_\w+\s*\(/g);
    if (matches) {
      console.log(`  ${p}: ${matches.join(", ")}`);
    }
  }
}

// Check for execute() methods that shouldn't be there
console.log("\n=== execute() check ===");
for (const [p, c] of fileMap) {
  if (p.endsWith("Service.java")) {
    if (c.includes("public void execute()") || c.includes("public Object execute()")) {
      console.log(`  ${p}: has execute()`);
    }
  }
}

// Check CDI beans
console.log("\n=== CDI/Transformer/Validator files ===");
for (const [p] of fileMap) {
  if (p.includes("SEPATransformer") || p.includes("IBANValidator") || p.includes("CreditDataTransformer")) {
    console.log(`  ${p}`);
  }
}

// Microservices
console.log("\n=== Microservices ===");
const splitter = new MicroserviceSplitter();
const services = splitter.split(ir);
for (const s of services) {
  console.log(`  ${s.name} (confidence: ${s.confidence}%) — ${s.modules.length} modules`);
}
