/**
 * SchemaDecoder v12.6 — Decode cryptic database column names using Java source code semantics.
 *
 * On legacy banking systems, DB columns are often cryptic (FIELD1..FIELDn, ZONE_A, COL_001).
 * This module infers the real semantic meaning by analyzing how columns are used in Java code.
 *
 * Standalone feature: can be executed independently of the full migration pipeline.
 *
 * Sources of semantics (by confidence level):
 *   - HIGH: Setter on DTO/Entity (customer.setName(rs.getString("FIELD1")))
 *   - HIGH: Named local variable (String nom = rs.getString("FIELD1"))
 *   - MEDIUM: Typed method parameter (save(String nom){ ps.setString(1, nom) })
 *   - LOW: Concat/formatting context (FIELD1 || FIELD2 → composite)
 *   - LOW: SQL type heuristic only (varchar(255) without clear usage)
 *
 * @author Hamza NORDINE — Compleo
 */

export type ConfidenceLevel = "high" | "medium" | "low";

export interface DecodedColumn {
  /** Original DB column name (e.g. "FIELD1") */
  db: string;
  /** Inferred semantic name (e.g. "nom") */
  inferred: string;
  /** Confidence level of the inference */
  confidence: ConfidenceLevel;
  /** Sources that contributed to the inference */
  sources: string[];
  /** Java type inferred from usage */
  javaType: string;
  /** SQL type if detected from DDL or JDBC metadata */
  sqlType: string;
}

export interface DecodedTable {
  /** Table name as found in SQL */
  name: string;
  /** How the table was discovered */
  source: string;
  /** Decoded columns */
  columns: DecodedColumn[];
}

