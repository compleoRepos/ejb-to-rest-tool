import * as fs from 'fs';
import * as path from 'path';
import { filterTestFiles } from '../server/engine/detectors/source-filter.ts';

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

const { filtered, testCount } = filterTestFiles(files);
const filteredSet = new Set(filtered.map(f => f.path));

console.log('Total files:', files.length);
console.log('Kept:', filtered.length);
console.log('Removed:', files.length - filtered.length);

// Check VrtPerm
const vrtPermFile = files.find(f => f.path.includes('VrtPerm'));
if (vrtPermFile) {
  console.log('\nVrtPerm path:', vrtPermFile.path);
  console.log('VrtPerm kept:', filteredSet.has(vrtPermFile.path));
}

// Show all Java files kept
console.log('\n=== Java files kept ===');
const javaKept = filtered.filter(f => f.path.endsWith('.java'));
for (const f of javaKept) {
  console.log('  KEPT:', path.basename(f.path));
}

// Show all Java files removed
console.log('\n=== Java files removed ===');
const javaRemoved = files.filter(f => f.path.endsWith('.java') && !filteredSet.has(f.path));
for (const f of javaRemoved) {
  console.log('  REMOVED:', path.basename(f.path));
}

// Now test isDirectEjb on VrtPerm directly
if (vrtPermFile && filteredSet.has(vrtPermFile.path)) {
  console.log('\n=== VrtPerm is in filtered set — parser should detect it ===');
} else {
  console.log('\n=== VrtPerm was FILTERED OUT — this is the bug ===');
}
