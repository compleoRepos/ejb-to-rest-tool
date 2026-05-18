import { parseEjbProject } from "../server/java-parser";
import * as fs from "fs";
import * as path from "path";

const projectPath = "/home/ubuntu/pipeline-test/projects1/interface-credit-jocker";
const files: any[] = [];
function walk(dir: string) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (f.endsWith(".java")) {
      files.push({ path: full, content: fs.readFileSync(full, "utf-8") });
    }
  }
}
walk(projectPath);

const result = parseEjbProject(files);
// Show first 5 useCases with their params
for (const uc of result.useCases.slice(0, 5)) {
  console.log(`\n=== ${uc.className} ===`);
  console.log(`  voInType: ${uc.voInType}`);
  console.log(`  voOutType: ${uc.voOutType}`);
  console.log(`  methodParameters:`, JSON.stringify((uc as any).methodParameters));
}
