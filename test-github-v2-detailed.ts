/**
 * Test détaillé des 10 projets bancaires GitHub (batch v2) — moteur v12.3.
 * Capture complète pour rapport ultra-détaillé.
 * v12.1: Inclut PostGenerationMigrator pour remplacer les TODOs par du code migré.
 * v12.2: LLM activé par défaut + inférence entités JDBC.
 * v12.3: ServletBodySplitter + DtoFieldMapper + @Remote resolution enrichie.
 */
import * as fs from "fs";
import * as path from "path";
import { CompleoEngine, SourceFile, GeneratedProject } from "./server/engine/CompleoEngine";
import { DynamicOptionsResolver } from "./server/engine/frontend/DynamicOptionsResolver";
import { detectSagaCandidates } from "./server/engine/saga/saga-detector";
import { runPostGenerationMigration, type PostMigrationStats } from "./server/engine/migration/PostGenerationMigrator";

const BASE_DIR = "/tmp/banking-test-v2";
const OUTPUT_FILE = "/tmp/github-v2-detailed-results.json";

interface DetailedResult {
  projectName: string;
  domain: string;
  description: string;
  source: string;
  inputFiles: Array<{ name: string; linesOfCode: number }>;
  totalInputLOC: number;
  totalInputFiles: number;
  analysisSuccess: boolean;
  analysisError?: string;
  detectedTechnologies: string[];
  detectedUseCases: number;
  detectedEntities: string[];
  detectedDTOs: string[];
  useCaseDetails: any[];
  generationSuccess: boolean;
  generationError?: string;
  generatedFiles: Array<{ path: string; category: string; linesOfCode: number; contentPreview: string }>;
  totalGeneratedFiles: number;
  totalGeneratedLOC: number;
  maturityScore: number;
  maturityDimensions: any;
  todos: string[];
  warnings: string[];
  frontendProposed: boolean;
  sagaProposed: boolean;
  sagaCandidatesCount: number;
  sagaCandidates: any[];
  optionsProposed: string[];
  microservicesCount: number;
  migrationReport: string;
  postMigrationStats: PostMigrationStats | null;
  analysisTimeMs: number;
  generationTimeMs: number;
  totalTimeMs: number;
  beforeAfterSamples: Array<{
    beforeFile: string;
    beforeSnippet: string;
    afterFile: string;
    afterSnippet: string;
    transformation: string;
  }>;
}

