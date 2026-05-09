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
  
  // Show problematic files
  const targets = ['BillingService', 'BillingController', 'DatabaseService', 'DatabaseController'];
  for (const target of targets) {
    const file = generated.find(f => f.path.includes(target));
    if (file) {
      const lines = file.content.split('\n');
      console.log(`=== ${target} (${lines.length} lines) ===`);
      // Show lines around errors
      const errorLines = [31, 33, 43, 46, 55, 59, 67, 74, 77, 79, 109, 125];
      for (const ln of errorLines) {
        if (ln <= lines.length && lines[ln-1]) {
          console.log(`  L${ln}: ${lines[ln-1]}`);
        }
      }
      console.log();
    }
  }
}
main().catch(console.error);