export interface SchemaDecoderResult {
  tables: DecodedTable[];
  stats: {
    totalColumns: number;
    decoded: number;
    unresolved: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
  /** Execution time in ms */
  executionTimeMs: number;
}

// ─── RS getter → Java type mapping ──────────────────────────────────────────
const RS_TYPE_MAP: Record<string, string> = {
  getString: "String",
  getLong: "Long",
  getInt: "Integer",
  getBigDecimal: "BigDecimal",
  getDate: "LocalDate",
  getTimestamp: "LocalDateTime",
  getBoolean: "Boolean",
  getDouble: "Double",
  getFloat: "Float",
  getShort: "Short",
  getByte: "Byte",
  getObject: "Object",
};

// ─── SQL type → Java type ────────────────────────────────────────────────────
const SQL_TYPE_MAP: Record<string, string> = {
  varchar: "String", char: "String", text: "String", longtext: "String",
  nvarchar: "String", nchar: "String", ntext: "String",
  int: "Integer", integer: "Integer", bigint: "Long", smallint: "Short",
  tinyint: "Byte", decimal: "BigDecimal", numeric: "BigDecimal",
  float: "Float", double: "Double", real: "Double",
  boolean: "Boolean", bit: "Boolean",
  date: "LocalDate", datetime: "LocalDateTime", timestamp: "LocalDateTime",
  time: "LocalTime", blob: "byte[]", clob: "String",
  number: "BigDecimal",
};

// ─── Cryptic column detection ────────────────────────────────────────────────
const CRYPTIC_PATTERNS = [
  /^FIELD\d+$/i,
  /^ZONE[_]?[A-Z0-9]+$/i,
  /^COL[_]?\d+$/i,
  /^FLD[_]?\d+$/i,
  /^[A-Z]{1,3}\d{2,}$/,        // e.g. CD01, AB123
  /^[A-Z]_\d+$/,               // e.g. A_1, B_23
  /^C[A-Z]\d+$/,               // e.g. CA01, CB02
  /^[A-Z]{2,4}$/,              // Very short abbreviations
];

function isCryptic(colName: string): boolean {
  return CRYPTIC_PATTERNS.some(p => p.test(colName));
}

// ─── Semantic inference sources ──────────────────────────────────────────────

interface ColumnUsage {
  columnName: string;
  tableName: string;
  inferredName: string;
  confidence: ConfidenceLevel;
  source: string;
  javaType: string;
}

/**
 * Main entry point: decode cryptic columns from Java source files.
 */
export function decodeSchema(
  files: { path: string; content: string }[]
): SchemaDecoderResult {
  const t0 = Date.now();

  // Phase 1: Extract all column usages with semantic context
  const usages: ColumnUsage[] = [];
  const tableColumns = new Map<string, Set<string>>();
  const tableSources = new Map<string, string>();
  const columnSqlTypes = new Map<string, string>(); // "TABLE.COL" → sqlType

  for (const file of files) {
    if (!file.content) continue;
    const className = file.path.replace(/.*\//, "").replace(".java", "");

    // Extract SQL context (table names, column lists)
    extractSqlContext(file.content, tableColumns, tableSources, columnSqlTypes);

    // Source 1: Setter on DTO/Entity (HIGH confidence)
    extractSetterUsages(file.content, className, tableColumns, usages);

    // Source 2: Named local variable (HIGH confidence)
    extractVariableUsages(file.content, className, tableColumns, usages);

    // Source 3: Method parameter mapping (MEDIUM confidence)
    extractParameterUsages(file.content, className, tableColumns, usages);

    // Source 4: PreparedStatement setXxx (MEDIUM confidence)
    extractPreparedStatementUsages(file.content, className, tableColumns, usages);

    // Source 5: Concat/formatting context (LOW confidence)
    extractConcatUsages(file.content, className, tableColumns, usages);
  }

  // Phase 2: Build decoded tables
  const tables: DecodedTable[] = [];

  for (const [tableName, columns] of tableColumns.entries()) {
    const decodedColumns: DecodedColumn[] = [];

    for (const colName of columns) {
      const colUsages = usages.filter(
        u => u.columnName.toUpperCase() === colName.toUpperCase() &&
             u.tableName.toUpperCase() === tableName.toUpperCase()
      );

      // Pick best inference (highest confidence, most sources)
      const best = pickBestInference(colUsages, colName);
      const sqlTypeKey = `${tableName.toUpperCase()}.${colName.toUpperCase()}`;

      decodedColumns.push({
        db: colName,
        inferred: best.inferredName,
        confidence: best.confidence,
        sources: best.sources,
        javaType: best.javaType,
        sqlType: columnSqlTypes.get(sqlTypeKey) || "UNKNOWN",
      });
    }

    tables.push({
      name: tableName,
      source: tableSources.get(tableName) || "inferred from JDBC",
      columns: decodedColumns,
    });
  }

  // Phase 3: Compute stats
  const totalColumns = tables.reduce((sum, t) => sum + t.columns.length, 0);
  const decoded = tables.reduce(
    (sum, t) => sum + t.columns.filter(c => c.inferred !== c.db).length, 0
  );
  const unresolved = totalColumns - decoded;
  const highConfidence = tables.reduce(
    (sum, t) => sum + t.columns.filter(c => c.confidence === "high").length, 0
  );
  const mediumConfidence = tables.reduce(
    (sum, t) => sum + t.columns.filter(c => c.confidence === "medium").length, 0
  );
  const lowConfidence = tables.reduce(
    (sum, t) => sum + t.columns.filter(c => c.confidence === "low").length, 0
  );

  return {
    tables,
    stats: { totalColumns, decoded, unresolved, highConfidence, mediumConfidence, lowConfidence },
    executionTimeMs: Date.now() - t0,
  };
}

// ─── SQL Context Extraction ──────────────────────────────────────────────────

function extractSqlContext(
  content: string,
  tableColumns: Map<string, Set<string>>,
  tableSources: Map<string, string>,
  columnSqlTypes: Map<string, string>
): void {
  // Extract SQL strings (handle multi-line concatenation)
  const sqlStrings = extractSQLStrings(content);

  for (const sql of sqlStrings) {
    // SELECT cols FROM table
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
    if (selectMatch) {
      const tableName = selectMatch[2];
      ensureTable(tableName, tableColumns, tableSources, "inferred from SELECT");
      const selectClause = selectMatch[1].trim();
      if (selectClause !== "*") {
        const cols = selectClause.split(",").map(c => c.trim());
        for (const col of cols) {
          const colName = col.replace(/.*\.\s*/, "").replace(/\s+AS\s+\w+/i, "").trim();
          if (colName && /^\w+$/.test(colName)) {
            tableColumns.get(tableName)!.add(colName);
          }
        }
      }
    }

    // INSERT INTO table (cols)
    const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const tableName = insertMatch[1];
      ensureTable(tableName, tableColumns, tableSources, "inferred from INSERT");
      const cols = insertMatch[2].split(",").map(c => c.trim());
      for (const col of cols) {
        if (col && /^\w+$/.test(col)) {
          tableColumns.get(tableName)!.add(col);
        }
      }
    }

    // UPDATE table SET col = ?
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE|$)/i);
    if (updateMatch) {
      const tableName = updateMatch[1];
      ensureTable(tableName, tableColumns, tableSources, "inferred from UPDATE");
      const setCols = updateMatch[2].split(",");
      for (const setCol of setCols) {
        const colMatch = setCol.trim().match(/^(\w+)\s*=/);
        if (colMatch) {
          tableColumns.get(tableName)!.add(colMatch[1]);
        }
      }
    }

