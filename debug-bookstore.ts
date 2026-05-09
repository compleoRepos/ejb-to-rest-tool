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

const as = result.files.find(f => f.path.includes('AdminService'));
if (as) {
  const lines = as.content.split('\n');
  // Show lines 25-80
  for (let i = 25; i < 85; i++) {
    if (i < lines.length) {
      console.log((i+1) + ': ' + lines[i]);
    }
  }
}
