import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";
const dir = "/tmp/test-projects/proj-11-nexabank-core";
const files: SourceFile[] = [];
function walk(d: string) { for (const e of readdirSync(d)) { const f = join(d, e); try { const s = statSync(f); if (s.isDirectory()) walk(f); else if (e.endsWith(".java")) files.push({ path: f.replace(dir + "/", ""), content: readFileSync(f, "utf-8") }); } catch {} } }
walk(dir);
const engine = new CompleoEngine();
engine.analyze(files).then(r => {
  engine.generate(r.ir, undefined, undefined, r.multiTech?.generatedFiles || []).then(gen => {
    const virement = gen.files.find(f => f.path.includes("VirementService"));
    if (virement) {
      const lines = virement.content.split("\n");
      // Show lines 68-78
      for (let i = 67; i < Math.min(78, lines.length); i++) {
        console.log(`${i+1}: ${lines[i]}`);
      }
    }
  });
});
