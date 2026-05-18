import { generateSpringBootProject } from './server/spring-generator.js';
import { parseEjbProject } from './server/java-parser.js';
import * as fs from 'fs';
import * as path from 'path';

const projDir = '/tmp/test-projects/proj-10-jdbc-monolith';
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

// Show BillingService
const billing = result.files.find(f => f.path.includes('BillingService'));
if (billing) {
  const lines = billing.content.split('\n');
  console.log('=== BillingService.java lines 70-170 ===');
  for (let i = 69; i < Math.min(170, lines.length); i++) {
    console.log((i+1) + ': ' + lines[i]);
  }
}

// Show BillingController
const controller = result.files.find(f => f.path.includes('BillingController'));
if (controller) {
  const lines = controller.content.split('\n');
  console.log('\n=== BillingController.java lines 65-85 ===');
  for (let i = 64; i < Math.min(85, lines.length); i++) {
    console.log((i+1) + ': ' + lines[i]);
  }
}

// Show DatabaseController
const dbCtrl = result.files.find(f => f.path.includes('DatabaseController'));
if (dbCtrl) {
  const lines = dbCtrl.content.split('\n');
  console.log('\n=== DatabaseController.java lines 118-135 ===');
  for (let i = 117; i < Math.min(135, lines.length); i++) {
    console.log((i+1) + ': ' + lines[i]);
  }
}
