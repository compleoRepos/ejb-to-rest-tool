/**
 * DynamicGraphTab — Graphe de relations SVG interactif.
 * Alimenté par les données d'analyse (microservices + dépendances).
 */
import { useState, useMemo, useRef, useCallback } from "react";
import type { AnalysisData } from "../ArchitectureExplorer";

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
};

const DOMAIN_COLORS: Record<string, string> = {
  ACCOUNT_MANAGEMENT: "#4A90D9",
  PAYMENT_PROCESSING: "#E74C3C",
  CREDIT_MANAGEMENT: "#F39C12",
  KYC_COMPLIANCE: "#27AE60",
  CARD_MANAGEMENT: "#9B59B6",
  BATCH_PROCESSING: "#1ABC9C",
  RISK_MANAGEMENT: "#E67E22",
  TRANSFER_MANAGEMENT: "#3498DB",
  CUSTOMER_MANAGEMENT: "#2ECC71",
  REPORTING: "#95A5A6",
  UNKNOWN: "#BDC3C7",
};

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  classCount: number;
  domain: string;
  color: string;
  endpoints: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export default function DynamicGraphTab({ data }: { data: AnalysisData }) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const WIDTH = 900;
  const HEIGHT = 600;
  const PADDING = 80;

  // Build nodes from microservices
  const { nodes, edges } = useMemo(() => {
    const ms = data.microservices;
    if (ms.length === 0) return { nodes: [], edges: [] };

    // Circular layout
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;
    const radius = Math.min(WIDTH, HEIGHT) / 2 - PADDING;

    const graphNodes: GraphNode[] = ms.map((m, i) => {
      const angle = (2 * Math.PI * i) / ms.length - Math.PI / 2;
      return {
        id: m.id,
        label: m.name,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        classCount: m.classCount,
        domain: m.boundedContext,
        color: DOMAIN_COLORS[m.boundedContext] || DOMAIN_COLORS.UNKNOWN,
        endpoints: m.endpoints,
      };
    });

    const graphEdges: GraphEdge[] = [];
    for (const m of ms) {
      for (const dep of m.dependencies) {
        graphEdges.push({
          source: m.id,
          target: dep.targetServiceId,
          type: dep.type,
        });
      }
    }

    return { nodes: graphNodes, edges: graphEdges };
  }, [data.microservices]);

  // Get node position by id
  const nodeMap = useMemo(() => {
    const map: Record<string, GraphNode> = {};
    for (const n of nodes) map[n.id] = n;
    return map;
  }, [nodes]);

  // Highlighted edges (connected to hovered/selected node)
  const highlightedEdges = useMemo(() => {
    const target = selectedNode || hoveredNode;
    if (!target) return new Set<number>();
    const set = new Set<number>();
    edges.forEach((e, i) => {
      if (e.source === target || e.target === target) set.add(i);
    });
    return set;
  }, [edges, hoveredNode, selectedNode]);

  const handleExportSVG = useCallback(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current.outerHTML;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "architecture-graph.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (nodes.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: C.textMuted }}>
        Aucun microservice détecté pour construire le graphe.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
          Graphe de relations — {nodes.length} services, {edges.length} liens
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={handleExportSVG} style={{
          padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: C.darkPanel, color: C.textMuted, fontSize: 10, cursor: "pointer",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Export SVG
        </button>
        {selectedNode && (
          <button onClick={() => setSelectedNode(null)} style={{
            padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.cyan}44`,
            background: `${C.cyan}11`, color: C.cyan, fontSize: 10, cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            Désélectionner
          </button>
        )}
      </div>

      {/* SVG Graph */}
      <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden", background: C.dark }}>
        <svg ref={svgRef} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{ display: "block" }}>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={C.textMuted} opacity={0.5} />
            </marker>
            <marker id="arrowhead-highlight" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={C.cyan} opacity={0.8} />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge, i) => {
            const src = nodeMap[edge.source];
            const tgt = nodeMap[edge.target];
            if (!src || !tgt) return null;
            const isHighlighted = highlightedEdges.has(i);
            const hasActiveNode = selectedNode || hoveredNode;
            return (
              <line key={i}
                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                stroke={isHighlighted ? C.cyan : C.border}
                strokeWidth={isHighlighted ? 2 : 1}
                opacity={hasActiveNode ? (isHighlighted ? 0.9 : 0.15) : 0.4}
                markerEnd={isHighlighted ? "url(#arrowhead-highlight)" : "url(#arrowhead)"}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const isActive = node.id === selectedNode || node.id === hoveredNode;
            const hasActiveNode = selectedNode || hoveredNode;
            const isConnected = highlightedEdges.size > 0 && edges.some((e, i) =>
              highlightedEdges.has(i) && (e.source === node.id || e.target === node.id)
            );
            const nodeRadius = Math.max(16, Math.min(30, 10 + node.classCount / 3));
            const opacity = hasActiveNode ? (isActive || isConnected ? 1 : 0.3) : 1;

            return (
              <g key={node.id}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}
                style={{ cursor: "pointer" }}
                opacity={opacity}
              >
                {/* Glow */}
                {isActive && (
                  <circle cx={node.x} cy={node.y} r={nodeRadius + 6}
                    fill="none" stroke={node.color} strokeWidth={2} opacity={0.4} />
                )}
                {/* Node circle */}
                <circle cx={node.x} cy={node.y} r={nodeRadius}
                  fill={`${node.color}33`} stroke={node.color} strokeWidth={isActive ? 2.5 : 1.5} />
                {/* Class count */}
                <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle"
                  fill={node.color} fontSize={10} fontWeight={700}
                  fontFamily="'JetBrains Mono', monospace">
                  {node.classCount}
                </text>
                {/* Label */}
                <text x={node.x} y={node.y + nodeRadius + 14} textAnchor="middle"
                  fill={isActive ? C.text : C.textMuted} fontSize={9} fontWeight={isActive ? 700 : 400}
                  fontFamily="'JetBrains Mono', monospace">
                  {node.label.length > 20 ? node.label.slice(0, 18) + "…" : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected node details */}
      {selectedNode && nodeMap[selectedNode] && (
        <div style={{
          background: C.darkPanel, borderRadius: 8, padding: 16,
          border: `1px solid ${nodeMap[selectedNode].color}44`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: nodeMap[selectedNode].color, marginBottom: 8 }}>
            {nodeMap[selectedNode].label}
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 11, color: C.textMuted }}>
            <span>Domaine: <strong style={{ color: C.text }}>{nodeMap[selectedNode].domain}</strong></span>
            <span>Classes: <strong style={{ color: C.text }}>{nodeMap[selectedNode].classCount}</strong></span>
            <span>Endpoints: <strong style={{ color: C.text }}>{nodeMap[selectedNode].endpoints}</strong></span>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {edges.filter(e => e.source === selectedNode).map((e, i) => (
              <span key={`out-${i}`} style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 9,
                background: `${C.green}22`, color: C.green,
              }}>
                → {nodeMap[e.target]?.label || e.target}
              </span>
            ))}
            {edges.filter(e => e.target === selectedNode).map((e, i) => (
              <span key={`in-${i}`} style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 9,
                background: `${C.blue}22`, color: C.blue,
              }}>
                ← {nodeMap[e.source]?.label || e.source}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10, color: C.textMuted }}>
        <span style={{ fontWeight: 700 }}>Domaines:</span>
        {[...new Set(nodes.map(n => n.domain))].map(domain => (
          <span key={domain} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: DOMAIN_COLORS[domain] || DOMAIN_COLORS.UNKNOWN,
            }} />
            {domain}
          </span>
        ))}
      </div>
    </div>
  );
}
