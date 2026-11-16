/**
 * Casse de la valeur d'aiguillage écrite par les convertisseurs des EJB historiques.
 *
 * Le moteur écrit dans <action> le nom de la constante d'enum, en majuscules. Un EJB dont
 * l'aiguillage passe par valueOf(...toUpperCase()) accepte cette valeur, mais certains comparent
 * ensuite la même balise exactement à la casse du canal d'origine ("confirmImpayes".equals(...)).
 * Le bloc qui suit cette comparaison ne s'exécute alors jamais.
 *
 * Ce correctif écrit dans le convertisseur la valeur comparée exactement par l'EJB, à trois
 * conditions : l'aiguillage met la valeur lue en majuscules, la comparaison porte sur la balise
 * d'aiguillage, et une seule casse est comparée pour ce code.
 */
import fs from "fs/promises";
import path from "path";
import { stripComments } from "./ejbInputAnalysis";

const DISPATCH_TAGS = ["action", "FONCTION", "fonction"];
const DISPATCH_ARG = /(action|fonction)/i;

export interface ActionCaseReport {
  replaced: { file: string; from: string; to: string }[];
}

/** Valeurs comparées exactement à la balise d'aiguillage, indexées par leur forme en majuscules. */
export function exactDispatchLiterals(sources: string[]): Map<string, string> {
  const tolerant = sources.some((s) =>
    /valueOf\s*\([^;]*getNodeAsString\s*\([^;]*\)[^;]*\.\s*toUpperCase\s*\(\s*\)/.test(s)
  );
  const out = new Map<string, string>();
  if (!tolerant) return out;
  const seen = new Map<string, Set<string>>();
  const add = (arg: string, lit: string) => {
    if (!DISPATCH_ARG.test(arg)) return;
    const key = lit.toUpperCase();
    seen.set(key, (seen.get(key) ?? new Set()).add(lit));
  };
  for (const s of sources) {
    for (const m of s.matchAll(/"(\w+)"\s*\.\s*equals\s*\(\s*\w+\s*\.\s*getNodeAsString\s*\(\s*([\w."/]+)\s*\)\s*\)/g)) add(m[2], m[1]);
    for (const m of s.matchAll(/getNodeAsString\s*\(\s*([\w."/]+)\s*\)\s*\.\s*equals\s*\(\s*"(\w+)"\s*\)/g)) add(m[1], m[2]);
  }
  for (const [key, lits] of seen) {
    if (lits.size === 1) {
      const lit = [...lits][0];
      if (lit !== key) out.set(key, lit);
    }
  }
  return out;
}

export function patchConverterSource(content: string, literals: Map<string, string>): { text: string; replaced: { from: string; to: string }[] } {
  const replaced: { from: string; to: string }[] = [];
  let text = content;
  for (const tag of DISPATCH_TAGS) {
    text = text.replace(new RegExp(`<${tag}>(\\w+)</${tag}>`, "g"), (all, value: string) => {
      const lit = literals.get(value);
      if (!lit || value !== lit.toUpperCase()) return all;
      replaced.push({ from: value, to: lit });
      return `<${tag}>${lit}</${tag}>`;
    });
  }
  return { text, replaced };
}

export async function fixActionCase(outputDir: string): Promise<ActionCaseReport> {
  const report: ActionCaseReport = { replaced: [] };
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const webName = entries.find((e) => e.isDirectory() && e.name.toLowerCase().endsWith("-web"))?.name;
  const ejbName = entries.find((e) => e.isDirectory() && e.name.toLowerCase().endsWith("-ejb"))?.name;
  if (!webName || !ejbName) return report;
  const sources: string[] = [];
  for (const f of await javaFiles(path.join(outputDir, ejbName))) sources.push(stripComments(await fs.readFile(f, "latin1")));
  const literals = exactDispatchLiterals(sources);
  if (literals.size === 0) return report;
  for (const f of await javaFiles(path.join(outputDir, webName))) {
    if (!f.endsWith("Converter.java")) continue;
    const content = await fs.readFile(f, "utf-8");
    const { text, replaced } = patchConverterSource(content, literals);
    if (text === content) continue;
    await fs.writeFile(f, text, "utf-8");
    for (const r of replaced) report.replaced.push({ file: f, ...r });
  }
  return report;
}

async function javaFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "target" || e.name === "test") continue;
      out.push(...(await javaFiles(full)));
    } else if (e.name.endsWith(".java")) {
      out.push(full);
    }
  }
  return out;
}
