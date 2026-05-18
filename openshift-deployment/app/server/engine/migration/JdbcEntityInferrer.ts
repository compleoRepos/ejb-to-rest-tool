/**
 * JdbcEntityInferrer v12.2 — Infer JPA entities from JDBC raw SQL queries.
 *
 * When a project uses JDBC raw (no @Entity annotations), this module scans
 * Java source files for SQL strings and ResultSet.getXxx() calls to infer:
 *   - Table names → Entity classes
 *   - Column names + types → Entity fields
 *   - Generated JPA entities + Spring Data repositories
 *
 * @author Hamza NORDINE — Compleo
 */

export interface InferredColumn {
  name: string;
  javaType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export interface InferredEntity {
  tableName: string;
  className: string;
  columns: InferredColumn[];
  inferred: true;
  sourceFiles: string[];
}

export interface InferredEntityResult {
  entities: InferredEntity[];
  repositories: { className: string; entityClass: string; idType: string }[];
  entityFiles: { path: string; content: string }[];
  repositoryFiles: { path: string; content: string }[];
}

// Mapping rs.getXxx → Java type
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

// SQL type → Java type mapping (for CREATE TABLE)
const SQL_TYPE_MAP: Record<string, string> = {
  varchar: "String",
  char: "String",
  text: "String",
  longtext: "String",
  int: "Integer",
  integer: "Integer",
  bigint: "Long",
  smallint: "Short",
  tinyint: "Byte",
  decimal: "BigDecimal",
  numeric: "BigDecimal",
  float: "Float",
  double: "Double",
  real: "Double",
  boolean: "Boolean",
  bit: "Boolean",
  date: "LocalDate",
  datetime: "LocalDateTime",
  timestamp: "LocalDateTime",
  time: "LocalTime",
  blob: "byte[]",
  clob: "String",
};

/**
 * Infer entities from JDBC raw SQL in Java source files.
 */
export function inferEntitiesFromJdbc(
  files: { path: string; content: string }[],
  basePackage: string
): InferredEntityResult {
  const tableColumns = new Map<string, Map<string, InferredColumn>>();
  const tableSourceFiles = new Map<string, Set<string>>();

  for (const file of files) {
    if (!file.content) continue;

    // Extract table names and columns from SQL strings
    extractFromSQL(file.content, file.path, tableColumns, tableSourceFiles);

    // Extract column types from ResultSet.getXxx("column") calls
    extractFromResultSet(file.content, file.path, tableColumns, tableSourceFiles);
  }

  // Build entities
  const entities: InferredEntity[] = [];
  const repositories: { className: string; entityClass: string; idType: string }[] = [];
  const entityFiles: { path: string; content: string }[] = [];
  const repositoryFiles: { path: string; content: string }[] = [];

  for (const [tableName, columnsMap] of tableColumns.entries()) {
    if (columnsMap.size === 0) continue;

    const className = tableNameToClassName(tableName);
    const columns = Array.from(columnsMap.values());

    // Ensure there's an ID column
    if (!columns.some(c => c.isPrimaryKey)) {
      // Infer ID from common patterns
      const idCol = columns.find(c =>
        /^(id|ID|pk|primary_key)$/i.test(c.name) ||
        c.name.toLowerCase().endsWith("_id") && c.name.toLowerCase().startsWith(tableName.toLowerCase().substring(0, 3))
      );
      if (idCol) {
        idCol.isPrimaryKey = true;
      } else {
        // Add a default ID
        columns.unshift({
          name: "id",
          javaType: "Long",
          nullable: false,
          isPrimaryKey: true,
        });
      }
    }

    const sourceFilesArr = Array.from(tableSourceFiles.get(tableName) || []);
    const entity: InferredEntity = {
      tableName,
      className,
      columns,
      inferred: true,
      sourceFiles: sourceFilesArr,
    };
    entities.push(entity);

    // Generate entity file
    const idType = columns.find(c => c.isPrimaryKey)?.javaType || "Long";
    entityFiles.push({
      path: `src/main/java/${basePackage.replace(/\./g, "/")}/entity/${className}.java`,
      content: generateEntityCode(entity, basePackage),
    });

    // Generate repository file
    const repoClassName = `${className}Repository`;
    repositories.push({ className: repoClassName, entityClass: className, idType });
    repositoryFiles.push({
      path: `src/main/java/${basePackage.replace(/\./g, "/")}/repository/${repoClassName}.java`,
      content: generateRepositoryCode(className, idType, basePackage),
    });
  }

  return { entities, repositories, entityFiles, repositoryFiles };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function extractFromSQL(
  content: string,
  filePath: string,
  tableColumns: Map<string, Map<string, InferredColumn>>,
  tableSourceFiles: Map<string, Set<string>>
): void {
  // Match SQL strings (both single-line and multi-line concatenated)
  const sqlStrings = extractSQLStrings(content);

  for (const sql of sqlStrings) {
    const upperSql = sql.toUpperCase();

    // SELECT ... FROM table_name
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
    if (selectMatch) {
      const tableName = selectMatch[2];
      ensureTable(tableName, tableColumns, tableSourceFiles, filePath);

      // Extract column names from SELECT clause
      const selectClause = selectMatch[1];
      if (selectClause.trim() !== "*") {
        const cols = selectClause.split(",").map(c => c.trim());
        for (const col of cols) {
          // Handle aliases: col AS alias, table.col
          const colName = col.replace(/.*\.\s*/, "").replace(/\s+AS\s+\w+/i, "").trim();
          if (colName && /^\w+$/.test(colName) && colName.toUpperCase() !== colName) {
            addColumn(tableName, colName, "String", tableColumns);
          }
        }
      }
    }

    // INSERT INTO table_name (col1, col2, ...)
    const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const tableName = insertMatch[1];
      ensureTable(tableName, tableColumns, tableSourceFiles, filePath);
      const cols = insertMatch[2].split(",").map(c => c.trim());
      for (const col of cols) {
        if (col && /^\w+$/.test(col)) {
          addColumn(tableName, col, "String", tableColumns);
        }
      }
    }

    // UPDATE table_name SET col1 = ?, col2 = ?
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE|$)/i);
    if (updateMatch) {
      const tableName = updateMatch[1];
      ensureTable(tableName, tableColumns, tableSourceFiles, filePath);
      const setCols = updateMatch[2].split(",");
      for (const setCol of setCols) {
        const colMatch = setCol.trim().match(/^(\w+)\s*=/);
        if (colMatch) {
          addColumn(tableName, colMatch[1], "String", tableColumns);
        }
      }
    }

