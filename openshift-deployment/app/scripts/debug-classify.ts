import * as fs from 'fs';
import * as path from 'path';

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

// Find VrtPerm.java specifically
const vrtPerm = files.find(f => path.basename(f.path) === 'VrtPerm.java');
if (!vrtPerm) {
  console.log('VrtPerm.java not found!');
  process.exit(1);
}

const content = vrtPerm.content;
const className = 'VrtPerm';

// Replicate isDirectEjb exactly
console.log('=== isDirectEjb step by step ===');
const step1 = /@ApplicationScoped/.test(content) || /@RequestScoped/.test(content);
console.log('1. isAppScoped:', step1, '→', step1 ? 'RETURN FALSE' : 'continue');

const step2a = /@Stateless/.test(content);
const step2b = /@Stateful/.test(content);
console.log('2. hasStateless:', step2a, 'hasStateful:', step2b, '→', (!step2a && !step2b) ? 'RETURN FALSE' : 'continue');

const step3 = /implements\s+BaseUseCase/.test(content);
console.log('3. hasBaseUseCase:', step3, '→', step3 ? 'RETURN FALSE' : 'continue');

const step4 = /public\s+class/.test(content);
console.log('4. hasPublicClass:', step4, '→', !step4 ? 'RETURN FALSE' : 'continue');

// isDao check
const isDaoName = /DAO$|Dao$|Repository$|Persistence$/.test(className);
console.log('5. isDaoName:', isDaoName);

if (/@Stateless/.test(content)) {
  const hasDataAccess = /EntityManager|getConnection|PreparedStatement|DataSource|@PersistenceContext/.test(content);
  const hasExecute = /public\s+\w+\s+execute\s*\(/.test(content);
  console.log('   hasDataAccess:', hasDataAccess, 'hasExecute:', hasExecute);
  if (hasDataAccess && !hasExecute) {
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
    console.log('   businessMethods:', methods.length, '→', methods.length === 0 ? 'IS DAO' : 'NOT DAO');
  }
}

// shouldSkipClass check
const dtoSuffixes = ['VoIn','VoOut','DTO','Dto','Request','Response','Item','Context','Data','Builder','Event','Config','Info','Detail','Summary','Result','Match'];
const hasDtoSuffix = dtoSuffixes.some(s => className.endsWith(s));
const isListener = className.endsWith('Listener') || className.endsWith('Callback');
const isHandler = className.endsWith('Handler');
const isEnum = /public\s+enum\s+/.test(content);
console.log('6. shouldSkipClass:', { hasDtoSuffix, isListener, isHandler, isEnum });

// isDtoClass check
const hasLombokData = /@Data/.test(content);
const hasLombokBuilder = /@Builder/.test(content);
const hasEJB = /@Stateless|@Singleton|@Stateful|@ApplicationScoped|@MessageDriven/.test(content);
console.log('7. isDtoClass:', { hasLombokData, hasLombokBuilder, hasEJB });

// Check if isService catches it first
const isUC = /@UseCase/.test(content) && /implements\s+BaseUseCase/.test(content);
const isEnumCheck = /public\s+enum\s+/.test(content);
const isExc = /Exception$/.test(className);
console.log('8. isService pre-checks:', { isUC, isEnumCheck, isExc });

// Check @Service or @Component
const hasServiceAnnotation = /@Service/.test(content);
const hasComponent = /@Component/.test(content);
console.log('   @Service:', hasServiceAnnotation, '@Component:', hasComponent);

// Check Service suffix
const hasServiceSuffix = /Service$|ServiceImpl$|Helper$|Util$|Utils$|Manager$|Facade$|Adapter$|Provider$|Factory$|Processor$/.test(className);
console.log('   hasServiceSuffix:', hasServiceSuffix);

console.log('\n=== CONCLUSION ===');
console.log('isDirectEjb should return: true');
console.log('But parseEjbProject returns 0 UC');
console.log('Something in the pipeline is filtering VrtPerm out');

// Now run the actual parser with debug
console.log('\n=== Running actual parseEjbProject ===');
const { parseEjbProject } = await import('../server/java-parser.ts');
const pomFile = files.find(f => f.path.endsWith('pom.xml'));
const ir = parseEjbProject(files, pomFile?.content);
console.log('UseCases:', ir.useCases.length);
console.log('Services:', ir.services.length);
console.log('DTOs:', ir.dtos.length);

// Check if VrtPerm is classified as a service instead
if (ir.services.length > 0) {
  console.log('Services found:', ir.services.map(s => s.className));
}
