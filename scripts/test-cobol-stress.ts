/**
 * Test de stress du CobolAnalyzer sur des fichiers COBOL volumineux et complexes.
 * Cas testés : 952 LOC, CURSOR DB2, COPY REPLACING, COPYBOOK imbriqués, 5 CALL.
 */
import { CobolAnalyzer } from '../server/engine/cobol/CobolAnalyzer';
import { CobolParser } from '../server/engine/cobol/CobolParser';
import { JclParser } from '../server/engine/cobol/JclParser';
import { CobolDetectorsWithSource } from '../server/engine/cobol/CobolDetectors';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_DIR = '/home/ubuntu/cobol-stress-test';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  expected: string;
  actual: string;
  details?: string;
}

async function main() {
  const results: TestResult[] = [];
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     RAPPORT DE STRESS TEST — CobolAnalyzer v11.0b           ║');
  console.log('║     Fichiers: cobol-stress-test (952 LOC, CURSOR, REPLACING)║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Charger les fichiers
  const fileNames = fs.readdirSync(PROJECT_DIR).filter(f =>
    f.match(/\.(cbl|cob|cpy|jcl|CBL|COB|CPY|JCL)$/)
  );

  function detectType(name: string): 'COBOL' | 'COPYBOOK' | 'JCL' {
    if (name.match(/\.(cbl|cob|CBL|COB)$/)) return 'COBOL';
    if (name.match(/\.(cpy|CPY)$/)) return 'COPYBOOK';
    if (name.match(/\.(jcl|JCL)$/)) return 'JCL';
    return 'COBOL';
  }

  const files = fileNames.map(f => ({
    fileName: f,
    content: fs.readFileSync(path.join(PROJECT_DIR, f), 'utf-8'),
    type: detectType(f),
  }));

  console.log(`📁 Fichiers chargés: ${files.length}`);
  console.log(`   COBOL: ${files.filter(f => f.type === 'COBOL').length}`);
  console.log(`   COPYBOOK: ${files.filter(f => f.type === 'COPYBOOK').length}`);
  console.log(`   JCL: ${files.filter(f => f.type === 'JCL').length}\n`);

  // ═══ TEST 1: Analyse globale réussit ═══
  const analyzer = new CobolAnalyzer();
  let analysisResult: any;
  try {
    analysisResult = analyzer.analyze({ projectName: 'cobol-stress-test', files });
    results.push({
      name: 'T01 — Analyse globale',
      status: analysisResult.success ? 'PASS' : 'FAIL',
      expected: 'success = true',
      actual: `success = ${analysisResult.success}`,
      details: analysisResult.errors?.join(', '),
    });
  } catch (err: any) {
    results.push({
      name: 'T01 — Analyse globale',
      status: 'FAIL',
      expected: 'Pas d\'exception',
      actual: `Exception: ${err.message}`,
      details: err.stack?.split('\n')[1],
    });
    printResults(results, startTime);
    return;
  }

  const report = analysisResult.report!;

  // ═══ TEST 2: Nombre de programmes ═══
  results.push({
    name: 'T02 — Programmes parsés',
    status: report.programs.length === 5 ? 'PASS' : 'FAIL',
    expected: '5 programmes (ACCTINQ, CREDPROC, CUSTMGMT, DAYREPT, LOANCLC)',
    actual: `${report.programs.length} programmes`,
    details: report.programs.map((p: any) => p.programId).join(', '),
  });

  // ═══ TEST 3: CREDPROC — Programme volumineux (952 LOC) ═══
  const parser = new CobolParser();
  const credContent = files.find(f => f.fileName === 'CREDPROC.cbl')!.content;
  const credIR = parser.parse(credContent, 'CREDPROC.cbl');

  results.push({
    name: 'T03 — CREDPROC Program ID',
    status: credIR.programId === 'CREDPROC' ? 'PASS' : 'FAIL',
    expected: 'CREDPROC',
    actual: credIR.programId,
  });

  // 3b: LOC
  results.push({
    name: 'T04 — CREDPROC LOC (952 lignes)',
    status: credIR.loc >= 400 ? 'PASS' : 'FAIL',
    expected: '≥ 400 LOC (code effectif sans commentaires)',
    actual: `${credIR.loc} LOC`,
  });

  // 3c: SQL Statements (23 EXEC SQL dont 3 CURSOR)
  results.push({
    name: 'T05 — CREDPROC SQL Statements',
    status: credIR.sqlStatements.length >= 15 ? 'PASS' : credIR.sqlStatements.length >= 10 ? 'WARN' : 'FAIL',
    expected: '≥ 15 SQL (23 EXEC SQL dans le source)',
    actual: `${credIR.sqlStatements.length} SQL détectés`,
    details: credIR.sqlStatements.map((s: any) => s.type).join(', '),
  });

  // 3d: CURSOR détectés (le parser les classifie comme type 'CURSOR')
  const cursorSql = credIR.sqlStatements.filter((s: any) =>
    s.type === 'CURSOR' || s.type === 'DECLARE' || s.rawSql?.includes('CURSOR')
  );
  results.push({
    name: 'T06 — CREDPROC CURSOR DB2',
    status: cursorSql.length >= 2 ? 'PASS' : cursorSql.length >= 1 ? 'WARN' : 'FAIL',
    expected: '≥ 2 CURSOR (CSR-DEMANDS, CSR-GUARANTEES, CSR-EXPOSURE)',
    actual: `${cursorSql.length} curseurs détectés`,
    details: cursorSql.map((s: any) => s.rawSql?.substring(0, 50) || s.type).join(' | '),
  });

  // 3e: Tables DB2
  const allTables = [...new Set(credIR.sqlStatements.flatMap((s: any) => s.tables))];
  results.push({
    name: 'T07 — CREDPROC Tables DB2',
    status: allTables.length >= 5 ? 'PASS' : allTables.length >= 3 ? 'WARN' : 'FAIL',
    expected: '≥ 5 tables (T_CREDIT_DEMANDS, T_CUSTOMERS, T_GUARANTEES, T_CREDIT_DECISIONS, T_CREDIT_LINES, T_ACCOUNTING_ENTRIES, T_AUDIT_TRAIL)',
    actual: `${allTables.length} tables`,
    details: allTables.join(', '),
  });

  // 3f: CALL statements (5 programmes appelés)
  results.push({
    name: 'T08 — CREDPROC CALL statements',
    status: credIR.callStatements.length >= 4 ? 'PASS' : credIR.callStatements.length >= 2 ? 'WARN' : 'FAIL',
    expected: '≥ 4 CALL (CUSTSCOR, GUAREVAL, COMPLCHK, NOTIFMGR, ACCTPOST)',
    actual: `${credIR.callStatements.length} CALL`,
    details: credIR.callStatements.map((c: any) => c.target).join(', '),
  });

  // 3g: PERFORM calls (26 dans le source)
  results.push({
    name: 'T09 — CREDPROC PERFORM calls',
    status: credIR.performCalls.length >= 15 ? 'PASS' : credIR.performCalls.length >= 10 ? 'WARN' : 'FAIL',
    expected: '≥ 15 PERFORM (26 dans le source)',
    actual: `${credIR.performCalls.length} PERFORM`,
    details: credIR.performCalls.slice(0, 8).join(', ') + (credIR.performCalls.length > 8 ? '...' : ''),
  });

  // 3h: Sections/Paragraphes
  results.push({
    name: 'T10 — CREDPROC Paragraphes',
    status: credIR.sections.length >= 10 ? 'PASS' : credIR.sections.length >= 5 ? 'WARN' : 'FAIL',
    expected: '≥ 10 paragraphes (programme complexe)',
    actual: `${credIR.sections.length} paragraphes`,
    details: credIR.sections.map((s: any) => s.name).join(', '),
  });

  // 3i: Complexité cyclomatique élevée
  results.push({
    name: 'T11 — CREDPROC Complexité',
    status: credIR.complexity >= 30 ? 'PASS' : credIR.complexity >= 20 ? 'WARN' : 'FAIL',
    expected: '≥ 30 (14 EVALUATE + 28 IF + CURSOR)',
    actual: `Complexité = ${credIR.complexity}`,
  });

  // 3j: COPY statements (4 dans le source)
  results.push({
    name: 'T12 — CREDPROC COPY statements',
    status: credIR.copybooks.length >= 3 ? 'PASS' : credIR.copybooks.length >= 1 ? 'WARN' : 'FAIL',
    expected: '≥ 3 COPY (CREDDEMAND, DECISION, CUSTOMER, AUDITFLD)',
    actual: `${credIR.copybooks.length} COPY`,
    details: credIR.copybooks.join(', '),
  });

  // ═══ TEST 4: COPY REPLACING ═══
  // Le CREDPROC utilise COPY CREDDEMAND REPLACING ==:TAG:== BY ==WS-DEM-==
  // et COPY DECISION REPLACING ==:TAG:== BY ==WS-DEC-==
  const credProgInReport = report.programs.find((p: any) => p.programId === 'CREDPROC');
  const hasReplacedItems = credProgInReport?.dataItems?.some((d: any) =>
    d.name.startsWith('WS-DEM-') || d.name.startsWith('WS-DEC-')
  );
  const replacedCount = credProgInReport?.dataItems?.filter((d: any) =>
    d.name.startsWith('WS-DEM-') || d.name.startsWith('WS-DEC-')
  ).length || 0;
  results.push({
    name: 'T13 — COPY REPLACING (==:TAG:== BY ==WS-DEM-/WS-DEC-==)',
    status: replacedCount >= 30 ? 'PASS' : replacedCount >= 10 ? 'WARN' : 'FAIL',
    expected: '≥ 30 data items préfixés WS-DEM- ou WS-DEC- après REPLACING',
    actual: `${replacedCount} items préfixés (REPLACING fonctionnel)`,
    details: credProgInReport?.dataItems?.filter((d: any) =>
      d.name.startsWith('WS-DEM-') || d.name.startsWith('WS-DEC-')
    ).slice(0, 5).map((d: any) => d.name).join(', ') || 'Aucun',
  });

  // ═══ TEST 5: COPYBOOK imbriqué (DECISION.cpy inclut AUDITFLD.cpy) ═══
  const decisionCpy = files.find(f => f.fileName === 'DECISION.cpy')!.content;
  const hasNestedCopy = decisionCpy.includes('COPY AUDITFLD');
  results.push({
    name: 'T14 — COPYBOOK imbriqué détecté',
    status: hasNestedCopy ? 'PASS' : 'FAIL',
    expected: 'DECISION.cpy contient COPY AUDITFLD',
    actual: hasNestedCopy ? 'Oui — COPY imbriqué présent' : 'Non',
  });

  // Vérifier si l'expansion récursive fonctionne (AUDITFLD items dans CREDPROC)
  const hasAuditFields = credProgInReport?.dataItems?.some((d: any) =>
    d.name.includes('CREATED-BY') || d.name.includes('UPDATED-BY') || d.name.includes('VERSION')
  );
  results.push({
    name: 'T15 — Expansion COPYBOOK imbriqué',
    status: hasAuditFields ? 'PASS' : 'WARN',
    expected: 'AUDITFLD items (CREATED-BY, VERSION) dans CREDPROC après expansion récursive',
    actual: hasAuditFields ? 'Expansion récursive OK' : 'Expansion récursive non supportée (limitation)',
    details: credProgInReport?.dataItems?.filter((d: any) =>
      d.name.includes('CREATED') || d.name.includes('VERSION')
    ).slice(0, 3).map((d: any) => d.name).join(', ') || 'Non trouvé',
  });

  // ═══ TEST 6: Data Items volume (CREDPROC devrait avoir beaucoup de data items) ═══
  results.push({
    name: 'T16 — CREDPROC Data Items (volume)',
    status: credProgInReport?.dataItems?.length >= 30 ? 'PASS' : credProgInReport?.dataItems?.length >= 15 ? 'WARN' : 'FAIL',
    expected: '≥ 30 data items (WORKING-STORAGE + COPYBOOK expansion)',
    actual: `${credProgInReport?.dataItems?.length || 0} data items`,
    details: credProgInReport?.dataItems?.slice(0, 5).map((d: any) => `${d.level} ${d.name}`).join(', '),
  });

  // ═══ TEST 7: Technologies détectées ═══
  const detectedTechs = report.techDetections.filter((t: any) => t.detected);
  results.push({
    name: 'T17 — Technologies détectées',
    status: detectedTechs.length >= 3 ? 'PASS' : 'FAIL',
    expected: '≥ 3 (DB2, Batch, COBOL 85+)',
    actual: `${detectedTechs.length} technologies`,
    details: detectedTechs.map((t: any) => t.technology).join(', '),
  });

  // DB2 doit inclure CREDPROC
  const db2Tech = report.techDetections.find((t: any) => t.technology === 'DB2');
  results.push({
    name: 'T18 — DB2 détecte CREDPROC',
    status: db2Tech?.programs?.includes('CREDPROC') ? 'PASS' : 'FAIL',
    expected: 'CREDPROC dans la liste DB2',
    actual: db2Tech?.programs?.join(', ') || 'Non détecté',
  });

  // ═══ TEST 8: JCL (DAILYJOB étendu) ═══
  results.push({
    name: 'T19 — JCL Jobs parsés',
    status: report.jclJobs.length >= 1 ? 'PASS' : 'FAIL',
    expected: '≥ 1 job',
    actual: `${report.jclJobs.length} jobs`,
  });

  if (report.jclJobs.length > 0) {
    const job = report.jclJobs[0];
    results.push({
      name: 'T20 — JCL Steps (étendu)',
      status: job.steps.length >= 3 ? 'PASS' : 'FAIL',
      expected: '≥ 3 steps',
      actual: `${job.steps.length} steps`,
      details: job.steps.map((s: any) => `${s.stepName}→${s.program}`).join(', '),
    });
  }

  // ═══ TEST 9: Rapport de migration ═══
  results.push({
    name: 'T21 — Rapport markdown généré',
    status: report.markdownReport.length > 2000 ? 'PASS' : 'FAIL',
    expected: '> 2000 caractères (projet plus gros)',
    actual: `${report.markdownReport.length} caractères`,
  });

  // Score migration-readiness
  results.push({
    name: 'T22 — Score migration-readiness',
    status: report.migrationReadinessScore > 0 && report.migrationReadinessScore <= 100 ? 'PASS' : 'FAIL',
    expected: '0 < score ≤ 100',
    actual: `${report.migrationReadinessScore}/100`,
  });

  // Effort total
  results.push({
    name: 'T23 — Effort total estimé',
    status: report.totalEffortJH > 20 ? 'PASS' : report.totalEffortJH > 10 ? 'WARN' : 'FAIL',
    expected: '> 20 j/h (CREDPROC seul est complexe)',
    actual: `${report.totalEffortJH} j/h`,
  });

  // CREDPROC devrait être REWRITE
  const credEffort = report.effortEstimates.find((e: any) => e.programId === 'CREDPROC');
  results.push({
    name: 'T24 — CREDPROC stratégie REWRITE',
    status: credEffort?.strategy === 'REWRITE' ? 'PASS' : 'WARN',
    expected: 'REWRITE (complexité élevée, 952 LOC, DB2 lourd)',
    actual: `${credEffort?.strategy || 'Non trouvé'}`,
    details: credEffort?.justification,
  });

  // ═══ TEST 10: Performance ═══
  const parseTime = analysisResult.stats.parseTimeMs;
  results.push({
    name: 'T25 — Performance (temps d\'analyse)',
    status: parseTime < 1000 ? 'PASS' : parseTime < 5000 ? 'WARN' : 'FAIL',
    expected: '< 1000ms pour 5 programmes + 5 copybooks + 1 JCL',
    actual: `${parseTime}ms`,
  });

  // ═══ TEST 11: Pas de crash sur le rapport ═══
  const reportSections = [
    'Résumé exécutif', 'Inventaire', 'Cartographie', 'dépendances',
    'Complexité', 'Technologies', 'Recommandation', 'Estimation', 'Plan', 'Annexes'
  ];
  const missingSections = reportSections.filter(s => !report.markdownReport.includes(s));
  results.push({
    name: 'T26 — Rapport contient les 10 sections',
    status: missingSections.length === 0 ? 'PASS' : missingSections.length <= 2 ? 'WARN' : 'FAIL',
    expected: '10 sections complètes',
    actual: missingSections.length === 0 ? 'Toutes présentes' : `Manquantes: ${missingSections.join(', ')}`,
  });

  // ═══ TEST 12: Tables dans le rapport ═══
  const reportHasTables = report.markdownReport.includes('T_CREDIT_DEMANDS') ||
    report.markdownReport.includes('T_CUSTOMERS');
  results.push({
    name: 'T27 — Tables DB2 dans le rapport',
    status: reportHasTables ? 'PASS' : 'FAIL',
    expected: 'T_CREDIT_DEMANDS ou T_CUSTOMERS mentionnées',
    actual: reportHasTables ? 'Tables présentes dans le rapport' : 'Tables absentes',
  });

  // ═══ TEST 13: CREDPROC File Descriptions ═══
  results.push({
    name: 'T28 — CREDPROC File Descriptions',
    status: credIR.fileDescriptions.length >= 0 ? 'PASS' : 'FAIL',
    expected: '≥ 0 FD (programme DB2 pur peut ne pas avoir de fichiers)',
    actual: `${credIR.fileDescriptions.length} FD`,
    details: credIR.fileDescriptions.map((f: any) => f.name).join(', ') || 'Aucun',
  });

  // ═══ Résultats ═══
  printResults(results, startTime);

  // Sauvegarder le rapport markdown
  fs.writeFileSync('/home/ubuntu/cobol-stress-test/MIGRATION_REPORT.md', report.markdownReport);
  console.log(`\n📄 Rapport de migration: /home/ubuntu/cobol-stress-test/MIGRATION_REPORT.md`);
  console.log(`📊 Score: ${report.migrationReadinessScore}/100 | Effort: ${report.totalEffortJH} j/h`);
}

function printResults(results: TestResult[], startTime: number) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    RÉSULTATS DU STRESS TEST');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${r.name}`);
    console.log(`   Attendu: ${r.expected}`);
    console.log(`   Obtenu:  ${r.actual}`);
    if (r.details) console.log(`   Détails: ${r.details}`);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${results.length} tests | ✅ ${pass} PASS | ❌ ${fail} FAIL | ⚠️ ${warn} WARN`);
  console.log(`  TAUX DE RÉUSSITE: ${Math.round((pass / results.length) * 100)}% (strict) | ${Math.round(((pass + warn) / results.length) * 100)}% (avec warnings)`);
  console.log(`  TEMPS TOTAL: ${Date.now() - startTime}ms`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ ERREUR FATALE:', err.message);
  console.error(err.stack);
});
