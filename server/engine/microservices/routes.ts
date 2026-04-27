/**
 * Microservices API Routes — Compleo v7.0
 *
 * Endpoint POST /microservices/generate :
 *   1. Parse le ZIP Java EE via le parser existant
 *   2. Découpe en microservices via MicroserviceSplitter
 *   3. Génère les projets Spring Boot via MicroserviceGenerator
 *   4. Retourne le résultat (services, rapport, ZIP)
 *
 * Feature-flaggé : activé uniquement si FEATURE_MS_ML=true
 *
 * @author Compleo
 */

import { Router, Request, Response } from "express";
import AdmZip from "adm-zip";
import { parseEjbProject } from "../../java-parser";
import { runPipeline } from "../pipeline/index";
import { registerAllDetectors } from "../detectors/index";
import { registerAllGenerators } from "../generators/index";
import { registry } from "../registry/index";
import { MicroserviceSplitter, buildParsedModules } from "./microservice-splitter";
import { MicroserviceGenerator } from "./microservice-generator";
import { MLEnhancer } from "../ml/ml-enhancer";

export const microservicesRouter = Router();

// ── ML Enhancer (initialisé une seule fois) ──────────────────────

const mlEnhancer = new MLEnhancer({
  enabled:       process.env.ML_ENABLED === "true",
  ollamaUrl:     process.env.OLLAMA_URL ?? "http://localhost:11434",
  chromaUrl:     process.env.CHROMA_URL ?? "http://localhost:8001",
  model:         process.env.ML_MODEL,
  minConfidence: parseFloat(process.env.ML_MIN_CONFIDENCE ?? "0.6"),
});
mlEnhancer.initialize();

// ── POST /microservices/generate ─────────────────────────────────

microservicesRouter.post("/generate", async (req: Request, res: Response) => {
  try {
    const { zipBase64 } = req.body;

    if (!zipBase64) {
      return res.status(400).json({
        error: "zipBase64 requis (ZIP encodé en base64)",
      });
    }

    // 1. Extraire les fichiers Java du ZIP
    const zipBuffer = Buffer.from(zipBase64, "base64");
    const zip = new AdmZip(zipBuffer);
    const sourceFiles: { path: string; content: string }[] = [];

    for (const entry of zip.getEntries()) {
      if (!entry.isDirectory && entry.entryName.endsWith(".java")) {
        sourceFiles.push({
          path:    entry.entryName,
          content: entry.getData().toString("utf-8"),
        });
      }
    }

    if (sourceFiles.length === 0) {
      return res.status(400).json({
        error: "Aucun fichier Java trouvé dans le ZIP",
      });
    }

    // 2. Parser le projet EJB
    const ir = parseEjbProject(sourceFiles);

    // 3. Exécuter le pipeline multi-tech pour détecter toutes les technologies
    registerAllDetectors(registry);
    registerAllGenerators(registry);
    const pipelineResult = runPipeline({
      files: sourceFiles,
      basePackage: "com.legacy",
      projectName: "microservices-analysis",
    });

    // 4. Découper en microservices
    const splitter = new MicroserviceSplitter();
    const services = splitter.split(ir, pipelineResult);

    // 5. Générer les projets Spring Boot
    const generator = new MicroserviceGenerator();
    const modules = buildParsedModules(ir, pipelineResult);
    const output = generator.generateAll(services, modules);

    // 6. Construire le ZIP de sortie
    const outputZip = new AdmZip();

    for (const project of output.services) {
      for (const [filePath, content] of project.files) {
        outputZip.addFile(
          `${project.serviceName}/${filePath}`,
          Buffer.from(content, "utf-8")
        );
      }
    }

    // Ajouter les fichiers d'infrastructure
    for (const [filePath, content] of output.infrastructure) {
      outputZip.addFile(filePath, Buffer.from(content, "utf-8"));
    }

    // Ajouter le rapport
    outputZip.addFile(
      "MICROSERVICES_REPORT.md",
      Buffer.from(output.report, "utf-8")
    );

    const zipB64 = outputZip.toBuffer().toString("base64");

    res.json({
      success:  true,
      services: services.map(s => ({
        name:       s.name,
        ejbs:       s.ejbs,
        confidence: s.confidence,
        tables:     s.ownedTables.length,
        apis:       s.restApis.length,
        kafka:      s.kafkaTopics.length,
        dbSchema:   s.dbSchema,
      })),
      zipBase64: zipB64,
      report:    output.report,
      stats: {
        totalServices:  services.length,
        totalFiles:     output.services.reduce((sum, p) => sum + p.files.size, 0),
        mlEnabled:      mlEnhancer.enabled,
      },
    });

  } catch (error: any) {
    console.error("Microservice generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /microservices/health ────────────────────────────────────

microservicesRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    status:    "ok",
    mlEnabled: mlEnhancer.enabled,
    feature:   "microservices-ml-generator",
    version:   "7.0.0",
  });
});
