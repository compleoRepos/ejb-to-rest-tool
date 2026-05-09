import { CompleoEngine, SourceFile } from './server/engine/CompleoEngine';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const projectDir = '/tmp/test-projects/proj-04-bookstore';
function readJavaFiles(dir: string): SourceFile[] {
  const files: SourceFile[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry.endsWith('.java')) {
      files.push({ path: entry, content: readFileSync(full, 'utf-8') });
    }
  }
  return files;
}

async function main() {
  const javaFiles = readJavaFiles(projectDir);
  const engine = new CompleoEngine();
  const analysisResult = await engine.analyze(javaFiles);
  const genResult = await engine.generate(analysisResult.ir, undefined, undefined, analysisResult.multiTech?.generatedFiles || []);
  const generated = genResult.files || [];
  
  const adminService = generated.find(f => f.path.includes('AdminService'));
  if (adminService) {
    const lines = adminService.content.split('\n');
    // Find logger.log lines
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('logger')) {
        console.log(`Line ${i+1}: ${lines[i]}`);
        // Show context
        if (i > 0) console.log(`  prev: ${lines[i-1]}`);
        if (i < lines.length - 1) console.log(`  next: ${lines[i+1]}`);
        console.log();
      }
    }
  }
}
main().catch(console.error);
