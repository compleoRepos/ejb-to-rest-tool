/**
 * AnalyzePage — Affiche la progression de l'analyse puis le rapport.
 * Utilise SSE + polling fallback toutes les 3s pour détecter la fin.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { PipelineStepper } from "@/components/PipelineStepper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, CheckCircle2, AlertTriangle, FileCode2, Database,
  Server, ArrowRight, BarChart3
} from "lucide-react";

interface AnalysisEvent {
  type: string;
  message: string;
  timestamp: number;
  phase?: string;
  data?: any;
}

interface AnalysisReport {
  projectName: string;
  totalFiles: number;
  javaFiles: number;
  technologies: string[];
  useCases: Array<{ className: string; type: string; tables?: string[] }>;
  complexity: { score: number; level: string };
  aiInsights?: {
    projectSummary?: string;
    riskAssessment?: Array<{ risk: string; severity: string }>;
    migrationStrategy?: string;
  };
}

export default function AnalyzePage() {
  const params = useParams<{ sessionId: string }>();
  const [, navigate] = useLocation();
  const sessionId = params.sessionId;
  const [events, setEvents] = useState<AnalysisEvent[]>([]);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [phase, setPhase] = useState("INITIALIZING");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const sseConnectedRef = useRef(false);

  const fetchAnalysisReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/${sessionId}/dynamic-options`);
      if (res.ok) {
        const data = await res.json();
        setReport({
          projectName: data.projectName || "Projet",
          totalFiles: data.totalFiles || 0,
          javaFiles: data.javaFiles || 0,
          technologies: data.technologies || [],
          useCases: data.useCases || [],
          complexity: data.complexity || { score: 0, level: "unknown" },
          aiInsights: data.aiInsights,
        });
      }
    } catch { /* ignore */ }
  }, [sessionId]);

  const markDone = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    fetchAnalysisReport();
  }, [fetchAnalysisReport]);

  // Polling fallback — vérifie le statut toutes les 3s
  useEffect(() => {
    if (!sessionId || doneRef.current) return;

    const poll = async () => {
      if (doneRef.current) return;
      try {
        const res = await fetch(`/api/agent/${sessionId}/status`);
        if (res.ok) {
          const status = await res.json();
          // Detect analysis done states
          if (
            status.state === "AWAITING_INPUT" ||
            status.state === "WAITING_CHOICES" ||
            status.phase === "AWAITING_INPUT" ||
            status.currentPhase === "AWAITING_INPUT" ||
            // Also detect if generation already started (user came back to this page)
            status.state === "RUNNING" && (
              status.phase === "GENERATING" ||
              status.phase === "MIGRATING_BUSINESS_LOGIC" ||
              status.phase === "COMPILING" ||
              status.phase === "PUSHING"
            ) ||
            status.state === "COMPLETED"
          ) {
            markDone();
          }
          if (status.state === "FAILED") {
            setError("L'analyse a échoué");
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
  }, [sessionId, markDone]);

  // SSE for real-time events display — single connection, no reconnect loop
  useEffect(() => {
    if (!sessionId || sseConnectedRef.current) return;
    sseConnectedRef.current = true;
    const es = new EventSource(`/api/agent/${sessionId}/events`);

    es.onmessage = (e) => {
      try {
        const event: AnalysisEvent = JSON.parse(e.data);
        // Deduplicate events
        const key = `${event.timestamp}-${event.type}-${event.message}`;
        if (seenEventsRef.current.has(key)) return;
        seenEventsRef.current.add(key);
        setEvents((prev) => [...prev, event]);

        if (event.phase) setPhase(event.phase);

        // Check for analysis completion
        if (
          event.type === "AWAITING_INPUT" ||
          event.type === "ANALYSIS_COMPLETE" ||
          (event.type === "PHASE_CHANGE" && event.phase === "WAITING_CHOICES") ||
          (event.phase === "AWAITING_INPUT")
        ) {
          es.close();
          markDone();
        }

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

    return () => {
      es.close();
      sseConnectedRef.current = false;
    };
  }, [sessionId, markDone]);

  const handleContinue = () => {
    navigate(`/compleo/agent/${sessionId}/configure`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <PipelineStepper currentStep="analyze" />

      <div className="max-w-4xl mx-auto px-4 pt-8 pb-16">
        {/* Progress section */}
        {!done && !error && (
          <Card className="p-6 bg-zinc-900/50 border-zinc-700 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
              <h2 className="text-lg font-semibold text-zinc-100">Analyse en cours...</h2>
              <Badge variant="outline" className="text-teal-400 border-teal-600">
                {phase}
              </Badge>
            </div>
            <ScrollArea className="h-48 rounded border border-zinc-800 bg-zinc-950 p-3">
              <div className="space-y-1 font-mono text-xs">
                {events.map((evt, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-zinc-600 shrink-0">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={
                      evt.type === "FAILURE" ? "text-red-400" :
                      evt.type === "PHASE_CHANGE" ? "text-teal-400" :
                      "text-zinc-400"
                    }>
                      {evt.message}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="p-6 bg-red-500/10 border-red-500/30 mb-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <div>
                <h3 className="font-semibold text-red-300">Erreur d'analyse</h3>
                <p className="text-sm text-red-400 mt-1">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Analysis Report */}
        {done && report && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-teal-400 mx-auto mb-2" />
              <h2 className="text-2xl font-bold text-zinc-100">Analyse terminée</h2>
              <p className="text-zinc-400 mt-1">{report.projectName}</p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4 bg-zinc-900/50 border-zinc-700 text-center">
                <FileCode2 className="w-6 h-6 mx-auto text-blue-400 mb-1" />
                <p className="text-2xl font-bold text-zinc-100">{report.javaFiles}</p>
                <p className="text-xs text-zinc-500">Fichiers Java</p>
              </Card>
              <Card className="p-4 bg-zinc-900/50 border-zinc-700 text-center">
                <Database className="w-6 h-6 mx-auto text-purple-400 mb-1" />
                <p className="text-2xl font-bold text-zinc-100">{report.useCases.length}</p>
                <p className="text-xs text-zinc-500">Use Cases</p>
              </Card>
              <Card className="p-4 bg-zinc-900/50 border-zinc-700 text-center">
                <Server className="w-6 h-6 mx-auto text-amber-400 mb-1" />
                <p className="text-2xl font-bold text-zinc-100">{report.technologies.length}</p>
                <p className="text-xs text-zinc-500">Technologies</p>
              </Card>
              <Card className="p-4 bg-zinc-900/50 border-zinc-700 text-center">
                <BarChart3 className="w-6 h-6 mx-auto text-teal-400 mb-1" />
                <p className="text-2xl font-bold text-zinc-100">{report.complexity.score}/100</p>
                <p className="text-xs text-zinc-500">Complexité</p>
              </Card>
            </div>

            {/* Technologies */}
            {report.technologies.length > 0 && (
              <Card className="p-5 bg-zinc-900/50 border-zinc-700">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">Technologies détectées</h3>
                <div className="flex flex-wrap gap-2">
                  {report.technologies.map((tech) => (
                    <Badge key={tech} variant="secondary" className="bg-zinc-800 text-zinc-300">
                      {tech}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}

            {/* Use Cases */}
            {report.useCases.length > 0 && (
              <Card className="p-5 bg-zinc-900/50 border-zinc-700">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                  Use Cases identifiés ({report.useCases.length})
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {report.useCases.slice(0, 15).map((uc, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-zinc-800 last:border-0">
                      <span className="text-sm text-zinc-300 font-mono">{uc.className}</span>
                      <Badge variant="outline" className="text-xs">{uc.type}</Badge>
                    </div>
                  ))}
                  {report.useCases.length > 15 && (
                    <p className="text-xs text-zinc-500 pt-1">
                      + {report.useCases.length - 15} autres...
                    </p>
                  )}
                </div>
              </Card>
            )}

            {/* AI Insights */}
            {report.aiInsights?.projectSummary && (
              <Card className="p-5 bg-zinc-900/50 border-zinc-700">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">Résumé IA</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {report.aiInsights.projectSummary}
                </p>
                {report.aiInsights.migrationStrategy && (
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <p className="text-xs font-medium text-teal-400 mb-1">Stratégie recommandée</p>
                    <p className="text-sm text-zinc-400">{report.aiInsights.migrationStrategy}</p>
                  </div>
                )}
              </Card>
            )}

            {/* Continue button */}
            <div className="text-center pt-4">
              <Button
                size="lg"
                onClick={handleContinue}
                className="gap-2 bg-teal-600 hover:bg-teal-500 text-white px-8"
              >
                Configurer la migration
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Done but no report yet — show continue button anyway */}
        {done && !report && (
          <div className="text-center pt-8">
            <CheckCircle2 className="w-10 h-10 text-teal-400 mx-auto mb-2" />
            <h2 className="text-2xl font-bold text-zinc-100 mb-4">Analyse terminée</h2>
            <Button
              size="lg"
              onClick={handleContinue}
              className="gap-2 bg-teal-600 hover:bg-teal-500 text-white px-8"
            >
              Configurer la migration
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
