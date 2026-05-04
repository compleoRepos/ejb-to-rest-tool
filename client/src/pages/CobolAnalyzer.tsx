/**
 * CobolAnalyzer.tsx — Page d'analyse COBOL
 * 
 * Upload de fichiers COBOL/JCL/COPYBOOK, analyse et visualisation du rapport.
 * Design "Terminal Craft" cohérent avec le reste de l'application.
 */

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import {
  Upload, FileCode2, Play, Download, AlertTriangle,
  CheckCircle2, BarChart3, FileText, Layers, Cpu,
  Database, ArrowRight, Trash2, FolderOpen
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileEntry {
  fileName: string;
  content: string;
  type: 'COBOL' | 'COPYBOOK' | 'JCL';
  size: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CobolAnalyzerPage() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [projectName, setProjectName] = useState("cobol-banking");
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeMutation = trpc.cobol.analyze.useMutation({
    onSuccess: (data) => {
      setAnalysisResult(data);
      setActiveTab("report");
      if (data.success) {
        toast.success(`Analyse terminée : ${data.stats.programsParsed} programmes, ${data.stats.totalLoc} LOC`);
      } else {
        toast.warning(`Analyse partielle : ${data.errors.length} erreurs`);
      }
    },
    onError: (err) => {
      toast.error(`Erreur d'analyse : ${err.message}`);
    },
  });

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles) return;

    const newFiles: FileEntry[] = [];
    let processed = 0;

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const ext = file.name.toLowerCase().split('.').pop() || '';
        let type: FileEntry['type'] = 'COBOL';
        if (['cpy', 'copy', 'cpb'].includes(ext)) type = 'COPYBOOK';
        else if (['jcl', 'job', 'proc'].includes(ext)) type = 'JCL';

        newFiles.push({
          fileName: file.name,
          content,
          type,
          size: file.size,
        });

        processed++;
        if (processed === uploadedFiles.length) {
          setFiles(prev => [...prev, ...newFiles]);
          toast.success(`${newFiles.length} fichier(s) ajouté(s)`);
        }
      };
      reader.readAsText(file);
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const items = event.dataTransfer.files;
    if (items.length > 0) {
      const fakeEvent = { target: { files: items } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(fakeEvent);
    }
  }, [handleFileUpload]);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const runAnalysis = () => {
    if (files.length === 0) {
      toast.error("Aucun fichier à analyser");
      return;
    }
    analyzeMutation.mutate({
      projectName,
      files: files.map(f => ({
        fileName: f.fileName,
        content: f.content,
        type: f.type,
      })),
    });
  };

  const downloadReport = () => {
    if (!analysisResult?.report?.markdownReport) return;
    const blob = new Blob([analysisResult.report.markdownReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}-cobol-analysis.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[oklch(0.13_0.01_250)] text-[oklch(0.93_0.01_250)]">
      {/* Header */}
      <div className="border-b border-[oklch(0.25_0.01_250)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">COBOL Analyzer</h1>
              <p className="text-xs text-[oklch(0.60_0.01_250)]">
                Analyse de migration mainframe → Java/Spring Boot
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {analysisResult?.report && (
              <Button
                variant="outline"
                size="sm"
                onClick={downloadReport}
                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              >
                <Download className="w-4 h-4 mr-1" />
                Export MD
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[oklch(0.16_0.01_250)] border border-[oklch(0.25_0.01_250)]">
            <TabsTrigger value="upload" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
              <Upload className="w-4 h-4 mr-1" /> Upload
            </TabsTrigger>
            <TabsTrigger value="report" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300" disabled={!analysisResult}>
              <FileText className="w-4 h-4 mr-1" /> Rapport
            </TabsTrigger>
            <TabsTrigger value="tech" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300" disabled={!analysisResult}>
              <Layers className="w-4 h-4 mr-1" /> Technologies
            </TabsTrigger>
            <TabsTrigger value="effort" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300" disabled={!analysisResult}>
              <BarChart3 className="w-4 h-4 mr-1" /> Effort
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Drop Zone */}
              <div className="lg:col-span-2">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[oklch(0.30_0.01_250)] rounded-lg p-12 text-center cursor-pointer hover:border-emerald-500/50 transition-colors"
                >
                  <FolderOpen className="w-12 h-12 mx-auto mb-4 text-[oklch(0.45_0.01_250)]" />
                  <p className="text-lg font-medium mb-2">Déposez vos fichiers COBOL ici</p>
                  <p className="text-sm text-[oklch(0.55_0.01_250)]">
                    Formats supportés : .cbl, .cob, .cpy, .copy, .jcl, .job, .proc
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".cbl,.cob,.cobol,.cpy,.copy,.cpb,.jcl,.job,.proc"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="mt-4 border border-[oklch(0.25_0.01_250)] rounded-lg overflow-hidden">
                    <div className="bg-[oklch(0.16_0.01_250)] px-4 py-2 border-b border-[oklch(0.25_0.01_250)] flex items-center justify-between">
                      <span className="text-sm font-medium">{files.length} fichier(s)</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFiles([])}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Tout supprimer
                      </Button>
                    </div>
                    <ScrollArea className="max-h-64">
                      {files.map((file, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2 border-b border-[oklch(0.20_0.01_250)] last:border-0">
                          <div className="flex items-center gap-2">
                            <FileCode2 className="w-4 h-4 text-emerald-400" />
                            <span className="text-sm font-mono">{file.fileName}</span>
                            <Badge variant="outline" className="text-xs">
                              {file.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[oklch(0.50_0.01_250)]">
                              {(file.size / 1024).toFixed(1)} KB
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(i)}
                              className="h-6 w-6 p-0 text-red-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                )}
              </div>

              {/* Config Panel */}
              <div className="space-y-4">
                <div className="border border-[oklch(0.25_0.01_250)] rounded-lg p-4 bg-[oklch(0.15_0.01_250)]">
                  <h3 className="text-sm font-semibold mb-3">Configuration</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-[oklch(0.55_0.01_250)] block mb-1">Nom du projet</label>
                      <input
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        className="w-full bg-[oklch(0.12_0.01_250)] border border-[oklch(0.30_0.01_250)] rounded px-3 py-1.5 text-sm font-mono focus:border-emerald-500/50 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  onClick={runAnalysis}
                  disabled={files.length === 0 || analyzeMutation.isPending}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full"
                      />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Lancer l'analyse
                    </>
                  )}
                </Button>

                {/* Stats */}
                {analysisResult && (
                  <div className="border border-[oklch(0.25_0.01_250)] rounded-lg p-4 bg-[oklch(0.15_0.01_250)]">
                    <h3 className="text-sm font-semibold mb-3">Résultats</h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[oklch(0.55_0.01_250)]">Programmes</span>
                        <span className="font-mono">{analysisResult.stats.programsParsed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[oklch(0.55_0.01_250)]">Jobs JCL</span>
                        <span className="font-mono">{analysisResult.stats.jclJobsParsed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[oklch(0.55_0.01_250)]">LOC total</span>
                        <span className="font-mono">{analysisResult.stats.totalLoc.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[oklch(0.55_0.01_250)]">Temps d'analyse</span>
                        <span className="font-mono">{analysisResult.stats.parseTimeMs}ms</span>
                      </div>
                      {analysisResult.report && (
                        <>
                          <div className="border-t border-[oklch(0.25_0.01_250)] pt-2 mt-2">
                            <div className="flex justify-between">
                              <span className="text-[oklch(0.55_0.01_250)]">Score readiness</span>
                              <span className={`font-mono font-bold ${
                                analysisResult.report.migrationReadinessScore >= 70 ? 'text-emerald-400' :
                                analysisResult.report.migrationReadinessScore >= 40 ? 'text-yellow-400' : 'text-red-400'
                              }`}>
                                {analysisResult.report.migrationReadinessScore}/100
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[oklch(0.55_0.01_250)]">Effort total</span>
                              <span className="font-mono font-bold text-amber-400">
                                {analysisResult.report.totalEffortJH} j/h
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Report Tab */}
          <TabsContent value="report" className="mt-4">
            {analysisResult?.report?.markdownReport && (
              <div className="border border-[oklch(0.25_0.01_250)] rounded-lg bg-[oklch(0.15_0.01_250)]">
                <div className="px-4 py-2 border-b border-[oklch(0.25_0.01_250)] flex items-center justify-between">
                  <span className="text-sm font-medium">Rapport de migration</span>
                  <Button variant="ghost" size="sm" onClick={downloadReport}>
                    <Download className="w-3 h-3 mr-1" /> Télécharger
                  </Button>
                </div>
                <ScrollArea className="h-[600px] p-6">
                  <pre className="text-sm font-mono whitespace-pre-wrap text-[oklch(0.80_0.01_250)]">
                    {analysisResult.report.markdownReport}
                  </pre>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          {/* Technologies Tab */}
          <TabsContent value="tech" className="mt-4">
            {analysisResult?.report?.techDetections && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysisResult.report.techDetections.map((tech: any, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`border rounded-lg p-4 ${
                      tech.detected
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] opacity-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {tech.detected ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[oklch(0.40_0.01_250)]" />
                        )}
                        <span className="font-semibold text-sm">{tech.technology}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          tech.migrationImpact === 'CRITICAL' ? 'border-red-500/50 text-red-400' :
                          tech.migrationImpact === 'HIGH' ? 'border-orange-500/50 text-orange-400' :
                          tech.migrationImpact === 'MEDIUM' ? 'border-yellow-500/50 text-yellow-400' :
                          'border-green-500/50 text-green-400'
                        }`}
                      >
                        {tech.migrationImpact}
                      </Badge>
                    </div>
                    {tech.detected && (
                      <>
                        <p className="text-xs text-[oklch(0.60_0.01_250)] mb-2">
                          {tech.count} occurrence(s) dans {tech.programs.length} programme(s)
                        </p>
                        <p className="text-xs text-emerald-300/80">{tech.migrationNote}</p>
                      </>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Effort Tab */}
          <TabsContent value="effort" className="mt-4">
            {analysisResult?.report?.effortEstimates && (
              <div className="space-y-4">
                {/* Summary bar */}
                <div className="grid grid-cols-4 gap-4">
                  {['REWRITE', 'REFACTOR', 'REHOST', 'REPLACE'].map(strategy => {
                    const items = analysisResult.report.effortEstimates.filter((e: any) => e.strategy === strategy);
                    const totalJH = items.reduce((s: number, e: any) => s + e.effortJH, 0);
                    return (
                      <div key={strategy} className="border border-[oklch(0.25_0.01_250)] rounded-lg p-3 bg-[oklch(0.15_0.01_250)]">
                        <div className="text-xs text-[oklch(0.55_0.01_250)]">{strategy}</div>
                        <div className="text-lg font-bold font-mono">{items.length}</div>
                        <div className="text-xs text-amber-400">{totalJH} j/h</div>
                      </div>
                    );
                  })}
                </div>

                {/* Table */}
                <div className="border border-[oklch(0.25_0.01_250)] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[oklch(0.16_0.01_250)]">
                      <tr className="border-b border-[oklch(0.25_0.01_250)]">
                        <th className="px-4 py-2 text-left font-medium">Programme</th>
                        <th className="px-4 py-2 text-left font-medium">Stratégie</th>
                        <th className="px-4 py-2 text-right font-medium">Effort (j/h)</th>
                        <th className="px-4 py-2 text-left font-medium">Risque</th>
                        <th className="px-4 py-2 text-left font-medium">Justification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisResult.report.effortEstimates.map((e: any, i: number) => (
                        <tr key={i} className="border-b border-[oklch(0.20_0.01_250)]">
                          <td className="px-4 py-2 font-mono text-emerald-300">{e.programId}</td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="text-xs">{e.strategy}</Badge>
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-bold">{e.effortJH}</td>
                          <td className="px-4 py-2">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                e.risk === 'CRITICAL' ? 'border-red-500/50 text-red-400' :
                                e.risk === 'HIGH' ? 'border-orange-500/50 text-orange-400' :
                                e.risk === 'MEDIUM' ? 'border-yellow-500/50 text-yellow-400' :
                                'border-green-500/50 text-green-400'
                              }`}
                            >
                              {e.risk}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-xs text-[oklch(0.60_0.01_250)] max-w-xs truncate">
                            {e.justification}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