    // CREATE TABLE
    const createMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\((.+)\)/is);
    if (createMatch) {
      const tableName = createMatch[1];
      ensureTable(tableName, tableColumns, tableSources, "inferred from DDL");
      const colDefs = createMatch[2].split(",");
      for (const colDef of colDefs) {
        const defMatch = colDef.trim().match(/^(\w+)\s+(\w+)/);
        if (defMatch && !["PRIMARY", "FOREIGN", "CONSTRAINT", "INDEX", "UNIQUE", "KEY", "CHECK"].includes(defMatch[1].toUpperCase())) {
          tableColumns.get(tableName)!.add(defMatch[1]);
          const sqlType = defMatch[2].toUpperCase();
          columnSqlTypes.set(`${tableName.toUpperCase()}.${defMatch[1].toUpperCase()}`, sqlType);
        }
      }
    }
  }
}

// ─── Source 1: Setter on DTO/Entity (HIGH) ───────────────────────────────────

function extractSetterUsages(
  content: string,
  className: string,
  tableColumns: Map<string, Set<string>>,
  usages: ColumnUsage[]
): void {
  // Pattern: obj.setXxx(rs.getYyy("COLUMN"))
  const setterRegex = /(\w+)\.(set(\w+))\s*\(\s*(?:rs|resultSet|rset|result)\s*\.\s*(get\w+)\s*\(\s*"(\w+)"\s*\)\s*\)/g;
  let match;
  while ((match = setterRegex.exec(content)) !== null) {
    const [, objVar, , propertyName, getterMethod, columnName] = match;
    const javaType = RS_TYPE_MAP[getterMethod] || "String";
    const inferredName = camelToReadable(propertyName);
    const tableName = findTableForColumn(columnName, tableColumns);

    if (tableName) {
      usages.push({
        columnName,
        tableName,
        inferredName,
        confidence: "high",
        source: `${className}.${objVar}.set${propertyName}`,
        javaType,
      });
    }
  }
}

// ─── Source 2: Named local variable (HIGH) ───────────────────────────────────

