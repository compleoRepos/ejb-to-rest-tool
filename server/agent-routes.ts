/**
 * Agent API Routes — SSE streaming, status, choices, cancel, download.
 *
 * POST   /api/agent/start          → Démarre une session agent
 * GET    /api/agent/:id/events     → SSE stream d'événements temps réel
 * GET    /api/agent/:id/status     → Statut de la session
 * POST   /api/agent/:id/choices    → Résoudre les ambiguïtés
 * POST   /api/agent/:id/cancel     → Annuler la session
 * GET    /api/agent/:id/download   → Télécharger le ZIP résultat
 * GET    /api/agent/:id/reports    → Rapports enrichis
 * GET    /api/agent/:id/sagas      → Données Saga Orchestration
 * GET    /api/agent/:id/compliance → Fichiers SOC 2 Compliance
 * GET    /api/agent/sessions       → Lister les sessions
 */

import { Router, type Express, type Request, type Response } from "express";
import { getAgent, getAgentStore, type AgentConfig, type AgentEvent } from "./agent/CompleoAgent";
import * as db from "./db";
import { getDb } from "./db";
import archiver from "archiver";
import { LearningEngine } from "./learning/LearningEngine";
import type { ChoiceWithAutoResolve } from "./learning/ConfidenceScorer";
import { storagePut } from "./storage";
import { agentSessions } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { DynamicOptionsResolver } from "./engine/frontend";

const learningEngine = new LearningEngine();

