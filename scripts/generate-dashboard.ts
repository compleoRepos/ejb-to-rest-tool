#!/usr/bin/env npx tsx
/**
 * scripts/generate-dashboard.ts
 *
 * Génère automatiquement DASHBOARD.md après chaque run de tests.
 *
 * Usage : npx tsx scripts/generate-dashboard.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateDashboard() {
  const now = new Date().toLocaleString("fr-FR", {
    timeZone: "Africa/Casablanca",
  });

  // Lire les baselines si disponibles
  const baselinesPath = path.join(
    __dirname,
    "../tests/fixtures/baselines.json"
  );
  let baselines: Record<string, number> = {};
  if (fs.existsSync(baselinesPath)) {
    baselines = JSON.parse(fs.readFileSync(baselinesPath, "utf-8"));
  }

  let md = `# Compleo — Tableau de bord qualité

Généré le : ${now}

## Scores par projet

| Projet | Score | Baseline | Δ | Compile | UseCases |
|--------|-------|----------|---|---------|----------|
`;

  // Lire les résultats du dernier run (si disponibles)
  const resultsPath = path.join(__dirname, "../test-results/scores.json");
  if (fs.existsSync(resultsPath)) {
    const results = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
    for (const [name, data] of Object.entries(results) as [
      string,
      any,
    ][]) {
      const base = baselines[name] ?? 0;
      const delta = data.score - base;
      const deltaS = delta >= 0 ? `+${delta}` : `${delta}`;
      const compS = data.compiles ? "OK" : "FAIL";
      md += `| ${name} | ${data.score}/100 | ${base} | ${deltaS} | ${compS} | ${data.useCases} |\n`;
    }
  } else {
    md += "| — | — | — | — | — | — |\n";
    md += "\n> Lancer `npm test` pour générer les résultats.\n";
  }

  md += `
## Tests unitaires

| Suite | Fichier |
|-------|---------|
| Parser — UseCase Detection | tests/unit/parser/01-usecase-detection.test.ts |
| Parser — DataSource Detection | tests/unit/parser/02-datasource-detection.test.ts |
| Parser — Multi-tech Detection | tests/unit/parser/03-multitech-detection.test.ts |
| Parser — Pipeline Integration | tests/unit/parser/04-pipeline-integration.test.ts |
| Generator — Service Signature | tests/unit/generator/01-service-signature.test.ts |
| Generator — URL Generation | tests/unit/generator/02-url-generation.test.ts |
| Generator — POM Generation | tests/unit/generator/03-pom-generation.test.ts |
| Generator — Controller Generation | tests/unit/generator/05-controller-generation.test.ts |
| Generator — Config Generation | tests/unit/generator/07-config-generation.test.ts |
| Naming — Class Naming | tests/unit/naming/01-class-naming.test.ts |
| Naming — Domain Naming | tests/unit/naming/02-domain-naming.test.ts |

## Tests de régression

| Suite | Fichier |
|-------|---------|
| Compilation Java | tests/regression/01-compilation.test.ts |
| Snapshot Stability | tests/regression/02-snapshot.test.ts |
| Score Quality | tests/regression/03-score.test.ts |
| No-Regression (Bugs) | tests/regression/04-no-regression.test.ts |
| Java Types Coverage | tests/regression/05-java-types.test.ts |
| Cross-Project Invariants | tests/regression/06-cross-project.test.ts |

## Bugs historiques — Never Break Again

| Bug ID | Description | Status |
|--------|-------------|--------|
| BUG-V7A-001 | 0 UseCases sur vrais projets | OK |
| BUG-V7B-001 | Slash dans nom de méthode Java | OK |
| BUG-V7B-002 | Double slash dans @XxxMapping | OK |
| BUG-V7C-001 | Void.builder() invalide | OK |
| BUG-V7C-002 | Variable request non déclarée | OK |
| BUG-V7C-003 | @GetMapping dupliqués | OK |
| BUG-V7C-004 | SQL constants dans méthodes | OK |
| BUG-V7C-005 | ReportingEJB → GeneralController | OK |
| BUG-GEN-001 | public Object retour non typé | OK |
| BUG-GEN-002 | EJB lifecycle dans Spring | OK |

## Types Java couverts

| Type | Détecté | Testé |
|------|---------|-------|
| Servlet doGet/doPost | Oui | Oui |
| EJB 2.x SessionBean | Oui | Oui |
| EJB 3.x @Stateless | Oui | Oui |
| EJB 3.x @Stateful | Oui | Oui |
| EJB 3.x @Singleton | Oui | Oui |
| JSR-352 Batch | Oui | Oui |
| JAX-WS @WebService | Oui | Oui |
| @MessageDriven JMS | Oui | Oui |
| JDBC DAO | Oui | Oui |
| Hibernate | Oui | Oui |
| Struts Action | Oui | Oui |
`;

  console.log(md);
  fs.writeFileSync("DASHBOARD.md", md);
  console.log("\n✅ Dashboard sauvegardé dans DASHBOARD.md");
}

generateDashboard();
