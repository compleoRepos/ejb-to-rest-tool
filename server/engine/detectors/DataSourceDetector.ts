/**
 * DataSourceDetector — Détection universelle de base de données.
 * Analyse le code source EJB pour identifier le vendor DB utilisé.
 *
 * Vendors supportés : Oracle, MySQL, PostgreSQL, SQL Server, DB2,
 * H2, MariaDB, Sybase, Informix, SQLite, MongoDB.
 *
 * Stratégie de détection par scoring pondéré :
 *   - URL JDBC prefix      → +10 points
 *   - Driver class explicit → +10 points
 *   - Java vendor classes   → +8 points
 *   - JNDI name pattern    → +5 points
 *   - SQL keywords          → +3 points
 *
 * @author Compleo
 */

export type DatabaseVendor =
  | "ORACLE"
  | "MYSQL"
  | "POSTGRESQL"
  | "SQLSERVER"
  | "DB2"
  | "H2"
  | "MARIADB"
  | "SYBASE"
  | "INFORMIX"
  | "SQLITE"
  | "MONGODB"
  | "UNKNOWN";

export interface DataSourceInfo {
  vendor: DatabaseVendor;
  jndiNames: string[];
  urlPatterns: string[];
  driverClass: string | null;
  tables: string[];
  sequences: string[];
  vendorSpecificFeatures: VendorFeature[];
  schemaHint: string | null;
  multiDataSource: boolean;
  namedDataSources: NamedDataSource[];
  /** Scores bruts par vendor (utile pour le debug / rapport) */
  scores: Record<DatabaseVendor, number>;
}

export interface VendorFeature {
  type:
    | "SEQUENCE"
    | "HINT"
    | "FOR_UPDATE_NOWAIT"
    | "STORED_PROC"
    | "CURSOR"
    | "MERGE"
    | "JSON_COLUMN"
    | "ARRAY_TYPE"
    | "PARTITION";
  description: string;
  migrationNote: string;
}

export interface NamedDataSource {
  jndiName: string;
  varName: string;
  vendor: DatabaseVendor;
  usedInClasses: string[];
}

export interface SourceFile {
  path: string;
  content: string;
}

// ─── Fingerprints par vendor ────────────────────────────────────────────────

interface VendorFingerprint {
  urlPrefixes: string[];
  driverClasses: string[];
  jndiPatterns: RegExp[];
  sqlKeywords: string[];
  javaClasses: string[];
}

const VENDOR_FINGERPRINTS: Record<
  Exclude<DatabaseVendor, "UNKNOWN">,
  VendorFingerprint
