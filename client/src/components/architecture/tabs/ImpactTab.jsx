/**
 * ImpactTab — Analyse d'impact inter-modules.
 * Sélection d'un module → dépendants/dépendances directs + cascade depth=2.
 * Score d'impact Compleo calculé dynamiquement.
 *
 * @author Hamza NORDINE
 */
import { useState, useMemo, useCallback, useRef } from "react";
import { LEGACY, SPRING, RESOURCES, FLUX, findModule, getIncomingFlux, getOutgoingFlux } from "../shared/data";
import { C, FLUX_COLORS, Chip, CriticiteBadge, StatutBadge, SectionTitle, Box } from "../shared/primitives";
import ExportButtons from "../shared/ExportButtons";

// ─── Impact computation ────────────────────────────────────────────────────

function computeImpact(moduleId, depth = 2) {
  const visited = new Set();
  const layers = []; // layers[0] = direct, layers[1] = depth 2

  function traverse(currentId, currentDepth, direction) {
    if (currentDepth > depth || visited.has(`${currentId}-${direction}`)) return;
    visited.add(`${currentId}-${direction}`);

    const fluxes = direction === "upstream"
      ? FLUX.filter(f => f.to === currentId && f.type !== "MIGRATION")
      : FLUX.filter(f => f.from === currentId && f.type !== "MIGRATION");

    const neighbors = fluxes.map(f => direction === "upstream" ? f.from : f.to);

    for (const neighborId of neighbors) {
      if (neighborId === moduleId) continue;
      const layerIdx = currentDepth - 1;
      if (!layers[layerIdx]) layers[layerIdx] = [];
      if (!layers[layerIdx].find(n => n.id === neighborId && n.direction === direction)) {
        const mod = findModule(neighborId);
        layers[layerIdx].push({
          id: neighborId,
          name: mod?.name || neighborId,
          icon: mod?.icon || "?",
          color: mod?.color || C.textMuted,
          type: mod?.type || "unknown",
          direction,
          fluxType: fluxes.find(f => (direction === "upstream" ? f.from : f.to) === neighborId)?.type || "unknown",
          criticite: fluxes.find(f => (direction === "upstream" ? f.from : f.to) === neighborId)?.criticite || "MOYEN",
        });
      }
      traverse(neighborId, currentDepth + 1, direction);
    }
  }

  traverse(moduleId, 1, "downstream");
  traverse(moduleId, 1, "upstream");

  return layers;
}

function computeImpactScore(moduleId) {
  const outgoing = FLUX.filter(f => f.from === moduleId && f.type !== "MIGRATION");
  const incoming = FLUX.filter(f => f.to === moduleId && f.type !== "MIGRATION");
  const mod = findModule(moduleId);

  let score = 0;

  // Nombre de dépendances sortantes (poids fort)
  score += outgoing.length * 15;

  // Nombre de dépendants (modules qui m'appellent)
  score += incoming.length * 10;

  // Criticité du module
  if (mod?.criticite === "CRITIQUE") score += 30;
  else if (mod?.criticite === "ÉLEVÉ") score += 20;
  else if (mod?.criticite === "MOYEN") score += 10;

  // Types de flux (SOAP/REST_EXT = plus risqué)
  const hasExternalApi = outgoing.some(f => f.type === "SOAP" || f.type === "REST_EXT");
  if (hasExternalApi) score += 15;

  // JMS (asynchrone = risque de cascade)
  const hasJms = outgoing.some(f => f.type === "JMS");
  if (hasJms) score += 10;

  // Durée estimée (proxy de complexité)
  if (mod?.dureeEstimeeJH > 40) score += 15;
  else if (mod?.dureeEstimeeJH > 20) score += 8;

  return Math.min(100, score);
}

function getScoreColor(score) {
  if (score >= 70) return C.red;
  if (score >= 50) return C.orange;
  if (score >= 30) return C.yellow;
  return C.green;
}

function getScoreLabel(score) {
  if (score >= 70) return "CRITIQUE";
  if (score >= 50) return "ÉLEVÉ";
  if (score >= 30) return "MOYEN";
  return "FAIBLE";
}

// ─── Composant principal ───────────────────────────────────────────────────

