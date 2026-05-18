#!/usr/bin/env npx tsx
/**
 * scripts/init-fixtures.ts
 *
 * Initialise les fixtures de test :
 * 1. Génère le code Spring Boot pour chaque fixture
 * 2. Sauvegarde les snapshots de référence
 * 3. Calcule et sauvegarde les baselines de score
 *
 * Usage : npx tsx scripts/init-fixtures.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { ALL_FIXTURES, type TestFixture } from "../tests/fixtures/index";
import { parseEjbProject } from "../server/java-parser";
import { generateSpringBootProject } from "../server/spring-generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SNAPSHOTS_DIR = path.join(__dirname, "../tests/fixtures/snapshots");
const BASELINES_PATH = path.join(__dirname, "../tests/fixtures/baselines.json");

interface FixtureResult {
  name: string;
  uc: number;
  files: number;
  score: number;
  status: string;
}

async function main() {
  console.log("🚀 Compleo — Initialisation des fixtures de test\n");

  // Créer le répertoire snapshots
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

  const results: FixtureResult[] = [];

  for (const fixture of ALL_FIXTURES) {
    const name = fixture.name;
    process.stdout.write(`  ▸ ${name}... `);

    try {
      // Parser les fichiers source
      const ir = parseEjbProject(fixture.files);

      // Générer le projet Spring Boot
      const gen = generateSpringBootProject(ir);

      // Sauvegarder le snapshot
      const outputDir = path.join(SNAPSHOTS_DIR, name);
      fs.mkdirSync(outputDir, { recursive: true });

      for (const file of gen.files) {
        const fullPath = path.join(outputDir, file.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, file.content, "utf-8");
      }

      // Métriques rapides
      const ucCount = ir.useCases?.length ?? 0;
      const fileCount = gen.files.length;

      results.push({
        name,
        uc: ucCount,
        files: fileCount,
        score: 0, // Score calculé par les tests
        status: "✅",
      });

      console.log(`✅ ${fileCount} fichiers, ${ucCount} UseCases`);
    } catch (e: any) {
      results.push({
        name,
        uc: 0,
        files: 0,
        score: 0,
        status: `❌ ${e.message}`,
      });
      console.log(`❌ ERREUR: ${e.message}`);
    }
  }

  // Afficher le tableau récapitulatif
  console.log("\n📊 Résumé\n");
  console.log(
    "┌─────────────────────────────────┬────────┬─────────┬─────────────┐"
  );
  console.log(
    "│ Projet                          │ UCs    │ Fichiers│ Status      │"
  );
  console.log(
    "├─────────────────────────────────┼────────┼─────────┼─────────────┤"
  );
  for (const r of results) {
    const n = r.name.padEnd(32).substring(0, 32);
    const u = String(r.uc).padStart(6);
    const f = String(r.files).padStart(7);
    console.log(`│ ${n} │ ${u} │ ${f} │ ${r.status.padEnd(11)} │`);
  }
  console.log(
    "└─────────────────────────────────┴────────┴─────────┴─────────────┘"
  );

  // Sauvegarder les baselines
  const baselines: Record<string, number> = {};
  for (const r of results) {
    baselines[r.name] = Math.max(0, r.score);
  }
  fs.writeFileSync(BASELINES_PATH, JSON.stringify(baselines, null, 2));

  console.log("\n✅ Fixtures initialisées.");
  console.log(
    `   Snapshots sauvegardés dans ${path.relative(process.cwd(), SNAPSHOTS_DIR)}`
  );
  console.log(
    `   Baselines sauvegardées dans ${path.relative(process.cwd(), BASELINES_PATH)}`
  );
  console.log("   Lancer : npm test\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
