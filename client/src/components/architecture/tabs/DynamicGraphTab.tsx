/**
 * DynamicGraphTab v3.0 — Graphe d'architecture complet avec nœuds BDD, APIs externes,
 * queues, webservices. Utilise graph.nodes + graph.edges pour le graphe complet,
 * enrichi par les microservices pour le groupement.
 *
 * Formes distinctes :
 *   - Cercle : microservice / classe interne
 *   - Rectangle : base de données (DATABASE)
 *   - Losange : webservice externe (WEBSERVICE)
 *   - Hexagone : queue JMS (QUEUE)
 *   - Octogone : système de fichiers (FILE_SYSTEM)
 *
 * @author Hamza NORDINE
 */
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import type { AnalysisData, GraphNode, GraphEdge } from "../ArchitectureExplorer";

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
  teal: "#2dd4bf",
  pink: "#f472b6",
};

// ─── External node type styles ────────────────────────────────────────────
const EXTERNAL_TYPE_COLORS: Record<string, string> = {
  DATABASE: C.orange,
  QUEUE: C.purple,
  WEBSERVICE: C.yellow,
  FILE_SYSTEM: C.teal,
  CACHE: C.pink,
};

const EXTERNAL_TYPE_LABELS: Record<string, string> = {
  DATABASE: "BDD",
  QUEUE: "Queue",
  WEBSERVICE: "API Ext",
  FILE_SYSTEM: "Fichier",
  CACHE: "Cache",
};

// ─── Edge type styles ─────────────────────────────────────────────────────
const EDGE_TYPE_STYLES: Record<string, { color: string; label: string; dash?: string }> = {
  CALLS: { color: C.cyan, label: "Appel" },
  EJB_CALL: { color: C.cyan, label: "EJB" },
  DEPENDS_ON: { color: C.blue, label: "Dépend" },
  JNDI_LOOKUP: { color: C.blue, label: "JNDI" },
  DB_ACCESS: { color: C.orange, label: "DB" },
  SOAP_CALLS: { color: C.yellow, label: "SOAP" },
  EMITS_EVENT: { color: C.purple, label: "JMS" },
  TRANSACTION_WITH: { color: C.red, label: "TX", dash: "6,3" },
  SHARES_DTO: { color: C.textMuted, label: "DTO", dash: "4,3" },
  REST: { color: C.green, label: "REST" },
  HTTP: { color: C.green, label: "HTTP" },
  INTERNAL: { color: C.textMuted, label: "Interne", dash: "4,3" },
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

// ─── View modes ───────────────────────────────────────────────────────────
type ViewMode = "full" | "microservices" | "external";

// ─── Sim types ────────────────────────────────────────────────────────────
interface SimNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  nodeType: "microservice" | "external" | "class";
  externalType?: string;
  protocol?: string;
  classCount: number;
  domain: string;
  color: string;
  endpoints: number;
  cohesion: number;
  coupling: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimEdge {
  source: string;
  target: string;
  type: string;
  color: string;
  label: string;
  dash?: string;
  weight: number;
}

// ─── Force simulation ─────────────────────────────────────────────────────
function forceSimulation(
  nodes: SimNode[], edges: SimEdge[],
  width: number, height: number, iterations = 250
): SimNode[] {
  const result = nodes.map(n => ({ ...n }));
  const nodeMap: Record<string, SimNode> = {};
  for (const n of result) nodeMap[n.id] = n;

  const centerX = width / 2;
  const centerY = height / 2;
  const k = Math.sqrt((width * height) / Math.max(result.length, 1));
  const repulsionStrength = k * k * 2;
  const attractionStrength = 0.01;
  const centerGravity = 0.025;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;
    const damping = 0.82;

    // Repulsion
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i], b = result[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1; }
        const force = (repulsionStrength / (dist * dist)) * alpha;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        if (a.fx == null) { a.vx -= fx; a.vy -= fy; }
        if (b.fx == null) { b.vx += fx; b.vy += fy; }
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const src = nodeMap[edge.source], tgt = nodeMap[edge.target];
      if (!src || !tgt) continue;
      const dx = tgt.x - src.x, dy = tgt.y - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const force = dist * attractionStrength * alpha * (edge.weight || 1);
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      if (src.fx == null) { src.vx += fx; src.vy += fy; }
      if (tgt.fx == null) { tgt.vx -= fx; tgt.vy -= fy; }
    }

    // Center gravity
    for (const n of result) {
      if (n.fx != null) continue;
      n.vx += (centerX - n.x) * centerGravity * alpha;
      n.vy += (centerY - n.y) * centerGravity * alpha;
    }

    // Apply
    const pad = 70;
    for (const n of result) {
      if (n.fx != null) { n.x = n.fx; n.y = n.fy!; continue; }
      n.vx *= damping; n.vy *= damping;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(pad, Math.min(width - pad, n.x));
      n.y = Math.max(pad, Math.min(height - pad, n.y));
    }
  }
  return result;
}

