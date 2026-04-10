/**
 * primitives.jsx — Composants UI réutilisables pour Architecture Explorer.
 * Palette "Terminal Craft" cohérente avec le reste de l'app.
 * @author Hamza NORDINE
 */
import { useMemo } from "react";

/** Palette de couleurs centralisée */
export const C = {
  dark: "#070b14",
  darkAlt: "#0a0f1a",
  darkPanel: "#0c1220",
  darkCard: "#0f1629",
  border: "#1a2540",
  borderLight: "#243050",
  text: "#e2e8f0",
  textMuted: "#8892a8",
  textDim: "#5a6478",
  cyan: "#00c8ff",
  cyanDim: "rgba(0,200,255,0.15)",
  green: "#10b981",
  greenDim: "rgba(16,185,129,0.15)",
  red: "#ef4444",
  redDim: "rgba(239,68,68,0.15)",
  orange: "#f97316",
  orangeDim: "rgba(249,115,22,0.15)",
  yellow: "#f59e0b",
  yellowDim: "rgba(245,158,11,0.15)",
  violet: "#a855f7",
  violetDim: "rgba(168,85,247,0.15)",
  blue: "#3b82f6",
  blueDim: "rgba(59,130,246,0.15)",
  white: "#ffffff",
};

/** Types de flux → couleurs */
export const FLUX_COLORS = {
  EJB_JNDI: { color: "#06b6d4", label: "@EJB JNDI", bg: "rgba(6,182,212,0.15)" },
  JMS: { color: "#a855f7", label: "JMS Queue/Topic", bg: "rgba(168,85,247,0.15)" },
  REST_EXT: { color: "#f97316", label: "REST API externe", bg: "rgba(249,115,22,0.15)" },
  SOAP: { color: "#f59e0b", label: "SOAP WebService", bg: "rgba(245,158,11,0.15)" },
  DATASOURCE: { color: "#ef4444", label: "DataSource partagée", bg: "rgba(239,68,68,0.15)" },
  MIGRATION: { color: "#10b981", label: "Migration (EJB→Svc)", bg: "rgba(16,185,129,0.15)" },
};

/** Niveaux de criticité → couleurs */
export const CRITICITE_COLORS = {
  CRITIQUE: { color: C.red, bg: C.redDim, label: "CRITIQUE" },
  "ÉLEVÉ": { color: C.orange, bg: C.orangeDim, label: "ÉLEVÉ" },
  MOYEN: { color: C.yellow, bg: C.yellowDim, label: "MOYEN" },
  FAIBLE: { color: C.green, bg: C.greenDim, label: "FAIBLE" },
};

/** Statuts de migration → couleurs + icônes */
export const STATUT_COLORS = {
  "MIGRÉ": { color: C.green, bg: C.greenDim, icon: "✓" },
  EN_COURS: { color: C.cyan, bg: C.cyanDim, icon: "↻" },
  EN_ATTENTE: { color: C.textMuted, bg: "rgba(136,146,168,0.1)", icon: "○" },
  "BLOQUÉ": { color: C.red, bg: C.redDim, icon: "✗" },
};

/** Chip — petit badge coloré */
export function Chip({ label, color = C.cyan, bg, style = {} }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        color,
        background: bg || `${color}22`,
        border: `1px solid ${color}33`,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </span>
  );
}

/** Badge criticité */
export function CriticiteBadge({ level }) {
  const cfg = CRITICITE_COLORS[level] || CRITICITE_COLORS.MOYEN;
  return <Chip label={cfg.label} color={cfg.color} bg={cfg.bg} />;
}

/** Badge statut migration */
export function StatutBadge({ statut }) {
  const cfg = STATUT_COLORS[statut] || STATUT_COLORS.EN_ATTENTE;
  return (
    <Chip
      label={`${cfg.icon} ${statut.replace("_", " ")}`}
      color={cfg.color}
      bg={cfg.bg}
    />
  );
}

/** Box — conteneur avec bordure */
export function Box({ children, style = {}, onClick, className = "" }) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background: C.darkCard,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** SectionTitle — titre de section */
export function SectionTitle({ children, icon, style = {} }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
        fontSize: 13,
        fontWeight: 700,
        color: C.cyan,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        ...style,
      }}
    >
      {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      {children}
    </div>
  );
}

/** Tooltip wrapper simple */
export function SimpleTooltip({ children, text, style = {} }) {
  if (!text) return children;
  return (
    <div style={{ position: "relative", display: "inline-flex", ...style }} title={text}>
      {children}
    </div>
  );
}
