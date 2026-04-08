/**
 * Routes API pour le moteur d'apprentissage.
 *
 * Endpoints :
 *   GET  /api/learning/rules          — Lister les règles (filtres: tenant, type, active)
 *   GET  /api/learning/rules/:id      — Détail d'une règle
 *   POST /api/learning/rules          — Créer une règle manuellement
 *   PUT  /api/learning/rules/:id      — Modifier une règle
 *   POST /api/learning/rules/:id/confirm — Confirmer une règle (+0.15 confiance)
 *   POST /api/learning/rules/:id/deactivate — Désactiver une règle
 *   DELETE /api/learning/rules/:id    — Supprimer une règle
 *   GET  /api/learning/stats          — Statistiques d'apprentissage
 *   GET  /api/learning/rules/export   — Exporter les règles en JSON
 *   POST /api/learning/rules/import   — Importer des règles depuis JSON
 *
 * @author Hamza NORDINE
 */

import { Router } from "express";
import { LearningEngine } from "./learning/LearningEngine";
import { RuleStore } from "./learning/RuleStore";
import type { InsertLearningRule } from "../drizzle/schema";

const router = Router();
const engine = new LearningEngine();
const store = new RuleStore();

//// ─── GET /api/learning/rules/export (MUST be before :id routes) ─────────────

router.get("/rules/export", async (req, res) => {
  try {
    const tenant = (req.query.tenant as string) || "global";
    const exported = await engine.exportRules(tenant);

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="compleo-rules-${new Date().toISOString().split("T")[0]}.json"`
    );
    res.json(exported);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/learning/rules/import (MUST be before :id routes) ────────────

router.post("/rules/import", async (req, res) => {
  try {
    const { data, tenant, strategy = "merge" } = req.body;

    if (!data || !data.rules) {
      return res.status(400).json({
        success: false,
        error: "Format invalide : le champ 'data' avec 'rules' est requis",
      });
    }

    const targetTenant = tenant || data.tenant || "global";
    const result = await engine.importRules(data, targetTenant, strategy);

    res.json({
      success: true,
      ...result,
      message: `Import terminé : ${result.imported} importées, ${result.skipped} ignorées, ${result.conflicts} conflits résolus`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/learning/rules ────────────────────────────────────────────

router.get("/rules", async (req, res) => {
  try {
    const { tenant, type, active, minConfidence, limit } = req.query;

    const rules = await engine.listRules({
      tenantId: tenant as string,
      ruleType: type as string,
      isActive: active !== undefined ? active === "true" : undefined,
      minConfidence: minConfidence ? parseFloat(minConfidence as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({
      success: true,
      count: rules.length,
      rules: rules.map(r => ({
        id: r.id,
        tenantId: r.tenantId,
        ruleType: r.ruleType,
        patterns: {
          className: r.patternClassName,
          methodName: r.patternMethodName,
          package: r.patternPackage,
          javadoc: r.patternJavadoc,
          annotations: r.patternAnnotations,
          returnType: r.patternReturnType,
          paramTypes: r.patternParamTypes,
        },
        chosenOption: r.chosenOption,
        chosenReason: r.chosenReason,
        confidence: r.confidence,
        occurrenceCount: r.occurrenceCount,
        isActive: r.isActive,
        sourceProject: r.sourceProject,
        confirmedByUser: r.confirmedByUser,
        lastSeenAt: r.lastSeenAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/learning/rules/:id ────────────────────────────────────────────

router.get("/rules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const rule = await store.getById(id);

    if (!rule) {
      return res.status(404).json({ success: false, error: "Règle non trouvée" });
    }

    res.json({ success: true, rule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/learning/rules ───────────────────────────────────────────────

router.post("/rules", async (req, res) => {
  try {
    const {
      tenantId = "global",
      ruleType,
      patterns,
      chosenOption,
      chosenReason,
      confidence = 0.5,
    } = req.body;

    if (!ruleType || !chosenOption) {
      return res.status(400).json({
        success: false,
        error: "ruleType et chosenOption sont requis",
      });
    }

    const toInsert: InsertLearningRule = {
      tenantId,
      ruleType,
      patternClassName: patterns?.className || null,
      patternMethodName: patterns?.methodName || null,
      patternPackage: patterns?.package || null,
      patternJavadoc: patterns?.javadoc || null,
      patternAnnotations: patterns?.annotations || null,
      patternReturnType: patterns?.returnType || null,
      patternParamTypes: patterns?.paramTypes || null,
      chosenOption,
      chosenReason: chosenReason || null,
      confidence,
      occurrenceCount: 1,
      isActive: true,
      sourceProject: "manual",
      confirmedByUser: true,
    };

    const rule = await store.insert(toInsert);
    res.status(201).json({ success: true, rule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PUT /api/learning/rules/:id ────────────────────────────────────────────

router.put("/rules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { confidence, isActive, chosenReason } = req.body;

    const updates: Record<string, any> = {};
    if (confidence !== undefined) updates.confidence = confidence;
    if (isActive !== undefined) updates.isActive = isActive;
    if (chosenReason !== undefined) updates.chosenReason = chosenReason;

    const rule = await store.update(id, updates);
    if (!rule) {
      return res.status(404).json({ success: false, error: "Règle non trouvée" });
    }

    res.json({ success: true, rule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/learning/rules/:id/confirm ───────────────────────────────────

router.post("/rules/:id/confirm", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const rule = await engine.confirmRule(id);

    if (!rule) {
      return res.status(404).json({ success: false, error: "Règle non trouvée" });
    }

    res.json({
      success: true,
      rule,
      message: `Confiance boostée à ${Math.round(rule.confidence * 100)}%`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/learning/rules/:id/deactivate ────────────────────────────────

router.post("/rules/:id/deactivate", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const rule = await engine.deactivateRule(id);

    if (!rule) {
      return res.status(404).json({ success: false, error: "Règle non trouvée" });
    }

    res.json({ success: true, rule, message: "Règle désactivée" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── DELETE /api/learning/rules/:id ─────────────────────────────────────────

router.delete("/rules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await engine.deleteRule(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Règle non trouvée" });
    }

    res.json({ success: true, message: "Règle supprimée" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/learning/stats ────────────────────────────────────────────────

router.get("/stats", async (req, res) => {
  try {
    const tenant = req.query.tenant as string | undefined;
    const stats = await engine.getStats(tenant);

    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
