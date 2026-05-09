import { parseEjbProject } from './server/java-parser';
import { generateSpringBootProject } from './server/spring-generator';
import { CompilationLoop } from './server/agent/CompilationLoop';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

async function debugProject(projDir: string, projName: string) {
  const files = readdirSync(projDir)
    .filter(f => f.endsWith('.java') || f === 'pom.xml')
    .map(f => ({ path: f, content: readFileSync(join(projDir, f), 'utf-8') }));
  const pomXml = files.find(f => f.path === 'pom.xml')?.content;
  const ir = parseEjbProject(files, pomXml);
  const result = generateSpringBootProject(ir);

  // Show problematic lines for specific files
  const problemFiles: Record<string, number[]> = projName === 'bookstore' ? {
    'GeneralService.java': [18, 21],
    'JMSContextAdapter.java': [6],
    'MailerService.java': [28],
  } : {
    'DatabaseService.java': [31, 43, 55, 67, 79, 91],
    'DatabaseController.java': [77, 109, 125],
    'BillingController.java': [74],
  };

  console.log(`\n=== ${projName} ===`);
  for (const [fileName, lineNums] of Object.entries(problemFiles)) {
    const file = result.files.find(f => f.path.includes(fileName));
    if (!file) {
      console.log(`  ${fileName}: NOT FOUND`);
      continue;
    }
    console.log(`\n  ${fileName}:`);
    const lines = file.content.split('\n');
    for (const ln of lineNums) {
      const start = Math.max(0, ln - 3);
      const end = Math.min(lines.length, ln + 2);
      for (let i = start; i < end; i++) {
        const marker = i === ln - 1 ? '>>>' : '   ';
        console.log(`    ${marker} ${i+1}: ${lines[i]}`);
      }
      console.log('');
    }
  }
}

debugProject('/tmp/test-projects/proj-04-bookstore', 'bookstore');
debugProject('/tmp/test-projects/proj-10-jdbc-monolith', 'jdbc-monolith');
