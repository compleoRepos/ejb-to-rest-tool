/**
 * Test Pipeline Batch — Passe tous les projets des ZIPs sur le pipeline complet.
 * Analyse + Génération + Validation qualité technique ET métier.
 *
 * @author Compleo
 */
import * as fs from "fs";
import * as path from "path";
import { CompleoEngine, type SourceFile } from "../server/engine/CompleoEngine";

// ─── Configuration ───────────────────────────────────────────────────────────

const PIPELINE_BASE = "/home/ubuntu/pipeline-test";
const OUTPUT_DIR = "/home/ubuntu/pipeline-test/results";

interface BusinessCheck {
  ucClassName: string;
  ucDomain: string;
  hasService: boolean;
  hasController: boolean;
  hasDto: boolean;
  sourceMethodCount: number;
  generatedMethodCount: number;
  methodsPreserved: string[];
  methodsMissing: string[];
  businessTermsFound: string[];
  voInType: string;
  voOutType: string;
  injectedServices: string[];
}

interface ProjectResult {
  name: string;
  javaFiles: number;
  useCases: number;
  dtos: number;
  enums: number;
  technologies: string[];
  ambiguities: number;
  generatedFiles: number;
  generatedJava: number;
  generatedYml: number;
  generatedMd: number;
  validationScore: number;
  validationStatus: string;
  objectTypes: number;
  duplicateImports: number;
  syntaxErrors: number;
  hasControllers: boolean;
  hasServices: boolean;
  hasRepositories: boolean;
  hasConfig: boolean;
  hasPom: boolean;
  hasDockerfile: boolean;
  hasTests: boolean;
  // Business quality
  businessChecks: BusinessCheck[];
  businessScore: number;
  ucCoverage: number;
  dtoCoverage: number;
  methodPreservationRate: number;
  businessTermsCount: number;
  // Generated code inspection
  springAnnotations: number;
  restEndpoints: number;
  jpaEntities: number;
  // Timing
  analyzeTimeMs: number;
  generateTimeMs: number;
  totalTimeMs: number;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadProjectFiles(projectDir: string): SourceFile[] {
  const files: SourceFile[] = [];
  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["target", "build", ".git", "node_modules"].includes(entry.name)) continue;
        walk(fullPath);
      } else if (entry.name.endsWith(".java") || entry.name === "pom.xml" || entry.name.endsWith(".xml")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const relativePath = path.relative(projectDir, fullPath);
          files.push({ path: relativePath, content });
        } catch {}
      }
    }
  }
  walk(projectDir);
  return files;
}

function findPomXml(files: SourceFile[]): string | undefined {
  const rootPom = files.find(f => f.path === "pom.xml");
  if (rootPom) return rootPom.content;
  const anyPom = files.find(f => f.path.endsWith("pom.xml"));
  return anyPom?.content;
}

/**
 * Extraire les méthodes publiques d'un fichier Java.
 */
function extractMethods(content: string): string[] {
  const methods: string[] = [];
  const regex = /(?:public|protected)\s+[\w<>,\s\[\]]+\s+(\w+)\s*\(/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    if (/^(get|set|is|toString|equals|hashCode|compareTo|clone)/.test(name)) continue;
    methods.push(name);
  }
  return [...new Set(methods)];
}

/**
 * Extraire les termes métier bancaires d'un contenu.
 */
function extractBusinessTerms(content: string): string[] {
  const terms = new Set<string>();
  const keywords = [
    "virement", "carte", "compte", "client", "solde", "montant", "devise",
    "beneficiaire", "debit", "credit", "transaction", "operation", "chequier",
    "opposition", "souscription", "contrat", "police", "prime", "sinistre",
    "dotation", "epargne", "placement", "remboursement", "echeance",
    "notification", "sms", "email", "alerte", "securite", "authentification",
    "token", "otp", "pin", "cvv", "iban", "rib", "swift", "bic",
    "agence", "conseiller", "produit", "offre", "tarif", "commission",
    "plafond", "seuil", "frequence", "periodicite", "permanent",
    "activation", "desactivation", "blocage", "deblocage",
    "releve", "historique", "consultation", "demande", "validation",
    "3dsecure", "coordonnees", "assistance", "avenir", "monetique",
    "transfert", "euro", "international", "opv", "tokenisation",
    "service", "repository", "controller", "entity",
  ];
  const lower = content.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw)) terms.add(kw);
  }
  return Array.from(terms);
}

