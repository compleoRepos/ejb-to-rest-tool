import { parseEjbProject } from '../server/java-parser.ts';
import { generateSpringBootProject } from '../server/spring-generator.ts';
import AdmZip from 'adm-zip';
import path from 'path';

const zip = new AdmZip('tests/fixtures/input/bmce-core-banking-complex.zip');
const entries = zip.getEntries();
const files = [];
let pomXml;
for (const entry of entries) {
  if (entry.isDirectory) continue;
  const ext = path.extname(entry.entryName).toLowerCase();
  if (['.java', '.xml', '.jsp', '.properties', '.yml', '.yaml'].includes(ext)) {
    const content = entry.getData().toString('utf-8');
    if (entry.entryName.endsWith('pom.xml')) {
      pomXml = content;
    }
    files.push({ path: entry.entryName, content });
  }
}

const parsed = parseEjbProject(files, pomXml);

console.log('=== UseCases trouvés (' + parsed.useCases.length + ') ===');
for (const uc of parsed.useCases) {
  const interesting = /CreditScoring|VirementSEPA|Compliance|SessionManager|Authentication|SEPATransformer|ScoringRequest|CreditData|Carte|Reporting|Compte/i.test(uc.className);
  if (interesting) {
    console.log('\nUseCase: ' + uc.className + ' | type: ' + uc.type + ' | domain: ' + uc.domain);
    console.log('  returnType: ' + uc.returnType + ' | methodName: ' + uc.methodName);
    if (uc.methodParameters && uc.methodParameters.length > 0) {
      console.log('  params: ' + uc.methodParameters.map(p => p.type + ' ' + p.name).join(', '));
    } else {
      console.log('  params: (aucun)');
    }
  }
}

// Check for CDI/DTO that should not produce UseCases
console.log('\n=== CDI/DTO UseCases (ne devraient pas exister) ===');
for (const uc of parsed.useCases) {
  if (/SEPATransformer|ScoringRequestVoIn|CreditDataTransformer|IBANValidator/i.test(uc.className)) {
    console.log('  FAUX POSITIF: ' + uc.className + ' (type: ' + uc.type + ')');
  }
}

// Check for execute() methods
console.log('\n=== UseCases avec execute() ===');
for (const uc of parsed.useCases) {
  if (uc.methodName === 'execute') {
    console.log('  ' + uc.className + '.execute()');
  }
}

// Check for Object return types
console.log('\n=== UseCases avec retour Object ===');
for (const uc of parsed.useCases) {
  if (uc.returnType === 'Object' || uc.returnType === 'java.lang.Object') {
    console.log('  ' + uc.className + '.' + uc.methodName + '() -> Object');
  }
}

// Generate Spring Boot project
console.log('\n=== Génération Spring Boot ===');
const generation = generateSpringBootProject(parsed);
const fileMap = new Map(generation.files.map(f => [f.path, f.content]));

console.log('Fichiers générés: ' + generation.files.length);

// Check services
console.log('\n=== Services clés ===');
for (const [fpath, content] of fileMap) {
  if (/CreditScoring|VirementSEPA|Compliance|SessionManager|Authentication/i.test(fpath)) {
    if (fpath.includes('Service.java')) {
      console.log('\n--- ' + fpath + ' ---');
      const methods = content.match(/public\s+[\w<>,\s\[\]]+\s+\w+\s*\([^)]*\)/g) || [];
      for (const m of methods) {
        console.log('  ' + m.trim());
      }
    }
  }
}

// Check for Object returns in generated services
console.log('\n=== Retours Object dans services générés ===');
for (const [fpath, content] of fileMap) {
  if (!fpath.includes('Service.java')) continue;
  const objectMethods = content.match(/public\s+Object\s+\w+\s*\([^)]*\)/g) || [];
  if (objectMethods.length > 0) {
    console.log('  ' + fpath + ': ' + objectMethods.join(', '));
  }
}

// Check for execute() in generated services
console.log('\n=== execute() dans services générés ===');
for (const [fpath, content] of fileMap) {
  if (!fpath.includes('Service.java')) continue;
  const execMethods = content.match(/public\s+\w+\s+execute\s*\(/g) || [];
  if (execMethods.length > 0) {
    console.log('  ' + fpath + ': ' + execMethods.join(', '));
  }
}

// Check CDI/DTO services that should NOT exist
console.log('\n=== Services CDI/DTO (ne devraient pas exister) ===');
for (const [fpath] of fileMap) {
  if (!fpath.includes('Service.java')) continue;
  if (/SEPATransformer|ScoringRequestVoIn|CreditDataTransformer|IBANValidator/i.test(fpath)) {
    console.log('  FAUX POSITIF: ' + fpath);
  }
}
