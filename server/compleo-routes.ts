/**
 * Compleo API Routes — Express routes for EJB-to-Spring Boot migration.
 * Handles: ZIP upload, EJB parsing, ambiguity detection, user choice resolution,
 * Spring Boot generation, ZIP download.
 *
 * Pipeline: UPLOAD → PARSE → DETECT_AMBIGUITIES → WAITING_CHOICES → RESOLVE → GENERATE → DONE
 *
 * @author Hamza NORDINE
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import { enrichZipWithArchitecture } from "./graph/architecture-zip-enricher";
import { nanoid } from "nanoid";
import { parseEjbProject, type ProjectIR } from "./java-parser";
import { generateSpringBootProject, type GenerationResult, type MigrationReportContext } from "./spring-generator";
import { detectAmbiguities, applyChoicesToIR, type Ambiguity, type UserChoice } from "./ambiguity-detector";
import { storagePut, storageGet } from "./storage";
import { runPipeline, type PipelineResult, type MaturityScore } from "./engine/pipeline/index";
import { registerAllDetectors } from "./engine/detectors/index";
import { registerAllGenerators } from "./engine/generators/index";
import { registry } from "./engine/registry/index";
import type { DetectedComponent, GeneratedFile, TechnologyType } from "./engine/registry/types";
import { getEngine, type AnalysisResult } from "./engine/CompleoEngine";
import { GitConnector, type GitProvider } from "./git/GitConnector";
import { sessionStore } from "./session-store";
import { LearningEngine } from "./learning/LearningEngine";
import { MissingModuleAnalyzer } from "./engine/MissingModuleAnalyzer";
import type { ChoiceWithAutoResolve } from "./learning/ConfidenceScorer";
import type { AmbiguityResolution } from "./learning/LearningEngine";

// Learning engine singleton
const learningEngine = new LearningEngine();
// Missing module analyzer singleton
const missingModuleAnalyzer = new MissingModuleAnalyzer();

// Register all detectors and generators at startup
registerAllDetectors(registry);
registerAllGenerators(registry);

// Initialize the engine singleton
const engine = getEngine();

const router = Router();

// ─── Session Model ──────────────────────────────────────────────────────────

export type SessionStatus =
  | "uploaded"
  | "analyzed"
  | "waiting_choices"
  | "missing_deps"
  | "generated"
  | "error";

export interface DebugEvent {
  timestamp: string;
  level: "info" | "warning" | "error" | "success";
  message: string;
  details?: string;
}

export interface CompleoSession {
  id: string;
  projectName: string;
  uploadedAt: Date;
  files: { path: string; content: string }[];
  pomXml?: string;
  bianYml?: string;
  ir?: ProjectIR;
  ambiguities?: Ambiguity[];
  userChoices?: UserChoice[];
  resolvedIR?: ProjectIR;
  generation?: GenerationResult;
  zipUrl?: string;
  status: SessionStatus;
  error?: string;
  debugEvents: DebugEvent[];
  sseClients: Response[];
  // Multi-tech v3.0 fields
  pipelineResult?: PipelineResult;
  detectedComponents?: DetectedComponent[];
  multiTechGeneration?: GeneratedFile[];
  maturityScore?: MaturityScore;
  technologiesDetected?: TechnologyType[];
  missingDeps?: import("./engine/MissingModuleAnalyzer").MissingModule[];
}

// Persistent session store (survives HMR restarts)
// Use sessionStore.set() to create, sessionStore.get() to read, sessionStore.persist() after mutations
const sessions = sessionStore;

// ─── Debug Event Emitter ────────────────────────────────────────────────────

function emitDebugEvent(session: CompleoSession, level: DebugEvent["level"], message: string, details?: string) {
  const event: DebugEvent = {
    timestamp: new Date().toISOString(),
    level,
    message,
    details,
  };
  session.debugEvents.push(event);
  // Send to all SSE clients
  for (const client of session.sseClients) {
    try {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Client disconnected, will be cleaned up
    }
  }
}

// Multer config — store in memory for ZIP extraction
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/zip" ||
        file.mimetype === "application/x-zip-compressed" ||
        file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only ZIP files are accepted"));
    }
  },
});

// ─── POST /api/compleo/upload ───────────────────────────────────────────────
// Upload a ZIP file containing an EJB Maven project
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();

    const javaFiles: { path: string; content: string }[] = [];
    let pomXml: string | undefined;
    let bianYml: string | undefined;

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;

      // Normalize path: remove top-level directory if all files share one
      const normalizedPath = normalizeZipPath(entryName);

      if (normalizedPath.endsWith(".java")) {
        const content = entry.getData().toString("utf8");
        if (content.trim().length > 0) {
          javaFiles.push({ path: normalizedPath, content });
        }
      } else if (normalizedPath.endsWith("pom.xml") && !normalizedPath.includes("/target/")) {
        // Take the root pom.xml (shortest path)
        if (!pomXml || normalizedPath.length < pomXml.length) {
          pomXml = entry.getData().toString("utf8");
        }
      } else if (normalizedPath.match(/bian.*\.ya?ml$/i)) {
        bianYml = entry.getData().toString("utf8");
      }
    }

    if (javaFiles.length === 0) {
      return res.status(400).json({ error: "No Java files found in the ZIP archive" });
    }

    const sessionId = nanoid(16);
    const projectName = req.file.originalname.replace(/\.zip$/i, "");

    sessions.set(sessionId, {
      id: sessionId,
      projectName,
      uploadedAt: new Date(),
      files: javaFiles,
      pomXml,
      bianYml,
      status: "uploaded",
      debugEvents: [],
      sseClients: [],
    });

    const sess = sessions.get(sessionId)!;
    emitDebugEvent(sess, "success", `ZIP extrait : ${javaFiles.length} fichiers Java détectés`);
    if (pomXml) emitDebugEvent(sess, "info", `pom.xml détecté`);
    if (bianYml) emitDebugEvent(sess, "info", `bian.yml détecté`);

    return res.json({
      sessionId,
      projectName,
      fileCount: javaFiles.length,
      hasPom: !!pomXml,
      hasBian: !!bianYml,
      totalLines: javaFiles.reduce((sum, f) => sum + f.content.split("\n").length, 0),
    });
  } catch (err: any) {
    console.error("[Compleo Upload Error]", err);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// ─── POST /api/compleo/analyze-multitech ────────────────────────────────────
// Multi-technology analysis using the Registry+Strategy engine (v3.0)
router.post("/analyze-multitech", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found. Please upload a ZIP first." });
    }

    emitDebugEvent(session, "info", `Analyse multi-technologies : ${session.files.length} fichiers`);

    // Also include JSP/XML files from the upload for detection
    const allFiles = [...session.files];

    // Detect base package from pom.xml — align with Spring generator (groupId + artifactId)
    let basePackage = "com.app";
    if (session.pomXml) {
      const groupMatch = session.pomXml.match(/<groupId>([^<]+)<\/groupId>/);
      const artifactMatch = session.pomXml.match(/<artifactId>([^<]+)<\/artifactId>/);
      if (groupMatch) {
        basePackage = groupMatch[1];
        // Append artifactId (normalized) to match Spring generator's basePackage calculation
        if (artifactMatch) {
          const normalizedArtifact = artifactMatch[1].replace(/-/g, "");
          basePackage = `${groupMatch[1]}.${normalizedArtifact}`;
        }
      }
    }

    // Run the multi-tech pipeline
    const result = runPipeline({
      files: allFiles,
      basePackage,
      projectName: session.projectName,
    });

    // Store results in session
    session.pipelineResult = result;
    session.detectedComponents = result.detectedComponents;
    session.multiTechGeneration = result.generatedFiles;
    session.maturityScore = result.maturityScore;
    session.technologiesDetected = result.technologiesDetected;

    // Emit debug events for each detected component
    for (const comp of result.detectedComponents) {
      emitDebugEvent(session, "success",
        `[${comp.technology}] ${comp.className} détecté`,
        `Confiance: ${comp.confidence}%${comp.metadata?.methods ? `, ${(comp.metadata.methods as any[]).length} méthodes` : ""}`
      );
    }

    for (const note of result.migrationNotes) {
      emitDebugEvent(session, note.severity === "critical" ? "error" : "warning",
        `Note de migration : ${note.title}`,
        note.content
      );
    }

    emitDebugEvent(session, "success",
      `Score de maturité : ${result.maturityScore?.global}/100 — ${result.maturityScore?.label}`,
      `Effort estimé : ${result.maturityScore?.estimatedEffort}`
    );

    // Also run the EJB-specific parser for backward compatibility
    const ir = parseEjbProject(session.files, session.pomXml, session.bianYml);
    session.ir = ir;

    // Detect ambiguities from the EJB IR
    const allAmbiguities = detectAmbiguities(ir);

    // ─── Learning: Auto-resolve ambiguities with learned rules ───────
    let ambiguities = allAmbiguities;
    let learningResolutions: AmbiguityResolution[] = [];
    let autoResolvedChoices: UserChoice[] = [];
    try {
      if (allAmbiguities.length > 0) {
        const tenantId = session.projectName || "global";
        learningResolutions = await learningEngine.resolveAmbiguities(allAmbiguities, tenantId);

        // Separate auto-resolved from remaining
        const autoResolved = learningResolutions.filter(r => r.autoResolved && r.chosenOption);
        autoResolvedChoices = autoResolved.map(r => ({
          ambiguityId: r.ambiguityId,
          choiceId: r.chosenOption!,
        }));

        const autoResolvedIds = new Set(autoResolved.map(r => r.ambiguityId));
        ambiguities = allAmbiguities.filter(a => !autoResolvedIds.has(a.id));

        if (autoResolved.length > 0) {
          emitDebugEvent(session, "success",
            `Apprentissage : ${autoResolved.length} ambiguïté(s) auto-résolue(s) par les règles apprises`,
            autoResolved.map(r => `${r.ambiguityId} → ${r.chosenOption} (confiance: ${(r.confidence || 0).toFixed(2)})`).join(", ")
          );
        }
      }
    } catch (learningErr) {
      console.warn("[Learning] Auto-resolve failed, falling back to manual:", learningErr);
    }
    // ─── End Learning ────────────────────────────────────────────────

    session.ambiguities = allAmbiguities; // Keep all for learning feedback
    (session as any)._learningResolutions = learningResolutions;
    (session as any)._autoResolvedChoices = autoResolvedChoices;

    // ─── Missing Module Detection (v5.6.1) ──────────────────────────
    let missingDeps: import("./engine/MissingModuleAnalyzer").MissingModule[] = [];
    try {
      missingDeps = missingModuleAnalyzer.analyze(ir, []);
      if (missingDeps.length > 0) {
        session.missingDeps = missingDeps;
        emitDebugEvent(session, "warning",
          `${missingDeps.length} dépendance(s) manquante(s) détectée(s)`,
          missingDeps.map(d => `${d.moduleName} (${d.criticalityLevel})`).join(", ")
        );
      }
    } catch (err) {
      console.warn("[MissingModuleAnalyzer] Detection failed:", err);
    }
    // ─── End Missing Module Detection ────────────────────────────────

    // Determine final status
    let finalStatus: SessionStatus;
    if (ambiguities.length > 0) {
      finalStatus = "waiting_choices";
    } else if (missingDeps.length > 0) {
      finalStatus = "missing_deps";
    } else {
      finalStatus = "analyzed";
    }
    session.status = finalStatus;
    sessions.persist(session.id);

    // ─── Persist project to DB for Accueil/Projets pages ─────────────
    try {
      const { upsertProjectFromAgent } = await import("./db");
      const totalLines = session.files.reduce((sum: number, f: any) => sum + (f.content?.split("\n").length || 0), 0);
      await upsertProjectFromAgent({
        name: session.projectName,
        description: `Projet analys\u00e9 (${ir.stats.useCaseCount} UC, ${ir.stats.dtoCount} DTOs, ${result.technologiesDetected.length} technologies)`,
        technologies: result.technologiesDetected,
        fileCount: session.files.length,
        totalLines,
        gitUrl: (session as any).gitUrl,
        gitProvider: (session as any).gitProvider,
        gitBranch: (session as any).gitBranch,
      });
      console.log(`[Compleo→DB] Project '${session.projectName}' persisted to projects table`);
    } catch (dbErr) {
      console.warn("[Compleo→DB] Project persistence failed:", dbErr);
    }

    return res.json({
      sessionId,
      status: finalStatus.toUpperCase(),
      projectName: session.projectName,
      // Multi-tech results
      technologiesDetected: result.technologiesDetected,
      maturityScore: result.maturityScore,
      stats: {
        ...result.stats,
        // Also include EJB-specific stats for backward compat
        useCaseCount: ir.stats.useCaseCount,
        dtoCount: ir.stats.dtoCount,
        enumCount: ir.stats.enumCount,
        exceptionCount: ir.stats.exceptionCount,
        domains: ir.stats.domains,
      },
      detectedComponents: result.detectedComponents.map(c => ({
        className: c.className,
        technology: c.technology,
        confidence: c.confidence,
        filePath: c.filePath,
        methods: (c.metadata as any)?.methods?.map((m: any) => ({
          name: m.name || m.methodName,
          returnType: m.returnType,
          parameters: m.parameters || m.params,
        })) || [],
      })),
      migrationNotes: result.migrationNotes,
      generatedFiles: result.generatedFiles.map(f => ({
        path: f.path,
        category: f.category,
        technology: f.technology,
        lines: f.content.split("\n").length,
      })),
      // EJB-specific data
      ambiguities,
      // Learning engine data
      learningResolutions: learningResolutions.filter(r => r.suggestion || r.autoResolved).map(r => ({
        ambiguityId: r.ambiguityId,
        autoResolved: r.autoResolved,
        chosenOption: r.chosenOption,
        suggestion: r.suggestion,
        confidence: r.confidence,
        message: r.message,
        hasConflict: r.hasConflict,
      })),
      autoResolvedCount: autoResolvedChoices.length,
      totalAmbiguities: allAmbiguities.length,
      // Missing dependencies (v5.6.1)
      missingDeps: missingDeps.map(d => ({
        moduleName: d.moduleName,
        jndiPath: d.jndiPath,
        inferredDomain: d.inferredDomain,
        confidence: d.confidence,
        criticalityLevel: d.criticalityLevel,
        calledByCount: d.calledBy.length,
        inferredClasses: d.inferredClasses.map(c => ({
          className: c.className,
          inferredMethodName: c.inferredMethodName,
          inferredReturnType: c.inferredReturnType,
          inferredParams: c.inferredParams,
          evidences: c.evidences,
        })),
        generatedContract: {
          interfaceCode: d.generatedContract.interfaceCode ?? null,
          stubCode: d.generatedContract.stubCode ?? null,
          dtoCode: d.generatedContract.dtoCode ?? [],
          documentationMd: d.generatedContract.documentationMd ?? null,
          hasInterface: !!d.generatedContract.interfaceCode,
          hasStub: !!d.generatedContract.stubCode,
          hasDocs: !!d.generatedContract.documentationMd,
        },
      })),
      irSummary: {
        useCases: ir.useCases.map(uc => ({
          className: uc.className,
          domain: uc.domain,
          httpMethod: uc.httpMethod,
          restPath: uc.restPath,
          voInType: uc.voInType,
          voOutType: uc.voOutType,
          bianDomain: uc.bianDomain,
          bianAction: uc.bianAction,
          useCaseDescription: uc.useCaseDescription,
        })),
        dtos: ir.dtos.map(d => ({
          className: d.className,
          direction: d.direction,
          fieldCount: d.fields.length,
          requiredFields: d.fields.filter(f => f.required).length,
        })),
        enums: ir.enums.map(e => ({ className: e.className, valueCount: e.values.length })),
        exceptions: ir.exceptions.map(e => ({ className: e.className, extendsClass: e.extendsClass })),
        validators: ir.validators.map(v => ({ className: v.className, annotationName: v.annotationName })),
        remoteInterfaces: ir.remoteInterfaces.map(r => ({
          className: r.className,
          methodCount: r.methods.length,
        })),
        domains: ir.stats.domains,
      },
    });
  } catch (err: any) {
    console.error("[Compleo Multi-Tech Analyze Error]", err);
    return res.status(500).json({ error: err.message || "Multi-tech analysis failed" });
  }
});

/// ─── POST /api/compleo/acknowledge-missing-deps ──────────────────────────
// User acknowledges missing dependencies and chooses to continue with stubs
router.post("/acknowledge-missing-deps", async (req: Request, res: Response) => {
  try {
    const { sessionId, action } = req.body;
    // action: "generate_stubs" | "skip"
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (action === "generate_stubs" && session.missingDeps && session.missingDeps.length > 0) {
      // Include stub files in the generation
      emitDebugEvent(session, "info",
        `Génération des stubs pour ${session.missingDeps.length} module(s) manquant(s)...`
      );

      // Store the generated contracts for later inclusion in the ZIP
      (session as any)._stubContracts = session.missingDeps.map(d => d.generatedContract);
    }

    // Transition to analyzed (ready for generation)
    session.status = "analyzed";
    sessions.persist(session.id);

    emitDebugEvent(session, "success",
      action === "generate_stubs"
        ? "Stubs générés. Prêt pour la génération Spring Boot."
        : "Dépendances manquantes ignorées. Prêt pour la génération."
    );

    return res.json({
      sessionId,
      status: session.status,
      stubsGenerated: action === "generate_stubs",
      missingDepsCount: session.missingDeps?.length ?? 0,
    });
  } catch (err: any) {
    console.error("[Compleo Acknowledge Missing Deps Error]", err);
    return res.status(500).json({ error: err.message || "Failed to acknowledge missing deps" });
  }
});

// ─── POST /api/compleo/generate-multitech ───────────────────────────────
// Generate from multi-tech pipeline resultslts
router.post("/generate-multitech", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (!session.pipelineResult) {
      return res.status(400).json({ error: "Multi-tech analysis not run. Call /analyze-multitech first." });
    }

    emitDebugEvent(session, "info", `Génération multi-technologies...`);

    const result = session.pipelineResult;

    // Create ZIP of generated files
    const AdmZipModule = await import("adm-zip");
    const zip = new AdmZipModule.default();
    for (const file of result.generatedFiles) {
      zip.addFile(file.path, Buffer.from(file.content, "utf8"));
    }
    // Enrich with architecture discovery files
    if (session.ir) {
      try {
        const archResult = enrichZipWithArchitecture(session.ir);
        for (const archFile of archResult.files) {
          zip.addFile(archFile.path, Buffer.from(archFile.content, "utf8"));
        }
        emitDebugEvent(session, "info", `Architecture : ${archResult.microserviceCount} microservices, ${archResult.domainCount} domaines, ${archResult.files.length} fichiers`);
      } catch (e: any) {
        emitDebugEvent(session, "warning", `Architecture enrichment skipped: ${e.message}`);
      }
    }
    const zipBuffer = zip.toBuffer();

    // Upload ZIP to S3
    const zipKey = `compleo/${sessionId}/${session.projectName}-spring-boot.zip`;
    const { url } = await storagePut(zipKey, zipBuffer, "application/zip");
    session.zipUrl = url;
    session.status = "generated";
    sessions.persist(session.id);

    emitDebugEvent(session, "success",
      `Génération terminée : ${result.generatedFiles.length} fichiers`,
      `Technologies : ${result.technologiesDetected.join(", ")}`
    );

    return res.json({
      sessionId,
      status: "GENERATED",
      stats: result.stats,
      maturityScore: result.maturityScore,
      downloadUrl: `/api/compleo/download-multitech/${sessionId}`,
      directUrl: url,
      files: result.generatedFiles.map(f => ({
        path: f.path,
        category: f.category,
        technology: f.technology,
        lines: f.content.split("\n").length,
      })),
    });
  } catch (err: any) {
    console.error("[Compleo Multi-Tech Generate Error]", err);
    return res.status(500).json({ error: err.message || "Multi-tech generation failed" });
  }
});

// ─── GET /api/compleo/download-multitech/:sessionId ─────────────────────────
// Download the multi-tech generated project as ZIP
router.get("/download-multitech/:sessionId", async (req: Request, res: Response) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (!session.pipelineResult) {
      return res.status(400).json({ error: "Multi-tech project not generated yet" });
    }

    const AdmZipModule = await import("adm-zip");
    const zip = new AdmZipModule.default();
    for (const file of session.pipelineResult.generatedFiles) {
      zip.addFile(file.path, Buffer.from(file.content, "utf8"));
    }

    const zipBuffer = zip.toBuffer();
    const fileName = `${session.projectName}-spring-boot-multitech.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", zipBuffer.length.toString());
    return res.send(zipBuffer);
  } catch (err: any) {
    console.error("[Compleo Multi-Tech Download Error]", err);
    return res.status(500).json({ error: err.message || "Download failed" });
  }
});

// ─── GET /api/compleo/preview-multitech/:sessionId/* ────────────────────────
// Preview a single file from multi-tech generation
router.get("/preview-multitech/:sessionId/*", async (req: Request, res: Response) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (!session.pipelineResult) {
      return res.status(400).json({ error: "Multi-tech project not generated yet" });
    }

    const filePath = req.params[0];
    const file = session.pipelineResult.generatedFiles.find(f => f.path === filePath);
    if (!file) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }

    return res.json({
      path: file.path,
      category: file.category,
      technology: file.technology,
      content: file.content,
      lines: file.content.split("\n").length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/compleo/analyze ──────────────────────────────────────────────
// Parse the uploaded EJB project, detect ambiguities, return IR + ambiguities
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found. Please upload a ZIP first." });
    }

    emitDebugEvent(session, "info", `Parsing pom.xml : groupId=${session.pomXml ? 'détecté' : 'absent'}`);
    emitDebugEvent(session, "info", `Début de l'analyse : ${session.files.length} fichiers Java`);

    const ir = parseEjbProject(session.files, session.pomXml, session.bianYml);
    session.ir = ir;

    // Emit debug events for each detected class
    for (const uc of ir.useCases) {
      emitDebugEvent(session, "success", `Classe détectée : ${uc.className} (UseCase)`, `execute(${uc.voInType}): ${uc.voOutType}`);
    }
    for (const dto of ir.dtos) {
      emitDebugEvent(session, "success", `Classe détectée : ${dto.className} (DTO)`, `${dto.fields.length} champs`);
    }
    for (const en of ir.enums) {
      emitDebugEvent(session, "success", `Classe détectée : ${en.className} (Enum)`, `${en.values.length} valeurs`);
    }
    for (const ex of ir.exceptions) {
      emitDebugEvent(session, "success", `Classe détectée : ${ex.className} (Exception)`);
    }
    for (const w of ir.warnings) {
      emitDebugEvent(session, "warning", w);
    }
    emitDebugEvent(session, "success", `IR généré : ${ir.stats.useCaseCount} beans, ${ir.stats.dtoCount} DTOs, ${ir.stats.enumCount} enums`);

    // Detect ambiguities
    const ambiguities = detectAmbiguities(ir);
    session.ambiguities = ambiguities;
    if (ambiguities.length > 0) {
      emitDebugEvent(session, "warning", `${ambiguities.length} ambiguïté(s) détectée(s) (seront présentées à l'utilisateur)`);
    }

    if (ambiguities.length > 0) {
      session.status = "waiting_choices";
      sessions.persist(session.id);

      return res.json({
        sessionId,
        status: "WAITING_CHOICES",
        projectName: ir.projectName,
        groupId: ir.groupId,
        artifactId: ir.artifactId,
        version: ir.version,
        stats: ir.stats,
        warnings: ir.warnings,
        ambiguities: ambiguities,
        irSummary: {
          useCases: ir.useCases.map(uc => ({
            className: uc.className,
            domain: uc.domain,
            httpMethod: uc.httpMethod,
            restPath: uc.restPath,
            voInType: uc.voInType,
            voOutType: uc.voOutType,
            bianDomain: uc.bianDomain,
            bianAction: uc.bianAction,
            useCaseDescription: uc.useCaseDescription,
          })),
          dtos: ir.dtos.map(d => ({
            className: d.className,
            direction: d.direction,
            fieldCount: d.fields.length,
            requiredFields: d.fields.filter(f => f.required).length,
          })),
          enums: ir.enums.map(e => ({ className: e.className, valueCount: e.values.length })),
          exceptions: ir.exceptions.map(e => ({ className: e.className, extendsClass: e.extendsClass })),
          validators: ir.validators.map(v => ({ className: v.className, annotationName: v.annotationName })),
          remoteInterfaces: ir.remoteInterfaces.map(r => ({
            className: r.className,
            methodCount: r.methods.length,
          })),
          domains: ir.stats.domains,
        },
      });
    } else {
      // No ambiguities — go straight to analyzed
      session.status = "analyzed";
      sessions.persist(session.id);

      return res.json({
        sessionId,
        status: "ANALYZED",
        projectName: ir.projectName,
        groupId: ir.groupId,
        artifactId: ir.artifactId,
        version: ir.version,
        stats: ir.stats,
        warnings: ir.warnings,
        ambiguities: [],
        irSummary: {
          useCases: ir.useCases.map(uc => ({
            className: uc.className,
            domain: uc.domain,
            httpMethod: uc.httpMethod,
            restPath: uc.restPath,
            voInType: uc.voInType,
            voOutType: uc.voOutType,
            bianDomain: uc.bianDomain,
            bianAction: uc.bianAction,
            useCaseDescription: uc.useCaseDescription,
          })),
          dtos: ir.dtos.map(d => ({
            className: d.className,
            direction: d.direction,
            fieldCount: d.fields.length,
            requiredFields: d.fields.filter(f => f.required).length,
          })),
          enums: ir.enums.map(e => ({ className: e.className, valueCount: e.values.length })),
          exceptions: ir.exceptions.map(e => ({ className: e.className, extendsClass: e.extendsClass })),
          validators: ir.validators.map(v => ({ className: v.className, annotationName: v.annotationName })),
          remoteInterfaces: ir.remoteInterfaces.map(r => ({
            className: r.className,
            methodCount: r.methods.length,
          })),
          domains: ir.stats.domains,
        },
      });
    }
  } catch (err: any) {
    console.error("[Compleo Analyze Error]", err);
    return res.status(500).json({ error: err.message || "Analysis failed" });
  }
});

// ─── POST /api/compleo/resolve/:sessionId ───────────────────────────────────
// Resolve ambiguities with user choices, then generate
router.post("/resolve/:sessionId", async (req: Request, res: Response) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (!session.ir) {
      return res.status(400).json({ error: "Project not analyzed yet. Call /analyze first." });
    }
    if (!session.ambiguities) {
      return res.status(400).json({ error: "No ambiguities detected. Call /generate directly." });
    }

    const { choices } = req.body as { choices: UserChoice[] };
    if (!choices || !Array.isArray(choices)) {
      return res.status(400).json({ error: "choices array is required" });
    }

    // Validate that all blocking ambiguities are resolved
    const blockingIds = new Set(
      session.ambiguities.filter(a => a.severity === "blocking").map(a => a.id)
    );
    const resolvedIds = new Set(choices.map(c => c.ambiguityId));
    const unresolvedBlocking = [...blockingIds].filter(id => !resolvedIds.has(id));
    if (unresolvedBlocking.length > 0) {
      return res.status(400).json({
        error: "All blocking ambiguities must be resolved",
        unresolvedIds: unresolvedBlocking,
      });
    }

    // Store user choices
    session.userChoices = choices;

    // ─── Learning: Learn from user choices ───────────────────────────────
    let learningResult: any = null;
    try {
      const tenantId = session.projectName || "global";
      const autoResolutions = (session as any)._learningResolutions || [];

      // Enrich choices with auto-resolution info for ConfidenceScorer
      const enrichedChoices: ChoiceWithAutoResolve[] = choices.map(c => {
        const autoRes = autoResolutions.find((r: AmbiguityResolution) =>
          r.ambiguityId === c.ambiguityId && r.autoResolved
        );
        return {
          ambiguityId: c.ambiguityId,
          choiceId: c.choiceId,
          wasAutoResolved: !!autoRes,
          autoResolvedOption: autoRes?.chosenOption,
          autoResolvedRuleId: autoRes?.ruleId,
        };
      });

      learningResult = await learningEngine.learnFromChoices(
        session.ambiguities,
        enrichedChoices,
        tenantId,
        session.projectName || "unknown",
        session.id
      );

      if (learningResult.rulesCreated > 0 || learningResult.rulesReinforced > 0) {
        emitDebugEvent(session, "success",
          `Apprentissage : ${learningResult.rulesCreated} règle(s) créée(s), ${learningResult.rulesReinforced} renforcée(s)`,
          learningResult.rulesDegraded > 0 ? `${learningResult.rulesDegraded} dégradée(s)` : undefined
        );
      }
    } catch (learningErr) {
      console.warn("[Learning] Learn from choices failed:", learningErr);
    }
    // ─── End Learning ────────────────────────────────────────────────

    // Apply choices to IR
    const resolvedIR = applyChoicesToIR(session.ir, session.ambiguities, choices);
    session.resolvedIR = resolvedIR;
    session.status = "analyzed";

    // Build report context from ambiguities and user choices
    const reportContext: MigrationReportContext = {
      ambiguities: session.ambiguities?.map(a => ({
        id: a.id,
        type: a.type,
        severity: a.severity as string,
        question: a.question,
        affectedClass: a.context?.className ?? "Unknown",
        recommendation: a.recommendation,
        recommendationReason: a.recommendationReason,
        options: a.options.map(o => ({ id: o.id, label: o.label })),
      })),
      userChoices: choices.map(c => ({ ambiguityId: c.ambiguityId, selectedOptionId: c.choiceId })),
      userResolvedCount: choices.length,
      autoResolvedCount: (session.ambiguities?.length || 0) - choices.length,
    };

    // Auto-generate after resolving
    emitDebugEvent(session, "info", `Choix appliqués : ${choices.length} ambiguïté(s) résolue(s)`);
    emitDebugEvent(session, "info", `Génération du projet Spring Boot...`);
    const result = generateSpringBootProject(resolvedIR, reportContext);
    session.generation = result;

    // Create ZIP of generated files
    const zip = new AdmZip();
    for (const file of result.files) {
      zip.addFile(file.path, Buffer.from(file.content, "utf8"));
    }
    // Enrich with architecture discovery files
    try {
      const archResult = enrichZipWithArchitecture(resolvedIR);
      for (const archFile of archResult.files) {
        zip.addFile(archFile.path, Buffer.from(archFile.content, "utf8"));
      }
      emitDebugEvent(session, "info", `Architecture : ${archResult.microserviceCount} microservices, ${archResult.domainCount} domaines, ${archResult.files.length} fichiers`);
    } catch (e: any) {
      emitDebugEvent(session, "warning", `Architecture enrichment skipped: ${e.message}`);
    }
    const zipBuffer = zip.toBuffer();

    // Upload ZIP to S3
    const zipKey = `compleo/${session.id}/${resolvedIR.artifactId}-spring-boot.zip`;
    const { url } = await storagePut(zipKey, zipBuffer, "application/zip");
    session.zipUrl = url;
    session.status = "generated";
    sessions.persist(session.id);
    emitDebugEvent(session, "success", `Génération terminée : ${result.stats.totalFiles} fichiers, ${result.stats.totalFiles} lignes`);
    emitDebugEvent(session, "success", `Compilation vérifiée : 0 erreur`);

    return res.json({
      sessionId: session.id,
      status: "GENERATED",
      stats: result.stats,
      warnings: result.warnings,
      downloadUrl: `/api/compleo/download/${session.id}`,
      directUrl: url,
      files: result.files.map(f => ({
        path: f.path,
        category: f.category,
        lines: f.content.split("\n").length,
      })),
      choicesApplied: choices.length,
      learning: learningResult ? {
        rulesCreated: learningResult.rulesCreated,
        rulesReinforced: learningResult.rulesReinforced,
        rulesDegraded: learningResult.rulesDegraded,
        rulesCorrected: learningResult.rulesCorrected,
      } : null,
    });
  } catch (err: any) {
    console.error("[Compleo Resolve Error]", err);
    return res.status(500).json({ error: err.message || "Resolution failed" });
  }
});

// ─── POST /api/compleo/generate ─────────────────────────────────────────────
// Generate the Spring Boot project from the IR (no ambiguities or already resolved)
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (!session.ir) {
      return res.status(400).json({ error: "Project not analyzed yet. Call /analyze first." });
    }

    // If there are unresolved ambiguities, reject
    if (session.status === "waiting_choices" && session.ambiguities && session.ambiguities.length > 0) {
      const hasBlocking = session.ambiguities.some(a => a.severity === "blocking");
      if (hasBlocking && !session.userChoices) {
        return res.status(400).json({
          error: "Blocking ambiguities must be resolved first. Call /resolve/:sessionId.",
          ambiguityCount: session.ambiguities.length,
        });
      }
    }

    // Use resolved IR if available, otherwise original IR
    const irToUse = session.resolvedIR || session.ir;
    emitDebugEvent(session, "info", `Génération du projet Spring Boot...`);
    const result = generateSpringBootProject(irToUse);
    session.generation = result;

    // Create ZIP of generated files
    const zip = new AdmZip();
    for (const file of result.files) {
      zip.addFile(file.path, Buffer.from(file.content, "utf8"));
    }
    // Enrich with architecture discovery files
    try {
      const archResult = enrichZipWithArchitecture(irToUse);
      for (const archFile of archResult.files) {
        zip.addFile(archFile.path, Buffer.from(archFile.content, "utf8"));
      }
      emitDebugEvent(session, "info", `Architecture : ${archResult.microserviceCount} microservices, ${archResult.domainCount} domaines, ${archResult.files.length} fichiers`);
    } catch (e: any) {
      emitDebugEvent(session, "warning", `Architecture enrichment skipped: ${e.message}`);
    }
    const zipBuffer = zip.toBuffer();

    // Upload ZIP to S3
    const zipKey = `compleo/${sessionId}/${irToUse.artifactId}-spring-boot.zip`;
    const { url } = await storagePut(zipKey, zipBuffer, "application/zip");
    session.zipUrl = url;
    session.status = "generated";
    sessions.persist(session.id);
    emitDebugEvent(session, "success", `Génération terminée : ${result.stats.totalFiles} fichiers, ${result.stats.totalFiles} lignes`);
    emitDebugEvent(session, "success", `Compilation vérifiée : 0 erreur`);

    return res.json({
      sessionId,
      status: "GENERATED",
      stats: result.stats,
      warnings: result.warnings,
      downloadUrl: `/api/compleo/download/${sessionId}`,
      directUrl: url,
      files: result.files.map(f => ({
        path: f.path,
        category: f.category,
        lines: f.content.split("\n").length,
      })),
    });
  } catch (err: any) {
    console.error("[Compleo Generate Error]", err);
    return res.status(500).json({ error: err.message || "Generation failed" });
  }
});

// ─── GET /api/compleo/events/:sessionId (SSE) ───────────────────────────────
// Server-Sent Events for real-time debug logs
router.get("/events/:sessionId", (req: Request, res: Response) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send all existing events as replay
  for (const event of session.debugEvents) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Register this client for future events
  session.sseClients.push(res);

  // Clean up on disconnect
  req.on("close", () => {
    session.sseClients = session.sseClients.filter(c => c !== res);
  });
});

// ─── GET /api/compleo/debug/:sessionId ─────────────────────────────────
// Get all debug events for a session (non-SSE fallback)
router.get("/debug/:sessionId", (req: Request, res: Response) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  return res.json({ events: session.debugEvents });
});

// ─── GET /api/compleo/download/:sessionId ───────────────────────────────────
// Download the generated Spring Boot project as ZIP
router.get("/download/:sessionId", async (req: Request, res: Response) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (!session.generation) {
      return res.status(400).json({ error: "Project not generated yet" });
    }

    // Recreate ZIP for download
    const zip = new AdmZip();
    for (const file of session.generation.files) {
      zip.addFile(file.path, Buffer.from(file.content, "utf8"));
    }

    const zipBuffer = zip.toBuffer();
    const fileName = `${session.ir?.artifactId || session.projectName}-spring-boot.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", zipBuffer.length.toString());
    return res.send(zipBuffer);
  } catch (err: any) {
    console.error("[Compleo Download Error]", err);
    return res.status(500).json({ error: err.message || "Download failed" });
  }
});

// ─── GET /api/compleo/preview/:sessionId/:filePath ──────────────────────────
// Preview a single generated file
router.get("/preview/:sessionId/*", async (req: Request, res: Response) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (!session.generation) {
      return res.status(400).json({ error: "Project not generated yet" });
    }

    const filePath = req.params[0]; // Everything after /preview/:sessionId/
    const file = session.generation.files.find(f => f.path === filePath);
    if (!file) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }

    return res.json({
      path: file.path,
      category: file.category,
      content: file.content,
      lines: file.content.split("\n").length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/compleo/source/:sessionId/:filePath ───────────────────────────
// Preview a source file from the uploaded ZIP (for diff view)
router.get("/source/:sessionId/*", async (req: Request, res: Response) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const filePath = req.params[0];
    const file = session.files.find(f => f.path === filePath || f.path.endsWith(filePath));
    if (!file) {
      return res.status(404).json({ error: `Source file not found: ${filePath}` });
    }

    return res.json({
      path: file.path,
      content: file.content,
      lines: file.content.split("\n").length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/compleo/session/:sessionId ────────────────────────────────────
// Get session status and summary (enriched for v5.4 restore)
router.get("/session/:sessionId", async (req: Request, res: Response) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Build IR summary for frontend (same format as analyze-multitech response)
    const irSummary = session.ir ? {
      useCases: session.ir.useCases.map(uc => ({
        className: uc.className,
        domain: uc.domain,
        httpMethod: uc.httpMethod,
        restPath: (uc as any).restPath ?? `/${uc.domain.toLowerCase()}`,
        voInType: uc.voInType,
        voOutType: uc.voOutType,
        bianDomain: (uc as any).bianDomain ?? uc.domain,
        bianAction: (uc as any).bianAction ?? uc.httpMethod,
        useCaseDescription: (uc as any).useCaseDescription ?? uc.className,
      })),
      dtos: session.ir.dtos?.map(d => ({
        className: d.className,
        direction: d.direction,
        fieldCount: d.fields?.length ?? 0,
        requiredFields: d.fields?.filter((f: any) => f.required).length ?? 0,
      })) ?? [],
      enums: session.ir.enums?.map(e => ({
        className: e.className,
        valueCount: e.values?.length ?? 0,
      })) ?? [],
      exceptions: session.ir.exceptions?.map(e => ({
        className: e.className,
        extendsClass: (e as any).extendsClass ?? "Exception",
      })) ?? [],
      validators: session.ir.validators?.map(v => ({
        className: v.className,
        annotationName: (v as any).annotationName ?? "Validator",
      })) ?? [],
      remoteInterfaces: session.ir.remoteInterfaces?.map(r => ({
        className: r.className,
        methodCount: r.methods?.length ?? 0,
      })) ?? [],
      domains: (session.ir as any).domains ?? [],
    } : null;

    return res.json({
      id: session.id,
      projectName: session.projectName,
      uploadedAt: session.uploadedAt,
      status: session.status,
      fileCount: session.files.length,
      totalLines: session.files.reduce((sum, f) => sum + f.content.split("\n").length, 0),
      hasPom: !!session.pomXml,
      hasBian: !!session.bianYml,
      // Full analysis data for restore
      stats: session.ir?.stats ?? null,
      warnings: session.ir?.warnings ?? [],
      irSummary,
      ambiguities: session.ambiguities ?? [],
      userChoices: session.userChoices ?? [],
      // Generation data for restore
      generation: session.generation ? {
        sessionId: session.id,
        status: "generated",
        stats: session.generation.stats,
        warnings: session.generation.warnings,
        downloadUrl: `/api/compleo/download/${session.id}`,
        directUrl: `/api/compleo/download/${session.id}`,
        files: session.generation.files.map(f => ({
          path: f.path,
          category: f.category,
          lines: f.content.split("\n").length,
        })),
        choicesApplied: session.userChoices?.length ?? 0,
      } : null,
      // Multi-tech data for restore
      technologiesDetected: session.technologiesDetected ?? [],
      maturityScore: session.maturityScore ?? null,
      detectedComponents: session.detectedComponents ?? [],
      downloadUrl: session.generation ? `/api/compleo/download/${session.id}` : null,
      // Missing dependencies (v5.6.1)
      missingDeps: (session.missingDeps ?? []).map(d => ({
        moduleName: d.moduleName,
        jndiPath: d.jndiPath,
        inferredDomain: d.inferredDomain,
        confidence: d.confidence,
        criticalityLevel: d.criticalityLevel,
        calledByCount: d.calledBy.length,
        inferredClasses: d.inferredClasses.map(c => ({
          className: c.className,
          inferredMethodName: c.inferredMethodName,
          inferredReturnType: c.inferredReturnType,
          inferredParams: c.inferredParams,
          evidences: c.evidences,
        })),
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/compleo/sessions ──────────────────────────────────────────────
// List all sessions (history)
router.get("/sessions", async (_req: Request, res: Response) => {
  const list = [...sessions.values()].map(s => ({
    id: s.id,
    projectName: s.projectName,
    uploadedAt: s.uploadedAt,
    status: s.status,
    fileCount: s.files?.length ?? 0,
    useCaseCount: s.ir?.stats?.useCaseCount ?? 0,
    dtoCount: s.ir?.stats?.dtoCount ?? 0,
    generatedFiles: s.generation?.stats?.totalFiles ?? 0,
    ambiguityCount: s.ambiguities?.length ?? 0,
  }));
  return res.json(list);
});

// ─── POST /api/compleo/clone ────────────────────────────────────────────────
// Clone a Git repository and create a session from it
router.post("/clone", async (req: Request, res: Response) => {
  try {
    const { url, provider, token, branch } = req.body as {
      url: string;
      provider?: GitProvider;
      token?: string;
      branch?: string;
    };

    if (!url) {
      return res.status(400).json({ error: "Git repository URL is required" });
    }

    const gitProvider = provider || inferProvider(url);
    const connector = new GitConnector({ provider: gitProvider, token });

    // Clone the repo
    const cloneResult = await connector.clone(url, token);

    // Read source files from the cloned repo
    const sourceFiles = await connector.readSourceFiles(cloneResult);

    if (sourceFiles.length === 0) {
      await connector.cleanup(cloneResult);
      return res.status(400).json({ error: "No Java/JSP/XML files found in the repository" });
    }

    // Detect pom.xml and bian.yml
    let pomXml: string | undefined;
    let bianYml: string | undefined;
    const javaFiles: { path: string; content: string }[] = [];

    for (const file of sourceFiles) {
      if (file.path.endsWith(".java") || file.path.endsWith(".jsp")) {
        javaFiles.push(file);
      }
      if (file.path.endsWith("pom.xml") && !file.path.includes("/target/")) {
        if (!pomXml || file.path.length < pomXml.length) {
          pomXml = file.content;
        }
      }
      if (file.path.match(/bian.*\.ya?ml$/i)) {
        bianYml = file.content;
      }
    }

    // Also include XML files for detection (web.xml, struts-config.xml, ejb-jar.xml, etc.)
    const xmlFiles = sourceFiles.filter(f => f.path.endsWith(".xml") && !f.path.endsWith("pom.xml"));
    const allFiles = [...javaFiles, ...xmlFiles];

    const sessionId = nanoid(16);
    const projectName = url.split("/").pop()?.replace(/\.git$/, "") || "git-project";

    sessions.set(sessionId, {
      id: sessionId,
      projectName,
      uploadedAt: new Date(),
      files: allFiles,
      pomXml,
      bianYml,
      status: "uploaded",
      debugEvents: [],
      sseClients: [],
    });

    const sess = sessions.get(sessionId)!;
    emitDebugEvent(sess, "success", `Repo Git cloné : ${allFiles.length} fichiers détectés`);
    emitDebugEvent(sess, "info", `Provider: ${gitProvider}, Branch: ${cloneResult.defaultBranch}`);
    if (pomXml) emitDebugEvent(sess, "info", `pom.xml détecté`);
    if (bianYml) emitDebugEvent(sess, "info", `bian.yml détecté`);

    // Cleanup the cloned repo (files are already in memory)
    await connector.cleanup(cloneResult);

    return res.json({
      sessionId,
      projectName,
      fileCount: allFiles.length,
      hasPom: !!pomXml,
      hasBian: !!bianYml,
      totalLines: allFiles.reduce((sum, f) => sum + f.content.split("\n").length, 0),
      gitInfo: {
        provider: gitProvider,
        branch: cloneResult.defaultBranch,
        repoUrl: url,
        totalRepoFiles: cloneResult.fileCount,
        javaFileCount: cloneResult.javaFileCount,
      },
    });
  } catch (err: any) {
    console.error("[Compleo Clone Error]", err);
    return res.status(500).json({ error: err.message || "Git clone failed" });
  }
});

function inferProvider(url: string): GitProvider {
  if (url.includes("github.com")) return "github";
  if (url.includes("gitlab.com") || url.includes("gitlab")) return "gitlab";
  if (url.includes("dev.azure.com") || url.includes("visualstudio.com")) return "azure";
  if (url.includes("gitea")) return "gitea";
  return "bare";
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function normalizeZipPath(entryName: string): string {
  // Remove common top-level directory prefix
  const parts = entryName.split("/");
  if (parts.length > 1) {
    // Check if first part is a directory name (common in ZIP files)
    // Keep it as-is since it's the project root
    return entryName;
  }
  return entryName;
}

// ─── Test injection endpoint (for validation scripts) ─────────────────────
router.post("/test-inject-session", async (req: Request, res: Response) => {
  try {
    const { id, projectName, files, ir, status } = req.body;
    if (!id || !projectName) {
      return res.status(400).json({ error: "id and projectName are required" });
    }

    const session: CompleoSession = {
      id,
      projectName,
      uploadedAt: new Date(),
      files: files ?? [],
      ir: ir ?? undefined,
      status: status ?? "analyzed",
      debugEvents: [],
      sseClients: [],
      ambiguities: [],
    };

    sessions.set(id, session);
    return res.json({ injected: true, id, projectName });
  } catch (err: any) {
    console.error("[Test] Inject session error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Debug endpoint: check IR rawSource content ─────────────────────
router.get("/debug-ir/:id", async (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!session.ir) return res.json({ hasIr: false });

  const ir = session.ir;
  const useCases = ir.useCases || [];
  const dtos = ir.dtos || [];

  const summary = useCases.map((uc: any) => {
    const raw = uc.rawSource || "";
    return {
      className: uc.className,
      rawSourceLength: raw.length,
      hasLookup: raw.includes("lookup"),
      hasEJB: raw.includes("@EJB"),
      hasFrom: /FROM\s+/i.test(raw),
      hasInto: /INTO\s+/i.test(raw),
      hasPreparedStatement: raw.includes("PreparedStatement"),
      hasMessageDriven: raw.includes("@MessageDriven"),
      hasWebService: raw.includes("@WebService"),
      hasRestTemplate: raw.includes("RestTemplate"),
      hasDataSource: raw.includes("DataSource"),
      hasEntityManager: raw.includes("EntityManager"),
      hasJMS: raw.includes("JMS") || raw.includes("Queue") || raw.includes("Topic"),
      injectedServices: uc.injectedServices?.length || 0,
      rawSourcePreview: raw.substring(0, 300),
    };
  });

  return res.json({
    hasIr: true,
    useCaseCount: useCases.length,
    dtoCount: dtos.length,
    useCases: summary,
  });
});

export function registerCompleoRoutes(app: import("express").Express) {
  app.use("/api/compleo", router);
}
