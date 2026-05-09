import { CompleoEngine, SourceFile } from './server/engine/CompleoEngine';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const projectDir = '/tmp/test-projects/proj-05-ngbilling';
const files: SourceFile[] = readdirSync(projectDir)
  .filter(f => f.endsWith('.java'))
  .map(f => ({ path: f, content: readFileSync(join(projectDir, f), 'utf-8') }));

async function main() {
  const engine = new CompleoEngine();
  const analysisResult = await engine.analyze(files);
  const genResult = await engine.generate(analysisResult.ir, undefined, undefined, analysisResult.multiTech?.generatedFiles || []);
  const generated = genResult.files || [];
  
  // Find DebugValidator
  const dv = generated.find(f => f.path.includes('DebugValidator'));
  if (dv) {
    console.log('=== DebugValidator.java ===');
    console.log(dv.content);
  }
  
  // Check all files
  console.log('\nAll generated files:');
  generated.forEach(f => console.log('  ' + f.path));
}
main().catch(console.error);
