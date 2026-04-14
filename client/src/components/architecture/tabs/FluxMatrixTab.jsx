/**
 * FluxMatrixTab — Matrice N×N interactive des flux inter-modules.
 * 6 types de flux : EJB_JNDI, JMS, REST_EXT, SOAP, DATASOURCE, MIGRATION.
 * Hover cellule → tooltip détaillé. Clic → sélection dans le panneau latéral.
 *
 * @author Hamza NORDINE
 */
import { useState, useMemo, useCallback, useRef } from "react";
import { LEGACY, SPRING, RESOURCES, FLUX } from "../shared/data";
import { C, FLUX_COLORS, Chip, CriticiteBadge, SectionTitle, Box } from "../shared/primitives";
import ExportButtons from "../shared/ExportButtons";

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Tous les nœuds affichables dans la matrice */
function getMatrixNodes() {
  return [
    ...LEGACY.map(m => ({ id: m.id, name: m.name, icon: m.icon, color: m.color, category: "legacy" })),
    ...RESOURCES.map(r => ({ id: r.id, name: r.name, icon: "", color: r.color, category: "resource" })),
    ...SPRING.map(s => ({ id: s.id, name: s.name, icon: s.icon, color: s.color, category: "spring" })),
  ];
}

/** Construire la lookup map flux[from][to] = Flux[] */
function buildFluxMap() {
  const map = {};
  for (const f of FLUX) {
    if (!map[f.from]) map[f.from] = {};
    if (!map[f.from][f.to]) map[f.from][f.to] = [];
    map[f.from][f.to].push(f);
  }
  return map;
}

// ─── Composant principal ───────────────────────────────────────────────────

