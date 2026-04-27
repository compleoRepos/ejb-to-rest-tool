/**
 * SagaCandidateRegistry — Compleo v8.2
 *
 * Decouple la detection de la generation.
 * Chaque candidat est enregistre dans le registre, puis genere
 * par un appel de fonction INDEPENDANT (pas par une iteration de boucle).
 *
 * Workflow :
 *   1. saga-detector.ts trouve les candidats → les enregistre dans le registre
 *   2. Le registre valide chaque candidat (deps, writeOps)
 *   3. Pour chaque entree du registre → appel SEPARE a generateOneSaga()
 *   4. Assertion finale : registre.size === fichiers generes
 *
 * @author Compleo
 */

import type { SagaCandidate } from "./saga-detector";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SagaRegistryEntry {
  domain: string;
  className: string;
  ejbDepsCount: number;
  writeOpsCount: number;
  generated: boolean;
  generatedFiles: string[];
  error: string | null;
}

export interface SagaRegistrySummary {
  total: number;
  generated: number;
  failed: number;
  missing: string[];
}

// ── Registry ─────────────────────────────────────────────────────────────────

export class SagaCandidateRegistry {
  private entries: Map<string, SagaRegistryEntry> = new Map();

  /**
   * Enregistre un candidat Saga dans le registre.
   * Cle unique = le domaine. Les doublons sont ignores.
   */
  register(candidate: SagaCandidate): void {
    const key = candidate.domain;
    if (this.entries.has(key)) {
      console.warn(`[SAGA-REG] Doublon ignore pour domain=${key}`);
      return;
    }
    this.entries.set(key, {
      domain: candidate.domain,
      className: candidate.className,
      ejbDepsCount: candidate.ejbDependencies.length,
      writeOpsCount: candidate.writeOperations.length,
      generated: false,
      generatedFiles: [],
      error: null,
    });
    console.log(
      `[SAGA-REG] Enregistre: ${key} (${candidate.className}, ` +
        `${candidate.ejbDependencies.length} deps, ${candidate.writeOperations.length} writeOps)`,
    );
  }

  /**
   * Retourne toutes les entrees du registre.
   */
  getAll(): SagaRegistryEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Retourne le nombre d'entrees dans le registre.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Marque un domaine comme genere avec succes.
   */
  markGenerated(domain: string, files: string[]): void {
    const entry = this.entries.get(domain);
    if (entry) {
      entry.generated = true;
      entry.generatedFiles = files;
    }
  }

  /**
   * Marque un domaine comme echoue.
   */
  markFailed(domain: string, error: string): void {
    const entry = this.entries.get(domain);
    if (entry) {
      entry.generated = false;
      entry.error = error;
    }
  }

  /**
   * Assertion finale — combien ont reussi ?
   */
  getSummary(): SagaRegistrySummary {
    const total = this.entries.size;
    const generated = [...this.entries.values()].filter((e) => e.generated).length;
    const failed = total - generated;
    const missing = [...this.entries.values()]
      .filter((e) => !e.generated)
      .map((e) => `${e.domain} (${e.className}): ${e.error ?? "non genere"}`);
    return { total, generated, failed, missing };
  }
}
