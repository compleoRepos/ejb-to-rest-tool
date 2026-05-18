/**
 * DataStates — Compleo v11.2
 * Composants réutilisables pour les 3 états data-driven :
 * - Loading → skeleton animé
 * - Error → message + bouton Réessayer
 * - Empty → icône + message "Aucun projet"
 */
import { cn } from "@/lib/utils";
import { AlertCircle, FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════════
// LOADING STATE — Skeleton animé
// ═══════════════════════════════════════════════════════════════════

interface LoadingStateProps {
  message?: string;
  lines?: number;
  className?: string;
}

export function LoadingState({ message = "Chargement...", lines = 4, className }: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 gap-4", className)}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="w-full max-w-md space-y-3 mt-4">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-4 rounded bg-muted animate-pulse",
              i === 0 && "w-3/4",
              i === 1 && "w-full",
              i === 2 && "w-5/6",
              i >= 3 && "w-2/3"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ERROR STATE — Message + bouton Réessayer
// ═══════════════════════════════════════════════════════════════════

interface ErrorStateProps {
  message?: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  message = "Une erreur est survenue",
  detail,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 gap-4", className)}>
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">{message}</p>
        {detail && (
          <p className="text-xs text-muted-foreground max-w-sm">{detail}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Réessayer
        </Button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EMPTY STATE — Icône + message
// ═══════════════════════════════════════════════════════════════════

interface EmptyStateProps {
  message?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  message = "Aucun projet",
  description = "Commencez par uploader un projet Java legacy pour lancer l'analyse.",
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 gap-4", className)}>
      <div className="rounded-full bg-muted p-4">
        {icon || <FolderOpen className="h-8 w-8 text-muted-foreground" />}
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="text-xs text-muted-foreground max-w-sm">{description}</p>
      </div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WRAPPER — Gestion automatique des 3 états
// ═══════════════════════════════════════════════════════════════════

interface DataStateWrapperProps<T> {
  data: T | undefined | null;
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
  loadingMessage?: string;
  emptyMessage?: string;
  emptyDescription?: string;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
  className?: string;
}

export function DataStateWrapper<T>({
  data,
  isLoading,
  error,
  onRetry,
  loadingMessage,
  emptyMessage,
  emptyDescription,
  isEmpty,
  children,
  className,
}: DataStateWrapperProps<T>) {
  if (isLoading) {
    return <LoadingState message={loadingMessage} className={className} />;
  }

  if (error) {
    return (
      <ErrorState
        message="Erreur de chargement"
        detail={error instanceof Error ? error.message : "Erreur inconnue"}
        onRetry={onRetry}
        className={className}
      />
    );
  }

  if (!data || (isEmpty && isEmpty(data))) {
    return (
      <EmptyState
        message={emptyMessage}
        description={emptyDescription}
        className={className}
      />
    );
  }

  return <>{children(data)}</>;
}
