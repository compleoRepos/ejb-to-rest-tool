/**
 * Inspecte les services générés pour mise-disposition-bmcedirect
 * et sauvegarde les fichiers avec TODO dans /tmp/gen-services/
 */
import { getEngine, type SourceFile } from "../server/engine/CompleoEngine";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const projectDir = path.resolve(PROJECT_ROOT, "test-projects/mise-disposition-bmcedirect");
const files: SourceFile[] = [];
function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(java|xml|properties|jsp)$/.test(entry.name)) {
      files.push({ path: path.relative(projectDir, fullPath), content: fs.readFileSync(fullPath, "utf-8") });
    }
  }
}
walk(projectDir);

async function main() {
  const engine = getEngine();
  const { ir } = await engine.analyze(files, { projectName: "mise-disposition" });
  const gen = await engine.generate(ir);
  
  const outDir = "/tmp/gen-services";
  fs.mkdirSync(outDir, { recursive: true });
  
  // Save all services
  const allServices = gen.files.filter(f => 
    f.path.includes("Service.java") || f.path.includes("IntegrationService.java")
  );
  
  for (const s of allServices) {
    const outPath = path.join(outDir, path.basename(s.path));
    fs.writeFileSync(outPath, s.content || "");
    const todoCount = (s.content?.match(/\/\/ TODO/g) || []).length;
    const status = todoCount > 0 ? `${todoCount} TODO(s)` : "CLEAN";
    console.log(`${path.basename(s.path)}: ${status}, ${s.content?.length} chars`);
  }
  
  console.log(`\nFichiers sauvegardés dans ${outDir}/`);
}

main().catch(console.error);
