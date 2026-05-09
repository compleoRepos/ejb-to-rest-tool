import { parseEjbProject } from './server/java-parser';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = '/tmp/test-projects/proj-04-bookstore';
const files = readdirSync(dir)
  .filter(f => f.endsWith('.java') || f === 'pom.xml')
  .map(f => ({ path: f, content: readFileSync(join(dir, f), 'utf-8') }));
const pomXml = files.find(f => f.path === 'pom.xml')?.content;
const ir = parseEjbProject(files, pomXml);

// Show all useCases and their className
console.log('Total useCases:', ir.useCases.length);
for (const uc of ir.useCases) {
  console.log(`  ${uc.className} — domain: ${uc.domain}, voIn: ${uc.voInType}, voOut: ${uc.voOutType}`);
}
