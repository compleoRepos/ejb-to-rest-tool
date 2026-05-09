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

async function main() {
  const javaFiles = readJavaFiles("/tmp/test-projects/proj-04-bookstore");
  const engine = new CompleoEngine();
  const analysisResult = await engine.analyze(javaFiles);
  const genResult = await engine.generate(
    analysisResult.ir,
    undefined,
    undefined,
    analysisResult.multiTech?.generatedFiles || []
  );

  // Find OrderBean in generated files
  const orderFiles = genResult.files.filter((f: any) => f.path.includes("Order"));
  for (const f of orderFiles) {
    console.log(`\n=== ${f.path} ===`);
    const lines = f.content.split("\n");
    for (let i = 0; i < Math.min(40, lines.length); i++) {
      console.log(`${(i + 1).toString().padStart(3)}: ${lines[i]}`);
    }
  }

  // Also check enums
  const enumFiles = genResult.files.filter((f: any) => f.path.includes("enum") || f.content.includes("enum "));
  console.log(`\n\n=== ENUM FILES (${enumFiles.length}) ===`);
  for (const f of enumFiles) {
    console.log(`\n--- ${f.path} ---`);
    console.log(f.content.substring(0, 500));
  }
}

main().catch(console.error);
