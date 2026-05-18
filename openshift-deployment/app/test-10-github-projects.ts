/**
 * Test de modernisation sur 10 projets Java legacy réels depuis GitHub.
 * Invoque CompleoEngine.analyze() + generate() sur chaque projet.
 * Produit un rapport JSON avec les résultats.
 */
import { CompleoEngine } from "./server/engine/CompleoEngine";
import * as fs from "fs";
import * as path from "path";

interface ProjectTestResult {
  projectName: string;
  githubRepo: string;
  domain: string;
  fileCount: number;
  linesOfCode: number;
  // Analysis
  analysisSuccess: boolean;
  analysisError?: string;
  technologiesDetected: string[];
  useCaseCount: number;
  dtoCount: number;
  componentCount: number;
  ambiguityCount: number;
  // Generation
  generationSuccess: boolean;
  generationError?: string;
  generatedFileCount: number;
  generatedCategories: string[];
  // Timing
  analysisTimeMs: number;
  generationTimeMs: number;
  totalTimeMs: number;
  // Quality
  compilationErrors?: number;
  multiTechFileCount: number;
  maturityScore?: any;
}

const PROJECTS = [
  {
    dir: "/tmp/test-projects/proj-01-hmis",
    name: "hmis",
    repo: "hmislk/hmis",
    domain: "Hospital Management (EJB/JPA)",
  },
  {
    dir: "/tmp/test-projects/proj-02-broadleaf",
    name: "broadleaf-commerce",
    repo: "BroadleafCommerce/BroadleafCommerce",
    domain: "E-Commerce (Spring/JPA/REST)",
  },
  {
    dir: "/tmp/test-projects/proj-03-monolith",
    name: "monolith-enterprise",
    repo: "colinbut/monolith-enterprise-application",
    domain: "Enterprise Monolith (Spring/JPA/REST)",
  },
  {
    dir: "/tmp/test-projects/proj-04-bookstore",
    name: "dukes-bookstore",
    repo: "javaee/tutorial-examples",
    domain: "Bookstore (EJB/JSF/JPA)",
  },
  {
    dir: "/tmp/test-projects/proj-05-ngbilling",
    name: "ngbilling",
    repo: "ngecom/ngbilling",
    domain: "Telecom Billing (Hibernate/JDBC)",
  },
  {
    dir: "/tmp/test-projects/proj-06-inventory",
    name: "inventory-ms",
    repo: "iamashraff/InventoryMS-JavaEE-Web",
    domain: "Inventory Management (EJB/JPA)",
  },
  {
    dir: "/tmp/test-projects/proj-07-javaee-legacy",
    name: "javaee-legacy-app",
    repo: "fabiodomingues/javaee-legacy-app-example",
    domain: "JavaEE Legacy App (EJB/JPA/Servlet)",
  },
  {
    dir: "/tmp/test-projects/proj-08-insurance",
    name: "insurance-company",
    repo: "evaldnexhipi/insuranceCompany",
    domain: "Insurance (Java EE)",
  },
  {
    dir: "/tmp/test-projects/proj-09-microservices-monolith",
    name: "microservices-monolith",
    repo: "nebrass/playing-with-java-microservices-monolith-example",
    domain: "Monolith to Microservices (Spring/JPA)",
  },
  {
    dir: "/tmp/test-projects/proj-10-jdbc-monolith",
    name: "jdbc-monolith",
    repo: "sourcegraph/training-java-monolith-refactor",
    domain: "JDBC Raw Monolith (JDBC/Derby)",
  },
];

async function loadJavaFiles(dir: string): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isFile() && entry.endsWith(".java")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      files.push({ path: entry, content });
    }
  }
  return files;
}

