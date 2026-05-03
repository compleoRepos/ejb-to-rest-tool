/**
 * JdbcPostProcessor — Post-processeur async pour la migration JDBC via LLM.
 *
 * Après la génération synchrone du projet Spring Boot, ce module :
 *   1. Scanne tous les fichiers générés pour trouver les placeholders @@JDBC_LLM_BLOCK_*@@
 *      et @@DAO_LLM_BLOCK_*@@
 *   2. Extrait le contexte JDBC de chaque placeholder (code legacy, tables, entity, etc.)
 *   3. Appelle le LLM pour migrer chaque bloc
 *   4. Remplace les placeholders par le code migré avec commentaires métier
 *
 * @since v10.11
 */

import {
  BusinessLogicMigrator,
  type JdbcMigrationContext,
  type JdbcMigrationResult,
} from "./BusinessLogicMigrator";
import type { JdbcBlock } from "../BusinessLogicTransformer";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface GeneratedFileRef {
  path: string;
  content: string;
  category?: string;
}

export interface PostProcessResult {
  /** Fichiers avec les placeholders remplacés */
  files: GeneratedFileRef[];
  /** Nombre de blocs migrés avec succès */
  migratedCount: number;
  /** Nombre de blocs en fallback (LLM indisponible) */
  fallbackCount: number;
  /** Avertissements */
  warnings: string[];
  /** Détails par bloc */
  blockResults: Array<{
    blockId: string;
    success: boolean;
    confidence: number;
    backend?: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════
// PLACEHOLDER PATTERNS
// ═══════════════════════════════════════════════════════════════════════

/** Pattern pour les placeholders JDBC du BusinessLogicTransformer */
const JDBC_BLOCK_PATTERN = /\/\/\s*@@(JDBC_LLM_BLOCK_\d+)@@/g;

/** Pattern pour les placeholders DAO du dao-splitter */
const DAO_BLOCK_PATTERN = /\/\/\s*@@(DAO_LLM_BLOCK_\w+)@@/g;

/** Pattern combiné pour détecter tout placeholder LLM */
const ANY_LLM_BLOCK_PATTERN = /\/\/\s*@@((?:JDBC|DAO)_LLM_BLOCK_\w+)@@/g;

// ═══════════════════════════════════════════════════════════════════════
// POST-PROCESSOR
// ═══════════════════════════════════════════════════════════════════════

export class JdbcPostProcessor {
  private migrator: BusinessLogicMigrator;

  constructor(ollamaUrl?: string) {
    this.migrator = new BusinessLogicMigrator(ollamaUrl);
  }

  /**
   * Post-traite tous les fichiers générés pour remplacer les placeholders LLM.
   *
   * @param files - Fichiers générés par le pipeline synchrone
   * @param jdbcBlocks - Blocs JDBC collectés par le BusinessLogicTransformer
   * @param basePackage - Package de base du projet
   * @param entityFiles - Fichiers Entity JPA générés (pour le contexte LLM)
   * @param repositoryFiles - Fichiers Repository JPA générés (pour le contexte LLM)
   */
  async processAll(
    files: GeneratedFileRef[],
    jdbcBlocks: JdbcBlock[],
    basePackage: string,
    entityFiles?: GeneratedFileRef[],
    repositoryFiles?: GeneratedFileRef[],
  ): Promise<PostProcessResult> {
    const warnings: string[] = [];
    const blockResults: PostProcessResult["blockResults"] = [];
    let migratedCount = 0;
    let fallbackCount = 0;

    // Indexer les fichiers Entity et Repository par nom
    const entityIndex = new Map<string, string>();
    const repoIndex = new Map<string, string>();

    for (const f of entityFiles ?? []) {
      const name = f.path.split("/").pop()?.replace(".java", "") ?? "";
      entityIndex.set(name, f.content);
    }
    for (const f of repositoryFiles ?? []) {
      const name = f.path.split("/").pop()?.replace(".java", "") ?? "";
      repoIndex.set(name, f.content);
    }

    // Indexer les blocs JDBC par blockId
    const blockIndex = new Map<string, JdbcBlock>();
    for (const block of jdbcBlocks) {
      blockIndex.set(block.blockId, block);
    }

    // Traiter chaque fichier
    const processedFiles: GeneratedFileRef[] = [];

    for (const file of files) {
      if (!file.content.includes("@@") || !file.path.endsWith(".java")) {
        processedFiles.push(file);
        continue;
      }

      let content = file.content;

      // Trouver tous les placeholders dans ce fichier
      const placeholders = this.extractPlaceholders(content);

      if (placeholders.length === 0) {
        processedFiles.push(file);
        continue;
      }

      // Migrer chaque placeholder
      for (const placeholder of placeholders) {
        const { blockId, fullMatch } = placeholder;

        // Construire le contexte de migration
        const migrationCtx = this.buildMigrationContext(
          blockId,
          content,
          blockIndex,
          entityIndex,
          repoIndex,
          basePackage,
        );

        if (!migrationCtx) {
          warnings.push(`Contexte introuvable pour ${blockId} — placeholder conservé`);
          continue;
        }

        // Appeler le LLM pour la migration
        const result = await this.migrator.migrateJdbcBlock(migrationCtx);

        if (result.success) {
          // Remplacer le placeholder et les lignes de métadonnées associées
          content = this.replacePlaceholderBlock(content, blockId, result.migratedCode);
          migratedCount++;
        } else {
          // Fallback : remplacer quand même avec le code fallback
          content = this.replacePlaceholderBlock(content, blockId, result.migratedCode);
          fallbackCount++;
          warnings.push(...result.warnings);
        }

        blockResults.push({
          blockId,
          success: result.success,
          confidence: result.confidence,
          backend: result.backend,
        });
      }

      processedFiles.push({ ...file, content });
    }

    return {
      files: processedFiles,
      migratedCount,
      fallbackCount,
      warnings,
      blockResults,
    };
  }

  /**
   * Extrait tous les placeholders LLM d'un fichier.
   */
  private extractPlaceholders(content: string): Array<{ blockId: string; fullMatch: string }> {
    const results: Array<{ blockId: string; fullMatch: string }> = [];
    const regex = new RegExp(ANY_LLM_BLOCK_PATTERN.source, "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      results.push({
        blockId: match[1],
        fullMatch: match[0],
      });
    }

    return results;
  }

