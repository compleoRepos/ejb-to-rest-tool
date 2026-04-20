/**
 * Compleo Agent v4.0 — Mode Agent Autonome
 * Timeline SSE temps réel, résolution d'ambiguïtés, download résultat.
 * @author Hamza NORDINE
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentEvent {
  type: "PHASE_START" | "PHASE_END" | "LOG" | "AMBIGUITY_DETECTED" | "AWAITING_INPUT" | "SUCCESS" | "FAILURE" | "CANCELLED";
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

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null);

  // SSE ref
  const eventSourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const logEndRef = useRef<HTMLDivElement>(null);

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
      const config: Record<string, unknown> = {
        source: sourceMode === "zip"
          ? { type: "zip", sessionId: uploadSessionId }
          : { type: "git", url: gitUrl, token: gitToken || undefined, branch: gitBranch },
        output: { type: "zip" },
        options: {
          projectName: projectName || "migration",
          autoResolveAmbiguities: autoResolve,
          maxCompilationAttempts: 5,
          enableMicroservices,
          enableML: enableMicroservices && enableML,
          enableReportEnhancer,
          enableSaga: enableMicroservices && enableSaga,
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
      const es = new EventSource(`/api/agent/${data.sessionId}/events`);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const event: AgentEvent = JSON.parse(e.data);
          setEvents((prev) => [...prev, event]);

          // Handle ambiguity detection (from both AMBIGUITY_DETECTED and AWAITING_INPUT events)
          if ((event.type === "AMBIGUITY_DETECTED" || event.type === "AWAITING_INPUT") && event.data?.ambiguities) {
            setAmbiguities(event.data.ambiguities as AgentAmbiguity[]);
            // Auto-switch to ambiguities tab so user sees the choices immediately
            setActiveTab("ambiguities");
          }

          // Handle completion/failure
          if (event.type === "SUCCESS" || event.type === "FAILURE" || event.type === "CANCELLED") {
            setIsRunning(false);
            if (timerRef.current) clearInterval(timerRef.current);
            es.close();
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        // SSE connection closed
        setIsRunning(false);
        if (timerRef.current) clearInterval(timerRef.current);
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
  }, [sessionId, choices]);

  const handleApplyAllRecommendations = useCallback(() => {
    const recs: Record<string, string> = {};
    for (const a of ambiguities) {
      recs[a.id] = a.recommendation;
    }
    setChoices(recs);
  }, [ambiguities]);

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
  }, []);

  // ─── Auto-start from project DB ─────────────────────────────────────

  const handleStartFromProject = useCallback(async (pid: number) => {
    setIsStarting(true);
    try {
      const res = await fetch("/api/agent/start-from-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          options: {
            autoResolveAmbiguities: autoResolve,
            enableMicroservices,
            enableML: enableMicroservices && enableML,
            enableReportEnhancer,
            enableSaga: enableMicroservices && enableSaga,
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

      const es = new EventSource(`/api/agent/${data.sessionId}/events`);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const event: AgentEvent = JSON.parse(e.data);
          setEvents((prev) => [...prev, event]);
          if ((event.type === "AMBIGUITY_DETECTED" || event.type === "AWAITING_INPUT") && event.data?.ambiguities) {
            setAmbiguities(event.data.ambiguities as AgentAmbiguity[]);
            setActiveTab("ambiguities");
          }
          if (event.type === "SUCCESS" || event.type === "FAILURE" || event.type === "CANCELLED") {
            setIsRunning(false);
            if (timerRef.current) clearInterval(timerRef.current);
            es.close();
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        setIsRunning(false);
        if (timerRef.current) clearInterval(timerRef.current);
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
    fetch(`/api/trpc/projects.getById?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: queryProjectId } }))}`)
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

            {/* Options */}
            <div className="border border-border/50 rounded-lg p-6 bg-card/30 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Options
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
              <label className="flex items-center gap-3 cursor-pointer group">
                <Checkbox
                  checked={autoResolve}
                  onCheckedChange={(v) => setAutoResolve(v === true)}
                  className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                />
                <span className="text-sm group-hover:text-foreground transition-colors">Auto-résoudre les ambiguïtés (utiliser les recommandations du moteur)</span>
              </label>
              <div className="border-t border-border/30 pt-3 mt-2 space-y-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <Checkbox
                    checked={enableMicroservices}
                    onCheckedChange={(v) => setEnableMicroservices(v === true)}
                    className="data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500"
                  />
                  <Layers className="w-4 h-4 text-pink-400" />
                  <span className="text-sm group-hover:text-foreground transition-colors">Découpage Microservices (Splitter + Générateur)</span>
                </label>
                {enableMicroservices && (
                  <label className="flex items-center gap-3 cursor-pointer ml-6 group">
                    <Checkbox
                      checked={enableML}
                      onCheckedChange={(v) => setEnableML(v === true)}
                      className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                    />
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-sm group-hover:text-foreground transition-colors">Amélioration ML (IA intégrée)</span>
                  </label>
                )}
                <label className="flex items-center gap-3 cursor-pointer group">
                  <Checkbox
                    checked={enableReportEnhancer}
                    onCheckedChange={(v) => setEnableReportEnhancer(v === true)}
                    className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <Star className="w-4 h-4 text-amber-400" />
                  <span className="text-sm group-hover:text-foreground transition-colors">Rapports IA enrichis (IA intégrée)</span>
                </label>
                {enableMicroservices && (
                  <label className="flex items-center gap-3 cursor-pointer ml-6 group">
                    <Checkbox
                      checked={enableSaga}
                      onCheckedChange={(v) => setEnableSaga(v === true)}
                      className="data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                    />
                    <GitBranch className="w-4 h-4 text-violet-400" />
                    <span className="text-sm group-hover:text-foreground transition-colors">Saga Orchestration (compensation automatique)</span>
                  </label>
                )}
              </div>
            </div>

            {/* Start button */}
            <Button
              size="lg"
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleStart}
              disabled={!canStart || isStarting}
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Démarrage...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Lancer l'agent
                </>
              )}
            </Button>
          </div>
        ) : (
          /* ─── Agent Running / Completed Panel ──────────────────────────── */
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
              </Tabs>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
