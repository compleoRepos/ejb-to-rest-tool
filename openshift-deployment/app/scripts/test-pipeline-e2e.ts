/**
 * Test end-to-end du pipeline Compleo sur des projets réels.
 * Usage: npx tsx scripts/test-pipeline-e2e.ts
 */
import { CompleoEngine, getEngine, type SourceFile } from "../server/engine/CompleoEngine";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadProjectFiles(projectDir: string): SourceFile[] {
  const resolvedDir = path.isAbsolute(projectDir) ? projectDir : path.resolve(PROJECT_ROOT, projectDir);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Project not found: ${resolvedDir}`);
  }
  const files: SourceFile[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".java") || entry.name.endsWith(".jsp") || entry.name.endsWith(".xml") || entry.name.endsWith(".properties")) {
        files.push({
          path: path.relative(resolvedDir, fullPath),
          content: fs.readFileSync(fullPath, "utf-8"),
        });
      }
    }
  }
  walk(resolvedDir);
  return files;
}

function separator(title: string) {
  console.log("\n" + "═".repeat(80));
  console.log(`  ${title}`);
  console.log("═".repeat(80));
}

function subsection(title: string) {
  console.log(`\n  ── ${title} ${"─".repeat(60 - title.length)}`);
}

// ─── Analyse d'un projet ──────────────────────────────────────────────────────

async function analyzeProject(engine: CompleoEngine, projectPath: string, projectName: string) {
  separator(`PROJET: ${projectName}`);
  
  // 1. Charger les fichiers
  const files = loadProjectFiles(projectPath);
  const javaFiles = files.filter(f => f.path.endsWith(".java"));
  const xmlFiles = files.filter(f => f.path.endsWith(".xml"));
  console.log(`  Fichiers chargés: ${files.length} total (${javaFiles.length} Java, ${xmlFiles.length} XML)`);
  
  // 2. Analyser
  subsection("PHASE 1: Analyse (engine.analyze)");
  const pomFile = files.find(f => f.path === "pom.xml" || f.path.endsWith("/pom.xml"));
  const startAnalyze = Date.now();
  const analysisResult = await engine.analyze(files, {
    pomXml: pomFile?.content,
    projectName,
  });
  const analyzeTime = Date.now() - startAnalyze;
  
  const { ir, summary, multiTech } = analysisResult;
  console.log(`  Temps d'analyse: ${analyzeTime}ms`);
  console.log(`  UseCases détectés: ${summary.useCaseCount}`);
  console.log(`  DTOs détectés: ${summary.dtoCount}`);
  console.log(`  Technologies: ${multiTech?.technologiesDetected?.join(", ") || "N/A"}`);
  
  // Détails des UseCases
  subsection("UseCases détectés");
  if (ir.useCases && ir.useCases.length > 0) {
    for (const uc of ir.useCases) {
      const domain = (uc as any).domain || "N/A";
      const handler = (uc as any).isFromHandlerPattern ? " [HANDLER]" : "";
      console.log(`    • ${uc.className} → ${uc.ejbType || "N/A"} | voIn=${uc.voInType || "∅"} voOut=${uc.voOutType || "∅"} | domain=${domain}${handler}`);
    }
  }
  
  // Détails des DTOs
  subsection("DTOs détectés");
  if (ir.dtos && ir.dtos.length > 0) {
    for (const dto of ir.dtos) {
      const fieldCount = dto.fields?.length || 0;
      console.log(`    • ${dto.className} (${fieldCount} champs)`);
    }
  }
  
  // 3. Générer
  subsection("PHASE 2: Génération (engine.generate)");
  const startGenerate = Date.now();
  const generated = await engine.generate(ir);
  const generateTime = Date.now() - startGenerate;
  
  console.log(`  Temps de génération: ${generateTime}ms`);
  console.log(`  Fichiers générés: ${generated.files.length}`);
  
  // Classifier les fichiers générés
  const services = generated.files.filter(f => f.path.includes("Service.java") || f.content?.includes("@Service"));
  const controllers = generated.files.filter(f => f.path.includes("Controller.java") || f.content?.includes("@RestController"));
  const dtos = generated.files.filter(f => f.path.includes("Dto.java") || f.path.includes("DTO.java") || f.path.includes("VoIn.java") || f.path.includes("VoOut.java"));
  const entities = generated.files.filter(f => f.content?.includes("@Entity"));
  const configs = generated.files.filter(f => f.path.includes("Config") || f.path.includes("config"));
  const repos = generated.files.filter(f => f.path.includes("Repository.java") || f.content?.includes("JpaRepository"));
  const docker = generated.files.filter(f => f.path.includes("Dockerfile") || f.path.includes("docker"));
  const helm = generated.files.filter(f => f.path.includes("helm") || f.path.includes("Chart"));
  const reports = generated.files.filter(f => f.path.endsWith(".md"));
  
  subsection("Fichiers générés par catégorie");
  console.log(`    Services:     ${services.length}`);
  console.log(`    Controllers:  ${controllers.length}`);
  console.log(`    DTOs:         ${dtos.length}`);
  console.log(`    Entities:     ${entities.length}`);
  console.log(`    Repositories: ${repos.length}`);
  console.log(`    Configs:      ${configs.length}`);
  console.log(`    Docker:       ${docker.length}`);
  console.log(`    Helm:         ${helm.length}`);
  console.log(`    Rapports:     ${reports.length}`);
  
  // Lister tous les fichiers
  subsection("Liste complète des fichiers générés");
  for (const f of generated.files.sort((a, b) => a.path.localeCompare(b.path))) {
    const size = f.content?.length || 0;
    console.log(`    ${f.path} (${size} chars)`);
  }
  
  // 4. Vérifier la qualité
  subsection("VÉRIFICATIONS QUALITÉ");
  
  const issues: string[] = [];
  const warnings: string[] = [];
  const successes: string[] = [];
  
  // Check 1: Au moins 1 service
  if (services.length > 0) {
    successes.push(`✅ ${services.length} @Service(s) générés`);
  } else {
    issues.push(`❌ Aucun @Service généré`);
  }
  
  // Check 2: Au moins 1 controller
  if (controllers.length > 0) {
    successes.push(`✅ ${controllers.length} @RestController(s) générés`);
  } else {
    issues.push(`❌ Aucun @RestController généré`);
  }
  
  // Check 3: Pas de Void.builder() dans le code Java
  const voidBuilderFiles = generated.files.filter(f => f.path.endsWith(".java") && f.content?.includes("Void.builder()"));
  if (voidBuilderFiles.length === 0) {
    successes.push(`✅ Aucun Void.builder() invalide`);
  } else {
    issues.push(`❌ Void.builder() trouvé dans ${voidBuilderFiles.length} fichier(s): ${voidBuilderFiles.map(f => f.path).join(", ")}`);
  }
  
  // Check 4: Pas de Object.builder() dans le code Java
  const objectBuilderFiles = generated.files.filter(f => f.path.endsWith(".java") && f.content?.includes("Object.builder()"));
  if (objectBuilderFiles.length === 0) {
    successes.push(`✅ Aucun Object.builder() invalide`);
  } else {
    issues.push(`❌ Object.builder() trouvé dans ${objectBuilderFiles.length} fichier(s): ${objectBuilderFiles.map(f => f.path).join(", ")}`);
  }
  
  // Check 5: Pas de TODO dans les services
  const todoInServices = services.filter(f => f.content?.includes("// TODO"));
  if (todoInServices.length === 0) {
    successes.push(`✅ Aucun TODO dans les services`);
  } else {
    warnings.push(`⚠️  TODO trouvé dans ${todoInServices.length} service(s): ${todoInServices.map(f => f.path).join(", ")}`);
  }
  
  // Check 6: Pas de EaiLog dans le code généré
  const eaiLogFiles = generated.files.filter(f => f.content?.includes("EaiLog") && f.path.endsWith(".java"));
  if (eaiLogFiles.length === 0) {
    successes.push(`✅ Aucun EaiLog legacy dans le code généré`);
  } else {
    issues.push(`❌ EaiLog legacy trouvé dans ${eaiLogFiles.length} fichier(s): ${eaiLogFiles.map(f => f.path).join(", ")}`);
  }
  
  // Debug: afficher le contenu d'une exception pour comprendre le problème
  const sampleException = generated.files.find(f => f.path.includes("CarteDejaActiveException"));
  if (sampleException) {
    console.log(`\n  [DEBUG] CarteDejaActiveException.java:\n${sampleException.content}`);
  }
  
  // Check 7: Pas de FwkRollbackException dans le code Java (hors commentaires, GlobalExceptionHandler et FwkRollbackException.java)
  const fwkFiles = generated.files.filter(f => {
    if (!f.path.endsWith(".java")) return false;
    if (f.path.includes("GlobalExceptionHandler")) return false;
    if (f.path.includes("FwkRollbackException.java")) return false;
    // Supprimer les commentaires avant de chercher
    const codeOnly = (f.content || "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    return codeOnly.includes("FwkRollbackException");
  });
  if (fwkFiles.length === 0) {
    successes.push(`✅ Aucun FwkRollbackException legacy`);
  } else {
    issues.push(`❌ FwkRollbackException trouvé dans ${fwkFiles.length} fichier(s): ${fwkFiles.map(f => f.path).join(", ")}`);
  }
  
  // Check 8: Pas de SessionContext
  const sessionCtxFiles = generated.files.filter(f => f.content?.includes("SessionContext") && f.path.endsWith(".java"));
  if (sessionCtxFiles.length === 0) {
    successes.push(`✅ Aucun SessionContext EJB legacy`);
  } else {
    issues.push(`❌ SessionContext trouvé dans ${sessionCtxFiles.length} fichier(s)`);
  }
  
  // Check 9: Pas de HashMap comme type de retour dans les services
  const hashMapReturnFiles = services.filter(f => f.content?.match(/return new HashMap/));
  if (hashMapReturnFiles.length === 0) {
    successes.push(`✅ Aucun HashMap comme type de retour`);
  } else {
    warnings.push(`⚠️  HashMap retour dans ${hashMapReturnFiles.length} service(s)`);
  }
  
  // Check 10: Dockerfile existe
  if (docker.length > 0) {
    successes.push(`✅ Dockerfile généré`);
  } else {
    warnings.push(`⚠️  Pas de Dockerfile généré`);
  }
  
  // Check 11: Rapport de migration existe
  const migrationReport = reports.find(f => f.path.includes("MIGRATION_REPORT"));
  if (migrationReport) {
    successes.push(`✅ MIGRATION_REPORT.md généré (${migrationReport.content?.length} chars)`);
  } else {
    warnings.push(`⚠️  Pas de MIGRATION_REPORT.md`);
  }
  
  // Check 12: Quality Score existe
  const qualityScore = reports.find(f => f.path.includes("QUALITY_SCORE"));
  if (qualityScore) {
    successes.push(`✅ QUALITY_SCORE.md généré`);
    // Extraire le score
    const scoreMatch = qualityScore.content?.match(/Score\s*(?:global|total|final)\s*[:=]\s*(\d+)/i);
    if (scoreMatch) {
      console.log(`\n  📊 SCORE QUALITÉ: ${scoreMatch[1]}/100`);
    }
  } else {
    warnings.push(`⚠️  Pas de QUALITY_SCORE.md`);
  }
  
  // Check 13: Pas de stubs doublons
  const serviceNames = services.map(f => {
    const match = f.path.match(/(\w+Service)\.java$/);
    return match ? match[1] : null;
  }).filter(Boolean);
  const duplicateServices = serviceNames.filter((name, i) => serviceNames.indexOf(name) !== i);
  if (duplicateServices.length === 0) {
    successes.push(`✅ Aucun service doublon`);
  } else {
    issues.push(`❌ Services doublons: ${duplicateServices.join(", ")}`);
  }
  
  // Résumé
  subsection("RÉSUMÉ");
  for (const s of successes) console.log(`    ${s}`);
  for (const w of warnings) console.log(`    ${w}`);
  for (const i of issues) console.log(`    ${i}`);
  
  const totalChecks = successes.length + warnings.length + issues.length;
  const score = Math.round((successes.length / totalChecks) * 100);
  console.log(`\n  📈 Score: ${successes.length}/${totalChecks} checks passés (${score}%)`);
  console.log(`  ⏱️  Temps total: ${analyzeTime + generateTime}ms`);
  
  return {
    projectName,
    files: generated.files,
    services: services.length,
    controllers: controllers.length,
    dtos: dtos.length,
    useCases: summary.useCaseCount,
    issues: issues.length,
    warnings: warnings.length,
    successes: successes.length,
    score,
    totalTime: analyzeTime + generateTime,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║         COMPLEO — Test End-to-End Pipeline sur Projets Réels                ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  
  const engine = getEngine();
  const results: any[] = [];
  
  // Projet 1: activation-carte
  const activationCartePath = "test-projects/boa-realistic-ejb-project/activation-carte-bmcedirect-ejb";
  if (fs.existsSync(path.resolve(PROJECT_ROOT, activationCartePath))) {
    const r = await analyzeProject(engine, activationCartePath, "activation-carte-bmcedirect");
    results.push(r);
  } else {
    console.log("\n⚠️  Projet activation-carte non trouvé, skip.");
  }
  
  // Projet 2: mise-disposition (si disponible)
  const miseDispoPath = "test-projects/mise-disposition-bmcedirect";
  if (fs.existsSync(path.resolve(PROJECT_ROOT, miseDispoPath))) {
    const r = await analyzeProject(engine, miseDispoPath, "mise-disposition-bmcedirect");
    results.push(r);
  } else {
    console.log("\n⚠️  Projet mise-disposition non trouvé dans test-projects/, tentative dans /home/ubuntu/audit-mad/legacy/...");
    // Essayer l'ancien chemin
    const legacyPath = "/home/ubuntu/audit-mad/legacy";
    if (fs.existsSync(legacyPath)) {
      const r = await analyzeProject(engine, legacyPath, "mise-disposition-bmcedirect");
      results.push(r);
    } else {
      console.log("  ⚠️  Projet mise-disposition non disponible. Re-uploader le ZIP pour le tester.");
    }
  }
  
  // Résumé global
  separator("RÉSUMÉ GLOBAL");
  console.log("\n  | Projet | UseCases | Services | Controllers | DTOs | Issues | Score |");
  console.log("  |--------|----------|----------|-------------|------|--------|-------|");
  for (const r of results) {
    console.log(`  | ${r.projectName.padEnd(30)} | ${String(r.useCases).padStart(8)} | ${String(r.services).padStart(8)} | ${String(r.controllers).padStart(11)} | ${String(r.dtos).padStart(4)} | ${String(r.issues).padStart(6)} | ${String(r.score + "%").padStart(5)} |`);
  }
  console.log("");
}

main().catch(console.error);
