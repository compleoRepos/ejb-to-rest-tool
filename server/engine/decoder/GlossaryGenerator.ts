/**
 * GlossaryGenerator v13.13 — Generate business glossary in HTML, CSV, and JSON formats.
 *
 * Combines outputs from:
 *   - SemanticInferenceEngine (field meanings)
 *   - CrossProjectCorrelator (cross-project validation)
 *   - OrphanFieldDetector (dead field warnings)
 *
 * Outputs:
 *   - glossary.html: Interactive HTML report with search, filter, and export
 *   - glossary.csv: Flat CSV for business users (Excel-compatible)
 *   - glossary.json: Structured JSON for programmatic consumption
 *
 * @author Hamza NORDINE — Compleo
 */

import type { SemanticField, SemanticInferenceResult } from "./SemanticInferenceEngine";
import type { CrossProjectCorrelationResult, CorrelatedField } from "./CrossProjectCorrelator";
import type { OrphanDetectionResult, OrphanField } from "./OrphanFieldDetector";

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface GlossaryEntry {
  dbColumn: string;
  tableName: string;
  businessNameFr: string;
  businessNameEn: string;
  description: string;
  domain: string;
  javaType: string;
  confidence: string;
  confidenceScore: number;
  sources: string[];
  variableNames: string[];
  comparedTo: string[];
  joinedWith: string[];
  usageCount: number;
  /** Cross-project info */
  projects: string[];
  isConsensus: boolean;
  conflicts: string[];
  /** Orphan status */
  orphanCategory: string | null;
  orphanSeverity: string | null;
  orphanRecommendation: string | null;
}

