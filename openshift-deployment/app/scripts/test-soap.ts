import { parseEjbProject } from "../server/java-parser";
import * as fs from "fs";
import * as path from "path";

function collectFiles(dir: string): { path: string; content: string }[] {
  const results: { path: string; content: string }[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".java") || entry.name === "pom.xml")
        results.push({ path: full, content: fs.readFileSync(full, "utf-8") });
    }
  }
  walk(dir);
  return results;
}

// Test interface-credit-jocker
const dir1 = "/home/ubuntu/pipeline-test/projects1/interface-credit-jocker";
const files1 = collectFiles(dir1);
const pom1 = files1.find(f => f.path.endsWith("pom.xml"))?.content;
const ir1 = parseEjbProject(files1, pom1);
console.log(`\n=== interface-credit-jocker ===`);
console.log(`UseCases: ${ir1.useCases.length}`);
ir1.useCases.forEach(uc => console.log(`  - ${uc.className} (${uc.httpMethod} ${uc.restPath})`));
console.log(`Warnings:`, ir1.warnings.filter(w => w.includes("SOAP")));

// Test interface-send-sms
const dir2 = "/home/ubuntu/pipeline-test/projects2/interface-send-sms";
const files2 = collectFiles(dir2);
const pom2 = files2.find(f => f.path.endsWith("pom.xml"))?.content;
const ir2 = parseEjbProject(files2, pom2);
console.log(`\n=== interface-send-sms ===`);
console.log(`UseCases: ${ir2.useCases.length}`);
ir2.useCases.forEach(uc => console.log(`  - ${uc.className} (${uc.httpMethod} ${uc.restPath})`));
console.log(`Warnings:`, ir2.warnings.filter(w => w.includes("SOAP")));

// Test virement-permanent (should still work with inner enum fix)
const dir3 = "/home/ubuntu/pipeline-test/projects3/virement-permanent-bmcedirect";
const files3 = collectFiles(dir3);
const pom3 = files3.find(f => f.path.endsWith("pom.xml"))?.content;
const ir3 = parseEjbProject(files3, pom3);
console.log(`\n=== virement-permanent-bmcedirect ===`);
console.log(`UseCases: ${ir3.useCases.length}`);
console.log(`First 5:`, ir3.useCases.slice(0, 5).map(uc => uc.className));
