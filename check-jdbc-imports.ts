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
const result = generateSpringBootProject(ir);

// Check service imports
const services = result.files.filter(f => f.path.includes('Service') && f.path.endsWith('.java') && !f.path.includes('Test'));
for (const svc of services) {
  const lines = svc.content.split('\n');
  const imports = lines.filter(l => l.includes('.entity.') || l.includes('.dto.'));
  if (imports.length > 0) {
    console.log('Imports in ' + svc.path + ':');
    for (const l of imports) console.log('  ' + l);
  }
}

// Check entity files
const entities = result.files.filter(f => f.path.includes('/entity/'));
console.log('\nEntity files:');
for (const e of entities) {
  console.log('  ' + e.path);
}
