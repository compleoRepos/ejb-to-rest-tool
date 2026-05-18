/**
 * ConfigGenerator — Tests unitaires.
 * Couvre application.yml, Maven dependency, docker-compose, DATASOURCE_MIGRATION.md.
 */

import { describe, it, expect } from "vitest";
import { ConfigGenerator, VENDOR_CONFIG } from "./ConfigGenerator";
import type { DataSourceInfo, DatabaseVendor } from "../detectors/DataSourceDetector";
import type { ProjectIR } from "../../java-parser";

function makeIR(overrides: Partial<ProjectIR> = {}): ProjectIR {
  return {
    projectName: "ejb-compte",
    artifactId: "ejb-compte",
    groupId: "ma.bmce.si",
    useCases: [],
    dtos: [],
    enums: [],
    exceptions: [],
    validators: [],
    services: [],
    remoteInterfaces: [],
    technologies: [],
    ...overrides,
  } as ProjectIR;
}

function makeDsInfo(vendor: DatabaseVendor, overrides: Partial<DataSourceInfo> = {}): DataSourceInfo {
  const scores = {} as Record<DatabaseVendor, number>;
  for (const v of ["ORACLE", "MYSQL", "POSTGRESQL", "SQLSERVER", "DB2", "MARIADB", "H2", "SYBASE", "INFORMIX", "SQLITE", "MONGODB", "UNKNOWN"] as DatabaseVendor[]) {
    scores[v] = v === vendor ? 30 : 0;
  }

  return {
    vendor,
    driverClass: VENDOR_CONFIG[vendor].driverClass,
    urlPatterns: [],
    jndiNames: [],
    tables: [],
    sequences: [],
    vendorSpecificFeatures: [],
    multiDataSource: false,
    namedDataSources: [],
    schemaHint: undefined,
    scores,
    ...overrides,
  };
}

