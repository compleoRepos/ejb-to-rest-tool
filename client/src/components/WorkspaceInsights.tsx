/**
 * WorkspaceInsights v1.1 — Panneau d'intelligence du workspace.
 * Affiche les redondances détectées, les interconnexions cross-module
 * et les recommandations de mutualisation.
 *
 * v1.1: Fix types to match backend WorkspaceIntelligenceEngine output.
 *
 * @author Compleo
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Loader2, AlertTriangle, CheckCircle2,
  GitMerge, Layers, ArrowRight, TrendingUp,
  Shield, Zap, RefreshCw, ChevronDown, ChevronUp,
  Network, Copy, Target, BarChart3,
} from "lucide-react";

// ─── Types (aligned with backend WorkspaceIntelligenceEngine) ──────────────

interface RedundancyMatch {
  id: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  type: string;
  similarityScore: number;
  projectA: {
    sessionId: string;
    projectName: string;
    className: string;
    domain: string;
    methods: string[];
  };
  projectB: {
    sessionId: string;
    projectName: string;
    className: string;
    domain: string;
    methods: string[];
  };
  sharedMethods: string[];
  explanation: string;
}

interface AffectedProject {
  sessionId: string;
  projectName: string;
  affectedClasses: string[];
}

interface MutualizationRecommendation {
  id: string;
  type: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  affectedProjects: AffectedProject[];
  actionItems: string[];
  effortReductionPercent: number;
  estimatedLinesSaved: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

interface ResolvedLink {
  jndiPath: string;
  sourceSessionId: string;
  sourceClass: string;
  targetSessionId: string;
  targetClass: string;
  targetServiceClass: string;
  status: string;
}

interface UnresolvedLink {
  jndiPath: string;
  sourceSessionId: string;
  sourceClass: string;
  targetModuleName: string;
  targetClass: string;
  status: string;
}

interface WorkspaceInsight {
  workspaceId: string;
  lastAnalyzedAt: string;
  projectCount: number;
  projects: Array<{
    sessionId: string;
    projectName: string;
    artifactId: string;
    useCaseCount: number;
    serviceCount: number;
    dtoCount: number;
    technologies: string[];
  }>;
  redundancy: {
    totalProjectsAnalyzed: number;
    totalUseCasesScanned: number;
    totalServicesScanned: number;
    matches: RedundancyMatch[];
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
    byDomain: Record<string, RedundancyMatch[]>;
  };
  mutualization: {
    timestamp: string;
    totalProjects: number;
    summary: {
      totalRecommendations: number;
      criticalCount: number;
      highCount: number;
      mediumCount: number;
      lowCount: number;
      totalEstimatedLinesSaved: number;
      averageEffortReduction: number;
    };
    recommendations: MutualizationRecommendation[];
    dependencyGraph: {
      totalInterconnections: number;
      resolvedLinks: number;
      unresolvedLinks: number;
      stronglyCoupledPairs: Array<{
        projectA: string;
        projectB: string;
        linkCount: number;
      }>;
    };
  };
  crossModuleResolution: {
    totalLinks: number;
    resolvedLinks: ResolvedLink[];
    unresolvedLinks: UnresolvedLink[];
    resolutionRate: number;
  };
  healthScore: number;
  keyInsights: string[];
}

interface WorkspaceInsightsProps {
  workspaceId: string;
  workspaceName: string;
}

// ─── Helper: map sessionId to projectName ──────────────────────────────────

function buildSessionNameMap(projects: WorkspaceInsight["projects"]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of projects) {
    map.set(p.sessionId, p.projectName);
  }
  return map;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorkspaceInsights({ workspaceId, workspaceName }: WorkspaceInsightsProps) {
  const [insight, setInsight] = useState<WorkspaceInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["overview", "redundancy", "recommendations"])
  );

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const loadInsights = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/insights`);
      if (res.ok) {
        const data = await res.json();
        setInsight(data.insight);
      } else {
        const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
        toast.error(err.error || "Erreur lors de l'analyse");
      }
    } catch (err) {
      toast.error("Erreur réseau lors de l'analyse");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  // ─── Health Score Color ─────────────────────────────────────────────────

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
  };

  const getHealthBg = (score: number) => {
    if (score >= 80) return "bg-emerald-500/10 border-emerald-500/20";
    if (score >= 60) return "bg-amber-500/10 border-amber-500/20";
    return "bg-red-500/10 border-red-500/20";
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case "HIGH":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "MEDIUM":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "LOW":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "bg-[oklch(0.2_0.01_250)] text-[oklch(0.6_0.01_250)]";
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "CRITICAL":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "HIGH":
        return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      case "MEDIUM":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "LOW":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "bg-[oklch(0.2_0.01_250)] text-[oklch(0.6_0.01_250)]";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "MERGE_SERVICES": return <GitMerge className="w-4 h-4" />;
      case "CREATE_API_GATEWAY": return <Network className="w-4 h-4" />;
      case "CONSOLIDATE_ENTITIES": return <Layers className="w-4 h-4" />;
      case "EXTRACT_SHARED_LIB": return <Copy className="w-4 h-4" />;
      default: return <Target className="w-4 h-4" />;
    }
  };

  // ─── Section Header ─────────────────────────────────────────────────────

  const SectionHeader = ({ id, icon, title, count }: { id: string; icon: React.ReactNode; title: string; count?: number }) => (
    <button
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between py-2 text-left"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        {count !== undefined && count > 0 && (
          <Badge className="bg-[oklch(0.2_0.01_250)] text-[oklch(0.7_0.01_250)] border-[oklch(0.25_0.01_250)]">
            {count}
          </Badge>
        )}
      </div>
      {expandedSections.has(id) ? (
        <ChevronUp className="w-4 h-4 text-[oklch(0.5_0.01_250)]" />
      ) : (
        <ChevronDown className="w-4 h-4 text-[oklch(0.5_0.01_250)]" />
      )}
    </button>
  );

  // ─── Loading State ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.16_0.01_250)] p-6">
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-3" />
          <p className="text-sm text-[oklch(0.6_0.01_250)]">Analyse intelligente en cours...</p>
          <p className="text-xs text-[oklch(0.45_0.01_250)] mt-1">
            Détection des redondances, interconnexions et opportunités de mutualisation
          </p>
        </div>
      </div>
    );
  }

  if (!insight) {
    return (
      <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.16_0.01_250)] p-6">
        <div className="flex flex-col items-center justify-center py-8 text-[oklch(0.45_0.01_250)]">
          <Brain className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">Aucune analyse disponible</p>
          <Button
            onClick={loadInsights}
            variant="outline"
            size="sm"
            className="mt-3 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Lancer l'analyse
          </Button>
        </div>
      </div>
    );
  }

  // Build sessionId → projectName map for cross-module links display
  const sessionNameMap = buildSessionNameMap(insight.projects);
  const getProjectName = (sessionId: string) => sessionNameMap.get(sessionId) || sessionId;

  const redundancyMatches = insight.redundancy?.matches || [];
  const recommendations = insight.mutualization?.recommendations || [];
  const resolvedLinks = insight.crossModuleResolution?.resolvedLinks || [];
  const unresolvedLinks = insight.crossModuleResolution?.unresolvedLinks || [];
  const keyInsights = insight.keyInsights || [];
  const stronglyCoupled = insight.mutualization?.dependencyGraph?.stronglyCoupledPairs || [];

  return (
    <div className="space-y-4">
      {/* ─── Health Score & Overview ─────────────────────────────────────── */}
      <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.16_0.01_250)] p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold">Intelligence Workspace</h3>
          </div>
          <Button
            onClick={loadInsights}
            variant="ghost"
            size="sm"
            className="text-[oklch(0.6_0.01_250)] hover:text-white"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Actualiser
          </Button>
        </div>

        {/* Health Score */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className={`rounded-md border p-3 text-center ${getHealthBg(insight.healthScore)}`}>
            <Shield className={`w-4 h-4 mx-auto mb-1 ${getHealthColor(insight.healthScore)}`} />
            <p className={`text-2xl font-bold ${getHealthColor(insight.healthScore)}`}>
              {insight.healthScore}%
            </p>
            <p className="text-xs text-[oklch(0.5_0.01_250)]">Score santé</p>
          </div>
          <div className="rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.2_0.01_250)] p-3 text-center">
            <Layers className="w-4 h-4 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-400">{insight.projectCount}</p>
            <p className="text-xs text-[oklch(0.5_0.01_250)]">Projets</p>
          </div>
          <div className="rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.2_0.01_250)] p-3 text-center">
            <Copy className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-400">
              {redundancyMatches.length}
            </p>
            <p className="text-xs text-[oklch(0.5_0.01_250)]">Redondances</p>
          </div>
          <div className="rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.2_0.01_250)] p-3 text-center">
            <GitMerge className="w-4 h-4 text-purple-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-purple-400">
              {recommendations.length}
            </p>
            <p className="text-xs text-[oklch(0.5_0.01_250)]">Recommandations</p>
          </div>
        </div>

        {/* Key Insights */}
        {keyInsights.length > 0 && (
          <div className="space-y-1.5">
            {keyInsights.map((msg, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs text-[oklch(0.65_0.01_250)] bg-[oklch(0.12_0.01_250)] rounded-md px-3 py-2"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>{msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Projects Overview ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.16_0.01_250)] p-4">
        <SectionHeader
          id="overview"
          icon={<BarChart3 className="w-4 h-4 text-blue-400" />}
          title="Vue d'ensemble des projets"
          count={insight.projectCount}
        />
        <AnimatePresence>
          {expandedSections.has("overview") && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 mt-2">
                {insight.projects.map(proj => (
                  <div
                    key={proj.sessionId}
                    className="p-3 rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.2_0.01_250)]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{proj.projectName}</span>
                      <div className="flex gap-1.5">
                        {proj.technologies.map(tech => (
                          <Badge
                            key={tech}
                            className="bg-[oklch(0.2_0.01_250)] text-[oklch(0.7_0.01_250)] border-[oklch(0.25_0.01_250)] text-[10px]"
                          >
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <span className="text-blue-400 font-bold">{proj.useCaseCount}</span>
                        <span className="text-[oklch(0.5_0.01_250)] ml-1">UseCases</span>
                      </div>
                      <div className="text-center">
                        <span className="text-emerald-400 font-bold">{proj.serviceCount}</span>
                        <span className="text-[oklch(0.5_0.01_250)] ml-1">Services</span>
                      </div>
                      <div className="text-center">
                        <span className="text-purple-400 font-bold">{proj.dtoCount}</span>
                        <span className="text-[oklch(0.5_0.01_250)] ml-1">DTOs</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Redundancies ───────────────────────────────────────────────── */}
      {redundancyMatches.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-[oklch(0.16_0.01_250)] p-4">
          <SectionHeader
            id="redundancy"
            icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
            title="Redondances détectées"
            count={redundancyMatches.length}
          />
          <AnimatePresence>
            {expandedSections.has("redundancy") && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 mt-2">
                  {redundancyMatches.map(match => (
                    <div
                      key={match.id}
                      className="p-3 rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.2_0.01_250)]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={getConfidenceBadge(match.confidence)}>
                          {match.confidence === "HIGH" ? "Confiance élevée" :
                           match.confidence === "MEDIUM" ? "Confiance moyenne" : "Confiance faible"}
                        </Badge>
                        <span className="text-xs text-[oklch(0.5_0.01_250)]">
                          Score: {match.similarityScore}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 text-center p-2 rounded bg-[oklch(0.14_0.01_250)]">
                          <p className="text-xs text-blue-400 font-medium">{match.projectA.projectName}</p>
                          <p className="text-xs font-mono text-white">{match.projectA.className}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <div className="flex-1 text-center p-2 rounded bg-[oklch(0.14_0.01_250)]">
                          <p className="text-xs text-emerald-400 font-medium">{match.projectB.projectName}</p>
                          <p className="text-xs font-mono text-white">{match.projectB.className}</p>
                        </div>
                      </div>

                      {match.sharedMethods && match.sharedMethods.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          <span className="text-[10px] text-[oklch(0.5_0.01_250)]">Méthodes communes:</span>
                          {match.sharedMethods.map(m => (
                            <Badge
                              key={m}
                              className="bg-[oklch(0.18_0.01_250)] text-[oklch(0.7_0.01_250)] border-[oklch(0.22_0.01_250)] text-[10px]"
                            >
                              {m}()
                            </Badge>
                          ))}
                        </div>
                      )}

                      <p className="text-[10px] text-[oklch(0.5_0.01_250)]">{match.explanation}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── Cross-Module Links ─────────────────────────────────────────── */}
      {(resolvedLinks.length > 0 || unresolvedLinks.length > 0) && (
        <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.16_0.01_250)] p-4">
          <SectionHeader
            id="crossmodule"
            icon={<Network className="w-4 h-4 text-emerald-400" />}
            title="Interconnexions cross-module"
            count={resolvedLinks.length + unresolvedLinks.length}
          />
          <AnimatePresence>
            {expandedSections.has("crossmodule") && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {/* Resolution rate bar */}
                <div className="mt-2 mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[oklch(0.6_0.01_250)]">Taux de résolution</span>
                    <span className={
                      insight.crossModuleResolution.resolutionRate >= 80
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }>
                      {insight.crossModuleResolution.resolutionRate}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[oklch(0.2_0.01_250)]">
                    <div
                      className={`h-full rounded-full ${
                        insight.crossModuleResolution.resolutionRate >= 80
                          ? "bg-emerald-500"
                          : "bg-amber-500"
                      }`}
                      style={{ width: `${insight.crossModuleResolution.resolutionRate}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {resolvedLinks.map((link, i) => (
                    <div
                      key={`r-${i}`}
                      className="flex items-center gap-1.5 text-xs p-2 rounded bg-[oklch(0.12_0.01_250)]"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span className="text-blue-400 font-mono">{getProjectName(link.sourceSessionId)}</span>
                      <span className="text-[oklch(0.4_0.01_250)]">/</span>
                      <span className="text-white font-mono truncate">{link.sourceClass}</span>
                      <ArrowRight className="w-3 h-3 text-[oklch(0.4_0.01_250)] flex-shrink-0" />
                      <span className="text-emerald-400 font-mono">{getProjectName(link.targetSessionId)}</span>
                      <span className="text-[oklch(0.4_0.01_250)]">/</span>
                      <span className="text-white font-mono truncate">{link.targetClass}</span>
                    </div>
                  ))}
                  {unresolvedLinks.map((link, i) => (
                    <div
                      key={`u-${i}`}
                      className="flex items-center gap-1.5 text-xs p-2 rounded bg-[oklch(0.12_0.01_250)]"
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      <span className="text-blue-400 font-mono">{getProjectName(link.sourceSessionId)}</span>
                      <span className="text-[oklch(0.4_0.01_250)]">/</span>
                      <span className="text-white font-mono truncate">{link.sourceClass}</span>
                      <ArrowRight className="w-3 h-3 text-[oklch(0.4_0.01_250)] flex-shrink-0" />
                      <span className="text-amber-400 font-mono truncate">{link.targetModuleName || link.jndiPath}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── Strongly Coupled Pairs ─────────────────────────────────────── */}
      {stronglyCoupled.length > 0 && (
        <div className="rounded-lg border border-orange-500/20 bg-[oklch(0.16_0.01_250)] p-4">
          <SectionHeader
            id="coupling"
            icon={<Layers className="w-4 h-4 text-orange-400" />}
            title="Projets fortement couplés"
            count={stronglyCoupled.length}
          />
          <AnimatePresence>
            {expandedSections.has("coupling") && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 mt-2">
                  {stronglyCoupled.map((pair, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2.5 rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.2_0.01_250)]"
                    >
                      <span className="text-xs text-blue-400 font-mono">{pair.projectA}</span>
                      <ArrowRight className="w-3 h-3 text-orange-400" />
                      <span className="text-xs text-emerald-400 font-mono">{pair.projectB}</span>
                      <Badge className="ml-auto bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
                        {pair.linkCount} liens
                      </Badge>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── Mutualization Recommendations ──────────────────────────────── */}
      {recommendations.length > 0 && (
        <div className="rounded-lg border border-purple-500/20 bg-[oklch(0.16_0.01_250)] p-4">
          <SectionHeader
            id="recommendations"
            icon={<TrendingUp className="w-4 h-4 text-purple-400" />}
            title="Recommandations de mutualisation"
            count={recommendations.length}
          />
          <AnimatePresence>
            {expandedSections.has("recommendations") && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 mt-2">
                  {recommendations.map(rec => (
                    <div
                      key={rec.id}
                      className="p-3 rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.2_0.01_250)]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(rec.type)}
                          <span className="text-sm font-medium">{rec.title}</span>
                        </div>
                        <Badge className={getPriorityBadge(rec.priority)}>
                          {rec.priority}
                        </Badge>
                      </div>

                      <p className="text-xs text-[oklch(0.6_0.01_250)] mb-2">{rec.description}</p>

                      <div className="flex flex-wrap gap-1 mb-2">
                        <span className="text-[10px] text-[oklch(0.5_0.01_250)]">Projets:</span>
                        {rec.affectedProjects.map(p => (
                          <Badge
                            key={p.sessionId}
                            className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]"
                          >
                            {p.projectName}
                          </Badge>
                        ))}
                      </div>

                      {/* Action items */}
                      <div className="space-y-1">
                        {rec.actionItems.map((item, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-[oklch(0.55_0.01_250)]">
                            <span className="text-emerald-400 font-bold mt-0.5">{i + 1}.</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2 pt-2 border-t border-[oklch(0.2_0.01_250)] flex items-center justify-between">
                        <span className="text-[10px] text-[oklch(0.45_0.01_250)]">
                          Réduction effort: {rec.effortReductionPercent}% · ~{rec.estimatedLinesSaved} lignes économisées
                        </span>
                        <Badge className={`text-[10px] ${rec.riskLevel === 'LOW' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : rec.riskLevel === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          Risque {rec.riskLevel}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <div className="text-center text-[10px] text-[oklch(0.4_0.01_250)] py-2">
        Dernière analyse: {new Date(insight.lastAnalyzedAt).toLocaleString("fr-FR")}
        {" · "}
        {insight.redundancy?.totalUseCasesScanned || 0} UseCases et {insight.redundancy?.totalServicesScanned || 0} Services analysés
      </div>
    </div>
  );
}
