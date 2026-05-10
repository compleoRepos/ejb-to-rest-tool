import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";

const projDir = "/tmp/test-projects/proj-11-nexabank-core";

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
  const javaFiles = readJavaFiles(projDir);
  const engine = new CompleoEngine();
  const analysisResult = await engine.analyze(javaFiles);
  const genResult = await engine.generate(analysisResult.ir, undefined, undefined, analysisResult.multiTech?.generatedFiles || []);
  const generatedFiles = genResult.files || [];
  
  // Check SwiftController and SwiftService for PaymentRequest references
  for (const f of generatedFiles) {
    if (f.path.includes('Swift') || f.path.includes('Prelevement') || f.path.includes('Virement')) {
      if (f.content.includes('PaymentRequest')) {
        const lines = f.content.split('\n');
        console.log(`\n=== ${f.path.split('/').pop()} ===`);
        for (let i = 0; i < Math.min(lines.length, 15); i++) {
          console.log(`${i+1}: ${lines[i]}`);
        }
      }
    }
  }
  
  // Check for CarteBancaireController with the serviceVar fix
  const cbCtrl = generatedFiles.find(f => f.path.includes('CarteBancaire'));
  if (cbCtrl) {
    const lines = cbCtrl.content.split('\n');
    console.log(`\n=== ${cbCtrl.path.split('/').pop()} (first 35 lines) ===`);
    for (let i = 0; i < Math.min(lines.length, 35); i++) {
      console.log(`${i+1}: ${lines[i]}`);
    }
  }
}

main().catch(e => console.error(e));
