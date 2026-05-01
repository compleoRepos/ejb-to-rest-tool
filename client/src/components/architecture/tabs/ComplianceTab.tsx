/**
 * ComplianceTab — Onglet "Conformité" de l'Architecture Explorer.
 * Affiche les fichiers SOC 2 générés, le rapport de conformité,
 * et un tableau de bord interactif des critères TSC couverts.
 *
 * @author Compleo
 */
import React, { useState, useEffect, useMemo } from "react";

const C = {
  dark: "#0a0e17",
  darkPanel: "#0f1420",
  border: "#1e2a3a",
  text: "#e2e8f0",
  textMuted: "#64748b",
  cyan: "#22d3ee",
  green: "#34d399",
  orange: "#fb923c",
  red: "#f87171",
  blue: "#60a5fa",
  purple: "#a78bfa",
  yellow: "#fbbf24",
};

// ─── TSC Reference Data ──────────────────────────────────────────────────────

const TSC_DESCRIPTIONS: Record<string, { name: string; description: string; category: string }> = {
  CC3: { name: "CC3 — Risk Assessment", description: "Évaluation des risques et gestion des menaces", category: "Common Criteria" },
  CC5: { name: "CC5 — Control Activities", description: "Activités de contrôle et validation des entrées", category: "Common Criteria" },
  CC6: { name: "CC6 — Logical & Physical Access", description: "Contrôles d'accès logiques et physiques", category: "Common Criteria" },
  CC7: { name: "CC7 — System Operations", description: "Opérations système et monitoring", category: "Common Criteria" },
  CC8: { name: "CC8 — Change Management", description: "Gestion des changements et audit trail", category: "Common Criteria" },
  CC9: { name: "CC9 — Risk Mitigation", description: "Atténuation des risques", category: "Common Criteria" },
  A1:  { name: "A1 — Availability", description: "Disponibilité des systèmes et health checks", category: "Availability" },
  PI1: { name: "PI1 — Processing Integrity", description: "Intégrité du traitement des données", category: "Processing Integrity" },
  C1:  { name: "C1 — Confidentiality", description: "Confidentialité et chiffrement des données", category: "Confidentiality" },
};

const CATEGORY_ICONS: Record<string, string> = {
  audit: "📋",
  security: "🔒",
  validation: "✅",
  monitoring: "📡",
  error: "🛡️",
  config: "⚙️",
};

const CATEGORY_LABELS: Record<string, string> = {
  audit: "Audit Trail",
  security: "Sécurité",
  validation: "Validation",
  monitoring: "Monitoring",
  error: "Gestion d'erreurs",
  config: "Configuration",
};

