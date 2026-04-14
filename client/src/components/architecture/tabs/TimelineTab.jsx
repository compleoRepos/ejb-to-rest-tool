/**
 * TimelineTab — Timeline de migration Gantt horizontal.
 * Phases topologiques calculées depuis les dépendances.
 * Statuts, durées estimées, chemin critique.
 *
 * @author Hamza NORDINE
 */
import { useState, useMemo, useRef } from "react";
import { LEGACY, FLUX } from "../shared/data";
import { C, FLUX_COLORS, Chip, CriticiteBadge, StatutBadge, SectionTitle, Box } from "../shared/primitives";
import ExportButtons from "../shared/ExportButtons";

// ─── Phase computation (topological sort) ──────────────────────────────────

function computePhases() {
  // Group modules by their phase property (already defined in data)
  const phases = {};
  for (const mod of LEGACY) {
    const p = mod.phase || 1;
    if (!phases[p]) phases[p] = [];
    phases[p].push(mod);
  }

  // Sort phases
  const sortedPhaseIds = Object.keys(phases).map(Number).sort((a, b) => a - b);

  return sortedPhaseIds.map(phaseId => {
    const mods = phases[phaseId];
    const totalJH = mods.reduce((sum, m) => sum + (m.dureeEstimeeJH || 0), 0);
    const maxJH = Math.max(...mods.map(m => m.dureeEstimeeJH || 0));
    const critiques = mods.filter(m => m.criticite === "CRITIQUE").length;

    return {
      id: phaseId,
      label: `Phase ${phaseId}`,
      modules: mods,
      totalJH,
      maxJH,
      critiques,
      // Phase duration = max of individual durations (parallel execution)
      durationJH: maxJH,
    };
  });
}

function computeCriticalPath(phases) {
  // Critical path = phases with CRITIQUE modules
  return phases.filter(p => p.critiques > 0).map(p => p.id);
}

// ─── Composant principal ───────────────────────────────────────────────────

