/**
 * AnalysisProgress — Composant de progression en temps réel.
 *
 * Affiche la barre de progression, les statistiques live,
 * et le log de fichiers traités pendant l'analyse parallèle.
 *
 * @author Hamza NORDINE
 */

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Cpu, Clock, Zap, FileCode2, AlertTriangle, CheckCircle2,
  Layers, Activity, XCircle, Loader2, BarChart3, Timer,
} from "lucide-react";
import type { PoolProgress, LogEntry } from "@/lib/worker-pool";

// ============================================================
// Types
// ============================================================

interface AnalysisProgressProps {
  progress: PoolProgress;
  onAbort?: () => void;
  compact?: boolean;
}

// ============================================================
// Helpers
// ============================================================

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `~${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `~${minutes}m ${secs}s`;
}

function getPhaseLabel(phase: PoolProgress["phase"]): string {
  switch (phase) {
    case "initializing": return "Initialisation des workers...";
    case "analyzing": return "Analyse en cours...";
    case "aggregating": return "Agrégation des résultats...";
    case "complete": return "Analyse terminée";
    case "error": return "Erreur lors de l'analyse";
    default: return "En attente...";
  }
}

function getPhaseColor(phase: PoolProgress["phase"]): string {
  switch (phase) {
    case "analyzing": return "text-emerald-400";
    case "complete": return "text-emerald-400";
    case "error": return "text-red-400";
    default: return "text-zinc-400";
  }
}

function getLogStatusIcon(status: LogEntry["status"]) {
  switch (status) {
    case "analyzing": return <Loader2 className="w-3 h-3 animate-spin text-blue-400" />;
    case "done": return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
    case "error": return <XCircle className="w-3 h-3 text-red-400" />;
  }
}

// ============================================================
// Main Component
// ============================================================

export default function AnalysisProgress({ progress, onAbort, compact = false }: AnalysisProgressProps) {
  const techArray = useMemo(() => Array.from(progress.technologiesFound), [progress.technologiesFound]);

  const isActive = progress.phase === "analyzing" || progress.phase === "initializing";
  const isDone = progress.phase === "complete";
  const hasErrors = progress.errors.length > 0;

  if (compact) {
    return (
      <CompactProgress
        progress={progress}
        techArray={techArray}
        isActive={isActive}
        isDone={isDone}
        onAbort={onAbort}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="rounded-lg border border-zinc-700/50 bg-zinc-900/80 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          {isActive ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          ) : isDone ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : hasErrors ? (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          ) : (
            <Activity className="w-4 h-4 text-zinc-400" />
          )}
          <span className={`text-sm font-medium ${getPhaseColor(progress.phase)}`}>
            {getPhaseLabel(progress.phase)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isActive && (
            <span className="text-xs text-zinc-500">
              {progress.completedFiles}/{progress.totalFiles} fichiers
            </span>
          )}
          {isActive && onAbort && (
            <button
              onClick={onAbort}
              className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded border border-red-500/20 hover:border-red-500/40"
            >
              Annuler
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1">
            <Progress value={progress.percent} className="h-2.5" />
          </div>
          <span className="text-sm font-mono text-emerald-400 min-w-[48px] text-right">
            {progress.percent}%
          </span>
        </div>

        {/* Current file */}
        {progress.currentFile && isActive && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <FileCode2 className="w-3 h-3" />
            <span className="truncate max-w-[300px]">{progress.currentFile}</span>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-700/30">
        <StatCard
          icon={<Cpu className="w-3.5 h-3.5 text-blue-400" />}
          label="Workers"
          value={`${progress.activeWorkers}/${progress.totalWorkers}`}
        />
        <StatCard
          icon={<Zap className="w-3.5 h-3.5 text-yellow-400" />}
          label="Vitesse"
          value={`${progress.filesPerSecond} f/s`}
        />
        <StatCard
          icon={<Clock className="w-3.5 h-3.5 text-purple-400" />}
          label="Temps"
          value={formatTime(progress.elapsedMs)}
        />
        <StatCard
          icon={<Timer className="w-3.5 h-3.5 text-cyan-400" />}
          label="ETA"
          value={formatEta(progress.etaSeconds)}
        />
      </div>

      {/* Live stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-700/30 border-t border-zinc-700/30">
        <StatCard
          icon={<BarChart3 className="w-3.5 h-3.5 text-emerald-400" />}
          label="Lignes"
          value={progress.totalLines.toLocaleString()}
        />
        <StatCard
          icon={<Layers className="w-3.5 h-3.5 text-orange-400" />}
          label="Méthodes"
          value={progress.totalMethods.toLocaleString()}
        />
        <StatCard
          icon={<AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
          label="Issues"
          value={progress.totalIssues.toLocaleString()}
        />
        <StatCard
          icon={<Activity className="w-3.5 h-3.5 text-teal-400" />}
          label="Technologies"
          value={String(techArray.length)}
        />
      </div>

      {/* Technologies badges */}
      {techArray.length > 0 && (
        <div className="px-4 py-2 border-t border-zinc-700/30">
          <div className="flex flex-wrap gap-1.5">
            {techArray.map((tech) => (
              <Badge
                key={tech}
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
              >
                {tech}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Log stream */}
      {progress.recentLogs.length > 0 && (
        <div className="border-t border-zinc-700/30">
          <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-zinc-500">
            <FileCode2 className="w-3 h-3" />
            <span>Journal d'analyse</span>
          </div>
          <ScrollArea className="h-[120px]">
            <div className="px-4 pb-2 space-y-0.5">
              {progress.recentLogs.slice(-20).map((log, idx) => (
                <div key={idx} className="flex items-center gap-2 text-[11px] font-mono">
                  {getLogStatusIcon(log.status)}
                  <span className="text-zinc-500 min-w-[60px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-zinc-300 truncate max-w-[200px]">{log.fileName}</span>
                  {log.processingTimeMs !== undefined && (
                    <span className="text-zinc-600 ml-auto">{Math.round(log.processingTimeMs)}ms</span>
                  )}
                  {log.technologies && log.technologies.length > 0 && (
                    <span className="text-emerald-500/60 text-[10px]">
                      [{log.technologies.join(", ")}]
                    </span>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Errors */}
      {hasErrors && (
        <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-red-400 mb-1">
            <XCircle className="w-3 h-3" />
            <span>{progress.errors.length} erreur(s)</span>
          </div>
          {progress.errors.slice(-5).map((err, idx) => (
            <div key={idx} className="text-[11px] text-red-300/70 font-mono truncate">
              {err.fileName}: {err.error}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50">
      {icon}
      <div className="flex flex-col">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
        <span className="text-xs font-mono text-zinc-200">{value}</span>
      </div>
    </div>
  );
}

function CompactProgress({
  progress,
  techArray,
  isActive,
  isDone,
  onAbort,
}: {
  progress: PoolProgress;
  techArray: string[];
  isActive: boolean;
  isDone: boolean;
  onAbort?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-md border border-zinc-700/50 bg-zinc-900/60 px-3 py-2"
    >
      <div className="flex items-center gap-2 mb-1.5">
        {isActive ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
        ) : isDone ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
        )}
        <span className="text-xs text-zinc-300">
          {progress.completedFiles}/{progress.totalFiles} fichiers
        </span>
        <span className="text-xs font-mono text-emerald-400 ml-auto">{progress.percent}%</span>
        {isActive && onAbort && (
          <button onClick={onAbort} className="text-[10px] text-red-400 hover:text-red-300 ml-1">
            ✕
          </button>
        )}
      </div>
      <Progress value={progress.percent} className="h-1.5 mb-1" />
      <div className="flex items-center gap-3 text-[10px] text-zinc-500">
        <span>{progress.filesPerSecond} f/s</span>
        <span>{formatTime(progress.elapsedMs)}</span>
        {progress.activeWorkers > 0 && <span>{progress.activeWorkers} workers</span>}
        {techArray.length > 0 && <span>{techArray.length} techs</span>}
        {progress.totalIssues > 0 && <span className="text-red-400/60">{progress.totalIssues} issues</span>}
      </div>
    </motion.div>
  );
}

// ============================================================
// Analysis Summary component (shown after completion)
// ============================================================

export function AnalysisSummary({ stats }: { stats: {
  totalFiles: number;
  totalLines: number;
  totalMethods: number;
  totalIssues: number;
  totalDetections: number;
  technologiesDetected: string[];
  averageComplexity: number;
  totalTimeMs: number;
  filesPerSecond: number;
  workersUsed: number;
} }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-medium text-emerald-400">Analyse parallèle terminée</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
        <SummaryItem label="Fichiers" value={stats.totalFiles.toLocaleString()} />
        <SummaryItem label="Lignes" value={stats.totalLines.toLocaleString()} />
        <SummaryItem label="Méthodes" value={stats.totalMethods.toLocaleString()} />
        <SummaryItem label="Issues" value={stats.totalIssues.toLocaleString()} color="text-red-400" />
        <SummaryItem label="Détections" value={stats.totalDetections.toLocaleString()} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <SummaryItem label="Temps total" value={formatTime(stats.totalTimeMs)} />
        <SummaryItem label="Vitesse" value={`${stats.filesPerSecond} f/s`} />
        <SummaryItem label="Workers" value={String(stats.workersUsed)} />
        <SummaryItem label="Complexité moy." value={`${stats.averageComplexity}/100`} />
      </div>

      {stats.technologiesDetected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stats.technologiesDetected.map((tech) => (
            <Badge
              key={tech}
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
            >
              {tech}
            </Badge>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-mono ${color || "text-zinc-200"}`}>{value}</span>
    </div>
  );
}
