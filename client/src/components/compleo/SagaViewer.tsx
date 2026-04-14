/**
 * SagaViewer — Visualiseur de Sagas détectées (v7.9).
 *
 * Affiche les sagas détectées par l'agent avec :
 *   - Résumé des candidats (cards)
 *   - Diagramme de flux SVG interactif
 *   - Tableau détaillé des steps et compensations
 *   - Rapport Markdown téléchargeable
 *
 * @author Hamza NORDINE
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Streamdown } from "streamdown";
import {
  Loader2, AlertTriangle, Download, Layers, ArrowRight,
  Shield, Zap, RotateCcw, CheckCircle2, XCircle,
  GitBranch, FileCode2, Maximize2, Minimize2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SagaCandidate {
  className: string;
  domain: string;
  stepsCount: number;
  compensableCount: number;
}

interface SagaStepDetail {
  order: number;
  name: string;
  type: string;
  compensable: boolean;
}

interface SagaDetail {
  domain: string;
  sourceClass: string;
  steps: SagaStepDetail[];
}

interface SagaData {
  detected: boolean;
  candidates: SagaCandidate[];
  filesGenerated: number;
  report: string | null;
  details: SagaDetail[];
}

interface SagaViewerProps {
  sessionId: string;
  compact?: boolean;
}

// ─── Step type colors ───────────────────────────────────────────────────────

const STEP_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  SERVICE_CALL: {
    bg: "oklch(0.25 0.04 250)",
    border: "oklch(0.45 0.12 250)",
    text: "oklch(0.85 0.06 250)",
    badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  DB_WRITE: {
    bg: "oklch(0.25 0.04 160)",
    border: "oklch(0.45 0.12 160)",
    text: "oklch(0.85 0.06 160)",
    badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  VALIDATION: {
    bg: "oklch(0.25 0.04 80)",
    border: "oklch(0.45 0.12 80)",
    text: "oklch(0.85 0.06 80)",
    badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  TRANSFORMATION: {
    bg: "oklch(0.25 0.04 310)",
    border: "oklch(0.45 0.12 310)",
    text: "oklch(0.85 0.06 310)",
    badge: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  EXTERNAL_CALL: {
    bg: "oklch(0.25 0.04 30)",
    border: "oklch(0.45 0.12 30)",
    text: "oklch(0.85 0.06 30)",
    badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
};

const DEFAULT_STEP_COLOR = {
  bg: "oklch(0.22 0.01 250)",
  border: "oklch(0.35 0.02 250)",
  text: "oklch(0.80 0.01 250)",
  badge: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

function getStepColor(type: string) {
  return STEP_COLORS[type] || DEFAULT_STEP_COLOR;
}

// ─── SVG Flow Diagram ───────────────────────────────────────────────────────

function SagaFlowDiagram({ steps, domain }: { steps: SagaStepDetail[]; domain: string }) {
  const nodeWidth = 200;
  const nodeHeight = 56;
  const gapX = 40;
  const gapY = 80;
  const cols = Math.min(steps.length, 4);
  const rows = Math.ceil(steps.length / cols);
  const svgWidth = cols * (nodeWidth + gapX) + 60;
  const svgHeight = rows * (nodeHeight + gapY) + 80;

  const getPos = (index: number) => {
    const row = Math.floor(index / cols);
    const isReverse = row % 2 === 1;
    const colInRow = index % cols;
    const col = isReverse ? (cols - 1 - colInRow) : colInRow;
    const x = 30 + col * (nodeWidth + gapX);
    const y = 30 + row * (nodeHeight + gapY);
    return { x, y, row, col };
  };

  return (
    <div className="overflow-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="min-w-full"
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="oklch(0.55 0.08 250)" />
          </marker>
          <marker id="arrowhead-comp" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="oklch(0.55 0.12 30)" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Title */}
        <text x={svgWidth / 2} y={16} textAnchor="middle" fill="oklch(0.70 0.06 250)" fontSize="13" fontWeight="600" fontFamily="monospace">
          {domain}
        </text>

        {/* Connections */}
        {steps.map((_, i) => {
          if (i === steps.length - 1) return null;
          const from = getPos(i);
          const to = getPos(i + 1);
          const fromCx = from.x + nodeWidth / 2;
          const fromCy = from.y + nodeHeight / 2;
          const toCx = to.x + nodeWidth / 2;
          const toCy = to.y + nodeHeight / 2;

          if (from.row === to.row) {
            // Horizontal connection
            const isReverse = from.row % 2 === 1;
            const startX = isReverse ? from.x : from.x + nodeWidth;
            const endX = isReverse ? to.x + nodeWidth : to.x;
            return (
              <line
                key={`conn-${i}`}
                x1={startX}
                y1={fromCy}
                x2={endX}
                y2={toCy}
                stroke="oklch(0.45 0.06 250)"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
                strokeDasharray="none"
              />
            );
          } else {
            // Vertical connection (row change)
            const midY = from.y + nodeHeight + (gapY - nodeHeight) / 2 + nodeHeight / 2 - 10;
            return (
              <g key={`conn-${i}`}>
                <line
                  x1={fromCx}
                  y1={from.y + nodeHeight}
                  x2={fromCx}
                  y2={midY}
                  stroke="oklch(0.45 0.06 250)"
                  strokeWidth="2"
                />
                <line
                  x1={fromCx}
                  y1={midY}
                  x2={toCx}
                  y2={midY}
                  stroke="oklch(0.45 0.06 250)"
                  strokeWidth="2"
                />
                <line
                  x1={toCx}
                  y1={midY}
                  x2={toCx}
                  y2={to.y}
                  stroke="oklch(0.45 0.06 250)"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead)"
                />
              </g>
            );
          }
        })}

        {/* Nodes */}
        {steps.map((step, i) => {
          const pos = getPos(i);
          const color = getStepColor(step.type);
          return (
            <g key={`node-${i}`}>
              <rect
                x={pos.x}
                y={pos.y}
                width={nodeWidth}
                height={nodeHeight}
                rx={8}
                ry={8}
                fill={color.bg}
                stroke={color.border}
                strokeWidth="1.5"
                filter={step.compensable ? "url(#glow)" : undefined}
              />
              {/* Step number */}
              <circle
                cx={pos.x + 16}
                cy={pos.y + 16}
                r={10}
                fill={color.border}
                opacity={0.6}
              />
              <text
                x={pos.x + 16}
                y={pos.y + 20}
                textAnchor="middle"
                fill="white"
                fontSize="10"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {step.order}
              </text>
              {/* Step name */}
              <text
                x={pos.x + 32}
                y={pos.y + 20}
                fill={color.text}
                fontSize="11"
                fontWeight="600"
                fontFamily="monospace"
              >
                {step.name.length > 18 ? step.name.slice(0, 18) + "..." : step.name}
              </text>
              {/* Step type */}
              <text
                x={pos.x + 10}
                y={pos.y + 42}
                fill="oklch(0.60 0.03 250)"
                fontSize="9"
                fontFamily="monospace"
              >
                {step.type}
              </text>
              {/* Compensable badge */}
              {step.compensable && (
                <g>
                  <rect
                    x={pos.x + nodeWidth - 55}
                    y={pos.y + 34}
                    width={45}
                    height={16}
                    rx={4}
                    fill="oklch(0.30 0.08 30)"
                    stroke="oklch(0.50 0.12 30)"
                    strokeWidth="0.5"
                  />
                  <text
                    x={pos.x + nodeWidth - 32}
                    y={pos.y + 45}
                    textAnchor="middle"
                    fill="oklch(0.80 0.12 30)"
                    fontSize="8"
                    fontWeight="600"
                    fontFamily="monospace"
                  >
                    COMP
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SagaViewer({ sessionId, compact = false }: SagaViewerProps) {
  const [data, setData] = useState<SagaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSaga, setActiveSaga] = useState<string>("");
  const [activeView, setActiveView] = useState<"flow" | "table" | "report">("flow");
  const [expanded, setExpanded] = useState(false);

  // Fetch saga data
  useEffect(() => {
    if (!sessionId) return;

    const fetchSagas = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/agent/${sessionId}/sagas`);
        if (!res.ok) throw new Error("Impossible de charger les données Saga");
        const json: SagaData = await res.json();
        setData(json);
        if (json.details.length > 0) {
          setActiveSaga(json.details[0].domain);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    };

    fetchSagas();
  }, [sessionId]);

  // Active saga detail
  const currentSaga = useMemo(() => {
    if (!data?.details) return null;
    return data.details.find((d) => d.domain === activeSaga) || null;
  }, [data, activeSaga]);

  // Download report
  const handleDownloadReport = useCallback(() => {
    if (!data?.report) return;
    const blob = new Blob([data.report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "SAGA_ORCHESTRATION_REPORT.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  // ─── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Chargement des données Saga...</span>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-red-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  // ─── No sagas detected ─────────────────────────────────────────────────

  if (!data?.detected || data.candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Layers className="w-8 h-8 opacity-50" />
        <p className="text-sm">Aucune Saga détectée pour cette session.</p>
        <p className="text-xs opacity-60">Activez l'option "Saga Orchestration" lors du lancement de l'agent.</p>
      </div>
    );
  }

  // ─── Stats ──────────────────────────────────────────────────────────────

  const totalSteps = data.candidates.reduce((sum, c) => sum + c.stepsCount, 0);
  const totalCompensable = data.candidates.reduce((sum, c) => sum + c.compensableCount, 0);

  const containerHeight = compact ? "h-[400px]" : expanded ? "h-[calc(100vh-200px)]" : "h-[600px]";

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={`border border-border/50 rounded-lg bg-card/30 overflow-hidden ${expanded ? "fixed inset-4 z-50 bg-background" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/50">
        <div className="flex items-center gap-3">
          <GitBranch className="w-4 h-4 text-pink-400" />
          <span className="text-sm font-semibold">Saga Orchestration</span>
          <Badge variant="secondary" className="text-xs bg-pink-500/10 text-pink-400 border-pink-500/20">
            {data.candidates.length} saga{data.candidates.length > 1 ? "s" : ""}
          </Badge>
          <Badge variant="outline" className="text-xs gap-1">
            <Layers className="w-3 h-3" />
            {totalSteps} steps
          </Badge>
          <Badge variant="outline" className="text-xs gap-1">
            <RotateCcw className="w-3 h-3" />
            {totalCompensable} compensables
          </Badge>
          <Badge variant="outline" className="text-xs gap-1">
            <FileCode2 className="w-3 h-3" />
            {data.filesGenerated} fichiers
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {data.report && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownloadReport}
              className="gap-1.5 text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Rapport
            </Button>
          )}
          {!compact && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Saga selector + view tabs */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20 bg-card/20 flex-wrap">
        {/* Saga selector */}
        <div className="flex items-center gap-1 mr-3">
          {data.details.map((detail) => {
            const candidate = data.candidates.find((c) => c.domain === detail.domain);
            return (
              <button
                key={detail.domain}
                onClick={() => setActiveSaga(detail.domain)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeSaga === detail.domain
                    ? "bg-pink-500/15 text-pink-400 border border-pink-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                }`}
              >
                <Layers className="w-3 h-3" />
                {detail.domain}
                {candidate && (
                  <span className="text-[10px] opacity-70">
                    ({candidate.stepsCount})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-border" />

        {/* View tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveView("flow")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeView === "flow"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            Diagramme
          </button>
          <button
            onClick={() => setActiveView("table")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeView === "table"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            Détails
          </button>
          {data.report && (
            <button
              onClick={() => setActiveView("report")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeView === "report"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              Rapport
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className={containerHeight}>
        {/* Flow diagram view */}
        {activeView === "flow" && currentSaga && (
          <div className="p-4">
            <div className="mb-4 flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-mono">
                Source: {currentSaga.sourceClass}
              </span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {currentSaga.steps.length} steps
              </span>
            </div>
            <SagaFlowDiagram steps={currentSaga.steps} domain={currentSaga.domain} />

            {/* Legend */}
            <div className="mt-4 flex items-center gap-4 flex-wrap border-t border-border/20 pt-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Légende :</span>
              {Object.entries(STEP_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: color.border }}
                  />
                  <span className="text-[10px] text-muted-foreground font-mono">{type}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm border" style={{ borderColor: "oklch(0.50 0.12 30)", backgroundColor: "oklch(0.30 0.08 30)" }} />
                <span className="text-[10px] text-muted-foreground font-mono">COMPENSABLE</span>
              </div>
            </div>
          </div>
        )}

        {/* Table view */}
        {activeView === "table" && currentSaga && (
          <div className="p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-mono">
                {currentSaga.domain} — {currentSaga.sourceClass}
              </span>
            </div>
            <div className="border border-border/30 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-card/60 border-b border-border/30">
                    <th className="text-left px-3 py-2.5 text-muted-foreground font-semibold w-12">#</th>
                    <th className="text-left px-3 py-2.5 text-muted-foreground font-semibold">Step</th>
                    <th className="text-left px-3 py-2.5 text-muted-foreground font-semibold">Type</th>
                    <th className="text-center px-3 py-2.5 text-muted-foreground font-semibold">Compensable</th>
                  </tr>
                </thead>
                <tbody>
                  {currentSaga.steps.map((step, i) => {
                    const color = getStepColor(step.type);
                    return (
                      <tr
                        key={i}
                        className={`border-b border-border/10 transition-colors hover:bg-muted/20 ${
                          step.compensable ? "bg-orange-500/5" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5 font-mono text-muted-foreground">{step.order}</td>
                        <td className="px-3 py-2.5 font-mono font-medium">{step.name}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={`text-[10px] ${color.badge}`}>
                            {step.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {step.compensable ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <RotateCcw className="w-3.5 h-3.5 text-orange-400 mx-auto" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <span className="text-xs">Ce step dispose d'une action de compensation</span>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-muted-foreground/30 mx-auto" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="border border-border/30 rounded-lg p-3 bg-card/30">
                <div className="text-lg font-bold text-foreground">{currentSaga.steps.length}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Steps</div>
              </div>
              <div className="border border-border/30 rounded-lg p-3 bg-card/30">
                <div className="text-lg font-bold text-orange-400">
                  {currentSaga.steps.filter((s) => s.compensable).length}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Compensables</div>
              </div>
              <div className="border border-border/30 rounded-lg p-3 bg-card/30">
                <div className="text-lg font-bold text-blue-400">
                  {currentSaga.steps.filter((s) => s.type === "SERVICE_CALL").length}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Service Calls</div>
              </div>
              <div className="border border-border/30 rounded-lg p-3 bg-card/30">
                <div className="text-lg font-bold text-emerald-400">
                  {currentSaga.steps.filter((s) => s.type === "DB_WRITE").length}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">DB Writes</div>
              </div>
            </div>
          </div>
        )}

        {/* Report view */}
        {activeView === "report" && data.report && (
          <div className="p-6 prose prose-invert prose-sm max-w-none">
            <Streamdown>{data.report}</Streamdown>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
