/**
 * Architecture API Routes — Endpoints pour l'analyse d'architecture.
 * POST /api/architecture/analyze — Analyse complète (GraphBuilder + DomainClusterer + ArchitectureDiscovery + MicroserviceExtractor)
 * GET  /api/architecture/export/:sessionId/:format — Export visualisation
 * GET  /api/architecture/result/:sessionId — Résultat complet
 *
 * @author Hamza NORDINE
 */

import { Router, Request, Response } from "express";
import { GraphBuilder } from "./graph/GraphBuilder";
import { DomainClusterer } from "./graph/DomainClusterer";
import { ArchitectureDiscovery } from "./graph/ArchitectureDiscovery";
import { MicroserviceExtractor } from "./graph/MicroserviceExtractor";
import { VisualizationEngine } from "./visualization/VisualizationEngine";
import { sessionStore } from "./session-store";
import type { ProjectIR } from "./java-parser";
import type { DependencyGraph, DomainMap } from "./graph/model/GraphModel";
import type { ArchitectureReport } from "./graph/ArchitectureDiscovery";
import type { ExtractionResult } from "./graph/MicroserviceExtractor";
import type { VisualizationOutput } from "./visualization/VisualizationEngine";

const router = Router();

// ─── In-memory architecture results cache ───────────────────────────────────

interface ArchitectureResult {
  sessionId: string;
  graph: DependencyGraph;
  domainMap: DomainMap;
  archReport: ArchitectureReport;
  extraction: ExtractionResult;
  visualizations: VisualizationOutput[];
  timestamp: number;
}

const architectureCache = new Map<string, ArchitectureResult>();

// ─── POST /analyze — Full architecture analysis pipeline ────────────────────

router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId requis" });
    }

    // Retrieve the session's IR from the session store
    const session = sessionStore.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session non trouvée" });
    }

    if (!session.ir) {
      return res.status(400).json({ error: "Aucune IR disponible — lancez d'abord une analyse" });
    }

    const startTime = Date.now();

    // Step 1: Build dependency graph
    const graphBuilder = new GraphBuilder();
    const graph = graphBuilder.buildFromIR(session.ir);

    // Step 2: Domain clustering
    const clusterer = new DomainClusterer();
    const domainMap = clusterer.cluster(graph);

    // Step 3: Architecture discovery
    const discovery = new ArchitectureDiscovery();
    const archReport = discovery.discover(graph, domainMap);

    // Step 4: Microservice extraction
    const extractor = new MicroserviceExtractor();
    const extraction = extractor.extract(graph, domainMap, archReport);

    // Step 5: Generate visualizations
    const vizEngine = new VisualizationEngine();
    const visualizations = vizEngine.generateAll(graph, extraction, archReport);

    const duration = Date.now() - startTime;

    // Cache the result
    const result: ArchitectureResult = {
      sessionId,
      graph,
      domainMap,
      archReport,
      extraction,
      visualizations,
      timestamp: Date.now(),
    };
    architectureCache.set(sessionId, result);

    // Return summary + Cytoscape data for the viewer
    const cytoscapeViz = visualizations.find((v) => v.format === "JSON");
    const svgDependency = visualizations.find((v) => v.filename === "dependency-graph.svg");
    const svgMicroservices = visualizations.find((v) => v.filename === "microservices-map.svg");
    const svgOverview = visualizations.find((v) => v.filename === "architecture-overview.svg");

    return res.json({
      success: true,
      duration,
      graph: {
        totalNodes: graph.graphMetrics.totalNodes,
        totalEdges: graph.graphMetrics.totalEdges,
        connectedComponents: graph.graphMetrics.connectedComponents,
        avgDegree: graph.graphMetrics.avgDegree,
      },
      domains: domainMap.map((d) => ({
        domainId: d.domainId,
        classCount: d.classes.length,
        cohesion: d.cohesion,
        coupling: d.couplage,
      })),
      architecture: {
        entryPoints: archReport.entryPoints.length,
        exitPoints: archReport.exitPoints.length,
        criticalFlows: archReport.criticalFlows.length,
        highRiskFlows: archReport.summary.highRiskFlows,
        modules: archReport.functionalModules.length,
      },
      microservices: extraction.microservices.map((ms) => ({
        id: ms.id,
        name: ms.name,
        boundedContext: ms.boundedContext,
        classes: ms.classes,
        classCount: ms.metrics.classCount,
        endpoints: ms.endpoints.length,
        cohesion: ms.metrics.cohesion,
        coupling: ms.metrics.coupling,
        dependencies: ms.dependencies.map((d) => ({
          targetServiceId: d.targetServiceId,
          targetServiceName: d.targetServiceName,
          type: d.type,
        })),
      })),
      sharedLibrary: {
        name: extraction.sharedLibrary.name,
        classCount: extraction.sharedLibrary.classes.length,
      },
      apiGateway: extraction.apiGateway,
      warnings: extraction.warnings,
      visualizations: {
        cytoscapeData: cytoscapeViz ? JSON.parse(cytoscapeViz.content) : null,
        svgDependency: svgDependency?.content || null,
        svgMicroservices: svgMicroservices?.content || null,
        svgOverview: svgOverview?.content || null,
      },
      entryPoints: archReport.entryPoints,
      exitPoints: archReport.exitPoints,
      criticalFlows: archReport.criticalFlows.map((f) => ({
        id: f.id,
        name: f.name,
        depth: f.depth,
        riskLevel: f.riskLevel,
        riskFactors: f.riskFactors,
        transactional: f.transactional,
        pathLength: f.path.length,
      })),
    });
  } catch (error: any) {
    console.error("[Architecture] Analyze error:", error);
    return res.status(500).json({ error: error.message || "Erreur d'analyse architecture" });
  }
});

