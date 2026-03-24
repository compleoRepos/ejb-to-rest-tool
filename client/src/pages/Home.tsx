/**
 * EJB Client Modernizer — Page principale.
 * Interface IDE-like avec panneaux redimensionnables, Monaco Editor,
 * rapport d'analyse et code généré.
 *
 * Design: "Terminal Craft" — Esthétique IDE/Terminal haut de gamme.
 * @author Hamza NORDINE
 */

import { useState, useCallback, useRef } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";
import { Streamdown } from "streamdown";

import Editor from "@monaco-editor/react";
import { analyzeJavaCode, generateMarkdownReport } from "@/lib/ejb-analyzer";
import type { AnalysisReport } from "@/lib/ejb-analyzer";
import { generateModernCode } from "@/lib/code-generator";
import type { GeneratedFile, GenerationResult } from "@/lib/code-generator";
import { SAMPLE_CODES } from "@/lib/sample-code";

export default function Home() {
  const [legacyCode, setLegacyCode] = useState(SAMPLE_CODES[0].code);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [markdownReport, setMarkdownReport] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState("code");
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const addStatus = useCallback((msg: string) => {
    setStatusMessages((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Analyse du code
  const handleAnalyze = useCallback(() => {
    if (!legacyCode.trim()) {
      toast.error("Veuillez coller ou charger du code Java.");
      return;
    }
    setIsAnalyzing(true);
    addStatus("Analyse du code legacy en cours...");

    setTimeout(() => {
      try {
        const report = analyzeJavaCode(legacyCode, "LegacyCode.java");
        setAnalysisReport(report);
        const md = generateMarkdownReport(report);
        setMarkdownReport(md);
        setActiveRightTab("report");

        addStatus(`Analyse terminée : ${report.summary.totalEjbInjections} injections EJB, ${report.summary.totalJndiLookups} lookups JNDI, ${report.summary.totalMethodCalls} appels de méthodes`);
        if (report.summary.totalTransactions > 0) {
          addStatus(`⚠ ${report.summary.totalTransactions} transaction(s) détectée(s) — vérification manuelle recommandée`);
        }
        if (report.summary.totalJmsElements > 0) {
          addStatus(`⚠ ${report.summary.totalJmsElements} élément(s) JMS/MQ/Batch détecté(s)`);
        }
        toast.success(`Analyse terminée : ${report.summary.servicesDetected.length} service(s) détecté(s)`);
      } catch (e) {
        addStatus("Erreur lors de l'analyse");
        toast.error("Erreur lors de l'analyse du code.");
      }
      setIsAnalyzing(false);
    }, 400);
  }, [legacyCode, addStatus]);

  // Génération du code
  const handleGenerate = useCallback(() => {
    if (!analysisReport) {
      toast.error("Veuillez d'abord analyser le code.");
      return;
    }
    setIsGenerating(true);
    addStatus("Génération du code API Client moderne...");

    setTimeout(() => {
      try {
        const result = generateModernCode(analysisReport);
        setGenerationResult(result);
        if (result.files.length > 0) {
          setSelectedFile(result.files[0]);
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
  }, [analysisReport, addStatus]);

  // Upload fichier
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setLegacyCode(content);
        addStatus(`Fichier chargé : ${file.name}`);
        toast.success(`Fichier ${file.name} chargé`);
      };
      reader.readAsText(file);
    },
    [addStatus]
  );

  // Upload dossier
  const handleFolderUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      let combinedCode = "";
      let count = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith(".java")) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            combinedCode += `// ===== ${file.name} =====\n${ev.target?.result as string}\n\n`;
            count++;
            if (count === files.length || i === files.length - 1) {
              setLegacyCode(combinedCode);
              addStatus(`${count} fichier(s) Java chargé(s)`);
              toast.success(`${count} fichier(s) Java chargé(s)`);
            }
          };
          reader.readAsText(file);
        }
      }
    },
    [addStatus]
  );

  // Téléchargement du code généré
  const handleDownload = useCallback(() => {
    if (!generationResult) return;
    const content = generationResult.files.map((f) => `// ===== ${f.path} =====\n${f.content}`).join("\n\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "api-client-modernized.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Code téléchargé");
  }, [generationResult]);

  // Copier le code
  const handleCopy = useCallback(() => {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile.content);
      toast.success("Code copié dans le presse-papier");
    }
  }, [selectedFile]);

  // Sélection d'un exemple
  const handleSampleSelect = useCallback(
    (value: string) => {
      const sample = SAMPLE_CODES.find((s) => s.name === value);
      if (sample) {
        setLegacyCode(sample.code);
        setAnalysisReport(null);
        setGenerationResult(null);
        setSelectedFile(null);
        addStatus(`Exemple chargé : ${sample.name}`);
      }
    },
    [addStatus]
  );

  const filesByType = generationResult
    ? {
        client: generationResult.files.filter((f) => f.type === "client"),
        config: generationResult.files.filter((f) => f.type === "config"),
        dto: generationResult.files.filter((f) => f.type === "dto"),
        exception: generationResult.files.filter((f) => f.type === "exception"),
        util: generationResult.files.filter((f) => f.type === "util"),
        test: generationResult.files.filter((f) => f.type === "test"),
      }
    : null;

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

          <input ref={fileInputRef} type="file" accept=".java" className="hidden" onChange={handleFileUpload} />
          <input
            ref={folderInputRef}
            type="file"
            /* @ts-expect-error webkitdirectory is valid */
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={handleFolderUpload}
          />

          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" />
            Fichier
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => folderInputRef.current?.click()}>
            <FolderOpen className="w-3.5 h-3.5" />
            Dossier
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Analyser
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={handleGenerate}
            disabled={isGenerating || !analysisReport}
          >
            {isGenerating ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Transformer
          </Button>

          {generationResult && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
              Télécharger
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Panel — Legacy Code */}
          <ResizablePanel defaultSize={45} minSize={25}>
            <div className="h-full flex flex-col">
              <div className="h-9 border-b border-border flex items-center px-3 gap-2 shrink-0 bg-secondary/30">
                <FileCode2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Code Java Legacy</span>
                {analysisReport && (
                  <div className="ml-auto flex gap-1.5">
                    {analysisReport.summary.totalEjbInjections > 0 && (
                      <Badge variant="outline" className="text-[10px] h-5 border-primary/40 text-primary">
                        {analysisReport.summary.totalEjbInjections} @EJB
                      </Badge>
                    )}
                    {analysisReport.summary.totalJndiLookups > 0 && (
                      <Badge variant="outline" className="text-[10px] h-5 border-accent/40 text-accent">
                        {analysisReport.summary.totalJndiLookups} JNDI
                      </Badge>
                    )}
                    {analysisReport.summary.totalJmsElements > 0 && (
                      <Badge variant="outline" className="text-[10px] h-5 border-destructive/40 text-destructive">
                        {analysisReport.summary.totalJmsElements} JMS/MQ
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <Editor
                  height="100%"
                  language="java"
                  theme="vs-dark"
                  value={legacyCode}
                  onChange={(val) => setLegacyCode(val || "")}
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
              <Tabs value={activeRightTab} onValueChange={setActiveRightTab} className="h-full flex flex-col">
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

                  {selectedFile && activeRightTab === "code" && (
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono">{selectedFile.path}</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCopy}>
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
                                          onClick={() => setSelectedFile(file)}
                                          className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
                                            selectedFile?.path === file.path
                                              ? "bg-primary/15 text-primary"
                                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                          }`}
                                        >
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

                      {/* Code viewer */}
                      <div className="flex-1">
                        {selectedFile ? (
                          <Editor
                            height="100%"
                            language="java"
                            theme="vs-dark"
                            value={selectedFile.content}
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
                        <p className="text-sm">Collez du code Java legacy, puis cliquez sur <strong className="text-primary">Analyser</strong> et <strong className="text-accent">Transformer</strong></p>
                        <p className="text-xs text-muted-foreground/60">Le code sera transformé en clients API REST modernes (WebClient)</p>
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
                      <p className="text-sm">Le rapport d'analyse apparaîtra ici après l'analyse</p>
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

        {analysisReport && (
          <>
            <div className="w-px h-3.5 bg-border" />
            <div className="flex items-center gap-1 text-primary">
              <CheckCircle2 className="w-3 h-3" />
              <span>{analysisReport.summary.servicesDetected.length} service(s)</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <GitBranch className="w-3 h-3" />
              <span>{analysisReport.summary.totalDependencies} dép.</span>
            </div>
            {analysisReport.summary.totalTransactions > 0 && (
              <div className="flex items-center gap-1 text-accent">
                <AlertTriangle className="w-3 h-3" />
                <span>{analysisReport.summary.totalTransactions} tx</span>
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
