/**
 * run-bnp-demo.ts — Execute SchemaReverseEngineer on the BNP Legacy Banking Demo project.
 * Produces glossary HTML/CSV/JSON + orphan detection + polysemy report.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { SchemaReverseEngineer } from "./server/engine/decoder/SchemaReverseEngineer";

const BNP_DIR = "/tmp/bnp-legacy-banking-demo";
const OUTPUT_DIR = "/tmp/bnp-output-v1313";

function collectFiles(dir: string, base: string = dir): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectFiles(full, base));
    } else if (entry.endsWith(".java") || entry.endsWith(".sql")) {
      files.push({
        path: relative(base, full),
        content: readFileSync(full, "utf-8"),
      });
    }
  }
  return files;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  BNP Legacy Banking Demo — Schema Reverse-Engineering v13.13");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Collect source files
  const sourceFiles = collectFiles(BNP_DIR);
  console.log(`Source files: ${sourceFiles.length}`);
  sourceFiles.forEach(f => console.log(`  - ${f.path}`));

  // Run SchemaReverseEngineer
  console.log("\n▶ Running SchemaReverseEngineer (useLlm=false)...\n");
  const t0 = Date.now();
  const engine = new SchemaReverseEngineer({ useLlm: false, projectName: "bnp-legacy-banking-demo" });
  const result = await engine.analyze(sourceFiles);
  const elapsed = Date.now() - t0;

  // ─── Field Usage Stats ─────────────────────────────────────────────
  const fua = result.fieldUsageAnalysis;
  console.log("═══ Field Usage Analysis ═══");
  console.log(`  Total fields detected: ${fua.fields.length}`);
  const totalUsages = fua.fields.reduce((s, f) => s + f.totalUsages, 0);
  console.log(`  Total usages: ${totalUsages}`);
  console.log(`  Tables: ${fua.tables.size}`);
  console.log(`  Execution time: ${fua.executionTimeMs}ms`);
  console.log();

  // ─── Semantic Inference Stats ──────────────────────────────────────
  const si = result.semanticInference;
  console.log("═══ Semantic Inference ═══");
  console.log(`  Total fields: ${si.stats.total}`);
  console.log(`  High confidence (≥80%): ${si.stats.high}`);
  console.log(`  Medium confidence (50-80%): ${si.stats.medium}`);
  console.log(`  Low confidence (<50%): ${si.stats.low}`);
  console.log(`  Unresolved: ${si.stats.unresolved}`);
  const avgConf = si.fields.length > 0
    ? si.fields.reduce((s, f) => s + f.confidenceScore, 0) / si.fields.length
    : 0;
  console.log(`  Average confidence: ${avgConf.toFixed(1)}%`);
  console.log();

  // Print each field inference
  console.log("  ┌───────────────────┬──────────────────┬─────────────────────────────────────┬───────┬─────────┐");
  console.log("  │ Field             │ Table            │ Business Meaning (FR)               │ Conf  │ Usages  │");
  console.log("  ├───────────────────┼──────────────────┼─────────────────────────────────────┼───────┼─────────┤");
  for (const inf of si.fields) {
    const field = inf.dbColumn.padEnd(17);
    const table = (inf.tableName || "?").padEnd(16);
    const meaning = (inf.businessNameFr || '?').substring(0, 35).padEnd(35);
    const conf = `${inf.confidenceScore.toFixed(0)}%`.padStart(5);
    const usages = String(inf.usageCount || 0).padStart(7);
    console.log(`  │ ${field} │ ${table} │ ${meaning} │ ${conf} │ ${usages} │`);
  }
  console.log("  └───────────────────┴──────────────────┴─────────────────────────────────────┴───────┴─────────┘");
  console.log();

  // ─── Orphan Detection ──────────────────────────────────────────────
  const od = result.orphanDetection;
  console.log("═══ Orphan Detection ═══");
  console.log(`  Total orphans: ${od.orphans.length}`);
  console.log(`  Dead fields: ${od.stats.deadFields}`);
  console.log(`  Write-only: ${od.stats.writeOnlyFields}`);
  console.log(`  Read-only: ${od.stats.readOnlyFields}`);
  console.log(`  Single-ref: ${od.stats.singleRefFields}`);
  console.log(`  Low-confidence: ${od.stats.lowConfidenceFields}`);
  console.log(`  Health score: ${od.stats.healthScore}%`);
  if (od.orphans.length > 0) {
    console.log("\n  ☠️  Orphan fields:");
    for (const o of od.orphans) {
      console.log(`    - ${o.dbColumn} (${o.tableName}) : ${o.category} [${o.severity}] — ${o.recommendation}`);
    }
  }
  console.log();

  // ─── Glossary Stats ────────────────────────────────────────────────
  const gl = result.glossary;
  console.log("═══ Glossary ═══");
  console.log(`  Total entries: ${gl.stats.totalEntries}`);
  console.log(`  High confidence: ${gl.stats.highConfidence}`);
  console.log(`  Medium confidence: ${gl.stats.mediumConfidence}`);
  console.log(`  Low confidence: ${gl.stats.lowConfidence}`);
  console.log(`  Unresolved: ${gl.stats.unresolved}`);
  console.log(`  Orphans: ${gl.stats.orphans}`);
  console.log(`  Domains: ${gl.stats.domains.join(", ")}`);
  console.log(`  Tables: ${gl.stats.tables.join(", ")}`);
  console.log();

  // ─── Write output files ────────────────────────────────────────────
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(join(OUTPUT_DIR, ".compleo"), { recursive: true });

  writeFileSync(join(OUTPUT_DIR, ".compleo", "glossary.html"), gl.html);
  writeFileSync(join(OUTPUT_DIR, ".compleo", "glossary.csv"), gl.csv);
  writeFileSync(join(OUTPUT_DIR, ".compleo", "glossary.json"), gl.json);
  writeFileSync(join(OUTPUT_DIR, ".compleo", "orphan-fields.json"), JSON.stringify({
    totalOrphans: od.orphans.length,
    healthScore: od.stats.healthScore,
    orphans: od.orphans,
  }, null, 2));
  writeFileSync(join(OUTPUT_DIR, ".compleo", "schema-reverse-result.json"), JSON.stringify({
    fieldUsageAnalysis: {
      totalFields: fua.fields.length,
      totalUsages,
      tables: Array.from(fua.tables.keys()),
      executionTimeMs: fua.executionTimeMs,
    },
    semanticInference: {
      stats: si.stats,
      averageConfidence: avgConf,
      fields: si.fields,
    },
    orphanDetection: {
      stats: od.stats,
      orphans: od.orphans,
    },
    glossary: {
      stats: gl.stats,
    },
    executionTimeMs: result.executionTimeMs,
  }, null, 2));

  // Copy source files to output
  for (const f of sourceFiles) {
    const outPath = join(OUTPUT_DIR, f.path);
    mkdirSync(join(outPath, ".."), { recursive: true });
    writeFileSync(outPath, f.content);
  }
  // Copy README
  writeFileSync(join(OUTPUT_DIR, "README.md"), readFileSync(join(BNP_DIR, "README.md"), "utf-8"));

  console.log("═══ Output ═══");
  console.log(`  Directory: ${OUTPUT_DIR}`);
  console.log(`  Glossary HTML: .compleo/glossary.html`);
  console.log(`  Glossary CSV:  .compleo/glossary.csv`);
  console.log(`  Glossary JSON: .compleo/glossary.json`);
  console.log(`  Orphan fields: .compleo/orphan-fields.json`);
  console.log(`  Full result:   .compleo/schema-reverse-result.json`);
  console.log(`\n  Elapsed: ${elapsed}ms`);

  // ─── Validation against ground truth ───────────────────────────────
  console.log("\n═══ Validation vs Ground Truth ═══");
  
  const highConfFields = si.fields.filter(f => f.confidenceScore >= 80);
  const orphanFields = od.orphans;
  
  const targetHighConf = 12; // out of ~23 total fields
  const targetOrphans = 5;
  
  const passHighConf = highConfFields.length >= targetHighConf;
  const passOrphans = orphanFields.length >= targetOrphans;
  
  console.log(`  High-confidence fields (≥80%): ${highConfFields.length} (target ≥${targetHighConf}) ${passHighConf ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`  Orphans detected: ${orphanFields.length} (target ≥${targetOrphans}) ${passOrphans ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`\n  Overall: ${passHighConf && passOrphans ? "✓ ALL PASS" : "✗ SOME FAILURES"}`);

  // ─── Save validation summary for the report ────────────────────────
  writeFileSync(join(OUTPUT_DIR, ".compleo", "validation-summary.json"), JSON.stringify({
    highConfidenceFields: highConfFields.length,
    targetHighConf,
    passHighConf,
    orphansDetected: orphanFields.length,
    targetOrphans,
    passOrphans,
    averageConfidence: avgConf,
    totalFields: si.stats.total,
    totalUsages,
    tablesDetected: fua.tables.size,
    executionTimeMs: elapsed,
  }, null, 2));
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
