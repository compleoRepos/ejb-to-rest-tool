/**
 * ConfigGenerator — Génération de configuration Spring Boot adaptée au vendor DB.
 * Produit : application.yml, dépendance Maven, docker-compose.yml, DATASOURCE_MIGRATION.md.
 *
 * Utilise les résultats du DataSourceDetector pour adapter automatiquement
 * la configuration au vendor détecté.
 *
 * @author Compleo
 */

import type { ProjectIR } from "../../java-parser";
import type { GeneratedFile } from "../../spring/shared";
import type { DataSourceInfo, DatabaseVendor } from "../detectors/DataSourceDetector";

// ─── Vendor Configuration Metadata ──────────────────────────────────────────

export interface VendorConfig {
  driverClass: string;
  dialect: string;
  urlExample: string;
  urlEnvVar: string;
  userEnvVar: string;
  passwordEnvVar: string;
  testQuery: string;
  mavenGroupId: string;
  mavenArtifactId: string;
  mavenVersion: string;
  mavenNote?: string;
  jpaIdStrategy: string;
  poolTestQuery: string;
  dockerImage?: string;
  dockerPort?: number;
  dockerEnv?: Record<string, string>;
  dockerHealthcheck?: string;
}

export const VENDOR_CONFIG: Record<DatabaseVendor, VendorConfig> = {
  ORACLE: {
    driverClass: "oracle.jdbc.OracleDriver",
    dialect: "org.hibernate.dialect.OracleDialect",
    urlExample: "jdbc:oracle:thin:@//host:1521/XEPDB1",
    urlEnvVar: "ORACLE_URL",
    userEnvVar: "ORACLE_USER",
    passwordEnvVar: "ORACLE_PASSWORD",
    testQuery: "SELECT 1 FROM DUAL",
    mavenGroupId: "com.oracle.database.jdbc",
    mavenArtifactId: "ojdbc11",
    mavenVersion: "23.2.0.0",
    mavenNote:
      "ojdbc non disponible sur Maven Central — voir DATASOURCE_MIGRATION.md",
    jpaIdStrategy: "SEQUENCE",
    poolTestQuery: "SELECT 1 FROM DUAL",
    dockerImage: "gvenzl/oracle-xe:21-slim",
    dockerPort: 1521,
    dockerEnv: {
      ORACLE_PASSWORD: "oracle",
      APP_USER: "appuser",
      APP_USER_PASSWORD: "appuser",
    },
    dockerHealthcheck:
      'healthcheck:\n      test: ["CMD", "healthcheck.sh"]\n      interval: 30s\n      timeout: 10s\n      retries: 10',
  },

  MYSQL: {
    driverClass: "com.mysql.cj.jdbc.Driver",
    dialect: "org.hibernate.dialect.MySQLDialect",
    urlExample:
      "jdbc:mysql://host:3306/dbname?useSSL=true&serverTimezone=UTC",
    urlEnvVar: "MYSQL_URL",
    userEnvVar: "MYSQL_USER",
    passwordEnvVar: "MYSQL_PASSWORD",
    testQuery: "SELECT 1",
    mavenGroupId: "com.mysql",
    mavenArtifactId: "mysql-connector-j",
    mavenVersion: "8.3.0",
    jpaIdStrategy: "IDENTITY",
    poolTestQuery: "SELECT 1",
    dockerImage: "mysql:8.0",
    dockerPort: 3306,
    dockerEnv: {
      MYSQL_ROOT_PASSWORD: "root",
      MYSQL_DATABASE: "{{dbname}}",
    },
    dockerHealthcheck:
      'healthcheck:\n      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]\n      interval: 10s\n      timeout: 5s\n      retries: 5',
  },

  POSTGRESQL: {
    driverClass: "org.postgresql.Driver",
    dialect: "org.hibernate.dialect.PostgreSQLDialect",
    urlExample: "jdbc:postgresql://host:5432/dbname",
    urlEnvVar: "PG_URL",
    userEnvVar: "PG_USER",
    passwordEnvVar: "PG_PASSWORD",
    testQuery: "SELECT 1",
    mavenGroupId: "org.postgresql",
    mavenArtifactId: "postgresql",
    mavenVersion: "42.7.3",
    jpaIdStrategy: "SEQUENCE",
    poolTestQuery: "SELECT 1",
    dockerImage: "postgres:16-alpine",
    dockerPort: 5432,
    dockerEnv: {
      POSTGRES_DB: "{{dbname}}",
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "postgres",
    },
    dockerHealthcheck:
      'healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 10s\n      timeout: 5s\n      retries: 5',
  },

  SQLSERVER: {
    driverClass: "com.microsoft.sqlserver.jdbc.SQLServerDriver",
    dialect: "org.hibernate.dialect.SQLServerDialect",
    urlExample:
      "jdbc:sqlserver://host:1433;databaseName=dbname;encrypt=true",
    urlEnvVar: "SQLSERVER_URL",
    userEnvVar: "SQLSERVER_USER",
    passwordEnvVar: "SQLSERVER_PASSWORD",
    testQuery: "SELECT 1",
    mavenGroupId: "com.microsoft.sqlserver",
    mavenArtifactId: "mssql-jdbc",
    mavenVersion: "12.6.0.jre11",
    jpaIdStrategy: "IDENTITY",
    poolTestQuery: "SELECT 1",
    dockerImage: "mcr.microsoft.com/mssql/server:2022-latest",
    dockerPort: 1433,
    dockerEnv: {
      ACCEPT_EULA: "Y",
      MSSQL_SA_PASSWORD: "YourStrong@Passw0rd",
    },
    dockerHealthcheck:
      'healthcheck:\n      test: /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$$MSSQL_SA_PASSWORD" -Q "SELECT 1"\n      interval: 15s\n      timeout: 10s\n      retries: 10',
  },

  DB2: {
    driverClass: "com.ibm.db2.jcc.DB2Driver",
    dialect: "org.hibernate.dialect.DB2Dialect",
    urlExample: "jdbc:db2://host:50000/DBNAME",
    urlEnvVar: "DB2_URL",
    userEnvVar: "DB2_USER",
    passwordEnvVar: "DB2_PASSWORD",
    testQuery: "SELECT 1 FROM SYSIBM.SYSDUMMY1",
    mavenGroupId: "com.ibm.db2",
    mavenArtifactId: "jcc",
    mavenVersion: "11.5.9.0",
    mavenNote: "DB2 driver disponible sur Maven Central depuis v11.5",
    jpaIdStrategy: "SEQUENCE",
    poolTestQuery: "SELECT 1 FROM SYSIBM.SYSDUMMY1",
    dockerImage: "ibmcom/db2:11.5.8.0",
    dockerPort: 50000,
    dockerEnv: {
      LICENSE: "accept",
      DB2INST1_PASSWORD: "db2inst1",
      DBNAME: "{{dbname}}",
    },
    dockerHealthcheck:
      'healthcheck:\n      test: ["CMD", "su", "-", "db2inst1", "-c", "db2 connect to $$DBNAME"]\n      interval: 30s\n      timeout: 10s\n      retries: 10',
  },

  MARIADB: {
    driverClass: "org.mariadb.jdbc.Driver",
    dialect: "org.hibernate.dialect.MariaDBDialect",
    urlExample: "jdbc:mariadb://host:3306/dbname",
    urlEnvVar: "MARIADB_URL",
    userEnvVar: "MARIADB_USER",
    passwordEnvVar: "MARIADB_PASSWORD",
    testQuery: "SELECT 1",
    mavenGroupId: "org.mariadb.jdbc",
    mavenArtifactId: "mariadb-java-client",
    mavenVersion: "3.3.3",
    jpaIdStrategy: "IDENTITY",
    poolTestQuery: "SELECT 1",
    dockerImage: "mariadb:11",
    dockerPort: 3306,
    dockerEnv: {
      MARIADB_ROOT_PASSWORD: "root",
      MARIADB_DATABASE: "{{dbname}}",
    },
    dockerHealthcheck:
      'healthcheck:\n      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]\n      interval: 10s\n      timeout: 5s\n      retries: 5',
  },

  H2: {
    driverClass: "org.h2.Driver",
    dialect: "org.hibernate.dialect.H2Dialect",
    urlExample: "jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1",
    urlEnvVar: "H2_URL",
    userEnvVar: "H2_USER",
    passwordEnvVar: "H2_PASSWORD",
    testQuery: "SELECT 1",
    mavenGroupId: "com.h2database",
    mavenArtifactId: "h2",
    mavenVersion: "2.2.224",
    jpaIdStrategy: "IDENTITY",
    poolTestQuery: "SELECT 1",
  },

  SYBASE: {
    driverClass: "com.sybase.jdbc4.jdbc.SybDriver",
    dialect: "org.hibernate.dialect.SybaseDialect",
    urlExample: "jdbc:sybase:Tds:host:5000/dbname",
    urlEnvVar: "SYBASE_URL",
    userEnvVar: "SYBASE_USER",
    passwordEnvVar: "SYBASE_PASSWORD",
    testQuery: "SELECT 1",
    mavenGroupId: "com.sybase",
    mavenArtifactId: "jconn4",
    mavenVersion: "7.0",
    mavenNote:
      "Driver Sybase non disponible sur Maven Central — installer localement",
    jpaIdStrategy: "IDENTITY",
    poolTestQuery: "SELECT 1",
  },

  INFORMIX: {
    driverClass: "com.informix.jdbc.IfxDriver",
    dialect: "org.hibernate.dialect.InformixDialect",
    urlExample:
      "jdbc:informix-sqli://host:9088/dbname:INFORMIXSERVER=srv",
    urlEnvVar: "INFORMIX_URL",
    userEnvVar: "INFORMIX_USER",
    passwordEnvVar: "INFORMIX_PASSWORD",
    testQuery: "SELECT 1 FROM systables WHERE tabid=1",
    mavenGroupId: "com.ibm.informix",
    mavenArtifactId: "jdbc",
    mavenVersion: "4.50.10",
    jpaIdStrategy: "IDENTITY",
    poolTestQuery: "SELECT 1 FROM systables WHERE tabid=1",
  },

  SQLITE: {
    driverClass: "org.sqlite.JDBC",
    dialect: "org.hibernate.community.dialect.SQLiteDialect",
    urlExample: "jdbc:sqlite:/path/to/database.db",
    urlEnvVar: "SQLITE_URL",
    userEnvVar: "",
    passwordEnvVar: "",
    testQuery: "SELECT 1",
    mavenGroupId: "org.xerial",
    mavenArtifactId: "sqlite-jdbc",
    mavenVersion: "3.45.3.0",
    jpaIdStrategy: "IDENTITY",
    poolTestQuery: "SELECT 1",
  },

  MONGODB: {
    driverClass: "",
    dialect: "",
    urlExample: "mongodb://host:27017/dbname",
    urlEnvVar: "MONGODB_URI",
    userEnvVar: "MONGODB_USER",
    passwordEnvVar: "MONGODB_PASSWORD",
    testQuery: "",
    mavenGroupId: "org.springframework.boot",
    mavenArtifactId: "spring-boot-starter-data-mongodb",
    mavenVersion: "",
    jpaIdStrategy: "",
    poolTestQuery: "",
    dockerImage: "mongo:7",
    dockerPort: 27017,
    dockerEnv: {
      MONGO_INITDB_ROOT_USERNAME: "root",
      MONGO_INITDB_ROOT_PASSWORD: "root",
      MONGO_INITDB_DATABASE: "{{dbname}}",
    },
    dockerHealthcheck:
      'healthcheck:\n      test: ["CMD", "mongosh", "--eval", "db.adminCommand(\'ping\')"]\n      interval: 10s\n      timeout: 5s\n      retries: 5',
  },

  UNKNOWN: {
    driverClass: "YOUR_DRIVER_CLASS",
    dialect: "org.hibernate.dialect.Dialect",
    urlExample: "jdbc:vendor://host:port/dbname",
    urlEnvVar: "DB_URL",
    userEnvVar: "DB_USER",
    passwordEnvVar: "DB_PASSWORD",
    testQuery: "SELECT 1",
    mavenGroupId: "YOUR_GROUP_ID",
    mavenArtifactId: "YOUR_ARTIFACT_ID",
    mavenVersion: "YOUR_VERSION",
    jpaIdStrategy: "AUTO",
    poolTestQuery: "SELECT 1",
  },
};

