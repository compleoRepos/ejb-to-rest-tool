/**
 * Architecture — Page d'analyse d'architecture avancée.
 * Intègre le pipeline complet : GraphBuilder → DomainClusterer → ArchitectureDiscovery → MicroserviceExtractor.
 * Visualisation interactive Cytoscape.js 3 niveaux + exports multi-formats.
 *
 * @author Compleo
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network, Loader2, Play, ArrowLeft, Download,
  Layers, Box, AlertTriangle, CheckCircle2, GitBranch,
  BarChart3, Shield, Zap, Target, ArrowRight,
} from "lucide-react";
import { ArchitectureViewer } from "@/components/ArchitectureViewer";
import { ArchitectureExplorer } from "@/components/architecture";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ArchitectureAnalysisResult {
  success: boolean;
  duration: number;
  graph: {
    totalNodes: number;
    totalEdges: number;
    connectedComponents: number;
    avgDegree: number;
    maxDegree?: number;
    cyclicDependencies?: string[][];
    nodes?: Array<{
      id: string; type: string; className?: string; packageName?: string;
      role?: string; domain?: string; linesOfCode?: number; complexity?: number;
      technologyType?: string; sourceFile?: string;
      systemName?: string; externalType?: string; protocol?: string;
    }>;
    edges?: Array<{
      id: string; source: string; target: string; type: string; weight: number; label: string;
    }>;
    nodeMetrics?: Array<{
      nodeId: string; inDegree: number; outDegree: number; betweenness: number; cohesion: number;
    }>;
  };
  domains: Array<{
    domainId: string; classes?: string[]; classCount: number;
    cohesion: number; coupling: number; warnings?: string[];
  }>;
  architecture: {
    entryPoints: number; exitPoints: number; criticalFlows: number;
    highRiskFlows: number; modules: number;
    avgModuleCohesion?: number; avgModuleCoupling?: number;
  };
  microservices: Array<{
    id: string; name: string; description?: string; boundedContext: string;
    classes: string[];
    classDetails?: Array<{ nodeId: string; className: string; role: string; domain: string }>;
    classCount: number;
    endpoints: Array<{ method: string; path: string; description: string; sourceClass: string; protocol: string }> | number;
    endpointCount?: number;
    cohesion: number; coupling: number; complexity?: number; linesOfCode?: number;
    dependencies: Array<{
      targetServiceId: string; targetServiceName: string; type: string;
      protocol?: string; description?: string;
    }>;
    databases?: string[]; queues?: string[];
    springBootConfig?: { artifactId: string; port: number; profiles: string[]; dependencies: string[] } | null;
  }>;
  sharedLibrary: {
    name: string; description?: string; classes?: string[]; classCount: number;
  };
  apiGateway: { routes: Array<{ path: string; targetService: string; method: string }> };
  extractionSummary?: {
    totalMicroservices: number; totalClasses: number; totalEndpoints: number;
    totalDependencies: number; avgCohesion: number; avgCoupling: number; sharedClassCount: number;
  };
  warnings: string[];
  visualizations: {
    cytoscapeData: any;
    svgDependency: string | null;
    svgMicroservices: string | null;
    svgOverview: string | null;
  };
  entryPoints: Array<{ nodeId: string; className: string; type: string; protocol: string; description?: string }>;
  exitPoints: Array<{ nodeId: string; className: string; type: string; target: string; targetSystem?: string; protocol?: string }>;
  criticalFlows: Array<{
    id: string; name: string; depth: number; riskLevel: string;
    riskFactors: string[]; transactional: boolean;
    path?: string[]; pathLength: number;
    entryPoint?: any; exitPoints?: any[];
  }>;
  functionalModules?: Array<{
    id: string; name: string; description: string; domains: string[];
    classes: string[]; entryPoints: any[]; exitPoints: any[];
    internalEdges: number; externalEdges: number; cohesion: number; coupling: number;
  }>;
}

interface SessionInfo {
  id: string;
  projectName: string;
  status: string;
  fileCount?: number;
}

// ─── Domain Colors ──────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  ACCOUNT_MANAGEMENT: "#4A90D9",
  PAYMENT_PROCESSING: "#E74C3C",
  CREDIT_MANAGEMENT: "#F39C12",
  KYC_COMPLIANCE: "#27AE60",
  CARD_MANAGEMENT: "#9B59B6",
  BATCH_PROCESSING: "#1ABC9C",
  RISK_MANAGEMENT: "#E67E22",
  TRANSFER_MANAGEMENT: "#3498DB",
  CUSTOMER_MANAGEMENT: "#2ECC71",
  REPORTING: "#95A5A6",
  UNKNOWN: "#BDC3C7",
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ArchitecturePage({ projectId }: { projectId?: number }) {
  const { data: project } = trpc.projects.getById.useQuery(
    { id: projectId! },
    { enabled: !!projectId }
  );
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [analysisResult, setAnalysisResult] = useState<ArchitectureAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Load available sessions and pre-select from URL query param
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdFromUrl = urlParams.get("sessionId");

    fetch("/api/compleo/sessions")
      .then((r) => r.json())
      .then((data) => {
        // API returns a flat array, not { sessions: [...] }
        const sessionList = Array.isArray(data) ? data : (data.sessions || []);
        const analyzed = sessionList.filter(
          (s: any) => s.status === "analyzed" || s.status === "generated" || s.status === "waiting_choices" || s.status === "missing_deps"
        );
        setSessions(analyzed);
        // Pre-select session from URL param, or fall back to first session
        if (sessionIdFromUrl && analyzed.some((s: any) => s.id === sessionIdFromUrl)) {
          setSelectedSessionId(sessionIdFromUrl);
        } else if (analyzed.length > 0 && !selectedSessionId) {
          setSelectedSessionId(analyzed[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Run architecture analysis
  const handleAnalyze = useCallback(async () => {
    if (!selectedSessionId) {
      toast.error("Sélectionnez une session Compleo");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const res = await fetch("/api/architecture/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur d'analyse");
      }

      const data = await res.json();

      // Normalize cytoscapeData: backend returns Cytoscape native format
      // { elements: [{group:"nodes",...}, {group:"edges",...}] }
      // but ArchitectureViewer expects { nodes: [...], edges: [...] }
      if (data.visualizations?.cytoscapeData) {
        const cd = data.visualizations.cytoscapeData;
        if (cd.elements && !cd.nodes) {
          const elems = Array.isArray(cd.elements) ? cd.elements : [];
          cd.nodes = elems
            .filter((e: any) => e.group === "nodes")
            .map((e: any) => ({ data: e.data }));
          cd.edges = elems
            .filter((e: any) => e.group === "edges")
            .map((e: any) => ({ data: e.data }));
        }
        // Ensure nodes and edges are always arrays
        cd.nodes = cd.nodes || [];
        cd.edges = cd.edges || [];
      }

      setAnalysisResult(data);
      toast.success(`Analyse terminée en ${data.duration}ms — ${data.microservices?.length ?? 0} microservices identifiés`);
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'analyse d'architecture");
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedSessionId]);

  // Export handler
  const handleExport = useCallback(
    async (format: string) => {
      if (!selectedSessionId || !analysisResult) return;

      if (format === "png") {
        // PNG export is handled by Cytoscape directly
        toast.info("Utilisez le bouton PNG dans la vue interactive");
        return;
      }

      try {
        const formatMap: Record<string, string> = {
          svg: "svg",
          graphml: "graphml",
          json: "json",
          d2: "d2",
        };

        const apiFormat = formatMap[format] || format;
        const url = `/api/architecture/export/${selectedSessionId}/${apiFormat}`;
        window.open(url, "_blank");
        toast.success(`Export ${format.toUpperCase()} lancé`);
      } catch {
        toast.error("Erreur lors de l'export");
      }
    },
    [selectedSessionId, analysisResult]
  );

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* Header */}
      <div className="border-b border-border bg-secondary/20 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-cyan-400" />
          <div>
            <h1 className="text-sm font-bold">
              Architecture Discovery — {project?.name || sessions.find(s => s.id === selectedSessionId)?.projectName || "Projet"}
            </h1>
            <p className="text-[10px] text-muted-foreground">
              Analyse de graphe de dépendances, clustering de domaines, extraction de microservices
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
            <SelectTrigger className="w-[220px] h-8 text-xs">
              <SelectValue placeholder="Session Compleo..." />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.projectName} ({s.id.slice(0, 8)})
                </SelectItem>
              ))}
              {sessions.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Aucune session analysée
                </div>
              )}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={isAnalyzing || !selectedSessionId}
            className="gap-1.5"
          >
            {isAnalyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {isAnalyzing ? "Analyse..." : "Analyser l'architecture"}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {!analysisResult && !isAnalyzing && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4 max-w-lg">
              <Network className="w-16 h-16 text-muted-foreground/30 mx-auto" />
              <h2 className="text-lg font-semibold">Architecture Discovery Platform</h2>
              <p className="text-sm text-muted-foreground">
                Sélectionnez une session Compleo analysée et lancez l'analyse d'architecture
                pour découvrir les domaines, les flux critiques et extraire les microservices.
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <GitBranch className="w-4 h-4" />
                <span>GraphBuilder</span>
                <ArrowRight className="w-3 h-3" />
                <span>DomainClusterer</span>
                <ArrowRight className="w-3 h-3" />
                <span>ArchitectureDiscovery</span>
                <ArrowRight className="w-3 h-3" />
                <span>MicroserviceExtractor</span>
              </div>
            </div>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">
                Analyse en cours... Construction du graphe, clustering, découverte d'architecture
              </p>
            </div>
          </div>
        )}

        {analysisResult && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <div className="border-b border-border px-6 shrink-0">
              <TabsList className="h-9">
                <TabsTrigger value="overview" className="text-xs gap-1">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Vue d'ensemble
                </TabsTrigger>
                <TabsTrigger value="graph" className="text-xs gap-1">
                  <Network className="w-3.5 h-3.5" />
                  Graphe interactif
                </TabsTrigger>
                <TabsTrigger value="microservices" className="text-xs gap-1">
                  <Box className="w-3.5 h-3.5" />
                  Microservices
                </TabsTrigger>
                <TabsTrigger value="flows" className="text-xs gap-1">
                  <Zap className="w-3.5 h-3.5" />
                  Flux critiques
                </TabsTrigger>
                <TabsTrigger value="domains" className="text-xs gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  Domaines
                </TabsTrigger>
                <TabsTrigger value="explorer" className="text-xs gap-1">
                  <Target className="w-3.5 h-3.5" />
                  Explorer v5.8
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Overview Tab */}
            <TabsContent value="overview" className="flex-1 overflow-auto p-6">
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <Card className="bg-secondary/30">
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold font-mono text-cyan-400">
                        {analysisResult.graph.totalNodes}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Nœuds</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-secondary/30">
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold font-mono text-blue-400">
                        {analysisResult.graph.totalEdges}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Arêtes</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-secondary/30">
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold font-mono text-emerald-400">
                        {analysisResult.domains.length}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Domaines</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-secondary/30">
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold font-mono text-purple-400">
                        {analysisResult.microservices.length}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Microservices</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-secondary/30">
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold font-mono text-amber-400">
                        {analysisResult.architecture.criticalFlows}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Flux critiques</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-secondary/30">
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold font-mono text-red-400">
                        {analysisResult.architecture.highRiskFlows}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Risques élevés</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Duration + Warnings */}
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
                    Analyse en {analysisResult.duration}ms
                  </Badge>
                  {analysisResult.warnings.length > 0 && (
                    <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {analysisResult.warnings.length} avertissement(s)
                    </Badge>
                  )}
                </div>

                {/* Entry/Exit Points */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Target className="w-4 h-4 text-emerald-400" />
                        Points d'entrée ({analysisResult.entryPoints.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5">
                        {analysisResult.entryPoints.slice(0, 10).map((ep, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="font-mono truncate max-w-[200px]">{ep.className}</span>
                            <div className="flex gap-1.5">
                              <Badge variant="secondary" className="text-[9px]">{ep.type}</Badge>
                              <Badge variant="outline" className="text-[9px]">{ep.protocol}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-red-400" />
                        Points de sortie ({analysisResult.exitPoints.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5">
                        {analysisResult.exitPoints.slice(0, 10).map((ep, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="font-mono truncate max-w-[200px]">{ep.className}</span>
                            <div className="flex gap-1.5">
                              <Badge variant="secondary" className="text-[9px]">{ep.type}</Badge>
                              <Badge variant="outline" className="text-[9px]">{ep.target}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* API Gateway Routes */}
                {analysisResult.apiGateway.routes.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4 text-purple-400" />
                        API Gateway — {analysisResult.apiGateway.routes.length} routes
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {analysisResult.apiGateway.routes.slice(0, 12).map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs font-mono bg-secondary/30 rounded px-2 py-1.5">
                            <Badge variant="outline" className="text-[9px] shrink-0">{r.method}</Badge>
                            <span className="truncate text-muted-foreground">{r.path}</span>
                            <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                            <span className="truncate text-cyan-400">{r.targetService}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Warnings */}
                {analysisResult.warnings.length > 0 && (
                  <Card className="border-amber-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
                        <AlertTriangle className="w-4 h-4" />
                        Avertissements
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {analysisResult.warnings.map((w, i) => (
                          <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-amber-400 shrink-0">•</span>
                            {w}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Graph Tab */}
            <TabsContent value="graph" className="flex-1 overflow-hidden p-4">
              <ArchitectureViewer
                cytoscapeData={analysisResult.visualizations.cytoscapeData}
                microservices={analysisResult.microservices}
                svgDependency={analysisResult.visualizations.svgDependency || undefined}
                svgMicroservices={analysisResult.visualizations.svgMicroservices || undefined}
                svgOverview={analysisResult.visualizations.svgOverview || undefined}
                onExport={handleExport}
              />
            </TabsContent>

            {/* Microservices Tab */}
            <TabsContent value="microservices" className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">
                    {analysisResult.microservices.length} Microservices extraits
                  </h2>
                  <Badge variant="outline" className="text-xs">
                    Shared Library: {analysisResult.sharedLibrary.name} ({analysisResult.sharedLibrary.classCount} classes)
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {analysisResult.microservices.map((ms) => (
                    <Card key={ms.id} className="hover:border-primary/50 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                DOMAIN_COLORS[ms.boundedContext.split("+")[0]] || DOMAIN_COLORS.UNKNOWN,
                            }}
                          />
                          {ms.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-xs text-muted-foreground">
                          Bounded Context: {ms.boundedContext.replace(/_/g, " ")}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-secondary/30 rounded p-2 text-center">
                            <div className="text-lg font-bold font-mono">{ms.classCount}</div>
                            <div className="text-[9px] text-muted-foreground">Classes</div>
                          </div>
                          <div className="bg-secondary/30 rounded p-2 text-center">
                            <div className="text-lg font-bold font-mono">{typeof ms.endpoints === 'number' ? ms.endpoints : ms.endpoints.length}</div>
                            <div className="text-[9px] text-muted-foreground">Endpoints</div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground">Cohésion</span>
                            <span className={ms.cohesion >= 0.5 ? "text-emerald-400" : "text-amber-400"}>
                              {(ms.cohesion * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-1">
                            <div
                              className={`h-1 rounded-full ${ms.cohesion >= 0.5 ? "bg-emerald-400" : "bg-amber-400"}`}
                              style={{ width: `${ms.cohesion * 100}%` }}
                            />
                          </div>

                          <div className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground">Couplage</span>
                            <span className={ms.coupling <= 0.3 ? "text-emerald-400" : "text-red-400"}>
                              {(ms.coupling * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-1">
                            <div
                              className={`h-1 rounded-full ${ms.coupling <= 0.3 ? "bg-emerald-400" : "bg-red-400"}`}
                              style={{ width: `${ms.coupling * 100}%` }}
                            />
                          </div>
                        </div>

                        {ms.dependencies.length > 0 && (
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1">
                              Dépendances ({ms.dependencies.length})
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {ms.dependencies.map((dep, i) => (
                                <Badge key={i} variant="outline" className="text-[9px]">
                                  {dep.targetServiceName}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Critical Flows Tab */}
            <TabsContent value="flows" className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                <h2 className="text-sm font-bold">
                  {analysisResult.criticalFlows.length} Flux critiques identifiés
                </h2>

                <div className="space-y-3">
                  {analysisResult.criticalFlows.map((flow) => (
                    <Card
                      key={flow.id}
                      className={`border-l-4 ${
                        flow.riskLevel === "CRITICAL"
                          ? "border-l-red-500"
                          : flow.riskLevel === "HIGH"
                          ? "border-l-orange-500"
                          : flow.riskLevel === "MEDIUM"
                          ? "border-l-amber-500"
                          : "border-l-emerald-500"
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{flow.name}</span>
                            <Badge
                              variant={
                                flow.riskLevel === "CRITICAL" || flow.riskLevel === "HIGH"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="text-[9px]"
                            >
                              {flow.riskLevel}
                            </Badge>
                            {flow.transactional && (
                              <Badge variant="outline" className="text-[9px]">
                                Transactionnel
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Profondeur: {flow.depth} | {flow.pathLength} étapes
                          </div>
                        </div>

                        {flow.riskFactors.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {flow.riskFactors.map((rf, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] text-amber-400 border-amber-400/30">
                                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                {rf}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Domains Tab */}
            <TabsContent value="domains" className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                <h2 className="text-sm font-bold">
                  {analysisResult.domains.length} Domaines métier identifiés
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {analysisResult.domains.map((domain) => (
                    <Card key={domain.domainId}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: DOMAIN_COLORS[domain.domainId] || DOMAIN_COLORS.UNKNOWN,
                            }}
                          />
                          {domain.domainId.replace(/_/g, " ")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-lg font-bold font-mono">{domain.classCount}</div>
                            <div className="text-[9px] text-muted-foreground">Classes</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold font-mono text-emerald-400">
                              {(domain.cohesion * 100).toFixed(0)}%
                            </div>
                            <div className="text-[9px] text-muted-foreground">Cohésion</div>
                          </div>
                          <div>
                            <div
                              className={`text-lg font-bold font-mono ${
                                domain.coupling <= 0.3 ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {(domain.coupling * 100).toFixed(0)}%
                            </div>
                            <div className="text-[9px] text-muted-foreground">Couplage</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>
            {/* Explorer Tab (v5.8) */}
            <TabsContent value="explorer" className="flex-1 overflow-hidden">
              <ArchitectureExplorer analysisResult={analysisResult} sessionId={selectedSessionId} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
