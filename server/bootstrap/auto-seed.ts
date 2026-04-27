/**
 * Auto-seed — Insère les règles pré-définies au démarrage si la table est vide.
 *
 * Approche : INSERT IGNORE pour l'idempotence.
 * Ne réinsère pas les règles déjà existantes (basé sur ruleType + chosenOption + patterns).
 *
 * Log détaillé : "starting table" / "completed table" / "skipped" (0 lignes).
 *
 * @author Compleo
 */

import mysql from "mysql2/promise";
import { globalSeedRules } from "../learning/seeds/global-rules";
import type { InsertLearningRule } from "../../drizzle/schema";

interface SeedResult {
  inserted: number;
  skipped: number;
  errors: string[];
  totalRules: number;
}

/**
 * Insère les règles globales dans learning_rules si elles n'existent pas déjà.
 * Utilise un INSERT ... ON DUPLICATE KEY UPDATE pour l'idempotence.
 */
export async function autoSeedRules(databaseUrl: string): Promise<SeedResult> {
  const result: SeedResult = {
    inserted: 0,
    skipped: 0,
    errors: [],
    totalRules: globalSeedRules.length,
  };

  let connection: mysql.Connection | null = null;

  try {
    connection = await mysql.createConnection(databaseUrl);

    console.log(`[AutoSeed] starting table: learning_rules (${globalSeedRules.length} règles à vérifier)`);

    // Vérifier si la table existe
    try {
      await connection.execute("SELECT 1 FROM `learning_rules` LIMIT 1");
    } catch {
      console.warn("[AutoSeed] Table learning_rules n'existe pas encore — seed reporté");
      result.errors.push("Table learning_rules inexistante");
      return result;
    }

    // Compter les règles existantes de type "seed"
    const [countRows] = await connection.execute(
      "SELECT COUNT(*) as cnt FROM `learning_rules` WHERE `source_project` = 'seed'"
    );
    const existingCount = (countRows as any[])[0]?.cnt || 0;

    if (existingCount >= globalSeedRules.length) {
      console.log(
        `[AutoSeed] completed table: learning_rules — skipped (${existingCount} règles seed déjà présentes)`
      );
      result.skipped = globalSeedRules.length;
      return result;
    }

    // Insérer les règles manquantes une par une (INSERT IGNORE pattern)
    for (const rule of globalSeedRules) {
      try {
        // Vérifier si cette règle existe déjà
        const exists = await ruleExists(connection, rule);
        if (exists) {
          result.skipped++;
          continue;
        }

        // Insérer la règle
        await connection.execute(
          `INSERT INTO \`learning_rules\` (
            \`tenant_id\`, \`rule_type\`,
            \`pattern_class_name\`, \`pattern_method_name\`, \`pattern_package\`,
            \`pattern_javadoc\`, \`pattern_annotations\`,
            \`pattern_return_type\`, \`pattern_param_types\`,
            \`chosen_option\`, \`chosen_reason\`,
            \`occurrence_count\`, \`confidence\`, \`is_active\`,
            \`source_project\`, \`source_session_id\`, \`confirmed_by_user\`,
            \`last_seen_at\`, \`created_at\`
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            rule.tenantId ?? "global",
            rule.ruleType,
            rule.patternClassName ?? null,
            rule.patternMethodName ?? null,
            rule.patternPackage ?? null,
            rule.patternJavadoc ?? null,
            rule.patternAnnotations ?? null,
            rule.patternReturnType ?? null,
            rule.patternParamTypes ?? null,
            rule.chosenOption ?? "",
            rule.chosenReason ?? null,
            rule.occurrenceCount ?? 1,
            rule.confidence ?? 0.5,
            rule.isActive ?? true,
            rule.sourceProject ?? "seed",
            rule.sourceSessionId ?? null,
            rule.confirmedByUser ?? false,
          ]
        );

        result.inserted++;
      } catch (err: any) {
        // Ignorer les doublons (ER_DUP_ENTRY)
        if (err?.code === "ER_DUP_ENTRY" || err?.errno === 1062) {
          result.skipped++;
        } else {
          const errMsg = `Règle ${rule.ruleType}/${rule.chosenOption}: ${err.message}`;
          console.error(`[AutoSeed]   ✗ ${errMsg}`);
          result.errors.push(errMsg);
        }
      }
    }

    console.log(
      `[AutoSeed] completed table: learning_rules — ${result.inserted} insérées, ${result.skipped} ignorées, ${result.errors.length} erreurs`
    );

    return result;
  } catch (err: any) {
    console.error("[AutoSeed] Erreur fatale:", err.message);
    result.errors.push(`Erreur fatale: ${err.message}`);
    return result;
  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
}

/**
 * Vérifie si une règle identique existe déjà (même type + option + patterns).
 */
async function ruleExists(
  connection: mysql.Connection,
  rule: InsertLearningRule
): Promise<boolean> {
  const conditions: string[] = [
    "`tenant_id` = ?",
    "`rule_type` = ?",
    "`chosen_option` = ?",
    "`source_project` = 'seed'",
  ];
  const params: any[] = [
    rule.tenantId ?? "global",
    rule.ruleType,
    rule.chosenOption ?? "",
  ];

  // Ajouter les patterns comme critères de matching
  if (rule.patternClassName) {
    conditions.push("`pattern_class_name` = ?");
    params.push(rule.patternClassName);
  } else {
    conditions.push("`pattern_class_name` IS NULL");
  }

  if (rule.patternMethodName) {
    conditions.push("`pattern_method_name` = ?");
    params.push(rule.patternMethodName);
  } else {
    conditions.push("`pattern_method_name` IS NULL");
  }

  const [rows] = await connection.execute(
    `SELECT 1 FROM \`learning_rules\` WHERE ${conditions.join(" AND ")} LIMIT 1`,
    params
  );

  return (rows as any[]).length > 0;
}
