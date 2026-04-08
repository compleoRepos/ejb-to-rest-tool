/**
 * Compleo API Routes — Express routes for EJB-to-Spring Boot migration.
 * Handles: ZIP upload, EJB parsing, Spring Boot generation, ZIP download.
 *
 * @author Hamza NORDINE
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import { nanoid } from "nanoid";
import { parseEjbProject, type ProjectIR } from "./java-parser";
import { generateSpringBootProject, type GenerationResult } from "./spring-generator";
import { storagePut, storageGet } from "./storage";

const router = Router();

// In-memory store for analysis sessions (production would use DB)
const sessions = new Map<string, {
  id: string;
  projectName: string;
  uploadedAt: Date;
  files: { path: string; content: string }[];
  pomXml?: string;
  bianYml?: string;
  ir?: ProjectIR;
  generation?: GenerationResult;
  zipUrl?: string;
  status: "uploaded" | "analyzed" | "generated" | "error";
  error?: string;
}>();

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
    });

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

// ─── POST /api/compleo/analyze ──────────────────────────────────────────────
// Parse the uploaded EJB project and return the IR
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

    const ir = parseEjbProject(session.files, session.pomXml, session.bianYml);
    session.ir = ir;
    session.status = "analyzed";

    return res.json({
      sessionId,
      projectName: ir.projectName,
      groupId: ir.groupId,
      artifactId: ir.artifactId,
      version: ir.version,
      stats: ir.stats,
      warnings: ir.warnings,
      useCases: ir.useCases.map(uc => ({
        className: uc.className,
        domain: uc.domain,
        httpMethod: uc.httpMethod,
        restPath: uc.restPath,
        voInType: uc.voInType,
        voOutType: uc.voOutType,
        bianDomain: uc.bianDomain,
        bianAction: uc.bianAction,
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
    });
  } catch (err: any) {
    console.error("[Compleo Analyze Error]", err);
    return res.status(500).json({ error: err.message || "Analysis failed" });
  }
});

// ─── POST /api/compleo/generate ─────────────────────────────────────────────
// Generate the Spring Boot project from the IR
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

    const result = generateSpringBootProject(session.ir);
    session.generation = result;

    // Create ZIP of generated files
    const zip = new AdmZip();
    for (const file of result.files) {
      zip.addFile(file.path, Buffer.from(file.content, "utf8"));
    }
    const zipBuffer = zip.toBuffer();

    // Upload ZIP to S3
    const zipKey = `compleo/${sessionId}/${session.ir.artifactId}-spring-boot.zip`;
    const { url } = await storagePut(zipKey, zipBuffer, "application/zip");
    session.zipUrl = url;
    session.status = "generated";

    return res.json({
      sessionId,
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

// ─── GET /api/compleo/session/:sessionId ────────────────────────────────────
// Get session status and summary
router.get("/session/:sessionId", async (req: Request, res: Response) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({
      id: session.id,
      projectName: session.projectName,
      uploadedAt: session.uploadedAt,
      status: session.status,
      fileCount: session.files.length,
      totalLines: session.files.reduce((sum, f) => sum + f.content.split("\n").length, 0),
      hasPom: !!session.pomXml,
      hasBian: !!session.bianYml,
      ir: session.ir ? {
        stats: session.ir.stats,
        warnings: session.ir.warnings,
      } : null,
      generation: session.generation ? {
        stats: session.generation.stats,
        warnings: session.generation.warnings,
      } : null,
      downloadUrl: session.generation ? `/api/compleo/download/${session.id}` : null,
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
    fileCount: s.files.length,
    useCaseCount: s.ir?.stats.useCaseCount ?? 0,
    dtoCount: s.ir?.stats.dtoCount ?? 0,
    generatedFiles: s.generation?.stats.totalFiles ?? 0,
  }));
  return res.json(list);
});

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

export function registerCompleoRoutes(app: import("express").Express) {
  app.use("/api/compleo", router);
}
