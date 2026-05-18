/**
 * MigrationSummaryTab — Résumé de la migration.
 * Remplace la timeline (inutile car la migration se fait dans l'outil).
 * Montre : technologies détectées → cibles, microservices extraits, métriques qualité.
 */
import { useMemo } from "react";
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

export default function MigrationSummaryTab({ data, sessionId }: { data: AnalysisData; sessionId?: string }) {
  // Compute summary metrics
  const metrics = useMemo(() => {
    const totalClasses = data.microservices.reduce((sum, ms) => sum + ms.classCount, 0);
    const totalEndpoints = data.microservices.reduce((sum, ms) => sum + (typeof ms.endpoints === 'number' ? ms.endpoints : ms.endpoints.length), 0);
    const avgCohesion = data.microservices.length > 0
      ? data.microservices.reduce((sum, ms) => sum + ms.cohesion, 0) / data.microservices.length
      : 0;
    const avgCoupling = data.microservices.length > 0
      ? data.microservices.reduce((sum, ms) => sum + ms.coupling, 0) / data.microservices.length
      : 0;

    return {
      totalClasses,
      totalEndpoints,
      avgCohesion: Math.round(avgCohesion * 100),
      avgCoupling: Math.round(avgCoupling * 100),
      microserviceCount: data.microservices.length,
      domainCount: data.domains.length,
      sharedLibClasses: data.sharedLibrary.classCount,
      apiRoutes: data.apiGateway.routes.length,
      warnings: data.warnings.length,
    };
  }, [data]);

  // Microservice ranking by class count
  const rankedServices = useMemo(() => {
    return [...data.microservices].sort((a, b) => b.classCount - a.classCount);
  }, [data.microservices]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${C.cyan}11, ${C.green}11)`,
        borderRadius: 8, padding: 20, border: `1px solid ${C.cyan}22`,
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>
          Résumé de la migration
        </div>
        <div style={{ fontSize: 11, color: C.textMuted }}>
          Résultat de l'analyse d'architecture et de l'extraction de microservices
          {sessionId && <span> · Session: <code style={{ color: C.cyan }}>{sessionId.slice(0, 16)}…</code></span>}
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <MetricCard label="Microservices" value={metrics.microserviceCount} color={C.cyan} />
        <MetricCard label="Domaines métier" value={metrics.domainCount} color={C.green} />
        <MetricCard label="Classes totales" value={metrics.totalClasses} color={C.blue} />
        <MetricCard label="Endpoints REST" value={metrics.totalEndpoints} color={C.purple} />
        <MetricCard label="Cohésion moy." value={`${metrics.avgCohesion}%`} color={metrics.avgCohesion > 60 ? C.green : C.orange} />
        <MetricCard label="Couplage moy." value={`${metrics.avgCoupling}%`} color={metrics.avgCoupling < 40 ? C.green : C.red} />
        <MetricCard label="Shared Library" value={metrics.sharedLibClasses} color={C.textMuted} suffix=" classes" />
        <MetricCard label="API Gateway" value={metrics.apiRoutes} color={C.orange} suffix=" routes" />
      </div>

      {/* Microservices breakdown */}
      <div style={{
        background: C.darkPanel, borderRadius: 8, padding: 16,
        border: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>
          Microservices extraits ({rankedServices.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rankedServices.map(ms => {
            const maxClasses = rankedServices[0]?.classCount || 1;
            const barWidth = Math.max(5, (ms.classCount / maxClasses) * 100);
            const cohesionColor = ms.cohesion > 0.6 ? C.green : ms.cohesion > 0.3 ? C.orange : C.red;
            const couplingColor = ms.coupling < 0.4 ? C.green : ms.coupling < 0.7 ? C.orange : C.red;

            return (
              <div key={ms.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                background: `${C.border}22`, borderRadius: 6,
              }}>
                <div style={{ width: 180, fontSize: 11, fontWeight: 600, color: C.cyan, flexShrink: 0 }}>
                  {ms.name}
                </div>
                <div style={{ flex: 1, position: "relative", height: 16, background: `${C.border}44`, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${barWidth}%`, background: `${C.cyan}44`, borderRadius: 4,
                  }} />
                  <span style={{
                    position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                    fontSize: 9, fontWeight: 700, color: C.text,
                  }}>
                    {ms.classCount} classes
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: cohesionColor }}>
                    Coh: {Math.round(ms.cohesion * 100)}%
                  </span>
                  <span style={{ fontSize: 9, color: couplingColor }}>
                    Coup: {Math.round(ms.coupling * 100)}%
                  </span>
                  <span style={{ fontSize: 9, color: C.textMuted }}>
                    {typeof ms.endpoints === 'number' ? ms.endpoints : ms.endpoints.length} EP
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Domains */}
      <div style={{
        background: C.darkPanel, borderRadius: 8, padding: 16,
        border: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>
          Domaines métier identifiés ({data.domains.length})
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
          {data.domains.map(domain => (
            <div key={domain.domainId} style={{
              padding: "10px 14px", borderRadius: 6,
              background: `${C.border}33`, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                {domain.domainId.replace(/_/g, " ")}
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 10, color: C.textMuted }}>
                <span>{domain.classCount} classes</span>
                <span style={{ color: domain.cohesion > 0.5 ? C.green : C.orange }}>
                  Cohésion: {Math.round(domain.cohesion * 100)}%
                </span>
                <span style={{ color: domain.coupling < 0.5 ? C.green : C.red }}>
                  Couplage: {Math.round(domain.coupling * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <div style={{
          background: `${C.orange}08`, borderRadius: 8, padding: 16,
          border: `1px solid ${C.orange}22`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.orange, marginBottom: 8 }}>
            ⚠️ Avertissements ({data.warnings.length})
          </div>
          {data.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: C.text, padding: "3px 0" }}>
              • {w}
            </div>
          ))}
        </div>
      )}

      {/* Entry/Exit points summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{
          background: C.darkPanel, borderRadius: 8, padding: 16,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 8 }}>
            Points d'entrée ({data.entryPoints.length})
          </div>
          {data.entryPoints.slice(0, 8).map((ep, i) => (
            <div key={i} style={{
              fontSize: 10, color: C.textMuted, padding: "3px 0",
              display: "flex", gap: 8, alignItems: "center",
            }}>
              <span style={{
                padding: "1px 6px", borderRadius: 3, fontSize: 8,
                background: `${C.green}22`, color: C.green,
              }}>
                {ep.protocol}
              </span>
              <span style={{ color: C.text }}>{ep.className}</span>
              <span style={{ fontSize: 9 }}>({ep.type})</span>
            </div>
          ))}
          {data.entryPoints.length > 8 && (
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
              + {data.entryPoints.length - 8} de plus…
            </div>
          )}
        </div>

        <div style={{
          background: C.darkPanel, borderRadius: 8, padding: 16,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.orange, marginBottom: 8 }}>
            Points de sortie ({data.exitPoints.length})
          </div>
          {data.exitPoints.slice(0, 8).map((ep, i) => (
            <div key={i} style={{
              fontSize: 10, color: C.textMuted, padding: "3px 0",
              display: "flex", gap: 8, alignItems: "center",
            }}>
              <span style={{
                padding: "1px 6px", borderRadius: 3, fontSize: 8,
                background: `${C.orange}22`, color: C.orange,
              }}>
                {ep.type}
              </span>
              <span style={{ color: C.text }}>{ep.className}</span>
              <span style={{ fontSize: 9 }}>→ {ep.target}</span>
            </div>
          ))}
          {data.exitPoints.length > 8 && (
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
              + {data.exitPoints.length - 8} de plus…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, suffix }: {
  label: string; value: number | string; color: string; suffix?: string;
}) {
  return (
    <div style={{
      background: `${color}08`, border: `1px solid ${color}22`, borderRadius: 8,
      padding: "14px 16px",
    }}>
      <div style={{
        fontSize: 24, fontWeight: 800, color,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {value}{suffix && <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{suffix}</span>}
      </div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{label}</div>
    </div>
  );
}
