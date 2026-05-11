/**
 * StatusBar — Compleo v11.2
 * Barre compacte en haut : version + statut LLM (pastille) + sessions actives + nombre de règles.
 */
import { cn } from "@/lib/utils";
import { Brain, Activity, BookOpen, Server } from "lucide-react";
import { useEffect, useState } from "react";

interface StatusData {
  version: string;
  uptime: number;
  llm: { available: boolean; model?: string; latency?: number };
  memory: { heapUsed: number; heapTotal: number };
  activeSessions?: number;
  rulesCount?: number;
}

interface StatusBarProps {
  className?: string;
}

export function StatusBar({ className }: StatusBarProps) {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error("Status fetch failed");
        const data = await res.json();
        if (mounted) {
          setStatus(data);
          setError(false);
        }
      } catch {
        if (mounted) setError(true);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000); // Refresh toutes les 30s
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (error || !status) {
    return (
      <div className={cn(
        "flex items-center gap-4 px-4 py-1.5 text-xs text-muted-foreground bg-muted/30 border-b border-border/50",
        className
      )} data-test="status-bar" data-state="unavailable">
        <span className="flex items-center gap-1">
          <Server className="h-3 w-3" />
          {error ? "Serveur indisponible" : "Chargement..."}
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-4 px-4 py-1.5 text-xs text-muted-foreground bg-muted/30 border-b border-border/50",
      className
    )} data-test="status-bar" data-state="ready">
      {/* Version */}
      <span className="flex items-center gap-1 font-mono" data-test="app-version">
        <Server className="h-3 w-3" />
        v{status.version}
      </span>

      {/* LLM Status */}
      <span className="flex items-center gap-1.5" data-test="llm-status" data-available={String(status.llm.available)}>
        <span className={cn(
          "h-2 w-2 rounded-full",
          status.llm.available ? "bg-emerald-500" : "bg-red-500"
        )} />
        <Brain className="h-3 w-3" />
        {status.llm.available
          ? `LLM OK${status.llm.latency ? ` (${status.llm.latency}ms)` : ""}`
          : "LLM indisponible"
        }
      </span>

      {/* Sessions actives */}
      {status.activeSessions !== undefined && (
        <span className="flex items-center gap-1" data-test="active-sessions">
          <Activity className="h-3 w-3" />
          {status.activeSessions} session{status.activeSessions !== 1 ? "s" : ""}
        </span>
      )}

      {/* Règles */}
      {status.rulesCount !== undefined && (
        <span className="flex items-center gap-1" data-test="rules-count">
          <BookOpen className="h-3 w-3" />
          {status.rulesCount} règle{status.rulesCount !== 1 ? "s" : ""}
        </span>
      )}

      {/* Mémoire */}
      <span className="ml-auto font-mono opacity-60" data-test="memory-usage">
        {status.memory.heapUsed}MB / {status.memory.heapTotal}MB
      </span>
    </div>
  );
}
