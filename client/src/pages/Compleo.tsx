/**
 * Compleo v2.0 — IHM de migration EJB → Spring Boot
 * Pipeline interactif : Upload → Analyse → Choix Difficiles → Génération → Résultats
 * @author Hamza NORDINE
 */

import { useState, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileCode2, Play, Download, Eye, FolderArchive,
  CheckCircle2, AlertTriangle, Loader2, ArrowRight, Package,
  Layers, Code2, TestTube, Cloud, FileText, ChevronRight,
  ChevronDown, RefreshCw, History, BarChart3,
  Terminal, Zap, Server, Database, Shield, Box,
  HelpCircle, Star, ArrowLeft, Lightbulb, Info,
  Columns2, GitCompare, Network,
} from "lucide-react";
import CodeDiff from "@/components/CodeDiff";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import { DebugPanel } from "@/components/DebugPanel";

// ─── Types ──────────────────────────────────────────────────────────────────

interface UploadResult {
  sessionId: string;
  projectName: string;
  fileCount: number;
  hasPom: boolean;
  hasBian: boolean;
  totalLines: number;
}

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
  files: { path: string; category: string; lines: number }[];
  choicesApplied?: number;
}

interface FilePreview {
  path: string;
  category: string;
  content: string;
  lines: number;
}

interface SessionInfo {
  id: string;
  projectName: string;
  uploadedAt: string;
  status: string;
  fileCount: number;
  useCaseCount: number;
  dtoCount: number;
  generatedFiles: number;
  ambiguityCount: number;
}

// Multi-tech v3.0 types
interface MultiTechComponent {
  className: string;
  technology: string;
  confidence: number;
  filePath: string;
  methods: { name: string; returnType: string; parameters: any[] }[];
}

interface MaturityScore {
  global: number;
  dimensions: {
    technicalComplexity: number;
    codeCoverage: number;
    breakingRisk: number;
    addedValue: number;
    engineConfidence: number;
  };
  label: string;
  attentionPoints: string[];
  estimatedEffort: string;
}

interface MigrationNote {
  title: string;
  content: string;
  severity: string;
  technology: string;
  affectedFiles: string[];
}

interface MultiTechResult {
  technologiesDetected: string[];
  maturityScore: MaturityScore;
  detectedComponents: MultiTechComponent[];
  migrationNotes: MigrationNote[];
  generatedFiles: { path: string; category: string; technology: string; lines: number }[];
}

// ─── Category helpers ───────────────────────────────────────────────────────

const categoryColors: Record<string, string> = {
  controller: "text-emerald-400",
  service: "text-cyan-400",
  dto: "text-amber-400",
  test: "text-violet-400",
  enum: "text-pink-400",
  exception: "text-red-400",
  validator: "text-orange-400",
  config: "text-blue-400",
  cloud: "text-teal-400",
  main: "text-green-400",
  migration: "text-yellow-400",
  infrastructure: "text-slate-400",
  entity: "text-indigo-400",
  repository: "text-sky-400",
  migration_note: "text-yellow-400",
};

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
  SERVLET: "Servlet",
  JSP: "JSP",
  EJB_2X: "EJB 2.x",
  EJB_3X_STATELESS: "EJB 3.x",
  EJB_3X_STATEFUL: "EJB 3.x Stateful",
  EJB_3X_MDB: "EJB MDB",
  STRUTS_1: "Struts 1",
  STRUTS_2: "Struts 2",
  SOAP: "SOAP/JAX-WS",
  JAX_RS: "JAX-RS",
  JDBC: "JDBC",
  HIBERNATE: "Hibernate",
  JPA: "JPA",
  JMS: "JMS",
  BATCH: "Java Batch",
  EAI_BOA: "EAI/BOA",
  SPRING_BOOT: "Spring Boot",
};

const categoryIcons: Record<string, typeof Code2> = {
  controller: Server,
  service: Layers,
  dto: Database,
  test: TestTube,
  enum: Box,
  exception: Shield,
  validator: CheckCircle2,
  config: FileText,
  cloud: Cloud,
  main: Zap,
  migration: FileText,
};

function getCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    controller: "Controller",
    service: "Service",
    dto: "DTO",
    test: "Test",
    enum: "Enum",
    exception: "Exception",
    validator: "Validator",
    config: "Config",
    cloud: "Cloud",
    main: "Main",
    migration: "Report",
  };
  return labels[cat] || cat;
}

const ambiguityTypeLabels: Record<string, string> = {
  HTTP_VERB_AMBIGUOUS: "Methode HTTP",
  URL_STRUCTURE_AMBIGUOUS: "Structure URL",
  RETURN_TYPE_AMBIGUOUS: "Type de retour",
  CLASS_GROUPING_AMBIGUOUS: "Regroupement",
  TRANSACTION_AMBIGUOUS: "Transaction",
  EXTERNAL_DEPENDENCY: "Dependance externe",
  DOMAIN_NAME_AMBIGUOUS: "Nom de domaine",
};

