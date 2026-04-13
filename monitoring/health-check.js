/**
 * ERP ESN — Script de monitoring hebdomadaire
 * 
 * Teste les routes frontend et les endpoints API du serveur.
 * Génère un rapport Markdown dans monitoring/reports/.
 * 
 * Seuils d'alerte :
 *   - Routes frontend : 500 ms
 *   - Endpoints API   : 2000 ms
 *   - Taux de succès minimum : 95 %
 * 
 * Délai entre requêtes API : 2.5 s (rate limiting 30 req/60 s)
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Configuration ──────────────────────────────────────────────────────────

const BASE_URL = "http://localhost:3000";
const FRONTEND_THRESHOLD_MS = 500;
const API_THRESHOLD_MS = 2000;
const MIN_SUCCESS_RATE = 95;
const API_DELAY_MS = 2500; // 2.5 s entre requêtes API

// ─── Routes frontend (73 routes) ────────────────────────────────────────────

const FRONTEND_ROUTES = [
  // Pages principales
  "/",
  "/projects",
  "/compleo",
  "/compleo/agent",
  "/compleo/rules",
  "/compleo/workspace",
  "/compleo/architecture",
  "/api-docs",
  "/404",
  // Pages avec paramètres (IDs fictifs 1-10)
  ...Array.from({ length: 10 }, (_, i) => `/projects/${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `/architecture/${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `/migration/${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `/collaboration/${i + 1}`),
  // Variantes de navigation (hash, query)
  "/?tab=overview",
  "/projects?sort=name",
  "/projects?sort=date",
  "/compleo?view=grid",
  "/compleo?view=list",
  "/compleo/agent?mode=auto",
  "/compleo/rules?filter=active",
  "/compleo/rules?filter=all",
  "/compleo/workspace?layout=split",
  "/api-docs?section=auth",
  "/api-docs?section=projects",
  "/api-docs?section=compleo",
  "/api-docs?section=agent",
];

// ─── Endpoints API (19 endpoints) ───────────────────────────────────────────

const API_ENDPOINTS = [
  { method: "GET",  path: "/health",                         label: "Health Check" },
  { method: "GET",  path: "/api/trpc/projects.list",         label: "tRPC Projects List" },
  { method: "GET",  path: "/api/trpc/system.health",         label: "tRPC System Health" },
  { method: "GET",  path: "/api/learning/rules",             label: "Learning Rules List" },
  { method: "GET",  path: "/api/learning/stats",             label: "Learning Stats" },
  { method: "GET",  path: "/api/learning/rules/export",      label: "Learning Rules Export" },
  { method: "GET",  path: "/api/intelligence/stats",         label: "Intelligence Stats" },
  { method: "GET",  path: "/api/workspace",                  label: "Workspace List" },
  { method: "GET",  path: "/api/agent/sessions",             label: "Agent Sessions" },
  { method: "GET",  path: "/api/compleo/sessions",           label: "Compleo Sessions" },
  { method: "GET",  path: "/api/auth/me",                    label: "Auth Me" },
  { method: "GET",  path: "/api/trpc/files.list?input=%7B%22json%22%3A%7B%22projectId%22%3A1%7D%7D", label: "tRPC Files List" },
  { method: "GET",  path: "/api/trpc/scans.list?input=%7B%22json%22%3A%7B%22projectId%22%3A1%7D%7D", label: "tRPC Scans List" },
  { method: "GET",  path: "/api/trpc/comments.list?input=%7B%22json%22%3A%7B%22projectId%22%3A1%7D%7D", label: "tRPC Comments List" },
  { method: "GET",  path: "/api/trpc/git.list?input=%7B%22json%22%3A%7B%22projectId%22%3A1%7D%7D", label: "tRPC Git List" },
  { method: "GET",  path: "/api/trpc/sharing.list?input=%7B%22json%22%3A%7B%22projectId%22%3A1%7D%7D", label: "tRPC Sharing List" },
  { method: "GET",  path: "/api/trpc/projects.getById?input=%7B%22json%22%3A%7B%22id%22%3A1%7D%7D", label: "tRPC Project GetById" },
  { method: "GET",  path: "/api/trpc/scans.getById?input=%7B%22json%22%3A%7B%22id%22%3A1%7D%7D", label: "tRPC Scan GetById" },
  { method: "GET",  path: "/api/trpc/auth.me",               label: "tRPC Auth Me" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Envoie une requête HTTP et mesure le temps de réponse.
 * Retourne { status, latency, ok, error? }
 */
