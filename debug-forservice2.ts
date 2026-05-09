import { parseEjbProject } from './server/java-parser';
import { generateSpringBootProject } from './server/spring-generator';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = '/tmp/test-projects/proj-02-broadleaf';
const files = readdirSync(dir)
  .filter(f => f.endsWith('.java') || f === 'pom.xml')
  .map(f => ({ path: f, content: readFileSync(join(dir, f), 'utf-8') }));
const pomXml = files.find(f => f.path === 'pom.xml')?.content;
const ir = parseEjbProject(files, pomXml);
const result = generateSpringBootProject(ir);

const fs = result.files.find(f => f.path.includes('ForService'));
if (fs) {
  const lines = fs.content.split('\n');
  // Show lines 35-42 to see if return is added
  for (let i = 35; i < 50; i++) {
    console.log((i+1) + ': ' + lines[i]);
  }
}
