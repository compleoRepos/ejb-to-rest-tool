/**
 * ClassInventoryTab — Inventaire complet des classes Java du projet.
 * Affiche toutes les classes avec rôle, domaine, LOC, complexité, technologie, package.
 * Groupement par domaine ou par microservice. Filtres avancés.
 *
 * @author Hamza NORDINE
 */
import { useState, useMemo } from "react";
import type { AnalysisData, GraphNode, NodeMetric } from "../ArchitectureExplorer";

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
  yellow: "#facc15",
  teal: "#2dd4bf",
};

const ROLE_COLORS: Record<string, string> = {
  ORCHESTRATOR: "#a78bfa",
  DOMAIN_SERVICE: "#34d399",
  REPOSITORY: "#fb923c",
  VALUE_OBJECT: "#64748b",
  ENUM_TYPE: "#facc15",
  EXCEPTION_TYPE: "#f87171",
  ENTRY_POINT: "#60a5fa",
  BATCH_STEP: "#2dd4bf",
  CONTROLLER: "#22d3ee",
  DAO: "#fb923c",
  DTO: "#94a3b8",
  UTILITY: "#a1a1aa",
  UNKNOWN: "#475569",
};

const TECH_COLORS: Record<string, string> = {
  EJB: "#22d3ee",
  SERVLET: "#60a5fa",
  JSP: "#a78bfa",
  STRUTS: "#fb923c",
  SOAP: "#facc15",
  JDBC: "#f87171",
  HIBERNATE: "#34d399",
  JMS: "#2dd4bf",
  BATCH: "#c084fc",
  SPRING: "#22c55e",
  POJO: "#64748b",
  UNKNOWN: "#475569",
};

interface ClassRow {
  id: string;
  className: string;
  packageName: string;
  role: string;
  domain: string;
  linesOfCode: number;
  complexity: number;
  technologyType: string;
  sourceFile: string;
  microservice: string;
  inDegree: number;
  outDegree: number;
  betweenness: number;
}

type GroupBy = "none" | "domain" | "microservice" | "role" | "technology";
type SortField = "className" | "linesOfCode" | "complexity" | "inDegree" | "outDegree" | "betweenness";