// ─── Edge path with arrow ─────────────────────────────────────────────────
function edgePath(
  sx: number, sy: number, tx: number, ty: number,
  srcRadius: number, tgtRadius: number, curveOffset = 0
): { path: string; midX: number; midY: number } {
  const dx = tx - sx, dy = ty - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return { path: "", midX: sx, midY: sy };
  const ux = dx / dist, uy = dy / dist;
  const startX = sx + ux * (srcRadius + 4), startY = sy + uy * (srcRadius + 4);
  const endX = tx - ux * (tgtRadius + 12), endY = ty - uy * (tgtRadius + 12);

  if (curveOffset === 0) {
    return {
      path: `M ${startX} ${startY} L ${endX} ${endY}`,
      midX: (startX + endX) / 2, midY: (startY + endY) / 2,
    };
  }
  const perpX = -uy * curveOffset, perpY = ux * curveOffset;
  const cpX = (startX + endX) / 2 + perpX, cpY = (startY + endY) / 2 + perpY;
  return {
    path: `M ${startX} ${startY} Q ${cpX} ${cpY} ${endX} ${endY}`,
    midX: cpX, midY: cpY,
  };
}

// ─── SVG shapes for external nodes ────────────────────────────────────────
function ExternalNodeShape({ x, y, size, color, type, isActive, dimmed }: {
  x: number; y: number; size: number; color: string; type: string;
  isActive: boolean; dimmed: boolean;
}) {
  const opacity = dimmed ? 0.15 : 1;
  const strokeW = isActive ? 3 : 1.8;
  const fill = `${color}${isActive ? "44" : "18"}`;

  if (type === "DATABASE") {
    // Cylinder-like rectangle with rounded top/bottom
    const w = size * 2, h = size * 1.6;
    return (
      <g opacity={opacity}>
        {isActive && (
          <rect x={x - w / 2 - 5} y={y - h / 2 - 5} width={w + 10} height={h + 10}
            rx={6} fill="none" stroke={color} strokeWidth={1.5} opacity={0.25} />
        )}
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h}
          rx={4} fill={fill} stroke={color} strokeWidth={strokeW} />
        {/* DB lines inside */}
        <line x1={x - w / 2 + 4} y1={y - h / 2 + h * 0.25} x2={x + w / 2 - 4} y2={y - h / 2 + h * 0.25}
          stroke={color} strokeWidth={0.8} opacity={0.5} />
        <line x1={x - w / 2 + 4} y1={y - h / 2 + h * 0.5} x2={x + w / 2 - 4} y2={y - h / 2 + h * 0.5}
          stroke={color} strokeWidth={0.8} opacity={0.5} />
      </g>
    );
  }

  if (type === "WEBSERVICE") {
    // Diamond shape
    const s = size * 1.3;
    const points = `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`;
    return (
      <g opacity={opacity}>
        {isActive && (
          <polygon points={`${x},${y - s - 5} ${x + s + 5},${y} ${x},${y + s + 5} ${x - s - 5},${y}`}
            fill="none" stroke={color} strokeWidth={1.5} opacity={0.25} />
        )}
        <polygon points={points} fill={fill} stroke={color} strokeWidth={strokeW} />
      </g>
    );
  }

  if (type === "QUEUE") {
    // Hexagon
    const s = size * 1.2;
    const h = s * 0.866;
    const points = `${x - s},${y} ${x - s / 2},${y - h} ${x + s / 2},${y - h} ${x + s},${y} ${x + s / 2},${y + h} ${x - s / 2},${y + h}`;
    return (
      <g opacity={opacity}>
        {isActive && (
          <circle cx={x} cy={y} r={s + 5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.25} />
        )}
        <polygon points={points} fill={fill} stroke={color} strokeWidth={strokeW} />
      </g>
    );
  }

  // Default: rounded rectangle for FILE_SYSTEM, CACHE, etc.
  const w = size * 2, h2 = size * 1.4;
  return (
    <g opacity={opacity}>
      {isActive && (
        <rect x={x - w / 2 - 5} y={y - h2 / 2 - 5} width={w + 10} height={h2 + 10}
          rx={8} fill="none" stroke={color} strokeWidth={1.5} opacity={0.25} />
      )}
      <rect x={x - w / 2} y={y - h2 / 2} width={w} height={h2}
        rx={6} fill={fill} stroke={color} strokeWidth={strokeW} />
    </g>
  );
}

