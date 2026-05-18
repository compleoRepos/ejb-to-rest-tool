/**
 * PostMigrationChecklistScreen -- Ecran de checklist post-migration.
 *
 * Affiche la checklist personnalisee generee apres la migration,
 * avec filtrage par categorie, priorite, et export Markdown.
 *
 * @version v10.8
 * @author Compleo
 */

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2, AlertTriangle, Clock, FileText, Download,
  ChevronDown, ChevronRight, Shield, Server, Database,
  Terminal, Zap, Globe, BarChart3, BookOpen, Box,
  Filter, XCircle,
} from "lucide-react";

// --- Types (mirroring server-side types) ---

type ChecklistCategory =
  | "compilation"
  | "configuration"
  | "security"
  | "testing"
  | "integration"
  | "business_logic"
  | "performance"
  | "deployment"
  | "monitoring"
  | "documentation"
  | "frontend"
  | "data_migration";

type ChecklistPriority = "critical" | "high" | "medium" | "low";

interface ChecklistItem {
  id: string;
  category: ChecklistCategory;
  priority: ChecklistPriority;
  title: string;
  what: string;
  why: string;
  how: string;
  relatedFiles: string[];
  estimatedEffort: string;
  autoVerified: boolean;
  tags: string[];
}

interface PostMigrationChecklistResult {
  items: ChecklistItem[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    autoVerified: number;
    estimatedTotalDays: number;
  };
  markdownContent: string;
}

interface Props {
  checklist: PostMigrationChecklistResult;
  projectName: string;
}

// --- Category metadata ---

const CATEGORY_META: Record<ChecklistCategory, { label: string; icon: any; color: string }> = {
  compilation: { label: "Compilation", icon: Terminal, color: "text-purple-400" },
  configuration: { label: "Configuration", icon: Server, color: "text-blue-400" },
  security: { label: "Securite", icon: Shield, color: "text-red-400" },
  testing: { label: "Tests", icon: CheckCircle2, color: "text-green-400" },
  integration: { label: "Integration", icon: Database, color: "text-cyan-400" },
  business_logic: { label: "Logique Metier", icon: Zap, color: "text-yellow-400" },
  performance: { label: "Performance", icon: BarChart3, color: "text-orange-400" },
  deployment: { label: "Deploiement", icon: Box, color: "text-indigo-400" },
  monitoring: { label: "Monitoring", icon: BarChart3, color: "text-teal-400" },
  documentation: { label: "Documentation", icon: BookOpen, color: "text-slate-400" },
  frontend: { label: "Frontend", icon: Globe, color: "text-blue-400" },
  data_migration: { label: "Migration Donnees", icon: Database, color: "text-amber-400" },
};

const PRIORITY_META: Record<ChecklistPriority, { label: string; color: string; bgColor: string }> = {
  critical: { label: "Critique", color: "text-red-400", bgColor: "bg-red-500/20 border-red-500/30" },
  high: { label: "Haute", color: "text-orange-400", bgColor: "bg-orange-500/20 border-orange-500/30" },
  medium: { label: "Moyenne", color: "text-yellow-400", bgColor: "bg-yellow-500/20 border-yellow-500/30" },
  low: { label: "Basse", color: "text-green-400", bgColor: "bg-green-500/20 border-green-500/30" },
};

// --- Component ---

