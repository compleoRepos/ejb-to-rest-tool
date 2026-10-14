/**
 * Génération sur un dépôt qui porte déjà son module web généré.
 *
 * L'entrée peut être la dernière version du dépôt : module EJB, module web d'une génération précédente,
 * poms, README, docs/, sql/. Le module web précédent est écarté avant génération, le nouveau le remplace
 * entièrement, et tout le reste du dépôt est rendu à l'identique, octet pour octet.
 */
import fs from "fs/promises";
import os from "os";
import path from "path";

const SKIPPED_DIRS = new Set([".git", "target", "node_modules"]);

export interface RepositorySource {
  path: string;
  previousWeb: string | null;
  cleanup: () => Promise<void>;
}

/** Module web issu d'une génération précédente : `*-web` portant un descripteur d'endpoints. */
export async function findGeneratedWeb(repoDir: string): Promise<string | null> {
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(repoDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.toLowerCase().endsWith("-web")) continue;
    if (await isDirectory(path.join(repoDir, e.name, "src", "main", "resources", "descriptor"))) return e.name;
  }
  return null;
}

/** Entrée du générateur sans le module web précédent ; l'entrée elle-même si elle n'en porte pas. */
export async function withoutGeneratedWeb(inputPath: string): Promise<RepositorySource> {
  const previousWeb = await findGeneratedWeb(inputPath);
  if (!previousWeb) return { path: inputPath, previousWeb: null, cleanup: async () => {} };
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repo-input-"));
  const copy = path.join(tempRoot, path.basename(path.resolve(inputPath)));
  await copyTree(inputPath, copy, (rel) => rel === previousWeb);
  return { path: copy, previousWeb, cleanup: () => fs.rm(tempRoot, { recursive: true, force: true }) };
}

/**
 * Rend au projet généré les fichiers du dépôt d'entrée hors module web : docs/, sql/, .gitignore,
 * README.md... à l'octet près. Sur un dépôt sans module web, le pom racine et le pom EAR gardent la
 * version générée, qui déclare le nouveau module ; sur un dépôt qui l'a déjà, tout est repris tel quel.
 */
export async function keepRepositoryFiles(outputDir: string, inputPath: string): Promise<string[]> {
  const previousWeb = await findGeneratedWeb(inputPath);
  const outEntries = await fs.readdir(outputDir, { withFileTypes: true });
  const web = outEntries.find((e) => e.isDirectory() && e.name.toLowerCase().endsWith("-web"))?.name;
  const ear = outEntries.find((e) => e.isDirectory() && e.name.toLowerCase().endsWith("-ear"))?.name;
  const extendedPoms = previousWeb ? new Set<string>() : new Set(["pom.xml", ear ? `${ear}/pom.xml` : ""]);
  const copied: string[] = [];
  for (const rel of await listFiles(inputPath, "")) {
    const top = rel.split("/")[0];
    if (top === previousWeb || top === web) continue;
    const target = path.join(outputDir, rel);
    if (extendedPoms.has(rel) && (await exists(target))) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(inputPath, rel), target);
    copied.push(rel);
  }
  return copied;
}

export async function hasRepositoryReadme(inputPath: string): Promise<boolean> {
  return exists(path.join(inputPath, "README.md"));
}

async function listFiles(root: string, rel: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(path.join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!SKIPPED_DIRS.has(e.name)) out.push(...(await listFiles(root, child)));
    } else if (e.isFile()) {
      out.push(child);
    }
  }
  return out;
}

async function copyTree(src: string, dest: string, skip: (rel: string) => boolean, rel = ""): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (skip(child)) continue;
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) {
      if (!SKIPPED_DIRS.has(e.name)) await copyTree(from, to, skip, child);
    } else if (e.isFile()) {
      await fs.copyFile(from, to);
    }
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}
