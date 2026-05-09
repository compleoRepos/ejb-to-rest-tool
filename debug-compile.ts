/**
 * Debug script: regenerate a single project and show the problematic files
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { CompleoEngine, SourceFile } from './server/engine/CompleoEngine';

const projectName = process.argv[2] || 'proj-02-broadleaf';
const projectDir = `/tmp/test-projects/${projectName}`;
const targetFile = process.argv[3];

function readJavaFiles(dir: string): SourceFile[] {
  const files: SourceFile[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (entry.endsWith('.java')) {
          files.push({ path: full.replace(dir + '/', ''), content: readFileSync(full, 'utf-8') });
        }
      } catch {}
    }
  }
  walk(dir);
  return files;
}

async function main() {
  console.log(`\n=== Debugging ${projectName} ===\n`);

  const javaFiles = readJavaFiles(projectDir);
  console.log(`Source files: ${javaFiles.length}`);

  const engine = new CompleoEngine();
  const analysisResult = await engine.analyze(javaFiles);
  
  const genResult = await engine.generate(
    analysisResult.ir,
    undefined,
    undefined,
    analysisResult.multiTech?.generatedFiles || []
  );

  const generated = genResult.files || [];
  console.log(`Generated files: ${generated.length}`);

  if (targetFile) {
    const file = generated.find(f => f.path.includes(targetFile));
    if (file) {
      const lines = file.content.split('\n');
      console.log(`\n=== ${file.path} (${lines.length} lines) ===`);
      const targetLine = parseInt(process.argv[4] || '34');
      const startLine = Math.max(0, targetLine - 5);
      const endLine = Math.min(lines.length, targetLine + 10);
      for (let i = startLine; i < endLine; i++) {
        const marker = (i + 1 === targetLine) ? '>>>' : '   ';
        console.log(`${marker}${(i + 1).toString().padStart(4)}: ${lines[i]}`);
      }
    } else {
      console.log(`File not found: ${targetFile}`);
      console.log('Available files:');
      generated.forEach(f => console.log(`  ${f.path}`));
    }
  } else {
    // List all generated files
    generated.forEach(f => console.log(`  ${f.path}`));
  }
}

main().catch(console.error);
