/**
 * SqlConverter.ts — EXEC SQL → JdbcTemplate / Spring Data JPA
 * Converts embedded COBOL SQL statements to Spring Boot data access code.
 *
 * Strategies:
 *   SELECT INTO  → jdbcTemplate.queryForObject() or repository.findBy*()
 *   INSERT       → jdbcTemplate.update() or repository.save()
 *   UPDATE       → jdbcTemplate.update() or @Modifying @Query
 *   DELETE       → jdbcTemplate.update() or repository.deleteBy*()
 *   DECLARE CURSOR + OPEN + FETCH + CLOSE → JdbcCursorItemReader (Spring Batch)
 *   INCLUDE      → (skip, handled by copybook expansion)
 *
 * @author Compleo v11.1
 */

import { cobolNameToJava } from "./DataItemMapper";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SqlStatement {
  type: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CURSOR" | "OPEN" | "FETCH" | "CLOSE" | "INCLUDE" | "OTHER";
  rawSql: string;
  hostVariables: string[];
  intoVariables?: string[];
  cursorName?: string;
  tableName?: string;
}

export interface ConvertedSql {
  javaCode: string;
  methodName: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  imports: string[];
  isRepositoryMethod: boolean;
  repositorySignature?: string;
}

export interface CursorGroup {
  cursorName: string;
  declareSql: string;
  hostVariables: string[];
  fetchIntoVars: string[];
  tableName?: string;
}

// ─── SQL Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a raw EXEC SQL block into a structured SqlStatement.
 */
export function parseSqlStatement(rawBlock: string): SqlStatement {
  // Clean up the SQL: remove EXEC SQL / END-EXEC markers
  let sql = rawBlock
    .replace(/EXEC\s+SQL/gi, "")
    .replace(/END-EXEC\.?/gi, "")
    .replace(/\n/g, " ")
    .trim();

  // Extract host variables (:VAR-NAME)
  const hostVarRegex = /:([A-Za-z0-9-]+)/g;
  const hostVariables: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = hostVarRegex.exec(sql)) !== null) {
    hostVariables.push(match[1]);
  }

  // Determine type
  const upperSql = sql.toUpperCase().trim();

  if (upperSql.startsWith("DECLARE") && upperSql.includes("CURSOR")) {
    const cursorMatch = sql.match(/DECLARE\s+([\w-]+)\s+CURSOR/i);
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    return {
      type: "CURSOR",
      rawSql: sql,
      hostVariables,
      cursorName: cursorMatch?.[1],
      tableName: tableMatch?.[1],
    };
  }

  if (upperSql.startsWith("OPEN")) {
    const cursorMatch = sql.match(/OPEN\s+([\w-]+)/i);
    return { type: "OPEN", rawSql: sql, hostVariables, cursorName: cursorMatch?.[1] };
  }

  if (upperSql.startsWith("FETCH")) {
    const cursorMatch = sql.match(/FETCH\s+([\w-]+)/i);
    const intoMatch = sql.match(/INTO\s+(.+)/i);
    const intoVars = intoMatch ? intoMatch[1].split(",").map(v => v.trim().replace(/^:/, "")) : [];
    return { type: "FETCH", rawSql: sql, hostVariables, cursorName: cursorMatch?.[1], intoVariables: intoVars };
  }

  if (upperSql.startsWith("CLOSE")) {
    const cursorMatch = sql.match(/CLOSE\s+([\w-]+)/i);
    return { type: "CLOSE", rawSql: sql, hostVariables, cursorName: cursorMatch?.[1] };
  }

  if (upperSql.startsWith("SELECT")) {
    const intoMatch = sql.match(/INTO\s+(.+?)\s+FROM/i);
    const intoVars = intoMatch ? intoMatch[1].split(",").map(v => v.trim().replace(/^:/, "")) : [];
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    return { type: "SELECT", rawSql: sql, hostVariables, intoVariables: intoVars, tableName: tableMatch?.[1] };
  }

  if (upperSql.startsWith("INSERT")) {
    const tableMatch = sql.match(/INTO\s+(\w+)/i);
    return { type: "INSERT", rawSql: sql, hostVariables, tableName: tableMatch?.[1] };
  }

  if (upperSql.startsWith("UPDATE")) {
    const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
    return { type: "UPDATE", rawSql: sql, hostVariables, tableName: tableMatch?.[1] };
  }

  if (upperSql.startsWith("DELETE")) {
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    return { type: "DELETE", rawSql: sql, hostVariables, tableName: tableMatch?.[1] };
  }

  if (upperSql.startsWith("INCLUDE")) {
    return { type: "INCLUDE", rawSql: sql, hostVariables };
  }

  return { type: "OTHER", rawSql: sql, hostVariables };
}

// ─── SQL → Java Conversion ──────────────────────────────────────────────────