  /**
   * Construit le contexte de migration pour un bloc donné.
   */
  private buildMigrationContext(
    blockId: string,
    fileContent: string,
    blockIndex: Map<string, JdbcBlock>,
    entityIndex: Map<string, string>,
    repoIndex: Map<string, string>,
    basePackage: string,
  ): JdbcMigrationContext | null {
    // Cas 1 : Bloc JDBC du BusinessLogicTransformer
    const jdbcBlock = blockIndex.get(blockId);
    if (jdbcBlock) {
      // Trouver l'Entity et le Repository correspondants
      const entityName = this.inferEntityFromTables(jdbcBlock.tables, entityIndex);
      const repoName = entityName ? entityName + "Repository" : undefined;

      return {
        sourceClassName: jdbcBlock.sourceClassName,
        methodName: jdbcBlock.methodName,
        jdbcCode: jdbcBlock.code,
        sqlConstants: jdbcBlock.sqlConstants,
        entityCode: entityName ? entityIndex.get(entityName) : undefined,
        repositoryCode: repoName ? repoIndex.get(repoName) : undefined,
        referencedTables: jdbcBlock.tables,
        dataSources: jdbcBlock.dataSources,
        repositoryName: repoName,
        entityName,
        basePackage,
      };
    }

    // Cas 2 : Bloc DAO du dao-splitter (métadonnées encodées dans les commentaires)
    if (blockId.startsWith("DAO_LLM_BLOCK_")) {
      return this.extractDaoBlockContext(blockId, fileContent, entityIndex, repoIndex, basePackage);
    }

    return null;
  }

  /**
   * Extrait le contexte d'un bloc DAO depuis les commentaires encodés.
   */
  private extractDaoBlockContext(
    blockId: string,
    fileContent: string,
    entityIndex: Map<string, string>,
    repoIndex: Map<string, string>,
    basePackage: string,
  ): JdbcMigrationContext | null {
    // Extraire les métadonnées des commentaires après le placeholder
    const blockPos = fileContent.indexOf(`@@${blockId}@@`);
    if (blockPos === -1) return null;

    const afterBlock = fileContent.substring(blockPos, blockPos + 3000);
    const lines = afterBlock.split("\n");

    // Extraire le corps JDBC
    let jdbcCode = "";
    let inBody = false;
    for (const line of lines) {
      if (line.includes("DAO_JDBC_BODY_START")) { inBody = true; continue; }
      if (line.includes("DAO_JDBC_BODY_END")) { inBody = false; continue; }
      if (inBody) {
        // Supprimer le préfixe de commentaire
        jdbcCode += line.replace(/^\s*\/\/\s?/, "") + "\n";
      }
    }

    // Extraire les métadonnées
    const tablesMatch = afterBlock.match(/\/\/\s*TABLES:\s*(.+)/);
    const dsMatch = afterBlock.match(/\/\/\s*DATASOURCES:\s*(.+)/);
    const returnMatch = afterBlock.match(/\/\/\s*RETURN_TYPE:\s*(.+)/);
    const entityMatch = afterBlock.match(/\/\/\s*ENTITY:\s*(.+)/);
    const methodMatch = afterBlock.match(/\/\/\s*METHOD:\s*(.+)/);

    const tables = tablesMatch ? tablesMatch[1].trim().split(",").filter(t => t !== "N/A") : [];
    const dataSources = dsMatch ? dsMatch[1].trim().split(",").filter(d => d !== "default") : [];
    const entityName = entityMatch ? entityMatch[1].trim() : undefined;
    const methodName = methodMatch ? methodMatch[1].trim() : "unknown";
    const repoName = entityName ? entityName + "Repository" : undefined;

    // Extraire le className du fichier
    const classMatch = fileContent.match(/public class (\w+)/);
    const sourceClassName = classMatch ? classMatch[1] : "Unknown";

    return {
      sourceClassName,
      methodName,
      jdbcCode: jdbcCode.trim() || `// Code JDBC original non disponible pour ${blockId}`,
      sqlConstants: [],
      entityCode: entityName ? entityIndex.get(entityName) : undefined,
      repositoryCode: repoName ? repoIndex.get(repoName) : undefined,
      referencedTables: tables,
      dataSources,
      repositoryName: repoName,
      entityName,
      basePackage,
    };
  }

