/**
 * ReportViewer — Visualiseur de rapports enrichis par IA (v7.4).
 *
 * Affiche les 5 rapports enrichis dans un layout à onglets avec rendu Markdown.
 * Supporte le mode "avant/après" pour comparer les rapports originaux et enrichis.
 *
 * @author Hamza NORDINE
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Streamdown } from "streamdown";
import {
  FileText, BarChart3, Database, Layers, BookOpen,
  Download, Loader2, AlertTriangle, CheckCircle2,
  Clock, Sparkles, Eye, EyeOff, Maximize2, Minimize2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnhancedReportsData {
  enhanced: boolean;
  reports: Record<string, string | null>;
  metadata: {
    model: string;
    language: string;
    generatedAt: string;
    durationMs: number;
    reportCount: number;
    errors: string[];
  } | null;
}

interface ReportTab {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
}

interface ReportViewerProps {
  sessionId: string;
  /** Optional original reports for before/after comparison */
  originalReports?: Record<string, string>;
  /** Compact mode for embedding in other panels */
  compact?: boolean;
}

// ─── Report tab definitions ─────────────────────────────────────────────────

const REPORT_TABS: ReportTab[] = [
  {
    id: "EXECUTIVE_SUMMARY",
    label: "Executive Summary",
    icon: BookOpen,
    color: "text-amber-400",
    description: "Synthèse exécutive pour le COMEX et les décideurs",
  },
  {
    id: "MIGRATION_REPORT",
    label: "Migration",
    icon: FileText,
    color: "text-emerald-400",
    description: "Rapport de migration détaillé avec risques et recommandations",
  },
  {
    id: "MICROSERVICES_REPORT",
    label: "Microservices",
    icon: Layers,
    color: "text-pink-400",
    description: "Architecture microservices proposée et plan de découpage",
  },
  {
    id: "DATASOURCE_MIGRATION",
    label: "DataSource",
    icon: Database,
    color: "text-cyan-400",
    description: "Stratégie de migration des sources de données",
  },
  {
    id: "QUALITY_SCORE",
    label: "Qualité",
    icon: BarChart3,
    color: "text-purple-400",
    description: "Score de qualité et conformité du code généré",
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ReportViewer({ sessionId, originalReports, compact = false }: ReportViewerProps) {
  const [data, setData] = useState<EnhancedReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("EXECUTIVE_SUMMARY");
  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Fetch enhanced reports
  useEffect(() => {
    if (!sessionId) return;

    const fetchReports = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/agent/${sessionId}/reports`);
        if (!res.ok) throw new Error("Impossible de charger les rapports");
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [sessionId]);

  // Available reports
  const availableTabs = useMemo(() => {
    if (!data?.reports) return [];
    return REPORT_TABS.filter(tab => data.reports[tab.id] !== null && data.reports[tab.id] !== undefined);
  }, [data]);

  // Download single report as .md
  const handleDownload = useCallback((reportId: string) => {
    if (!data?.reports[reportId]) return;
    const blob = new Blob([data.reports[reportId]!], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  // Download all reports as individual files
  const handleDownloadAll = useCallback(() => {
    if (!data?.reports) return;
    for (const [key, content] of Object.entries(data.reports)) {
      if (content) {
        const blob = new Blob([content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${key}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  }, [data]);

  // ─── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Chargement des rapports enrichis...</span>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-red-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  // ─── No enhanced reports ────────────────────────────────────────────────

  if (!data?.enhanced || availableTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <FileText className="w-8 h-8 opacity-50" />
        <p className="text-sm">Aucun rapport enrichi disponible pour cette session.</p>
        <p className="text-xs opacity-60">Activez l'option "Rapports IA enrichis" lors du lancement de l'agent.</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  const containerHeight = compact ? "h-[400px]" : expanded ? "h-[calc(100vh-200px)]" : "h-[600px]";

  return (
    <div className={`border border-border/50 rounded-lg bg-card/30 overflow-hidden ${expanded ? "fixed inset-4 z-50 bg-background" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/50">
        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold">Rapports enrichis par IA</span>
          <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">
            {availableTabs.length}/5 rapports
          </Badge>
          {data.metadata && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-xs gap-1">
                  <Clock className="w-3 h-3" />
                  {Math.round((data.metadata.durationMs || 0) / 1000)}s
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <p>Modèle : {data.metadata.model}</p>
                  <p>Langue : {data.metadata.language}</p>
                  <p>Généré le : {data.metadata.generatedAt}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-2">
          {originalReports && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOriginal(!showOriginal)}
              className="gap-1.5 text-xs"
            >
              {showOriginal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showOriginal ? "Enrichi" : "Original"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadAll}
            className="gap-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Tout télécharger
          </Button>
          {!compact && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="px-4 pt-2 border-b border-border/20">
          <TabsList className="bg-transparent gap-1 h-auto flex-wrap">
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="gap-1.5 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-1.5"
                >
                  <Icon className={`w-3.5 h-3.5 ${tab.color}`} />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Tab content */}
        {availableTabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="flex-1 m-0">
            <div className="flex items-center justify-between px-4 py-2 bg-card/20 border-b border-border/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-muted-foreground">{tab.description}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(tab.id)}
                className="gap-1.5 text-xs h-7"
              >
                <Download className="w-3 h-3" />
                .md
              </Button>
            </div>
            <ScrollArea className={containerHeight}>
              <div className="p-6 prose prose-invert prose-sm max-w-none">
                {showOriginal && originalReports?.[tab.id] ? (
                  <Streamdown>{originalReports[tab.id]}</Streamdown>
                ) : (
                  <Streamdown>{data.reports[tab.id] || ""}</Streamdown>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>

      {/* Metadata errors */}
      {data.metadata?.errors && data.metadata.errors.length > 0 && (
        <div className="px-4 py-2 border-t border-border/30 bg-yellow-500/5">
          <div className="flex items-center gap-2 text-xs text-yellow-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{data.metadata.errors.length} rapport(s) non enrichi(s) — rapports originaux conservés</span>
          </div>
        </div>
      )}
    </div>
  );
}
