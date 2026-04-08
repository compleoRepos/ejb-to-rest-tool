/**
 * Auth Middleware — Vérification JWT Bearer sur les routes Compleo.
 * Mode AUTH_STRATEGY=local : JWT signé avec SESSION_SECRET.
 * Extensible pour OIDC et LDAP.
 *
 * @author Hamza NORDINE
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ── Types ──────────────────────────────────────────────────────

export interface AuthUser {
  userId: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

// ── Configuration ──────────────────────────────────────────────

function getJwtSecret(): string {
  return process.env.SESSION_SECRET || process.env.JWT_SECRET || "compleo-dev-secret";
}

// ── Middleware ──────────────────────────────────────────────────

/**
 * Middleware Express qui vérifie le header Authorization: Bearer <token>.
 * Si le token est absent ou invalide → 401 Unauthorized.
 * Si valide → req.authUser = payload décodé → next().
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Header Authorization manquant. Utilisez: Authorization: Bearer <token>",
    });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    res.status(401).json({
      error: "Unauthorized",
      message: "Format invalide. Attendu: Bearer <token>",
    });
    return;
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUser;
    req.authUser = decoded;
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      res.status(401).json({
        error: "Unauthorized",
        message: "Token expiré. Veuillez vous reconnecter.",
      });
      return;
    }
    res.status(401).json({
      error: "Unauthorized",
      message: "Token invalide.",
    });
    return;
  }
}

/**
 * Middleware optionnel : vérifie le token s'il est présent,
 * mais laisse passer les requêtes sans token (pour les routes mixtes).
 */
export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(parts[1], getJwtSecret()) as AuthUser;
    req.authUser = decoded;
  } catch {
    // Token invalide mais optionnel — on continue sans user
  }

  next();
}
