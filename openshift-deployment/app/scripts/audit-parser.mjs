/**
 * Audit Script — Runs parse → generate on the 3 BOA test projects
 * and produces a diagnostic report.
 * 
 * Usage: node scripts/audit-parser.mjs
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join, relative, basename, extname } from 'path';

// We need to import the parser and generator dynamically since they're TypeScript
// Instead, we'll use tsx to run this, or replicate the logic

const TEST_PROJECTS_DIR = '/home/ubuntu/test-projects';
const OUTPUT_FILE = '/home/ubuntu/ejb-client-modernizer/docs/engine/parsing-audit.json';

// Collect all Java files from a directory recursively
function collectJavaFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJavaFiles(fullPath));
    } else if (entry.name.endsWith('.java')) {
      results.push({
        path: relative(dir, fullPath),
        fullPath,
        content: readFileSync(fullPath, 'utf8'),
        className: entry.name.replace('.java', ''),
      });
    }
  }
  return results;
}

// Collect pom.xml
function findPomXml(dir) {
  const pomPath = join(dir, 'pom.xml');
  if (existsSync(pomPath)) return readFileSync(pomPath, 'utf8');
  // Try nested
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = findPomXml(join(dir, entry.name));
      if (nested) return nested;
    }
  }
  return null;
}

// Classify Java files manually (same logic as parser)
function classifyFile(content, className) {
  const types = [];
  
  if (/@UseCase/.test(content) && /implements\s+BaseUseCase/.test(content)) types.push('UseCase');
  if (/public\s+enum\s+\w+/.test(content)) types.push('Enum');
  if (/Exception\b/.test(className) && /extends\s+\w*(Exception|Throwable)/.test(content)) types.push('Exception');
  if (/Validator\b/.test(className) || (/@interface/.test(content) && /Valid/.test(className))) types.push('Validator');
  if (/@Remote/.test(content) && /interface\s+\w+/.test(content)) types.push('RemoteInterface');
  if (className === 'BaseUseCase' || className === 'ValueObject' || (/@interface/.test(content) && className === 'UseCase')) types.push('BaseClass');
  
  // DTO detection
  if ((/implements\s+(ValueObject|Serializable)/.test(content) && /Vo(In|Out)|Dto/.test(className)) ||
      (/@Xml(RootElement|AccessorType)/.test(content) && /(private|protected)\s+\w+\s+\w+;/.test(content))) {
    types.push('DTO');
  }
  
  // Service detection (excluding other types)
  if (types.length === 0 && /Service\b/.test(className) && !/@Remote/.test(content) && !/@interface/.test(content)) {
    types.push('Service');
  }
  
  // @Stateless detection (standard EJB, not UseCase pattern)
  if (/@Stateless/.test(content) && !types.includes('UseCase')) {
    types.push('StatelessEJB');
  }
  
  if (types.length === 0) types.push('Unclassified');
  
  return types;
}

// Extract fields from a DTO
function extractDtoFields(content) {
  const fields = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const fieldMatch = trimmed.match(/(?:private|protected|public)\s+([\w<>,\s\[\]]+?)\s+(\w+)\s*;/);
    if (fieldMatch && fieldMatch[1] && fieldMatch[2]) {
      const rawType = fieldMatch[1].trim();
      const name = fieldMatch[2];
      if (name === 'serialVersionUID') continue;
      fields.push({ name, type: rawType });
    }
  }
  return fields;
}

// Check for "Object" in generated code
function countObjectOccurrences(content) {
  const matches = content.match(/\bObject\b/g);
  return matches ? matches.length : 0;
}

// Check for unused imports
function findUnusedImports(content) {
  const unused = [];
  const importRegex = /import\s+([\w.]+\.(\w+))\s*;/g;
  let m;
  while ((m = importRegex.exec(content)) !== null) {
    const className = m[2];
    // Check if className is used elsewhere in the file (not in import line)
    const withoutImports = content.replace(/import\s+[\w.]+\s*;/g, '');
    const usageRegex = new RegExp(`\\b${className}\\b`);
    if (!usageRegex.test(withoutImports)) {
      unused.push(m[1]);
    }
  }
  return unused;
}

// Check for duplicate methods
function findDuplicateMethods(content) {
  const methods = [];
  const methodRegex = /(?:public|private|protected)\s+[\w<>,\s\[\]]+?\s+(\w+)\s*\(/g;
  let m;
  while ((m = methodRegex.exec(content)) !== null) {
    methods.push(m[1]);
  }
  const counts = {};
  for (const name of methods) {
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts).filter(([_, c]) => c > 1).map(([name, count]) => ({ name, count }));
}

// Check for TODO without context
function findBadTodos(content) {
  const bad = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/\/\/\s*TODO\s*$/i.test(line) || /\/\/\s*TODO:\s*implement\s*$/i.test(line)) {
      bad.push({ line: i + 1, text: line });
    }
  }
  return bad;
}

// Main audit
const projects = [
  { name: 'boa-acl-test', dir: join(TEST_PROJECTS_DIR, 'boa-acl-test') },
  { name: 'boa-ultimate-test', dir: join(TEST_PROJECTS_DIR, 'boa-ultimate-test') },
  { name: 'activation-carte-bmcedirect-ejb', dir: join(TEST_PROJECTS_DIR, 'activation-carte-bmcedirect-ejb') },
];

const auditResults = [];

for (const project of projects) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Auditing: ${project.name}`);
  console.log('='.repeat(60));
  
  const javaFiles = collectJavaFiles(project.dir);
  const pomXml = findPomXml(project.dir);
  
  console.log(`  Total Java files: ${javaFiles.length}`);
  console.log(`  Has pom.xml: ${!!pomXml}`);
  
  // Classify each file
  const classified = javaFiles.map(f => ({
    ...f,
    types: classifyFile(f.content, f.className),
  }));
  
  const useCases = classified.filter(f => f.types.includes('UseCase'));
  const dtos = classified.filter(f => f.types.includes('DTO'));
  const enums = classified.filter(f => f.types.includes('Enum'));
  const exceptions = classified.filter(f => f.types.includes('Exception'));
  const services = classified.filter(f => f.types.includes('Service'));
  const validators = classified.filter(f => f.types.includes('Validator'));
  const remoteInterfaces = classified.filter(f => f.types.includes('RemoteInterface'));
  const baseClasses = classified.filter(f => f.types.includes('BaseClass'));
  const unclassified = classified.filter(f => f.types.includes('Unclassified'));
  const statelessEjbs = classified.filter(f => f.types.includes('StatelessEJB'));
  
  const detectedCount = classified.filter(f => !f.types.includes('Unclassified')).length;
  const detectionRate = ((detectedCount / javaFiles.length) * 100).toFixed(1);
  
  console.log(`  Detection rate: ${detectedCount}/${javaFiles.length} = ${detectionRate}%`);
  console.log(`  UseCases: ${useCases.length}`);
  console.log(`  DTOs: ${dtos.length}`);
  console.log(`  Enums: ${enums.length}`);
  console.log(`  Exceptions: ${exceptions.length}`);
  console.log(`  Services: ${services.length}`);
  console.log(`  Validators: ${validators.length}`);
  console.log(`  Remote Interfaces: ${remoteInterfaces.length}`);
  console.log(`  Base Classes: ${baseClasses.length}`);
  console.log(`  Unclassified: ${unclassified.length}`);
  if (statelessEjbs.length > 0) console.log(`  @Stateless EJBs (non-UseCase): ${statelessEjbs.length}`);
  
  if (unclassified.length > 0) {
    console.log(`  Unclassified files:`);
    for (const f of unclassified) {
      console.log(`    - ${f.className} (${f.path})`);
    }
  }
  
  // DTO field analysis
  console.log(`\n  DTO Field Analysis:`);
  const dtoFieldIssues = [];
  for (const dto of dtos) {
    const fields = extractDtoFields(dto.content);
    const objectFields = fields.filter(f => f.type === 'Object' || f.type === 'object');
    if (objectFields.length > 0) {
      console.log(`    ${dto.className}: ${objectFields.length} Object-typed fields: ${objectFields.map(f => f.name).join(', ')}`);
      dtoFieldIssues.push({ dto: dto.className, objectFields });
    }
    // Check for types that would resolve to Object
    const unresolvedFields = fields.filter(f => {
      const knownTypes = ['String', 'int', 'Integer', 'long', 'Long', 'double', 'Double', 'float', 'Float',
        'boolean', 'Boolean', 'BigDecimal', 'BigInteger', 'LocalDate', 'LocalDateTime', 'Date', 'byte[]',
        'List', 'Map', 'Set'];
      const baseType = f.type.replace(/<.*>/, '').trim();
      return !knownTypes.includes(baseType) && !classified.some(c => c.className === baseType);
    });
    if (unresolvedFields.length > 0) {
      console.log(`    ${dto.className}: ${unresolvedFields.length} potentially unresolved types: ${unresolvedFields.map(f => `${f.name}:${f.type}`).join(', ')}`);
    }
  }
  
  // UseCase VoIn/VoOut resolution
  console.log(`\n  UseCase VoIn/VoOut Resolution:`);
  const ucMapping = [];
  for (const uc of useCases) {
    // Check for cast pattern: (XxxVoIn) voIn
    const castMatch = uc.content.match(/\((\w+VoIn)\)\s*\w+/);
    const voIn = castMatch ? castMatch[1] : 'UNRESOLVED';
    
    const newMatch = uc.content.match(/new\s+(\w+VoOut)\s*\(/);
    const importVoOut = uc.content.match(/import\s+[\w.]+\.(\w+VoOut)\s*;/);
    const voOut = newMatch ? newMatch[1] : (importVoOut ? importVoOut[1] : 'UNRESOLVED');
    
    const voInResolved = voIn !== 'UNRESOLVED' && dtos.some(d => d.className === voIn);
    const voOutResolved = voOut !== 'UNRESOLVED' && dtos.some(d => d.className === voOut);
    
    console.log(`    ${uc.className}: VoIn=${voIn}${voInResolved ? ' ✅' : ' ❌'} VoOut=${voOut}${voOutResolved ? ' ✅' : ' ❌'}`);
    ucMapping.push({
      className: uc.className,
      voIn,
      voInResolved,
      voOut,
      voOutResolved,
      domain: extractDomainFromPackage(uc.content),
    });
  }
  
  auditResults.push({
    project: project.name,
    totalFiles: javaFiles.length,
    detectedCount,
    detectionRate: parseFloat(detectionRate),
    useCases: useCases.map(f => f.className),
    dtos: dtos.map(f => f.className),
    enums: enums.map(f => f.className),
    exceptions: exceptions.map(f => f.className),
    services: services.map(f => f.className),
    validators: validators.map(f => f.className),
    remoteInterfaces: remoteInterfaces.map(f => f.className),
    baseClasses: baseClasses.map(f => f.className),
    unclassified: unclassified.map(f => ({ className: f.className, path: f.path })),
    statelessEjbs: statelessEjbs.map(f => f.className),
    dtoFieldIssues,
    ucMapping,
  });
}

function extractDomainFromPackage(content) {
  const m = content.match(/package\s+([\w.]+)\s*;/);
  if (!m) return 'unknown';
  const parts = m[1].split('.');
  const ucIdx = parts.indexOf('usecases');
  if (ucIdx > 0) return parts[ucIdx - 1];
  return 'unknown';
}

// Write results
const outputDir = '/home/ubuntu/ejb-client-modernizer/docs/engine';
import { mkdirSync } from 'fs';
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'parsing-audit.json'), JSON.stringify(auditResults, null, 2));

console.log(`\n${'='.repeat(60)}`);
console.log(`Audit complete. Results written to docs/engine/parsing-audit.json`);
console.log('='.repeat(60));
