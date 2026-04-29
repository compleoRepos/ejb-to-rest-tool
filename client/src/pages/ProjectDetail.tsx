/**
 * ProjectDetail — Fiche de présentation d'un projet analysé.
 * Affiche le résumé, les technologies, les scores et les résultats d'analyse.
 * Redirige vers le pipeline Agent IA pour relancer l'analyse.
 * @author Compleo
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Bot, FileCode2, Layers, Clock, TrendingUp,
  Network, GitBranch, AlertTriangle, CheckCircle2, Activity,
  BarChart3, Shield, Loader2, ExternalLink, Workflow,
  Download, FileText, Package,
} from "lucide-react";
import { toast } from "sonner";

// ─── Technology color mapping ────────────────────────────────────────────────
const TECH_COLORS: Record<string, string> = {
  EJB_3X_STATELESS: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  EJB_3X_SINGLETON: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  EJB_2X: "bg-blue-600/20 text-blue-300 border-blue-600/30",
  SERVLET: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  JSP: "bg-purple-400/20 text-purple-300 border-purple-400/30",
  STRUTS: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  JDBC: "bg-green-500/20 text-green-400 border-green-500/30",
  HIBERNATE: "bg-green-400/20 text-green-300 border-green-400/30",
  JMS: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  SOAP: "bg-red-500/20 text-red-400 border-red-500/30",
  BATCH: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  EAI_CUSTOM: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  JAX_RS: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  JPA: "bg-teal-500/20 text-teal-400 border-teal-500/30",
};

function getTechColor(tech: string): string {
  return TECH_COLORS[tech] ?? "bg-muted text-muted-foreground border-border";
}

// ─── Score gauge ─────────────────────────────────────────────────────────────
function ScoreGauge({ label, score, icon: Icon, color }: {
  label: string;
  score: number | null | undefined;
  icon: React.ElementType;
  color: string;
}) {
  if (score == null) return null;
  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card border border-border">
      <Icon className={`w-5 h-5 ${color}`} />
      <span className="text-2xl font-bold font-mono">{score}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ─── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ElementType }> = {
    active: { label: "Actif", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
    completed: { label: "Terminé", className: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CheckCircle2 },
    archived: { label: "Archivé", className: "bg-muted text-muted-foreground border-border", icon: Clock },
  };
  const c = config[status] ?? config.active;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`${c.className} gap-1`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </Badge>
  );
}

// ─── Saga info types ─────────────────────────────────────────────────────────
interface SagaCandidate {
  className: string;
  domain: string;
  stepsCount: number;
  compensableCount: number;
}

interface SagaInfo {
  detected: boolean;
  candidates: SagaCandidate[];
  filesGenerated: number;
  sessionId: string | null;
}

// ─── Hook: fetch saga info for a project ─────────────────────────────────────
function useSagaInfo(projectName: string | undefined): { sagaInfo: SagaInfo | null; loading: boolean } {
  const [sagaInfo, setSagaInfo] = useState<SagaInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectName) return;
    let cancelled = false;

    const fetchSagaInfo = async () => {
      setLoading(true);
      try {
        // Step 1: Get all completed agent sessions
        const sessionsRes = await fetch("/api/agent/sessions");
        if (!sessionsRes.ok) { setLoading(false); return; }
        const sessionsJson = await sessionsRes.json();
        const allSessions = sessionsJson.sessions || [];

        // Step 2: Find the latest completed session for this project (by name)
        const matchingSessions = allSessions
          .filter((s: any) => s.state === "COMPLETED" && s.projectName === projectName)
          .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (matchingSessions.length === 0) {
          if (!cancelled) setSagaInfo({ detected: false, candidates: [], filesGenerated: 0, sessionId: null });
          setLoading(false);
          return;
        }

        const sessionId = matchingSessions[0].id;

        // Step 3: Get saga data for that session
        const sagaRes = await fetch(`/api/agent/${sessionId}/sagas`);
        if (!sagaRes.ok) {
          if (!cancelled) setSagaInfo({ detected: false, candidates: [], filesGenerated: 0, sessionId });
          setLoading(false);
          return;
        }

        const sagaJson = await sagaRes.json();
        if (!cancelled) {
          setSagaInfo({
            detected: sagaJson.detected ?? false,
            candidates: sagaJson.candidates ?? [],
            filesGenerated: sagaJson.filesGenerated ?? 0,
            sessionId,
          });
        }
      } catch {
        if (!cancelled) setSagaInfo(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSagaInfo();
    return () => { cancelled = true; };
  }, [projectName]);

  return { sagaInfo, loading };
}

// ─── Hook: fetch agent artifacts for a project ───────────────────────────────
interface AgentArtifact {
  sessionId: string;
  state: string;
  createdAt: number;
  updatedAt: number;
  projectName: string;
  gitUrl: string | null;
  hasZip: boolean;
  hasReports: boolean;
  hasMicroservices: boolean;
  hasSagas: boolean;
  qualityGrade: string | null;
}

function useAgentArtifacts(projectName: string | undefined, gitUrl?: string | null): { artifacts: AgentArtifact[]; loading: boolean } {
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectName && !gitUrl) return;
    let cancelled = false;
    const fetchArtifacts = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/agent/sessions");
        if (!res.ok) { setLoading(false); return; }
        const json = await res.json();
        const sessions = ((json.sessions || []) as any[]).map((s: any) => ({
          ...s,
          sessionId: s.id || s.sessionId,
        })) as AgentArtifact[];
        // v10.2: Match by projectName OR gitUrl for robust artifact discovery
        const matching = sessions
          .filter((s) => {
            if (s.state !== "COMPLETED" || !s.hasZip) return false;
            if (projectName && s.projectName === projectName) return true;
            if (gitUrl && s.gitUrl && s.gitUrl === gitUrl) return true;
            return false;
          })
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (!cancelled) setArtifacts(matching);
      } catch {
        if (!cancelled) setArtifacts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchArtifacts();
    return () => { cancelled = true; };
  }, [projectName, gitUrl]);

  return { artifacts, loading };
}

// ─── Artifacts card ───────────────────────────────────────────────────────────────
function ArtifactsCard({ artifacts, loading, onNavigate }: {
  artifacts: AgentArtifact[];
  loading: boolean;
  onNavigate: (path: string) => void;
}) {
  if (loading) {
    return (
      <Card className="border-cyan-500/30 bg-cyan-500/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            <span className="text-sm text-muted-foreground">Chargement des artefacts...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (artifacts.length === 0) return null;

  const latest = artifacts[0];
  const date = latest.updatedAt
    ? new Date(latest.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <Card className="border-cyan-500/30 bg-cyan-500/5">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-cyan-500/20">
                <Package className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Artefacts de migration</h3>
                <p className="text-sm text-muted-foreground">
                  {artifacts.length} analyse{artifacts.length > 1 ? "s" : ""} complétée{artifacts.length > 1 ? "s" : ""} — dernière le {date}
                </p>
              </div>
            </div>
            {latest.qualityGrade && (
              <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-mono text-sm">
                Grade {latest.qualityGrade}
              </Badge>
            )}
          </div>

          {/* Artifact badges */}
          <div className="flex flex-wrap gap-2">
            {latest.hasZip && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
                <Download className="w-3 h-3" /> ZIP Spring Boot
              </Badge>
            )}
            {latest.hasReports && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 gap-1">
                <FileText className="w-3 h-3" /> Rapports enrichis
              </Badge>
            )}
            {latest.hasMicroservices && (
              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20 gap-1">
                <Layers className="w-3 h-3" /> Microservices
              </Badge>
            )}
            {latest.hasSagas && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1">
                <Workflow className="w-3 h-3" /> Sagas
              </Badge>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {latest.hasZip && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                onClick={() => {
                  window.open(`/api/agent/${latest.sessionId}/download`, "_blank");
                  toast.success("Téléchargement du ZIP lancé");
                }}
              >
                <Download className="w-4 h-4" />
                Télécharger le ZIP
              </Button>
            )}
            {latest.hasReports && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                onClick={() => onNavigate(`/compleo/agent?sessionId=${latest.sessionId}`)}
              >
                <FileText className="w-4 h-4" />
                Voir les rapports
              </Button>
            )}
          </div>

          {/* Older sessions */}
          {artifacts.length > 1 && (
            <div className="border-t border-border/50 pt-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Analyses précédentes</span>
              <div className="mt-2 space-y-1">
                {artifacts.slice(1, 4).map((a) => {
                  const d = a.updatedAt
                    ? new Date(a.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "—";
                  return (
                    <div key={a.sessionId} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground font-mono text-xs">{d}</span>
                      <div className="flex gap-2">
                        {a.hasZip && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => window.open(`/api/agent/${a.sessionId}/download`, "_blank")}
                          >
                            <Download className="w-3 h-3" /> ZIP
                          </Button>
                        )}
                        {a.qualityGrade && (
                          <Badge variant="outline" className="text-xs font-mono">{a.qualityGrade}</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Scan result card ────────────────────────────────────────────────────────────
function ScanCard({ scan }: { scan: any }) {
  const duration = scan.durationMs ? `${(scan.durationMs / 1000).toFixed(1)}s` : "—";
  const date = scan.completedAt
    ? new Date(scan.completedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : scan.createdAt
      ? new Date(scan.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "—";

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Dernière analyse
          </CardTitle>
          <Badge variant="outline" className={
            scan.status === "completed" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
            scan.status === "failed" ? "bg-red-500/20 text-red-400 border-red-500/30" :
            "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
          }>
            {scan.status === "completed" ? "Terminée" : scan.status === "failed" ? "Échouée" : "En cours"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Fichiers analysés</span>
            <span className="text-lg font-bold font-mono">{scan.filesAnalyzed ?? 0}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Problèmes</span>
            <span className="text-lg font-bold font-mono">{scan.issuesCount ?? 0}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Critiques</span>
            <span className="text-lg font-bold font-mono text-red-400">{scan.criticalCount ?? 0}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Durée</span>
            <span className="text-lg font-bold font-mono">{duration}</span>
          </div>
        </div>
        <Separator className="my-3" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{date}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Saga card ───────────────────────────────────────────────────────────────
function SagaCard({ sagaInfo, loading, onNavigate }: {
  sagaInfo: SagaInfo | null;
  loading: boolean;
  onNavigate: (path: string) => void;
}) {
  if (loading) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            <span className="text-sm text-muted-foreground">Chargement des Sagas...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const detected = sagaInfo?.detected ?? false;
  const candidateCount = sagaInfo?.candidates?.length ?? 0;
  const filesGenerated = sagaInfo?.filesGenerated ?? 0;
  const totalSteps = sagaInfo?.candidates?.reduce((sum, c) => sum + c.stepsCount, 0) ?? 0;

  return (
    <Card className={`border-amber-500/30 ${detected ? "bg-amber-500/5" : "bg-card"}`}>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`p-2.5 rounded-lg shrink-0 ${detected ? "bg-amber-500/20" : "bg-muted"}`}>
              <Workflow className={`w-5 h-5 ${detected ? "text-amber-400" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold">Saga Orchestration</h3>
                {detected ? (
                  <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {candidateCount} saga{candidateCount > 1 ? "s" : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                    Non détectées
                  </Badge>
                )}
              </div>
              {detected ? (
                <p className="text-sm text-muted-foreground mt-1">
                  {candidateCount} saga{candidateCount > 1 ? "s" : ""} générée{candidateCount > 1 ? "s" : ""} avec{" "}
                  {totalSteps} step{totalSteps > 1 ? "s" : ""} et {filesGenerated} fichier{filesGenerated > 1 ? "s" : ""} Java.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Aucune saga détectée pour ce projet. Relancez l'analyse pour détecter les transactions distribuées.
                </p>
              )}
            </div>
          </div>

          {/* Stats mini-cards (only when detected) */}
          {detected && (
            <div className="flex gap-3 shrink-0">
              <div className="flex flex-col items-center px-3 py-2 rounded-md bg-card border border-border">
                <span className="text-lg font-bold font-mono text-amber-400">{candidateCount}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sagas</span>
              </div>
              <div className="flex flex-col items-center px-3 py-2 rounded-md bg-card border border-border">
                <span className="text-lg font-bold font-mono">{totalSteps}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Steps</span>
              </div>
              <div className="flex flex-col items-center px-3 py-2 rounded-md bg-card border border-border">
                <span className="text-lg font-bold font-mono">{filesGenerated}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Fichiers</span>
              </div>
            </div>
          )}
        </div>

        {/* Candidates list (when detected and more than 1) */}
        {detected && candidateCount > 0 && (
          <>
            <Separator className="my-4" />
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Domaines</span>
              <div className="flex flex-wrap gap-2">
                {sagaInfo!.candidates.map((c) => (
                  <Badge
                    key={c.domain}
                    variant="outline"
                    className="bg-amber-500/10 text-amber-300 border-amber-500/20 font-mono text-xs gap-1.5"
                  >
                    <GitBranch className="w-3 h-3" />
                    {c.domain}
                    <span className="text-amber-500/60">({c.stepsCount} steps, {c.compensableCount} comp.)</span>
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Action button */}
        <div className="mt-4 flex justify-end">
          <Button
            variant={detected ? "default" : "outline"}
            size="sm"
            className={detected
              ? "bg-amber-600 hover:bg-amber-700 text-white gap-2"
              : "gap-2"
            }
            onClick={() => onNavigate("/compleo/sagas")}
          >
            <Workflow className="w-4 h-4" />
            {detected ? "Voir les Sagas" : "Explorer les Sagas"}
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────
function ProjectDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function ProjectDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { data: project, isLoading: projectLoading } = trpc.projects.getById.useQuery({ id });
  const { data: scans, isLoading: scansLoading } = trpc.scans.list.useQuery({ projectId: id });
  const { sagaInfo, loading: sagaLoading } = useSagaInfo(project?.name);
  const { artifacts, loading: artifactsLoading } = useAgentArtifacts(project?.name, project?.gitUrl);

  if (projectLoading || scansLoading) return <ProjectDetailSkeleton />;

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Projet introuvable</h2>
          <p className="text-muted-foreground mb-4">
            Le projet #{id} n'existe pas ou a été supprimé.
          </p>
          <Button variant="outline" onClick={() => setLocation("/projects")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour aux projets
          </Button>
        </Card>
      </div>
    );
  }

  const technologies = (project.technologies as string[]) ?? [];
  const lastScan = scans && scans.length > 0 ? scans[0] : null;
  const lastAnalyzedDate = project.lastAnalyzedAt
    ? new Date(project.lastAnalyzedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Jamais";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/projects")}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold truncate">{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {project.description}
              </p>
            )}
          </div>
        </div>

        {/* ── Stats cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex flex-col items-center gap-1">
              <FileCode2 className="w-5 h-5 text-emerald-400" />
              <span className="text-2xl font-bold font-mono">{project.fileCount}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Fichiers</span>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex flex-col items-center gap-1">
              <Layers className="w-5 h-5 text-blue-400" />
              <span className="text-2xl font-bold font-mono">
                {project.totalLines > 1000 ? `${(project.totalLines / 1000).toFixed(1)}k` : project.totalLines}
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Lignes</span>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex flex-col items-center gap-1">
              <Activity className="w-5 h-5 text-purple-400" />
              <span className="text-2xl font-bold font-mono">{technologies.length}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Technologies</span>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex flex-col items-center gap-1">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium text-center leading-tight">{lastAnalyzedDate}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Dernière analyse</span>
            </CardContent>
          </Card>
        </div>

        {/* ── Scores ─────────────────────────────────────────────────── */}
        {(project.legacyScore != null || project.modernScore != null) && (
          <div className="grid grid-cols-2 gap-4">
            <ScoreGauge
              label="Score Legacy"
              score={project.legacyScore}
              icon={AlertTriangle}
              color="text-yellow-400"
            />
            <ScoreGauge
              label="Score Moderne"
              score={project.modernScore}
              icon={TrendingUp}
              color="text-emerald-400"
            />
          </div>
        )}

        {/* ── Technologies ────────────────────────────────────────────── */}
        {technologies.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Technologies détectées
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {technologies.map((tech) => (
                  <Badge
                    key={tech}
                    variant="outline"
                    className={`${getTechColor(tech)} font-mono text-xs`}
                  >
                    {tech.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Git info ───────────────────────────────────────────────── */}
        {project.gitUrl && (
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <GitBranch className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-mono truncate block">{project.gitUrl}</span>
                {project.gitBranch && (
                  <span className="text-xs text-muted-foreground">Branche : {project.gitBranch}</span>
                )}
              </div>
              {project.gitProvider && (
                <Badge variant="outline" className="shrink-0 capitalize">
                  {project.gitProvider.replace("_", " ")}
                </Badge>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Artefacts de migration (v10.0) ───────────────────────────── */}
        <ArtifactsCard
          artifacts={artifacts}
          loading={artifactsLoading}
          onNavigate={setLocation}
        />

        {/* ── Last scan ────────────────────────────────────────────────────── */}
        {lastScan && <ScanCard scan={lastScan} />}

        {/* ── Saga Orchestration card ────────────────────────────── */}
        <SagaCard
          sagaInfo={sagaInfo}
          loading={sagaLoading}
          onNavigate={setLocation}
        />

        {/* ── Pipeline Agent IA ──────────────────────────────────────── */}
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-lg font-semibold mb-1">Pipeline Agent IA</h3>
                <p className="text-sm text-muted-foreground">
                  Lancez ou relancez l'analyse complète de ce projet avec le moteur COMPLEO.
                  Détection multi-technologies, génération Spring Boot, Sagas, microservices.
                </p>
              </div>
              <Button
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-2"
                onClick={() => setLocation(`/compleo/agent?projectId=${id}`)}
              >
                <Bot className="w-5 h-5" />
                Lancer l'Agent IA
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Navigation links ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col items-center gap-2"
            onClick={() => setLocation(`/architecture/${id}`)}
          >
            <Network className="w-5 h-5 text-blue-400" />
            <span className="text-sm">Architecture</span>
            <span className="text-xs text-muted-foreground">Graphe interactif</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col items-center gap-2"
            onClick={() => setLocation(`/migration/${id}`)}
          >
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm">Migration</span>
            <span className="text-xs text-muted-foreground">Plan de migration</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col items-center gap-2"
            onClick={() => setLocation(`/collaboration/${id}`)}
          >
            <Shield className="w-5 h-5 text-purple-400" />
            <span className="text-sm">Collaboration</span>
            <span className="text-xs text-muted-foreground">Commentaires et rapports</span>
          </Button>
        </div>

      </div>
    </div>
  );
}