// ─── ConfigGenerator ────────────────────────────────────────────────────────

export class ConfigGenerator {
  /**
   * Génère le fichier application.yml adapté au vendor détecté.
   */
  generateApplicationYml(
    ir: ProjectIR,
    dsInfo: DataSourceInfo
  ): GeneratedFile {
    const cfg = VENDOR_CONFIG[dsInfo.vendor];
    const appName = ir.artifactId;
    const isMongo = dsInfo.vendor === "MONGODB";
    const noPassword = dsInfo.vendor === "SQLITE";

    const tablesComment =
      dsInfo.tables.length > 0
        ? `# Tables détectées : ${dsInfo.tables.slice(0, 5).join(", ")}` +
          (dsInfo.tables.length > 5
            ? ` (+${dsInfo.tables.length - 5} autres)`
            : "")
        : "";

    const sequencesComment =
      dsInfo.sequences.length > 0
        ? `# Séquences détectées : ${dsInfo.sequences.slice(0, 5).join(", ")}` +
          (dsInfo.sequences.length > 5
            ? ` (+${dsInfo.sequences.length - 5} autres)`
            : "")
        : "";

    const jndiComment =
      dsInfo.jndiNames.length > 0
        ? `# JNDI legacy : ${dsInfo.jndiNames.join(", ")}`
        : "";

    const schemaComment = dsInfo.schemaHint
      ? `# Schema hint : ${dsInfo.schemaHint}`
      : "";

    let content: string;

    if (isMongo) {
      content = `# ${ir.projectName || appName} — Spring Boot Configuration
# Vendor détecté : ${dsInfo.vendor}
${jndiComment}
${schemaComment}

spring:
  application:
    name: ${appName}
  data:
    mongodb:
      uri: \${${cfg.urlEnvVar}:${cfg.urlExample}}
      database: \${MONGODB_DATABASE:${appName.replace(/-/g, "_")}}
${cfg.userEnvVar ? `      username: \${${cfg.userEnvVar}:}` : ""}
${cfg.passwordEnvVar ? `      password: \${${cfg.passwordEnvVar}:}` : ""}

server:
  port: \${PORT:8080}
  servlet:
    context-path: /

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
  endpoint:
    health:
      show-details: when_authorized

logging:
  level:
    root: INFO
    ${ir.groupId || "com.example"}: DEBUG

# OpenAPI / Swagger
springdoc:
  api-docs:
    path: /api-docs
  swagger-ui:
    path: /swagger-ui.html
`;
    } else {
      content = `# ${ir.projectName || appName} — Spring Boot Configuration
# Vendor détecté : ${dsInfo.vendor}
${tablesComment}
${sequencesComment}
${jndiComment}
${schemaComment}

spring:
  application:
    name: ${appName}
  datasource:
    url: \${${cfg.urlEnvVar}:${cfg.urlExample}}
${!noPassword ? `    username: \${${cfg.userEnvVar}:root}` : ""}
${!noPassword ? `    password: \${${cfg.passwordEnvVar}:}` : ""}
    driver-class-name: ${cfg.driverClass}
    hikari:
      connection-test-query: ${cfg.poolTestQuery}
      maximum-pool-size: 10
      minimum-idle: 2
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        dialect: ${cfg.dialect}
        format_sql: true
${dsInfo.vendor === "ORACLE" || dsInfo.vendor === "POSTGRESQL" || dsInfo.vendor === "DB2" ? `        use_nationalized_character_data: true` : ""}
${dsInfo.sequences.length > 0 ? `        id.new_generator_mappings: true` : ""}

server:
  port: \${PORT:8080}
  servlet:
    context-path: /

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
  endpoint:
    health:
      show-details: when_authorized

logging:
  level:
    root: INFO
    ${ir.groupId || "com.example"}: DEBUG

# OpenAPI / Swagger
springdoc:
  api-docs:
    path: /api-docs
  swagger-ui:
    path: /swagger-ui.html
`;
    }

    // ─── Multi-DataSource sections ───
    if (dsInfo.multiDataSource && dsInfo.namedDataSources.length > 0) {
      content += `\n# ─── Multi-DataSource Configuration ───\n`;
      content += `# ${dsInfo.namedDataSources.length} datasources détectées — utiliser @ConfigurationProperties + @Qualifier\n\n`;

      for (const nds of dsInfo.namedDataSources) {
        const ndsCfg = VENDOR_CONFIG[nds.vendor] || VENDOR_CONFIG[dsInfo.vendor];
        const dsKey = nds.varName
          .replace(/DataSource$/i, "")
          .replace(/([A-Z])/g, "-$1")
          .toLowerCase()
          .replace(/^-/, "");
        const isMongods = nds.vendor === "MONGODB";

        if (isMongods) {
          content += `  # DataSource: ${nds.jndiName} (${nds.vendor})\n`;
          content += `  # Classes: ${nds.usedInClasses.join(", ")}\n`;
          content += `  ${dsKey || "secondary"}:\n`;
          content += `    mongodb:\n`;
          content += `      uri: \${${nds.varName.toUpperCase()}_URI:${ndsCfg.urlExample}}\n`;
          content += `      database: \${${nds.varName.toUpperCase()}_DB:${dsKey || "secondary"}}\n\n`;
        } else {
          content += `  # DataSource: ${nds.jndiName} (${nds.vendor})\n`;
          content += `  # Classes: ${nds.usedInClasses.join(", ")}\n`;
          content += `  ${dsKey || "secondary"}:\n`;
          content += `    datasource:\n`;
          content += `      url: \${${nds.varName.toUpperCase()}_URL:${ndsCfg.urlExample}}\n`;
          content += `      username: \${${nds.varName.toUpperCase()}_USER:}\n`;
          content += `      password: \${${nds.varName.toUpperCase()}_PASSWORD:}\n`;
          content += `      driver-class-name: ${ndsCfg.driverClass}\n\n`;
        }
      }
    }

    // Clean up empty lines from conditional comments
    content = content.replace(/\n\n\n+/g, "\n\n");

    return {
      path: "src/main/resources/application.yml",
      category: "config",
      content,
    };
  }

