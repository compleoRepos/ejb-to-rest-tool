/**
 * CobolToJavaConverter.ts — Main orchestrator for COBOL → Spring Boot conversion
 * Coordinates all sub-converters to produce a complete Spring Boot project.
 *
 * Output structure:
 *   src/main/java/{package}/
 *     batch/          → Job/Step configuration (from JCL)
 *     model/          → DTOs (from WORKING-STORAGE / LINKAGE)
 *     repository/     → Data access (from EXEC SQL)
 *     service/        → Business logic (from PROCEDURE DIVISION)
 *     Application.java → Spring Boot main class
 *   src/main/resources/
 *     application.yml → DB config, batch config
 *   pom.xml          → Maven dependencies
 *
 * @author Compleo v11.1
 */

import type { CobolProgramIR, CobolSection } from "../CobolParser";
import type { JclJob } from "../JclParser";
import { mapDataItems, cobolNameToClassName, cobolNameToJava, type CobolDataItem, type JavaField } from "./DataItemMapper";
import { parseSqlStatement, convertAllSql, type SqlStatement } from "./SqlConverter";
import { convertStatement, buildJavaMethod, type JavaMethod, type ConversionContext } from "./ProcedureConverter";
import { generateBatchJobConfig, renderBatchJobConfig, type JclStep } from "./BatchJobGenerator";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConversionResult {
  files: GeneratedJavaFile[];
  warnings: string[];
  stats: ConversionStats;
}

export interface GeneratedJavaFile {
  path: string;
  content: string;
  type: "model" | "repository" | "service" | "batch" | "config" | "pom" | "yaml";
}

export interface ConversionStats {
  totalPrograms: number;
  totalFiles: number;
  modelsGenerated: number;
  repositoriesGenerated: number;
  servicesGenerated: number;
  batchJobsGenerated: number;
  sqlStatementsConverted: number;
  cursorsConverted: number;
  warningsCount: number;
}

export interface ConversionOptions {
  basePackage: string;
  projectName: string;
  springBootVersion: string;
  javaVersion: string;
  useJpa: boolean;
  useLombok: boolean;
  generateTests: boolean;
}

const DEFAULT_OPTIONS: ConversionOptions = {
  basePackage: "com.company.migration",
  projectName: "cobol-migration",
  springBootVersion: "3.2.0",
  javaVersion: "17",
  useJpa: false, // Default to JdbcTemplate for COBOL migrations
  useLombok: true,
  generateTests: true,
};

// ─── Main Converter ─────────────────────────────────────────────────────────

/**
 * Convert a set of COBOL programs + JCL to a Spring Boot project.
 */
