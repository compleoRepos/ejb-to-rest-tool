/**
 * AnalysisReviewScreen — Écran de résultats d'analyse détaillés.
 * Affiche les insights IA, les risques, les domaines, le score de maturité,
 * et le plan de migration AVANT que l'utilisateur ne choisisse les options de génération.
 *
 * v10.7 — Nouveau workflow : Analyse d'abord, Génération ensuite.
 * @author Compleo
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  ArrowRight, Shield, AlertTriangle, Layers, Target,
  TrendingUp, Clock, ChevronDown, ChevronRight,
  Bot, Lightbulb, Server, Database, Zap, Package,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DomainInsight {
  domain: string;
  label: string;
  businessRole: string;
  criticality: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  dependencies: string[];
  migrationNote: string;
}

interface RiskInsight {
  risk: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  mitigation: string;
  affectedDomains: string[];
}

interface MigrationStep {
  order: number;
  phase: string;
  domains: string[];
  description: string;
  duration: string;
  reason: string;
}

interface AIInsights {
  projectSummary: string;
  domainInsights: DomainInsight[];
  riskAssessment: RiskInsight[];
  migrationStrategy: MigrationStep[];
  recommendationNotes: Record<string, string>;
  architecteComment: string;
  estimatedComplexity: string;
}

interface MaturityScore {
  global: number;
  dimensions: Record<string, number>;
  label: string;
  attentionPoints: string[];
  estimatedEffort: string;
}

interface AnalysisStats {
  totalFiles: number;
  totalLines: number;
  useCaseCount: number;
  dtoCount: number;
  serviceCount: number;
  enumCount: number;
  exceptionCount: number;
  validatorCount: number;
  remoteInterfaceCount: number;
  domainCount: number;
  domains: string[];
}

interface Props {
  projectName: string;
  stats: AnalysisStats;
  technologiesDetected: string[];
  maturityScore: MaturityScore | null;
  aiInsights: AIInsights | null;
  ambiguityCount: number;
  missingDepsCount: number;
  onContinueToGeneration: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const criticalityColors: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-300 border-red-500/30",
  HIGH: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  LOW: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const severityColors: Record<string, string> = {
  HIGH: "text-red-400",
  MEDIUM: "text-amber-400",
  LOW: "text-emerald-400",
};

const techLabels: Record<string, string> = {
  EJB_2X: "EJB 2.x",
  EJB_3X_STATELESS: "EJB 3.x",
  EJB_3X_STATEFUL: "Stateful",
  EJB_3X_MDB: "MDB",
  SERVLET: "Servlet",
  JSP: "JSP",
  STRUTS: "Struts",
  SOAP: "SOAP/WS",
  JDBC: "JDBC",
  HIBERNATE: "Hibernate",
  JMS: "JMS",
  BATCH: "Batch",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function AnalysisReviewScreen({
  projectName,
  stats,
  technologiesDetected,
  maturityScore,
  aiInsights,
  ambiguityCount,
  missingDepsCount,
  onContinueToGeneration,
}: Props) {
  const [expandedSection, setExpandedSection] = useState<string | null>("summary");

  const toggleSection = (id: string) => {
    setExpandedSection(prev => (prev === id ? null : id));
  };

  return (
    <motion.div
      key="analysis_review"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="h-full flex flex-col overflow-hidden"
    >
      {/* Header bar */}
      <div className="border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)] px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-sm font-medium text-white">
              Analyse terminée — <span className="text-emerald-400">{projectName}</span>
            </h2>
          </div>
          <Button
            onClick={onContinueToGeneration} data-test="continue-generation"
            className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white px-5"
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            Configurer la génération
            {ambiguityCount > 0 && (
              <Badge className="ml-2 bg-white/20 text-white text-[10px]">
                {ambiguityCount} choix
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* ─── Quick Stats Row ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          <StatCard label="Fichiers" value={stats.totalFiles} icon={<Package className="w-3.5 h-3.5" />} />
          <StatCard label="Lignes" value={stats.totalLines?.toLocaleString() || "—"} icon={<Layers className="w-3.5 h-3.5" />} />
          <StatCard label="Use Cases" value={stats.useCaseCount} icon={<Target className="w-3.5 h-3.5" />} />
          <StatCard label="DTOs" value={stats.dtoCount} icon={<Database className="w-3.5 h-3.5" />} />
          <StatCard label="Domaines" value={stats.domainCount} icon={<Server className="w-3.5 h-3.5" />} />
          <StatCard label="Technologies" value={technologiesDetected.length} icon={<Zap className="w-3.5 h-3.5" />} />
        </div>

        {/* ─── Technologies Detected ─── */}
        <div className="flex flex-wrap gap-1.5 px-1">
          {technologiesDetected.map(tech => (
            <Badge key={tech} variant="outline" className="text-[10px] border-[oklch(0.3_0.01_250)] text-[oklch(0.7_0.01_250)]">
              {techLabels[tech] || tech}
            </Badge>
          ))}
        </div>

        {/* ─── Maturity Score ─── */}
        {maturityScore && (
          <div className="bg-[oklch(0.14_0.01_250)] border border-[oklch(0.25_0.01_250)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-medium text-white">Score de maturité</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">{maturityScore.global}<span className="text-sm text-[oklch(0.5_0.01_250)]">/100</span></span>
                <Badge className={`text-[10px] ${
                  maturityScore.global >= 70 ? "bg-emerald-500/20 text-emerald-300" :
                  maturityScore.global >= 40 ? "bg-amber-500/20 text-amber-300" :
                  "bg-red-500/20 text-red-300"
                }`}>
                  {maturityScore.label}
                </Badge>
              </div>
            </div>
            {/* Dimensions bar chart */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(maturityScore.dimensions).map(([dim, score]) => (
                <div key={dim} className="flex items-center gap-2">
                  <span className="text-[10px] text-[oklch(0.5_0.01_250)] w-24 truncate">{dim}</span>
                  <div className="flex-1 h-1.5 bg-[oklch(0.2_0.01_250)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[oklch(0.5_0.01_250)] w-6 text-right">{score}</span>
                </div>
              ))}
            </div>
            {maturityScore.estimatedEffort && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-[oklch(0.5_0.01_250)]">
                <Clock className="w-3 h-3" />
                Effort estimé : <span className="text-white font-medium">{maturityScore.estimatedEffort}</span>
              </div>
            )}
          </div>
        )}

        {/* ─── AI Insights Section ─── */}
        {aiInsights && (
          <div className="space-y-2">
            {/* Summary */}
            <CollapsibleSection
              id="summary"
              title="Synthèse du projet"
              icon={<Bot className="w-4 h-4 text-violet-400" />}
              expanded={expandedSection === "summary"}
              onToggle={toggleSection}
            >
              <p className="text-xs text-[oklch(0.7_0.01_250)] leading-relaxed">
                {aiInsights.projectSummary}
              </p>
              {aiInsights.architecteComment && (
                <div className="mt-3 border-l-2 border-violet-500/50 pl-3">
                  <p className="text-[11px] text-[oklch(0.6_0.01_250)] italic">
                    {aiInsights.architecteComment}
                  </p>
                </div>
              )}
            </CollapsibleSection>

            {/* Domains */}
            {aiInsights.domainInsights.length > 0 && (
              <CollapsibleSection
                id="domains"
                title={`Domaines métier (${aiInsights.domainInsights.length})`}
                icon={<Layers className="w-4 h-4 text-cyan-400" />}
                expanded={expandedSection === "domains"}
                onToggle={toggleSection}
              >
                <div className="space-y-2">
                  {aiInsights.domainInsights.map((d, i) => (
                    <div key={i} className="flex items-start gap-3 py-1.5 border-b border-[oklch(0.2_0.01_250)] last:border-0">
                      <Badge className={`text-[9px] shrink-0 ${criticalityColors[d.criticality]}`}>
                        {d.criticality}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white">{d.label || d.domain}</span>
                        </div>
                        <p className="text-[11px] text-[oklch(0.5_0.01_250)] mt-0.5">{d.businessRole}</p>
                        {d.migrationNote && (
                          <p className="text-[10px] text-[oklch(0.45_0.01_250)] mt-1 italic">{d.migrationNote}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Risks */}
            {aiInsights.riskAssessment.length > 0 && (
              <CollapsibleSection
                id="risks"
                title={`Risques identifiés (${aiInsights.riskAssessment.length})`}
                icon={<Shield className="w-4 h-4 text-amber-400" />}
                expanded={expandedSection === "risks"}
                onToggle={toggleSection}
              >
                <div className="space-y-2">
                  {aiInsights.riskAssessment.map((r, i) => (
                    <div key={i} className="bg-[oklch(0.12_0.01_250)] rounded p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className={`w-3 h-3 ${severityColors[r.severity]}`} />
                        <span className="text-xs font-medium text-white">{r.risk}</span>
                        <Badge className={`text-[9px] ml-auto ${
                          r.severity === "HIGH" ? "bg-red-500/20 text-red-300" :
                          r.severity === "MEDIUM" ? "bg-amber-500/20 text-amber-300" :
                          "bg-emerald-500/20 text-emerald-300"
                        }`}>
                          {r.severity}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-[oklch(0.55_0.01_250)]">{r.description}</p>
                      <p className="text-[10px] text-emerald-400/80 mt-1">
                        <Lightbulb className="w-2.5 h-2.5 inline mr-1" />
                        {r.mitigation}
                      </p>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Migration Strategy */}
            {aiInsights.migrationStrategy.length > 0 && (
              <CollapsibleSection
                id="migration"
                title={`Plan de migration (${aiInsights.migrationStrategy.length} phases)`}
                icon={<Target className="w-4 h-4 text-emerald-400" />}
                expanded={expandedSection === "migration"}
                onToggle={toggleSection}
              >
                <div className="relative pl-4">
                  {/* Timeline line */}
                  <div className="absolute left-1.5 top-2 bottom-2 w-px bg-emerald-500/30" />
                  <div className="space-y-3">
                    {aiInsights.migrationStrategy.map((step, i) => (
                      <div key={i} className="relative">
                        {/* Timeline dot */}
                        <div className="absolute -left-[10.5px] top-1.5 w-2 h-2 rounded-full bg-emerald-500 border border-[oklch(0.14_0.01_250)]" />
                        <div className="ml-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-white">Phase {step.order}: {step.phase}</span>
                            <Badge className="text-[9px] bg-[oklch(0.2_0.01_250)] text-[oklch(0.6_0.01_250)]">
                              {step.duration}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-[oklch(0.55_0.01_250)] mt-0.5">{step.description}</p>
                          {step.domains.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {step.domains.map(d => (
                                <span key={d} className="text-[9px] px-1.5 py-0.5 rounded bg-[oklch(0.2_0.01_250)] text-[oklch(0.6_0.01_250)]">
                                  {d}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleSection>
            )}
          </div>
        )}

        {/* ─── Fallback when no AI insights ─── */}
        {!aiInsights && (
          <div className="bg-[oklch(0.14_0.01_250)] border border-[oklch(0.25_0.01_250)] rounded-lg p-6 text-center">
            <Bot className="w-8 h-8 mx-auto mb-2 text-[oklch(0.3_0.01_250)]" />
            <p className="text-xs text-[oklch(0.5_0.01_250)]">
              Les insights IA ne sont pas disponibles pour cette analyse.
            </p>
            <p className="text-[10px] text-[oklch(0.4_0.01_250)] mt-1">
              Vous pouvez continuer vers la configuration de la génération.
            </p>
          </div>
        )}

        {/* ─── Warnings / Info bar ─── */}
        {(ambiguityCount > 0 || missingDepsCount > 0) && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-[11px] text-[oklch(0.6_0.01_250)]">
              {ambiguityCount > 0 && (
                <span>
                  <strong className="text-amber-300">{ambiguityCount} choix architecturaux</strong> à valider
                  {missingDepsCount > 0 ? " • " : ""}
                </span>
              )}
              {missingDepsCount > 0 && (
                <span>
                  <strong className="text-amber-300">{missingDepsCount} dépendance(s)</strong> manquante(s)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer — CTA */}
      <div className="border-t border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)] px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="text-[10px] text-[oklch(0.4_0.01_250)]">
          {aiInsights?.estimatedComplexity && (
            <span>Complexité estimée : <strong className="text-white">{aiInsights.estimatedComplexity}</strong></span>
          )}
        </div>
        <Button
          onClick={onContinueToGeneration} data-test="continue-generation"
          className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white px-6"
        >
          <ArrowRight className="w-4 h-4 mr-2" />
          Continuer vers la génération
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-[oklch(0.14_0.01_250)] border border-[oklch(0.22_0.01_250)] rounded-lg px-3 py-2 flex items-center gap-2">
      <div className="text-[oklch(0.4_0.01_250)]">{icon}</div>
      <div>
        <div className="text-sm font-semibold text-white">{value}</div>
        <div className="text-[10px] text-[oklch(0.45_0.01_250)]">{label}</div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  id,
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[oklch(0.14_0.01_250)] border border-[oklch(0.25_0.01_250)] rounded-lg overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-[oklch(0.16_0.01_250)] transition-colors"
      >
        {icon}
        <span className="text-xs font-medium text-white flex-1 text-left">{title}</span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[oklch(0.4_0.01_250)]" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[oklch(0.4_0.01_250)]" />
        )}
      </button>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="px-4 pb-3"
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}