    // CREATE TABLE table_name (col1 TYPE, col2 TYPE, ...)
    const createMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\((.+)\)/is);
    if (createMatch) {
      const tableName = createMatch[1];
      ensureTable(tableName, tableColumns, tableSourceFiles, filePath);
      const colDefs = createMatch[2].split(",");
      for (const colDef of colDefs) {
        const defMatch = colDef.trim().match(/^(\w+)\s+(\w+)/);
        if (defMatch && !["PRIMARY", "FOREIGN", "CONSTRAINT", "INDEX", "UNIQUE", "KEY", "CHECK"].includes(defMatch[1].toUpperCase())) {
          const colName = defMatch[1];
          const sqlType = defMatch[2].toLowerCase();
          const javaType = SQL_TYPE_MAP[sqlType] || "String";
          const isPK = /PRIMARY\s+KEY/i.test(colDef) || /AUTO_INCREMENT|SERIAL/i.test(colDef);
          addColumn(tableName, colName, javaType, tableColumns, isPK);
        }
      }
    }

    // DELETE FROM table_name WHERE col = ?
    const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (deleteMatch) {
      const tableName = deleteMatch[1];
      ensureTable(tableName, tableColumns, tableSourceFiles, filePath);
    }
  }
}

function extractFromResultSet(
  content: string,
  filePath: string,
  tableColumns: Map<string, Map<string, InferredColumn>>,
  tableSourceFiles: Map<string, Set<string>>
): void {
  // Match rs.getString("column"), rs.getLong("column"), etc.
  const rsRegex = /(?:rs|resultSet|rset|result)\s*\.\s*(get\w+)\s*\(\s*"(\w+)"\s*\)/g;
  let match;

  // First, find the table context (look for the SQL query above)
  const lines = content.split("\n");
  let currentTable = "";

  for (let i = 0; i < lines.length; i++) {
    // Track current table from SQL context
    const fromMatch = lines[i].match(/FROM\s+(\w+)/i);
    if (fromMatch) {
      currentTable = fromMatch[1];
    }

    // Match ResultSet.getXxx calls
    const lineRsMatches = lines[i].matchAll(/(?:rs|resultSet|rset|result)\s*\.\s*(get\w+)\s*\(\s*"(\w+)"\s*\)/g);
    for (const rsMatch of lineRsMatches) {
      const getterMethod = rsMatch[1];
      const columnName = rsMatch[2];
      const javaType = RS_TYPE_MAP[getterMethod] || "String";

      if (currentTable) {
        ensureTable(currentTable, tableColumns, tableSourceFiles, filePath);
        addColumn(currentTable, columnName, javaType, tableColumns);
      }
    }
  }
}

