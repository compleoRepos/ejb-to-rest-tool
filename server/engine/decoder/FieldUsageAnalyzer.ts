/**
 * FieldUsageAnalyzer v13.13 — Exhaustive field usage collection from Java source code.
 *
 * Extends SchemaDecoder's basic extraction with:
 *   - Variable name tracking (what Java variables receive this field)
 *   - Log context extraction (how the field is logged)
 *   - Comparison target detection (what values the field is compared to)
 *   - Join relationship tracking (which tables/columns join on this field)
 *   - SOAP/EAI ValueObject field analysis (for BMCE-style projects)
 *   - DTO/Entity field mapping
 *
 * @author Hamza NORDINE — Compleo
 */

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface UsageSite {
  file: string;
  line: number;
  context: string;            // 2-3 lines around the usage
  type: 'sql-select' | 'sql-insert' | 'sql-update' | 'sql-where' |
        'jpa-column' | 'resultset-get' | 'preparedstatement-set' |
        'mapper-method' | 'dto-field' | 'vo-field' | 'soap-mapping' |
        'log-output' | 'comparison' | 'join' | 'comment';
}

export interface FieldUsage {
  fieldName: string;
  tableName: string;

  // Usage sites
  reads: UsageSite[];
  writes: UsageSite[];

  // Semantic context
  variableNames: string[];
  loggedAs: string[];
  comparedTo: string[];
  joinedWith: string[];

  // Meta
  filesReferencing: string[];
  totalUsages: number;
}

export interface FieldUsageAnalysisResult {
  fields: FieldUsage[];
  /** Tables discovered (with source) */
  tables: Map<string, string>;
  /** Execution time in ms */
  executionTimeMs: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split("\n").length;
}

function getContext(content: string, index: number, radius: number = 2): string {
  const lines = content.split("\n");
  const lineNum = getLineNumber(content, index) - 1;
  const start = Math.max(0, lineNum - radius);
  const end = Math.min(lines.length - 1, lineNum + radius);
  return lines.slice(start, end + 1).join("\n");
}

function extractSQLStrings(content: string): string[] {
  const results: string[] = [];
  const singleLineRegex = /"([^"]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|FROM|INTO|SET|WHERE)[^"]*)"/gi;
  let match;
  while ((match = singleLineRegex.exec(content)) !== null) {
    results.push(match[1]);
  }
  const multiLineRegex = /(?:"([^"]*)"(?:\s*\+\s*"([^"]*)")+)/g;
  while ((match = multiLineRegex.exec(content)) !== null) {
    const fullStr = match[0].replace(/"\s*\+\s*"/g, " ").replace(/^"|"$/g, "");
    if (/SELECT|INSERT|UPDATE|DELETE|CREATE|FROM/i.test(fullStr)) {
      results.push(fullStr);
    }
  }
  return results;
}

const GENERIC_VARS = new Set([
  "x", "y", "z", "tmp", "temp", "obj", "val", "value", "v",
  "s", "str", "i", "j", "k", "n", "result", "res", "ret",
  "data", "item", "element", "o", "p", "q", "r",
]);

// ─── Main Analyzer ──────────────────────────────────────────────────────────

export class FieldUsageAnalyzer {
  private fieldMap = new Map<string, FieldUsage>();
  private tables = new Map<string, string>();

