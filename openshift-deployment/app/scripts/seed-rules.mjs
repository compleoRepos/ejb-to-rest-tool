/**
 * Script de seed : insère les 50 règles globales dans la table learning_rules.
 * Usage : npx tsx scripts/seed-rules.mjs
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { learningRules } from "../drizzle/schema.ts";
import { globalSeedRules } from "../server/learning/seeds/global-rules.ts";
import { eq, and } from "drizzle-orm";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const connection = await mysql.createConnection(url);
  const db = drizzle(connection);

  console.log(`\n🌱 Seeding ${globalSeedRules.length} global learning rules...\n`);

  let inserted = 0;
  let skipped = 0;

  for (const rule of globalSeedRules) {
    // Check if a similar rule already exists
    const existing = await db
      .select()
      .from(learningRules)
      .where(
        and(
          eq(learningRules.tenantId, "global"),
          eq(learningRules.ruleType, rule.ruleType),
          eq(learningRules.chosenOption, rule.chosenOption)
        )
      );

    const duplicate = existing.find(e => {
      if (rule.patternClassName && e.patternClassName !== rule.patternClassName) return false;
      if (rule.patternMethodName && e.patternMethodName !== rule.patternMethodName) return false;
      if (rule.patternPackage && e.patternPackage !== rule.patternPackage) return false;
      if (rule.patternAnnotations && e.patternAnnotations !== rule.patternAnnotations) return false;
      return true;
    });

    if (duplicate) {
      skipped++;
      continue;
    }

    await db.insert(learningRules).values(rule);
    inserted++;
    process.stdout.write(`  ✓ ${rule.ruleType}: ${rule.chosenOption}\n`);
  }

  console.log(`\n✅ Seed terminé : ${inserted} insérées, ${skipped} ignorées (déjà existantes)\n`);

  await connection.end();
  process.exit(0);
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