  /**
   * Génère le snippet de dépendance Maven pour le driver DB.
   * Retourne le XML à insérer dans le pom.xml.
   */
  generateMavenDependencyXml(dsInfo: DataSourceInfo): string {
    const cfg = VENDOR_CONFIG[dsInfo.vendor];

    if (dsInfo.vendor === "MONGODB") {
      return `        <!-- Database: MongoDB -->
        <dependency>
            <groupId>${cfg.mavenGroupId}</groupId>
            <artifactId>${cfg.mavenArtifactId}</artifactId>
        </dependency>`;
    }

    const versionTag = cfg.mavenVersion
      ? `\n            <version>${cfg.mavenVersion}</version>`
      : "";
    const noteComment = cfg.mavenNote
      ? `\n        <!-- NOTE: ${cfg.mavenNote} -->`
      : "";

    return `        <!-- Database: ${dsInfo.vendor} -->${noteComment}
        <dependency>
            <groupId>${cfg.mavenGroupId}</groupId>
            <artifactId>${cfg.mavenArtifactId}</artifactId>${versionTag}
            <scope>runtime</scope>
        </dependency>`;
  }

  /**
   * Génère le docker-compose.yml adapté au vendor détecté.
   */
  generateDockerCompose(
    ir: ProjectIR,
    dsInfo: DataSourceInfo
  ): GeneratedFile {
    const cfg = VENDOR_CONFIG[dsInfo.vendor];
    const serviceName = ir.artifactId;
    const dbName = serviceName.replace(/-/g, "_");

    if (!cfg.dockerImage) {
      // Pas de Docker image pour ce vendor (H2, Sybase, Informix, etc.)
      // Retourner un docker-compose minimal sans DB
      return {
        path: "docker-compose.yml",
        category: "cloud",
        content: `# ${ir.projectName || serviceName} — Docker Compose
# Vendor: ${dsInfo.vendor} (pas d'image Docker officielle disponible)
version: '3.8'

services:
  ${serviceName}:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
`,
      };
    }

    const isMongo = dsInfo.vendor === "MONGODB";
    const dbServiceName = isMongo ? "mongodb" : dsInfo.vendor.toLowerCase();
    const envEntries = cfg.dockerEnv
      ? Object.entries(cfg.dockerEnv)
          .map(([k, v]) => `      ${k}: ${v.replace("{{dbname}}", dbName)}`)
          .join("\n")
      : "";

    const appDbUrl = isMongo
      ? `mongodb://${dbServiceName}:${cfg.dockerPort}/${dbName}`
      : cfg.urlExample
          .replace("host", dbServiceName)
          .replace("dbname", dbName)
          .replace("DBNAME", dbName)
          .replace("XEPDB1", dbName);

    const volumeName = `${dbServiceName}-data`;
    const volumeMount = isMongo
      ? "/data/db"
      : dsInfo.vendor === "ORACLE"
        ? "/opt/oracle/oradata"
        : dsInfo.vendor === "POSTGRESQL"
          ? "/var/lib/postgresql/data"
          : dsInfo.vendor === "SQLSERVER"
            ? "/var/opt/mssql"
            : dsInfo.vendor === "DB2"
              ? "/database"
              : "/var/lib/mysql";

    return {
      path: "docker-compose.yml",
      category: "cloud",
      content: `# ${ir.projectName || serviceName} — Docker Compose
# Vendor détecté : ${dsInfo.vendor}
version: '3.8'

services:
  ${serviceName}:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - ${cfg.urlEnvVar}=${appDbUrl}
${!isMongo && cfg.userEnvVar ? `      - ${cfg.userEnvVar}=root` : ""}
${!isMongo && cfg.passwordEnvVar ? `      - ${cfg.passwordEnvVar}=root` : ""}
    depends_on:
      ${dbServiceName}:
        condition: service_healthy

  ${dbServiceName}:
    image: ${cfg.dockerImage}
    environment:
${envEntries}
    ports:
      - "${cfg.dockerPort}:${cfg.dockerPort}"
    volumes:
      - ${volumeName}:${volumeMount}
    ${cfg.dockerHealthcheck || ""}

volumes:
  ${volumeName}:
`,
    };
  }