  /**
   * Analyze all Java source files and collect field usages.
   */
  analyze(files: { path: string; content: string }[]): FieldUsageAnalysisResult {
    const t0 = Date.now();

    for (const file of files) {
      if (!file.content) continue;
      const fileName = file.path.replace(/.*\//, "");

      // 1. SQL-based extraction
      this.extractSqlUsages(file.content, fileName);

      // 2. ResultSet getter extraction
      this.extractResultSetUsages(file.content, fileName);

      // 3. PreparedStatement setter extraction
      this.extractPreparedStatementUsages(file.content, fileName);

      // 4. JPA @Column annotation
      this.extractJpaColumnUsages(file.content, fileName);

      // 5. Variable name tracking
      this.extractVariableNameMappings(file.content, fileName);

      // 6. Log context extraction
      this.extractLogContexts(file.content, fileName);

      // 7. Comparison target detection
      this.extractComparisonTargets(file.content, fileName);

      // 8. Join relationship tracking
      this.extractJoinRelationships(file.content, fileName);

      // 9. SOAP/EAI ValueObject fields
      this.extractValueObjectFields(file.content, fileName);

      // 10. DTO/Entity field declarations
      this.extractDtoEntityFields(file.content, fileName);

      // 11. Comment-based hints
      this.extractCommentHints(file.content, fileName);

      // 12. MyBatis/Hibernate XML mappings (in Java string literals)
      this.extractXmlMappings(file.content, fileName);
    }

    return {
      fields: Array.from(this.fieldMap.values()),
      tables: this.tables,
      executionTimeMs: Date.now() - t0,
    };
  }

  // ─── Field access helper ────────────────────────────────────────────────

  private getOrCreateField(fieldName: string, tableName: string): FieldUsage {
    const key = `${tableName.toUpperCase()}.${fieldName.toUpperCase()}`;
    if (!this.fieldMap.has(key)) {
      this.fieldMap.set(key, {
        fieldName: fieldName.toUpperCase(),
        tableName: tableName.toUpperCase(),
        reads: [],
        writes: [],
        variableNames: [],
        loggedAs: [],
        comparedTo: [],
        joinedWith: [],
        filesReferencing: [],
        totalUsages: 0,
      });
    }
    const field = this.fieldMap.get(key)!;
    return field;
  }

  private addUsage(
    field: FieldUsage,
    site: UsageSite,
    direction: 'read' | 'write',
    fileName: string
  ): void {
    if (direction === 'read') field.reads.push(site);
    else field.writes.push(site);
    if (!field.filesReferencing.includes(fileName)) {
      field.filesReferencing.push(fileName);
    }
    field.totalUsages++;
  }

  private ensureTable(tableName: string, source: string): void {
    if (!this.tables.has(tableName.toUpperCase())) {
      this.tables.set(tableName.toUpperCase(), source);
    }
  }

  // ─── 1. SQL-based extraction ────────────────────────────────────────────

  private extractSqlUsages(content: string, fileName: string): void {
    const sqlStrings = extractSQLStrings(content);

    for (const sql of sqlStrings) {
      // SELECT cols FROM table
      const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
      if (selectMatch) {
        const tableName = selectMatch[2];
        this.ensureTable(tableName, "SQL SELECT");
        const selectClause = selectMatch[1].trim();
        if (selectClause !== "*") {
          const cols = selectClause.split(",").map(c => c.trim());
          for (const col of cols) {
            const colName = col.replace(/.*\.\s*/, "").replace(/\s+AS\s+\w+/i, "").trim();
            if (colName && /^\w+$/.test(colName)) {
              const field = this.getOrCreateField(colName, tableName);
              const idx = content.indexOf(sql);
              this.addUsage(field, {
                file: fileName,
                line: idx >= 0 ? getLineNumber(content, idx) : 0,
                context: idx >= 0 ? getContext(content, idx) : sql,
                type: 'sql-select',
              }, 'read', fileName);
            }
          }
        }
      }

      // INSERT INTO table (cols)
      const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
      if (insertMatch) {
        const tableName = insertMatch[1];
        this.ensureTable(tableName, "SQL INSERT");
        const cols = insertMatch[2].split(",").map(c => c.trim());
        for (const col of cols) {
          if (col && /^\w+$/.test(col)) {
            const field = this.getOrCreateField(col, tableName);
            const idx = content.indexOf(sql);
            this.addUsage(field, {
              file: fileName,
              line: idx >= 0 ? getLineNumber(content, idx) : 0,
              context: idx >= 0 ? getContext(content, idx) : sql,
              type: 'sql-insert',
            }, 'write', fileName);
          }
        }
      }

      // UPDATE table SET col = ?
      const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE|$)/i);
      if (updateMatch) {
        const tableName = updateMatch[1];
        this.ensureTable(tableName, "SQL UPDATE");
        const setCols = updateMatch[2].split(",");
        for (const setCol of setCols) {
          const colMatch = setCol.trim().match(/^(\w+)\s*=/);
          if (colMatch) {
            const field = this.getOrCreateField(colMatch[1], tableName);
            const idx = content.indexOf(sql);
            this.addUsage(field, {
              file: fileName,
              line: idx >= 0 ? getLineNumber(content, idx) : 0,
              context: idx >= 0 ? getContext(content, idx) : sql,
              type: 'sql-update',
            }, 'write', fileName);
          }
        }
      }

      // WHERE col = ? / col IN (?) / col LIKE ?
      const whereMatch = sql.match(/WHERE\s+(.+)/i);
      if (whereMatch) {
        const whereClause = whereMatch[1];
        const condRegex = /(\w+)\s*(?:=|<>|!=|>=|<=|>|<|LIKE|IN|BETWEEN|IS)\s*/gi;
        let condMatch;
        while ((condMatch = condRegex.exec(whereClause)) !== null) {
          const colName = condMatch[1];
          if (/^(AND|OR|NOT|NULL)$/i.test(colName)) continue;
          // Find the table from the FROM clause
          const fromMatch = sql.match(/FROM\s+(\w+)/i);
          if (fromMatch) {
            const field = this.getOrCreateField(colName, fromMatch[1]);
            const idx = content.indexOf(sql);
            this.addUsage(field, {
              file: fileName,
              line: idx >= 0 ? getLineNumber(content, idx) : 0,
              context: idx >= 0 ? getContext(content, idx) : sql,
              type: 'sql-where',
            }, 'read', fileName);
          }
        }
      }

      // CREATE TABLE
      const createMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\((.+)\)/is);
      if (createMatch) {
        const tableName = createMatch[1];
        this.ensureTable(tableName, "DDL");
        const colDefs = createMatch[2].split(",");
        for (const colDef of colDefs) {
          const defMatch = colDef.trim().match(/^(\w+)\s+(\w+)/);
          if (defMatch && !["PRIMARY", "FOREIGN", "CONSTRAINT", "INDEX", "UNIQUE", "KEY", "CHECK"].includes(defMatch[1].toUpperCase())) {
            this.getOrCreateField(defMatch[1], tableName);
          }
        }
      }
    }
  }

  // ─── 2. ResultSet getter extraction ─────────────────────────────────────

  private extractResultSetUsages(content: string, fileName: string): void {
    // rs.getString("COLUMN") / rs.getInt("COLUMN") etc.
    const rsRegex = /(?:rs|resultSet|rset|result)\s*\.\s*(get\w+)\s*\(\s*"(\w+)"\s*\)/g;
    let match;
    while ((match = rsRegex.exec(content)) !== null) {
      const [, , columnName] = match;
      // Try to find the table from SQL context
      const sqlStrings = extractSQLStrings(content);
      let tableName = "UNKNOWN";
      for (const sql of sqlStrings) {
        const fromMatch = sql.match(/FROM\s+(\w+)/i);
        if (fromMatch && sql.toUpperCase().includes(columnName.toUpperCase())) {
          tableName = fromMatch[1];
          break;
        }
      }
      if (tableName === "UNKNOWN") {
        for (const sql of sqlStrings) {
          const fromMatch = sql.match(/FROM\s+(\w+)/i);
          if (fromMatch) { tableName = fromMatch[1]; break; }
        }
      }
      this.ensureTable(tableName, "ResultSet");
      const field = this.getOrCreateField(columnName, tableName);
      this.addUsage(field, {
        file: fileName,
        line: getLineNumber(content, match.index),
        context: getContext(content, match.index),
        type: 'resultset-get',
      }, 'read', fileName);
    }
  }

  // ─── 3. PreparedStatement setter extraction ─────────────────────────────

  private extractPreparedStatementUsages(content: string, fileName: string): void {
    const psRegex = /(?:ps|pstmt|preparedStatement|stmt)\s*\.\s*(set\w+)\s*\(\s*(\d+)\s*,\s*(\w+)\s*\)/g;
    let match;
    while ((match = psRegex.exec(content)) !== null) {
      const [, , indexStr, varName] = match;
      const sqlStrings = extractSQLStrings(content);
      for (const sql of sqlStrings) {
        const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
        if (insertMatch) {
          const cols = insertMatch[2].split(",").map(c => c.trim());
          const idx = parseInt(indexStr) - 1;
          if (idx >= 0 && idx < cols.length) {
            const field = this.getOrCreateField(cols[idx], insertMatch[1]);
            this.addUsage(field, {
              file: fileName,
              line: getLineNumber(content, match.index),
              context: getContext(content, match.index),
              type: 'preparedstatement-set',
            }, 'write', fileName);
            // Track variable name
            if (!GENERIC_VARS.has(varName.toLowerCase()) && !field.variableNames.includes(varName)) {
              field.variableNames.push(varName);
            }
          }
        }
      }
    }
  }

  // ─── 4. JPA @Column annotation ──────────────────────────────────────────

  private extractJpaColumnUsages(content: string, fileName: string): void {
    const tableAnnotation = content.match(/@Table\s*\(\s*name\s*=\s*"(\w+)"\s*\)/i);
    const jpaTableName = tableAnnotation ? tableAnnotation[1] : null;

    const columnRegex = /@Column\s*\([^)]*name\s*=\s*"(\w+)"[^)]*\)\s*(?:private|protected|public)?\s*(\w+)\s+(\w+)\s*[;=]/g;
    let match;
    while ((match = columnRegex.exec(content)) !== null) {
      const [, columnName, , fieldName] = match;
      const tableName = jpaTableName || "UNKNOWN_JPA";
      this.ensureTable(tableName, "@Table annotation");
      const field = this.getOrCreateField(columnName, tableName);
      this.addUsage(field, {
        file: fileName,
        line: getLineNumber(content, match.index),
        context: getContext(content, match.index),
        type: 'jpa-column',
      }, 'read', fileName);
      if (!GENERIC_VARS.has(fieldName.toLowerCase()) && !field.variableNames.includes(fieldName)) {
        field.variableNames.push(fieldName);
      }
    }
  }

  // ─── 5. Variable name tracking ──────────────────────────────────────────

  private extractVariableNameMappings(content: string, fileName: string): void {
    // Pattern: Type varName = rs.getXxx("COLUMN")
    const varRegex = /(?:String|Long|Integer|BigDecimal|LocalDate|LocalDateTime|Boolean|Double|Float|int|long|double|boolean)\s+(\w+)\s*=\s*(?:rs|resultSet|rset|result)\s*\.\s*get\w+\s*\(\s*"(\w+)"\s*\)/g;
    let match;
    while ((match = varRegex.exec(content)) !== null) {
      const [, varName, columnName] = match;
      if (GENERIC_VARS.has(varName.toLowerCase())) continue;
      // Find table
      const sqlStrings = extractSQLStrings(content);
      let tableName = "UNKNOWN";
      for (const sql of sqlStrings) {
        const fromMatch = sql.match(/FROM\s+(\w+)/i);
        if (fromMatch) { tableName = fromMatch[1]; break; }
      }
      const field = this.getOrCreateField(columnName, tableName);
      if (!field.variableNames.includes(varName)) {
        field.variableNames.push(varName);
      }
    }

    // Pattern: obj.setXxx(rs.getYyy("COLUMN")) → track "xxx" as variable name
    const setterRegex = /(\w+)\.(set(\w+))\s*\(\s*(?:rs|resultSet|rset|result)\s*\.\s*get\w+\s*\(\s*"(\w+)"\s*\)\s*\)/g;
    while ((match = setterRegex.exec(content)) !== null) {
      const [, , , propertyName, columnName] = match;
      const sqlStrings = extractSQLStrings(content);
      let tableName = "UNKNOWN";
      for (const sql of sqlStrings) {
        const fromMatch = sql.match(/FROM\s+(\w+)/i);
        if (fromMatch) { tableName = fromMatch[1]; break; }
      }
      const field = this.getOrCreateField(columnName, tableName);
      const camelName = propertyName.charAt(0).toLowerCase() + propertyName.slice(1);
      if (!field.variableNames.includes(camelName)) {
        field.variableNames.push(camelName);
      }
    }
  }

  // ─── 6. Log context extraction ──────────────────────────────────────────

  private extractLogContexts(content: string, fileName: string): void {
    // Pattern: log.info("label={}", varName) where varName maps to a field
    const logRegex = /(?:log|logger|LOG|LOGGER)\s*\.\s*(?:info|debug|warn|error|trace)\s*\(\s*"([^"]+)"\s*(?:,\s*(.+?))?\s*\)/g;
    let match;
    while ((match = logRegex.exec(content)) !== null) {
      const [, template, args] = match;
      if (!args) continue;

      // Extract placeholder labels from template
      const placeholders = template.match(/(\w+)\s*[=:]\s*\{}/g);
      if (!placeholders) continue;

      const argList = args.split(",").map(a => a.trim());
      for (let i = 0; i < Math.min(placeholders.length, argList.length); i++) {
        const labelMatch = placeholders[i].match(/(\w+)\s*[=:]\s*\{}/);
        if (!labelMatch) continue;
        const label = labelMatch[1];
        const argName = argList[i].replace(/.*\./, "").replace(/\(\)/, "");

        // Check if argName maps to any known field
        for (const field of this.fieldMap.values()) {
          if (field.variableNames.includes(argName)) {
            if (!field.loggedAs.includes(label)) {
              field.loggedAs.push(label);
            }
            this.addUsage(field, {
              file: fileName,
              line: getLineNumber(content, match.index),
              context: getContext(content, match.index),
              type: 'log-output',
            }, 'read', fileName);
          }
        }
      }
    }
  }

  // ─── 7. Comparison target detection ─────────────────────────────────────

  private extractComparisonTargets(content: string, fileName: string): void {
    // Pattern: if (varName.equals("VALUE")) or if (varName == CONSTANT)
    for (const field of this.fieldMap.values()) {
      for (const varName of field.variableNames) {
        // .equals("literal")
        const equalsRegex = new RegExp(
          `${varName}\\.equals\\s*\\(\\s*"([^"]+)"\\s*\\)`, "g"
        );
        let match;
        while ((match = equalsRegex.exec(content)) !== null) {
          const target = match[1];
          if (!field.comparedTo.includes(target)) {
            field.comparedTo.push(target);
          }
          this.addUsage(field, {
            file: fileName,
            line: getLineNumber(content, match.index),
            context: getContext(content, match.index),
            type: 'comparison',
          }, 'read', fileName);
        }

        // == CONSTANT or .equals(CONSTANT)
        const constRegex = new RegExp(
          `${varName}\\s*(?:==|!=)\\s*([A-Z_][A-Z_0-9]+)`, "g"
        );
        while ((match = constRegex.exec(content)) !== null) {
          const target = match[1];
          if (!field.comparedTo.includes(target)) {
            field.comparedTo.push(target);
          }
        }

        // .startsWith("prefix") or .endsWith("suffix")
        const startsRegex = new RegExp(
          `${varName}\\.(?:startsWith|endsWith)\\s*\\(\\s*"([^"]+)"\\s*\\)`, "g"
        );
        while ((match = startsRegex.exec(content)) !== null) {
          const target = `${match[0].includes("startsWith") ? "prefix" : "suffix"}:${match[1]}`;
          if (!field.comparedTo.includes(target)) {
            field.comparedTo.push(target);
          }
        }
      }
    }
  }

  // ─── 8. Join relationship tracking ──────────────────────────────────────

  private extractJoinRelationships(content: string, fileName: string): void {
    const sqlStrings = extractSQLStrings(content);
    for (const sql of sqlStrings) {
      // Pattern: T1.col1 = T2.col2 (in JOIN or WHERE)
      const joinRegex = /(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/g;
      let match;
      while ((match = joinRegex.exec(sql)) !== null) {
        const [, table1, col1, table2, col2] = match;
        // Skip SQL keywords
        if (/^(AND|OR|NOT|WHERE|SET|FROM|JOIN)$/i.test(table1)) continue;
        if (/^(AND|OR|NOT|WHERE|SET|FROM|JOIN)$/i.test(table2)) continue;

        this.ensureTable(table1, "SQL JOIN");
        this.ensureTable(table2, "SQL JOIN");

        const field1 = this.getOrCreateField(col1, table1);
        const joinRef1 = `${table2}.${col2}`;
        if (!field1.joinedWith.includes(joinRef1)) {
          field1.joinedWith.push(joinRef1);
        }
        this.addUsage(field1, {
          file: fileName,
          line: 0,
          context: sql.substring(0, 200),
          type: 'join',
        }, 'read', fileName);

        const field2 = this.getOrCreateField(col2, table2);
        const joinRef2 = `${table1}.${col1}`;
        if (!field2.joinedWith.includes(joinRef2)) {
          field2.joinedWith.push(joinRef2);
        }
      }
    }
  }

  // ─── 9. SOAP/EAI ValueObject fields ────────────────────────────────────

  private extractValueObjectFields(content: string, fileName: string): void {
    // Detect ValueObject patterns (VoIn, VoOut, FluxResponse, etc.)
    const voClassMatch = content.match(/class\s+(\w*(?:Vo(?:In|Out)|ValueObject|FluxResponse|FluxRequest|Response|Request)\w*)/i);
    if (!voClassMatch) return;

    const voClassName = voClassMatch[1];
    // Extract field declarations
    const fieldRegex = /(?:private|protected|public)\s+(\w+)\s+(\w+)\s*[;=]/g;
    let match;
    while ((match = fieldRegex.exec(content)) !== null) {
      const [, javaType, fieldName] = match;
      if (GENERIC_VARS.has(fieldName.toLowerCase())) continue;
      if (/^(serialVersionUID|logger|LOG)$/.test(fieldName)) continue;

      const tableName = `VO:${voClassName}`;
      this.ensureTable(tableName, "ValueObject");
      const field = this.getOrCreateField(fieldName, tableName);
      this.addUsage(field, {
        file: fileName,
        line: getLineNumber(content, match.index),
        context: getContext(content, match.index),
        type: 'vo-field',
      }, 'read', fileName);
      if (!field.variableNames.includes(fieldName)) {
        field.variableNames.push(fieldName);
      }
    }
  }

  // ─── 10. DTO/Entity field declarations ──────────────────────────────────

  private extractDtoEntityFields(content: string, fileName: string): void {
    // Detect DTO/Entity classes
    const classMatch = content.match(/class\s+(\w*(?:DTO|Dto|Entity|Model|Bean)\w*)/);
    if (!classMatch) return;

    const className = classMatch[1];
    // Check for @Entity or @Table annotation
    const isEntity = /@Entity/.test(content);
    const tableAnnotation = content.match(/@Table\s*\(\s*name\s*=\s*"(\w+)"\s*\)/i);
    const tableName = tableAnnotation ? tableAnnotation[1] : (isEntity ? `ENTITY:${className}` : `DTO:${className}`);

    this.ensureTable(tableName, isEntity ? "@Entity" : "DTO class");

    const fieldRegex = /(?:private|protected|public)\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*[;=]/g;
    let match;
    while ((match = fieldRegex.exec(content)) !== null) {
      const [, , fieldName] = match;
      if (GENERIC_VARS.has(fieldName.toLowerCase())) continue;
      if (/^(serialVersionUID|logger|LOG)$/.test(fieldName)) continue;

      const field = this.getOrCreateField(fieldName, tableName);
      this.addUsage(field, {
        file: fileName,
        line: getLineNumber(content, match.index),
        context: getContext(content, match.index),
        type: 'dto-field',
      }, 'read', fileName);
      if (!field.variableNames.includes(fieldName)) {
        field.variableNames.push(fieldName);
      }
    }
  }

  // ─── 11. Comment-based hints ────────────────────────────────────────────

  private extractCommentHints(content: string, fileName: string): void {
    // Pattern: // FIELD1 = description or /* FIELD1: description */
    const commentRegex = /(?:\/\/|\/\*)\s*(\w+)\s*[=:—–-]\s*(.+?)(?:\*\/|$)/gm;
    let match;
    while ((match = commentRegex.exec(content)) !== null) {
      const [, fieldName, description] = match;
      // Check if this field exists in our map
      for (const field of this.fieldMap.values()) {
        if (field.fieldName === fieldName.toUpperCase()) {
          this.addUsage(field, {
            file: fileName,
            line: getLineNumber(content, match.index),
            context: description.trim(),
            type: 'comment',
          }, 'read', fileName);
        }
      }
    }
  }

  // ─── 12. XML mappings in string literals ────────────────────────────────

  private extractXmlMappings(content: string, fileName: string): void {
    // MyBatis: <result column="FIELD1" property="reference"/>
    const mybatisRegex = /<result\s+column\s*=\s*"(\w+)"\s+property\s*=\s*"(\w+)"\s*\/?>/g;
    let match;
    while ((match = mybatisRegex.exec(content)) !== null) {
      const [, columnName, propertyName] = match;
      const field = this.getOrCreateField(columnName, "MYBATIS_MAPPED");
      this.ensureTable("MYBATIS_MAPPED", "MyBatis XML");
      this.addUsage(field, {
        file: fileName,
        line: getLineNumber(content, match.index),
        context: getContext(content, match.index),
        type: 'mapper-method',
      }, 'read', fileName);
      if (!field.variableNames.includes(propertyName)) {
        field.variableNames.push(propertyName);
      }
    }

    // Hibernate: <column name="FIELD1"/>
    const hibernateRegex = /<column\s+name\s*=\s*"(\w+)"\s*\/?>/g;
    while ((match = hibernateRegex.exec(content)) !== null) {
      const [, columnName] = match;
      const field = this.getOrCreateField(columnName, "HIBERNATE_MAPPED");
      this.ensureTable("HIBERNATE_MAPPED", "Hibernate XML");
      this.addUsage(field, {
        file: fileName,
        line: getLineNumber(content, match.index),
        context: getContext(content, match.index),
        type: 'mapper-method',
      }, 'read', fileName);
    }
  }
}