/**
 * Convert a SELECT INTO statement to JdbcTemplate code.
 */
export function convertSelect(stmt: SqlStatement): ConvertedSql {
  const tableName = stmt.tableName || "TABLE";
  const methodName = `findFrom${capitalize(tableName)}`;
  const intoVars = stmt.intoVariables || [];

  // Build parameter list from host variables (excluding INTO vars)
  const params = stmt.hostVariables
    .filter(v => !intoVars.includes(v))
    .map(v => ({ name: cobolNameToJava(v), type: "String" }));

  // Clean SQL for JdbcTemplate (replace :VAR with ?)
  const cleanSql = stmt.rawSql
    .replace(/INTO\s+.+?\s+FROM/i, "FROM") // Remove INTO clause
    .replace(/:[A-Za-z0-9-]+/g, "?")
    .trim();

  const returnType = intoVars.length > 1 ? "Map<String, Object>" : "String";

  const javaCode = intoVars.length > 1
    ? `    public ${returnType} ${methodName}(${params.map(p => `${p.type} ${p.name}`).join(", ")}) {
        String sql = "${cleanSql}";
        return jdbcTemplate.queryForMap(sql${params.length > 0 ? ", " + params.map(p => p.name).join(", ") : ""});
    }`
    : `    public ${returnType} ${methodName}(${params.map(p => `${p.type} ${p.name}`).join(", ")}) {
        String sql = "${cleanSql}";
        return jdbcTemplate.queryForObject(sql, String.class${params.length > 0 ? ", " + params.map(p => p.name).join(", ") : ""});
    }`;

  return {
    javaCode,
    methodName,
    returnType,
    parameters: params,
    imports: ["org.springframework.jdbc.core.JdbcTemplate"],
    isRepositoryMethod: false,
  };
}

/**
 * Convert an INSERT statement to JdbcTemplate code.
 */
export function convertInsert(stmt: SqlStatement): ConvertedSql {
  const tableName = stmt.tableName || "TABLE";
  const methodName = `insertInto${capitalize(tableName)}`;
  const params = stmt.hostVariables.map(v => ({ name: cobolNameToJava(v), type: "String" }));

  const cleanSql = stmt.rawSql.replace(/:[A-Za-z0-9-]+/g, "?").trim();

  const javaCode = `    public int ${methodName}(${params.map(p => `${p.type} ${p.name}`).join(", ")}) {
        String sql = "${cleanSql}";
        return jdbcTemplate.update(sql${params.length > 0 ? ", " + params.map(p => p.name).join(", ") : ""});
    }`;

  return {
    javaCode,
    methodName,
    returnType: "int",
    parameters: params,
    imports: ["org.springframework.jdbc.core.JdbcTemplate"],
    isRepositoryMethod: false,
  };
}

/**
 * Convert an UPDATE statement to JdbcTemplate code.
 */
export function convertUpdate(stmt: SqlStatement): ConvertedSql {
  const tableName = stmt.tableName || "TABLE";
  const methodName = `update${capitalize(tableName)}`;
  const params = stmt.hostVariables.map(v => ({ name: cobolNameToJava(v), type: "String" }));

  const cleanSql = stmt.rawSql.replace(/:[A-Za-z0-9-]+/g, "?").trim();

  const javaCode = `    public int ${methodName}(${params.map(p => `${p.type} ${p.name}`).join(", ")}) {
        String sql = "${cleanSql}";
        return jdbcTemplate.update(sql${params.length > 0 ? ", " + params.map(p => p.name).join(", ") : ""});
    }`;

  return {
    javaCode,
    methodName,
    returnType: "int",
    parameters: params,
    imports: ["org.springframework.jdbc.core.JdbcTemplate"],
    isRepositoryMethod: false,
  };
}

/**
 * Convert a DELETE statement to JdbcTemplate code.
 */
export function convertDelete(stmt: SqlStatement): ConvertedSql {
  const tableName = stmt.tableName || "TABLE";
  const methodName = `deleteFrom${capitalize(tableName)}`;
  const params = stmt.hostVariables.map(v => ({ name: cobolNameToJava(v), type: "String" }));

  const cleanSql = stmt.rawSql.replace(/:[A-Za-z0-9-]+/g, "?").trim();

  const javaCode = `    public int ${methodName}(${params.map(p => `${p.type} ${p.name}`).join(", ")}) {
        String sql = "${cleanSql}";
        return jdbcTemplate.update(sql${params.length > 0 ? ", " + params.map(p => p.name).join(", ") : ""});
    }`;

  return {
    javaCode,
    methodName,
    returnType: "int",
    parameters: params,
    imports: ["org.springframework.jdbc.core.JdbcTemplate"],
    isRepositoryMethod: false,
  };
}