/**
 * Compter les annotations Spring dans le code généré.
 */
function countSpringAnnotations(files: Array<{ path: string; content: string }>): number {
  let count = 0;
  const annotations = [
    "@RestController", "@Service", "@Repository", "@Entity", "@Component",
    "@Autowired", "@Inject", "@RequestMapping", "@GetMapping", "@PostMapping",
    "@PutMapping", "@DeleteMapping", "@Transactional", "@SpringBootApplication",
    "@Configuration", "@Bean", "@Value", "@Table", "@Column", "@Id",
    "@GeneratedValue", "@ManyToOne", "@OneToMany", "@JoinColumn",
  ];
  for (const f of files) {
    if (!f.path.endsWith(".java")) continue;
    for (const ann of annotations) {
      const regex = new RegExp(ann.replace("@", "@"), "g");
      const matches = f.content.match(regex);
      if (matches) count += matches.length;
    }
  }
  return count;
}

/**
 * Compter les endpoints REST dans le code généré.
 */
function countRestEndpoints(files: Array<{ path: string; content: string }>): number {
  let count = 0;
  for (const f of files) {
    if (!f.path.endsWith(".java")) continue;
    const matches = f.content.match(/@(Get|Post|Put|Delete|Patch)Mapping/g);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Compter les entités JPA dans le code généré.
 */
function countJpaEntities(files: Array<{ path: string; content: string }>): number {
  let count = 0;
  for (const f of files) {
    if (!f.path.endsWith(".java")) continue;
    if (f.content.includes("@Entity")) count++;
  }
  return count;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║   COMPLEO — Test Pipeline Batch (19 projets bancaires)                      ║");
  console.log("║   Validation technique + métier                                              ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  console.log();

  // Discover all projects
  const projectDirs: string[] = [];
  for (const zipDir of ["projects1", "projects2", "projects3"]) {
    const base = path.join(PIPELINE_BASE, zipDir);
    if (!fs.existsSync(base)) continue;
    const entries = fs.readdirSync(base, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(base, entry.name);
        const hasJava = fs.readdirSync(fullPath, { recursive: true })
          .some((f: any) => f.toString().endsWith(".java"));
        if (hasJava) projectDirs.push(fullPath);
      }
    }
  }

  console.log(`  📂 ${projectDirs.length} projets détectés\n`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const engine = new CompleoEngine();
  const results: ProjectResult[] = [];

  for (let i = 0; i < projectDirs.length; i++) {
    const projectDir = projectDirs[i];
    const projectName = path.basename(projectDir);
    const progress = `[${i + 1}/${projectDirs.length}]`;

    console.log(`═══════════════════════════════════════════════════════════════════════`);
    console.log(`  ${progress} ${projectName}`);
    console.log(`═══════════════════════════════════════════════════════════════════════`);

    const startTime = Date.now();
    const result: ProjectResult = {
      name: projectName,
      javaFiles: 0, useCases: 0, dtos: 0, enums: 0, technologies: [], ambiguities: 0,
      generatedFiles: 0, generatedJava: 0, generatedYml: 0, generatedMd: 0,
      validationScore: 0, validationStatus: "N/A",
      objectTypes: 0, duplicateImports: 0, syntaxErrors: 0,
      hasControllers: false, hasServices: false, hasRepositories: false,
      hasConfig: false, hasPom: false, hasDockerfile: false, hasTests: false,
      businessChecks: [], businessScore: 0, ucCoverage: 0, dtoCoverage: 0,
      methodPreservationRate: 0, businessTermsCount: 0,
      springAnnotations: 0, restEndpoints: 0, jpaEntities: 0,
      analyzeTimeMs: 0, generateTimeMs: 0, totalTimeMs: 0,
    };

    try {
      // 1. Load files
      const files = loadProjectFiles(projectDir);
      const javaFiles = files.filter(f => f.path.endsWith(".java"));
      result.javaFiles = javaFiles.length;
      console.log(`    📁 Fichiers: ${files.length} total, ${javaFiles.length} Java`);

      // 2. Analyze
      const analyzeStart = Date.now();
      const pomXml = findPomXml(files);
      const analysis = await engine.analyze(files, { pomXml, projectName });
      result.analyzeTimeMs = Date.now() - analyzeStart;

      result.useCases = analysis.ir.useCases.length;
      result.dtos = analysis.ir.dtos.length;
      result.enums = analysis.ir.enums?.length || 0;
      result.technologies = analysis.multiTech.technologiesDetected;
      result.ambiguities = analysis.ambiguities.length;

      console.log(`    🔍 Analyse: ${result.useCases} UC, ${result.dtos} DTOs, ${result.enums} Enums, techs=[${result.technologies.join(",")}] [${result.analyzeTimeMs}ms]`);

      // 3. Generate
      const genStart = Date.now();
      const generated = await engine.generate(
        analysis.ir, undefined, analysis.ambiguities, analysis.multiTech.generatedFiles
      );
      result.generateTimeMs = Date.now() - genStart;

      // 3b. Post-process JDBC via LLM (v10.15)
      try {
        const jdbcResult = await engine.postProcessJdbc(generated, analysis.ir);
        if (jdbcResult.migratedCount > 0 || jdbcResult.fallbackCount > 0) {
          console.log(`    🔄 Post-process JDBC: ${jdbcResult.migratedCount} LLM + ${jdbcResult.fallbackCount} fallback (${jdbcResult.warnings.length} warnings)`);
        }
      } catch (e: any) {
        console.log(`    ⚠️  Post-process JDBC échoué: ${e.message}`);
      }

      result.generatedFiles = generated.files.length;
      result.generatedJava = generated.files.filter(f => f.path.endsWith(".java")).length;
      result.generatedYml = generated.files.filter(f => f.path.endsWith(".yml") || f.path.endsWith(".yaml")).length;
      result.generatedMd = generated.files.filter(f => f.path.endsWith(".md")).length;

      console.log(`    ⚙️  Génération: ${result.generatedFiles} fichiers (${result.generatedJava} Java) [${result.generateTimeMs}ms]`);

      // 4. Technical quality checks
      result.hasControllers = generated.files.some(f => f.path.includes("Controller"));
      result.hasServices = generated.files.some(f => f.path.includes("Service") && f.path.endsWith(".java"));
      result.hasRepositories = generated.files.some(f => f.path.includes("Repository"));
      result.hasConfig = generated.files.some(f => f.path.includes("application") && (f.path.endsWith(".yml") || f.path.endsWith(".properties")));
      result.hasPom = generated.files.some(f => f.path.endsWith("pom.xml"));
      result.hasDockerfile = generated.files.some(f => f.path.includes("Dockerfile") || f.path.includes("docker"));
      result.hasTests = generated.files.some(f => f.path.includes("Test.java") || f.path.includes("/test/"));

      // Spring annotations, REST endpoints, JPA entities
      result.springAnnotations = countSpringAnnotations(generated.files);
      result.restEndpoints = countRestEndpoints(generated.files);
      result.jpaEntities = countJpaEntities(generated.files);

      // 5. Validate
      const validation = await engine.validate(generated);
      result.validationScore = validation.score;
      result.validationStatus = validation.status;
      result.objectTypes = validation.ejb.objectCount;
      result.duplicateImports = validation.ejb.duplicateImportCount;
      result.syntaxErrors = validation.ejb.syntaxErrors.length;

      console.log(`    ✅ Validation technique: ${result.validationScore}/100 (${result.validationStatus}) | @Spring: ${result.springAnnotations} | REST: ${result.restEndpoints} | JPA: ${result.jpaEntities}`);

      // 6. BUSINESS QUALITY CHECK
      for (const uc of analysis.ir.useCases) {
        const ucClassName = uc.className || "Unknown";
        const ucDomain = uc.domain || "";
        const normalizedName = ucClassName
          .replace(/UC$/, "").replace(/Bean$/, "").replace(/Impl$/, "")
          .replace(/EJB$/, "").replace(/Session$/, "");

        // Find source file for this UC
        const sourceFile = files.find(f =>
          f.path.endsWith(".java") && f.content.includes(`class ${ucClassName}`)
        );
        const sourceMethods = sourceFile ? extractMethods(sourceFile.content) : [];

        // Find generated service
        const serviceFile = generated.files.find(f => {
          if (!f.path.endsWith(".java") || !f.path.includes("Service")) return false;
          const fileName = path.basename(f.path).replace(".java", "");
          return fileName.toLowerCase().includes(normalizedName.toLowerCase()) ||
                 f.content.includes(normalizedName);
        });

        // Find generated controller
        const controllerFile = generated.files.find(f => {
          if (!f.path.endsWith(".java") || !f.path.includes("Controller")) return false;
          const fileName = path.basename(f.path).replace(".java", "");
          return fileName.toLowerCase().includes(normalizedName.toLowerCase()) ||
                 f.content.includes(normalizedName);
        });

        // Find generated DTO
        const hasDtoFile = generated.files.some(f => {
          if (!f.path.endsWith(".java")) return false;
          const fileName = path.basename(f.path).replace(".java", "");
          return (fileName.includes("Dto") || fileName.includes("DTO") ||
                  fileName.includes("Request") || fileName.includes("Response")) &&
                 (fileName.toLowerCase().includes(normalizedName.toLowerCase()) ||
                  (uc.voInType && fileName.includes(uc.voInType.replace("VoIn", "").replace("Dto", ""))) ||
                  (uc.voOutType && fileName.includes(uc.voOutType.replace("VoOut", "").replace("Dto", ""))));
        });

        // Check method preservation
        const genContent = (serviceFile?.content || "") + (controllerFile?.content || "");
        const genMethods = extractMethods(genContent);

        const methodsPreserved: string[] = [];
        const methodsMissing: string[] = [];
        for (const m of sourceMethods) {
          const found = genMethods.some(gm =>
            gm.toLowerCase() === m.toLowerCase() ||
            gm.toLowerCase().includes(m.toLowerCase()) ||
            m.toLowerCase().includes(gm.toLowerCase())
          );
          if (found) methodsPreserved.push(m);
          else methodsMissing.push(m);
        }

        // Business terms in generated code
        const businessTerms = extractBusinessTerms(genContent);

        result.businessChecks.push({
          ucClassName,
          ucDomain,
          hasService: !!serviceFile,
          hasController: !!controllerFile,
          hasDto: hasDtoFile,
          sourceMethodCount: sourceMethods.length,
          generatedMethodCount: genMethods.length,
          methodsPreserved,
          methodsMissing,
          businessTermsFound: businessTerms,
          voInType: uc.voInType || "",
          voOutType: uc.voOutType || "",
          injectedServices: uc.injectedServices?.map(s => s.type) || [],
        });
      }

      // Calculate business metrics
      const ucCount = result.businessChecks.length;
      const ucWithService = result.businessChecks.filter(bc => bc.hasService).length;
      const ucWithController = result.businessChecks.filter(bc => bc.hasController).length;
      const ucWithDto = result.businessChecks.filter(bc => bc.hasDto).length;
      result.ucCoverage = ucCount > 0 ? Math.round((ucWithService / ucCount) * 100) : 100;
      result.dtoCoverage = ucCount > 0 ? Math.round((ucWithDto / ucCount) * 100) : 100;

      const totalMethods = result.businessChecks.reduce((s, bc) => s + bc.sourceMethodCount, 0);
      const preservedMethods = result.businessChecks.reduce((s, bc) => s + bc.methodsPreserved.length, 0);
      result.methodPreservationRate = totalMethods > 0 ? Math.round((preservedMethods / totalMethods) * 100) : 100;

      const allTerms = new Set(result.businessChecks.flatMap(bc => bc.businessTermsFound));
      result.businessTermsCount = allTerms.size;

      // Business score composite
      result.businessScore = Math.round(
        result.ucCoverage * 0.35 +
        result.methodPreservationRate * 0.30 +
        result.dtoCoverage * 0.15 +
        Math.min(result.businessTermsCount * 5, 100) * 0.10 +
        Math.min(result.restEndpoints * 10, 100) * 0.10
      );

      console.log(`    🏦 Validation métier: ${result.businessScore}/100`);
      console.log(`       UC→Service: ${ucWithService}/${ucCount} | UC→Controller: ${ucWithController}/${ucCount} | UC→DTO: ${ucWithDto}/${ucCount}`);
      console.log(`       Méthodes: ${preservedMethods}/${totalMethods} préservées (${result.methodPreservationRate}%)`);
      console.log(`       Termes métier: ${result.businessTermsCount} [${Array.from(allTerms).slice(0, 6).join(", ")}]`);

      // Show missing methods
      const missingUCs = result.businessChecks.filter(bc => bc.methodsMissing.length > 0);
      if (missingUCs.length > 0) {
        for (const bc of missingUCs.slice(0, 3)) {
          console.log(`       ⚠️  ${bc.ucClassName}: manque [${bc.methodsMissing.slice(0, 4).join(", ")}]`);
        }
      }

      // 7. Save generated project
      const outputProjectDir = path.join(OUTPUT_DIR, projectName);
      fs.mkdirSync(outputProjectDir, { recursive: true });
      for (const file of generated.files) {
        const filePath = path.join(outputProjectDir, file.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, file.content);
      }

    } catch (err: any) {
      result.error = err.message || String(err);
      console.log(`    ❌ ERREUR: ${result.error?.substring(0, 200)}`);
    }

    result.totalTimeMs = Date.now() - startTime;
    results.push(result);
    console.log(`    ⏱️  ${result.totalTimeMs}ms\n`);
  }

  // ─── Rapport final ─────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║   RAPPORT FINAL — Pipeline Batch (Technique + Métier)                        ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝\n");

  console.log("  ┌────┬──────────────────────────────────┬──────┬────┬─────┬────────┬────────┬────────┐");
  console.log("  │ #  │ Projet                           │ Java │ UC │ Gen │Tech/100│Biz/100 │ Status │");
  console.log("  ├────┼──────────────────────────────────┼──────┼────┼─────┼────────┼────────┼────────┤");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const status = r.error ? "❌ ERR" : (r.validationStatus === "PASS" ? "✅ OK " : r.validationStatus === "WARN" ? "⚠️ WRN" : "❌ FAIL");
    const name = r.name.substring(0, 32).padEnd(32);
    console.log(`  │ ${String(i + 1).padStart(2)} │ ${name} │ ${String(r.javaFiles).padStart(4)} │ ${String(r.useCases).padStart(2)} │ ${String(r.generatedFiles).padStart(3)} │  ${String(r.validationScore).padStart(3)}  │  ${String(r.businessScore).padStart(3)}  │ ${status} │`);
  }
  console.log("  └────┴──────────────────────────────────┴──────┴────┴─────┴────────┴────────┴────────┘");

  // Aggregated stats
  const successCount = results.filter(r => !r.error).length;
  const passCount = results.filter(r => r.validationStatus === "PASS").length;
  const warnCount = results.filter(r => r.validationStatus === "WARN").length;
  const failCount = results.filter(r => r.error || r.validationStatus === "FAIL").length;
  const avgTechScore = results.filter(r => !r.error).reduce((s, r) => s + r.validationScore, 0) / (successCount || 1);
  const avgBizScore = results.filter(r => !r.error).reduce((s, r) => s + r.businessScore, 0) / (successCount || 1);
  const totalGenerated = results.reduce((s, r) => s + r.generatedFiles, 0);
  const totalUC = results.reduce((s, r) => s + r.useCases, 0);
  const avgMethodRate = results.filter(r => !r.error).reduce((s, r) => s + r.methodPreservationRate, 0) / (successCount || 1);
  const totalSpring = results.reduce((s, r) => s + r.springAnnotations, 0);
  const totalRest = results.reduce((s, r) => s + r.restEndpoints, 0);
  const totalJpa = results.reduce((s, r) => s + r.jpaEntities, 0);

  console.log("\n  ─── Statistiques globales ───────────────────────────────────────────────");
  console.log(`  Projets traités:         ${results.length}`);
  console.log(`  Pipeline succès:         ${successCount}/${results.length}`);
  console.log(`  Validation PASS/WARN/FAIL: ${passCount}/${warnCount}/${failCount}`);
  console.log(`  Score technique moyen:   ${avgTechScore.toFixed(1)}/100`);
  console.log(`  Score métier moyen:      ${avgBizScore.toFixed(1)}/100`);
  console.log(`  Total UC détectés:       ${totalUC}`);
  console.log(`  Total fichiers générés:  ${totalGenerated}`);
  console.log(`  Préservation méthodes:   ${avgMethodRate.toFixed(1)}%`);
  console.log(`  Annotations Spring:      ${totalSpring}`);
  console.log(`  Endpoints REST:          ${totalRest}`);
  console.log(`  Entités JPA:             ${totalJpa}`);
  console.log(`  Temps total:             ${(results.reduce((s, r) => s + r.totalTimeMs, 0) / 1000).toFixed(1)}s`);

  // Détail métier par projet (seulement ceux avec UC)
  console.log("\n  ─── Détail métier par projet ────────────────────────────────────────────");
  for (const r of results.filter(r => !r.error && r.useCases > 0)) {
    const ucWithService = r.businessChecks.filter(bc => bc.hasService).length;
    const totalM = r.businessChecks.reduce((s, bc) => s + bc.sourceMethodCount, 0);
    const preservedM = r.businessChecks.reduce((s, bc) => s + bc.methodsPreserved.length, 0);
    console.log(`  📦 ${r.name}:`);
    console.log(`     UC→Service: ${ucWithService}/${r.useCases} | Méthodes: ${preservedM}/${totalM} | REST: ${r.restEndpoints} | @Spring: ${r.springAnnotations} | Score: ${r.businessScore}/100`);
    const missingUCs = r.businessChecks.filter(bc => bc.methodsMissing.length > 0);
    if (missingUCs.length > 0) {
      for (const bc of missingUCs.slice(0, 2)) {
        console.log(`     ⚠️  ${bc.ucClassName}: manque [${bc.methodsMissing.slice(0, 4).join(", ")}]`);
      }
    }
  }

  // Projets sans UC (détection limitée)
  const noUCProjects = results.filter(r => !r.error && r.useCases === 0);
  if (noUCProjects.length > 0) {
    console.log("\n  ─── Projets sans UC détectés (structure non-standard) ─────────────────");
    for (const r of noUCProjects) {
      console.log(`  📦 ${r.name}: ${r.javaFiles} Java, ${r.dtos} DTOs, ${r.generatedFiles} générés, techs=[${r.technologies.join(",")}]`);
    }
  }

  // Save JSON report
  const reportPath = path.join(OUTPUT_DIR, "pipeline-batch-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalProjects: results.length,
    successCount, passCount, warnCount, failCount,
    avgTechScore: Math.round(avgTechScore * 10) / 10,
    avgBizScore: Math.round(avgBizScore * 10) / 10,
    avgMethodPreservation: Math.round(avgMethodRate * 10) / 10,
    totalUC, totalGenerated, totalSpring, totalRest, totalJpa,
    results: results.map(r => ({
      ...r,
      businessChecks: r.businessChecks.map(bc => ({
        ucClassName: bc.ucClassName,
        ucDomain: bc.ucDomain,
        hasService: bc.hasService,
        hasController: bc.hasController,
        hasDto: bc.hasDto,
        sourceMethodCount: bc.sourceMethodCount,
        generatedMethodCount: bc.generatedMethodCount,
        methodsPreservedCount: bc.methodsPreserved.length,
        methodsMissing: bc.methodsMissing,
        businessTermsCount: bc.businessTermsFound.length,
        voInType: bc.voInType,
        voOutType: bc.voOutType,
        injectedServices: bc.injectedServices,
      })),
    })),
  }, null, 2));

  console.log(`\n  📄 Rapport JSON: ${reportPath}`);
  console.log(`  📂 Projets générés: ${OUTPUT_DIR}/`);
  console.log("\n  ═══════════════════════════════════════════════════════════════════════════");
  console.log(`  VERDICT: Tech=${avgTechScore.toFixed(0)}/100 | Métier=${avgBizScore.toFixed(0)}/100 | Pipeline=${successCount}/${results.length}`);
  console.log("  ═══════════════════════════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