async function testProject(projectDir: string): Promise<DetailedResult> {
  const metaFile = path.join(projectDir, "project-info.json");
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf-8"));

  // Read input files
  const javaFileNames = fs.readdirSync(projectDir).filter(f => f.endsWith(".java"));
  const sourceFiles: SourceFile[] = javaFileNames.map(f => ({
    path: f,
    content: fs.readFileSync(path.join(projectDir, f), "utf-8")
  }));

  const inputFiles = sourceFiles.map(f => ({
    name: f.path,
    linesOfCode: f.content.split("\n").length
  }));
  const totalInputLOC = inputFiles.reduce((sum, f) => sum + f.linesOfCode, 0);

  const result: DetailedResult = {
    projectName: meta.name,
    domain: meta.domain,
    description: meta.description,
    source: meta.source || "",
    inputFiles,
    totalInputFiles: inputFiles.length,
    totalInputLOC,
    analysisSuccess: false,
    detectedTechnologies: [],
    detectedUseCases: 0,
    detectedEntities: [],
    detectedDTOs: [],
    useCaseDetails: [],
    generationSuccess: false,
    generatedFiles: [],
    totalGeneratedFiles: 0,
    totalGeneratedLOC: 0,
    maturityScore: 0,
    maturityDimensions: null,
    todos: [],
    warnings: [],
    frontendProposed: false,
    sagaProposed: false,
    sagaCandidatesCount: 0,
    sagaCandidates: [],
    optionsProposed: [],
    microservicesCount: 0,
    migrationReport: "",
    postMigrationStats: null,
    analysisTimeMs: 0,
    generationTimeMs: 0,
    totalTimeMs: 0,
    beforeAfterSamples: [],
  };

  const engine = new CompleoEngine();

  // ANALYSIS
  const t0 = Date.now();
  try {
    const analysis = await engine.analyze(sourceFiles, { projectName: meta.name });
    result.analysisTimeMs = Date.now() - t0;
    result.analysisSuccess = true;

    result.detectedTechnologies = analysis.multiTech?.technologiesDetected || [];
    result.detectedUseCases = analysis.summary?.useCaseCount || 0;
    result.detectedDTOs = (analysis.detectedDTOs || []).map((d: any) => d.name || d.className || String(d));
    result.detectedEntities = (analysis.detectedEntities || []).map((e: any) => e.name || e.className || String(e));

    result.useCaseDetails = (analysis.ir?.useCases || []).map((uc: any) => ({
      name: uc.name || uc.className,
      type: uc.type || uc.category,
      operations: (uc.operations || uc.methods || []).map((op: any) => op.name || op)
    }));

    // DynamicOptionsResolver
    const resolver = new DynamicOptionsResolver();
    const resolvedOptions = resolver.resolve({
      technologiesDetected: (analysis.multiTech?.technologiesDetected || []) as any,
      detectedComponents: (analysis.multiTech?.detectedComponents || []) as any,
      aiInsights: analysis.aiInsights || null,
      sourceFiles: sourceFiles.map(f => ({ path: f.path, content: f.content })),
      classNames: (analysis.ir?.useCases || []).map((uc: any) => uc.className),
      domainCount: 1,
    });
    result.frontendProposed = resolvedOptions.options.some((o: any) => o.id === "frontend");
    result.sagaProposed = resolvedOptions.options.some((o: any) => o.id === "saga");
    result.optionsProposed = resolvedOptions.options.map((o: any) => o.id);

    // Saga candidates
    const sagaCandidates = detectSagaCandidates(analysis.ir);
    result.sagaCandidatesCount = sagaCandidates.length;
    result.sagaCandidates = sagaCandidates.map(c => ({
      className: c.className,
      domain: c.domain,
      deps: c.interServiceCount,
      writeOps: c.writeOperations.length
    }));

    // Maturity score
    if (analysis.multiTech?.maturityScore) {
      result.maturityScore = analysis.multiTech.maturityScore.global || 0;
      result.maturityDimensions = analysis.multiTech.maturityScore.dimensions || null;
    }

    // GENERATION
    const t1 = Date.now();
    try {
      const generated = await engine.generate(
        analysis.ir,
        undefined,
        analysis.ambiguities,
        analysis.multiTech?.generatedFiles
      );
      result.generationTimeMs = Date.now() - t1;
      result.generationSuccess = true;

      // Collect all generated files
      const allGenFiles: Array<{ path: string; category: string; linesOfCode: number; contentPreview: string }> = [];

      if (generated.files) {
        for (const gf of generated.files) {
          const content = gf.content || "";
          const loc = content.split("\n").length;
          allGenFiles.push({
            path: gf.path || gf.name || "unknown",
            category: categorizeFile(gf.path || gf.name || ""),
            linesOfCode: loc,
            contentPreview: content.substring(0, 800)
          });
        }
      }

      if (generated.multiTechFiles && Array.isArray(generated.multiTechFiles)) {
        for (const gf of generated.multiTechFiles) {
          const content = gf.content || "";
          const loc = content.split("\n").length;
          allGenFiles.push({
            path: gf.path || (gf as any).name || "unknown",
            category: "multitech/" + categorizeFile(gf.path || ""),
            linesOfCode: loc,
            contentPreview: content.substring(0, 800)
          });
        }
      }

      result.generatedFiles = allGenFiles;
      result.totalGeneratedFiles = allGenFiles.length;
      result.totalGeneratedLOC = allGenFiles.reduce((sum, f) => sum + f.linesOfCode, 0);

      // Extract ALL TODOs from full content
      const todos: string[] = [];
      const allFiles = [...(generated.files || []), ...(generated.multiTechFiles || [])];
      for (const gf of allFiles) {
        const content = gf.content || "";
        const allTodos = content.match(/\/\/\s*TODO[:\s].*/g);
        if (allTodos) {
          for (const t of allTodos) {
            const entry = `[${gf.path || (gf as any).name}] ${t.trim()}`;
            if (!todos.includes(entry)) todos.push(entry);
          }
        }
      }
      result.todos = todos;

      // v12.3: Post-generation migration (replace TODOs with migrated code)
      // Inject raw source files into IR so PostGenerationMigrator can resolve Servlet/DTO bodies
      (analysis.ir as any)._rawFiles = sourceFiles.map(f => ({ path: f.path, content: f.content }));
      try {
        const postMigStats = await runPostGenerationMigration(
          [...(generated.files || []), ...(generated.multiTechFiles || [])],
          analysis.ir,
          { maxMethodsPerRun: 50, skipLLM: false } // v12.3: LLM + Servlet + DTO + @Remote
        );
        result.postMigrationStats = postMigStats;
      } catch (postMigErr: any) {
        result.postMigrationStats = { totalTodosFound: 0, todosReplaced: 0, todosByLLM: 0, todosByRules: 0, todosByServletSplitter: 0, todosByDtoMapper: 0, todosByRemoteResolution: 0, todosKept: 0, totalTimeMs: 0 };
      }

      // Re-count TODOs after post-migration
      // Warnings
      result.warnings = generated.warnings || [];

      // Migration report
      result.migrationReport = generated.migrationReport || "";

      // Microservices count
      const msNames = new Set<string>();
      for (const gf of allGenFiles) {
        const match = gf.path.match(/microservices?\/([^/]+)/i);
        if (match) msNames.add(match[1]);
      }
      result.microservicesCount = msNames.size;

      // Before/After samples
      result.beforeAfterSamples = generateBeforeAfterSamples(sourceFiles, generated);

    } catch (genErr: any) {
      result.generationTimeMs = Date.now() - t1;
      result.generationError = genErr.message || String(genErr);
    }
  } catch (anaErr: any) {
    result.analysisTimeMs = Date.now() - t0;
    result.analysisError = anaErr.message || String(anaErr);
  }

  result.totalTimeMs = result.analysisTimeMs + result.generationTimeMs;
  return result;
}