> = {
  ORACLE: {
    urlPrefixes: [
      "jdbc:oracle:thin:",
      "jdbc:oracle:oci:",
      "jdbc:oracle:kprb:",
    ],
    driverClasses: [
      "oracle.jdbc.OracleDriver",
      "oracle.jdbc.driver.OracleDriver",
      "oracle.jdbc.pool.OracleDataSource",
    ],
    jndiPatterns: [/jdbc\/(.*?)(ora|oracle|orcl|bmce|core)/i],
    sqlKeywords: [
      "SYSDATE",
      "FROM DUAL",
      "NVL(",
      "DECODE(",
      "ROWNUM",
      "CONNECT BY",
      "LEVEL",
      "LPAD(",
      "NEXTVAL",
      "CURRVAL",
      "ADD_MONTHS(",
      "TO_DATE(",
      "FETCH FIRST",
      "FOR UPDATE NOWAIT",
      "/*+",
      "DBMS_",
      "UTL_",
      "SYS.",
    ],
    javaClasses: [
      "oracle.jdbc",
      "oracle.sql",
      "OracleResultSet",
      "OraclePreparedStatement",
      "OracleCallableStatement",
      "OracleConnection",
      "oracle.ucp",
    ],
  },

  MYSQL: {
    urlPrefixes: [
      "jdbc:mysql:",
      "jdbc:mysql:replication:",
      "jdbc:mysql:loadbalance:",
      "jdbc:mysql:aurora:",
    ],
    driverClasses: ["com.mysql.jdbc.Driver", "com.mysql.cj.jdbc.Driver"],
    jndiPatterns: [/jdbc\/(.*?)(mysql|maria)/i],
    sqlKeywords: [
      "AUTO_INCREMENT",
      "ENGINE=InnoDB",
      "SHOW TABLES",
      "INFORMATION_SCHEMA",
      "`",
      "LIMIT ",
      "INSERT IGNORE",
      "ON DUPLICATE KEY",
      "GROUP_CONCAT",
      "NOW()",
    ],
    javaClasses: ["com.mysql.jdbc", "com.mysql.cj", "MysqlDataSource"],
  },

  POSTGRESQL: {
    urlPrefixes: ["jdbc:postgresql:", "jdbc:pgsql:"],
    driverClasses: [
      "org.postgresql.Driver",
      "org.postgresql.ds.PGSimpleDataSource",
    ],
    jndiPatterns: [/jdbc\/(.*?)(pg|postgres|psql)/i],
    sqlKeywords: [
      "RETURNING ",
      "ILIKE ",
      "ARRAY[",
      "::",
      "$$",
      "VACUUM",
      "ANALYZE",
      "TABLESPACE",
      "NEXTVAL('",
      "CURRVAL('",
      "jsonb",
      "uuid_generate",
      "ON CONFLICT",
      "LATERAL ",
      "GENERATE_SERIES",
    ],
    javaClasses: [
      "org.postgresql",
      "PGobject",
      "PgConnection",
      "PostgreSQLDialect",
    ],
  },

  SQLSERVER: {
    urlPrefixes: [
      "jdbc:sqlserver:",
      "jdbc:microsoft:sqlserver:",
      "jdbc:jtds:sqlserver:",
    ],
    driverClasses: [
      "com.microsoft.sqlserver.jdbc.SQLServerDriver",
      "net.sourceforge.jtds.jdbc.Driver",
    ],
    jndiPatterns: [/jdbc\/(.*?)(sqlserver|mssql)/i],
    sqlKeywords: [
      "TOP ",
      "NOLOCK",
      "WITH (NOLOCK)",
      "GETDATE()",
      "IDENTITY(",
      "ISNULL(",
      "NEWID()",
      "NVARCHAR",
      "DATETIME2",
      "@@",
      "sp_",
      "SET NOCOUNT ON",
    ],
    javaClasses: [
      "com.microsoft.sqlserver",
      "SQLServerDataSource",
      "SQLServerException",
    ],
  },

  DB2: {
    urlPrefixes: ["jdbc:db2:", "jdbc:ibmdb2:"],
    driverClasses: [
      "com.ibm.db2.jcc.DB2Driver",
      "COM.ibm.db2.jdbc.app.DB2Driver",
    ],
    jndiPatterns: [/jdbc\/(.*?)(db2|ibm)/i],
    sqlKeywords: [
      "FETCH FIRST ",
      "WITH UR",
      "WITH CS",
      "WITH RS",
      "CURRENT DATE",
      "CURRENT TIME",
      "CURRENT TIMESTAMP",
      "LOCATE(",
      "POSSTR(",
      "SYSCAT.",
      "SYSIBM.",
      "SQLCA",
      "WHENEVER",
    ],
    javaClasses: [
      "com.ibm.db2",
      "DB2Connection",
      "DB2PreparedStatement",
    ],
  },

  MARIADB: {
    urlPrefixes: ["jdbc:mariadb:"],
    driverClasses: ["org.mariadb.jdbc.Driver"],
    jndiPatterns: [/jdbc\/(.*?)(maria|mariadb)/i],
    sqlKeywords: [
      "SEQUENCE",
      "CREATE SEQUENCE",
      "NEXT VALUE FOR",
      "AUTO_INCREMENT",
      "ROWNUM()",
      "ROWID",
    ],
    javaClasses: ["org.mariadb.jdbc", "MariaDbDataSource"],
  },

  H2: {
    urlPrefixes: ["jdbc:h2:"],
    driverClasses: ["org.h2.Driver"],
    jndiPatterns: [/jdbc\/(.*?)(h2|mem)/i],
    sqlKeywords: ["MEMORY", "FILE:", "TRACE_LEVEL_FILE"],
    javaClasses: ["org.h2", "H2ConsoleServlet"],
  },

  SYBASE: {
    urlPrefixes: ["jdbc:sybase:", "jdbc:jtds:sybase:"],
    driverClasses: [
      "com.sybase.jdbc4.jdbc.SybDriver",
      "net.sourceforge.jtds.jdbc.Driver",
    ],
    jndiPatterns: [/jdbc\/(.*?)(sybase|sap|ase)/i],
    sqlKeywords: [
      "GETDATE()",
      "ISNULL(",
      "CONVERT(",
      "TEXT ",
      "IMAGE ",
      "MONEY ",
      "sp_",
      "EXEC ",
    ],
    javaClasses: ["com.sybase.jdbc", "SybConnection"],
  },

  INFORMIX: {
    urlPrefixes: ["jdbc:informix-sqli:"],
    driverClasses: ["com.informix.jdbc.IfxDriver"],
    jndiPatterns: [/jdbc\/(.*?)(informix|ifx)/i],
    sqlKeywords: [
      "FIRST ",
      "SKIP ",
      "MATCHES ",
      "LVARCHAR",
      "DATETIME YEAR TO SECOND",
      "INTERVAL ",
      "DBSERVERNAME",
    ],
    javaClasses: ["com.informix.jdbc", "IfxConnection"],
  },

  SQLITE: {
    urlPrefixes: ["jdbc:sqlite:"],
    driverClasses: ["org.sqlite.JDBC"],
    jndiPatterns: [],
    sqlKeywords: [
      "AUTOINCREMENT",
      "sqlite_master",
      "PRAGMA ",
      "VACUUM",
      "ATTACH ",
    ],
    javaClasses: ["org.sqlite", "SQLiteDataSource"],
  },

  MONGODB: {
    urlPrefixes: ["mongodb://", "mongodb+srv://"],
    driverClasses: [
      "com.mongodb.client.MongoClient",
      "org.springframework.data.mongodb",
    ],
    jndiPatterns: [/mongodb/i],
    sqlKeywords: [],
    javaClasses: [
      "com.mongodb",
      "MongoCollection",
      "MongoDatabase",
      "Document",
      "BsonDocument",
      "MongoRepository",
    ],
  },
};