  /**
   * Génère le document DATASOURCE_MIGRATION.md.
   */
  generateMigrationDoc(
    ir: ProjectIR,
    dsInfo: DataSourceInfo
  ): GeneratedFile {
    const cfg = VENDOR_CONFIG[dsInfo.vendor];
    const now = new Date().toISOString().split("T")[0];

    let content = `# DATASOURCE_MIGRATION.md
## Guide de migration DataSource — ${ir.projectName || ir.artifactId}
**Date** : ${now}
**Vendor détecté** : ${dsInfo.vendor}
**Confiance** : ${this.confidenceLevel(dsInfo)}

---

### 1. Résumé de la détection

| Propriété | Valeur |
|-----------|--------|
| Vendor | **${dsInfo.vendor}** |
| Driver | \`${dsInfo.driverClass || cfg.driverClass}\` |
| Dialect Hibernate | \`${cfg.dialect}\` |
| Stratégie ID JPA | \`@GeneratedValue(strategy = GenerationType.${cfg.jpaIdStrategy})\` |
| JNDI legacy | ${dsInfo.jndiNames.length > 0 ? dsInfo.jndiNames.map((j) => `\`${j}\``).join(", ") : "Aucun détecté"} |
| Multi-DataSource | ${dsInfo.multiDataSource ? "Oui" : "Non"} |
| Schema hint | ${dsInfo.schemaHint || "N/A"} |