function generateBeforeAfterSamples(sourceFiles: SourceFile[], generated: GeneratedProject): DetailedResult["beforeAfterSamples"] {
  const samples: DetailedResult["beforeAfterSamples"] = [];

  for (const src of sourceFiles) {
    const baseName = src.path.replace(".java", "");

    // Entity → Repository/Service
    if (src.content.includes("@Entity")) {
      const repoFile = generated.files?.find(f =>
        (f.path || f.name || "").includes(baseName.replace("Entity", "") + "Repository") ||
        (f.path || f.name || "").includes(baseName + "Repository")
      );
      if (repoFile) {
        samples.push({
          beforeFile: src.path,
          beforeSnippet: extractRelevantSnippet(src.content, "@Entity"),
          afterFile: repoFile.path || repoFile.name || "",
          afterSnippet: (repoFile.content || "").substring(0, 600),
          transformation: "Entity JPA → Spring Data Repository"
        });
      }
    }

    // EJB Bean → Spring Service
    if (src.content.includes("@Stateless") || src.content.includes("@Stateful")) {
      const svcFile = generated.files?.find(f =>
        (f.path || f.name || "").includes("Service") &&
        (f.path || f.name || "").toLowerCase().includes(baseName.replace("Bean", "").replace("Service", "").toLowerCase())
      );
      if (svcFile) {
        samples.push({
          beforeFile: src.path,
          beforeSnippet: extractRelevantSnippet(src.content, "@Stateless") || extractRelevantSnippet(src.content, "@Stateful"),
          afterFile: svcFile.path || svcFile.name || "",
          afterSnippet: (svcFile.content || "").substring(0, 600),
          transformation: "EJB @Stateless → Spring @Service + @Transactional"
        });
      }
    }

    // Servlet → REST Controller
    if (src.content.includes("@WebServlet") || src.content.includes("HttpServlet")) {
      const ctrlFile = generated.files?.find(f =>
        (f.path || f.name || "").includes("Controller")
      );
      if (ctrlFile) {
        samples.push({
          beforeFile: src.path,
          beforeSnippet: extractRelevantSnippet(src.content, "HttpServlet") || extractRelevantSnippet(src.content, "@WebServlet"),
          afterFile: ctrlFile.path || ctrlFile.name || "",
          afterSnippet: (ctrlFile.content || "").substring(0, 600),
          transformation: "Servlet → Spring REST Controller"
        });
      }
    }

    // JDBC → JPA Repository
    if (src.content.includes("DriverManager") || src.content.includes("PreparedStatement")) {
      const repoFile = generated.files?.find(f =>
        (f.path || f.name || "").includes("Repository")
      );
      if (repoFile) {
        samples.push({
          beforeFile: src.path,
          beforeSnippet: extractRelevantSnippet(src.content, "PreparedStatement") || extractRelevantSnippet(src.content, "DriverManager"),
          afterFile: repoFile.path || repoFile.name || "",
          afterSnippet: (repoFile.content || "").substring(0, 600),
          transformation: "JDBC raw → Spring Data JPA Repository"
        });
      }
    }

    // Hibernate Session → JPA EntityManager
    if (src.content.includes("SessionFactory") || src.content.includes("session.save") || src.content.includes("session.get")) {
      const repoFile = generated.files?.find(f =>
        (f.path || f.name || "").includes("Repository") || (f.path || f.name || "").includes("Service")
      );
      if (repoFile && !samples.some(s => s.afterFile === (repoFile.path || repoFile.name))) {
        samples.push({
          beforeFile: src.path,
          beforeSnippet: extractRelevantSnippet(src.content, "SessionFactory") || extractRelevantSnippet(src.content, "session."),
          afterFile: repoFile.path || repoFile.name || "",
          afterSnippet: (repoFile.content || "").substring(0, 600),
          transformation: "Hibernate Session → Spring Data JPA"
        });
      }
    }
  }

  return samples.slice(0, 8); // Max 8 samples per project
}

