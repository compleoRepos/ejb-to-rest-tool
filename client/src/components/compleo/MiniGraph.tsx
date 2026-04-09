/**
 * MiniGraph — Graphe d'architecture réduit avec modal plein écran.
 * Utilise le composant ArchitectureDiagram existant.
 * @author Hamza NORDINE
 */

import { useState } from "react";
import { Maximize2, X, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface MiniGraphProps {
  sessionId: string;
}

export default function MiniGraph({ sessionId }: MiniGraphProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Lazy-load the ArchitectureDiagram component
  const handleOpen = () => {
    setFullscreen(true);
    setLoaded(true);
  };

  return (
    <>
      {/* Mini preview card */}
      <div
        className="relative rounded-lg border border-white/10 bg-white/[0.02] p-4 cursor-pointer hover:border-emerald-500/30 transition-colors group"
        onClick={handleOpen}
      >
        <div className="flex items-center gap-2 mb-3">
          <Network className="w-4 h-4 text-emerald-400/60" />
          <span className="text-sm text-white/60">Architecture</span>
          <Maximize2 className="w-3.5 h-3.5 text-white/30 ml-auto group-hover:text-white/60 transition-colors" />
        </div>
        <div className="h-24 flex items-center justify-center text-white/20 text-xs">
          Cliquer pour voir le graphe d'architecture
        </div>
      </div>

      {/* Fullscreen modal */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-emerald-400" />
                <span className="text-sm text-white/80">Architecture — Vue microservices</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullscreen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 p-4">
              {loaded && (
                <iframe
                  src={`/architecture/${sessionId}?embed=true`}
                  className="w-full h-full rounded-lg border border-white/10"
                  title="Architecture Graph"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
