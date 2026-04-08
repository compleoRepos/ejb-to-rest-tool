/**
 * RuleStore — Couche de persistance DB pour les règles d'apprentissage.
 *
 * Responsabilités :
 * - CRUD sur la table learning_rules
 * - Requêtes filtrées par tenant, type, confiance
 * - Statistiques d'apprentissage
 *
 * @author Hamza NORDINE
 */

import { getDb } from "../db";
import { learningRules, type LearningRule, type InsertLearningRule } from "../../drizzle/schema";
import { eq, and, gte, desc, sql, or } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RuleFilter {
  tenantId?: string;
  ruleType?: string;
  minConfidence?: number;
  isActive?: boolean;
  limit?: number;
}

export interface RuleStats {
  totalRules: number;
  activeRules: number;
  globalRules: number;
  clientRules: number;
  avgConfidence: number;
  highConfidenceRules: number;
  autoResolvableRules: number;
}

// ─── RuleStore ──────────────────────────────────────────────────────────────

export class RuleStore {
  private async getDatabase() {
    const d = await getDb();
    if (!d) throw new Error("Database not available");
    return d;
  }

  /**
   * Insère une nouvelle règle d'apprentissage.
   */
  async insert(rule: InsertLearningRule): Promise<LearningRule> {
    const db = await this.getDatabase();
    const [result] = await db.insert(learningRules).values(rule).$returningId();
    const [inserted] = await db
      .select()
      .from(learningRules)
      .where(eq(learningRules.id, result.id));
    return inserted;
  }

  /**
   * Insère plusieurs règles en batch.
   */
  async insertBatch(rules: InsertLearningRule[]): Promise<number> {
    if (rules.length === 0) return 0;
    const db = await this.getDatabase();
    await db.insert(learningRules).values(rules);
    return rules.length;
  }

  /**
   * Récupère une règle par ID.
   */
  async getById(id: number): Promise<LearningRule | undefined> {
    const db = await this.getDatabase();
    const [rule] = await db
      .select()
      .from(learningRules)
      .where(eq(learningRules.id, id));
    return rule;
  }

  /**
   * Recherche les règles correspondant à un type d'ambiguïté et un tenant.
   * Retourne les règles globales ET les règles du tenant, triées par confiance.
   */
  async findByTypeAndTenant(
    ruleType: string,
    tenantId: string,
    minConfidence: number = 0.3
  ): Promise<LearningRule[]> {
    const db = await this.getDatabase();
    return db
      .select()
      .from(learningRules)
      .where(
        and(
          eq(learningRules.ruleType, ruleType),
          or(
            eq(learningRules.tenantId, tenantId),
            eq(learningRules.tenantId, "global")
          ),
          gte(learningRules.confidence, minConfidence),
          eq(learningRules.isActive, true)
        )
      )
      .orderBy(desc(learningRules.confidence), desc(learningRules.occurrenceCount));
  }

  /**
   * Liste toutes les règles avec filtres optionnels.
   */
  async list(filter: RuleFilter = {}): Promise<LearningRule[]> {
    const db = await this.getDatabase();
    const conditions = [];

    if (filter.tenantId) {
      conditions.push(
        or(
          eq(learningRules.tenantId, filter.tenantId),
          eq(learningRules.tenantId, "global")
        )
      );
    }
    if (filter.ruleType) {
      conditions.push(eq(learningRules.ruleType, filter.ruleType));
    }
    if (filter.minConfidence !== undefined) {
      conditions.push(gte(learningRules.confidence, filter.minConfidence));
    }
    if (filter.isActive !== undefined) {
      conditions.push(eq(learningRules.isActive, filter.isActive));
    }

    const query = db
      .select()
      .from(learningRules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(learningRules.confidence), desc(learningRules.occurrenceCount));

    if (filter.limit) {
      return query.limit(filter.limit);
    }
    return query;
  }

