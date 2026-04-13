import AdmZip from 'adm-zip';
import { join } from 'path';

const ZIP_PATH = join(process.cwd(), 'tests/fixtures/input/bmce-core-banking-complex.zip');
const zip = new AdmZip(ZIP_PATH);
const entries = zip.getEntries();
const files = entries.filter(e => !e.isDirectory).map(e => e.entryName);

// Find files matching the adapter names
const targets = ['NotificationMulticanal', 'DeviseConversion', 'SEPATransformer', 'IBANValidator'];
for (const t of targets) {
  const matches = files.filter(f => f.includes(t));
  console.log(`${t}:`, matches);
}

// Also check _rawFiles in parsed IR
const { parseEjbProject } = await import('../server/java-parser.ts');
const sourceFiles = entries
  .filter(e => !e.isDirectory && (e.entryName.endsWith('.java') || e.entryName.endsWith('.xml') || e.entryName.endsWith('.properties')))
  .map(e => ({ path: e.entryName, content: e.getData().toString('utf-8') }));

const parsed = parseEjbProject(sourceFiles);
const rawFiles = (parsed)._rawFiles ?? [];
console.log('\n_rawFiles classNames:', rawFiles.map(f => f.className));

// Check what svcTypes are being generated
for (const t of targets) {
  const found = rawFiles.filter(f => f.className?.includes(t) || f.path?.includes(t));
  console.log(`\n${t} in _rawFiles:`, found.map(f => ({ className: f.className, path: f.path?.substring(f.path.lastIndexOf('/') + 1) })));
}
