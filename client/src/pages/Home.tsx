/**
 * EJB Client Modernizer — Page principale.
 * Interface IDE-like avec panneaux redimensionnables, Monaco Editor,
 * support multi-fichiers avec onglets, rapport d'analyse et code généré.
 *
 * Design: "Terminal Craft" — Esthétique IDE/Terminal haut de gamme.
 * @author Hamza NORDINE
 */

import { useState, useCallback, useRef, useMemo } from "react";
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
  Play,
  Zap,
  Download,
  Upload,
  FolderOpen,
  FileCode2,
  BarChart3,
  Code2,
  Terminal,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  GitBranch,
  Copy,
  X,
  Plus,
  FilePlus2,
  FolderGit2,
  Loader2,
  PackageOpen,
} from "lucide-react";
import { Streamdown } from "streamdown";

import Editor from "@monaco-editor/react";
import { analyzeJavaCode, generateMarkdownReport } from "@/lib/ejb-analyzer";
import type { AnalysisReport } from "@/lib/ejb-analyzer";
import { mergeReports, generateMultiFileMarkdownReport } from "@/lib/ejb-analyzer-merge";
import { generateModernCode } from "@/lib/code-generator";
import type { GeneratedFile, GenerationResult } from "@/lib/code-generator";
import { SAMPLE_CODES } from "@/lib/sample-code";
import { exportToZip } from "@/lib/zip-exporter";
import type { GeneratedFile as ZipFile } from "@/lib/zip-exporter";

// ============================================================
// Types
// ============================================================

interface SourceFile {
  id: string;
  name: string;
  content: string;
  report?: AnalysisReport;
}

let fileIdCounter = 1;
function nextFileId(): string {
  return `file-${fileIdCounter++}`;
}

// ============================================================
// Composant principal
// ============================================================

