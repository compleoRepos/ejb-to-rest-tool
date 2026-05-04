/**
 * Test du CobolAnalyzer sur les fichiers COBOL réels fournis par l'utilisateur.
 * Génère un rapport de test détaillé.
 */
import { CobolAnalyzer } from '../server/engine/cobol/CobolAnalyzer';
import { CobolParser } from '../server/engine/cobol/CobolParser';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_DIR = '/home/ubuntu/cobol-real-test';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  expected: string;
  actual: string;
  details?: string;
}

async function main() {
  const results: TestResult[] = [];
  
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     RAPPORT DE TEST — CobolAnalyzer v11.0               ║');
  console.log('║     Fichiers: cobol-banking-sample (réels)              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Charger les fichiers (exclure les fichiers générés comme .md)
  const fileNames = fs.readdirSync(PROJECT_DIR).filter(f => 
    f.match(/\.(cbl|cob|cpy|jcl|CBL|COB|CPY|JCL)$/)
  );
  function detectType(name: string): 'COBOL' | 'COPYBOOK' | 'JCL' {
    if (name.match(/\.(cbl|cob|CBL|COB)$/)) return 'COBOL';
    if (name.match(/\.(cpy|CPY|copy|COPY)$/)) return 'COPYBOOK';
    if (name.match(/\.(jcl|JCL)$/)) return 'JCL';
    return 'COBOL';
  }
  const files = fileNames.map(f => ({
    fileName: f,
    content: fs.readFileSync(path.join(PROJECT_DIR, f), 'utf-8'),
    type: detectType(f),
  }));

  // ═══ TEST 1: Analyse globale réussit ═══
  const analyzer = new CobolAnalyzer();
  const result = analyzer.analyze({ projectName: 'cobol-banking-sample', files });
  
  results.push({
    name: 'Analyse globale',
    status: result.success ? 'PASS' : 'FAIL',
    expected: 'success = true',
    actual: `success = ${result.success}`,
    details: result.errors?.join(', '),
  });

  if (!result.success) {
    console.log('❌ Analyse échouée:', result.errors);
    printResults(results);
    return;
  }

  const report = result.report!;

  // ═══ TEST 2: Nombre de programmes parsés ═══
  results.push({
    name: 'Programmes parsés',
    status: report.programs.length === 4 ? 'PASS' : 'FAIL',
    expected: '4 programmes',
    actual: `${report.programs.length} programmes`,
  });

  // ═══ TEST 3: Parser individuel — ACCTINQ ═══
  const parser = new CobolParser();
  const acctContent = files.find(f => f.fileName === 'ACCTINQ.cbl')!.content;
  const acctIR = parser.parse(acctContent, 'ACCTINQ.cbl');

  // 3a: Program ID
  results.push({
    name: 'ACCTINQ — Program ID',
    status: acctIR.programId === 'ACCTINQ' ? 'PASS' : 'FAIL',
    expected: 'ACCTINQ',
    actual: acctIR.programId,
  });

  // 3b: Divisions
  results.push({
    name: 'ACCTINQ — Divisions détectées',
    status: (acctIR.divisions.identification && acctIR.divisions.data && acctIR.divisions.procedure) ? 'PASS' : 'FAIL',
    expected: 'IDENTIFICATION + DATA + PROCEDURE',
    actual: JSON.stringify(acctIR.divisions),
  });

  // 3c: Data Items
  results.push({
    name: 'ACCTINQ — Data Items',
    status: acctIR.dataItems.length >= 8 ? 'PASS' : 'FAIL',
    expected: '≥ 8 (WS-COMMAREA fields + DFHCOMMAREA + COPYBOOK)',
    actual: `${acctIR.dataItems.length} items`,
    details: acctIR.dataItems.slice(0, 5).map(d => `${d.level} ${d.name}`).join(', '),
  });

  // 3d: Copybooks
  results.push({
    name: 'ACCTINQ — COPY statements',
    status: acctIR.copybooks.includes('CUSTOMER') ? 'PASS' : 'FAIL',
    expected: 'COPY CUSTOMER détecté',
    actual: `Copybooks: [${acctIR.copybooks.join(', ')}]`,
  });

  // 3e: SQL Statements
  results.push({
    name: 'ACCTINQ — SQL Statements',
    status: acctIR.sqlStatements.length >= 2 ? 'PASS' : 'FAIL',
    expected: '≥ 2 (SELECT + INCLUDE SQLCA)',
    actual: `${acctIR.sqlStatements.length} SQL statements`,
    details: acctIR.sqlStatements.map(s => `${s.type}: tables=[${s.tables.join(',')}]`).join(' | '),
  });

  // 3f: CICS Commands
  results.push({
    name: 'ACCTINQ — CICS Commands',
    status: acctIR.cicsCommands.length >= 3 ? 'PASS' : 'FAIL',
    expected: '≥ 3 (RETURN + SEND × 2)',
    actual: `${acctIR.cicsCommands.length} CICS commands`,
    details: acctIR.cicsCommands.map(c => `${c.command}(${Object.keys(c.options).join(',')})`).join(' | '),
  });

  // 3g: Paragraphs (sections)
  results.push({
    name: 'ACCTINQ — Paragraphes',
    status: acctIR.sections.length >= 4 ? 'PASS' : 'FAIL',
    expected: '≥ 4 (0000-MAIN, 1000-INQUIRY, 1500-SEND-DATA-MAP, 2000-SEND-EMPTY-MAP)',
    actual: `${acctIR.sections.length} paragraphes`,
    details: acctIR.sections.map(s => s.name).join(', '),
  });

  // 3h: PERFORM calls
  results.push({
    name: 'ACCTINQ — PERFORM calls',
    status: acctIR.performCalls.length >= 3 ? 'PASS' : 'FAIL',
    expected: '≥ 3 (1000-INQUIRY, 1500-SEND-DATA-MAP, 2000-SEND-EMPTY-MAP)',
    actual: `${acctIR.performCalls.length} performs`,
    details: acctIR.performCalls.join(', '),
  });

  // ═══ TEST 4: Parser — CUSTMGMT (batch DB2) ═══
  const custContent = files.find(f => f.fileName === 'CUSTMGMT.cbl')!.content;
  const custIR = parser.parse(custContent, 'CUSTMGMT.cbl');

  results.push({
    name: 'CUSTMGMT — SQL (batch DB2)',
    status: custIR.sqlStatements.length >= 4 ? 'PASS' : 'FAIL',
    expected: '≥ 4 SQL statements (SELECT, INSERT, UPDATE, CURSOR)',
    actual: `${custIR.sqlStatements.length} SQL`,
    details: custIR.sqlStatements.map(s => s.type).join(', '),
  });

  results.push({
    name: 'CUSTMGMT — CALL statements',
    status: custIR.callStatements.length >= 1 ? 'PASS' : 'FAIL',
    expected: '≥ 1 CALL',
    actual: `${custIR.callStatements.length} calls`,
    details: custIR.callStatements.map(c => c.target).join(', '),
  });

  results.push({
    name: 'CUSTMGMT — File Descriptions',
    status: custIR.fileDescriptions.length >= 1 ? 'PASS' : 'FAIL',
    expected: '≥ 1 FD (CUSTOMER-INPUT-FILE)',
    actual: `${custIR.fileDescriptions.length} FD`,
    details: custIR.fileDescriptions.map(f => `${f.name}(${f.type})`).join(', '),
  });

  // ═══ TEST 5: Parser — LOANCLC (calcul pur, pas de DB2) ═══
  const loanContent = files.find(f => f.fileName === 'LOANCLC.cbl')!.content;
  const loanIR = parser.parse(loanContent, 'LOANCLC.cbl');

  results.push({
    name: 'LOANCLC — Pas de SQL',
    status: loanIR.sqlStatements.length === 0 ? 'PASS' : 'FAIL',
    expected: '0 SQL (programme de calcul pur)',
    actual: `${loanIR.sqlStatements.length} SQL`,
  });

  results.push({
    name: 'LOANCLC — Pas de CICS',
    status: loanIR.cicsCommands.length === 0 ? 'PASS' : 'FAIL',
    expected: '0 CICS (programme batch)',
    actual: `${loanIR.cicsCommands.length} CICS`,
  });

  // ═══ TEST 6: JCL Parser ═══
  results.push({
    name: 'JCL — Jobs parsés',
    status: report.jclJobs.length >= 1 ? 'PASS' : 'FAIL',
    expected: '≥ 1 job (DAILYJOB)',
    actual: `${report.jclJobs.length} jobs`,
  });

  if (report.jclJobs.length > 0) {
    const job = report.jclJobs[0];
    results.push({
      name: 'JCL — Job name',
      status: job.jobName === 'DAILYJOB' ? 'PASS' : 'FAIL',
      expected: 'DAILYJOB',
      actual: job.jobName,
    });

    results.push({
      name: 'JCL — Steps count',
      status: job.steps.length >= 3 ? 'PASS' : 'FAIL',
      expected: '≥ 3 steps (CUSTMGMT, LOANCLC, DAYREPT)',
      actual: `${job.steps.length} steps`,
      details: job.steps.map(s => `${s.stepName}→${s.program}`).join(', '),
    });

    results.push({
      name: 'JCL — CLASS=A (continuation)',
      status: job.jobClass === 'A' ? 'PASS' : 'FAIL',
      expected: 'CLASS=A',
      actual: `CLASS=${job.jobClass}`,
    });
  }

  // ═══ TEST 7: Rapport de migration ═══
  results.push({
    name: 'Rapport — Markdown généré',
    status: report.markdownReport.length > 500 ? 'PASS' : 'FAIL',
    expected: '> 500 caractères',
    actual: `${report.markdownReport.length} caractères`,
  });

  results.push({
    name: 'Rapport — Contient sections clés',
    status: (
      report.markdownReport.includes('Résumé exécutif') &&
      report.markdownReport.includes('Inventaire des programmes') &&
      report.markdownReport.includes('Cartographie des données')
    ) ? 'PASS' : 'FAIL',
    expected: 'Résumé exécutif + Inventaire + Cartographie',
    actual: 'Sections présentes: ' + ['Résumé exécutif', 'Inventaire', 'Cartographie'].filter(s => report.markdownReport.includes(s)).join(', '),
  });

  // ═══ TEST 8: Technologies détectées (via rapport markdown) ═══
  results.push({
    name: 'Rapport — DB2 détecté',
    status: report.markdownReport.includes('DB2') ? 'PASS' : 'FAIL',
    expected: 'DB2 mentionné dans le rapport',
    actual: report.markdownReport.includes('DB2') ? 'Oui' : 'Non',
  });

  results.push({
    name: 'Rapport — CICS détecté',
    status: report.markdownReport.includes('CICS') ? 'PASS' : 'FAIL',
    expected: 'CICS mentionné dans le rapport',
    actual: report.markdownReport.includes('CICS') ? 'Oui' : 'Non',
  });

  // ═══ TEST 9: Estimation effort ═══
  const effortMatch = report.markdownReport.match(/Effort total estimé \| (\d+)/);
  const effort = effortMatch ? parseInt(effortMatch[1]) : 0;
  results.push({
    name: 'Rapport — Effort estimé raisonnable',
    status: effort > 5 && effort < 200 ? 'PASS' : 'WARN',
    expected: '5 < effort < 200 j/h',
    actual: `${effort} j/h`,
  });

  // ═══ TEST 10: Complexité ═══
  results.push({
    name: 'ACCTINQ — Complexité cyclomatique',
    status: acctIR.complexity > 5 ? 'PASS' : 'WARN',
    expected: '> 5 (EVALUATE + SQL + PERFORM)',
    actual: `${acctIR.complexity}`,
  });

  // ═══ Résultats ═══
  printResults(results);

  // Sauvegarder le rapport markdown complet
  fs.writeFileSync('/home/ubuntu/cobol-real-test/MIGRATION_REPORT.md', report.markdownReport);
  console.log(`\n📄 Rapport de migration sauvegardé: /home/ubuntu/cobol-real-test/MIGRATION_REPORT.md`);
}

function printResults(results: TestResult[]) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    RÉSULTATS DES TESTS');
  console.log('═══════════════════════════════════════════════════════════\n');

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

  console.log('───────────────────────────────────────────────────────────');
  console.log(`  TOTAL: ${results.length} tests | ✅ ${pass} PASS | ❌ ${fail} FAIL | ⚠️ ${warn} WARN`);
  console.log(`  TAUX DE RÉUSSITE: ${Math.round((pass / results.length) * 100)}%`);
  console.log('───────────────────────────────────────────────────────────');
}

main().catch(err => {
  console.error('❌ ERREUR FATALE:', err.message);
  console.error(err.stack);
});
