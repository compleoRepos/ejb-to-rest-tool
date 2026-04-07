/**
 * Projects — Gestion de projets v4.0
 * Liste des projets, création, suppression, navigation vers le détail.
 * @author Hamza NORDINE
 */
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, FolderGit2, FileCode2, Code2, TrendingUp, Trash2,
  Search, Loader2, Activity, Database, Globe, Box, Server,
  Shield, ChevronRight, MoreHorizontal, Archive, CheckCircle2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export default function ProjectsPage() {
  const [, setLocation] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form state
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newGitUrl, setNewGitUrl] = useState("");
  const [newGitProvider, setNewGitProvider] = useState<string>("");

  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: (project) => {
      utils.projects.list.invalidate();
      toast.success(`Projet "${project.name}" créé avec succès`);
      setShowCreate(false);
      resetForm();
      setLocation(`/projects/${project.id}`);
    },
    onError: () => toast.error("Erreur lors de la création du projet"),
  });

  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success("Projet supprimé");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success("Projet mis à jour");
    },
  });

  const resetForm = () => {
    setNewName(""); setNewDesc(""); setNewGitUrl(""); setNewGitProvider("");
  };

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Le nom du projet est requis"); return; }
    createMutation.mutate({
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      gitUrl: newGitUrl.trim() || undefined,
      gitProvider: (newGitProvider as any) || undefined,
    });
  };

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description?.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = filterStatus === "all" || p.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [projects, search, filterStatus]);

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <FolderGit2 className="w-5 h-5 text-primary" />
              Projets
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Gérez vos projets Java legacy et suivez leur modernisation
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5" />
            Nouveau Projet
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher un projet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs bg-secondary/30"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32 h-8 text-xs bg-secondary/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="active">Actifs</SelectItem>
              <SelectItem value="completed">Terminés</SelectItem>
              <SelectItem value="archived">Archivés</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Project Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3"
          >
            <FolderGit2 className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-sm">{projects?.length === 0 ? "Aucun projet. Créez votre premier projet !" : "Aucun projet ne correspond à votre recherche."}</p>
            {projects?.length === 0 && (
              <Button size="sm" className="gap-1.5 mt-2" onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5" />
                Créer un projet
              </Button>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project, idx) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <div className="rounded-lg border border-border bg-card hover:border-primary/30 p-4 transition-all group">
                  <div className="flex items-start justify-between mb-2">
                    <Link href={`/projects/${project.id}`}>
                      <button className="flex items-center gap-2 text-left group-hover:text-primary transition-colors">
                        <FolderGit2 className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm font-medium truncate">{project.name}</span>
                      </button>
                    </Link>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className={`text-[9px] h-4 ${
                        project.status === "active" ? "border-emerald-500/30 text-emerald-400" :
                        project.status === "completed" ? "border-blue-500/30 text-blue-400" :
                        "border-muted-foreground/30 text-muted-foreground"
                      }`}>
                        {project.status}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded hover:bg-secondary/50 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => updateMutation.mutate({ id: project.id, status: "archived" })}>
                            <Archive className="w-3.5 h-3.5 mr-2" />Archiver
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateMutation.mutate({ id: project.id, status: "completed" })}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-2" />Marquer terminé
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              if (confirm(`Supprimer le projet "${project.name}" ?`)) {
                                deleteMutation.mutate({ id: project.id });
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {project.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
                  )}

                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <FileCode2 className="w-3 h-3" />{project.fileCount} fichiers
                    </span>
                    <span className="flex items-center gap-1">
                      <Code2 className="w-3 h-3" />{project.totalLines.toLocaleString()} lignes
                    </span>
                  </div>

                  {project.legacyScore != null && project.modernScore != null && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 rounded-full transition-all" style={{ width: `${project.modernScore}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-primary">{project.legacyScore} → {project.modernScore}</span>
                    </div>
                  )}

                  {project.technologies && Array.isArray(project.technologies) && (project.technologies as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(project.technologies as string[]).slice(0, 5).map((tech) => {
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

                  <Link href={`/projects/${project.id}`}>
                    <button className="w-full mt-3 flex items-center justify-center gap-1 text-[11px] text-primary hover:underline">
                      Ouvrir le projet <ChevronRight className="w-3 h-3" />
                    </button>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderGit2 className="w-5 h-5 text-primary" />
              Nouveau Projet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Nom du projet *</Label>
              <Input
                placeholder="ex: payment-service-legacy"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                placeholder="Description du projet..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">URL du repository Git (optionnel)</Label>
              <Input
                placeholder="https://github.com/org/repo"
                value={newGitUrl}
                onChange={(e) => setNewGitUrl(e.target.value)}
                className="mt-1"
              />
            </div>
            {newGitUrl && (
              <div>
                <Label className="text-xs">Fournisseur Git</Label>
                <Select value={newGitProvider} onValueChange={setNewGitProvider}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">GitHub</SelectItem>
                    <SelectItem value="gitlab">GitLab</SelectItem>
                    <SelectItem value="bitbucket">Bitbucket</SelectItem>
                    <SelectItem value="azure_devops">Azure DevOps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Annuler</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
