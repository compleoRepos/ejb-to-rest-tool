/**
 * WorkspaceAnalysis v13.0 — Panneau d'analyse de dépendances et plan de migration.
 * Affiche le DAG inter-projets, le plan de migration par tiers,
 * les frameworks externes détectés, et la preview des stubs partagés.
 *
 * @author Compleo
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network, Loader2, AlertTriangle, CheckCircle2,
  Layers, ArrowRight, Download, ChevronDown, ChevronUp,
  GitBranch, Package, Clock, FileCode2, Zap, FileText,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProjectNode {
  name: string;
  fileCount: number;
  classCount: number;
  internalDeps: string[];
  externalDeps: string[];
  complexity: "LOW" | "MEDIUM" | "HIGH";
}

interface DependencyEdge {
  from: string;
  to: string;
  type: "JNDI" | "IMPORT" | "SHARED_DTO";
  classes: string[];
}

interface MigrationTier {
  tier: number;
  projects: string[];
  reason: string;
  estimatedEffortDays: number;
}

interface ExternalFramework {
  rootPackage: string;
  usageCount: number;
  projects: string[];
}

interface StubInfo {
  moduleName: string;
  version: string;
  classCount: number;
  files: Record<string, string>;
}

interface AnalysisResult {
  graph: {
    projects: ProjectNode[];
    edges: DependencyEdge[];
    mermaidDiagram: string;
  };
  plan: {
    tiers: MigrationTier[];
    totalProjects: number;
    totalEstimatedEffortDays: number;
    externalFrameworks: ExternalFramework[];
    summary: string;
  };
  stubs: StubInfo;
  topFrameworks: ExternalFramework[];
}

interface Props {
  workspaceId: string;
  workspaceName: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorkspaceAnalysis({ workspaceId, workspaceName }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTier, setExpandedTier] = useState<number | null>(null);
  const [showStubs, setShowStubs] = useState(false);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }
      const data = await res.json();
      setResult(data);
      toast.success("Analyse terminée");
    } catch (err: any) {
      setError(err.message);
      toast.error(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // ─── Empty state ────────────────────────────────────────────────────────
  if (!result && !loading) {
    return (
      <div className="text-center py-8">
        <Network className="w-12 h-12 mx-auto mb-3 text-[oklch(0.5_0.01_250)]" />
        <h3 className="text-lg font-semibold text-[oklch(0.85_0.01_250)] mb-2">
          Analyse de Dépendances v13.0
        </h3>
        <p className="text-sm text-[oklch(0.55_0.01_250)] mb-4 max-w-md mx-auto">
          Analysez les dépendances inter-projets, planifiez la migration par tiers,
          et générez les stubs partagés pour une modernisation coordonnée.
        </p>
        {error && (
          <div className="flex items-center gap-2 justify-center text-red-400 mb-3">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        <Button
          onClick={runAnalysis}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
          Lancer l'analyse
        </Button>
      </div>
    );
  }

  // ─── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-blue-400" />
        <p className="text-sm text-[oklch(0.6_0.01_250)]">
          Analyse des dépendances en cours...
        </p>
      </div>
    );
  }

  if (!result) return null;

  // ─── Results ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header with re-run button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium text-[oklch(0.85_0.01_250)]">
            Analyse complète — {result.graph.projects.length} projets
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.open(`/api/workspace/${workspaceId}/report.html`, '_blank');
            }}
            className="text-emerald-400 border-emerald-600/40 hover:bg-emerald-600/10"
          >
            <FileText className="w-3.5 h-3.5 mr-1" /> Rapport HTML
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={runAnalysis}
            disabled={loading}
            className="text-[oklch(0.6_0.01_250)] border-[oklch(0.25_0.01_250)]"
          >
            <Zap className="w-3.5 h-3.5 mr-1" /> Relancer
          </Button>
        </div>
      </div>

      {/* ─── DAG Diagram ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.14_0.01_250)] p-4">
        <h4 className="text-sm font-semibold text-[oklch(0.8_0.01_250)] mb-3 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-400" />
          Graphe de Dépendances Inter-Projets
        </h4>
        <pre className="text-xs text-[oklch(0.65_0.01_250)] bg-[oklch(0.1_0.01_250)] rounded p-3 overflow-x-auto font-mono leading-relaxed">
          {result.graph.mermaidDiagram}
        </pre>
        <div className="mt-2 flex flex-wrap gap-2">
          {result.graph.edges.map((edge, i) => (
            <Badge key={i} variant="outline" className="text-xs border-[oklch(0.3_0.01_250)] text-[oklch(0.6_0.01_250)]">
              {edge.from} → {edge.to} ({edge.type}, {edge.classes.length} classes)
            </Badge>
          ))}
        </div>
      </div>

      {/* ─── Migration Plan ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.14_0.01_250)] p-4">
        <h4 className="text-sm font-semibold text-[oklch(0.8_0.01_250)] mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-400" />
          Plan de Migration par Tiers
        </h4>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center p-2 rounded bg-[oklch(0.12_0.01_250)]">
            <div className="text-lg font-bold text-blue-400">{result.plan.tiers.length}</div>
            <div className="text-xs text-[oklch(0.5_0.01_250)]">Tiers</div>
          </div>
          <div className="text-center p-2 rounded bg-[oklch(0.12_0.01_250)]">
            <div className="text-lg font-bold text-emerald-400">{result.plan.totalProjects}</div>
            <div className="text-xs text-[oklch(0.5_0.01_250)]">Projets</div>
          </div>
          <div className="text-center p-2 rounded bg-[oklch(0.12_0.01_250)]">
            <div className="text-lg font-bold text-amber-400">{result.plan.totalEstimatedEffortDays}j</div>
            <div className="text-xs text-[oklch(0.5_0.01_250)]">Effort total</div>
          </div>
        </div>

        {/* Tiers list */}
        <div className="space-y-2">
          {result.plan.tiers.map((tier) => (
            <motion.div
              key={tier.tier}
              className="rounded border border-[oklch(0.2_0.01_250)] bg-[oklch(0.12_0.01_250)] overflow-hidden"
              initial={false}
            >
              <button
                className="w-full flex items-center justify-between p-3 text-left hover:bg-[oklch(0.15_0.01_250)] transition-colors"
                onClick={() => setExpandedTier(expandedTier === tier.tier ? null : tier.tier)}
              >
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600/20 text-blue-300 border-blue-600/30 text-xs">
                    Tier {tier.tier}
                  </Badge>
                  <span className="text-sm text-[oklch(0.75_0.01_250)]">
                    {tier.projects.length} projet{tier.projects.length > 1 ? "s" : ""}
                  </span>
                  <span className="text-xs text-[oklch(0.5_0.01_250)] flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {tier.estimatedEffortDays}j
                  </span>
                </div>
                {expandedTier === tier.tier ? (
                  <ChevronUp className="w-4 h-4 text-[oklch(0.5_0.01_250)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[oklch(0.5_0.01_250)]" />
                )}
              </button>
              <AnimatePresence>
                {expandedTier === tier.tier && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-3 pb-3"
                  >
                    <p className="text-xs text-[oklch(0.55_0.01_250)] mb-2">{tier.reason}</p>
                    <div className="flex flex-wrap gap-1">
                      {tier.projects.map((p) => (
                        <Badge key={p} variant="outline" className="text-xs border-[oklch(0.25_0.01_250)] text-[oklch(0.65_0.01_250)]">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* Summary */}
        <p className="text-xs text-[oklch(0.5_0.01_250)] mt-3 italic">
          {result.plan.summary}
        </p>
      </div>

      {/* ─── External Frameworks ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.14_0.01_250)] p-4">
        <h4 className="text-sm font-semibold text-[oklch(0.8_0.01_250)] mb-3 flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-400" />
          Frameworks Externes Détectés
        </h4>
        <div className="space-y-2">
          {result.topFrameworks.map((fw, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded bg-[oklch(0.12_0.01_250)]">
              <div>
                <span className="text-sm font-mono text-[oklch(0.7_0.01_250)]">{fw.rootPackage}</span>
                <span className="text-xs text-[oklch(0.5_0.01_250)] ml-2">
                  ({fw.usageCount} usages dans {fw.projects.length} projets)
                </span>
              </div>
              <Badge variant="outline" className="text-xs border-amber-600/30 text-amber-300">
                {fw.projects.length} proj
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Shared Stubs Library ────────────────────────────────────────── */}
      <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.14_0.01_250)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-[oklch(0.8_0.01_250)] flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-emerald-400" />
            Bibliothèque de Stubs Partagés
          </h4>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-600/30 text-xs">
              {result.stubs.classCount} classes
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStubs(!showStubs)}
              className="text-[oklch(0.6_0.01_250)] border-[oklch(0.25_0.01_250)] text-xs"
            >
              {showStubs ? "Masquer" : "Voir"} les stubs
            </Button>
          </div>
        </div>

        <div className="text-xs text-[oklch(0.55_0.01_250)] mb-2">
          Module: <span className="font-mono text-[oklch(0.7_0.01_250)]">{result.stubs.moduleName}</span>
          {" "}— Version: <span className="font-mono text-[oklch(0.7_0.01_250)]">{result.stubs.version}</span>
        </div>

        <AnimatePresence>
          {showStubs && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
                {Object.entries(result.stubs.files).map(([path, content]) => (
                  <div key={path} className="rounded bg-[oklch(0.1_0.01_250)] p-2">
                    <div className="text-xs font-mono text-blue-300 mb-1">{path}</div>
                    <pre className="text-xs text-[oklch(0.6_0.01_250)] whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {content}
                    </pre>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
