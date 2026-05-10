import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";

const dir = "/tmp/test-projects/proj-04-bookstore";
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

const engine = new CompleoEngine();
engine.analyze(files).then(r => {
  engine.generate(r.ir, undefined, undefined, r.multiTech?.generatedFiles || []).then(gen => {
    const controllers = gen.files.filter(f => f.category === "controller");
    for (const c of controllers) {
      if (c.path.includes("General")) {
        console.log("=== " + c.path + " ===");
        const lines = c.content.split("\n");
        for (let i = 0; i < Math.min(50, lines.length); i++) {
          console.log(`${i+1}: ${lines[i]}`);
        }
      }
    }
  });
});
