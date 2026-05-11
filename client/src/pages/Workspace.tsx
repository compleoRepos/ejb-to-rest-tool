/**
 * Workspace v6.0 — Page de gestion des workspaces multi-modules.
 * Permet de créer des workspaces, y ajouter des projets Compleo analysés,
 * visualiser les liens cross-module, détecter les redondances et
 * proposer des mutualisations de services.
 * @author Compleo
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Download, Loader2, ArrowLeft,
  Network, Package, CheckCircle2, AlertTriangle,
  FolderOpen, Link2, Unlink, RefreshCw, Layers, Brain,
} from "lucide-react";
import { Link as RouterLink } from "wouter";
import WorkspaceInsights from "@/components/WorkspaceInsights";
import WorkspaceAnalysis from "@/components/WorkspaceAnalysis";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WorkspaceSession {
  id?: string;
  sessionId: string;
  projectName: string;
  artifactId: string;
  analysisStatus: string;
  addedAt?: string;
}

interface CrossModuleLink {
  id: string;
  sourceSessionId: string;
  sourceClass: string;
  targetSessionId: string | null;
  targetClass: string;
  jndiPath: string;
  status: "UNRESOLVED" | "RESOLVED" | "NEWLY_RESOLVED" | "STUB";
}

interface WorkspaceDetail {
  id: string;
  name: string;
  description: string | null;
  sessions: WorkspaceSession[];
  links: CrossModuleLink[];
  resolvedCount: number;
  unresolvedCount: number;
}

interface WorkspaceSummary {
  id: string;
  name: string;
  description: string | null;
  sessionCount: number;
  sessions: WorkspaceSession[];
}

interface AvailableSession {
  id: string;
  projectName: string;
  status: string;
  fileCount: number;
  useCaseCount: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWs, setSelectedWs] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [availableSessions, setAvailableSessions] = useState<AvailableSession[]>([]);
  const [addingProject, setAddingProject] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"modules" | "intelligence" | "analysis">("modules");

  // ─── Load workspaces ────────────────────────────────────────────────────

  const loadWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace");
      if (res.ok) setWorkspaces(await res.json());
    } catch (err) {
      console.error("Failed to load workspaces:", err);
    }
  }, []);

  const loadAvailableSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/compleo/sessions");
      if (res.ok) {
        const sessions = await res.json();
        setAvailableSessions(sessions.filter((s: any) =>
          s.status === "analyzed" || s.status === "waiting_choices" || s.status === "generated" || s.status === "missing_deps"
        ));
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
    loadAvailableSessions();
  }, [loadWorkspaces, loadAvailableSessions]);

  // ─── Create workspace ───────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newWsName.trim()) {
      toast.error("Le nom du workspace est requis");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWsName, description: newWsDesc }),
      });
      if (res.ok) {
        toast.success("Workspace créé");
        setNewWsName("");
        setNewWsDesc("");
        loadWorkspaces();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erreur lors de la création");
      }
    } catch (err) {
      toast.error("Erreur réseau");
    } finally {
      setCreating(false);
    }
  };

  // ─── Select workspace ──────────────────────────────────────────────────

  const handleSelect = async (wsId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${wsId}`);
      if (res.ok) {
        setSelectedWs(await res.json());
      }
    } catch (err) {
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  // ─── Add project ───────────────────────────────────────────────────────

  const handleAddProject = async (sessionId: string) => {
    if (!selectedWs) return;
    setAddingProject(true);
    try {
      const res = await fetch(`/api/workspace/${selectedWs.id}/add-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Projet ajouté — ${data.resolution.resolvedCount} liens résolus, ${data.resolution.unresolvedCount} non résolus`
        );
        if (data.resolution.newlyResolvedCount > 0) {
          toast.success(
            `${data.resolution.newlyResolvedCount} lien(s) précédemment non résolu(s) maintenant résolu(s)!`,
            { duration: 5000 }
          );
        }
        handleSelect(selectedWs.id);
        loadWorkspaces();
      } else {
        toast.error(data.error || "Erreur lors de l'ajout");
      }
    } catch (err) {
      toast.error("Erreur réseau");
    } finally {
      setAddingProject(false);
    }
  };

  // ─── Delete workspace ──────────────────────────────────────────────────

  const handleDelete = async (wsId: string) => {
    try {
      const res = await fetch(`/api/workspace/${wsId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Workspace supprimé");
        if (selectedWs?.id === wsId) setSelectedWs(null);
        loadWorkspaces();
      }
    } catch (err) {
      toast.error("Erreur lors de la suppression");
    }
  };

  // ─── Generate multi-module ZIP ─────────────────────────────────────────

  const handleGenerate = async () => {
    if (!selectedWs) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/workspace/${selectedWs.id}/generate`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `ZIP multi-module généré — ${data.modules.length} modules, ${data.totalFiles} fichiers`
        );
        window.open(data.zipUrl, "_blank");
      } else {
        toast.error(data.error || "Erreur lors de la génération");
      }
    } catch (err) {
      toast.error("Erreur réseau");
    } finally {
      setGenerating(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[oklch(0.13_0.01_250)] text-white">
      {/* Header */}
      <div className="border-b border-[oklch(0.22_0.01_250)] bg-[oklch(0.15_0.01_250)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RouterLink href="/compleo">
              <Button variant="ghost" size="sm" className="text-[oklch(0.6_0.01_250)]">
                <ArrowLeft className="w-4 h-4 mr-1" /> Compleo
              </Button>
            </RouterLink>
            <div className="h-5 w-px bg-[oklch(0.25_0.01_250)]" />
            <Network className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-bold">Workspaces Multi-Modules</h1>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            v6.0.0
          </Badge>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">

          {/* ─── Left Panel: Workspace List ─────────────────────────── */}
          <div className="col-span-4">
            {/* Create workspace form */}
            <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.16_0.01_250)] p-4 mb-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Nouveau Workspace
              </h3>
              <input
                type="text"
                placeholder="Nom du workspace..."
                value={newWsName}
                onChange={e => setNewWsName(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.25_0.01_250)] text-white text-sm mb-2 focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="Description (optionnel)..."
                value={newWsDesc}
                onChange={e => setNewWsDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.25_0.01_250)] text-white text-sm mb-3 focus:outline-none focus:border-emerald-500"
              />
              <Button
                onClick={handleCreate}
                disabled={creating || !newWsName.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                size="sm"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Créer
              </Button>
            </div>

            {/* Workspace list */}
            <div className="space-y-2">
              {workspaces.map(ws => (
                <motion.div
                  key={ws.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`rounded-lg border p-3 cursor-pointer transition-all ${
                    selectedWs?.id === ws.id
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-[oklch(0.22_0.01_250)] bg-[oklch(0.16_0.01_250)] hover:border-[oklch(0.3_0.01_250)]"
                  }`}
                  onClick={() => handleSelect(ws.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{ws.name}</p>
                      <p className="text-xs text-[oklch(0.5_0.01_250)]">
                        {ws.sessionCount} module(s)
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => { e.stopPropagation(); handleDelete(ws.id); }}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </motion.div>
              ))}
              {workspaces.length === 0 && (
                <div className="text-center py-8 text-[oklch(0.45_0.01_250)]">
                  <Network className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Aucun workspace</p>
                  <p className="text-xs mt-1">Créez un workspace pour regrouper vos modules</p>
                </div>
              )}
            </div>
          </div>

          {/* ─── Right Panel: Workspace Detail ──────────────────────── */}
          <div className="col-span-8">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center py-20"
                >
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </motion.div>
              ) : selectedWs ? (
                <motion.div
                  key={selectedWs.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {/* Workspace header */}
                  <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.16_0.01_250)] p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="text-lg font-bold">{selectedWs.name}</h2>
                        {selectedWs.description && (
                          <p className="text-sm text-[oklch(0.55_0.01_250)]">{selectedWs.description}</p>
                        )}
                      </div>
                      <Button
                        onClick={handleGenerate}
                        disabled={generating || selectedWs.sessions.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700"
                        size="sm"
                      >
                        {generating ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <Download className="w-4 h-4 mr-1" />
                        )}
                        Générer ZIP Multi-Module
                      </Button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-md bg-[oklch(0.12_0.01_250)] p-3 text-center">
                        <Package className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                        <p className="text-lg font-bold">{selectedWs.sessions.length}</p>
                        <p className="text-xs text-[oklch(0.5_0.01_250)]">Modules</p>
                      </div>
                      <div className="rounded-md bg-[oklch(0.12_0.01_250)] p-3 text-center">
                        <Link2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                        <p className="text-lg font-bold text-emerald-400">{selectedWs.resolvedCount}</p>
                        <p className="text-xs text-[oklch(0.5_0.01_250)]">Liens résolus</p>
                      </div>
                      <div className="rounded-md bg-[oklch(0.12_0.01_250)] p-3 text-center">
                        <Unlink className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                        <p className="text-lg font-bold text-amber-400">{selectedWs.unresolvedCount}</p>
                        <p className="text-xs text-[oklch(0.5_0.01_250)]">Non résolus</p>
                      </div>
                    </div>
                  </div>

                  {/* Tab navigation */}
                  <div className="flex gap-2 mb-4">
                    <Button
                      variant={activeTab === "modules" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveTab("modules")}
                      className={activeTab === "modules"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "text-[oklch(0.6_0.01_250)] border-[oklch(0.25_0.01_250)] hover:bg-[oklch(0.2_0.01_250)]"
                      }
                    >
                      <Layers className="w-3.5 h-3.5 mr-1" /> Modules
                    </Button>
                    <Button
                      variant={activeTab === "intelligence" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveTab("intelligence")}
                      className={activeTab === "intelligence"
                        ? "bg-purple-600 hover:bg-purple-700 text-white"
                        : "text-[oklch(0.6_0.01_250)] border-[oklch(0.25_0.01_250)] hover:bg-[oklch(0.2_0.01_250)]"
                      }
                    >
                      <Brain className="w-3.5 h-3.5 mr-1" /> Intelligence
                    </Button>
                    <Button
                      variant={activeTab === "analysis" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveTab("analysis")}
                      className={activeTab === "analysis"
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "text-[oklch(0.6_0.01_250)] border-[oklch(0.25_0.01_250)] hover:bg-[oklch(0.2_0.01_250)]"
                      }
                    >
                      <Network className="w-3.5 h-3.5 mr-1" /> Analysis v13
                    </Button>
                  </div>
                  {activeTab === "analysis" ? (
                    <WorkspaceAnalysis
                      workspaceId={selectedWs.id}
                      workspaceName={selectedWs.name}
                    />
                  ) : activeTab === "intelligence" ? (
                    <WorkspaceInsights
                      workspaceId={selectedWs.id}
                      workspaceName={selectedWs.name}
                    />
                  ) : (
                  <>
                  {/* Modules list */}
                  <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.16_0.01_250)] p-4 mb-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-400" />
                      Modules ({selectedWs.sessions.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedWs.sessions.map(s => (
                        <div
                          key={s.sessionId}
                          className="flex items-center justify-between p-2.5 rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.2_0.01_250)]"
                        >
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-blue-400" />
                            <div>
                              <p className="text-sm font-medium">{s.projectName}</p>
                              <p className="text-xs text-[oklch(0.5_0.01_250)]">{s.artifactId}</p>
                            </div>
                          </div>
                          <Badge
                            className={
                              s.analysisStatus === "LINKED"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            }
                          >
                            {s.analysisStatus}
                          </Badge>
                        </div>
                      ))}
                    </div>

                    {/* Add project */}
                    <div className="mt-4 pt-3 border-t border-[oklch(0.22_0.01_250)]">
                      <p className="text-xs text-[oklch(0.5_0.01_250)] mb-2">
                        Ajouter un projet analysé :
                      </p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {availableSessions
                          .filter(s => !selectedWs.sessions.some(ws => ws.sessionId === s.id))
                          .map(s => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between p-2 rounded-md bg-[oklch(0.14_0.01_250)] border border-[oklch(0.2_0.01_250)]"
                            >
                              <div>
                                <p className="text-sm">{s.projectName}</p>
                                <p className="text-xs text-[oklch(0.5_0.01_250)]">
                                  {s.useCaseCount} UseCases, {s.fileCount} fichiers
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddProject(s.id)}
                                disabled={addingProject}
                                className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                              >
                                {addingProject ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Plus className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </div>
                          ))}
                        {availableSessions.filter(s => !selectedWs.sessions.some(ws => ws.sessionId === s.id)).length === 0 && (
                          <p className="text-xs text-[oklch(0.45_0.01_250)] text-center py-2">
                            Tous les projets analysés sont déjà dans ce workspace
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cross-module links */}
                  {selectedWs.links.length > 0 && (
                    <div className="rounded-lg border border-[oklch(0.22_0.01_250)] bg-[oklch(0.16_0.01_250)] p-4">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Network className="w-4 h-4 text-emerald-400" />
                        Liens Cross-Module ({selectedWs.links.length})
                      </h3>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {selectedWs.links.map(link => {
                          const sourceProject = selectedWs.sessions.find(
                            s => s.sessionId === link.sourceSessionId
                          );
                          const targetProject = link.targetSessionId
                            ? selectedWs.sessions.find(s => s.sessionId === link.targetSessionId)
                            : null;

                          return (
                            <div
                              key={link.id}
                              className="flex items-center gap-2 p-2.5 rounded-md bg-[oklch(0.12_0.01_250)] border border-[oklch(0.2_0.01_250)]"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="text-blue-400 font-mono truncate">
                                    {sourceProject?.artifactId ?? "?"}
                                  </span>
                                  <span className="text-[oklch(0.5_0.01_250)]">/</span>
                                  <span className="text-white font-mono truncate">
                                    {link.sourceClass}
                                  </span>
                                  <ArrowLeft className="w-3 h-3 text-[oklch(0.5_0.01_250)] rotate-180 flex-shrink-0" />
                                  {targetProject ? (
                                    <>
                                      <span className="text-emerald-400 font-mono truncate">
                                        {targetProject.artifactId}
                                      </span>
                                      <span className="text-[oklch(0.5_0.01_250)]">/</span>
                                      <span className="text-white font-mono truncate">
                                        {link.targetClass}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-amber-400 font-mono truncate">
                                      {link.targetClass} (non résolu)
                                    </span>
                                  )}
                                </div>
                                {link.jndiPath && (
                                  <p className="text-[10px] text-[oklch(0.45_0.01_250)] font-mono mt-0.5 truncate">
                                    {link.jndiPath}
                                  </p>
                                )}
                              </div>
                              <Badge
                                className={
                                  link.status === "RESOLVED" || link.status === "NEWLY_RESOLVED"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex-shrink-0"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20 flex-shrink-0"
                                }
                              >
                                {link.status === "NEWLY_RESOLVED" ? (
                                  <><CheckCircle2 className="w-3 h-3 mr-1" /> Nouveau</>
                                ) : link.status === "RESOLVED" ? (
                                  <><CheckCircle2 className="w-3 h-3 mr-1" /> Résolu</>
                                ) : (
                                  <><AlertTriangle className="w-3 h-3 mr-1" /> Non résolu</>
                                )}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  </>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-[oklch(0.45_0.01_250)]"
                >
                  <FolderOpen className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">Sélectionnez un workspace</p>
                  <p className="text-xs mt-1">ou créez-en un nouveau</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
