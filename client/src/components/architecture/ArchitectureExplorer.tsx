/**
 * ArchitectureExplorer v7.0 — Panneau d'exploration riche alimenté par les données d'analyse.
 * 6 onglets : Inventaire, Dépendances, Graphe, Flux critiques, Impact, Résumé migration.
 * Types enrichis avec graph.nodes, graph.edges, classDetails, endpoints, etc.
 *
 * @author Compleo
 */
import { useState } from "react";
import ClassInventoryTab from "./tabs/ClassInventoryTab";
import DependencyTableTab from "./tabs/DependencyTableTab";
import DynamicGraphTab from "./tabs/DynamicGraphTab";
import CriticalFlowsTab from "./tabs/CriticalFlowsTab";
import DynamicImpactTab from "./tabs/DynamicImpactTab";
import MigrationSummaryTab from "./tabs/MigrationSummaryTab";
import AIInsightsTab from "./tabs/AIInsightsTab";
import ComplianceTab from "./tabs/ComplianceTab";

const TABS = [
  { id: "inventory", label: "Inventaire classes", icon: "📦", shortcut: "F1" },
  { id: "dependencies", label: "Dépendances", icon: "📋", shortcut: "F2" },
  { id: "graph", label: "Graphe de relations", icon: "🕸️", shortcut: "F3" },
  { id: "flows", label: "Flux critiques", icon: "⚡", shortcut: "F4" },
  { id: "impact", label: "Impact Analysis", icon: "🎯", shortcut: "F5" },
  { id: "migration", label: "Résumé migration", icon: "🔄", shortcut: "F6" },
  { id: "ai-insights", label: "Insights IA", icon: "🧠", shortcut: "F7" },
  { id: "compliance", label: "Conformité", icon: "🔐", shortcut: "F8" },
];

const C = {
  dark: "#0a0e17",
  darkPanel: "#0f1420",
  border: "#1e2a3a",
  text: "#e2e8f0",
  textMuted: "#64748b",
  cyan: "#22d3ee",
};

// ─── Enriched types matching the backend response ──────────────────────────

export interface GraphNode {
  id: string;
  type: string;
  className?: string;
  packageName?: string;
  role?: string;
  domain?: string;
  linesOfCode?: number;
  complexity?: number;
  technologyType?: string;
  sourceFile?: string;
  systemName?: string;
  externalType?: string;
  protocol?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  label: string;
}

export interface NodeMetric {
  nodeId: string;
  inDegree: number;
  outDegree: number;
  betweenness: number;
  cohesion: number;
}

export interface ClassDetail {
  nodeId: string;
  className: string;
  role: string;
  domain: string;
}

export interface MicroserviceEndpoint {
  method: string;
  path: string;
  description: string;
  sourceClass: string;
  protocol: string;
}

export interface MicroserviceDep {
  targetServiceId: string;
  targetServiceName: string;
  type: string;
  protocol?: string;
  description?: string;
}

export interface EntryPoint {
  nodeId: string;
  className: string;
  type: string;
  protocol: string;
  description?: string;
}

export interface ExitPoint {
  nodeId: string;
  className: string;
  type: string;
  target: string;
  targetSystem?: string;
  protocol?: string;
}

export interface CriticalFlow {
  id: string;
  name: string;
  depth: number;
  riskLevel: string;
  riskFactors: string[];
  transactional: boolean;
  path?: string[];
  pathLength: number;
  entryPoint?: any;
  exitPoints?: any[];
}

export interface FunctionalModule {
  id: string;
  name: string;
  description: string;
  domains: string[];
  classes: string[];
  entryPoints: EntryPoint[];
  exitPoints: ExitPoint[];
  internalEdges: number;
  externalEdges: number;
  cohesion: number;
  coupling: number;
}