function extractVariableUsages(
  content: string,
  className: string,
  tableColumns: Map<string, Set<string>>,
  usages: ColumnUsage[]
): void {
  // Pattern: Type varName = rs.getXxx("COLUMN")
  const varRegex = /(?:String|Long|Integer|BigDecimal|LocalDate|LocalDateTime|Boolean|Double|Float|int|long|double|boolean)\s+(\w+)\s*=\s*(?:rs|resultSet|rset|result)\s*\.\s*(get\w+)\s*\(\s*"(\w+)"\s*\)/g;
  let match;
  while ((match = varRegex.exec(content)) !== null) {
    const [, varName, getterMethod, columnName] = match;
    const javaType = RS_TYPE_MAP[getterMethod] || "String";

    // Skip generic variable names
    if (isGenericVarName(varName)) continue;

    const tableName = findTableForColumn(columnName, tableColumns);
    if (tableName) {
      usages.push({
        columnName,
        tableName,
        inferredName: varName,
        confidence: "high",
        source: `var ${varName} in ${className}`,
        javaType,
      });
    }
  }
}

// ─── Source 3: Method parameter mapping (MEDIUM) ─────────────────────────────

function extractParameterUsages(
  content: string,
  className: string,
  tableColumns: Map<string, Set<string>>,
  usages: ColumnUsage[]
): void {
  // Find methods with PreparedStatement and parameters
  // Pattern: ps.setString(N, paramName) where paramName is a method parameter
  const methodRegex = /(?:public|private|protected)\s+\w+\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+\w+(?:\s*,\s*\w+)*)?\s*\{/g;
  let methodMatch;

  while ((methodMatch = methodRegex.exec(content)) !== null) {
    const methodName = methodMatch[1];
    const params = methodMatch[2];
    if (!params.trim()) continue;

    // Parse parameters
    const paramList = params.split(",").map(p => {
      const parts = p.trim().split(/\s+/);
      return { type: parts[0], name: parts[parts.length - 1] };
    }).filter(p => p.name && p.type);

    // Find the method body (simplified — look for ps.setXxx calls)
    const bodyStart = methodMatch.index + methodMatch[0].length;
    const bodyEnd = findMethodEnd(content, bodyStart);
    const body = content.substring(bodyStart, bodyEnd);

    // Match ps.setXxx(index, paramName)
    const psRegex = /(?:ps|pstmt|preparedStatement|stmt)\s*\.\s*(set\w+)\s*\(\s*(\d+)\s*,\s*(\w+)\s*\)/g;
    let psMatch;
    while ((psMatch = psRegex.exec(body)) !== null) {
      const [, setMethod, indexStr, argName] = psMatch;
      const paramInfo = paramList.find(p => p.name === argName);
      if (!paramInfo) continue;
      if (isGenericVarName(argName)) continue;

      // Find the SQL in this method to get column order
      const sqlInMethod = extractSQLStrings(body);
      for (const sql of sqlInMethod) {
        const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
        if (insertMatch) {
          const tableName = insertMatch[1];
          const cols = insertMatch[2].split(",").map(c => c.trim());
          const idx = parseInt(indexStr) - 1;
          if (idx >= 0 && idx < cols.length) {
            usages.push({
              columnName: cols[idx],
              tableName,
              inferredName: argName,
              confidence: "medium",
              source: `param ${argName} in ${className}.${methodName}`,
              javaType: paramInfo.type,
            });
          }
        }
        const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE|$)/i);
        if (updateMatch) {
          const tableName = updateMatch[1];
          const setCols = updateMatch[2].split(",").map(c => {
            const m = c.trim().match(/^(\w+)\s*=/);
            return m ? m[1] : "";
          }).filter(Boolean);
          const idx = parseInt(indexStr) - 1;
          if (idx >= 0 && idx < setCols.length) {
            usages.push({
              columnName: setCols[idx],
              tableName,
              inferredName: argName,
              confidence: "medium",
              source: `param ${argName} in ${className}.${methodName}`,
              javaType: paramInfo.type,
            });
          }
        }
      }
    }
  }
}

// ─── Source 4: PreparedStatement setXxx with named var (MEDIUM) ───────────────