  /**
   * Infère le nom de l'Entity à partir des tables SQL référencées.
   */
  private inferEntityFromTables(
    tables: string[],
    entityIndex: Map<string, string>,
  ): string | undefined {
    // Mapping tables → entities courant
    const tableEntityMap: Record<string, string> = {
      "T_COMPTES": "TComptes",
      "MAD_MAD": "MadMad",
      "MAD_BENEFICIAIRE": "MadBeneficiaire",
      "MAD_BENEF": "MadBeneficiaire",
      "COMPTE_CLIENT": "CompteClient",
      "CATEGORIE": "Categorie",
      "MAD_PLAFOND": "MadPlafondMontant",
      "NOTIFICATION": "Notification",
    };

    for (const table of tables) {
      const mapped = tableEntityMap[table.toUpperCase()];
      if (mapped && entityIndex.has(mapped)) return mapped;
    }

    // Essayer de trouver par nom similaire
    for (const table of tables) {
      const normalized = table.replace(/_/g, "").toLowerCase();
      for (const [entityName] of entityIndex) {
        if (entityName.toLowerCase() === normalized) return entityName;
      }
    }

    return undefined;
  }

  /**
   * Remplace un placeholder et ses lignes de métadonnées par le code migré.
   */
  private replacePlaceholderBlock(
    content: string,
    blockId: string,
    migratedCode: string,
  ): string {
    // Trouver la ligne du placeholder
    const lines = content.split("\n");
    const result: string[] = [];
    let skipMetadata = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes(`@@${blockId}@@`)) {
        // Remplacer le placeholder par le code migré
        result.push(migratedCode);
        skipMetadata = true;
        continue;
      }

      if (skipMetadata) {
        // Sauter les lignes de métadonnées (commentaires // TABLES:, // ENTITY:, etc.)
        const trimmed = line.trim();
        if (
          trimmed.startsWith("// JDBC_BODY:") ||
          trimmed.startsWith("// TABLES:") ||
          trimmed.startsWith("// DATASOURCES:") ||
          trimmed.startsWith("// RETURN_TYPE:") ||
          trimmed.startsWith("// ENTITY:") ||
          trimmed.startsWith("// METHOD:") ||
          trimmed.startsWith("// DAO_JDBC_BODY_START") ||
          trimmed.startsWith("// DAO_JDBC_BODY_END") ||
          (trimmed.startsWith("//") && skipMetadata && !trimmed.startsWith("// ───"))
        ) {
          continue; // Sauter cette ligne de métadonnées
        }

        // Sauter la ligne "log.info(...en attente de migration LLM...)"
        if (trimmed.includes("en attente de migration LLM")) {
          continue;
        }

        skipMetadata = false;
        result.push(line);
      } else {
        result.push(line);
      }
    }

    return result.join("\n");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Vérifie si des fichiers contiennent des placeholders LLM non résolus.
 */
export function hasUnresolvedPlaceholders(files: GeneratedFileRef[]): boolean {
  for (const file of files) {
    ANY_LLM_BLOCK_PATTERN.lastIndex = 0; // Reset BEFORE test to avoid stale state
    if (ANY_LLM_BLOCK_PATTERN.test(file.content)) {
      ANY_LLM_BLOCK_PATTERN.lastIndex = 0; // Reset after match too
      return true;
    }
  }
  return false;
}

/**
 * Compte le nombre de placeholders non résolus.
 */
export function countUnresolvedPlaceholders(files: GeneratedFileRef[]): number {
  let count = 0;
  for (const file of files) {
    const regex = new RegExp(ANY_LLM_BLOCK_PATTERN.source, "g");
    const matches = file.content.match(regex);
    if (matches) count += matches.length;
  }
  return count;
}
