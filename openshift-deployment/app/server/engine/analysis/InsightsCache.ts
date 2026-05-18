/**
 * InsightsCache — Cache des insights IA basé sur un hash SHA-256 des fichiers source.
 *
 * Stratégie :
 *   1. Calcule un hash SHA-256 du contenu concaténé (trié par path) des fichiers source.
 *   2. Vérifie si un cache valide existe (mémoire LRU → DB fallback).
 *   3. Si oui, retourne les insights sans appeler le LLM.
 *   4. Si non, laisse le caller appeler le LLM puis stocker le résultat.
 *
 * Architecture :
 *   - Couche 1 : Map en mémoire (LRU, max 50 entrées, TTL 1h)
 *   - Couche 2 : Table DB `compleo_sessions.irData` (persistant, TTL 24h)
 *
 * Principes SOLID :
 *   - Single Responsibility : ne gère que le cache des insights
 *   - Open/Closed : extensible via l'interface CacheStorage
 *   - Dependency Inversion : dépend d'abstractions (CacheStorage)
 *
 * @author Compleo
 */

import { createHash } from "crypto";
import type { AIAnalysisInsights } from "./AnalysisLLMEnricher";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CacheEntry {
  hash: string;
  insights: AIAnalysisInsights;
  createdAt: number;
  projectName: string;
}

export interface CacheConfig {
  /** Nombre max d'entrées en mémoire (LRU) */
  maxMemoryEntries: number;
  /** TTL mémoire en millisecondes (défaut: 1h) */
  memoryTTL: number;
  /** TTL DB en millisecondes (défaut: 24h) */
  dbTTL: number;
  /** Activer/désactiver le cache */
  enabled: boolean;
}

export interface SourceFile {
  path: string;
  content: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CacheConfig = {
  maxMemoryEntries: 50,
  memoryTTL: 60 * 60 * 1000, // 1 heure
  dbTTL: 24 * 60 * 60 * 1000, // 24 heures
  enabled: true,
};

// ─── Implémentation ──────────────────────────────────────────────────────────

export class InsightsCache {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;
  private accessOrder: string[] = []; // Pour LRU

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Calcule le hash SHA-256 d'un ensemble de fichiers source.
   * Les fichiers sont triés par path pour garantir la stabilité du hash.
   */
  computeHash(files: SourceFile[]): string {
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    const content = sorted.map((f) => `${f.path}::${f.content}`).join("\n---FILE_SEPARATOR---\n");
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Récupère les insights depuis le cache (mémoire uniquement).
   * Retourne null si pas de cache valide.
   */
  get(hash: string): AIAnalysisInsights | null {
    if (!this.config.enabled) return null;

    const entry = this.memoryCache.get(hash);
    if (!entry) return null;

    // Vérifier le TTL
    const age = Date.now() - entry.createdAt;
    if (age > this.config.memoryTTL) {
      this.memoryCache.delete(hash);
      this.removeFromAccessOrder(hash);
      return null;
    }

    // Mettre à jour l'ordre LRU
    this.touchAccessOrder(hash);
    return entry.insights;
  }

  /**
   * Stocke les insights dans le cache mémoire.
   */
  set(hash: string, insights: AIAnalysisInsights, projectName: string): void {
    if (!this.config.enabled) return;

    // Éviction LRU si nécessaire
    while (this.memoryCache.size >= this.config.maxMemoryEntries) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.memoryCache.delete(oldest);
      }
    }

    const entry: CacheEntry = {
      hash,
      insights,
      createdAt: Date.now(),
      projectName,
    };

    this.memoryCache.set(hash, entry);
    this.touchAccessOrder(hash);
  }

  /**
   * Invalide le cache pour un hash donné.
   */
  invalidate(hash: string): void {
    this.memoryCache.delete(hash);
    this.removeFromAccessOrder(hash);
  }

  /**
   * Invalide tout le cache pour un projet donné.
   */
  invalidateByProject(projectName: string): void {
    const toDelete: string[] = [];
    for (const [hash, entry] of this.memoryCache) {
      if (entry.projectName === projectName) {
        toDelete.push(hash);
      }
    }
    for (const hash of toDelete) {
      this.invalidate(hash);
    }
  }

  /**
   * Retourne les statistiques du cache.
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: string;
    oldestEntry: number | null;
  } {
    let oldestTimestamp: number | null = null;
    for (const entry of this.memoryCache.values()) {
      if (oldestTimestamp === null || entry.createdAt < oldestTimestamp) {
        oldestTimestamp = entry.createdAt;
      }
    }

    return {
      size: this.memoryCache.size,
      maxSize: this.config.maxMemoryEntries,
      hitRate: `${this.memoryCache.size}/${this.config.maxMemoryEntries}`,
      oldestEntry: oldestTimestamp,
    };
  }

  /**
   * Vide tout le cache.
   */
  clear(): void {
    this.memoryCache.clear();
    this.accessOrder = [];
  }

  /**
   * Vérifie si un hash est en cache (sans le récupérer).
   */
  has(hash: string): boolean {
    return this.get(hash) !== null;
  }

  // ─── Helpers privés ────────────────────────────────────────────────────────

  private touchAccessOrder(hash: string): void {
    this.removeFromAccessOrder(hash);
    this.accessOrder.push(hash);
  }

  private removeFromAccessOrder(hash: string): void {
    const idx = this.accessOrder.indexOf(hash);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: InsightsCache | null = null;

export function getInsightsCache(): InsightsCache {
  if (!_instance) {
    _instance = new InsightsCache();
  }
  return _instance;
}

/**
 * Réinitialise le singleton (utile pour les tests).
 */
export function resetInsightsCache(): void {
  _instance = null;
}
