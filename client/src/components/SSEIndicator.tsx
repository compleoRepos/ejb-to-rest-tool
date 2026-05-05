/**
 * SSEIndicator — Compleo v11.2
 * Pastille verte/rouge indiquant l'état de la connexion SSE.
 * Reconnexion automatique avec backoff exponentiel (1s → 2s → 4s → 8s → 16s → 30s max, 10 retries).
 */
import { cn } from "@/lib/utils";
import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SSEIndicatorProps {
  sessionId: string | null;
  className?: string;
}

type ConnectionState = "connected" | "connecting" | "disconnected";

const MAX_RETRIES = 10;
const MAX_BACKOFF_MS = 30_000;

export function SSEIndicator({ sessionId, className }: SSEIndicatorProps) {
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [retryCount, setRetryCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getBackoffDelay = useCallback((attempt: number): number => {
    return Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
  }, []);

  const connect = useCallback(() => {
    if (!sessionId) return;

    setState("connecting");

    const es = new EventSource(`/api/agent/${sessionId}/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setState("connected");
      setRetryCount(0);
    };

    es.addEventListener("heartbeat", () => {
      // Heartbeat reçu — connexion vivante
      setState("connected");
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setState("disconnected");

      setRetryCount((prev) => {
        const next = prev + 1;
        if (next <= MAX_RETRIES) {
          const delay = getBackoffDelay(next);
          retryTimerRef.current = setTimeout(connect, delay);
        }
        return next;
      });
    };
  }, [sessionId, getBackoffDelay]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [connect]);

  const stateConfig = {
    connected: {
      color: "bg-emerald-500",
      pulse: "animate-pulse",
      icon: Wifi,
      label: "Connecté (SSE actif)",
    },
    connecting: {
      color: "bg-amber-500",
      pulse: "animate-pulse",
      icon: Wifi,
      label: `Reconnexion... (tentative ${retryCount}/${MAX_RETRIES})`,
    },
    disconnected: {
      color: "bg-red-500",
      pulse: "",
      icon: WifiOff,
      label: retryCount >= MAX_RETRIES
        ? "Déconnecté (max retries atteint)"
        : "Déconnecté",
    },
  };

  const config = stateConfig[state];
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-1.5 cursor-default", className)}>
          <span className={cn("relative flex h-2.5 w-2.5")}>
            {config.pulse && (
              <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", config.color, config.pulse)} />
            )}
            <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", config.color)} />
          </span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">{config.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