/**
 * Convert a CURSOR group (DECLARE + OPEN + FETCH + CLOSE) to Spring Batch JdbcCursorItemReader.
 */
export function convertCursorGroup(cursor: CursorGroup): ConvertedSql {
  const readerName = `${camelCase(cursor.cursorName)}Reader`;
  const methodName = `create${capitalize(cursor.cursorName)}Reader`;

  // Clean the DECLARE SQL
  const selectSql = cursor.declareSql
    .replace(/DECLARE\s+\w+\s+CURSOR\s+(WITH\s+HOLD\s+)?FOR\s+/i, "")
    .replace(/:[A-Za-z0-9-]+/g, "?")
    .trim();

  const params = cursor.hostVariables.map(v => ({ name: cobolNameToJava(v), type: "String" }));

  const javaCode = `    @Bean
    @StepScope
    public JdbcCursorItemReader<Map<String, Object>> ${methodName}(
            DataSource dataSource${params.length > 0 ? ",\n            " + params.map(p => `@Value("#{jobParameters['${p.name}']}") ${p.type} ${p.name}`).join(",\n            ") : ""}) {
        return new JdbcCursorItemReaderBuilder<Map<String, Object>>()
                .name("${readerName}")
                .dataSource(dataSource)
                .sql("${selectSql}")
${params.length > 0 ? `                .preparedStatementSetter(ps -> {
${params.map((p, i) => `                    ps.setString(${i + 1}, ${p.name});`).join("\n")}
                })` : ""}
                .rowMapper(new ColumnMapRowMapper())
                .build();
    }`;

  return {
    javaCode,
    methodName,
    returnType: "JdbcCursorItemReader<Map<String, Object>>",
    parameters: params,
    imports: [
      "org.springframework.batch.item.database.JdbcCursorItemReader",
      "org.springframework.batch.item.database.builder.JdbcCursorItemReaderBuilder",
      "org.springframework.jdbc.core.ColumnMapRowMapper",
      "org.springframework.batch.core.configuration.annotation.StepScope",
      "org.springframework.beans.factory.annotation.Value",
      "org.springframework.context.annotation.Bean",
      "javax.sql.DataSource",
    ],
    isRepositoryMethod: false,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function camelCase(s: string): string {
  return s.split(/[-_]/).map((p, i) => i === 0 ? p.toLowerCase() : capitalize(p)).join("");
}

/**
 * Group cursor-related statements together.
 */
export function groupCursors(statements: SqlStatement[]): CursorGroup[] {
  const cursors = new Map<string, CursorGroup>();

  for (const stmt of statements) {
    if (stmt.type === "CURSOR" && stmt.cursorName) {
      cursors.set(stmt.cursorName, {
        cursorName: stmt.cursorName,
        declareSql: stmt.rawSql,
        hostVariables: stmt.hostVariables,
        fetchIntoVars: [],
        tableName: stmt.tableName,
      });
    }
    if (stmt.type === "FETCH" && stmt.cursorName && cursors.has(stmt.cursorName)) {
      const group = cursors.get(stmt.cursorName)!;
      group.fetchIntoVars = stmt.intoVariables || [];
    }
  }

  return [...cursors.values()];
}

/**
 * Convert all SQL statements from a COBOL program.
 */
export function convertAllSql(statements: SqlStatement[]): {
  methods: ConvertedSql[];
  cursorReaders: ConvertedSql[];
  allImports: Set<string>;
} {
  const methods: ConvertedSql[] = [];
  const cursorReaders: ConvertedSql[] = [];
  const allImports = new Set<string>();

  // Group cursors
  const cursorGroups = groupCursors(statements);
  const cursorNames = new Set(cursorGroups.map(c => c.cursorName));

  // Convert non-cursor statements
  for (const stmt of statements) {
    // Skip cursor-related statements (handled separately)
    if (stmt.type === "CURSOR" || stmt.type === "OPEN" || stmt.type === "FETCH" || stmt.type === "CLOSE") continue;
    if (stmt.type === "INCLUDE" || stmt.type === "OTHER") continue;

    let converted: ConvertedSql;
    switch (stmt.type) {
      case "SELECT":
        converted = convertSelect(stmt);
        break;
      case "INSERT":
        converted = convertInsert(stmt);
        break;
      case "UPDATE":
        converted = convertUpdate(stmt);
        break;
      case "DELETE":
        converted = convertDelete(stmt);
        break;
      default:
        continue;
    }
    methods.push(converted);
    converted.imports.forEach(i => allImports.add(i));
  }

  // Convert cursor groups
  for (const group of cursorGroups) {
    const converted = convertCursorGroup(group);
    cursorReaders.push(converted);
    converted.imports.forEach(i => allImports.add(i));
  }

  return { methods, cursorReaders, allImports };
}