export interface GlossaryOutput {
  entries: GlossaryEntry[];
  html: string;
  csv: string;
  json: string;
  stats: {
    totalEntries: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    unresolved: number;
    orphans: number;
    domains: string[];
    tables: string[];
  };
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export class GlossaryGenerator {
  /**
   * Generate the full glossary from all analysis results.
   */
  generate(
    inferenceResult: SemanticInferenceResult,
    correlationResult?: CrossProjectCorrelationResult | null,
    orphanResult?: OrphanDetectionResult | null,
    projectName?: string
  ): GlossaryOutput {
    // Step 1: Build entries
    const entries = this.buildEntries(inferenceResult, correlationResult, orphanResult);

    // Step 2: Generate outputs
    const html = this.generateHtml(entries, projectName || "Workspace");
    const csv = this.generateCsv(entries);
    const json = this.generateJson(entries, projectName || "Workspace");

    // Step 3: Compute stats
    const domains = [...new Set(entries.map(e => e.domain).filter(Boolean))];
    const tables = [...new Set(entries.map(e => e.tableName))];

    return {
      entries,
      html,
      csv,
      json,
      stats: {
        totalEntries: entries.length,
        highConfidence: entries.filter(e => e.confidence === "high").length,
        mediumConfidence: entries.filter(e => e.confidence === "medium").length,
        lowConfidence: entries.filter(e => e.confidence === "low").length,
        unresolved: entries.filter(e => e.confidence === "unresolved").length,
        orphans: entries.filter(e => e.orphanCategory !== null).length,
        domains,
        tables,
      },
    };
  }

  // ─── Entry builder ────────────────────────────────────────────────────

  private buildEntries(
    inferenceResult: SemanticInferenceResult,
    correlationResult?: CrossProjectCorrelationResult | null,
    orphanResult?: OrphanDetectionResult | null
  ): GlossaryEntry[] {
    const entries: GlossaryEntry[] = [];

    // Index correlation data
    const correlationIndex = new Map<string, CorrelatedField>();
    if (correlationResult) {
      for (const cf of correlationResult.correlatedFields) {
        correlationIndex.set(`${cf.tableName}.${cf.dbColumn}`, cf);
      }
    }

    // Index orphan data
    const orphanIndex = new Map<string, OrphanField>();
    if (orphanResult) {
      for (const of_ of orphanResult.orphans) {
        orphanIndex.set(`${of_.tableName}.${of_.dbColumn}`, of_);
      }
    }

    for (const field of inferenceResult.fields) {
      const key = `${field.tableName}.${field.dbColumn}`;
      const corr = correlationIndex.get(key);
      const orphan = orphanIndex.get(key);

      entries.push({
        dbColumn: field.dbColumn,
        tableName: field.tableName,
        businessNameFr: corr?.consensusNameFr || field.businessNameFr,
        businessNameEn: corr?.consensusNameEn || field.businessNameEn,
        description: field.description,
        domain: field.domain,
        javaType: field.javaType,
        confidence: field.confidence,
        confidenceScore: corr ? corr.boostedConfidence : field.confidenceScore,
        sources: field.sources,
        variableNames: field.variableNames,
        comparedTo: field.comparedTo,
        joinedWith: field.joinedWith,
        usageCount: field.usageCount,
        projects: corr ? corr.projects.map(p => p.projectName) : [],
        isConsensus: corr?.isConsensus ?? true,
        conflicts: corr?.conflicts ?? [],
        orphanCategory: orphan?.category ?? null,
        orphanSeverity: orphan?.severity ?? null,
        orphanRecommendation: orphan?.recommendation ?? null,
      });
    }

    // Add dead fields from orphan detection that aren't in inference
    if (orphanResult) {
      for (const orphan of orphanResult.orphans) {
        const key = `${orphan.tableName}.${orphan.dbColumn}`;
        if (!entries.some(e => `${e.tableName}.${e.dbColumn}` === key)) {
          entries.push({
            dbColumn: orphan.dbColumn,
            tableName: orphan.tableName,
            businessNameFr: orphan.dbColumn.toLowerCase(),
            businessNameEn: orphan.dbColumn.toLowerCase(),
            description: orphan.reason,
            domain: "inconnu",
            javaType: "UNKNOWN",
            confidence: "unresolved",
            confidenceScore: 0,
            sources: [],
            variableNames: [],
            comparedTo: [],
            joinedWith: [],
            usageCount: 0,
            projects: [],
            isConsensus: true,
            conflicts: [],
            orphanCategory: orphan.category,
            orphanSeverity: orphan.severity,
            orphanRecommendation: orphan.recommendation,
          });
        }
      }
    }

    // Sort by table, then by confidence (high first)
    entries.sort((a, b) => {
      if (a.tableName !== b.tableName) return a.tableName.localeCompare(b.tableName);
      const confOrder = { high: 0, medium: 1, low: 2, unresolved: 3 };
      return (confOrder[a.confidence as keyof typeof confOrder] || 3) -
             (confOrder[b.confidence as keyof typeof confOrder] || 3);
    });

    return entries;
  }

  // ─── HTML Generator ───────────────────────────────────────────────────

  private generateHtml(entries: GlossaryEntry[], projectName: string): string {
    const tables = [...new Set(entries.map(e => e.tableName))];
    const domains = [...new Set(entries.map(e => e.domain).filter(Boolean))];

    const confidenceBadge = (conf: string, score: number) => {
      const colors: Record<string, string> = {
        high: "#22c55e", medium: "#eab308", low: "#f97316", unresolved: "#ef4444",
      };
      const color = colors[conf] || "#6b7280";
      return `<span style="background:${color};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${conf.toUpperCase()} (${score})</span>`;
    };

    const orphanBadge = (category: string | null, severity: string | null) => {
      if (!category) return "";
      const colors: Record<string, string> = {
        critical: "#dc2626", warning: "#f59e0b", info: "#3b82f6",
      };
      const color = colors[severity || "info"] || "#6b7280";
      return ` <span style="background:${color};color:white;padding:2px 6px;border-radius:12px;font-size:10px;">${category}</span>`;
    };

    const tableRows = entries.map(e => `
      <tr class="entry" data-table="${e.tableName}" data-domain="${e.domain}" data-confidence="${e.confidence}" data-orphan="${e.orphanCategory || ''}">
        <td><code>${e.tableName}</code></td>
        <td><code style="font-weight:bold;">${e.dbColumn}</code></td>
        <td><strong>${e.businessNameFr}</strong></td>
        <td>${e.businessNameEn}</td>
        <td>${e.description || "—"}</td>
        <td>${e.domain}</td>
        <td><code>${e.javaType}</code></td>
        <td>${confidenceBadge(e.confidence, e.confidenceScore)}${orphanBadge(e.orphanCategory, e.orphanSeverity)}</td>
        <td>${e.variableNames.join(", ") || "—"}</td>
        <td>${e.usageCount}</td>
        <td>${e.joinedWith.join(", ") || "—"}</td>
        <td>${e.comparedTo.slice(0, 3).join(", ") || "—"}</td>
        <td>${e.projects.join(", ") || "—"}</td>
      </tr>
    `).join("\n");

    const tableFilterOptions = tables.map(t => `<option value="${t}">${t}</option>`).join("\n");
    const domainFilterOptions = domains.map(d => `<option value="${d}">${d}</option>`).join("\n");

    // Stats summary
    const highCount = entries.filter(e => e.confidence === "high").length;
    const medCount = entries.filter(e => e.confidence === "medium").length;
    const lowCount = entries.filter(e => e.confidence === "low").length;
    const unresolvedCount = entries.filter(e => e.confidence === "unresolved").length;
    const orphanCount = entries.filter(e => e.orphanCategory !== null).length;

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Glossaire Métier — ${projectName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e293b, #0f172a); padding: 24px 32px; border-bottom: 1px solid #334155; }
    .header h1 { font-size: 24px; color: #f8fafc; margin-bottom: 4px; }
    .header .subtitle { color: #94a3b8; font-size: 14px; }
    .stats-bar { display: flex; gap: 16px; padding: 16px 32px; background: #1e293b; border-bottom: 1px solid #334155; flex-wrap: wrap; }
    .stat-card { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px 20px; min-width: 120px; }
    .stat-card .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
    .stat-card .value.green { color: #22c55e; }
    .stat-card .value.yellow { color: #eab308; }
    .stat-card .value.orange { color: #f97316; }
    .stat-card .value.red { color: #ef4444; }
    .stat-card .value.blue { color: #3b82f6; }
    .filters { display: flex; gap: 12px; padding: 16px 32px; background: #1e293b; border-bottom: 1px solid #334155; flex-wrap: wrap; align-items: center; }
    .filters input, .filters select { background: #0f172a; border: 1px solid #475569; color: #e2e8f0; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
    .filters input { min-width: 250px; }
    .filters select { min-width: 150px; }
    .filters label { font-size: 12px; color: #94a3b8; }
    .table-container { overflow-x: auto; padding: 16px 32px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1e293b; color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; padding: 10px 12px; text-align: left; position: sticky; top: 0; border-bottom: 2px solid #334155; }
    td { padding: 8px 12px; border-bottom: 1px solid #1e293b; vertical-align: top; }
    tr:hover { background: #1e293b; }
    tr.hidden { display: none; }
    code { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #7dd3fc; }
    .export-bar { padding: 12px 32px; background: #1e293b; border-top: 1px solid #334155; display: flex; gap: 8px; }
    .export-bar button { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .export-bar button:hover { background: #2563eb; }
    .footer { padding: 16px 32px; color: #475569; font-size: 12px; text-align: center; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Glossaire Métier — ${projectName}</h1>
    <div class="subtitle">Schema Reverse-Engineering v13.13 — Compleo EJB Modernizer — ${new Date().toISOString().split("T")[0]}</div>
  </div>

  <div class="stats-bar">
    <div class="stat-card"><div class="label">Total champs</div><div class="value blue">${entries.length}</div></div>
    <div class="stat-card"><div class="label">High</div><div class="value green">${highCount}</div></div>
    <div class="stat-card"><div class="label">Medium</div><div class="value yellow">${medCount}</div></div>
    <div class="stat-card"><div class="label">Low</div><div class="value orange">${lowCount}</div></div>
    <div class="stat-card"><div class="label">Non résolu</div><div class="value red">${unresolvedCount}</div></div>
    <div class="stat-card"><div class="label">Orphelins</div><div class="value red">${orphanCount}</div></div>
    <div class="stat-card"><div class="label">Tables</div><div class="value blue">${tables.length}</div></div>
    <div class="stat-card"><div class="label">Domaines</div><div class="value blue">${domains.length}</div></div>
  </div>

  <div class="filters">
    <div>
      <label>Recherche</label><br>
      <input type="text" id="searchInput" placeholder="Rechercher colonne, nom métier, domaine..." oninput="filterTable()">
    </div>
    <div>
      <label>Table</label><br>
      <select id="tableFilter" onchange="filterTable()">
        <option value="">Toutes</option>
        ${tableFilterOptions}
      </select>
    </div>
    <div>
      <label>Domaine</label><br>
      <select id="domainFilter" onchange="filterTable()">
        <option value="">Tous</option>
        ${domainFilterOptions}
      </select>
    </div>
    <div>
      <label>Confiance</label><br>
      <select id="confidenceFilter" onchange="filterTable()">
        <option value="">Toutes</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="unresolved">Non résolu</option>
      </select>
    </div>
    <div>
      <label>Orphelins</label><br>
      <select id="orphanFilter" onchange="filterTable()">
        <option value="">Tous</option>
        <option value="dead">Dead</option>
        <option value="write-only">Write-only</option>
        <option value="read-only">Read-only</option>
        <option value="single-ref">Single-ref</option>
        <option value="none">Aucun</option>
      </select>
    </div>
  </div>

  <div class="table-container">
    <table id="glossaryTable">
      <thead>
        <tr>
          <th>Table</th>
          <th>Colonne DB</th>
          <th>Nom Métier (FR)</th>
          <th>Nom Métier (EN)</th>
          <th>Description</th>
          <th>Domaine</th>
          <th>Type Java</th>
          <th>Confiance</th>
          <th>Variables Java</th>
          <th>Usages</th>
          <th>Jointures</th>
          <th>Comparaisons</th>
          <th>Projets</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>

  <div class="export-bar">
    <button onclick="exportCsv()">Exporter CSV</button>
    <button onclick="exportJson()">Exporter JSON</button>
    <button onclick="window.print()">Imprimer</button>
  </div>

  <div class="footer">
    Généré par Compleo EJB Client Modernizer v13.13 — Schema Reverse-Engineering Module
  </div>

  <script>
    function filterTable() {
      const search = document.getElementById('searchInput').value.toLowerCase();
      const table = document.getElementById('tableFilter').value;
      const domain = document.getElementById('domainFilter').value;
      const confidence = document.getElementById('confidenceFilter').value;
      const orphan = document.getElementById('orphanFilter').value;

      document.querySelectorAll('.entry').forEach(row => {
        const text = row.textContent.toLowerCase();
        const matchSearch = !search || text.includes(search);
        const matchTable = !table || row.dataset.table === table;
        const matchDomain = !domain || row.dataset.domain === domain;
        const matchConfidence = !confidence || row.dataset.confidence === confidence;
        const matchOrphan = !orphan ||
          (orphan === 'none' ? !row.dataset.orphan : row.dataset.orphan === orphan);

        row.classList.toggle('hidden', !(matchSearch && matchTable && matchDomain && matchConfidence && matchOrphan));
      });
    }

    function exportCsv() {
      const rows = document.querySelectorAll('.entry:not(.hidden)');
      let csv = 'Table,Colonne DB,Nom FR,Nom EN,Description,Domaine,Type Java,Confiance,Score,Variables,Usages,Jointures\\n';
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const values = Array.from(cells).map(c => '"' + c.textContent.replace(/"/g, '""').trim() + '"');
        csv += values.join(',') + '\\n';
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'glossaire-metier.csv';
      link.click();
    }

    function exportJson() {
      const data = ${JSON.stringify(entries.map(e => ({
        table: e.tableName,
        column: e.dbColumn,
        businessNameFr: e.businessNameFr,
        businessNameEn: e.businessNameEn,
        description: e.description,
        domain: e.domain,
        javaType: e.javaType,
        confidence: e.confidence,
        confidenceScore: e.confidenceScore,
      })))};
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'glossaire-metier.json';
      link.click();
    }
  </script>
</body>
</html>`;
  }

  // ─── CSV Generator ────────────────────────────────────────────────────

  private generateCsv(entries: GlossaryEntry[]): string {
    const lines: string[] = [];
    lines.push("Table,Colonne DB,Nom Métier FR,Nom Métier EN,Description,Domaine,Type Java,Confiance,Score,Variables Java,Usages,Jointures,Comparaisons,Projets,Orphelin,Recommandation");

    for (const e of entries) {
      const row = [
        e.tableName,
        e.dbColumn,
        e.businessNameFr,
        e.businessNameEn,
        e.description.replace(/,/g, ";"),
        e.domain,
        e.javaType,
        e.confidence,
        e.confidenceScore.toString(),
        e.variableNames.join("; "),
        e.usageCount.toString(),
        e.joinedWith.join("; "),
        e.comparedTo.join("; "),
        e.projects.join("; "),
        e.orphanCategory || "",
        (e.orphanRecommendation || "").replace(/,/g, ";"),
      ];
      lines.push(row.map(v => `"${v}"`).join(","));
    }

    return lines.join("\n");
  }

  // ─── JSON Generator ───────────────────────────────────────────────────

  private generateJson(entries: GlossaryEntry[], projectName: string): string {
    return JSON.stringify({
      version: "13.13",
      project: projectName,
      generatedAt: new Date().toISOString(),
      generator: "Compleo EJB Client Modernizer — Schema Reverse-Engineering",
      totalEntries: entries.length,
      entries: entries.map(e => ({
        table: e.tableName,
        column: e.dbColumn,
        businessName: {
          fr: e.businessNameFr,
          en: e.businessNameEn,
        },
        description: e.description,
        domain: e.domain,
        javaType: e.javaType,
        confidence: {
          level: e.confidence,
          score: e.confidenceScore,
          sources: e.sources,
        },
        codeContext: {
          variableNames: e.variableNames,
          comparedTo: e.comparedTo,
          joinedWith: e.joinedWith,
          usageCount: e.usageCount,
        },
        crossProject: {
          projects: e.projects,
          isConsensus: e.isConsensus,
          conflicts: e.conflicts,
        },
        orphan: e.orphanCategory ? {
          category: e.orphanCategory,
          severity: e.orphanSeverity,
          recommendation: e.orphanRecommendation,
        } : null,
      })),
    }, null, 2);
  }
}
