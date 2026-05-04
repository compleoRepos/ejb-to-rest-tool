/**
 * Debug script pour comprendre les bugs du CobolParser sur les fichiers réels.
 */
import { CobolParser } from '../server/engine/cobol/CobolParser';
import * as fs from 'fs';

const parser = new CobolParser();
const content = fs.readFileSync('/home/ubuntu/cobol-real-test/ACCTINQ.cbl', 'utf-8');

console.log('=== RAW LINES (first 10) ===');
const rawLines = content.split('\n');
for (let i = 0; i < Math.min(10, rawLines.length); i++) {
  console.log(`[${i}] len=${rawLines[i].length} |${rawLines[i]}|`);
}

console.log('\n=== CODE LINES (after extractCodeLines) ===');
// Access private method via prototype
const codeLines = (parser as any).extractCodeLines(rawLines);
for (let i = 0; i < codeLines.length; i++) {
  if (codeLines[i].trim().length > 0) {
    console.log(`[${i}] |${codeLines[i]}|`);
  }
}

console.log('\n=== COPYBOOKS ===');
const fullCode = codeLines.join('\n');
const copybooks = parser.extractCopybooks(fullCode);
console.log('Copybooks found:', copybooks);

console.log('\n=== PERFORM CALLS ===');
const performs = (parser as any).extractPerformCalls(fullCode);
console.log('Performs found:', performs);

console.log('\n=== SECTIONS/PARAGRAPHS ===');
const sections = (parser as any).extractSections(codeLines);
console.log('Sections found:', sections.length);
for (const s of sections) {
  console.log(`  ${s.type}: ${s.name} (lines ${s.lineStart}-${s.lineEnd})`);
}

console.log('\n=== CICS DETECTION ===');
const cicsRegex = /EXEC\s+CICS([\s\S]*?)END-EXEC/gi;
let m;
while ((m = cicsRegex.exec(fullCode)) !== null) {
  console.log(`  CICS found: ${m[1].trim().substring(0, 50)}`);
}

console.log('\n=== PARAGRAPH REGEX DEBUG ===');
const paragraphRegex = /^\s*([A-Za-z0-9-]+)\s*\.\s*$/;
let inProcedure = false;
for (let i = 0; i < codeLines.length; i++) {
  const line = codeLines[i];
  if (/PROCEDURE\s+DIVISION/i.test(line)) {
    inProcedure = true;
    continue;
  }
  if (!inProcedure) continue;
  
  const paraMatch = line.match(paragraphRegex);
  if (paraMatch) {
    console.log(`  Line ${i}: MATCH |${line}| → name=${paraMatch[1]}`);
  } else if (line.match(/^\s*[A-Za-z0-9-]+\s*\./)) {
    console.log(`  Line ${i}: NEAR-MISS |${line}|`);
  }
}
