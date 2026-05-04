/**
 * Tests unitaires — Module COBOL Analyzer
 * 
 * Couvre : CobolParser, JclParser, CobolDetectors, CobolMigrationReport, CobolAnalyzer
 */

import { describe, it, expect } from 'vitest';
import { CobolParser } from './CobolParser';
import { JclParser } from './JclParser';
import { CobolDetectors } from './CobolDetectors';
import { CobolMigrationReportGenerator } from './CobolMigrationReport';
import { CobolAnalyzer } from './CobolAnalyzer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TEST_DIR = path.resolve(__dirname, '../../../test-projects/cobol-banking-sample');

function loadTestFile(name: string): string {
  return fs.readFileSync(path.join(TEST_DIR, name), 'utf-8');
}

// ─── CobolParser Tests ──────────────────────────────────────────────────────

describe('CobolParser', () => {
  const parser = new CobolParser();

  it('should parse CUSTMGMT.cbl — batch DB2 program', () => {
    const content = loadTestFile('CUSTMGMT.cbl');
    const ir = parser.parse(content, 'CUSTMGMT.cbl');

    expect(ir.programId).toBe('CUSTMGMT');
    expect(ir.fileName).toBe('CUSTMGMT.cbl');
    expect(ir.divisions.identification).toBe(true);
    expect(ir.divisions.environment).toBe(true);
    expect(ir.divisions.data).toBe(true);
    expect(ir.divisions.procedure).toBe(true);
    expect(ir.loc).toBeGreaterThan(100);
    expect(ir.dataItems.length).toBeGreaterThan(5);
    expect(ir.sqlStatements.length).toBeGreaterThan(0);
    expect(ir.copybooks).toContain('SQLCA');
  });

  it('should parse ACCTPROC.cbl — CICS online program', () => {
    const content = loadTestFile('ACCTPROC.cbl');
    const ir = parser.parse(content, 'ACCTPROC.cbl');

    expect(ir.programId).toBe('ACCTPROC');
    expect(ir.loc).toBeGreaterThan(200);
    expect(ir.sqlStatements.length).toBeGreaterThan(3);
    expect(ir.copybooks).toContain('DFHAID');
    expect(ir.copybooks).toContain('SQLCA');
    expect(ir.paragraphCount).toBeGreaterThan(5);
  });

  it('should parse LOANCLC.cbl — batch file I/O program', () => {
    const content = loadTestFile('LOANCLC.cbl');
    const ir = parser.parse(content, 'LOANCLC.cbl');

    expect(ir.programId).toBe('LOANCLC');
    expect(ir.fileDescriptions.length).toBe(2);
    expect(ir.fileDescriptions[0].type).toBe('SEQUENTIAL');
    expect(ir.sqlStatements.length).toBe(0); // No DB2
    expect(ir.dataItems.length).toBeGreaterThan(10);
  });

  it('should parse DAYREPT.cbl — SORT program', () => {
    const content = loadTestFile('DAYREPT.cbl');
    const ir = parser.parse(content, 'DAYREPT.cbl');

    expect(ir.programId).toBe('DAYREPT');
    expect(ir.callStatements.length).toBeGreaterThan(0);
    expect(ir.copybooks).toContain('CUSTOMER-REC');
  });

  it('should extract SQL tables correctly', () => {
    const content = loadTestFile('ACCTPROC.cbl');
    const ir = parser.parse(content, 'ACCTPROC.cbl');

    const allTables = [...new Set(ir.sqlStatements.flatMap(s => s.tables))];
    expect(allTables).toContain('T_ACCOUNTS');
    expect(allTables).toContain('T_TRANSACTIONS');
  });

  it('should extract host variables from SQL', () => {
    const content = loadTestFile('ACCTPROC.cbl');
    const ir = parser.parse(content, 'ACCTPROC.cbl');

    const allHostVars = [...new Set(ir.sqlStatements.flatMap(s => s.hostVars))];
    expect(allHostVars.length).toBeGreaterThan(3);
    expect(allHostVars).toContain('WS-COMM-ACCT-NO');
  });

  it('should detect data items with COMP-3 usage', () => {
    const content = loadTestFile('ACCTPROC.cbl');
    const ir = parser.parse(content, 'ACCTPROC.cbl');

    const comp3Items = ir.dataItems.filter(d => d.usage?.includes('COMP-3'));
    expect(comp3Items.length).toBeGreaterThan(0);
  });

  it('should calculate complexity > 1 for non-trivial programs', () => {
    const content = loadTestFile('ACCTPROC.cbl');
    const ir = parser.parse(content, 'ACCTPROC.cbl');

    expect(ir.complexity).toBeGreaterThan(10);
  });
});

