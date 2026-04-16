/**
 * Saga Pipeline — Compleo v8.2
 *
 * Orchestre la generation multi-saga via le SagaCandidateRegistry.
 * Chaque candidat est genere par un appel SEPARE (pas une boucle .map()),
 * ce qui garantit que chaque domaine est traite independamment.
 *
 * Workflow :
 *   1. Recevoir les candidats depuis saga-detector
 *   2. Enregistrer chaque candidat dans le registre
 *   3. Generer chaque saga via un appel separe
 *   4. Assertion finale : registre.size === resultats.length
 *
 * @author Hamza NORDINE
 */

import type { SagaCandidate } from "./saga-detector";
import type { SagaGenerationResult } from "./saga-generator";
import { generateSaga, generateSagaWithML } from "./saga-generator";
import { generateSharedSagaFiles } from "./saga-shared-generators";
import { SagaCandidateRegistry } from "./saga-candidate-registry";
import type { SagaMLEnricher } from "./ml/SagaMLEnricher";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SagaPipelineResult {
  results: SagaGenerationResult[];
  registry: SagaCandidateRegistry;
  summary: {
    total: number;
    generated: number;
    failed: number;
    missing: string[];
  };
}

// ── Pipeline (rule-based) ────────────────────────────────────────────────────

/**
 * Pipeline multi-saga rule-based.
 * Chaque candidat est genere par un appel SEPARE a generateSaga().
 */
export function runSagaPipeline(
  candidates: SagaCandidate[],
  basePackage: string,
): SagaPipelineResult {
  const registry = new SagaCandidateRegistry();

  // 1. Enregistrer chaque candidat (dedup par domaine dans le registre)
  for (const c of candidates) {
    registry.register(c);
  }

  console.log(`[SAGA-PIPE] Registre: ${registry.size} domaines uniques`);

  // 2. Generer chaque saga par appel SEPARE
  const results: SagaGenerationResult[] = [];
  for (const entry of registry.getAll()) {
    // Trouver le candidat correspondant au domaine
    const candidate = candidates.find((c) => c.domain === entry.domain);
    if (!candidate) {
      registry.markFailed(entry.domain, "Candidat introuvable");
      continue;
    }

    try {
      const result = generateSaga(candidate, basePackage);
      registry.markGenerated(entry.domain, result.files.map((f) => f.path));
      results.push(result);
      console.log(
        `[SAGA-PIPE] OK: ${entry.domain} → ${result.files.length} fichiers`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      registry.markFailed(entry.domain, msg);
      console.error(`[SAGA-PIPE] FAIL: ${entry.domain} — ${msg}`);
    }
  }

  // 3. Fichiers partages — generes 1 seule fois, ajoutes au premier resultat
  if (results.length > 0) {
    const deduped = candidates.filter(
      (c, i, arr) => arr.findIndex((x) => x.domain === c.domain) === i,
    );
    const sharedFiles = generateSharedSagaFiles(basePackage, deduped);
    results[0].files = [...results[0].files, ...sharedFiles];
  }

  // 4. Assertion finale
  const summary = registry.getSummary();
  console.log(
    `[SAGA-PIPE] Terminé: ${summary.generated}/${summary.total} sagas générées`,
  );
  if (summary.failed > 0) {
    console.warn(`[SAGA-PIPE] ${summary.failed} sagas échouées:`, summary.missing);
  }

  return { results, registry, summary };
}

// ── Pipeline (ML-enhanced) ───────────────────────────────────────────────────

/**
 * Pipeline multi-saga ML-enhanced.
 * Chaque candidat est genere par un appel SEPARE a generateSagaWithML().
 */
export async function runSagaPipelineWithML(
  candidates: SagaCandidate[],
  basePackage: string,
  mlEnricher: SagaMLEnricher,
): Promise<SagaPipelineResult> {
  const registry = new SagaCandidateRegistry();

  // 1. Enregistrer chaque candidat
  for (const c of candidates) {
    registry.register(c);
  }

  console.log(`[SAGA-PIPE-ML] Registre: ${registry.size} domaines uniques`);

  // 2. Generer chaque saga par appel SEPARE (async)
  const results: SagaGenerationResult[] = [];
  for (const entry of registry.getAll()) {
    const candidate = candidates.find((c) => c.domain === entry.domain);
    if (!candidate) {
      registry.markFailed(entry.domain, "Candidat introuvable");
      continue;
    }

    try {
      const result = await generateSagaWithML(candidate, basePackage, mlEnricher);
      registry.markGenerated(entry.domain, result.files.map((f) => f.path));
      results.push(result);
      console.log(
        `[SAGA-PIPE-ML] OK: ${entry.domain} → ${result.files.length} fichiers`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      registry.markFailed(entry.domain, msg);
      console.error(`[SAGA-PIPE-ML] FAIL: ${entry.domain} — ${msg}`);
    }
  }

  // 3. Fichiers partages
  if (results.length > 0) {
    const deduped = candidates.filter(
      (c, i, arr) => arr.findIndex((x) => x.domain === c.domain) === i,
    );
    const sharedFiles = generateSharedSagaFiles(basePackage, deduped);
    results[0].files = [...results[0].files, ...sharedFiles];
  }

  // 4. Assertion finale
  const summary = registry.getSummary();
  console.log(
    `[SAGA-PIPE-ML] Terminé: ${summary.generated}/${summary.total} sagas générées`,
  );

  return { results, registry, summary };
}
