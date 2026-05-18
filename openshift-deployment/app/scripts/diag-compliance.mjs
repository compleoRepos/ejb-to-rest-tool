import { parseEjbProject } from '../server/java-parser.ts';
import { generateSpringBootProject } from '../server/spring-generator.ts';
import AdmZip from 'adm-zip';

const zip = new AdmZip('tests/fixtures/input/bmce-core-banking-complex.zip');
const files = [];
let pomXml;
for (const entry of zip.getEntries()) {
  if (entry.isDirectory) continue;
  const ext = entry.entryName.split('.').pop();
  if (['java','xml','properties','yml','yaml','jsp'].includes(ext)) {
    const content = entry.getData().toString('utf-8');
    if (entry.entryName.endsWith('pom.xml')) pomXml = content;
    files.push({path: entry.entryName, content});
  }
}
const ir = parseEjbProject(files, pomXml);
const gen = generateSpringBootProject(ir);
const fileMap = new Map(gen.files.map(f => [f.path, f.content]));

// Find Compliance-related files
const compFiles = [...fileMap.keys()].filter(f => /[Cc]ompliance|[Cc]onformite|LBCFT/i.test(f));
console.log('Compliance files:', compFiles);

// Find the service with genererDeclarationTRAPROC
for (const [p, c] of fileMap) {
  if (c.includes('genererDeclarationTRAPROC')) {
    console.log('Found genererDeclarationTRAPROC in:', p);
    const methods = c.match(/public\s+\w[\w<>, \[\]]+\s+\w+\s*\([^)]*\)/g) ?? [];
    methods.forEach(m => console.log('  ' + m));
  }
}

// All Service.java files
const svcFiles = [...fileMap.keys()].filter(f => f.endsWith('Service.java'));
console.log('\nAll Service files:');
svcFiles.forEach(f => console.log('  ' + f));
