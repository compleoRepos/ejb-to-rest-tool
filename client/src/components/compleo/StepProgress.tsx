/**
 * StepProgress — Barre de progression cliquable pour les 5 états du pipeline.
 * Retour arrière seulement (pas de saut en avant).
 * v5.6.1 : ajout de l'étape "Dépendances" entre Analyse et Choix.
 * @author Hamza NORDINE
 */

import { CheckCircle2, Upload, BarChart3, HelpCircle, Code2, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

export type PipelineStep = "idle" | "analyzing" | "missing_deps" | "choices" | "results";

const STEPS: { id: PipelineStep; label: string; icon: React.ElementType }[] = [
  { id: "idle", label: "Source", icon: Upload },
  { id: "analyzing", label: "Analyse", icon: BarChart3 },
  { id: "missing_deps", label: "Dépendances", icon: AlertTriangle },
  { id: "choices", label: "Choix", icon: HelpCircle },
  { id: "results", label: "Résultats", icon: Code2 },
];

interface StepProgressProps {
  current: PipelineStep;
  onNavigate: (step: PipelineStep) => void;
  /** Steps that have been completed (can navigate back to) */
  completed: Set<PipelineStep>;
}

export default function StepProgress({ current, onNavigate, completed }: StepProgressProps) {
  const currentIndex = STEPS.findIndex(s => s.id === current);

  return (
    <div className="flex items-center gap-1 w-full max-w-lg mx-auto">
      {STEPS.map((step, i) => {
        const isActive = step.id === current;
        const isDone = completed.has(step.id);
        const canClick = isDone && i < currentIndex; // Only backward navigation
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center flex-1">
            <button
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                isActive
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : isDone
                  ? "text-white/50 hover:text-white/70 hover:bg-white/5 cursor-pointer"
                  : "text-white/20 cursor-default"
              }`}
              onClick={() => canClick && onNavigate(step.id)}
              disabled={!canClick}
            >
              {isDone && !isActive ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60" />
              ) : (
                <Icon className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${
                i < currentIndex ? "bg-emerald-500/30" : "bg-white/10"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
