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
    const entities = gen.files.filter(f => f.path.includes("/entity/"));
    console.log("Entity files:");
    for (const e of entities) console.log("  " + e.path);
    // Also check if autofix would handle missing entities
    console.log("\nAll file categories:");
    const cats = new Map<string, number>();
    for (const f of gen.files) {
      cats.set(f.category, (cats.get(f.category) || 0) + 1);
    }
    for (const [k, v] of cats) console.log("  " + k + ": " + v);
  });
});