export default function PostMigrationChecklistScreen({ checklist, projectName }: Props) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<ChecklistCategory | "all">("all");
  const [filterPriority, setFilterPriority] = useState<ChecklistPriority | "all">("all");

  // Filtered items
  const filteredItems = useMemo(() => {
    return checklist.items.filter(item => {
      if (filterCategory !== "all" && item.category !== filterCategory) return false;
      if (filterPriority !== "all" && item.priority !== filterPriority) return false;
      return true;
    });
  }, [checklist.items, filterCategory, filterPriority]);

  // Group by category
  const groupedItems = useMemo(() => {
    const groups: Record<string, ChecklistItem[]> = {};
    for (const item of filteredItems) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [filteredItems]);

  // Categories present in filtered items
  const activeCategories = useMemo(() => {
    const cats = new Set<ChecklistCategory>();
    for (const item of checklist.items) cats.add(item.category);
    return Array.from(cats);
  }, [checklist.items]);

  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([checklist.markdownContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `POST_MIGRATION_CHECKLIST_${projectName}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { summary } = checklist;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-border/50 rounded-lg p-6 bg-card/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            Checklist Post-Migration
          </h3>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadMarkdown}>
            <Download className="w-4 h-4" />
            Exporter .md
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <SummaryCard label="Total" value={summary.total} color="text-foreground" />
          <SummaryCard label="Critiques" value={summary.critical} color="text-red-400" />
          <SummaryCard label="Hautes" value={summary.high} color="text-orange-400" />
          <SummaryCard label="Moyennes" value={summary.medium} color="text-yellow-400" />
          <SummaryCard label="Basses" value={summary.low} color="text-green-400" />
          <SummaryCard label="Auto-verifies" value={summary.autoVerified} color="text-cyan-400" />
          <SummaryCard label="Effort (j)" value={summary.estimatedTotalDays} color="text-purple-400" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground mr-2">Filtres :</span>

        {/* Category filter */}
        <Button
          variant={filterCategory === "all" ? "default" : "outline"}
          size="sm"
          className="text-xs h-7"
          onClick={() => setFilterCategory("all")}
        >
          Toutes
        </Button>
        {activeCategories.map(cat => {
          const meta = CATEGORY_META[cat];
          return (
            <Button
              key={cat}
              variant={filterCategory === cat ? "default" : "outline"}
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={() => setFilterCategory(cat)}
            >
              <meta.icon className={`w-3 h-3 ${meta.color}`} />
              {meta.label}
            </Button>
          );
        })}

        <span className="text-border mx-2">|</span>

        {/* Priority filter */}
        {(["critical", "high", "medium", "low"] as ChecklistPriority[]).map(p => (
          <Button
            key={p}
            variant={filterPriority === p ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setFilterPriority(filterPriority === p ? "all" : p)}
          >
            {PRIORITY_META[p].label}
          </Button>
        ))}
      </div>

      {/* Items grouped by category */}
      <ScrollArea className="max-h-[600px]">
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([category, items]) => {
            const meta = CATEGORY_META[category as ChecklistCategory];
            return (
              <div key={category} className="border border-border/50 rounded-lg bg-card/30 overflow-hidden">
                {/* Category header */}
                <div className="flex items-center gap-2 px-4 py-3 bg-card/50 border-b border-border/30">
                  <meta.icon className={`w-4 h-4 ${meta.color}`} />
                  <span className="font-medium text-sm">{meta.label}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    {items.length} {items.length > 1 ? "taches" : "tache"}
                  </Badge>
                </div>

                {/* Items */}
                <div className="divide-y divide-border/20">
                  {items.map(item => {
                    const isExpanded = expandedItems.has(item.id);
                    const priorityMeta = PRIORITY_META[item.priority];

                    return (
                      <div key={item.id} className="px-4 py-3">
                        {/* Item header */}
                        <button
                          className="flex items-start gap-3 w-full text-left group"
                          onClick={() => toggleItem(item.id)}
                        >
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 mt-0.5 text-muted-foreground" />
                            : <ChevronRight className="w-4 h-4 mt-0.5 text-muted-foreground" />
                          }
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium group-hover:text-foreground transition-colors">
                                {item.title}
                              </span>
                              <Badge className={`text-[10px] ${priorityMeta.bgColor} ${priorityMeta.color} border`}>
                                {priorityMeta.label}
                              </Badge>
                              {item.autoVerified && (
                                <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border">
                                  Auto-verifie
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {item.estimatedEffort}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.what}</p>
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="ml-7 mt-3 space-y-3 text-sm">
                            {/* QUOI */}
                            <div>
                              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Quoi</span>
                              <p className="text-muted-foreground mt-1">{item.what}</p>
                            </div>
                            {/* POURQUOI */}
                            <div>
                              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Pourquoi</span>
                              <p className="text-muted-foreground mt-1">{item.why}</p>
                            </div>
                            {/* COMMENT */}
                            <div>
                              <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Comment</span>
                              <p className="text-muted-foreground mt-1 whitespace-pre-line">{item.how}</p>
                            </div>
                            {/* Fichiers concernes */}
                            {item.relatedFiles.length > 0 && (
                              <div>
                                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Fichiers concernes</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.relatedFiles.map((f, i) => (
                                    <code key={i} className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded font-mono">
                                      {f}
                                    </code>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Tags */}
                            {item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {item.tags.map((tag, i) => (
                                  <Badge key={i} variant="outline" className="text-[9px]">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <XCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune tache ne correspond aux filtres selectionnes.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// --- Sub-components ---

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border border-border/30 rounded-lg p-3 bg-card/20 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
