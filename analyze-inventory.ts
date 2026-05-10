import { generateSpringBootProject } from './server/spring-generator.js';
import { parseEjbProject } from './server/java-parser.js';
import * as fs from 'fs';
import * as path from 'path';

const projDir = '/tmp/test-projects/proj-06-inventory';
const files: {path: string; content: string}[] = [];
function walk(dir: string) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) walk(fp);
    else if (f.endsWith('.java')) files.push({path: f, content: fs.readFileSync(fp,'utf8')});
  }
}
walk(projDir);
const ir = parseEjbProject(files);
const result = generateSpringBootProject(ir, {groupId:'com.example',artifactId:'ejbproject'});

// Check StaffdaoService for logging
const staffSvc = result.files.find(f => f.path.includes('StaffdaoService'));
if (staffSvc) {
  const lines = staffSvc.content.split('\n');
  console.log('=== StaffdaoService.java (first 50 lines) ===');
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    console.log((i+1) + ': ' + lines[i]);
  }
}

// Check if @Slf4j or log field exists
const adminDAO = result.files.find(f => f.path.includes('AdminDAO'));
if (adminDAO) {
  console.log('\n=== AdminDAO.java (first 40 lines) ===');
  const lines = adminDAO.content.split('\n');
  for (let i = 0; i < Math.min(40, lines.length); i++) {
    console.log((i+1) + ': ' + lines[i]);
  }
}
