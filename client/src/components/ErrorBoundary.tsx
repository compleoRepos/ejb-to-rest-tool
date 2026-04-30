/**
 * ErrorBoundary — Compleo v10.4
 * Catches React render errors with retry, error logging, and user-friendly UI.
 */
import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home, Bug } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

const MAX_AUTO_RETRIES = 2;

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Caught error:", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const canRetry = this.state.retryCount < MAX_AUTO_RETRIES;
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8 space-y-6">
            <div className="flex items-center gap-3">
              <AlertTriangle size={40} className="text-destructive flex-shrink-0" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Une erreur inattendue est survenue
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {this.state.retryCount > 0
                    ? `Tentative ${this.state.retryCount}/${MAX_AUTO_RETRIES} échouée`
                    : "L'application a rencontré un problème"}
                </p>
              </div>
            </div>
            <div className="p-4 w-full rounded-lg bg-muted/50 border border-border overflow-auto max-h-48">
              <div className="flex items-center gap-2 mb-2">
                <Bug size={14} className="text-muted-foreground" />
                <span className="text-xs font-mono text-muted-foreground">
                  {this.state.error?.name}: {this.state.error?.message}
                </span>
              </div>
              <pre className="text-xs text-muted-foreground/70 whitespace-pre-wrap font-mono">
                {this.state.error?.stack?.split("\n").slice(1, 6).join("\n")}
              </pre>
            </div>
            <div className="flex items-center gap-3">
              {canRetry && (
                <button
                  onClick={this.handleRetry}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg",
                    "bg-primary text-primary-foreground",
                    "hover:opacity-90 cursor-pointer transition-opacity"
                  )}
                >
                  <RotateCcw size={16} />
                  Réessayer
                </button>
              )}
              <button
                onClick={this.handleGoHome}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-muted text-foreground border border-border",
                  "hover:bg-muted/80 cursor-pointer transition-colors"
                )}
              >
                <Home size={16} />
                Accueil
              </button>
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-muted text-foreground border border-border",
                  "hover:bg-muted/80 cursor-pointer transition-colors"
                )}
              >
                <RotateCcw size={16} />
                Recharger
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