function extractRelevantSnippet(content: string, marker: string): string {
  const lines = content.split("\n");
  const idx = lines.findIndex(l => l.includes(marker));
  if (idx === -1) return content.substring(0, 400);
  const start = Math.max(0, idx - 2);
  const end = Math.min(lines.length, idx + 18);
  return lines.slice(start, end).join("\n");
}

function categorizeFile(filePath: string): string {
  if (filePath.includes("Controller") || filePath.includes("controller")) return "controller";
  if (filePath.includes("Service") || filePath.includes("service")) return "service";
  if (filePath.includes("Repository") || filePath.includes("repository")) return "repository";
  if (filePath.includes("Entity") || filePath.includes("entity") || filePath.includes("model")) return "entity";
  if (filePath.includes("DTO") || filePath.includes("dto")) return "dto";
  if (filePath.includes("Config") || filePath.includes("config")) return "config";
  if (filePath.includes("Test") || filePath.includes("test") || filePath.includes("spec")) return "test";
  if (filePath.includes("Docker") || filePath.includes("docker")) return "docker";
  if (filePath.includes("frontend") || filePath.includes(".tsx") || filePath.includes(".vue")) return "frontend";
  if (filePath.includes("saga") || filePath.includes("Saga")) return "saga";
  if (filePath.includes("application") || filePath.includes("pom") || filePath.includes("build")) return "build";
  if (filePath.includes("migration") || filePath.includes("Migration")) return "migration-report";
  return "other";
}

async function main() {
   console.log("=== Test détaillé des 10 projets bancaires GitHub (batch v2) — moteur v12.2 ===");;

  const projectDirs = fs.readdirSync(BASE_DIR)
    .filter(d => d.startsWith("proj-"))
    .sort()
    .map(d => path.join(BASE_DIR, d));

  const results: DetailedResult[] = [];

  for (const dir of projectDirs) {
    const projName = path.basename(dir);
    process.stdout.write(`Testing: ${projName}...`);
    try {
      const result = await testProject(dir);
      results.push(result);
      console.log(` ✓ ${result.analysisSuccess?"OK":"FAIL"}→${result.generationSuccess?"OK":"FAIL"} Files:${result.totalInputFiles}→${result.totalGeneratedFiles} LOC:${result.totalInputLOC}→${result.totalGeneratedLOC} Score:${result.maturityScore} TODOs:${result.todos.length} Techs:[${result.detectedTechnologies.join(",")}] Saga:${result.sagaCandidatesCount} Frontend:${result.frontendProposed}`);
    } catch (err: any) {
      console.log(` ✗ ERROR: ${err.message}`);
      results.push({
        projectName: projName,
        domain: "unknown",
        description: "Error",
        source: "",
        inputFiles: [],
        totalInputFiles: 0,
        totalInputLOC: 0,
        analysisSuccess: false,
        analysisError: err.message,
        detectedTechnologies: [],
        detectedUseCases: 0,
        detectedEntities: [],
        detectedDTOs: [],
        useCaseDetails: [],
        generationSuccess: false,
        generatedFiles: [],
        totalGeneratedFiles: 0,
        totalGeneratedLOC: 0,
        maturityScore: 0,
        maturityDimensions: null,
        todos: [],
        warnings: [],
        frontendProposed: false,
        sagaProposed: false,
        sagaCandidatesCount: 0,
        sagaCandidates: [],
        optionsProposed: [],
        microservicesCount: 0,
        migrationReport: "",
        analysisTimeMs: 0,
        generationTimeMs: 0,
        totalTimeMs: 0,
        beforeAfterSamples: [],
      });
    }
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Total projects: ${results.length}`);
  console.log(`Analysis success: ${results.filter(r => r.analysisSuccess).length}/${results.length}`);
  console.log(`Generation success: ${results.filter(r => r.generationSuccess).length}/${results.length}`);
  console.log(`Total input LOC: ${results.reduce((s, r) => s + r.totalInputLOC, 0)}`);
  console.log(`Total generated LOC: ${results.reduce((s, r) => s + r.totalGeneratedLOC, 0)}`);
  console.log(`Total TODOs: ${results.reduce((s, r) => s + r.todos.length, 0)}`);
  console.log(`Avg score: ${Math.round(results.reduce((s, r) => s + r.maturityScore, 0) / results.length)}`);
  console.log(`Frontend proposed: ${results.filter(r => r.frontendProposed).length}/${results.length}`);
  console.log(`Saga proposed: ${results.filter(r => r.sagaProposed).length}/${results.length}`);
  console.log(`Saga candidates: ${results.reduce((s, r) => s + r.sagaCandidatesCount, 0)} total`);

  // Write full results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nFull results written to: ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