export function registerAgentRoutes(app: Express) {
  const router = Router();

  // ─── POST /api/agent/start ──────────────────────────────────────────────────
   router.post("/start", async (req: Request, res: Response) => {
    try {
      const config = req.body as AgentConfig;

      if (!config.source || !config.output) {
        return res.status(400).json({ error: "source et output sont requis" });
      }

      // Validate source config
      if (config.source.type === "git" && !(config.source as any).url) {
        return res.status(400).json({ error: "source.url est requis pour le mode git" });
      }
      if (config.source.type === "zip" && !(config.source as any).sessionId && !(config.source as any).path && !(config.source as any).files) {
        return res.status(400).json({ error: "source.sessionId, source.path ou source.files est requis pour le mode zip" });
      }

      console.log(`[Agent] D\u00e9marrage: source.type=${config.source.type}, options.projectName=${config.options?.projectName || "N/A"}`);

      const agent = getAgent();
      const store = getAgentStore();

      // Create session first to get the ID
      const session = store.create(config);
      const sessionId = session.id;

      // Start the agent in the background, passing the existing session ID
      (async () => {
        try {
          const agentGen = agent.run(config, sessionId);
          for await (const event of agentGen) {
            store.addEvent(sessionId, event);
          }
        } catch (err) {
          store.addEvent(sessionId, {
            type: "FAILURE",
            timestamp: Date.now(),
            level: "error",
            message: `Agent error: ${err instanceof Error ? err.message : String(err)}`,
            phase: "FAILED",
          });
          store.update(sessionId, { state: "FAILED", currentPhase: "FAILED" });
        }
      })();

      // Return the session ID immediately
      res.json({
        sessionId,
        message: "Agent démarré",
        eventsUrl: `/api/agent/${sessionId}/events`,
        statusUrl: `/api/agent/${sessionId}/status`,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erreur interne" });
    }
  });

  // ─── GET /api/agent/:id/events ──────────────────────────────────────────────
  router.get("/:id/events", (req: Request, res: Response) => {
    const { id } = req.params;
    const store = getAgentStore();
    const session = store.get(id);

    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send existing events as replay
    let lastIndex = 0;
    for (const event of session.events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      lastIndex++;
    }

    // Send session state for reconnection
    res.write(`event: session_state\ndata: ${JSON.stringify({
      status: session.state,
      progress: session.currentPhase,
      eventsCount: session.events.length,
    })}\n\n`);

    // Heartbeat every 15 seconds to keep connection alive
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
      } catch {
        // Client disconnected
      }
    }, 15_000);

    // Poll for new events
    const interval = setInterval(() => {
      const currentSession = store.get(id);
      if (!currentSession) {
        clearInterval(interval);
        clearInterval(heartbeatTimer);
        res.end();
        return;
      }

      // Send new events
      while (lastIndex < currentSession.events.length) {
        res.write(`data: ${JSON.stringify(currentSession.events[lastIndex])}\n\n`);
        lastIndex++;
      }

      // Close stream when session is done
      if (
        currentSession.state === "COMPLETED" ||
        currentSession.state === "FAILED" ||
        currentSession.state === "CANCELLED"
      ) {
        // Give a small delay to ensure all events are sent
        setTimeout(() => {
          clearInterval(interval);
          clearInterval(heartbeatTimer);
          res.end();
        }, 1000);
      }
    }, 200);

    // Cleanup on client disconnect
    req.on("close", () => {
      clearInterval(interval);
      clearInterval(heartbeatTimer);
    });
  });

  // ─── GET /api/agent/:id/status ──────────────────────────────────────────────
  router.get("/:id/status", (req: Request, res: Response) => {
    const { id } = req.params;
    const agent = getAgent();
    const status = agent.getStatus(id);

    if (!status) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    res.json(status);
  });

    // ─── POST /api/agent/:id/choices ────────────────────────────────────────
  router.post("/:id/choices", async (req: Request, res: Response) => {
    const { id } = req.params;
    const { choices } = req.body;

    if (!Array.isArray(choices)) {
      return res.status(400).json({ error: "choices doit être un tableau" });
    }

    const agent = getAgent();
    const store = getAgentStore();
    const session = store.get(id);

    const resolved = agent.resolveAmbiguities(id, choices);

    if (!resolved) {
      return res.status(400).json({ error: "Session non en attente d'input ou introuvable" });
    }

    // ─── Learning: Learn from user choices ───────────────────────────────
    let learningResult: any = null;
    try {
      if (session?.pendingAmbiguities && session.pendingAmbiguities.length > 0) {
        const tenantId = session.config.options.projectName || "global";

        const enrichedChoices: ChoiceWithAutoResolve[] = choices.map((c: any) => ({
          ambiguityId: c.ambiguityId,
          choiceId: c.choiceId,
          wasAutoResolved: false,
        }));

        learningResult = await learningEngine.learnFromChoices(
          session.pendingAmbiguities,
          enrichedChoices,
          tenantId,
          session.config.options.projectName || "unknown",
          session.id
        );

        if (learningResult.rulesCreated > 0 || learningResult.rulesReinforced > 0) {
          store.addEvent(id, {
            type: "LOG",
            timestamp: Date.now(),
            level: "info",
            message: `Apprentissage : ${learningResult.rulesCreated} règle(s) créée(s), ${learningResult.rulesReinforced} renforcée(s)`,
            phase: "ANALYZING",
          });
        }
      }
    } catch (learningErr) {
      console.warn("[Learning] Agent learn from choices failed:", learningErr);
    }
    // ─── End Learning ────────────────────────────────────────────────

    res.json({
      message: "Ambiguïtés résolues, l'agent reprend",
      learning: learningResult ? {
        rulesCreated: learningResult.rulesCreated,
        rulesReinforced: learningResult.rulesReinforced,
        rulesDegraded: learningResult.rulesDegraded,
        rulesCorrected: learningResult.rulesCorrected,
      } : null,
    });
  });

  // ─── PATCH /api/agent/:id/options ──────────────────────────────────────────
  // v10.7: Update session options mid-flight (before generation starts)
  router.patch("/:id/options", (req: Request, res: Response) => {
    const { id } = req.params;
    const store = getAgentStore();
    const session = store.get(id);

    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    const opts = req.body as Partial<AgentConfig["options"]>;
    if (!opts || typeof opts !== "object") {
      return res.status(400).json({ error: "Body doit contenir les options à mettre à jour" });
    }

    // Merge new options into existing config
    session.config.options = { ...session.config.options, ...opts };
    store.update(id, { config: session.config } as any);

    console.log(`[Agent] Options updated for session ${id}:`, opts);

    return res.json({
      message: "Options mises à jour",
      options: session.config.options,
    });
  });

  // --- GET /api/agent/:id/post-migration-checklist (v10.8) ---
  // Returns the post-migration checklist generated after the pipeline completes.
  router.get("/:id/post-migration-checklist", (req: Request, res: Response) => {
    const { id } = req.params;
    const store = getAgentStore();
    const session = store.get(id);

    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    if (!session.postMigrationChecklist) {
      return res.status(400).json({ error: "La checklist post-migration n'a pas encore ete generee" });
    }

    return res.json(session.postMigrationChecklist);
  });

  // --- GET /api/agent/:id/dynamic-options (v10.8) ---
  // Resolve dynamic generation options based on analysis results.
  // Returns only the options relevant to what was detected.
  router.get("/:id/dynamic-options", (req: Request, res: Response) => {
    const { id } = req.params;
    const store = getAgentStore();
    const session = store.get(id);

    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    if (!session.analysisResult) {
      return res.status(400).json({ error: "L'analyse n'a pas encore ete effectuee" });
    }

    try {
      const resolver = new DynamicOptionsResolver();
      const multiTech = session.analysisResult?.multiTech;
      const sourceFiles: Array<{ path: string; content: string }> = (session as any)._sourceFiles || [];

      const resolved = resolver.resolve({
        technologiesDetected: multiTech?.technologiesDetected || [],
        detectedComponents: (multiTech?.detectedComponents || []) as any[],
        aiInsights: session.analysisResult?.aiInsights || null,
        sourceFiles,
        classNames: session.ir?.useCases?.map((uc: any) => uc.className) || [],
        domainCount: session.analysisResult?.aiInsights?.domainInsights?.length || 0,
      });

      // Store resolved options in session for later use
      session.dynamicOptions = resolved as any;
      store.update(id, { dynamicOptions: resolved as any });

      return res.json(resolved);
    } catch (err: any) {
      console.error("[Agent] Dynamic options resolution failed:", err);
      return res.status(500).json({ error: `Erreur resolution options : ${err.message}` });
    }
  });

  // ─── POST /api/agent/:id/cancel ─────────────────────────────────────────────
  router.post("/:id/cancel", (req: Request, res: Response) => {
    const { id } = req.params;
    const agent = getAgent();
    const cancelled = agent.cancel(id);

    if (!cancelled) {
      return res.status(400).json({ error: "Session non annulable ou introuvable" });
    }

    res.json({ message: "Session annulée" });
  });

  // ─── GET /api/agent/:id/download ────────────────────────────────────────────
  // v10.0: Upload ZIP to S3 on first download, then redirect to S3 URL on subsequent requests.
  // This ensures the ZIP remains available even after server restart.
  router.get("/:id/download", async (req: Request, res: Response) => {
    const { id } = req.params;
    const store = getAgentStore();
    let session = store.get(id);

    // ─── v10.2: If session not in memory, try to find ZIP URL in DB ───────
    if (!session) {
      try {
        const database = await getDb();
        if (database) {
          const [row] = await database.select().from(agentSessions).where(eq(agentSessions.id, id)).limit(1);
          if (row?.zipUrl && row.zipUrl.startsWith("http")) {
            console.log(`[Agent] Download from DB-persisted S3 URL: ${row.zipUrl}`);
            return res.redirect(row.zipUrl);
          }
        }
      } catch (dbErr) {
        console.warn("[Agent] DB lookup for download failed:", dbErr);
      }
      return res.status(404).json({ error: "Session introuvable — le ZIP n'est plus disponible. Veuillez relancer l'analyse." });
    }

    if (session.state !== "COMPLETED") {
      return res.status(400).json({ error: "Session non terminée" });
    }

    const projectName = session.config.options.projectName || "migration";

    // ─── v10.2: Check if ZIP is already persisted in S3 ─────────────────
    // If downloadUrl is an S3 URL (starts with http), redirect to it
    if (session.downloadUrl && session.downloadUrl.startsWith("http")) {
      return res.redirect(session.downloadUrl);
    }
    // Also check DB for S3 URL in case in-memory session lost it after restart
    try {
      const database = await getDb();
      if (database) {
        const [row] = await database.select().from(agentSessions).where(eq(agentSessions.id, id)).limit(1);
        if (row?.zipUrl && row.zipUrl.startsWith("http")) {
          session.downloadUrl = row.zipUrl;
          store.update(id, { downloadUrl: row.zipUrl });
          console.log(`[Agent] Download restored from DB: ${row.zipUrl}`);
          return res.redirect(row.zipUrl);
        }
      }
    } catch (dbErr) {
      console.warn("[Agent] DB fallback lookup failed:", dbErr);
    }

    // ─── Build ZIP from in-memory data ──────────────────────────────────
    if (!session.generatedProject) {
      return res.status(400).json({ error: "Aucun projet généré — les données en mémoire ont été perdues. Veuillez relancer l'analyse." });
    }

    // FIX v5.8.1: Deduplicate ALL files in the ZIP using a Map (path → content)
    const zipEntries = new Map<string, string>();
    
    // 1. Add spring-generator files (highest priority)
    for (const file of session.generatedProject.files) {
      zipEntries.set(file.path, file.content);
    }
    // 2. Add multi-tech files (skip duplicates from spring-generator)
    for (const file of session.generatedProject.multiTechFiles) {
      if (!zipEntries.has(file.path)) {
        zipEntries.set(file.path, file.content);
      }
    }
    // 3. Add migration report only if not already included
    if (session.migrationReport && !zipEntries.has("MIGRATION_REPORT.md")) {
      zipEntries.set("MIGRATION_REPORT.md", session.migrationReport);
    }
    // 4. Add microservice files if available
    if (session.microserviceResult) {
      if (session.microserviceResult.report && !zipEntries.has("MICROSERVICES_REPORT.md")) {
        zipEntries.set("MICROSERVICES_REPORT.md", session.microserviceResult.report);
      }
      if (session.microserviceResult.generatedFiles) {
        for (const file of session.microserviceResult.generatedFiles) {
          if (!zipEntries.has(file.path)) {
            zipEntries.set(file.path, file.content);
          }
        }
      }
    }
    // 5. Add enhanced reports if available (v7.4)
    if (session.enhancedReports?.enhanced) {
      const reportMap: Record<string, string> = {
        MIGRATION_REPORT:     "MIGRATION_REPORT.md",
        MICROSERVICES_REPORT: "MICROSERVICES_REPORT.md",
        DATASOURCE_MIGRATION: "DATASOURCE_MIGRATION.md",
        QUALITY_SCORE:        "QUALITY_SCORE.md",
        EXECUTIVE_SUMMARY:    "EXECUTIVE_SUMMARY.md",
      };
      for (const [key, fileName] of Object.entries(reportMap)) {
        const content = session.enhancedReports.reports[key];
        if (content) {
          zipEntries.set(fileName, content);
        }
      }
    }

    // ─── v10.0: Build ZIP buffer, upload to S3, then serve ──────────────
    try {
      const archive = archiver("zip", { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      for (const [path, content] of zipEntries) {
        archive.append(content, { name: path });
      }
      await archive.finalize();
      const zipBuffer = Buffer.concat(chunks);

      // Upload to S3 for persistence
      const suffix = Math.random().toString(36).slice(2, 8);
      const s3Key = `agent-artifacts/${projectName}-${suffix}.zip`;
      try {
        const { url } = await storagePut(s3Key, zipBuffer, "application/zip");
        // Persist S3 URL back to session (in-memory + DB)
        session.downloadUrl = url;
        store.update(id, { downloadUrl: url });
        console.log(`[Agent] ZIP uploaded to S3: ${url}`);
      } catch (s3Err) {
        console.warn("[Agent] S3 upload failed, serving from memory:", s3Err);
      }

      // Serve the ZIP
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${projectName}-spring-boot.zip"`);
      res.setHeader("Content-Length", zipBuffer.length.toString());
      return res.send(zipBuffer);
    } catch (err) {
      console.error("[Agent Download Error]", err);
      return res.status(500).json({ error: "Erreur lors de la génération du ZIP" });
    }
  });

  // ─── GET /api/agent/:id/reports — v7.4 Enhanced Reports ───────────────────
  router.get("/:id/reports", (req: Request, res: Response) => {
    const { id } = req.params;
    const store = getAgentStore();
    const session = store.get(id);

    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    if (!session.enhancedReports) {
      return res.json({
        enhanced: false,
        reports: {},
        metadata: null,
      });
    }

    return res.json(session.enhancedReports);
  });

  // ─── GET /api/agent/:id/compliance — v10.13 SOC 2 Compliance ────────────────
  router.get("/:id/compliance", (req: Request, res: Response) => {
    const { id } = req.params;
    const store = getAgentStore();
    const session = store.get(id);

    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    if (!session.generatedProject?.files) {
      return res.json({
        enabled: false,
        files: [],
        report: null,
        summary: null,
      });
    }

    // Extraire les fichiers SOC 2 du projet généré
    const complianceFiles = session.generatedProject.files.filter(
      (f) =>
        f.path.includes("/compliance/") ||
        f.path.includes("SOC2_COMPLIANCE") ||
        f.path.includes("application-soc2")
    );

    if (complianceFiles.length === 0) {
      return res.json({
        enabled: false,
        files: [],
        report: null,
        summary: null,
      });
    }

    // Séparer le rapport des fichiers de code
    const reportFile = complianceFiles.find((f) => f.path.includes("SOC2_COMPLIANCE.md"));
    const codeFiles = complianceFiles.filter((f) => !f.path.includes("SOC2_COMPLIANCE.md"));

    // Catégoriser les fichiers
    const categorizedFiles = codeFiles.map((f) => {
      let category = "config";
      let tsc = "";
      if (f.path.includes("/audit/")) { category = "audit"; tsc = "CC7, CC8"; }
      else if (f.path.includes("/security/")) { category = "security"; tsc = "CC6"; }
      else if (f.path.includes("/validation/")) { category = "validation"; tsc = "CC5, PI1"; }
      else if (f.path.includes("/monitoring/")) { category = "monitoring"; tsc = "A1, CC7"; }
      else if (f.path.includes("/error/")) { category = "error"; tsc = "CC3, CC9"; }
      else if (f.path.includes("application-soc2")) { category = "config"; tsc = "CC6, CC7"; }
      return {
        path: f.path,
        content: f.content,
        category,
        tsc,
        fileName: f.path.split("/").pop() || f.path,
      };
    });

    // Construire le résumé
    const tscSet = new Set<string>();
    categorizedFiles.forEach((f) => {
      f.tsc.split(", ").filter(Boolean).forEach((t) => tscSet.add(t));
    });

    return res.json({
      enabled: true,
      files: categorizedFiles,
      report: reportFile ? reportFile.content : null,
      summary: {
        totalFiles: categorizedFiles.length,
        criteriasCovered: Array.from(tscSet).sort(),
        categories: {
          audit: categorizedFiles.filter((f) => f.category === "audit").length,
          security: categorizedFiles.filter((f) => f.category === "security").length,
          validation: categorizedFiles.filter((f) => f.category === "validation").length,
          monitoring: categorizedFiles.filter((f) => f.category === "monitoring").length,
          error: categorizedFiles.filter((f) => f.category === "error").length,
          config: categorizedFiles.filter((f) => f.category === "config").length,
        },
      },
    });
  });

  // ─── GET /api/agent/:id/sagas — v7.9 Saga Orchestration ──────────────────
  router.get("/:id/sagas", (req: Request, res: Response) => {
    const { id } = req.params;
    const store = getAgentStore();
    const session = store.get(id);

    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    if (!session.sagaResult) {
      return res.json({
        detected: false,
        candidates: [],
        filesGenerated: 0,
        report: null,
        details: [],
      });
    }

    // Build enriched response with step-level details from SSE events
    const sagaEvents = session.events.filter(
      (e) =>
        e.type === "LOG" &&
        e.phase === "MICROSERVICES" &&
        (e.data as any)?.domain,
    );

    const details = sagaEvents.map((e) => {
      const data = e.data as any;
      return {
        domain: data.domain,
        sourceClass: data.sourceClass,
        steps: data.steps || [],
      };
    });

    return res.json({
      detected: true,
      candidates: session.sagaResult.candidates,
      filesGenerated: session.sagaResult.filesGenerated,
      report: session.sagaResult.report,
      details,
    });
  });

  // ─── POST /api/agent/start-from-project ──────────────────────────────────────
  // Start agent directly from an existing project in DB (no re-upload needed)
  router.post("/start-from-project", async (req: Request, res: Response) => {
    try {
      const { projectId, options } = req.body as {
        projectId: number;
        options?: {
          autoResolveAmbiguities?: boolean;
          enableMicroservices?: boolean;
          enableML?: boolean;
          enableReportEnhancer?: boolean;
          enableSaga?: boolean;
        };
      };

      if (!projectId) {
        return res.status(400).json({ error: "projectId est requis" });
      }

      // 1. Fetch project from DB
      const project = await db.getProjectById(projectId);
      if (!project) {
        return res.status(404).json({ error: `Projet #${projectId} introuvable` });
      }

      // 2. Fetch project files from DB
      const projectFiles = await db.getProjectFiles(projectId);
      if (!projectFiles || projectFiles.length === 0) {
        return res.status(400).json({ error: `Aucun fichier trouvé pour le projet #${projectId}` });
      }

      // 3. Convert to SourceFile format
      const sourceFiles = projectFiles.map((f) => ({
        path: f.filePath,
        content: f.content,
      }));

      console.log(`[Agent] Démarrage depuis projet DB #${projectId} (${project.name}): ${sourceFiles.length} fichiers`);

      // 4. Build agent config with files directly
      const config: AgentConfig = {
        source: { type: "zip", files: sourceFiles } as any,
        output: { type: "zip" },
        options: {
          projectName: project.name,
          autoResolveAmbiguities: options?.autoResolveAmbiguities ?? false,
          maxCompilationAttempts: 5,
          enableMicroservices: options?.enableMicroservices ?? false,
          enableML: options?.enableML ?? false,
          enableReportEnhancer: options?.enableReportEnhancer ?? false,
          enableSaga: options?.enableSaga ?? false,
        },
      };

      // 5. Create session and start agent
      const agent = getAgent();
      const store = getAgentStore();
      const session = store.create(config);
      const sessionId = session.id;

      (async () => {
        try {
          const agentGen = agent.run(config, sessionId);
          for await (const event of agentGen) {
            store.addEvent(sessionId, event);
          }
        } catch (err) {
          store.addEvent(sessionId, {
            type: "FAILURE",
            timestamp: Date.now(),
            level: "error",
            message: `Agent error: ${err instanceof Error ? err.message : String(err)}`,
            phase: "FAILED",
          });
          store.update(sessionId, { state: "FAILED", currentPhase: "FAILED" });
        }
      })();

      res.json({
        sessionId,
        projectName: project.name,
        fileCount: sourceFiles.length,
        message: `Agent démarré depuis le projet ${project.name}`,
        eventsUrl: `/api/agent/${sessionId}/events`,
        statusUrl: `/api/agent/${sessionId}/status`,
      });
    } catch (err) {
      console.error("[Agent] start-from-project error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Erreur interne" });
    }
  });

  // ─── GET /api/agent/sessions ────────────────────────────────────────────────
  // v10.2 + v11.3: Merge in-memory sessions + DB-persisted sessions
  // Performance: DB query uses lightweight projection (no heavy blobs like eventsData, generatedProjectData)
  router.get("/sessions", async (_req: Request, res: Response) => {
    const store = getAgentStore();
    // 1. In-memory sessions (highest priority — most up-to-date)
    const memorySessions = store.list().map((s) => ({
      id: s.id,
      state: s.state,
      currentPhase: s.currentPhase,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      eventCount: s.events.length,
      projectName: s.config.options.projectName || null,
      gitUrl: s.config.source.type === "git" ? (s.config.source as any).url : null,
      sourceType: s.config.source.type,
      outputType: s.config.output.type,
      hasZip: !!(s.downloadUrl),
      downloadUrl: s.downloadUrl || null,
      hasReports: !!(s.enhancedReports?.enhanced),
      hasMicroservices: !!(s.microserviceResult),
      hasSagas: !!(s.sagaResult),
      qualityGrade: s.qualityScore?.grade ?? null,
      llmStats: s.compilationResult?.llmStats ?? null,
    }));
    // 2. DB sessions — lightweight projection (no eventsData, generatedProjectData, etc.)
    let dbSessions: typeof memorySessions = [];
    try {
      const database = await getDb();
      if (database) {
        const memoryIds = new Set(memorySessions.map((s) => s.id));
        const rows = await database.select({
          id: agentSessions.id,
          state: agentSessions.state,
          currentPhase: agentSessions.currentPhase,
          projectName: agentSessions.projectName,
          configData: agentSessions.configData,
          zipUrl: agentSessions.zipUrl,
          enhancedReportsData: agentSessions.enhancedReportsData,
          microserviceResultData: agentSessions.microserviceResultData,
          sagaResultData: agentSessions.sagaResultData,
          qualityScoreData: agentSessions.qualityScoreData,
          compilationResultData: agentSessions.compilationResultData,
          createdAt: agentSessions.createdAt,
          updatedAt: agentSessions.updatedAt,
        }).from(agentSessions)
          .orderBy(desc(agentSessions.updatedAt))
          .limit(100);
        dbSessions = rows
          .filter((row) => !memoryIds.has(row.id))
          .map((row) => {
            const config = row.configData as AgentConfig | null;
            return {
              id: row.id,
              state: row.state as any,
              currentPhase: row.currentPhase as any,
              createdAt: row.createdAt ? new Date(row.createdAt).getTime() : 0,
              updatedAt: row.updatedAt ? new Date(row.updatedAt).getTime() : 0,
              eventCount: 0, // Not loaded for performance — only visible in detail view
              projectName: row.projectName || null,
              gitUrl: config?.source?.type === "git" ? (config.source as any).url : null,
              sourceType: config?.source?.type || "zip",
              outputType: config?.output?.type || "zip",
              hasZip: !!(row.zipUrl),
              downloadUrl: row.zipUrl || null,
              hasReports: !!(row.enhancedReportsData as any)?.enhanced,
              hasMicroservices: !!(row.microserviceResultData),
              hasSagas: !!(row.sagaResultData),
              qualityGrade: (row.qualityScoreData as any)?.grade ?? null,
              llmStats: (row.compilationResultData as any)?.llmStats ?? null,
            };
          });
      }
    } catch (dbErr) {
      console.warn("[Agent] Failed to load DB sessions:", dbErr);
    }
    // 3. Merge: memory first, then DB-only sessions
    const sessions = [...memorySessions, ...dbSessions];
    res.json({ sessions });
  });

  app.use("/api/agent", router);
}