function extractPreparedStatementUsages(
  content: string,
  className: string,
  tableColumns: Map<string, Set<string>>,
  usages: ColumnUsage[]
): void {
  // Pattern: ps.setString(N, localVar) where localVar was assigned from a meaningful expression
  const psRegex = /(?:ps|pstmt|preparedStatement|stmt)\s*\.\s*(set\w+)\s*\(\s*(\d+)\s*,\s*(\w+)\s*\)/g;
  let match;
  while ((match = psRegex.exec(content)) !== null) {
    const [, setMethod, indexStr, varName] = match;
    if (isGenericVarName(varName)) continue;

    // Check if this var was assigned from a getter (obj.getXxx())
    const getterRegex = new RegExp(
      `(?:String|Long|Integer|BigDecimal|\\w+)\\s+${varName}\\s*=\\s*(\\w+)\\.(get(\\w+))\\(\\)`,
      "m"
    );
    const getterMatch = content.match(getterRegex);
    if (getterMatch) {
      const propertyName = getterMatch[2]; // e.g. "getName" → "Name"
      const inferredName = camelToReadable(propertyName.replace(/^get/, ""));

      // Find the SQL context to map index → column
      const sqlStrings = extractSQLStrings(content);
      for (const sql of sqlStrings) {
        const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
        if (insertMatch) {
          const tableName = insertMatch[1];
          const cols = insertMatch[2].split(",").map(c => c.trim());
          const idx = parseInt(indexStr) - 1;
          if (idx >= 0 && idx < cols.length) {
            usages.push({
              columnName: cols[idx],
              tableName,
              inferredName,
              confidence: "medium",
              source: `${className}.${varName} from getter`,
              javaType: RS_TYPE_MAP[setMethod.replace("set", "get")] || "String",
            });
          }
        }
      }
    }
  }
}

// ─── Source 5: Concat/formatting context (LOW) ───────────────────────────────

