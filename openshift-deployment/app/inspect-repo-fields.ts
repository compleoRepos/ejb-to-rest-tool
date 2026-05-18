import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";

const dir = "/tmp/test-projects/proj-11-nexabank-core";
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
    const services = gen.files.filter(f => f.category === "service" && /\brepository\./.test(f.content));
    for (const s of services) {
      const lines = s.content.split("\n");
      console.log("=== " + s.path.split("/").pop() + " ===");
      for (const l of lines) {
        if (l.includes("private final") && l.includes("epository")) {
          console.log("  FIELD: " + l.trim());
        }
      }
    }
  });
});
