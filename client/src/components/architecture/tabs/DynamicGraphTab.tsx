/**
 * DynamicGraphTab v2.0 — Graphe de relations interactif force-directed.
 * Flèches visibles, labels sur les liens, couleurs par type de dépendance.
 * Nœuds draggables, zoom/pan, highlight au survol.
 */
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
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
  yellow: "#fbbf24",
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

const EDGE_TYPE_STYLES: Record<string, { color: string; label: string; dash?: string }> = {
  EJB_CALL: { color: C.cyan, label: "EJB" },
  JNDI_LOOKUP: { color: C.blue, label: "JNDI" },
  REST: { color: C.green, label: "REST" },
  DATABASE: { color: C.orange, label: "DB" },
  JMS: { color: C.purple, label: "JMS" },
  INTERNAL: { color: C.textMuted, label: "Interne", dash: "4,3" },
  SOAP: { color: C.yellow, label: "SOAP" },
  HTTP: { color: C.green, label: "HTTP" },
};

interface SimNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  classCount: number;
  domain: string;
  color: string;
  endpoints: number;
  cohesion: number;
  coupling: number;
  fx?: number | null; // fixed x (when dragging)
  fy?: number | null;
}

interface SimEdge {
  source: string;
  target: string;
  type: string;
  color: string;
  label: string;
  dash?: string;
}

// ─── Force-directed simulation ─────────────────────────────────────────────

function forceSimulation(
  nodes: SimNode[],
  edges: SimEdge[],
  width: number,
  height: number,
  iterations: number = 200
): SimNode[] {
  const result = nodes.map(n => ({ ...n }));
  const nodeMap: Record<string, SimNode> = {};
  for (const n of result) nodeMap[n.id] = n;

  const centerX = width / 2;
  const centerY = height / 2;
  const k = Math.sqrt((width * height) / Math.max(result.length, 1)); // ideal distance
  const repulsionStrength = k * k * 1.5;
  const attractionStrength = 0.008;
  const centerGravity = 0.02;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations; // cooling
    const damping = 0.85;

    // Repulsion between all pairs
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1; }
        const force = (repulsionStrength / (dist * dist)) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (a.fx == null) { a.vx -= fx; a.vy -= fy; }
        if (b.fx == null) { b.vx += fx; b.vy += fy; }
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const src = nodeMap[edge.source];
      const tgt = nodeMap[edge.target];
      if (!src || !tgt) continue;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const force = dist * attractionStrength * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (src.fx == null) { src.vx += fx; src.vy += fy; }
      if (tgt.fx == null) { tgt.vx -= fx; tgt.vy -= fy; }
    }

    // Center gravity
    for (const n of result) {
      if (n.fx != null) continue;
      n.vx += (centerX - n.x) * centerGravity * alpha;
      n.vy += (centerY - n.y) * centerGravity * alpha;
    }

    // Apply velocities
    const pad = 60;
    for (const n of result) {
      if (n.fx != null) { n.x = n.fx; n.y = n.fy!; continue; }
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(pad, Math.min(width - pad, n.x));
      n.y = Math.max(pad, Math.min(height - pad, n.y));
    }
  }

  return result;
}

// ─── Curved edge path with arrow ────────────────────────────────────────────

