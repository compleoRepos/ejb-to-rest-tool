/**
 * Compleo v1.0 — IHM de migration EJB → Spring Boot
 * Upload ZIP, Analyse, Génération, Preview, Download
 * @author Hamza NORDINE
 */

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileCode2, Play, Download, Eye, FolderArchive,
  CheckCircle2, AlertTriangle, Loader2, ArrowRight, Package,
  Layers, Code2, TestTube, Cloud, FileText, ChevronRight,
  ChevronDown, RefreshCw, History, Trash2, BarChart3,
  Terminal, Zap, Server, Database, Shield, Box,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface UploadResult {
  sessionId: string;
  projectName: string;
  fileCount: number;
  hasPom: boolean;
  hasBian: boolean;
  totalLines: number;
}

interface AnalysisResult {
  sessionId: string;
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
  useCases: {
    className: string;
    domain: string;
    httpMethod: string;
    restPath: string;
    voInType: string;
    voOutType: string;
    bianDomain: string;
    bianAction: string;
  }[];
  dtos: { className: string; direction: string; fieldCount: number; requiredFields: number }[];
  enums: { className: string; valueCount: number }[];
  exceptions: { className: string; extendsClass: string }[];
  validators: { className: string; annotationName: string }[];
  remoteInterfaces: { className: string; methodCount: number }[];
  domains: string[];
}

interface GenerationResult {
  sessionId: string;
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

// ─── Component ──────────────────────────────────────────────────────────────

export default function CompleoPage() {
  // Step state
  const [step, setStep] = useState<"upload" | "analyze" | "generate" | "preview">("upload");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);

