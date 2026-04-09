/**
 * Compleo v5.4 — Page unifiée de migration Java Legacy → Spring Boot
 * 4 états : idle → analyzing → choices → results
 * Persistance sessionId dans localStorage + DB.
 * @author Hamza NORDINE
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Download, Eye, FolderArchive,
  CheckCircle2, AlertTriangle, Loader2, ArrowRight, Package,
  Layers, Code2, TestTube, Cloud, FileText, ChevronRight,
  ChevronDown, RefreshCw, BarChart3,
  Terminal, Zap, Server, Database, Shield, Box,
  HelpCircle, Star, ArrowLeft, Lightbulb, Info,
  Columns2, GitCompare, Network, GitBranch, FileCode2,
  Bot,
} from "lucide-react";
import { Link } from "wouter";
import CodeDiff from "@/components/CodeDiff";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import DropZone from "@/components/compleo/DropZone";
import FileExplorer from "@/components/compleo/FileExplorer";
import CodeViewer from "@/components/compleo/CodeViewer";
import StepProgress, { type PipelineStep } from "@/components/compleo/StepProgress";
import SessionList from "@/components/compleo/SessionList";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AmbiguityOption {
  id: string;
  label: string;
  description: string;
}

interface AmbiguityContext {
  className: string;
  methodName?: string;
  signature?: string;
  javadoc?: string;
  packageName?: string;
  relatedClasses?: string[];
  injectedType?: string;
}

interface Ambiguity {
  id: string;
  type: string;
  severity: "info" | "warning" | "blocking";
  context: AmbiguityContext;
  question: string;
  recommendation: string;
  recommendationReason: string;
  options: AmbiguityOption[];
}

interface AnalysisResult {
  sessionId: string;
  status: string;
  projectName: string;
  groupId: string;
  artifactId: string;
  version: string;
  stats: {
    totalFiles: number;
    totalLines: number;
    useCaseCount: number;
    dtoCount: number;
    serviceCount: number;
    enumCount: number;
    exceptionCount: number;
    validatorCount: number;
    remoteInterfaceCount: number;
    domainCount: number;
    domains: string[];
  };
  warnings: string[];
  ambiguities: Ambiguity[];
  irSummary: {
    useCases: {
      className: string;
      domain: string;
      httpMethod: string;
      restPath: string;
      voInType: string;
      voOutType: string;
      bianDomain: string;
      bianAction: string;
      useCaseDescription: string;
    }[];
    dtos: { className: string; direction: string; fieldCount: number; requiredFields: number }[];
    enums: { className: string; valueCount: number }[];
    exceptions: { className: string; extendsClass: string }[];
    validators: { className: string; annotationName: string }[];
    remoteInterfaces: { className: string; methodCount: number }[];
    domains: string[];
  };
}

interface GenerationResult {
  sessionId: string;
  status: string;
  stats: {
    totalFiles: number;
    controllers: number;
    services: number;
    dtos: number;
    tests: number;
    enums: number;
    exceptions: number;
    validators: number;
    configFiles: number;
    cloudFiles: number;
    totalLinesGenerated: number;
  };
  warnings: string[];
  downloadUrl: string;
  directUrl: string;
  files: { path: string; category: string; lines: number; content?: string }[];
  choicesApplied?: number;
}

interface MultiTechResult {
  technologiesDetected: string[];
  maturityScore: {
    global: number;
    dimensions: Record<string, number>;
    label: string;
    attentionPoints: string[];
    estimatedEffort: string;
  };
  detectedComponents: any[];
  migrationNotes: any[];
  generatedFiles: any[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const techColors: Record<string, string> = {
  SERVLET: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  JSP: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  EJB_2X: "bg-red-500/20 text-red-300 border-red-500/30",
  EJB_3X_STATELESS: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  EJB_3X_STATEFUL: "bg-green-500/20 text-green-300 border-green-500/30",
  EJB_3X_MDB: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  STRUTS_1: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  STRUTS_2: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  SOAP: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  JAX_RS: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  JDBC: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  HIBERNATE: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  JPA: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  JMS: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  BATCH: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  EAI_BOA: "bg-lime-500/20 text-lime-300 border-lime-500/30",
  SPRING_BOOT: "bg-green-500/20 text-green-300 border-green-500/30",
};

const techLabels: Record<string, string> = {
  SERVLET: "Servlet", JSP: "JSP", EJB_2X: "EJB 2.x", EJB_3X_STATELESS: "EJB 3.x",
  EJB_3X_STATEFUL: "EJB 3.x Stateful", EJB_3X_MDB: "EJB MDB", STRUTS_1: "Struts 1",
  STRUTS_2: "Struts 2", SOAP: "SOAP/JAX-WS", JAX_RS: "JAX-RS", JDBC: "JDBC",
  HIBERNATE: "Hibernate", JPA: "JPA", JMS: "JMS", BATCH: "Java Batch",
  EAI_BOA: "EAI/BOA", SPRING_BOOT: "Spring Boot",
};

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  blocking: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  warning: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  info: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
};

const SESSION_KEY = "compleo_session_id";

// ─── Component ──────────────────────────────────────────────────────────────

export default function CompleoPage() {
  // Pipeline state — 4 states
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>("idle");
  const [completedSteps, setCompletedSteps] = useState<Set<PipelineStep>>(new Set());

  // Session ID
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Ambiguity choices state
  const [userChoices, setUserChoices] = useState<Record<string, string>>({});
  const [currentAmbiguityIndex, setCurrentAmbiguityIndex] = useState(0);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);

  // File viewer state
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [sourceFile, setSourceFile] = useState<{ path: string; content: string } | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [resultTab, setResultTab] = useState<"code" | "diff" | "architecture">("code");

  // Multi-tech v3.0 state
  const [multiTechResult, setMultiTechResult] = useState<MultiTechResult | null>(null);

  // ─── Derived state ──────────────────────────────────────────────────────

  const ambiguities = analysisResult?.ambiguities ?? [];
  const currentAmbiguity = ambiguities[currentAmbiguityIndex];
  const resolvedCount = Object.keys(userChoices).length;
  const blockingCount = ambiguities.filter(a => a.severity === "blocking").length;
  const blockingResolved = ambiguities
    .filter(a => a.severity === "blocking")
    .filter(a => userChoices[a.id])
    .length;
  const canGenerate = blockingCount === 0 || blockingResolved === blockingCount;

  // Files for FileExplorer
  const explorerFiles = useMemo(() =>
    generationResult?.files.map(f => ({
      path: f.path,
      content: (f as any).content || "",
      category: f.category,
    })) ?? [],
  [generationResult]);

  // ─── File Content Loader (must be declared before restoreSession) ─────

  const loadFileContents = useCallback(async (sid: string, files: { path: string; category: string; lines: number }[]) => {
    const updated = await Promise.all(
      files.map(async (f) => {
        try {
          const res = await fetch(`/api/compleo/preview/${sid}/${f.path}`);
          if (res.ok) {
            const data = await res.json();
            return { ...f, content: data.content || "" };
          }
        } catch {}
        return { ...f, content: "" };
      })
    );

    setGenerationResult(prev => prev ? { ...prev, files: updated } : prev);

    // Auto-select first file
    if (updated.length > 0 && updated[0].content) {
      setSelectedFile({ path: updated[0].path, content: updated[0].content });
    }
  }, []);

  // ─── Session persistence ───────────────────────────────────────────────

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  }, [sessionId]);

  // Restore session on mount
  useEffect(() => {
    const savedId = localStorage.getItem(SESSION_KEY);
    if (savedId && !sessionId) {
      restoreSession(savedId);
    }
  }, []);

  const restoreSession = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/compleo/session/${sid}`);
      if (!res.ok) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      const data = await res.json();
      setSessionId(sid);

      // Restore analysis result from API format
      if (data.stats || data.irSummary) {
        setAnalysisResult({
          sessionId: sid,
          status: data.status,
          projectName: data.projectName,
          groupId: "",
          artifactId: "",
          version: "",
          stats: data.stats ?? {},
          warnings: data.warnings ?? [],
          ambiguities: data.ambiguities ?? [],
          irSummary: data.irSummary ?? { useCases: [], dtos: [], enums: [], exceptions: [], validators: [], remoteInterfaces: [], domains: [] },
        });
      }

      // Restore generation result
      if (data.generation) {
        setGenerationResult(data.generation);
      }

      // Restore multi-tech data
      if (data.technologiesDetected?.length > 0) {
        setMultiTechResult({
          technologiesDetected: data.technologiesDetected,
          maturityScore: data.maturityScore,
          detectedComponents: data.detectedComponents ?? [],
          migrationNotes: [],
          generatedFiles: [],
        });
      }

      // Restore user choices (convert array to map)
      if (data.userChoices?.length > 0) {
        const choiceMap: Record<string, string> = {};
        for (const c of data.userChoices) {
          choiceMap[c.ambiguityId] = c.choiceId;
        }
        setUserChoices(choiceMap);
      }

      // Determine which step to restore to
      if (data.generation) {
        setPipelineStep("results");
        setCompletedSteps(new Set(["idle", "analyzing", "choices", "results"] as PipelineStep[]));
        // Load file contents for the explorer
        if (data.generation.files?.length > 0) {
          await loadFileContents(sid, data.generation.files);
        }
      } else if (data.ambiguities?.length > 0) {
        setPipelineStep("choices");
        setCompletedSteps(new Set(["idle", "analyzing"] as PipelineStep[]));
      } else if (data.stats) {
        setPipelineStep("analyzing");
        setCompletedSteps(new Set(["idle"] as PipelineStep[]));
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [loadFileContents]);

  // ─── Upload Complete Handler (from DropZone) ───────────────────────────

  const handleUploadComplete = useCallback(async (newSessionId: string) => {
    setSessionId(newSessionId);
    setCompletedSteps(new Set(["idle"] as PipelineStep[]));

    // Auto-trigger analysis
    await runAnalysis(newSessionId);
  }, []);

  // ─── Analysis Handler ──────────────────────────────────────────────────

  const runAnalysis = useCallback(async (sid: string) => {
    setAnalyzing(true);
    setPipelineStep("analyzing");

    try {
      const res = await fetch("/api/compleo/analyze-multitech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }

      const data = await res.json();

      setMultiTechResult({
        technologiesDetected: data.technologiesDetected || [],
        maturityScore: data.maturityScore,
        detectedComponents: data.detectedComponents || [],
        migrationNotes: data.migrationNotes || [],
        generatedFiles: data.generatedFiles || [],
      });

      setAnalysisResult(data as AnalysisResult);
      setCompletedSteps(prev => new Set([...prev, "analyzing"] as PipelineStep[]));

      const techCount = data.technologiesDetected?.length || 0;

      if (data.ambiguities && data.ambiguities.length > 0) {
        setPipelineStep("choices");
        toast.success(`${techCount} technologies — ${data.ambiguities.length} choix à faire`);
      } else {
        // No ambiguities — auto-generate
        setCompletedSteps(prev => new Set([...prev, "choices"] as PipelineStep[]));
        await runGeneration(sid, []);
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'analyse");
      setPipelineStep("idle");
    } finally {
      setAnalyzing(false);
    }
  }, []);

  // ─── Choice Handlers ──────────────────────────────────────────────────

  const handleChoice = useCallback((ambiguityId: string, choiceId: string) => {
    setUserChoices(prev => ({ ...prev, [ambiguityId]: choiceId }));
  }, []);

  const handleApplyAllRecommendations = useCallback(() => {
    const newChoices: Record<string, string> = { ...userChoices };
    for (const amb of ambiguities) {
      if (!newChoices[amb.id]) {
        newChoices[amb.id] = amb.recommendation;
      }
    }
    setUserChoices(newChoices);
    toast.success("Toutes les recommandations appliquées");
  }, [ambiguities, userChoices]);

  // ─── Generate Handler ─────────────────────────────────────────────────

  const runGeneration = useCallback(async (sid: string, choices: { ambiguityId: string; choiceId: string }[]) => {
    setGenerating(true);

    try {
      let res: Response;

      if (choices.length > 0) {
        res = await fetch(`/api/compleo/resolve/${sid}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choices }),
        });
      } else {
        res = await fetch("/api/compleo/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid }),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }

      const data: GenerationResult = await res.json();
      setGenerationResult(data);
      setCompletedSteps(prev => new Set([...prev, "choices", "results"] as PipelineStep[]));
      setPipelineStep("results");

      // Load file contents for the explorer
      await loadFileContents(sid, data.files);

      toast.success(`${data.stats.totalFiles} fichiers Spring Boot générés`);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }, []);

  const handleGenerateWithChoices = useCallback(async () => {
    if (!sessionId) return;

    const finalChoices = ambiguities.map(amb => ({
      ambiguityId: amb.id,
      choiceId: userChoices[amb.id] || amb.recommendation,
    }));

    await runGeneration(sessionId, finalChoices);
  }, [sessionId, ambiguities, userChoices, runGeneration]);

  // ─── Source File Fetch ────────────────────────────────────────────────

  const fetchSourceFile = useCallback(async (generatedPath: string) => {
    if (!sessionId || !analysisResult) return;
    setLoadingSource(true);
    setSourceFile(null);

    const fileName = generatedPath.split("/").pop()?.replace(".java", "") || "";
    let sourceClassName = "";

    if (fileName.endsWith("Controller")) {
      const domain = fileName.replace("Controller", "");
      const uc = analysisResult.irSummary.useCases.find(u =>
        u.domain.toLowerCase() === domain.toLowerCase()
      );
      if (uc) sourceClassName = uc.className;
    } else if (fileName.endsWith("RequestDTO")) {
      const baseName = fileName.replace("RequestDTO", "");
      const dto = analysisResult.irSummary.dtos.find(d =>
        d.className.replace("VoIn", "").replace("Dto", "") === baseName && d.direction === "in"
      );
      if (dto) sourceClassName = dto.className;
    } else if (fileName.endsWith("ResponseDTO")) {
      const baseName = fileName.replace("ResponseDTO", "");
      const dto = analysisResult.irSummary.dtos.find(d =>
        d.className.replace("VoOut", "").replace("Dto", "") === baseName && d.direction === "out"
      );
      if (dto) sourceClassName = dto.className;
    } else if (fileName.endsWith("Service") || fileName.endsWith("ServiceAdapter")) {
      const baseName = fileName.replace("ServiceAdapter", "").replace("Service", "");
      const svc = analysisResult.irSummary.remoteInterfaces.find(r =>
        r.className.replace("Remote", "").replace("Service", "").toLowerCase().includes(baseName.toLowerCase())
      );
      if (svc) sourceClassName = svc.className;
    } else {
      const en = analysisResult.irSummary.enums.find(e => e.className === fileName);
      if (en) sourceClassName = en.className;
      const ex = analysisResult.irSummary.exceptions.find(e => e.className === fileName);
      if (ex) sourceClassName = ex.className;
    }

    if (sourceClassName) {
      try {
        const res = await fetch(`/api/compleo/source/${sessionId}/${sourceClassName}.java`);
        if (res.ok) {
          const data = await res.json();
          setSourceFile({ path: data.path, content: data.content });
        }
      } catch {}
    }
    setLoadingSource(false);
  }, [sessionId, analysisResult]);

  // ─── File Select Handler ──────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: { path: string; content: string }) => {
    if (file.content) {
      setSelectedFile(file);
      fetchSourceFile(file.path);
    } else if (sessionId) {
      try {
        const res = await fetch(`/api/compleo/preview/${sessionId}/${file.path}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedFile({ path: file.path, content: data.content || "" });
          fetchSourceFile(file.path);
        }
      } catch {
        toast.error("Impossible de charger le fichier");
      }
    }
  }, [sessionId, fetchSourceFile]);

  // ─── Download Handler ─────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!sessionId) return;
    window.open(`/api/compleo/download/${sessionId}`, "_blank");
  }, [sessionId]);

  // ─── Session Restore Handler ──────────────────────────────────────────

  const handleRestoreSession = useCallback((sid: string) => {
    restoreSession(sid);
  }, [restoreSession]);

  // ─── Reset Handler ────────────────────────────────────────────────────

  const resetState = useCallback(() => {
    setSessionId(null);
    setAnalysisResult(null);
    setGenerationResult(null);
    setSelectedFile(null);
    setSourceFile(null);
    setUserChoices({});
    setCurrentAmbiguityIndex(0);
    setResultTab("code");
    setMultiTechResult(null);
    setPipelineStep("idle");
    setCompletedSteps(new Set());
    localStorage.removeItem(SESSION_KEY);
  }, []);

  // ─── Step navigation ──────────────────────────────────────────────────

  const handleStepNavigate = useCallback((step: PipelineStep) => {
    setPipelineStep(step);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="h-full flex flex-col bg-[oklch(0.13_0.01_250)]">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                <Package className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  Compleo
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px]">v5.4</Badge>
                </h1>
                <p className="text-xs text-[oklch(0.5_0.01_250)]">Java Legacy → Spring Boot</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Step Progress — visible when not idle */}
              {pipelineStep !== "idle" && (
                <div className="hidden md:block">
                  <StepProgress
                    current={pipelineStep}
                    onNavigate={handleStepNavigate}
                    completed={completedSteps}
                  />
                </div>
              )}

              <div className="flex items-center gap-1.5 ml-4">
                <Link href="/compleo/agent">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-emerald-500/30 text-emerald-400 hover:text-white hover:bg-emerald-500/20 gap-1 h-8 text-xs"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Agent</span>
                  </Button>
                </Link>
                <Link href="/compleo/rules">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[oklch(0.25_0.01_250)] text-[oklch(0.6_0.01_250)] hover:text-white h-8 text-xs"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Règles</span>
                  </Button>
                </Link>
                {pipelineStep !== "idle" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetState}
                    className="border-[oklch(0.25_0.01_250)] text-[oklch(0.6_0.01_250)] hover:text-white h-8 text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Nouveau</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Main Content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">

          {/* ═══ STATE: IDLE ═══════════════════════════════════════════ */}
          {pipelineStep === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto px-4 sm:px-6 py-8"
            >
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Importez votre projet Java Legacy</h2>
                <p className="text-[oklch(0.55_0.01_250)] text-sm">
                  EJB, Servlet, Struts, SOAP, JDBC, Hibernate, JMS, Batch...
                </p>
              </div>

              {/* DropZone — handles ZIP upload + Git clone internally */}
              <DropZone onUpload={handleUploadComplete} />

              {/* Features grid */}
              <div className="grid grid-cols-3 gap-3 mt-8">
                {[
                  { icon: Terminal, label: "13 Détecteurs", desc: "Servlet, EJB, Struts, SOAP..." },
                  { icon: Layers, label: "Spring Boot 3.2", desc: "REST, JPA, Kafka, Batch" },
                  { icon: Cloud, label: "Score Maturité", desc: "5 dimensions, effort estimé" },
                ].map(f => (
                  <div key={f.label} className="p-3 rounded-lg border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)]">
                    <f.icon className="w-4 h-4 text-emerald-400 mb-1.5" />
                    <p className="text-sm font-medium text-white">{f.label}</p>
                    <p className="text-xs text-[oklch(0.5_0.01_250)]">{f.desc}</p>
                  </div>
                ))}
              </div>

              {/* Session history */}
              <div className="mt-8">
                <SessionList onRestore={handleRestoreSession} />
              </div>
            </motion.div>
          )}

          {/* ═══ STATE: ANALYZING ═══════════════════════════════════════ */}
          {pipelineStep === "analyzing" && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl mx-auto px-4 sm:px-6 py-8"
            >
              {/* Analyzing indicator */}
              {analyzing && (
                <div className="flex flex-col items-center gap-4 py-16">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-400 animate-spin" />
                    <BarChart3 className="w-6 h-6 text-emerald-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-medium">Analyse multi-technologies en cours...</p>
                    <p className="text-sm text-[oklch(0.5_0.01_250)] mt-1">
                      Détection : EJB, Servlet, Struts, SOAP, JDBC, Hibernate, JMS, Batch
                    </p>
                  </div>
                </div>
              )}

              {/* Auto-generating (no ambiguities) */}
              {!analyzing && generating && (
                <div className="flex flex-col items-center gap-4 py-16">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                    <Zap className="w-6 h-6 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-medium">Génération Spring Boot en cours...</p>
                    <p className="text-sm text-[oklch(0.5_0.01_250)] mt-1">
                      {multiTechResult?.technologiesDetected.length || 0} technologies détectées
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ STATE: CHOICES ═══════════════════════════════════════ */}
          {pipelineStep === "choices" && analysisResult && ambiguities.length > 0 && (
            <motion.div
              key="choices"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto px-4 sm:px-6 py-6"
            >
              {/* Header banner */}
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 mb-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-white mb-1">
                      {ambiguities.length} choix à faire
                    </h3>
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleApplyAllRecommendations}
                        className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 h-7 text-xs"
                      >
                        <Star className="w-3 h-3 mr-1" />
                        Appliquer recommandations
                      </Button>
                      <span className="text-xs text-[oklch(0.5_0.01_250)]">
                        {resolvedCount}/{ambiguities.length} résolues
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Technologies detected summary */}
              {multiTechResult && multiTechResult.technologiesDetected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {multiTechResult.technologiesDetected.map(tech => (
                    <span key={tech} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${techColors[tech] || "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}>
                      {techLabels[tech] || tech}
                    </span>
                  ))}
                </div>
              )}

              {/* Current ambiguity card */}
              {currentAmbiguity && (
                <motion.div
                  key={currentAmbiguity.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] overflow-hidden mb-5"
                >
                  <div className="p-4 border-b border-[oklch(0.25_0.01_250)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        {currentAmbiguityIndex + 1}/{ambiguities.length}
                      </span>
                      <span className="text-sm text-[oklch(0.6_0.01_250)]">
                        {currentAmbiguity.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${severityColors[currentAmbiguity.severity]?.text} ${severityColors[currentAmbiguity.severity]?.border}`}
                    >
                      {currentAmbiguity.severity === "blocking" ? "Bloquant" :
                       currentAmbiguity.severity === "warning" ? "Warning" : "Info"}
                    </Badge>
                  </div>

                  <div className="p-4">
                    {/* Context */}
                    <div className="mb-3 space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[oklch(0.5_0.01_250)]">Classe :</span>
                        <span className="text-white font-mono text-xs">{currentAmbiguity.context.className}</span>
                      </div>
                      {currentAmbiguity.context.methodName && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-[oklch(0.5_0.01_250)]">Méthode :</span>
                          <span className="text-[oklch(0.7_0.01_250)] font-mono text-xs">{currentAmbiguity.context.signature || currentAmbiguity.context.methodName}</span>
                        </div>
                      )}
                    </div>

                    {/* Question */}
                    <div className="p-3 rounded-lg bg-[oklch(0.18_0.01_250)] border border-[oklch(0.25_0.01_250)] mb-4">
                      <div className="flex items-center gap-2 text-white text-sm font-medium">
                        <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        {currentAmbiguity.question}
                      </div>
                    </div>

                    {/* Options */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {currentAmbiguity.options.map(option => {
                        const isSelected = userChoices[currentAmbiguity.id] === option.id;
                        const isRecommended = currentAmbiguity.recommendation === option.id;
                        return (
                          <button
                            key={option.id}
                            onClick={() => handleChoice(currentAmbiguity.id, option.id)}
                            className={`relative p-3 rounded-lg border-2 text-left transition-all ${
                              isSelected
                                ? "border-emerald-400 bg-emerald-500/10"
                                : isRecommended
                                  ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-400"
                                  : "border-[oklch(0.25_0.01_250)] hover:border-[oklch(0.35_0.01_250)] bg-[oklch(0.18_0.01_250)]"
                            }`}
                          >
                            {isRecommended && (
                              <div className="absolute -top-2 left-3">
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px] px-1 py-0">
                                  <Star className="w-2.5 h-2.5 mr-0.5" />
                                  REC
                                </Badge>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                isSelected ? "border-emerald-400 bg-emerald-400" : "border-[oklch(0.4_0.01_250)]"
                              }`}>
                                {isSelected && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <span className={`text-sm font-semibold ${isSelected ? "text-emerald-400" : "text-white"}`}>
                                {option.label}
                              </span>
                            </div>
                            <p className="text-xs text-[oklch(0.6_0.01_250)] ml-6">{option.description}</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Recommendation reason */}
                    <div className="p-2.5 rounded-lg bg-[oklch(0.12_0.01_250)] border border-[oklch(0.22_0.01_250)]">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-[oklch(0.6_0.01_250)]">{currentAmbiguity.recommendationReason}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Navigation + Generate */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentAmbiguityIndex(Math.max(0, currentAmbiguityIndex - 1))}
                    disabled={currentAmbiguityIndex === 0}
                    className="border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)] hover:text-white h-8"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    Préc.
                  </Button>
                  <span className="text-xs text-[oklch(0.5_0.01_250)]">
                    {currentAmbiguityIndex + 1}/{ambiguities.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentAmbiguityIndex(Math.min(ambiguities.length - 1, currentAmbiguityIndex + 1))}
                    disabled={currentAmbiguityIndex === ambiguities.length - 1}
                    className="border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)] hover:text-white h-8"
                  >
                    Suiv.
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>

                <Button
                  onClick={handleGenerateWithChoices}
                  disabled={generating || !canGenerate}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white px-6"
                >
                  {generating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Génération...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" /> Générer ({resolvedCount}/{ambiguities.length})</>
                  )}
                </Button>
              </div>

              {/* Dots navigation */}
              <div className="flex items-center justify-center gap-1.5 mt-4">
                {ambiguities.map((amb, i) => {
                  const isResolved = !!userChoices[amb.id];
                  const isCurrent = i === currentAmbiguityIndex;
                  return (
                    <button
                      key={amb.id}
                      onClick={() => setCurrentAmbiguityIndex(i)}
                      className={`h-2 rounded-full transition-all ${
                        isCurrent ? "w-5 bg-emerald-400" : isResolved ? "w-2 bg-emerald-500/50" : "w-2 bg-[oklch(0.3_0.01_250)]"
                      }`}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ═══ STATE: RESULTS ═══════════════════════════════════════ */}
          {pipelineStep === "results" && generationResult && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full flex flex-col"
            >
              {/* Results header bar */}
              <div className="border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)] px-4 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-4 text-xs text-[oklch(0.5_0.01_250)]">
                    <span className="text-emerald-400 font-medium">{generationResult.stats.totalFiles} fichiers</span>
                    <span>{generationResult.stats.totalLinesGenerated.toLocaleString()} lignes</span>
                    {generationResult.choicesApplied != null && generationResult.choicesApplied > 0 && (
                      <span>{generationResult.choicesApplied} choix appliqués</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Tabs value={resultTab} onValueChange={(v) => setResultTab(v as any)}>
                    <TabsList className="h-7 bg-[oklch(0.18_0.01_250)] border border-[oklch(0.25_0.01_250)]">
                      <TabsTrigger value="code" className="text-xs h-5 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
                        <Code2 className="w-3 h-3 mr-1" />
                        Code
                      </TabsTrigger>
                      <TabsTrigger value="diff" className="text-xs h-5 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                        <GitCompare className="w-3 h-3 mr-1" />
                        Diff
                      </TabsTrigger>
                      <TabsTrigger value="architecture" className="text-xs h-5 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                        <Network className="w-3 h-3 mr-1" />
                        Archi
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button
                    size="sm"
                    onClick={handleDownload}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    ZIP
                  </Button>
                </div>
              </div>

              {/* Results content — split panel */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left: File Explorer */}
                <div className="w-64 border-r border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)] shrink-0 flex flex-col overflow-hidden">
                  <FileExplorer
                    files={explorerFiles}
                    selectedPath={selectedFile?.path || null}
                    onSelect={handleFileSelect}
                  />
                </div>

                {/* Right: Content area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {resultTab === "code" && (
                    <>
                      {selectedFile ? (
                        <CodeViewer
                          code={selectedFile.content}
                          filePath={selectedFile.path}
                        />
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-[oklch(0.4_0.01_250)] text-sm">
                          <div className="text-center">
                            <FileCode2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p>Sélectionnez un fichier dans l'arbre</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {resultTab === "diff" && (
                    <div className="flex-1 overflow-auto p-4">
                      {selectedFile && sourceFile ? (
                        <CodeDiff
                          sourceCode={sourceFile.content}
                          sourceFileName={sourceFile.path}
                          generatedCode={selectedFile.content}
                          generatedFileName={selectedFile.path}
                          category="service"
                        />
                      ) : selectedFile && !sourceFile ? (
                        <div className="flex items-center justify-center h-full text-[oklch(0.4_0.01_250)] text-sm">
                          <div className="text-center">
                            <Columns2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p>Pas de fichier source correspondant pour le diff</p>
                            {loadingSource && <Loader2 className="w-4 h-4 animate-spin mx-auto mt-2" />}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-[oklch(0.4_0.01_250)] text-sm">
                          Sélectionnez un fichier pour voir le diff
                        </div>
                      )}
                    </div>
                  )}

                  {resultTab === "architecture" && (
                    <div className="flex-1 overflow-auto p-4">
                      {analysisResult ? (
                        <ArchitectureDiagram
                          useCases={analysisResult.irSummary.useCases}
                          dtos={analysisResult.irSummary.dtos}
                          enums={analysisResult.irSummary.enums}
                          exceptions={analysisResult.irSummary.exceptions}
                          remoteInterfaces={analysisResult.irSummary.remoteInterfaces}
                          generatedFiles={generationResult.files}
                          domains={analysisResult.irSummary.domains}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-[oklch(0.4_0.01_250)] text-sm">
                          Données d'architecture non disponibles
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats footer */}
              <div className="border-t border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)] px-4 py-1.5 flex items-center gap-4 text-[10px] text-[oklch(0.4_0.01_250)] shrink-0">
                <span>Controllers: {generationResult.stats.controllers}</span>
                <span>Services: {generationResult.stats.services}</span>
                <span>DTOs: {generationResult.stats.dtos}</span>
                <span>Tests: {generationResult.stats.tests}</span>
                <span>Config: {generationResult.stats.configFiles}</span>
                <span>Cloud: {generationResult.stats.cloudFiles}</span>
                {multiTechResult?.technologiesDetected && (
                  <span className="ml-auto flex items-center gap-1">
                    {multiTechResult.technologiesDetected.map(t => (
                      <span key={t} className={`px-1 py-0 rounded text-[9px] border ${techColors[t] || ""}`}>
                        {techLabels[t] || t}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
