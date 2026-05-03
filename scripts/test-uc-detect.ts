import { parseEjbProject } from "../server/java-parser";
import * as fs from "fs";
import * as path from "path";

function readProject(dir: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".java") || entry.name === "pom.xml") {
        files.push({ path: full, content: fs.readFileSync(full, "utf-8") });
      }
    }
  }
  walk(dir);
  return files;
}

const projects = [
  "/home/ubuntu/pipeline-test/projects2/interface-send-sms",
  "/home/ubuntu/pipeline-test/projects1/interface-credit-jocker",
  "/home/ubuntu/pipeline-test/projects3/virement-permanent-bmcedirect",
  "/home/ubuntu/pipeline-test/projects3/transfert-euro-bmce-direct",
];

for (const dir of projects) {
  if (!fs.existsSync(dir)) { console.log(`SKIP ${dir}`); continue; }
  const files = readProject(dir);
  const pomFile = files.find(f => f.path.endsWith("pom.xml"));
  const ir = parseEjbProject(files, pomFile?.content);
  console.log(`${path.basename(dir)}: ${ir.useCases.length} UC, ${ir.stats.totalFiles} files, warnings: ${ir.warnings.length}`);
  if (ir.useCases.length > 0) {
    console.log(`  UC: ${ir.useCases.map(uc => uc.className).join(", ")}`);
  } else {
    console.log(`  ⚠️ 0 UC detected — candidate for LlmUseCaseDetector`);
  }
  if (ir.warnings.length > 0) {
    ir.warnings.forEach(w => console.log(`  [W] ${w}`));
  }
}