function extractConcatUsages(
  content: string,
  className: string,
  tableColumns: Map<string, Set<string>>,
  usages: ColumnUsage[]
): void {
  // Pattern: rs.getString("COL") used in string concat with label
  // e.g. "Name: " + rs.getString("FIELD1")
  const concatRegex = /"([^"]+?)"\s*\+\s*(?:rs|resultSet|rset|result)\s*\.\s*(get\w+)\s*\(\s*"(\w+)"\s*\)/g;
  let match;
  while ((match = concatRegex.exec(content)) !== null) {
    const [, label, getterMethod, columnName] = match;
    const javaType = RS_TYPE_MAP[getterMethod] || "String";

    // Extract meaningful word from label
    const cleanLabel = label.replace(/[:\s=\-_]+$/, "").trim().toLowerCase();
    if (cleanLabel.length < 2 || cleanLabel.length > 30) continue;

    const tableName = findTableForColumn(columnName, tableColumns);
    if (tableName) {
      usages.push({
        columnName,
        tableName,
        inferredName: cleanLabel.replace(/\s+/g, "_"),
        confidence: "low",
        source: `concat label "${label}" in ${className}`,
        javaType,
      });
    }
  }

  // Pattern: column used with SQL alias: SELECT FIELD1 AS name
  const aliasRegex = /(\w+)\s+AS\s+(\w+)/gi;
  const sqlStrings = extractSQLStrings(content);
  for (const sql of sqlStrings) {
    let aliasMatch;
    while ((aliasMatch = aliasRegex.exec(sql)) !== null) {
      const [, colName, alias] = aliasMatch;
      if (isCryptic(colName) && !isCryptic(alias)) {
        const tableName = findTableForColumn(colName, tableColumns);
        if (tableName) {
          usages.push({
            columnName: colName,
            tableName,
            inferredName: alias.toLowerCase(),
            confidence: "low",
            source: `SQL alias in ${className}`,
            javaType: "String",
          });
        }
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractSQLStrings(content: string): string[] {
  const results: string[] = [];
  // Single-line string literals containing SQL keywords
  const singleLineRegex = /"([^"]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|FROM|INTO|SET|WHERE)[^"]*)"/gi;
  let match;
  while ((match = singleLineRegex.exec(content)) !== null) {
    results.push(match[1]);
  }
  // Multi-line concatenated strings: "..." + "..."
  const multiLineRegex = /(?:"([^"]*)"(?:\s*\+\s*"([^"]*)")+)/g;
  while ((match = multiLineRegex.exec(content)) !== null) {
    const fullStr = match[0].replace(/"\s*\+\s*"/g, " ").replace(/^"|"$/g, "");
    if (/SELECT|INSERT|UPDATE|DELETE|CREATE|FROM/i.test(fullStr)) {
      results.push(fullStr);
    }
  }
  return results;
}

function ensureTable(
  tableName: string,
  tableColumns: Map<string, Set<string>>,
  tableSources: Map<string, string>,
  source: string
): void {
  if (!tableColumns.has(tableName)) {
    tableColumns.set(tableName, new Set());
    tableSources.set(tableName, source);
  }
}

function findTableForColumn(
  columnName: string,
  tableColumns: Map<string, Set<string>>
): string | null {
  for (const [tableName, cols] of tableColumns.entries()) {
    if (cols.has(columnName)) return tableName;
  }
  // Fallback: check case-insensitive
  for (const [tableName, cols] of tableColumns.entries()) {
    for (const col of cols) {
      if (col.toUpperCase() === columnName.toUpperCase()) return tableName;
    }
  }
  return null;
}

function pickBestInference(
  usages: ColumnUsage[],
  originalColName: string
): { inferredName: string; confidence: ConfidenceLevel; sources: string[]; javaType: string } {
  if (usages.length === 0) {
    // No semantic info — try to decode from column name itself
    const decoded = decodeFromColumnName(originalColName);
    return {
      inferredName: decoded || originalColName,
      confidence: decoded ? "low" : "low",
      sources: decoded ? ["column name heuristic"] : [],
      javaType: "String",
    };
  }

  // Sort by confidence (high > medium > low)
  const sorted = [...usages].sort((a, b) => {
    const order: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };
    return order[b.confidence] - order[a.confidence];
  });

  const best = sorted[0];
  const allSources = [...new Set(sorted.map(u => u.source))];

  return {
    inferredName: best.inferredName,
    confidence: best.confidence,
    sources: allSources,
    javaType: best.javaType,
  };
}

function decodeFromColumnName(colName: string): string | null {
  // Try common abbreviation patterns
  const abbrevMap: Record<string, string> = {
    NOM: "nom", PRENOM: "prenom", ADR: "adresse", ADDR: "address",
    TEL: "telephone", NUM: "numero", DT: "date", MTT: "montant",
    MNT: "montant", LIB: "libelle", REF: "reference", TYP: "type",
    COD: "code", STA: "statut", OBS: "observation", CDE: "code",
    CPT: "compte", AGE: "agence", CLI: "client", CTR: "contrat",
    DEV: "devise", SOL: "solde", TAU: "taux", DUR: "duree",
    ECH: "echeance", CAP: "capital", INT: "interet", PEN: "penalite",
  };

  const upper = colName.toUpperCase();
  if (abbrevMap[upper]) return abbrevMap[upper];

  // Try prefix matching (e.g. NOM_CLI → nom_client)
  for (const [abbr, full] of Object.entries(abbrevMap)) {
    if (upper.startsWith(abbr + "_") || upper.startsWith(abbr)) {
      const rest = upper.substring(abbr.length).replace(/^_/, "");
      const restDecoded = abbrevMap[rest] || rest.toLowerCase();
      return `${full}_${restDecoded}`;
    }
  }

  return null;
}

