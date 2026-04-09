/**
 * DataSourceDetector — Tests unitaires.
 * Couvre les 11 vendors + multi-datasource + vendor features.
 */

import { describe, it, expect } from "vitest";
import { DataSourceDetector } from "./DataSourceDetector";
import type { SourceFile, DatabaseVendor } from "./DataSourceDetector";

function makeFile(content: string, path = "Test.java"): SourceFile {
  return { path, content };
}

describe("DataSourceDetector", () => {
  const detector = new DataSourceDetector();

  // ─── Oracle ───────────────────────────────────────────────────────────

  describe("Oracle detection", () => {
    it("detects Oracle via JDBC URL", () => {
      const result = detector.detect([
        makeFile(`String url = "jdbc:oracle:thin:@//localhost:1521/XEPDB1";`),
      ]);
      expect(result.vendor).toBe("ORACLE");
      expect(result.urlPatterns).toContain("jdbc:oracle:thin:@//localhost:1521/XEPDB1");
    });

    it("detects Oracle via driver class", () => {
      const result = detector.detect([
        makeFile(`Class.forName("oracle.jdbc.OracleDriver");`),
      ]);
      expect(result.vendor).toBe("ORACLE");
      expect(result.driverClass).toBe("oracle.jdbc.OracleDriver");
    });

    it("detects Oracle via SQL keywords (SYSDATE, NVL, DECODE)", () => {
      const result = detector.detect([
        makeFile(`
          SELECT SYSDATE FROM DUAL;
          SELECT NVL(col, 0) FROM DUAL;
          SELECT DECODE(status, 1, 'A', 'B') FROM DUAL;
          SELECT ROWNUM FROM MY_TABLE;
        `),
      ]);
      expect(result.vendor).toBe("ORACLE");
    });

    it("detects Oracle via Java classes", () => {
      const result = detector.detect([
        makeFile(`
          import oracle.jdbc.OracleConnection;
          import oracle.sql.STRUCT;
          OracleResultSet rs = (OracleResultSet) stmt.executeQuery();
        `),
      ]);
      expect(result.vendor).toBe("ORACLE");
    });

    it("detects Oracle via JNDI pattern", () => {
      const result = detector.detect([
        makeFile(`@Resource(name = "jdbc/BMCE_CORE_DS") DataSource ds;`),
      ]);
      expect(result.vendor).toBe("ORACLE");
      expect(result.jndiNames).toContain("jdbc/BMCE_CORE_DS");
    });

    it("detects Oracle sequences", () => {
      const result = detector.detect([
        makeFile(`
          SELECT SEQ_COMPTE.NEXTVAL FROM DUAL;
          SELECT SEQ_VIREMENT.CURRVAL FROM DUAL;
        `),
      ]);
      expect(result.sequences).toContain("SEQ_COMPTE");
      expect(result.sequences).toContain("SEQ_VIREMENT");
    });
  });

  // ─── MySQL ────────────────────────────────────────────────────────────

  describe("MySQL detection", () => {
    it("detects MySQL via JDBC URL", () => {
      const result = detector.detect([
        makeFile(`String url = "jdbc:mysql://localhost:3306/mydb";`),
      ]);
      expect(result.vendor).toBe("MYSQL");
    });

    it("detects MySQL via driver class", () => {
      const result = detector.detect([
        makeFile(`Class.forName("com.mysql.cj.jdbc.Driver");`),
      ]);
      expect(result.vendor).toBe("MYSQL");
      expect(result.driverClass).toBe("com.mysql.cj.jdbc.Driver");
    });

    it("detects MySQL via SQL keywords", () => {
      const result = detector.detect([
        makeFile(`
          CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY);
          INSERT IGNORE INTO users VALUES (1, 'test');
          SELECT GROUP_CONCAT(name) FROM users;
        `),
      ]);
      expect(result.vendor).toBe("MYSQL");
    });
  });

  // ─── PostgreSQL ───────────────────────────────────────────────────────

  describe("PostgreSQL detection", () => {
    it("detects PostgreSQL via JDBC URL", () => {
      const result = detector.detect([
        makeFile(`String url = "jdbc:postgresql://localhost:5432/mydb";`),
      ]);
      expect(result.vendor).toBe("POSTGRESQL");
    });

    it("detects PostgreSQL via driver class", () => {
      const result = detector.detect([
        makeFile(`Class.forName("org.postgresql.Driver");`),
      ]);
      expect(result.vendor).toBe("POSTGRESQL");
    });

    it("detects PostgreSQL via SQL keywords (RETURNING, ILIKE, ON CONFLICT)", () => {
      const result = detector.detect([
        makeFile(`
          INSERT INTO users (name) VALUES ('test') RETURNING id;
          SELECT * FROM users WHERE name ILIKE '%test%';
          INSERT INTO users (id) VALUES (1) ON CONFLICT DO NOTHING;
        `),
      ]);
      expect(result.vendor).toBe("POSTGRESQL");
    });

    it("detects PostgreSQL sequences via nextval()", () => {
      const result = detector.detect([
        makeFile(`SELECT nextval('user_id_seq') FROM users;`),
      ]);
      expect(result.sequences).toContain("USER_ID_SEQ");
    });
  });

  // ─── SQL Server ───────────────────────────────────────────────────────

  describe("SQL Server detection", () => {
    it("detects SQL Server via JDBC URL", () => {
      const result = detector.detect([
        makeFile(`String url = "jdbc:sqlserver://localhost:1433;databaseName=mydb";`),
      ]);
      expect(result.vendor).toBe("SQLSERVER");
    });

    it("detects SQL Server via driver class", () => {
      const result = detector.detect([
        makeFile(`Class.forName("com.microsoft.sqlserver.jdbc.SQLServerDriver");`),
      ]);
      expect(result.vendor).toBe("SQLSERVER");
    });

    it("detects SQL Server via SQL keywords (TOP, NOLOCK, GETDATE)", () => {
      const result = detector.detect([
        makeFile(`
          SELECT TOP 10 * FROM users WITH (NOLOCK);
          SELECT GETDATE();
          SET NOCOUNT ON;
        `),
      ]);
      expect(result.vendor).toBe("SQLSERVER");
    });
  });

  // ─── DB2 ──────────────────────────────────────────────────────────────

  describe("DB2 detection", () => {
    it("detects DB2 via JDBC URL", () => {
      const result = detector.detect([
        makeFile(`String url = "jdbc:db2://localhost:50000/MYDB";`),
      ]);
      expect(result.vendor).toBe("DB2");
    });

    it("detects DB2 via driver class", () => {
      const result = detector.detect([
        makeFile(`Class.forName("com.ibm.db2.jcc.DB2Driver");`),
      ]);
      expect(result.vendor).toBe("DB2");
    });

    it("detects DB2 via SQL keywords (FETCH FIRST, WITH UR, CURRENT DATE)", () => {
      const result = detector.detect([
        makeFile(`
          SELECT * FROM users FETCH FIRST 10 ROWS ONLY;
          SELECT CURRENT DATE FROM SYSIBM.SYSDUMMY1;
          SELECT * FROM SYSCAT.TABLES WITH UR;
        `),
      ]);
      expect(result.vendor).toBe("DB2");
    });
  });

  // ─── MariaDB ──────────────────────────────────────────────────────────

  describe("MariaDB detection", () => {
    it("detects MariaDB via JDBC URL", () => {
      const result = detector.detect([
        makeFile(`String url = "jdbc:mariadb://localhost:3306/mydb";`),
      ]);
      expect(result.vendor).toBe("MARIADB");
    });

    it("detects MariaDB via driver class", () => {
      const result = detector.detect([
        makeFile(`Class.forName("org.mariadb.jdbc.Driver");`),
      ]);
      expect(result.vendor).toBe("MARIADB");
    });
  });

  // ─── H2 ───────────────────────────────────────────────────────────────

  describe("H2 detection", () => {
    it("detects H2 via JDBC URL", () => {
      const result = detector.detect([
        makeFile(`String url = "jdbc:h2:mem:testdb";`),
      ]);
      expect(result.vendor).toBe("H2");
    });

    it("detects H2 via driver class", () => {
      const result = detector.detect([
        makeFile(`Class.forName("org.h2.Driver");`),
      ]);
      expect(result.vendor).toBe("H2");
    });
  });

  // ─── Sybase ───────────────────────────────────────────────────────────

  describe("Sybase detection", () => {
    it("detects Sybase via JDBC URL", () => {
      const result = detector.detect([
        makeFile(`String url = "jdbc:sybase:Tds:localhost:5000/mydb";`),
      ]);
      expect(result.vendor).toBe("SYBASE");
    });

    it("detects Sybase via driver class", () => {
      const result = detector.detect([
        makeFile(`Class.forName("com.sybase.jdbc4.jdbc.SybDriver");`),
      ]);
      expect(result.vendor).toBe("SYBASE");
    });
  });

  // ─── Informix ─────────────────────────────────────────────────────────

  describe("Informix detection", () => {
    it("detects Informix via JDBC URL", () => {
      const result = detector.detect([
        makeFile(`String url = "jdbc:informix-sqli://localhost:9088/mydb:INFORMIXSERVER=srv";`),
      ]);
      expect(result.vendor).toBe("INFORMIX");
    });

    it("detects Informix via driver class", () => {
      const result = detector.detect([
        makeFile(`Class.forName("com.informix.jdbc.IfxDriver");`),
      ]);
      expect(result.vendor).toBe("INFORMIX");
    });
  });

  // ─── SQLite ───────────────────────────────────────────────────────────

  describe("SQLite detection", () => {
    it("detects SQLite via JDBC URL", () => {
      const result = detector.detect([
        makeFile(`String url = "jdbc:sqlite:/path/to/db.sqlite";`),
      ]);
      expect(result.vendor).toBe("SQLITE");
    });

    it("detects SQLite via driver class", () => {
      const result = detector.detect([
        makeFile(`Class.forName("org.sqlite.JDBC");`),
      ]);
      expect(result.vendor).toBe("SQLITE");
    });
  });

  // ─── MongoDB ──────────────────────────────────────────────────────────

  describe("MongoDB detection", () => {
    it("detects MongoDB via URL", () => {
      const result = detector.detect([
        makeFile(`String uri = "mongodb://localhost:27017/mydb";`),
      ]);
      expect(result.vendor).toBe("MONGODB");
    });

    it("detects MongoDB via Java classes", () => {
      const result = detector.detect([
        makeFile(`
          import com.mongodb.client.MongoClient;
          MongoCollection<Document> col = db.getCollection("users");
        `),
      ]);
      expect(result.vendor).toBe("MONGODB");
    });
  });

  // ─── UNKNOWN ──────────────────────────────────────────────────────────

  describe("UNKNOWN fallback", () => {
    it("returns UNKNOWN when no vendor indicators found", () => {
      const result = detector.detect([
        makeFile(`public class MyService { public void doSomething() {} }`),
      ]);
      expect(result.vendor).toBe("UNKNOWN");
    });

    it("returns UNKNOWN for empty file list", () => {
      const result = detector.detect([]);
      expect(result.vendor).toBe("UNKNOWN");
    });
  });

  // ─── Multi-DataSource ─────────────────────────────────────────────────

  describe("Multi-DataSource detection", () => {
    it("detects multiple JNDI names", () => {
      const result = detector.detect([
        makeFile(`
          @Resource(name = "jdbc/CORE_DS") DataSource coreDs;
          @Resource(name = "jdbc/BATCH_DS") DataSource batchDs;
        `),
      ]);
      expect(result.multiDataSource).toBe(true);
      expect(result.jndiNames).toHaveLength(2);
    });

    it("detects single DataSource as non-multi", () => {
      const result = detector.detect([
        makeFile(`@Resource(name = "jdbc/CORE_DS") DataSource ds;`),
      ]);
      expect(result.multiDataSource).toBe(false);
    });
  });

  // ─── Vendor Features ──────────────────────────────────────────────────

  describe("Vendor feature detection", () => {
    it("detects FOR UPDATE NOWAIT", () => {
      const result = detector.detect([
        makeFile(`SELECT * FROM COMPTE WHERE id = 1 FOR UPDATE NOWAIT;`),
      ]);
      expect(result.vendorSpecificFeatures.some(f => f.type === "FOR_UPDATE_NOWAIT")).toBe(true);
    });

    it("detects Oracle hints", () => {
      const result = detector.detect([
        makeFile(`SELECT /*+ INDEX(t idx_name) */ * FROM t;`),
      ]);
      expect(result.vendorSpecificFeatures.some(f => f.type === "HINT")).toBe(true);
    });

    it("detects sequences", () => {
      const result = detector.detect([
        makeFile(`SELECT SEQ_ID.NEXTVAL FROM DUAL;`),
      ]);
      expect(result.vendorSpecificFeatures.some(f => f.type === "SEQUENCE")).toBe(true);
    });

    it("detects stored procedures", () => {
      const result = detector.detect([
        makeFile(`CALL my_procedure(1, 'test');`),
      ]);
      expect(result.vendorSpecificFeatures.some(f => f.type === "STORED_PROC")).toBe(true);
    });

    it("detects cursors", () => {
      const result = detector.detect([
        makeFile(`DECLARE my_cursor CURSOR FOR SELECT * FROM users;`),
      ]);
      expect(result.vendorSpecificFeatures.some(f => f.type === "CURSOR")).toBe(true);
    });

    it("detects MERGE INTO", () => {
      const result = detector.detect([
        makeFile(`MERGE INTO target USING source ON (target.id = source.id);`),
      ]);
      expect(result.vendorSpecificFeatures.some(f => f.type === "MERGE")).toBe(true);
    });

    it("deduplicates features", () => {
      const result = detector.detect([
        makeFile(`SELECT SEQ_A.NEXTVAL FROM DUAL;`),
        makeFile(`SELECT SEQ_B.NEXTVAL FROM DUAL;`),
      ]);
      const seqFeatures = result.vendorSpecificFeatures.filter(f => f.type === "SEQUENCE");
      expect(seqFeatures).toHaveLength(1);
    });
  });

  // ─── Table extraction ─────────────────────────────────────────────────

  describe("Table extraction", () => {
    it("extracts table names from SQL", () => {
      const result = detector.detect([
        makeFile(`
          SELECT * FROM COMPTE WHERE id = 1;
          INSERT INTO VIREMENT (montant) VALUES (100);
          UPDATE CLIENT SET nom = 'test';
          SELECT a.* FROM COMPTE a JOIN CLIENT b ON a.id = b.id;
        `),
      ]);
      expect(result.tables).toContain("COMPTE");
      expect(result.tables).toContain("VIREMENT");
      expect(result.tables).toContain("CLIENT");
    });

    it("excludes SQL keywords from table names", () => {
      const result = detector.detect([
        makeFile(`SELECT * FROM USERS WHERE id IN (SELECT id FROM ORDERS);`),
      ]);
      expect(result.tables).not.toContain("WHERE");
      expect(result.tables).not.toContain("SELECT");
      expect(result.tables).not.toContain("IN");
    });

    it("limits tables to 50", () => {
      const tables = Array.from({ length: 60 }, (_, i) => `TABLE_${i}`);
      const sql = tables.map(t => `SELECT * FROM ${t};`).join("\n");
      const result = detector.detect([makeFile(sql)]);
      expect(result.tables.length).toBeLessThanOrEqual(50);
    });
  });

  // ─── Schema hint ──────────────────────────────────────────────────────

  describe("Schema hint inference", () => {
    it("infers schema from JNDI name", () => {
      const result = detector.detect([
        makeFile(`@Resource(name = "jdbc/BMCE_CORE_DS") DataSource ds;`),
      ]);
      expect(result.schemaHint).toBe("BMCE_CORE");
    });
  });

  // ─── Scoring priority ─────────────────────────────────────────────────

  describe("Scoring priority", () => {
    it("URL/driver beats SQL keywords when vendors conflict", () => {
      // Oracle URL + some MySQL keywords
      const result = detector.detect([
        makeFile(`
          String url = "jdbc:oracle:thin:@//localhost:1521/XEPDB1";
          SELECT * FROM users LIMIT 10;
          INSERT IGNORE INTO users VALUES (1);
        `),
      ]);
      expect(result.vendor).toBe("ORACLE");
    });

    it("exposes raw scores for debugging", () => {
      const result = detector.detect([
        makeFile(`Class.forName("oracle.jdbc.OracleDriver");`),
      ]);
      expect(result.scores.ORACLE).toBeGreaterThan(0);
      expect(result.scores.MYSQL).toBe(0);
    });
  });
});
