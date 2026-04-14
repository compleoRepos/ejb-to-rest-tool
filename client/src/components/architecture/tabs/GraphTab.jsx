/**
 * GraphTab — Graphe de relations SVG interactif.
 * Layout force-directed simplifié (pas de lib externe).
 * Clusters par catégorie, nœuds typés, hover/clic interactions.
 *
 * @author Hamza NORDINE
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { LEGACY, SPRING, RESOURCES, FLUX } from "../shared/data";
import { C, FLUX_COLORS, Chip, CriticiteBadge, SectionTitle, Box } from "../shared/primitives";
import ExportButtons from "../shared/ExportButtons";

// ─── Layout engine (simple force-directed) ─────────────────────────────────

function computeLayout(nodes, edges, width, height) {
  // Assign initial positions by category clusters
  const positions = {};
  const legacyNodes = nodes.filter(n => n.category === "legacy");
  const resourceNodes = nodes.filter(n => n.category === "resource");
  const springNodes = nodes.filter(n => n.category === "spring");

  // Left column: legacy, Center: resources, Right: spring
  const leftX = width * 0.2;
  const centerX = width * 0.5;
  const rightX = width * 0.8;
  const topY = 60;
  const spacing = (height - 120);

  legacyNodes.forEach((n, i) => {
    const y = topY + (i / Math.max(legacyNodes.length - 1, 1)) * spacing;
    positions[n.id] = { x: leftX + (Math.random() - 0.5) * 40, y };
  });

  resourceNodes.forEach((n, i) => {
    const y = topY + (i / Math.max(resourceNodes.length - 1, 1)) * spacing;
    positions[n.id] = { x: centerX + (Math.random() - 0.5) * 30, y };
  });

  springNodes.forEach((n, i) => {
    const y = topY + (i / Math.max(springNodes.length - 1, 1)) * spacing;
    positions[n.id] = { x: rightX + (Math.random() - 0.5) * 40, y };
  });

  // Simple force simulation (few iterations)
  const iterations = 80;
  const repulsion = 3000;
  const attraction = 0.005;
  const damping = 0.85;

  const velocities = {};
  nodes.forEach(n => { velocities[n.id] = { vx: 0, vy: 0 }; });

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = positions[b.id].x - positions[a.id].x;
        const dy = positions[b.id].y - positions[a.id].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 10);
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        velocities[a.id].vx -= fx;
        velocities[a.id].vy -= fy;
        velocities[b.id].vx += fx;
        velocities[b.id].vy += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const pa = positions[edge.from];
      const pb = positions[edge.to];
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const force = dist * attraction;
      const fx = (dx / Math.max(dist, 1)) * force;
      const fy = (dy / Math.max(dist, 1)) * force;
      velocities[edge.from].vx += fx;
      velocities[edge.from].vy += fy;
      velocities[edge.to].vx -= fx;
      velocities[edge.to].vy -= fy;
    }

    // Category gravity (keep nodes in their column)
    nodes.forEach(n => {
      const targetX = n.category === "legacy" ? leftX : n.category === "resource" ? centerX : rightX;
      velocities[n.id].vx += (targetX - positions[n.id].x) * 0.02;
    });

    // Apply velocities
    nodes.forEach(n => {
      velocities[n.id].vx *= damping;
      velocities[n.id].vy *= damping;
      positions[n.id].x += velocities[n.id].vx;
      positions[n.id].y += velocities[n.id].vy;
      // Clamp to bounds
      positions[n.id].x = Math.max(60, Math.min(width - 60, positions[n.id].x));
      positions[n.id].y = Math.max(40, Math.min(height - 40, positions[n.id].y));
    });
  }

  return positions;
}

// ─── Composant principal ───────────────────────────────────────────────────

export default function GraphTab({ onSelectNode }) {
  const svgRef = useRef(null);
  const svgExportRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterType, setFilterType] = useState("ALL");
  const [showLabels, setShowLabels] = useState(true);

  const WIDTH = 960;
  const HEIGHT = 680;

  const allNodes = useMemo(() => [
    ...LEGACY.map(m => ({ id: m.id, name: m.name, icon: m.icon, color: m.color, category: "legacy", type: m.type })),
    ...RESOURCES.map(r => ({ id: r.id, name: r.name, icon: "", color: r.color, category: "resource", type: r.type })),
    ...SPRING.map(s => ({ id: s.id, name: s.name, icon: s.icon, color: s.color, category: "spring", type: "Spring" })),
  ], []);

  const filteredEdges = useMemo(() => {
    if (filterType === "ALL") return FLUX;
    return FLUX.filter(f => f.type === filterType);
  }, [filterType]);

  const positions = useMemo(
    () => computeLayout(allNodes, filteredEdges, WIDTH, HEIGHT),
    [allNodes, filteredEdges]
  );

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node.id === selectedNode ? null : node.id);
    if (onSelectNode) onSelectNode(node);
  }, [selectedNode, onSelectNode]);

  // Highlight connected edges when a node is selected/hovered
  const activeNodeId = selectedNode || hoveredNode;
  const connectedEdges = useMemo(() => {
    if (!activeNodeId) return new Set();
    return new Set(
      filteredEdges
        .filter(e => e.from === activeNodeId || e.to === activeNodeId)
        .map((_, i) => i)
    );
  }, [activeNodeId, filteredEdges]);

  const connectedNodes = useMemo(() => {
    if (!activeNodeId) return new Set();
    const set = new Set([activeNodeId]);
    filteredEdges.forEach(e => {
      if (e.from === activeNodeId) set.add(e.to);
      if (e.to === activeNodeId) set.add(e.from);
    });
    return set;
  }, [activeNodeId, filteredEdges]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SectionTitle icon="🕸️">Graphe de relations</SectionTitle>
        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["ALL", ...Object.keys(FLUX_COLORS)].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
                color: filterType === type ? C.dark : (type === "ALL" ? C.cyan : FLUX_COLORS[type]?.color),
                background: filterType === type ? (type === "ALL" ? C.cyan : FLUX_COLORS[type]?.color) : "transparent",
                border: `1px solid ${type === "ALL" ? C.cyan : FLUX_COLORS[type]?.color}33`,
              }}
            >
              {type === "ALL" ? "Tous" : FLUX_COLORS[type]?.label}
            </button>
          ))}
        </div>

        <ExportButtons svgRef={svgExportRef} filename="graphe-relations" />

        <button
          onClick={() => setShowLabels(!showLabels)}
          style={{
            background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 4, padding: "4px 8px", color: C.textMuted,
            fontSize: 11, cursor: "pointer",
          }}
        >
          {showLabels ? "Masquer labels" : "Afficher labels"}
        </button>
      </div>

      {/* SVG Graph */}
      <div style={{ flex: 1, overflow: "auto", background: C.dark, borderRadius: 8, border: `1px solid ${C.border}` }}>
        <svg
          ref={(el) => { svgRef.current = el; svgExportRef.current = el; }}
          width={WIDTH}
          height={HEIGHT}
          style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", display: "block", margin: "0 auto" }}
        >
          <defs>
            {/* Arrow markers */}
            {Object.entries(FLUX_COLORS).map(([type, cfg]) => (
              <marker
                key={type}
                id={`arrow-${type}`}
                viewBox="0 0 10 6"
                refX={10}
                refY={3}
                markerWidth={8}
                markerHeight={6}
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,3 L0,6 Z" fill={cfg.color} />
              </marker>
            ))}
            <marker id="arrow-default" viewBox="0 0 10 6" refX={10} refY={3} markerWidth={8} markerHeight={6} orient="auto-start-reverse">
              <path d="M0,0 L10,3 L0,6 Z" fill={C.cyan} />
            </marker>
          </defs>

          {/* Category labels */}
          <text x={WIDTH * 0.2} y={24} fill={C.textDim} fontSize={11} textAnchor="middle" fontWeight={700}>
            LEGACY (Java EE)
          </text>
          <text x={WIDTH * 0.5} y={24} fill={C.textDim} fontSize={11} textAnchor="middle" fontWeight={700}>
            RESSOURCES
          </text>
          <text x={WIDTH * 0.8} y={24} fill={C.textDim} fontSize={11} textAnchor="middle" fontWeight={700}>
            SPRING BOOT
          </text>

          {/* Edges */}
          {filteredEdges.map((edge, i) => {
            const from = positions[edge.from];
            const to = positions[edge.to];
            if (!from || !to) return null;

            const isActive = connectedEdges.has(i);
            const isHighlighted = activeNodeId && isActive;
            const isDimmed = activeNodeId && !isActive;
            const color = FLUX_COLORS[edge.type]?.color || C.cyan;

            // Offset for parallel edges
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / len;
            const ny = dx / len;
            const offset = 0;

            // Curved path
            const midX = (from.x + to.x) / 2 + nx * 20;
            const midY = (from.y + to.y) / 2 + ny * 20;

            return (
              <g key={`edge-${i}`} opacity={isDimmed ? 0.12 : isHighlighted ? 1 : 0.5}>
                <path
                  d={`M${from.x + offset * nx},${from.y + offset * ny} Q${midX},${midY} ${to.x + offset * nx},${to.y + offset * ny}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  markerEnd={`url(#arrow-${edge.type})`}
                  strokeDasharray={edge.type === "MIGRATION" ? "6,3" : "none"}
                />
                {showLabels && isHighlighted && (
                  <text
                    x={midX}
                    y={midY - 6}
                    fill={color}
                    fontSize={8}
                    textAnchor="middle"
                    fontWeight={600}
                  >
                    {edge.label.length > 25 ? edge.label.slice(0, 24) + "…" : edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {allNodes.map(node => {
            const pos = positions[node.id];
            if (!pos) return null;

            const isActive = node.id === activeNodeId;
            const isConnected = connectedNodes.has(node.id);
            const isDimmed = activeNodeId && !isConnected;
            const r = node.category === "resource" ? 14 : 20;

            const shape = node.category === "resource" ? "diamond" :
                          node.category === "spring" ? "rect" : "circle";

            return (
              <g
                key={node.id}
                opacity={isDimmed ? 0.2 : 1}
                style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleNodeClick(node)}
              >
                {/* Glow */}
                {isActive && (
                  <circle cx={pos.x} cy={pos.y} r={r + 8} fill={`${node.color}22`} />
                )}

                {/* Shape */}
                {shape === "circle" && (
                  <circle
                    cx={pos.x} cy={pos.y} r={r}
                    fill={`${node.color}22`}
                    stroke={isActive ? node.color : `${node.color}88`}
                    strokeWidth={isActive ? 2.5 : 1.5}
                  />
                )}
                {shape === "rect" && (
                  <rect
                    x={pos.x - r} y={pos.y - r * 0.7}
                    width={r * 2} height={r * 1.4}
                    rx={4}
                    fill={`${node.color}22`}
                    stroke={isActive ? node.color : `${node.color}88`}
                    strokeWidth={isActive ? 2.5 : 1.5}
                  />
                )}
                {shape === "diamond" && (
                  <polygon
                    points={`${pos.x},${pos.y - r} ${pos.x + r},${pos.y} ${pos.x},${pos.y + r} ${pos.x - r},${pos.y}`}
                    fill={`${node.color}22`}
                    stroke={isActive ? node.color : `${node.color}88`}
                    strokeWidth={isActive ? 2.5 : 1.5}
                  />
                )}

                {/* Icon */}
                <text
                  x={pos.x} y={pos.y + 4}
                  textAnchor="middle" fontSize={node.category === "resource" ? 10 : 14}
                  style={{ pointerEvents: "none" }}
                >
                  {node.icon || (node.category === "resource" ? "⬡" : "◆")}
                </text>

                {/* Label */}
                {showLabels && (
                  <text
                    x={pos.x} y={pos.y + r + 12}
                    fill={isActive ? C.text : C.textMuted}
                    fontSize={9} textAnchor="middle" fontWeight={isActive ? 700 : 400}
                    style={{ pointerEvents: "none" }}
                  >
                    {node.name.length > 20 ? node.name.slice(0, 19) + "…" : node.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Légende */}
      <div style={{
        display: "flex", gap: 16, flexWrap: "wrap", padding: "6px 12px",
        background: C.darkPanel, borderRadius: 6, border: `1px solid ${C.border}`,
        fontSize: 10, color: C.textMuted,
      }}>
        <span style={{ fontWeight: 700, color: C.textDim }}>Formes :</span>
        <span>● Legacy</span>
        <span>■ Spring Boot</span>
        <span>◆ Ressource</span>
        <span style={{ marginLeft: 12, fontWeight: 700, color: C.textDim }}>Lignes :</span>
        <span>── Dépendance</span>
        <span>╌╌ Migration</span>
      </div>
    </div>
  );
}
