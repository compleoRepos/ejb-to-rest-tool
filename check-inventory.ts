import { parseEjbProject } from './server/java-parser';
import { generateSpringBootProject } from './server/spring-generator';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = '/tmp/test-projects/proj-06-inventory';
const files = readdirSync(dir)
  .filter(f => f.endsWith('.java') || f === 'pom.xml')
  .map(f => ({ path: f, content: readFileSync(join(dir, f), 'utf-8') }));
const pomXml = files.find(f => f.path === 'pom.xml')?.content;
const ir = parseEjbProject(files, pomXml);
const result = generateSpringBootProject(ir);

// Check if OrdersProduct entity exists
const op = result.files.find(f => f.path.includes('OrdersProduct') && f.path.indexOf('DAO') === -1);
console.log('OrdersProduct entity:', op ? op.path : 'MISSING');

// Check all entities
const entities = result.files.filter(f => f.path.includes('/entity/'));
console.log('Entities:', entities.map(f => f.path.split('/').pop()));

// Check all model files
const models = result.files.filter(f => f.path.includes('/model/'));
console.log('Models:', models.map(f => f.path.split('/').pop()));

// Find types used in OrdersProductDAO that are missing
const daoFile = result.files.find(f => f.path.includes('OrdersProductDAO'));
if (daoFile) {
  const types = new Set<string>();
  const typeRegex = /(?:public|private)\s+(?:List<)?(\w+)>?\s+\w+/g;
  let m;
  while ((m = typeRegex.exec(daoFile.content)) !== null) {
    types.add(m[1]);
  }
  console.log('Types used in OrdersProductDAO:', [...types]);
}
