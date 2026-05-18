import { parseEjbProject } from "../server/java-parser.ts";
import { generateSpringBootProject } from "../server/spring-generator.ts";
import AdmZip from "adm-zip";

const zip = new AdmZip("tests/fixtures/input/bmce-core-banking-complex.zip");
const files = zip.getEntries()
  .filter(e => !e.isDirectory && [".java", ".xml", ".properties"].some(ext => e.entryName.endsWith(ext)))
  .map(e => ({ path: e.entryName, content: e.getData().toString("utf-8") }));
const pomXml = files.find(f => f.path.endsWith("pom.xml"))?.content;
const ir = parseEjbProject(files, pomXml);
const gen = generateSpringBootProject(ir);

// Trouver le Void.builder()
console.log("=== Void.builder() ===");
for (const f of gen.files) {
  if (f.content.includes("Void.builder()") || f.content.includes("Void.builder")) {
    console.log("FOUND in:", f.path);
    const lines = f.content.split("\n");
    lines.forEach((l, i) => { if (l.includes("Void")) console.log("  L" + (i+1) + ":", l.trim()); });
  }
}

// Trouver les Oracle keywords
console.log("\n=== Oracle Keywords ===");
const ORACLE_KW = ["NOWAIT", "SYSDATE", "DUAL", "NEXTVAL", "ROWNUM", "ROWID", "NVL(", "DECODE(", "TO_DATE(", "TO_CHAR("];
for (const f of gen.files) {
  for (const kw of ORACLE_KW) {
    if (f.content.includes(kw)) {
      console.log("FOUND", kw, "in:", f.path);
      const lines = f.content.split("\n");
      lines.forEach((l, i) => { if (l.includes(kw)) console.log("  L" + (i+1) + ":", l.trim()); });
    }
  }
}