### 2. Configuration Spring Boot

\`\`\`yaml
spring:
  datasource:
    url: \${${cfg.urlEnvVar}:${cfg.urlExample}}
    username: \${${cfg.userEnvVar}:}
    password: \${${cfg.passwordEnvVar}:}
    driver-class-name: ${cfg.driverClass}
  jpa:
    properties:
      hibernate:
        dialect: ${cfg.dialect}
\`\`\`

### 3. Dépendance Maven

\`\`\`xml
<dependency>
    <groupId>${cfg.mavenGroupId}</groupId>
    <artifactId>${cfg.mavenArtifactId}</artifactId>
${cfg.mavenVersion ? `    <version>${cfg.mavenVersion}</version>` : ""}
    <scope>runtime</scope>
</dependency>
\`\`\`
${cfg.mavenNote ? `\n> **Note** : ${cfg.mavenNote}\n` : ""}
### 4. Variables d'environnement requises

| Variable | Description | Exemple |
|----------|-------------|---------|
| \`${cfg.urlEnvVar}\` | URL JDBC de connexion | \`${cfg.urlExample}${cfg.userEnvVar ? `| \`${cfg.userEnvVar}\` | Utilisateur DB | \`appuser\` |` : ""}
${cfg.passwordEnvVar ? `| \`${cfg.passwordEnvVar}\` | Mot de passe DB | \`***\` |` : ""}
### 5. Tables détectées (${dsInfo.tables.length})

