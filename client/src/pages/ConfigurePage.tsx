/**
 * ConfigurePage — Configuration des options de génération.
 * Affiche les DynamicOptions avec toggles, AI insights, estimation temps.
 * POST /api/agent/:id/choices pour lancer la génération.
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { PipelineStepper } from "@/components/PipelineStepper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Loader2, Zap, ArrowRight, Clock, Sparkles, AlertTriangle,
  Shield, Layers, Globe, MessageSquare, Database, Monitor,
  BarChart3, Info
} from "lucide-react";

interface DynamicOption {
  id: string;
  label: string;
  description: string;
  category: string;
  defaultEnabled: boolean;
  confidence: "high" | "medium" | "low";
  icon: string;
  color: string;
  triggeredBy: string[];
  subOptions?: Array<{ id: string; label: string; description: string; defaultSelected: boolean }>;
  requires?: string[];
  aiJustification?: string;
}

interface ResolvedOptions {
  options: DynamicOption[];
  detectedDomain: { primary: string; confidence: string; indicators: string[]; label: string };
  detectionSummary: string;
  hasIHM: boolean;
  hasDistributedTransactions: boolean;
  hasBoundedContexts: boolean;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  architecture: { label: "Architecture", icon: Layers },
  frontend: { label: "Frontend", icon: Monitor },
  standard: { label: "Standards Métier", icon: Globe },
  messaging: { label: "Messaging", icon: MessageSquare },
  batch: { label: "Batch", icon: Database },
  quality: { label: "Qualité & Sécurité", icon: Shield },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-400 border-emerald-600",
  medium: "text-amber-400 border-amber-600",
  low: "text-zinc-400 border-zinc-600",
};

export default function ConfigurePage() {
  const params = useParams<{ sessionId: string }>();
  const [, navigate] = useLocation();
  const sessionId = params.sessionId;

  const [resolved, setResolved] = useState<ResolvedOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [enabledOptions, setEnabledOptions] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch dynamic options
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const res = await fetch(`/api/agent/${sessionId}/dynamic-options`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Erreur de chargement des options");
        }
        const data: ResolvedOptions = await res.json();
        setResolved(data);
        // Initialize enabled options from defaults
        const defaults = new Set<string>();
        for (const opt of data.options) {
          if (opt.defaultEnabled) defaults.add(opt.id);
        }
        setEnabledOptions(defaults);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  // Group options by category
  const groupedOptions = useMemo(() => {
    if (!resolved) return {};
    const groups: Record<string, DynamicOption[]> = {};
    for (const opt of resolved.options) {
      if (!groups[opt.category]) groups[opt.category] = [];
      groups[opt.category].push(opt);
    }
    return groups;
  }, [resolved]);

  // Estimated time (rough heuristic)
  const estimatedMinutes = useMemo(() => {
    let base = 2; // base time
    for (const optId of enabledOptions) {
      const opt = resolved?.options.find((o) => o.id === optId);
      if (!opt) continue;
      if (opt.category === "frontend") base += 3;
      else if (opt.category === "standard") base += 2;
      else if (opt.category === "quality") base += 2;
      else base += 1;
    }
    return base;
  }, [enabledOptions, resolved]);

  const toggleOption = (id: string) => {
    setEnabledOptions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Auto-enable dependencies
        const opt = resolved?.options.find((o) => o.id === id);
        if (opt?.requires) {
          for (const dep of opt.requires) next.add(dep);
        }
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      // 1. PATCH options to update the session config
      const optionsPayload: Record<string, any> = {
        autoResolveAmbiguities: true,
      };
      // Map enabled option IDs to config flags
      for (const optId of enabledOptions) {
        switch (optId) {
          case "enableMicroservices":
            optionsPayload.enableMicroservices = true;
            break;
          case "enableFrontend":
            optionsPayload.enableFrontend = true;
            break;
          case "enableSaga":
            optionsPayload.enableSaga = true;
            break;
          case "enableIndustryStandard":
            optionsPayload.enableIndustryStandard = true;
            break;
          case "enableSoc2Compliance":
            optionsPayload.enableSoc2Compliance = true;
            break;
          case "enableSoapToRest":
            optionsPayload.enableSoapToRest = true;
            break;
          case "enableReportEnhancer":
            optionsPayload.enableReportEnhancer = true;
            break;
          case "enableML":
            optionsPayload.enableML = true;
            break;
          default:
            // Generic: pass as-is
            optionsPayload[optId] = true;
            break;
        }
      }

      const patchRes = await fetch(`/api/agent/${sessionId}/options`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optionsPayload),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        throw new Error(err.error || "Erreur de mise à jour des options");
      }

      // 2. POST choices (empty = no ambiguities, unblock pipeline)
      const choicesRes = await fetch(`/api/agent/${sessionId}/choices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choices: [] }),
      });
      if (!choicesRes.ok) {
        const err = await choicesRes.json();
        throw new Error(err.error || "Erreur d'envoi des choix");
      }

      toast.success("Génération lancée !");
      navigate(`/compleo/agent/${sessionId}/generate`);
    } catch (err: any) {
      toast.error(err.message || "Erreur inattendue");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <PipelineStepper currentStep="configure" />
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <PipelineStepper currentStep="configure" />
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
      <PipelineStepper currentStep="configure" />

      <div className="max-w-4xl mx-auto px-4 pt-6 pb-16">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-zinc-100 mb-1">
            Configuration de la migration
          </h1>
          <p className="text-zinc-400 text-sm">
            {resolved?.detectionSummary || "Sélectionnez les options de génération"}
          </p>
        </div>

        {/* Domain badge */}
        {resolved?.detectedDomain && resolved.detectedDomain.primary !== "NONE" && (
          <div className="flex justify-center mb-6">
            <Badge className="bg-teal-500/10 text-teal-300 border-teal-600 px-3 py-1">
              <Globe className="w-3 h-3 mr-1" />
              Domaine détecté : {resolved.detectedDomain.label}
            </Badge>
          </div>
        )}

        {/* Options grouped by category */}
        <div className="space-y-6">
          {Object.entries(groupedOptions).map(([category, options]) => {
            const catInfo = CATEGORY_LABELS[category] || { label: category, icon: Layers };
            const CatIcon = catInfo.icon;
            return (
              <Card key={category} className="p-5 bg-zinc-900/50 border-zinc-700">
                <div className="flex items-center gap-2 mb-4">
                  <CatIcon className="w-4 h-4 text-teal-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">{catInfo.label}</h3>
                  <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-600">
                    {options.length}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {options.map((opt) => {
                    const isEnabled = enabledOptions.has(opt.id);
                    const confClass = CONFIDENCE_COLORS[opt.confidence] || "";
                    return (
                      <div
                        key={opt.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                          isEnabled
                            ? "border-teal-600/50 bg-teal-500/5"
                            : "border-zinc-700/50 bg-zinc-800/30"
                        }`}
                      >
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => toggleOption(opt.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-zinc-200">
                              {opt.label}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${confClass}`}
                            >
                              {opt.confidence}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            {opt.description}
                          </p>
                          {opt.aiJustification && (
                            <div className="mt-1.5 flex items-start gap-1.5">
                              <Sparkles className="w-3 h-3 text-purple-400 mt-0.5 shrink-0" />
                              <p className="text-[11px] text-purple-300/80 italic">
                                {opt.aiJustification}
                              </p>
                            </div>
                          )}
                          {opt.triggeredBy.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {opt.triggeredBy.slice(0, 4).map((t) => (
                                <Badge
                                  key={t}
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 text-zinc-500 border-zinc-700"
                                >
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Footer: estimation + generate button */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-zinc-900/50 border border-zinc-700 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Clock className="w-4 h-4" />
              <span>Estimation : ~{estimatedMinutes} min</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <BarChart3 className="w-4 h-4" />
              <span>{enabledOptions.size} option{enabledOptions.size > 1 ? "s" : ""}</span>
            </div>
          </div>
          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={submitting}
            className="gap-2 bg-teal-600 hover:bg-teal-500 text-white px-8"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Lancement...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Générer ({enabledOptions.size} options)
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
