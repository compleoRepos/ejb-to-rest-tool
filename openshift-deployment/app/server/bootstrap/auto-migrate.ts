/**
 * Auto-migration Code First — Crée les tables MySQL au démarrage de l'application.
 *
 * Compatible avec le format natif de __drizzle_migrations (id, hash, created_at).
 * Calcule le hash SHA-256 de chaque fichier SQL pour le tracking.
 * Les CREATE TABLE sont rendus idempotents via IF NOT EXISTS.
 *
 * @author Compleo
 */

import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import crypto from "crypto";

interface MigrationJournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface MigrationJournal {
  version: string;
  dialect: string;
  entries: MigrationJournalEntry[];
}

/**
 * Exécute les migrations Drizzle au démarrage.
 * Crée la table de tracking __drizzle_migrations si elle n'existe pas.
 * Applique uniquement les migrations non encore exécutées.
 */
export async function autoMigrate(databaseUrl: string): Promise<{
  applied: string[];
  skipped: string[];
  errors: string[];
}> {
  const result = { applied: [] as string[], skipped: [] as string[], errors: [] as string[] };

  let connection: mysql.Connection | null = null;

  try {
    connection = await mysql.createConnection(databaseUrl);
    console.log("[AutoMigrate] Connexion MySQL établie");

    // 1. Créer la table de tracking Drizzle native si elle n'existe pas
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
        \`id\` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`hash\` TEXT NOT NULL,
        \`created_at\` BIGINT
      )
    `);

    // 2. Lire les migrations déjà appliquées (par created_at = timestamp du journal)
    const [rows] = await connection.execute(
      "SELECT `hash`, `created_at` FROM `__drizzle_migrations` ORDER BY `created_at` ASC"
    );
    const appliedHashes = new Set((rows as any[]).map((r: any) => r.hash));
    const appliedTimestamps = new Set((rows as any[]).map((r: any) => Number(r.created_at)));

    // 3. Lire le journal Drizzle
    const drizzleDir = path.resolve(process.cwd(), "drizzle");
    const journalPath = path.join(drizzleDir, "meta", "_journal.json");

    if (!fs.existsSync(journalPath)) {
      console.warn("[AutoMigrate] Aucun journal de migration trouvé:", journalPath);
      return result;
    }

    const journal: MigrationJournal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

    // 4. Appliquer les migrations manquantes dans l'ordre
    for (const entry of journal.entries) {
      const sqlFile = path.join(drizzleDir, `${entry.tag}.sql`);
      if (!fs.existsSync(sqlFile)) {
        const errMsg = `Fichier SQL manquant: ${entry.tag}.sql`;
        console.error(`[AutoMigrate] ${errMsg}`);
        result.errors.push(errMsg);
        continue;
      }

      const sqlContent = fs.readFileSync(sqlFile, "utf-8");

      // Calculer le hash SHA-256 (même méthode que Drizzle Kit)
      const fileHash = crypto.createHash("sha256").update(sqlContent).digest("hex");

      // Vérifier si déjà appliquée (par hash ou par timestamp)
      if (appliedHashes.has(fileHash) || appliedTimestamps.has(entry.when)) {
        result.skipped.push(entry.tag);
        continue;
      }

      // Séparer les statements par le breakpoint Drizzle
      const statements = sqlContent
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      console.log(`[AutoMigrate] Applying migration: ${entry.tag} (${statements.length} statements)`);

      try {
        for (const stmt of statements) {
          // Transformer CREATE TABLE en CREATE TABLE IF NOT EXISTS pour l'idempotence
          const safeStmt = stmt.replace(
            /CREATE TABLE\s+(?!IF NOT EXISTS)/gi,
            "CREATE TABLE IF NOT EXISTS "
          );

          try {
            await connection.execute(safeStmt);
          } catch (stmtErr: any) {
            // Ignorer les erreurs d'idempotence
            const code = stmtErr?.code || stmtErr?.errno;
            const msg = stmtErr?.message || "";
            if (
              code === "ER_DUP_FIELDNAME" ||
              code === "ER_DUP_KEYNAME" ||
              code === "ER_TABLE_EXISTS_ERROR" ||
              code === 1060 || // Duplicate column
              code === 1061 || // Duplicate key
              code === 1050 || // Table already exists
              msg.includes("Duplicate column") ||
              msg.includes("Duplicate key") ||
              msg.includes("already exists")
            ) {
              console.log(`[AutoMigrate]   ⚠ Statement ignoré (déjà appliqué): ${msg.slice(0, 80)}`);
            } else {
              throw stmtErr;
            }
          }
        }

        // Enregistrer la migration comme appliquée (format Drizzle natif)
        await connection.execute(
          "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
          [fileHash, entry.when]
        );

        result.applied.push(entry.tag);
        console.log(`[AutoMigrate]   ✓ ${entry.tag} appliquée`);
      } catch (migErr: any) {
        const errMsg = `Migration ${entry.tag} échouée: ${migErr.message}`;
        console.error(`[AutoMigrate]   ✗ ${errMsg}`);
        result.errors.push(errMsg);
      }
    }

    // Résumé
    console.log(
      `[AutoMigrate] Terminé: ${result.applied.length} appliquées, ${result.skipped.length} ignorées, ${result.errors.length} erreurs`
    );

    return result;
  } catch (err: any) {
    console.error("[AutoMigrate] Erreur fatale:", err.message);
    result.errors.push(`Erreur fatale: ${err.message}`);
    return result;
  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
}