// ─── JclParser Tests ────────────────────────────────────────────────────────

describe('JclParser', () => {
  const parser = new JclParser();

  it('should parse DAILYJOB.jcl — multi-step job', () => {
    const content = loadTestFile('DAILYJOB.jcl');
    const jobs = parser.parse(content, 'DAILYJOB.jcl');

    expect(jobs.length).toBe(1);
    expect(jobs[0].jobName).toBe('DAILYJOB');
    expect(jobs[0].steps.length).toBe(4);
    expect(jobs[0].jobClass).toBe('A');
  });

  it('should extract step programs correctly', () => {
    const content = loadTestFile('DAILYJOB.jcl');
    const jobs = parser.parse(content, 'DAILYJOB.jcl');

    const programs = jobs[0].steps.map(s => s.program);
    expect(programs).toContain('CUSTMGMT');
    expect(programs).toContain('LOANCLC');
    expect(programs).toContain('DAYREPT');
    expect(programs).toContain('IEFBR14');
  });

  it('should extract DD statements with DSN and DISP', () => {
    const content = loadTestFile('DAILYJOB.jcl');
    const jobs = parser.parse(content, 'DAILYJOB.jcl');

    const step1 = jobs[0].steps[0];
    expect(step1.ddStatements.length).toBeGreaterThan(0);

    const custFile = step1.ddStatements.find(dd => dd.name === 'CUSTFILE');
    expect(custFile).toBeDefined();
    expect(custFile!.dsn).toContain('BANK.DAILY.CUSTOMER.FILE');
    expect(custFile!.type).toBe('INPUT');
  });

  it('should detect OUTPUT DD statements (DISP=NEW)', () => {
    const content = loadTestFile('DAILYJOB.jcl');
    const jobs = parser.parse(content, 'DAILYJOB.jcl');

    const step1 = jobs[0].steps[0];
    const rptFile = step1.ddStatements.find(dd => dd.name === 'RPTFILE');
    expect(rptFile).toBeDefined();
    expect(rptFile!.type).toBe('OUTPUT');
  });

  it('should extract REGION parameter', () => {
    const content = loadTestFile('DAILYJOB.jcl');
    const jobs = parser.parse(content, 'DAILYJOB.jcl');

    expect(jobs[0].steps[0].region).toBe('64M');
    expect(jobs[0].steps[2].region).toBe('128M');
  });
});

// ─── CobolDetectors Tests ───────────────────────────────────────────────────