const ambiguityTypeIcons: Record<string, typeof Code2> = {
  HTTP_VERB_AMBIGUOUS: Server,
  URL_STRUCTURE_AMBIGUOUS: Code2,
  RETURN_TYPE_AMBIGUOUS: Database,
  CLASS_GROUPING_AMBIGUOUS: Layers,
  TRANSACTION_AMBIGUOUS: Shield,
  EXTERNAL_DEPENDENCY: Box,
  DOMAIN_NAME_AMBIGUOUS: HelpCircle,
};

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  blocking: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  warning: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  info: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function CompleoPage() {
  // Step state — now includes "choices" between analyze and generate
  const [step, setStep] = useState<"upload" | "analyze" | "choices" | "generate" | "preview">("upload");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Ambiguity choices state
  const [userChoices, setUserChoices] = useState<Record<string, string>>({});
  const [currentAmbiguityIndex, setCurrentAmbiguityIndex] = useState(0);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);

  // Preview state
  const [previewFile, setPreviewFile] = useState<FilePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [resultTab, setResultTab] = useState<"code" | "diff" | "architecture">("code");
  const [sourceFile, setSourceFile] = useState<{ path: string; content: string } | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);

  // History state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showHistory, setShowHistory] = useState(false);

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

  // ─── Upload Handler ─────────────────────────────────────────────────────

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      toast.error("Seuls les fichiers ZIP sont acceptes");
      return;
    }

    setUploading(true);
    setUploadResult(null);
    setAnalysisResult(null);
    setGenerationResult(null);
    setPreviewFile(null);
    setUserChoices({});
    setCurrentAmbiguityIndex(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/compleo/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const data: UploadResult = await res.json();
      setUploadResult(data);
      setStep("analyze");
      toast.success(`${data.fileCount} fichiers Java extraits`);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }, [handleUpload]);

  // ─── Analyze Handler ────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!uploadResult) return;
    setAnalyzing(true);

    try {
      // Use multi-tech endpoint (v3.0)
      const res = await fetch("/api/compleo/analyze-multitech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: uploadResult.sessionId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }

      const data = await res.json();

      // Store multi-tech results
      setMultiTechResult({
        technologiesDetected: data.technologiesDetected || [],
        maturityScore: data.maturityScore,
        detectedComponents: data.detectedComponents || [],
        migrationNotes: data.migrationNotes || [],
        generatedFiles: data.generatedFiles || [],
      });

      // Also store as AnalysisResult for backward compatibility
      setAnalysisResult(data as AnalysisResult);

      const techCount = data.technologiesDetected?.length || 0;
      const compCount = data.detectedComponents?.length || 0;

      if (data.ambiguities && data.ambiguities.length > 0) {
        setStep("choices");
        toast.success(`${techCount} technologies, ${compCount} composants — ${data.ambiguities.length} choix a faire`);
      } else {
        setStep("generate");
        toast.success(`${techCount} technologies, ${compCount} composants detectes`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'analyse");
    } finally {
      setAnalyzing(false);
    }
  }, [uploadResult]);

  // ─── Choice Handlers ───────────────────────────────────────────────────

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
    toast.success("Toutes les recommandations appliquees");
  }, [ambiguities, userChoices]);

  // ─── Generate Handler (with choices) ───────────────────────────────────

  const handleGenerateWithChoices = useCallback(async () => {
    if (!uploadResult) return;
    setGenerating(true);

    try {
      // If there are ambiguities, use the resolve endpoint
      if (ambiguities.length > 0) {
        // Fill in recommendations for any unresolved non-blocking ambiguities
        const finalChoices = ambiguities.map(amb => ({
          ambiguityId: amb.id,
          choiceId: userChoices[amb.id] || amb.recommendation,
        }));

        const res = await fetch(`/api/compleo/resolve/${uploadResult.sessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choices: finalChoices }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Resolution failed");
        }

        const data: GenerationResult = await res.json();
        setGenerationResult(data);
        setStep("preview");
        toast.success(`${data.stats.totalFiles} fichiers Spring Boot generes`);
      } else {
        // No ambiguities — use the generate endpoint directly
        const res = await fetch("/api/compleo/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: uploadResult.sessionId }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Generation failed");
        }

        const data: GenerationResult = await res.json();
        setGenerationResult(data);
        setStep("preview");
        toast.success(`${data.stats.totalFiles} fichiers Spring Boot generes`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la generation");
    } finally {
      setGenerating(false);
    }
  }, [uploadResult, ambiguities, userChoices]);

  // ─── Source File Fetch Handler ──────────────────────────────────────────

  const fetchSourceFile = useCallback(async (generatedPath: string) => {
    if (!uploadResult || !analysisResult) return;
    setLoadingSource(true);
    setSourceFile(null);

    // Infer source file name from generated file name
    const fileName = generatedPath.split("/").pop()?.replace(".java", "") || "";
    let sourceClassName = "";

    // Controller → UseCase mapping
    if (fileName.endsWith("Controller")) {
      const domain = fileName.replace("Controller", "");
      const uc = analysisResult.irSummary.useCases.find(u =>
        u.domain.toLowerCase() === domain.toLowerCase()
      );
      if (uc) sourceClassName = uc.className;
    }
    // RequestDTO → VoIn mapping
    else if (fileName.endsWith("RequestDTO")) {
      const baseName = fileName.replace("RequestDTO", "");
      const dto = analysisResult.irSummary.dtos.find(d =>
        d.className.replace("VoIn", "").replace("Dto", "") === baseName && d.direction === "in"
      );
      if (dto) sourceClassName = dto.className;
    }
    // ResponseDTO → VoOut mapping
    else if (fileName.endsWith("ResponseDTO")) {
      const baseName = fileName.replace("ResponseDTO", "");
      const dto = analysisResult.irSummary.dtos.find(d =>
        d.className.replace("VoOut", "").replace("Dto", "") === baseName && d.direction === "out"
      );
      if (dto) sourceClassName = dto.className;
    }
    // Service → RemoteInterface mapping
    else if (fileName.endsWith("Service") || fileName.endsWith("ServiceAdapter")) {
      const baseName = fileName.replace("ServiceAdapter", "").replace("Service", "");
      const svc = analysisResult.irSummary.remoteInterfaces.find(r =>
        r.className.replace("Remote", "").replace("Service", "").toLowerCase().includes(baseName.toLowerCase())
      );
      if (svc) sourceClassName = svc.className;
    }
    // Enum → same name
    else {
      const en = analysisResult.irSummary.enums.find(e => e.className === fileName);
      if (en) sourceClassName = en.className;
      const ex = analysisResult.irSummary.exceptions.find(e => e.className === fileName);
      if (ex) sourceClassName = ex.className;
    }

    if (sourceClassName) {
      try {
        const res = await fetch(`/api/compleo/source/${uploadResult.sessionId}/${sourceClassName}.java`);
        if (res.ok) {
          const data = await res.json();
          setSourceFile({ path: data.path, content: data.content });
        }
      } catch {
        // No source found — that's OK
      }
    }
    setLoadingSource(false);
  }, [uploadResult, analysisResult]);

  // ─── Preview Handler ────────────────────────────────────────────────────

  const handlePreviewFile = useCallback(async (filePath: string) => {
    if (!uploadResult) return;
    setLoadingPreview(true);

    try {
      const res = await fetch(`/api/compleo/preview/${uploadResult.sessionId}/${filePath}`);
      if (!res.ok) throw new Error("Preview failed");
      const data: FilePreview = await res.json();
      setPreviewFile(data);
      // Also fetch the source file for diff view
      fetchSourceFile(filePath);
    } catch (err: any) {
      toast.error("Impossible de charger le fichier");
    } finally {
      setLoadingPreview(false);
    }
  }, [uploadResult, fetchSourceFile]);

  // ─── Download Handler ───────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!uploadResult) return;
    window.open(`/api/compleo/download/${uploadResult.sessionId}`, "_blank");
  }, [uploadResult]);

  // ─── History Handler ────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/compleo/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // ignore
    }
  }, []);

  // ─── Reset Handler ──────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setStep("upload");
    setUploadResult(null);
    setAnalysisResult(null);
    setGenerationResult(null);
    setPreviewFile(null);
    setSourceFile(null);
    setExpandedCategories(new Set());
    setUserChoices({});
    setCurrentAmbiguityIndex(0);
    setResultTab("code");
    setMultiTechResult(null);
  }, []);

  // ─── Toggle category ───────────────────────────────────────────────────

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // ─── Group files by category ──────────────────────────────────────────

  const filesByCategory = useMemo(() =>
    generationResult?.files.reduce((acc, f) => {
      if (!acc[f.category]) acc[f.category] = [];
      acc[f.category].push(f);
      return acc;
    }, {} as Record<string, typeof generationResult.files>) ?? {},
  [generationResult]);

  // ─── Steps indicator ──────────────────────────────────────────────────

  const steps = [
    { id: "upload", label: "Upload", icon: Upload },
    { id: "analyze", label: "Analyse", icon: BarChart3 },
    { id: "choices", label: "Choix", icon: HelpCircle },
    { id: "generate", label: "Generation", icon: Zap },
    { id: "preview", label: "Resultats", icon: Eye },
  ] as const;

  const stepIndex = steps.findIndex(s => s.id === step);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[oklch(0.13_0.01_250)]">
      {/* Header */}
      <div className="border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  Compleo
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-xs">v3.0</Badge>
                </h1>
                <p className="text-sm text-[oklch(0.6_0.01_250)]">Multi-Technology → Spring Boot Migration Engine</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
                className="border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)] hover:text-white hover:bg-[oklch(0.2_0.01_250)]"
              >
                <History className="w-4 h-4 mr-1" />
                Historique
              </Button>
              {step !== "upload" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)] hover:text-white hover:bg-[oklch(0.2_0.01_250)]"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Nouveau
                </Button>
              )}
            </div>
          </div>

          {/* Steps indicator */}
          <div className="flex items-center gap-2 mt-4">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === stepIndex;
              const isDone = i < stepIndex;
              // Skip "choices" step in indicator if no ambiguities
              if (s.id === "choices" && ambiguities.length === 0 && step !== "choices") return null;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  {i > 0 && (
                    <ArrowRight className={`w-4 h-4 ${isDone ? "text-emerald-400" : "text-[oklch(0.3_0.01_250)]"}`} />
                  )}
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    isActive
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : isDone
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "text-[oklch(0.4_0.01_250)]"
                  }`}>
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* History panel */}
      <AnimatePresence>
        {showHistory && sessions.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)] overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-6 py-4">
              <h3 className="text-sm font-semibold text-[oklch(0.7_0.01_250)] mb-3">Sessions precedentes</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sessions.map(s => (
                  <div key={s.id} className="p-3 rounded-lg border border-[oklch(0.25_0.01_250)] bg-[oklch(0.16_0.01_250)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white truncate">{s.projectName}</span>
                      <Badge variant="outline" className={`text-xs ${
                        s.status === "generated" ? "text-emerald-400 border-emerald-500/30" :
                        s.status === "waiting_choices" ? "text-amber-400 border-amber-500/30" :
                        s.status === "analyzed" ? "text-cyan-400 border-cyan-500/30" :
                        "text-[oklch(0.5_0.01_250)] border-[oklch(0.3_0.01_250)]"
                      }`}>{s.status}</Badge>
                    </div>
                    <div className="text-xs text-[oklch(0.5_0.01_250)]">
                      {s.fileCount} fichiers · {s.useCaseCount} UC · {s.ambiguityCount > 0 ? `${s.ambiguityCount} choix` : ""} {s.generatedFiles > 0 ? `· ${s.generatedFiles} generes` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Step 1: Upload */}
        {step === "upload" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Uploadez votre projet Java Legacy</h2>
                <p className="text-[oklch(0.6_0.01_250)]">
                  Glissez-deposez un fichier ZIP contenant votre projet Maven (EJB, Servlet, Struts, SOAP, JDBC, Hibernate, JMS, Batch...)
                </p>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative cursor-pointer border-2 border-dashed rounded-xl p-16 text-center transition-all ${
                  dragOver
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-[oklch(0.3_0.01_250)] hover:border-emerald-500/50 hover:bg-[oklch(0.16_0.01_250)]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
                    <p className="text-[oklch(0.7_0.01_250)]">Extraction du ZIP en cours...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-[oklch(0.2_0.01_250)] flex items-center justify-center">
                      <FolderArchive className={`w-8 h-8 ${dragOver ? "text-emerald-400" : "text-[oklch(0.5_0.01_250)]"}`} />
                    </div>
                    <div>
                      <p className="text-white font-medium mb-1">Glissez votre fichier ZIP ici</p>
                      <p className="text-sm text-[oklch(0.5_0.01_250)]">ou cliquez pour parcourir</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[oklch(0.4_0.01_250)]">
                      <span>Format: ZIP</span>
                      <span>·</span>
                      <span>Max: 100 MB</span>
                      <span>·</span>
                      <span>Projet Maven EJB</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Features grid */}
                <div className="grid grid-cols-3 gap-4 mt-8">
                {[
                  { icon: Terminal, label: "13 Detecteurs", desc: "Servlet, EJB, Struts, SOAP, JDBC, JMS..." },
                  { icon: Layers, label: "Spring Boot 3.2", desc: "REST, JPA, Kafka, Spring Batch" },
                  { icon: Cloud, label: "Score de Maturite", desc: "5 dimensions, effort estime" },
                ].map(f => (
                  <div key={f.label} className="p-4 rounded-lg border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)]">
                    <f.icon className="w-5 h-5 text-emerald-400 mb-2" />
                    <p className="text-sm font-medium text-white">{f.label}</p>
                    <p className="text-xs text-[oklch(0.5_0.01_250)]">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 2: Analyze */}
        {step === "analyze" && uploadResult && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="max-w-3xl mx-auto">
              {/* Upload summary */}
              <div className="p-6 rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    Projet uploade
                  </h3>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                    {uploadResult.projectName}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Fichiers Java", value: uploadResult.fileCount },
                    { label: "Lignes de code", value: uploadResult.totalLines.toLocaleString() },
                    { label: "pom.xml", value: uploadResult.hasPom ? "Detecte" : "Non trouve" },
                    { label: "BIAN mapping", value: uploadResult.hasBian ? "Detecte" : "Non trouve" },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="text-xl font-bold text-white">{s.value}</div>
                      <div className="text-xs text-[oklch(0.5_0.01_250)]">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Analyze button */}
              <div className="text-center">
                <Button
                  size="lg"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white px-8"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Analyse multi-technologies en cours...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 mr-2" />
                      Lancer l'analyse multi-technologies
                    </>
                  )}
                </Button>
                <p className="text-sm text-[oklch(0.5_0.01_250)] mt-2">
                  Detection automatique : EJB, Servlet, Struts, SOAP, JDBC, Hibernate, JMS, Batch, JPA, JAX-RS
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 2.5: Choix Difficiles */}
        {step === "choices" && analysisResult && ambiguities.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="max-w-4xl mx-auto">
              {/* Header banner */}
              <div className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 mb-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {ambiguities.length} point{ambiguities.length > 1 ? "s" : ""} necessitent votre attention
                    </h3>
                    <p className="text-sm text-[oklch(0.6_0.01_250)] mb-3">
                      Le moteur a detecte des ambiguites qu'il ne peut pas resoudre automatiquement.
                      Vos choix guideront la generation du code.
                    </p>
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleApplyAllRecommendations}
                        className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                      >
                        <Star className="w-4 h-4 mr-1" />
                        Appliquer toutes les recommandations
                      </Button>
                      <div className="text-sm text-[oklch(0.5_0.01_250)]">
                        {resolvedCount}/{ambiguities.length} resolues
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analysis summary (collapsed) */}
              <div className="p-4 rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-medium text-white">{analysisResult.projectName}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[oklch(0.5_0.01_250)]">
                    <span>{analysisResult.stats?.useCaseCount || 0} UseCases</span>
                    <span>{analysisResult.stats?.dtoCount || 0} DTOs</span>
                    <span>{multiTechResult?.detectedComponents?.length || 0} composants</span>
                  </div>
                </div>
                {multiTechResult && multiTechResult.technologiesDetected.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {multiTechResult.technologiesDetected.map(tech => (
                      <span key={tech} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${techColors[tech] || "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}>
                        {techLabels[tech] || tech}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Current ambiguity card */}
              {currentAmbiguity && (
                <motion.div
                  key={currentAmbiguity.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] overflow-hidden mb-6"
                >
                  {/* Card header */}
                  <div className="p-4 border-b border-[oklch(0.25_0.01_250)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">
                        {currentAmbiguityIndex + 1}/{ambiguities.length}
                      </span>
                      <span className="text-sm text-[oklch(0.7_0.01_250)]">
                        {ambiguityTypeLabels[currentAmbiguity.type] || currentAmbiguity.type}
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

                  {/* Context */}
                  <div className="p-5">
                    <div className="mb-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[oklch(0.5_0.01_250)]">Classe :</span>
                        <span className="text-white font-mono">{currentAmbiguity.context.className}</span>
                      </div>
                      {currentAmbiguity.context.methodName && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-[oklch(0.5_0.01_250)]">Methode :</span>
                          <span className="text-[oklch(0.7_0.01_250)] font-mono">{currentAmbiguity.context.signature || currentAmbiguity.context.methodName}</span>
                        </div>
                      )}
                      {currentAmbiguity.context.packageName && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-[oklch(0.5_0.01_250)]">Package :</span>
                          <span className="text-[oklch(0.6_0.01_250)] font-mono text-xs">{currentAmbiguity.context.packageName}</span>
                        </div>
                      )}
                      {currentAmbiguity.context.javadoc && (
                        <div className="flex items-start gap-2 text-sm mt-2">
                          <FileText className="w-4 h-4 text-[oklch(0.5_0.01_250)] mt-0.5 flex-shrink-0" />
                          <span className="text-[oklch(0.7_0.01_250)] italic">"{currentAmbiguity.context.javadoc}"</span>
                        </div>
                      )}
                      {currentAmbiguity.context.injectedType && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-[oklch(0.5_0.01_250)]">Dependance :</span>
                          <span className="text-amber-400 font-mono">{currentAmbiguity.context.injectedType}</span>
                        </div>
                      )}
                    </div>

                    {/* Question */}
                    <div className="p-3 rounded-lg bg-[oklch(0.18_0.01_250)] border border-[oklch(0.25_0.01_250)] mb-5">
                      <div className="flex items-center gap-2 text-white font-medium">
                        <HelpCircle className="w-4 h-4 text-amber-400" />
                        {currentAmbiguity.question}
                      </div>
                    </div>

                    {/* Options grid */}
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      {currentAmbiguity.options.map(option => {
                        const isSelected = userChoices[currentAmbiguity.id] === option.id;
                        const isRecommended = currentAmbiguity.recommendation === option.id;
                        return (
                          <button
                            key={option.id}
                            onClick={() => handleChoice(currentAmbiguity.id, option.id)}
                            className={`relative p-4 rounded-lg border-2 text-left transition-all ${
                              isSelected
                                ? "border-emerald-400 bg-emerald-500/10"
                                : isRecommended
                                  ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-400"
                                  : "border-[oklch(0.25_0.01_250)] hover:border-[oklch(0.35_0.01_250)] bg-[oklch(0.18_0.01_250)]"
                            }`}
                          >
                            {isRecommended && (
                              <div className="absolute -top-2.5 left-3">
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                                  <Star className="w-3 h-3 mr-0.5" />
                                  RECOMMANDE
                                </Badge>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                isSelected ? "border-emerald-400 bg-emerald-400" : "border-[oklch(0.4_0.01_250)]"
                              }`}>
                                {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                              <span className={`font-semibold ${isSelected ? "text-emerald-400" : "text-white"}`}>
                                {option.label}
                              </span>
                            </div>
                            <p className="text-xs text-[oklch(0.6_0.01_250)] ml-7">{option.description}</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Recommendation reason */}
                    <div className="p-3 rounded-lg bg-[oklch(0.12_0.01_250)] border border-[oklch(0.22_0.01_250)]">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-xs font-medium text-amber-400">Pourquoi le moteur recommande {currentAmbiguity.recommendation} :</span>
                          <p className="text-xs text-[oklch(0.6_0.01_250)] mt-0.5">{currentAmbiguity.recommendationReason}</p>
                        </div>
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
                    className="border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)] hover:text-white"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Precedent
                  </Button>
                  <span className="text-sm text-[oklch(0.5_0.01_250)]">
                    Ambiguite {currentAmbiguityIndex + 1} sur {ambiguities.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentAmbiguityIndex(Math.min(ambiguities.length - 1, currentAmbiguityIndex + 1))}
                    disabled={currentAmbiguityIndex === ambiguities.length - 1}
                    className="border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)] hover:text-white"
                  >
                    Suivant
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>

                <Button
                  size="lg"
                  onClick={handleGenerateWithChoices}
                  disabled={generating || !canGenerate}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white px-8"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Generation en cours...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2" />
                      Generer le code avec mes choix
                    </>
                  )}
                </Button>
              </div>

              {/* Ambiguity dots navigation */}
              <div className="flex items-center justify-center gap-1.5 mt-4">
                {ambiguities.map((amb, i) => {
                  const isResolved = !!userChoices[amb.id];
                  const isCurrent = i === currentAmbiguityIndex;
                  return (
                    <button
                      key={amb.id}
                      onClick={() => setCurrentAmbiguityIndex(i)}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        isCurrent
                          ? "w-6 bg-emerald-400"
                          : isResolved
                            ? "bg-emerald-500/50"
                            : "bg-[oklch(0.3_0.01_250)]"
                      }`}
                      title={`Ambiguite ${i + 1}: ${isResolved ? "resolue" : "en attente"}`}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 3: Generate (no ambiguities path) */}
        {step === "generate" && analysisResult && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="max-w-4xl mx-auto">
              {/* Multi-tech summary */}
              {multiTechResult && (
                <div className="p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Layers className="w-5 h-5 text-emerald-400" />
                      Technologies detectees
                    </h3>
                    {multiTechResult.maturityScore && (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-emerald-400">{multiTechResult.maturityScore.global}/100</div>
                          <div className="text-xs text-[oklch(0.5_0.01_250)]">{multiTechResult.maturityScore.label}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Technology badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {multiTechResult.technologiesDetected.map(tech => (
                      <span key={tech} className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${techColors[tech] || "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}>
                        {techLabels[tech] || tech}
                      </span>
                    ))}
                  </div>

                  {/* Maturity dimensions */}
                  {multiTechResult.maturityScore && (
                    <div className="grid grid-cols-5 gap-2 mb-4">
                      {[
                        { label: "Complexite", value: multiTechResult.maturityScore.dimensions.technicalComplexity },
                        { label: "Couverture", value: multiTechResult.maturityScore.dimensions.codeCoverage },
                        { label: "Risque", value: multiTechResult.maturityScore.dimensions.breakingRisk },
                        { label: "Valeur", value: multiTechResult.maturityScore.dimensions.addedValue },
                        { label: "Confiance", value: multiTechResult.maturityScore.dimensions.engineConfidence },
                      ].map(d => (
                        <div key={d.label} className="p-2 rounded-lg bg-[oklch(0.15_0.01_250)] text-center">
                          <div className="text-lg font-bold text-white">{d.value}<span className="text-xs text-[oklch(0.5_0.01_250)]">/100</span></div>
                          <div className="text-xs text-[oklch(0.5_0.01_250)]">{d.label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Effort estimate */}
                  {multiTechResult.maturityScore?.estimatedEffort && (
                    <div className="flex items-center gap-2 text-sm text-[oklch(0.6_0.01_250)]">
                      <Info className="w-4 h-4 text-cyan-400" />
                      Effort estime : <span className="text-white font-medium">{multiTechResult.maturityScore.estimatedEffort}</span>
                    </div>
                  )}

                  {/* Detected components summary */}
                  {multiTechResult.detectedComponents.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[oklch(0.25_0.01_250)]">
                      <h4 className="text-sm font-medium text-[oklch(0.7_0.01_250)] mb-2">
                        {multiTechResult.detectedComponents.length} composants detectes
                      </h4>
                      <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                        {multiTechResult.detectedComponents.map((comp, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 rounded bg-[oklch(0.15_0.01_250)]">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${techColors[comp.technology] || "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}>
                              {techLabels[comp.technology] || comp.technology}
                            </span>
                            <span className="text-sm text-white truncate">{comp.className}</span>
                            <span className="text-xs text-[oklch(0.4_0.01_250)] ml-auto">{comp.confidence}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Migration notes */}
                  {multiTechResult.migrationNotes.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[oklch(0.25_0.01_250)]">
                      <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" />
                        {multiTechResult.migrationNotes.length} note(s) de migration
                      </h4>
                      {multiTechResult.migrationNotes.map((note, i) => (
                        <div key={i} className={`p-2 rounded mb-1 text-sm ${
                          note.severity === "critical" ? "bg-red-500/10 text-red-300" :
                          note.severity === "warning" ? "bg-amber-500/10 text-amber-300" :
                          "bg-blue-500/10 text-blue-300"
                        }`}>
                          <span className="font-medium">{note.title}</span>
                          <span className="text-xs ml-2 opacity-70">{note.content}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Analysis results */}
              <div className="p-6 rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] mb-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Analyse EJB/BOA — {analysisResult.projectName}
                </h3>

                {/* Stats grid */}
                <div className="grid grid-cols-5 gap-3 mb-6">
                  {[
                    { label: "UseCases", value: analysisResult.stats?.useCaseCount || 0, color: "text-emerald-400" },
                    { label: "DTOs", value: analysisResult.stats?.dtoCount || 0, color: "text-amber-400" },
                    { label: "Services", value: analysisResult.stats?.serviceCount || 0, color: "text-cyan-400" },
                    { label: "Enums", value: analysisResult.stats?.enumCount || 0, color: "text-pink-400" },
                    { label: "Exceptions", value: analysisResult.stats?.exceptionCount || 0, color: "text-red-400" },
                  ].map(s => (
                    <div key={s.label} className="p-3 rounded-lg bg-[oklch(0.18_0.01_250)] text-center">
                      <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-[oklch(0.5_0.01_250)]">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Warnings */}
                {analysisResult.warnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
                    <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-1">
                      <AlertTriangle className="w-4 h-4" />
                      {analysisResult.warnings.length} avertissement(s)
                    </div>
                    {analysisResult.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-300/70 ml-6">{w}</p>
                    ))}
                  </div>
                )}

                {/* UseCases table */}
                <Tabs defaultValue="usecases" className="mt-4">
                  <TabsList className="bg-[oklch(0.18_0.01_250)] border border-[oklch(0.25_0.01_250)]">
                    <TabsTrigger value="usecases" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
                      UseCases ({analysisResult.irSummary.useCases.length})
                    </TabsTrigger>
                    <TabsTrigger value="dtos" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                      DTOs ({analysisResult.irSummary.dtos.length})
                    </TabsTrigger>
                    <TabsTrigger value="enums" className="data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400">
                      Enums ({analysisResult.irSummary.enums.length})
                    </TabsTrigger>
                    <TabsTrigger value="exceptions" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
                      Exceptions ({analysisResult.irSummary.exceptions.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="usecases">
                    <ScrollArea className="h-[300px]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[oklch(0.25_0.01_250)]">
                            <th className="text-left py-2 px-3 text-[oklch(0.5_0.01_250)] font-medium">UseCase</th>
                            <th className="text-left py-2 px-3 text-[oklch(0.5_0.01_250)] font-medium">Method</th>
                            <th className="text-left py-2 px-3 text-[oklch(0.5_0.01_250)] font-medium">REST Path</th>
                            <th className="text-left py-2 px-3 text-[oklch(0.5_0.01_250)] font-medium">BIAN</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.irSummary.useCases.map((uc, i) => (
                            <tr key={i} className="border-b border-[oklch(0.2_0.01_250)] hover:bg-[oklch(0.18_0.01_250)]">
                              <td className="py-2 px-3 text-white font-mono text-xs">{uc.className}</td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className={`text-xs ${
                                  uc.httpMethod === "GET" ? "text-green-400 border-green-500/30" :
                                  uc.httpMethod === "POST" ? "text-blue-400 border-blue-500/30" :
                                  uc.httpMethod === "PUT" ? "text-amber-400 border-amber-500/30" :
                                  "text-red-400 border-red-500/30"
                                }`}>{uc.httpMethod}</Badge>
                              </td>
                              <td className="py-2 px-3 text-[oklch(0.7_0.01_250)] font-mono text-xs">{uc.restPath}</td>
                              <td className="py-2 px-3 text-[oklch(0.5_0.01_250)] text-xs">{uc.bianDomain}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="dtos">
                    <ScrollArea className="h-[300px]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[oklch(0.25_0.01_250)]">
                            <th className="text-left py-2 px-3 text-[oklch(0.5_0.01_250)] font-medium">DTO</th>
                            <th className="text-left py-2 px-3 text-[oklch(0.5_0.01_250)] font-medium">Direction</th>
                            <th className="text-left py-2 px-3 text-[oklch(0.5_0.01_250)] font-medium">Champs</th>
                            <th className="text-left py-2 px-3 text-[oklch(0.5_0.01_250)] font-medium">Requis</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.irSummary.dtos.map((d, i) => (
                            <tr key={i} className="border-b border-[oklch(0.2_0.01_250)] hover:bg-[oklch(0.18_0.01_250)]">
                              <td className="py-2 px-3 text-white font-mono text-xs">{d.className}</td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className={`text-xs ${
                                  d.direction === "in" ? "text-blue-400 border-blue-500/30" :
                                  d.direction === "out" ? "text-green-400 border-green-500/30" :
                                  "text-gray-400 border-gray-500/30"
                                }`}>{d.direction}</Badge>
                              </td>
                              <td className="py-2 px-3 text-[oklch(0.7_0.01_250)]">{d.fieldCount}</td>
                              <td className="py-2 px-3 text-[oklch(0.7_0.01_250)]">{d.requiredFields}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="enums">
                    <ScrollArea className="h-[300px]">
                      <div className="grid grid-cols-2 gap-2 p-2">
                        {analysisResult.irSummary.enums.map((e, i) => (
                          <div key={i} className="p-3 rounded-lg bg-[oklch(0.18_0.01_250)] border border-[oklch(0.25_0.01_250)]">
                            <span className="text-white font-mono text-xs">{e.className}</span>
                            <span className="text-[oklch(0.5_0.01_250)] text-xs ml-2">({e.valueCount} valeurs)</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="exceptions">
                    <ScrollArea className="h-[300px]">
                      <div className="grid grid-cols-2 gap-2 p-2">
                        {analysisResult.irSummary.exceptions.map((e, i) => (
                          <div key={i} className="p-3 rounded-lg bg-[oklch(0.18_0.01_250)] border border-[oklch(0.25_0.01_250)]">
                            <span className="text-red-400 font-mono text-xs">{e.className}</span>
                            <span className="text-[oklch(0.5_0.01_250)] text-xs ml-2">extends {e.extendsClass}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Generate button */}
              <div className="text-center">
                <Button
                  size="lg"
                  onClick={handleGenerateWithChoices}
                  disabled={generating}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white px-8"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Generation Spring Boot en cours...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2" />
                      Generer le projet Spring Boot
                    </>
                  )}
                </Button>
                <p className="text-sm text-[oklch(0.5_0.01_250)] mt-2">
                  Controllers REST, Services, DTOs, Tests MockMvc, Dockerfile, K8s
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 4: Preview & Download */}
        {step === "preview" && generationResult && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Generation stats */}
            <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Projet Spring Boot genere
                  {generationResult.choicesApplied && generationResult.choicesApplied > 0 && (
                    <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-xs ml-2">
                      {generationResult.choicesApplied} choix appliques
                    </Badge>
                  )}
                </h3>
                <Button
                  onClick={handleDownload}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Telecharger ZIP
                </Button>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: "Fichiers", value: generationResult.stats.totalFiles, color: "text-white" },
                  { label: "Lignes", value: generationResult.stats.totalLinesGenerated.toLocaleString(), color: "text-emerald-400" },
                  { label: "Controllers", value: generationResult.stats.controllers, color: "text-cyan-400" },
                  { label: "DTOs", value: generationResult.stats.dtos, color: "text-amber-400" },
                  { label: "Tests", value: generationResult.stats.tests, color: "text-violet-400" },
                ].map(s => (
                  <div key={s.label} className="p-3 rounded-lg bg-[oklch(0.15_0.01_250)] text-center">
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-[oklch(0.5_0.01_250)]">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Result view tabs */}
            <div className="flex items-center gap-2 mb-4">
              {[
                { id: "code" as const, label: "Code", icon: Code2 },
                { id: "diff" as const, label: "Diff Legacy/New", icon: Columns2 },
                { id: "architecture" as const, label: "Architecture", icon: Network },
              ].map(tab => {
                const TabIcon = tab.icon;
                const isActive = resultTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setResultTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "text-[oklch(0.6_0.01_250)] hover:text-white hover:bg-[oklch(0.2_0.01_250)] border border-transparent"
                    }`}
                  >
                    <TabIcon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab: Code browser */}
            {resultTab === "code" && (
              <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 28rem)" }}>
                {/* File tree */}
                <div className="col-span-4 rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] overflow-hidden">
                  <div className="p-3 border-b border-[oklch(0.25_0.01_250)]">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <FolderArchive className="w-4 h-4 text-emerald-400" />
                      Fichiers generes ({generationResult.files.length})
                    </h4>
                  </div>
                  <ScrollArea className="h-[calc(100%-3rem)]">
                    <div className="p-2">
                      {Object.entries(filesByCategory).map(([cat, files]) => {
                        const Icon = categoryIcons[cat] || FileCode2;
                        const isExpanded = expandedCategories.has(cat);
                        return (
                          <div key={cat} className="mb-1">
                            <button
                              onClick={() => toggleCategory(cat)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[oklch(0.2_0.01_250)] text-left"
                            >
                              {isExpanded ? <ChevronDown className="w-3 h-3 text-[oklch(0.5_0.01_250)]" /> : <ChevronRight className="w-3 h-3 text-[oklch(0.5_0.01_250)]" />}
                              <Icon className={`w-4 h-4 ${categoryColors[cat] || "text-gray-400"}`} />
                              <span className="text-sm text-white font-medium">{getCategoryLabel(cat)}</span>
                              <span className="text-xs text-[oklch(0.4_0.01_250)] ml-auto">{files.length}</span>
                            </button>
                            {isExpanded && (
                              <div className="ml-6 border-l border-[oklch(0.25_0.01_250)] pl-2">
                                {files.map((f, i) => {
                                  const fileName = f.path.split("/").pop() || f.path;
                                  const isActive = previewFile?.path === f.path;
                                  return (
                                    <button
                                      key={`${cat}-${i}`}
                                      onClick={() => handlePreviewFile(f.path)}
                                      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs ${
                                        isActive
                                          ? "bg-emerald-500/20 text-emerald-400"
                                          : "text-[oklch(0.6_0.01_250)] hover:bg-[oklch(0.2_0.01_250)] hover:text-white"
                                      }`}
                                    >
                                      <FileCode2 className="w-3 h-3 flex-shrink-0" />
                                      <span className="truncate">{fileName}</span>
                                      <span className="text-[oklch(0.4_0.01_250)] ml-auto flex-shrink-0">{f.lines}L</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Code preview */}
                <div className="col-span-8 rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.12_0.01_250)] overflow-hidden">
                  {loadingPreview ? (
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    </div>
                  ) : previewFile ? (
                    <>
                      <div className="p-3 border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileCode2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm text-white font-mono">{previewFile.path}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${categoryColors[previewFile.category] || "text-gray-400"}`}>
                            {getCategoryLabel(previewFile.category)}
                          </Badge>
                          <span className="text-xs text-[oklch(0.5_0.01_250)]">{previewFile.lines} lignes</span>
                        </div>
                      </div>
                      <ScrollArea className="h-[calc(100%-3rem)]">
                        <pre className="p-4 text-xs leading-relaxed">
                          <code className="text-[oklch(0.8_0.01_250)] font-mono whitespace-pre">
                            {previewFile.content}
                          </code>
                        </pre>
                      </ScrollArea>
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center text-[oklch(0.4_0.01_250)]">
                      <div className="text-center">
                        <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Selectionnez un fichier pour previsualiser</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Diff Legacy/New */}
            {resultTab === "diff" && (
              <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 28rem)" }}>
                {/* File tree (same as code tab) */}
                <div className="col-span-3 rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] overflow-hidden">
                  <div className="p-3 border-b border-[oklch(0.25_0.01_250)]">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <GitCompare className="w-4 h-4 text-cyan-400" />
                      Fichiers ({generationResult.files.length})
                    </h4>
                  </div>
                  <ScrollArea className="h-[calc(100%-3rem)]">
                    <div className="p-2">
                      {Object.entries(filesByCategory).map(([cat, files]) => {
                        const Icon = categoryIcons[cat] || FileCode2;
                        const isExpanded = expandedCategories.has(cat);
                        return (
                          <div key={cat} className="mb-1">
                            <button
                              onClick={() => toggleCategory(cat)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[oklch(0.2_0.01_250)] text-left"
                            >
                              {isExpanded ? <ChevronDown className="w-3 h-3 text-[oklch(0.5_0.01_250)]" /> : <ChevronRight className="w-3 h-3 text-[oklch(0.5_0.01_250)]" />}
                              <Icon className={`w-4 h-4 ${categoryColors[cat] || "text-gray-400"}`} />
                              <span className="text-xs text-white font-medium">{getCategoryLabel(cat)}</span>
                              <span className="text-xs text-[oklch(0.4_0.01_250)] ml-auto">{files.length}</span>
                            </button>
                            {isExpanded && (
                              <div className="ml-5 border-l border-[oklch(0.25_0.01_250)] pl-2">
                                {files.map((f, i) => {
                                  const fileName = f.path.split("/").pop() || f.path;
                                  const isActive = previewFile?.path === f.path;
                                  return (
                                    <button
                                      key={`diff-${cat}-${i}`}
                                      onClick={() => handlePreviewFile(f.path)}
                                      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs ${
                                        isActive
                                          ? "bg-cyan-500/20 text-cyan-400"
                                          : "text-[oklch(0.6_0.01_250)] hover:bg-[oklch(0.2_0.01_250)] hover:text-white"
                                      }`}
                                    >
                                      <FileCode2 className="w-3 h-3 flex-shrink-0" />
                                      <span className="truncate">{fileName}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Diff view */}
                <div className="col-span-9 rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.12_0.01_250)] overflow-hidden">
                  {loadingPreview || loadingSource ? (
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                    </div>
                  ) : previewFile ? (
                    <CodeDiff
                      sourceCode={sourceFile?.content || ""}
                      sourceFileName={sourceFile?.path?.split("/").pop() || "(pas de source correspondante)"}
                      generatedCode={previewFile.content}
                      generatedFileName={previewFile.path.split("/").pop() || previewFile.path}
                      category={previewFile.category}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-[oklch(0.4_0.01_250)]">
                      <div className="text-center">
                        <Columns2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Selectionnez un fichier pour voir le diff source/genere</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Architecture */}
            {resultTab === "architecture" && analysisResult && (
              <div style={{ height: "calc(100vh - 28rem)" }}>
                <ArchitectureDiagram
                  useCases={analysisResult.irSummary.useCases.map(uc => ({
                    className: uc.className,
                    domain: uc.domain,
                    httpMethod: uc.httpMethod,
                    restPath: uc.restPath,
                    voInType: uc.voInType,
                    voOutType: uc.voOutType,
                  }))}
                  dtos={analysisResult.irSummary.dtos.map(d => ({
                    className: d.className,
                    direction: d.direction as "in" | "out" | "unknown",
                    fieldCount: d.fieldCount,
                  }))}
                  enums={analysisResult.irSummary.enums.map(e => ({
                    className: e.className,
                    valueCount: e.valueCount,
                  }))}
                  exceptions={analysisResult.irSummary.exceptions.map(e => ({
                    className: e.className,
                    extendsClass: e.extendsClass,
                  }))}
                  remoteInterfaces={analysisResult.irSummary.remoteInterfaces.map(r => ({
                    className: r.className,
                    methodCount: r.methodCount,
                  }))}
                  generatedFiles={generationResult.files.map(f => ({
                    path: f.path,
                    category: f.category,
                    lines: f.lines,
                  }))}
                  domains={analysisResult.irSummary.domains}
                  onNodeClick={(nodeId, side) => {
                    if (side === "target") {
                      const file = generationResult.files.find(f => f.path.includes(nodeId));
                      if (file) {
                        handlePreviewFile(file.path);
                        setResultTab("diff");
                      }
                    }
                  }}
                />
              </div>
            )}
          </motion.div>
        )}
      </div>
      {/* Debug Panel — visible only in development */}
      <DebugPanel sessionId={sessionId} />
    </div>
  );
}
