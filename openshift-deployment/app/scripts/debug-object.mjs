import { parseEjbProject } from '../server/java-parser.ts';
import { generateSpringBootProject } from '../server/spring-generator.ts';
import fs from 'fs';
import path from 'path';

const dir = '/home/ubuntu/test-projects/activation-carte-bmcedirect-ejb';
const dir2 = '/home/ubuntu/test-projects/projet-02-virement';
const fileObjs = [];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const fp = path.join(d, f);
    if (fs.statSync(fp).isDirectory()) walk(fp);
    else if (fp.endsWith('.java')) fileObjs.push({ path: fp, content: fs.readFileSync(fp, 'utf-8') });
  }
}
walk(dir);

// Check for pom.xml
const pomPath = path.join(dir, 'pom.xml');
const pomXml = fs.existsSync(pomPath) ? fs.readFileSync(pomPath, 'utf-8') : undefined;

const ir = parseEjbProject(fileObjs, pomXml);
const result = generateSpringBootProject(ir);

console.log('=== Object occurrences ===');
for (const f of result.files) {
  if (typeof f.path !== 'string' || !f.path.endsWith('.java')) continue;
  const matches = f.content.match(/\bObject\b/g);
  if (matches && matches.length > 0) {
    console.log(f.path, ':', matches.length, 'occurrences');
    const lines = f.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/\bObject\b/.test(lines[i])) {
        console.log('  L' + (i+1) + ':', lines[i].trim());
      }
    }
  }
}

console.log('\n=== LocalDate check ===');
const allDtoFields = ir.dtos.flatMap(d => d.fields);
for (const fieldName of ['dateExecution', 'dateNaissance']) {
  const field = allDtoFields.find(f => f.name === fieldName);
  if (field) {
    console.log(`${fieldName}: type = ${field.type}`);
  } else {
    console.log(`${fieldName}: NOT FOUND`);
  }
}
