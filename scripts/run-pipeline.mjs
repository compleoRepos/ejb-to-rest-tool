import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';

const TEST_PROJECTS_DIR = '/home/ubuntu/test-projects';
const OUTPUT_DIR = '/home/ubuntu/ejb-client-modernizer/docs/engine';

function collectJavaFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectJavaFiles(fullPath));
    else if (entry.name.endsWith('.java')) {
      results.push({ path: relative(dir, fullPath), content: readFileSync(fullPath, 'utf8') });
    }
  }
  return results;
}

function findPomXml(dir) {
  const pomPath = join(dir, 'pom.xml');
  if (existsSync(pomPath)) return readFileSync(pomPath, 'utf8');
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = findPomXml(join(dir, entry.name));
      if (nested) return nested;
    }
  }
  return null;
}

// Create a temporary TypeScript file that imports and runs the parser/generator
const projects = [
  { name: 'boa-acl-test', dir: join(TEST_PROJECTS_DIR, 'boa-acl-test') },
  { name: 'boa-ultimate-test', dir: join(TEST_PROJECTS_DIR, 'boa-ultimate-test') },
  { name: 'activation-carte-bmcedirect-ejb', dir: join(TEST_PROJECTS_DIR, 'activation-carte-bmcedirect-ejb') },
];

for (const project of projects) {
  const files = collectJavaFiles(project.dir);
  const pomXml = findPomXml(project.dir);
  
  // Write files data to temp JSON
  const tempData = { files, pomXml };
  writeFileSync('/tmp/audit-input.json', JSON.stringify(tempData));
  
  // Create a tsx script that imports the parser/generator
  const tsScript = `
import { readFileSync } from 'fs';
import { parseEjbProject } from './server/java-parser';
import { generateSpringBootProject } from './server/spring-generator';

const data = JSON.parse(readFileSync('/tmp/audit-input.json', 'utf8'));
const ir = parseEjbProject(data.files, data.pomXml || undefined);
const gen = generateSpringBootProject(ir);

// Count "Object" occurrences in generated code
let objectCount = 0;
const objectFiles = [];
for (const f of gen.files) {
  const matches = f.content.match(/\\bObject\\b/g);
  if (matches) {
    objectCount += matches.length;
    // Filter out legitimate uses (ErrorResponse, etc)
    const realObjects = f.content.split('\\n').filter(line => 
      /\\bObject\\b/.test(line) && 
      !line.includes('ErrorResponse') && 
      !line.includes('java.lang.Object') &&
      !line.includes('Class<?>') &&
      !line.includes('Payload')
    );
    if (realObjects.length > 0) {
      objectFiles.push({ path: f.path, count: realObjects.length, lines: realObjects.map(l => l.trim()) });
    }
  }
}

// Check for unused imports
const unusedImports = [];
for (const f of gen.files) {
  const importRegex = /import\\s+[\\w.]+\\.(\\w+)\\s*;/g;
  let m;
  while ((m = importRegex.exec(f.content)) !== null) {
    const className = m[1];
    const withoutImports = f.content.replace(/import\\s+[\\w.]+\\s*;/g, '');
    if (!new RegExp('\\\\b' + className + '\\\\b').test(withoutImports)) {
      unusedImports.push({ file: f.path, import: m[0] });
    }
  }
}

// Check for duplicate methods
const duplicateMethods = [];
for (const f of gen.files) {
  const methods = [];
  const methodRegex = /(?:public|private|protected)\\s+[\\w<>,\\s\\[\\]]+?\\s+(\\w+)\\s*\\(/g;
  let m;
  while ((m = methodRegex.exec(f.content)) !== null) {
    methods.push(m[1]);
  }
  const counts = {};
  for (const name of methods) counts[name] = (counts[name] || 0) + 1;
  const dups = Object.entries(counts).filter(([_, c]) => c > 1);
  if (dups.length > 0) {
    duplicateMethods.push({ file: f.path, duplicates: dups.map(([n, c]) => n + ':' + c) });
  }
}

// Check TODO without context
const badTodos = [];
for (const f of gen.files) {
  const lines = f.content.split('\\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/\\/\\/\\s*TODO\\s*$/i.test(line) || /\\/\\/\\s*TODO:\\s*implement\\s*$/i.test(line)) {
      badTodos.push({ file: f.path, line: i + 1, text: line });
    }
  }
}

const result = {
  ir: {
    projectName: ir.projectName,
    stats: ir.stats,
    warnings: ir.warnings,
    useCases: ir.useCases.map(uc => ({
      className: uc.className, domain: uc.domain, httpMethod: uc.httpMethod,
      restPath: uc.restPath, voInType: uc.voInType, voOutType: uc.voOutType,
    })),
    dtos: ir.dtos.map(d => ({
      className: d.className, direction: d.direction, fieldCount: d.fields.length,
      fields: d.fields.map(f => ({ name: f.name, type: f.type, resolvedType: f.resolvedType })),
    })),
    enums: ir.enums.map(e => ({ className: e.className, values: e.values })),
    exceptions: ir.exceptions.map(e => ({ className: e.className })),
  },
  generation: {
    stats: gen.stats,
    warnings: gen.warnings,
    files: gen.files.map(f => ({ path: f.path, category: f.category, lines: f.content.split('\\n').length })),
  },
  quality: {
    objectCount,
    objectFiles,
    unusedImports,
    duplicateMethods,
    badTodos,
  },
};

console.log(JSON.stringify(result, null, 2));
`;
  
  writeFileSync('/tmp/audit-pipeline.ts', tsScript);
  
  console.log(`\n=== Running pipeline for ${project.name} ===`);
  try {
    const output = execSync(
      `cd /home/ubuntu/ejb-client-modernizer && npx tsx /tmp/audit-pipeline.ts`,
      { encoding: 'utf8', timeout: 30000 }
    );
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(join(OUTPUT_DIR, `pipeline-${project.name}.json`), output);
    console.log(`  Written to pipeline-${project.name}.json`);
    
    // Quick summary
    const data = JSON.parse(output);
    console.log(`  UseCases: ${data.ir.useCases.length}, DTOs: ${data.ir.dtos.length}`);
    console.log(`  Generated files: ${data.generation.stats.totalFiles}, Lines: ${data.generation.stats.totalLinesGenerated}`);
    console.log(`  Object occurrences: ${data.quality.objectCount}`);
    console.log(`  Unused imports: ${data.quality.unusedImports.length}`);
    console.log(`  Duplicate methods: ${data.quality.duplicateMethods.length}`);
    console.log(`  Bad TODOs: ${data.quality.badTodos.length}`);
    console.log(`  Warnings: ${data.ir.warnings.length}`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    if (err.stderr) console.error(err.stderr.slice(0, 500));
  }
}