function camelToReadable(camelCase: string): string {
  // "setCustomerName" → "customerName", "getName" → "name"
  let result = camelCase.replace(/^(set|get|is)/, "");
  result = result.charAt(0).toLowerCase() + result.slice(1);
  return result;
}

function isGenericVarName(name: string): boolean {
  const generic = new Set([
    "x", "y", "z", "tmp", "temp", "obj", "val", "value", "v",
    "s", "str", "i", "j", "k", "n", "result", "res", "ret",
    "data", "item", "element", "o", "p", "q", "r",
  ]);
  return generic.has(name.toLowerCase());
}

function findMethodEnd(content: string, startIdx: number): number {
  let depth = 1;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === "{") depth++;
    if (content[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return Math.min(startIdx + 2000, content.length);
}

// ─── Output Generators ───────────────────────────────────────────────────────

/**
 * Generate schema-dictionary.json content
 */
export function generateSchemaDictionaryJson(result: SchemaDecoderResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Generate SCHEMA_DICTIONARY.md — human-readable view
 */
export function generateSchemaDictionaryMd(result: SchemaDecoderResult): string {
  const lines: string[] = [];
  lines.push("# Schema Dictionary");
  lines.push("");
  lines.push(`> Generated by Compleo Schema Decoder v12.6`);
  lines.push(`> ${result.stats.totalColumns} columns analyzed | ${result.stats.decoded} decoded | ${result.stats.unresolved} unresolved`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total columns | ${result.stats.totalColumns} |`);
  lines.push(`| Decoded | ${result.stats.decoded} (${Math.round(result.stats.decoded / Math.max(result.stats.totalColumns, 1) * 100)}%) |`);
  lines.push(`| High confidence | ${result.stats.highConfidence} |`);
  lines.push(`| Medium confidence | ${result.stats.mediumConfidence} |`);
  lines.push(`| Low confidence | ${result.stats.lowConfidence} |`);
  lines.push(`| Unresolved | ${result.stats.unresolved} |`);
  lines.push(`| Execution time | ${result.executionTimeMs}ms |`);
  lines.push("");

  for (const table of result.tables) {
    lines.push(`## Table: \`${table.name}\``);
    lines.push("");
    lines.push(`*Source: ${table.source}*`);
    lines.push("");
    lines.push("| DB Column | Inferred Name | Confidence | Java Type | SQL Type | Sources |");
    lines.push("|-----------|---------------|------------|-----------|----------|---------|");

    for (const col of table.columns) {
      const badge = col.confidence === "high" ? "🟢 HIGH" :
                    col.confidence === "medium" ? "🟡 MEDIUM" : "🔴 LOW";
      const decoded = col.inferred !== col.db ? `**${col.inferred}**` : col.inferred;
      lines.push(`| ${col.db} | ${decoded} | ${badge} | ${col.javaType} | ${col.sqlType} | ${col.sources.join(", ")} |`);
    }
    lines.push("");
  }

  // Manual validation section
  const lowCols = result.tables.flatMap(t =>
    t.columns.filter(c => c.confidence === "low").map(c => ({ table: t.name, ...c }))
  );
  if (lowCols.length > 0) {
    lines.push("## Columns Requiring Manual Validation");
    lines.push("");
    lines.push("| Table | Column | Suggested Name | Reason |");
    lines.push("|-------|--------|----------------|--------|");
    for (const col of lowCols) {
      lines.push(`| ${col.table} | ${col.db} | ${col.inferred} | Low confidence — verify with business |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate CSV export for business users
 */
export function generateSchemaDictionaryCsv(result: SchemaDecoderResult): string {
  const lines: string[] = [];
  lines.push("Table,DB Column,Inferred Name,Confidence,Java Type,SQL Type,Sources");
  for (const table of result.tables) {
    for (const col of table.columns) {
      lines.push(`${table.name},${col.db},${col.inferred},${col.confidence},${col.javaType},${col.sqlType},"${col.sources.join("; ")}"`);
    }
  }
  return lines.join("\n");
}
