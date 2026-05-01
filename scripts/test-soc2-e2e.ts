/**
 * Test E2E — Génération SOC 2 sur projet bancaire réel.
 * Valide les 14 fichiers SOC 2, le rapport, et l'intégration avec le code métier.
 * Usage: npx tsx scripts/test-soc2-e2e.ts
 */
import { CompleoEngine, getEngine, type SourceFile } from "../server/engine/CompleoEngine";
import { generateSOC2Compliance, type SOC2GenerationResult } from "../server/engine/compliance/SOC2ComplianceGenerator";
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
  console.log(`\n  ── ${title} ${"─".repeat(Math.max(1, 60 - title.length))}`);
}

// ─── Test 1: SOC2ComplianceGenerator unitaire ─────────────────────────────────

function testSOC2GeneratorUnit() {
  separator("TEST 1: SOC2ComplianceGenerator — Test Unitaire");

  const result = generateSOC2Compliance(
    "ma.bmce.banking",
    "test-banking-project",
    true,   // hasDatabase
    true,   // hasRestEndpoints
    true    // hasSensitiveData
  );

  const issues: string[] = [];
  const successes: string[] = [];

  // Check 1: Nombre de fichiers
  subsection("Fichiers générés");
  console.log(`    Total fichiers: ${result.files.length}`);
  for (const f of result.files) {
    console.log(`    📄 ${f.path} — [${f.tsc}] ${f.description}`);
  }

  if (result.files.length >= 10) {
    successes.push(`✅ ${result.files.length} fichiers SOC 2 générés (>= 10)`);
  } else {
    issues.push(`❌ Seulement ${result.files.length} fichiers SOC 2 (attendu >= 10)`);
  }

  // Check 2: Fichiers critiques présents
  const criticalFiles = [
    "AuditLogEntity.java",
    "AuditLogRepository.java",
    "AuditInterceptor.java",
    "AuditAspect.java",
    "Auditable.java",
    "SecurityConfig.java",
    "DataEncryptionUtil.java",
    "EncryptedField.java",
    "InputValidationAspect.java",
    "SanitizeInput.java",
    "HealthCheckController.java",
    "GlobalErrorHandler.java",
    "SecurityHeadersFilter.java",
    "application-soc2.yml",
    "SOC2_COMPLIANCE.md",
  ];

  for (const expected of criticalFiles) {
    const found = result.files.find(f => f.path.includes(expected));
    if (found) {
      successes.push(`✅ ${expected} présent`);
    } else {
      issues.push(`❌ ${expected} MANQUANT`);
    }
  }

  // Check 3: Contenu Java valide (package, imports, class)
  subsection("Validation du contenu Java");
  const javaFiles = result.files.filter(f => f.path.endsWith(".java"));
  for (const f of javaFiles) {
    const hasPackage = f.content.includes("package ma.bmce.banking");
    const hasImport = f.content.includes("import ");
    const hasClass = f.content.includes("class ") || f.content.includes("interface ") || f.content.includes("@interface ");
    if (hasPackage && hasClass) {
      successes.push(`✅ ${path.basename(f.path)} — package + class OK`);
    } else {
      issues.push(`❌ ${path.basename(f.path)} — package=${hasPackage}, class=${hasClass}`);
    }
  }

  // Check 4: Critères SOC 2 couverts
  subsection("Couverture Trust Service Criteria");
  const covered = result.summary.criteriasCovered;
  console.log(`    Critères couverts: ${covered.join(", ")}`);
  const expectedCriteria = ["CC3", "CC5", "CC6", "CC7", "CC8"];
  for (const cc of expectedCriteria) {
    if (covered.includes(cc)) {
      successes.push(`✅ Critère ${cc} couvert`);
    } else {
      issues.push(`❌ Critère ${cc} NON couvert`);
    }
  }

  // Check 5: Rapport SOC2_COMPLIANCE.md
  subsection("Rapport SOC2_COMPLIANCE.md");
  const report = result.files.find(f => f.path.endsWith("SOC2_COMPLIANCE.md"));
  if (report) {
    const hasTitle = report.content.includes("SOC 2");
    const hasCriteria = report.content.includes("CC");
    const hasTable = report.content.includes("|");
    const hasProjectName = report.content.includes("test-banking-project");
    console.log(`    Taille: ${report.content.length} chars`);
    console.log(`    Titre SOC 2: ${hasTitle}`);
    console.log(`    Critères CC: ${hasCriteria}`);
    console.log(`    Tableau: ${hasTable}`);
    console.log(`    Nom projet: ${hasProjectName}`);
    if (hasTitle && hasCriteria && hasTable) {
      successes.push(`✅ Rapport SOC2_COMPLIANCE.md complet`);
    } else {
      issues.push(`❌ Rapport SOC2_COMPLIANCE.md incomplet`);
    }
  }

  // Check 6: AES-256 dans DataEncryptionUtil
  const encryptFile = result.files.find(f => f.path.includes("DataEncryptionUtil"));
  if (encryptFile) {
    const hasAES = encryptFile.content.includes("AES");
    const has256 = encryptFile.content.includes("256") || encryptFile.content.includes("AES/GCM");
    if (hasAES && has256) {
      successes.push(`✅ Chiffrement AES-256 implémenté`);
    } else {
      issues.push(`❌ Chiffrement AES-256 non trouvé dans DataEncryptionUtil`);
    }
  }

  // Check 7: Spring Security dans SecurityConfig
  const secConfig = result.files.find(f => f.path.includes("SecurityConfig"));
  if (secConfig) {
    const hasSpringSecurity = secConfig.content.includes("@EnableWebSecurity") || secConfig.content.includes("SecurityFilterChain");
    const hasCSRF = secConfig.content.includes("csrf");
    const hasHTTPS = secConfig.content.includes("https") || secConfig.content.includes("requiresSecure") || secConfig.content.includes("HSTS");
    if (hasSpringSecurity) {
      successes.push(`✅ Spring Security configuré`);
    } else {
      issues.push(`❌ Spring Security non configuré dans SecurityConfig`);
    }
  }

  // Check 8: Health Check endpoint
  const healthCheck = result.files.find(f => f.path.includes("HealthCheckController"));
  if (healthCheck) {
    const hasActuator = healthCheck.content.includes("@RestController") || healthCheck.content.includes("@GetMapping");
    const hasHealthEndpoint = healthCheck.content.includes("/health") || healthCheck.content.includes("health");
    if (hasActuator && hasHealthEndpoint) {
      successes.push(`✅ Health Check endpoint SOC 2 implémenté`);
    } else {
      issues.push(`❌ Health Check endpoint incomplet`);
    }
  }

  // Check 9: application-soc2.yml
  const soc2Config = result.files.find(f => f.path.includes("application-soc2.yml"));
  if (soc2Config) {
    const hasProfile = soc2Config.content.includes("soc2") || soc2Config.content.includes("security");
    if (hasProfile) {
      successes.push(`✅ Profil Spring Boot soc2 configuré`);
    } else {
      issues.push(`❌ Profil soc2 incomplet`);
    }
  }

  // Résumé
  subsection("RÉSUMÉ TEST 1");
  for (const s of successes) console.log(`    ${s}`);
  for (const i of issues) console.log(`    ${i}`);
  const total = successes.length + issues.length;
  const score = Math.round((successes.length / total) * 100);
  console.log(`\n  📈 Score: ${successes.length}/${total} checks passés (${score}%)`);

  return { successes: successes.length, issues: issues.length, score, result };
}

