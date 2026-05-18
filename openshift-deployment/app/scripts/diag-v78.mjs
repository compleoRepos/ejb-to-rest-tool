// Diagnostic v7.8 — Confirmer les 8 bugs dans le ZIP généré
import { join } from 'path';
import AdmZip from 'adm-zip';

const ZIP_PATH = join(process.cwd(), 'tests/fixtures/input/bmce-core-banking-complex.zip');

const { parseEjbProject } = await import('../server/java-parser.ts');
const { generateSpringBootProject } = await import('../server/spring-generator.ts');
const { MicroserviceSplitter } = await import('../server/engine/microservices/microservice-splitter.ts');

// Load source files
const zip = new AdmZip(ZIP_PATH);
const entries = zip.getEntries();
const sourceFiles = entries
  .filter(e => !e.isDirectory && (e.entryName.endsWith('.java') || e.entryName.endsWith('.xml') || e.entryName.endsWith('.properties')))
  .map(e => ({ path: e.entryName, content: e.getData().toString('utf-8') }));

console.log(`\n=== DIAGNOSTIC v7.8 — ${sourceFiles.length} fichiers source ===\n`);

// Parse
const parsed = parseEjbProject(sourceFiles);
console.log(`UseCases: ${parsed.useCases.length}`);

// Generate monolith — files is GeneratedFile[] not Map
const generated = generateSpringBootProject(parsed);

// BUG 1: Doublons EJB
console.log('\n=== BUG 1: Doublons EJB ===');
const allFiles = generated.files;
const serviceFiles = allFiles.filter(f => f.path.includes('Service.java'));
const ejbServiceFiles = serviceFiles.filter(f => /EJBService\.java$/.test(f.path));
const dtoServiceFiles = serviceFiles.filter(f => /VoIn.*Service|Transformer.*Service/i.test(f.path));
console.log('Services totaux:', serviceFiles.map(f => f.path.split('/').pop()));
console.log('EJB Service doublons:', ejbServiceFiles.map(f => f.path.split('/').pop()));
console.log('DTO/CDI Service faux:', dtoServiceFiles.map(f => f.path.split('/').pop()));

// BUG 2: Void sql
console.log('\n=== BUG 2: Void sql ===');
for (const f of allFiles) {
  if (!f.path.endsWith('Service.java')) continue;
  const voidVars = f.content.match(/\bVoid\s+\w+\s*=/g);
  if (voidVars) {
    console.log(`  ${f.path.split('/').pop()}: ${voidVars.join(', ')}`);
  }
}
let voidCount = 0;
for (const f of allFiles) {
  if (!f.path.endsWith('.java')) continue;
  voidCount += (f.content.match(/\bVoid\s+\w+\s*=/g) ?? []).length;
}
console.log(`Total Void variables: ${voidCount}`);

// BUG 7: Adapters Object... args
console.log('\n=== BUG 7: Adapters Object... args ===');
for (const f of allFiles) {
  if (!f.path.includes('Adapter.java')) continue;
  const methods = f.content.match(/public\s+\w+\s+\w+\s*\([^)]*\)/g) ?? [];
  const objectMethods = methods.filter(m => m.includes('Object'));
  if (objectMethods.length > 0) {
    console.log(`  ${f.path.split('/').pop()}:`, objectMethods);
  }
}

// Generate microservices
console.log('\n=== BUG 3/5: Microservices ===');
const splitter = new MicroserviceSplitter();
// split() accepts ProjectIR directly
const services = splitter.split(parsed);
console.log(`  ${services.length} services trouvés`);
for (const svc of services) {
  console.log(`  ${svc.name}: ejbs=[${svc.ejbs.join(', ')}]`);
  console.log(`    Tables: owned=[${(svc.ownedTables ?? []).join(', ')}] readOnly=[${(svc.readOnlyTables ?? []).join(', ')}]`);
  console.log(`    APIs: ${svc.restApis.length} endpoints, Kafka: ${svc.kafkaTopics.length} topics`);
  console.log(`    Confidence: ${svc.confidence}%`);
}

// BUG 8: Quality Score
console.log('\n=== BUG 8: Quality Score ===');
const qualityFile = allFiles.find(f => f.path.includes('QUALITY_SCORE'));
if (qualityFile) {
  const scoreMatch = qualityFile.content.match(/(\d+)\/100/);
  console.log(`Score actuel: ${scoreMatch?.[1] ?? 'N/A'}/100`);
} else {
  console.log('QUALITY_SCORE.md non trouvé');
}

console.log('\n=== FIN DIAGNOSTIC ===');
