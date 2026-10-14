/**
 * Journal des requêtes sans la query string.
 *
 * Le filtre produit par le moteur trace `getRequestUri()`, URI complète avec ses paramètres : un jeton
 * passé en paramètre finit dans le journal du serveur. Le filtre ne trace plus que le chemin, le reste
 * de la trace est inchangé (méthode, statut, durée).
 */
import fs from "fs/promises";
import path from "path";

const FULL_URI = "requestContext.getUriInfo().getRequestUri()";
const PATH_ONLY = "requestContext.getUriInfo().getRequestUri().getPath()";

export function patchRequestLoggingSource(content: string): string {
  return content
    .split(PATH_ONLY)
    .join(FULL_URI)
    .split(FULL_URI)
    .join(PATH_ONLY)
    .replace("<li>Méthode HTTP et URI</li>", "<li>Méthode HTTP et chemin, sans les paramètres</li>");
}

export async function fixRequestLogging(outputDir: string): Promise<string[]> {
  const touched: string[] = [];
  for (const file of await findFilters(outputDir)) {
    const content = await fs.readFile(file, "utf-8");
    const patched = patchRequestLoggingSource(content);
    if (patched !== content) {
      await fs.writeFile(file, patched, "utf-8");
      touched.push(file);
    }
  }
  return touched;
}

async function findFilters(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "target" || e.name === ".git" || e.name === "node_modules") continue;
      out.push(...(await findFilters(full)));
    } else if (e.name === "RequestLoggingFilter.java" && full.replace(/\\/g, "/").toLowerCase().includes("-web/")) {
      out.push(full);
    }
  }
  return out;
}
