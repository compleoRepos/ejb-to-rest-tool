/**
 * GeneratePage — Affiche la progression de la génération en temps réel.
 * Utilise SSE + polling fallback toutes les 3s pour détecter la fin.
 * Navigation auto vers /result quand COMPLETED.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { PipelineStepper } from "@/components/PipelineStepper";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, CheckCircle2, AlertTriangle, Zap, Code2, Hammer,
  FileCode2, RefreshCw, Package, Shield, BarChart3, ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineEvent {
  type: string;
  message: string;
  timestamp: number;
  phase?: string;
  data?: any;
  level?: string;
}

interface PhaseInfo {
  id: string;
  label: string;
  icon: React.ElementType;
  status: "pending" | "active" | "completed" | "failed";
  startTime?: number;
  endTime?: number;
  events: PipelineEvent[];
}

const PHASE_META: Record<string, { label: string; icon: React.ElementType }> = {
  GENERATING: { label: "Génération du code", icon: Code2 },
  GENERATING_SERVICES: { label: "Génération des services", icon: FileCode2 },
  GENERATING_FRONTEND: { label: "Génération du frontend", icon: Zap },
  COMPILING: { label: "Compilation", icon: Hammer },
  SELF_HEALING: { label: "Auto-correction (LLM)", icon: RefreshCw },
  PACKAGING: { label: "Packaging", icon: Package },
  RE_SCORING: { label: "Calcul du score", icon: BarChart3 },
  MIGRATING_BUSINESS_LOGIC: { label: "Migration logique métier", icon: Code2 },
  SOC2_COMPLIANCE: { label: "Conformité SOC 2", icon: Shield },
  GENERATION_COMPLETE: { label: "Terminé", icon: CheckCircle2 },
  PUSHING: { label: "Push des artefacts", icon: Package },
};

export default function GeneratePage() {
  const params = useParams<{ sessionId: string }>();
  const [, navigate] = useLocation();
  const sessionId = params.sessionId;

  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [phases, setPhases] = useState<PhaseInfo[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>("GENERATING");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compileIteration, setCompileIteration] = useState<{
    iteration: number;
    max: number;
    fixed: number;
    remaining: number;
  } | null>(null);
  const doneRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const goToResult = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setTimeout(() => {
      navigate(`/compleo/agent/${sessionId}/result`);
    }, 1500);
  }, [navigate, sessionId]);

  // Polling fallback — vérifie le statut toutes les 3s
  useEffect(() => {
    if (!sessionId || doneRef.current) return;

    const poll = async () => {
      if (doneRef.current) return;
      try {
        const res = await fetch(`/api/agent/${sessionId}/status`);
        if (res.ok) {
          const status = await res.json();
          if (
            status.state === "COMPLETED" ||
            status.phase === "DONE" ||
            status.phase === "GENERATION_COMPLETE"
          ) {
            goToResult();
          }
          // Update current phase from polling
          if (status.phase && status.phase !== "DONE") {
            setCurrentPhase(status.phase);
          }
          if (status.state === "FAILED") {
            setError(status.errorMessage || "La génération a échoué");
          }
        }
      } catch { /* ignore */ }
    };

    // First poll immediately
    poll();
    // Then every 3 seconds
    pollingRef.current = setInterval(poll, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [sessionId, goToResult]);

  // SSE for real-time events display
  useEffect(() => {
    if (!sessionId) return;

    const es = new EventSource(`/api/agent/${sessionId}/events`);

    es.onmessage = (e) => {
      try {
        const event: PipelineEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev, event]);

        // Track phases
        if (event.type === "PHASE_START" || event.type === "PHASE_CHANGE") {
          const phaseId = event.phase || event.data?.phase;
          if (phaseId) {
            setCurrentPhase(phaseId);
            setPhases((prev) => {
              const updated = prev.map((p) =>
                p.status === "active"
                  ? { ...p, status: "completed" as const, endTime: event.timestamp }
                  : p
              );
              const exists = updated.find((p) => p.id === phaseId);
              if (!exists && phaseId !== "GENERATION_COMPLETE" && phaseId !== "DONE") {
                const meta = PHASE_META[phaseId] || { label: phaseId, icon: Zap };
                updated.push({
                  id: phaseId,
                  label: meta.label,
                  icon: meta.icon,
                  status: "active",
                  startTime: event.timestamp,
                  events: [event],
                });
              }
              return updated;
            });
          }
        }

        // Track compile iterations
        if (event.type === "COMPILE_ITERATION" || event.data?.iteration) {
          const data = event.data || {};
          setCompileIteration({
            iteration: data.iteration || 0,
            max: data.max || 3,
            fixed: data.fixed || 0,
            remaining: data.remaining || 0,
          });
        }

        // Generation complete
        if (
          event.type === "SUCCESS" ||
          event.type === "GENERATION_COMPLETE" ||
          (event.type === "PHASE_CHANGE" && event.phase === "GENERATION_COMPLETE") ||
          (event.type === "PHASE_START" && event.phase === "DONE") ||
          (event.type === "PHASE_END" && event.phase === "PUSHING")
        ) {
          es.close();
          goToResult();
        }

        // Failure
        if (event.type === "FAILURE") {
          setError(event.message);
          es.close();
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // SSE failed — polling will handle it
      es.close();
    };

    return () => { es.close(); };
  }, [sessionId, goToResult]);

  // Auto-scroll events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const elapsedTime = () => {
    if (phases.length === 0) return "0s";
    const start = phases[0].startTime || Date.now();
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed < 60) return `${elapsed}s`;
    return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  };

  const handleManualNavigate = () => {
    navigate(`/compleo/agent/${sessionId}/result`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <PipelineStepper currentStep="generate" />

      <div className="max-w-4xl mx-auto px-4 pt-6 pb-16">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-zinc-100 mb-1">
            {done ? "Génération terminée" : "Génération en cours..."}
          </h1>
          <p className="text-zinc-400 text-sm">
            {done
              ? "Votre projet modernisé est prêt !"
              : `Pipeline actif — ${elapsedTime()}`
            }
          </p>
        </div>

        {/* Phase progress */}
        <Card className="p-5 bg-zinc-900/50 border-zinc-700 mb-6">
          <div className="space-y-3">
            {phases.map((phase) => {
              const Icon = phase.icon;
              const duration = phase.endTime && phase.startTime
                ? Math.round((phase.endTime - phase.startTime) / 1000)
                : null;
              return (
                <div
                  key={phase.id}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-lg transition-all",
                    phase.status === "active" && "bg-teal-500/5 border border-teal-600/30",
                    phase.status === "completed" && "opacity-70",
                    phase.status === "failed" && "bg-red-500/5 border border-red-600/30"
                  )}
                >
                  {phase.status === "active" ? (
                    <Loader2 className="w-4 h-4 text-teal-400 animate-spin shrink-0" />
                  ) : phase.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                  ) : phase.status === "failed" ? (
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <Icon className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                  <span className={cn(
                    "text-sm font-medium flex-1",
                    phase.status === "active" && "text-teal-300",
                    phase.status === "completed" && "text-zinc-400",
                    phase.status === "failed" && "text-red-300"
                  )}>
                    {phase.label}
                  </span>
                  {duration !== null && (
                    <span className="text-xs text-zinc-500">{duration}s</span>
                  )}
                </div>
              );
            })}
            {phases.length === 0 && !error && (
              <div className="flex items-center gap-3 p-3">
                <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
                <span className="text-sm text-zinc-400">Initialisation du pipeline...</span>
              </div>
            )}
          </div>
        </Card>

        {/* Compile iteration indicator */}
        {compileIteration && currentPhase === "COMPILING" && (
          <Card className="p-4 bg-zinc-900/50 border-zinc-700 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hammer className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-zinc-300">
                  Itération {compileIteration.iteration}/{compileIteration.max}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-zinc-400">
                <span className="text-emerald-400">
                  {compileIteration.fixed} corrigées
                </span>
                <span className="text-amber-400">
                  {compileIteration.remaining} restantes
                </span>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${(compileIteration.iteration / compileIteration.max) * 100}%` }}
              />
            </div>
          </Card>
        )}

        {/* Event log */}
        <Card className="p-4 bg-zinc-900/50 border-zinc-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Journal
            </h3>
            <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-600">
              {events.length} événements
            </Badge>
          </div>
          <ScrollArea className="h-56 rounded border border-zinc-800 bg-zinc-950 p-3">
            <div ref={scrollRef} className="space-y-0.5 font-mono text-[11px]">
              {events.slice(-100).map((evt, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-zinc-600 shrink-0">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={cn(
                    evt.type === "FAILURE" && "text-red-400",
                    evt.type === "PHASE_START" && "text-teal-400",
                    evt.type === "PHASE_CHANGE" && "text-teal-400",
                    evt.level === "warn" && "text-amber-400",
                    evt.level === "error" && "text-red-400",
                    !evt.level && evt.type !== "FAILURE" && evt.type !== "PHASE_START" && evt.type !== "PHASE_CHANGE" && "text-zinc-500"
                  )}>
                    {evt.message}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Error */}
        {error && (
          <Card className="mt-6 p-5 bg-red-500/10 border-red-500/30">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <div>
                <h3 className="font-semibold text-red-300">Erreur de génération</h3>
                <p className="text-sm text-red-400 mt-1">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Done indicator */}
        {done && (
          <div className="mt-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-teal-400 mx-auto mb-2" />
            <p className="text-zinc-300 mb-3">Redirection vers les résultats...</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualNavigate}
              className="gap-2 text-teal-400 border-teal-600"
            >
              Voir les résultats <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Manual navigation button after 60s */}
        {!done && !error && events.length > 5 && (
          <div className="mt-4 text-center">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleManualNavigate}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Aller aux résultats manuellement
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
