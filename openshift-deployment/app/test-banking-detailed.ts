/**
 * Test détaillé des 10 projets bancaires — capture complète pour rapport.
 */
import * as fs from "fs";
import * as path from "path";
import { CompleoEngine, SourceFile, GeneratedProject } from "./server/engine/CompleoEngine";
import { DynamicOptionsResolver } from "./server/engine/frontend/DynamicOptionsResolver";
import { detectSagaCandidates } from "./server/engine/saga/saga-detector";

const BASE_DIR = "/tmp/banking-projects";
const OUTPUT_FILE = "/tmp/banking-test-detailed-results.json";

interface DetailedResult {
  projectName: string;
  domain: string;
  description: string;
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
  todos: string[];
  warnings: string[];
  frontendGenerated: boolean;
  sagaGenerated: boolean;
  microservicesCount: number;
  migrationReport: string;
  analysisTimeMs: number;
  generationTimeMs: number;
  totalTimeMs: number;
  // Avant/Après
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

  // Read input files with path property
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
    todos: [],
    warnings: [],
    frontendGenerated: false,
    sagaGenerated: false,
    microservicesCount: 0,
    migrationReport: "",
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

    // Extract info from analysis
    result.detectedTechnologies = analysis.multiTech?.technologiesDetected || [];
    result.detectedUseCases = analysis.summary?.useCaseCount || 0;
    result.detectedDTOs = (analysis.detectedDTOs || []).map((d: any) => d.name || d.className || String(d));
    result.detectedEntities = (analysis.detectedEntities || []).map((e: any) => e.name || e.className || String(e));

    // Use case details
    result.useCaseDetails = (analysis.ir?.useCases || []).map((uc: any) => ({
      name: uc.name || uc.className,
      type: uc.type || uc.category,
      operations: (uc.operations || uc.methods || []).map((op: any) => op.name || op)
    }));

    // v11.9: Check if frontend option is proposed via DynamicOptionsResolver
    const resolver = new DynamicOptionsResolver();
    const resolvedOptions = resolver.resolve({
      technologiesDetected: (analysis.multiTech?.technologiesDetected || []) as any,
      detectedComponents: (analysis.multiTech?.detectedComponents || []) as any,
      aiInsights: analysis.aiInsights || null,
      sourceFiles: sourceFiles.map(f => ({ path: f.path, content: f.content })),
      classNames: (analysis.ir?.useCases || []).map((uc: any) => uc.className),
      domainCount: 1,
    });
    (result as any).frontendProposed = resolvedOptions.options.some((o: any) => o.id === "frontend");
    (result as any).sagaProposed = resolvedOptions.options.some((o: any) => o.id === "saga");
    (result as any).optionsProposed = resolvedOptions.options.map((o: any) => o.id);

    // v11.9: Check saga candidates via saga-detector
    const sagaCandidates = detectSagaCandidates(analysis.ir);
    (result as any).sagaCandidatesCount = sagaCandidates.length;
    (result as any).sagaCandidates = sagaCandidates.map(c => ({ className: c.className, domain: c.domain, deps: c.interServiceCount, writeOps: c.writeOperations.length }));