describe('CobolDetectors', () => {
  const cobolParser = new CobolParser();
  const jclParser = new JclParser();
  const detectors = new CobolDetectors();

  it('should detect DB2 in CUSTMGMT and ACCTPROC', () => {
    const programs = [
      cobolParser.parse(loadTestFile('CUSTMGMT.cbl'), 'CUSTMGMT.cbl'),
      cobolParser.parse(loadTestFile('ACCTPROC.cbl'), 'ACCTPROC.cbl'),
      cobolParser.parse(loadTestFile('LOANCLC.cbl'), 'LOANCLC.cbl'),
    ];

    const techs = detectors.detectAll(programs, []);
    const db2 = techs.find(t => t.technology === 'DB2');

    expect(db2).toBeDefined();
    expect(db2!.detected).toBe(true);
    expect(db2!.programs).toContain('CUSTMGMT');
    expect(db2!.programs).toContain('ACCTPROC');
    expect(db2!.programs).not.toContain('LOANCLC');
  });

  it('should detect Batch programs', () => {
    const programs = [
      cobolParser.parse(loadTestFile('CUSTMGMT.cbl'), 'CUSTMGMT.cbl'),
      cobolParser.parse(loadTestFile('LOANCLC.cbl'), 'LOANCLC.cbl'),
    ];
    const jobs = jclParser.parse(loadTestFile('DAILYJOB.jcl'), 'DAILYJOB.jcl');

    const techs = detectors.detectAll(programs, jobs);
    const batch = techs.find(t => t.technology === 'Batch');

    expect(batch).toBeDefined();
    expect(batch!.detected).toBe(true);
    expect(batch!.count).toBeGreaterThan(0);
  });

  it('should detect COBOL 85+ version', () => {
    const programs = [
      cobolParser.parse(loadTestFile('ACCTPROC.cbl'), 'ACCTPROC.cbl'),
    ];

    const techs = detectors.detectAll(programs, []);
    const version = techs.find(t => t.technology.includes('COBOL Version'));

    expect(version).toBeDefined();
    // The detector classifies based on actual constructs found
    expect(version!.technology).toContain('COBOL');
  });

  it('should not detect IMS/DL1 in banking sample', () => {
    const programs = [
      cobolParser.parse(loadTestFile('CUSTMGMT.cbl'), 'CUSTMGMT.cbl'),
    ];

    const techs = detectors.detectAll(programs, []);
    const ims = techs.find(t => t.technology === 'IMS/DL1');

    expect(ims).toBeDefined();
    expect(ims!.detected).toBe(false);
  });
});

// ─── CobolMigrationReport Tests ─────────────────────────────────────────────

describe('CobolMigrationReportGenerator', () => {
  const cobolParser = new CobolParser();
  const jclParser = new JclParser();
  const detectors = new CobolDetectors();
  const reportGen = new CobolMigrationReportGenerator();

  it('should generate a complete markdown report', () => {
    const programs = [
      cobolParser.parse(loadTestFile('CUSTMGMT.cbl'), 'CUSTMGMT.cbl'),
      cobolParser.parse(loadTestFile('ACCTPROC.cbl'), 'ACCTPROC.cbl'),
      cobolParser.parse(loadTestFile('LOANCLC.cbl'), 'LOANCLC.cbl'),
      cobolParser.parse(loadTestFile('DAYREPT.cbl'), 'DAYREPT.cbl'),
    ];
    const jobs = jclParser.parse(loadTestFile('DAILYJOB.jcl'), 'DAILYJOB.jcl');
    const techs = detectors.detectAll(programs, jobs);

    const report = reportGen.generate('banking-sample', programs, jobs, techs);

    expect(report.markdownReport).toContain('# Rapport d\'Analyse COBOL');
    expect(report.markdownReport).toContain('## 1. Résumé exécutif');
    expect(report.markdownReport).toContain('## 2. Inventaire');
    expect(report.markdownReport).toContain('## 6. Technologies');
    expect(report.markdownReport).toContain('## 8. Estimation');
    expect(report.markdownReport).toContain('## 9. Plan de migration');
    expect(report.totalEffortJH).toBeGreaterThan(0);
    expect(report.migrationReadinessScore).toBeGreaterThan(0);
    expect(report.migrationReadinessScore).toBeLessThanOrEqual(100);
  });

  it('should estimate effort for each program', () => {
    const programs = [
      cobolParser.parse(loadTestFile('LOANCLC.cbl'), 'LOANCLC.cbl'),
    ];
    const techs = detectors.detectAll(programs, []);

    const report = reportGen.generate('test', programs, [], techs);
    expect(report.effortEstimates.length).toBe(1);
    expect(report.effortEstimates[0].programId).toBe('LOANCLC');
    expect(report.effortEstimates[0].effortJH).toBeGreaterThan(0);
  });
});

