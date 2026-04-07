/**
 * Migration — Simulation de migration Strangler Fig Pattern
 * Plan de migration automatique avec phases, timeline, risques.
 * @author Hamza NORDINE
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  GitBranch, Play, Clock, CheckCircle2, AlertTriangle, Layers,
  ArrowRight, Shield, Zap, Target, TrendingUp, Loader2,
  ChevronDown, ChevronRight, Calendar, Server, Database,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface MigrationPhase {
  id: string;
  name: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "blocked";
  priority: "critical" | "high" | "medium" | "low";
  estimatedDays: number;
  dependencies: string[];
  services: string[];
  risks: string[];
  tasks: MigrationTask[];
}

interface MigrationTask {
  id: string;
  name: string;
  description: string;
  status: "pending" | "in-progress" | "completed";
  effort: "small" | "medium" | "large";
}

interface StranglerFigPlan {
  phases: MigrationPhase[];
  totalEstimatedDays: number;
  overallProgress: number;
  riskScore: number;
}

// ============================================================
// Demo Migration Plan Generator
// ============================================================

function generateDemoMigrationPlan(): StranglerFigPlan {
  const phases: MigrationPhase[] = [
    {
      id: "phase-1",
      name: "Phase 1 — Infrastructure & CI/CD",
      description: "Mise en place de l'infrastructure cloud, containerisation, pipeline CI/CD, monitoring.",
      status: "completed",
      priority: "critical",
      estimatedDays: 15,
      dependencies: [],
      services: ["API Gateway", "Docker Registry", "Kubernetes Cluster"],
      risks: ["Configuration réseau complexe", "Latence inter-services"],
      tasks: [
        { id: "t1-1", name: "Provisionner le cluster Kubernetes", description: "EKS/GKE/AKS", status: "completed", effort: "large" },
        { id: "t1-2", name: "Configurer le pipeline CI/CD", description: "GitHub Actions + ArgoCD", status: "completed", effort: "medium" },
        { id: "t1-3", name: "Mettre en place le monitoring", description: "Prometheus + Grafana + Loki", status: "completed", effort: "medium" },
        { id: "t1-4", name: "Configurer l'API Gateway", description: "Spring Cloud Gateway + rate limiting", status: "completed", effort: "small" },
      ],
    },
    {
      id: "phase-2",
      name: "Phase 2 — Service Utilisateurs",
      description: "Migration du module utilisateurs : authentification, profils, rôles. Premier service extrait du monolithe.",
      status: "in-progress",
      priority: "high",
      estimatedDays: 20,
      dependencies: ["phase-1"],
      services: ["User Service", "Auth Service"],
      risks: ["Synchronisation des sessions", "Migration des mots de passe hashés"],
      tasks: [
        { id: "t2-1", name: "Créer le User Service Spring Boot", description: "REST API + Spring Security", status: "completed", effort: "large" },
        { id: "t2-2", name: "Migrer le schéma utilisateurs", description: "Flyway migration scripts", status: "completed", effort: "medium" },
        { id: "t2-3", name: "Implémenter OAuth2/JWT", description: "Remplacer les sessions EJB", status: "in-progress", effort: "large" },
        { id: "t2-4", name: "Configurer le proxy Strangler Fig", description: "Router /api/users vers le nouveau service", status: "pending", effort: "small" },
        { id: "t2-5", name: "Tests d'intégration", description: "Vérifier la compatibilité avec le monolithe", status: "pending", effort: "medium" },
      ],
    },
    {
      id: "phase-3",
      name: "Phase 3 — Service Paiements",
      description: "Extraction du module paiements : transactions, remboursements, webhooks. Intégration Stripe/PayPal.",
      status: "pending",
      priority: "high",
      estimatedDays: 25,
      dependencies: ["phase-2"],
      services: ["Payment Service", "Notification Service"],
      risks: ["Intégrité transactionnelle", "Idempotence des paiements", "PCI-DSS compliance"],
      tasks: [
        { id: "t3-1", name: "Créer le Payment Service", description: "Spring Boot + Spring Data JPA", status: "pending", effort: "large" },
        { id: "t3-2", name: "Implémenter le pattern Saga", description: "Orchestration des transactions distribuées", status: "pending", effort: "large" },
        { id: "t3-3", name: "Migrer les intégrations Stripe", description: "Webhooks + idempotence keys", status: "pending", effort: "medium" },
        { id: "t3-4", name: "Event sourcing pour l'audit trail", description: "Kafka + event store", status: "pending", effort: "large" },
      ],
    },
    {
      id: "phase-4",
      name: "Phase 4 — Service Commandes",
      description: "Migration du module commandes : panier, checkout, historique. Communication asynchrone via Kafka.",
      status: "pending",
      priority: "medium",
      estimatedDays: 20,
      dependencies: ["phase-2", "phase-3"],
      services: ["Order Service", "Inventory Service"],
      risks: ["Cohérence éventuelle", "Gestion des paniers abandonnés"],
      tasks: [
        { id: "t4-1", name: "Créer le Order Service", description: "CQRS + Event Sourcing", status: "pending", effort: "large" },
        { id: "t4-2", name: "Implémenter Kafka producers/consumers", description: "OrderCreated, PaymentCompleted events", status: "pending", effort: "medium" },
        { id: "t4-3", name: "Migrer le module inventaire", description: "Gestion du stock en temps réel", status: "pending", effort: "medium" },
      ],
    },
    {
      id: "phase-5",
      name: "Phase 5 — Décommissionnement du monolithe",
      description: "Retrait progressif du monolithe legacy. Redirection de tout le trafic vers les microservices.",
      status: "pending",
      priority: "low",
      estimatedDays: 10,
      dependencies: ["phase-3", "phase-4"],
      services: ["Legacy Monolith"],
      risks: ["Fonctionnalités oubliées", "Données orphelines"],
      tasks: [
        { id: "t5-1", name: "Audit de couverture fonctionnelle", description: "Vérifier que tous les endpoints sont migrés", status: "pending", effort: "medium" },
        { id: "t5-2", name: "Rediriger 100% du trafic", description: "Mise à jour du proxy/gateway", status: "pending", effort: "small" },
        { id: "t5-3", name: "Archiver le monolithe", description: "Backup final + documentation", status: "pending", effort: "small" },
      ],
    },
  ];

  const completedTasks = phases.flatMap(p => p.tasks).filter(t => t.status === "completed").length;
  const totalTasks = phases.flatMap(p => p.tasks).length;
  const totalDays = phases.reduce((sum, p) => sum + p.estimatedDays, 0);

  return {
    phases,
    totalEstimatedDays: totalDays,
    overallProgress: Math.round((completedTasks / totalTasks) * 100),
    riskScore: 42,
  };
}

// ============================================================
// Main Component
// ============================================================

export default function MigrationPage({ projectId }: { projectId: number }) {
  const { data: project } = trpc.projects.getById.useQuery({ id: projectId });
  const [plan, setPlan] = useState<StranglerFigPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(["phase-1", "phase-2"]));

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setPlan(generateDemoMigrationPlan());
      setIsGenerating(false);
      toast.success("Plan de migration Strangler Fig généré");
    }, 1200);
  };

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const statusConfig = {
    completed: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle2, label: "Terminé" },
    "in-progress": { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: Play, label: "En cours" },
    pending: { color: "text-muted-foreground", bg: "bg-secondary/20", border: "border-border", icon: Clock, label: "En attente" },
    blocked: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: AlertTriangle, label: "Bloqué" },
  };

  const priorityColors = {
    critical: "text-red-400 bg-red-500/10 border-red-500/20",
    high: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    medium: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    low: "text-muted-foreground bg-secondary/20 border-border",
  };

  if (!plan) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center">
            <GitBranch className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Simulation de Migration</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Générez un plan de migration Strangler Fig automatique basé sur l'analyse de votre projet legacy.
            Le plan inclut les phases, dépendances, risques et estimations d'effort.
          </p>
        </div>
        <Button
          size="lg"
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isGenerating ? "Génération en cours..." : "Générer le plan de migration"}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-10 border-b border-border flex items-center px-4 gap-3 shrink-0 bg-secondary/20">
        <GitBranch className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold">Plan de Migration — {project?.name || "Projet"}</span>
        <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-0">Strangler Fig</Badge>
        <div className="ml-auto flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={handleGenerate}>
            <Zap className="w-3 h-3" />Régénérer
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-border bg-secondary/20 p-4 text-center">
              <div className="text-2xl font-bold font-mono text-primary">{plan.overallProgress}%</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Progression</div>
              <Progress value={plan.overallProgress} className="h-1.5 mt-2" />
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-4 text-center">
              <div className="text-2xl font-bold font-mono text-emerald-400">{plan.phases.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Phases</div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-4 text-center">
              <div className="text-2xl font-bold font-mono text-amber-400">{plan.totalEstimatedDays}j</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Effort total</div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-4 text-center">
              <div className="text-2xl font-bold font-mono text-red-400">{plan.riskScore}/100</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Score risque</div>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-4">
            {plan.phases.map((phase, idx) => {
              const config = statusConfig[phase.status];
              const StatusIcon = config.icon;
              const isExpanded = expandedPhases.has(phase.id);
              const completedTasks = phase.tasks.filter(t => t.status === "completed").length;
              const phaseProgress = phase.tasks.length > 0 ? Math.round((completedTasks / phase.tasks.length) * 100) : 0;

              return (
                <div key={phase.id} className={`rounded-lg border ${config.border} ${config.bg} overflow-hidden`}>
                  {/* Phase header */}
                  <button
                    onClick={() => togglePhase(phase.id)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/10 transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <StatusIcon className={`w-5 h-5 ${config.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground">{phase.name}</span>
                        <Badge variant="outline" className={`text-[9px] h-4 ${priorityColors[phase.priority]}`}>{phase.priority}</Badge>
                        <Badge variant="outline" className={`text-[9px] h-4 ${config.border} ${config.color}`}>{config.label}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{phase.description}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono text-foreground">{completedTasks}/{phase.tasks.length}</div>
                        <div className="text-[9px] text-muted-foreground">tâches</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono text-amber-400">{phase.estimatedDays}j</div>
                        <div className="text-[9px] text-muted-foreground">effort</div>
                      </div>
                      <div className="w-16">
                        <Progress value={phaseProgress} className="h-1.5" />
                      </div>
                    </div>
                  </button>

                  {/* Phase details */}
                  {isExpanded && (
                    <div className="border-t border-border/50 p-4 space-y-4">
                      {/* Services */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Services :</span>
                        {phase.services.map(s => (
                          <Badge key={s} variant="outline" className="text-[10px] h-5 border-primary/30 text-primary">{s}</Badge>
                        ))}
                      </div>

                      {/* Dependencies */}
                      {phase.dependencies.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Dépend de :</span>
                          {phase.dependencies.map(d => (
                            <Badge key={d} variant="outline" className="text-[10px] h-5 border-border text-muted-foreground">{d}</Badge>
                          ))}
                        </div>
                      )}

                      {/* Tasks */}
                      <div className="space-y-1.5">
                        {phase.tasks.map(task => {
                          const taskStatusColors = {
                            completed: "text-emerald-400",
                            "in-progress": "text-blue-400",
                            pending: "text-muted-foreground/50",
                          };
                          const effortBadge = {
                            small: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                            medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                            large: "bg-red-500/10 text-red-400 border-red-500/20",
                          };
                          return (
                            <div key={task.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-background/50">
                              {task.status === "completed" ? (
                                <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${taskStatusColors[task.status]}`} />
                              ) : task.status === "in-progress" ? (
                                <Play className={`w-3.5 h-3.5 shrink-0 ${taskStatusColors[task.status]}`} />
                              ) : (
                                <Clock className={`w-3.5 h-3.5 shrink-0 ${taskStatusColors[task.status]}`} />
                              )}
                              <div className="flex-1 min-w-0">
                                <span className={`text-xs ${task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                  {task.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground ml-2">— {task.description}</span>
                              </div>
                              <Badge variant="outline" className={`text-[9px] h-4 ${effortBadge[task.effort]}`}>{task.effort}</Badge>
                            </div>
                          );
                        })}
                      </div>

                      {/* Risks */}
                      {phase.risks.length > 0 && (
                        <div>
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Risques :</span>
                          <div className="mt-1 space-y-1">
                            {phase.risks.map((risk, i) => (
                              <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-red-500/5 border border-red-500/10">
                                <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                                <span className="text-[10px] text-red-300">{risk}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
