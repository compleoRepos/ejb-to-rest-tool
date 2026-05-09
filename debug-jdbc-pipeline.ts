import { parseEjbProject } from './server/java-parser';
import { generateSpringBootProject } from './server/spring-generator';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = '/tmp/test-projects/proj-10-jdbc-monolith';
const files = readdirSync(dir)
  .filter(f => f.endsWith('.java') || f === 'pom.xml')
  .map(f => ({ path: f, content: readFileSync(join(dir, f), 'utf-8') }));

const pomXml = files.find(f => f.path === 'pom.xml')?.content;
const ir = parseEjbProject(files, pomXml);
console.log('UseCases:', ir.useCases.length);
console.log('Services:', ir.services.length);
console.log('DTOs:', ir.dtos.length);
console.log('Enums:', ir.enums.length);

// Show UC details
for (const uc of ir.useCases) {
  console.log(`  UC: ${uc.className} voIn=${uc.voInType} voOut=${uc.voOutType} domain=${uc.domain}`);
}

// Generate
const result = generateSpringBootProject(ir);
console.log('\n--- Generated files ---');
console.log('Total:', result.files.length);

// Find BillingService and DatabaseService
const billing = result.files.find(f => f.path.includes('BillingService'));
const database = result.files.find(f => f.path.includes('DatabaseService'));

if (billing) {
  console.log('\n--- BillingService.java (first 50 lines) ---');
  console.log(billing.content.split('\n').slice(0, 50).join('\n'));
}

if (database) {
  console.log('\n--- DatabaseService.java (first 50 lines) ---');
  console.log(database.content.split('\n').slice(0, 50).join('\n'));
}

// Show entity files
const entities = result.files.filter(f => f.path.includes('/entity/'));
console.log('\n--- Entity files ---');
for (const e of entities) {
  console.log(e.path);
}

// Show warnings
console.log('\n--- Warnings ---');
for (const w of result.warnings) {
  console.log(w);
}