function extractSQLStrings(content: string): string[] {
  const results: string[] = [];

  // Match string literals that look like SQL
  const stringRegex = /"([^"]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE)[^"]*)"/gi;
  let match;
  while ((match = stringRegex.exec(content)) !== null) {
    results.push(match[1]);
  }

  // Match multi-line concatenated SQL: "SELECT " + "col FROM " + "table"
  const multiLineRegex = /(?:"[^"]*"\s*\+\s*)*"[^"]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE)[^"]*"(?:\s*\+\s*"[^"]*")*/gi;
  while ((match = multiLineRegex.exec(content)) !== null) {
    const combined = match[0].replace(/"\s*\+\s*"/g, "").replace(/^"|"$/g, "");
    if (!results.includes(combined)) {
      results.push(combined);
    }
  }

  return results;
}

function ensureTable(
  tableName: string,
  tableColumns: Map<string, Map<string, InferredColumn>>,
  tableSourceFiles: Map<string, Set<string>>,
  filePath: string
): void {
  // Skip common SQL keywords that might be mistaken for table names
  const SKIP_TABLES = new Set(["SET", "VALUES", "NULL", "NOT", "AND", "OR", "WHERE", "FROM", "INTO", "TABLE", "INDEX", "KEY", "CONSTRAINT"]);
  if (SKIP_TABLES.has(tableName.toUpperCase())) return;

  if (!tableColumns.has(tableName)) {
    tableColumns.set(tableName, new Map());
  }
  if (!tableSourceFiles.has(tableName)) {
    tableSourceFiles.set(tableName, new Set());
  }
  tableSourceFiles.get(tableName)!.add(filePath);
}

function addColumn(
  tableName: string,
  colName: string,
  javaType: string,
  tableColumns: Map<string, Map<string, InferredColumn>>,
  isPrimaryKey = false
): void {
  const columns = tableColumns.get(tableName);
  if (!columns) return;

  // Skip SQL keywords
  if (["SET", "VALUES", "NULL", "NOT", "AND", "OR", "WHERE", "FROM", "INTO"].includes(colName.toUpperCase())) return;

  const existing = columns.get(colName);
  if (existing) {
    // Update type if we have a more specific one
    if (existing.javaType === "String" && javaType !== "String") {
      existing.javaType = javaType;
    }
    if (isPrimaryKey) existing.isPrimaryKey = true;
  } else {
    columns.set(colName, {
      name: colName,
      javaType,
      nullable: !isPrimaryKey,
      isPrimaryKey,
    });
  }
}

function tableNameToClassName(tableName: string): string {
  // Convert table_name or TABLE_NAME to ClassName
  return tableName
    .toLowerCase()
    .split(/[_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
    // Remove trailing 's' for plural tables
    .replace(/s$/, "");
}

function generateEntityCode(entity: InferredEntity, basePackage: string): string {
  const imports = new Set<string>();
  imports.add("import jakarta.persistence.*;");
  imports.add("import lombok.*;");

  for (const col of entity.columns) {
    if (col.javaType === "BigDecimal") imports.add("import java.math.BigDecimal;");
    if (col.javaType === "LocalDate") imports.add("import java.time.LocalDate;");
    if (col.javaType === "LocalDateTime") imports.add("import java.time.LocalDateTime;");
    if (col.javaType === "LocalTime") imports.add("import java.time.LocalTime;");
  }

  const fields = entity.columns.map(col => {
    const annotations: string[] = [];
    if (col.isPrimaryKey) {
      annotations.push("    @Id");
      annotations.push("    @GeneratedValue(strategy = GenerationType.IDENTITY)");
    }
    if (!col.isPrimaryKey && col.name !== col.name.toLowerCase()) {
      annotations.push(`    @Column(name = "${col.name}")`);
    }
    return [...annotations, `    private ${col.javaType} ${camelCase(col.name)};`].join("\n");
  });

  return `package ${basePackage}.entity;

${Array.from(imports).sort().join("\n")}

/**
 * ${entity.className} — Inferred from JDBC queries on table "${entity.tableName}".
 * Source files: ${entity.sourceFiles.map(f => f.split("/").pop()).join(", ")}
 */
@Entity
@Table(name = "${entity.tableName}")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ${entity.className} {

${fields.join("\n\n")}
}
`;
}

function generateRepositoryCode(entityClass: string, idType: string, basePackage: string): string {
  return `package ${basePackage}.repository;

import ${basePackage}.entity.${entityClass};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * ${entityClass}Repository — Spring Data repository for ${entityClass}.
 * Inferred from JDBC raw queries.
 */
@Repository
public interface ${entityClass}Repository extends JpaRepository<${entityClass}, ${idType}> {
}
`;
}

function camelCase(name: string): string {
  // Convert column_name to columnName
  return name
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
