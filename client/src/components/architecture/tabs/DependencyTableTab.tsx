/**
 * DependencyTableTab — Tableau clair des dépendances inter-microservices.
 * Remplace la matrice N×N SVG incompréhensible par un tableau lisible.
 */
import { useState, useMemo } from "react";
import type { AnalysisData } from "../ArchitectureExplorer";

const C = {
  dark: "#0a0e17",
  darkPanel: "#0f1420",
  darkCard: "#131a2b",
  border: "#1e2a3a",
  borderLight: "#2a3a50",
  text: "#e2e8f0",
  textMuted: "#64748b",
  cyan: "#22d3ee",
  green: "#34d399",
  orange: "#fb923c",
  red: "#f87171",
  blue: "#60a5fa",
  purple: "#a78bfa",
};

const TYPE_COLORS: Record<string, { color: string; label: string }> = {
  EJB_CALL: { color: C.cyan, label: "EJB" },
  JNDI_LOOKUP: { color: C.blue, label: "JNDI" },
  REST: { color: C.green, label: "REST" },
  DATABASE: { color: C.orange, label: "DB" },
  JMS: { color: C.purple, label: "JMS" },
  INTERNAL: { color: C.textMuted, label: "Interne" },
};

interface DependencyRow {
  source: string;
  sourceId: string;
  target: string;
  targetId: string;
  type: string;
  sourceClasses: number;
  targetClasses: number;
}

