/**
 * Detecteur JDBC brut (DriverManager, PreparedStatement, ResultSet).
 * Tier 1 - Cible : Spring Data JPA Repository.
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  JdbcComponent,
  DetectedField,
} from "../registry/types";

export class JdbcDetector implements TechnologyDetector {
  readonly technology = "JDBC" as const;
  readonly tier = 1 as const;
  readonly label = "JDBC";

  canDetect(content: string, fileName: string): boolean {
    if (!fileName.endsWith(".java")) return false;
    return (
      /DriverManager\.getConnection/.test(content) ||
      /PreparedStatement/.test(content) ||
      /ResultSet\s+\w+\s*=/.test(content) ||
      /import\s+java\.sql\./.test(content)
    );
  }

  detect(content: string, fileName: string): DetectedComponent[] {
    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Extraire les requetes SQL
    const queries: { sql: string; jpql: string; type: "SELECT" | "INSERT" | "UPDATE" | "DELETE" }[] = [];
    const sqlRegex = /(?:prepareStatement|executeQuery|executeUpdate)\s*\(\s*"([^"]+(?:"[^"]*"[^"]*)*?)"/g;
    // Also match multi-line SQL with string concatenation
    const sqlConcatRegex = /(?:prepareStatement|executeQuery|executeUpdate)\s*\(\s*\n?\s*"([\s\S]*?)"\s*\)/g;
    let m: RegExpExecArray | null;

    const processedSqls = new Set<string>();

    while ((m = sqlRegex.exec(content)) !== null) {
      const sql = m[1].replace(/"\s*\+\s*"/g, " ").trim();
      if (processedSqls.has(sql)) continue;
      processedSqls.add(sql);
      queries.push({
        sql,
        jpql: this.sqlToJpql(sql),
        type: this.inferQueryType(sql),
      });
    }

    // Extraire le nom de table depuis les requetes SQL
    let tableName = "UNKNOWN_TABLE";
    for (const q of queries) {
      const tableMatch = q.sql.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
      if (tableMatch) {
        tableName = tableMatch[1];
        break;
      }
    }

    // Extraire les champs depuis ResultSet
    const fields: DetectedField[] = [];
    const rsRegex = /rs\.get(\w+)\s*\(\s*"([^"]+)"\s*\)/g;
    while ((m = rsRegex.exec(content)) !== null) {
      const javaType = this.rsTypeToJava(m[1]);
      const colName = m[2];
      if (!fields.find((f) => f.columnName === colName)) {
        fields.push({
          name: this.columnToField(colName),
          type: javaType,
          columnName: colName,
        });
      }
    }

    // Extraire l'URL de connexion
    let connectionUrl: string | undefined;
    const urlMatch = content.match(/(?:JDBC_URL|url|jdbcUrl)\s*=\s*"([^"]+)"/);
    if (urlMatch) connectionUrl = urlMatch[1];

    const component: JdbcComponent = {
      technology: "JDBC",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(queries, fields),
      metadata: {
        tableName,
        inferredEntity: {
          className: this.tableToEntity(tableName),
          fields,
        },
        queries,
        connectionUrl,
      },
    };

    return [component];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private inferQueryType(sql: string): "SELECT" | "INSERT" | "UPDATE" | "DELETE" {
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith("SELECT")) return "SELECT";
    if (upper.startsWith("INSERT")) return "INSERT";
    if (upper.startsWith("UPDATE")) return "UPDATE";
    if (upper.startsWith("DELETE")) return "DELETE";
    return "SELECT";
  }

  private sqlToJpql(sql: string): string {
    // Conversion basique SQL -> JPQL
    let jpql = sql
      .replace(/\?/g, ":param")
      .replace(/SELECT\s+[\w.,\s]+\s+FROM/i, "SELECT e FROM");
    // Ajouter alias
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (tableMatch) {
      const entity = this.tableToEntity(tableMatch[1]);
      jpql = jpql.replace(new RegExp(tableMatch[1], "gi"), entity + " e");
    }
    return jpql;
  }

  private rsTypeToJava(rsMethod: string): string {
    const map: Record<string, string> = {
      String: "String",
      Int: "Integer",
      Long: "Long",
      Double: "Double",
      Float: "Float",
      BigDecimal: "BigDecimal",
      Date: "LocalDate",
      Timestamp: "LocalDateTime",
      Boolean: "Boolean",
      Byte: "Byte",
    };
    return map[rsMethod] || "String";
  }

  private columnToField(column: string): string {
    return column
      .toLowerCase()
      .split("_")
      .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
      .join("");
  }

  private tableToEntity(table: string): string {
    return table
      .toLowerCase()
      .split("_")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("");
  }

  private computeConfidence(queries: { sql: string }[], fields: DetectedField[]): number {
    let score = 60;
    if (queries.length > 0) score += 15;
    if (fields.length > 0) score += 15;
    if (queries.length > 3) score += 10;
    return Math.min(score, 99);
  }
}
