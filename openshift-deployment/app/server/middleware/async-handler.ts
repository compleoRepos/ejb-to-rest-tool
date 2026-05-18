/**
 * AsyncHandler — Wrapper pour les routes Express classiques (non-tRPC).
 * Catche les erreurs async et les passe au middleware d'erreur.
 *
 * @author Compleo
 */
import { Request, Response, NextFunction } from "express";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