export default function DependencyTableTab({ data }: { data: AnalysisData }) {
  const [filterType, setFilterType] = useState("ALL");
  const [sortBy, setSortBy] = useState<"source" | "target" | "type">("source");
  const [searchTerm, setSearchTerm] = useState("");

  // Build dependency rows from microservices
  const rows = useMemo(() => {
    const result: DependencyRow[] = [];
    for (const ms of data.microservices) {
      for (const dep of ms.dependencies) {
        result.push({
          source: ms.name,
          sourceId: ms.id,
          target: dep.targetServiceName,
          targetId: dep.targetServiceId,
          type: dep.type,
          sourceClasses: ms.classCount,
          targetClasses: data.microservices.find(m => m.id === dep.targetServiceId)?.classCount || 0,
        });
      }
    }
    return result;
  }, [data.microservices]);

  // Filter and sort
  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (filterType !== "ALL") {
      filtered = filtered.filter(r => r.type === filterType);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.source.toLowerCase().includes(term) ||
        r.target.toLowerCase().includes(term)
      );
    }
    filtered.sort((a, b) => a[sortBy].localeCompare(b[sortBy]));
    return filtered;
  }, [rows, filterType, sortBy, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const r of rows) {
      byType[r.type] = (byType[r.type] || 0) + 1;
    }
    return { total: rows.length, byType };
  }, [rows]);

  // Coupling matrix (simplified)
  const couplingData = useMemo(() => {
    const services = data.microservices.map(ms => ms.name);
    const matrix: Record<string, Record<string, number>> = {};
    for (const s of services) matrix[s] = {};
    for (const r of rows) {
      matrix[r.source] = matrix[r.source] || {};
      matrix[r.source][r.target] = (matrix[r.source][r.target] || 0) + 1;
    }
    return { services, matrix };
  }, [data.microservices, rows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      {/* Header stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard label="Dépendances totales" value={stats.total} color={C.cyan} />
        <StatCard label="Microservices" value={data.microservices.length} color={C.green} />
        <StatCard label="Flux critiques" value={data.criticalFlows.length} color={C.red} />
        <StatCard label="Points d'entrée" value={data.entryPoints.length} color={C.blue} />
        <StatCard label="Points de sortie" value={data.exitPoints.length} color={C.orange} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Rechercher un service..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            background: C.darkPanel, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: "6px 12px", color: C.text, fontSize: 11, width: 200,
            fontFamily: "'JetBrains Mono', monospace", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          <FilterChip label="Tous" active={filterType === "ALL"} color={C.cyan}
            onClick={() => setFilterType("ALL")} count={stats.total} />
          {Object.entries(stats.byType).map(([type, count]) => (
            <FilterChip key={type} label={TYPE_COLORS[type]?.label || type}
              active={filterType === type} color={TYPE_COLORS[type]?.color || C.textMuted}
              onClick={() => setFilterType(type)} count={count} />
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: C.textMuted }}>
          {filteredRows.length} / {rows.length} dépendances
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.darkPanel, position: "sticky", top: 0, zIndex: 1 }}>
              <Th onClick={() => setSortBy("source")} active={sortBy === "source"}>Source</Th>
              <Th>→</Th>
              <Th onClick={() => setSortBy("target")} active={sortBy === "target"}>Cible</Th>
              <Th onClick={() => setSortBy("type")} active={sortBy === "type"}>Type</Th>
              <Th>Classes source</Th>
              <Th>Classes cible</Th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 32, color: C.textMuted }}>
                  Aucune dépendance trouvée
                </td>
              </tr>
            ) : (
              filteredRows.map((row, i) => (
                <tr key={i} style={{
                  background: i % 2 === 0 ? "transparent" : `${C.darkPanel}66`,
                  borderBottom: `1px solid ${C.border}33`,
                }}>
                  <td style={{ padding: "8px 12px", color: C.cyan, fontWeight: 600 }}>
                    {row.source}
                  </td>
                  <td style={{ padding: "8px 4px", color: C.textMuted, textAlign: "center" }}>→</td>
                  <td style={{ padding: "8px 12px", color: C.green, fontWeight: 600 }}>
                    {row.target}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 4,
                      fontSize: 10, fontWeight: 600,
                      background: `${TYPE_COLORS[row.type]?.color || C.textMuted}22`,
                      color: TYPE_COLORS[row.type]?.color || C.textMuted,
                      border: `1px solid ${TYPE_COLORS[row.type]?.color || C.textMuted}44`,
                    }}>
                      {TYPE_COLORS[row.type]?.label || row.type}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", color: C.textMuted, textAlign: "center" }}>
                    {row.sourceClasses}
                  </td>
                  <td style={{ padding: "8px 12px", color: C.textMuted, textAlign: "center" }}>
                    {row.targetClasses}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Critical Flows */}
      {data.criticalFlows.length > 0 && (
        <div style={{
          background: C.darkPanel, borderRadius: 8, padding: 16,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span>⚠️</span> Flux critiques ({data.criticalFlows.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.criticalFlows.map(flow => (
              <div key={flow.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                background: `${C.red}08`, borderRadius: 6, border: `1px solid ${C.red}22`,
              }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: flow.riskLevel === "HIGH" ? `${C.red}22` : `${C.orange}22`,
                  color: flow.riskLevel === "HIGH" ? C.red : C.orange,
                }}>
                  {flow.riskLevel}
                </span>
                <span style={{ color: C.text, fontSize: 11, fontWeight: 600, flex: 1 }}>
                  {flow.name}
                </span>
                <span style={{ color: C.textMuted, fontSize: 10 }}>
                  Profondeur: {flow.depth} · {flow.pathLength} nœuds
                </span>
                {flow.transactional && (
                  <span style={{
                    padding: "2px 6px", borderRadius: 4, fontSize: 9,
                    background: `${C.purple}22`, color: C.purple,
                  }}>
                    TX
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: `${color}08`, border: `1px solid ${color}22`, borderRadius: 8,
      padding: "12px 16px", minWidth: 120,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function FilterChip({ label, active, color, onClick, count }: {
  label: string; active: boolean; color: string; onClick: () => void; count: number;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
      fontSize: 10, fontWeight: active ? 700 : 400,
      background: active ? `${color}22` : "transparent",
      color: active ? color : "#64748b",
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {label}
      <span style={{ fontSize: 9, opacity: 0.7 }}>({count})</span>
    </button>
  );
}

function Th({ children, onClick, active }: { children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700,
      color: active ? "#22d3ee" : "#64748b", cursor: onClick ? "pointer" : "default",
      borderBottom: "1px solid #1e2a3a", userSelect: "none",
      fontFamily: "'JetBrains Mono', monospace",
    }} onClick={onClick}>
      {children} {active && "▼"}
    </th>
  );
}