export default function ImpactTab() {
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const impactSvgRef = useRef(null);

  const modules = useMemo(() =>
    LEGACY.map(m => ({
      ...m,
      impactScore: computeImpactScore(m.id),
      outCount: FLUX.filter(f => f.from === m.id && f.type !== "MIGRATION").length,
      inCount: FLUX.filter(f => f.to === m.id && f.type !== "MIGRATION").length,
    })).sort((a, b) => b.impactScore - a.impactScore),
  []);

  const impactLayers = useMemo(() => {
    if (!selectedModuleId) return [];
    return computeImpact(selectedModuleId, 2);
  }, [selectedModuleId]);

  const selectedModule = useMemo(() =>
    modules.find(m => m.id === selectedModuleId),
  [modules, selectedModuleId]);

  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      {/* Left: Module list ranked by impact score */}
      <div style={{
        width: 320, minWidth: 280, display: "flex", flexDirection: "column",
        background: C.darkPanel, borderRadius: 8, border: `1px solid ${C.border}`,
        overflow: "hidden",
      }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <SectionTitle icon="🎯" style={{ marginBottom: 0 }}>
            Classement par impact
          </SectionTitle>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
            Sélectionnez un module pour analyser son impact
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {modules.map(mod => {
            const isSelected = mod.id === selectedModuleId;
            const scoreColor = getScoreColor(mod.impactScore);

            return (
              <div
                key={mod.id}
                onClick={() => setSelectedModuleId(mod.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 6, marginBottom: 4,
                  background: isSelected ? `${C.cyan}15` : "transparent",
                  border: `1px solid ${isSelected ? C.cyan + "44" : "transparent"}`,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 18 }}>{mod.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {mod.name}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 9, color: C.textDim }}>↗ {mod.outCount}</span>
                    <span style={{ fontSize: 9, color: C.textDim }}>↙ {mod.inCount}</span>
                    <Chip label={mod.type} color={mod.color} style={{ fontSize: 8, padding: "0 4px" }} />
                  </div>
                </div>

                {/* Impact score bar */}
                <div style={{ width: 50, textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: scoreColor, fontFamily: "'JetBrains Mono', monospace" }}>
                    {mod.impactScore}
                  </div>
                  <div style={{
                    height: 3, borderRadius: 2, background: C.border, marginTop: 2,
                  }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      width: `${mod.impactScore}%`,
                      background: scoreColor,
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Impact analysis detail */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {!selectedModuleId ? (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            background: C.darkPanel, borderRadius: 8, border: `1px solid ${C.border}`,
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
              <div style={{ fontSize: 14, color: C.textMuted }}>
                Sélectionnez un module pour analyser son impact
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                Cascade depth = 2 niveaux
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Module header */}
            <Box style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px" }}>
              <span style={{ fontSize: 32 }}>{selectedModule?.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{selectedModule?.name}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{selectedModule?.description}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <CriticiteBadge level={selectedModule?.criticite} />
                  <StatutBadge statut={selectedModule?.statutMigration} />
                  <Chip label={`${selectedModule?.dureeEstimeeJH} JH`} color={C.cyan} />
                </div>
              </div>

              {/* Impact score gauge */}
              <div style={{ textAlign: "center" }}>
                <div style={{ position: "relative", width: 72, height: 72 }}>
                  <svg width={72} height={72} viewBox="0 0 72 72">
                    <circle cx={36} cy={36} r={30} fill="none" stroke={C.border} strokeWidth={5} />
                    <circle
                      cx={36} cy={36} r={30} fill="none"
                      stroke={getScoreColor(selectedModule?.impactScore || 0)}
                      strokeWidth={5}
                      strokeDasharray={`${(selectedModule?.impactScore || 0) / 100 * 188.5} 188.5`}
                      strokeLinecap="round"
                      transform="rotate(-90 36 36)"
                    />
                  </svg>
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    fontSize: 18, fontWeight: 800, color: getScoreColor(selectedModule?.impactScore || 0),
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {selectedModule?.impactScore}
                  </div>
                </div>
                <div style={{
                  fontSize: 9, fontWeight: 700, marginTop: 4,
                  color: getScoreColor(selectedModule?.impactScore || 0),
                }}>
                  {getScoreLabel(selectedModule?.impactScore || 0)}
                </div>
              </div>
            </Box>

            {/* Impact cascade visualization */}
            <div style={{ flex: 1, overflow: "auto" }}>
              <ImpactCascade
                svgRef={impactSvgRef}
                moduleId={selectedModuleId}
                moduleName={selectedModule?.name}
                moduleIcon={selectedModule?.icon}
                moduleColor={selectedModule?.color}
                layers={impactLayers}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Impact Cascade Visualization ──────────────────────────────────────────

function ImpactCascade({ moduleId, moduleName, moduleIcon, moduleColor, layers, svgRef }) {
  const WIDTH = 800;
  const layerHeight = 120;
  const centerX = WIDTH / 2;
  const nodeRadius = 28;
  const totalHeight = 60 + (layers.length + 1) * layerHeight;

  return (
    <div style={{ overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <ExportButtons svgRef={svgRef} filename={`impact-${moduleName || 'cascade'}`} />
      </div>
      <svg
        ref={svgRef}
        width={WIDTH}
        height={totalHeight}
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", display: "block", margin: "0 auto" }}
      >
        <rect width="100%" height="100%" fill={C.dark} rx={8} />

        {/* Central node */}
        <g>
          <circle cx={centerX} cy={50} r={nodeRadius + 4} fill={`${moduleColor}22`} stroke={moduleColor} strokeWidth={2.5} />
          <text x={centerX} y={46} textAnchor="middle" fontSize={16}>{moduleIcon}</text>
          <text x={centerX} y={62} textAnchor="middle" fontSize={8} fill={C.text} fontWeight={700}>
            {moduleName?.length > 16 ? moduleName.slice(0, 15) + "…" : moduleName}
          </text>
        </g>

        {/* Layers */}
        {layers.map((layer, layerIdx) => {
          if (!layer || layer.length === 0) return null;

          const y = 50 + (layerIdx + 1) * layerHeight;
          const upstream = layer.filter(n => n.direction === "upstream");
          const downstream = layer.filter(n => n.direction === "downstream");

          // Split: upstream on left, downstream on right
          const leftNodes = upstream;
          const rightNodes = downstream;

          return (
            <g key={`layer-${layerIdx}`}>
              {/* Layer label */}
              <text x={20} y={y - 30} fill={C.textDim} fontSize={9} fontWeight={700}>
                {layerIdx === 0 ? "DIRECT (depth 1)" : `CASCADE (depth ${layerIdx + 1})`}
              </text>
              <line x1={20} y1={y - 22} x2={WIDTH - 20} y2={y - 22} stroke={C.border} strokeWidth={0.5} strokeDasharray="4,2" />

              {/* Upstream nodes (left side) */}
              {leftNodes.map((node, i) => {
                const nx = 100 + (i / Math.max(leftNodes.length - 1, 1)) * (centerX - 160);
                return (
                  <g key={`up-${node.id}`}>
                    {/* Connection line */}
                    <line
                      x1={centerX} y1={layerIdx === 0 ? 50 + nodeRadius : y - layerHeight + 10}
                      x2={nx} y2={y - 14}
                      stroke={FLUX_COLORS[node.fluxType]?.color || C.textDim}
                      strokeWidth={1.5}
                      strokeDasharray={layerIdx > 0 ? "4,2" : "none"}
                      opacity={0.6}
                    />
                    {/* Node */}
                    <circle cx={nx} cy={y} r={18} fill={`${node.color}22`} stroke={`${node.color}88`} strokeWidth={1.5} />
                    <text x={nx} y={y + 4} textAnchor="middle" fontSize={12}>{node.icon}</text>
                    <text x={nx} y={y + 28} textAnchor="middle" fontSize={8} fill={C.textMuted}>
                      {node.name.length > 14 ? node.name.slice(0, 13) + "…" : node.name}
                    </text>
                    <text x={nx} y={y + 38} textAnchor="middle" fontSize={7} fill={C.textDim}>↙ dépendant</text>
                  </g>
                );
              })}

              {/* Downstream nodes (right side) */}
              {rightNodes.map((node, i) => {
                const nx = centerX + 60 + (i / Math.max(rightNodes.length - 1, 1)) * (centerX - 100);
                return (
                  <g key={`down-${node.id}`}>
                    {/* Connection line */}
                    <line
                      x1={centerX} y1={layerIdx === 0 ? 50 + nodeRadius : y - layerHeight + 10}
                      x2={nx} y2={y - 14}
                      stroke={FLUX_COLORS[node.fluxType]?.color || C.textDim}
                      strokeWidth={1.5}
                      strokeDasharray={layerIdx > 0 ? "4,2" : "none"}
                      opacity={0.6}
                    />
                    {/* Node */}
                    <circle cx={nx} cy={y} r={18} fill={`${node.color}22`} stroke={`${node.color}88`} strokeWidth={1.5} />
                    <text x={nx} y={y + 4} textAnchor="middle" fontSize={12}>{node.icon}</text>
                    <text x={nx} y={y + 28} textAnchor="middle" fontSize={8} fill={C.textMuted}>
                      {node.name.length > 14 ? node.name.slice(0, 13) + "…" : node.name}
                    </text>
                    <text x={nx} y={y + 38} textAnchor="middle" fontSize={7} fill={C.textDim}>↗ dépendance</text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Empty state for layers */}
        {layers.length === 0 && (
          <text x={centerX} y={180} textAnchor="middle" fill={C.textDim} fontSize={12}>
            Aucune dépendance détectée
          </text>
        )}
      </svg>
    </div>
  );
}
