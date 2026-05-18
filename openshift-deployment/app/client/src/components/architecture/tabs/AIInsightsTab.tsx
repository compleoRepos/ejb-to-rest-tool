/**
 * AIInsightsTab — Affiche les insights générés par le LLM (v10.5b).
 * 5 sections : Architecture Assessment, Migration Risks, Domain Boundaries,
 * Modernization Strategy, Code Quality Insights.
 *
 * Badge "IA" pour distinguer les données enrichies par le modèle.
 *
 * @author Compleo
 */

import { useState } from "react";

const C = {
  dark: "#0a0e17",
  darkPanel: "#0f1420",
  border: "#1e2a3a",
  text: "#e2e8f0",
  textMuted: "#64748b",
  cyan: "#22d3ee",
  purple: "#a78bfa",
  amber: "#fbbf24",
  red: "#f87171",
  green: "#34d399",
};

interface AIInsights {
  architectureAssessment?: {
    summary: string;
    patterns: string[];
    antiPatterns: string[];
    recommendations: string[];
  };
  migrationRisks?: {
    summary: string;
    risks: Array<{ risk: string; severity: string; mitigation: string }>;
  };
  domainBoundaries?: {
    summary: string;
    suggestedDomains: Array<{ name: string; classes: string[]; rationale: string }>;
  };
  modernizationStrategy?: {
    summary: string;
    phases: Array<{ phase: string; description: string; effort: string }>;
  };
  codeQualityInsights?: {
    summary: string;
    hotspots: Array<{ className: string; issue: string; suggestion: string }>;
  };
}

interface Props {
  aiInsights?: AIInsights | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: C.red,
  high: "#fb923c",
  medium: C.amber,
  low: C.green,
};

