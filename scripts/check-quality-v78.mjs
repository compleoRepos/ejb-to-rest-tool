// Check quality score after v7.8 changes
import { join } from 'path';
import AdmZip from 'adm-zip';

const ZIP_PATH = join(process.cwd(), 'tests/fixtures/input/bmce-core-banking-complex.zip');
const { parseEjbProject } = await import('../server/java-parser.ts');
const { generateSpringBootProject } = await import('../server/spring-generator.ts');

const zip = new AdmZip(ZIP_PATH);
const entries = zip.getEntries();
const sourceFiles = entries
  .filter(e => e.entryName.endsWith('.java') || e.entryName.endsWith('.xml') || e.entryName.endsWith('.properties'))
  .map(e => ({ path: e.entryName, content: e.getData().toString('utf-8') }));

const parsed = parseEjbProject(sourceFiles);
const generated = generateSpringBootProject(parsed);

const qFile = generated.files.find(f => f.path.includes('QUALITY_SCORE'));
if (qFile) {
  console.log(qFile.content);
} else {
  console.log('QUALITY_SCORE.md not found in generated files');
}

// Also test calculateQualityScore with a map
const { calculateQualityScore } = await import('../server/engine/quality-scorer.ts');
const fileMap = new Map();
for (const f of generated.files) {
  fileMap.set(f.path, f.content);
}
const report = calculateQualityScore(fileMap);
console.log('\n=== calculateQualityScore ===');
console.log(`Score: ${report.score}/100 (${report.grade})`);
console.log(`Total: ${report.totalScore}/${report.maxScore}`);
for (const c of report.checks) {
  const icon = c.passed ? '✅' : '❌';
  console.log(`  ${icon} ${c.id}: ${c.points}/${c.maxPoints} — ${c.detail}`);
}
