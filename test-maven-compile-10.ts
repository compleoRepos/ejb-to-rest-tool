/**
 * Benchmark: Real Maven Compile on 10 GitHub projects.
 * Runs the full pipeline (analyze → generate → mvn compile) on each project.
 * Target: ≥7/10 PASS.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { compileWithMaven, MavenCompileResult } from "./server/engine/validation/RealMavenCompiler";
import { autoFixAndCompile, AutoFixResult } from "./server/engine/validation/CompileAutoFixer";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";

const PROJECTS_DIR = "/tmp/test-projects";

interface BenchmarkResult {
  projectName: string;
  javaFiles: number;
  loc: number;
  analyzeTimeMs: number;
  generateTimeMs: number;
  compileResult: MavenCompileResult;
  autoFixResult?: AutoFixResult;
  totalTimeMs: number;
}

function readJavaFiles(dir: string): SourceFile[] {
  const files: SourceFile[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (entry.endsWith(".java")) {
          files.push({ path: full.replace(dir + "/", ""), content: readFileSync(full, "utf-8") });
        }
      } catch {}
    }
  }
  walk(dir);
  return files;
}

async function benchmarkProject(projDir: string): Promise<BenchmarkResult> {
  const projName = projDir.split("/").pop()!.replace("proj-", "").replace(/^\d+-/, "");
  const javaFiles = readJavaFiles(projDir);
  const loc = javaFiles.reduce((sum, f) => sum + f.content.split("\n").length, 0);

  const engine = new CompleoEngine();

  // Analyze
  const t0 = Date.now();
  const analysisResult = await engine.analyze(javaFiles);
  const analyzeTimeMs = Date.now() - t0;

  // Generate
  const t1 = Date.now();
  const genResult = await engine.generate(
    analysisResult.ir,
    undefined, // no user choices
    undefined, // no ambiguities
    analysisResult.multiTech?.generatedFiles || []
  );
  const generateTimeMs = Date.now() - t1;

  // Get generated files
  const generatedFiles = genResult.files || [];

  // Maven compile with auto-fix
  const autoFixResult = autoFixAndCompile(generatedFiles, { timeout: 90000 });

  return {
    projectName: projName,
    javaFiles: javaFiles.length,
    loc,
    analyzeTimeMs,
    generateTimeMs,
    compileResult: autoFixResult.finalResult,
    autoFixResult,
    totalTimeMs: Date.now() - t0,
  };
}

async function main() {
  const dirs = readdirSync(PROJECTS_DIR)
    .filter(d => d.startsWith("proj-"))
    .sort()
    .map(d => join(PROJECTS_DIR, d));

  console.log(`\n${"=".repeat(80)}`);
  console.log(`  COMPLEO v12.7 — Real Maven Compile Benchmark (${dirs.length} projects)`);
  console.log(`${"=".repeat(80)}\n`);

  const results: BenchmarkResult[] = [];
  let passCount = 0;
  let failCount = 0;
  let staticCount = 0;

  for (const dir of dirs) {
    const projName = dir.split("/").pop()!;
    process.stdout.write(`  [${results.length + 1}/${dirs.length}] ${projName}... `);

    try {
      const result = await benchmarkProject(dir);
      results.push(result);

      if (result.compileResult.status === "PASS") passCount++;
      else if (result.compileResult.status === "FAIL") failCount++;
      else staticCount++;

      const icon = result.compileResult.status === "PASS" ? "✅" : result.compileResult.status === "FAIL" ? "❌" : "⚠️";
      console.log(`${icon} ${result.compileResult.status} (${result.compileResult.errorCount} errors, ${(result.compileResult.durationMs / 1000).toFixed(1)}s compile, ${(result.totalTimeMs / 1000).toFixed(1)}s total)`);
    } catch (err: any) {
      console.log(`💥 CRASH: ${err.message}`);
      results.push({
        projectName: projName,
        javaFiles: 0,
        loc: 0,
        analyzeTimeMs: 0,
        generateTimeMs: 0,
        compileResult: {
          status: "FAIL",
          exitCode: -1,
          errors: [{ file: "N/A", line: 0, message: err.message, severity: "error" }],
          warnings: [],
          warningCount: 0,
          errorCount: 1,
          durationMs: 0,
          dependenciesResolved: 0,
          dependenciesTotal: 0,
          method: "maven",
        },
        totalTimeMs: 0,
      });
      failCount++;
    }
  }

  // Summary
  console.log(`\n${"─".repeat(80)}`);
  console.log(`  RÉSULTATS: ${passCount} PASS / ${failCount} FAIL / ${staticCount} STATIC`);
  console.log(`  TAUX DE SUCCÈS: ${passCount}/${dirs.length} (${Math.round(passCount / dirs.length * 100)}%)`);
  console.log(`  CIBLE: ≥7/10 PASS → ${passCount >= 7 ? "✅ ATTEINTE" : "❌ NON ATTEINTE"}`);
  console.log(`${"─".repeat(80)}\n`);

  // Detailed table
  console.log(`  Projet                   Files   LOC     Status   Errors   Compile    Total`);
  console.log(`  ${'-'.repeat(75)}`);
  for (const r of results) {
    const status = r.compileResult.status;
    const name = r.projectName.padEnd(25);
    const files = String(r.javaFiles).padEnd(7);
    const loc = String(r.loc).padEnd(7);
    const st = status.padEnd(8);
    const errs = String(r.compileResult.errorCount).padEnd(8);
    const compile = ((r.compileResult.durationMs / 1000).toFixed(1) + 's').padEnd(10);
    const total = ((r.totalTimeMs / 1000).toFixed(1) + 's').padEnd(10);
    console.log(`  ${name} ${files} ${loc} ${st} ${errs} ${compile} ${total}`);
  }

  // Auto-fix summary
  const fixedProjects = results.filter(r => r.autoFixResult?.recoveredFromFail);
  if (fixedProjects.length > 0) {
    console.log(`\n  AUTO-FIX RÉCUPÉRÉS (${fixedProjects.length} projets):`);
    for (const fp of fixedProjects) {
      console.log(`\n  ${fp.projectName}: ${fp.autoFixResult!.originalResult.errorCount} → 0 erreurs (${fp.autoFixResult!.iterations} itérations)`);
      for (const fix of fp.autoFixResult!.fixesApplied) {
        console.log(`    [${fix.type}] ${fix.description}`);
      }
    }
  }

  // Error patterns for FAIL projects
  const failedProjects = results.filter(r => r.compileResult.status === "FAIL");
  if (failedProjects.length > 0) {
    console.log(`\n  ERREURS PAR PROJET FAIL:`);
    for (const fp of failedProjects) {
      const origErrors = fp.autoFixResult?.originalResult.errorCount || fp.compileResult.errorCount;
      console.log(`\n  ${fp.projectName} (${origErrors} → ${fp.compileResult.errorCount} errors):`);
      const topErrors = fp.compileResult.errors.slice(0, 5);
      for (const err of topErrors) {
        console.log(`    - ${err.file}:${err.line} → ${err.message}`);
      }
    }
  }

  // Write results to JSON
  const outputPath = "/tmp/maven-compile-results.json";
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n  Résultats sauvegardés: ${outputPath}`);
}

main().catch(console.error);
