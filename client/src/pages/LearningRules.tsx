/**
 * Page de gestion des règles d'apprentissage Compleo.
 *
 * Affiche les règles globales et client, permet de :
 *   - Filtrer par type, tenant, confiance
 *   - Confirmer / Désactiver / Supprimer une règle
 *   - Ajouter manuellement une règle
 *   - Exporter / Importer des règles en JSON
 *   - Voir les statistiques d'apprentissage
 *
 * Design: "Terminal Craft" — cohérent avec le reste de l'IHM Compleo.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Brain, Globe, User, Plus, Download, Upload, Trash2,
  CheckCircle2, XCircle, ArrowLeft, BarChart3, Shield,
  Zap, TrendingUp, RefreshCw, Search, Filter,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LearningRule {
  id: number;
  tenantId: string;
  ruleType: string;
  patterns: {
    className: string | null;
    methodName: string | null;
    package: string | null;
    javadoc: string | null;
    annotations: string | null;
    returnType: string | null;
    paramTypes: string | null;
  };
  chosenOption: string;
  chosenReason: string | null;
  confidence: number;
  occurrenceCount: number;
  isActive: boolean;
  sourceProject: string | null;
  confirmedByUser: boolean;
  lastSeenAt: string;
  createdAt: string;
}

interface RuleStats {
  totalRules: number;
  activeRules: number;
  globalRules: number;
  clientRules: number;
  avgConfidence: number;
  highConfidenceRules: number;
  autoResolvableRules: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const RULE_TYPE_LABELS: Record<string, string> = {
  HTTP_VERB_AMBIGUOUS: "Verbe HTTP",
  SCOPE_UNCLEAR: "Scope / Microservice",
  NAMING_CONVENTION: "Convention de nommage",
  DEPENDENCY_REPLACEMENT: "Remplacement dépendance",
  TRANSACTION_BOUNDARY: "Transaction",
  SECURITY_PATTERN: "Sécurité",
};

const RULE_TYPE_COLORS: Record<string, string> = {
  HTTP_VERB_AMBIGUOUS: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  SCOPE_UNCLEAR: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  NAMING_CONVENTION: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  DEPENDENCY_REPLACEMENT: "bg-green-500/20 text-green-400 border-green-500/30",
  TRANSACTION_BOUNDARY: "bg-red-500/20 text-red-400 border-red-500/30",
  SECURITY_PATTERN: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.85) return "text-emerald-400";
  if (confidence >= 0.70) return "text-blue-400";
  if (confidence >= 0.50) return "text-amber-400";
  return "text-red-400";
}

function getConfidenceBarColor(confidence: number): string {
  if (confidence >= 0.85) return "bg-emerald-500";
  if (confidence >= 0.70) return "bg-blue-500";
  if (confidence >= 0.50) return "bg-amber-500";
  return "bg-red-500";
}

function formatPatterns(patterns: LearningRule["patterns"]): string {
  const parts: string[] = [];
  if (patterns.className) parts.push(`classe ${patterns.className}`);
  if (patterns.methodName) parts.push(`méthode ${patterns.methodName}`);
  if (patterns.package) parts.push(`package ${patterns.package}`);
  if (patterns.annotations) parts.push(`annotations ${patterns.annotations}`);
  if (patterns.returnType) parts.push(`retour ${patterns.returnType}`);
  if (patterns.paramTypes) parts.push(`params ${patterns.paramTypes}`);
  if (patterns.javadoc) parts.push(`javadoc "${patterns.javadoc}"`);
  return parts.join(" + ") || "Aucun pattern";
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function LearningRulesPage() {
  const [rules, setRules] = useState<LearningRule[]>([]);
  const [stats, setStats] = useState<RuleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTenant, setFilterTenant] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────────────

  const fetchRules = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (filterTenant !== "all") params.set("tenant", filterTenant);

      const res = await fetch(`/api/learning/rules?${params}`);
      const data = await res.json();
      if (data.success) setRules(data.rules);
    } catch (error) {
      toast.error("Erreur lors du chargement des règles");
    }
  }, [filterType, filterTenant]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/learning/stats");
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRules(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchRules, fetchStats]);

  // ─── Actions ────────────────────────────────────────────────────────

  const confirmRule = async (id: number) => {
    try {
      const res = await fetch(`/api/learning/rules/${id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchRules();
        fetchStats();
      }
    } catch {
      toast.error("Erreur lors de la confirmation");
    }
  };

  const deactivateRule = async (id: number) => {
    try {
      const res = await fetch(`/api/learning/rules/${id}/deactivate`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("Règle désactivée");
        fetchRules();
        fetchStats();
      }
    } catch {
      toast.error("Erreur lors de la désactivation");
    }
  };

  const deleteRule = async (id: number) => {
    try {
      const res = await fetch(`/api/learning/rules/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Règle supprimée");
        fetchRules();
        fetchStats();
      }
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const exportRules = async () => {
    try {
      const tenant = filterTenant !== "all" ? filterTenant : "global";
      const res = await fetch(`/api/learning/rules/export?tenant=${tenant}`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compleo-rules-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${data.rules?.length || 0} règles exportées`);
    } catch {
      toast.error("Erreur lors de l'export");
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch("/api/learning/rules/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, strategy: "merge" }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(result.message);
        fetchRules();
        fetchStats();
        setImportDialogOpen(false);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Fichier JSON invalide");
    }
  };

  // ─── Filtered Rules ─────────────────────────────────────────────────

  const filteredRules = rules.filter(r => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        r.chosenOption.toLowerCase().includes(q) ||
        formatPatterns(r.patterns).toLowerCase().includes(q) ||
        (r.chosenReason || "").toLowerCase().includes(q) ||
        (r.sourceProject || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    return true;
  });

  const globalRules = filteredRules.filter(r => r.tenantId === "global");
  const clientRules = filteredRules.filter(r => r.tenantId !== "global");

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[oklch(0.13_0.01_250)] text-[oklch(0.92_0.01_250)] overflow-auto">
      {/* Header */}
      <div className="border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/compleo">
                <Button variant="ghost" size="sm" className="text-[oklch(0.6_0.01_250)] hover:text-white">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Compleo
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <Brain className="w-6 h-6 text-violet-400" />
                <div>
                  <h1 className="text-lg font-bold tracking-tight">Règles Apprises par Compleo</h1>
                  <p className="text-xs text-[oklch(0.55_0.01_250)]">
                    Moteur d'apprentissage automatique des choix de modernisation
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportRules} data-test="export-rules"
                className="border-[oklch(0.3_0.01_250)] bg-transparent text-[oklch(0.7_0.01_250)] hover:bg-[oklch(0.2_0.01_250)]"
              >
                <Download className="w-4 h-4 mr-2" />
                Exporter
              </Button>

              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[oklch(0.3_0.01_250)] bg-transparent text-[oklch(0.7_0.01_250)] hover:bg-[oklch(0.2_0.01_250)]"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Importer
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[oklch(0.18_0.01_250)] border-[oklch(0.25_0.01_250)] text-white">
                  <DialogHeader>
                    <DialogTitle>Importer des règles</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-[oklch(0.6_0.01_250)]">
                      Sélectionnez un fichier JSON exporté depuis Compleo.
                      Les règles existantes seront fusionnées (la confiance la plus élevée est conservée).
                    </p>
                    <Input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImport(file);
                      }}
                      className="bg-[oklch(0.15_0.01_250)] border-[oklch(0.3_0.01_250)]"
                    />
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter manuellement
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[oklch(0.18_0.01_250)] border-[oklch(0.25_0.01_250)] text-white max-w-lg">
                  <AddRuleDialog
                    onClose={() => setAddDialogOpen(false)}
                    onAdded={() => {
                      fetchRules();
                      fetchStats();
                      setAddDialogOpen(false);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Total" value={stats.totalRules} />
            <StatCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} label="Actives" value={stats.activeRules} />
            <StatCard icon={<Globe className="w-4 h-4 text-blue-400" />} label="Globales" value={stats.globalRules} />
            <StatCard icon={<User className="w-4 h-4 text-violet-400" />} label="Client" value={stats.clientRules} />
            <StatCard icon={<TrendingUp className="w-4 h-4 text-amber-400" />} label="Confiance moy." value={`${Math.round(stats.avgConfidence * 100)}%`} />
            <StatCard icon={<Shield className="w-4 h-4 text-cyan-400" />} label="Haute conf." value={stats.highConfidenceRules} />
            <StatCard icon={<Zap className="w-4 h-4 text-emerald-400" />} label="Auto-résolvables" value={stats.autoResolvableRules} />
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[oklch(0.5_0.01_250)]" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[200px] bg-[oklch(0.15_0.01_250)] border-[oklch(0.3_0.01_250)]">
                <SelectValue placeholder="Type de règle" />
              </SelectTrigger>
              <SelectContent className="bg-[oklch(0.18_0.01_250)] border-[oklch(0.3_0.01_250)]">
                <SelectItem value="all">Tous les types</SelectItem>
                {Object.entries(RULE_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select value={filterTenant} onValueChange={setFilterTenant}>
            <SelectTrigger className="w-[180px] bg-[oklch(0.15_0.01_250)] border-[oklch(0.3_0.01_250)]">
              <SelectValue placeholder="Tenant" />
            </SelectTrigger>
            <SelectContent className="bg-[oklch(0.18_0.01_250)] border-[oklch(0.3_0.01_250)]">
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="global">Globales</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[oklch(0.5_0.01_250)]" />
            <Input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-[oklch(0.15_0.01_250)] border-[oklch(0.3_0.01_250)]"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => { fetchRules(); fetchStats(); }}
            className="text-[oklch(0.6_0.01_250)]"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Rules Tabs */}
        <Tabs defaultValue="client" className="space-y-4">
          <TabsList className="bg-[oklch(0.18_0.01_250)] border border-[oklch(0.25_0.01_250)]">
            <TabsTrigger value="client" className="data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300">
              <User className="w-4 h-4 mr-2" />
              Vos règles ({clientRules.length})
            </TabsTrigger>
            <TabsTrigger value="global" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-300">
              <Globe className="w-4 h-4 mr-2" />
              Règles globales ({globalRules.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="client" className="space-y-3">
            {clientRules.length === 0 ? (
              <EmptyState
                message="Aucune règle client encore apprise"
                description="Les règles seront créées automatiquement lorsque vous résoudrez des ambiguïtés dans Compleo."
              />
            ) : (
              clientRules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onConfirm={confirmRule}
                  onDeactivate={deactivateRule}
                  onDelete={deleteRule}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="global" className="space-y-3">
            {globalRules.length === 0 ? (
              <EmptyState
                message="Aucune règle globale"
                description="Exécutez le script de seed pour charger les 50 règles globales."
              />
            ) : (
              globalRules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onConfirm={confirmRule}
                  onDeactivate={deactivateRule}
                  onDelete={deleteRule}
                  isGlobal
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card className="bg-[oklch(0.16_0.01_250)] border-[oklch(0.25_0.01_250)]">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-[oklch(0.55_0.01_250)]">{label}</span>
        </div>
        <p className="text-lg font-bold text-white">{value}</p>
      </CardContent>
    </Card>
  );
}

function RuleCard({
  rule,
  onConfirm,
  onDeactivate,
  onDelete,
  isGlobal = false,
}: {
  rule: LearningRule;
  onConfirm: (id: number) => void;
  onDeactivate: (id: number) => void;
  onDelete: (id: number) => void;
  isGlobal?: boolean;
}) {
  const confidencePercent = Math.round(rule.confidence * 100);
  const typeColor = RULE_TYPE_COLORS[rule.ruleType] || "bg-gray-500/20 text-gray-400 border-gray-500/30";

  return (
    <Card className={`bg-[oklch(0.16_0.01_250)] border-[oklch(0.25_0.01_250)] ${!rule.isActive ? "opacity-50" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            {/* Confidence bar */}
            <div className="flex items-center gap-3">
              <div className="w-32 h-2 bg-[oklch(0.2_0.01_250)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getConfidenceBarColor(rule.confidence)}`}
                  style={{ width: `${confidencePercent}%` }}
                />
              </div>
              <span className={`text-sm font-mono font-bold ${getConfidenceColor(rule.confidence)}`}>
                {confidencePercent}%
              </span>
              <span className="text-xs text-[oklch(0.5_0.01_250)]">
                vu {rule.occurrenceCount} fois
              </span>
              {rule.confidence < 0.5 && (
                <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]">
                  FAIBLE
                </Badge>
              )}
              {rule.confidence >= 0.85 && rule.occurrenceCount >= 3 && (
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px]">
                  AUTO-RESOLVE
                </Badge>
              )}
              {!rule.isActive && (
                <Badge variant="outline" className="text-red-400 border-red-500/30 text-[10px]">
                  INACTIVE
                </Badge>
              )}
            </div>

            {/* Pattern description */}
            <p className="text-sm font-mono text-[oklch(0.75_0.01_250)]">
              {formatPatterns(rule.patterns)}
            </p>

            {/* Chosen option */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[oklch(0.5_0.01_250)]">→</span>
              <Badge className="bg-violet-600/30 text-violet-300 border-violet-500/30 font-mono">
                {rule.chosenOption}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${typeColor}`}>
                {RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}
              </Badge>
            </div>

            {/* Reason */}
            {rule.chosenReason && (
              <p className="text-xs text-[oklch(0.5_0.01_250)] italic">
                {rule.chosenReason}
              </p>
            )}

            {/* Meta */}
            <div className="flex items-center gap-4 text-[10px] text-[oklch(0.45_0.01_250)]">
              {rule.sourceProject && (
                <span>Projet : {rule.sourceProject}</span>
              )}
              <span>Créée le {new Date(rule.createdAt).toLocaleDateString("fr-FR")}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {rule.confidence < 0.85 && rule.isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onConfirm(rule.id)}
                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                title="Confirmer (+15% confiance)"
              >
                <CheckCircle2 className="w-4 h-4" />
              </Button>
            )}
            {rule.isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeactivate(rule.id)}
                className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                title="Désactiver"
              >
                <XCircle className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(rule.id)}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message, description }: { message: string; description: string }) {
  return (
    <div className="text-center py-12 border border-dashed border-[oklch(0.25_0.01_250)] rounded-lg">
      <Brain className="w-10 h-10 mx-auto mb-3 text-[oklch(0.35_0.01_250)]" />
      <p className="text-sm text-[oklch(0.6_0.01_250)]">{message}</p>
      <p className="text-xs text-[oklch(0.45_0.01_250)] mt-1">{description}</p>
    </div>
  );
}

function AddRuleDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [ruleType, setRuleType] = useState("HTTP_VERB_AMBIGUOUS");
  const [chosenOption, setChosenOption] = useState("");
  const [chosenReason, setChosenReason] = useState("");
  const [patternClassName, setPatternClassName] = useState("");
  const [patternMethodName, setPatternMethodName] = useState("");
  const [patternPackage, setPatternPackage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!chosenOption) {
      toast.error("L'option choisie est requise");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/learning/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleType,
          chosenOption,
          chosenReason: chosenReason || undefined,
          patterns: {
            className: patternClassName || undefined,
            methodName: patternMethodName || undefined,
            package: patternPackage || undefined,
          },
          confidence: 0.6,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Règle créée");
        onAdded();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-white">Ajouter une règle manuellement</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label className="text-[oklch(0.7_0.01_250)]">Type de règle</Label>
          <Select value={ruleType} onValueChange={setRuleType}>
            <SelectTrigger className="bg-[oklch(0.15_0.01_250)] border-[oklch(0.3_0.01_250)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[oklch(0.18_0.01_250)] border-[oklch(0.3_0.01_250)]">
              {Object.entries(RULE_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-[oklch(0.7_0.01_250)]">Option choisie *</Label>
          <Input
            value={chosenOption}
            onChange={(e) => setChosenOption(e.target.value)}
            placeholder="ex: POST, MICROSERVICE, RENAME_SERVICE"
            className="bg-[oklch(0.15_0.01_250)] border-[oklch(0.3_0.01_250)]"
          />
        </div>

        <div>
          <Label className="text-[oklch(0.7_0.01_250)]">Raison</Label>
          <Textarea
            value={chosenReason}
            onChange={(e) => setChosenReason(e.target.value)}
            placeholder="Pourquoi ce choix ?"
            className="bg-[oklch(0.15_0.01_250)] border-[oklch(0.3_0.01_250)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[oklch(0.7_0.01_250)]">Pattern classe</Label>
            <Input
              value={patternClassName}
              onChange={(e) => setPatternClassName(e.target.value)}
              placeholder="ex: .*UC$"
              className="bg-[oklch(0.15_0.01_250)] border-[oklch(0.3_0.01_250)] font-mono text-sm"
            />
          </div>
          <div>
            <Label className="text-[oklch(0.7_0.01_250)]">Pattern méthode</Label>
            <Input
              value={patternMethodName}
              onChange={(e) => setPatternMethodName(e.target.value)}
              placeholder="ex: ^execute$"
              className="bg-[oklch(0.15_0.01_250)] border-[oklch(0.3_0.01_250)] font-mono text-sm"
            />
          </div>
        </div>

        <div>
          <Label className="text-[oklch(0.7_0.01_250)]">Pattern package</Label>
          <Input
            value={patternPackage}
            onChange={(e) => setPatternPackage(e.target.value)}
            placeholder="ex: .*usecases.*"
            className="bg-[oklch(0.15_0.01_250)] border-[oklch(0.3_0.01_250)] font-mono text-sm"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} className="text-[oklch(0.6_0.01_250)]">
          Annuler
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !chosenOption}
          className="bg-violet-600 hover:bg-violet-700 text-white"
        >
          {submitting ? "Création..." : "Créer la règle"}
        </Button>
      </DialogFooter>
    </>
  );
}
