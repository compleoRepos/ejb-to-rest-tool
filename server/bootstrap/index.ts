/**
 * Bootstrap — Orchestrateur Code First.
 *
 * Appelé au démarrage du serveur, AVANT le listen().
 * 1. Auto-migration : crée les tables MySQL à partir des migrations Drizzle
 * 2. Auto-seed : insère les règles pré-définies dans learning_rules
 *
 * Si DATABASE_URL n'est pas défini, le bootstrap est ignoré silencieusement
 * (mode sans DB, utile pour le dev frontend uniquement).
 *
 * @author Hamza NORDINE
 */

import { autoMigrate } from "./auto-migrate";
import { autoSeedRules } from "./auto-seed";

export interface BootstrapResult {
  success: boolean;
  migration: {
    applied: string[];
    skipped: string[];
    errors: string[];
  };
  seed: {
    inserted: number;
    skipped: number;
    errors: string[];
    totalRules: number;
  };
  durationMs: number;
}

/**
 * Exécute le bootstrap complet : migration + seed.
 * Retourne un résumé détaillé de l'opération.
 */
export async function bootstrap(): Promise<BootstrapResult> {
  const start = Date.now();

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn("[Bootstrap] DATABASE_URL non défini — bootstrap ignoré (mode sans DB)");
    return {
      success: false,
      migration: { applied: [], skipped: [], errors: ["DATABASE_URL non défini"] },
      seed: { inserted: 0, skipped: 0, errors: ["DATABASE_URL non défini"], totalRules: 0 },
      durationMs: Date.now() - start,
    };
  }

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║           COMPLEO — Bootstrap Code First                ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // ── Étape 1 : Auto-migration ──────────────────────────────────
  console.log("\n[Bootstrap] ── Étape 1/2 : Auto-migration des tables ──");
  const migrationResult = await autoMigrate(databaseUrl);

  // ── Étape 2 : Auto-seed des règles ────────────────────────────
  console.log("\n[Bootstrap] ── Étape 2/2 : Seed des règles pré-définies ──");
  const seedResult = await autoSeedRules(databaseUrl);

  const durationMs = Date.now() - start;
  const hasErrors = migrationResult.errors.length > 0 || seedResult.errors.length > 0;

  // ── Résumé ────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║           Bootstrap — Résumé                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Migrations : ${migrationResult.applied.length} appliquées, ${migrationResult.skipped.length} ignorées`);
  console.log(`║  Règles     : ${seedResult.inserted} insérées, ${seedResult.skipped} ignorées (sur ${seedResult.totalRules})`);
  console.log(`║  Durée      : ${durationMs}ms`);
  console.log(`║  Statut     : ${hasErrors ? "⚠ Avec erreurs" : "✓ Succès"}`);
  if (hasErrors) {
    console.log("║  Erreurs    :");
    for (const e of [...migrationResult.errors, ...seedResult.errors]) {
      console.log(`║    - ${e.slice(0, 60)}`);
    }
  }
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  return {
    success: !hasErrors,
    migration: migrationResult,
    seed: seedResult,
    durationMs,
  };
}
