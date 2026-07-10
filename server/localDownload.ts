/**
 * Local Download Fallback — sert les fichiers ZIP générés depuis le disque local
 * quand l'upload S3 (storagePut) échoue.
 *
 * Les fichiers sont stockés temporairement dans un répertoire dédié et servis via
 * l'endpoint GET /api/download/:id. Chaque fichier est automatiquement supprimé
 * après 1 heure pour éviter l'accumulation sur le disque.
 */
import { Router } from "express";
import path from "path";
import fs from "fs/promises";
import os from "os";
import crypto from "crypto";

/** Répertoire de stockage temporaire pour les ZIPs en fallback local */
const LOCAL_DOWNLOAD_DIR = path.join(os.tmpdir(), "ejb-to-rest-downloads");

/** Durée de rétention des fichiers en millisecondes (1 heure) */
const RETENTION_MS = 60 * 60 * 1000;

/** Map interne : id → { filePath, originalName, createdAt } */
const downloadRegistry = new Map<string, { filePath: string; originalName: string; createdAt: number }>();

/**
 * Enregistre un fichier ZIP dans le registre local et retourne l'URL de téléchargement.
 * Le fichier est copié dans le répertoire de fallback avec un identifiant unique.
 *
 * @param zipPath - Chemin absolu du fichier ZIP source
 * @param originalName - Nom original du fichier (utilisé pour Content-Disposition)
 * @returns L'URL relative de téléchargement (ex: /api/download/abc123)
 */
export async function registerLocalDownload(zipPath: string, originalName: string): Promise<string> {
  await fs.mkdir(LOCAL_DOWNLOAD_DIR, { recursive: true });

  const id = crypto.randomBytes(16).toString("hex");
  const destPath = path.join(LOCAL_DOWNLOAD_DIR, `${id}.zip`);

  await fs.copyFile(zipPath, destPath);

  downloadRegistry.set(id, {
    filePath: destPath,
    originalName,
    createdAt: Date.now(),
  });

  // Programmer la suppression automatique après RETENTION_MS
  setTimeout(async () => {
    downloadRegistry.delete(id);
    await fs.rm(destPath, { force: true }).catch(() => {});
  }, RETENTION_MS);

  return `/api/download/${id}`;
}

/**
 * Router Express pour servir les fichiers ZIP en fallback local.
 */
export const downloadRouter = Router();

downloadRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  const entry = downloadRegistry.get(id);
  if (!entry) {
    res.status(404).json({ error: "Fichier non trouvé ou expiré" });
    return;
  }

  try {
    await fs.access(entry.filePath);
  } catch {
    downloadRegistry.delete(id);
    res.status(404).json({ error: "Fichier supprimé du disque" });
    return;
  }

  const stat = await fs.stat(entry.filePath);
  res.set({
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${entry.originalName}"`,
    "Content-Length": String(stat.size),
    "Cache-Control": "no-store",
  });

  const { createReadStream } = await import("fs");
  createReadStream(entry.filePath).pipe(res);
});