// ─── GET /export/:sessionId/:format — Export visualization ──────────────────

router.get("/export/:sessionId/:format", async (req: Request, res: Response) => {
  try {
    const { sessionId, format } = req.params;
    const result = architectureCache.get(sessionId);

    if (!result) {
      return res.status(404).json({ error: "Résultat d'architecture non trouvé — relancez l'analyse" });
    }

    const formatMap: Record<string, string> = {
      svg: "dependency-graph.svg",
      "svg-microservices": "microservices-map.svg",
      "svg-overview": "architecture-overview.svg",
      graphml: "architecture.graphml",
      json: "cytoscape-graph.json",
      d2: "architecture.d2",
    };

    const filename = formatMap[format];
    if (!filename) {
      return res.status(400).json({
        error: `Format non supporté: ${format}`,
        supported: Object.keys(formatMap),
      });
    }

    const viz = result.visualizations.find((v) => v.filename === filename);
    if (!viz) {
      return res.status(404).json({ error: `Visualisation ${filename} non trouvée` });
    }

    const contentTypes: Record<string, string> = {
      SVG: "image/svg+xml",
      GRAPHML: "application/xml",
      JSON: "application/json",
      D2: "text/plain",
    };

    res.setHeader("Content-Type", contentTypes[viz.format] || "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="${viz.filename}"`);
    return res.send(viz.content);
  } catch (error: any) {
    console.error("[Architecture] Export error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── GET /result/:sessionId — Full architecture result ──────────────────────

router.get("/result/:sessionId", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const result = architectureCache.get(sessionId);

    if (!result) {
      return res.status(404).json({ error: "Résultat non trouvé" });
    }

    return res.json({
      sessionId: result.sessionId,
      timestamp: result.timestamp,
      graph: result.graph.graphMetrics,
      domainMap: result.domainMap,
      archReport: result.archReport,
      extraction: {
        microservices: result.extraction.microservices,
        sharedLibrary: result.extraction.sharedLibrary,
        apiGateway: result.extraction.apiGateway,
        summary: result.extraction.summary,
        warnings: result.extraction.warnings,
      },
      availableExports: result.visualizations.map((v) => ({
        format: v.format,
        filename: v.filename,
        description: v.description,
      })),
    });
  } catch (error: any) {
    console.error("[Architecture] Result error:", error);
    return res.status(500).json({ error: error.message });
  }
});

export function registerArchitectureRoutes(app: any) {
  app.use("/api/architecture", router);
}

export { router as architectureRouter };
