// Debug: find the Oracle keyword false positive
import { join } from 'path';
import AdmZip from 'adm-zip';

const ZIP_PATH = join(process.cwd(), 'tests/fixtures/input/bmce-core-banking-complex.zip');
const { parseEjbProject } = await import('../server/java-parser.ts');
const { generateSpringBootProject } = await import('../server/spring-generator.ts');

const zip = new AdmZip(ZIP_PATH);
const entries = zip.getEntries();
const sourceFiles = entries
  .filter(e => e.entryName.endsWith('.java') || e.entryName.endsWith('.xml') || e.entryName.endsWith('.properties'))
  .map(e => ({ path: e.entryName, content: e.getData().toString('utf-8') }));

const parsed = parseEjbProject(sourceFiles);
const generated = generateSpringBootProject(parsed);

const ORACLE_KW = new Set(["NOWAIT", "SYSDATE", "DUAL", "NEXTVAL", "ROWNUM", "ROWID"]);

for (const f of generated.files) {
  if (!f.path.endsWith(".java")) continue;
  for (const kw of ORACLE_KW) {
    const tableNameRegex = new RegExp(
      `@Table\\s*\\(.*name\\s*=\\s*"${kw}"|` +
      `(?:FROM|JOIN|INTO|UPDATE)\\s+${kw}\\b`,
      "i"
    );
    if (tableNameRegex.test(f.content)) {
      console.log(`Found Oracle keyword "${kw}" in ${f.path}`);
      // Show context
      const lines = f.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (tableNameRegex.test(lines[i])) {
          console.log(`  Line ${i+1}: ${lines[i].trim()}`);
        }
      }
    }
  }
}
