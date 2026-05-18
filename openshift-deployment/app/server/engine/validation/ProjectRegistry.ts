/**
 * ProjectRegistry — Registre centralisé des projets de test pour la validation.
 *
 * Gère deux catégories de projets :
 *   - REFERENCE : projets réels existants dans test-projects/
 *   - GENERATED : projets synthétiques créés par ProjectGenerator
 *
 * Chaque projet porte des métadonnées (patterns testés, assertions attendues)
 * et un historique de résultats de validation.
 *
 * @since v8.7
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProjectType = "REFERENCE" | "GENERATED";

export interface ProjectAssertion {
  /** Type d'assertion : service count, dto count, pattern absence, etc. */
  type:
    | "MIN_SERVICES"
    | "MIN_DTOS"
    | "MIN_CONTROLLERS"
    | "PATTERN_ABSENT"
    | "PATTERN_PRESENT"
    | "MIN_FILES"
    | "HAS_DOMAIN"
    | "BUILD_SUCCESS";
  /** Valeur attendue (nombre pour MIN_*, regex string pour PATTERN_*) */
  expected: string | number;
  /** Description humaine de l'assertion */
  description: string;
}

export interface ValidationResult {
  /** Date de la validation (ISO string) */
  date: string;
  /** Score global (0-100) */
  score: number;
  /** Build réussi ? */
  buildSuccess: boolean;
  /** Nombre d'erreurs de compilation */
  buildErrors: number;
  /** Nombre d'erreurs corrigées automatiquement */
  autoFixedErrors: number;
  /** Assertions passées / total */
  assertionsPassed: number;
  assertionsTotal: number;
  /** Détails des assertions échouées */
  failedAssertions: string[];
  /** Régressions détectées */
  regressions: string[];
  /** Nombre de fichiers générés */
  filesGenerated: number;
}

export interface TestProject {
  /** Identifiant unique du projet */
  id: string;
  /** Nom humain */
  name: string;
  /** Type : REFERENCE (réel) ou GENERATED (synthétique) */
  type: ProjectType;
  /** Chemin relatif vers les sources EJB */
  sourcePath: string;
  /** Patterns/technologies testés par ce projet */
  testedPatterns: string[];
  /** Assertions structurelles attendues */
  assertions: ProjectAssertion[];
  /** Dernier résultat de validation */
  lastResult?: ValidationResult;
  /** Historique des résultats (max 10) */
  history: ValidationResult[];
  /** Chemin vers le dernier snapshot validé */
  lastSnapshotPath?: string;
}

// ─── ProjectRegistry ────────────────────────────────────────────────────────

export class ProjectRegistry {
  private projects: Map<string, TestProject> = new Map();
  private persistPath: string;

  constructor(persistPath: string = "./data/project-registry.json") {
    this.persistPath = persistPath;
  }

  /**
   * Enregistrer un nouveau projet de test.
   */
  register(project: TestProject): void {
    if (this.projects.has(project.id)) {
      // Merge : garder l'historique existant
      const existing = this.projects.get(project.id)!;
      project.history = existing.history;
      project.lastResult = existing.lastResult;
      project.lastSnapshotPath = existing.lastSnapshotPath;
    }
    this.projects.set(project.id, project);
  }

  /**
   * Récupérer un projet par son ID.
   */
  get(id: string): TestProject | undefined {
    return this.projects.get(id);
  }

  /**
   * Récupérer tous les projets.
   */
  getAll(): TestProject[] {
    return Array.from(this.projects.values());
  }

  /**
   * Filtrer les projets par type.
   */
  getByType(type: ProjectType): TestProject[] {
    return this.getAll().filter((p) => p.type === type);
  }

  /**
   * Filtrer les projets par pattern testé.
   */
  getByPattern(pattern: string): TestProject[] {
    return this.getAll().filter((p) =>
      p.testedPatterns.some((tp) => tp.toLowerCase().includes(pattern.toLowerCase()))
    );
  }

  /**
   * Enregistrer un résultat de validation pour un projet.
   */
  recordResult(projectId: string, result: ValidationResult): void {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    project.lastResult = result;
    project.history.unshift(result);
    // Garder max 10 résultats
    if (project.history.length > 10) {
      project.history = project.history.slice(0, 10);
    }
  }

  /**
   * Mettre à jour le chemin du snapshot.
   */
  setSnapshotPath(projectId: string, snapshotPath: string): void {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    project.lastSnapshotPath = snapshotPath;
  }

  /**
   * Nombre total de projets.
   */
  count(): number {
    return this.projects.size;
  }

  /**
   * Statistiques du registre.
   */
  stats(): {
    total: number;
    reference: number;
    generated: number;
    lastValidated: number;
    avgScore: number;
  } {
    const all = this.getAll();
    const validated = all.filter((p) => p.lastResult);
    const scores = validated.map((p) => p.lastResult!.score);
    return {
      total: all.length,
      reference: all.filter((p) => p.type === "REFERENCE").length,
      generated: all.filter((p) => p.type === "GENERATED").length,
      lastValidated: validated.length,
      avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    };
  }

  /**
   * Persister le registre sur disque.
   */
  save(): void {
    const dir = path.dirname(this.persistPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = Array.from(this.projects.values());
    fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Charger le registre depuis le disque.
   */
  load(): void {
    if (!fs.existsSync(this.persistPath)) return;
    try {
      const raw = fs.readFileSync(this.persistPath, "utf-8");
      const data: TestProject[] = JSON.parse(raw);
      for (const project of data) {
        this.projects.set(project.id, project);
      }
    } catch {
      // Fichier corrompu — ignorer
    }
  }

  /**
   * Réinitialiser le registre (pour les tests).
   */
  clear(): void {
    this.projects.clear();
  }
}
