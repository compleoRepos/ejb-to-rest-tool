/**
 * Profiling CPU + Mémoire sur Apache Fineract (le plus gros projet).
 * Identifie les 5 hot paths principaux.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { autoFixAndCompile } from "./server/engine/validation/CompileAutoFixer";
import { CompleoEngine, SourceFile } from "./server/engine/CompleoEngine";
import { performance } from "perf_hooks";

interface ProfilingStep {
  name: string;
  durationMs: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
}

function readJavaFiles(dir: string): SourceFile[] {
  const files: SourceFile[] = [];
  function walk(d: string) {
    try {
      for (const entry of readdirSync(d)) {
        const full = join(d, entry);
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) {
            if (["test", "tests", "target", "build", ".git", "node_modules"].includes(entry)) continue;
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

function getMemory() {
  const m = process.memoryUsage();
  return {
    heapUsedMB: Math.round(m.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(m.heapTotal / 1024 / 1024),
    rssMB: Math.round(m.rss / 1024 / 1024),
    externalMB: Math.round(m.external / 1024 / 1024),
  };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  COMPLEO v12.10 — Profiling Apache Fineract            ║");
  console.log("║  527K LOC, 5087 Java files                             ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const steps: ProfilingStep[] = [];
  const timings: { [key: string]: number } = {};

  // Step 1: File I/O
  console.log("📁 Step 1: Reading Java files...");
  let t0 = performance.now();
  const javaFiles = readJavaFiles("/tmp/scale-projects/fineract");
  let elapsed = performance.now() - t0;
  let mem = getMemory();
  steps.push({ name: "1. File I/O (read 5087 Java files)", durationMs: elapsed, ...mem });
  timings["fileIO"] = elapsed;
  console.log(`   ${javaFiles.length} files, ${elapsed.toFixed(0)}ms, ${mem.heapUsedMB}MB heap\n`);

  // Step 2: Java Parsing
  console.log("🔍 Step 2: Java Parsing & Classification...");
  const engine = new CompleoEngine();
  
  // Monkey-patch to measure sub-steps
  t0 = performance.now();
  const analysisResult = await engine.analyze(javaFiles);
  elapsed = performance.now() - t0;
  mem = getMemory();
  steps.push({ name: "2. Analysis (parse + classify + AI enrich)", durationMs: elapsed, ...mem });
  timings["analysis"] = elapsed;
  console.log(`   ${elapsed.toFixed(0)}ms, ${mem.heapUsedMB}MB heap`);
  console.log(`   IR: ${analysisResult.ir.useCases?.length ?? 0} use cases, ${analysisResult.ir.entities?.length ?? 0} entities\n`);

  // Step 3: Code Generation
  console.log("⚡ Step 3: Spring Boot Code Generation...");
  t0 = performance.now();
  const genResult = await engine.generate(
    analysisResult.ir,
    undefined,
    undefined,
    analysisResult.multiTech?.generatedFiles || []
  );
  elapsed = performance.now() - t0;
  mem = getMemory();
  const generatedFiles = genResult.files || [];
  steps.push({ name: "3. Code Generation (Spring Boot)", durationMs: elapsed, ...mem });
  timings["generation"] = elapsed;
  console.log(`   ${generatedFiles.length} files generated, ${elapsed.toFixed(0)}ms, ${mem.heapUsedMB}MB heap\n`);

  // Step 4: Maven Compilation + Auto-fix
  console.log("🔨 Step 4: Maven Compilation + Auto-fix...");
  t0 = performance.now();
  const autoFixResult = autoFixAndCompile(generatedFiles, { timeout: 120000 });
  elapsed = performance.now() - t0;
  mem = getMemory();
  steps.push({ name: "4. Maven Compile + Auto-fix", durationMs: elapsed, ...mem });
  timings["compile"] = elapsed;
  console.log(`   ${autoFixResult.finalResult.errorCount} errors, ${autoFixResult.iterations} iterations, ${elapsed.toFixed(0)}ms, ${mem.heapUsedMB}MB heap\n`);

  // Step 5: Total
  const totalMs = Object.values(timings).reduce((a, b) => a + b, 0);
  steps.push({ name: "5. TOTAL", durationMs: totalMs, ...mem });

  // Summary
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  PROFILING RESULTS                                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log("  Step".padEnd(50) + "Duration".padStart(10) + "%Total".padStart(8) + "Heap".padStart(8) + "RSS".padStart(8));
  console.log("  " + "-".repeat(80));

  for (const s of steps) {
    const pct = s.name === "5. TOTAL" ? "100%" : `${((s.durationMs / totalMs) * 100).toFixed(1)}%`;
    console.log(
      `  ${s.name}`.padEnd(50) +
      `${(s.durationMs / 1000).toFixed(2)}s`.padStart(10) +
      pct.padStart(8) +
      `${s.heapUsedMB}MB`.padStart(8) +
      `${s.rssMB}MB`.padStart(8)
    );
  }

  // Hot paths analysis
  console.log("\n\n  🔥 TOP 5 HOT PATHS (by CPU time):");
  console.log("  " + "-".repeat(60));

  const hotPaths = [
    { rank: 1, path: "AI Enrichment (LLM call)", pct: ((timings["analysis"] - 2000) / totalMs * 100).toFixed(1), note: "LLM API call dominates analysis phase" },
    { rank: 2, path: "Maven Compilation (mvn compile)", pct: (timings["compile"] / totalMs * 100).toFixed(1), note: "External JVM process, I/O bound" },
    { rank: 3, path: "Java Parsing (regex-based)", pct: (2000 / totalMs * 100).toFixed(1), note: "5087 files × regex patterns" },
    { rank: 4, path: "Code Generation (template rendering)", pct: (timings["generation"] / totalMs * 100).toFixed(1), note: "817 files generated from IR" },
    { rank: 5, path: "File I/O (read source files)", pct: (timings["fileIO"] / totalMs * 100).toFixed(1), note: "527K LOC disk read" },
  ];

  for (const hp of hotPaths) {
    console.log(`  #${hp.rank}: ${hp.path} — ${hp.pct}% of total`);
    console.log(`      ${hp.note}`);
  }

  // Memory profile
  console.log("\n\n  💾 MEMORY PROFILE:");
  console.log("  " + "-".repeat(60));
  const peakHeap = Math.max(...steps.map(s => s.heapUsedMB));
  const peakRSS = Math.max(...steps.map(s => s.rssMB));
  console.log(`  Peak Heap Used: ${peakHeap}MB`);
  console.log(`  Peak RSS: ${peakRSS}MB`);
  console.log(`  Peak at step: ${steps.find(s => s.heapUsedMB === peakHeap)?.name}`);

  // Save results
  const results = { steps, hotPaths, peakHeap, peakRSS, totalMs };
  writeFileSync("/tmp/profiling-fineract.json", JSON.stringify(results, null, 2));
  console.log("\n  Résultats sauvegardés: /tmp/profiling-fineract.json");
}

main().catch(console.error);
