import { parseEjbProject } from '../server/java-parser.ts';
import { generateSpringBootProject } from '../server/spring-generator.ts';
import * as fs from 'fs';
import JSZip from 'jszip';

const zipBuf = fs.readFileSync('./tests/fixtures/input/bmce-core-banking-complex.zip');
const zip = await JSZip.loadAsync(zipBuf);
const sources = [];
for (const [name, entry] of Object.entries(zip.files)) {
  if (entry.dir) continue;
  if (!name.endsWith('.java')) continue;
  sources.push({ path: name, content: await entry.async('text') });
}
const ir = parseEjbProject(sources);
const result = generateSpringBootProject(ir);

console.log("=== Services ===");
for (const f of result.files) {
  if (f.path.includes('Service.java')) {
    console.log(f.path);
    // Extract method signatures
    const methods = f.content.match(/public\s+[\w<>\[\],\s?]+?\s+\w+\s*\([^)]*\)/g) || [];
    for (const m of methods) {
      console.log("  " + m.trim());
    }
  }
}

console.log("\n=== Controllers ===");
for (const f of result.files) {
  if (f.path.includes('Controller.java')) {
    console.log(f.path);
  }
}

console.log("\n=== Quality Score ===");
const qs = result.files.find(f => f.path.includes('QUALITY_SCORE'));
if (qs) {
  console.log(qs.content.substring(0, 500));
}

// Check for Object returns
console.log("\n=== Object returns ===");
for (const f of result.files) {
  if (!f.path.includes('Service.java')) continue;
  const objMethods = f.content.match(/public\s+Object\s+\w+\s*\(/g);
  if (objMethods) {
    console.log(f.path + ": " + objMethods.join(", "));
  }
}

// Check for execute()
console.log("\n=== execute() methods ===");
for (const f of result.files) {
  if (!f.path.includes('Service.java')) continue;
  const execMethods = f.content.match(/public\s+\w+\s+execute\s*\(/g);
  if (execMethods) {
    console.log(f.path + ": " + execMethods.join(", "));
  }
}
