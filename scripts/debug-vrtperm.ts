import * as fs from 'fs';
import * as path from 'path';
import { parseEjbProject } from '../server/java-parser.ts';

const projectDir = '/home/ubuntu/pipeline-test/projects3/virement-permanent-bmcedirect';
const files: {path: string; content: string}[] = [];

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.java') || entry.name === 'pom.xml') {
      files.push({ path: full, content: fs.readFileSync(full, 'utf8') });
    }
  }
}
walk(projectDir);

// Find VrtPerm
const vrtPerm = files.find(f => f.path.includes('VrtPerm.java'));
if (!vrtPerm) {
  console.log('VrtPerm.java not found!');
  process.exit(1);
}

const content = vrtPerm.content;
const className = 'VrtPerm';

// Test isDao logic step by step
console.log('=== isDao debug ===');
const isDaoName = /DAO$|Dao$|Repository$|Persistence$/.test(className);
console.log('isDaoName:', isDaoName);

const hasStateless = /@Stateless/.test(content);
console.log('hasStateless:', hasStateless);

const hasDataAccess = /EntityManager|getConnection|PreparedStatement|DataSource|@PersistenceContext/.test(content);
console.log('hasDataAccess:', hasDataAccess);

const hasExecute = /public\s+\w+\s+execute\s*\(/.test(content);
console.log('hasExecute:', hasExecute);

// The isDao logic for @Stateless:
// if (hasDataAccess && !hasExecute) → check businessMethods.length
// if businessMethods.length === 0 → return true (is DAO)
// else → return false (not DAO, has business methods)
console.log('isDao @Stateless path:', hasStateless && hasDataAccess && !hasExecute ? 'ENTERS check' : 'SKIPS');

// Count business methods
const LIFECYCLE = new Set(['ejbCreate','ejbRemove','ejbActivate','ejbPassivate','setSessionContext','setEntityContext','unsetEntityContext','toString','hashCode','equals','clone','finalize','init','destroy','afterPropertiesSet']);
const methodRegex = /(?:\/\*\*([\s\S]*?)\*\/\s*)?public\s+((?:[\w<>,\s\[\]]+?)\s+(\w+))\s*\(([^)]*)\)\s*(?:throws\s+([\w,\s]+))?\s*\{/g;
let m;
const methods: string[] = [];
while ((m = methodRegex.exec(content)) !== null) {
  const name = m[3];
  if (name === className) continue;
  if (LIFECYCLE.has(name)) continue;
  methods.push(name);
}
console.log('Business methods count:', methods.length);
console.log('Business methods:', methods.slice(0, 10));
console.log('isDao result: false (has', methods.length, 'business methods)');

console.log('\n=== isDirectEjb debug ===');
const isAppScoped = /@ApplicationScoped/.test(content) || /@RequestScoped/.test(content);
console.log('isAppScoped:', isAppScoped);
const hasBaseUC = /implements\s+BaseUseCase/.test(content);
console.log('hasBaseUC:', hasBaseUC);
const hasPublicClass = /public\s+class/.test(content);
console.log('hasPublicClass:', hasPublicClass);

// shouldSkipClass
const dtoSuffixes = ['VoIn','VoOut','DTO','Dto','Request','Response','Item','Context','Data','Builder','Event','Config','Info','Detail','Summary','Result','Match'];
const hasDtoSuffix = dtoSuffixes.some(s => className.endsWith(s));
console.log('shouldSkipClass (hasDtoSuffix):', hasDtoSuffix);

// isDtoClass
const hasLombokData = /@Data/.test(content);
console.log('isDtoClass (hasLombokData):', hasLombokData);

console.log('\n=== Full parse result ===');
const pomFile = files.find(f => f.path.endsWith('pom.xml'));
const ir = parseEjbProject(files, pomFile?.content);
console.log('UseCases:', ir.useCases.length);
console.log('DTOs:', ir.dtos.length);
console.log('Services:', ir.services.length);
console.log('EJB2x:', ir.ejb2xBeans.length);
console.log('BatchJobs:', ir.batchJobs.length);
console.log('Warnings:', ir.warnings);

// Check which files are classified as what
const javaFiles = files.filter(f => f.path.endsWith('.java'));
console.log('\nTotal Java files:', javaFiles.length);
console.log('Files with @Stateless:', javaFiles.filter(f => /@Stateless/.test(f.content)).map(f => path.basename(f.path)));
console.log('Files with @WebService:', javaFiles.filter(f => /@WebService/.test(f.content)).map(f => path.basename(f.path)));
