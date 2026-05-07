/**
 * Compleo Agent v4.0 — Mode Agent Autonome
 * Timeline SSE temps réel, résolution d'ambiguïtés, download résultat.
 * @author Compleo
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PostMigrationChecklistScreen from "@/components/compleo/PostMigrationChecklistScreen";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Square, Download, GitBranch, Upload, FolderArchive,
  CheckCircle2, AlertTriangle, Loader2, XCircle, Clock,
  Terminal, Zap, Server, Database, Shield, Box,
  ChevronDown, ChevronRight, Eye, FileCode2, Layers,
  ArrowLeft, RefreshCw, Globe, Lock, Info, Star,
  Activity, Radio, Pause, SkipForward, Network,
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import ReportViewer from "@/components/compleo/ReportViewer";
import SagaViewer from "@/components/compleo/SagaViewer";
import AnalysisReviewScreen from "@/components/compleo/AnalysisReviewScreen";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentEvent {
  type: "PHASE_START" | "PHASE_END" | "LOG" | "AUTO_FIX" | "COMPILATION_ATTEMPT" | "AMBIGUITY_DETECTED" | "AWAITING_INPUT" | "SUCCESS" | "FAILURE" | "CANCELLED";
  timestamp: number;
  level?: "info" | "warning" | "error" | "success";
  message?: string;
  phase?: string;
  data?: Record<string, unknown>;
}

interface AmbiguityOption {
  id: string;
  label: string;
  description: string;
}

interface AgentAmbiguity {
  id: string;
  type: string;
  severity: "info" | "warning" | "blocking";
  question: string;
  options: AmbiguityOption[];
  recommendation: string;
  context: {
    className: string;
    methodName?: string;
    packageName?: string;
  };
}

interface AgentStatus {
  state: "IDLE" | "RUNNING" | "AWAITING_INPUT" | "COMPLETED" | "FAILED" | "CANCELLED";
  phase: string;
  progress: number;
  eventCount: number;
  ambiguityCount: number;
  elapsedMs: number;
}

type SourceMode = "zip" | "git";

// ─── Phase metadata ─────────────────────────────────────────────────────────

const PHASES = [
  { id: "CLONING", label: "Clonage", icon: GitBranch, color: "text-blue-400" },
  { id: "ANALYZING", label: "Analyse", icon: Eye, color: "text-cyan-400" },
  { id: "AWAITING_INPUT", label: "Choix", icon: Pause, color: "text-yellow-400" },
  { id: "GENERATING", label: "Génération", icon: FileCode2, color: "text-emerald-400" },
  { id: "FRONTEND_GENERATION", label: "Frontend", icon: Globe, color: "text-blue-400" },
  { id: "MICROSERVICES", label: "Microservices", icon: Layers, color: "text-pink-400" },
  { id: "ENHANCING_REPORTS", label: "Rapports IA", icon: Star, color: "text-amber-400" },
  { id: "COMPILING", label: "Compilation", icon: Terminal, color: "text-purple-400" },
  { id: "PUSHING", label: "Push", icon: Upload, color: "text-orange-400" },
  { id: "COMPLETED", label: "Terminé", icon: CheckCircle2, color: "text-green-400" },
  { id: "FAILED", label: "Échec", icon: XCircle, color: "text-red-400" },
];

function getPhaseIndex(phase: string): number {
  return PHASES.findIndex((p) => p.id === phase);
}

function getLevelIcon(level?: string) {
  switch (level) {
    case "success": return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case "warning": return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />;
    case "error": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    default: return <Info className="w-3.5 h-3.5 text-blue-400" />;
  }
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CompleoAgentPage() {
  // Parse query params for projectId
  const searchString = useSearch();
  const queryProjectId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const pid = params.get("projectId");
    return pid ? parseInt(pid, 10) : null;
  }, [searchString]);

  // Source config
  const [sourceMode, setSourceMode] = useState<SourceMode>(queryProjectId ? "project" as any : "zip");
  const [gitUrl, setGitUrl] = useState("");
  const [gitToken, setGitToken] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [projectName, setProjectName] = useState("");
  const [autoResolve, setAutoResolve] = useState(false);
  const [enableMicroservices, setEnableMicroservices] = useState(false);
  const [enableML, setEnableML] = useState(false);
  const [enableReportEnhancer, setEnableReportEnhancer] = useState(false);
  const [enableSaga, setEnableSaga] = useState(false);
  // v10.8: Dynamic options + Frontend generation
  const [enableFrontend, setEnableFrontend] = useState(false);
  const [frontendFramework, setFrontendFramework] = useState<"react" | "angular" | "vue">("react");
  const [enableIndustryStandard, setEnableIndustryStandard] = useState(false);
  const [selectedStandard, setSelectedStandard] = useState<string>("");
  const [dynamicOptions, setDynamicOptions] = useState<any>(null);
  const [enableSoc2Compliance, setEnableSoc2Compliance] = useState(false);
  const [enableSoapToRest, setEnableSoapToRest] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [projectFromDb, setProjectFromDb] = useState<{ id: number; name: string; fileCount: number } | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const autoStartTriggered = useRef(false);

  // Agent state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [ambiguities, setAmbiguities] = useState<AgentAmbiguity[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<string>("logs");
  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // v10.7: Analysis Review workflow — analyse d'abord, options ensuite
  const [postMigrationChecklist, setPostMigrationChecklist] = useState<any>(null);
  const [showAnalysisReview, _setShowAnalysisReview] = useState(false);
  const setShowAnalysisReview = (v: boolean) => { showAnalysisReviewRef.current = v; _setShowAnalysisReview(v); };
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [analysisPhaseComplete, setAnalysisPhaseComplete] = useState(false);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null);

  // SSE ref
  const eventSourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const showAnalysisReviewRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Upload ZIP ─────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File) => {
    setUploadedFile(file);
    // Upload to get a session ID
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/compleo/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setUploadSessionId(data.sessionId);
      if (!projectName) setProjectName(data.projectName || file.name.replace(/\.zip$/, ""));
      toast.success(`${file.name} uploadé (${data.fileCount} fichiers)`);
    } catch {
      toast.error("Erreur lors de l'upload");
    }
  }, [projectName]);

  // ─── Start Agent ────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    try {
      // v10.7: Démarrer l'agent en mode analyse seule (options envoyées après review)
      const config: Record<string, unknown> = {
        source: sourceMode === "zip"
          ? { type: "zip", sessionId: uploadSessionId }
          : { type: "git", url: gitUrl, token: gitToken || undefined, branch: gitBranch },
        output: { type: "zip" },
        options: {
          projectName: projectName || "migration",
          autoResolveAmbiguities: false, // Toujours false pour forcer la pause après analyse
          maxCompilationAttempts: 5,
          enableMicroservices: false,
          enableML: false,
          enableReportEnhancer: false,
          enableSaga: false,
        },
      };

      const res = await fetch("/api/agent/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur de démarrage");
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setIsRunning(true);
      setEvents([]);
      setAmbiguities([]);
      setChoices({});
      startTimeRef.current = Date.now();

      // Start elapsed timer
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 1000);

      // Connect SSE
      seenEventsRef.current.clear();
      const es = new EventSource(`/api/agent/${data.sessionId}/events`);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const event: AgentEvent = JSON.parse(e.data);
          // Deduplicate events on reconnection (server replays full history)
          const key = `${event.timestamp}-${event.type}-${event.message || ''}-${event.phase || ''}`;
          if (seenEventsRef.current.has(key)) return;
          seenEventsRef.current.add(key);
          setEvents((prev) => [...prev, event]);

          // v10.7: Capturer la fin de la phase ANALYZING pour afficher l'écran de review
          if (event.type === "PHASE_END" && event.phase === "ANALYZING" && event.data) {
            setAnalysisData(event.data);
            setAnalysisPhaseComplete(true);
          }

          // Handle ambiguity detection (from both AMBIGUITY_DETECTED and AWAITING_INPUT events)
          if ((event.type === "AMBIGUITY_DETECTED" || event.type === "AWAITING_INPUT") && event.data?.ambiguities) {
            setAmbiguities(event.data.ambiguities as AgentAmbiguity[]);
            // v10.7: Afficher l'écran de review au lieu de switcher directement aux ambiguités
            if (!showAnalysisReview) {
              setShowAnalysisReview(true);
            }
          }

          // v10.7: Si la phase ANALYZING est terminée, afficher le review + charger les options dynamiques
          if (event.type === "PHASE_END" && event.phase === "ANALYZING") {
            setShowAnalysisReview(true);
            // v10.8: Charger les options dynamiques basées sur l'analyse
            if (data.sessionId) {
              setIsLoadingOptions(true);
              fetch(`/api/agent/${data.sessionId}/dynamic-options`)
                .then(r => r.ok ? r.json() : null)
                .then(opts => {
                  if (opts) {
                    setDynamicOptions(opts);
                    // Auto-activer les options recommandées
                    const optList = opts.options || [];
                    for (const opt of optList) {
                      if (opt.defaultEnabled) {
                        if (opt.id === "frontend") setEnableFrontend(true);
                        if (opt.id === "microservices") setEnableMicroservices(true);
                        if (opt.id === "saga") setEnableSaga(true);
                        if (opt.id === "reports" || opt.id === "ai_reports") setEnableReportEnhancer(true);
                        if (opt.id === "industryStandard" || opt.id.endsWith("_mapping")) {
                          setEnableIndustryStandard(true);
                          if (opts.detectedDomain?.primary && opts.detectedDomain.primary !== "NONE") {
                            setSelectedStandard(opts.detectedDomain.primary);
                          }
                        }
                        if (opt.id === "ml") setEnableML(true);
                        if (opt.id === "soc2_compliance") setEnableSoc2Compliance(true);
                        if (opt.id === "soap_to_rest") setEnableSoapToRest(true);
                        if (opt.id === "auto_resolve") setAutoResolve(true);
                      }
                    }
                  }
                })
                .catch(() => {})
                .finally(() => setIsLoadingOptions(false));
            }
          }

          // Handle completion/failure
          if (event.type === "SUCCESS" || event.type === "FAILURE" || event.type === "CANCELLED") {
            setIsRunning(false);
            if (timerRef.current) clearInterval(timerRef.current);
            es.close();

            // v10.8: Load post-migration checklist on success
            if (event.type === "SUCCESS" && sessionId) {
              fetch(`/api/agent/${sessionId}/post-migration-checklist`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data) {
                    setPostMigrationChecklist(data);
                    setActiveTab("checklist");
                  }
                })
                .catch(() => {});
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        // SSE connection lost — do NOT reconnect in loop (server replays all events causing duplicates)
        // Instead, switch to polling for status detection
        es.close();
        eventSourceRef.current = null;
        console.log("[SSE] Connexion perdue, passage en mode polling");
        // Start polling fallback
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/agent/${data.sessionId}/status`);
            if (statusRes.ok) {
              const st = await statusRes.json();
              setStatus(st);
              if (st.state === "COMPLETED" || st.state === "FAILED" || st.state === "CANCELLED") {
                setIsRunning(false);
                if (timerRef.current) clearInterval(timerRef.current);
                clearInterval(pollInterval);
                if (st.state === "COMPLETED" && sessionId) {
                  fetch(`/api/agent/${sessionId}/post-migration-checklist`)
                    .then(r => r.ok ? r.json() : null)
                    .then(d => { if (d) { setPostMigrationChecklist(d); setActiveTab("checklist"); } })
                    .catch(() => {});
                }
              }
              if (st.state === "AWAITING_INPUT" && !showAnalysisReviewRef.current) {
                setShowAnalysisReview(true);
                setAnalysisPhaseComplete(true);
                fetch(`/api/agent/${data.sessionId}/dynamic-options`)
                  .then(r => r.ok ? r.json() : null)
                  .then(opts => { if (opts) setDynamicOptions(opts); })
                  .catch(() => {});
                // Also fetch ambiguities
                fetch(`/api/agent/${data.sessionId}/status`)
                  .then(r => r.ok ? r.json() : null)
                  .then(st2 => {
                    if (st2?.ambiguities) setAmbiguities(st2.ambiguities);
                  })
                  .catch(() => {});
              }
            }
          } catch { /* ignore */ }
        }, 3000);
        pollIntervalRef.current = pollInterval;
      };

      toast.success("Agent démarré");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de démarrage");
    } finally {
      setIsStarting(false);
    }
  }, [sourceMode, uploadSessionId, gitUrl, gitToken, gitBranch, projectName, autoResolve, enableMicroservices, enableML, enableReportEnhancer, enableSaga]);

  // ─── Cancel Agent ───────────────────────────────────────────────────────

  const handleCancel = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`/api/agent/${sessionId}/cancel`, { method: "POST" });
      setIsRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
      toast.info("Agent annulé");
    } catch {
      toast.error("Erreur d'annulation");
    }
  }, [sessionId]);

  // ─── Resolve Ambiguities ───────────────────────────────────────────────

  const handleResolveAmbiguities = useCallback(async () => {
    if (!sessionId) return;
    const choiceArray = Object.entries(choices).map(([ambiguityId, choiceId]) => ({
      ambiguityId,
      choiceId,
    }));

    try {
      // v10.16: Always PATCH options before sending choices to ensure checkboxes are applied
      await fetch(`/api/agent/${sessionId}/options`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoResolveAmbiguities: autoResolve,
          enableMicroservices,
          enableML: enableMicroservices && enableML,
          enableReportEnhancer,
          enableSaga: enableMicroservices && enableSaga,
          enableFrontend,
          frontendFramework: enableFrontend ? frontendFramework : undefined,
          enableIndustryStandard,
          industryStandard: enableIndustryStandard && selectedStandard
            ? selectedStandard : undefined,
          enableSoc2Compliance,
          enableSoapToRest,
        }),
      });

      const res = await fetch(`/api/agent/${sessionId}/choices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choices: choiceArray }),
      });
      if (!res.ok) throw new Error("Erreur de résolution");
      toast.success("Ambiguïtés résolues, l'agent reprend");
      setAmbiguities([]);
    } catch {
      toast.error("Erreur lors de la résolution des ambiguïtés");
    }
  }, [sessionId, choices, autoResolve, enableMicroservices, enableML, enableReportEnhancer, enableSaga, enableFrontend, frontendFramework, enableIndustryStandard, selectedStandard, enableSoc2Compliance, enableSoapToRest]);

  const handleApplyAllRecommendations = useCallback(() => {
    const recs: Record<string, string> = {};
    for (const a of ambiguities) {
      recs[a.id] = a.recommendation;
    }
    setChoices(recs);
  }, [ambiguities]);

  // ─── v10.7: Continue to Generation after Analysis Review ─────────────

  const handleContinueGeneration = useCallback(async () => {
    if (!sessionId) return;
    try {
      // 1. Mettre à jour les options de génération via PATCH
      const patchRes = await fetch(`/api/agent/${sessionId}/options`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoResolveAmbiguities: autoResolve,
          enableMicroservices,
          enableML: enableMicroservices && enableML,
          enableReportEnhancer,
          enableSaga: enableMicroservices && enableSaga,
          // v10.8: Frontend generation options
          enableFrontend,
          frontendFramework: enableFrontend ? frontendFramework : undefined,
          enableIndustryStandard,
          industryStandard: enableIndustryStandard && selectedStandard
            ? selectedStandard : undefined,
          enableSoc2Compliance,
          enableSoapToRest,
        }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        throw new Error(err.error || "Erreur de mise à jour des options");
      }

      // 2. Fermer l'écran de review
      setShowAnalysisReview(false);

      // 3. Si des ambiguités existent et autoResolve est activé, les résoudre automatiquement
      if (ambiguities.length > 0 && autoResolve) {
        const recs: Record<string, string> = {};
        for (const a of ambiguities) {
          recs[a.id] = a.recommendation;
        }
        setChoices(recs);
        // Auto-resolve
        const choiceArray = Object.entries(recs).map(([ambiguityId, choiceId]) => ({
          ambiguityId,
          choiceId,
        }));
        await fetch(`/api/agent/${sessionId}/choices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choices: choiceArray }),
        });
        toast.success("Options configurées, ambiguités résolues automatiquement");
      } else if (ambiguities.length > 0) {
        // Afficher les ambiguités pour que l'utilisateur choisisse
        setActiveTab("ambiguities");
        toast.info("Options configurées. Veuillez résoudre les ambiguités pour continuer.");
      } else {
        // v10.9: Send empty choices to unblock the pipeline (it waits for user input even with 0 ambiguities)
        await fetch(`/api/agent/${sessionId}/choices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choices: [] }),
        });
        toast.success("Options configurées, génération en cours...");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de configuration");
    }
  }, [sessionId, autoResolve, enableMicroservices, enableML, enableReportEnhancer, enableSaga, enableFrontend, frontendFramework, enableIndustryStandard, selectedStandard, dynamicOptions, ambiguities]);

  // ─── Download ───────────────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!sessionId) return;
    window.open(`/api/agent/${sessionId}/download`, "_blank");
  }, [sessionId]);

  // ─── Reset ──────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (timerRef.current) clearInterval(timerRef.current);
    setSessionId(null);
    setEvents([]);
    setStatus(null);
    setAmbiguities([]);
    setChoices({});
    setIsRunning(false);
    setElapsedMs(0);
    setUploadedFile(null);
    setUploadSessionId(null);
    // v10.7: Reset analysis review states
    setShowAnalysisReview(false);
    setAnalysisData(null);
    setAnalysisPhaseComplete(false);
  }, []);

  // ─── Auto-start from project DB ─────────────────────────────────────

  const handleStartFromProject = useCallback(async (pid: number) => {
    setIsStarting(true);
    try {
      // v10.7: Démarrer sans options (analyse seule)
      const res = await fetch("/api/agent/start-from-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          options: {
            autoResolveAmbiguities: false,
            enableMicroservices: false,
            enableML: false,
            enableReportEnhancer: false,
            enableSaga: false,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur de d\u00e9marrage");
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setIsRunning(true);
      setEvents([]);
      setAmbiguities([]);
      setChoices({});
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 1000);

      seenEventsRef.current.clear();
      const es = new EventSource(`/api/agent/${data.sessionId}/events`);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const event: AgentEvent = JSON.parse(e.data);
          const key = `${event.timestamp}-${event.type}-${event.message || ''}-${event.phase || ''}`;
          if (seenEventsRef.current.has(key)) return;
          seenEventsRef.current.add(key);
          setEvents((prev) => [...prev, event]);

          // v10.7: Capturer la fin de la phase ANALYZING
          if (event.type === "PHASE_END" && event.phase === "ANALYZING" && event.data) {
            setAnalysisData(event.data);
            setAnalysisPhaseComplete(true);
            setShowAnalysisReview(true);
          }

          if ((event.type === "AMBIGUITY_DETECTED" || event.type === "AWAITING_INPUT") && event.data?.ambiguities) {
            setAmbiguities(event.data.ambiguities as AgentAmbiguity[]);
            if (!showAnalysisReview) {
              setShowAnalysisReview(true);
            }
          }
          if (event.type === "SUCCESS" || event.type === "FAILURE" || event.type === "CANCELLED") {
            setIsRunning(false);
            if (timerRef.current) clearInterval(timerRef.current);
            es.close();
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        es.close();
        // Polling fallback instead of reconnect
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/agent/${data.sessionId}/status`);
            if (statusRes.ok) {
              const st = await statusRes.json();
              if (st.state === "COMPLETED" || st.state === "FAILED" || st.state === "CANCELLED") {
                setIsRunning(false);
                if (timerRef.current) clearInterval(timerRef.current);
                clearInterval(pollInterval);
              }
              if (st.state === "AWAITING_INPUT" && !showAnalysisReview) {
                setShowAnalysisReview(true);
              }
            }
          } catch { /* ignore */ }
        }, 5000);
      };

      toast.success(`Agent d\u00e9marr\u00e9 depuis le projet ${data.projectName} (${data.fileCount} fichiers)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de d\u00e9marrage");
    } finally {
      setIsStarting(false);
    }
  }, [autoResolve, enableMicroservices, enableML, enableReportEnhancer, enableSaga]);

  // Load project info from DB when projectId is present
  useEffect(() => {
    if (!queryProjectId) return;
    setIsLoadingProject(true);
    fetch(`/api/trpc/projects.getById?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { id: queryProjectId } } }))}`)
      .then((r) => r.json())
      .then((data) => {
        const result = data?.[0]?.result?.data?.json;
        if (result) {
          setProjectFromDb({ id: result.id, name: result.name, fileCount: result.totalFiles || 0 });
          setProjectName(result.name);
        } else {
          toast.error("Projet introuvable en base de donn\u00e9es");
        }
      })
      .catch(() => toast.error("Erreur lors du chargement du projet"))
      .finally(() => setIsLoadingProject(false));
  }, [queryProjectId]);

  // Auto-start when project is loaded from DB
  useEffect(() => {
    if (queryProjectId && projectFromDb && !autoStartTriggered.current && !sessionId) {
      autoStartTriggered.current = true;
      handleStartFromProject(queryProjectId);
    }
  }, [queryProjectId, projectFromDb, sessionId, handleStartFromProject]);

  // ─── Cleanup on unmount ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ─── Auto-scroll logs ──────────────────────────────────────────────────

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // ─── Derived state ─────────────────────────────────────────────────────

  const currentPhase = useMemo(() => {
    const phaseEvents = events.filter((e) => e.type === "PHASE_START");
    return phaseEvents.length > 0 ? phaseEvents[phaseEvents.length - 1].phase : null;
  }, [events]);

  const isCompleted = events.some((e) => e.type === "SUCCESS");
  const isFailed = events.some((e) => e.type === "FAILURE");
  const isAwaitingInput = events.some((e) => e.type === "AWAITING_INPUT") && ambiguities.length > 0;
  const allChoicesMade = ambiguities.length > 0 && ambiguities.every((a) => choices[a.id]);

  const logEvents = events.filter((e) => e.type === "LOG");
  const errorCount = logEvents.filter((e) => e.level === "error").length;
  const warningCount = logEvents.filter((e) => e.level === "warning").length;

  // v10.3: Count LLM AI corrections
  const autoFixEvents = events.filter((e) => e.type === "AUTO_FIX");
  const llmFixCount = autoFixEvents.filter((e) => e.message?.includes("[LLM Self-Healing]")).length;
  const ruleFixCount = autoFixEvents.length - llmFixCount;
  const totalFixCount = autoFixEvents.length;

  const canStart = queryProjectId
    ? !!projectFromDb
    : sourceMode === "zip"
      ? !!uploadSessionId
      : !!gitUrl;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/compleo">
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <ArrowLeft className="w-4 h-4" />
                  Compleo
                </Button>
              </Link>
              <div className="h-6 w-px bg-border/50" />
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                <h1 className="text-lg font-semibold font-mono">Mode Agent</h1>
                <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">
                  v4.0
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isRunning && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span className="font-mono">{formatElapsed(elapsedMs)}</span>
                </div>
              )}
              {sessionId && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {sessionId.slice(0, 12)}...
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6">
        {/* Loading state when auto-starting from project DB */}
        {queryProjectId && !sessionId && (isLoadingProject || isStarting) ? (
          <div className="max-w-xl mx-auto text-center py-20 space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-emerald-400 animate-spin" />
            <h2 className="text-xl font-semibold">
              {isLoadingProject ? "Chargement du projet..." : "D\u00e9marrage de l'Agent IA..."}
            </h2>
            <p className="text-muted-foreground">
              {projectFromDb
                ? `Projet ${projectFromDb.name} (${projectFromDb.fileCount} fichiers) — lancement automatique`
                : "R\u00e9cup\u00e9ration des fichiers depuis la base de donn\u00e9es..."}
            </p>
          </div>
        ) : !sessionId ? (
          /* ─── Configuration Panel ────────────────────────────────────────── */
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2 mb-8">
              <h2 className="text-2xl font-bold">Lancer une migration autonome</h2>
              <p className="text-muted-foreground">
                L'agent analyse, génère et compile automatiquement votre projet Spring Boot.
              </p>
            </div>

            {/* Source toggle */}
            <div className="border border-border/50 rounded-lg p-6 bg-card/30 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <FolderArchive className="w-4 h-4 text-emerald-400" />
                Source du projet
              </h3>

              <div className="flex gap-2">
                <Button
                  variant={sourceMode === "zip" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSourceMode("zip")}
                  className="gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  Upload ZIP
                </Button>
                <Button
                  variant={sourceMode === "git" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSourceMode("git")}
                  className="gap-1.5"
                >
                  <GitBranch className="w-4 h-4" />
                  Repository Git
                </Button>
              </div>

              {sourceMode === "zip" ? (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(f);
                    }}
                  />
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
                      isDragOver
                        ? "border-emerald-400 bg-emerald-500/10 scale-[1.01]"
                        : "border-border/50 hover:border-emerald-500/50"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const f = e.dataTransfer.files[0];
                      if (f) handleFileSelect(f);
                    }}
                  >
                    {uploadedFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span className="font-mono text-sm">{uploadedFile.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {(uploadedFile.size / 1024).toFixed(0)} KB
                        </Badge>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Glissez un fichier ZIP ou cliquez pour sélectionner
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">URL du repository</label>
                    <Input
                      placeholder="https://github.com/org/repo.git"
                      value={gitUrl}
                      onChange={(e) => setGitUrl(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Branche</label>
                      <Input
                        placeholder="main"
                        value={gitBranch}
                        onChange={(e) => setGitBranch(e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Token (optionnel)</label>
                      <Input
                        type="password"
                        placeholder="ghp_..."
                        value={gitToken}
                        onChange={(e) => setGitToken(e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* v10.7: Nom du projet seulement (options après analyse) */}
            <div className="border border-border/50 rounded-lg p-6 bg-card/30 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Projet
              </h3>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nom du projet</label>
                <Input
                  placeholder="mon-projet-spring"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Les options de génération (microservices, rapports IA, saga) seront proposées après l'analyse.
              </p>
            </div>

            {/* Start button — v10.7: Analyser d'abord */}
            <Button
              size="lg"
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleStart}
              disabled={!canStart || isStarting}
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyse en cours...
                </>
              ) : (
                <>
                  <Eye className="w-5 h-5" />
                  Analyser le projet
                </>
              )}
            </Button>
          </div>
        ) : showAnalysisReview ? (
          /* ─── v10.7: Analysis Review + Options de Génération ────────────── */
          <div className="space-y-6">
            {/* Afficher les résultats d'analyse IA */}
            <AnalysisReviewScreen
              projectName={projectName || "migration"}
              stats={analysisData?.stats || analysisData?.analysisResult?.multiTech?.stats || { totalFiles: 0, totalClasses: 0, totalMethods: 0, totalLines: 0 }}
              technologiesDetected={analysisData?.technologiesDetected || analysisData?.analysisResult?.multiTech?.technologiesDetected || []}
              maturityScore={analysisData?.maturityScore || analysisData?.analysisResult?.multiTech?.maturityScore || null}
              aiInsights={analysisData?.aiInsights || analysisData?.analysisResult?.aiInsights || null}
              ambiguityCount={ambiguities.length}
              missingDepsCount={0}
              onContinueToGeneration={handleContinueGeneration}
            />

            {/* v10.8: Options de génération DYNAMIQUES (basées sur l'analyse) */}
            <div className="border border-border/50 rounded-lg p-6 bg-card/30 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Options de génération
                {dynamicOptions?.detectedDomain && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {dynamicOptions.detectedDomain.label}
                  </Badge>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                Options proposées selon l'analyse de votre projet. Seules les options pertinentes sont affichées.
              </p>

              {/* Auto-résolution (toujours affiché) */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <Checkbox
                  checked={autoResolve}
                  onCheckedChange={(v) => setAutoResolve(v === true)}
                  className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                />
                <span className="text-sm group-hover:text-foreground transition-colors">Auto-résoudre les ambiguïtés (utiliser les recommandations du moteur)</span>
              </label>

              {isLoadingOptions ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyse des options disponibles...
                </div>
              ) : (
                <div className="border-t border-border/30 pt-3 mt-2 space-y-3">
                  {/* Options dynamiques générées par DynamicOptionsResolver */}
                  {(dynamicOptions?.options || []).map((opt: any) => {
                    // Map option ID to state setter
                    const getChecked = () => {
                      switch (opt.id) {
                        case "frontend": return enableFrontend;
                        case "microservices": return enableMicroservices;
                        case "saga": return enableSaga;
                        case "reports": case "ai_reports": return enableReportEnhancer;
                        case "industryStandard": case "bian_mapping": case "acord_mapping": case "hl7_mapping": case "tmforum_mapping": case "ddd_mapping": case "togaf_mapping": return enableIndustryStandard;
                        case "ml": return enableML;
                        case "soc2_compliance": return enableSoc2Compliance;
                        case "soap_to_rest": return enableSoapToRest;
                        case "auto_resolve": return autoResolve;
                        default: return false;
                      }
                    };
                    const setChecked = (v: boolean) => {
                      switch (opt.id) {
                        case "frontend": setEnableFrontend(v); break;
                        case "microservices": setEnableMicroservices(v); break;
                        case "saga": setEnableSaga(v); break;
                        case "reports": case "ai_reports": setEnableReportEnhancer(v); break;
                        case "industryStandard": case "bian_mapping": case "acord_mapping": case "hl7_mapping": case "tmforum_mapping": case "ddd_mapping": case "togaf_mapping":
                          setEnableIndustryStandard(v);
                          if (v && opt.id.includes("_mapping")) {
                            // Auto-select the detected standard
                            const stdMap: Record<string, string> = { bian_mapping: "BIAN", acord_mapping: "ACORD", hl7_mapping: "HL7_FHIR", tmforum_mapping: "TMFORUM", ddd_mapping: "DDD", togaf_mapping: "TOGAF" };
                            setSelectedStandard(stdMap[opt.id] || "BIAN");
                          }
                          break;
                        case "ml": setEnableML(v); break;
                        case "soc2_compliance": setEnableSoc2Compliance(v); break;
                        case "soap_to_rest": setEnableSoapToRest(v); break;
                        case "auto_resolve": setAutoResolve(v); break;
                      }
                    };
                    const iconMap: Record<string, any> = {
                      frontend: Globe,
                      microservices: Layers,
                      saga: GitBranch,
                      reports: Star, ai_reports: Star,
                      industryStandard: Shield, bian_mapping: Shield, acord_mapping: Shield, hl7_mapping: Shield, tmforum_mapping: Shield, ddd_mapping: Shield, togaf_mapping: Shield,
                      ml: Zap,
                      soc2_compliance: Lock,
                      soap_to_rest: Zap,
                      auto_resolve: CheckCircle2,
                    };
                    const colorMap: Record<string, string> = {
                      frontend: "text-blue-400",
                      microservices: "text-pink-400",
                      saga: "text-violet-400",
                      reports: "text-amber-400", ai_reports: "text-amber-400",
                      industryStandard: "text-cyan-400", bian_mapping: "text-cyan-400", acord_mapping: "text-cyan-400", hl7_mapping: "text-cyan-400", tmforum_mapping: "text-cyan-400", ddd_mapping: "text-cyan-400", togaf_mapping: "text-cyan-400",
                      ml: "text-amber-400",
                      soc2_compliance: "text-emerald-400",
                      soap_to_rest: "text-orange-400",
                      auto_resolve: "text-green-400",
                    };
                    const checkboxColorMap: Record<string, string> = {
                      frontend: "data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500",
                      microservices: "data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500",
                      saga: "data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500",
                      reports: "data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500",
                      industryStandard: "data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500",
                      ml: "data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500",
                      soc2_compliance: "data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500",
                    };
                    const IconComp = iconMap[opt.id] || Zap;
                    const iconColor = colorMap[opt.id] || "text-yellow-400";
                    const cbColor = checkboxColorMap[opt.id] || "";

                    return (
                      <div key={opt.id} className="space-y-2">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <Checkbox
                            checked={getChecked()}
                            onCheckedChange={(v) => setChecked(v === true)}
                            className={cbColor}
                          />
                          <IconComp className={`w-4 h-4 ${iconColor}`} />
                          <div className="flex-1">
                            <span className="text-sm group-hover:text-foreground transition-colors">{opt.label}</span>
                            {opt.reason && (
                              <p className="text-xs text-muted-foreground mt-0.5">{opt.reason}</p>
                            )}
                          </div>
                          {opt.defaultEnabled && (
                            <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] border-emerald-500/30">Recommandé</Badge>
                          )}
                        </label>

                        {/* Sub-options : choix du framework frontend */}
                        {opt.id === "frontend" && enableFrontend && opt.subOptions && (
                          <div className="ml-8 space-y-2">
                            <p className="text-xs text-muted-foreground">Choisissez le framework frontend :</p>
                            <div className="flex gap-2">
                              {(opt.subOptions || []).map((sub: any) => (
                                <Button
                                  key={sub.id}
                                  variant={frontendFramework === sub.id ? "default" : "outline"}
                                  size="sm"
                                  className={frontendFramework === sub.id
                                    ? "bg-blue-500 hover:bg-blue-600 text-white"
                                    : "hover:border-blue-400"}
                                  onClick={() => setFrontendFramework(sub.id as any)}
                                >
                                  {sub.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Sub-options : Sélecteur de standard métier */}
                        {opt.id === "industryStandard" && enableIndustryStandard && (
                          <div className="ml-8 space-y-2">
                            <p className="text-xs text-muted-foreground">Choisissez le standard métier :</p>
                            <Select value={selectedStandard} onValueChange={setSelectedStandard}>
                              <SelectTrigger className="w-full max-w-xs h-8 text-xs">
                                <SelectValue placeholder="Standard auto-détecté" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="BIAN">BIAN — Banking (Banque)</SelectItem>
                                <SelectItem value="ACORD">ACORD — Insurance (Assurance)</SelectItem>
                                <SelectItem value="HL7_FHIR">HL7/FHIR — Healthcare (Santé)</SelectItem>
                                <SelectItem value="TMFORUM">TMForum — Telecom</SelectItem>
                                <SelectItem value="DDD">DDD — Domain-Driven Design</SelectItem>
                                <SelectItem value="TOGAF">TOGAF — Enterprise Architecture</SelectItem>
                              </SelectContent>
                            </Select>
                            {dynamicOptions?.detectedDomain?.primary && dynamicOptions.detectedDomain.primary !== "NONE" && selectedStandard !== dynamicOptions.detectedDomain.primary && (
                              <p className="text-[10px] text-amber-400">⚠ Standard auto-détecté : {dynamicOptions.detectedDomain.label}</p>
                            )}
                          </div>
                        )}
                        {/* Sub-options : ML enhancement (sous microservices) */}
                        {opt.id === "microservices" && enableMicroservices && (
                          <label className="flex items-center gap-3 cursor-pointer ml-8 group">
                            <Checkbox
                              checked={enableML}
                              onCheckedChange={(v) => setEnableML(v === true)}
                              className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                            />
                            <Zap className="w-4 h-4 text-amber-400" />
                            <span className="text-sm group-hover:text-foreground transition-colors">Amélioration ML (IA intégrée)</span>
                          </label>
                        )}
                      </div>
                    );
                  })}

                  {/* Fallback si pas d'options dynamiques */}
                  {(!dynamicOptions?.options || dynamicOptions.options.length === 0) && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <Checkbox
                          checked={enableReportEnhancer}
                          onCheckedChange={(v) => setEnableReportEnhancer(v === true)}
                          className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                        />
                        <Star className="w-4 h-4 text-amber-400" />
                        <span className="text-sm group-hover:text-foreground transition-colors">Rapports IA enrichis</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              <Button
                size="lg"
                className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 mt-4"
                onClick={handleContinueGeneration}
              >
                <Play className="w-5 h-5" />
                Lancer la génération
              </Button>
            </div>
          </div>
        ) : (
          /* ─── Agent Running / Completed Panel ────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Timeline */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Activity className="w-4 h-4 text-emerald-400" />
                Pipeline
              </h3>

              <div className="border border-border/50 rounded-lg bg-card/30 p-4">
                <div className="space-y-1">
                  {PHASES.map((phase, i) => {
                    const phaseIdx = getPhaseIndex(currentPhase || "");
                    const thisIdx = i;
                    const isActive = currentPhase === phase.id;
                    const isDone = thisIdx < phaseIdx || isCompleted;
                    const isCurrent = isActive && isRunning;
                    const Icon = phase.icon;

                    return (
                      <div
                        key={phase.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                          isCurrent
                            ? "bg-emerald-500/10 border border-emerald-500/30"
                            : isDone
                              ? "opacity-60"
                              : "opacity-30"
                        }`}
                      >
                        <div className="relative">
                          {isCurrent ? (
                            <Loader2 className={`w-4 h-4 animate-spin ${phase.color}`} />
                          ) : isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Icon className={`w-4 h-4 ${isDone ? phase.color : "text-muted-foreground"}`} />
                          )}
                        </div>
                        <span className={`text-sm font-medium ${isCurrent ? "text-foreground" : ""}`}>
                          {phase.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stats */}
              <div className="border border-border/50 rounded-lg bg-card/30 p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Durée</span>
                  <span className="font-mono">{formatElapsed(elapsedMs)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Événements</span>
                  <span className="font-mono">{events.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Warnings</span>
                  <span className="font-mono text-yellow-400">{warningCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Erreurs</span>
                  <span className="font-mono text-red-400">{errorCount}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {isRunning && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={handleCancel}
                  >
                    <Square className="w-4 h-4" />
                    Annuler
                  </Button>
                )}
                {isCompleted && (
                  <>
                    <Button
                      size="sm"
                      className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                      onClick={handleDownload}
                    >
                      <Download className="w-4 h-4" />
                      Télécharger le projet
                    </Button>
                    <Link href="/compleo/architecture">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                      >
                        <Network className="w-4 h-4" />
                        Analyser l'architecture
                      </Button>
                    </Link>
                  </>
                )}
                {(isCompleted || isFailed) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={handleReset}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Nouvelle migration
                  </Button>
                )}
              </div>
            </div>

            {/* Right: Logs + Ambiguities */}
            <div className="lg:col-span-2 space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-card/50">
                  <TabsTrigger value="logs" className="gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    Logs
                    <Badge variant="secondary" className="text-xs ml-1">
                      {logEvents.length}
                    </Badge>
                  </TabsTrigger>
                  {ambiguities.length > 0 && (
                    <TabsTrigger value="ambiguities" className="gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Ambiguïtés
                      <Badge variant="secondary" className="text-xs ml-1 bg-yellow-500/20 text-yellow-400">
                        {ambiguities.length}
                      </Badge>
                    </TabsTrigger>
                  )}
                  {sessionId && isCompleted && (
                    <TabsTrigger value="sagas" className="gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-pink-400" />
                      Sagas
                    </TabsTrigger>
                  )}
                  {sessionId && isCompleted && (
                    <TabsTrigger value="reports" className="gap-1.5">
                      <Star className="w-3.5 h-3.5 text-amber-400" />
                      Rapports IA
                    </TabsTrigger>
                  )}
                  {sessionId && isCompleted && postMigrationChecklist && (
                    <TabsTrigger value="checklist" className="gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Checklist
                      <Badge variant="secondary" className="text-[10px] ml-1 bg-emerald-500/20 text-emerald-400">
                        {postMigrationChecklist.summary.total}
                      </Badge>
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* Logs tab */}
                <TabsContent value="logs" className="mt-3">
                  <div className="border border-border/50 rounded-lg bg-black/40 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-card/20">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Terminal className="w-3.5 h-3.5" />
                        <span>Agent Output</span>
                        {isRunning && <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />}
                      </div>
                      {/* v10.3: Badge corrections IA */}
                      {totalFixCount > 0 && (
                        <div className="flex items-center gap-2">
                          {llmFixCount > 0 && (
                            <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] font-mono">
                              <Zap className="w-3 h-3 mr-1" />
                              {llmFixCount} correction{llmFixCount > 1 ? "s" : ""} IA
                            </Badge>
                          )}
                          {ruleFixCount > 0 && (
                            <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[10px] font-mono">
                              {ruleFixCount} auto-fix
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <ScrollArea className="h-[500px]">
                      <div className="p-3 space-y-0.5 font-mono text-xs">
                        {events.map((event, i) => {
                          if (event.type === "PHASE_START") {
                            return (
                              <div key={i} className="flex items-center gap-2 py-1.5 text-emerald-400 font-semibold">
                                <ChevronRight className="w-3 h-3" />
                                <span>▸ {event.phase}</span>
                                <span className="text-muted-foreground font-normal">
                                  {new Date(event.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                            );
                          }
                          if (event.type === "PHASE_END") {
                            return (
                              <div key={i} className="flex items-center gap-2 py-0.5 text-muted-foreground">
                                <span className="ml-5">✓ {event.phase} terminé</span>
                              </div>
                            );
                          }
                          if (event.type === "AUTO_FIX") {
                            const isLLM = event.message?.includes("[LLM Self-Healing]");
                            return (
                              <div key={i} className="flex items-start gap-2 py-0.5">
                                <Zap className={`w-3.5 h-3.5 ${isLLM ? "text-purple-400" : "text-cyan-400"}`} />
                                <span className={isLLM ? "text-purple-300" : "text-cyan-300"}>
                                  {event.message}
                                </span>
                                {event.data?.confidence ? (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-500/30 text-purple-300">
                                    {String(event.data.confidence)}
                                  </Badge>
                                ) : null}
                              </div>
                            );
                          }
                          if (event.type === "COMPILATION_ATTEMPT") {
                            return (
                              <div key={i} className="flex items-start gap-2 py-0.5">
                                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-amber-300">{event.message}</span>
                              </div>
                            );
                          }
                          if (event.type === "LOG") {
                            return (
                              <div key={i} className="flex items-start gap-2 py-0.5">
                                {getLevelIcon(event.level)}
                                <span
                                  className={
                                    event.level === "error"
                                      ? "text-red-400"
                                      : event.level === "warning"
                                        ? "text-yellow-400"
                                        : event.level === "success"
                                          ? "text-emerald-400"
                                          : "text-foreground/80"
                                  }
                                >
                                  {event.message}
                                </span>
                              </div>
                            );
                          }
                          if (event.type === "SUCCESS") {
                            return (
                              <div key={i} className="flex items-center gap-2 py-2 text-emerald-400 font-bold">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Migration terminée avec succès</span>
                                {(event.data as any)?.fileCount && (
                                  <Badge variant="secondary" className="text-xs">
                                    {String((event.data as any).fileCount)} fichiers
                                  </Badge>
                                )}
                              </div>
                            );
                          }
                          if (event.type === "FAILURE") {
                            return (
                              <div key={i} className="flex items-center gap-2 py-2 text-red-400 font-bold">
                                <XCircle className="w-4 h-4" />
                                <span>{event.message || "Échec de la migration"}</span>
                              </div>
                            );
                          }
                          if (event.type === "AWAITING_INPUT") {
                            return (
                              <div key={i} className="flex items-center gap-2 py-2 text-yellow-400">
                                <Pause className="w-4 h-4" />
                                <span>En attente de vos choix...</span>
                              </div>
                            );
                          }
                          return null;
                        })}
                        <div ref={logEndRef} />
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>

                {/* Ambiguities tab */}
                {ambiguities.length > 0 && (
                  <TabsContent value="ambiguities" className="mt-3">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          {ambiguities.length} ambiguïté{ambiguities.length > 1 ? "s" : ""} détectée{ambiguities.length > 1 ? "s" : ""}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleApplyAllRecommendations}
                            className="gap-1.5"
                          >
                            <Star className="w-3.5 h-3.5" />
                            Appliquer les recommandations
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleResolveAmbiguities}
                            disabled={!allChoicesMade}
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <SkipForward className="w-3.5 h-3.5" />
                            Valider ({Object.keys(choices).length}/{ambiguities.length})
                          </Button>
                        </div>
                      </div>

                      <ScrollArea className="h-[450px]">
                        <div className="space-y-3">
                          {ambiguities.map((amb) => (
                            <div
                              key={amb.id}
                              className={`border rounded-lg p-4 transition-colors ${
                                choices[amb.id]
                                  ? "border-emerald-500/30 bg-emerald-500/5"
                                  : "border-border/50 bg-card/30"
                              }`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${
                                      amb.severity === "blocking"
                                        ? "border-red-500/30 text-red-400"
                                        : amb.severity === "warning"
                                          ? "border-yellow-500/30 text-yellow-400"
                                          : "border-blue-500/30 text-blue-400"
                                    }`}
                                  >
                                    {amb.type}
                                  </Badge>
                                  {amb.context?.className && (
                                    <span className="text-xs text-muted-foreground ml-2 font-mono">
                                      {amb.context.className}
                                    </span>
                                  )}
                                </div>
                                {choices[amb.id] && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                )}
                              </div>
                              <p className="text-sm mb-3">{amb.question}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {amb.options.map((opt) => (
                                  <button
                                    key={opt.id}
                                    className={`text-left p-3 rounded-md border text-sm transition-all ${
                                      choices[amb.id] === opt.id
                                        ? "border-emerald-500 bg-emerald-500/10"
                                        : "border-border/50 hover:border-border"
                                    }`}
                                    onClick={() =>
                                      setChoices((prev) => ({ ...prev, [amb.id]: opt.id }))
                                    }
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{opt.label}</span>
                                      {amb.recommendation === opt.id && (
                                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {opt.description}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>
                )}

                {/* Saga Orchestration tab (v7.9) */}
                {sessionId && isCompleted && (
                  <TabsContent value="sagas" className="mt-3">
                    <SagaViewer sessionId={sessionId} compact />
                  </TabsContent>
                )}

                {/* Enhanced Reports tab (v7.4) */}
                {sessionId && isCompleted && (
                  <TabsContent value="reports" className="mt-3">
                    <ReportViewer sessionId={sessionId} compact />
                  </TabsContent>
                )}
                {sessionId && isCompleted && postMigrationChecklist && (
                  <TabsContent value="checklist" className="mt-3">
                    <PostMigrationChecklistScreen
                      checklist={postMigrationChecklist}
                      projectName={projectName || "project"}
                    />
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
