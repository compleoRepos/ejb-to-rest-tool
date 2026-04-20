/**
 * CriticalFlowsTab — Flux critiques détaillés avec chemin complet,
 * points d'entrée/sortie, facteurs de risque, profondeur, transactionnalité.
 * Visualisation des entry/exit points du projet et des modules fonctionnels.
 *
 * @author Hamza NORDINE
 */
import { useState, useMemo } from "react";
import type { AnalysisData, CriticalFlow, EntryPoint, ExitPoint, FunctionalModule } from "../ArchitectureExplorer";

const C = {
  dark: "#0a0e17",
  darkPanel: "#0f1420",
  darkCard: "#131a2b",
  border: "#1e2a3a",
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

const RISK_COLORS: Record<string, string> = {
  CRITICAL: C.red,
  HIGH: C.orange,
  MEDIUM: C.yellow,
  LOW: C.green,
};

type ViewMode = "flows" | "entryExit" | "modules";

export default function CriticalFlowsTab({ data }: { data: AnalysisData }) {
  const [viewMode, setViewMode] = useState<ViewMode>("flows");
  const [expandedFlows, setExpandedFlows] = useState<Set<string>>(new Set());
  const [filterRisk, setFilterRisk] = useState("ALL");

  const flows = data.criticalFlows || [];
  const entryPoints = data.entryPoints || [];
  const exitPoints = data.exitPoints || [];
  const modules = data.functionalModules || [];

  const filteredFlows = useMemo(() => {
    if (filterRisk === "ALL") return flows;
    return flows.filter(f => f.riskLevel === filterRisk);
  }, [flows, filterRisk]);

  const toggleFlow = (id: string) => {
    setExpandedFlows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Stats
  const stats = useMemo(() => ({
    total: flows.length,
    critical: flows.filter(f => f.riskLevel === "CRITICAL").length,
    high: flows.filter(f => f.riskLevel === "HIGH").length,
    transactional: flows.filter(f => f.transactional).length,
    avgDepth: flows.length > 0 ? flows.reduce((s, f) => s + f.depth, 0) / flows.length : 0,
    entryPoints: entryPoints.length,
    exitPoints: exitPoints.length,
    modules: modules.length,
  }), [flows, entryPoints, exitPoints, modules]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatBadge label="Flux critiques" value={stats.total} color={C.cyan} />
        <StatBadge label="CRITICAL" value={stats.critical} color={C.red} />
        <StatBadge label="HIGH" value={stats.high} color={C.orange} />
        <StatBadge label="Transactionnels" value={stats.transactional} color={C.purple} />
        <StatBadge label="Prof. moy." value={stats.avgDepth.toFixed(1)} color={C.blue} />
        <StatBadge label="Entry Points" value={stats.entryPoints} color={C.green} />
        <StatBadge label="Exit Points" value={stats.exitPoints} color={C.yellow} />
        {modules.length > 0 && <StatBadge label="Modules" value={stats.modules} color={C.teal} />}
      </div>

      {/* View mode tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {([
          { key: "flows" as ViewMode, label: `Flux critiques (${flows.length})` },
          { key: "entryExit" as ViewMode, label: `Entry/Exit (${entryPoints.length + exitPoints.length})` },
          ...(modules.length > 0 ? [{ key: "modules" as ViewMode, label: `Modules (${modules.length})` }] : []),
        ]).map(tab => (
          <button key={tab.key} onClick={() => setViewMode(tab.key)} style={{
            padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
            fontSize: 11, fontWeight: viewMode === tab.key ? 700 : 400,
            background: viewMode === tab.key ? `${C.cyan}22` : "transparent",
            color: viewMode === tab.key ? C.cyan : C.textMuted,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {viewMode === "flows" && (
          <FlowsView
            flows={filteredFlows}
            expandedFlows={expandedFlows}
            toggleFlow={toggleFlow}
            filterRisk={filterRisk}
            setFilterRisk={setFilterRisk}
          />
        )}
        {viewMode === "entryExit" && (
          <EntryExitView entryPoints={entryPoints} exitPoints={exitPoints} />
        )}
        {viewMode === "modules" && (
          <ModulesView modules={modules} />
        )}
      </div>
    </div>
  );
}

// ─── Flows View ─────────────────────────────────────────────────────────────

function FlowsView({ flows, expandedFlows, toggleFlow, filterRisk, setFilterRisk }: {
  flows: CriticalFlow[];
  expandedFlows: Set<string>;
  toggleFlow: (id: string) => void;
  filterRisk: string;
  setFilterRisk: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Filter */}
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map(r => (
          <button key={r} onClick={() => setFilterRisk(r)} style={{
            padding: "3px 10px", borderRadius: 4, border: "none", cursor: "pointer",
            fontSize: 9, fontWeight: filterRisk === r ? 700 : 400,
            background: filterRisk === r ? `${RISK_COLORS[r] || C.cyan}22` : "transparent",
            color: filterRisk === r ? (RISK_COLORS[r] || C.cyan) : C.textMuted,
          }}>
            {r === "ALL" ? "Tous" : r}
          </button>
        ))}
      </div>

      {flows.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.textMuted, fontSize: 12 }}>
          Aucun flux critique trouvé avec ce filtre.
        </div>
      )}

      {flows.map(flow => {
        const isExpanded = expandedFlows.has(flow.id);
        const riskColor = RISK_COLORS[flow.riskLevel] || C.textMuted;

        return (
          <div key={flow.id} style={{
            background: C.darkPanel, borderRadius: 8,
            border: `1px solid ${riskColor}33`, overflow: "hidden",
          }}>
            {/* Header */}
            <button onClick={() => toggleFlow(flow.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "12px 16px", background: "transparent", border: "none",
              cursor: "pointer", color: C.text, fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{
                fontSize: 10, transition: "transform 0.15s",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
              }}>▶</span>

              <span style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                background: `${riskColor}22`, color: riskColor,
              }}>
                {flow.riskLevel}
              </span>

              <span style={{ fontSize: 12, fontWeight: 600, flex: 1, textAlign: "left" }}>
                {flow.name}
              </span>

              <span style={{ fontSize: 9, color: C.textMuted }}>
                Prof: {flow.depth}
              </span>
              <span style={{ fontSize: 9, color: C.textMuted }}>
                Étapes: {flow.pathLength}
              </span>
              {flow.transactional && (
                <span style={{
                  padding: "2px 6px", borderRadius: 3, fontSize: 8,
                  background: `${C.purple}22`, color: C.purple,
                }}>TX</span>
              )}
            </button>

            {/* Expanded details */}
            {isExpanded && (
              <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Path */}
                {flow.path && flow.path.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, marginBottom: 6 }}>
                      Chemin du flux
                    </div>
                    <div style={{
                      display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center",
                    }}>
                      {flow.path.map((step, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{
                            padding: "3px 8px", borderRadius: 4, fontSize: 9,
                            background: i === 0 ? `${C.green}22` : i === flow.path!.length - 1 ? `${C.red}22` : `${C.blue}15`,
                            color: i === 0 ? C.green : i === flow.path!.length - 1 ? C.red : C.text,
                            border: `1px solid ${i === 0 ? C.green : i === flow.path!.length - 1 ? C.red : C.border}33`,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {step.split(".").pop()}
                          </span>
                          {i < flow.path!.length - 1 && (
                            <span style={{ color: C.textMuted, fontSize: 10 }}>→</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risk factors */}
                {flow.riskFactors.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.orange, marginBottom: 6 }}>
                      Facteurs de risque
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {flow.riskFactors.map((rf, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "4px 10px", borderRadius: 4,
                          background: `${C.orange}08`, fontSize: 10, color: C.text,
                        }}>
                          <span style={{ color: C.orange }}>⚠</span> {rf}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Entry/Exit points of this flow */}
                {flow.entryPoint && (
                  <div style={{ fontSize: 10 }}>
                    <span style={{ color: C.green, fontWeight: 700 }}>Entry: </span>
                    <span style={{ color: C.text }}>
                      {flow.entryPoint.className || flow.entryPoint.nodeId}
                      {flow.entryPoint.protocol && (
                        <span style={{ color: C.textMuted }}> ({flow.entryPoint.protocol})</span>
                      )}
                    </span>
                  </div>
                )}
                {flow.exitPoints && flow.exitPoints.length > 0 && (
                  <div style={{ fontSize: 10 }}>
                    <span style={{ color: C.yellow, fontWeight: 700 }}>Exit: </span>
                    {flow.exitPoints.map((ep: any, i: number) => (
                      <span key={i} style={{ color: C.text }}>
                        {ep.className || ep.nodeId}
                        {ep.target && <span style={{ color: C.textMuted }}> → {ep.target}</span>}
                        {i < flow.exitPoints!.length - 1 && ", "}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Entry/Exit View ────────────────────────────────────────────────────────

function EntryExitView({ entryPoints, exitPoints }: {
  entryPoints: EntryPoint[];
  exitPoints: ExitPoint[];
}) {
  const PROTOCOL_COLORS: Record<string, string> = {
    HTTP: C.blue,
    SOAP: C.yellow,
    EJB: C.cyan,
    JMS: C.teal,
    BATCH: C.purple,
    TIMER: C.orange,
    JDBC: C.red,
    JNDI: C.orange,
    FILE: C.green,
    UNKNOWN: C.textMuted,
  };

  return (
    <div style={{ display: "flex", gap: 16 }}>
      {/* Entry Points */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 10,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 14 }}>→</span> Points d'entrée ({entryPoints.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {entryPoints.map((ep, i) => (
            <div key={i} style={{
              padding: "10px 14px", borderRadius: 6,
              background: `${C.green}08`, border: `1px solid ${C.green}22`,
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
                  {ep.className}
                </span>
                <span style={{
                  padding: "2px 6px", borderRadius: 3, fontSize: 8,
                  background: `${PROTOCOL_COLORS[ep.protocol] || C.textMuted}22`,
                  color: PROTOCOL_COLORS[ep.protocol] || C.textMuted,
                }}>
                  {ep.protocol}
                </span>
              </div>
              <div style={{ fontSize: 9, color: C.textMuted }}>
                Type: {ep.type}
                {ep.description && <span> — {ep.description}</span>}
              </div>
            </div>
          ))}
          {entryPoints.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, color: C.textMuted, fontSize: 11 }}>
              Aucun point d'entrée détecté
            </div>
          )}
        </div>
      </div>

      {/* Exit Points */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: C.yellow, marginBottom: 10,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 14 }}>←</span> Points de sortie ({exitPoints.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {exitPoints.map((ep, i) => (
            <div key={i} style={{
              padding: "10px 14px", borderRadius: 6,
              background: `${C.yellow}08`, border: `1px solid ${C.yellow}22`,
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
                  {ep.className}
                </span>
                {ep.protocol && (
                  <span style={{
                    padding: "2px 6px", borderRadius: 3, fontSize: 8,
                    background: `${PROTOCOL_COLORS[ep.protocol] || C.textMuted}22`,
                    color: PROTOCOL_COLORS[ep.protocol] || C.textMuted,
                  }}>
                    {ep.protocol}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 9, color: C.textMuted }}>
                Type: {ep.type}
                {ep.target && <span> → <span style={{ color: C.orange }}>{ep.target}</span></span>}
                {ep.targetSystem && <span> ({ep.targetSystem})</span>}
              </div>
            </div>
          ))}
          {exitPoints.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, color: C.textMuted, fontSize: 11 }}>
              Aucun point de sortie détecté
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modules View ───────────────────────────────────────────────────────────

function ModulesView({ modules }: { modules: FunctionalModule[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {modules.map(mod => {
        const isExp = expanded.has(mod.id);
        return (
          <div key={mod.id} style={{
            background: C.darkPanel, borderRadius: 8,
            border: `1px solid ${C.teal}22`, overflow: "hidden",
          }}>
            <button onClick={() => toggle(mod.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "12px 16px", background: "transparent", border: "none",
              cursor: "pointer", color: C.text, fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{
                fontSize: 10, transition: "transform 0.15s",
                transform: isExp ? "rotate(90deg)" : "rotate(0)",
              }}>▶</span>

              <span style={{ fontSize: 12, fontWeight: 700, flex: 1, textAlign: "left" }}>
                {mod.name}
              </span>

              <span style={{ fontSize: 9, color: C.textMuted }}>
                {mod.classes.length} classes
              </span>
              <span style={{ fontSize: 9, color: C.green }}>
                Coh: {Math.round(mod.cohesion * 100)}%
              </span>
              <span style={{ fontSize: 9, color: mod.coupling > 0.5 ? C.orange : C.textMuted }}>
                Coup: {Math.round(mod.coupling * 100)}%
              </span>
            </button>

            {isExp && (
              <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 10, color: C.textMuted }}>{mod.description}</div>

                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ fontSize: 10 }}>
                    <span style={{ color: C.textMuted }}>Domaines: </span>
                    {mod.domains.map((d, i) => (
                      <span key={i} style={{
                        padding: "1px 6px", borderRadius: 3, fontSize: 9, marginRight: 4,
                        background: `${C.blue}15`, color: C.blue,
                      }}>
                        {d.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10 }}>
                    <span style={{ color: C.textMuted }}>Arêtes internes: </span>
                    <span style={{ color: C.green }}>{mod.internalEdges}</span>
                    <span style={{ color: C.textMuted }}> | Externes: </span>
                    <span style={{ color: C.orange }}>{mod.externalEdges}</span>
                  </div>
                </div>

                {mod.entryPoints.length > 0 && (
                  <div style={{ fontSize: 10 }}>
                    <span style={{ color: C.green, fontWeight: 700 }}>Entry: </span>
                    {mod.entryPoints.map((ep: any, i: number) => (
                      <span key={i} style={{ color: C.text }}>
                        {ep.className || ep.nodeId || JSON.stringify(ep)}
                        {i < mod.entryPoints.length - 1 && ", "}
                      </span>
                    ))}
                  </div>
                )}

                {mod.classes.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 4 }}>Classes ({mod.classes.length})</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {mod.classes.slice(0, 30).map((cls, i) => (
                        <span key={i} style={{
                          padding: "2px 6px", borderRadius: 3, fontSize: 8,
                          background: `${C.cyan}10`, color: C.text,
                          border: `1px solid ${C.border}`,
                        }}>
                          {cls.split(".").pop()}
                        </span>
                      ))}
                      {mod.classes.length > 30 && (
                        <span style={{ fontSize: 8, color: C.textMuted, padding: "2px 6px" }}>
                          +{mod.classes.length - 30} autres
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {modules.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.textMuted, fontSize: 12 }}>
          Aucun module fonctionnel détecté.
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
