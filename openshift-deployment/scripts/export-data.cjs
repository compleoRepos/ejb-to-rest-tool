/**
 * Export all data from TiDB (Manus) to a portable SQL dump.
 * Run from the ejb-client-modernizer directory:
 *   node ../ejb-modernizer-openshift/scripts/export-data.cjs
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'data', 'init.sql');

async function main() {
  // Read DATABASE_URL from server/_core/env.ts won't work, use the env directly
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set. Pass it as env: DATABASE_URL=... node export-data.cjs');
    process.exit(1);
  }

  console.log('[Export] Connecting to database...');
  const conn = await mysql.createConnection(DATABASE_URL);

  const [tables] = await conn.query('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]);
  console.log(`[Export] Found ${tableNames.length} tables: ${tableNames.join(', ')}`);

  let sql = '';
  sql += '-- ============================================================\n';
  sql += '-- EJB Client Modernizer — Database Export\n';
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += '-- Compatible with MySQL 8.0+\n';
  sql += '-- ============================================================\n\n';
  sql += 'SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n';

  for (const table of tableNames) {
    const [cr] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
    sql += `-- Table: ${table}\n`;
    sql += `DROP TABLE IF EXISTS \`${table}\`;\n`;
    sql += cr[0]['Create Table'] + ';\n\n';

    const [cnt] = await conn.query(`SELECT COUNT(*) as c FROM \`${table}\``);
    const total = cnt[0].c;
    console.log(`[Export] ${table}: ${total} rows`);
    if (total === 0) continue;

    let offset = 0;
    const BATCH = 1000;
    while (offset < total) {
      const [rows] = await conn.query(`SELECT * FROM \`${table}\` LIMIT ${BATCH} OFFSET ${offset}`);
      if (rows.length === 0) break;
      const cols = Object.keys(rows[0]);
      const colList = cols.map(c => `\`${c}\``).join(', ');
      const vals = rows.map(row => {
        const v = cols.map(col => {
          const val = row[col];
          if (val === null) return 'NULL';
          if (val instanceof Date) return `'${val.toISOString().slice(0,19).replace('T',' ')}'`;
          if (typeof val === 'number') return val;
          if (typeof val === 'boolean') return val ? 1 : 0;
          return `'${String(val).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'\\r')}'`;
        });
        return `(${v.join(', ')})`;
      });
      sql += `INSERT INTO \`${table}\` (${colList}) VALUES\n${vals.join(',\n')};\n\n`;
      offset += BATCH;
      if (offset % 10000 === 0) process.stdout.write(`  ${offset}/${total}\r`);
    }
  }

  sql += 'SET FOREIGN_KEY_CHECKS = 1;\n';
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, sql);
  const mb = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
  console.log(`\n[Export] Done! ${OUTPUT} (${mb} MB)`);
  await conn.end();
}

main().catch(e => { console.error('[Export] Error:', e); process.exit(1); });
