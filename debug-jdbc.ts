import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";
import { autoFixAndCompile } from "./server/engine/validation/CompileAutoFixer";

const dir = "/tmp/test-projects/proj-10-jdbc-monolith";
const files: SourceFile[] = [];
function walk(d: string) { 
  for (const e of readdirSync(d)) { 
    const f = join(d, e); 
    try { 
      const s = statSync(f); 
      if (s.isDirectory()) walk(f); 
      else if (e.endsWith(".java")) 
        files.push({ path: f.replace(dir + "/", ""), content: readFileSync(f, "utf-8") }); 
    } catch {} 
  } 
}
walk(dir);

const engine = new CompleoEngine();
engine.analyze(files).then(r => {
  engine.generate(r.ir, undefined, undefined, r.multiTech?.generatedFiles || []).then(gen => {
    console.log(`Generated ${gen.files.length} files`);
    
    // Run autofix
    const result = autoFixAndCompile(gen.files, { keepTempDir: true });
    console.log(`Final status: ${result.finalResult.status}`);
    console.log(`Final errors: ${result.finalResult.errorCount}`);
    
    // Save the final files for inspection
    const debugDir = "/tmp/debug-jdbc";
    mkdirSync(debugDir, { recursive: true });
    for (const f of result.finalFiles || gen.files) {
      const p = join(debugDir, f.path);
      mkdirSync(join(debugDir, ...f.path.split("/").slice(0, -1)), { recursive: true });
      writeFileSync(p, f.content, "utf-8");
    }
    console.log(`Files saved to ${debugDir}`);
    
    // Show the BillingService around lines 55-65 and 90-100
    const bs = (result.finalFiles || gen.files).find(f => f.path.includes("BillingService"));
    if (bs) {
      const lines = bs.content.split("\n");
      console.log(`\nBillingService total lines: ${lines.length}`);
      console.log("\n=== Lines 55-65 ===");
      for (let i = 55; i <= 65; i++) {
        console.log(`L${i} (${(lines[i-1]||'').length}c): ${lines[i-1] || ''}`);
      }
      console.log("\n=== Lines 90-100 ===");
      for (let i = 90; i <= 100; i++) {
        console.log(`L${i} (${(lines[i-1]||'').length}c): ${lines[i-1] || ''}`);
      }
    }
    
    // Show errors
    for (const e of result.finalResult.errors) {
      console.log(`  ${e.file}:${e.line}:${e.column} → ${e.message}`);
    }
  });
});