const CATEGORY_COLORS: Record<string, string> = {
  audit: C.cyan,
  security: C.red,
  validation: C.green,
  monitoring: C.blue,
  error: C.orange,
  config: C.purple,
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ComplianceFile {
  path: string;
  content: string;
  category: string;
  tsc: string;
  fileName: string;
}

interface ComplianceSummary {
  totalFiles: number;
  criteriasCovered: string[];
  categories: Record<string, number>;
}

interface ComplianceData {
  enabled: boolean;
  files: ComplianceFile[];
  report: string | null;
  summary: ComplianceSummary | null;
}

interface Props {
  sessionId?: string;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  return (
    <div style={{
      background: `${color}11`,
      border: `1px solid ${color}33`,
      borderRadius: 8,
      padding: "14px 16px",
      flex: "1 1 150px",
      minWidth: 140,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function TSCBadge({ tsc, covered }: { tsc: string; covered: boolean }) {
  const info = TSC_DESCRIPTIONS[tsc];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      background: covered ? `${C.green}11` : `${C.red}08`,
      border: `1px solid ${covered ? C.green : C.red}33`,
      borderRadius: 6,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: covered ? C.green : C.red,
        flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{info?.name || tsc}</div>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{info?.description || ""}</div>
      </div>
      <div style={{
        fontSize: 9, fontWeight: 700,
        padding: "2px 8px", borderRadius: 4,
        background: covered ? `${C.green}22` : `${C.red}22`,
        color: covered ? C.green : C.red,
        textTransform: "uppercase",
      }}>
        {covered ? "Couvert" : "Non couvert"}
      </div>
    </div>
  );
}

function FileCard({ file, isExpanded, onToggle }: { file: ComplianceFile; isExpanded: boolean; onToggle: () => void }) {
  const catColor = CATEGORY_COLORS[file.category] || C.cyan;
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      overflow: "hidden",
      background: C.darkPanel,
    }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px",
          cursor: "pointer",
          background: isExpanded ? `${catColor}11` : "transparent",
          borderBottom: isExpanded ? `1px solid ${C.border}` : "none",
        }}
      >
        <span style={{ fontSize: 14 }}>{CATEGORY_ICONS[file.category] || "📄"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
            {file.fileName}
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            {file.path}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {file.tsc.split(", ").filter(Boolean).map(t => (
            <span key={t} style={{
              fontSize: 9, fontWeight: 700,
              padding: "2px 6px", borderRadius: 3,
              background: `${catColor}22`,
              color: catColor,
            }}>
              {t}
            </span>
          ))}
          <span style={{
            fontSize: 9, fontWeight: 600,
            padding: "2px 8px", borderRadius: 3,
            background: `${catColor}15`,
            color: catColor,
            border: `1px solid ${catColor}33`,
          }}>
            {CATEGORY_LABELS[file.category] || file.category}
          </span>
        </div>
        <span style={{
          fontSize: 10, color: C.textMuted,
          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.15s ease",
        }}>▶</span>
      </div>
      {isExpanded && (
        <div style={{
          padding: 0,
          maxHeight: 400,
          overflow: "auto",
        }}>
          <pre style={{
            margin: 0,
            padding: "12px 16px",
            fontSize: 11,
            lineHeight: 1.5,
            color: C.text,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            background: "#080c14",
          }}>
            {file.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function ReportSection({ report }: { report: string }) {
  const [expanded, setExpanded] = useState(true);

  // Simple markdown-to-HTML rendering for the report
  const sections = useMemo(() => {
    const lines = report.split("\n");
    const result: Array<{ type: "h1" | "h2" | "h3" | "blockquote" | "table" | "code" | "text"; content: string }> = [];
    let inCode = false;
    let codeBlock = "";
    let inTable = false;
    let tableRows: string[] = [];

    for (const line of lines) {
      if (line.startsWith("```")) {
        if (inCode) {
          result.push({ type: "code", content: codeBlock });
          codeBlock = "";
          inCode = false;
        } else {
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        codeBlock += line + "\n";
        continue;
      }
      if (line.startsWith("|")) {
        if (!inTable) inTable = true;
        tableRows.push(line);
        continue;
      }
      if (inTable && !line.startsWith("|")) {
        result.push({ type: "table", content: tableRows.join("\n") });
        tableRows = [];
        inTable = false;
      }
      if (line.startsWith("# ")) result.push({ type: "h1", content: line.slice(2) });
      else if (line.startsWith("## ")) result.push({ type: "h2", content: line.slice(3) });
      else if (line.startsWith("### ")) result.push({ type: "h3", content: line.slice(4) });
      else if (line.startsWith("> ")) result.push({ type: "blockquote", content: line.slice(2) });
      else if (line.trim()) result.push({ type: "text", content: line });
    }
    if (inTable && tableRows.length > 0) {
      result.push({ type: "table", content: tableRows.join("\n") });
    }
    return result;
  }, [report]);

  return (
    <div style={{
      border: `1px solid ${C.cyan}33`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px",
          background: `${C.cyan}11`,
          cursor: "pointer",
          borderBottom: expanded ? `1px solid ${C.border}` : "none",
        }}
      >
        <span style={{ fontSize: 16 }}>📄</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flex: 1 }}>
          Rapport de Conformité SOC 2 Type II
        </span>
        <span style={{
          fontSize: 10, color: C.textMuted,
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.15s ease",
        }}>▶</span>
      </div>
      {expanded && (
        <div style={{ padding: "16px 20px", background: C.darkPanel }}>
          {sections.map((section, i) => {
            switch (section.type) {
              case "h1":
                return <div key={i} style={{ fontSize: 18, fontWeight: 800, color: C.cyan, marginBottom: 12, marginTop: i > 0 ? 20 : 0 }}>{section.content}</div>;
              case "h2":
                return <div key={i} style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8, marginTop: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>{section.content}</div>;
              case "h3":
                return <div key={i} style={{ fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 6, marginTop: 12 }}>{section.content}</div>;
              case "blockquote":
                return <div key={i} style={{ borderLeft: `3px solid ${C.cyan}`, paddingLeft: 12, color: C.textMuted, fontSize: 11, marginBottom: 8, fontStyle: "italic" }}>{section.content}</div>;
              case "code":
                return (
                  <pre key={i} style={{
                    background: "#080c14", borderRadius: 4, padding: "10px 14px",
                    fontSize: 11, color: C.green, fontFamily: "'JetBrains Mono', monospace",
                    overflow: "auto", marginBottom: 8,
                  }}>
                    {section.content}
                  </pre>
                );
              case "table":
                return <MarkdownTable key={i} raw={section.content} />;
              default:
                return <div key={i} style={{ fontSize: 12, color: C.text, lineHeight: 1.6, marginBottom: 6 }}>{formatInlineMarkdown(section.content)}</div>;
            }
          })}
        </div>
      )}
    </div>
  );
}

function MarkdownTable({ raw }: { raw: string }) {
  const lines = raw.split("\n").filter(l => l.trim());
  if (lines.length < 2) return null;

  const parseRow = (line: string) =>
    line.split("|").map(c => c.trim()).filter(Boolean);

  const headers = parseRow(lines[0]);
  // Skip separator line (line[1])
  const rows = lines.slice(2).map(parseRow);

  return (
    <div style={{ overflowX: "auto", marginBottom: 12 }}>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
      }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                textAlign: "left", padding: "8px 10px",
                borderBottom: `2px solid ${C.cyan}44`,
                color: C.cyan, fontWeight: 700, fontSize: 10,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : `${C.cyan}05` }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: "6px 10px",
                  borderBottom: `1px solid ${C.border}`,
                  color: C.text,
                }}>
                  {formatCellContent(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCellContent(text: string): React.ReactElement {
  if (text === "✅ Implémenté" || text === "✅ Health Checks" || text === "✅ Input Validation" || text === "✅ Chiffrement AES-256") {
    return <span style={{ color: C.green, fontWeight: 600 }}>{text}</span>;
  }
  if (text.startsWith("❌")) {
    return <span style={{ color: C.red, fontWeight: 600 }}>{text}</span>;
  }
  if (text.startsWith("`") && text.endsWith("`")) {
    return <code style={{ background: `${C.cyan}15`, padding: "1px 4px", borderRadius: 3, fontSize: 10, color: C.cyan }}>{text.slice(1, -1)}</code>;
  }
  return <>{text}</>;
}

function formatInlineMarkdown(text: string): React.ReactElement {
  // Handle bold, code, and links
  const parts: React.ReactElement[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Inline code
    const codeMatch = remaining.match(/`(.+?)`/);

    const match = [boldMatch, codeMatch]
      .filter(Boolean)
      .sort((a, b) => (a!.index || 0) - (b!.index || 0))[0];

    if (!match || match.index === undefined) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    if (match.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, match.index)}</span>);
    }

    if (match === boldMatch) {
      parts.push(<strong key={key++} style={{ color: C.text, fontWeight: 700 }}>{match[1]}</strong>);
    } else {
      parts.push(
        <code key={key++} style={{ background: `${C.cyan}15`, padding: "1px 4px", borderRadius: 3, fontSize: 10, color: C.cyan }}>
          {match[1]}
        </code>
      );
    }

    remaining = remaining.slice((match.index || 0) + match[0].length);
  }

  return <>{parts}</>;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ComplianceTab({ sessionId }: Props) {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<"dashboard" | "files" | "report">("dashboard");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Fetch compliance data
  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);

    fetch(`/api/agent/${sessionId}/compliance`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((result: ComplianceData) => {
        setData(result);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [sessionId]);

  // Filtered files
  const filteredFiles = useMemo(() => {
    if (!data?.files) return [];
    if (filterCategory === "all") return data.files;
    return data.files.filter(f => f.category === filterCategory);
  }, [data?.files, filterCategory]);

  // All TSC criteria (covered + not covered)
  const allTSC = useMemo(() => {
    const allKeys = Object.keys(TSC_DESCRIPTIONS);
    const coveredSet = new Set(data?.summary?.criteriasCovered || []);
    return allKeys.map(key => ({
      key,
      covered: coveredSet.has(key),
    }));
  }, [data?.summary?.criteriasCovered]);

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 300, color: C.textMuted,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
          <div style={{ fontSize: 12 }}>Chargement des données de conformité...</div>
        </div>
      </div>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 300, color: C.red,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 12 }}>Erreur : {error}</div>
        </div>
      </div>
    );
  }

  // ─── No session ────────────────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 300, color: C.textMuted,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            Conformité SOC 2
          </div>
          <div style={{ fontSize: 11 }}>
            Sélectionnez une session pour visualiser les données de conformité.
          </div>
        </div>
      </div>
    );
  }

  // ─── Not enabled ───────────────────────────────────────────────────────────
  if (!data?.enabled) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 300, color: C.textMuted,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            SOC 2 Compliance non activé
          </div>
          <div style={{ fontSize: 11, maxWidth: 400, lineHeight: 1.5 }}>
            Activez l'option "SOC 2 Compliance" dans les paramètres de l'agent
            avant de lancer la génération pour obtenir les fichiers de conformité.
          </div>
        </div>
      </div>
    );
  }

  // ─── Main view ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${C.green}11, ${C.cyan}11)`,
        borderRadius: 8, padding: 20, border: `1px solid ${C.green}22`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>
              🔐 Conformité SOC 2 Type II
            </div>
            <div style={{ fontSize: 11, color: C.textMuted }}>
              AICPA Trust Service Criteria — Contrôles de sécurité implémentés
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["dashboard", "files", "report"] as const).map(view => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                style={{
                  padding: "6px 14px", borderRadius: 4,
                  border: `1px solid ${activeView === view ? C.cyan : C.border}`,
                  background: activeView === view ? `${C.cyan}22` : "transparent",
                  color: activeView === view ? C.cyan : C.textMuted,
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {view === "dashboard" ? "📊 Dashboard" : view === "files" ? "📁 Fichiers" : "📄 Rapport"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Dashboard View ──────────────────────────────────────────────────── */}
      {activeView === "dashboard" && (
        <>
          {/* Metrics */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <MetricCard label="Fichiers SOC 2" value={data.summary?.totalFiles || 0} color={C.cyan} icon="📁" />
            <MetricCard label="Critères TSC" value={`${data.summary?.criteriasCovered.length || 0}/9`} color={C.green} icon="✅" />
            <MetricCard
              label="Couverture"
              value={`${Math.round(((data.summary?.criteriasCovered.length || 0) / 9) * 100)}%`}
              color={((data.summary?.criteriasCovered.length || 0) / 9) >= 0.7 ? C.green : C.orange}
              icon="📈"
            />
            <MetricCard label="Catégories" value={Object.keys(data.summary?.categories || {}).filter(k => (data.summary?.categories as any)?.[k] > 0).length} color={C.purple} icon="🏷️" />
          </div>

          {/* TSC Coverage Grid */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>
              Trust Service Criteria (TSC)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allTSC.map(({ key, covered }) => (
                <TSCBadge key={key} tsc={key} covered={covered} />
              ))}
            </div>
          </div>

          {/* Category Breakdown */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>
              Répartition par catégorie
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Object.entries(data.summary?.categories || {}).filter(([, count]) => count > 0).map(([cat, count]) => (
                <div key={cat} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 14px", borderRadius: 6,
                  background: `${CATEGORY_COLORS[cat] || C.cyan}11`,
                  border: `1px solid ${CATEGORY_COLORS[cat] || C.cyan}33`,
                  cursor: "pointer",
                  flex: "1 1 180px",
                }}
                onClick={() => { setFilterCategory(cat); setActiveView("files"); }}
                >
                  <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[cat] || "📄"}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{CATEGORY_LABELS[cat] || cat}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>{count} fichier{count > 1 ? "s" : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ─── Files View ──────────────────────────────────────────────────────── */}
      {activeView === "files" && (
        <>
          {/* Filter bar */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={() => setFilterCategory("all")}
              style={{
                padding: "5px 12px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                border: `1px solid ${filterCategory === "all" ? C.cyan : C.border}`,
                background: filterCategory === "all" ? `${C.cyan}22` : "transparent",
                color: filterCategory === "all" ? C.cyan : C.textMuted,
                cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Tous ({data.files.length})
            </button>
            {Object.entries(data.summary?.categories || {}).filter(([, count]) => count > 0).map(([cat, count]) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                style={{
                  padding: "5px 12px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                  border: `1px solid ${filterCategory === cat ? (CATEGORY_COLORS[cat] || C.cyan) : C.border}`,
                  background: filterCategory === cat ? `${CATEGORY_COLORS[cat] || C.cyan}22` : "transparent",
                  color: filterCategory === cat ? (CATEGORY_COLORS[cat] || C.cyan) : C.textMuted,
                  cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]} ({count})
              </button>
            ))}
          </div>

          {/* File list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredFiles.map(file => (
              <FileCard
                key={file.path}
                file={file}
                isExpanded={expandedFiles.has(file.path)}
                onToggle={() => toggleFile(file.path)}
              />
            ))}
          </div>
        </>
      )}

      {/* ─── Report View ─────────────────────────────────────────────────────── */}
      {activeView === "report" && (
        <>
          {data.report ? (
            <ReportSection report={data.report} />
          ) : (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 200, color: C.textMuted,
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
                <div style={{ fontSize: 12 }}>Aucun rapport de conformité disponible.</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
