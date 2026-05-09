/**
 * Audit nexabank-core — Vérifie les 18 patterns avec le moteur v12.3
 * Score /100 : 5 pts par pattern (90 pts) + 10 pts bugs critiques absents
 */
import * as fs from "fs";
import * as path from "path";
import { CompleoEngine } from "./server/engine/CompleoEngine";
import { DynamicOptionsResolver } from "./server/engine/frontend/DynamicOptionsResolver";
import { detectSagaCandidates } from "./server/engine/saga/saga-detector";
import { runPostGenerationMigration } from "./server/engine/migration/PostGenerationMigrator";

const PROJECT_DIR = "/tmp/nexabank-core";
const OUTPUT_FILE = "/tmp/nexabank-audit-results.json";

interface PatternAudit {
  id: number;
  pattern: string;
  status: "OK" | "PARTIAL" | "KO" | "EXCLUDED";
  score: number; // 0-5
  details: string;
  evidence?: string;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  AUDIT NEXABANK-CORE — Moteur v12.3");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const startTime = Date.now();

  // 1. Load all source files (Java + JSP + XML)
  const javaFiles: Array<{ path: string; content: string }> = [];
  const allSourceFiles: Array<{ path: string; content: string }> = [];
  function walkDir(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(fullPath);
      else if (entry.name.endsWith(".java")) {
        const f = { path: fullPath.replace(PROJECT_DIR + "/", ""), content: fs.readFileSync(fullPath, "utf-8") };
        javaFiles.push(f);
        allSourceFiles.push(f);
      } else if (entry.name.endsWith(".jsp") || entry.name.endsWith(".jspx") || entry.name.endsWith(".xml")) {
        allSourceFiles.push({ path: fullPath.replace(PROJECT_DIR + "/", ""), content: fs.readFileSync(fullPath, "utf-8") });
      }
    }
  }
  walkDir(PROJECT_DIR);
  console.log(`📁 Fichiers Java chargés: ${javaFiles.length}`);
  console.log(`📁 Fichiers totaux (Java+JSP+XML): ${allSourceFiles.length}`);

  // 2. Run engine analysis
  const engine = new CompleoEngine();
  // Pass all source files (Java + JSP + XML) to the engine for full detection
  const analysis = await engine.analyze(allSourceFiles);
  console.log(`\n📊 Analyse terminée:`);
  const techs = analysis.multiTech.technologiesDetected;
  console.log(`   Technologies: ${techs.join(", ")}`);
  console.log(`   Use Cases: ${analysis.ir.useCases?.length || 0}`);
  console.log(`   Entities: ${analysis.detectedEntities?.length || 0}`);
  console.log(`   DTOs: ${analysis.detectedDTOs?.length || 0}`);
  console.log(`   Score maturité: ${analysis.maturityScore?.global || 0}/100`);

  // 3. Run generation
  const generated = await engine.generate(analysis.ir, undefined, undefined, analysis.multiTech?.generatedFiles);
  console.log(`\n🔧 Génération terminée: ${generated.files.length} fichiers`);

  // 4. Run DynamicOptionsResolver
  const resolver = new DynamicOptionsResolver();
  const options = resolver.resolve({
    technologiesDetected: analysis.multiTech.technologiesDetected,
    detectedComponents: analysis.multiTech.detectedComponents as any,
    aiInsights: (analysis as any).aiInsights || null,
    sourceFiles: allSourceFiles,
  });
  const optionsList = Array.isArray(options) ? options : (options as any).options || [];
  const hasFrontendOption = optionsList.some((o: any) => o.id === 'frontend');
  const hasSagaOption = optionsList.some((o: any) => o.id === 'saga' || o.id === 'saga_pattern');
  const domainOption = optionsList.find((o: any) => o.id === 'domain' || o.category === 'domain');
  console.log(`\n⚙️ Options proposées (${optionsList.length} total):`);
  console.log(`   Frontend: ${hasFrontendOption}`);
  console.log(`   Saga: ${hasSagaOption}`);
  console.log(`   Domain: ${domainOption?.label || 'N/A'}`);
  for (const opt of optionsList) { console.log(`   - [${(opt as any).category}] ${(opt as any).id}: ${(opt as any).label}`); }

  // 5. Run Saga detection
  const sagaCandidates = detectSagaCandidates(analysis.ir);
  console.log(`\n🔄 Saga candidates: ${sagaCandidates.length}`);
  for (const sc of sagaCandidates) {
    console.log(`   - ${(sc as any).className || (sc as any).name} (${(sc as any).steps || (sc as any).ejbDependencies?.length || 0} deps, score: ${(sc as any).score || 'N/A'})`);
  }

  // 6. Run PostGenerationMigration
  const allFiles = [...generated.files, ...(generated.multiTechFiles || [])];
  const postMigrationResult = await runPostGenerationMigration(allFiles, analysis.ir, javaFiles, { skipLLM: true });
  console.log(`\n🔄 PostMigration: ${postMigrationResult.todosReplaced}/${postMigrationResult.todosFound} TODOs remplacés`);

  // 7. Audit each pattern
  const audits: PatternAudit[] = [];
  const allGeneratedContent = allFiles.map(f => f.content).join("\n");
  const allGeneratedPaths = allFiles.map(f => f.path);
  const postMigratedContent = (postMigrationResult.files || []).map((f: any) => f.content).join("\n");
  const postMigratedPaths = (postMigrationResult.files || []).map((f: any) => f.path);

  // Pattern 1: EJB Stateless 12 steps → @Service + @Transactional
  {
    const loanService = allFiles.find(f => f.path.toLowerCase().includes("loan") && f.path.includes("Service"));
    const hasTransactional = loanService?.content.includes("@Transactional") || false;
    const hasService = loanService?.content.includes("@Service") || false;
    const hasSteps = loanService?.content.includes("validateIdentity") || loanService?.content.includes("creditScoring") || false;
    const status = hasService && hasTransactional ? (hasSteps ? "OK" : "PARTIAL") : "KO";
    audits.push({
      id: 1, pattern: "EJB Stateless 12 steps (LoanOriginationEJB)",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `@Service=${hasService}, @Transactional=${hasTransactional}, steps=${hasSteps}`,
      evidence: loanService?.path
    });
  }

  // Pattern 2: EJB Saga-eligible 14 steps → Saga DÉTECTÉE
  {
    const sagaDetected = sagaCandidates.some((s: any) => ((s.className || s.name) || '').toLowerCase().includes("transfer") || (s.ejbDependencies?.length || 0) >= 5);
    const sagaProposed = hasSagaOption;
    const status = sagaDetected && sagaProposed ? "OK" : sagaDetected || sagaProposed ? "PARTIAL" : "KO";
    audits.push({
      id: 2, pattern: "EJB Saga-eligible 14 steps (InternationalTransferEJB)",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `sagaDetected=${sagaDetected}, sagaProposed=${sagaProposed}, candidates=${sagaCandidates.length}`,
      evidence: sagaCandidates.map((s: any) => `${s.className || s.name}(${s.ejbDependencies?.length || 0} deps)`).join(", ")
    });
  }

  // Pattern 3: Handler/Strategy → Consolidé ou préservé (PAS 5 services mécaniques)
  {
    const handlerServices = allFiles.filter(f => f.path.toLowerCase().includes("handler") && f.path.includes("Service"));
    const handlerCount = handlerServices.length;
    const factoryMigrated = allFiles.some(f => f.path.toLowerCase().includes("payment") && f.content.includes("@Service"));
    // KO si 5 services mécaniques créés, OK si consolidé en 1-2
    const status = handlerCount >= 4 ? "KO" : handlerCount <= 2 && factoryMigrated ? "OK" : "PARTIAL";
    audits.push({
      id: 3, pattern: "Handler/Strategy 5 handlers + Factory",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `handlerServices=${handlerCount}, factoryMigrated=${factoryMigrated}`,
      evidence: handlerServices.map(f => f.path).join(", ")
    });
  }

  // Pattern 4: Façade dispatcher → EXCLUE
  {
    const facadeInServices = allFiles.some(f => f.path.toLowerCase().includes("consultation") && f.path.toLowerCase().includes("service"));
    const facadeInAdapters = allFiles.some(f => f.path.toLowerCase().includes("consultation") && f.path.toLowerCase().includes("adapter"));
    const excluded = !facadeInServices && !facadeInAdapters;
    // OK si exclue, KO si migrée comme service
    const status = excluded ? "OK" : facadeInServices ? "KO" : "PARTIAL";
    audits.push({
      id: 4, pattern: "Façade dispatcher (ConsultationGatewayEJB)",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `excluded=${excluded}, inServices=${facadeInServices}, inAdapters=${facadeInAdapters}`,
      evidence: allFiles.filter(f => f.path.toLowerCase().includes("consultation")).map(f => f.path).join(", ")
    });
  }

  // Pattern 5: Framework AppLog → Remplacé par SLF4J
  {
    const appLogRefs = allGeneratedContent.match(/AppLog\.\w+/g) || [];
    const slf4jRefs = allGeneratedContent.match(/log\.(info|error|warn|debug)/g) || [];
    const hasSlf4jImport = allGeneratedContent.includes("org.slf4j") || allGeneratedContent.includes("@Slf4j") || allGeneratedContent.includes("LoggerFactory");
    const status = appLogRefs.length === 0 && (slf4jRefs.length > 0 || hasSlf4jImport) ? "OK" :
      appLogRefs.length > 0 && slf4jRefs.length > 0 ? "PARTIAL" : "KO";
    audits.push({
      id: 5, pattern: "Framework AppLog → SLF4J",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `AppLog refs remaining=${appLogRefs.length}, SLF4J refs=${slf4jRefs.length}, hasSlf4jImport=${hasSlf4jImport}`,
      evidence: `AppLog occurrences: ${appLogRefs.slice(0, 5).join(", ")}`
    });
  }

  // Pattern 6: Framework PlatformRollbackException → Supprimé/remplacé
  {
    const platformExRefs = allGeneratedContent.match(/PlatformRollbackException/g) || [];
    const hasStandardEx = allGeneratedContent.includes("RuntimeException") || allGeneratedContent.includes("ResponseStatusException");
    const status = platformExRefs.length === 0 ? "OK" : platformExRefs.length <= 2 ? "PARTIAL" : "KO";
    audits.push({
      id: 6, pattern: "Framework PlatformRollbackException → Standard exception",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `PlatformRollbackException refs=${platformExRefs.length}, hasStandardEx=${hasStandardEx}`,
      evidence: `Occurrences: ${platformExRefs.length}`
    });
  }

  // Pattern 7: Framework ServiceStrategie → Détecté + traité
  {
    const serviceStrategieRefs = allGeneratedContent.match(/ServiceStrategie/g) || [];
    const hasStrategyPattern = allGeneratedContent.includes("Strategy") || allGeneratedContent.includes("@Component");
    const status = serviceStrategieRefs.length === 0 && hasStrategyPattern ? "OK" :
      serviceStrategieRefs.length > 0 ? "PARTIAL" : "KO";
    audits.push({
      id: 7, pattern: "Framework ServiceStrategie → Spring pattern",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `ServiceStrategie refs=${serviceStrategieRefs.length}, hasStrategyPattern=${hasStrategyPattern}`,
    });
  }

  // Pattern 8: JMS @MessageDriven → @JmsListener
  {
    const hasJmsListener = allGeneratedContent.includes("@JmsListener") || allGeneratedContent.includes("@KafkaListener");
    const hasMessageDriven = allGeneratedContent.includes("@MessageDriven");
    const listenerFile = allFiles.find(f => f.path.toLowerCase().includes("listener") || f.path.toLowerCase().includes("swift"));
    const status = hasJmsListener && !hasMessageDriven ? "OK" :
      hasJmsListener ? "PARTIAL" : "KO";
    audits.push({
      id: 8, pattern: "JMS @MessageDriven → @JmsListener",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `@JmsListener=${hasJmsListener}, @MessageDriven remaining=${hasMessageDriven}`,
      evidence: listenerFile?.path
    });
  }

  // Pattern 9: JMS Producer → JmsTemplate
  {
    const hasJmsTemplate = allGeneratedContent.includes("JmsTemplate") || allGeneratedContent.includes("jmsTemplate");
    const hasOldJms = allGeneratedContent.includes("javax.jms.ConnectionFactory") && !allGeneratedContent.includes("JmsTemplate");
    const producerFile = allFiles.find(f => f.path.toLowerCase().includes("producer") || f.path.toLowerCase().includes("notification"));
    const status = hasJmsTemplate ? "OK" : hasOldJms ? "KO" : "PARTIAL";
    audits.push({
      id: 9, pattern: "JMS Producer → JmsTemplate",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `JmsTemplate=${hasJmsTemplate}, oldJMS=${hasOldJms}`,
      evidence: producerFile?.path
    });
  }

  // Pattern 10: File Batch @Schedule → @Scheduled / Spring Batch
  {
    const hasScheduled = allGeneratedContent.includes("@Scheduled") || allGeneratedContent.includes("@EnableScheduling");
    const hasBatchFile = allFiles.some(f => f.path.toLowerCase().includes("batch") || f.path.toLowerCase().includes("reconciliation"));
    const status = hasScheduled && hasBatchFile ? "OK" : hasBatchFile ? "PARTIAL" : "KO";
    audits.push({
      id: 10, pattern: "File Batch @Schedule → @Scheduled / Spring Batch",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `@Scheduled=${hasScheduled}, batchFile=${hasBatchFile}`,
      evidence: allFiles.filter(f => f.path.toLowerCase().includes("batch") || f.path.toLowerCase().includes("reconciliation")).map(f => f.path).join(", ")
    });
  }

  // Pattern 11: DAO God Class JDBC → Découpé en Repositories
  {
    const repoFiles = allFiles.filter(f => f.path.toLowerCase().includes("repository"));
    const hasJpaRepo = allGeneratedContent.includes("JpaRepository") || allGeneratedContent.includes("CrudRepository");
    const daoStillExists = allFiles.some(f => f.path.toLowerCase().includes("corebankingdao"));
    const status = repoFiles.length >= 2 && hasJpaRepo ? "OK" :
      repoFiles.length >= 1 ? "PARTIAL" : "KO";
    audits.push({
      id: 11, pattern: "DAO God Class JDBC → Repositories",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `repositories=${repoFiles.length}, hasJpaRepo=${hasJpaRepo}, daoStillExists=${daoStillExists}`,
      evidence: repoFiles.map(f => f.path).join(", ")
    });
  }

  // Pattern 12: Multi-DataSource → 3 DataSources configurés
  {
    const hasMultiDs = allGeneratedContent.includes("DataSource") || allGeneratedContent.includes("datasource");
    const dsCount = (allGeneratedContent.match(/(loan|ledger|swift).*[Dd]ata[Ss]ource/gi) || []).length;
    const hasConfig = allFiles.some(f => f.path.toLowerCase().includes("datasource") || f.path.toLowerCase().includes("database"));
    const status = dsCount >= 2 ? "OK" : hasMultiDs ? "PARTIAL" : "KO";
    audits.push({
      id: 12, pattern: "Multi-DataSource (3 DS)",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `dsCount=${dsCount}, hasMultiDs=${hasMultiDs}, hasConfig=${hasConfig}`,
    });
  }

  // Pattern 13: JSP + JSTL → Frontend proposé
  {
    const frontendProposed = hasFrontendOption;
    const hasJspDetected = techs.includes("JSP") || techs.includes("SERVLET");
    const status = frontendProposed ? "OK" : hasJspDetected ? "PARTIAL" : "KO";
    audits.push({
      id: 13, pattern: "JSP + JSTL + jQuery → Frontend proposé",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `frontendProposed=${frontendProposed}, jspDetected=${hasJspDetected}`,
    });
  }

  // Pattern 14: setRollbackOnly() → TransactionAspectSupport
  {
    const hasOldRollback = allGeneratedContent.includes("setRollbackOnly");
    const hasNewRollback = allGeneratedContent.includes("TransactionAspectSupport") || allGeneratedContent.includes("@Transactional(rollbackFor");
    const status = !hasOldRollback && hasNewRollback ? "OK" :
      hasNewRollback ? "PARTIAL" : hasOldRollback ? "KO" : "PARTIAL";
    audits.push({
      id: 14, pattern: "setRollbackOnly() → TransactionAspectSupport",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `oldRollback=${hasOldRollback}, newRollback=${hasNewRollback}`,
    });
  }

  // Pattern 15: Tests JUnit → EXCLUS
  {
    const testInServices = allFiles.some(f => f.path.includes("Test") && f.path.includes("service/"));
    const testGenerated = allFiles.some(f => f.path.includes("Test.java") && !f.path.includes("test/"));
    // OK si tests exclus du package service, KO si migrés comme services
    const status = !testInServices && !testGenerated ? "OK" : testInServices ? "KO" : "PARTIAL";
    audits.push({
      id: 15, pattern: "Tests JUnit → EXCLUS",
      status: "EXCLUDED", score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `testInServices=${testInServices}, testGenerated=${testGenerated}`,
    });
  }

  // Pattern 16: Utility classes → NON migrées comme @Service
  {
    const utilAsService = allFiles.some(f => 
      (f.path.toLowerCase().includes("util") || f.path.toLowerCase().includes("currency") || f.path.toLowerCase().includes("iban")) &&
      f.path.includes("service/") && f.content.includes("@Service")
    );
    const status = !utilAsService ? "OK" : "KO";
    audits.push({
      id: 16, pattern: "Utility classes → NON migrées comme @Service",
      status: "EXCLUDED", score: status === "OK" ? 5 : 0,
      details: `utilAsService=${utilAsService}`,
    });
  }

  // Pattern 17: Models → Conservés DTO/Entity
  {
    const modelFiles = allFiles.filter(f => f.path.toLowerCase().includes("model") || f.path.toLowerCase().includes("entity") || f.path.toLowerCase().includes("dto"));
    const hasEntity = allGeneratedContent.includes("@Entity") || modelFiles.length > 0;
    const status = modelFiles.length >= 3 ? "OK" : modelFiles.length >= 1 ? "PARTIAL" : "KO";
    audits.push({
      id: 17, pattern: "Models (6) → Conservés DTO/Entity",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `modelFiles=${modelFiles.length}, hasEntity=${hasEntity}`,
      evidence: modelFiles.map(f => f.path).join(", ")
    });
  }

  // Pattern 18: Exceptions → Conservées
  {
    const exceptionFiles = allFiles.filter(f => f.path.toLowerCase().includes("exception"));
    const hasCustomExceptions = exceptionFiles.length >= 3;
    const status = hasCustomExceptions ? "OK" : exceptionFiles.length >= 1 ? "PARTIAL" : "KO";
    audits.push({
      id: 18, pattern: "Exceptions (5) → Conservées",
      status, score: status === "OK" ? 5 : status === "PARTIAL" ? 3 : 0,
      details: `exceptionFiles=${exceptionFiles.length}`,
      evidence: exceptionFiles.map(f => f.path).join(", ")
    });
  }

  // 8. Check known bugs
  const knownBugs: Array<{ bug: string; found: boolean; evidence: string }> = [];

  // Bug: Imports commentés
  const commentedImports = (allGeneratedContent.match(/\/\/ import /g) || []).length;
  knownBugs.push({ bug: "Imports commentés au lieu de résolus", found: commentedImports > 0, evidence: `${commentedImports} occurrences` });

  // Bug: Saga non déclenchée malgré JMS+TX
  knownBugs.push({ bug: "Saga non déclenchée malgré JMS+TX", found: sagaCandidates.length === 0, evidence: `${sagaCandidates.length} candidates` });

  // Bug: Tests JUnit migrés comme services
  const testsAsServices = allFiles.filter(f => f.path.includes("Test") && f.path.includes("service/"));
  knownBugs.push({ bug: "Tests JUnit migrés comme services", found: testsAsServices.length > 0, evidence: testsAsServices.map(f => f.path).join(", ") });

  // Bug: Façades migrées comme services (only ConsultationGateway is a real facade/dispatcher)
  // SwiftGateway is a legitimate service (sends SWIFT MT103 messages) — NOT a facade
  const facadesAsServices = allFiles.filter(f => 
    f.path.toLowerCase().includes("consultationgateway") && f.path.includes("service/")
  );
  knownBugs.push({ bug: "Façades migrées comme services", found: facadesAsServices.length > 0, evidence: facadesAsServices.map(f => f.path).join(", ") });

  // Bug: Handlers → 1 service mécanique chacun
  const handlerAsServices = allFiles.filter(f => f.path.toLowerCase().includes("handler") && f.path.includes("Service"));
  knownBugs.push({ bug: "Handlers chacun → 1 service mécanique", found: handlerAsServices.length >= 4, evidence: `${handlerAsServices.length} handler services` });

  // Bug: AppLog → stubs au lieu de SLF4J
  const appLogStubs = (allGeneratedContent.match(/AppLog\.\w+/g) || []).length;
  knownBugs.push({ bug: "AppLog → stubs au lieu de SLF4J", found: appLogStubs > 0, evidence: `${appLogStubs} AppLog refs remaining` });

  // Bug: Handlers ignorés
  const handlersIgnored = !allFiles.some(f => f.path.toLowerCase().includes("handler") || f.path.toLowerCase().includes("payment"));
  knownBugs.push({ bug: "Handlers ignorés (non migrés)", found: handlersIgnored, evidence: handlersIgnored ? "Aucun handler dans la sortie" : "Handlers présents" });

  // 9. Calculate final score
  const patternScore = audits.reduce((sum, a) => sum + a.score, 0);
  const bugsFound = knownBugs.filter(b => b.found).length;
  const bugPenalty = Math.min(10, bugsFound * 2); // -2 par bug trouvé, max -10
  const finalScore = patternScore - bugPenalty;

  const elapsed = Date.now() - startTime;

  // 10. Print results
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  RÉSULTATS AUDIT");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("┌────┬──────────────────────────────────────────────────┬────────┬───────┐");
  console.log("│ #  │ Pattern                                          │ Status │ Score │");
  console.log("├────┼──────────────────────────────────────────────────┼────────┼───────┤");
  for (const a of audits) {
    const icon = a.status === "OK" ? "✅" : a.status === "PARTIAL" ? "⚠️" : a.status === "EXCLUDED" ? "🚫" : "❌";
    console.log(`│ ${String(a.id).padStart(2)} │ ${(a.pattern).slice(0, 48).padEnd(48)} │ ${icon}${a.status.padEnd(5)}│  ${a.score}/5  │`);
  }
  console.log("└────┴──────────────────────────────────────────────────┴────────┴───────┘");

  console.log(`\n📊 Score patterns: ${patternScore}/90`);
  console.log(`🐛 Bugs connus trouvés: ${bugsFound}/7 (pénalité: -${bugPenalty})`);
  console.log(`\n🏆 SCORE FINAL: ${finalScore}/100`);
  console.log(`⏱️ Temps d'exécution: ${elapsed}ms`);

  console.log("\n─── Bugs connus ───");
  for (const b of knownBugs) {
    console.log(`  ${b.found ? "❌" : "✅"} ${b.bug}: ${b.evidence}`);
  }

  // 11. Save results
  const results = {
    version: "v12.3",
    project: "nexabank-core",
    timestamp: new Date().toISOString(),
    executionTimeMs: elapsed,
    analysis: {
      technologies: techs,
      useCases: analysis.ir.useCases?.length || 0,
      entities: analysis.detectedEntities,
      dtos: analysis.detectedDTOs,
      maturityScore: analysis.maturityScore,
    },
    generation: {
      totalFiles: allFiles.length,
      filesByCategory: {
        services: allFiles.filter(f => f.path.includes("service/")).length,
        controllers: allFiles.filter(f => f.path.includes("controller/")).length,
        repositories: allFiles.filter(f => f.path.includes("repository/") || f.path.includes("Repository")).length,
        models: allFiles.filter(f => f.path.includes("model/") || f.path.includes("entity/")).length,
        config: allFiles.filter(f => f.path.includes("config/") || f.path.includes("application")).length,
        tests: allFiles.filter(f => f.path.includes("test/") || f.path.includes("Test")).length,
        docker: allFiles.filter(f => f.path.includes("Docker") || f.path.includes("docker")).length,
        docs: allFiles.filter(f => f.path.includes(".md") || f.path.includes("doc")).length,
      }
    },
    options: { list: optionsList, frontend: hasFrontendOption, saga: hasSagaOption },
    sagaCandidates: sagaCandidates,
    postMigration: postMigrationResult,
    audits: audits,
    knownBugs: knownBugs,
    score: {
      patterns: patternScore,
      bugPenalty: bugPenalty,
      final: finalScore,
    },
    generatedFiles: allFiles.map(f => ({ path: f.path, loc: f.content.split("\n").length })),
    sampleOutputs: allFiles.slice(0, 10).map(f => ({ path: f.path, content: f.content.substring(0, 500) })),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n💾 Résultats sauvegardés: ${OUTPUT_FILE}`);
}

main().catch(e => { console.error("ERREUR:", e); process.exit(1); });
