/**
 * ProjectDetail — Workspace d'analyse d'un projet v4.0
 * Éditeur de code multi-fichiers + analyse + transformation + IA.
 * Préserve le workflow v3.0 (Monaco Editor, multi-tabs, analyse, génération).
 * @author Hamza NORDINE
 */
import { useState, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Play, Zap, Download, FileDown, Upload, FolderOpen, FileCode2,
  BarChart3, Code2, Terminal, ChevronRight, AlertTriangle, CheckCircle2,
  Clock, Layers, GitBranch, Copy, X, Plus, FilePlus2, FolderGit2,
  Loader2, PackageOpen, Brain, ShieldAlert, Gauge, Lightbulb,
  ArrowUpRight, CircleDot, Wrench, TrendingUp, Cloud, Network,
  Database, Globe, Server, Container, Shield, Activity, Box, Save,
} from "lucide-react";
import { Streamdown } from "streamdown";

import Editor from "@monaco-editor/react";

// Original analyzers
import { analyzeJavaCode, generateMarkdownReport } from "@/lib/ejb-analyzer";
import type { AnalysisReport } from "@/lib/ejb-analyzer";
import { mergeReports, generateMultiFileMarkdownReport } from "@/lib/ejb-analyzer-merge";
import { generateModernCode } from "@/lib/code-generator";
import type { GeneratedFile, GenerationResult } from "@/lib/code-generator";

// Extended modules
import { analyzeJavaLegacy } from "@/lib/legacy-analyzer";
import type { ExtendedAnalysisReport } from "@/lib/legacy-analyzer";
import { generateExtendedModernCode } from "@/lib/extended-generator";
import type { ExtendedGenerationResult } from "@/lib/extended-generator";
import { extractMicroservices } from "@/lib/microservice-extractor";
import type { MicroserviceExtractionResult, MicroserviceProposal } from "@/lib/microservice-extractor";
import { generateCloudNativeInfra } from "@/lib/cloud-generator";
import type { CloudGenerationResult } from "@/lib/cloud-generator";
type CloudFileWithCategory = { fileName: string; path: string; content: string; type: string; description: string; category: string };

import { SAMPLE_CODES } from "@/lib/sample-code";
import { exportToZip } from "@/lib/zip-exporter";
import type { GeneratedFile as ZipFile } from "@/lib/zip-exporter";
import { runAiAnalysis, runMultiFileAiAnalysis } from "@/lib/ai-engine";
import type { AiAnalysisResult, AiSuggestion, Severity } from "@/lib/ai-engine";
import { exportAiReportPdf } from "@/lib/pdf-exporter";

// Web Workers — Parallel analysis
import { WorkerPool, createWorkerPool } from "@/lib/worker-pool";
import type { PoolProgress, PoolStats } from "@/lib/worker-pool";
import type { FilePayload, FileAnalysisResult } from "@/lib/analysis-worker";
import AnalysisProgress, { AnalysisSummary } from "@/components/AnalysisProgress";

// ============================================================
// Types
// ============================================================

interface SourceFile {
  id: string;
  name: string;
  content: string;
  report?: AnalysisReport;
  extendedReport?: ExtendedAnalysisReport;
}

let fileIdCounter = 1;
function nextFileId(): string {
  return `file-${fileIdCounter++}`;
}

const TECH_ICONS: Record<string, typeof Database> = {
  ejb: Box, servlet: Globe, soap: Globe, jdbc: Database,
  hibernate: Database, jms: Activity, struts: Globe,
  jsp: Globe, batch: Server, transactions: Shield,
};

const TECH_COLORS: Record<string, string> = {
  ejb: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  servlet: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  soap: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  jdbc: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  hibernate: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  jms: "text-red-400 bg-red-500/10 border-red-500/20",
  struts: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  jsp: "text-lime-400 bg-lime-500/10 border-lime-500/20",
  batch: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  transactions: "text-pink-400 bg-pink-500/10 border-pink-500/20",
};

const TECH_TARGETS: Record<string, string> = {
  ejb: "Spring WebClient", servlet: "Spring REST Controller",
  soap: "REST API + OpenAPI", jdbc: "Spring Data JPA",
  hibernate: "Spring Data JPA", jms: "Spring Kafka",
  struts: "Spring MVC", jsp: "React / Thymeleaf",
  batch: "Spring Batch", transactions: "Spring @Transactional",
};

// ============================================================
// Main Component
// ============================================================