async function testProject(project: typeof PROJECTS[0]): Promise<ProjectTestResult> {
  const engine = new CompleoEngine();
  const result: ProjectTestResult = {
    projectName: project.name,
    githubRepo: project.repo,
    domain: project.domain,
    fileCount: 0,
    linesOfCode: 0,
    analysisSuccess: false,
    technologiesDetected: [],
    useCaseCount: 0,
    dtoCount: 0,
    componentCount: 0,
    ambiguityCount: 0,
    generationSuccess: false,
    generatedFileCount: 0,
    generatedCategories: [],
    analysisTimeMs: 0,
    generationTimeMs: 0,
    totalTimeMs: 0,
    multiTechFileCount: 0,
  };

  try {
    // Load files
    const files = await loadJavaFiles(project.dir);
    result.fileCount = files.length;
    result.linesOfCode = files.reduce((sum, f) => sum + f.content.split("\n").length, 0);

    if (files.length === 0) {
      result.analysisError = "No Java files found";
      return result;
    }

    // Analyze
    const t0 = Date.now();
    const analysis = await engine.analyze(files, { projectName: project.name });
    const t1 = Date.now();
    result.analysisTimeMs = t1 - t0;
    result.analysisSuccess = true;
    result.technologiesDetected = analysis.multiTech.technologiesDetected;
    result.useCaseCount = analysis.summary.useCaseCount;
    result.dtoCount = analysis.summary.dtoCount;
    result.componentCount = analysis.summary.componentCount;
    result.ambiguityCount = analysis.summary.ambiguityCount;
    result.multiTechFileCount = analysis.multiTech.generatedFiles.length;
    result.maturityScore = analysis.multiTech.maturityScore;

    // Generate
    const t2 = Date.now();
    const generated = await engine.generate(
      analysis.ir,
      undefined,
      analysis.ambiguities,
      analysis.multiTech.generatedFiles
    );
    const t3 = Date.now();
    result.generationTimeMs = t3 - t2;
    result.generationSuccess = true;
    result.generatedFileCount = generated.files.length + (generated.multiTechFiles?.length || 0);

    // Collect categories
    const categories = new Set<string>();
    for (const f of generated.files) {
      if (f.category) categories.add(f.category);
    }
    if (generated.multiTechFiles) {
      for (const f of generated.multiTechFiles) {
        if (f.category) categories.add(f.category);
      }
    }
    result.generatedCategories = [...categories];

    // Validate
    try {
      const validation = engine.validate(generated);
      result.compilationErrors = validation.errors.length;
    } catch {
      result.compilationErrors = -1;
    }

    result.totalTimeMs = t3 - t0;
  } catch (err: any) {
    result.analysisError = result.analysisSuccess ? undefined : err.message;
    result.generationError = result.analysisSuccess ? err.message : undefined;
    result.totalTimeMs = Date.now();
  }

  return result;
}

async function main() {
  console.log("=== Testing 10 GitHub Java Legacy Projects ===\n");
  const results: ProjectTestResult[] = [];

  for (const project of PROJECTS) {
    console.log(`\n--- Testing: ${project.name} (${project.repo}) ---`);
    try {
      const result = await testProject(project);
      results.push(result);
      console.log(`  Files: ${result.fileCount} | LOC: ${result.linesOfCode}`);
      console.log(`  Analysis: ${result.analysisSuccess ? "OK" : "FAIL"} (${result.analysisTimeMs}ms)`);
      console.log(`  Technologies: ${result.technologiesDetected.join(", ") || "none"}`);
      console.log(`  UseCases: ${result.useCaseCount} | DTOs: ${result.dtoCount} | Components: ${result.componentCount}`);
      console.log(`  Generation: ${result.generationSuccess ? "OK" : "FAIL"} (${result.generationTimeMs}ms)`);
      console.log(`  Generated files: ${result.generatedFileCount} | Categories: ${result.generatedCategories.join(", ")}`);
      if (result.compilationErrors !== undefined) {
        console.log(`  Compilation errors: ${result.compilationErrors}`);
      }
      if (result.analysisError) console.log(`  ERROR: ${result.analysisError}`);
      if (result.generationError) console.log(`  ERROR: ${result.generationError}`);
    } catch (err: any) {
      console.log(`  CRASH: ${err.message}`);
      results.push({
        projectName: project.name,
        githubRepo: project.repo,
        domain: project.domain,
        fileCount: 0,
        linesOfCode: 0,
        analysisSuccess: false,
        analysisError: `CRASH: ${err.message}`,
        technologiesDetected: [],
        useCaseCount: 0,
        dtoCount: 0,
        componentCount: 0,
        ambiguityCount: 0,
        generationSuccess: false,
        generatedFileCount: 0,
        generatedCategories: [],
        analysisTimeMs: 0,
        generationTimeMs: 0,
        totalTimeMs: 0,
        multiTechFileCount: 0,
      });
    }
  }

  // Write results
  const outputPath = "/tmp/test-10-github-results.json";
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n=== Results written to ${outputPath} ===`);

  // Summary
  const successCount = results.filter(r => r.analysisSuccess && r.generationSuccess).length;
  const analysisOnlyCount = results.filter(r => r.analysisSuccess && !r.generationSuccess).length;
  const failCount = results.filter(r => !r.analysisSuccess).length;
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total: ${results.length} | Full Success: ${successCount} | Analysis Only: ${analysisOnlyCount} | Fail: ${failCount}`);
}

main().catch(console.error);