export function convertCobolToJava(
  programs: CobolProgramIR[],
  jclJobs: JclJob[],
  options: Partial<ConversionOptions> = {}
): ConversionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const files: GeneratedJavaFile[] = [];
  const warnings: string[] = [];
  const stats: ConversionStats = {
    totalPrograms: programs.length,
    totalFiles: 0,
    modelsGenerated: 0,
    repositoriesGenerated: 0,
    servicesGenerated: 0,
    batchJobsGenerated: 0,
    sqlStatementsConverted: 0,
    cursorsConverted: 0,
    warningsCount: 0,
  };

  const basePath = `src/main/java/${opts.basePackage.replace(/\./g, "/")}`;

  // ─── 1. Generate DTOs from WORKING-STORAGE / LINKAGE ──────────────────
  for (const prog of programs) {
    const dataItems = extractDataItems(prog);
    if (dataItems.length > 0) {
      const modelFile = generateModelClass(prog, dataItems, opts, basePath);
      if (modelFile) {
        files.push(modelFile);
        stats.modelsGenerated++;
      }
    }
  }

  // ─── 2. Generate Repositories from EXEC SQL ───────────────────────────
  for (const prog of programs) {
    const sqlStatements = extractSqlStatements(prog);
    if (sqlStatements.length > 0) {
      const repoFile = generateRepository(prog, sqlStatements, opts, basePath);
      files.push(repoFile);
      stats.repositoriesGenerated++;
      stats.sqlStatementsConverted += sqlStatements.filter(s => s.type !== "CURSOR" && s.type !== "OPEN" && s.type !== "FETCH" && s.type !== "CLOSE").length;
      stats.cursorsConverted += sqlStatements.filter(s => s.type === "CURSOR").length;
    }
  }

  // ─── 3. Generate Services from PROCEDURE DIVISION ─────────────────────
  for (const prog of programs) {
    const serviceFile = generateService(prog, opts, basePath, warnings);
    files.push(serviceFile);
    stats.servicesGenerated++;
  }

  // ─── 4. Generate Batch Job configs from JCL ───────────────────────────
  for (const job of jclJobs) {
    const programNames = programs.map(p => p.programId);
    const batchConfig = generateBatchJobConfig(
      { name: job.jobName, jobClass: job.jobClass || undefined, steps: job.steps },
      programNames,
      opts.basePackage
    );
    const batchFile: GeneratedJavaFile = {
      path: `${basePath}/batch/${batchConfig.className}.java`,
      content: renderBatchJobConfig(batchConfig),
      type: "batch",
    };
    files.push(batchFile);
    stats.batchJobsGenerated++;
  }

  // ─── 5. Generate Application.java ─────────────────────────────────────
  files.push(generateApplicationClass(opts, basePath));

  // ─── 6. Generate application.yml ──────────────────────────────────────
  files.push(generateApplicationYml(opts, programs));

  // ─── 7. Generate pom.xml ──────────────────────────────────────────────
  files.push(generatePomXml(opts, programs));

  stats.totalFiles = files.length;
  stats.warningsCount = warnings.length;

  return { files, warnings, stats };
}

// ─── Sub-generators ─────────────────────────────────────────────────────────

function extractDataItems(prog: CobolProgramIR): CobolDataItem[] {
  // Convert from IR format (CobolParser) to CobolDataItem format (DataItemMapper)
  if (!prog.dataItems || prog.dataItems.length === 0) return [];

  return prog.dataItems.map(item => ({
    level: parseInt(String(item.level), 10) || 1,
    name: item.name,
    pic: item.picture || undefined,
    usage: item.usage || undefined,
    value: item.value || undefined,
    occurs: item.occurs || undefined,
    redefines: item.redefines || undefined,
  }));
}

function extractSqlStatements(prog: CobolProgramIR): SqlStatement[] {
  if (!prog.sqlStatements || prog.sqlStatements.length === 0) return [];

  return prog.sqlStatements.map(stmt => parseSqlStatement(`EXEC SQL ${stmt.sql} END-EXEC`));
}

function generateModelClass(
  prog: CobolProgramIR,
  dataItems: CobolDataItem[],
  opts: ConversionOptions,
  basePath: string
): GeneratedJavaFile | null {
  const className = `${cobolNameToClassName(prog.programId)}Dto`;
  const mapping = mapDataItems(dataItems);

  if (mapping.fields.length === 0) return null;

  const lines: string[] = [];
  lines.push(`package ${opts.basePackage}.model;`);
  lines.push("");

  // Imports
  const imports = new Set([...mapping.imports]);
  if (opts.useLombok) {
    imports.add("lombok.Data");
    imports.add("lombok.NoArgsConstructor");
    imports.add("lombok.AllArgsConstructor");
  }
  for (const imp of [...imports].sort()) {
    lines.push(`import ${imp};`);
  }
  lines.push("");

  // Class
  if (opts.useLombok) {
    lines.push(`@Data`);
    lines.push(`@NoArgsConstructor`);
    lines.push(`@AllArgsConstructor`);
  }
  lines.push(`public class ${className} {`);
  lines.push("");

  // Fields
  for (const field of mapping.fields) {
    renderField(field, lines, "    ");
  }

  // Inner classes for GROUP items
  for (const field of mapping.fields) {
    if (field.isGroup && field.children && field.children.length > 0) {
      renderInnerClass(field, lines, opts);
    }
  }

  lines.push(`}`);

  return {
    path: `${basePath}/model/${className}.java`,
    content: lines.join("\n"),
    type: "model",
  };
}

