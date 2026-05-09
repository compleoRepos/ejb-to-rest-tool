import { CompleoEngine, SourceFile } from './server/engine/CompleoEngine';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const projectDir = '/tmp/test-projects/proj-10-jdbc-monolith';
const files: SourceFile[] = readdirSync(projectDir)
  .filter(f => f.endsWith('.java'))
  .map(f => ({ path: f, content: readFileSync(join(projectDir, f), 'utf-8') }));

async function main() {
  const engine = new CompleoEngine();
  const analysisResult = await engine.analyze(files);
  const genResult = await engine.generate(analysisResult.ir, undefined, undefined, analysisResult.multiTech?.generatedFiles || []);
  const generated = genResult.files || [];
  
  // Show first 25 lines of BillingService and DatabaseService
  for (const target of ['BillingService.java', 'DatabaseService.java', 'BillingController.java', 'DatabaseController.java']) {
    const file = generated.find(f => f.path.endsWith(target));
    if (file) {
      console.log(`=== ${target} (first 25 lines) ===`);
      const lines = file.content.split('\n');
      for (let i = 0; i < 25 && i < lines.length; i++) {
        console.log(`${(i+1).toString().padStart(4)}: ${lines[i]}`);
      }
      console.log();
    }
  }
}
main().catch(console.error);
