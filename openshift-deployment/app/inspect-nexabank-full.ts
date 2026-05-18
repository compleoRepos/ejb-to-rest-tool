import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";
import { autoFixAndCompile } from "./server/engine/validation/CompileAutoFixer";
const dir = "/tmp/test-projects/proj-11-nexabank-core";
const files: SourceFile[] = [];
function walk(d: string) { for (const e of readdirSync(d)) { const f = join(d, e); try { const s = statSync(f); if (s.isDirectory()) walk(f); else if (e.endsWith(".java")) files.push({ path: f.replace(dir + "/", ""), content: readFileSync(f, "utf-8") }); } catch {} } }
walk(dir);
const engine = new CompleoEngine();
engine.analyze(files).then(r => {
  engine.generate(r.ir, undefined, undefined, r.multiTech?.generatedFiles || []).then(gen => {
    const result = autoFixAndCompile(gen.files, { timeout: 90000 });
    if (result.finalResult.status === "FAIL") {
      for (const err of result.finalResult.errors) {
        if (err.file.includes("Virement")) {
          console.log(`ERROR: ${err.file}:${err.line}:${err.column} → ${err.message}`);
          // Find the file and show the line
          // The files are in the temp dir, we need to find them
        }
      }
      // Show fixes applied
      console.log("\nFixes applied:", result.fixesApplied.length);
      for (const fix of result.fixesApplied.slice(-10)) {
        console.log(`  ${fix.type}: ${fix.description}`);
      }
    }
    console.log(`\nFinal: ${result.finalResult.status} (${result.finalResult.errorCount} errors)`);
  });
});