function renderField(field: JavaField, lines: string[], indent: string): void {
  if (field.comment) {
    lines.push(`${indent}/** ${field.comment} */`);
  }
  if (field.originalPic) {
    lines.push(`${indent}// PIC ${field.originalPic}`);
  }
  const defaultVal = field.defaultValue ? ` = ${field.defaultValue}` : "";
  lines.push(`${indent}private ${field.javaType} ${field.name}${defaultVal};`);
}

function renderInnerClass(field: JavaField, lines: string[], opts: ConversionOptions): void {
  lines.push("");
  if (opts.useLombok) {
    lines.push(`    @Data`);
    lines.push(`    @NoArgsConstructor`);
  }
  lines.push(`    public static class ${field.javaType} {`);
  for (const child of field.children!) {
    renderField(child, lines, "        ");
  }
  lines.push(`    }`);
}

function generateRepository(
  prog: CobolProgramIR,
  sqlStatements: SqlStatement[],
  opts: ConversionOptions,
  basePath: string
): GeneratedJavaFile {
  const className = `${cobolNameToClassName(prog.programId)}Repository`;
  const { methods, cursorReaders, allImports } = convertAllSql(sqlStatements);

  const lines: string[] = [];
  lines.push(`package ${opts.basePackage}.repository;`);
  lines.push("");

  // Imports
  allImports.add("org.springframework.stereotype.Repository");
  allImports.add("org.springframework.beans.factory.annotation.Autowired");
  for (const imp of [...allImports].sort()) {
    lines.push(`import ${imp};`);
  }
  lines.push("");

  // Class
  lines.push(`@Repository`);
  lines.push(`public class ${className} {`);
  lines.push("");
  lines.push(`    @Autowired`);
  lines.push(`    private JdbcTemplate jdbcTemplate;`);
  lines.push("");

  // Methods
  for (const method of methods) {
    lines.push(method.javaCode);
    lines.push("");
  }

  // Cursor readers (as separate beans)
  if (cursorReaders.length > 0) {
    lines.push(`    // ─── Cursor-based Readers (for Spring Batch) ───`);
    for (const reader of cursorReaders) {
      lines.push(reader.javaCode);
      lines.push("");
    }
  }

  lines.push(`}`);

  return {
    path: `${basePath}/repository/${className}.java`,
    content: lines.join("\n"),
    type: "repository",
  };
}

function generateService(
  prog: CobolProgramIR,
  opts: ConversionOptions,
  basePath: string,
  warnings: string[]
): GeneratedJavaFile {
  const className = `${cobolNameToClassName(prog.programId)}Service`;
  const repoClassName = `${cobolNameToClassName(prog.programId)}Repository`;

  const ctx: ConversionContext = {
    programName: prog.programId,
    sections: prog.sections?.map(s => s.name) || [],
    performCalls: prog.performCalls || [],
    dataItems: new Map(),
  };

  const lines: string[] = [];
  lines.push(`package ${opts.basePackage}.service;`);
  lines.push("");
  lines.push(`import ${opts.basePackage}.repository.${repoClassName};`);
  lines.push(`import org.springframework.stereotype.Service;`);
  lines.push(`import org.springframework.beans.factory.annotation.Autowired;`);
  lines.push(`import lombok.extern.slf4j.Slf4j;`);
  lines.push("");

  lines.push(`@Slf4j`);
  lines.push(`@Service`);
  lines.push(`public class ${className} {`);
  lines.push("");
  lines.push(`    @Autowired`);
  lines.push(`    private ${repoClassName} repository;`);
  lines.push("");

  // Convert each section to a method
  if (prog.sections && prog.sections.length > 0) {
    for (const section of prog.sections) {
      const methodName = cobolNameToJava(section.name);
      const isMain = section.name.includes("MAIN") || section.name.includes("0000") || section.name.startsWith("000");
      const visibility = isMain ? "public" : "private";

      lines.push(`    /** Converted from COBOL section: ${section.name} */`);
      lines.push(`    ${visibility} void ${methodName}() {`);

      // Generate method body from section metadata
      if (section.performs && section.performs.length > 0) {
        for (const perform of section.performs) {
          const converted = convertStatement(`PERFORM ${perform}`, ctx);
          if (converted) {
            lines.push(`        ${converted}`);
          }
        }
      } else {
        // Generate PERFORM calls from known calls
        const sectionPerforms = (prog.performCalls || [])
          .filter(p => p.startsWith(section.name) || section.name.includes("MAIN"));
        if (sectionPerforms.length > 0) {
          for (const perform of sectionPerforms) {
            lines.push(`        ${cobolNameToJava(perform)}();`);
          }
        } else {
          lines.push(`        // TODO: Implement business logic from ${section.name}`);
          lines.push(`        log.info("Executing ${section.name}");`);
        }
      }

      lines.push(`    }`);
      lines.push("");
    }
  } else {
    // No sections detected — generate a single execute() method
    lines.push(`    /** Main execution method — converted from ${prog.programId} */`);
    lines.push(`    public void execute() {`);
    lines.push(`        log.info("Starting ${prog.programId} execution");`);
    lines.push(`        // TODO: Implement business logic`);
    lines.push(`    }`);
    lines.push("");
    warnings.push(`[${prog.programId}] No PROCEDURE DIVISION sections detected — generated stub execute() method`);
  }

  lines.push(`}`);

  return {
    path: `${basePath}/service/${className}.java`,
    content: lines.join("\n"),
    type: "service",
  };
}

