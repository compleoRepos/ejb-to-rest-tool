/**
 * SessionList — Sessions récentes dans l'état IDLE.
 * Permet de restaurer une session précédente.
 * @author Compleo
 */

import { useState, useEffect } from "react";
import { History, ChevronRight, Loader2 } from "lucide-react";
import { fetchWithCache } from "@/hooks/useSessionsCache";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

interface SessionSummary {
  id: string;
  projectName: string;
  status: string;
  uploadedAt: string;
  fileCount: number;
  useCaseCount: number;
  generatedFiles: number;
}

interface SessionListProps {
  onRestore: (sessionId: string) => void;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  uploaded: { label: "Uploadé", color: "text-blue-400 border-blue-500/30" },
  analyzed: { label: "Analysé", color: "text-amber-400 border-amber-500/30" },
  waiting_choices: { label: "En attente", color: "text-purple-400 border-purple-500/30" },
  missing_deps: { label: "Dépendances", color: "text-orange-400 border-orange-500/30" },
  generated: { label: "Généré", color: "text-emerald-400 border-emerald-500/30" },
  error: { label: "Erreur", color: "text-red-400 border-red-500/30" },
};

export default function SessionList({ onRestore }: SessionListProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchWithCache<SessionSummary[]>("/api/compleo/sessions")
      .then(data => {
        if (mounted) setSessions(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-white/30 text-sm py-4 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement des sessions...
      </div>
    );
  }

  if (sessions.length === 0) return null;

  return (
    <div className="w-full max-w-xl mx-auto mt-6">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-white/30" />
        <span className="text-xs text-white/40 uppercase tracking-wider">Sessions récentes</span>
      </div>
      <div className="space-y-1.5">
        {sessions.slice(0, 5).map((s, i) => {
          const st = statusLabels[s.status] || statusLabels.uploaded;
          const date = new Date(s.uploadedAt);
          const timeAgo = getTimeAgo(date);

          return (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg border border-white/5 hover:border-white/15 hover:bg-white/[0.02] transition-all group"
              onClick={() => onRestore(s.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/70 truncate">{s.projectName}</span>
                  <Badge variant="outline" className={`text-[10px] px-1 py-0 ${st.color}`}>
                    {st.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-white/30">{timeAgo}</span>
                  <span className="text-[10px] text-white/30">{s.fileCount} fichiers</span>
                  {s.generatedFiles > 0 && (
                    <span className="text-[10px] text-emerald-400/40">{s.generatedFiles} générés</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}
