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
  
  // Show BillingService lines 25-65
  const bs = generated.find(f => f.path.includes('BillingService'));
  if (bs) {
    console.log('=== BillingService.java ===');
    const lines = bs.content.split('\n');
    for (let i = 25; i < 65 && i < lines.length; i++) {
      console.log(`${(i+1).toString().padStart(4)}: ${lines[i]}`);
    }
    console.log();
  }
  
  // Show DatabaseService lines 25-85
  const ds = generated.find(f => f.path.includes('DatabaseService'));
  if (ds) {
    console.log('=== DatabaseService.java ===');
    const lines = ds.content.split('\n');
    for (let i = 25; i < 85 && i < lines.length; i++) {
      console.log(`${(i+1).toString().padStart(4)}: ${lines[i]}`);
    }
    console.log();
  }
  
  // Show all generated file paths
  console.log('=== All files ===');
  generated.forEach(f => console.log(`  ${f.path}`));
}
main().catch(console.error);
