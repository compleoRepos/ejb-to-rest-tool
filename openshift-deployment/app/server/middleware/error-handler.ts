/**
 * Middleware d'erreur global Express — Compleo v10.4
 *
 * Responsabilités :
 * 1. Logger l'erreur avec contexte (pas juste le message)
 * 2. Retourner une réponse JSON propre au client
 * 3. NE PAS exposer les stack traces en production
 * 4. Distinguer erreurs opérationnelles (attendues) vs bugs (inattendus)
 *
 * Doit être enregistré EN DERNIER dans la chaîne Express.
 *
 * @author Compleo
 */
import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export function globalErrorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = err.statusCode ?? 500;
  const isOperational = err.isOperational ?? false;

  // Logger
  if (statusCode >= 500) {
    console.error(
      `[ERROR] ${req.method} ${req.path} — ${err.message}`,
      JSON.stringify({
        statusCode,
        code: err.code,
        stack: err.stack?.split("\n").slice(0, 5).join("\n"),
        body: req.body ? JSON.stringify(req.body).substring(0, 200) : undefined,
      })
    );
  } else {
    console.warn(
      `[WARN] ${req.method} ${req.path} — ${err.message} (${statusCode})`
    );
  }

  // Ne pas envoyer si la réponse est déjà envoyée (SSE, etc.)
  if (res.headersSent) return;

  // Réponse client
  res.status(statusCode).json({
    error: {
      message: isOperational ? err.message : "Erreur interne du serveur",
      code: err.code ?? "INTERNAL_ERROR",
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    },
  });
}