export default function TimelineTab() {
  const [hoveredModule, setHoveredModule] = useState(null);
  const timelineSvgRef = useRef(null);
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [showDetails, setShowDetails] = useState(true);

  const phases = useMemo(computePhases, []);
  const criticalPath = useMemo(() => computeCriticalPath(phases), [phases]);
  const totalJH = useMemo(() => phases.reduce((sum, p) => sum + p.durationJH, 0), [phases]);
  const totalModules = LEGACY.length;

  // Gantt dimensions
  const LEFT_PANEL = 200;
  const ROW_HEIGHT = 48;
  const GANTT_WIDTH = 600;
  const HEADER_HEIGHT = 50;
  const SVG_WIDTH = LEFT_PANEL + GANTT_WIDTH + 40;

  // Scale: total JH → GANTT_WIDTH
  const maxCumulativeJH = phases.reduce((sum, p) => sum + p.durationJH, 0);
  const scale = GANTT_WIDTH / Math.max(maxCumulativeJH, 1);

  // Compute cumulative start positions
  const phasePositions = useMemo(() => {
    let cumulative = 0;
    return phases.map(p => {
      const start = cumulative;
      cumulative += p.durationJH;
      return { ...p, startJH: start, endJH: cumulative };
    });
  }, [phases]);

  // Flatten modules with their phase info for row rendering
  const rows = useMemo(() => {
    const result = [];
    for (const pp of phasePositions) {
      for (const mod of pp.modules) {
        result.push({
          ...mod,
          phaseId: pp.id,
          phaseStartJH: pp.startJH,
          phaseEndJH: pp.endJH,
          phaseDurationJH: pp.durationJH,
        });
      }
    }
    return result;
  }, [phasePositions]);

  const SVG_HEIGHT = HEADER_HEIGHT + rows.length * ROW_HEIGHT + 40;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SectionTitle icon="📅">Timeline de migration</SectionTitle>
        <div style={{ flex: 1 }} />

        {/* Stats */}
        <div style={{ display: "flex", gap: 12 }}>
          <StatBox label="Phases" value={phases.length} color={C.cyan} />
          <StatBox label="Modules" value={totalModules} color={C.blue} />
          <StatBox label="Total JH" value={totalJH} color={C.orange} />
          <StatBox label="Critiques" value={criticalPath.length} color={C.red} />
        </div>

        <ExportButtons svgRef={timelineSvgRef} filename="timeline-migration" />

        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 4, padding: "4px 8px", color: C.textMuted,
            fontSize: 11, cursor: "pointer",
          }}
        >
          {showDetails ? "Compact" : "Détaillé"}
        </button>
      </div>

      {/* Gantt chart */}
      <div style={{ flex: 1, overflow: "auto", background: C.dark, borderRadius: 8, border: `1px solid ${C.border}` }}>
        <svg
          ref={timelineSvgRef}
          width={SVG_WIDTH}
          height={SVG_HEIGHT}
          style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", display: "block" }}
        >
          <rect width="100%" height="100%" fill={C.dark} rx={4} />

          {/* Header: JH scale */}
          <g>
            <text x={LEFT_PANEL / 2} y={20} textAnchor="middle" fill={C.textDim} fontSize={10} fontWeight={700}>
              MODULE
            </text>
            <text x={LEFT_PANEL + GANTT_WIDTH / 2} y={20} textAnchor="middle" fill={C.textDim} fontSize={10} fontWeight={700}>
              TIMELINE (Jours-Homme)
            </text>

            {/* Phase markers */}
            {phasePositions.map(pp => {
              const x = LEFT_PANEL + pp.startJH * scale;
              const w = pp.durationJH * scale;
              const isCritical = criticalPath.includes(pp.id);

              return (
                <g key={`phase-header-${pp.id}`}>
                  <rect
                    x={x} y={28} width={w} height={18}
                    rx={3}
                    fill={isCritical ? `${C.red}22` : `${C.cyan}11`}
                    stroke={isCritical ? `${C.red}44` : `${C.cyan}22`}
                    strokeWidth={1}
                  />
                  <text
                    x={x + w / 2} y={40}
                    textAnchor="middle" fill={isCritical ? C.red : C.cyan}
                    fontSize={8} fontWeight={700}
                  >
                    Phase {pp.id} ({pp.durationJH} JH)
                  </text>
                </g>
              );
            })}

            {/* Separator */}
            <line x1={0} y1={HEADER_HEIGHT} x2={SVG_WIDTH} y2={HEADER_HEIGHT} stroke={C.border} strokeWidth={1} />
          </g>

          {/* Rows */}
          {rows.map((mod, i) => {
            const y = HEADER_HEIGHT + i * ROW_HEIGHT;
            const barX = LEFT_PANEL + mod.phaseStartJH * scale;
            const barW = Math.max(mod.dureeEstimeeJH * scale, 20);
            const isHovered = hoveredModule === mod.id;
            const isCritical = mod.criticite === "CRITIQUE";
            const statusColor = getStatusColor(mod.statutMigration);

            return (
              <g
                key={mod.id}
                onMouseEnter={() => setHoveredModule(mod.id)}
                onMouseLeave={() => setHoveredModule(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Row background */}
                <rect
                  x={0} y={y} width={SVG_WIDTH} height={ROW_HEIGHT}
                  fill={isHovered ? `${C.cyan}08` : i % 2 === 0 ? "transparent" : `${C.darkCard}44`}
                />

                {/* Module name (left panel) */}
                <text x={8} y={y + ROW_HEIGHT / 2 - 4} fill={C.text} fontSize={10} fontWeight={600}>
                  {mod.icon} {mod.name.length > 18 ? mod.name.slice(0, 17) + "…" : mod.name}
                </text>
                <text x={8} y={y + ROW_HEIGHT / 2 + 10} fill={C.textDim} fontSize={8}>
                  {mod.type} • {mod.dureeEstimeeJH} JH
                </text>

                {/* Left panel separator */}
                <line x1={LEFT_PANEL} y1={y} x2={LEFT_PANEL} y2={y + ROW_HEIGHT} stroke={C.border} strokeWidth={0.5} />

                {/* Gantt bar */}
                <rect
                  x={barX + 2} y={y + 10} width={barW - 4} height={ROW_HEIGHT - 20}
                  rx={4}
                  fill={`${mod.color}33`}
                  stroke={isHovered ? mod.color : `${mod.color}66`}
                  strokeWidth={isHovered ? 2 : 1}
                />

                {/* Progress fill (based on status) */}
                <rect
                  x={barX + 2} y={y + 10}
                  width={(barW - 4) * getStatusProgress(mod.statutMigration)}
                  height={ROW_HEIGHT - 20}
                  rx={4}
                  fill={`${statusColor}44`}
                />

                {/* Bar label */}
                {barW > 40 && (
                  <text
                    x={barX + barW / 2} y={y + ROW_HEIGHT / 2 + 3}
                    textAnchor="middle" fill={C.text} fontSize={9} fontWeight={600}
                  >
                    {mod.dureeEstimeeJH} JH
                  </text>
                )}

                {/* Criticité indicator */}
                {isCritical && (
                  <circle cx={barX + barW + 8} cy={y + ROW_HEIGHT / 2} r={4} fill={C.red} />
                )}

                {/* Status indicator */}
                <circle
                  cx={LEFT_PANEL - 12} cy={y + ROW_HEIGHT / 2}
                  r={4} fill={statusColor}
                />

                {/* Row separator */}
                <line x1={0} y1={y + ROW_HEIGHT} x2={SVG_WIDTH} y2={y + ROW_HEIGHT} stroke={C.border} strokeWidth={0.3} />

                {/* Tooltip on hover */}
                {isHovered && showDetails && (
                  <g>
                    <rect
                      x={barX + barW + 16} y={y + 4}
                      width={220} height={ROW_HEIGHT - 8}
                      rx={4} fill={C.darkCard} stroke={C.borderLight} strokeWidth={1}
                    />
                    <text x={barX + barW + 24} y={y + 18} fill={C.text} fontSize={9} fontWeight={600}>
                      {mod.name}
                    </text>
                    <text x={barX + barW + 24} y={y + 30} fill={C.textMuted} fontSize={8}>
                      Phase {mod.phaseId} • {mod.criticite} • {mod.statutMigration.replace("_", " ")}
                    </text>
                    <text x={barX + barW + 24} y={y + 40} fill={C.textDim} fontSize={8}>
                      {mod.methods?.length || 0} méthodes • {mod.tables?.length || 0} tables
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Phase vertical separators */}
          {phasePositions.map(pp => (
            <line
              key={`sep-${pp.id}`}
              x1={LEFT_PANEL + pp.startJH * scale}
              y1={HEADER_HEIGHT}
              x2={LEFT_PANEL + pp.startJH * scale}
              y2={SVG_HEIGHT}
              stroke={C.cyan}
              strokeWidth={0.5}
              opacity={0.3}
              strokeDasharray="4,2"
            />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div style={{
        display: "flex", gap: 16, flexWrap: "wrap", padding: "6px 12px",
        background: C.darkPanel, borderRadius: 6, border: `1px solid ${C.border}`,
        fontSize: 10, color: C.textMuted, alignItems: "center",
      }}>
        <span style={{ fontWeight: 700, color: C.textDim }}>Statuts :</span>
        {Object.entries({ "MIGRÉ": C.green, EN_COURS: C.cyan, EN_ATTENTE: C.textMuted, "BLOQUÉ": C.red }).map(([s, c]) => (
          <span key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />
            {s.replace("_", " ")}
          </span>
        ))}
        <span style={{ marginLeft: 12, fontWeight: 700, color: C.textDim }}>Chemin critique :</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, display: "inline-block" }} />
          Phases {criticalPath.join(", ")}
        </span>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatBox({ label, value, color }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "4px 12px", borderRadius: 4,
      background: `${color}11`, border: `1px solid ${color}22`,
    }}>
      <span style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </span>
      <span style={{ fontSize: 8, color: C.textMuted, textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function getStatusColor(statut) {
  switch (statut) {
    case "MIGRÉ": return C.green;
    case "EN_COURS": return C.cyan;
    case "BLOQUÉ": return C.red;
    default: return C.textMuted;
  }
}

function getStatusProgress(statut) {
  switch (statut) {
    case "MIGRÉ": return 1;
    case "EN_COURS": return 0.5;
    case "BLOQUÉ": return 0.2;
    default: return 0;
  }
}
