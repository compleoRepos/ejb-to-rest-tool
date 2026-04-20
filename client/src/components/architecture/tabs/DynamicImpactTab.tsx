/**
 * DynamicImpactTab — Analyse d'impact inter-microservices.
 * Sélection d'un service → dépendants/dépendances directs + cascade.
 */
import { useState, useMemo } from "react";
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

interface ImpactResult {
  directUpstream: string[];
  directDownstream: string[];
  cascadeUpstream: string[];
  cascadeDownstream: string[];
  impactScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  affectedFlows: string[];
}

export default function DynamicImpactTab({ data }: { data: AnalysisData }) {
  const [selectedService, setSelectedService] = useState<string>("");

  // Build adjacency maps
  const { outgoing, incoming } = useMemo(() => {
    const out: Record<string, string[]> = {};
    const inc: Record<string, string[]> = {};
    for (const ms of data.microservices) {
      out[ms.id] = ms.dependencies.map(d => d.targetServiceId);
      if (!inc[ms.id]) inc[ms.id] = [];
      for (const dep of ms.dependencies) {
        if (!inc[dep.targetServiceId]) inc[dep.targetServiceId] = [];
        inc[dep.targetServiceId].push(ms.id);
      }
    }
    return { outgoing: out, incoming: inc };
  }, [data.microservices]);

  // Compute impact for selected service
  const impact = useMemo((): ImpactResult | null => {
    if (!selectedService) return null;

    const directDown = outgoing[selectedService] || [];
    const directUp = incoming[selectedService] || [];

    // Cascade (depth 2)
    const cascadeDown = new Set<string>();
    for (const d of directDown) {
      for (const dd of (outgoing[d] || [])) {
        if (dd !== selectedService && !directDown.includes(dd)) cascadeDown.add(dd);
      }
    }

    const cascadeUp = new Set<string>();
    for (const u of directUp) {
      for (const uu of (incoming[u] || [])) {
        if (uu !== selectedService && !directUp.includes(uu)) cascadeUp.add(uu);
      }
    }

    // Impact score
    const totalAffected = directDown.length + directUp.length + cascadeDown.size + cascadeUp.size;
    const totalServices = data.microservices.length;
    const impactScore = totalServices > 0 ? Math.round((totalAffected / totalServices) * 100) : 0;

    // Risk level
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    if (impactScore > 75) riskLevel = "CRITICAL";
    else if (impactScore > 50) riskLevel = "HIGH";
    else if (impactScore > 25) riskLevel = "MEDIUM";

    // Affected critical flows
    const ms = data.microservices.find(m => m.id === selectedService);
    const affectedFlows = data.criticalFlows
      .filter(f => f.name.toLowerCase().includes(ms?.name?.toLowerCase() || ""))
      .map(f => f.name);

    return {
      directUpstream: directUp,
      directDownstream: directDown,
      cascadeUpstream: [...cascadeUp],
      cascadeDownstream: [...cascadeDown],
      impactScore,
      riskLevel,
      affectedFlows,
    };
  }, [selectedService, outgoing, incoming, data]);

  const getName = (id: string) => data.microservices.find(m => m.id === id)?.name || id;

  const riskColors: Record<string, string> = {
    LOW: C.green,
    MEDIUM: C.orange,
    HIGH: C.red,
    CRITICAL: "#ff4444",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Service selector */}
      <div style={{
        background: C.darkPanel, borderRadius: 8, padding: 16,
        border: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>
          Sélectionnez un microservice pour analyser son impact
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.microservices.map(ms => {
            const isSelected = ms.id === selectedService;
            return (
              <button key={ms.id} onClick={() => setSelectedService(ms.id)}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontSize: 11, fontWeight: isSelected ? 700 : 400,
                  background: isSelected ? `${C.cyan}22` : `${C.border}44`,
                  color: isSelected ? C.cyan : C.textMuted,
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: "all 0.15s ease",
                }}>
                {ms.name}
                <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>({ms.classCount})</span>
              </button>
            );
          })}
        </div>
      </div>

      {!impact && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: 200, color: C.textMuted, fontSize: 12,
        }}>
          Cliquez sur un microservice ci-dessus pour voir l'analyse d'impact.
        </div>
      )}

      {impact && (
        <>
          {/* Impact score */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{
              flex: 1, background: C.darkPanel, borderRadius: 8, padding: 20,
              border: `1px solid ${riskColors[impact.riskLevel]}44`,
              textAlign: "center",
            }}>
              <div style={{
                fontSize: 48, fontWeight: 900, color: riskColors[impact.riskLevel],
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {impact.impactScore}%
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Score d'impact</div>
              <div style={{
                display: "inline-block", marginTop: 8, padding: "4px 12px", borderRadius: 6,
                fontSize: 11, fontWeight: 700,
                background: `${riskColors[impact.riskLevel]}22`,
                color: riskColors[impact.riskLevel],
              }}>
                Risque {impact.riskLevel}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 2 }}>
              <ImpactRow label="Dépendances directes (sortantes)" items={impact.directDownstream.map(getName)} color={C.green} icon="→" />
              <ImpactRow label="Dépendants directs (entrants)" items={impact.directUpstream.map(getName)} color={C.blue} icon="←" />
              <ImpactRow label="Cascade sortante (profondeur 2)" items={impact.cascadeDownstream.map(getName)} color={C.orange} icon="⇒" />
              <ImpactRow label="Cascade entrante (profondeur 2)" items={impact.cascadeUpstream.map(getName)} color={C.purple} icon="⇐" />
            </div>
          </div>

          {/* Affected critical flows */}
          {impact.affectedFlows.length > 0 && (
            <div style={{
              background: `${C.red}08`, borderRadius: 8, padding: 16,
              border: `1px solid ${C.red}22`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 8 }}>
                ⚠️ Flux critiques impactés ({impact.affectedFlows.length})
              </div>
              {impact.affectedFlows.map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: C.text, padding: "4px 0" }}>
                  • {f}
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          <div style={{
            background: C.darkPanel, borderRadius: 8, padding: 16,
            border: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted,
          }}>
            <strong style={{ color: C.text }}>Résumé :</strong> La modification de{" "}
            <strong style={{ color: C.cyan }}>{getName(selectedService)}</strong> impacte directement{" "}
            <strong style={{ color: C.text }}>{impact.directDownstream.length + impact.directUpstream.length}</strong> services
            et potentiellement <strong style={{ color: C.text }}>{impact.cascadeDownstream.length + impact.cascadeUpstream.length}</strong> services
            en cascade (profondeur 2). Soit{" "}
            <strong style={{ color: riskColors[impact.riskLevel] }}>{impact.impactScore}%</strong> du système total.
          </div>
        </>
      )}
    </div>
  );
}

function ImpactRow({ label, items, color, icon }: {
  label: string; items: string[]; color: string; icon: string;
}) {
  return (
    <div style={{
      background: "#0f1420", borderRadius: 6, padding: "10px 14px",
      border: `1px solid #1e2a3a`,
    }}>
      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color }}>{icon}</span> {label}
        <span style={{ marginLeft: "auto", fontWeight: 700, color }}>{items.length}</span>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {items.length === 0 ? (
          <span style={{ fontSize: 10, color: "#64748b", fontStyle: "italic" }}>Aucun</span>
        ) : (
          items.map((item, i) => (
            <span key={i} style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
              background: `${color}15`, color, border: `1px solid ${color}33`,
            }}>
              {item}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
