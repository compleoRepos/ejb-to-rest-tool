import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { parseEjbProject } from '../server/java-parser';
import { generateSpringBootProject } from '../server/spring-generator';

const TEST_PROJECTS_DIR = '/home/ubuntu/test-projects';
const OUTPUT_DIR = join(import.meta.dirname, '..', 'docs', 'engine');
mkdirSync(OUTPUT_DIR, { recursive: true });

function collectJavaFiles(dir: string): { path: string; content: string }[] {
  const results: { path: string; content: string }[] = [];
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

function findPomXml(dir: string): string | undefined {
  const pomPath = join(dir, 'pom.xml');
  if (existsSync(pomPath)) return readFileSync(pomPath, 'utf8');
  return undefined;
}

const projects = [
  { name: 'boa-acl-test', dir: join(TEST_PROJECTS_DIR, 'boa-acl-test') },
  { name: 'boa-ultimate-test', dir: join(TEST_PROJECTS_DIR, 'boa-ultimate-test') },
  { name: 'activation-carte-bmcedirect-ejb', dir: join(TEST_PROJECTS_DIR, 'activation-carte-bmcedirect-ejb') },
];

const allResults: any[] = [];

for (const project of projects) {
  console.log(`\n=== ${project.name} ===`);
  const files = collectJavaFiles(project.dir);
  const pomXml = findPomXml(project.dir);
  
  const ir = parseEjbProject(files, pomXml);
  const gen = generateSpringBootProject(ir);
  
  // Count "Object" type in generated code (excluding legitimate uses)
  let objectCount = 0;
  const objectFiles: any[] = [];
  for (const f of gen.files) {
    const lines = f.content.split('\n');
    const objectLines = lines.filter(line =>
      /\bObject\b/.test(line) &&
      !line.includes('ErrorResponse') &&
      !line.includes('java.lang.Object') &&
      !line.includes('Class<?>') &&
      !line.includes('Payload') &&
      !line.includes('@ExceptionHandler') &&
      !line.includes('Exception') &&
      !line.includes('// TODO')
    );
    if (objectLines.length > 0) {
      objectCount += objectLines.length;
      objectFiles.push({ path: f.path, count: objectLines.length, lines: objectLines.map(l => l.trim()) });
    }
  }
  
  // Check for Void types in controller/service methods
  const voidIssues: any[] = [];
  for (const f of gen.files) {
    if (f.category === 'controller' || f.category === 'service') {
      const lines = f.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/\bVoid\b/.test(lines[i]) && !lines[i].includes('ResponseEntity<Void>')) {
          voidIssues.push({ file: f.path, line: i + 1, text: lines[i].trim() });
        }
      }
    }
  }
  
  // Check for duplicate import lines
  const duplicateImports: any[] = [];
  for (const f of gen.files) {
    const imports = f.content.split('\n').filter(l => l.startsWith('import '));
    const seen = new Set<string>();
    for (const imp of imports) {
      if (seen.has(imp)) {
        duplicateImports.push({ file: f.path, import: imp.trim() });
      }
      seen.add(imp);
    }
  }
  
  const result = {
    project: project.name,
    ir: {
      projectName: ir.projectName,
      stats: ir.stats,
      warnings: ir.warnings,
      useCases: ir.useCases.map(uc => ({
        className: uc.className, domain: uc.domain, httpMethod: uc.httpMethod,
        restPath: uc.restPath, voInType: uc.voInType, voOutType: uc.voOutType,
        injectedServices: uc.injectedServices,
      })),
      dtos: ir.dtos.map(d => ({
        className: d.className, direction: d.direction, fieldCount: d.fields.length,
        fields: d.fields.map(f => ({ name: f.name, type: f.type, resolvedType: f.resolvedType })),
      })),
    },
    generation: {
      stats: gen.stats,
      warnings: gen.warnings,
      fileCount: gen.files.length,
    },
    quality: {
      objectCount,
      objectFiles,
      voidIssues,
      duplicateImports,
    },
  };
  
  console.log(`  UseCases: ${ir.useCases.length}, DTOs: ${ir.dtos.length}`);
  console.log(`  Generated: ${gen.stats.totalFiles} files, ${gen.stats.totalLinesGenerated} lines`);
  console.log(`  Warnings: ${ir.warnings.length}`);
  if (ir.warnings.length > 0) {
    for (const w of ir.warnings) console.log(`    ⚠ ${w}`);
  }
  console.log(`  Object occurrences in generated code: ${objectCount}`);
  console.log(`  Void issues: ${voidIssues.length}`);
  console.log(`  Duplicate imports: ${duplicateImports.length}`);
  
  // Print UseCase mapping
  for (const uc of ir.useCases) {
    const voInOk = uc.voInType !== 'ValueObject' && uc.voInType !== 'Object';
    const voOutOk = uc.voOutType !== 'ValueObject' && uc.voOutType !== 'Object';
    console.log(`    ${uc.className}: VoIn=${uc.voInType}${voInOk ? ' ✅' : ' ❌'} VoOut=${uc.voOutType}${voOutOk ? ' ✅' : ' ❌'}`);
  }
  
  allResults.push(result);
}

writeFileSync(join(OUTPUT_DIR, 'pipeline-audit-full.json'), JSON.stringify(allResults, null, 2));
console.log(`\nFull audit written to docs/engine/pipeline-audit-full.json`);
