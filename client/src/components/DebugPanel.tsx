/**
 * DebugPanel — Panneau de debug temps réel via SSE.
 * Visible uniquement en mode développement (NODE_ENV=development).
 * Affiche les événements du pipeline Compleo en temps réel.
 *
 * @author Hamza NORDINE
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bug, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface DebugEvent {
  timestamp: string;
  level: "info" | "warning" | "error" | "success";
  message: string;
  details?: string;
}

interface DebugPanelProps {
  sessionId: string | null;
}

const isDev = import.meta.env.DEV;

const levelConfig = {
  info: { icon: "📋", color: "text-blue-400", badge: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  warning: { icon: "⚠️", color: "text-amber-400", badge: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  error: { icon: "❌", color: "text-red-400", badge: "bg-red-500/20 text-red-400 border-red-500/30" },
  success: { icon: "✅", color: "text-emerald-400", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

export function DebugPanel({ sessionId }: DebugPanelProps) {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Don't render in production
  if (!isDev) return null;

  // Connect to SSE endpoint when sessionId changes
  useEffect(() => {
    if (!sessionId) return;

    // Close previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Fetch existing events first
    fetch(`/api/compleo/debug/${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.events) setEvents(data.events);
      })
      .catch(() => {});

    // Connect SSE
    const es = new EventSource(`/api/compleo/events/${sessionId}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: DebugEvent = JSON.parse(e.data);
        setEvents(prev => [...prev, event]);
      } catch {}
    };

    es.onerror = () => {
      // Reconnect after a delay
      setTimeout(() => {
        if (eventSourceRef.current === es) {
          es.close();
        }
      }, 5000);
    };

    setIsOpen(true);

    return () => {
      es.close();
    };
  }, [sessionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const clearEvents = useCallback(() => setEvents([]), []);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("fr-FR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 } as any);
  };

  if (!isOpen && events.length === 0) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-all text-xs font-mono shadow-lg"
      >
        <Bug className="w-3.5 h-3.5" />
        Debug
      </button>
    );
  }

  return (
    <div className={`fixed bottom-0 right-0 z-50 w-full max-w-2xl transition-all ${isMinimized ? "h-10" : "h-80"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-t-lg cursor-pointer"
           onClick={() => setIsMinimized(!isMinimized)}>
        <div className="flex items-center gap-2">
          <Bug className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-mono text-zinc-300">Debug Pipeline</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-zinc-800 border-zinc-600 text-zinc-400">
            {events.length} events
          </Badge>
          {events.filter(e => e.level === "error").length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-500/20 border-red-500/30 text-red-400">
              {events.filter(e => e.level === "error").length} errors
            </Badge>
          )}
          {events.filter(e => e.level === "warning").length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/20 border-amber-500/30 text-amber-400">
              {events.filter(e => e.level === "warning").length} warnings
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-300" onClick={(e) => { e.stopPropagation(); clearEvents(); }}>
            <Trash2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-300" onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}>
            {isMinimized ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-300" onClick={(e) => { e.stopPropagation(); setIsOpen(false); setEvents([]); }}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Event List */}
      {!isMinimized && (
        <div ref={scrollRef} className="h-[calc(100%-2.5rem)] overflow-y-auto bg-zinc-950 border-x border-b border-zinc-700 font-mono text-xs">
          {events.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-600">
              En attente d'événements...
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {events.map((event, i) => {
                const config = levelConfig[event.level];
                return (
                  <div key={i} className="flex items-start gap-2 py-0.5 hover:bg-zinc-900/50 px-1 rounded">
                    <span className="text-zinc-600 shrink-0 tabular-nums">[{formatTime(event.timestamp)}]</span>
                    <span className="shrink-0">{config.icon}</span>
                    <span className={config.color}>{event.message}</span>
                    {event.details && (
                      <span className="text-zinc-600 ml-1">→ {event.details}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
