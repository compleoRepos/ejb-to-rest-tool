/**
 * SagasPage — Page dédiée aux Sagas Orchestration (v7.9).
 *
 * Permet de visualiser les sagas de toutes les sessions agent terminées.
 * Sélection de session → SagaViewer.
 *
 * @author Compleo
 */

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import SagaViewer from "@/components/compleo/SagaViewer";
import {
  Loader2, GitBranch, Layers, Clock, AlertTriangle,
  CheckCircle2, FolderArchive,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentSessionSummary {
  id: string;
  state: string;
  currentPhase: string;
  createdAt: number;
  updatedAt: number;
  eventCount: number;
  projectName: string;
  sourceType: string;
  outputType: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SagasPage() {
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/agent/sessions");
        if (!res.ok) throw new Error("Impossible de charger les sessions");
        const json = await res.json();
        // Filter completed sessions only
        const completed = (json.sessions || []).filter(
          (s: AgentSessionSummary) => s.state === "COMPLETED",
        );
        setSessions(completed);
        if (completed.length > 0) {
          setSelectedSession(completed[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Chargement des sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-red-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Layers className="w-10 h-10 opacity-40" />
        <p className="text-sm font-medium">Aucune session agent terminée</p>
        <p className="text-xs opacity-60">
          Lancez une analyse via l'Agent IA avec l'option Saga activée pour voir les résultats ici.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-pink-400" />
          <h1 className="text-lg font-semibold">Saga Orchestration</h1>
          <Badge variant="secondary" className="text-xs bg-pink-500/10 text-pink-400">
            v7.9
          </Badge>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Session sidebar */}
        <div className="w-72 border-r border-border/50 shrink-0">
          <div className="px-4 py-3 border-b border-border/30">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Sessions terminées
            </span>
          </div>
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session.id)}
                  className={`w-full text-left p-3 rounded-lg transition-all ${
                    selectedSession === session.id
                      ? "bg-pink-500/10 border border-pink-500/30"
                      : "hover:bg-muted/30 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FolderArchive className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">
                      {session.projectName || "Sans nom"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>{session.sourceType}</span>
                    <span className="opacity-50">·</span>
                    <Clock className="w-3 h-3" />
                    <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto p-4">
          {selectedSession ? (
            <SagaViewer sessionId={selectedSession} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">Sélectionnez une session pour voir les Sagas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
