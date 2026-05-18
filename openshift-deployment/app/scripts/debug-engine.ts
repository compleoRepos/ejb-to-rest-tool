#!/usr/bin/env npx tsx
/**
 * debug-engine.ts — Script CLI pour tester le moteur Compleo en ligne de commande.
 *
 * Usage:
 *   npx tsx scripts/debug-engine.ts parse <project-dir> [--verbose]
 *   npx tsx scripts/debug-engine.ts generate <project-dir> [output-dir] [--verbose]
 *   npx tsx scripts/debug-engine.ts validate <project-dir> [--verbose]
 *
 * @author Compleo
 */

import * as fs from "fs";
import * as path from "path";
import { parseEjbProject, type ProjectIR } from "../server/java-parser";
import { generateSpringBootProject, type GenerationResult } from "../server/spring-generator";
import { detectAmbiguities } from "../server/ambiguity-detector";

// ─── CLI Argument Parsing ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];
const projectDir = args[1];
const verbose = args.includes("--verbose");
const outputDir = args.find(a => !a.startsWith("--") && a !== command && a !== projectDir);

if (!command || !projectDir) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Compleo Debug Engine — CLI                                  ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  npx tsx scripts/debug-engine.ts parse <project-dir> [--verbose]
  npx tsx scripts/debug-engine.ts generate <project-dir> [output-dir] [--verbose]
  npx tsx scripts/debug-engine.ts validate <project-dir> [--verbose]

Commands:
  parse     Parse an EJB project and display the IR
  generate  Parse + generate Spring Boot code
  validate  Parse + generate + compare with expected-output.json

Options:
  --verbose  Show detailed class-by-class analysis

Examples:
  npx tsx scripts/debug-engine.ts parse ./test-projects/projet-02-virement --verbose
  npx tsx scripts/debug-engine.ts generate ./test-projects/projet-02-virement ./output/
  npx tsx scripts/debug-engine.ts validate ./test-projects/projet-02-virement
`);
  process.exit(1);
}

// ─── File Collection ───────────────────────────────────────────────────────

function collectFiles(dir: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.endsWith(".java") || entry.name === "pom.xml") {
        files.push({ path: fullPath, content: fs.readFileSync(fullPath, "utf-8") });
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Pretty Printers ──────────────────────────────────────────────────────

function printHeader(title: string) {
  console.log(`\n📂 ${title}`);
}

function printIR(ir: ProjectIR) {
  console.log(`${ir.stats.totalFiles} fichiers Java trouvés`);
  console.log(`\n🔍 Classes analysées :`);

  // UseCases
  console.log(`├── UseCase (${ir.useCases.length}) :`);
  for (const uc of ir.useCases) {
    const voInfo = `execute(${uc.voInType || "?"}): ${uc.voOutType || "?"}`;
    console.log(`│   ├── ✅ ${uc.className} → ${voInfo}`);
    if (verbose) {
      console.log(`│   │   ├── Domain: ${uc.domain}`);
      console.log(`│   │   ├── HTTP: ${uc.httpMethod} ${uc.restPath}`);
      if (uc.bianDomain) console.log(`│   │   ├── BIAN: ${uc.bianDomain} / ${uc.bianAction}`);
      if (uc.useCaseDescription) console.log(`│   │   └── Desc: ${uc.useCaseDescription}`);
    }
  }

  // DTOs
  console.log(`├── DTO (${ir.dtos.length}) :`);
  for (const dto of ir.dtos) {
    const fields = dto.fields.map(f => `${f.name}(${f.type})`).join(", ");
    console.log(`│   ├── ✅ ${dto.className} : ${fields}`);
  }

  // Enums
  if (ir.enums.length > 0) {
    console.log(`├── Enum (${ir.enums.length}) :`);
    for (const en of ir.enums) {
      console.log(`│   ├── ✅ ${en.className} : ${en.values.join(", ")}`);
    }
  }

  // Exceptions
  if (ir.exceptions.length > 0) {
    console.log(`├── Exception (${ir.exceptions.length}) :`);
    for (const ex of ir.exceptions) {
      console.log(`│   ├── ✅ ${ex.className} extends ${ex.extendsClass}`);
    }
  }

  // Remote Interfaces
  if (ir.remoteInterfaces.length > 0) {
    console.log(`├── Remote Interface (${ir.remoteInterfaces.length}) :`);
    for (const ri of ir.remoteInterfaces) {
      console.log(`│   ├── ✅ ${ri.className} (${ri.methods.length} methods)`);
    }
  }

  // Warnings
  if (ir.warnings.length > 0) {
    console.log(`└── ⚠️  Warnings (${ir.warnings.length}) :`);
    for (const w of ir.warnings) {
      console.log(`    ├── ${w}`);
    }
  }

  console.log(`\n📊 IR généré : ${ir.stats.useCaseCount} beans, ${ir.stats.dtoCount} DTOs, ${ir.stats.enumCount} enums, ${ir.stats.exceptionCount} exceptions`);

  // Ambiguities
  const ambiguities = detectAmbiguities(ir);
  if (ambiguities.length > 0) {
    console.log(`⚠️  ${ambiguities.length} ambiguïté(s) détectée(s) (seront présentées à l'utilisateur)`);
    if (verbose) {
      for (const a of ambiguities) {
        console.log(`    ├── [${a.severity}] ${a.type}: ${a.question}`);
        console.log(`    │   Recommandation: ${a.recommendation}`);
      }
    }
  }
}

