/**
 * Intelligence Routes — Endpoints REST pour le moteur d'intelligence.
 * POST /api/intelligence/analyze — Analyse complète d'un projet
 * GET  /api/intelligence/stats   — Statistiques de la knowledge base
 * POST /api/intelligence/report  — Génère un rapport Markdown/JSON
 *
 * @author Hamza NORDINE
 */

import { Router, Request, Response } from "express";
import { IntelligenceOrchestrator } from "./intelligence/IntelligenceOrchestrator";
import { ReportBuilder } from "./intelligence/report/ReportBuilder";
import type { JavaFileInput } from "./intelligence/IntelligenceOrchestrator";

const router = Router();
const orchestrator = new IntelligenceOrchestrator();
const reportBuilder = new ReportBuilder();

/**
 * POST /api/intelligence/analyze
 * Body: { files: Array<{ path, content, className }> }
 * Retourne le rapport d'intelligence complet.
 */
router.post("/analyze", (req: Request, res: Response) => {
  try {
    const { files } = req.body as { files: JavaFileInput[] };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "Le champ 'files' est requis (tableau de fichiers Java)" });
    }

    // Validate each file
    for (const f of files) {
      if (!f.content || !f.className) {
        return res.status(400).json({
          error: `Fichier invalide: chaque fichier doit avoir 'content' et 'className'`,
        });
      }
    }

    const report = orchestrator.analyze(files);

    res.json({
      success: true,
      report: {
        timestamp: report.timestamp,
        durationMs: report.durationMs,
        filesAnalyzed: report.filesAnalyzed,
        classesAnalyzed: report.classesAnalyzed,
        score: report.score,
        domainAnalysis: report.domainAnalysis,
        topViolations: report.topViolations,
        hitsByCategory: Object.fromEntries(
          Object.entries(report.hitsByCategory).map(([k, v]) => [k, v.length])
        ),
        hitsBySeverity: Object.fromEntries(
          Object.entries(report.hitsBySeverity).map(([k, v]) => [k, v.length])
        ),
        knowledgeBaseStats: report.knowledgeBaseStats,
        dataProfiles: report.dataProfiles.map((dp) => ({
          className: dp.className,
          totalFields: dp.totalFields,
          sensitiveFields: dp.sensitiveFields,
          requiredFields: dp.requiredFields,
          hasValidation: dp.hasValidation,
        })),
      },
    });
  } catch (err: any) {
    console.error("[Intelligence] Analyze error:", err);
    res.status(500).json({ error: err.message || "Erreur lors de l'analyse" });
  }
});

/**
 * POST /api/intelligence/report
 * Body: { files: Array<{ path, content, className }>, format: "markdown" | "json" }
 * Retourne le rapport dans le format demandé.
 */
router.post("/report", (req: Request, res: Response) => {
  try {
    const { files, format = "json" } = req.body as {
      files: JavaFileInput[];
      format?: "markdown" | "json";
    };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "Le champ 'files' est requis" });
    }

    const report = orchestrator.analyze(files);

    if (format === "markdown") {
      const markdown = reportBuilder.buildMarkdown(report);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="intelligence-report.md"');
      return res.send(markdown);
    }

    const jsonReport = reportBuilder.buildJSON(report);
    res.json({ success: true, report: jsonReport });
  } catch (err: any) {
    console.error("[Intelligence] Report error:", err);
    res.status(500).json({ error: err.message || "Erreur lors de la génération du rapport" });
  }
});

/**
 * GET /api/intelligence/stats
 * Retourne les statistiques de la knowledge base.
 */
router.get("/stats", (_req: Request, res: Response) => {
  try {
    const stats = orchestrator.getKnowledgeBaseStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as intelligenceRoutes };
