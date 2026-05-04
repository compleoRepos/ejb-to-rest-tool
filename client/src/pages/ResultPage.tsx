/**
 * ResultPage — Résultats de la migration.
 * Score qualité, stats, boutons ZIP/rapports/checklist/relancer.
 */
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { PipelineStepper } from "@/components/PipelineStepper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Download, FileText, CheckSquare, RefreshCw,
  Trophy, Star, FileCode2, Package, AlertTriangle, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

interface StatusSummary {
  state: string;
  phase: string;
  summary?: {
    useCaseCount?: number;
    dtoCount?: number;
    fileCount?: number;
    compilationStatus?: string;
    downloadUrl?: string;
    qualityScore?: { score: string; grade: string };
    enhancedReports?: boolean;
  };
}

interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  done?: boolean;
}

export default function ResultPage() {
  const params = useParams<{ sessionId: string }>();
  const [, navigate] = useLocation();
  const sessionId = params.sessionId;

  const [status, setStatus] = useState<StatusSummary | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [reports, setReports] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        // Fetch status
        const statusRes = await fetch(`/api/agent/${sessionId}/status`);
        if (!statusRes.ok) throw new Error("Session introuvable");
        const statusData: StatusSummary = await statusRes.json();
        setStatus(statusData);

        // Fetch checklist
        try {
          const checkRes = await fetch(`/api/agent/${sessionId}/post-migration-checklist`);
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            setChecklist(Array.isArray(checkData) ? checkData : checkData.items || []);
          }
        } catch { /* optional */ }

        // Fetch reports
        try {
          const reportsRes = await fetch(`/api/agent/${sessionId}/reports`);
          if (reportsRes.ok) {
            const reportsData = await reportsRes.json();
            if (reportsData.reports) {
              setReports(reportsData.reports);
            }
          }
        } catch { /* optional */ }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const handleDownload = () => {
    window.open(`/api/agent/${sessionId}/download`, "_blank");
    toast.success("Téléchargement lancé");
  };

  const handleRelaunch = () => {
    // Navigate back to configure without re-analyzing
    navigate(`/compleo/agent/${sessionId}/configure`);
  };

  const qualityScore = status?.summary?.qualityScore;
  const scoreNum = qualityScore?.score ? parseInt(qualityScore.score.split("/")[0]) : 0;
  const scoreMax = qualityScore?.score ? parseInt(qualityScore.score.split("/")[1]) : 100;
  const scorePercent = scoreMax > 0 ? Math.round((scoreNum / scoreMax) * 100) : 0;

  const gradeColor = (grade?: string) => {
    switch (grade) {
      case "A+": case "A": return "text-emerald-400";
      case "B+": case "B": return "text-teal-400";
      case "C+": case "C": return "text-amber-400";
      default: return "text-red-400";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <PipelineStepper currentStep="result" />
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <PipelineStepper currentStep="result" />
        <div className="max-w-2xl mx-auto px-4 pt-16">
          <Card className="p-6 bg-red-500/10 border-red-500/30">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <p className="text-red-300">{error}</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <PipelineStepper currentStep="result" />

      <div className="max-w-4xl mx-auto px-4 pt-6 pb-16">
        {/* Header with score */}
        <div className="text-center mb-8">
          <Trophy className="w-12 h-12 text-teal-400 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">
            Migration terminée
          </h1>
          {qualityScore && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="text-center">
                <div className={`text-4xl font-bold ${gradeColor(qualityScore.grade)}`}>
                  {qualityScore.grade}
                </div>
                <p className="text-xs text-zinc-500 mt-1">Grade</p>
              </div>
              <div className="w-px h-12 bg-zinc-700" />
              <div className="text-center">
                <div className="text-4xl font-bold text-zinc-100">
                  {scorePercent}%
                </div>
                <p className="text-xs text-zinc-500 mt-1">{qualityScore.score}</p>
              </div>
            </div>
          )}
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="p-3 bg-zinc-900/50 border-zinc-700 text-center">
            <FileCode2 className="w-5 h-5 mx-auto text-blue-400 mb-1" />
            <p className="text-xl font-bold text-zinc-100">{status?.summary?.fileCount || 0}</p>
            <p className="text-[10px] text-zinc-500">Fichiers générés</p>
          </Card>
          <Card className="p-3 bg-zinc-900/50 border-zinc-700 text-center">
            <Package className="w-5 h-5 mx-auto text-purple-400 mb-1" />
            <p className="text-xl font-bold text-zinc-100">{status?.summary?.useCaseCount || 0}</p>
            <p className="text-[10px] text-zinc-500">Use Cases</p>
          </Card>
          <Card className="p-3 bg-zinc-900/50 border-zinc-700 text-center">
            <Star className="w-5 h-5 mx-auto text-amber-400 mb-1" />
            <p className="text-xl font-bold text-zinc-100">{status?.summary?.dtoCount || 0}</p>
            <p className="text-[10px] text-zinc-500">DTOs</p>
          </Card>
          <Card className="p-3 bg-zinc-900/50 border-zinc-700 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto text-teal-400 mb-1" />
            <p className="text-xl font-bold text-zinc-100 capitalize">
              {status?.summary?.compilationStatus || "N/A"}
            </p>
            <p className="text-[10px] text-zinc-500">Compilation</p>
          </Card>
        </div>

        {/* Tabs: Overview / Reports / Checklist */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="bg-zinc-800 border border-zinc-700">
            <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
            <TabsTrigger value="reports">Rapports</TabsTrigger>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <Card className="p-5 bg-zinc-900/50 border-zinc-700">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Résumé de la migration</h3>
              <div className="space-y-2 text-sm text-zinc-400">
                <div className="flex justify-between">
                  <span>État</span>
                  <Badge className="bg-teal-500/10 text-teal-300 border-teal-600">
                    {status?.state || "COMPLETED"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Fichiers générés</span>
                  <span className="text-zinc-200">{status?.summary?.fileCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Use Cases migrés</span>
                  <span className="text-zinc-200">{status?.summary?.useCaseCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>DTOs générés</span>
                  <span className="text-zinc-200">{status?.summary?.dtoCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Rapports enrichis</span>
                  <span className="text-zinc-200">
                    {status?.summary?.enhancedReports ? "Oui" : "Non"}
                  </span>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <Card className="p-5 bg-zinc-900/50 border-zinc-700">
              {Object.keys(reports).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(reports).map(([name, content]) => (
                    <details key={name} className="group">
                      <summary className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-zinc-800 transition-colors">
                        <FileText className="w-4 h-4 text-teal-400" />
                        <span className="text-sm font-medium text-zinc-300">{name}</span>
                      </summary>
                      <ScrollArea className="mt-2 h-64 rounded border border-zinc-800 bg-zinc-950 p-3">
                        <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">
                          {typeof content === "string" ? content : JSON.stringify(content, null, 2)}
                        </pre>
                      </ScrollArea>
                    </details>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-4">
                  Aucun rapport enrichi disponible.
                </p>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="checklist" className="mt-4">
            <Card className="p-5 bg-zinc-900/50 border-zinc-700">
              {checklist.length > 0 ? (
                <ScrollArea className="h-80">
                  <div className="space-y-2">
                    {checklist.map((item, i) => (
                      <div
                        key={item.id || i}
                        className="flex items-start gap-3 p-2.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
                      >
                        <CheckSquare className={`w-4 h-4 mt-0.5 shrink-0 ${
                          item.priority === "high" ? "text-red-400" :
                          item.priority === "medium" ? "text-amber-400" :
                          "text-zinc-500"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-300">
                              {item.title}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${
                                item.priority === "high" ? "text-red-400 border-red-600" :
                                item.priority === "medium" ? "text-amber-400 border-amber-600" :
                                "text-zinc-500 border-zinc-600"
                              }`}
                            >
                              {item.priority}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-4">
                  Checklist post-migration non disponible.
                </p>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 justify-center">
          <Button
            size="lg"
            onClick={handleDownload}
            className="gap-2 bg-teal-600 hover:bg-teal-500 text-white"
          >
            <Download className="w-4 h-4" />
            Télécharger ZIP
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={handleRelaunch}
            className="gap-2 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw className="w-4 h-4" />
            Relancer avec d'autres options
          </Button>
        </div>
      </div>
    </div>
  );
}