// ─── Scoring weights ────────────────────────────────────────────────────────

const WEIGHT_URL = 10;
const WEIGHT_DRIVER = 10;
const WEIGHT_JAVA_CLASS = 8;
const WEIGHT_JNDI = 5;
const WEIGHT_SQL_KEYWORD = 3;

// ─── Detector ───────────────────────────────────────────────────────────────

export class DataSourceDetector {
  /**
   * Analyse un ensemble de fichiers source et retourne les informations
   * de DataSource détectées, incluant le vendor, les JNDI, les tables,
   * les séquences et les features vendor-specific.
   */
  detect(sourceFiles: SourceFile[]): DataSourceInfo {
    const scores = this.initScores();
    const jndiNames = new Set<string>();
    const urlPatterns = new Set<string>();
    const tables = new Set<string>();
    const sequences = new Set<string>();
    const vendorFeatures: VendorFeature[] = [];
    const namedDataSources: NamedDataSource[] = [];
    let foundDriverClass: string | null = null;

    for (const file of sourceFiles) {
      const code = file.content;
      const upper = code.toUpperCase();
      const className = this.extractClassName(file.path);

      // 1. Détecter URLs JDBC
      const urlMatches = code.match(/jdbc:[a-z][a-z0-9:@.\/_\-]*/gi) ?? [];
      for (const url of urlMatches) {
        urlPatterns.add(url);
        for (const [vendor, fp] of this.fingerprints()) {
          if (fp.urlPrefixes.some((p) => url.toLowerCase().startsWith(p.toLowerCase()))) {
            scores[vendor] += WEIGHT_URL;
          }
        }
      }
      // MongoDB URLs
      const mongoUrls = code.match(/mongodb(?:\+srv)?:\/\/[^\s"']+/g) ?? [];
      for (const url of mongoUrls) {
        urlPatterns.add(url);
        scores.MONGODB += WEIGHT_URL;
      }

      // 2. Détecter drivers explicites
      for (const [vendor, fp] of this.fingerprints()) {
        for (const driver of fp.driverClasses) {
          if (code.includes(driver)) {
            scores[vendor] += WEIGHT_DRIVER;
            foundDriverClass = driver;
          }
        }
      }

      // 3. Détecter JNDI @Resource
      const jndiMatches = code.matchAll(
        /@Resource\s*\([^)]*(?:name|lookup|mappedName)\s*=\s*["']([^"']+)["']/g
      );
      for (const m of jndiMatches) {
        const jndi = m[1];
        jndiNames.add(jndi);
        for (const [vendor, fp] of this.fingerprints()) {
          if (fp.jndiPatterns.some((p) => p.test(jndi))) {
            scores[vendor] += WEIGHT_JNDI;
          }
        }
        // Détecter le nom de variable associé
        // v12.5: Support both inline and multi-line @Resource DataSource declarations
        const varMatch = code.match(
          new RegExp(
            `@Resource\\s*\\([^)]*["']${this.escapeRegex(jndi)}["'][^)]*\\)\\s*(?:private\\s+)?\\w+\\s+(\\w+)\\s*;`
          )
        );
        if (varMatch) {
          namedDataSources.push({
            jndiName: jndi,
            varName: varMatch[1],
            vendor: "UNKNOWN",
            usedInClasses: [className],
          });
        }
      }

      // 4. Détecter mots-clés SQL spécifiques au vendor
      for (const [vendor, fp] of this.fingerprints()) {
        for (const keyword of fp.sqlKeywords) {
          if (upper.includes(keyword.toUpperCase())) {
            scores[vendor] += WEIGHT_SQL_KEYWORD;
          }
        }
      }

      // 5. Détecter classes Java vendor-specific
      for (const [vendor, fp] of this.fingerprints()) {
        for (const cls of fp.javaClasses) {
          if (code.includes(cls)) {
            scores[vendor] += WEIGHT_JAVA_CLASS;
          }
        }
      }

      // 6. Extraire les tables depuis les SQL
      const tablePattern =
        /(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+([A-Za-z][A-Za-z0-9_]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = tablePattern.exec(code)) !== null) {
        const t = m[1].toUpperCase();
        if (
          ![
            "SELECT", "WHERE", "SET", "AND", "OR", "ON",
            "AS", "IS", "IN", "NOT", "NULL", "VALUES",
            "ORDER", "GROUP", "HAVING", "LIMIT", "OFFSET",
            "EXISTS", "BETWEEN", "LIKE", "CASE", "WHEN",
            "THEN", "ELSE", "END", "IF", "BEGIN",
          ].includes(t)
        ) {
          tables.add(t);
        }
      }

      // 7. Extraire les séquences
      // Oracle/DB2: SEQ_NAME.NEXTVAL / SEQ_NAME.CURRVAL
      const seqPattern = /([A-Za-z][A-Za-z0-9_]+)\.(NEXTVAL|CURRVAL)/gi;
      while ((m = seqPattern.exec(code)) !== null) {
        sequences.add(m[1].toUpperCase());
      }
      // PostgreSQL: nextval('seq_name')
      const pgSeqPattern = /nextval\s*\(\s*['"]([^'"]+)['"]\s*\)/gi;
      while ((m = pgSeqPattern.exec(code)) !== null) {
        sequences.add(m[1].toUpperCase());
      }

      // 8. Détecter features spécifiques vendor
      this.detectVendorFeatures(code, vendorFeatures);
    }

    // Déterminer le vendor gagnant
    const winner = (
      Object.entries(scores) as [DatabaseVendor, number][]
    )
      .filter(([v]) => v !== "UNKNOWN")
      .sort(([, a], [, b]) => b - a)[0];

    const vendor: DatabaseVendor =
      winner && winner[1] > 0 ? winner[0] : "UNKNOWN";

    // Résoudre le vendor pour chaque DataSource nommée
    for (const ds of namedDataSources) {
      ds.vendor = vendor;
    }

    return {
      vendor,
      jndiNames: [...jndiNames],
      urlPatterns: [...urlPatterns],
      driverClass: foundDriverClass,
      tables: [...tables].slice(0, 50),
      sequences: [...sequences],
      vendorSpecificFeatures: this.deduplicateFeatures(vendorFeatures),
      schemaHint: this.inferSchema(jndiNames, vendor),
      multiDataSource: jndiNames.size > 1,
      namedDataSources,
      scores,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private initScores(): Record<DatabaseVendor, number> {
    return {
      ORACLE: 0,
      MYSQL: 0,
      POSTGRESQL: 0,
      SQLSERVER: 0,
      DB2: 0,
      H2: 0,
      MARIADB: 0,
      SYBASE: 0,
      INFORMIX: 0,
      SQLITE: 0,
      MONGODB: 0,
      UNKNOWN: 0,
    };
  }

  private fingerprints(): [
    Exclude<DatabaseVendor, "UNKNOWN">,
    VendorFingerprint,
  ][] {
    return Object.entries(VENDOR_FINGERPRINTS) as [
      Exclude<DatabaseVendor, "UNKNOWN">,
      VendorFingerprint,
    ][];
  }

  private extractClassName(path: string): string {
    const parts = path.split("/");
    const fileName = parts[parts.length - 1] || "";
    return fileName.replace(/\.java$/, "");
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private detectVendorFeatures(
    code: string,
    features: VendorFeature[]
  ): void {
    if (code.includes("FOR UPDATE NOWAIT")) {
      features.push({
        type: "FOR_UPDATE_NOWAIT",
        description: "Verrouillage pessimiste Oracle NOWAIT",
        migrationNote:
          "@Lock(PESSIMISTIC_WRITE) + QueryHint lock.timeout=0",
      });
    }
    if (/\/\*\+/.test(code)) {
      features.push({
        type: "HINT",
        description: "Hints Oracle détectés",
        migrationNote:
          "Hints ignorés sur autres DB — vérifier les performances",
      });
    }
    if (/\.NEXTVAL/i.test(code)) {
      features.push({
        type: "SEQUENCE",
        description: "Séquences Oracle/PostgreSQL/DB2 utilisées",
        migrationNote:
          "@SequenceGenerator ou @GeneratedValue(IDENTITY) selon le vendor",
      });
    }
    if (/CALL\s+\w+\s*\(|EXECUTE\s+PROCEDURE/i.test(code)) {
      features.push({
        type: "STORED_PROC",
        description: "Procédures stockées détectées",
        migrationNote:
          "@Procedure Spring Data ou StoredProcedureQuery JPA",
      });
    }
    if (/\bCURSOR\b/i.test(code)) {
      features.push({
        type: "CURSOR",
        description: "Curseurs détectés",
        migrationNote:
          "Stream<> ou Page<> Spring Data pour les grands jeux de données",
      });
    }
    if (/\bMERGE\s+INTO\b/i.test(code)) {
      features.push({
        type: "MERGE",
        description: "MERGE INTO détecté (upsert vendor-specific)",
        migrationNote:
          "Utiliser @Query avec ON CONFLICT (PG) ou INSERT ON DUPLICATE KEY (MySQL)",
      });
    }
    if (/\bjsonb?\b/i.test(code) && /column/i.test(code)) {
      features.push({
        type: "JSON_COLUMN",
        description: "Colonnes JSON/JSONB détectées",
        migrationNote:
          "Utiliser @Type(JsonType.class) ou @JdbcTypeCode(SqlTypes.JSON)",
      });
    }
    if (/PARTITION\s+BY/i.test(code)) {
      features.push({
        type: "PARTITION",
        description: "Partitionnement de tables détecté",
        migrationNote:
          "Le partitionnement est vendor-specific — vérifier la compatibilité",
      });
    }
  }

  private deduplicateFeatures(features: VendorFeature[]): VendorFeature[] {
    const seen = new Set<string>();
    return features.filter((f) => {
      if (seen.has(f.type)) return false;
      seen.add(f.type);
      return true;
    });
  }

  private inferSchema(
    jndiNames: Set<string>,
    _vendor: DatabaseVendor
  ): string | null {
    for (const jndi of jndiNames) {
      const schema = jndi
        .replace(/jdbc\//i, "")
        .replace(/_DS$/i, "")
        .replace(/DataSource$/i, "")
        .toUpperCase();
      if (schema.length > 0) return schema;
    }
    return null;
  }
}
