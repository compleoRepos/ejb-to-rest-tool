/**
 * Auth Routes — Endpoints d'authentification locale.
 * POST /api/auth/login — Authentification par username/password.
 * GET  /api/auth/me     — Informations sur l'utilisateur connecté.
 *
 * @author Hamza NORDINE
 */

import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { authMiddleware } from "./middleware/auth-middleware";

const router = Router();

// ── Configuration ──────────────────────────────────────────────

function getJwtSecret(): string {
  return process.env.SESSION_SECRET || process.env.JWT_SECRET || "compleo-dev-secret";
}

function getLocalCredentials(): { username: string; password: string } {
  return {
    username: process.env.LOCAL_ADMIN_USER || "admin",
    password: process.env.LOCAL_ADMIN_PASSWORD || "admin",
  };
}

// ── POST /api/auth/login ──────────────────────────────────────

/**
 * Authentification locale.
 * Body: { username: string, password: string }
 * Retourne: { token: string, expiresIn: number, user: { userId, username, role } }
 */
router.post("/login", (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Les champs 'username' et 'password' sont requis.",
      });
    }

    const creds = getLocalCredentials();

    if (username !== creds.username || password !== creds.password) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Identifiants invalides.",
      });
    }

    const payload = {
      userId: "local-admin-001",
      username: creds.username,
      role: "admin",
    };

    const expiresIn = 3600; // 1 heure
    const token = jwt.sign(payload, getJwtSecret(), { expiresIn });

    res.json({
      success: true,
      token,
      expiresIn,
      user: payload,
    });
  } catch (err: any) {
    console.error("[Auth] Login error:", err);
    res.status(500).json({ error: "Erreur lors de l'authentification" });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────

/**
 * Retourne les informations de l'utilisateur connecté.
 * Nécessite un token JWT valide.
 */
router.get("/me", authMiddleware, (req: Request, res: Response) => {
  res.json({
    success: true,
    user: req.authUser,
  });
});

// ── POST /api/auth/refresh ────────────────────────────────────

/**
 * Renouvelle le token JWT.
 * Nécessite un token JWT valide (même expiré récemment).
 */
router.post("/refresh", (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token requis" });
    }

    const token = authHeader.split(" ")[1];
    const secret = getJwtSecret();

    // Vérifier le token même expiré (ignoreExpiration)
    const decoded = jwt.verify(token, secret, { ignoreExpiration: true }) as any;

    const payload = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    };

    const expiresIn = 3600;
    const newToken = jwt.sign(payload, secret, { expiresIn });

    res.json({
      success: true,
      token: newToken,
      expiresIn,
      user: payload,
    });
  } catch (err: any) {
    res.status(401).json({ error: "Token invalide" });
  }
});

export { router as authRoutes };
