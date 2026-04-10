/**
 * ArchitectureExplorer — Panneau central avec 4 onglets.
 * F1: Matrice des flux, F2: Graphe de relations,
 * F3: Impact Analysis, F4: Timeline de migration.
 *
 * @author Hamza NORDINE
 */
import { useState } from "react";
import FluxMatrixTab from "./tabs/FluxMatrixTab";
import GraphTab from "./tabs/GraphTab";
import ImpactTab from "./tabs/ImpactTab";
import TimelineTab from "./tabs/TimelineTab";
import { C } from "./shared/primitives";

const TABS = [
  { id: "matrix", label: "Matrice des flux", icon: "📊", shortcut: "F1" },
  { id: "graph", label: "Graphe de relations", icon: "🕸️", shortcut: "F2" },
  { id: "impact", label: "Impact Analysis", icon: "🎯", shortcut: "F3" },
  { id: "timeline", label: "Timeline", icon: "📅", shortcut: "F4" },
];

export default function ArchitectureExplorer({ onSelectNode }) {
  const [activeTab, setActiveTab] = useState("matrix");

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: C.dark, color: C.text,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    }}>
      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 2, padding: "8px 12px 0",
        borderBottom: `1px solid ${C.border}`,
        background: C.darkPanel,
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: "6px 6px 0 0",
                border: "none", cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, fontWeight: isActive ? 700 : 400,
                color: isActive ? C.cyan : C.textMuted,
                background: isActive ? C.dark : "transparent",
                borderBottom: isActive ? `2px solid ${C.cyan}` : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span style={{
                fontSize: 8, padding: "1px 4px", borderRadius: 3,
                background: isActive ? `${C.cyan}22` : `${C.textDim}22`,
                color: isActive ? C.cyan : C.textDim,
              }}>
                {tab.shortcut}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, padding: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeTab === "matrix" && <FluxMatrixTab />}
        {activeTab === "graph" && <GraphTab onSelectNode={onSelectNode} />}
        {activeTab === "impact" && <ImpactTab />}
        {activeTab === "timeline" && <TimelineTab />}
      </div>
    </div>
  );
}