// ─── Component ────────────────────────────────────────────────────────────
export default function DynamicGraphTab({ data }: { data: AnalysisData }) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("full");
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  const WIDTH = 1000;
  const HEIGHT = 680;

  // ── Build complete graph from graph.nodes + graph.edges + microservices ──
  const { initialNodes, edges, externalCount, classNodeCount } = useMemo(() => {
    const ms = data.microservices;
    const graphNodes = data.graph?.nodes || [];
    const graphEdges = data.graph?.edges || [];

    // 1. Create microservice nodes
    const centerX = WIDTH / 2, centerY = HEIGHT / 2;
    const radius = Math.min(WIDTH, HEIGHT) / 2 - 120;

    // Collect external nodes from graph.nodes
    const externalNodes = graphNodes.filter(n => n.type === "EXTERNAL");
    const classNodes = graphNodes.filter(n => n.type === "CLASS");

    // Build a map: className -> microserviceId
    const classToMs: Record<string, string> = {};
    for (const m of ms) {
      for (const cls of m.classes) {
        classToMs[cls] = m.id;
      }
    }

    // Determine which nodes to show based on view mode
    const totalVisibleNodes = viewMode === "external"
      ? ms.length + externalNodes.length
      : viewMode === "microservices"
        ? ms.length
        : ms.length + externalNodes.length;

    const simNodes: SimNode[] = [];

    // Microservice nodes in a circle
    ms.forEach((m, i) => {
      const angle = (2 * Math.PI * i) / Math.max(ms.length, 1) - Math.PI / 2;
      const r = ms.length <= 3 ? radius * 0.6 : radius;
      simNodes.push({
        id: m.id,
        label: m.name,
        x: centerX + r * Math.cos(angle),
        y: centerY + r * Math.sin(angle),
        vx: 0, vy: 0,
        nodeType: "microservice",
        classCount: m.classCount,
        domain: m.boundedContext,
        color: DOMAIN_COLORS[m.boundedContext] || DOMAIN_COLORS.UNKNOWN,
        endpoints: typeof m.endpoints === "number" ? m.endpoints : m.endpoints.length,
        cohesion: m.cohesion,
        coupling: m.coupling,
      });
    });

    // External nodes around the periphery
    if (viewMode !== "microservices") {
      externalNodes.forEach((en, i) => {
        const angle = (2 * Math.PI * i) / Math.max(externalNodes.length, 1);
        const extRadius = radius + 60;
        const extColor = EXTERNAL_TYPE_COLORS[en.externalType || ""] || C.textMuted;
        simNodes.push({
          id: en.id,
          label: en.systemName || en.id.replace(/^(db|ext|jndi|ws|queue):/, ""),
          x: centerX + extRadius * Math.cos(angle),
          y: centerY + extRadius * Math.sin(angle),
          vx: 0, vy: 0,
          nodeType: "external",
          externalType: en.externalType,
          protocol: en.protocol,
          classCount: 0,
          domain: "",
          color: extColor,
          endpoints: 0,
          cohesion: 0,
          coupling: 0,
        });
      });
    }

    // Build edges
    const simEdges: SimEdge[] = [];
    const nodeIdSet = new Set(simNodes.map(n => n.id));

    if (viewMode === "microservices") {
      // Only inter-microservice dependencies
      for (const m of ms) {
        for (const dep of m.dependencies) {
          if (nodeIdSet.has(dep.targetServiceId)) {
            const style = EDGE_TYPE_STYLES[dep.type] || { color: C.textMuted, label: dep.type };
            simEdges.push({
              source: m.id,
              target: dep.targetServiceId,
              type: dep.type,
              color: style.color,
              label: style.label,
              dash: (style as any).dash,
              weight: 1,
            });
          }
        }
      }
    } else {
      // Full graph edges — map CLASS nodes to their microservice
      for (const ge of graphEdges) {
        let source = ge.source;
        let target = ge.target;

        // Map class nodes to their microservice
        if (classToMs[source]) source = classToMs[source];
        if (classToMs[target]) target = classToMs[target];

        // Skip self-loops and edges to non-visible nodes
        if (source === target) continue;
        if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) continue;

        const style = EDGE_TYPE_STYLES[ge.type] || { color: C.textMuted, label: ge.type };
        simEdges.push({
          source,
          target,
          type: ge.type,
          color: style.color,
          label: style.label,
          dash: (style as any).dash,
          weight: ge.weight || 1,
        });
      }

      // Deduplicate edges (same source+target+type)
      const edgeKey = (e: SimEdge) => `${e.source}||${e.target}||${e.type}`;
      const seen = new Map<string, SimEdge>();
      for (const e of simEdges) {
        const k = edgeKey(e);
        if (seen.has(k)) {
          seen.get(k)!.weight += e.weight;
        } else {
          seen.set(k, { ...e });
        }
      }
      simEdges.length = 0;
      simEdges.push(...seen.values());
    }

    // Run force simulation
    const positioned = forceSimulation(simNodes, simEdges, WIDTH, HEIGHT, 300);
    return {
      initialNodes: positioned,
      edges: simEdges,
      externalCount: externalNodes.length,
      classNodeCount: classNodes.length,
    };
  }, [data, viewMode]);

  // Merge with drag overrides
  const nodes = useMemo(() => initialNodes.map(n => ({
    ...n,
    x: nodePositions[n.id]?.x ?? n.x,
    y: nodePositions[n.id]?.y ?? n.y,
  })), [initialNodes, nodePositions]);

  const nodeMap = useMemo(() => {
    const map: Record<string, SimNode> = {};
    for (const n of nodes) map[n.id] = n;
    return map;
  }, [nodes]);

  // Edge curves for duplicate pairs
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
      curves.push(pairCount[key] > 1 ? (idx % 2 === 0 ? 1 : -1) * (30 + Math.floor(idx / 2) * 15) : 0);
    }
    return curves;
  }, [edges]);

  // Highlight
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
    const set = new Set<string>([activeNodeId]);
    edges.forEach(e => {
      if (e.source === activeNodeId) set.add(e.target);
      if (e.target === activeNodeId) set.add(e.source);
    });
    return set;
  }, [edges, activeNodeId]);

  // Drag
  const handleMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragNodeId(nodeId);
  }, []);

  useEffect(() => {
    if (!dragNodeId) return;
    const handleMouseMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = WIDTH / rect.width, scaleY = HEIGHT / rect.height;
      const x = Math.max(40, Math.min(WIDTH - 40, (e.clientX - rect.left) * scaleX));
      const y = Math.max(40, Math.min(HEIGHT - 40, (e.clientY - rect.top) * scaleY));
      setNodePositions(prev => ({ ...prev, [dragNodeId]: { x, y } }));
    };
    const handleMouseUp = () => setDragNodeId(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragNodeId]);

  const handleExportSVG = useCallback(() => {
    if (!svgRef.current) return;
    const blob = new Blob([svgRef.current.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "architecture-graph.svg"; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleResetLayout = useCallback(() => {
    setNodePositions({}); setSelectedNode(null);
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

  const msNodes = nodes.filter(n => n.nodeType === "microservice");
  const extNodes = nodes.filter(n => n.nodeType === "external");

  // Edge type stats
  const edgeTypeCounts: Record<string, number> = {};
  for (const e of edges) {
    edgeTypeCounts[e.type] = (edgeTypeCounts[e.type] || 0) + 1;
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
          {msNodes.length} services
        </span>
        {extNodes.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>
            {extNodes.length} externes
          </span>
        )}
        <span style={{ fontSize: 12, color: C.cyan, fontWeight: 700 }}>
          {edges.length} liens
        </span>

        {/* View mode */}
        <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          {([
            { key: "full" as ViewMode, label: "Complet" },
            { key: "microservices" as ViewMode, label: "Services" },
            { key: "external" as ViewMode, label: "Ext+Services" },
          ]).map(v => (
            <button key={v.key} onClick={() => { setViewMode(v.key); setNodePositions({}); }} style={{
              padding: "3px 8px", borderRadius: 4, border: "none", cursor: "pointer",
              fontSize: 9, fontWeight: viewMode === v.key ? 700 : 400,
              background: viewMode === v.key ? `${C.cyan}22` : "transparent",
              color: viewMode === v.key ? C.cyan : C.textMuted,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {v.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.textMuted, cursor: "pointer" }}>
          <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} style={{ accentColor: C.cyan }} />
          Noms
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.textMuted, cursor: "pointer" }}>
          <input type="checkbox" checked={showEdgeLabels} onChange={e => setShowEdgeLabels(e.target.checked)} style={{ accentColor: C.cyan }} />
          Types
        </label>

        <button onClick={handleResetLayout} style={{
          padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: "transparent", color: C.textMuted, fontSize: 10, cursor: "pointer",
        }}>Reset</button>
        <button onClick={handleExportSVG} style={{
          padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: "transparent", color: C.textMuted, fontSize: 10, cursor: "pointer",
        }}>SVG</button>
      </div>

      {/* Main area */}
      <div style={{ display: "flex", gap: 12 }}>
        {/* SVG */}
        <div style={{
          flex: 1, borderRadius: 8, border: `1px solid ${C.border}`,
          overflow: "hidden", background: "#060a12",
        }}>
          <svg ref={svgRef} width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            style={{ display: "block", cursor: dragNodeId ? "grabbing" : "default" }}>
            <defs>
              {Object.entries(EDGE_TYPE_STYLES).map(([type, style]) => (
                <marker key={type} id={`arrow-${type}`}
                  markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M 0 0 L 10 4 L 0 8 L 2 4 Z" fill={style.color} opacity={0.9} />
                </marker>
              ))}
              <marker id="arrow-default" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 0 L 10 4 L 0 8 L 2 4 Z" fill={C.textMuted} opacity={0.7} />
              </marker>
              <marker id="arrow-highlight" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 0 L 12 5 L 0 10 L 3 5 Z" fill="#fff" opacity={0.95} />
              </marker>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Grid */}
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={C.border} strokeWidth="0.3" opacity="0.3" />
            </pattern>
            <rect width={WIDTH} height={HEIGHT} fill="url(#grid)" />

            {/* Edges */}
            {edges.map((edge, i) => {
              const src = nodeMap[edge.source], tgt = nodeMap[edge.target];
              if (!src || !tgt) return null;
              const isHighlighted = highlightedEdges.has(i);
              const hasActive = !!activeNodeId;
              const dimmed = hasActive && !isHighlighted;

              const srcR = src.nodeType === "external" ? 22 : Math.max(20, Math.min(36, 14 + src.classCount / 2));
              const tgtR = tgt.nodeType === "external" ? 22 : Math.max(20, Math.min(36, 14 + tgt.classCount / 2));
              const curve = edgeCurves[i] || 0;
              const { path: d, midX, midY } = edgePath(src.x, src.y, tgt.x, tgt.y, srcR, tgtR, curve);
              if (!d) return null;

              const edgeColor = isHighlighted ? "#fff" : edge.color;
              const edgeOpacity = dimmed ? 0.06 : isHighlighted ? 1 : 0.5;
              const strokeWidth = isHighlighted ? 2.5 : Math.min(2, 1 + edge.weight * 0.2);
              const markerId = isHighlighted ? "url(#arrow-highlight)" : `url(#arrow-${edge.type in EDGE_TYPE_STYLES ? edge.type : "default"})`;

              return (
                <g key={`edge-${i}`}>
                  <path d={d} fill="none" stroke={edgeColor} strokeWidth={strokeWidth}
                    strokeDasharray={edge.dash || "none"} opacity={edgeOpacity} markerEnd={markerId} />
                  {showEdgeLabels && !dimmed && (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect x={-16} y={-8} width={32} height={16} rx={4}
                        fill={isHighlighted ? edge.color : "#0a0e17"}
                        stroke={edge.color} strokeWidth={0.5}
                        opacity={isHighlighted ? 0.95 : 0.85} />
                      <text textAnchor="middle" dominantBaseline="middle"
                        fill={isHighlighted ? "#fff" : edge.color}
                        fontSize={7} fontWeight={700} fontFamily="'JetBrains Mono', monospace">
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
              const isDragging = dragNodeId === node.id;
              const totalDeg = (inDegree[node.id] || 0) + (outDegree[node.id] || 0);

              if (node.nodeType === "external") {
                const extSize = 22;
                return (
                  <g key={node.id}
                    onMouseEnter={() => !dragNodeId && setHoveredNode(node.id)}
                    onMouseLeave={() => !dragNodeId && setHoveredNode(null)}
                    onClick={() => !dragNodeId && setSelectedNode(node.id === selectedNode ? null : node.id)}
                    onMouseDown={e => handleMouseDown(node.id, e)}
                    style={{ cursor: isDragging ? "grabbing" : "grab" }}>
                    <ExternalNodeShape x={node.x} y={node.y} size={extSize} color={node.color}
                      type={node.externalType || ""} isActive={isActive} dimmed={dimmed} />
                    {/* Label inside */}
                    <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle"
                      fill={isActive ? "#fff" : node.color} fontSize={8} fontWeight={700}
                      fontFamily="'JetBrains Mono', monospace"
                      opacity={dimmed ? 0.15 : 1}>
                      {EXTERNAL_TYPE_LABELS[node.externalType || ""] || "Ext"}
                    </text>
                    {/* Label below */}
                    {showLabels && (
                      <text x={node.x} y={node.y + extSize + 14} textAnchor="middle"
                        fill={isActive ? "#fff" : dimmed ? C.textMuted : node.color}
                        fontSize={9} fontWeight={isActive ? 800 : 600}
                        fontFamily="'JetBrains Mono', monospace"
                        opacity={dimmed ? 0.15 : 1}>
                        {node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label}
                      </text>
                    )}
                    {/* Protocol badge */}
                    {node.protocol && !dimmed && (
                      <g>
                        <rect x={node.x + extSize - 6} y={node.y - extSize - 2} width={24} height={12}
                          rx={3} fill={node.color} opacity={0.9} />
                        <text x={node.x + extSize + 6} y={node.y - extSize + 5}
                          textAnchor="middle" dominantBaseline="middle"
                          fill="#000" fontSize={6} fontWeight={800}
                          fontFamily="'JetBrains Mono', monospace">
                          {node.protocol}
                        </text>
                      </g>
                    )}
                  </g>
                );
              }

              // Microservice node (circle)
              const nodeRadius = Math.max(20, Math.min(36, 14 + node.classCount / 2));
              const opacity = dimmed ? 0.15 : 1;

              return (
                <g key={node.id}
                  onMouseEnter={() => !dragNodeId && setHoveredNode(node.id)}
                  onMouseLeave={() => !dragNodeId && setHoveredNode(null)}
                  onClick={() => !dragNodeId && setSelectedNode(node.id === selectedNode ? null : node.id)}
                  onMouseDown={e => handleMouseDown(node.id, e)}
                  style={{ cursor: isDragging ? "grabbing" : "grab" }}
                  opacity={opacity}>
                  {isActive && (
                    <>
                      <circle cx={node.x} cy={node.y} r={nodeRadius + 10}
                        fill="none" stroke={node.color} strokeWidth={1.5} opacity={0.25} filter="url(#glow)" />
                      <circle cx={node.x} cy={node.y} r={nodeRadius + 5}
                        fill="none" stroke={node.color} strokeWidth={2} opacity={0.5} />
                    </>
                  )}
                  <circle cx={node.x} cy={node.y} r={nodeRadius}
                    fill={`${node.color}22`} stroke={node.color} strokeWidth={isActive ? 3 : 1.8} />
                  <circle cx={node.x} cy={node.y} r={nodeRadius - 2}
                    fill={`${node.color}${isActive ? "44" : "15"}`} />
                  <text x={node.x} y={node.y - 2} textAnchor="middle" dominantBaseline="middle"
                    fill={isActive ? "#fff" : node.color} fontSize={12} fontWeight={800}
                    fontFamily="'JetBrains Mono', monospace">
                    {node.classCount}
                  </text>
                  {totalDeg > 0 && (
                    <text x={node.x} y={node.y + 10} textAnchor="middle" dominantBaseline="middle"
                      fill={C.textMuted} fontSize={7} fontFamily="'JetBrains Mono', monospace">
                      {totalDeg} liens
                    </text>
                  )}
                  {showLabels && (
                    <text x={node.x} y={node.y + nodeRadius + 14} textAnchor="middle"
                      fill={isActive ? "#fff" : dimmed ? C.textMuted : C.text}
                      fontSize={10} fontWeight={isActive ? 800 : 500}
                      fontFamily="'JetBrains Mono', monospace">
                      {node.label.length > 22 ? node.label.slice(0, 20) + "…" : node.label}
                    </text>
                  )}
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

        {/* Side panel */}
        <div style={{ width: 250, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {selectedNode && nodeMap[selectedNode] ? (
            <SelectedNodePanel
              node={nodeMap[selectedNode]}
              edges={edges}
              nodeMap={nodeMap}
              inDegree={inDegree}
              outDegree={outDegree}
              onClose={() => setSelectedNode(null)}
            />
          ) : (
            <LegendPanel edges={edges} edgeTypeCounts={edgeTypeCounts} extNodes={extNodes} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Selected Node Panel ──────────────────────────────────────────────────
function SelectedNodePanel({ node, edges, nodeMap, inDegree, outDegree, onClose }: {
  node: SimNode; edges: SimEdge[]; nodeMap: Record<string, SimNode>;
  inDegree: Record<string, number>; outDegree: Record<string, number>;
  onClose: () => void;
}) {
  const isExternal = node.nodeType === "external";

  return (
    <div style={{
      background: C.darkPanel, borderRadius: 8, padding: 14,
      border: `1px solid ${node.color}55`,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 800, color: node.color,
        marginBottom: 10, display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{
          width: 10, height: 10,
          borderRadius: isExternal ? "2px" : "50%",
          background: node.color, display: "inline-block",
        }} />
        {node.label}
        {isExternal && (
          <span style={{
            padding: "1px 6px", borderRadius: 3, fontSize: 8,
            background: `${node.color}33`, color: node.color,
          }}>
            {EXTERNAL_TYPE_LABELS[node.externalType || ""] || "Externe"}
          </span>
        )}
      </div>

      {isExternal ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, color: C.textMuted }}>
            Type: <span style={{ color: C.text }}>{node.externalType}</span>
          </div>
          {node.protocol && (
            <div style={{ fontSize: 10, color: C.textMuted }}>
              Protocole: <span style={{ color: C.text }}>{node.protocol}</span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4 }}>
            <div style={{ background: `${C.border}44`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.green }}>{inDegree[node.id] || 0}</div>
              <div style={{ fontSize: 8, color: C.textMuted }}>Entrants</div>
            </div>
            <div style={{ background: `${C.border}44`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.orange }}>{outDegree[node.id] || 0}</div>
              <div style={{ fontSize: 8, color: C.textMuted }}>Sortants</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
          {[
            { label: "Classes", value: node.classCount, color: C.text },
            { label: "Endpoints", value: node.endpoints, color: C.green },
            { label: "Cohésion", value: `${(node.cohesion * 100).toFixed(0)}%`, color: C.cyan },
            { label: "Couplage", value: `${(node.coupling * 100).toFixed(0)}%`, color: C.orange },
          ].map(item => (
            <div key={item.label} style={{
              background: `${C.border}44`, borderRadius: 6, padding: "6px 8px", textAlign: "center",
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 8, color: C.textMuted, marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Outgoing */}
      {edges.filter(e => e.source === node.id).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: C.green, fontWeight: 700, marginBottom: 4 }}>
            Dépendances sortantes →
          </div>
          {edges.filter(e => e.source === node.id).map((e, i) => (
            <div key={`out-${i}`} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "3px 6px", borderRadius: 4, marginBottom: 2,
              background: `${e.color}11`, fontSize: 9,
            }}>
              <span style={{
                padding: "1px 5px", borderRadius: 3,
                background: `${e.color}33`, color: e.color, fontWeight: 700, fontSize: 8,
              }}>{e.label}</span>
              <span style={{ color: C.text }}>
                {nodeMap[e.target]?.label || e.target}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Incoming */}
      {edges.filter(e => e.target === node.id).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: C.blue, fontWeight: 700, marginBottom: 4 }}>
            Dépendances entrantes ←
          </div>
          {edges.filter(e => e.target === node.id).map((e, i) => (
            <div key={`in-${i}`} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "3px 6px", borderRadius: 4, marginBottom: 2,
              background: `${e.color}11`, fontSize: 9,
            }}>
              <span style={{
                padding: "1px 5px", borderRadius: 3,
                background: `${e.color}33`, color: e.color, fontWeight: 700, fontSize: 8,
              }}>{e.label}</span>
              <span style={{ color: C.text }}>
                {nodeMap[e.source]?.label || e.source}
              </span>
            </div>
          ))}
        </div>
      )}

      <button onClick={onClose} style={{
        marginTop: 10, width: "100%", padding: "5px 0", borderRadius: 6,
        border: `1px solid ${C.border}`, background: "transparent",
        color: C.textMuted, fontSize: 9, cursor: "pointer",
      }}>Fermer</button>
    </div>
  );
}

// ─── Legend Panel ──────────────────────────────────────────────────────────
function LegendPanel({ edges, edgeTypeCounts, extNodes }: {
  edges: SimEdge[]; edgeTypeCounts: Record<string, number>; extNodes: SimNode[];
}) {
  return (
    <div style={{
      background: C.darkPanel, borderRadius: 8, padding: 14,
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10 }}>Légende</div>

      {/* Node shapes */}
      <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 6, fontWeight: 700 }}>Formes des nœuds</div>
      {[
        { shape: "●", label: "Microservice", color: C.cyan },
        { shape: "▬", label: "Base de données", color: EXTERNAL_TYPE_COLORS.DATABASE },
        { shape: "◆", label: "API / Webservice", color: EXTERNAL_TYPE_COLORS.WEBSERVICE },
        { shape: "⬡", label: "Queue JMS", color: EXTERNAL_TYPE_COLORS.QUEUE },
        { shape: "▢", label: "Système fichiers", color: EXTERNAL_TYPE_COLORS.FILE_SYSTEM },
      ].map(item => (
        <div key={item.label} style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontSize: 9,
        }}>
          <span style={{ color: item.color, fontSize: 12, width: 14, textAlign: "center" }}>{item.shape}</span>
          <span style={{ color: C.text }}>{item.label}</span>
        </div>
      ))}

      {/* Edge types */}
      <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 6, marginTop: 10, fontWeight: 700 }}>
        Types de liens
      </div>
      {Object.entries(EDGE_TYPE_STYLES).filter(([type]) => edgeTypeCounts[type]).map(([type, style]) => (
        <div key={type} style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontSize: 9,
        }}>
          <div style={{
            width: 20, height: 2, borderRadius: 1,
            background: style.color,
            borderTop: style.dash ? `2px dashed ${style.color}` : "none",
          }} />
          <span style={{ color: style.color, fontWeight: 700 }}>{style.label}</span>
          <span style={{ color: C.textMuted, fontSize: 8 }}>({edgeTypeCounts[type]})</span>
        </div>
      ))}

      {/* External nodes present */}
      {extNodes.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 6, marginTop: 10, fontWeight: 700 }}>
            Systèmes externes ({extNodes.length})
          </div>
          {extNodes.map(n => (
            <div key={n.id} style={{
              display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontSize: 9,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: n.externalType === "DATABASE" ? 1 : 4,
                background: n.color, display: "inline-block",
              }} />
              <span style={{ color: C.text }}>{n.label}</span>
              {n.protocol && <span style={{ color: C.textMuted, fontSize: 7 }}>({n.protocol})</span>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
