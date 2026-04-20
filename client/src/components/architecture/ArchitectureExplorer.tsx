/**
 * ArchitectureExplorer v6.0 — Panneau dynamique alimenté par les données d'analyse.
 * Remplace les données hardcodées par les props analysisResult + sessionId.
 * 4 onglets : Dépendances, Graphe de relations, Impact, Résumé migration.
 */
import { useState } from "react";
import DependencyTableTab from "./tabs/DependencyTableTab";
import DynamicGraphTab from "./tabs/DynamicGraphTab";
import DynamicImpactTab from "./tabs/DynamicImpactTab";
import MigrationSummaryTab from "./tabs/MigrationSummaryTab";

const TABS = [
  { id: "dependencies", label: "Dépendances", icon: "📋", shortcut: "F1" },
  { id: "graph", label: "Graphe de relations", icon: "🕸️", shortcut: "F2" },
  { id: "impact", label: "Impact Analysis", icon: "🎯", shortcut: "F3" },
  { id: "migration", label: "Résumé migration", icon: "🔄", shortcut: "F4" },
];

const C = {
  dark: "#0a0e17",
  darkPanel: "#0f1420",
  border: "#1e2a3a",
  text: "#e2e8f0",
  textMuted: "#64748b",
  cyan: "#22d3ee",
};

export interface AnalysisData {
  graph: { totalNodes: number; totalEdges: number; connectedComponents: number; avgDegree: number };
  domains: Array<{ domainId: string; classCount: number; cohesion: number; coupling: number }>;
  architecture: { entryPoints: number; exitPoints: number; criticalFlows: number; highRiskFlows: number; modules: number };
  microservices: Array<{
    id: string; name: string; boundedContext: string; classes: string[];
    classCount: number; endpoints: number; cohesion: number; coupling: number;
    dependencies: Array<{ targetServiceId: string; targetServiceName: string; type: string }>;
  }>;
  sharedLibrary: { name: string; classCount: number };
  apiGateway: { routes: Array<{ path: string; targetService: string; method: string }> };
  warnings: string[];
  entryPoints: Array<{ nodeId: string; className: string; type: string; protocol: string }>;
  exitPoints: Array<{ nodeId: string; className: string; type: string; target: string }>;
  criticalFlows: Array<{
    id: string; name: string; depth: number; riskLevel: string;
    riskFactors: string[]; transactional: boolean; pathLength: number;
  }>;
}

interface Props {
  analysisResult?: AnalysisData | null;
  sessionId?: string;
}

export default function ArchitectureExplorer({ analysisResult, sessionId }: Props) {
  const [activeTab, setActiveTab] = useState("dependencies");

  if (!analysisResult) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", color: C.textMuted, fontFamily: "'JetBrains Mono', monospace",
        background: C.dark,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            Aucune analyse disponible
          </div>
          <div style={{ fontSize: 12 }}>
            Lancez une analyse d'architecture pour alimenter l'Explorer.
          </div>
        </div>
      </div>
    );
  }

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
                transition: "all 0.15s ease",
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span style={{
                fontSize: 9, opacity: 0.5, marginLeft: 4,
                padding: "1px 4px", borderRadius: 3,
                background: isActive ? `${C.cyan}22` : "transparent",
              }}>
                {tab.shortcut}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {activeTab === "dependencies" && (
          <DependencyTableTab data={analysisResult} />
        )}
        {activeTab === "graph" && (
          <DynamicGraphTab data={analysisResult} />
        )}
        {activeTab === "impact" && (
          <DynamicImpactTab data={analysisResult} />
        )}
        {activeTab === "migration" && (
          <MigrationSummaryTab data={analysisResult} sessionId={sessionId} />
        )}
      </div>
    </div>
  );
}