export default function ProjectDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Fetch project data
  const { data: project, isLoading: projectLoading } = trpc.projects.getById.useQuery({ id });
  const { data: projectFiles } = trpc.files.list.useQuery({ projectId: id });

  // Save scan mutation
  const saveScanMutation = trpc.scans.create.useMutation({
    onSuccess: () => {
      utils.scans.list.invalidate({ projectId: id });
      toast.success("Scan sauvegardé en base de données");
    },
  });

  // Update project mutation
  const updateProjectMutation = trpc.projects.update.useMutation({
    onSuccess: () => utils.projects.getById.invalidate({ id }),
  });

  // Multi-file state
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([
    { id: nextFileId(), name: "PaymentProcessor.java", content: SAMPLE_CODES[0].code },
  ]);
  const [activeFileId, setActiveFileId] = useState<string>(sourceFiles[0].id);

  // Analysis & generation state
  const [mergedReport, setMergedReport] = useState<AnalysisReport | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [markdownReport, setMarkdownReport] = useState<string>("");
  const [selectedGenFile, setSelectedGenFile] = useState<GeneratedFile | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState("code");
  const [statusMessages, setStatusMessages] = useState<string[]>([]);

  // Extended analysis
  const [extendedReports, setExtendedReports] = useState<ExtendedAnalysisReport[]>([]);
  const [extendedGenResult, setExtendedGenResult] = useState<ExtendedGenerationResult | null>(null);

  // Microservices & Cloud
  const [microserviceResult, setMicroserviceResult] = useState<MicroserviceExtractionResult | null>(null);
  const [cloudResult, setCloudResult] = useState<CloudGenerationResult | null>(null);
  const [selectedCloudFile, setSelectedCloudFile] = useState<CloudFileWithCategory | null>(null);

  // AI engine
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);

  // Web Workers — Parallel analysis
  const [workerProgress, setWorkerProgress] = useState<PoolProgress | null>(null);
  const [workerStats, setWorkerStats] = useState<PoolStats | null>(null);
  const [isParallelAnalyzing, setIsParallelAnalyzing] = useState(false);
  const workerPoolRef = useRef<WorkerPool | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // Project mode
  const [isProjectMode, setIsProjectMode] = useState(false);
  const [projectName, setProjectName] = useState<string>(project?.name || "");
  const [projectProgress, setProjectProgress] = useState<{ current: number; total: number; phase: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const activeFile = useMemo(
    () => sourceFiles.find((f) => f.id === activeFileId) || sourceFiles[0],
    [sourceFiles, activeFileId]
  );

  const addStatus = useCallback((msg: string) => {
    setStatusMessages((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // ---- File management ----

  const addNewFile = useCallback(() => {
    const newFile: SourceFile = {
      id: nextFileId(),
      name: `NewFile${sourceFiles.length + 1}.java`,
      content: "// Collez votre code Java legacy ici\n",
    };
    setSourceFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
    addStatus(`Nouvel onglet créé : ${newFile.name}`);
  }, [sourceFiles.length, addStatus]);

  const closeFile = useCallback(
    (fileId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (sourceFiles.length <= 1) {
        toast.error("Impossible de fermer le dernier onglet.");
        return;
      }
      setSourceFiles((prev) => {
        const filtered = prev.filter((f) => f.id !== fileId);
        if (activeFileId === fileId) {
          setActiveFileId(filtered[filtered.length - 1].id);
        }
        return filtered;
      });
    },
    [sourceFiles.length, activeFileId]
  );

  const updateFileContent = useCallback(
    (content: string) => {
      setSourceFiles((prev) =>
        prev.map((f) => (f.id === activeFileId ? { ...f, content } : f))
      );
    },
    [activeFileId]
  );

  const renameFile = useCallback(
    (fileId: string, newName: string) => {
      setSourceFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, name: newName } : f))
      );
    },
    []
  );

  // ---- Upload ----

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const javaFiles = Array.from(files).filter((f) => f.name.endsWith(".java"));
      if (javaFiles.length === 0) { toast.error("Aucun fichier .java trouvé."); return; }
      let loaded = 0;
      const newFiles: SourceFile[] = [];
      for (const file of javaFiles) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          newFiles.push({ id: nextFileId(), name: file.name, content: ev.target?.result as string });
          loaded++;
          if (loaded === javaFiles.length) {
            setSourceFiles((prev) => [...prev, ...newFiles]);
            setActiveFileId(newFiles[0].id);
            addStatus(`${newFiles.length} fichier(s) chargé(s)`);
            toast.success(`${newFiles.length} fichier(s) Java chargé(s)`);
          }
        };
        reader.readAsText(file);
      }
      e.target.value = "";
    },
    [addStatus]
  );

  const handleFolderUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const javaFiles = Array.from(files).filter((f) => f.name.endsWith(".java"));
      if (javaFiles.length === 0) { toast.error("Aucun fichier .java trouvé dans le dossier."); return; }
      let loaded = 0;
      const newFiles: SourceFile[] = [];
      for (const file of javaFiles) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          newFiles.push({ id: nextFileId(), name: file.name, content: ev.target?.result as string });
          loaded++;
          if (loaded === javaFiles.length) {
            setSourceFiles((prev) => [...prev, ...newFiles]);
            setActiveFileId(newFiles[0].id);
            addStatus(`${newFiles.length} fichier(s) Java chargé(s) depuis le dossier`);
            toast.success(`${newFiles.length} fichier(s) Java chargé(s)`);
          }
        };
        reader.readAsText(file);
      }
      e.target.value = "";
    },
    [addStatus]
  );

  // ---- Project mode ----

  const handleProjectUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const allFiles = Array.from(files);
      const javaFiles = allFiles.filter(
        (f) => f.name.endsWith(".java") && !f.name.endsWith("package-info.java")
      );
      if (javaFiles.length === 0) { toast.error("Aucun fichier .java trouvé dans le projet."); e.target.value = ""; return; }
      const firstPath = (allFiles[0] as any).webkitRelativePath || allFiles[0].name;
      const detectedName = firstPath.split("/")[0] || "Projet";
      setProjectName(detectedName);
      setIsProjectMode(true);
      setProjectProgress({ current: 0, total: javaFiles.length, phase: "Chargement des fichiers..." });
      addStatus(`Projet "${detectedName}" : ${javaFiles.length} fichier(s) .java détecté(s)`);
      let loaded = 0;
      const newFiles: SourceFile[] = [];
      for (const file of javaFiles) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const relativePath = (file as any).webkitRelativePath || file.name;
          newFiles.push({ id: nextFileId(), name: relativePath.split("/").pop() || file.name, content: ev.target?.result as string });
          loaded++;
          setProjectProgress({ current: loaded, total: javaFiles.length, phase: "Chargement des fichiers..." });
          if (loaded === javaFiles.length) {
            setSourceFiles(newFiles);
            setActiveFileId(newFiles[0].id);
            setMergedReport(null);
            setGenerationResult(null);
            setSelectedGenFile(null);
            setExtendedReports([]);
            setExtendedGenResult(null);
            setMicroserviceResult(null);
            setCloudResult(null);
            setAiResult(null);
            toast.success(`${newFiles.length} fichier(s) Java chargé(s) depuis le projet "${detectedName}"`);
            addStatus(`Projet chargé : ${newFiles.length} fichier(s)`);
            // Auto-analyze
            setTimeout(() => {
              setProjectProgress({ current: 0, total: newFiles.length, phase: "Analyse en cours..." });
              const reports: AnalysisReport[] = [];
              const extReports: ExtendedAnalysisReport[] = [];
              newFiles.forEach((sf, idx) => {
                const r = analyzeJavaCode(sf.content);
                reports.push(r);
                const er = analyzeJavaLegacy(sf.content, sf.name);
                extReports.push(er);
                sf.report = r;
                sf.extendedReport = er;
                setProjectProgress({ current: idx + 1, total: newFiles.length, phase: "Analyse en cours..." });
              });
              setSourceFiles([...newFiles]);
              const merged = mergeReports(reports);
              setMergedReport(merged);
              setExtendedReports(extReports);
              setMarkdownReport(generateMultiFileMarkdownReport(reports, merged));
              addStatus(`Analyse terminée : ${reports.length} fichier(s) analysé(s)`);
              // Auto-generate
              setProjectProgress({ current: 0, total: 3, phase: "Génération du code..." });
              try {
                const result = generateModernCode(merged);
                setGenerationResult(result);
                if (result.files.length > 0) setSelectedGenFile(result.files[0]);
                setProjectProgress({ current: 1, total: 3, phase: "Génération étendue..." });
                if (extReports.length > 0) {
                  const extResult = generateExtendedModernCode(extReports[0]);
                  setExtendedGenResult(extResult);
                }
                setProjectProgress({ current: 2, total: 3, phase: "Extraction microservices..." });
                const msResult = extractMicroservices(extReports);
                setMicroserviceResult(msResult);
                const cResult = generateCloudNativeInfra(msResult);
                setCloudResult(cResult);
                setProjectProgress({ current: 3, total: 3, phase: "Analyse IA..." });
                try {
                  const ai = runMultiFileAiAnalysis(
                    newFiles.map((f, i) => ({ code: f.content, fileName: f.name, report: reports[i] })),
                    undefined
                  );
                  setAiResult(ai);
                } catch { /* non-blocking */ }

                // Save scan to DB
                const allTechs = new Set<string>();
                extReports.forEach(er => er.summary.technologiesDetected.forEach(t => allTechs.add(t)));
                saveScanMutation.mutate({
                  projectId: id,
                  scanType: "full",
                });

                // Update project stats
                const totalLines = newFiles.reduce((sum, f) => sum + f.content.split("\n").length, 0);
                updateProjectMutation.mutate({
                  id,
                  fileCount: newFiles.length,
                  totalLines,
                  technologies: Array.from(allTechs),
                });

                addStatus(`Projet "${detectedName}" : transformation complète`);
                toast.success("Projet analysé et transformé avec succès !");
              } catch (err) {
                addStatus("Erreur lors de la transformation du projet");
                toast.error("Erreur lors de la transformation.");
              }
              setProjectProgress(null);
            }, 300);
          }
        };
        reader.readAsText(file);
      }
      e.target.value = "";
    },
    [addStatus, id, saveScanMutation, updateProjectMutation]
  );

  // ---- Analyze ----

  const handleAnalyze = useCallback(() => {
    setIsAnalyzing(true);
    addStatus("Analyse multi-technologies en cours...");
    setTimeout(() => {
      try {
        const reports: AnalysisReport[] = [];
        const extReports: ExtendedAnalysisReport[] = [];
        const updatedFiles = sourceFiles.map((sf) => {
          const r = analyzeJavaCode(sf.content);
          reports.push(r);
          const er = analyzeJavaLegacy(sf.content, sf.name);
          extReports.push(er);
          return { ...sf, report: r, extendedReport: er };
        });
        setSourceFiles(updatedFiles);
        const merged = mergeReports(reports);
        setMergedReport(merged);
        setExtendedReports(extReports);
        if (reports.length === 1) {
          setMarkdownReport(generateMarkdownReport(reports[0]));
        } else {
          setMarkdownReport(generateMultiFileMarkdownReport(reports, merged));
        }
        const allTechs = new Set<string>();
        extReports.forEach((er) => er.summary.technologiesDetected.forEach((t) => allTechs.add(t)));
        addStatus(`Analyse terminée : ${reports.length} fichier(s), ${allTechs.size} technologie(s) détectée(s)`);
        toast.success(`Analyse terminée : ${allTechs.size} technologie(s) legacy détectée(s)`);
      } catch (e) {
        addStatus("Erreur lors de l'analyse");
        toast.error("Erreur lors de l'analyse du code.");
      }
      setIsAnalyzing(false);
    }, 400);
  }, [sourceFiles, addStatus]);

  // ---- Parallel Analysis (Web Workers) ----

  const handleParallelAnalyze = useCallback(async () => {
    if (sourceFiles.length < 2) {
      handleAnalyze();
      return;
    }
    setIsParallelAnalyzing(true);
    setWorkerStats(null);
    setWorkerProgress(null);
    addStatus(`Analyse parallèle : ${sourceFiles.length} fichier(s) via Web Workers...`);

    const pool = createWorkerPool({
      onProgress: (p) => setWorkerProgress({ ...p }),
      onFileComplete: (result) => {
        addStatus(`✓ ${result.fileName} (${result.technologiesDetected.length} techs, ${result.issueCount} issues, ${Math.round(result.processingTimeMs)}ms)`);
      },
      onComplete: (results, totalTimeMs) => {
        addStatus(`Analyse parallèle terminée : ${results.length} fichier(s) en ${Math.round(totalTimeMs)}ms`);
      },
      onError: (err) => {
        addStatus(`✗ Erreur: ${err.fileName} — ${err.error}`);
      },
    });
    workerPoolRef.current = pool;

    try {
      const payloads: FilePayload[] = sourceFiles.map(sf => ({
        id: sf.id,
        name: sf.name,
        content: sf.content,
      }));

      const workerResults = await pool.analyze(payloads);
      const stats = pool.getStats();
      setWorkerStats(stats);

      // Now run the full analysis on main thread for complete reports
      // (the worker gave us fast stats, now we need the detailed reports)
      const reports: AnalysisReport[] = [];
      const extReports: ExtendedAnalysisReport[] = [];
      const updatedFiles = sourceFiles.map((sf) => {
        const r = analyzeJavaCode(sf.content);
        reports.push(r);
        const er = analyzeJavaLegacy(sf.content, sf.name);
        extReports.push(er);
        return { ...sf, report: r, extendedReport: er };
      });
      setSourceFiles(updatedFiles);
      const merged = mergeReports(reports);
      setMergedReport(merged);
      setExtendedReports(extReports);
      if (reports.length === 1) {
        setMarkdownReport(generateMarkdownReport(reports[0]));
      } else {
        setMarkdownReport(generateMultiFileMarkdownReport(reports, merged));
      }

      const allTechs = new Set<string>();
      extReports.forEach((er) => er.summary.technologiesDetected.forEach((t) => allTechs.add(t)));
      toast.success(`Analyse parallèle terminée : ${stats.technologiesDetected.length} technologie(s), ${stats.filesPerSecond} fichiers/s`);
    } catch (err) {
      addStatus("Erreur lors de l'analyse parallèle");
      toast.error("Erreur lors de l'analyse parallèle.");
    }
    setIsParallelAnalyzing(false);
    workerPoolRef.current = null;
  }, [sourceFiles, addStatus, handleAnalyze]);

  const handleAbortParallel = useCallback(() => {
    workerPoolRef.current?.abort();
    setIsParallelAnalyzing(false);
    setWorkerProgress(null);
    addStatus("Analyse parallèle annulée.");
    toast.info("Analyse parallèle annulée.");
  }, [addStatus]);

  // ---- Generate ----

  const handleGenerate = useCallback(() => {
    if (!mergedReport) return;
    setIsGenerating(true);
    addStatus("Génération multi-technologies en cours...");
    setTimeout(() => {
      try {
        const result = generateModernCode(mergedReport);
        setGenerationResult(result);
        if (result.files.length > 0) setSelectedGenFile(result.files[0]);
        if (extendedReports.length > 0) {
          const extResult = generateExtendedModernCode(extendedReports[0]);
          setExtendedGenResult(extResult);
        }
        if (extendedReports.length > 0) {
          const msResult = extractMicroservices(extendedReports);
          setMicroserviceResult(msResult);
          const cResult = generateCloudNativeInfra(msResult);
          setCloudResult(cResult);
        }
        setActiveRightTab("code");
        try {
          if (sourceFiles.length === 1) {
            const ai = runAiAnalysis(sourceFiles[0].content, mergedReport);
            setAiResult(ai);
          } else {
            const ai = runMultiFileAiAnalysis(
              sourceFiles.map((f) => ({ code: f.content, fileName: f.name, report: f.report! })),
              undefined
            );
            setAiResult(ai);
          }
        } catch { /* non-blocking */ }

        // Save scan to DB
        const allTechs = new Set<string>();
        extendedReports.forEach(er => er.summary.technologiesDetected.forEach(t => allTechs.add(t)));
        saveScanMutation.mutate({
          projectId: id,
          scanType: "full",
        });

        // Update project
        const totalLines = sourceFiles.reduce((sum, f) => sum + f.content.split("\n").length, 0);
        updateProjectMutation.mutate({
          id,
          fileCount: sourceFiles.length,
          totalLines,
          technologies: Array.from(allTechs),
        });

        addStatus(`Génération terminée : ${result.files.length} fichier(s) + microservices + cloud`);
        toast.success("Transformation complète : code, microservices et cloud générés");
      } catch (e) {
        addStatus("Erreur lors de la génération");
        toast.error("Erreur lors de la génération du code.");
      }
      setIsGenerating(false);
    }, 600);
  }, [mergedReport, extendedReports, sourceFiles, addStatus, id, saveScanMutation, updateProjectMutation]);

  // ---- Download ZIP ----

  const handleDownload = useCallback(async () => {
    if (!generationResult) return;
    setIsExporting(true);
    addStatus("Export ZIP Maven en cours...");
    try {
      const zipFiles: ZipFile[] = generationResult.files.map((f) => ({
        path: f.path, content: f.content, category: f.type.toUpperCase(),
      }));
      if (cloudResult) {
        cloudResult.files.forEach((cf) => {
          zipFiles.push({ path: `cloud/${cf.path}`, content: cf.content, category: cf.type.toUpperCase() });
        });
      }
      await exportToZip(zipFiles, "ejb-client-modernized", markdownReport || undefined);
      addStatus(`Export ZIP terminé : ${zipFiles.length} fichier(s)`);
      toast.success("Archive ZIP Maven téléchargée avec succès");
    } catch (e) {
      addStatus("Erreur lors de l'export ZIP");
      toast.error("Erreur lors de la génération du ZIP.");
    }
    setIsExporting(false);
  }, [generationResult, cloudResult, markdownReport, addStatus]);

  // ---- Copy ----

  const handleCopy = useCallback(() => {
    if (selectedGenFile) {
      navigator.clipboard.writeText(selectedGenFile.content);
      toast.success("Code copié dans le presse-papier");
    }
  }, [selectedGenFile]);

  // ---- Sample selection ----

  const handleSampleSelect = useCallback(
    (value: string) => {
      const sample = SAMPLE_CODES.find((s) => s.name === value);
      if (sample) {
        const newFile: SourceFile = {
          id: nextFileId(),
          name: sample.name.replace(/[^a-zA-Z0-9]/g, "") + ".java",
          content: sample.code,
        };
        setSourceFiles((prev) => [...prev, newFile]);
        setActiveFileId(newFile.id);
        setMergedReport(null);
        setGenerationResult(null);
        setSelectedGenFile(null);
        setExtendedReports([]);
        setExtendedGenResult(null);
        setMicroserviceResult(null);
        setCloudResult(null);
        setAiResult(null);
        addStatus(`Exemple chargé : ${sample.name}`);
      }
    },
    [addStatus]
  );

  // ---- Computed values ----

  const filesByType = useMemo(() => {
    if (!generationResult) return null;
    return {
      client: generationResult.files.filter((f) => f.type === "client"),
      config: generationResult.files.filter((f) => f.type === "config"),
      dto: generationResult.files.filter((f) => f.type === "dto"),
      exception: generationResult.files.filter((f) => f.type === "exception"),
      util: generationResult.files.filter((f) => f.type === "util"),
      test: generationResult.files.filter((f) => f.type === "test"),
    };
  }, [generationResult]);

  const totalBadges = useMemo(() => {
    if (!mergedReport) return null;
    return {
      ejb: mergedReport.summary.totalEjbInjections,
      jndi: mergedReport.summary.totalJndiLookups,
      jms: mergedReport.summary.totalJmsElements,
    };
  }, [mergedReport]);

  const detectedTechs = useMemo(() => {
    const techs = new Map<string, number>();
    extendedReports.forEach((er) => {
      er.summary.technologiesDetected.forEach((t) => {
        techs.set(t, (techs.get(t) || 0) + (er.summary.technologyCounts[t] || 1));
      });
    });
    return techs;
  }, [extendedReports]);

  // ---- Inline rename ----

  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = useCallback(
    (fileId: string, currentName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setRenamingFileId(fileId);
      setRenameValue(currentName);
    },
    []
  );

  const commitRename = useCallback(() => {
    if (renamingFileId && renameValue.trim()) {
      renameFile(renamingFileId, renameValue.trim());
    }
    setRenamingFileId(null);
  }, [renamingFileId, renameValue, renameFile]);

  if (projectLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-10 border-b border-border flex items-center px-3 gap-2 shrink-0 bg-secondary/20">
        <Select onValueChange={handleSampleSelect}>
          <SelectTrigger className="w-44 h-7 text-[11px] bg-secondary border-border">
            <SelectValue placeholder="Charger un exemple..." />
          </SelectTrigger>
          <SelectContent>
            {SAMPLE_CODES.map((s) => (
              <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input ref={fileInputRef} type="file" accept=".java" multiple className="hidden" onChange={handleFileUpload} />
        {/* @ts-ignore */}
        <input ref={folderInputRef} type="file" webkitdirectory="" multiple className="hidden" onChange={handleFolderUpload} />
        {/* @ts-ignore */}
        <input ref={projectInputRef} type="file" webkitdirectory="" multiple className="hidden" onChange={handleProjectUpload} />

        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3 h-3" />Fichier(s)
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => folderInputRef.current?.click()}>
          <FolderOpen className="w-3 h-3" />Dossier
        </Button>
        <Button size="sm" className="h-7 text-[11px] gap-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => projectInputRef.current?.click()} disabled={!!projectProgress}>
          {projectProgress ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderGit2 className="w-3 h-3" />}
          Projet entier
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        <Button size="sm" className="h-7 text-[11px] gap-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={sourceFiles.length >= 10 ? handleParallelAnalyze : handleAnalyze} disabled={isAnalyzing || isParallelAnalyzing}>
          {(isAnalyzing || isParallelAnalyzing) ? <Clock className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {sourceFiles.length >= 10 ? "Analyser //" : "Analyser"}
        </Button>
        <Button size="sm" className="h-7 text-[11px] gap-1 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleGenerate} disabled={isGenerating || !mergedReport}>
          {isGenerating ? <Clock className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          Transformer
        </Button>

        {generationResult && (
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={handleDownload} disabled={isExporting}>
            {isExporting ? <Clock className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {isExporting ? "Export..." : "ZIP Maven"}
          </Button>
        )}
      </div>

      {/* Worker parallel analysis progress */}
      {(isParallelAnalyzing && workerProgress) && (
        <div className="border-b border-border shrink-0">
          <AnalysisProgress progress={workerProgress} onAbort={handleAbortParallel} compact />
        </div>
      )}

      {/* Worker analysis summary */}
      {workerStats && !isParallelAnalyzing && (
        <div className="border-b border-border shrink-0 px-3 py-2">
          <AnalysisSummary stats={workerStats} />
        </div>
      )}

      {/* Project progress bar */}
      {projectProgress && (
        <div className="h-7 border-b border-border flex items-center px-4 gap-3 bg-emerald-950/30 shrink-0">
          <FolderGit2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] text-emerald-300 font-medium">{projectName || project?.name || "Projet"}</span>
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${projectProgress.total > 0 ? (projectProgress.current / projectProgress.total) * 100 : 0}%` }} />
          </div>
          <span className="text-[10px] text-emerald-400 font-mono">{projectProgress.phase} ({projectProgress.current}/{projectProgress.total})</span>
        </div>
      )}

      {/* Technology detection bar */}
      {detectedTechs.size > 0 && (
        <div className="h-7 border-b border-border flex items-center px-4 gap-2 bg-secondary/20 shrink-0 overflow-x-auto">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider shrink-0">Technologies :</span>
          {Array.from(detectedTechs.entries()).map(([tech, count]) => {
            const Icon = TECH_ICONS[tech] || Box;
            const colorClass = TECH_COLORS[tech] || "text-muted-foreground bg-secondary/50 border-border";
            return (
              <div key={tech} className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium shrink-0 ${colorClass}`}>
                <Icon className="w-3 h-3" />
                <span className="capitalize">{tech}</span>
                <span className="opacity-60">({count})</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Panel — Legacy Code with Tabs */}
          <ResizablePanel defaultSize={40} minSize={20}>
            <div className="h-full flex flex-col">
              {/* Tab bar */}
              <div className="h-9 border-b border-border flex items-center shrink-0 bg-secondary/30">
                <ScrollArea className="flex-1">
                  <div className="flex items-center h-9">
                    {sourceFiles.map((sf) => (
                      <button
                        key={sf.id}
                        onClick={() => setActiveFileId(sf.id)}
                        onDoubleClick={(e) => startRename(sf.id, sf.name, e)}
                        className={`group relative flex items-center gap-1.5 h-9 px-3 text-xs border-r border-border shrink-0 transition-colors ${
                          sf.id === activeFileId
                            ? "bg-background text-foreground border-b-2 border-b-primary"
                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                        }`}
                      >
                        <FileCode2 className="w-3 h-3 shrink-0" />
                        {renamingFileId === sf.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingFileId(null); }}
                            className="bg-secondary border border-border rounded px-1 text-xs w-32 outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="truncate max-w-[120px]">{sf.name}</span>
                        )}
                        {sourceFiles.length > 1 && (
                          <button
                            onClick={(e) => closeFile(sf.id, e)}
                            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        {sf.extendedReport && sf.extendedReport.summary.technologiesDetected.length > 0 && (
                          <div className="flex gap-0.5 ml-1">
                            {sf.extendedReport.summary.technologiesDetected.slice(0, 2).map((t) => {
                              const TIcon = TECH_ICONS[t] || Box;
                              return <TIcon key={t} className={`w-2.5 h-2.5 ${TECH_COLORS[t]?.split(" ")[0] || "text-muted-foreground"}`} />;
                            })}
                          </div>
                        )}
                      </button>
                    ))}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={addNewFile} className="flex items-center justify-center h-9 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors shrink-0">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom"><p>Nouvel onglet</p></TooltipContent>
                    </Tooltip>
                  </div>
                  <ScrollBar orientation="horizontal" className="h-0" />
                </ScrollArea>

                {totalBadges && (
                  <div className="flex gap-1.5 px-2 shrink-0">
                    {totalBadges.ejb > 0 && <Badge variant="outline" className="text-[10px] h-5 border-primary/40 text-primary">{totalBadges.ejb} @EJB</Badge>}
                    {totalBadges.jndi > 0 && <Badge variant="outline" className="text-[10px] h-5 border-accent/40 text-accent">{totalBadges.jndi} JNDI</Badge>}
                    {totalBadges.jms > 0 && <Badge variant="outline" className="text-[10px] h-5 border-destructive/40 text-destructive">{totalBadges.jms} JMS/MQ</Badge>}
                  </div>
                )}
              </div>

              {/* Per-file analysis indicator */}
              {activeFile.report && (
                <div className="h-6 border-b border-border flex items-center px-3 gap-2 bg-primary/5 shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-primary" />
                  <span className="text-[10px] text-primary font-mono">
                    {activeFile.report.summary.totalEjbInjections} @EJB
                    {" · "}
                    {activeFile.report.summary.totalMethodCalls} appels
                    {activeFile.report.summary.totalTransactions > 0 && ` · ${activeFile.report.summary.totalTransactions} tx`}
                  </span>
                  {activeFile.extendedReport && (
                    <span className="text-[10px] text-muted-foreground font-mono ml-2">
                      | {activeFile.extendedReport.summary.technologiesDetected.join(", ")}
                    </span>
                  )}
                </div>
              )}

              {/* Monaco Editor */}
              <div className="flex-1">
                <Editor
                  key={activeFileId}
                  height="100%"
                  language="java"
                  theme="vs-dark"
                  value={activeFile.content}
                  onChange={(val) => updateFileContent(val || "")}
                  options={{
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                    lineNumbers: "on",
                    renderLineHighlight: "line",
                    bracketPairColorization: { enabled: true },
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    cursorSmoothCaretAnimation: "on",
                  }}
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel — Tabs */}
          <ResizablePanel defaultSize={60} minSize={25}>
            <div className="h-full flex flex-col">
              <Tabs value={activeRightTab} onValueChange={setActiveRightTab} className="h-full flex flex-col">
                <div className="h-9 border-b border-border flex items-center px-2 shrink-0 bg-secondary/30 overflow-x-auto">
                  <TabsList className="h-7 bg-transparent p-0 gap-0">
                    <TabsTrigger value="code" className="h-7 text-xs px-2.5 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground">
                      <Code2 className="w-3.5 h-3.5 mr-1" />Code
                      {generationResult && <Badge className="ml-1 h-4 text-[10px] bg-primary/20 text-primary border-0">{generationResult.files.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="tech" className="h-7 text-xs px-2.5 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 data-[state=active]:text-foreground text-muted-foreground">
                      <Layers className="w-3.5 h-3.5 mr-1" />Tech
                      {detectedTechs.size > 0 && <Badge className="ml-1 h-4 text-[10px] bg-emerald-500/20 text-emerald-400 border-0">{detectedTechs.size}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="micro" className="h-7 text-xs px-2.5 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-cyan-500 data-[state=active]:text-foreground text-muted-foreground">
                      <Network className="w-3.5 h-3.5 mr-1" />Micro
                      {microserviceResult && <Badge className="ml-1 h-4 text-[10px] bg-cyan-500/20 text-cyan-400 border-0">{microserviceResult.proposals.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="cloud" className="h-7 text-xs px-2.5 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-violet-500 data-[state=active]:text-foreground text-muted-foreground">
                      <Cloud className="w-3.5 h-3.5 mr-1" />Cloud
                      {cloudResult && <Badge className="ml-1 h-4 text-[10px] bg-violet-500/20 text-violet-400 border-0">{cloudResult.files.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="ai" className="h-7 text-xs px-2.5 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-amber-500 data-[state=active]:text-foreground text-muted-foreground">
                      <Brain className="w-3.5 h-3.5 mr-1" />IA
                      {aiResult && <Badge className="ml-1 h-4 text-[10px] bg-amber-500/20 text-amber-400 border-0">{aiResult.summary.totalSuggestions}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="report" className="h-7 text-xs px-2.5 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-foreground text-muted-foreground">
                      <BarChart3 className="w-3.5 h-3.5 mr-1" />Rapport
                    </TabsTrigger>
                  </TabsList>

                  {selectedGenFile && activeRightTab === "code" && (
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{selectedGenFile.path}</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCopy}><Copy className="w-3 h-3" /></Button>
                    </div>
                  )}
                </div>

                {/* CODE TAB */}
                <TabsContent value="code" className="flex-1 m-0 overflow-hidden">
                  {generationResult ? (
                    <div className="h-full flex">
                      <div className="w-52 border-r border-border shrink-0 overflow-hidden">
                        <ScrollArea className="h-full">
                          <div className="p-2">
                            {filesByType && Object.entries(filesByType).map(([type, files]) =>
                              files.length > 0 && (
                                <div key={type} className="mb-2">
                                  <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                    <Layers className="w-3 h-3" />{type}
                                  </div>
                                  {files.map((file) => (
                                    <button key={file.path} onClick={() => setSelectedGenFile(file)} className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${selectedGenFile?.path === file.path ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                                      <ChevronRight className="w-3 h-3 shrink-0" />
                                      <span className="truncate font-mono text-[11px]">{file.fileName}</span>
                                    </button>
                                  ))}
                                </div>
                              )
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                      <div className="flex-1">
                        {selectedGenFile ? (
                          <Editor height="100%" language="java" theme="vs-dark" value={selectedGenFile.content} options={{ readOnly: true, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 12 }, lineNumbers: "on", renderLineHighlight: "none", smoothScrolling: true }} />
                        ) : (
                          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sélectionnez un fichier dans l'arborescence</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-xl bg-secondary/50 flex items-center justify-center"><Zap className="w-8 h-8 text-primary/40" /></div>
                        <p className="text-sm">Collez du code Java legacy, puis cliquez sur <strong className="text-primary">Analyser</strong> et <strong className="text-accent">Transformer</strong></p>
                        <p className="text-xs text-muted-foreground/60">Supporte : EJB, Servlets, SOAP, JDBC, Hibernate, Struts, JMS, Batch</p>
                      </motion.div>
                    </div>
                  )}
                </TabsContent>

                {/* TECH TAB */}
                <TabsContent value="tech" className="flex-1 m-0 overflow-hidden">
                  {extendedReports.length > 0 ? (
                    <ScrollArea className="h-full">
                      <div className="p-5 space-y-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Layers className="w-5 h-5 text-emerald-400" />
                          <h2 className="text-sm font-semibold">Technologies Legacy Détectées</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {Array.from(detectedTechs.entries()).map(([tech, count]) => {
                            const Icon = TECH_ICONS[tech] || Box;
                            const colorClass = TECH_COLORS[tech] || "text-muted-foreground bg-secondary/50 border-border";
                            const target = TECH_TARGETS[tech] || "Spring Boot";
                            return (
                              <div key={tech} className={`rounded-lg border p-4 ${colorClass}`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <Icon className="w-5 h-5" />
                                  <span className="text-sm font-semibold capitalize">{tech}</span>
                                  <Badge variant="outline" className="ml-auto text-[10px] h-5 border-current/30">{count} occ.</Badge>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] opacity-80">
                                  <ArrowUpRight className="w-3 h-3" />
                                  <span>Cible : {target}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                            <div className="text-2xl font-bold font-mono text-primary">{extendedReports.length}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fichiers</div>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                            <div className="text-2xl font-bold font-mono text-emerald-400">{detectedTechs.size}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Technologies</div>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                            <div className="text-2xl font-bold font-mono text-amber-400">
                              {extendedReports.reduce((sum, er) => sum + er.summary.estimatedEffortDays, 0)}j
                            </div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Effort estimé</div>
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                      <Layers className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm">Les technologies legacy seront détectées après l'analyse</p>
                    </div>
                  )}
                </TabsContent>

                {/* MICRO TAB */}
                <TabsContent value="micro" className="flex-1 m-0 overflow-hidden">
                  {microserviceResult ? (
                    <ScrollArea className="h-full">
                      <div className="p-5 space-y-6">
                        <div className="flex items-center gap-2">
                          <Network className="w-5 h-5 text-cyan-400" />
                          <h2 className="text-sm font-semibold">Microservices</h2>
                          <Badge className="ml-2 text-[10px] bg-cyan-500/20 text-cyan-400 border-0">{microserviceResult.proposals.length}</Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                            <div className="text-xl font-bold font-mono text-cyan-400">{microserviceResult.summary.totalServices}</div>
                            <div className="text-[10px] text-muted-foreground">Services</div>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                            <div className="text-xl font-bold font-mono text-emerald-400">{microserviceResult.proposals.reduce((sum, p) => sum + p.apis.length, 0)}</div>
                            <div className="text-[10px] text-muted-foreground">APIs</div>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                            <div className="text-xl font-bold font-mono text-purple-400">{microserviceResult.proposals.reduce((sum, p) => sum + p.events.length, 0)}</div>
                            <div className="text-[10px] text-muted-foreground">Events</div>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                            <div className="text-xl font-bold font-mono text-amber-400">{microserviceResult.summary.couplingScore}</div>
                            <div className="text-[10px] text-muted-foreground">Couplage</div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {microserviceResult.proposals.map((p) => (
                            <MicroserviceCard key={p.name} proposal={p} />
                          ))}
                        </div>
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                      <Network className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm">L'extraction de microservices apparaîtra après la transformation</p>
                    </div>
                  )}
                </TabsContent>

                {/* CLOUD TAB */}
                <TabsContent value="cloud" className="flex-1 m-0 overflow-hidden">
                  {cloudResult ? (
                    <div className="h-full flex">
                      <div className="w-52 border-r border-border shrink-0 overflow-hidden">
                        <ScrollArea className="h-full">
                          <div className="p-2">
                            {["docker", "kubernetes", "helm", "gateway", "security", "observability", "ci", "compose"].map((cat) => {
                              const catFiles = cloudResult.files.filter((f) => f.type === cat);
                              if (catFiles.length === 0) return null;
                              return (
                                <div key={cat} className="mb-2">
                                  <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                    <Container className="w-3 h-3" />{cat}
                                  </div>
                                  {catFiles.map((file) => (
                                    <button key={file.path} onClick={() => setSelectedCloudFile({ ...file, category: file.type } as CloudFileWithCategory)} className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${selectedCloudFile?.path === file.path ? "bg-violet-500/15 text-violet-300" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                                      <ChevronRight className="w-3 h-3 shrink-0" />
                                      <span className="truncate font-mono text-[11px]">{file.path.split("/").pop()}</span>
                                    </button>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                      <div className="flex-1">
                        {selectedCloudFile ? (
                          <div className="h-full flex flex-col">
                            <div className="h-7 border-b border-border flex items-center px-3 bg-violet-500/5 shrink-0">
                              <span className="text-[10px] text-violet-300 font-mono">{selectedCloudFile.path}</span>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto" onClick={() => { navigator.clipboard.writeText(selectedCloudFile.content); toast.success("Copié"); }}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="flex-1">
                              <Editor
                                height="100%"
                                language={selectedCloudFile.path.endsWith(".yaml") || selectedCloudFile.path.endsWith(".yml") ? "yaml" : selectedCloudFile.path.endsWith(".json") ? "json" : selectedCloudFile.path.endsWith(".java") ? "java" : "plaintext"}
                                theme="vs-dark"
                                value={selectedCloudFile.content}
                                options={{ readOnly: true, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 8 }, lineNumbers: "on", renderLineHighlight: "none", smoothScrolling: true }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                            <Cloud className="w-10 h-10 text-violet-400/30" />
                            <p className="text-sm">Sélectionnez un fichier cloud</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                      <Cloud className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm">L'infrastructure cloud-native sera générée après la transformation</p>
                    </div>
                  )}
                </TabsContent>

                {/* AI TAB */}
                <TabsContent value="ai" className="flex-1 m-0 overflow-hidden">
                  {aiResult ? (
                    <ScrollArea className="h-full">
                      <div className="p-5 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <ScoreCard title="Code Legacy" score={aiResult.legacyScore.overall} color="destructive" details={[
                            { label: "Maintenabilité", value: aiResult.legacyScore.maintainability },
                            { label: "Sécurité", value: aiResult.legacyScore.security },
                            { label: "Performance", value: aiResult.legacyScore.performance },
                            { label: "Résilience", value: aiResult.legacyScore.resilience },
                          ]} />
                          <ScoreCard title="Code Modernisé" score={aiResult.modernScore.overall} color="primary" details={[
                            { label: "Maintenabilité", value: aiResult.modernScore.maintainability },
                            { label: "Sécurité", value: aiResult.modernScore.security },
                            { label: "Performance", value: aiResult.modernScore.performance },
                            { label: "Résilience", value: aiResult.modernScore.resilience },
                          ]} />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/20">
                            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-xs text-red-300">{aiResult.summary.criticalCount} critique(s)</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-xs text-amber-300">{aiResult.summary.warningCount} avertissement(s)</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                            <Lightbulb className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-xs text-blue-300">{aiResult.summary.infoCount} info(s)</span>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                            <Lightbulb className="w-4 h-4 text-amber-400" />Suggestions ({aiResult.suggestions.length})
                          </h3>
                          <div className="space-y-2">
                            {aiResult.suggestions.slice(0, 20).map((sug) => <SuggestionCard key={sug.id} suggestion={sug} />)}
                          </div>
                        </div>

                        <div className="pt-4 border-t border-border">
                          <Button variant="outline" size="sm" className="w-full h-10 gap-2 bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20" onClick={() => { try { exportAiReportPdf(aiResult, projectName || project?.name || undefined); toast.success("Rapport IA exporté en PDF"); } catch { toast.error("Erreur lors de l'export PDF"); } }}>
                            <FileDown className="w-4 h-4" />Exporter le rapport IA en PDF
                          </Button>
                        </div>
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                      <Brain className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm">L'analyse IA apparaîtra après la transformation</p>
                    </div>
                  )}
                </TabsContent>

                {/* REPORT TAB */}
                <TabsContent value="report" className="flex-1 m-0 overflow-hidden">
                  {markdownReport ? (
                    <ScrollArea className="h-full">
                      <div className="p-6 prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground">
                        <Streamdown>{markdownReport}</Streamdown>
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                      <BarChart3 className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm">Le rapport apparaîtra après l'analyse</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Status Bar */}
      <footer className="h-6 border-t border-border flex items-center px-3 gap-4 shrink-0 bg-secondary/20 text-[10px] font-mono">
        <span className="text-muted-foreground">{sourceFiles.length} fichier(s)</span>
        {detectedTechs.size > 0 && <span className="text-emerald-400">{detectedTechs.size} tech(s)</span>}
        {microserviceResult && <span className="text-cyan-400">{microserviceResult.proposals.length} µservice(s)</span>}
        {cloudResult && <span className="text-violet-400">{cloudResult.files.length} cloud</span>}
        <div className="ml-auto text-muted-foreground/60">
          {statusMessages.length > 0 && statusMessages[statusMessages.length - 1]}
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ScoreCard({ title, score, color, details }: {
  title: string; score: number; color: "destructive" | "primary";
  details: { label: string; value: number }[];
}) {
  const colorClasses = color === "destructive"
    ? { ring: "border-red-500/30", bg: "bg-red-500/5", text: "text-red-400", bar: "bg-red-500" }
    : { ring: "border-primary/30", bg: "bg-primary/5", text: "text-primary", bar: "bg-primary" };
  return (
    <div className={`rounded-lg border ${colorClasses.ring} ${colorClasses.bg} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <span className={`text-2xl font-bold font-mono ${colorClasses.text}`}>{score}</span>
      </div>
      <div className="space-y-2">
        {details.map((d) => (
          <div key={d.label}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{Math.min(100, Math.max(0, d.value))}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${colorClasses.bar}`} style={{ width: `${Math.min(100, Math.max(0, d.value))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AiSuggestion }) {
  const severityConfig: Record<Severity, { icon: typeof ShieldAlert; color: string; bg: string; border: string }> = {
    critical: { icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/5", border: "border-red-500/20" },
    warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/5", border: "border-amber-500/20" },
    info: { icon: Lightbulb, color: "text-blue-400", bg: "bg-blue-500/5", border: "border-blue-500/20" },
    suggestion: { icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/20" },
  };
  const cfg = severityConfig[suggestion.severity];
  const Icon = cfg.icon;
  return (
    <div className={`rounded-md border ${cfg.border} ${cfg.bg} p-3`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{suggestion.title}</span>
            <Badge variant="outline" className="text-[9px] h-4 border-border text-muted-foreground">{suggestion.ruleId}</Badge>
            <Badge variant="outline" className="text-[9px] h-4 border-border text-muted-foreground">{suggestion.category}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">{suggestion.description}</p>
          {suggestion.codeSnippet && (
            <pre className="text-[10px] font-mono bg-secondary/60 rounded px-2 py-1 mb-1.5 text-muted-foreground overflow-x-auto">{suggestion.codeSnippet}</pre>
          )}
          <div className="flex items-start gap-1.5 text-[10px]">
            <ArrowUpRight className="w-3 h-3 text-primary mt-0.5 shrink-0" />
            <span className="text-primary/80">{suggestion.fix}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MicroserviceCard({ proposal }: { proposal: MicroserviceProposal }) {
  return (
    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Server className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-semibold text-cyan-300">{proposal.name}</span>
        <Badge variant="outline" className="ml-auto text-[9px] h-4 border-cyan-500/30 text-cyan-400">{proposal.boundedContext}</Badge>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">{proposal.description}</p>
      {proposal.apis.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {proposal.apis.map((api) => (
            <span key={api.path} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              {api.method} {api.path}
            </span>
          ))}
        </div>
      )}
      {proposal.events.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {proposal.events.map((ev) => (
            <span key={ev.name} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
              {ev.type === "published" ? "PUB" : "SUB"} {ev.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