    // Maturity score
    if (analysis.multiTech?.maturityScore) {
      result.maturityScore = analysis.multiTech.maturityScore.global || 0;
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

      // EJB pipeline files
      if (generated.files) {
        for (const gf of generated.files) {
          const content = gf.content || "";
          const loc = content.split("\n").length;
          allGenFiles.push({
            path: gf.path || gf.name || "unknown",
            category: categorizeFile(gf.path || gf.name || ""),
            linesOfCode: loc,
            contentPreview: content.substring(0, 500)
          });
        }
      }

      // Multi-tech files
      if (generated.multiTechFiles && Array.isArray(generated.multiTechFiles)) {
        for (const gf of generated.multiTechFiles) {
          const content = gf.content || "";
          const loc = content.split("\n").length;
          allGenFiles.push({
            path: gf.path || (gf as any).name || "unknown",
            category: "multitech/" + categorizeFile(gf.path || ""),
            linesOfCode: loc,
            contentPreview: content.substring(0, 500)
          });
        }
      }

      result.generatedFiles = allGenFiles;
      result.totalGeneratedFiles = allGenFiles.length;
      result.totalGeneratedLOC = allGenFiles.reduce((sum, f) => sum + f.linesOfCode, 0);

      // Extract TODOs
      const todos: string[] = [];
      for (const gf of allGenFiles) {
        const todoMatches = gf.contentPreview.match(/\/\/\s*TODO[:\s].*/g);
        if (todoMatches) {
          for (const t of todoMatches) {
            todos.push(`[${gf.path}] ${t.trim()}`);
          }
        }
      }
      // Also check full content for TODOs
      if (generated.files) {
        for (const gf of generated.files) {
          const content = gf.content || "";
          const allTodos = content.match(/\/\/\s*TODO[:\s].*/g);
          if (allTodos) {
            for (const t of allTodos) {
              const entry = `[${gf.path || gf.name}] ${t.trim()}`;
              if (!todos.includes(entry)) todos.push(entry);
            }
          }
        }
      }
      result.todos = todos;

      // Warnings
      result.warnings = generated.warnings || [];

      // Migration report
      result.migrationReport = generated.migrationReport || "";

      // Frontend check
      result.frontendGenerated = allGenFiles.some(f =>
        f.path.includes("frontend") || f.path.endsWith(".tsx") || f.path.endsWith(".vue") ||
        f.path.includes("angular") || f.path.includes("react")
      );

      // Saga check
      result.sagaGenerated = allGenFiles.some(f =>
        f.path.toLowerCase().includes("saga")
      );
      if (!result.sagaGenerated && generated.multiTechFiles) {
        result.sagaGenerated = generated.multiTechFiles.some((f: any) =>
          (f.path || "").toLowerCase().includes("saga") || (f.content || "").toLowerCase().includes("saga pattern")
        );
      }

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

  // Find matching before/after pairs
  for (const src of sourceFiles) {
    // Look for a generated file that corresponds
    const baseName = src.path.replace(".java", "");

    // Entity → Repository/Service
    if (src.content.includes("@Entity")) {
      const repoFile = generated.files?.find(f =>
        (f.path || f.name || "").includes(baseName.replace("Entity", "") + "Repository")
      );
      if (repoFile) {
        samples.push({
          beforeFile: src.path,
          beforeSnippet: extractRelevantSnippet(src.content, "@Entity"),
          afterFile: repoFile.path || repoFile.name || "",
          afterSnippet: (repoFile.content || "").substring(0, 400),
          transformation: "Entity JPA → Spring Data Repository"
        });
      }
    }

    // EJB Bean → Spring Service
    if (src.content.includes("@Stateless") || src.content.includes("@Stateful")) {
      const svcFile = generated.files?.find(f =>
        (f.path || f.name || "").includes("Service") &&
        (f.path || f.name || "").includes(baseName.replace("Bean", "").replace("Service", ""))
      );
      if (svcFile) {
        samples.push({
          beforeFile: src.path,
          beforeSnippet: extractRelevantSnippet(src.content, "@Stateless"),
          afterFile: svcFile.path || svcFile.name || "",
          afterSnippet: (svcFile.content || "").substring(0, 400),
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
          beforeSnippet: extractRelevantSnippet(src.content, "@WebServlet"),
          afterFile: ctrlFile.path || ctrlFile.name || "",
          afterSnippet: (ctrlFile.content || "").substring(0, 400),
          transformation: "Servlet → Spring REST Controller"
        });
      }
    }
  }

  return samples.slice(0, 5); // Max 5 samples per project
}

function extractRelevantSnippet(content: string, marker: string): string {
  const lines = content.split("\n");
  const idx = lines.findIndex(l => l.includes(marker));
  if (idx === -1) return content.substring(0, 300);
  const start = Math.max(0, idx - 2);
  const end = Math.min(lines.length, idx + 15);
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
  console.log("=== Test détaillé des 10 projets bancaires ===\n");

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
      console.log(` ✓ Analysis:${result.analysisSuccess?"OK":"FAIL"} Gen:${result.generationSuccess?"OK":"FAIL"} Files:${result.totalInputFiles}→${result.totalGeneratedFiles} LOC:${result.totalInputLOC}→${result.totalGeneratedLOC} Score:${result.maturityScore} TODOs:${result.todos.length} Techs:[${result.detectedTechnologies.join(",")}]`);
    } catch (err: any) {
      console.log(` ✗ ERROR: ${err.message}`);
      results.push({
        projectName: projName,
        domain: "unknown",
        description: "Error during test",
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
        todos: [],
        warnings: [],
        frontendGenerated: false,
        sagaGenerated: false,
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
  console.log(`Frontend generated: ${results.filter(r => r.frontendGenerated).length}/${results.length}`);
  console.log(`Saga generated: ${results.filter(r => r.sagaGenerated).length}/${results.length}`);

  // Write full results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nFull results written to: ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
