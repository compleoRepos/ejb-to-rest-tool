/**
 * SchemaDecoderPage — Écran IHM 2bis : Schema Decoder
 * Positionné entre Analyse et Configuration dans le pipeline.
 * Affiche le dictionnaire des colonnes décodées avec filtrage par confiance.
 * Mode standalone : permet de s'arrêter après le décodage (export JSON/CSV/MD).
 * Skippable si pas de JDBC détecté.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Database, Download, FileText, ArrowRight, ArrowLeft,
  Search, Filter, CheckCircle2, AlertTriangle, HelpCircle,
  Table2, FileJson, FileSpreadsheet, Loader2, SkipForward,
} from "lucide-react";

type ConfidenceLevel = "high" | "medium" | "low";

interface DecodedColumn {
  db: string;
  inferred: string;
  confidence: ConfidenceLevel;
  sources: string[];
  javaType: string;
  sqlType: string;
}

interface DecodedTable {
  name: string;
  source: string;
  columns: DecodedColumn[];
}

interface SchemaDecoderResult {
  tables: DecodedTable[];
  stats: {
    totalColumns: number;
    decoded: number;
    unresolved: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
  executionTimeMs: number;
  json: string;
  markdown: string;
  csv: string;
}

export default function SchemaDecoderPage() {
  const params = useParams<{ sessionId: string }>();
  const [, navigate] = useLocation();
  const sessionId = params.sessionId;

  const [result, setResult] = useState<SchemaDecoderResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasJdbc, setHasJdbc] = useState<boolean | null>(null);
  const [filterConfidence, setFilterConfidence] = useState<string>("all");
  const [filterTable, setFilterTable] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const decodeMutation = trpc.schemaDecoder.decode.useMutation();

  // Load session data and check for JDBC
  useEffect(() => {
    const sessionData = sessionStorage.getItem(`compleo-session-${sessionId}`);
    if (sessionData) {
      try {
        const parsed = JSON.parse(sessionData);
        const techs: string[] = parsed.technologies || [];
        const jdbcDetected = techs.some(t => t.toUpperCase().includes("JDBC"));
        setHasJdbc(jdbcDetected);

        // Auto-decode if JDBC detected
        if (jdbcDetected && parsed.files && !result) {
          runDecode(parsed.files, parsed.projectId);
        }
      } catch (e) {
        setHasJdbc(false);
      }
    }
  }, [sessionId]);

  const runDecode = useCallback(async (files: { path: string; content: string }[], projectId: number) => {
    setLoading(true);
    try {
      const res = await decodeMutation.mutateAsync({ projectId, files });
      setResult(res as SchemaDecoderResult);
      toast.success(`${res.stats.decoded}/${res.stats.totalColumns} colonnes décodées en ${res.executionTimeMs}ms`);
    } catch (err: any) {
      toast.error("Erreur lors du décodage : " + (err.message || "Erreur inconnue"));
    } finally {
      setLoading(false);
    }
  }, [decodeMutation]);

  // Filtered columns
  const filteredTables = useMemo(() => {
    if (!result) return [];
    return result.tables
      .filter(t => filterTable === "all" || t.name === filterTable)
      .map(t => ({
        ...t,
        columns: t.columns.filter(c => {
          if (filterConfidence !== "all" && c.confidence !== filterConfidence) return false;
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return c.db.toLowerCase().includes(q) ||
                   c.inferred.toLowerCase().includes(q) ||
                   c.sources.some(s => s.toLowerCase().includes(q));
          }
          return true;
        }),
      }))
      .filter(t => t.columns.length > 0);
  }, [result, filterConfidence, filterTable, searchQuery]);

  // Export handlers
  const exportJson = () => {
    if (!result) return;
    downloadFile(result.json, "schema-dictionary.json", "application/json");
  };
  const exportCsv = () => {
    if (!result) return;
    downloadFile(result.csv, "schema-dictionary.csv", "text/csv");
  };
  const exportMd = () => {
    if (!result) return;
    downloadFile(result.markdown, "SCHEMA_DICTIONARY.md", "text/markdown");
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filename} téléchargé`);
  };

  // Skip to configure
  const skipToConfig = () => {
    navigate(`/compleo/agent/${sessionId}/configure`);
  };

  // Proceed to configure
  const proceedToConfig = () => {
    // Save decoder result in session
    if (result) {
      const sessionData = sessionStorage.getItem(`compleo-session-${sessionId}`);
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        parsed.schemaDecoderResult = result;
        sessionStorage.setItem(`compleo-session-${sessionId}`, JSON.stringify(parsed));
      }
    }
    navigate(`/compleo/agent/${sessionId}/configure`);
  };

  // ─── No JDBC detected → Skip screen ───────────────────────────────────────
  if (hasJdbc === false) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <Card className="bg-zinc-900/80 border-zinc-800 p-8 max-w-md text-center">
          <Database className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Schema Decoder</h2>
          <p className="text-zinc-400 mb-6">
            Aucun JDBC détecté dans ce projet. Le Schema Decoder est automatiquement ignoré.
          </p>
          <Button onClick={skipToConfig} className="bg-teal-600 hover:bg-teal-500">
            Continuer vers Configuration <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Card>
      </div>
    );
  }

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-teal-500 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Décodage en cours...</h2>
          <p className="text-zinc-400">Analyse sémantique des colonnes JDBC</p>
        </div>
      </div>
    );
  }

  // ─── Main result view ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-teal-500" />
            <div>
              <h1 className="text-lg font-semibold">Schema Decoder</h1>
              <p className="text-sm text-zinc-400">Étape 2bis — Décodage des colonnes cryptiques</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/compleo/agent/${sessionId}/analyze`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Retour Analyse
            </Button>
            {result && (
              <Button size="sm" onClick={proceedToConfig} className="bg-teal-600 hover:bg-teal-500">
                Continuer <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {!result && (
              <Button variant="ghost" size="sm" onClick={skipToConfig}>
                <SkipForward className="w-4 h-4 mr-1" /> Skip
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {result && (
        <div className="border-b border-zinc-800 bg-zinc-900/30 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4 text-zinc-400" />
              <span className="text-zinc-300">{result.tables.length} tables</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-300">{result.stats.totalColumns} colonnes</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-emerald-400">{result.stats.decoded} décodées ({Math.round(result.stats.decoded / Math.max(result.stats.totalColumns, 1) * 100)}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-emerald-600 text-emerald-400 text-xs">
                HIGH: {result.stats.highConfidence}
              </Badge>
              <Badge variant="outline" className="border-amber-600 text-amber-400 text-xs">
                MEDIUM: {result.stats.mediumConfidence}
              </Badge>
              <Badge variant="outline" className="border-red-600 text-red-400 text-xs">
                LOW: {result.stats.lowConfidence}
              </Badge>
            </div>
            <div className="ml-auto text-zinc-500">
              {result.executionTimeMs}ms
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {result && (
        <div className="border-b border-zinc-800 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Rechercher colonne..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-zinc-900 border-zinc-700 text-sm"
              />
            </div>
            <Select value={filterConfidence} onValueChange={setFilterConfidence}>
              <SelectTrigger className="w-40 bg-zinc-900 border-zinc-700 text-sm">
                <Filter className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Confiance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="high">🟢 High</SelectItem>
                <SelectItem value="medium">🟡 Medium</SelectItem>
                <SelectItem value="low">🔴 Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTable} onValueChange={setFilterTable}>
              <SelectTrigger className="w-48 bg-zinc-900 border-zinc-700 text-sm">
                <Table2 className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les tables</SelectItem>
                {result.tables.map(t => (
                  <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={exportJson}>
                    <FileJson className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export JSON</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={exportCsv}>
                    <FileSpreadsheet className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export CSV</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={exportMd}>
                    <FileText className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export Markdown</TooltipContent>
              </Tooltip>
              <Button variant="outline" size="sm" onClick={() => { exportJson(); exportCsv(); exportMd(); }}>
                <Download className="w-4 h-4 mr-1" /> Tout exporter
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {!result && hasJdbc === null && (
          <div className="text-center py-20 text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p>Chargement de la session...</p>
          </div>
        )}

        {result && filteredTables.length === 0 && (
          <div className="text-center py-20 text-zinc-500">
            <Search className="w-8 h-8 mx-auto mb-4" />
            <p>Aucun résultat pour les filtres sélectionnés</p>
          </div>
        )}

        {result && (
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-6">
              {filteredTables.map(table => (
                <div key={table.name} className="border border-zinc-800 rounded-lg overflow-hidden">
                  {/* Table header */}
                  <div className="bg-zinc-900/80 px-4 py-3 flex items-center justify-between border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <Table2 className="w-4 h-4 text-teal-500" />
                      <span className="font-mono font-semibold text-zinc-200">{table.name}</span>
                      <Badge variant="outline" className="text-xs text-zinc-400 border-zinc-700">
                        {table.columns.length} colonnes
                      </Badge>
                    </div>
                    <span className="text-xs text-zinc-500">{table.source}</span>
                  </div>

                  {/* Columns table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-900/50 text-zinc-400 text-xs uppercase">
                          <th className="px-4 py-2 text-left font-medium">Colonne DB</th>
                          <th className="px-4 py-2 text-left font-medium">Nom Inféré</th>
                          <th className="px-4 py-2 text-center font-medium">Confiance</th>
                          <th className="px-4 py-2 text-left font-medium">Type Java</th>
                          <th className="px-4 py-2 text-left font-medium">Type SQL</th>
                          <th className="px-4 py-2 text-left font-medium">Sources</th>
                          <th className="px-4 py-2 text-center font-medium">Validation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.columns.map((col, idx) => (
                          <tr key={`${table.name}-${col.db}-${idx}`} className="border-t border-zinc-800/50 hover:bg-zinc-900/30">
                            <td className="px-4 py-2 font-mono text-zinc-300">{col.db}</td>
                            <td className="px-4 py-2">
                              {col.inferred !== col.db ? (
                                <span className="font-semibold text-teal-400">{col.inferred}</span>
                              ) : (
                                <span className="text-zinc-500 italic">non décodé</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <ConfidenceBadge level={col.confidence} />
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-zinc-400">{col.javaType}</td>
                            <td className="px-4 py-2 font-mono text-xs text-zinc-400">{col.sqlType}</td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-1">
                                {col.sources.slice(0, 2).map((s, i) => (
                                  <span key={i} className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">{s}</span>
                                ))}
                                {col.sources.length > 2 && (
                                  <span className="text-xs text-zinc-500">+{col.sources.length - 2}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-center">
                              {col.confidence === "low" ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" />
                                  </TooltipTrigger>
                                  <TooltipContent>À valider manuellement</TooltipContent>
                                </Tooltip>
                              ) : col.confidence === "high" ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                              ) : (
                                <HelpCircle className="w-4 h-4 text-zinc-500 mx-auto" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Mode standalone footer */}
      {result && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="text-sm text-zinc-400">
              Mode standalone disponible — Exportez le dictionnaire sans poursuivre la migration
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => { exportJson(); exportCsv(); exportMd(); toast.success("Dictionnaire exporté (JSON + CSV + MD)"); }}>
                <Download className="w-4 h-4 mr-1" /> Stop & Export
              </Button>
              <Button size="sm" onClick={proceedToConfig} className="bg-teal-600 hover:bg-teal-500">
                Continuer la migration <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const config = {
    high: { label: "HIGH", className: "bg-emerald-500/10 text-emerald-400 border-emerald-600" },
    medium: { label: "MEDIUM", className: "bg-amber-500/10 text-amber-400 border-amber-600" },
    low: { label: "LOW", className: "bg-red-500/10 text-red-400 border-red-600" },
  };
  const c = config[level];
  return (
    <Badge variant="outline" className={`text-xs ${c.className}`}>
      {c.label}
    </Badge>
  );
}
