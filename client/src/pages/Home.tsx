/**
 * Home — Page d'accueil / Dashboard v4.0
 * Vue d'ensemble de la plateforme avec statistiques et accès rapide aux projets.
 * @author Hamza NORDINE
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Terminal, FolderGit2, Plus, ArrowRight, Code2, Network,
  Brain, Cloud, Layers, BarChart3, GitBranch, Zap,
  Activity, TrendingUp, FileCode2, Server, Shield,
  Database, Globe, Box, Container, ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";

const TECH_ICONS: Record<string, typeof Database> = {
  ejb: Box, servlet: Globe, soap: Globe, jdbc: Database,
  hibernate: Database, jms: Activity, struts: Globe,
  jsp: Globe, batch: Server, transactions: Shield,
};

const TECH_COLORS: Record<string, string> = {
  ejb: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  servlet: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  soap: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  jdbc: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  hibernate: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  jms: "text-red-400 bg-red-500/10 border-red-500/20",
  struts: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  jsp: "text-lime-400 bg-lime-500/10 border-lime-500/20",
  batch: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  transactions: "text-pink-400 bg-pink-500/10 border-pink-500/20",
};

const FEATURES = [
  { icon: Code2, title: "Analyse Multi-Technologies", desc: "EJB, Servlets, JSP, Struts, SOAP, JDBC, Hibernate, JMS, Batch", color: "text-primary" },
  { icon: Network, title: "Architecture Interactive", desc: "Graphe de dépendances Cytoscape.js, bounded contexts DDD", color: "text-cyan-400" },
  { icon: GitBranch, title: "Strangler Fig Pattern", desc: "Plan de migration automatique avec phases et priorités", color: "text-emerald-400" },
  { icon: Brain, title: "Moteur IA 83+ Règles", desc: "OWASP, SonarQube, SOLID, Clean Code, PMD, SpotBugs", color: "text-amber-400" },
  { icon: Cloud, title: "Cloud-Native", desc: "Docker, Kubernetes, Helm, API Gateway, OAuth2, CI/CD", color: "text-violet-400" },
  { icon: Layers, title: "Microservices DDD", desc: "Extraction automatique, bounded contexts, event-driven", color: "text-cyan-400" },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  const totalFiles = projects?.reduce((sum, p) => sum + (p.fileCount ?? 0), 0) ?? 0;
  const totalLines = projects?.reduce((sum, p) => sum + (p.totalLines ?? 0), 0) ?? 0;
  const allTechs = new Set<string>();
  projects?.forEach(p => {
    if (p.technologies && Array.isArray(p.technologies)) {
      (p.technologies as string[]).forEach(t => allTechs.add(t));
    }
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-6xl mx-auto space-y-8">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Terminal className="w-10 h-10 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Java Legacy Modernizer</h1>
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">v4.0 Enterprise</Badge>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl mx-auto mb-6">
            Plateforme enterprise de modernisation Java legacy. Analysez, transformez et migrez
            vos applications monolithiques vers des architectures microservices cloud-native.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              size="lg"
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setLocation("/projects")}
            >
              <FolderGit2 className="w-4 h-4" />
              Mes Projets
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              onClick={() => setLocation("/projects")}
            >
              <Plus className="w-4 h-4" />
              Nouveau Projet
            </Button>
          </div>
        </motion.div>

        {/* Stats Overview */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <StatCard icon={FolderGit2} label="Projets" value={projects?.length ?? 0} color="text-primary" />
          <StatCard icon={FileCode2} label="Fichiers" value={totalFiles} color="text-emerald-400" />
          <StatCard icon={Code2} label="Lignes de code" value={totalLines} color="text-amber-400" />
          <StatCard icon={Layers} label="Technologies" value={allTechs.size} color="text-cyan-400" />
        </motion.div>

        {/* Recent Projects */}
        {projects && projects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-primary" />
                Projets Récents
              </h2>
              <Link href="/projects">
                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                  Voir tout <ChevronRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.slice(0, 6).map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div className="rounded-lg border border-border bg-card hover:bg-card/80 p-4 transition-all cursor-pointer group">
                    <div className="flex items-center gap-2 mb-2">
                      <FolderGit2 className="w-4 h-4 text-primary group-hover:text-primary/80" />
                      <span className="text-sm font-medium truncate">{project.name}</span>
                      <Badge variant="outline" className={`text-[9px] h-4 ml-auto ${
                        project.status === "active" ? "border-emerald-500/30 text-emerald-400" :
                        project.status === "completed" ? "border-blue-500/30 text-blue-400" :
                        "border-muted-foreground/30 text-muted-foreground"
                      }`}>
                        {project.status}
                      </Badge>
                    </div>
                    {project.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{project.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileCode2 className="w-3 h-3" />{project.fileCount} fichiers
                      </span>
                      <span className="flex items-center gap-1">
                        <Code2 className="w-3 h-3" />{project.totalLines} lignes
                      </span>
                      {project.legacyScore && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />{project.legacyScore} → {project.modernScore}
                        </span>
                      )}
                    </div>
                    {project.technologies && Array.isArray(project.technologies) && (project.technologies as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(project.technologies as string[]).slice(0, 4).map((tech) => {
                          const TIcon = TECH_ICONS[tech] || Box;
                          const colorClass = TECH_COLORS[tech] || "text-muted-foreground bg-secondary/50 border-border";
                          return (
                            <div key={tech} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border ${colorClass}`}>
                              <TIcon className="w-2.5 h-2.5" />
                              <span className="capitalize">{tech}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Fonctionnalités v4.0
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map((feature, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card/50 p-4 hover:bg-card/80 transition-colors">
                <feature.icon className={`w-6 h-6 ${feature.color} mb-2`} />
                <h3 className="text-xs font-semibold mb-1">{feature.title}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <div className="text-center py-4 border-t border-border">
          <p className="text-[10px] text-muted-foreground/60 font-mono">
            Java Legacy Modernizer v4.0 Enterprise — par Hamza NORDINE — 10 technologies, 55+ règles IA, microservices DDD, cloud-native
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Terminal; label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 text-center">
      <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
      <div className="text-2xl font-bold font-mono">{value.toLocaleString()}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
