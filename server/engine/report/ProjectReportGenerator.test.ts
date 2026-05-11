/**
 * ProjectReportGenerator v13.3 — Unit Tests
 * 5 tests: status computation, full generation, fallback, pipeline error, artifacts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectReportGenerator, computeStatus, type ReportInput } from "./ProjectReportGenerator";

// Mock the LLM adapter to avoid real API calls
vi.mock("../ml/llm-adapter", () => ({
  llmGenerateJSON: vi.fn().mockResolvedValue(null),
  llmGenerate: vi.fn().mockResolvedValue(null),
  isLLMAvailable: vi.fn().mockResolvedValue(false),
}));

// Mock fs for template loading
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    readFileSync: (path: string, encoding: string) => {
      if (path.includes("project-report.html.template")) {
        // Minimal template for testing
        return `<!DOCTYPE html>
<html>
<head><title>{{projectName}} · COMPLEO</title></head>
<body>
<div class="status-dot {{statusDotClass}}"></div>
<span class="pill {{statusPillClass}}">{{statusPillText}}</span>
<div class="synthesis">{{synthesisTitle}}</div>
<div class="kpi-files">{{kpiFilesProcessed}}</div>
<div class="kpi-lines">{{kpiLinesGenerated}}</div>
<div class="kpi-compile">{{kpiCompileValue}}</div>
<div class="duration">{{pipelineDuration}}</div>
{{#each transformCards}}
<div class="transform-card" data-category="{{category}}">{{title}} ({{occurrences}})</div>
{{/each}}
{{#if hasTodos}}
<div class="todo-section">{{todoCountText}}</div>
{{#each todoCards}}
<div class="todo-card">{{file}}:{{line}} — {{title}}</div>
{{/each}}
{{/if}}
{{#each decisions}}
<div class="decision">{{question}} → {{answer}}</div>
{{/each}}
{{#each filesTop}}
<div class="file-row">{{pathPrefix}}{{fileName}}</div>
{{/each}}
<div class="compile-log">{{{compileLogFormatted}}}</div>
{{#if hasPipelineError}}
<div class="pipeline-error">{{pipelineErrorStage}}: {{pipelineErrorMessage}}</div>
{{/if}}
</body>
</html>`;
      }
      return actual.readFileSync(path, encoding as any);
    },
  };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeMinimalInput(overrides?: Partial<ReportInput>): ReportInput {
  return {
    projectName: "avis-opere",
    sourcePackage: "ma.bmce.avisopere",
    targetPackage: "com.nexa.bmce.avisopere",
    projectDomain: "Gestion des avis opérés",
    ir: {
      projectName: "avis-opere",
      groupId: "com.nexa.bmce",
      artifactId: "avis-opere",
      version: "1.0.0",
      packaging: "jar",
      description: "Migration avis opéré",
      javaVersion: "17",
      dependencies: [],
      useCases: [
        { className: "AvisOpereUseCase", packageName: "ma.bmce.avisopere", methods: [], fields: [], annotations: [], jndiLookups: [], superClass: "BaseUseCase" },
        { className: "ConsultationUseCase", packageName: "ma.bmce.avisopere", methods: [], fields: [], annotations: [], jndiLookups: [], superClass: "BaseUseCase" },
      ],
      dtos: [],
      services: [{ className: "AvisOpereService", packageName: "ma.bmce.avisopere", methods: [], fields: [] }],
      enums: [],
      exceptions: [],
      validators: [],
      remoteInterfaces: [{ className: "AvisOpereLocal", packageName: "ma.bmce.avisopere", methods: [], isRemote: false }],
      baseClasses: [],
      constants: null,
      bianMapping: [],
      stats: { totalFiles: 5, totalLines: 500, useCaseCount: 2, dtoCount: 0, serviceCount: 1, enumCount: 0, exceptionCount: 0, validatorCount: 0 },
      warnings: [],
      ejb2xBeans: [],
      batchJobs: [],
    } as any,
    generatedProject: {
      files: [
        { path: "src/main/java/com/nexa/AvisOpereService.java", content: "package com.nexa;\n\nimport org.springframework.stereotype.Service;\n\n@Service\npublic class AvisOpereService {\n  public void execute() {}\n}\n", category: "service" },
        { path: "src/main/java/com/nexa/AvisOpereController.java", content: "package com.nexa;\n\nimport org.springframework.web.bind.annotation.*;\n\n@RestController\npublic class AvisOpereController {\n  @PostMapping(\"/api/avis\")\n  public String handle() { return \"ok\"; }\n}\n", category: "controller" },
        { path: "pom.xml", content: "<project><modelVersion>4.0.0</modelVersion></project>", category: "config" },
      ],
      multiTechFiles: [],
    } as any,
    compilationResult: {
      status: "SUCCESS",
      finalErrors: [],
      totalAttempts: 3,
      llmStats: { successfulFixes: 5, failedFixes: 0 },
    } as any,
    durationMs: 45000,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ProjectReportGenerator v13.3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T1: computeStatus returns correct status based on compilation result", () => {
    // Ready: 0 errors, SUCCESS
    expect(computeStatus(makeMinimalInput())).toBe("Ready");

    // Near-complete: 1-4 errors
    expect(computeStatus(makeMinimalInput({
      compilationResult: { status: "PARTIAL", finalErrors: [{ file: "A.java", line: 1, column: 1, message: "err", code: "SYNTAX" }], totalAttempts: 5, llmStats: {} } as any,
    }))).toBe("Near-complete");

    // Partial: 5-30 errors
    const manyErrors = Array.from({ length: 15 }, (_, i) => ({ file: `F${i}.java`, line: 1, column: 1, message: "err", code: "SYNTAX" }));
    expect(computeStatus(makeMinimalInput({
      compilationResult: { status: "PARTIAL", finalErrors: manyErrors, totalAttempts: 5, llmStats: {} } as any,
    }))).toBe("Partial");

    // Needs-review: >30 errors
    const tooManyErrors = Array.from({ length: 50 }, (_, i) => ({ file: `F${i}.java`, line: 1, column: 1, message: "err", code: "SYNTAX" }));
    expect(computeStatus(makeMinimalInput({
      compilationResult: { status: "PARTIAL", finalErrors: tooManyErrors, totalAttempts: 5, llmStats: {} } as any,
    }))).toBe("Needs-review");

    // Pipeline-error
    expect(computeStatus(makeMinimalInput({
      pipelineError: { stage: "generation", message: "LLM timeout" },
    }))).toBe("Pipeline-error");
  });

  it("T2: generate() produces valid HTML with all sections for a successful project", async () => {
    const input = makeMinimalInput();
    const result = await ProjectReportGenerator.generate(input);

    expect(result.status).toBe("Ready");
    expect(result.html).toContain("avis-opere");
    expect(result.html).toContain("COMPLEO");
    // Should have KPIs
    expect(result.html).toContain("3"); // 3 files
    expect(result.html).toContain("PASS"); // compile PASS
    // Should have transform cards
    expect(result.html).toContain("transform-card");
    expect(result.html).toContain("@Service");
    // Should have decisions
    expect(result.html).toContain("decision");
    // Should have file rows
    expect(result.html).toContain("file-row");
    // Should have compile log
    expect(result.html).toContain("compile-log");
    expect(result.html).toContain("BUILD SUCCESS");
    // Should NOT have pipeline error
    expect(result.html).not.toContain("pipeline-error");
  });

  it("T3: generate() uses fallback content when LLM is unavailable", async () => {
    const input = makeMinimalInput();
    const result = await ProjectReportGenerator.generate(input);

    // LLM is mocked to return null, so fallback should be used
    expect(result.html).toContain("avis-opere");
    // Fallback synthesis should mention file count
    expect(result.html).toContain("3 fichiers migrés");
    // Fallback decisions should be present
    expect(result.html).toContain("@Service");
    // Status should still be correct
    expect(result.status).toBe("Ready");
  });

  it("T4: generate() handles pipeline error gracefully", async () => {
    const input = makeMinimalInput({
      pipelineError: { stage: "generation", message: "LLM timeout after 30s" },
      generatedProject: { files: [], multiTechFiles: [] } as any,
      compilationResult: null,
    });

    const result = await ProjectReportGenerator.generate(input);

    expect(result.status).toBe("Pipeline-error");
    expect(result.html).toContain("pipeline-error");
    expect(result.html).toContain("generation");
    expect(result.html).toContain("LLM timeout");
  });

  it("T5: generate() produces valid JSON artifacts", async () => {
    const input = makeMinimalInput({
      compilationResult: {
        status: "PARTIAL",
        finalErrors: [
          { file: "AvisOpereService.java", line: 10, column: 5, message: "cannot find symbol: Document", code: "UNRESOLVED_TYPE", autoFixable: false },
        ],
        totalAttempts: 5,
        llmStats: { successfulFixes: 3, failedFixes: 1 },
      } as any,
    });

    const result = await ProjectReportGenerator.generate(input);

    // Transformations JSON
    const transforms = JSON.parse(result.artifacts.transformationsJson);
    expect(transforms.version).toBe("1.0");
    expect(transforms.project).toBe("avis-opere");
    expect(transforms.transformations.length).toBeGreaterThan(0);

    // TODOs JSON
    const todos = JSON.parse(result.artifacts.todosJson);
    expect(todos.version).toBe("1.0");
    expect(todos.todos.length).toBe(1);
    expect(todos.todos[0].file).toBe("AvisOpereService.java");

    // Files manifest JSON
    const manifest = JSON.parse(result.artifacts.filesManifestJson);
    expect(manifest.version).toBe("1.0");
    expect(manifest.totalFiles).toBe(3);
    expect(manifest.files.length).toBe(3);
  });
});