export default function ClassInventoryTab({ data }: { data: AnalysisData }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("ALL");
  const [filterTech, setFilterTech] = useState("ALL");
  const [filterDomain, setFilterDomain] = useState("ALL");
  const [groupBy, setGroupBy] = useState<GroupBy>("domain");
  const [sortField, setSortField] = useState<SortField>("className");
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["__all__"]));

  // Build class inventory from graph nodes + microservice mapping
  const { rows, roles, techs, domains } = useMemo(() => {
    const nodes = data.graph.nodes || [];
    const metrics = data.graph.nodeMetrics || [];
    const metricsMap = new Map<string, NodeMetric>();
    for (const m of metrics) metricsMap.set(m.nodeId, m);

    // Build class→microservice map
    const classMsMap = new Map<string, string>();
    for (const ms of data.microservices) {
      for (const cls of ms.classes) {
        classMsMap.set(cls, ms.name);
      }
      if (ms.classDetails) {
        for (const cd of ms.classDetails) {
          classMsMap.set(cd.nodeId, ms.name);
        }
      }
    }

    const roleSet = new Set<string>();
    const techSet = new Set<string>();
    const domainSet = new Set<string>();

    const classRows: ClassRow[] = nodes
      .filter((n: GraphNode) => n.type === "CLASS")
      .map((n: GraphNode) => {
        const m = metricsMap.get(n.id);
        const role = n.role || "UNKNOWN";
        const tech = n.technologyType || "UNKNOWN";
        const domain = n.domain || "UNKNOWN";
        roleSet.add(role);
        techSet.add(tech);
        domainSet.add(domain);
        return {
          id: n.id,
          className: n.className || n.id,
          packageName: n.packageName || "",
          role,
          domain,
          linesOfCode: n.linesOfCode || 0,
          complexity: n.complexity || 0,
          technologyType: tech,
          sourceFile: n.sourceFile || "",
          microservice: classMsMap.get(n.id) || classMsMap.get(n.className || "") || "Non assigné",
          inDegree: m?.inDegree || 0,
          outDegree: m?.outDegree || 0,
          betweenness: m?.betweenness || 0,
        };
      });

    return {
      rows: classRows,
      roles: [...roleSet].sort(),
      techs: [...techSet].sort(),
      domains: [...domainSet].sort(),
    };
  }, [data]);

  // External nodes
  const externalNodes = useMemo(() => {
    return (data.graph.nodes || []).filter((n: GraphNode) => n.type === "EXTERNAL");
  }, [data]);

  // Filter and sort
  const filteredRows = useMemo(() => {
    let result = rows;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.className.toLowerCase().includes(term) ||
        r.packageName.toLowerCase().includes(term) ||
        r.sourceFile.toLowerCase().includes(term)
      );
    }
    if (filterRole !== "ALL") result = result.filter(r => r.role === filterRole);
    if (filterTech !== "ALL") result = result.filter(r => r.technologyType === filterTech);
    if (filterDomain !== "ALL") result = result.filter(r => r.domain === filterDomain);

    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [rows, searchTerm, filterRole, filterTech, filterDomain, sortField, sortAsc]);

  // Group
  const grouped = useMemo(() => {
    if (groupBy === "none") return { "Toutes les classes": filteredRows };
    const groups: Record<string, ClassRow[]> = {};
    for (const r of filteredRows) {
      const key = groupBy === "domain" ? r.domain
        : groupBy === "microservice" ? r.microservice
        : groupBy === "role" ? r.role
        : r.technologyType;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [filteredRows, groupBy]);

  // Stats
  const stats = useMemo(() => {
    const totalLOC = rows.reduce((s, r) => s + r.linesOfCode, 0);
    const avgComplexity = rows.length > 0 ? rows.reduce((s, r) => s + r.complexity, 0) / rows.length : 0;
    const highComplexity = rows.filter(r => r.complexity > 10).length;
    return { totalClasses: rows.length, totalLOC, avgComplexity, highComplexity, externalCount: externalNodes.length };
  }, [rows, externalNodes]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(field === "className"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      {/* Stats bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatBadge label="Classes Java" value={stats.totalClasses} color={C.cyan} />
        <StatBadge label="Lignes de code" value={stats.totalLOC.toLocaleString()} color={C.green} />
        <StatBadge label="Complexité moy." value={stats.avgComplexity.toFixed(1)} color={C.orange} />
        <StatBadge label="Haute complexité" value={stats.highComplexity} color={C.red} />
        <StatBadge label="Systèmes externes" value={stats.externalCount} color={C.yellow} />
        <StatBadge label="Microservices" value={data.microservices.length} color={C.blue} />
        <StatBadge label="Domaines" value={data.domains.length} color={C.purple} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Rechercher classe, package..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            background: C.darkPanel, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: "6px 12px", color: C.text, fontSize: 11, width: 220,
            fontFamily: "'JetBrains Mono', monospace", outline: "none",
          }}
        />

        <SelectFilter label="Rôle" value={filterRole} options={roles} onChange={setFilterRole} colors={ROLE_COLORS} />
        <SelectFilter label="Techno" value={filterTech} options={techs} onChange={setFilterTech} colors={TECH_COLORS} />
        <SelectFilter label="Domaine" value={filterDomain} options={domains} onChange={setFilterDomain} />

        <div style={{ marginLeft: 8, display: "flex", gap: 4 }}>
          {(["none", "domain", "microservice", "role", "technology"] as GroupBy[]).map(g => (
            <button key={g} onClick={() => setGroupBy(g)} style={{
              padding: "4px 8px", borderRadius: 4, border: "none", cursor: "pointer",
              fontSize: 9, fontWeight: groupBy === g ? 700 : 400,
              background: groupBy === g ? `${C.cyan}22` : "transparent",
              color: groupBy === g ? C.cyan : C.textMuted,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {g === "none" ? "Aucun" : g === "domain" ? "Domaine" : g === "microservice" ? "µService" : g === "role" ? "Rôle" : "Techno"}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: C.textMuted }}>
          {filteredRows.length} / {rows.length} classes
        </span>
      </div>

      {/* Grouped table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {Object.entries(grouped).map(([groupName, groupRows]) => {
          const isExpanded = expandedGroups.has(groupName) || expandedGroups.has("__all__");
          const groupLOC = groupRows.reduce((s, r) => s + r.linesOfCode, 0);

          return (
            <div key={groupName} style={{ marginBottom: 8 }}>
              {/* Group header */}
              {groupBy !== "none" && (
                <button
                  onClick={() => toggleGroup(groupName)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "8px 12px", background: C.darkPanel, border: `1px solid ${C.border}`,
                    borderRadius: 6, cursor: "pointer", color: C.text, fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                  }}
                >
                  <span style={{ fontSize: 10, transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }}>
                    ▶
                  </span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 10,
                    background: `${ROLE_COLORS[groupName] || TECH_COLORS[groupName] || C.cyan}22`,
                    color: ROLE_COLORS[groupName] || TECH_COLORS[groupName] || C.cyan,
                  }}>
                    {groupName.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 10, color: C.textMuted }}>
                    {groupRows.length} classes · {groupLOC.toLocaleString()} LOC
                  </span>
                </button>
              )}

              {/* Table */}
              {isExpanded && (
                <div style={{
                  borderRadius: 6, border: `1px solid ${C.border}`,
                  marginTop: groupBy !== "none" ? 4 : 0, overflow: "hidden",
                }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: C.darkPanel, position: "sticky", top: 0, zIndex: 1 }}>
                        <Th onClick={() => handleSort("className")} active={sortField === "className"} asc={sortAsc}>Classe</Th>
                        <Th>Package</Th>
                        <Th>Rôle</Th>
                        <Th>Techno</Th>
                        <Th>Domaine</Th>
                        <Th>µService</Th>
                        <Th onClick={() => handleSort("linesOfCode")} active={sortField === "linesOfCode"} asc={sortAsc} align="right">LOC</Th>
                        <Th onClick={() => handleSort("complexity")} active={sortField === "complexity"} asc={sortAsc} align="right">Cpx</Th>
                        <Th onClick={() => handleSort("inDegree")} active={sortField === "inDegree"} asc={sortAsc} align="right">In°</Th>
                        <Th onClick={() => handleSort("outDegree")} active={sortField === "outDegree"} asc={sortAsc} align="right">Out°</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((row, i) => (
                        <tr key={row.id} style={{
                          background: i % 2 === 0 ? "transparent" : `${C.darkPanel}66`,
                          borderBottom: `1px solid ${C.border}22`,
                        }}>
                          <td style={{ padding: "6px 10px", color: C.text, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.className}
                          </td>
                          <td style={{ padding: "6px 10px", color: C.textMuted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9 }}>
                            {row.packageName}
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <TagBadge label={row.role} color={ROLE_COLORS[row.role] || C.textMuted} />
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <TagBadge label={row.technologyType} color={TECH_COLORS[row.technologyType] || C.textMuted} />
                          </td>
                          <td style={{ padding: "6px 10px", color: C.textMuted, fontSize: 9, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.domain.replace(/_/g, " ")}
                          </td>
                          <td style={{ padding: "6px 10px", color: C.cyan, fontSize: 9, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.microservice}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: row.linesOfCode > 300 ? C.orange : C.textMuted, fontWeight: row.linesOfCode > 300 ? 700 : 400 }}>
                            {row.linesOfCode}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: row.complexity > 10 ? C.red : row.complexity > 5 ? C.orange : C.textMuted, fontWeight: row.complexity > 10 ? 700 : 400 }}>
                            {row.complexity}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: row.inDegree > 5 ? C.blue : C.textMuted }}>
                            {row.inDegree}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: row.outDegree > 5 ? C.green : C.textMuted }}>
                            {row.outDegree}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* External systems */}
      {externalNodes.length > 0 && (
        <div style={{
          background: `${C.yellow}08`, borderRadius: 8, padding: 14,
          border: `1px solid ${C.yellow}22`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>
            Systèmes externes ({externalNodes.length})
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {externalNodes.map((n: GraphNode) => (
              <div key={n.id} style={{
                padding: "4px 10px", borderRadius: 4, fontSize: 10,
                background: `${C.yellow}15`, color: C.yellow,
                border: `1px solid ${C.yellow}33`,
              }}>
                {n.systemName || n.id}
                {n.protocol && <span style={{ fontSize: 8, opacity: 0.7, marginLeft: 4 }}>({n.protocol})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cyclic dependencies warning */}
      {(data.graph.cyclicDependencies || []).length > 0 && (
        <div style={{
          background: `${C.red}08`, borderRadius: 8, padding: 14,
          border: `1px solid ${C.red}22`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 8 }}>
            Dépendances cycliques ({data.graph.cyclicDependencies!.length})
          </div>
          {data.graph.cyclicDependencies!.map((cycle, i) => (
            <div key={i} style={{ fontSize: 10, color: C.text, padding: "3px 0" }}>
              {cycle.join(" → ")} → {cycle[0]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatBadge({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{
      background: `${color}08`, border: `1px solid ${color}22`, borderRadius: 6,
      padding: "8px 12px", display: "flex", alignItems: "baseline", gap: 6,
    }}>
      <span style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </span>
      <span style={{ fontSize: 9, color: C.textMuted }}>{label}</span>
    </div>
  );
}

function TagBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 3,
      fontSize: 9, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}33`,
    }}>
      {label}
    </span>
  );
}

function SelectFilter({ label, value, options, onChange, colors }: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void; colors?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: C.darkPanel, border: `1px solid ${C.border}`, borderRadius: 4,
        padding: "4px 8px", color: value === "ALL" ? C.textMuted : (colors?.[value] || C.text),
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace", outline: "none",
        cursor: "pointer",
      }}
    >
      <option value="ALL">{label}: Tous</option>
      {options.map(o => (
        <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
      ))}
    </select>
  );
}

function Th({ children, onClick, active, asc, align }: {
  children: React.ReactNode; onClick?: () => void; active?: boolean; asc?: boolean; align?: string;
}) {
  return (
    <th style={{
      padding: "8px 10px", textAlign: (align as any) || "left", fontSize: 9, fontWeight: 700,
      color: active ? C.cyan : C.textMuted, cursor: onClick ? "pointer" : "default",
      borderBottom: `1px solid ${C.border}`, userSelect: "none",
      fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap",
    }} onClick={onClick}>
      {children} {active && (asc ? "▲" : "▼")}
    </th>
  );
}
