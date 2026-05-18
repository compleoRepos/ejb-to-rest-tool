import { parseEjbProject } from './server/java-parser';
import { generateSpringBootProject } from './server/spring-generator';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = '/tmp/test-projects/proj-04-bookstore';
const files = readdirSync(dir)
  .filter(f => f.endsWith('.java') || f === 'pom.xml')
  .map(f => ({ path: f, content: readFileSync(join(dir, f), 'utf-8') }));
const pomXml = files.find(f => f.path === 'pom.xml')?.content;
const ir = parseEjbProject(files, pomXml);
const result = generateSpringBootProject(ir);

// Check AdminService imports
const admin = result.files.find(f => f.path.includes('AdminService'));
if (admin) {
  const lines = admin.content.split('\n');
  const imports = lines.filter(l => l.includes('.entity.') || l.includes('.dto.'));
  console.log('AdminService imports:');
  for (const l of imports) console.log('  ' + l);
}

// Check AdminController imports
const ac = result.files.find(f => f.path.includes('AdminController'));
if (ac) {
  const lines = ac.content.split('\n');
  const imports = lines.filter(l => l.includes('.entity.') || l.includes('.dto.'));
  console.log('\nAdminController imports:');
  for (const l of imports) console.log('  ' + l);
}

// Check entity files
const entities = result.files.filter(f => f.path.includes('/entity/'));
console.log('\nEntity files:');
for (const e of entities) {
  console.log('  ' + e.path);
}
