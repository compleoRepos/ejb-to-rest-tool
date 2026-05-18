/**
 * RegressionDetector — Compare la sortie courante avec le dernier snapshot validé
 * pour détecter les régressions structurelles.
 *
 * Types de régressions détectées :
 *   - FILE_REMOVED : un fichier présent dans le snapshot a disparu
 *   - SERVICE_LOST : un @Service a disparu
 *   - CONTROLLER_LOST : un @RestController a disparu
 *   - DTO_LOST : un DTO a disparu
 *   - ANNOTATION_LOST : une annotation Spring importante a disparu
 *   - IMPORT_REGRESSION : un import legacy réapparu (InitialContext, SessionFactory, etc.)
 *   - METHOD_LOST : une méthode publique a disparu d'un service
 *
 * @since v8.7
 */

import * as fs from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RegressionDetail {
  type:
    | "FILE_REMOVED"
    | "SERVICE_LOST"
    | "CONTROLLER_LOST"
    | "DTO_LOST"
    | "ANNOTATION_LOST"
    | "IMPORT_REGRESSION"
    | "METHOD_LOST";
  file: string;
  description: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
}

// ─── Patterns legacy interdits ──────────────────────────────────────────────

const LEGACY_PATTERNS = [
  "InitialContext",
  "javax.naming",
  "SessionFactory",
  "HibernateUtil",
  "EaiLog",
  "FwkRollbackException",
  "javax.ejb.Stateless",
  "javax.ejb.Stateful",
  "javax.ejb.MessageDriven",
  "javax.servlet.http.HttpServlet",
  "javax.jws.WebService",
  "ActionForm",
];

// ─── Extraction helpers ─────────────────────────────────────────────────────

function extractAnnotations(content: string): Set<string> {
  const annotations = new Set<string>();
  const regex = /@(\w+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    annotations.add(match[1]);
  }
  return annotations;
}

function extractPublicMethods(content: string): Set<string> {
  const methods = new Set<string>();
  const regex = /public\s+\w[\w<>,\s]*\s+(\w+)\s*\(/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    methods.add(match[1]);
  }
  return methods;
}

function isServiceFile(content: string): boolean {
  return content.includes("@Service");
}

function isControllerFile(content: string): boolean {
  return content.includes("@RestController");
}

function isDtoFile(filePath: string): boolean {
  return (
    filePath.includes("DTO") ||
    filePath.includes("Dto") ||
    filePath.includes("Request") ||
    filePath.includes("Response")
  );
}

// ─── Détection de régressions ───────────────────────────────────────────────

/**
 * Détecter les régressions entre la sortie courante et le snapshot précédent.
 * Retourne une liste de descriptions de régressions (strings pour compatibilité).
 */
export async function detectRegressions(
  currentOutput: Map<string, string>,
  snapshotPath: string
): Promise<string[]> {
  const details = detectRegressionDetails(currentOutput, snapshotPath);
  return details.map((d) => `[${d.severity}] ${d.type}: ${d.description} (${d.file})`);
}

/**
 * Détecter les régressions avec détails complets.
 */
export function detectRegressionDetails(
  currentOutput: Map<string, string>,
  snapshotPath: string
): RegressionDetail[] {
  const regressions: RegressionDetail[] = [];

  // Charger le snapshot
  let snapshot: Map<string, string>;
  try {
    const raw = fs.readFileSync(snapshotPath, "utf-8");
    const data = JSON.parse(raw) as Record<string, string>;
    snapshot = new Map(Object.entries(data));
  } catch {
    return []; // Pas de snapshot — pas de régression
  }

  // 1. Fichiers supprimés
  for (const [filePath, oldContent] of snapshot) {
    if (!filePath.endsWith(".java")) continue;

    if (!currentOutput.has(filePath)) {
      const severity = isServiceFile(oldContent) || isControllerFile(oldContent) ? "CRITICAL" : "WARNING";
      regressions.push({
        type: "FILE_REMOVED",
        file: filePath,
        description: `Fichier supprimé dans la nouvelle version`,
        severity,
      });
      continue;
    }

    const newContent = currentOutput.get(filePath)!;

    // 2. Service perdu
    if (isServiceFile(oldContent) && !isServiceFile(newContent)) {
      regressions.push({
        type: "SERVICE_LOST",
        file: filePath,
        description: `@Service supprimé`,
        severity: "CRITICAL",
      });
    }

    // 3. Controller perdu
    if (isControllerFile(oldContent) && !isControllerFile(newContent)) {
      regressions.push({
        type: "CONTROLLER_LOST",
        file: filePath,
        description: `@RestController supprimé`,
        severity: "CRITICAL",
      });
    }

    // 4. DTO perdu
    if (isDtoFile(filePath) && !currentOutput.has(filePath)) {
      regressions.push({
        type: "DTO_LOST",
        file: filePath,
        description: `DTO supprimé`,
        severity: "WARNING",
      });
    }

    // 5. Annotations Spring importantes perdues
    const oldAnnotations = extractAnnotations(oldContent);
    const newAnnotations = extractAnnotations(newContent);
    const importantAnnotations = [
      "Service",
      "RestController",
      "Repository",
      "Component",
      "Autowired",
      "Transactional",
      "Entity",
      "Table",
    ];
    for (const ann of importantAnnotations) {
      if (oldAnnotations.has(ann) && !newAnnotations.has(ann)) {
        regressions.push({
          type: "ANNOTATION_LOST",
          file: filePath,
          description: `@${ann} supprimé`,
          severity: ann === "Service" || ann === "RestController" ? "CRITICAL" : "WARNING",
        });
      }
    }

    // 6. Import legacy réapparu
    for (const pattern of LEGACY_PATTERNS) {
      const wasAbsent = !oldContent.includes(pattern);
      const nowPresent = newContent.includes(pattern);
      if (wasAbsent && nowPresent) {
        regressions.push({
          type: "IMPORT_REGRESSION",
          file: filePath,
          description: `Pattern legacy "${pattern}" réapparu`,
          severity: "CRITICAL",
        });
      }
    }

    // 7. Méthodes publiques perdues dans les services
    if (isServiceFile(oldContent) && isServiceFile(newContent)) {
      const oldMethods = extractPublicMethods(oldContent);
      const newMethods = extractPublicMethods(newContent);
      for (const method of oldMethods) {
        if (!newMethods.has(method)) {
          regressions.push({
            type: "METHOD_LOST",
            file: filePath,
            description: `Méthode publique "${method}" supprimée du service`,
            severity: "WARNING",
          });
        }
      }
    }
  }

  return regressions;
}

/**
 * Comparer deux Maps de fichiers et retourner un résumé des différences.
 */
export function diffSummary(
  oldFiles: Map<string, string>,
  newFiles: Map<string, string>
): {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: string[];
} {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];

  // Fichiers ajoutés ou modifiés
  for (const [filePath, newContent] of newFiles) {
    if (!oldFiles.has(filePath)) {
      added.push(filePath);
    } else if (oldFiles.get(filePath) !== newContent) {
      modified.push(filePath);
    } else {
      unchanged.push(filePath);
    }
  }

  // Fichiers supprimés
  for (const filePath of oldFiles.keys()) {
    if (!newFiles.has(filePath)) {
      removed.push(filePath);
    }
  }

  return { added, removed, modified, unchanged };
}