function edgePath(
  sx: number, sy: number, tx: number, ty: number,
  nodeRadius: number, curveOffset: number = 0
): { path: string; midX: number; midY: number; labelAngle: number } {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return { path: "", midX: sx, midY: sy, labelAngle: 0 };

  // Shorten by node radius
  const ux = dx / dist;
  const uy = dy / dist;
  const startX = sx + ux * (nodeRadius + 4);
  const startY = sy + uy * (nodeRadius + 4);
  const endX = tx - ux * (nodeRadius + 12); // extra space for arrowhead
  const endY = ty - uy * (nodeRadius + 12);

  if (curveOffset === 0) {
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return {
      path: `M ${startX} ${startY} L ${endX} ${endY}`,
      midX, midY,
      labelAngle: angle > 90 || angle < -90 ? angle + 180 : angle,
    };
  }

  // Perpendicular offset for curved edges
  const perpX = -uy * curveOffset;
  const perpY = ux * curveOffset;
  const cpX = (startX + endX) / 2 + perpX;
  const cpY = (startY + endY) / 2 + perpY;
  const midX = cpX;
  const midY = cpY;
  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);

  return {
    path: `M ${startX} ${startY} Q ${cpX} ${cpY} ${endX} ${endY}`,
    midX, midY,
    labelAngle: angle > 90 || angle < -90 ? angle + 180 : angle,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DynamicGraphTab({ data }: { data: AnalysisData }) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  const WIDTH = 960;
  const HEIGHT = 640;

  // Build nodes + edges
  const { initialNodes, edges } = useMemo(() => {
    const ms = data.microservices;
    if (ms.length === 0) return { initialNodes: [], edges: [] };

    // Initial positions: circular layout
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;
    const radius = Math.min(WIDTH, HEIGHT) / 2 - 100;

    const simNodes: SimNode[] = ms.map((m, i) => {
      const angle = (2 * Math.PI * i) / ms.length - Math.PI / 2;
      return {
        id: m.id,
        label: m.name,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        vx: 0, vy: 0,
        classCount: m.classCount,
        domain: m.boundedContext,
        color: DOMAIN_COLORS[m.boundedContext] || DOMAIN_COLORS.UNKNOWN,
        endpoints: m.endpoints,
        cohesion: m.cohesion,
        coupling: m.coupling,
      };
    });

    const simEdges: SimEdge[] = [];
    for (const m of ms) {
      for (const dep of m.dependencies) {
        const style = EDGE_TYPE_STYLES[dep.type] || { color: C.textMuted, label: dep.type };
        simEdges.push({
          source: m.id,
          target: dep.targetServiceId,
          type: dep.type,
          color: style.color,
          label: style.label,
          dash: (style as any).dash,
        });
      }
    }

    // Run force simulation
    const positioned = forceSimulation(simNodes, simEdges, WIDTH, HEIGHT, 300);
    return { initialNodes: positioned, edges: simEdges };
  }, [data.microservices]);

  // Merge simulation positions with drag overrides
  const nodes = useMemo(() => {
    return initialNodes.map(n => ({
      ...n,
      x: nodePositions[n.id]?.x ?? n.x,
      y: nodePositions[n.id]?.y ?? n.y,
    }));
  }, [initialNodes, nodePositions]);

  const nodeMap = useMemo(() => {
    const map: Record<string, SimNode> = {};
    for (const n of nodes) map[n.id] = n;
    return map;
  }, [nodes]);

  // Detect duplicate edges (A→B and B→A) to curve them
  const edgeCurves = useMemo(() => {
    const pairCount: Record<string, number> = {};
    const pairIndex: Record<string, number> = {};
    const curves: number[] = [];

    for (const e of edges) {
      const key = [e.source, e.target].sort().join("||");
      pairCount[key] = (pairCount[key] || 0) + 1;
    }
    for (const e of edges) {
      const key = [e.source, e.target].sort().join("||");
      const idx = pairIndex[key] || 0;
      pairIndex[key] = idx + 1;
      if (pairCount[key] > 1) {
        curves.push((idx === 0 ? 1 : -1) * 40);
      } else {
        curves.push(0);
      }
    }
    return curves;
  }, [edges]);

  // Highlighted edges
  const activeNodeId = selectedNode || hoveredNode;
  const highlightedEdges = useMemo(() => {
    if (!activeNodeId) return new Set<number>();
    const set = new Set<number>();
    edges.forEach((e, i) => {
      if (e.source === activeNodeId || e.target === activeNodeId) set.add(i);
    });
    return set;
  }, [edges, activeNodeId]);

  const connectedNodes = useMemo(() => {
    if (!activeNodeId) return new Set<string>();
    const set = new Set<string>();
    set.add(activeNodeId);
    edges.forEach((e) => {
      if (e.source === activeNodeId) set.add(e.target);
      if (e.target === activeNodeId) set.add(e.source);
    });
    return set;
  }, [edges, activeNodeId]);

  // Drag handlers
  const handleMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragNodeId(nodeId);
  }, []);

  useEffect(() => {
    if (!dragNodeId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = WIDTH / rect.width;
      const scaleY = HEIGHT / rect.height;
      const x = Math.max(40, Math.min(WIDTH - 40, (e.clientX - rect.left) * scaleX));
      const y = Math.max(40, Math.min(HEIGHT - 40, (e.clientY - rect.top) * scaleY));
      setNodePositions(prev => ({ ...prev, [dragNodeId]: { x, y } }));
    };

    const handleMouseUp = () => {
      setDragNodeId(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragNodeId]);

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

  const handleResetLayout = useCallback(() => {
    setNodePositions({});
    setSelectedNode(null);
  }, []);

  if (nodes.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: C.textMuted }}>
        Aucun microservice détecté pour construire le graphe.
      </div>
    );
  }

  // Stats
  const inDegree: Record<string, number> = {};
  const outDegree: Record<string, number> = {};
  for (const e of edges) {
    outDegree[e.source] = (outDegree[e.source] || 0) + 1;
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "8px 12px", borderRadius: 8,
        background: C.darkPanel, border: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
          {nodes.length} services
        </span>
        <span style={{ fontSize: 12, color: C.cyan, fontWeight: 700 }}>
          {edges.length} liens
        </span>
        <span style={{ fontSize: 10, color: C.textMuted }}>
          (glisser pour déplacer, cliquer pour détails)
        </span>
        <div style={{ flex: 1 }} />

        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.textMuted, cursor: "pointer" }}>
          <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)}
            style={{ accentColor: C.cyan }} />
          Noms
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.textMuted, cursor: "pointer" }}>
          <input type="checkbox" checked={showEdgeLabels} onChange={e => setShowEdgeLabels(e.target.checked)}
            style={{ accentColor: C.cyan }} />
          Types liens
        </label>

        <button onClick={handleResetLayout} style={{
          padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: "transparent", color: C.textMuted, fontSize: 10, cursor: "pointer",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Reset
        </button>
        <button onClick={handleExportSVG} style={{
          padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: "transparent", color: C.textMuted, fontSize: 10, cursor: "pointer",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          SVG
        </button>
      </div>

      {/* Main graph area */}
      <div style={{ display: "flex", gap: 12 }}>
        {/* SVG Graph */}
        <div ref={containerRef} style={{
          flex: 1, borderRadius: 8, border: `1px solid ${C.border}`,
          overflow: "hidden", background: "#060a12",
          position: "relative",
        }}>
          <svg
            ref={svgRef}
            width="100%"
            height={HEIGHT}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            style={{ display: "block", cursor: dragNodeId ? "grabbing" : "default" }}
          >
            <defs>
              {/* Arrow markers per edge type */}
              {Object.entries(EDGE_TYPE_STYLES).map(([type, style]) => (
                <marker key={type} id={`arrow-${type}`}
                  markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M 0 0 L 10 4 L 0 8 L 2 4 Z" fill={style.color} opacity={0.9} />
                </marker>
              ))}
              <marker id="arrow-default"
                markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 0 L 10 4 L 0 8 L 2 4 Z" fill={C.textMuted} opacity={0.7} />
              </marker>
              <marker id="arrow-highlight"
                markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 0 L 12 5 L 0 10 L 3 5 Z" fill="#fff" opacity={0.95} />
              </marker>

              {/* Glow filter */}
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Background grid */}
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={C.border} strokeWidth="0.3" opacity="0.3" />
            </pattern>
            <rect width={WIDTH} height={HEIGHT} fill="url(#grid)" />

            {/* Edges */}
            {edges.map((edge, i) => {
              const src = nodeMap[edge.source];
              const tgt = nodeMap[edge.target];
              if (!src || !tgt) return null;

              const isHighlighted = highlightedEdges.has(i);
              const hasActive = !!activeNodeId;
              const dimmed = hasActive && !isHighlighted;

              const srcRadius = Math.max(20, Math.min(36, 14 + src.classCount / 2));
              const tgtRadius = Math.max(20, Math.min(36, 14 + tgt.classCount / 2));
              const avgRadius = (srcRadius + tgtRadius) / 2;
              const curve = edgeCurves[i] || 0;

              const { path: d, midX, midY, labelAngle } = edgePath(
                src.x, src.y, tgt.x, tgt.y, avgRadius, curve
              );

              if (!d) return null;

              const edgeColor = isHighlighted ? "#fff" : edge.color;
              const edgeOpacity = dimmed ? 0.08 : isHighlighted ? 1 : 0.55;
              const strokeWidth = isHighlighted ? 2.5 : 1.5;
              const markerId = isHighlighted
                ? "url(#arrow-highlight)"
                : `url(#arrow-${edge.type in EDGE_TYPE_STYLES ? edge.type : "default"})`;

              return (
                <g key={`edge-${i}`}>
                  {/* Edge line */}
                  <path
                    d={d}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={edge.dash || "none"}
                    opacity={edgeOpacity}
                    markerEnd={markerId}
                  />
                  {/* Edge label */}
                  {showEdgeLabels && !dimmed && (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x={-14} y={-8} width={28} height={16} rx={4}
                        fill={isHighlighted ? edge.color : "#0a0e17"}
                        stroke={edge.color}
                        strokeWidth={0.5}
                        opacity={isHighlighted ? 0.95 : 0.85}
                      />
                      <text
                        textAnchor="middle" dominantBaseline="middle"
                        fill={isHighlighted ? "#fff" : edge.color}
                        fontSize={8} fontWeight={700}
                        fontFamily="'JetBrains Mono', monospace"
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const isActive = node.id === activeNodeId;
              const hasActive = !!activeNodeId;
              const isConnected = connectedNodes.has(node.id);
              const dimmed = hasActive && !isConnected;
              const nodeRadius = Math.max(20, Math.min(36, 14 + node.classCount / 2));
              const opacity = dimmed ? 0.15 : 1;
              const isDragging = dragNodeId === node.id;

              const totalDegree = (inDegree[node.id] || 0) + (outDegree[node.id] || 0);

              return (
                <g
                  key={node.id}
                  onMouseEnter={() => !dragNodeId && setHoveredNode(node.id)}
                  onMouseLeave={() => !dragNodeId && setHoveredNode(null)}
                  onClick={() => !dragNodeId && setSelectedNode(node.id === selectedNode ? null : node.id)}
                  onMouseDown={(e) => handleMouseDown(node.id, e)}
                  style={{ cursor: isDragging ? "grabbing" : "grab" }}
                  opacity={opacity}
                >
                  {/* Outer glow ring for active */}
                  {isActive && (
                    <>
                      <circle cx={node.x} cy={node.y} r={nodeRadius + 10}
                        fill="none" stroke={node.color} strokeWidth={1.5} opacity={0.25}
                        filter="url(#glow)" />
                      <circle cx={node.x} cy={node.y} r={nodeRadius + 5}
                        fill="none" stroke={node.color} strokeWidth={2} opacity={0.5} />
                    </>
                  )}

                  {/* Node background circle */}
                  <circle cx={node.x} cy={node.y} r={nodeRadius}
                    fill={`${node.color}22`}
                    stroke={node.color}
                    strokeWidth={isActive ? 3 : 1.8}
                  />

                  {/* Inner gradient fill */}
                  <circle cx={node.x} cy={node.y} r={nodeRadius - 2}
                    fill={`${node.color}${isActive ? "44" : "15"}`}
                  />

                  {/* Class count */}
                  <text x={node.x} y={node.y - 2} textAnchor="middle" dominantBaseline="middle"
                    fill={isActive ? "#fff" : node.color} fontSize={12} fontWeight={800}
                    fontFamily="'JetBrains Mono', monospace">
                    {node.classCount}
                  </text>

                  {/* Small degree indicator */}
                  {totalDegree > 0 && (
                    <text x={node.x} y={node.y + 10} textAnchor="middle" dominantBaseline="middle"
                      fill={C.textMuted} fontSize={7}
                      fontFamily="'JetBrains Mono', monospace">
                      {totalDegree} liens
                    </text>
                  )}

                  {/* Label below */}
                  {showLabels && (
                    <text x={node.x} y={node.y + nodeRadius + 14} textAnchor="middle"
                      fill={isActive ? "#fff" : dimmed ? C.textMuted : C.text}
                      fontSize={10} fontWeight={isActive ? 800 : 500}
                      fontFamily="'JetBrains Mono', monospace">
                      {node.label.length > 22 ? node.label.slice(0, 20) + "…" : node.label}
                    </text>
                  )}

                  {/* Endpoint badge */}
                  {node.endpoints > 0 && !dimmed && (
                    <g>
                      <circle cx={node.x + nodeRadius - 2} cy={node.y - nodeRadius + 2} r={7}
                        fill={C.green} stroke="#060a12" strokeWidth={1.5} />
                      <text x={node.x + nodeRadius - 2} y={node.y - nodeRadius + 3}
                        textAnchor="middle" dominantBaseline="middle"
                        fill="#000" fontSize={7} fontWeight={800}
                        fontFamily="'JetBrains Mono', monospace">
                        {node.endpoints}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Side panel: selected node details or legend */}
        <div style={{
          width: 240, flexShrink: 0,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {/* Selected node info */}
          {selectedNode && nodeMap[selectedNode] ? (
            <div style={{
              background: C.darkPanel, borderRadius: 8, padding: 14,
              border: `1px solid ${nodeMap[selectedNode].color}55`,
            }}>
              <div style={{
                fontSize: 13, fontWeight: 800, color: nodeMap[selectedNode].color,
                marginBottom: 10, display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: nodeMap[selectedNode].color,
                  display: "inline-block",
                }} />
                {nodeMap[selectedNode].label}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                {[
                  { label: "Classes", value: nodeMap[selectedNode].classCount, color: C.text },
                  { label: "Endpoints", value: nodeMap[selectedNode].endpoints, color: C.green },
                  { label: "Cohésion", value: `${(nodeMap[selectedNode].cohesion * 100).toFixed(0)}%`, color: C.cyan },
                  { label: "Couplage", value: `${(nodeMap[selectedNode].coupling * 100).toFixed(0)}%`, color: C.orange },
                ].map(item => (
                  <div key={item.label} style={{
                    background: `${C.border}44`, borderRadius: 6, padding: "6px 8px",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: item.color }}>{item.value}</div>
                    <div style={{ fontSize: 8, color: C.textMuted, marginTop: 2 }}>{item.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 4, fontWeight: 700 }}>
                Domaine: <span style={{ color: C.text }}>{nodeMap[selectedNode].domain}</span>
              </div>

              {/* Outgoing */}
              {edges.filter(e => e.source === selectedNode).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9, color: C.green, fontWeight: 700, marginBottom: 4 }}>
                    Dépendances sortantes →
                  </div>
                  {edges.filter(e => e.source === selectedNode).map((e, i) => (
                    <div key={`out-${i}`} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "3px 6px", borderRadius: 4, marginBottom: 2,
                      background: `${e.color}11`, fontSize: 9,
                    }}>
                      <span style={{
                        padding: "1px 5px", borderRadius: 3,
                        background: `${e.color}33`, color: e.color,
                        fontWeight: 700, fontSize: 8,
                      }}>
                        {e.label}
                      </span>
                      <span style={{ color: C.text }}>
                        {nodeMap[e.target]?.label || e.target}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Incoming */}
              {edges.filter(e => e.target === selectedNode).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9, color: C.blue, fontWeight: 700, marginBottom: 4 }}>
                    Dépendances entrantes ←
                  </div>
                  {edges.filter(e => e.target === selectedNode).map((e, i) => (
                    <div key={`in-${i}`} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "3px 6px", borderRadius: 4, marginBottom: 2,
                      background: `${e.color}11`, fontSize: 9,
                    }}>
                      <span style={{
                        padding: "1px 5px", borderRadius: 3,
                        background: `${e.color}33`, color: e.color,
                        fontWeight: 700, fontSize: 8,
                      }}>
                        {e.label}
                      </span>
                      <span style={{ color: C.text }}>
                        {nodeMap[e.source]?.label || e.source}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setSelectedNode(null)} style={{
                marginTop: 10, width: "100%", padding: "5px 0", borderRadius: 6,
                border: `1px solid ${C.border}`, background: "transparent",
                color: C.textMuted, fontSize: 9, cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                Fermer
              </button>
            </div>
          ) : (
            /* Legend when no node selected */
            <div style={{
              background: C.darkPanel, borderRadius: 8, padding: 14,
              border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                Légende
              </div>

              <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 8, fontWeight: 700 }}>
                Types de liens
              </div>
              {Object.entries(EDGE_TYPE_STYLES).filter(([type]) =>
                edges.some(e => e.type === type)
              ).map(([type, style]) => (
                <div key={type} style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 4,
                }}>
                  <svg width={30} height={10}>
                    <line x1={0} y1={5} x2={24} y2={5}
                      stroke={style.color} strokeWidth={2}
                      strokeDasharray={(style as any).dash || "none"} />
                    <polygon points="24,2 30,5 24,8" fill={style.color} />
                  </svg>
                  <span style={{ fontSize: 9, color: style.color, fontWeight: 600 }}>
                    {style.label}
                  </span>
                </div>
              ))}

              <div style={{ fontSize: 9, color: C.textMuted, marginTop: 12, marginBottom: 8, fontWeight: 700 }}>
                Domaines
              </div>
              {[...new Set(nodes.map(n => n.domain))].map(domain => (
                <div key={domain} style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: 3,
                }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: DOMAIN_COLORS[domain] || DOMAIN_COLORS.UNKNOWN,
                    display: "inline-block", flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 9, color: C.text }}>
                    {domain.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </div>
              ))}

              <div style={{
                marginTop: 12, padding: "8px 10px", borderRadius: 6,
                background: `${C.cyan}08`, border: `1px solid ${C.cyan}22`,
              }}>
                <div style={{ fontSize: 9, color: C.cyan, fontWeight: 700, marginBottom: 4 }}>
                  Indicateurs
                </div>
                <div style={{ fontSize: 8, color: C.textMuted, lineHeight: 1.5 }}>
                  <div><strong style={{ color: C.text }}>Taille nœud</strong> = nombre de classes</div>
                  <div><strong style={{ color: C.green }}>Badge vert</strong> = endpoints REST</div>
                  <div><strong style={{ color: C.text }}>Chiffre central</strong> = classes dans le service</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