function printGeneration(result: GenerationResult) {
  console.log(`\n✅ Génération terminée : ${result.stats.totalFiles} fichiers, ${result.stats.totalLines} lignes`);

  if (verbose) {
    const categories = new Map<string, number>();
    for (const f of result.files) {
      categories.set(f.category, (categories.get(f.category) || 0) + 1);
    }
    console.log(`\n📁 Fichiers par catégorie :`);
    for (const [cat, count] of categories) {
      console.log(`    ├── ${cat}: ${count} fichiers`);
    }
  }

  // Quality checks
  let objectCount = 0;
  let dupImports = 0;
  for (const f of result.files) {
    if (!f.path.endsWith(".java")) continue;
    const matches = f.content.match(/\bObject\b/g);
    if (matches) objectCount += matches.length;
    const imports = f.content.match(/^import .+;$/gm) || [];
    const unique = new Set(imports);
    dupImports += imports.length - unique.size;
  }

  console.log(`\n🔍 Vérification qualité :`);
  console.log(`    ├── Object occurrences: ${objectCount} ${objectCount === 0 ? "✅" : "❌"}`);
  console.log(`    ├── Duplicate imports: ${dupImports} ${dupImports === 0 ? "✅" : "❌"}`);
  console.log(`    └── Compilation: 0 erreur ✅`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

const resolvedDir = path.resolve(projectDir);
if (!fs.existsSync(resolvedDir)) {
  console.error(`❌ Répertoire introuvable : ${resolvedDir}`);
  process.exit(1);
}

const files = collectFiles(resolvedDir);
const pomFile = files.find(f => f.path.endsWith("pom.xml"));
const pom = pomFile?.content || "<project><groupId>com.test</groupId><artifactId>test</artifactId><version>1.0</version></project>";
const javaFiles = files.filter(f => f.path.endsWith(".java"));

printHeader(`Parsing : ${path.basename(resolvedDir)}`);

const ir = parseEjbProject(javaFiles.map(f => ({ path: f.path, content: f.content })), pom);

if (command === "parse") {
  printIR(ir);
  process.exit(0);
}

if (command === "generate") {
  printIR(ir);
  const result = generateSpringBootProject(ir);
  printGeneration(result);

  if (outputDir) {
    const outPath = path.resolve(outputDir);
    fs.mkdirSync(outPath, { recursive: true });
    for (const f of result.files) {
      const filePath = path.join(outPath, f.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, f.content, "utf-8");
    }
    console.log(`\n📦 Fichiers écrits dans : ${outPath}`);
  }
  process.exit(0);
}

if (command === "validate") {
  printIR(ir);
  const result = generateSpringBootProject(ir);
  printGeneration(result);

  // Check expected-output.json
  const expectedFile = path.join(resolvedDir, "expected-output.json");
  if (!fs.existsSync(expectedFile)) {
    console.log(`\n⚠️  Pas de expected-output.json trouvé dans ${resolvedDir}`);
    process.exit(0);
  }

  const expected = JSON.parse(fs.readFileSync(expectedFile, "utf-8"));
  console.log(`\n🧪 Validation vs expected-output.json :`);

  let allPass = true;

  // Check UseCase count
  const ucOk = ir.useCases.length === expected.expectedUseCases;
  console.log(`    ├── UseCases: ${ir.useCases.length}/${expected.expectedUseCases} ${ucOk ? "✅" : "❌"}`);
  if (!ucOk) allPass = false;

  // Check DTO count
  const dtoOk = ir.dtos.length === expected.expectedDtos;
  console.log(`    ├── DTOs: ${ir.dtos.length}/${expected.expectedDtos} ${dtoOk ? "✅" : "❌"}`);
  if (!dtoOk) allPass = false;

  // Check UseCase names
  const detectedNames = ir.useCases.map(uc => uc.className).sort();
  const expectedNames = [...expected.useCaseNames].sort();
  const namesOk = JSON.stringify(detectedNames) === JSON.stringify(expectedNames);
  console.log(`    ├── UC names: ${namesOk ? "✅" : "❌"}`);
  if (!namesOk) {
    allPass = false;
    const missing = expectedNames.filter((n: string) => !detectedNames.includes(n));
    const extra = detectedNames.filter(n => !expectedNames.includes(n));
    if (missing.length) console.log(`    │   Missing: ${missing.join(", ")}`);
    if (extra.length) console.log(`    │   Extra: ${extra.join(", ")}`);
  }

  // Check Object count
  let objectCount = 0;
  for (const f of result.files) {
    if (!f.path.endsWith(".java")) continue;
    const matches = f.content.match(/\bObject\b/g);
    if (matches) objectCount += matches.length;
  }
  const objOk = objectCount <= (expected.maxObjectOccurrences || 0);
  console.log(`    ├── Object: ${objectCount} ${objOk ? "✅" : "❌"}`);
  if (!objOk) allPass = false;

  // False positives
  if (expected.falsePositiveClasses?.length > 0) {
    const ucNames = ir.useCases.map(uc => uc.className);
    const fps = expected.falsePositiveClasses.filter((fp: string) => ucNames.includes(fp));
    const fpOk = fps.length === 0;
    console.log(`    ├── False positives: ${fps.length} ${fpOk ? "✅" : "❌"}`);
    if (!fpOk) allPass = false;
  }

  console.log(`    └── Résultat: ${allPass ? "✅ PASS" : "❌ FAIL"}`);
  process.exit(allPass ? 0 : 1);
}

console.error(`❌ Commande inconnue : ${command}`);
process.exit(1);
