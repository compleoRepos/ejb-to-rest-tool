/**
 * Agent API Routes — SSE streaming, status, choices, cancel, download.
 *
 * POST   /api/agent/start          → Démarre une session agent
 * GET    /api/agent/:id/events     → SSE stream d'événements temps réel
 * GET    /api/agent/:id/status     → Statut de la session
 * POST   /api/agent/:id/choices    → Résoudre les ambiguïtés
 * POST   /api/agent/:id/cancel     → Annuler la session
 * GET    /api/agent/:id/download   → Télécharger le ZIP résultat
 * GET    /api/agent/sessions       → Lister les sessions
 */

import { Router, type Express, type Request, type Response } from "express";
import { getAgent, getAgentStore, type AgentConfig, type AgentEvent } from "./agent/CompleoAgent";
import archiver from "archiver";

export function registerAgentRoutes(app: Express) {
  const router = Router();

  // ─── POST /api/agent/start ──────────────────────────────────────────────────
  router.post("/start", async (req: Request, res: Response) => {
    try {
      const config = req.body as AgentConfig;

      if (!config.source || !config.output) {
        return res.status(400).json({ error: "source et output sont requis" });
      }

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

    // Poll for new events
    const interval = setInterval(() => {
      const currentSession = store.get(id);
      if (!currentSession) {
        clearInterval(interval);
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
          res.end();
        }, 1000);
      }
    }, 200);

    // Cleanup on client disconnect
    req.on("close", () => {
      clearInterval(interval);
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

  // ─── POST /api/agent/:id/choices ────────────────────────────────────────────
  router.post("/:id/choices", (req: Request, res: Response) => {
    const { id } = req.params;
    const { choices } = req.body;

    if (!Array.isArray(choices)) {
      return res.status(400).json({ error: "choices doit être un tableau" });
    }

    const agent = getAgent();
    const resolved = agent.resolveAmbiguities(id, choices);

    if (!resolved) {
      return res.status(400).json({ error: "Session non en attente d'input ou introuvable" });
    }

    res.json({ message: "Ambiguïtés résolues, l'agent reprend" });
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
  router.get("/:id/download", (req: Request, res: Response) => {
    const { id } = req.params;
    const store = getAgentStore();
    const session = store.get(id);

    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    if (session.state !== "COMPLETED") {
      return res.status(400).json({ error: "Session non terminée" });
    }

    if (!session.generatedProject) {
      return res.status(400).json({ error: "Aucun projet généré" });
    }

    const projectName = session.config.options.projectName || "migration";

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${projectName}-spring-boot.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    // Add generated files
    for (const file of session.generatedProject.files) {
      archive.append(file.content, { name: file.path });
    }

    // Add multi-tech files
    for (const file of session.generatedProject.multiTechFiles) {
      archive.append(file.content, { name: file.path });
    }

    // Add migration report
    if (session.migrationReport) {
      archive.append(session.migrationReport, { name: "MIGRATION_REPORT.md" });
    }

    archive.finalize();
  });

  // ─── GET /api/agent/sessions ────────────────────────────────────────────────
  router.get("/sessions", (_req: Request, res: Response) => {
    const store = getAgentStore();
    const sessions = store.list().map((s) => ({
      id: s.id,
      state: s.state,
      currentPhase: s.currentPhase,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      eventCount: s.events.length,
      projectName: s.config.options.projectName,
      sourceType: s.config.source.type,
      outputType: s.config.output.type,
    }));

    res.json({ sessions });
  });

  app.use("/api/agent", router);
}
