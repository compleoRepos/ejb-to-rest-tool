/**
 * PipelineStepper — Barre horizontale 5 étapes pour le pipeline COMPLEO.
 * États : completed (✅ teal), active (● pulse), pending (○ gris).
 */
import { Check, Upload, Search, Settings, Zap, Trophy, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export type PipelineStep = "upload" | "analyze" | "schema-decoder" | "configure" | "generate" | "result";

interface PipelineStepperProps {
  currentStep: PipelineStep;
  sessionId?: string;
}

const STEPS: Array<{ id: PipelineStep; label: string; icon: React.ElementType }> = [
  { id: "upload", label: "Upload", icon: Upload },
  { id: "analyze", label: "Analyse", icon: Search },
  { id: "schema-decoder", label: "Schema", icon: Database },
  { id: "configure", label: "Configuration", icon: Settings },
  { id: "generate", label: "Génération", icon: Zap },
  { id: "result", label: "Résultat", icon: Trophy },
];

export function PipelineStepper({ currentStep }: PipelineStepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="w-full px-4 py-3">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;
          const isPending = index > currentIndex;
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              {/* Step circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                    isCompleted && "bg-teal-500 border-teal-500 text-white",
                    isActive && "border-teal-500 text-teal-500 animate-pulse bg-teal-500/10",
                    isPending && "border-zinc-600 text-zinc-500 bg-zinc-800/50"
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium whitespace-nowrap",
                    isCompleted && "text-teal-400",
                    isActive && "text-teal-300",
                    isPending && "text-zinc-500"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-2 mt-[-1rem] transition-all duration-300",
                    index < currentIndex ? "bg-teal-500" : "bg-zinc-700"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