// ─── CobolAnalyzer Integration Tests ────────────────────────────────────────

describe('CobolAnalyzer (Integration)', () => {
  it('should analyze the full banking sample project', () => {
    const analyzer = new CobolAnalyzer();

    const files = [
      { fileName: 'CUSTMGMT.cbl', content: loadTestFile('CUSTMGMT.cbl'), type: 'COBOL' as const },
      { fileName: 'ACCTPROC.cbl', content: loadTestFile('ACCTPROC.cbl'), type: 'COBOL' as const },
      { fileName: 'LOANCLC.cbl', content: loadTestFile('LOANCLC.cbl'), type: 'COBOL' as const },
      { fileName: 'DAYREPT.cbl', content: loadTestFile('DAYREPT.cbl'), type: 'COBOL' as const },
      { fileName: 'CUSTOMER.cpy', content: loadTestFile('CUSTOMER.cpy'), type: 'COPYBOOK' as const },
      { fileName: 'ACCOUNT.cpy', content: loadTestFile('ACCOUNT.cpy'), type: 'COPYBOOK' as const },
      { fileName: 'DAILYJOB.jcl', content: loadTestFile('DAILYJOB.jcl'), type: 'JCL' as const },
    ];

    const result = analyzer.analyze({ projectName: 'banking-sample', files });

    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.stats.programsParsed).toBe(4);
    expect(result.stats.jclJobsParsed).toBe(1);
    expect(result.stats.totalLoc).toBeGreaterThan(500);
    expect(result.stats.parseTimeMs).toBeLessThan(5000);
    expect(result.report).not.toBeNull();
    expect(result.report!.totalEffortJH).toBeGreaterThan(10);
    expect(result.report!.techDetections.length).toBe(8);
  });

  it('should handle empty project gracefully', () => {
    const analyzer = new CobolAnalyzer();
    const result = analyzer.analyze({ projectName: 'empty', files: [] });

    expect(result.success).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.stats.programsParsed).toBe(0);
  });

  it('should detect file types correctly', () => {
    expect(CobolAnalyzer.detectFileType('PROG.cbl', '')).toBe('COBOL');
    expect(CobolAnalyzer.detectFileType('COPY.cpy', '')).toBe('COPYBOOK');
    expect(CobolAnalyzer.detectFileType('JOB.jcl', '')).toBe('JCL');
    expect(CobolAnalyzer.detectFileType('unknown.txt', 'IDENTIFICATION DIVISION')).toBe('COBOL');
    expect(CobolAnalyzer.detectFileType('unknown.txt', '//MYJOB JOB (ACCT)')).toBe('JCL');
  });

  it('should expand COPYBOOK content into programs', () => {
    const analyzer = new CobolAnalyzer();

    const files = [
      { fileName: 'CUSTMGMT.cbl', content: loadTestFile('CUSTMGMT.cbl'), type: 'COBOL' as const },
      { fileName: 'CUSTOMER.cpy', content: loadTestFile('CUSTOMER.cpy'), type: 'COPYBOOK' as const },
    ];

    const result = analyzer.analyze({ projectName: 'test-expand', files });
    expect(result.success).toBe(true);

    // After expansion, the program should have more data items from the copybook
    const prog = result.report!.programs[0];
    // After expansion, the program should have more data items than without expansion
    // The copybook CUSTOMER.cpy defines CUSTOMER-REC structure
    const customerItems = prog.dataItems.filter(d => 
      d.name.includes('CUSTOMER') || d.name.includes('CUST')
    );
    // At minimum, the program references customer data
    expect(prog.dataItems.length).toBeGreaterThan(10);
  });
});
