import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
// Must be run from /home/ubuntu/ejb-client-modernizer
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";

function readJavaFiles(dir: string): SourceFile[] {
  const files: SourceFile[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (entry.endsWith(".java")) {
          files.push({ path: full.replace(dir + "/", ""), content: readFileSync(full, "utf-8") });
        }
      } catch {}
    }
  }
  walk(dir);
  return files;
}

async function debugProject(projDir: string, targetFile: string) {
  const javaFiles = readJavaFiles(projDir);
  const engine = new CompleoEngine();
  const analysisResult = await engine.analyze(javaFiles);
  const genResult = await engine.generate(
    analysisResult.ir,
    undefined,
    undefined,
    analysisResult.multiTech?.generatedFiles || []
  );

  const file = genResult.files.find((f: any) => f.path.includes(targetFile));
  if (file) {
    console.log(`=== ${targetFile} (${file.path}) ===`);
    const lines = file.content.split("\n");
    for (let i = 0; i < Math.min(80, lines.length); i++) {
      console.log(`${(i + 1).toString().padStart(3)}: ${lines[i]}`);
    }
  } else {
    console.log(`${targetFile} not found. Available files:`);
    genResult.files.filter((f: any) => f.path.endsWith(".java")).slice(0, 20).forEach((f: any) => console.log(`  ${f.path}`));
  }
}

async function main() {
  // Debug broadleaf ForController
  console.log("\n\n========== BROADLEAF: ForController ==========");
  await debugProject("/tmp/test-projects/proj-02-broadleaf", "ForController");
  
  // Debug jdbc-monolith DatabaseController  
  console.log("\n\n========== JDBC-MONOLITH: DatabaseController ==========");
  await debugProject("/tmp/test-projects/proj-10-jdbc-monolith", "DatabaseController");

  // Debug bookstore OrderBean
  console.log("\n\n========== BOOKSTORE: OrderBean ==========");
  await debugProject("/tmp/test-projects/proj-04-bookstore", "OrderBean");

  // Debug ngbilling DebugValidator
  console.log("\n\n========== NGBILLING: DebugValidator ==========");
  await debugProject("/tmp/test-projects/proj-05-ngbilling", "DebugValidator");
}

main().catch(console.error);