export interface AnalysisData {
  graph: {
    totalNodes: number;
    totalEdges: number;
    connectedComponents: number;
    avgDegree: number;
    maxDegree?: number;
    cyclicDependencies?: string[][];
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    nodeMetrics?: NodeMetric[];
  };
  domains: Array<{
    domainId: string;
    classes?: string[];
    classCount: number;
    cohesion: number;
    coupling: number;
    warnings?: string[];
  }>;
  architecture: {
    entryPoints: number;
    exitPoints: number;
    criticalFlows: number;
    highRiskFlows: number;
    modules: number;
    avgModuleCohesion?: number;
    avgModuleCoupling?: number;
  };
  microservices: Array<{
    id: string;
    name: string;
    description?: string;
    boundedContext: string;
    classes: string[];
    classDetails?: ClassDetail[];
    classCount: number;
    endpoints: MicroserviceEndpoint[] | number;
    endpointCount?: number;
    dependencies: MicroserviceDep[];
    databases?: string[];
    queues?: string[];
    cohesion: number;
    coupling: number;
    complexity?: number;
    linesOfCode?: number;
    springBootConfig?: {
      artifactId: string;
      port: number;
      profiles: string[];
      dependencies: string[];
    } | null;
  }>;
  sharedLibrary: {
    name: string;
    description?: string;
    classes?: string[];
    classCount: number;
  };
  apiGateway: { routes: Array<{ path: string; targetService: string; method: string }> };
  extractionSummary?: {
    totalMicroservices: number;
    totalClasses: number;
    totalEndpoints: number;
    totalDependencies: number;
    avgCohesion: number;
    avgCoupling: number;
    sharedClassCount: number;
  };
  warnings: string[];
  entryPoints: EntryPoint[];
  exitPoints: ExitPoint[];
  criticalFlows: CriticalFlow[];
  functionalModules?: FunctionalModule[];
  // v10.5b: AI Insights
  aiInsights?: {
    architectureAssessment?: { summary: string; patterns: string[]; antiPatterns: string[]; recommendations: string[] };
    migrationRisks?: { summary: string; risks: Array<{ risk: string; severity: string; mitigation: string }> };
    domainBoundaries?: { summary: string; suggestedDomains: Array<{ name: string; classes: string[]; rationale: string }> };
    modernizationStrategy?: { summary: string; phases: Array<{ phase: string; description: string; effort: string }> };
    codeQualityInsights?: { summary: string; hotspots: Array<{ className: string; issue: string; suggestion: string }> };
  } | null;
}

interface Props {
  analysisResult?: AnalysisData | null;
  sessionId?: string;
}

export default function ArchitectureExplorer({ analysisResult, sessionId }: Props) {
  const [activeTab, setActiveTab] = useState("inventory");

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
        overflowX: "auto",
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: "6px 6px 0 0",
                border: "none", cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, fontWeight: isActive ? 700 : 400,
                color: isActive ? C.cyan : C.textMuted,
                background: isActive ? C.dark : "transparent",
                borderBottom: isActive ? `2px solid ${C.cyan}` : "2px solid transparent",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
                flexShrink: 0,
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
        {activeTab === "inventory" && (
          <ClassInventoryTab data={analysisResult} />
        )}
        {activeTab === "dependencies" && (
          <DependencyTableTab data={analysisResult} />
        )}
        {activeTab === "graph" && (
          <DynamicGraphTab data={analysisResult} />
        )}
        {activeTab === "flows" && (
          <CriticalFlowsTab data={analysisResult} />
        )}
        {activeTab === "impact" && (
          <DynamicImpactTab data={analysisResult} />
        )}
        {activeTab === "migration" && (
          <MigrationSummaryTab data={analysisResult} sessionId={sessionId} />
        )}
        {activeTab === "ai-insights" && (
          <AIInsightsTab aiInsights={analysisResult.aiInsights} />
        )}
        {activeTab === "compliance" && (
          <ComplianceTab sessionId={sessionId} />
        )}
      </div>
    </div>
  );
}
