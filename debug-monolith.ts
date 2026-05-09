import { parseEjbProject } from './server/java-parser';
import { generateSpringBootProject } from './server/spring-generator';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = '/tmp/test-projects/proj-03-monolith';
const files = readdirSync(dir)
  .filter(f => f.endsWith('.java') || f === 'pom.xml')
  .map(f => ({ path: f, content: readFileSync(join(dir, f), 'utf-8') }));
const pomXml = files.find(f => f.path === 'pom.xml')?.content;
const ir = parseEjbProject(files, pomXml);
const result = generateSpringBootProject(ir);

// Show problematic files
const targets = ['ClientController', 'ClientService', 'GlobalExceptionHandler', 'HealthStatus', 'Employee'];
for (const t of targets) {
  const f = result.files.find(f => f.path.includes(t));
  if (f) {
    const lines = f.content.split('\n');
    console.log(`\n=== ${t} (lines 15-50) ===`);
    for (let i = 14; i < Math.min(55, lines.length); i++) {
      console.log(`${i+1}: ${lines[i]}`);
    }
  }
}
