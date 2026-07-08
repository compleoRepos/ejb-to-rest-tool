import { generateBianWrappers, BianProject, AdapterEndpoint } from './server/generators/bianGenerator';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const adaptersDir = '/tmp/test-all-v2';
  const outputDir = '/tmp/test-bian-v3';
  const dirs = fs.readdirSync(adaptersDir).filter(d => fs.statSync(path.join(adaptersDir, d)).isDirectory());

  const projects: BianProject[] = [];

  for (const dir of dirs) {
    const resourceDir = path.join(adaptersDir, dir, 'src/main/java');
    const resourceFiles = findFiles(resourceDir, 'Resource.java');
    const endpoints: AdapterEndpoint[] = [];

    for (const rf of resourceFiles) {
      const content = fs.readFileSync(rf, 'utf-8');
      const pathMatch = content.match(/@Path\("([^"]+)"\)\s*\n.*@Produces/);
      const basePath = pathMatch ? pathMatch[1] : '/' + dir;
      const methods = [...content.matchAll(/(@GET|@POST|@PUT|@DELETE)\s*\n\s*@Path\("([^"]+)"\)/g)];
      for (const m of methods) {
        endpoints.push({
          operation: m[2].replace('/', ''),
          method: m[1].replace('@', ''),
          path: '/api' + basePath + m[2],
          requestFields: [],
          responseFields: []
        });
      }
    }

    if (endpoints.length > 0) {
      projects.push({ adapterName: dir, endpoints });
    }
  }

  console.log('Total projects:', projects.length);
  console.log('Total endpoints:', projects.reduce((sum, p) => sum + p.endpoints.length, 0));

  const result = await generateBianWrappers({
    projects,
    outputDir,
    groupId: 'com.bank.bian',
    basePackage: 'com.bank.bian'
  });

  console.log('Success:', result.success);
  console.log('Wrappers generated:', result.wrappers.length);
  for (const w of result.wrappers) {
    console.log(' -', w.serviceDomain, ':', w.endpoints, 'endpoints,', w.filesGenerated, 'files');
  }
  if (result.errors.length > 0) {
    console.log('Errors:', result.errors);
  }
}

function findFiles(dir: string, suffix: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...findFiles(full, suffix));
    else if (e.name.endsWith(suffix)) results.push(full);
  }
  return results;
}

main().catch(e => { console.error(e); process.exit(1); });