function probe(urlPath, method = "GET", timeoutMs = 10000) {
  return new Promise(resolve => {
    const url = new URL(urlPath, BASE_URL);
    const start = performance.now();
    const req = http.request(url, { method, timeout: timeoutMs }, res => {
      let body = "";
      res.on("data", chunk => (body += chunk));
      res.on("end", () => {
        const latency = Math.round(performance.now() - start);
        resolve({
          status: res.statusCode,
          latency,
          ok: res.statusCode >= 200 && res.statusCode < 400,
          body: body.substring(0, 200),
        });
      });
    });
    req.on("error", err => {
      const latency = Math.round(performance.now() - start);
      resolve({ status: 0, latency, ok: false, error: err.message });
    });
    req.on("timeout", () => {
      req.destroy();
      const latency = Math.round(performance.now() - start);
      resolve({ status: 0, latency, ok: false, error: "TIMEOUT" });
    });
    req.end();
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startTime = new Date();
  console.log(`\n🏥  ERP ESN Health Check — ${startTime.toISOString()}\n`);

  // 1) Vérifier que le serveur répond
  console.log("▸ Vérification de la connectivité...");
  const ping = await probe("/health");
  if (!ping.ok) {
    console.error("✖ Le serveur ne répond pas sur " + BASE_URL);
    process.exit(1);
  }
  console.log(`  ✔ Serveur accessible (${ping.latency} ms)\n`);

  // 2) Tester les routes frontend
  console.log(`▸ Test de ${FRONTEND_ROUTES.length} routes frontend...`);
  const frontendResults = [];
  for (const route of FRONTEND_ROUTES) {
    const result = await probe(route);
    frontendResults.push({ route, ...result });
    const icon = result.ok ? "✔" : "✖";
    const slow = result.ok && result.latency > FRONTEND_THRESHOLD_MS ? " ⚠ LENT" : "";
    if (!result.ok || slow) {
      console.log(`  ${icon} ${route} — ${result.status} (${result.latency} ms)${slow}`);
    }
  }

  // 3) Tester les endpoints API (avec délai)
  console.log(`\n▸ Test de ${API_ENDPOINTS.length} endpoints API (délai ${API_DELAY_MS / 1000}s)...`);
  const apiResults = [];
  for (let i = 0; i < API_ENDPOINTS.length; i++) {
    const ep = API_ENDPOINTS[i];
    if (i > 0) await sleep(API_DELAY_MS);
    const result = await probe(ep.path, ep.method);
    apiResults.push({ ...ep, ...result });
    const icon = result.ok ? "✔" : "✖";
    const slow = result.ok && result.latency > API_THRESHOLD_MS ? " ⚠ LENT" : "";
    console.log(`  ${icon} [${ep.method}] ${ep.label} — ${result.status} (${result.latency} ms)${slow}`);
  }

  // 4) Calculer les métriques
  const frontendOk = frontendResults.filter(r => r.ok).length;
  const frontendFail = frontendResults.filter(r => !r.ok).length;
  const frontendSlow = frontendResults.filter(r => r.ok && r.latency > FRONTEND_THRESHOLD_MS).length;
  const frontendRate = ((frontendOk / FRONTEND_ROUTES.length) * 100).toFixed(1);
  const frontendAvgLatency = Math.round(frontendResults.reduce((s, r) => s + r.latency, 0) / frontendResults.length);
  const frontendP95 = frontendResults.map(r => r.latency).sort((a, b) => a - b)[Math.floor(frontendResults.length * 0.95)];

  const apiOk = apiResults.filter(r => r.ok).length;
  const apiFail = apiResults.filter(r => !r.ok).length;
  const apiSlow = apiResults.filter(r => r.ok && r.latency > API_THRESHOLD_MS).length;
  const apiRate = ((apiOk / API_ENDPOINTS.length) * 100).toFixed(1);
  const apiAvgLatency = Math.round(apiResults.reduce((s, r) => s + r.latency, 0) / apiResults.length);
  const apiP95 = apiResults.map(r => r.latency).sort((a, b) => a - b)[Math.floor(apiResults.length * 0.95)];

  const totalRoutes = FRONTEND_ROUTES.length + API_ENDPOINTS.length;
  const totalOk = frontendOk + apiOk;
  const globalRate = ((totalOk / totalRoutes) * 100).toFixed(1);

  // Score global
  let score, scoreEmoji;
  if (parseFloat(globalRate) >= MIN_SUCCESS_RATE && frontendSlow === 0 && apiSlow === 0 && apiFail === 0 && frontendFail === 0) {
    score = "SAIN";
    scoreEmoji = "🟢";
  } else if (parseFloat(globalRate) >= 80 && apiFail <= 3) {
    score = "DÉGRADÉ";
    scoreEmoji = "🟡";
  } else {
    score = "CRITIQUE";
    scoreEmoji = "🔴";
  }

  // 5) Collecter les alertes
  const alerts = [];
  for (const r of frontendResults) {
    if (!r.ok) alerts.push({ severity: "ERREUR", type: "Frontend", detail: `${r.route} — HTTP ${r.status} ${r.error || ""}` });
    else if (r.latency > FRONTEND_THRESHOLD_MS) alerts.push({ severity: "AVERTISSEMENT", type: "Frontend", detail: `${r.route} — ${r.latency} ms (seuil ${FRONTEND_THRESHOLD_MS} ms)` });
  }
  for (const r of apiResults) {
    if (!r.ok) alerts.push({ severity: "ERREUR", type: "API", detail: `[${r.method}] ${r.label} — HTTP ${r.status} ${r.error || ""}` });
    else if (r.latency > API_THRESHOLD_MS) alerts.push({ severity: "AVERTISSEMENT", type: "API", detail: `[${r.method}] ${r.label} — ${r.latency} ms (seuil ${API_THRESHOLD_MS} ms)` });
  }

  const endTime = new Date();
  const durationSec = ((endTime - startTime) / 1000).toFixed(1);

  // 6) Générer le rapport Markdown
  const dateStr = startTime.toISOString().split("T")[0];
  const timeStr = startTime.toISOString().split("T")[1].split(".")[0];

  let report = `# Rapport de monitoring hebdomadaire — ERP ESN

**Date** : ${dateStr} à ${timeStr} UTC  
**Durée d'exécution** : ${durationSec} secondes  
**Score global** : ${scoreEmoji} **${score}**

---

## Résumé

| Métrique | Frontend | API | Total |
|---|---|---|---|
| Routes testées | ${FRONTEND_ROUTES.length} | ${API_ENDPOINTS.length} | ${totalRoutes} |
| Succès | ${frontendOk} | ${apiOk} | ${totalOk} |
| Échecs | ${frontendFail} | ${apiFail} | ${frontendFail + apiFail} |
| Taux de succès | ${frontendRate} % | ${apiRate} % | ${globalRate} % |
| Latence moyenne | ${frontendAvgLatency} ms | ${apiAvgLatency} ms | — |
| Latence P95 | ${frontendP95} ms | ${apiP95} ms | — |
| Endpoints lents | ${frontendSlow} | ${apiSlow} | ${frontendSlow + apiSlow} |

### Seuils appliqués

| Paramètre | Valeur |
|---|---|
| Seuil latence frontend | ${FRONTEND_THRESHOLD_MS} ms |
| Seuil latence API | ${API_THRESHOLD_MS} ms |
| Taux de succès minimum | ${MIN_SUCCESS_RATE} % |
| Délai inter-requêtes API | ${API_DELAY_MS / 1000} s |

---

## Alertes (${alerts.length})

`;

  if (alerts.length === 0) {
    report += "> Aucune alerte détectée. Tous les services fonctionnent normalement.\n\n";
  } else {
    report += "| Sévérité | Type | Détail |\n|---|---|---|\n";
    for (const a of alerts) {
      report += `| ${a.severity} | ${a.type} | ${a.detail} |\n`;
    }
    report += "\n";
  }

  report += `---

## Détail des routes frontend (${FRONTEND_ROUTES.length})

| Route | Statut | Latence | Résultat |
|---|---|---|---|
`;
  for (const r of frontendResults) {
    const status = r.ok ? "✅ OK" : `❌ ${r.status}`;
    const latencyFlag = r.ok && r.latency > FRONTEND_THRESHOLD_MS ? " ⚠️" : "";
    report += `| \`${r.route}\` | ${status} | ${r.latency} ms${latencyFlag} | ${r.ok ? "Succès" : r.error || "Échec"} |\n`;
  }

  report += `
---

## Détail des endpoints API (${API_ENDPOINTS.length})

| Endpoint | Méthode | Statut | Latence | Résultat |
|---|---|---|---|---|
`;
  for (const r of apiResults) {
    const status = r.ok ? "✅ OK" : `❌ ${r.status}`;
    const latencyFlag = r.ok && r.latency > API_THRESHOLD_MS ? " ⚠️" : "";
    report += `| ${r.label} | ${r.method} | ${status} | ${r.latency} ms${latencyFlag} | ${r.ok ? "Succès" : r.error || "Échec"} |\n`;
  }

  report += `
---

## Actions correctives recommandées

`;

  if (alerts.length === 0) {
    report += "> Aucune action requise.\n";
  } else {
    const errors = alerts.filter(a => a.severity === "ERREUR");
    const warnings = alerts.filter(a => a.severity === "AVERTISSEMENT");
    if (errors.length > 0) {
      report += `### Erreurs critiques (${errors.length})\n\n`;
      for (const e of errors) {
        if (e.type === "API") {
          report += `- **${e.detail}** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.\n`;
        } else {
          report += `- **${e.detail}** : Vérifier que la route frontend est correctement configurée dans le routeur.\n`;
        }
      }
      report += "\n";
    }
    if (warnings.length > 0) {
      report += `### Avertissements de performance (${warnings.length})\n\n`;
      for (const w of warnings) {
        report += `- **${w.detail}** : Optimiser les requêtes ou ajouter du cache.\n`;
      }
      report += "\n";
    }
  }

  report += `
---

*Rapport généré automatiquement par \`monitoring/health-check.js\`*  
*Prochaine exécution prévue : semaine du ${new Date(startTime.getTime() + 7 * 24 * 3600 * 1000).toISOString().split("T")[0]}*
`;

  // 7) Écrire les fichiers
  const reportsDir = path.join(__dirname, "reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const reportFile = path.join(reportsDir, `report-${dateStr}.md`);
  const latestFile = path.join(reportsDir, "latest.md");

  fs.writeFileSync(reportFile, report, "utf-8");
  fs.writeFileSync(latestFile, report, "utf-8");

  // Écrire aussi un JSON pour traitement automatisé
  const jsonData = {
    date: dateStr,
    time: timeStr,
    durationSec: parseFloat(durationSec),
    score,
    globalRate: parseFloat(globalRate),
    frontend: { total: FRONTEND_ROUTES.length, ok: frontendOk, fail: frontendFail, slow: frontendSlow, rate: parseFloat(frontendRate), avgLatency: frontendAvgLatency, p95: frontendP95 },
    api: { total: API_ENDPOINTS.length, ok: apiOk, fail: apiFail, slow: apiSlow, rate: parseFloat(apiRate), avgLatency: apiAvgLatency, p95: apiP95 },
    alerts,
  };
  fs.writeFileSync(path.join(reportsDir, `report-${dateStr}.json`), JSON.stringify(jsonData, null, 2), "utf-8");
  fs.writeFileSync(path.join(reportsDir, "latest.json"), JSON.stringify(jsonData, null, 2), "utf-8");

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Score global : ${scoreEmoji}  ${score}`);
  console.log(`  Routes testées : ${totalRoutes} | Succès : ${totalOk} | Échecs : ${frontendFail + apiFail}`);
  console.log(`  Taux de succès : ${globalRate} %`);
  console.log(`  Alertes : ${alerts.length}`);
  console.log(`  Rapport : ${reportFile}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(err => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