describe("ConfigGenerator", () => {
  const gen = new ConfigGenerator();

  // ─── application.yml ──────────────────────────────────────────────────

  describe("generateApplicationYml", () => {
    it("generates Oracle-specific application.yml", () => {
      const ir = makeIR();
      const dsInfo = makeDsInfo("ORACLE", {
        tables: ["COMPTE", "CLIENT"],
        sequences: ["SEQ_COMPTE"],
        jndiNames: ["jdbc/BMCE_CORE_DS"],
      });

      const file = gen.generateApplicationYml(ir, dsInfo);
      expect(file.path).toBe("src/main/resources/application.yml");
      expect(file.category).toBe("config");
      expect(file.content).toContain("oracle.jdbc.OracleDriver");
      expect(file.content).toContain("OracleDialect");
      expect(file.content).toContain("ORACLE_URL");
      expect(file.content).toContain("ORACLE_USER");
      expect(file.content).toContain("SELECT 1 FROM DUAL");
      expect(file.content).toContain("# Tables d\u00e9tect\u00e9es");
      expect(file.content).toContain("COMPTE");
      expect(file.content).toContain("# S\u00e9quences d\u00e9tect\u00e9es");
      expect(file.content).toContain("SEQ_COMPTE");
      expect(file.content).toContain("# JNDI legacy");
    });

    it("generates MySQL-specific application.yml", () => {
      const ir = makeIR();
      const dsInfo = makeDsInfo("MYSQL");

      const file = gen.generateApplicationYml(ir, dsInfo);
      expect(file.content).toContain("com.mysql.cj.jdbc.Driver");
      expect(file.content).toContain("MySQLDialect");
      expect(file.content).toContain("MYSQL_URL");
    });

    it("generates PostgreSQL-specific application.yml", () => {
      const ir = makeIR();
      const dsInfo = makeDsInfo("POSTGRESQL");

      const file = gen.generateApplicationYml(ir, dsInfo);
      expect(file.content).toContain("org.postgresql.Driver");
      expect(file.content).toContain("PostgreSQLDialect");
      expect(file.content).toContain("PG_URL");
    });

    it("generates MongoDB-specific application.yml (no JPA)", () => {
      const ir = makeIR();
      const dsInfo = makeDsInfo("MONGODB");

      const file = gen.generateApplicationYml(ir, dsInfo);
      expect(file.content).toContain("mongodb");
      expect(file.content).toContain("MONGODB_URI");
      expect(file.content).not.toContain("datasource");
      expect(file.content).not.toContain("jpa");
    });

    it("generates SQLite without username/password", () => {
      const ir = makeIR();
      const dsInfo = makeDsInfo("SQLITE");

      const file = gen.generateApplicationYml(ir, dsInfo);
      expect(file.content).toContain("org.sqlite.JDBC");
      expect(file.content).not.toContain("username:");
      expect(file.content).not.toContain("password:");
    });

    it("includes nationalized character data for Oracle/PG/DB2", () => {
      for (const vendor of ["ORACLE", "POSTGRESQL", "DB2"] as DatabaseVendor[]) {
        const file = gen.generateApplicationYml(makeIR(), makeDsInfo(vendor));
        expect(file.content).toContain("use_nationalized_character_data: true");
      }
    });

    it("includes sequence mapping when sequences detected", () => {
      const dsInfo = makeDsInfo("ORACLE", { sequences: ["SEQ_ID"] });
      const file = gen.generateApplicationYml(makeIR(), dsInfo);
      expect(file.content).toContain("id.new_generator_mappings: true");
    });
  });

  // ─── Maven Dependency ─────────────────────────────────────────────────

  describe("generateMavenDependencyXml", () => {
    it("generates Oracle Maven dependency with version", () => {
      const xml = gen.generateMavenDependencyXml(makeDsInfo("ORACLE"));
      expect(xml).toContain("oracle.database.jdbc");
      expect(xml).toContain("ojdbc11");
      expect(xml).toContain("23.2.0.0");
      expect(xml).toContain("runtime");
      expect(xml).toContain("NOTE:");
    });

    it("generates MySQL Maven dependency", () => {
      const xml = gen.generateMavenDependencyXml(makeDsInfo("MYSQL"));
      expect(xml).toContain("com.mysql");
      expect(xml).toContain("mysql-connector-j");
    });

    it("generates MongoDB starter dependency (no scope)", () => {
      const xml = gen.generateMavenDependencyXml(makeDsInfo("MONGODB"));
      expect(xml).toContain("spring-boot-starter-data-mongodb");
      expect(xml).not.toContain("runtime");
    });

    it("generates PostgreSQL Maven dependency", () => {
      const xml = gen.generateMavenDependencyXml(makeDsInfo("POSTGRESQL"));
      expect(xml).toContain("org.postgresql");
      expect(xml).toContain("postgresql");
    });

    it("generates SQL Server Maven dependency", () => {
      const xml = gen.generateMavenDependencyXml(makeDsInfo("SQLSERVER"));
      expect(xml).toContain("mssql-jdbc");
    });
  });

  // ─── Docker Compose ───────────────────────────────────────────────────

  describe("generateDockerCompose", () => {
    it("generates Oracle docker-compose with correct image and ports", () => {
      const file = gen.generateDockerCompose(makeIR(), makeDsInfo("ORACLE"));
      expect(file.path).toBe("docker-compose.yml");
      expect(file.content).toContain("gvenzl/oracle-xe");
      expect(file.content).toContain("1521:1521");
      expect(file.content).toContain("healthcheck");
    });

    it("generates PostgreSQL docker-compose", () => {
      const file = gen.generateDockerCompose(makeIR(), makeDsInfo("POSTGRESQL"));
      expect(file.content).toContain("postgres:16-alpine");
      expect(file.content).toContain("5432:5432");
    });

    it("generates MySQL docker-compose", () => {
      const file = gen.generateDockerCompose(makeIR(), makeDsInfo("MYSQL"));
      expect(file.content).toContain("mysql:8.0");
      expect(file.content).toContain("3306:3306");
    });

    it("generates minimal docker-compose for vendors without Docker image", () => {
      const file = gen.generateDockerCompose(makeIR(), makeDsInfo("H2"));
      expect(file.content).toContain("pas d'image Docker");
      expect(file.content).not.toContain("healthcheck");
    });

    it("generates MongoDB docker-compose", () => {
      const file = gen.generateDockerCompose(makeIR(), makeDsInfo("MONGODB"));
      expect(file.content).toContain("mongo:7");
      expect(file.content).toContain("27017:27017");
    });
  });

  // ─── DATASOURCE_MIGRATION.md ──────────────────────────────────────────

  describe("generateMigrationDoc", () => {
    it("generates migration doc with vendor info", () => {
      const dsInfo = makeDsInfo("ORACLE", {
        tables: ["COMPTE", "CLIENT"],
        sequences: ["SEQ_COMPTE"],
        jndiNames: ["jdbc/BMCE_CORE_DS"],
        schemaHint: "BMCE_CORE",
      });

      const file = gen.generateMigrationDoc(makeIR(), dsInfo);
      expect(file.path).toBe("DATASOURCE_MIGRATION.md");
      expect(file.content).toContain("ORACLE");
      expect(file.content).toContain("oracle.jdbc.OracleDriver");
      expect(file.content).toContain("SEQUENCE");
      expect(file.content).toContain("jdbc/BMCE_CORE_DS");
      expect(file.content).toContain("BMCE_CORE");
      expect(file.content).toContain("COMPTE");
      expect(file.content).toContain("SEQ_COMPTE");
    });

    it("includes vendor-specific features section", () => {
      const dsInfo = makeDsInfo("ORACLE", {
        vendorSpecificFeatures: [
          { type: "SEQUENCE", description: "Sequences Oracle", migrationNote: "Migrer vers @SequenceGenerator" },
        ],
      });

      const file = gen.generateMigrationDoc(makeIR(), dsInfo);
      expect(file.content).toContain("Features vendor-specific");
      expect(file.content).toContain("SEQUENCE");
      expect(file.content).toContain("@SequenceGenerator");
    });

    it("includes multi-datasource section when detected", () => {
      const dsInfo = makeDsInfo("ORACLE", {
        multiDataSource: true,
        namedDataSources: [
          { jndiName: "jdbc/CORE_DS", varName: "CORE_URL", vendor: "ORACLE", usedInClasses: ["CompteDAO"] },
          { jndiName: "jdbc/BATCH_DS", varName: "BATCH_URL", vendor: "ORACLE", usedInClasses: ["BatchDAO"] },
        ],
      });

      const file = gen.generateMigrationDoc(makeIR(), dsInfo);
      expect(file.content).toContain("Multi-DataSource");
      expect(file.content).toContain("jdbc/CORE_DS");
      expect(file.content).toContain("jdbc/BATCH_DS");
      expect(file.content).toContain("@ConfigurationProperties");
    });

    it("includes scores annexe", () => {
      const dsInfo = makeDsInfo("ORACLE");
      const file = gen.generateMigrationDoc(makeIR(), dsInfo);
      expect(file.content).toContain("Scores de d\u00e9tection");
      expect(file.content).toContain("ORACLE");
      expect(file.content).toContain("30");
    });
  });

  // ─── VENDOR_CONFIG completeness ───────────────────────────────────────

  describe("VENDOR_CONFIG completeness", () => {
    const allVendors: DatabaseVendor[] = [
      "ORACLE", "MYSQL", "POSTGRESQL", "SQLSERVER", "DB2",
      "MARIADB", "H2", "SYBASE", "INFORMIX", "SQLITE", "MONGODB", "UNKNOWN",
    ];

    for (const vendor of allVendors) {
      it(`has config for ${vendor}`, () => {
        const cfg = VENDOR_CONFIG[vendor];
        expect(cfg).toBeDefined();
        expect(cfg.urlExample).toBeTruthy();
        expect(cfg.testQuery).toBeDefined();
        expect(cfg.jpaIdStrategy).toBeDefined();
      });
    }
  });
});
