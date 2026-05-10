import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";
const dir = "/tmp/test-projects/proj-04-bookstore";
const files: SourceFile[] = [];
function walk(d: string) { for (const e of readdirSync(d)) { const f = join(d, e); try { const s = statSync(f); if (s.isDirectory()) walk(f); else if (e.endsWith(".java")) files.push({ path: f.replace(dir + "/", ""), content: readFileSync(f, "utf-8") }); } catch {} } }
walk(dir);
const engine = new CompleoEngine();
engine.analyze(files).then(r => {
  engine.generate(r.ir, undefined, undefined, r.multiTech?.generatedFiles || []).then(gen => {
    const jmsFiles = gen.files.filter(f => f.path.includes("JMS") || f.content.includes("jms"));
    for (const f of jmsFiles) {
      console.log(`=== ${f.path} ===`);
      console.log(f.content.split("\n").slice(0, 10).join("\n"));
    }
    // Also check GeneralService for JMS
    const generalService = gen.files.find(f => f.path.includes("GeneralService"));
    if (generalService) {
      console.log(`\n=== ${generalService.path} ===`);
      console.log(generalService.content.split("\n").slice(0, 10).join("\n"));
    }
  });
});
