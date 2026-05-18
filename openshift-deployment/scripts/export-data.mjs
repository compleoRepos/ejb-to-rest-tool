/**
 * Export all data from TiDB (Manus) to a portable SQL dump.
 * Generates INSERT statements compatible with MySQL 8.0.
 * 
 * Usage: node export-data.mjs
 * Output: ../data/init.sql
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from the ejb-client-modernizer project
const __dir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dir, '..', '..', 'ejb-client-modernizer', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'init.sql');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Run from the ejb-client-modernizer directory with .env loaded.');
  process.exit(1);
}

async function main() {
  console.log('[Export] Connecting to database...');
  const connection = await mysql.createConnection(DATABASE_URL);

  // Get all tables
  const [tables] = await connection.query('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]);
  console.log(`[Export] Found ${tableNames.length} tables: ${tableNames.join(', ')}`);

  let sql = '';
  sql += '-- ============================================================\n';
  sql += '-- EJB Client Modernizer — Database Export\n';
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += '-- Compatible with MySQL 8.0+\n';
  sql += '-- ============================================================\n\n';
  sql += 'SET NAMES utf8mb4;\n';
  sql += 'SET FOREIGN_KEY_CHECKS = 0;\n\n';

  for (const table of tableNames) {
    console.log(`[Export] Exporting table: ${table}...`);

    // Get CREATE TABLE statement
    const [createResult] = await connection.query(`SHOW CREATE TABLE \`${table}\``);
    const createStmt = createResult[0]['Create Table'];
    sql += `-- Table: ${table}\n`;
    sql += `DROP TABLE IF EXISTS \`${table}\`;\n`;
    sql += `${createStmt};\n\n`;

    // Get row count
    const [countResult] = await connection.query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
    const rowCount = countResult[0].cnt;
    console.log(`  → ${rowCount} rows`);

    if (rowCount === 0) continue;

    // Export data in batches
    const BATCH_SIZE = 1000;
    let offset = 0;

    while (offset < rowCount) {
      const [rows] = await connection.query(
        `SELECT * FROM \`${table}\` LIMIT ${BATCH_SIZE} OFFSET ${offset}`
      );

      if (rows.length === 0) break;

      // Get column names
      const columns = Object.keys(rows[0]);
      const colList = columns.map(c => `\`${c}\``).join(', ');

      // Generate INSERT statements
      const values = rows.map(row => {
        const vals = columns.map(col => {
          const val = row[col];
          if (val === null) return 'NULL';
          if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
          if (typeof val === 'number') return val;
          if (typeof val === 'boolean') return val ? 1 : 0;
          // Escape string
          const escaped = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          return `'${escaped}'`;
        });
        return `(${vals.join(', ')})`;
      });

      sql += `INSERT INTO \`${table}\` (${colList}) VALUES\n`;
      sql += values.join(',\n') + ';\n\n';

      offset += BATCH_SIZE;
      if (offset % 10000 === 0) {
        process.stdout.write(`  → ${offset}/${rowCount} rows exported\r`);
      }
    }
    console.log(`  → ${rowCount} rows exported`);
  }

  sql += 'SET FOREIGN_KEY_CHECKS = 1;\n';

  // Write to file
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, sql);

  const sizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1);
  console.log(`\n[Export] Done! Output: ${OUTPUT_FILE} (${sizeMB} MB)`);

  await connection.end();
}

main().catch(err => {
  console.error('[Export] Error:', err);
  process.exit(1);
});
