/**
 * Retire du module web le code qui n'est jamais exécuté.
 *
 * Le moteur émet, dans chaque méthode de Resource, une conversion de la réponse en
 * DTO (`XxxResponse response = converter.fromXxxEnvelope(envelopeOut);`) dont le
 * résultat n'est pas utilisé : la réponse HTTP est `EnvelopeJson.toJson(envelopeOut)`.
 * Une fois cet appel retiré, les méthodes `fromXxxEnvelope` des converters et les
 * accesseurs typés d'`EnvelopeJson` ne sont plus appelés nulle part.
 *
 * Ce post-traitement retire l'appel, puis, dans les converters et `EnvelopeJson`,
 * toute méthode qui n'est plus référencée dans le module web, puis les imports
 * devenus inutiles. Les DTO de réponse sont conservés : le descripteur d'endpoints
 * en tire les champs de sortie.
 */
import fs from "fs/promises";
import path from "path";

const DEAD_CALL =
  /^[ \t]*(?:\/\/[^\n]*Convertir la r[ée]ponse Envelope en DTO JSON[^\n]*\r?\n)?[ \t]*\w+(?:\.\w+)*\s+\w+\s*=\s*converter\.from\w+Envelope\(\s*envelopeOut\s*\);[ \t]*\r?\n/gm;

export interface DeadCodeReport {
  resources: number;
  removedMethods: string[];
}

export async function removeDeadResponseMapping(outputDir: string): Promise<DeadCodeReport> {
  const report: DeadCodeReport = { resources: 0, removedMethods: [] };
  const javaFiles = (await collectJava(outputDir)).filter((f) => /-web[\\/]src[\\/]main[\\/]java[\\/]/.test(f));
  const sources = new Map<string, string>();
  for (const f of javaFiles) sources.set(f, await fs.readFile(f, "utf-8"));

  for (const [f, src] of sources) {
    if (!f.endsWith("Resource.java")) continue;
    const out = src.replace(DEAD_CALL, "");
    if (out !== src) {
      sources.set(f, out);
      report.resources++;
    }
  }

  const prunable = [...sources.keys()].filter((f) => /[\\/]converter[\\/]\w+\.java$/.test(f));
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of prunable) {
      const src = sources.get(f)!;
      const className = path.basename(f, ".java");
      for (const m of listMethods(src)) {
        if (m.name === className) continue;
        if (isReferenced(m.name, f, m, sources, className)) continue;
        const updated = src.slice(0, m.start) + src.slice(m.end);
        sources.set(f, updated);
        report.removedMethods.push(`${className}.${m.name}`);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }

  for (const f of prunable) {
    const { src, removed } = removeUnreachablePrivate(sources.get(f)!);
    sources.set(f, removeUnusedImports(src));
    for (const r of removed) report.removedMethods.push(`${path.basename(f, ".java")}.${r}`);
  }

  for (const [f, src] of sources) {
    if (src !== (await fs.readFile(f, "utf-8"))) await fs.writeFile(f, src, "utf-8");
  }
  return report;
}

interface MethodSpan {
  name: string;
  start: number;
  end: number;
  isPrivate: boolean;
}

export function listMethods(src: string): MethodSpan[] {
  const spans: MethodSpan[] = [];
  const re = /^([ \t]*)((?:public|private|protected|static|final|synchronized|\s)+)(?:<[^>]+>\s+)?[\w.<>\[\], ?]+?\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w., ]+)?\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[3];
    if (["if", "for", "while", "switch", "catch", "return", "new"].includes(name)) continue;
    const open = m.index + m[0].length - 1;
    const close = matchingBrace(src, open);
    if (close < 0) continue;
    let start = m.index;
    const before = src.slice(0, start);
    const doc = before.match(/[ \t]*\/\*\*(?:(?!\*\/)[\s\S])*\*\/[ \t]*\r?\n$/);
    if (doc) start -= doc[0].length;
    const lead = src.slice(0, start).match(/(\r?\n)[ \t]*\r?\n$/);
    if (lead) start -= lead[0].length - lead[1].length;
    let end = close + 1;
    const trail = src.slice(end).match(/^[ \t]*\r?\n/);
    if (trail) end += trail[0].length;
    spans.push({ name, start, end, isPrivate: /\bprivate\b/.test(m[2]) });
    re.lastIndex = close + 1;
  }
  return spans;
}

function isReferenced(
  name: string,
  file: string,
  span: MethodSpan,
  sources: Map<string, string>,
  className: string
): boolean {
  const call = new RegExp(`\\b${name}\\s*\\(`);
  const own = sources.get(file)!;
  const ownRest = own.slice(0, span.start) + own.slice(span.end);
  if (call.test(ownRest)) return true;
  if (span.isPrivate) return false;
  const qualified = new RegExp(`\\b(?:${className}|converter|\\w*[Cc]onverter)\\s*\\.\\s*${name}\\s*\\(`);
  for (const [f, src] of sources) {
    if (f === file) continue;
    if (qualified.test(src) || (call.test(src) && src.includes(className))) return true;
  }
  return false;
}

/**
 * Retire les méthodes privées qu'aucune méthode non privée n'atteint, même par une
 * chaîne d'appels : deux méthodes privées qui ne s'appellent qu'entre elles sont retirées.
 */
export function removeUnreachablePrivate(src: string): { src: string; removed: string[] } {
  const methods = listMethods(src);
  const body = new Map(methods.map((m) => [m, src.slice(m.start, m.end)]));
  const privates = methods.filter((m) => m.isPrivate);
  const reached = new Set<MethodSpan>();
  const queue = methods.filter((m) => !m.isPrivate);
  const outside = methods.reduce((s, m) => s.split(body.get(m)!).join(""), src);
  for (const p of privates) if (new RegExp(`\\b${p.name}\\s*\\(`).test(outside)) queue.push(p);
  while (queue.length) {
    const m = queue.pop()!;
    if (reached.has(m)) continue;
    reached.add(m);
    for (const p of privates) if (!reached.has(p) && p !== m && new RegExp(`\\b${p.name}\\s*\\(`).test(body.get(m)!)) queue.push(p);
  }
  const dead = privates.filter((p) => !reached.has(p)).sort((a, b) => b.start - a.start);
  let out = src;
  for (const d of dead) out = out.slice(0, d.start) + out.slice(d.end);
  return { src: out, removed: dead.map((d) => d.name) };
}

export function removeUnusedImports(src: string): string {
  return src.replace(/^import\s+(static\s+)?([\w.]+)\.(\w+|\*)\s*;[ \t]*\r?\n/gm, (line, _s, _pkg, simple) => {
    if (simple === "*") return line;
    const body = src.replace(/^import[^\n]*\n/gm, "");
    return new RegExp(`\\b${simple}\\b`).test(body) ? line : "";
  });
}

function matchingBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? src.length : e + 1;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

async function collectJava(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "target" || e.name === "node_modules") continue;
      out.push(...(await collectJava(p)));
    } else if (e.isFile() && e.name.endsWith(".java")) out.push(p);
  }
  return out;
}
