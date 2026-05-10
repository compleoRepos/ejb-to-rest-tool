import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";
const dir = "/tmp/test-projects/proj-10-jdbc-monolith";
const files: SourceFile[] = [];
function walk(d: string) { for (const e of readdirSync(d)) { const f = join(d, e); try { const s = statSync(f); if (s.isDirectory()) walk(f); else if (e.endsWith(".java")) files.push({ path: f.replace(dir + "/", ""), content: readFileSync(f, "utf-8") }); } catch {} } }
walk(dir);
const engine = new CompleoEngine();
engine.analyze(files).then(r => {
  engine.generate(r.ir, undefined, undefined, r.multiTech?.generatedFiles || []).then(gen => {
    const bs = gen.files.find(f => f.path.includes("BillingService"));
    if (bs) {
      const lines = bs.content.split("\n");
      console.log(`Total lines: ${lines.length}`);
      // Show lines around 60 and 96
      for (let i = 55; i <= 65; i++) {
        console.log(`L${i}: ${lines[i-1] || ''}`);
      }
      console.log("...");
      for (let i = 91; i <= 100; i++) {
        console.log(`L${i}: ${lines[i-1] || ''}`);
      }
    }
  });
});