export default function AIInsightsTab({ aiInsights }: Props) {
  const [expandedSection, setExpandedSection] = useState<string | null>("architecture");

  if (!aiInsights) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 300, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            Insights IA non disponibles
          </div>
          <div style={{ fontSize: 12 }}>
            Les insights IA sont générés automatiquement lors de l'analyse avec un backend LLM configuré.
          </div>
          <div style={{
            marginTop: 12, fontSize: 11, padding: "6px 12px",
            background: `${C.purple}22`, border: `1px solid ${C.purple}44`,
            borderRadius: 6, display: "inline-block",
          }}>
            Configurez Ollama ou un backend LLM compatible pour activer cette fonctionnalité.
          </div>
        </div>
      </div>
    );
  }

  const sections = [
    {
      id: "architecture",
      title: "Architecture Assessment",
      icon: "🏛️",
      available: !!aiInsights.architectureAssessment,
    },
    {
      id: "risks",
      title: "Risques de Migration",
      icon: "⚠️",
      available: !!aiInsights.migrationRisks,
    },
    {
      id: "domains",
      title: "Frontières de Domaines",
      icon: "🗺️",
      available: !!aiInsights.domainBoundaries,
    },
    {
      id: "strategy",
      title: "Stratégie de Modernisation",
      icon: "📋",
      available: !!aiInsights.modernizationStrategy,
    },
    {
      id: "quality",
      title: "Qualité du Code",
      icon: "🔍",
      available: !!aiInsights.codeQualityInsights,
    },
  ];

  const toggle = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Header with AI badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        marginBottom: 16, paddingBottom: 12,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{
          padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
          background: `${C.purple}33`, color: C.purple, border: `1px solid ${C.purple}66`,
        }}>
          IA ENRICHI
        </span>
        <span style={{ fontSize: 12, color: C.textMuted }}>
          Analyse augmentée par LLM — {sections.filter(s => s.available).length}/5 sections disponibles
        </span>
      </div>

      {/* Accordion sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sections.map(section => (
          <div key={section.id} style={{
            border: `1px solid ${section.available ? C.border : `${C.border}66`}`,
            borderRadius: 8,
            background: C.darkPanel,
            opacity: section.available ? 1 : 0.5,
          }}>
            {/* Section header */}
            <button
              onClick={() => section.available && toggle(section.id)}
              disabled={!section.available}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "12px 16px",
                background: "transparent", border: "none",
                color: C.text, cursor: section.available ? "pointer" : "not-allowed",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
                textAlign: "left",
              }}
            >
              <span>{section.icon}</span>
              <span style={{ flex: 1 }}>{section.title}</span>
              {!section.available && (
                <span style={{ fontSize: 10, color: C.textMuted }}>Non disponible</span>
              )}
              {section.available && (
                <span style={{
                  fontSize: 14, transition: "transform 0.2s",
                  transform: expandedSection === section.id ? "rotate(90deg)" : "rotate(0deg)",
                }}>
                  ▶
                </span>
              )}
            </button>

            {/* Section content */}
            {expandedSection === section.id && section.available && (
              <div style={{ padding: "0 16px 16px" }}>
                {section.id === "architecture" && renderArchitecture(aiInsights.architectureAssessment!)}
                {section.id === "risks" && renderRisks(aiInsights.migrationRisks!)}
                {section.id === "domains" && renderDomains(aiInsights.domainBoundaries!)}
                {section.id === "strategy" && renderStrategy(aiInsights.modernizationStrategy!)}
                {section.id === "quality" && renderQuality(aiInsights.codeQualityInsights!)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Render helpers ──────────────────────────────────────────────────────────

function renderArchitecture(data: NonNullable<AIInsights["architectureAssessment"]>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: C.text, lineHeight: 1.6, margin: 0 }}>{data.summary}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Patterns */}
        <div style={{ padding: 12, background: `${C.green}11`, borderRadius: 6, border: `1px solid ${C.green}33` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.green, marginBottom: 8 }}>
            PATTERNS DÉTECTÉS
          </div>
          {data.patterns.map((p, i) => (
            <div key={i} style={{ fontSize: 11, color: C.text, marginBottom: 4, paddingLeft: 8 }}>
              • {p}
            </div>
          ))}
        </div>

        {/* Anti-patterns */}
        <div style={{ padding: 12, background: `${C.red}11`, borderRadius: 6, border: `1px solid ${C.red}33` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.red, marginBottom: 8 }}>
            ANTI-PATTERNS
          </div>
          {data.antiPatterns.map((p, i) => (
            <div key={i} style={{ fontSize: 11, color: C.text, marginBottom: 4, paddingLeft: 8 }}>
              • {p}
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div style={{ padding: 12, background: `${C.cyan}11`, borderRadius: 6, border: `1px solid ${C.cyan}33` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, marginBottom: 8 }}>
          RECOMMANDATIONS
        </div>
        {data.recommendations.map((r, i) => (
          <div key={i} style={{ fontSize: 11, color: C.text, marginBottom: 6, paddingLeft: 8, lineHeight: 1.5 }}>
            {i + 1}. {r}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderRisks(data: NonNullable<AIInsights["migrationRisks"]>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: C.text, lineHeight: 1.6, margin: 0 }}>{data.summary}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.risks.map((risk, i) => (
          <div key={i} style={{
            display: "flex", gap: 12, padding: 12,
            background: C.dark, borderRadius: 6,
            borderLeft: `3px solid ${SEVERITY_COLORS[risk.severity] || C.amber}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {risk.risk}
              </div>
              <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>
                Mitigation : {risk.mitigation}
              </div>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, height: "fit-content",
              background: `${SEVERITY_COLORS[risk.severity] || C.amber}22`,
              color: SEVERITY_COLORS[risk.severity] || C.amber,
              textTransform: "uppercase",
            }}>
              {risk.severity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderDomains(data: NonNullable<AIInsights["domainBoundaries"]>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: C.text, lineHeight: 1.6, margin: 0 }}>{data.summary}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {data.suggestedDomains.map((domain, i) => (
          <div key={i} style={{
            padding: 12, background: C.dark, borderRadius: 6,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, marginBottom: 6 }}>
              {domain.name}
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
              {domain.rationale}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {domain.classes.slice(0, 6).map((cls, j) => (
                <span key={j} style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 3,
                  background: `${C.cyan}22`, color: C.cyan,
                }}>
                  {cls}
                </span>
              ))}
              {domain.classes.length > 6 && (
                <span style={{ fontSize: 9, color: C.textMuted }}>
                  +{domain.classes.length - 6} autres
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderStrategy(data: NonNullable<AIInsights["modernizationStrategy"]>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: C.text, lineHeight: 1.6, margin: 0 }}>{data.summary}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.phases.map((phase, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: 12, background: C.dark, borderRadius: 6,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: `${C.cyan}22`, color: C.cyan, fontSize: 12, fontWeight: 700,
              flexShrink: 0,
            }}>
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {phase.phase}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginBottom: 4 }}>
                {phase.description}
              </div>
              <span style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 3,
                background: `${C.amber}22`, color: C.amber,
              }}>
                Effort : {phase.effort}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderQuality(data: NonNullable<AIInsights["codeQualityInsights"]>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: C.text, lineHeight: 1.6, margin: 0 }}>{data.summary}</p>

      <table style={{
        width: "100%", borderCollapse: "collapse",
        fontSize: 11, color: C.text,
      }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <th style={{ padding: "8px 12px", textAlign: "left", color: C.textMuted, fontWeight: 600 }}>Classe</th>
            <th style={{ padding: "8px 12px", textAlign: "left", color: C.textMuted, fontWeight: 600 }}>Problème</th>
            <th style={{ padding: "8px 12px", textAlign: "left", color: C.textMuted, fontWeight: 600 }}>Suggestion</th>
          </tr>
        </thead>
        <tbody>
          {data.hotspots.map((h, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}44` }}>
              <td style={{ padding: "8px 12px", color: C.cyan, fontWeight: 500 }}>{h.className}</td>
              <td style={{ padding: "8px 12px", color: C.amber }}>{h.issue}</td>
              <td style={{ padding: "8px 12px", color: C.textMuted }}>{h.suggestion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
