/**
 * Résolution et validation du binaire java utilisé par le moteur de génération Adapter.
 * Ordre de priorité : jdkHome fourni par la requête > GENERATOR_JAVA_HOME (.env) > java du PATH.
 */
import { spawn } from "child_process";
import path from "path";
import { existsSync, statSync } from "fs";

export const MIN_JAVA_MAJOR = 17;

export interface ResolvedJava {
  javaBin: string;
  source: "request" | "env" | "path";
}

export interface JavaVersionInfo {
  ok: boolean;
  version: string | null;
  major: number | null;
  atLeast17: boolean;
  raw: string;
}

const JAVA_EXE = process.platform === "win32" ? "java.exe" : "java";

/**
 * Construit le chemin du binaire java à partir d'un JDK_HOME et vérifie son existence.
 * Accepte aussi un chemin pointant directement sur l'exécutable java.
 */
function javaBinFromHome(jdkHome: string): string {
  const trimmed = jdkHome.trim();
  const base = path.basename(trimmed).toLowerCase();
  if (base === "java" || base === "java.exe") {
    if (existsSync(trimmed) && statSync(trimmed).isFile()) return trimmed;
    throw new Error(`Binaire java introuvable : ${trimmed}`);
  }
  const candidate = path.join(trimmed, "bin", JAVA_EXE);
  if (!existsSync(candidate)) {
    throw new Error(`Binaire java introuvable : ${candidate}`);
  }
  return candidate;
}

/**
 * Résout le binaire java selon l'ordre de priorité. Lève une erreur lisible si un
 * chemin explicite (requête ou variable d'environnement) est invalide.
 */
export function resolveJavaBinary(jdkHome?: string): ResolvedJava {
  if (jdkHome && jdkHome.trim()) {
    return { javaBin: javaBinFromHome(jdkHome), source: "request" };
  }
  const envHome = process.env.GENERATOR_JAVA_HOME;
  if (envHome && envHome.trim()) {
    return { javaBin: javaBinFromHome(envHome), source: "env" };
  }
  return { javaBin: "java", source: "path" };
}

/**
 * Extrait la version majeure d'une chaîne de version java (1.8.0_292 -> 8, 21.0.11 -> 21).
 */
export function parseMajorVersion(version: string): number | null {
  const match = version.match(/(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  const first = parseInt(match[1], 10);
  if (first === 1 && match[2] !== undefined) return parseInt(match[2], 10);
  return first;
}

/**
 * Exécute `<javaBin> -version` et renvoie la version détectée.
 */
export function detectJavaVersion(javaBin: string): Promise<JavaVersionInfo> {
  return new Promise((resolve) => {
    let output = "";
    let started = false;

    const proc = spawn(javaBin, ["-version"]);
    started = true;

    proc.stdout.on("data", (d) => (output += d.toString()));
    proc.stderr.on("data", (d) => (output += d.toString()));

    proc.on("error", () => {
      resolve({ ok: false, version: null, major: null, atLeast17: false, raw: output });
    });

    proc.on("close", (code) => {
      const match = output.match(/version\s+"([^"]+)"/i);
      const version = match ? match[1] : null;
      const major = version ? parseMajorVersion(version) : null;
      const ok = started && code === 0 && version !== null;
      resolve({
        ok,
        version,
        major,
        atLeast17: major !== null && major >= MIN_JAVA_MAJOR,
        raw: output.trim(),
      });
    });
  });
}
