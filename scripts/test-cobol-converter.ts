/**
 * Test E2E du converter COBOL → Spring Boot
 * Utilise les fichiers du stress test pour valider la conversion complète.
 */
import * as fs from "fs";
import * as path from "path";
import { CobolParser } from "../server/engine/cobol/CobolParser";
import { JclParser } from "../server/engine/cobol/JclParser";
import { CobolAnalyzer } from "../server/engine/cobol/CobolAnalyzer";
import { convertCobolToJava } from "../server/engine/cobol/converter/CobolToJavaConverter";

const STRESS_DIR = "/home/ubuntu/cobol-stress-test";
const OUTPUT_DIR = "/home/ubuntu/cobol-java-output";

// Clean output
if (fs.existsSync(OUTPUT_DIR)) fs.rmSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Read all files
const allFiles = fs.readdirSync(STRESS_DIR).filter(f => /\.(cbl|cob|cpy|jcl)$/i.test(f));
console.log(`\n=== COBOL → Java Converter E2E Test ===`);
console.log(`Input: ${allFiles.length} files from ${STRESS_DIR}\n`);

// Parse COBOL programs
const cobolParser = new CobolParser();
const jclParser = new JclParser();
const programs: any[] = [];
const jclJobs: any[] = [];
const copybookMap = new Map<string, string>();

// First pass: collect copybooks
for (const file of allFiles) {
  if (file.endsWith(".cpy")) {
    const content = fs.readFileSync(path.join(STRESS_DIR, file), "utf-8");
    const name = file.replace(/\.cpy$/i, "");
    copybookMap.set(name, content);
  }
}

// Second pass: parse programs
for (const file of allFiles) {
  const filePath = path.join(STRESS_DIR, file);
  const content = fs.readFileSync(filePath, "utf-8");

  if (file.endsWith(".jcl")) {
    const jobs = jclParser.parse(content);
    jclJobs.push(...jobs);
    console.log(`  JCL: ${file} → ${jobs.length} job(s)`);
  } else if (file.endsWith(".cbl") || file.endsWith(".cob")) {
    const ir = cobolParser.parse(content, copybookMap);
    programs.push(ir);
    console.log(`  CBL: ${file} → ${ir.dataItems?.length || 0} items, ${ir.sqlStatements?.length || 0} SQL, ${ir.sections?.length || 0} sections`);
  }
}

console.log(`\n--- Conversion ---`);
console.log(`Programs: ${programs.length}, JCL Jobs: ${jclJobs.length}\n`);

// Run conversion
const result = convertCobolToJava(programs, jclJobs, {
  basePackage: "com.bank.migration",
  projectName: "cobol-credit-migration",
  springBootVersion: "3.2.0",
  javaVersion: "17",
  useLombok: true,
});

// Write output files
for (const file of result.files) {
  const outPath = path.join(OUTPUT_DIR, file.path);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, file.content);
}

// Report
console.log(`=== Conversion Results ===`);
console.log(`  Total files generated: ${result.stats.totalFiles}`);
console.log(`  Models (DTOs):         ${result.stats.modelsGenerated}`);
console.log(`  Repositories:          ${result.stats.repositoriesGenerated}`);
console.log(`  Services:              ${result.stats.servicesGenerated}`);
console.log(`  Batch Jobs:            ${result.stats.batchJobsGenerated}`);
console.log(`  SQL converted:         ${result.stats.sqlStatementsConverted}`);
console.log(`  Cursors converted:     ${result.stats.cursorsConverted}`);
console.log(`  Warnings:              ${result.stats.warningsCount}`);

if (result.warnings.length > 0) {
  console.log(`\n--- Warnings ---`);
  for (const w of result.warnings) {
    console.log(`  ⚠️  ${w}`);
  }
}

// Validation tests
console.log(`\n=== Validation ===`);
let pass = 0;
let fail = 0;

function check(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

check("T01: At least 1 model generated", result.stats.modelsGenerated >= 1);
check("T02: At least 1 repository generated", result.stats.repositoriesGenerated >= 1);
check("T03: At least 1 service generated", result.stats.servicesGenerated >= 1);
check("T04: At least 1 batch job generated", result.stats.batchJobsGenerated >= 1);
check("T05: SQL statements converted > 0", result.stats.sqlStatementsConverted > 0);
check("T06: Cursors converted > 0", result.stats.cursorsConverted > 0);
check("T07: pom.xml generated", result.files.some(f => f.path === "pom.xml"));
check("T08: application.yml generated", result.files.some(f => f.path.includes("application.yml")));
check("T09: Application.java generated", result.files.some(f => f.path.includes("Application.java")));

// Check Java file quality
const serviceFiles = result.files.filter(f => f.type === "service");
const hasRealMethods = serviceFiles.some(f => f.content.includes("void ") && !f.content.includes("// TODO: Implement"));
check("T10: Services have real method bodies (not just TODOs)", hasRealMethods);

const repoFiles = result.files.filter(f => f.type === "repository");
const hasJdbcTemplate = repoFiles.some(f => f.content.includes("jdbcTemplate"));
check("T11: Repositories use JdbcTemplate", hasJdbcTemplate);

const batchFiles = result.files.filter(f => f.type === "batch");
const hasJobBuilder = batchFiles.some(f => f.content.includes("JobBuilder"));
check("T12: Batch configs use JobBuilder", hasJobBuilder);

const modelFiles = result.files.filter(f => f.type === "model");
const hasLombok = modelFiles.some(f => f.content.includes("@Data"));
check("T13: Models use Lombok @Data", hasLombok);

const pomFile = result.files.find(f => f.path === "pom.xml");
check("T14: pom.xml includes spring-boot-starter-batch", pomFile?.content.includes("spring-boot-starter-batch") || false);
check("T15: pom.xml includes spring-boot-starter-data-jpa", pomFile?.content.includes("spring-boot-starter-data-jpa") || false);

// Check no empty files
const emptyFiles = result.files.filter(f => f.content.trim().length < 50);
check("T16: No empty/trivial files", emptyFiles.length === 0);

// Check cursor reader generation
const hasCursorReader = repoFiles.some(f => f.content.includes("JdbcCursorItemReader"));
check("T17: Cursor → JdbcCursorItemReader", hasCursorReader);

console.log(`\n=== Summary: ${pass}/${pass + fail} PASS ===`);

// Show sample output
console.log(`\n--- Sample: Service file ---`);
if (serviceFiles.length > 0) {
  console.log(serviceFiles[0].content.substring(0, 800));
}

console.log(`\n--- Sample: Repository file ---`);
if (repoFiles.length > 0) {
  console.log(repoFiles[0].content.substring(0, 800));
}

console.log(`\n--- Output written to: ${OUTPUT_DIR} ---`);
console.log(`  ${result.files.map(f => f.path).join("\n  ")}`);