${dsInfo.tables.length > 0 ? dsInfo.tables.map((t) => `- \`${t}\``).join("\n") : "Aucune table détectée dans le code source."}

### 6. Séquences détectées (${dsInfo.sequences.length})

${dsInfo.sequences.length > 0 ? dsInfo.sequences.map((s) => `- \`${s}\``).join("\n") : "Aucune séquence détectée."}
`;

    // Section features vendor-specific
    if (dsInfo.vendorSpecificFeatures.length > 0) {
      content += `
### 7. Features vendor-specific détectées

| Feature | Description | Note de migration |
|---------|-------------|-------------------|
${dsInfo.vendorSpecificFeatures
  .map(
    (f) =>
      `| ${f.type} | ${f.description} | ${f.migrationNote} |`
  )
  .join("\n")}
`;
    }

    // Section multi-datasource
    if (dsInfo.multiDataSource && dsInfo.namedDataSources.length > 0) {
      content += `
### 8. Multi-DataSource détecté

> **Attention** : Plusieurs DataSources ont été détectées. La configuration Spring Boot
> devra être adaptée avec \`@ConfigurationProperties\` et \`@Qualifier\`.

| JNDI Name | Variable | Vendor | Classes utilisatrices |
|-----------|----------|--------|----------------------|
${dsInfo.namedDataSources
  .map(
    (ds) =>
      `| \`${ds.jndiName}\` | \`${ds.varName}\` | ${ds.vendor} | ${ds.usedInClasses.join(", ")} |`
  )
  .join("\n")}
`;
    }

    // Section scores (debug)
    content += `
### Annexe — Scores de détection

| Vendor | Score |
|--------|-------|
${(Object.entries(dsInfo.scores) as [DatabaseVendor, number][])
  .filter(([, s]) => s > 0)
  .sort(([, a], [, b]) => b - a)
  .map(([v, s]) => `| ${v} | ${s} |`)
  .join("\n")}
`;

    return {
      path: "DATASOURCE_MIGRATION.md",
      category: "config",
      content,
    };
  }

  /**
   * Retourne la configuration vendor pour usage externe.
   */
  getVendorConfig(vendor: DatabaseVendor): VendorConfig {
    return VENDOR_CONFIG[vendor];
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private confidenceLevel(dsInfo: DataSourceInfo): string {
    const maxScore = Math.max(
      ...Object.values(dsInfo.scores).filter((_, i) => i < 11)
    );
    if (maxScore >= 20) return "Haute (driver/URL explicite détecté)";
    if (maxScore >= 10) return "Moyenne (classes Java ou JNDI détectés)";
    if (maxScore >= 5) return "Faible (mots-clés SQL uniquement)";
    return "Indéterminée (aucun indice trouvé)";
  }
}