export default function Home() {
  // Multi-file state
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([
    { id: nextFileId(), name: "PaymentProcessor.java", content: SAMPLE_CODES[0].code },
  ]);
  const [activeFileId, setActiveFileId] = useState<string>(sourceFiles[0].id);

  // Analysis & generation
  const [mergedReport, setMergedReport] = useState<AnalysisReport | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [markdownReport, setMarkdownReport] = useState<string>("");
  const [selectedGenFile, setSelectedGenFile] = useState<GeneratedFile | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState("code");
  const [statusMessages, setStatusMessages] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // Project mode state
  const [isProjectMode, setIsProjectMode] = useState(false);
  const [projectName, setProjectName] = useState<string>("");
  const [projectProgress, setProjectProgress] = useState<{ current: number; total: number; phase: string } | null>(null);

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
      if (javaFiles.length === 0) {
        toast.error("Aucun fichier .java trouvé.");
        return;
      }

      let loaded = 0;
      const newFiles: SourceFile[] = [];

      for (const file of javaFiles) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          newFiles.push({
            id: nextFileId(),
            name: file.name,
            content,
          });
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

      // Reset input so the same file can be re-uploaded
      e.target.value = "";
    },
    [addStatus]
  );

  const handleFolderUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const javaFiles = Array.from(files).filter((f) => f.name.endsWith(".java"));
      if (javaFiles.length === 0) {
        toast.error("Aucun fichier .java trouvé dans le dossier.");
        return;
      }

      let loaded = 0;
      const newFiles: SourceFile[] = [];

      for (const file of javaFiles) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          newFiles.push({
            id: nextFileId(),
            name: file.name,
            content,
          });
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

  // ---- Project mode: load entire project ----

  const handleProjectUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const allFiles = Array.from(files);
      const javaFiles = allFiles.filter(
        (f) => f.name.endsWith(".java") && !f.name.endsWith("package-info.java")
      );

      if (javaFiles.length === 0) {
        toast.error("Aucun fichier .java trouvé dans le projet.");
        e.target.value = "";
        return;
      }

      // Detect project name from common root
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
          const content = ev.target?.result as string;
          const relativePath = (file as any).webkitRelativePath || file.name;
          newFiles.push({
            id: nextFileId(),
            name: relativePath.split("/").pop() || file.name,
            content,
          });
          loaded++;
          setProjectProgress({ current: loaded, total: javaFiles.length, phase: "Chargement des fichiers..." });

          if (loaded === javaFiles.length) {
            // Replace all tabs with project files
            setSourceFiles(newFiles);
            setActiveFileId(newFiles[0].id);
            setMergedReport(null);
            setGenerationResult(null);
            setSelectedGenFile(null);
            addStatus(`${newFiles.length} fichier(s) chargé(s) depuis "${detectedName}"`);
            toast.success(`Projet "${detectedName}" chargé : ${newFiles.length} fichier(s) Java`);

            // Auto-analyze after loading
            setProjectProgress({ current: 0, total: newFiles.length, phase: "Analyse en cours..." });
            setTimeout(() => {
              runProjectBatch(newFiles);
            }, 300);
          }
        };
        reader.readAsText(file);
      }

      e.target.value = "";
    },
    [addStatus]
  );

  const runProjectBatch = useCallback(
    (files: SourceFile[]) => {
      setIsAnalyzing(true);
      addStatus(`Analyse batch de ${files.length} fichier(s)...`);

      const reports: AnalysisReport[] = [];
      const updatedFiles: SourceFile[] = [];
      let analyzed = 0;

      // Process files in chunks to avoid blocking the UI
      const chunkSize = 5;
      const processChunk = (startIdx: number) => {
        const endIdx = Math.min(startIdx + chunkSize, files.length);

        for (let i = startIdx; i < endIdx; i++) {
          const sf = files[i];
          if (sf.content.trim()) {
            try {
              const report = analyzeJavaCode(sf.content, sf.name);
              reports.push(report);
              updatedFiles.push({ ...sf, report });
            } catch {
              updatedFiles.push(sf);
            }
          } else {
            updatedFiles.push(sf);
          }
          analyzed++;
        }

        setProjectProgress({ current: analyzed, total: files.length, phase: "Analyse en cours..." });

        if (endIdx < files.length) {
          // Process next chunk
          setTimeout(() => processChunk(endIdx), 10);
        } else {
          // All files analyzed, now merge and generate
          setSourceFiles(updatedFiles);

          const merged = mergeReports(reports);
          setMergedReport(merged);

          let md: string;
          if (reports.length === 1) {
            md = generateMarkdownReport(reports[0]);
          } else {
            md = generateMultiFileMarkdownReport(reports, merged);
          }
          setMarkdownReport(md);
          setIsAnalyzing(false);

          addStatus(
            `Analyse terminée : ${merged.summary.totalEjbInjections} @EJB, ${merged.summary.totalJndiLookups} JNDI, ${merged.summary.totalMethodCalls} appels`
          );
          toast.success(
            `Analyse terminée : ${merged.summary.servicesDetected.length} service(s) dans ${reports.length} fichier(s)`
          );

          // Auto-generate
          setProjectProgress({ current: 0, total: 1, phase: "Génération du code..." });
          setIsGenerating(true);
          addStatus("Génération du code API Client moderne...");

          setTimeout(() => {
            try {
              const result = generateModernCode(merged);
              setGenerationResult(result);
              if (result.files.length > 0) {
                setSelectedGenFile(result.files[0]);
              }
              setActiveRightTab("code");
              addStatus(`Génération terminée : ${result.files.length} fichier(s) généré(s)`);
              toast.success(
                `Projet "${projectName || 'Projet'}" traité : ${result.files.length} fichier(s) générés à partir de ${reports.length} source(s)`
              );
            } catch {
              addStatus("Erreur lors de la génération");
              toast.error("Erreur lors de la génération du code.");
            }
            setIsGenerating(false);
            setProjectProgress(null);
          }, 300);
        }
      };

      // Start processing
      setTimeout(() => processChunk(0), 10);
    },
    [addStatus, projectName]
  );

  // ---- Analysis ----

  const handleAnalyze = useCallback(() => {
    if (sourceFiles.every((f) => !f.content.trim())) {
      toast.error("Aucun code Java à analyser.");
      return;
    }
    setIsAnalyzing(true);
    addStatus(`Analyse de ${sourceFiles.length} fichier(s) en cours...`);

    setTimeout(() => {
      try {
        const reports: AnalysisReport[] = [];
        const updatedFiles = sourceFiles.map((sf) => {
          if (sf.content.trim()) {
            const report = analyzeJavaCode(sf.content, sf.name);
            reports.push(report);
            return { ...sf, report };
          }
          return sf;
        });
        setSourceFiles(updatedFiles);

        const merged = mergeReports(reports);
        setMergedReport(merged);

        // Generate markdown
        let md: string;
        if (reports.length === 1) {
          md = generateMarkdownReport(reports[0]);
        } else {
          md = generateMultiFileMarkdownReport(reports, merged);
        }
        setMarkdownReport(md);
        setActiveRightTab("report");

        addStatus(
          `Analyse terminée : ${merged.summary.totalEjbInjections} injections EJB, ${merged.summary.totalJndiLookups} lookups JNDI, ${merged.summary.totalMethodCalls} appels de méthodes`
        );
        if (merged.summary.totalTransactions > 0) {
          addStatus(`⚠ ${merged.summary.totalTransactions} transaction(s) détectée(s) — vérification manuelle recommandée`);
        }
        if (merged.summary.totalJmsElements > 0) {
          addStatus(`⚠ ${merged.summary.totalJmsElements} élément(s) JMS/MQ/Batch détecté(s)`);
        }
        toast.success(`Analyse terminée : ${merged.summary.servicesDetected.length} service(s) détecté(s) dans ${reports.length} fichier(s)`);
      } catch (e) {
        addStatus("Erreur lors de l'analyse");
        toast.error("Erreur lors de l'analyse du code.");
      }
      setIsAnalyzing(false);
    }, 400);
  }, [sourceFiles, addStatus]);

  // ---- Generation ----

  const handleGenerate = useCallback(() => {
    if (!mergedReport) {
      toast.error("Veuillez d'abord analyser le code.");
      return;
    }
    setIsGenerating(true);
    addStatus("Génération du code API Client moderne...");

    setTimeout(() => {
      try {
        const result = generateModernCode(mergedReport);
        setGenerationResult(result);
        if (result.files.length > 0) {
          setSelectedGenFile(result.files[0]);
        }
        setActiveRightTab("code");

        addStatus(`Génération terminée : ${result.files.length} fichier(s) généré(s)`);
        toast.success(`${result.files.length} fichier(s) généré(s) avec succès`);
      } catch (e) {
        addStatus("Erreur lors de la génération");
        toast.error("Erreur lors de la génération du code.");
      }
      setIsGenerating(false);
    }, 600);
  }, [mergedReport, addStatus]);

  // ---- Download ZIP ----

  const [isExporting, setIsExporting] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!generationResult) return;
    setIsExporting(true);
    addStatus("Export ZIP Maven en cours...");

    try {
      // Adapter les fichiers au format attendu par zip-exporter
      const zipFiles: ZipFile[] = generationResult.files.map((f) => ({
        path: f.path,
        content: f.content,
        category: f.type.toUpperCase(),
      }));

      await exportToZip(zipFiles, "ejb-client-modernized", markdownReport || undefined);

      addStatus(`Export ZIP terminé : ${generationResult.files.length} fichier(s)`);
      toast.success("Archive ZIP Maven téléchargée avec succès");
    } catch (e) {
      addStatus("Erreur lors de l'export ZIP");
      toast.error("Erreur lors de la génération du ZIP.");
    }
    setIsExporting(false);
  }, [generationResult, markdownReport, addStatus]);

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

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm tracking-wide">EJB Client Modernizer</span>
          </div>
          <span className="text-muted-foreground text-xs">par Hamza NORDINE</span>
        </div>

        <div className="flex items-center gap-2">
          <Select onValueChange={handleSampleSelect}>
            <SelectTrigger className="w-52 h-8 text-xs bg-secondary border-border">
              <SelectValue placeholder="Charger un exemple..." />
            </SelectTrigger>
            <SelectContent>
              {SAMPLE_CODES.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".java"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          <input
            ref={folderInputRef}
            type="file"
            /* @ts-expect-error webkitdirectory is valid */
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={handleFolderUpload}
          />
          <input
            ref={projectInputRef}
            type="file"
            /* @ts-expect-error webkitdirectory is valid */
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={handleProjectUpload}
          />

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5" />
            Fichier(s)
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Dossier
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => projectInputRef.current?.click()}
            disabled={!!projectProgress}
          >
            {projectProgress ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FolderGit2 className="w-3.5 h-3.5" />
            )}
            Projet entier
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <Clock className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Analyser
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={handleGenerate}
            disabled={isGenerating || !mergedReport}
          >
            {isGenerating ? (
              <Clock className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            Transformer
          </Button>

          {generationResult && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleDownload}
              disabled={isExporting}
            >
              {isExporting ? (
                <Clock className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {isExporting ? "Export..." : "ZIP Maven"}
            </Button>
          )}
        </div>
      </header>

      {/* Project progress bar */}
      {projectProgress && (
        <div className="h-8 border-b border-border flex items-center px-4 gap-3 bg-emerald-950/30 shrink-0">
          <FolderGit2 className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-emerald-300 font-medium">
            {projectName ? `Projet : ${projectName}` : "Projet"}
          </span>
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{
                width: `${projectProgress.total > 0 ? (projectProgress.current / projectProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-[10px] text-emerald-400 font-mono">
            {projectProgress.phase} ({projectProgress.current}/{projectProgress.total})
          </span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Panel — Legacy Code with Tabs */}
          <ResizablePanel defaultSize={45} minSize={25}>
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
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setRenamingFileId(null);
                            }}
                            className="bg-transparent border-b border-primary text-xs w-32 outline-none font-mono"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="truncate max-w-[120px] font-mono text-[11px]">
                            {sf.name}
                          </span>
                        )}
                        {sf.report && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        )}
                        {sourceFiles.length > 1 && (
                          <span
                            onClick={(e) => closeFile(sf.id, e)}
                            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    ))}

                    {/* Add new tab button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={addNewFile}
                          className="flex items-center justify-center h-9 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>Nouvel onglet</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <ScrollBar orientation="horizontal" className="h-0" />
                </ScrollArea>

                {/* Badge summary */}
                {totalBadges && (
                  <div className="flex gap-1.5 px-2 shrink-0">
                    {totalBadges.ejb > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 border-primary/40 text-primary"
                      >
                        {totalBadges.ejb} @EJB
                      </Badge>
                    )}
                    {totalBadges.jndi > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 border-accent/40 text-accent"
                      >
                        {totalBadges.jndi} JNDI
                      </Badge>
                    )}
                    {totalBadges.jms > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 border-destructive/40 text-destructive"
                      >
                        {totalBadges.jms} JMS/MQ
                      </Badge>
                    )}
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
                    {activeFile.report.summary.totalTransactions > 0 &&
                      ` · ${activeFile.report.summary.totalTransactions} tx`}
                  </span>
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

          {/* Right Panel — Generated Code / Report */}
          <ResizablePanel defaultSize={55} minSize={25}>
            <div className="h-full flex flex-col">
              <Tabs
                value={activeRightTab}
                onValueChange={setActiveRightTab}
                className="h-full flex flex-col"
              >
                <div className="h-9 border-b border-border flex items-center px-3 shrink-0 bg-secondary/30">
                  <TabsList className="h-7 bg-transparent p-0 gap-0">
                    <TabsTrigger
                      value="code"
                      className="h-7 text-xs px-3 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground"
                    >
                      <Code2 className="w-3.5 h-3.5 mr-1.5" />
                      Code Généré
                      {generationResult && (
                        <Badge className="ml-1.5 h-4 text-[10px] bg-primary/20 text-primary border-0">
                          {generationResult.files.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="report"
                      className="h-7 text-xs px-3 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-foreground text-muted-foreground"
                    >
                      <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                      Rapport
                    </TabsTrigger>
                  </TabsList>

                  {selectedGenFile && activeRightTab === "code" && (
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {selectedGenFile.path}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={handleCopy}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>

                <TabsContent value="code" className="flex-1 m-0 overflow-hidden">
                  {generationResult ? (
                    <div className="h-full flex">
                      {/* File tree */}
                      <div className="w-56 border-r border-border shrink-0 overflow-hidden">
                        <ScrollArea className="h-full">
                          <div className="p-2">
                            {filesByType &&
                              Object.entries(filesByType).map(
                                ([type, files]) =>
                                  files.length > 0 && (
                                    <div key={type} className="mb-2">
                                      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                        <Layers className="w-3 h-3" />
                                        {type}
                                      </div>
                                      {files.map((file) => (
                                        <button
                                          key={file.path}
                                          onClick={() => setSelectedGenFile(file)}
                                          className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
                                            selectedGenFile?.path === file.path
                                              ? "bg-primary/15 text-primary"
                                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                          }`}
                                        >
                                          <ChevronRight className="w-3 h-3 shrink-0" />
                                          <span className="truncate font-mono text-[11px]">
                                            {file.fileName}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )
                              )}
                          </div>
                        </ScrollArea>
                      </div>

                      {/* Code viewer */}
                      <div className="flex-1">
                        {selectedGenFile ? (
                          <Editor
                            height="100%"
                            language="java"
                            theme="vs-dark"
                            value={selectedGenFile.content}
                            options={{
                              readOnly: true,
                              fontSize: 13,
                              fontFamily: "'JetBrains Mono', monospace",
                              minimap: { enabled: false },
                              scrollBeyondLastLine: false,
                              padding: { top: 12 },
                              lineNumbers: "on",
                              renderLineHighlight: "none",
                              smoothScrolling: true,
                            }}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                            Sélectionnez un fichier dans l'arborescence
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center gap-3"
                      >
                        <div className="w-16 h-16 rounded-xl bg-secondary/50 flex items-center justify-center">
                          <Zap className="w-8 h-8 text-primary/40" />
                        </div>
                        <p className="text-sm">
                          Collez du code Java legacy, puis cliquez sur{" "}
                          <strong className="text-primary">Analyser</strong> et{" "}
                          <strong className="text-accent">Transformer</strong>
                        </p>
                        <p className="text-xs text-muted-foreground/60">
                          Le code sera transformé en clients API REST modernes (WebClient)
                        </p>
                      </motion.div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="report" className="flex-1 m-0 overflow-hidden">
                  {markdownReport ? (
                    <ScrollArea className="h-full">
                      <div className="p-6 prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-td:text-muted-foreground prose-th:text-foreground">
                        <Streamdown>{markdownReport}</Streamdown>
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                      <BarChart3 className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm">
                        Le rapport d'analyse apparaîtra ici après l'analyse
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Status Bar */}
      <footer className="h-7 border-t border-border flex items-center px-3 gap-4 shrink-0 bg-secondary/20 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Terminal className="w-3 h-3" />
          <span>EJB Client Modernizer v1.0</span>
        </div>

        <div className="w-px h-3.5 bg-border" />
        <div className="flex items-center gap-1 text-muted-foreground">
          <FilePlus2 className="w-3 h-3" />
          <span>{sourceFiles.length} fichier(s)</span>
        </div>

        {isProjectMode && projectName && (
          <>
            <div className="w-px h-3.5 bg-border" />
            <div className="flex items-center gap-1 text-emerald-400">
              <PackageOpen className="w-3 h-3" />
              <span>{projectName}</span>
            </div>
          </>
        )}

        {mergedReport && (
          <>
            <div className="w-px h-3.5 bg-border" />
            <div className="flex items-center gap-1 text-primary">
              <CheckCircle2 className="w-3 h-3" />
              <span>{mergedReport.summary.servicesDetected.length} service(s)</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <GitBranch className="w-3 h-3" />
              <span>{mergedReport.summary.totalDependencies} dép.</span>
            </div>
            {mergedReport.summary.totalTransactions > 0 && (
              <div className="flex items-center gap-1 text-accent">
                <AlertTriangle className="w-3 h-3" />
                <span>{mergedReport.summary.totalTransactions} tx</span>
              </div>
            )}
          </>
        )}

        {generationResult && (
          <>
            <div className="w-px h-3.5 bg-border" />
            <div className="flex items-center gap-1 text-primary">
              <FileCode2 className="w-3 h-3" />
              <span>{generationResult.files.length} fichier(s) générés</span>
            </div>
          </>
        )}

        <div className="ml-auto text-muted-foreground/60">
          {statusMessages.length > 0 && statusMessages[statusMessages.length - 1]}
        </div>
      </footer>
    </div>
  );
}
