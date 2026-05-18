/**
 * Scale-Up Benchmark: Test COMPLEO on 3 large open-source projects.
 * - Apache Roller (~98K LOC)
 * - jPOS (~175K LOC)
 * - Apache Fineract (~194K LOC)
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { autoFixAndCompile, AutoFixResult } from "./server/engine/validation/CompileAutoFixer";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";

interface ScaleResult {
  projectName: string;
  url: string;
  commitHash: string;
  javaFiles: number;
  loc: number;
  analyzeTimeMs: number;
  generateTimeMs: number;
  compileTimeMs: number;
  totalTimeMs: number;
  generatedFiles: number;
  compileErrors: number;
  compileStatus: string;
  peakMemoryMB: number;
  crashed: boolean;
  crashError?: string;
}

const PROJECTS = [
  {
    name: "Apache Roller",
    dir: "/tmp/scale-projects/roller",
    url: "https://github.com/apache/roller",
    commit: "db3915a",
  },
  {
    name: "jPOS",
    dir: "/tmp/scale-projects/jPOS",
    url: "https://github.com/jpos/jPOS",
    commit: "f581f39",
  },
  {
    name: "Apache Fineract",
    dir: "/tmp/scale-projects/fineract",
    url: "https://github.com/apache/fineract",
    commit: "800f6b0",
  },
];

function readJavaFiles(dir: string): SourceFile[] {
  const files: SourceFile[] = [];
  function walk(d: string) {
    try {
      for (const entry of readdirSync(d)) {
        const full = join(d, entry);
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) {
            // Skip test directories and build directories
            if (entry === "test" || entry === "tests" || entry === "target" || entry === "build" || entry === ".git" || entry === "node_modules") continue;
            walk(full);
          } else if (entry.endsWith(".java")) {
            files.push({ path: full.replace(dir + "/", ""), content: readFileSync(full, "utf-8") });
          }
        } catch {}
      }
    } catch {}
  }
  walk(dir);
  return files;
}

function getMemoryUsageMB(): number {
  const usage = process.memoryUsage();
  return Math.round(usage.heapUsed / 1024 / 1024);
}

async function benchmarkProject(proj: typeof PROJECTS[0]): Promise<ScaleResult> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Processing: ${proj.name}`);
  console.log(`  URL: ${proj.url}`);
  console.log(`  Commit: ${proj.commit}`);
  console.log(`${"=".repeat(60)}`);

  let peakMemory = getMemoryUsageMB();

  try {
    // Read Java files
    console.log("  Reading Java files...");
    const javaFiles = readJavaFiles(proj.dir);
    const loc = javaFiles.reduce((sum, f) => sum + f.content.split("\n").length, 0);
    console.log(`  Found ${javaFiles.length} Java files (${loc.toLocaleString()} LOC)`);

    peakMemory = Math.max(peakMemory, getMemoryUsageMB());

    // Analyze
    console.log("  Analyzing...");
    const engine = new CompleoEngine();
    const t0 = Date.now();
    const analysisResult = await engine.analyze(javaFiles);
    const analyzeTimeMs = Date.now() - t0;
    console.log(`  Analysis complete in ${(analyzeTimeMs / 1000).toFixed(1)}s`);

    peakMemory = Math.max(peakMemory, getMemoryUsageMB());

    // Generate
    console.log("  Generating Spring Boot code...");
    const t1 = Date.now();
    const genResult = await engine.generate(
      analysisResult.ir,
      undefined,
      undefined,
      analysisResult.multiTech?.generatedFiles || []
    );
    const generateTimeMs = Date.now() - t1;
    const generatedFiles = genResult.files || [];
    console.log(`  Generated ${generatedFiles.length} files in ${(generateTimeMs / 1000).toFixed(1)}s`);

    peakMemory = Math.max(peakMemory, getMemoryUsageMB());

    // Maven compile with auto-fix
    console.log("  Compiling with Maven (+ auto-fix)...");
    const t2 = Date.now();
    const autoFixResult = autoFixAndCompile(generatedFiles, { timeout: 120000 });
    const compileTimeMs = Date.now() - t2;
    console.log(`  Compile: ${autoFixResult.finalResult.status} (${autoFixResult.finalResult.errorCount} errors) in ${(compileTimeMs / 1000).toFixed(1)}s`);

    peakMemory = Math.max(peakMemory, getMemoryUsageMB());

    const result: ScaleResult = {
      projectName: proj.name,
      url: proj.url,
      commitHash: proj.commit,
      javaFiles: javaFiles.length,
      loc,
      analyzeTimeMs,
      generateTimeMs,
      compileTimeMs,
      totalTimeMs: Date.now() - t0,
      generatedFiles: generatedFiles.length,
      compileErrors: autoFixResult.finalResult.errorCount,
      compileStatus: autoFixResult.finalResult.status,
      peakMemoryMB: peakMemory,
      crashed: false,
    };

    console.log(`  ✅ Completed: ${proj.name} (${(result.totalTimeMs / 1000).toFixed(1)}s total, ${peakMemory}MB peak)`);
    return result;

  } catch (error: any) {
    console.error(`  ❌ CRASHED: ${proj.name} — ${error.message}`);
    return {
      projectName: proj.name,
      url: proj.url,
      commitHash: proj.commit,
      javaFiles: 0,
      loc: 0,
      analyzeTimeMs: 0,
      generateTimeMs: 0,
      compileTimeMs: 0,
      totalTimeMs: 0,
      generatedFiles: 0,
      compileErrors: -1,
      compileStatus: "CRASH",
      peakMemoryMB: peakMemory,
      crashed: true,
      crashError: error.message,
    };
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  COMPLEO v12.10 — Scale-Up Benchmark                   ║");
  console.log("║  3 Open-Source Projects                                 ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const results: ScaleResult[] = [];

  for (const proj of PROJECTS) {
    const result = await benchmarkProject(proj);
    results.push(result);
    // Force GC between projects
    if (global.gc) global.gc();
  }

  // Summary
  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  SCALE-UP RESULTS                                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const header = "  Projet".padEnd(22) +
    "LOC".padStart(10) +
    "Files".padStart(8) +
    "Gen".padStart(6) +
    "Status".padStart(8) +
    "Errors".padStart(8) +
    "Analyze".padStart(10) +
    "Generate".padStart(10) +
    "Compile".padStart(10) +
    "Total".padStart(10) +
    "Memory".padStart(10);
  console.log(header);
  console.log("  " + "-".repeat(header.length - 2));

  for (const r of results) {
    const line = `  ${r.projectName}`.padEnd(22) +
      `${r.loc.toLocaleString()}`.padStart(10) +
      `${r.javaFiles}`.padStart(8) +
      `${r.generatedFiles}`.padStart(6) +
      `${r.compileStatus}`.padStart(8) +
      `${r.compileErrors}`.padStart(8) +
      `${(r.analyzeTimeMs / 1000).toFixed(1)}s`.padStart(10) +
      `${(r.generateTimeMs / 1000).toFixed(1)}s`.padStart(10) +
      `${(r.compileTimeMs / 1000).toFixed(1)}s`.padStart(10) +
      `${(r.totalTimeMs / 1000).toFixed(1)}s`.padStart(10) +
      `${r.peakMemoryMB}MB`.padStart(10);
    console.log(line);
  }

  // Save results
  writeFileSync("/tmp/scale-up-results.json", JSON.stringify(results, null, 2));
  console.log("\n  Résultats sauvegardés: /tmp/scale-up-results.json");
}

main().catch(console.error);
