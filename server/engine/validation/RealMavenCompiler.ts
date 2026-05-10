/**
 * RealMavenCompiler — Real Maven compile validation for generated Spring Boot projects.
 * Executes `mvn compile -B -q -DskipTests` on the generated project.
 *
 * Architecture:
 * - Writes generated files to a temp directory
 * - Runs Maven compile with adaptive timeout
 * - Parses compiler output for errors/warnings
 * - Falls back to CompileValidator (static) if Maven/JDK unavailable
 *
 * @version 12.7
 */

import { execSync, spawnSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { validateCompilation, CompileValidationResult } from "./CompileValidator";

export interface MavenCompileError {
  file: string;
  line: number;
  column?: number;
  message: string;
  severity: "error" | "warning";
}

export interface MavenCompileResult {
  status: "PASS" | "FAIL" | "STATIC";
  exitCode: number;
  errors: MavenCompileError[];
  warnings: MavenCompileError[];
  warningCount: number;
  errorCount: number;
  durationMs: number;
  dependenciesResolved: number;
  dependenciesTotal: number;
  method: "maven" | "static";
  staticFallbackResult?: CompileValidationResult;
  rawOutput?: string;
}

interface GeneratedFile {
  path: string;
  content: string;
}

// ─── Maven availability check ────────────────────────────────────────────────

let _mavenAvailable: boolean | null = null;

function isMavenAvailable(): boolean {
  if (_mavenAvailable !== null) return _mavenAvailable;
  try {
    const result = spawnSync("mvn", ["--version"], { timeout: 10000, encoding: "utf-8" });
    _mavenAvailable = result.status === 0 && result.stdout.includes("Apache Maven");
  } catch {
    _mavenAvailable = false;
  }
  return _mavenAvailable;
}

// ─── Main compile function ───────────────────────────────────────────────────

/**
 * Compile a generated Spring Boot project using real Maven.
 * Falls back to static validation if Maven is unavailable.
 */
export function compileWithMaven(
  files: GeneratedFile[],
  options: {
    timeout?: number; // override timeout in ms
    keepTempDir?: boolean; // don't delete temp dir (for debugging)
    javaVersion?: string; // "11" | "17" | "21", default "17"
  } = {}
): MavenCompileResult {
  // Check Maven availability
  if (!isMavenAvailable()) {
    const staticResult = validateCompilation(files);
    return {
      status: "STATIC",
      exitCode: -1,
      errors: [],
      warnings: [],
      warningCount: 0,
      errorCount: 0,
      durationMs: 0,
      dependenciesResolved: 0,
      dependenciesTotal: 0,
      method: "static",
      staticFallbackResult: staticResult,
    };
  }

  const javaFiles = files.filter(f => f.path.endsWith(".java"));
  const fileCount = javaFiles.length;

  // Adaptive timeout: 60s base + 10s per 100 files
  const timeout = options.timeout || (60000 + Math.ceil(fileCount / 100) * 10000);
  const javaVersion = options.javaVersion || "17";

  // Create temp directory
  const tempDir = mkdtempSync(join(tmpdir(), "compleo-mvn-"));

  try {
    // Write all files to temp directory
    writeProjectFiles(tempDir, files, javaVersion);

    // Run Maven compile
    const startTime = Date.now();
    const mvnResult = spawnSync(
      "mvn",
      ["compile", "-B", "-q", "-DskipTests", "-Dmaven.compiler.failOnError=true"],
      {
        cwd: tempDir,
        timeout,
        encoding: "utf-8",
        env: {
          ...process.env,
          JAVA_HOME: findJavaHome(javaVersion),
          MAVEN_OPTS: "-Xmx512m -XX:+UseG1GC",
        },
      }
    );
    const durationMs = Date.now() - startTime;

    // Parse output
    const rawOutput = (mvnResult.stdout || "") + (mvnResult.stderr || "");
    const errors = parseMavenErrors(rawOutput, "error");
    const warnings = parseMavenErrors(rawOutput, "warning");
    const deps = parseDependencyResolution(rawOutput);

    const status = mvnResult.status === 0 ? "PASS" : "FAIL";

    return {
      status,
      exitCode: mvnResult.status ?? -1,
      errors,
      warnings,
      warningCount: warnings.length,
      errorCount: errors.length,
      durationMs,
      dependenciesResolved: deps.resolved,
      dependenciesTotal: deps.total,
      method: "maven",
      rawOutput: rawOutput.length > 5000 ? rawOutput.slice(-5000) : rawOutput,
    };
  } finally {
    if (!options.keepTempDir) {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }
}

// ─── File writing ────────────────────────────────────────────────────────────

function writeProjectFiles(tempDir: string, files: GeneratedFile[], javaVersion: string): void {
  // Find pom.xml in generated files
  const pomFile = files.find(f => f.path.endsWith("pom.xml"));
  const hasPom = !!pomFile;

  // Write each file
  for (const file of files) {
    const targetPath = join(tempDir, file.path);
    const dir = dirname(targetPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(targetPath, file.content, "utf-8");
  }

  // If no pom.xml, generate a minimal one
  if (!hasPom) {
    const javaFiles = files.filter(f => f.path.endsWith(".java"));
    const pom = generateMinimalPom(javaFiles, javaVersion);
    writeFileSync(join(tempDir, "pom.xml"), pom, "utf-8");
  }
}

function generateMinimalPom(javaFiles: GeneratedFile[], javaVersion: string): string {
  // Detect required dependencies from imports
  const deps = detectDependencies(javaFiles);

  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
        <relativePath/>
    </parent>

    <groupId>com.compleo.generated</groupId>
    <artifactId>modernized-app</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>jar</packaging>

    <properties>
        <java.version>${javaVersion}</java.version>
        <maven.compiler.source>${javaVersion}</maven.compiler.source>
        <maven.compiler.target>${javaVersion}</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
${deps.has("jpa") ? `        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
` : ""}${deps.has("validation") ? `        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
` : ""}${deps.has("kafka") ? `        <dependency>
            <groupId>org.springframework.kafka</groupId>
            <artifactId>spring-kafka</artifactId>
        </dependency>
` : ""}${deps.has("jms") ? `        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-activemq</artifactId>
        </dependency>
` : ""}${deps.has("security") ? `        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
` : ""}${deps.has("lombok") ? `        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
` : ""}${deps.has("swagger") ? `        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>2.3.0</version>
        </dependency>
` : ""}        <dependency>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-api</artifactId>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>runtime</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
`;
}

function detectDependencies(javaFiles: GeneratedFile[]): Set<string> {
  const deps = new Set<string>();
  const allContent = javaFiles.map(f => f.content).join("\n");

  if (/import\s+.*javax\.persistence|import\s+.*jakarta\.persistence|@Entity|@Repository/.test(allContent)) {
    deps.add("jpa");
  }
  if (/import\s+.*javax\.validation|import\s+.*jakarta\.validation|@Valid|@NotNull|@NotBlank/.test(allContent)) {
    deps.add("validation");
  }
  if (/import\s+.*kafka|@KafkaListener|KafkaTemplate/.test(allContent)) {
    deps.add("kafka");
  }
  if (/import\s+.*jms|@JmsListener|JmsTemplate/.test(allContent)) {
    deps.add("jms");
  }
  if (/import\s+.*security|@PreAuthorize|@Secured/.test(allContent)) {
    deps.add("security");
  }
  if (/import\s+lombok|@Data|@Builder|@Getter|@Setter|@Slf4j/.test(allContent)) {
    deps.add("lombok");
  }
  if (/import\s+.*swagger|import\s+.*springdoc|@Api|@Operation/.test(allContent)) {
    deps.add("swagger");
  }

  return deps;
}

// ─── Maven output parsing ────────────────────────────────────────────────────

function parseMavenErrors(output: string, severity: "error" | "warning"): MavenCompileError[] {
  const results: MavenCompileError[] = [];
  const lines = output.split("\n");

  // Pattern: [ERROR] /path/to/File.java:[line,col] error: message
  // Pattern: [WARNING] /path/to/File.java:[line,col] warning: message
  const tag = severity === "error" ? "ERROR" : "WARNING";
  const regex = new RegExp(
    `\\[${tag}\\]\\s*(?:\\/[^:]+\\/)?([\\w/]+\\.java):\\[(\\d+),(\\d+)\\]\\s*(?:error|warning)?:?\\s*(.+)`,
    "i"
  );

  // Also match simpler format: [ERROR] File.java:[line] message
  const simpleRegex = new RegExp(
    `\\[${tag}\\]\\s*(?:\\/[^:]+\\/)?([\\w/]+\\.java):\\[(\\d+)\\]\\s*(.+)`,
    "i"
  );

  // Also match javac-style: File.java:line: error: message
  const javacRegex = /([^\s:]+\.java):(\d+):(?:\d+:)?\s*(?:error|warning):\s*(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match = line.match(regex);
    if (match) {
      let msg = match[4].trim();
      // Look ahead for "symbol:" detail line (Maven multi-line error)
      if (msg === 'cannot find symbol') {
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const symbolMatch = lines[j].match(/symbol:\s*(.+)/i);
          if (symbolMatch) {
            msg = `cannot find symbol - ${symbolMatch[1].trim()}`;
            break;
          }
        }
      }
      results.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        message: msg,
        severity,
      });
      continue;
    }

    match = line.match(simpleRegex);
    if (match) {
      let msg = match[3].trim();
      if (msg === 'cannot find symbol') {
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const symbolMatch = lines[j].match(/symbol:\s*(.+)/i);
          if (symbolMatch) {
            msg = `cannot find symbol - ${symbolMatch[1].trim()}`;
            break;
          }
        }
      }
      results.push({
        file: match[1],
        line: parseInt(match[2]),
        message: msg,
        severity,
      });
      continue;
    }

    if (severity === "error") {
      match = line.match(javacRegex);
      if (match) {
        let msg = match[3].trim();
        if (msg === 'cannot find symbol') {
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const symbolMatch = lines[j].match(/symbol:\s*(.+)/i);
            if (symbolMatch) {
              msg = `cannot find symbol - ${symbolMatch[1].trim()}`;
              break;
            }
          }
        }
        results.push({
          file: match[1],
          line: parseInt(match[2]),
          message: msg,
          severity,
        });
      }
    }
  }

  return results;
}

function parseDependencyResolution(output: string): { resolved: number; total: number } {
  // Count "Downloaded from" or "Downloading from" lines
  const downloaded = (output.match(/Downloaded from/g) || []).length;
  const downloading = (output.match(/Downloading from/g) || []).length;
  const total = Math.max(downloaded, downloading);

  return { resolved: downloaded, total: total || downloaded };
}

// ─── Java Home detection ─────────────────────────────────────────────────────

function findJavaHome(version: string): string {
  // Try common paths
  const candidates = [
    `/usr/lib/jvm/java-${version}-openjdk-amd64`,
    `/usr/lib/jvm/java-${version}-openjdk`,
    `/usr/lib/jvm/temurin-${version}-jdk-amd64`,
    `/usr/lib/jvm/java-${version}`,
    `/usr/java/jdk-${version}`,
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Fallback: use JAVA_HOME env or detect
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;

  try {
    const result = spawnSync("java", ["-XshowSettings:properties", "-version"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    const output = result.stderr || result.stdout || "";
    const homeMatch = output.match(/java\.home\s*=\s*(.+)/);
    if (homeMatch) return homeMatch[1].trim().replace(/\/jre$/, "");
  } catch {}

  return `/usr/lib/jvm/java-${version}-openjdk-amd64`;
}

// ─── Report generation ───────────────────────────────────────────────────────

/**
 * Generate a Build Validation section for MIGRATION_REPORT.md
 */
export function generateBuildValidationReport(result: MavenCompileResult): string {
  const statusIcon = result.status === "PASS" ? "✅" : result.status === "FAIL" ? "❌" : "⚠️";
  const methodLabel = result.method === "maven" ? "real mvn compile" : "static analysis (Maven indispo)";

  let report = `## Build Validation\n\n`;
  report += `| Métrique | Valeur |\n|---|---|\n`;
  report += `| Status | ${statusIcon} ${result.status} (${methodLabel}) |\n`;
  report += `| Compile time | ${(result.durationMs / 1000).toFixed(1)}s |\n`;
  report += `| Errors | ${result.errorCount} |\n`;
  report += `| Warnings | result.warningCount} |\n`;

  if (result.method === "maven") {
    report += `| Dependencies resolved | ${result.dependenciesResolved}/${result.dependenciesTotal} |\n`;
  }
  report += `\n`;

  if (result.status === "FAIL" && result.errors.length > 0) {
    report += `### Top Compile Errors\n\n`;
    report += `| # | File | Line | Message |\n|---|---|---|---|\n`;
    const topErrors = result.errors.slice(0, 10);
    topErrors.forEach((err, i) => {
      report += `| ${i + 1} | \`${err.file}\` | ${err.line} | ${err.message} |\n`;
    });
    if (result.errors.length > 10) {
      report += `\n*... et ${result.errors.length - 10} erreurs supplémentaires*\n`;
    }
    report += `\n`;
  }

  if (result.status === "STATIC" && result.staticFallbackResult) {
    const sr = result.staticFallbackResult;
    report += `### Static Validation (Fallback)\n\n`;
    report += `| Métrique | Valeur |\n|---|---|\n`;
    report += `| Score | ${sr.score}/100 |\n`;
    report += `| Files checked | ${sr.stats.filesChecked} |\n`;
    report += `| Imports resolved | ${sr.stats.importsResolved}/${sr.stats.importsResolved + sr.stats.importsUnresolved} |\n`;
    report += `| Brace errors | ${sr.stats.braceErrors} |\n`;
    report += `\n`;
  }

  return report;
}
