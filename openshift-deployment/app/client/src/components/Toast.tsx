/**
 * Toast — Compleo v11.2
 * Composant Toast global pour les notifications d'erreurs/succès.
 * Auto-dismiss 5s. Rouge pour erreur, vert pour succès, ambre pour warning.
 * Utilise le système de toast de sonner (déjà intégré via shadcn).
 *
 * Usage dans les pages :
 *   import { toast } from "sonner";
 *   toast.success("Opération réussie");
 *   toast.error("Erreur de connexion");
 *   toast.warning("Attention : LLM indisponible");
 *
 * Ce fichier exporte un hook useToastOnMutationError() pour intercepter
 * automatiquement les erreurs tRPC et afficher un toast.
 */
import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Hook qui intercepte les erreurs de mutation tRPC et affiche un toast automatique.
 * À utiliser dans App.tsx ou un provider global.
 */
export function useGlobalErrorToast() {
  useEffect(() => {
    // Les erreurs tRPC sont déjà interceptées dans main.tsx (queryClient.getMutationCache)
    // Ce hook ajoute un handler supplémentaire pour les erreurs réseau non-tRPC
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes("fetch")) {
        toast.error("Erreur réseau — vérifiez votre connexion", {
          duration: 5000,
        });
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);
}

/**
 * Wrapper pour les mutations tRPC avec toast automatique.
 * Usage :
 *   const mutation = trpc.feature.useMutation(withToast({
 *     successMessage: "Sauvegardé !",
 *     errorMessage: "Échec de la sauvegarde",
 *   }));
 */
export function withToast(options?: {
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}) {
  return {
    onSuccess: () => {
      if (options?.successMessage) {
        toast.success(options.successMessage, { duration: 5000 });
      }
      options?.onSuccess?.();
    },
    onError: (error: unknown) => {
      const message = options?.errorMessage
        || (error instanceof Error ? error.message : "Une erreur est survenue");
      toast.error(message, { duration: 5000 });
      options?.onError?.(error);
    },
  };
}