export default function FluxMatrixTab({ onSelectFlux }) {
  const nodes = useMemo(getMatrixNodes, []);
  const fluxMap = useMemo(buildFluxMap, []);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [filterType, setFilterType] = useState("ALL");
  const [showLegend, setShowLegend] = useState(true);
  const matrixSvgRef = useRef(null);

  const filteredFluxMap = useMemo(() => {
    if (filterType === "ALL") return fluxMap;
    const filtered = {};
    for (const from of Object.keys(fluxMap)) {
      for (const to of Object.keys(fluxMap[from])) {
        const matching = fluxMap[from][to].filter(f => f.type === filterType);
        if (matching.length > 0) {
          if (!filtered[from]) filtered[from] = {};
          filtered[from][to] = matching;
        }
      }
    }
    return filtered;
  }, [fluxMap, filterType]);

  const handleCellClick = useCallback((fromId, toId, fluxes) => {
    setSelectedCell({ fromId, toId, fluxes });
    if (onSelectFlux) onSelectFlux(fluxes);
  }, [onSelectFlux]);

  // ─── Stats ─────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const byType = {};
    for (const f of FLUX) {
      byType[f.type] = (byType[f.type] || 0) + 1;
    }
    const critiques = FLUX.filter(f => f.criticite === "CRITIQUE").length;
    return { total: FLUX.length, byType, critiques };
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────

  const cellSize = 36;
  const headerWidth = 160;
  const headerHeight = 140;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SectionTitle icon="📊">Matrice des flux</SectionTitle>
        <div style={{ flex: 1 }} />

        {/* Filtre par type */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <FilterChip
            label="Tous"
            active={filterType === "ALL"}
            color={C.cyan}
            onClick={() => setFilterType("ALL")}
            count={stats.total}
          />
          {Object.entries(FLUX_COLORS).map(([type, cfg]) => (
            <FilterChip
              key={type}
              label={cfg.label}
              active={filterType === type}
              color={cfg.color}
              onClick={() => setFilterType(type)}
              count={stats.byType[type] || 0}
            />
          ))}
        </div>

        <ExportButtons svgRef={matrixSvgRef} filename="matrice-flux" />

        <button
          onClick={() => setShowLegend(!showLegend)}
          style={{
            background: "transparent",
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            padding: "4px 8px",
            color: C.textMuted,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {showLegend ? "Masquer" : "Légende"}
        </button>
      </div>

      {/* Légende */}
      {showLegend && (
        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap", padding: "8px 12px",
          background: C.darkPanel, borderRadius: 6, border: `1px solid ${C.border}`,
        }}>
          {Object.entries(FLUX_COLORS).map(([type, cfg]) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 12, height: 12, borderRadius: 2,
                background: cfg.color, opacity: 0.9,
              }} />
              <span style={{ fontSize: 11, color: C.textMuted }}>{cfg.label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
            <span style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>●</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>{stats.critiques} flux critiques</span>
          </div>
        </div>
      )}

      {/* Matrice */}
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <div style={{ display: "inline-block", minWidth: "100%" }}>
          <svg
            ref={matrixSvgRef}
            width={headerWidth + nodes.length * cellSize + 2}
            height={headerHeight + nodes.length * cellSize + 2}
            style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
          >
            {/* Background */}
            <rect width="100%" height="100%" fill={C.dark} rx={4} />

            {/* Column headers (rotated) */}
            {nodes.map((node, j) => (
              <g key={`col-${node.id}`}>
                <text
                  x={headerWidth + j * cellSize + cellSize / 2}
                  y={headerHeight - 6}
                  transform={`rotate(-45, ${headerWidth + j * cellSize + cellSize / 2}, ${headerHeight - 6})`}
                  fill={node.category === "spring" ? C.green : node.category === "resource" ? C.orange : node.color}
                  fontSize={9}
                  textAnchor="start"
                  fontWeight={500}
                >
                  {truncate(node.name, 18)}
                </text>
              </g>
            ))}

            {/* Row headers + cells */}
            {nodes.map((rowNode, i) => (
              <g key={`row-${rowNode.id}`}>
                {/* Row header */}
                <text
                  x={headerWidth - 8}
                  y={headerHeight + i * cellSize + cellSize / 2 + 3}
                  fill={rowNode.category === "spring" ? C.green : rowNode.category === "resource" ? C.orange : rowNode.color}
                  fontSize={9}
                  textAnchor="end"
                  fontWeight={500}
                >
                  {rowNode.icon} {truncate(rowNode.name, 18)}
                </text>

                {/* Cells */}
                {nodes.map((colNode, j) => {
                  const fluxes = filteredFluxMap[rowNode.id]?.[colNode.id] || [];
                  const isHovered = hoveredCell?.i === i && hoveredCell?.j === j;
                  const isSelected = selectedCell?.fromId === rowNode.id && selectedCell?.toId === colNode.id;
                  const isDiagonal = i === j;

                  return (
                    <g key={`cell-${i}-${j}`}>
                      <rect
                        x={headerWidth + j * cellSize}
                        y={headerHeight + i * cellSize}
                        width={cellSize - 1}
                        height={cellSize - 1}
                        rx={3}
                        fill={
                          isDiagonal ? C.darkPanel :
                          fluxes.length > 0 ? getCellColor(fluxes) :
                          isHovered ? `${C.border}44` : `${C.darkCard}88`
                        }
                        stroke={isSelected ? C.cyan : isHovered ? C.borderLight : "transparent"}
                        strokeWidth={isSelected ? 2 : 1}
                        style={{ cursor: fluxes.length > 0 ? "pointer" : "default" }}
                        onMouseEnter={() => setHoveredCell({ i, j, fromId: rowNode.id, toId: colNode.id, fluxes })}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => fluxes.length > 0 && handleCellClick(rowNode.id, colNode.id, fluxes)}
                      />
                      {/* Flux count */}
                      {fluxes.length > 0 && (
                        <text
                          x={headerWidth + j * cellSize + cellSize / 2 - 0.5}
                          y={headerHeight + i * cellSize + cellSize / 2 + 3.5}
                          fill={C.white}
                          fontSize={10}
                          fontWeight={700}
                          textAnchor="middle"
                          style={{ pointerEvents: "none" }}
                        >
                          {fluxes.length}
                        </text>
                      )}
                      {/* Criticité indicator */}
                      {fluxes.some(f => f.criticite === "CRITIQUE") && (
                        <circle
                          cx={headerWidth + j * cellSize + cellSize - 5}
                          cy={headerHeight + i * cellSize + 5}
                          r={3}
                          fill={C.red}
                          style={{ pointerEvents: "none" }}
                        />
                      )}
                    </g>
                  );
                })}

                {/* Row separator */}
                <line
                  x1={headerWidth}
                  y1={headerHeight + (i + 1) * cellSize}
                  x2={headerWidth + nodes.length * cellSize}
                  y2={headerHeight + (i + 1) * cellSize}
                  stroke={C.border}
                  strokeWidth={0.5}
                  opacity={0.3}
                />
              </g>
            ))}

            {/* Category separators */}
            {renderCategorySeparators(nodes, headerWidth, headerHeight, cellSize)}
          </svg>
        </div>

        {/* Tooltip */}
        {hoveredCell && hoveredCell.fluxes.length > 0 && (
          <MatrixTooltip cell={hoveredCell} nodes={nodes} cellSize={cellSize} headerWidth={headerWidth} headerHeight={headerHeight} />
        )}
      </div>

      {/* Selected cell detail panel */}
      {selectedCell && selectedCell.fluxes.length > 0 && (
        <FluxDetailPanel cell={selectedCell} onClose={() => setSelectedCell(null)} />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function FilterChip({ label, active, color, onClick, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        color: active ? C.dark : color,
        background: active ? color : `${color}15`,
        border: `1px solid ${active ? color : `${color}33`}`,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
      <span style={{
        background: active ? `${C.dark}44` : `${color}22`,
        borderRadius: 3,
        padding: "0 4px",
        fontSize: 9,
      }}>
        {count}
      </span>
    </button>
  );
}

function MatrixTooltip({ cell, nodes, cellSize, headerWidth, headerHeight }) {
  const fromNode = nodes[cell.i];
  const toNode = nodes[cell.j];
  const x = headerWidth + cell.j * cellSize + cellSize;
  const y = headerHeight + cell.i * cellSize;

  return (
    <div
      style={{
        position: "absolute",
        left: x + 8,
        top: y,
        background: C.darkCard,
        border: `1px solid ${C.borderLight}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 260,
        maxWidth: 350,
        zIndex: 100,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
        {fromNode?.icon} {fromNode?.name} → {toNode?.icon} {toNode?.name}
      </div>
      {cell.fluxes.map((f, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 4,
          padding: "4px 6px", borderRadius: 4, background: FLUX_COLORS[f.type]?.bg || C.darkPanel,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: 2,
            background: FLUX_COLORS[f.type]?.color || C.cyan,
          }} />
          <span style={{ fontSize: 10, color: C.text, flex: 1 }}>{f.label}</span>
          <CriticiteBadge level={f.criticite} />
        </div>
      ))}
      <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>
        Cliquer pour voir le détail
      </div>
    </div>
  );
}

function FluxDetailPanel({ cell, onClose }) {
  return (
    <Box style={{
      borderColor: C.cyan + "44",
      background: C.darkPanel,
      maxHeight: 200,
      overflow: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <SectionTitle icon="🔗" style={{ marginBottom: 0 }}>
          Détail des flux ({cell.fluxes.length})
        </SectionTitle>
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none", color: C.textMuted,
            cursor: "pointer", fontSize: 16, padding: "2px 6px",
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {cell.fluxes.map((f, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", borderRadius: 4,
            background: C.darkCard, border: `1px solid ${C.border}`,
          }}>
            <Chip label={f.type} color={FLUX_COLORS[f.type]?.color || C.cyan} />
            <span style={{ fontSize: 11, color: C.text, flex: 1 }}>{f.label}</span>
            <CriticiteBadge level={f.criticite} />
            <span style={{ fontSize: 10, color: C.textDim }}>{f.direction}</span>
          </div>
        ))}
      </div>
      {cell.fluxes[0]?.detail && (
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8, fontStyle: "italic" }}>
          {cell.fluxes[0].detail}
        </div>
      )}
    </Box>
  );
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function getCellColor(fluxes) {
  if (fluxes.length === 0) return "transparent";
  // Use the color of the most critical flux type
  const hasCritique = fluxes.some(f => f.criticite === "CRITIQUE");
  if (hasCritique) return `${C.red}44`;
  // Use first flux type color
  const firstType = fluxes[0].type;
  const cfg = FLUX_COLORS[firstType];
  return cfg ? `${cfg.color}44` : `${C.cyan}33`;
}

function renderCategorySeparators(nodes, headerWidth, headerHeight, cellSize) {
  const lines = [];
  let prevCategory = null;
  nodes.forEach((n, i) => {
    if (prevCategory && n.category !== prevCategory) {
      lines.push(
        <line
          key={`sep-h-${i}`}
          x1={headerWidth}
          y1={headerHeight + i * cellSize}
          x2={headerWidth + nodes.length * cellSize}
          y2={headerHeight + i * cellSize}
          stroke={C.cyan}
          strokeWidth={1}
          opacity={0.4}
          strokeDasharray="4,2"
        />,
        <line
          key={`sep-v-${i}`}
          x1={headerWidth + i * cellSize}
          y1={headerHeight}
          x2={headerWidth + i * cellSize}
          y2={headerHeight + nodes.length * cellSize}
          stroke={C.cyan}
          strokeWidth={1}
          opacity={0.4}
          strokeDasharray="4,2"
        />
      );
    }
    prevCategory = n.category;
  });
  return lines;
}
