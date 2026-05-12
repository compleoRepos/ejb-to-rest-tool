/**
 * Targeted benchmark for interface-credit-jocker and avis-opere only.
 * Uses the same pipeline as bench-bmce-19.ts but runs only 2 projects.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename, dirname } from "path";
import { compileWithMaven } from "./server/engine/validation/RealMavenCompiler";
import { autoFixAndCompile } from "./server/engine/validation/CompileAutoFixer";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";
import { ParenBalancer } from "./server/engine/validation/ParenBalancer";
import { DependencyAnalyzer, Workspace, WorkspaceGraph } from "./server/engine/workspace/DependencyAnalyzer";
import { SharedStubLibrary, SharedStubBundle } from "./server/engine/workspace/SharedStubLibrary";
import { ProjectReportGenerator, type ReportInput } from "./server/engine/report/ProjectReportGenerator";

const PROJECTS_DIR = "/tmp/bmce-flat";
const OUTPUT_DIR = "/tmp/bmce-output-v135b";
const TARGET_PROJECTS = ["interface-credit-jocker", "avis-opere"];

/** Detect the source package from the IR's raw files */
function detectSourcePackage(ir: any): string | undefined {
  if (!ir?._rawFiles?.length) return undefined;
  const pkgCounts = new Map<string, number>();
  for (const f of ir._rawFiles) {
    const m = f.content.match(/^package\s+([\w.]+)\s*;/m);
    if (m) pkgCounts.set(m[1], (pkgCounts.get(m[1]) || 0) + 1);
  }
  if (pkgCounts.size === 0) return undefined;
  // Find the most common root package (2-3 segments)
  const roots = new Map<string, number>();
  for (const [pkg, count] of pkgCounts) {
    const parts = pkg.split('.');
    const root = parts.slice(0, Math.min(3, parts.length)).join('.');
    roots.set(root, (roots.get(root) || 0) + count);
  }
  return [...roots.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

async function benchmarkProject(
  dir: string,
  sharedStubs: SharedStubBundle
) {
  const projName = basename(dir);
  console.log(`\n  [$] ${projName}...`);
  const t0 = Date.now();
  let memPeak = process.memoryUsage().heapUsed;
  const memBefore = memPeak;

  // Collect Java files
  const javaFiles: SourceFile[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".java")) {
        javaFiles.push({
          path: full.replace(dir + "/", ""),
          content: readFileSync(full, "utf-8"),
          className: entry.replace(".java", ""),
        });
      }
    }
  }
  walk(dir);
  const loc = javaFiles.reduce((s, f) => s + f.content.split("\n").length, 0);
  console.log(`    ${javaFiles.length} Java files, ${loc} LOC`);

  // Analyze
  const engine = new CompleoEngine();
  const analysisResult = await engine.analyze(javaFiles);
  const analyzeTimeMs = Date.now() - t0;
  memPeak = Math.max(memPeak, process.memoryUsage().heapUsed);

  // Generate
  const t1 = Date.now();
  const genResult = await engine.generate(
    analysisResult.ir,
    undefined,
    undefined,
    analysisResult.multiTech?.generatedFiles || []
  );
  const generateTimeMs = Date.now() - t1;
  memPeak = Math.max(memPeak, process.memoryUsage().heapUsed);

  let generatedFiles = genResult.files || [];
  // v13.5b: Include multiTechFiles
  const multiTechFiles = (genResult as any)?.multiTechFiles || [];
  if (multiTechFiles.length > 0) {
    const existingPaths = new Set(generatedFiles.map((f: any) => f.path));
    for (const mtf of multiTechFiles) {
      if (!existingPaths.has(mtf.path)) {
        generatedFiles.push(mtf);
        existingPaths.add(mtf.path);
      }
    }
  }

  // ParenBalancer
  const parenBalancer = new ParenBalancer();
  generatedFiles = generatedFiles.map(f => {
    if (!f.path.endsWith('.java')) return f;
    const { fixed, fixCount } = parenBalancer.balance(f.content);
    if (fixCount > 0) return { ...f, content: fixed };
    return f;
  });

  // Shared stubs
  if (sharedStubs.stubFiles.size > 0) {
    const existingFQCNs = new Set<string>();
    const existingClassNames = new Set<string>();
    for (const f of generatedFiles) {
      if (!f.path.endsWith('.java')) continue;
      const classMatch = f.path.match(/([A-Z]\w+)\.java$/);
      if (classMatch) existingClassNames.add(classMatch[1]);
      const pkgMatch = f.content.match(/^package\s+([\w.]+)\s*;/m);
      if (pkgMatch && classMatch) existingFQCNs.add(`${pkgMatch[1]}.${classMatch[1]}`);
    }
    for (const [stubPath, stubContent] of sharedStubs.stubFiles) {
      if (stubPath === 'pom.xml') continue;
      const pathMatch = stubPath.match(/src\/main\/java\/(.+)\/([A-Z]\w+)\.java$/);
      if (!pathMatch) continue;
      const stubPkg = pathMatch[1].replace(/\//g, '.');
      const stubFQCN = `${stubPkg}.${pathMatch[2]}`;
      if (existingFQCNs.has(stubFQCN)) continue;
      if (existingClassNames.has(pathMatch[2]) && stubPkg.startsWith('com.example.ejbproject')) continue;
      if (stubPkg.startsWith('org.mockito') || stubPkg.startsWith('org.junit') || stubPkg.startsWith('junit.framework')) continue;
      generatedFiles.push({ path: stubPath, content: stubContent });
    }
  }

  // Post-fix patterns (simplified)
  generatedFiles = generatedFiles.map(f => {
    if (!f.path.endsWith('.java')) return f;
    let content = f.content;
    content = content.replace(/^\s*\/\/\s*@@(JDBC|DAO)_LLM_BLOCK_\d+@@.*$/gm, '        // TODO: JDBC block migration pending');
    content = content.replace(/^\s*@@(JDBC|DAO)_LLM_BLOCK_\d+@@.*$/gm, '        // TODO: JDBC block migration pending');
    content = content.replace(/^\s*private\s+final\s+(static\s+)?SessionContext\s+\w*\s*;\s*$/gm, '');
    content = content.replace(/^\s*private\s+(static\s+)?SessionContext\s+\w*\s*;\s*$/gm, '');
    if (content.includes('XMLGregorianCalendar') && !content.includes('import javax.xml.datatype.XMLGregorianCalendar')) {
      const pkgLine = content.match(/^package\s+[\w.]+\s*;/m);
      if (pkgLine) content = content.replace(pkgLine[0], `${pkgLine[0]}\nimport javax.xml.datatype.XMLGregorianCalendar;\nimport javax.xml.datatype.DatatypeFactory;`);
    }
    // Fix brace balance
    let openBraces = 0;
    for (const ch of content) { if (ch === '{') openBraces++; else if (ch === '}') openBraces--; }
    if (openBraces > 0) content += '\n' + '}\n'.repeat(openBraces);
    return { ...f, content };
  });

  // Compile
  const t2 = Date.now();
  const autoFixResult = await autoFixAndCompile(generatedFiles, { maxIterations: 5 });
  const compileTimeMs = Date.now() - t2;
  const totalTimeMs = Date.now() - t0;

  // Score
  const baseScore = autoFixResult.finalResult.status === "PASS" ? 85 :
    Math.max(10, Math.round(85 * (1 - autoFixResult.finalResult.errorCount / Math.max(1, autoFixResult.originalResult.errorCount))));
  const score = Math.min(100, baseScore + (autoFixResult.recoveredFromFail ? 10 : 0));

  // Filter third-party files
  let outputFiles = autoFixResult.finalFiles || generatedFiles;
  const ALLOWED_JAVA_PACKAGES = ['com/example/ejbproject/', 'com/nexa/bmce/', 'com/app/'];
  const THIRD_PARTY_PREFIXES = [
    'com/google/', 'com/netflix/', 'com/jcraft/', 'com/fasterxml/', 'com/amazonaws/',
    'org/apache/', 'org/hibernate/', 'org/jboss/', 'org/springframework/',
    'io/github/', 'io/netty/', 'net/sf/', 'javax/', 'jakarta/',
  ];
  outputFiles = outputFiles.filter(f => {
    if (!f.path.endsWith('.java')) return true;
    if (!f.path.includes('src/main/java/')) return true;
    const javaPath = f.path.replace(/^src\/main\/java\//, '');
    if (ALLOWED_JAVA_PACKAGES.some(pkg => javaPath.startsWith(pkg))) return true;
    if (THIRD_PARTY_PREFIXES.some(pkg => javaPath.startsWith(pkg))) return false;
    return true;
  });

  // Write output
  const projOutputDir = join(OUTPUT_DIR, projName);
  mkdirSync(projOutputDir, { recursive: true });
  for (const f of outputFiles) {
    if (!f.path.includes('.')) continue;
    const fPath = join(projOutputDir, f.path);
    try {
      mkdirSync(dirname(fPath), { recursive: true });
      if (existsSync(fPath) && statSync(fPath).isDirectory()) continue;
      writeFileSync(fPath, f.content);
    } catch (e: any) {
      if (e.code !== 'EISDIR') throw e;
    }
  }

  // Generate report
  try {
    const reportInput: ReportInput = {
      projectName: projName,
      sourcePackage: detectSourcePackage(analysisResult.ir),
      targetPackage: `com.example.ejbproject`,
      projectDomain: undefined,
      analysisResult: analysisResult,
      ir: analysisResult.ir,
      generatedProject: {
        files: outputFiles,
        stats: (genResult as any)?.stats,
        warnings: (genResult as any)?.warnings || [],
        migrationReport: "",
        multiTechFiles: multiTechFiles,
      } as any,
      compilationResult: {
        finalErrors: autoFixResult.finalResult.errors,
        totalAttempts: autoFixResult.iterations,
      } as any,
      schemaResult: undefined,
      pipelineError: null,
      durationMs: totalTimeMs,
    };
    const report = await ProjectReportGenerator.generate(reportInput);
    writeFileSync(join(projOutputDir, "MIGRATION-REPORT.html"), report.html);
    const compleoDir = join(projOutputDir, ".compleo");
    mkdirSync(compleoDir, { recursive: true });
    if (report.artifacts.transformationsJson) writeFileSync(join(compleoDir, "transformations.json"), report.artifacts.transformationsJson);
    if (report.artifacts.todoMarkersJson) writeFileSync(join(compleoDir, "todo-markers.json"), report.artifacts.todoMarkersJson);
    if (report.artifacts.filesManifestJson) writeFileSync(join(compleoDir, "files-manifest.json"), report.artifacts.filesManifestJson);
    if (report.artifacts.decisionsJson) writeFileSync(join(compleoDir, "decisions.json"), report.artifacts.decisionsJson);
    if (report.artifacts.schemaMappingJson) writeFileSync(join(compleoDir, "schema-mapping.json"), report.artifacts.schemaMappingJson);
    console.log(`    Report: MIGRATION-REPORT.html + .compleo/ generated`);
  } catch (reportErr) {
    console.warn(`    Report generation failed:`, (reportErr as Error).message);
  }

  // Verify criteria
  const controllers = outputFiles.filter(f => f.path.includes('Controller') && f.content.includes('@RestController'));
  const services = outputFiles.filter(f => f.path.includes('Service') && f.content.includes('@Service'));
  const thirdPartyFiles = outputFiles.filter(f => {
    if (!f.path.endsWith('.java') || !f.path.includes('src/main/java/')) return false;
    const javaPath = f.path.replace(/^src\/main\/java\//, '');
    return !ALLOWED_JAVA_PACKAGES.some(pkg => javaPath.startsWith(pkg));
  });
  const appFile = outputFiles.find(f => f.path.includes('Application.java') && f.content.includes('@SpringBootApplication'));

  console.log(`    Score: ${score}/100 | Compile: ${autoFixResult.finalResult.status} (${autoFixResult.finalResult.errorCount} errors)`);
  console.log(`    Controllers: ${controllers.length} | Services: ${services.length}`);
  console.log(`    Application class: ${appFile ? 'YES' : 'NO'}`);
  console.log(`    Third-party files remaining: ${thirdPartyFiles.length}`);
  if (thirdPartyFiles.length > 0) {
    thirdPartyFiles.slice(0, 5).forEach(f => console.log(`      - ${f.path}`));
  }
  console.log(`    Total output files: ${outputFiles.length}`);

  return { projName, score, compileStatus: autoFixResult.finalResult.status, errorCount: autoFixResult.finalResult.errorCount, controllers: controllers.length, services: services.length, thirdPartyFiles: thirdPartyFiles.length, hasApp: !!appFile };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const dirs = TARGET_PROJECTS.map(p => join(PROJECTS_DIR, p)).filter(d => existsSync(d));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  COMPLEO v13.5b - Targeted Re-run (${dirs.length} projects)`);
  console.log(`${"=".repeat(60)}`);

  // SharedStubLibrary injection is DISABLED (stubs have internal compile errors)
  // Pass null stubs — the individual project pipeline handles its own stubs via CompileAutoFixer
  const sharedStubs: SharedStubBundle = { stubFiles: new Map(), classCount: 0, pomFragment: '' };
  console.log(`  Shared stubs: DISABLED (using per-project autofix stubs)`);

  const results = [];
  for (const dir of dirs) {
    try {
      const result = await benchmarkProject(dir, sharedStubs);
      results.push(result);
    } catch (err) {
      console.error(`  CRASHED: ${basename(dir)}: ${(err as Error).message}`);
      console.error((err as Error).stack);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SUMMARY`);
  console.log(`${"=".repeat(60)}`);
  for (const r of results) {
    const icon = r.compileStatus === "PASS" ? "PASS" : "FAIL";
    console.log(`  ${r.projName}: ${icon} | Score: ${r.score} | Ctrl: ${r.controllers} | Svc: ${r.services} | 3rd-party: ${r.thirdPartyFiles} | App: ${r.hasApp}`);
  }

  // Verify all 5 criteria
  console.log(`\n  CRITERIA CHECK:`);
  for (const r of results) {
    console.log(`  ${r.projName}:`);
    console.log(`    1. MIGRATION-REPORT.html: ${existsSync(join(OUTPUT_DIR, r.projName, "MIGRATION-REPORT.html")) ? "PASS" : "FAIL"}`);
    console.log(`    2. .compleo/ directory: ${existsSync(join(OUTPUT_DIR, r.projName, ".compleo")) ? "PASS" : "FAIL"}`);
    console.log(`    3. No third-party source: ${r.thirdPartyFiles === 0 ? "PASS" : `FAIL (${r.thirdPartyFiles} files)`}`);
    console.log(`    4. Controllers/Services: ${r.controllers >= 1 && r.services >= 1 ? "PASS" : `FAIL (ctrl=${r.controllers}, svc=${r.services})`}`);
    console.log(`    5. Application class: ${r.hasApp ? "PASS" : "FAIL"}`);
  }
}

main().catch(console.error);