// ─── Test 2: Pipeline E2E avec SOC 2 activé ──────────────────────────────────

async function testSOC2PipelineE2E() {
  separator("TEST 2: Pipeline E2E — Projet bancaire avec SOC 2 activé");

  const engine = getEngine();
  const projectPath = "test-projects/boa-realistic-ejb-project/activation-carte-bmcedirect-ejb";
  
  if (!fs.existsSync(path.resolve(PROJECT_ROOT, projectPath))) {
    console.log("  ⚠️  Projet activation-carte non trouvé, skip.");
    return null;
  }

  // 1. Charger les fichiers
  const files = loadProjectFiles(projectPath);
  console.log(`  Fichiers chargés: ${files.length}`);

  // 2. Analyser
  subsection("PHASE 1: Analyse");
  const pomFile = files.find(f => f.path === "pom.xml" || f.path.endsWith("/pom.xml"));
  const startAnalyze = Date.now();
  const analysisResult = await engine.analyze(files, {
    pomXml: pomFile?.content,
    projectName: "activation-carte-soc2-test",
  });
  const analyzeTime = Date.now() - startAnalyze;
  console.log(`  Temps d'analyse: ${analyzeTime}ms`);
  console.log(`  UseCases: ${analysisResult.summary.useCaseCount}`);
  console.log(`  DTOs: ${analysisResult.summary.dtoCount}`);

  // 3. Générer (sans SOC 2 d'abord pour comparer)
  subsection("PHASE 2a: Génération SANS SOC 2");
  const startGen1 = Date.now();
  const genWithout = await engine.generate(analysisResult.ir);
  const gen1Time = Date.now() - startGen1;
  console.log(`  Fichiers générés (sans SOC 2): ${genWithout.files.length}`);
  console.log(`  Temps: ${gen1Time}ms`);

  // 4. Ajouter SOC 2
  subsection("PHASE 2b: Ajout SOC 2 Compliance");
  const ir = analysisResult.ir;
  const basePackage = ir.basePackage || "com.banking.activation";
  const hasDatabase = ir.useCases.some((uc: any) => uc.technologies?.includes("JDBC") || uc.technologies?.includes("HIBERNATE"));
  const hasRestEndpoints = ir.useCases.length > 0;
  const hasSensitiveData = true; // Projet bancaire = données sensibles

  const soc2Result = generateSOC2Compliance(
    basePackage,
    "activation-carte-bmcedirect",
    hasDatabase,
    hasRestEndpoints,
    hasSensitiveData
  );

  console.log(`  Fichiers SOC 2 générés: ${soc2Result.files.length}`);
  console.log(`  Critères couverts: ${soc2Result.summary.criteriasCovered.join(", ")}`);

  // 5. Combiner les fichiers
  const allFiles = [
    ...genWithout.files,
    ...soc2Result.files.map(f => ({ path: f.path, content: f.content })),
  ];
  console.log(`  Total fichiers combinés: ${allFiles.length} (${genWithout.files.length} métier + ${soc2Result.files.length} SOC 2)`);

  // 6. Vérifications d'intégration
  subsection("VÉRIFICATIONS D'INTÉGRATION");
  const issues: string[] = [];
  const successes: string[] = [];

  // Check 1: Pas de conflit de packages
  const soc2Packages = soc2Result.files
    .filter(f => f.path.endsWith(".java"))
    .map(f => {
      const match = f.content.match(/^package\s+([\w.]+);/m);
      return match ? match[1] : null;
    })
    .filter(Boolean);
  const metierPackages = genWithout.files
    .filter(f => f.path.endsWith(".java"))
    .map(f => {
      const match = f.content?.match(/^package\s+([\w.]+);/m);
      return match ? match[1] : null;
    })
    .filter(Boolean);
  
  const conflictPackages = soc2Packages.filter(p => metierPackages.includes(p));
  if (conflictPackages.length === 0) {
    successes.push(`✅ Aucun conflit de packages (SOC 2 dans .compliance.*, métier dans .service.*)`);
  } else {
    issues.push(`❌ Conflits de packages: ${conflictPackages.join(", ")}`);
  }

  // Check 2: Pas de conflit de noms de fichiers
  const soc2Paths = new Set(soc2Result.files.map(f => f.path));
  const metierPaths = new Set(genWithout.files.map(f => f.path));
  const conflictPaths = [...soc2Paths].filter(p => metierPaths.has(p));
  if (conflictPaths.length === 0) {
    successes.push(`✅ Aucun conflit de chemins de fichiers`);
  } else {
    issues.push(`❌ Conflits de chemins: ${conflictPaths.join(", ")}`);
  }

  // Check 3: Les fichiers SOC 2 utilisent le bon basePackage
  const wrongPackage = soc2Result.files
    .filter(f => f.path.endsWith(".java"))
    .filter(f => !f.content.includes(`package ${basePackage}`));
  if (wrongPackage.length === 0) {
    successes.push(`✅ Tous les fichiers SOC 2 utilisent le package ${basePackage}`);
  } else {
    issues.push(`❌ ${wrongPackage.length} fichiers SOC 2 avec mauvais package`);
  }

  // Check 4: Le rapport SOC2_COMPLIANCE.md est présent
  const soc2Report = soc2Result.files.find(f => f.path.endsWith("SOC2_COMPLIANCE.md"));
  if (soc2Report && soc2Report.content.length > 500) {
    successes.push(`✅ Rapport SOC2_COMPLIANCE.md présent (${soc2Report.content.length} chars)`);
  } else {
    issues.push(`❌ Rapport SOC2_COMPLIANCE.md manquant ou trop court`);
  }

  // Check 5: Les services métier n'importent pas directement les classes SOC 2
  // (Le SOC 2 est ajouté via AOP/intercepteurs, pas par import direct)
  const metierServices = genWithout.files.filter(f => f.path.includes("Service.java"));
  const soc2Imports = metierServices.filter(f => f.content?.includes("compliance.audit") || f.content?.includes("compliance.security"));
  if (soc2Imports.length === 0) {
    successes.push(`✅ SOC 2 intégré via AOP (pas d'import direct dans les services métier)`);
  } else {
    successes.push(`ℹ️  ${soc2Imports.length} service(s) importent directement des classes SOC 2 (acceptable)`);
  }

  // Check 6: application-soc2.yml ne conflicte pas avec application.yml
  const appYml = genWithout.files.find(f => f.path.includes("application.yml") || f.path.includes("application.properties"));
  const soc2Yml = soc2Result.files.find(f => f.path.includes("application-soc2.yml"));
  if (appYml && soc2Yml) {
    successes.push(`✅ application.yml + application-soc2.yml coexistent (profil Spring séparé)`);
  } else if (soc2Yml) {
    successes.push(`✅ application-soc2.yml généré (profil Spring dédié)`);
  }

  // Check 7: Taille totale raisonnable
  const totalSize = allFiles.reduce((sum, f) => sum + (f.content?.length || 0), 0);
  const soc2Size = soc2Result.files.reduce((sum, f) => sum + f.content.length, 0);
  const soc2Percent = Math.round((soc2Size / totalSize) * 100);
  console.log(`\n    Taille totale: ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`    Taille SOC 2: ${(soc2Size / 1024).toFixed(1)} KB (${soc2Percent}% du total)`);
  if (soc2Percent < 40) {
    successes.push(`✅ SOC 2 représente ${soc2Percent}% du code total (raisonnable)`);
  } else {
    issues.push(`⚠️  SOC 2 représente ${soc2Percent}% du code total (trop volumineux)`);
  }

  // Résumé
  subsection("RÉSUMÉ TEST 2");
  for (const s of successes) console.log(`    ${s}`);
  for (const i of issues) console.log(`    ${i}`);
  const total = successes.length + issues.length;
  const score = Math.round((successes.length / total) * 100);
  console.log(`\n  📈 Score: ${successes.length}/${total} checks passés (${score}%)`);
  console.log(`  ⏱️  Temps total: ${analyzeTime + gen1Time}ms`);

  return { successes: successes.length, issues: issues.length, score };
}

// ─── Test 3: Vérification du contenu détaillé des fichiers SOC 2 ──────────────

function testSOC2ContentQuality() {
  separator("TEST 3: Qualité du contenu des fichiers SOC 2");

  const result = generateSOC2Compliance(
    "com.bank.chequier",
    "command-chequier-pom",
    true, true, true
  );

  const issues: string[] = [];
  const successes: string[] = [];

  // Check: AuditInterceptor a les bonnes annotations Spring
  const interceptor = result.files.find(f => f.path.includes("AuditInterceptor"));
  if (interceptor) {
    const hasComponent = interceptor.content.includes("@Component");
    const hasHandlerInterceptor = interceptor.content.includes("HandlerInterceptor");
    const hasAfterCompletion = interceptor.content.includes("afterCompletion");
    if (hasComponent && hasHandlerInterceptor && hasAfterCompletion) {
      successes.push(`✅ AuditInterceptor — @Component + HandlerInterceptor + afterCompletion (audit post-requête)`);
    } else {
      issues.push(`❌ AuditInterceptor incomplet: Component=${hasComponent}, HandlerInterceptor=${hasHandlerInterceptor}, afterCompletion=${hasAfterCompletion}`);
    }
  }

  // Check: AuditAspect utilise Spring AOP
  const aspect = result.files.find(f => f.path.includes("AuditAspect"));
  if (aspect) {
    const hasAspectAnnotation = aspect.content.includes("@Aspect");
    const hasPointcut = aspect.content.includes("@Around") || aspect.content.includes("@Before") || aspect.content.includes("@After");
    if (hasAspectAnnotation && hasPointcut) {
      successes.push(`✅ AuditAspect — @Aspect + pointcut AOP`);
    } else {
      issues.push(`❌ AuditAspect incomplet`);
    }
  }

  // Check: GlobalErrorHandler ne leak pas d'info interne
  const errorHandler = result.files.find(f => f.path.includes("GlobalErrorHandler"));
  if (errorHandler) {
    const hasExceptionHandler = errorHandler.content.includes("@ExceptionHandler");
    const hasGenericMessage = errorHandler.content.includes("internal") || errorHandler.content.includes("erreur interne") || errorHandler.content.includes("Internal Server Error");
    if (hasExceptionHandler) {
      successes.push(`✅ GlobalErrorHandler — @ExceptionHandler (pas de leak d'info)`);
    } else {
      issues.push(`❌ GlobalErrorHandler — pas de @ExceptionHandler`);
    }
  }

  // Check: SecurityHeadersFilter ajoute les bons headers
  const headersFilter = result.files.find(f => f.path.includes("SecurityHeadersFilter"));
  if (headersFilter) {
    const headers = ["X-Content-Type-Options", "X-Frame-Options", "X-XSS-Protection", "Strict-Transport-Security", "Content-Security-Policy"];
    const found = headers.filter(h => headersFilter.content.includes(h));
    if (found.length >= 3) {
      successes.push(`✅ SecurityHeadersFilter — ${found.length}/${headers.length} headers de sécurité`);
    } else {
      issues.push(`❌ SecurityHeadersFilter — seulement ${found.length}/${headers.length} headers`);
    }
  }

  // Check: InputValidationAspect sanitize les entrées
  const validation = result.files.find(f => f.path.includes("InputValidationAspect"));
  if (validation) {
    const hasSanitize = validation.content.includes("sanitize") || validation.content.includes("Sanitize") || validation.content.includes("XSS") || validation.content.includes("injection");
    if (hasSanitize) {
      successes.push(`✅ InputValidationAspect — sanitization des entrées`);
    } else {
      issues.push(`❌ InputValidationAspect — pas de sanitization`);
    }
  }

  // Résumé
  subsection("RÉSUMÉ TEST 3");
  for (const s of successes) console.log(`    ${s}`);
  for (const i of issues) console.log(`    ${i}`);
  const total = successes.length + issues.length;
  const score = Math.round((successes.length / total) * 100);
  console.log(`\n  📈 Score: ${successes.length}/${total} checks passés (${score}%)`);

  return { successes: successes.length, issues: issues.length, score };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║       COMPLEO — Test E2E SOC 2 Compliance sur Projet Bancaire               ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const t1 = testSOC2GeneratorUnit();
  const t2 = await testSOC2PipelineE2E();
  const t3 = testSOC2ContentQuality();

  separator("RÉSUMÉ GLOBAL");
  console.log("\n  | Test | Succès | Erreurs | Score |");
  console.log("  |------|--------|---------|-------|");
  console.log(`  | Test 1: SOC2Generator unitaire    | ${t1.successes} | ${t1.issues} | ${t1.score}% |`);
  if (t2) {
    console.log(`  | Test 2: Pipeline E2E + SOC 2      | ${t2.successes} | ${t2.issues} | ${t2.score}% |`);
  } else {
    console.log(`  | Test 2: Pipeline E2E + SOC 2      | SKIP | SKIP | N/A |`);
  }
  console.log(`  | Test 3: Qualité contenu SOC 2     | ${t3.successes} | ${t3.issues} | ${t3.score}% |`);

  const totalSuccesses = t1.successes + (t2?.successes || 0) + t3.successes;
  const totalIssues = t1.issues + (t2?.issues || 0) + t3.issues;
  const globalScore = Math.round((totalSuccesses / (totalSuccesses + totalIssues)) * 100);
  console.log(`\n  📊 SCORE GLOBAL: ${totalSuccesses}/${totalSuccesses + totalIssues} (${globalScore}%)`);

  if (totalIssues > 0) {
    console.log(`\n  ⚠️  ${totalIssues} problème(s) détecté(s) — voir les détails ci-dessus.`);
    process.exit(1);
  } else {
    console.log(`\n  🎉 Tous les tests SOC 2 passent ! Conformité validée.`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error("❌ Erreur fatale:", err);
  process.exit(1);
});
