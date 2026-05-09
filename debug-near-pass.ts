import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
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

async function debugProject(dir: string, targetFile: string) {
  const javaFiles = readJavaFiles(dir);
  const engine = new CompleoEngine();
  const analysisResult = await engine.analyze(javaFiles);
  const genResult = await engine.generate(
    analysisResult.ir,
    undefined,
    undefined,
    analysisResult.multiTech?.generatedFiles || []
  );

  const matches = genResult.files.filter((f: any) => f.path.includes(targetFile));
  for (const f of matches) {
    console.log(`\n=== ${f.path} ===`);
    console.log(f.content);
  }
}

async function main() {
  // jdbc-monolith: DatabaseService.java
  console.log("\n\n========== JDBC-MONOLITH: DatabaseService ==========");
  await debugProject("/tmp/test-projects/proj-10-jdbc-monolith", "DatabaseService");

  // ngbilling: DebugValidator
  console.log("\n\n========== NGBILLING: DebugValidator ==========");
  await debugProject("/tmp/test-projects/proj-05-ngbilling", "DebugValidator");

  // bookstore: Cart + AdminService
  console.log("\n\n========== BOOKSTORE: Cart + AdminService ==========");
  await debugProject("/tmp/test-projects/proj-04-bookstore", "Cart");
  await debugProject("/tmp/test-projects/proj-04-bookstore", "AdminService");
}

main().catch(console.error);
