// Debug BUG 7: Check if sourceFile is found for EJBLocal adapters
import { join } from 'path';
import AdmZip from 'adm-zip';

const ZIP_PATH = join(process.cwd(), 'tests/fixtures/input/bmce-core-banking-complex.zip');
const { parseEjbProject } = await import('../server/java-parser.ts');

const zip = new AdmZip(ZIP_PATH);
const entries = zip.getEntries();
const sourceFiles = entries
  .filter(e => e.entryName.endsWith('.java') || e.entryName.endsWith('.xml') || e.entryName.endsWith('.properties'))
  .filter(e => e.entryName.indexOf('/') >= 0 || e.entryName.indexOf('.') >= 0) // skip dirs
  .map(e => ({ path: e.entryName, content: e.getData().toString('utf-8') }));

const parsed = parseEjbProject(sourceFiles);
const rawFiles = parsed._rawFiles || [];

console.log('Total rawFiles:', rawFiles.length);

// Simulate the fix logic
const svcTypes = ['NotificationMulticanalEJBLocal', 'DeviseConversionEJBLocal', 'SEPATransformer', 'IBANValidator'];

const pathEndsWith = (f, name) => {
  return f.path && (f.path.endsWith('/' + name + '.java') || f.path.endsWith('\\' + name + '.java') || f.path === name + '.java');
};

for (const svcType of svcTypes) {
  console.log('\n--- svcType:', svcType, '---');
  let sourceFile = null;
  
  const baseName = svcType
    .replace(/Local$/i, '')
    .replace(/Remote$/i, '')
    .replace(/Home$/i, '');
  console.log('baseName:', baseName, '| different:', baseName !== svcType);
  
  if (baseName !== svcType) {
    const candidates = [baseName, baseName + 'Bean', baseName + 'Impl'];
    for (const cand of candidates) {
      sourceFile = rawFiles.find(f => pathEndsWith(f, cand));
      if (sourceFile) {
        console.log('Found via candidate:', cand, '| path:', sourceFile.path);
        break;
      }
    }
  }
  
  if (sourceFile === null) {
    sourceFile = rawFiles.find(f => pathEndsWith(f, svcType));
    if (sourceFile) {
      console.log('Found via exact match:', sourceFile.path);
    }
  }
  
  if (sourceFile) {
    console.log('Content length:', sourceFile.content.length);
    // Check if empty interface
    const trimmed = sourceFile.content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const isEmpty = /^package[^;]*;\s*(import[^;]*;\s*)*public\s+interface\s+\w+\s*\{\s*\}\s*$/.test(trimmed);
    console.log('Is empty interface:', isEmpty);
    
    // Extract methods
    const methodPattern = /(?:public|protected)\s+[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)/g;
    let m;
    const methods = [];
    while ((m = methodPattern.exec(sourceFile.content)) !== null) {
      methods.push(m[0].trim());
    }
    console.log('Methods found:', methods.length);
    for (const method of methods.slice(0, 5)) {
      console.log('  ', method);
    }
  } else {
    console.log('NOT FOUND in rawFiles');
  }
}
