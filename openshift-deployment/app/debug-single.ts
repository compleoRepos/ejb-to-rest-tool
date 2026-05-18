import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { CompleoEngine } from "./server/engine/CompleoEngine";
import { autoFixAndCompile } from "./server/engine/validation/CompileAutoFixer";

const PROJECTS_DIR = "/tmp/bmce-flat";
const OUTPUT_DIR = "/tmp/bmce-output";
const projName = "coordonnees-3dsecure-bmcedirect";

async function main() {
  console.log(`\n=== DEBUG: ${projName} ===`);
  
  const projDir = join(PROJECTS_DIR, projName);
  const javaFiles: { path: string; content: string }[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".java") || entry.name === "pom.xml") {
        javaFiles.push({ path: full.replace(projDir + "/", ""), content: readFileSync(full, "utf-8") });
      }
    }
  }
  walk(projDir);
  console.log(`  Files: ${javaFiles.length}`);

  // Analyze
  const engine = new CompleoEngine();
  const analysisResult = await engine.analyze(javaFiles);
  console.log(`  Analysis: ${analysisResult.ir?.technologies?.length || 0} techs`);

  // Generate
  const genResult = await engine.generate(analysisResult.ir);
  const generatedFiles = genResult.files;
  console.log(`  Generated: ${generatedFiles.length} files`);

  // Compile with auto-fix
  console.log(`  Compiling...`);
  const autoFixResult = autoFixAndCompile(generatedFiles, { timeout: 120000 });
  console.log(`  Status: ${autoFixResult.status}`);
  console.log(`  Iterations: ${autoFixResult.iterations}`);
  console.log(`  Errors: ${autoFixResult.originalResult.errorCount} → ${autoFixResult.finalResult.errorCount}`);
  console.log(`  Fixes applied: ${autoFixResult.fixesApplied.length}`);
  
  // Show fixes
  for (const fix of autoFixResult.fixesApplied) {
    console.log(`    [${fix.iteration}] ${fix.type}: ${fix.description.substring(0, 100)}`);
  }

  // Show remaining errors
  if (autoFixResult.finalResult.errors?.length > 0) {
    console.log(`\n  Remaining errors:`);
    for (const err of autoFixResult.finalResult.errors.slice(0, 20)) {
      console.log(`    ${err.file}:${err.line} - ${err.message}`);
    }
  }

  // Save final files
  if (autoFixResult.finalFiles) {
    const fixedDir = join(OUTPUT_DIR, projName + '-fixed');
    mkdirSync(fixedDir, { recursive: true });
    for (const f of autoFixResult.finalFiles) {
      if (!f.path.includes('.')) continue;
      const fPath = join(fixedDir, f.path);
      mkdirSync(dirname(fPath), { recursive: true });
      writeFileSync(fPath, f.content, 'utf-8');
    }
    console.log(`\n  Final files saved to: ${fixedDir}`);
    console.log(`  Total files: ${autoFixResult.finalFiles.length}`);
    
    // Check for Envelope
    const envFile = autoFixResult.finalFiles.find((f: any) => f.path.includes('Envelope'));
    if (envFile) {
      console.log(`  Envelope stub found at: ${envFile.path}`);
    } else {
      console.log(`  ⚠️ NO Envelope stub found!`);
    }
    
    // Check imports in controller
    const controllerFile = autoFixResult.finalFiles.find((f: any) => f.path.includes('Controller'));
    if (controllerFile) {
      const envImport = controllerFile.content.split('\n').find((l: string) => l.includes('Envelope'));
      console.log(`  Controller Envelope import: ${envImport || 'NONE'}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
