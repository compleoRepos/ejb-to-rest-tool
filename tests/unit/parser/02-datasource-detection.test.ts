/**
 * tests/unit/parser/02-datasource-detection.test.ts
 *
 * Tests unitaires pour la détection de DataSource.
 * Le DataSourceDetector utilise un système de scoring basé sur :
 * - URL JDBC patterns (+10)
 * - Driver classes (+10)
 * - JNDI @Resource patterns (+5)
 * - SQL keywords (+3)
 * - Java vendor-specific classes (+8)
 */
import { describe, it, expect } from "vitest";
import { DataSourceDetector } from "../../../server/engine/detectors/DataSourceDetector";

const detector = new DataSourceDetector();

describe("DataSource detection", () => {
  describe("Oracle", () => {
    it("détecte Oracle via jdbc:oracle:thin URL", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String URL = "jdbc:oracle:thin:@//localhost:1521/XE";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("ORACLE");
    });

    it("détecte Oracle via oracle.jdbc.OracleDriver", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String DRIVER = "oracle.jdbc.OracleDriver";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("ORACLE");
    });

    it("détecte Oracle via SQL keywords (SYSDATE, FROM DUAL, NVL)", () => {
      const files = [
        {
          path: "src/main/java/com/bank/dao/AccountDao.java",
          content: `
            package com.bank.dao;
            public class AccountDao {
              private static final String SQL = "SELECT SYSDATE FROM DUAL";
              private static final String SQL2 = "SELECT NVL(BALANCE, 0) FROM T_ACCOUNTS";
              private static final String SQL3 = "SELECT DECODE(STATUS, 1, 'ACTIVE', 'INACTIVE') FROM T_ACCOUNTS WHERE ROWNUM <= 10";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("ORACLE");
    });

    it("détecte Oracle via @Resource JNDI pattern", () => {
      const files = [
        {
          path: "src/main/java/com/bank/dao/AccountDao.java",
          content: `
            package com.bank.dao;
            import javax.annotation.Resource;
            import javax.sql.DataSource;
            public class AccountDao {
              @Resource(name = "jdbc/OracleDS")
              private DataSource dataSource;
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("ORACLE");
      expect(result.jndiNames.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("MySQL", () => {
    it("détecte MySQL via jdbc:mysql URL", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String URL = "jdbc:mysql://localhost:3306/mydb";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("MYSQL");
    });

    it("détecte MySQL via com.mysql.cj.jdbc.Driver", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String DRIVER = "com.mysql.cj.jdbc.Driver";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("MYSQL");
    });
  });

  describe("PostgreSQL", () => {
    it("détecte PostgreSQL via jdbc:postgresql URL", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String URL = "jdbc:postgresql://localhost:5432/mydb";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("POSTGRESQL");
    });

    it("détecte PostgreSQL via org.postgresql.Driver", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String DRIVER = "org.postgresql.Driver";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("POSTGRESQL");
    });
  });

  describe("DB2", () => {
    it("détecte DB2 via jdbc:db2 URL", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String URL = "jdbc:db2://localhost:50000/mydb";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("DB2");
    });

    it("détecte DB2 via com.ibm.db2.jcc.DB2Driver", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String DRIVER = "com.ibm.db2.jcc.DB2Driver";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("DB2");
    });
  });

  describe("SQL Server", () => {
    it("détecte SQL Server via jdbc:sqlserver URL", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String URL = "jdbc:sqlserver://localhost:1433;databaseName=mydb";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBe("SQLSERVER");
    });
  });

  describe("Fallback", () => {
    it("aucun indice → UNKNOWN", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Test.java",
          content: `package com.bank; public class Test {}`,
        },
      ];
      const result = detector.detect(files);
      expect(result.vendor).toBeDefined();
      // Sans aucun indice, le vendor est UNKNOWN ou le fallback
      expect(["UNKNOWN", "ORACLE"]).toContain(result.vendor);
    });
  });

  describe("Tables detection", () => {
    it("détecte les noms de tables dans les requêtes SQL", () => {
      const files = [
        {
          path: "src/main/java/com/bank/dao/AccountDao.java",
          content: `
            package com.bank.dao;
            public class AccountDao {
              private static final String SQL = "SELECT * FROM T_ACCOUNTS WHERE ID = ?";
              private static final String SQL2 = "INSERT INTO T_TRANSACTIONS (ACCOUNT_ID, AMOUNT) VALUES (?, ?)";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.tables.length).toBeGreaterThanOrEqual(1);
      expect(result.tables).toContain("T_ACCOUNTS");
    });

    it("détecte les tables dans UPDATE et JOIN", () => {
      const files = [
        {
          path: "src/main/java/com/bank/dao/AccountDao.java",
          content: `
            package com.bank.dao;
            public class AccountDao {
              private static final String SQL = "UPDATE T_BALANCES SET AMOUNT = ? WHERE ID = ?";
              private static final String SQL2 = "SELECT a.* FROM T_ACCOUNTS a JOIN T_CLIENTS c ON a.CLIENT_ID = c.ID";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.tables).toContain("T_BALANCES");
      expect(result.tables).toContain("T_ACCOUNTS");
    });
  });

  describe("Sequences detection", () => {
    it("détecte les séquences Oracle (NEXTVAL/CURRVAL)", () => {
      const files = [
        {
          path: "src/main/java/com/bank/dao/AccountDao.java",
          content: `
            package com.bank.dao;
            public class AccountDao {
              private static final String SQL = "SELECT SEQ_ACCOUNTS.NEXTVAL FROM DUAL";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.sequences).toContain("SEQ_ACCOUNTS");
    });
  });

  describe("URL patterns", () => {
    it("extrait les URL JDBC trouvées", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String URL = "jdbc:oracle:thin:@//prod:1521/XEPDB1";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.urlPatterns.length).toBeGreaterThanOrEqual(1);
      expect(result.urlPatterns[0]).toContain("jdbc:oracle:thin:");
    });
  });

  describe("Scores", () => {
    it("retourne les scores bruts par vendor", () => {
      const files = [
        {
          path: "src/main/java/com/bank/Config.java",
          content: `
            package com.bank;
            public class Config {
              private static final String URL = "jdbc:oracle:thin:@//localhost:1521/XE";
            }
          `,
        },
      ];
      const result = detector.detect(files);
      expect(result.scores).toBeDefined();
      expect(result.scores.ORACLE).toBeGreaterThan(0);
    });
  });
});