  // Preview state
  const [previewFile, setPreviewFile] = useState<FilePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // History state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // ─── Upload Handler ─────────────────────────────────────────────────────

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      toast.error("Seuls les fichiers ZIP sont acceptés");
      return;
    }

    setUploading(true);
    setUploadResult(null);
    setAnalysisResult(null);
    setGenerationResult(null);
    setPreviewFile(null);

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
      const res = await fetch("/api/compleo/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: uploadResult.sessionId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }

      const data: AnalysisResult = await res.json();
      setAnalysisResult(data);
      setStep("generate");
      toast.success(`${data.stats.useCaseCount} UseCases détectés dans ${data.stats.domainCount} domaine(s)`);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'analyse");
    } finally {
      setAnalyzing(false);
    }
  }, [uploadResult]);

  // ─── Generate Handler ───────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!uploadResult) return;
    setGenerating(true);

    try {
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
      toast.success(`${data.stats.totalFiles} fichiers Spring Boot générés`);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }, [uploadResult]);

  // ─── Preview Handler ────────────────────────────────────────────────────

  const handlePreviewFile = useCallback(async (filePath: string) => {
    if (!uploadResult) return;
    setLoadingPreview(true);

    try {
      const res = await fetch(`/api/compleo/preview/${uploadResult.sessionId}/${filePath}`);
      if (!res.ok) throw new Error("Preview failed");
      const data: FilePreview = await res.json();
      setPreviewFile(data);
    } catch (err: any) {
      toast.error("Impossible de charger le fichier");
    } finally {
      setLoadingPreview(false);
    }
  }, [uploadResult]);

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
    setExpandedCategories(new Set());
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

  const filesByCategory = generationResult?.files.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {} as Record<string, typeof generationResult.files>) ?? {};

  // ─── Steps indicator ──────────────────────────────────────────────────

  const steps = [
    { id: "upload", label: "Upload", icon: Upload },
    { id: "analyze", label: "Analyse", icon: BarChart3 },
    { id: "generate", label: "Génération", icon: Zap },
    { id: "preview", label: "Résultats", icon: Eye },
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
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-xs">v1.0</Badge>
                </h1>
                <p className="text-sm text-[oklch(0.6_0.01_250)]">EJB → Spring Boot Migration Engine</p>
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
              <h3 className="text-sm font-semibold text-[oklch(0.7_0.01_250)] mb-3">Sessions précédentes</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sessions.map(s => (
                  <div key={s.id} className="p-3 rounded-lg border border-[oklch(0.25_0.01_250)] bg-[oklch(0.16_0.01_250)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white truncate">{s.projectName}</span>
                      <Badge variant="outline" className={`text-xs ${
                        s.status === "generated" ? "text-emerald-400 border-emerald-500/30" :
                        s.status === "analyzed" ? "text-cyan-400 border-cyan-500/30" :
                        "text-amber-400 border-amber-500/30"
                      }`}>{s.status}</Badge>
                    </div>
                    <div className="text-xs text-[oklch(0.5_0.01_250)]">
                      {s.fileCount} fichiers · {s.useCaseCount} UC · {s.generatedFiles} générés
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
                <h2 className="text-2xl font-bold text-white mb-2">Uploadez votre projet EJB</h2>
                <p className="text-[oklch(0.6_0.01_250)]">
                  Glissez-déposez un fichier ZIP contenant votre projet Maven EJB
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
                  { icon: Terminal, label: "Parsing AST", desc: "Analyse statique du code Java" },
                  { icon: Layers, label: "Spring Boot 3.2", desc: "Génération Controllers, Services, DTOs" },
                  { icon: Cloud, label: "Cloud-Native", desc: "Dockerfile, K8s, docker-compose" },
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
                    Projet uploadé
                  </h3>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                    {uploadResult.projectName}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Fichiers Java", value: uploadResult.fileCount },
                    { label: "Lignes de code", value: uploadResult.totalLines.toLocaleString() },
                    { label: "pom.xml", value: uploadResult.hasPom ? "Détecté" : "Non trouvé" },
                    { label: "BIAN mapping", value: uploadResult.hasBian ? "Détecté" : "Non trouvé" },
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
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 mr-2" />
                      Lancer l'analyse EJB
                    </>
                  )}
                </Button>
                <p className="text-sm text-[oklch(0.5_0.01_250)] mt-2">
                  Détection des UseCases, DTOs, Services, Enums, Exceptions, Validators
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 3: Generate */}
        {step === "generate" && analysisResult && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="max-w-4xl mx-auto">
              {/* Analysis results */}
              <div className="p-6 rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] mb-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Analyse terminée — {analysisResult.projectName}
                </h3>

                {/* Stats grid */}
                <div className="grid grid-cols-5 gap-3 mb-6">
                  {[
                    { label: "UseCases", value: analysisResult.stats.useCaseCount, color: "text-emerald-400" },
                    { label: "DTOs", value: analysisResult.stats.dtoCount, color: "text-amber-400" },
                    { label: "Services", value: analysisResult.stats.serviceCount, color: "text-cyan-400" },
                    { label: "Enums", value: analysisResult.stats.enumCount, color: "text-pink-400" },
                    { label: "Exceptions", value: analysisResult.stats.exceptionCount, color: "text-red-400" },
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
                      UseCases ({analysisResult.useCases.length})
                    </TabsTrigger>
                    <TabsTrigger value="dtos" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                      DTOs ({analysisResult.dtos.length})
                    </TabsTrigger>
                    <TabsTrigger value="enums" className="data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400">
                      Enums ({analysisResult.enums.length})
                    </TabsTrigger>
                    <TabsTrigger value="exceptions" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
                      Exceptions ({analysisResult.exceptions.length})
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
                          {analysisResult.useCases.map((uc, i) => (
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
                          {analysisResult.dtos.map((d, i) => (
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
                        {analysisResult.enums.map((e, i) => (
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
                        {analysisResult.exceptions.map((e, i) => (
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
                  onClick={handleGenerate}
                  disabled={generating}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white px-8"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Génération Spring Boot en cours...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2" />
                      Générer le projet Spring Boot
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
                  Projet Spring Boot généré
                </h3>
                <Button
                  onClick={handleDownload}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger ZIP
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

            {/* File browser + Preview */}
            <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 24rem)" }}>
              {/* File tree */}
              <div className="col-span-4 rounded-xl border border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] overflow-hidden">
                <div className="p-3 border-b border-[oklch(0.25_0.01_250)]">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <FolderArchive className="w-4 h-4 text-emerald-400" />
                    Fichiers générés ({generationResult.files.length})
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
                      <p className="text-sm">Sélectionnez un fichier pour prévisualiser</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