  /**
   * Met à jour une règle existante.
   */
  async update(
    id: number,
    updates: Partial<Pick<LearningRule, "confidence" | "occurrenceCount" | "isActive" | "lastSeenAt" | "chosenReason">>
  ): Promise<LearningRule | undefined> {
    const db = await this.getDatabase();
    await db
      .update(learningRules)
      .set(updates)
      .where(eq(learningRules.id, id));
    return this.getById(id);
  }

  /**
   * Renforce une règle : incrémente le compteur et augmente la confiance.
   */
  async reinforce(id: number, confidenceBoost: number = 0.05): Promise<LearningRule | undefined> {
    const db = await this.getDatabase();
    await db
      .update(learningRules)
      .set({
        occurrenceCount: sql`${learningRules.occurrenceCount} + 1`,
        confidence: sql`LEAST(1.0, ${learningRules.confidence} + ${confidenceBoost})`,
        lastSeenAt: new Date(),
      })
      .where(eq(learningRules.id, id));
    return this.getById(id);
  }

  /**
   * Dégrade une règle : diminue la confiance.
   */
  async degrade(id: number, confidencePenalty: number = 0.1): Promise<LearningRule | undefined> {
    const db = await this.getDatabase();
    await db
      .update(learningRules)
      .set({
        confidence: sql`GREATEST(0.0, ${learningRules.confidence} - ${confidencePenalty})`,
        lastSeenAt: new Date(),
      })
      .where(eq(learningRules.id, id));

    // Si la confiance tombe sous 0.2, désactiver la règle
    const rule = await this.getById(id);
    if (rule && rule.confidence < 0.2) {
      await db
        .update(learningRules)
        .set({ isActive: false })
        .where(eq(learningRules.id, id));
      return this.getById(id);
    }
    return rule;
  }

  /**
   * Supprime une règle.
   */
  async delete(id: number): Promise<boolean> {
    const db = await this.getDatabase();
    await db
      .delete(learningRules)
      .where(eq(learningRules.id, id));
    return true;
  }

  /**
   * Supprime toutes les règles d'un tenant.
   */
  async deleteByTenant(tenantId: string): Promise<number> {
    const db = await this.getDatabase();
    await db
      .delete(learningRules)
      .where(eq(learningRules.tenantId, tenantId));
    return 0;
  }

  /**
   * Calcule les statistiques d'apprentissage pour un tenant.
   */
  async getStats(tenantId?: string): Promise<RuleStats> {
    const db = await this.getDatabase();
    const conditions = tenantId
      ? or(eq(learningRules.tenantId, tenantId), eq(learningRules.tenantId, "global"))
      : undefined;

    const allRules = await db
      .select()
      .from(learningRules)
      .where(conditions);

    const activeRules = allRules.filter((r) => r.isActive);
    const globalRules = allRules.filter((r) => r.tenantId === "global");
    const clientRules = allRules.filter((r) => r.tenantId !== "global");
    const avgConfidence =
      activeRules.length > 0
        ? activeRules.reduce((sum, r) => sum + r.confidence, 0) / activeRules.length
        : 0;
    const highConfidenceRules = activeRules.filter((r) => r.confidence >= 0.7);
    const autoResolvableRules = activeRules.filter(
      (r) => r.confidence >= 0.85 && r.occurrenceCount >= 3
    );

    return {
      totalRules: allRules.length,
      activeRules: activeRules.length,
      globalRules: globalRules.length,
      clientRules: clientRules.length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      highConfidenceRules: highConfidenceRules.length,
      autoResolvableRules: autoResolvableRules.length,
    };
  }

  /**
   * Exporte toutes les règles d'un tenant au format JSON.
   */
  async exportRules(tenantId: string): Promise<LearningRule[]> {
    const db = await this.getDatabase();
    return db
      .select()
      .from(learningRules)
      .where(
        or(
          eq(learningRules.tenantId, tenantId),
          eq(learningRules.tenantId, "global")
        )
      )
      .orderBy(desc(learningRules.confidence));
  }
}