function generateApplicationClass(opts: ConversionOptions, basePath: string): GeneratedJavaFile {
  const content = `package ${opts.basePackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.batch.core.configuration.annotation.EnableBatchProcessing;

@SpringBootApplication
@EnableBatchProcessing
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`;

  return {
    path: `${basePath}/Application.java`,
    content,
    type: "config",
  };
}

function generateApplicationYml(opts: ConversionOptions, programs: CobolProgramIR[]): GeneratedJavaFile {
  const hasDb2 = programs.some(p => p.sqlStatements && p.sqlStatements.length > 0);

  const content = `spring:
  application:
    name: ${opts.projectName}
  batch:
    jdbc:
      initialize-schema: always
    job:
      enabled: false  # Jobs triggered via REST or scheduler
${hasDb2 ? `  datasource:
    url: \${DB_URL:jdbc:mysql://localhost:3306/migration}
    username: \${DB_USER:root}
    password: \${DB_PASSWORD:}
    driver-class-name: com.mysql.cj.jdbc.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: true` : ""}

logging:
  level:
    root: INFO
    ${opts.basePackage}: DEBUG
    org.springframework.batch: INFO
`;

  return {
    path: "src/main/resources/application.yml",
    content,
    type: "yaml",
  };
}

function generatePomXml(opts: ConversionOptions, programs: CobolProgramIR[]): GeneratedJavaFile {
  const hasDb2 = programs.some(p => p.sqlStatements && p.sqlStatements.length > 0);
  const hasBatch = true; // Always include batch for COBOL migrations

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>${opts.springBootVersion}</version>
    </parent>

    <groupId>${opts.basePackage}</groupId>
    <artifactId>${opts.projectName}</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <name>${opts.projectName}</name>
    <description>Migrated from COBOL — generated by Compleo v11.1</description>

    <properties>
        <java.version>${opts.javaVersion}</java.version>
    </properties>

    <dependencies>
        <!-- Spring Boot Starter -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

${hasBatch ? `        <!-- Spring Batch -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-batch</artifactId>
        </dependency>
` : ""}
${hasDb2 ? `        <!-- Database -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-jdbc</artifactId>
        </dependency>
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>
` : ""}
${opts.useLombok ? `        <!-- Lombok -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
` : ""}
        <!-- Test -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
${hasBatch ? `        <dependency>
            <groupId>org.springframework.batch</groupId>
            <artifactId>spring-batch-test</artifactId>
            <scope>test</scope>
        </dependency>
` : ""}
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
${opts.useLombok ? `                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
` : ""}
            </plugin>
        </plugins>
    </build>
</project>
`;

  return {
    path: "pom.xml",
    content,
    type: "pom",
  };
}
