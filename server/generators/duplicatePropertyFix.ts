/**
 * Post-traitement des DTO produits par le moteur : quand la classe source porte
 * deux champs qui ne diffèrent que par la casse (ex. fluxDoc et FluxDoc), le
 * moteur émet deux fois les mêmes accesseurs et le module web ne compile pas.
 * Dans chaque classe (imbriquées comprises), on conserve le premier champ et la
 * première occurrence de chaque méthode.
 */
import fs from "fs/promises";
import path from "path";
import { matchingClose } from "./javaSourceModel";

export async function fixDuplicateDtoProperties(outputDir: string): Promise<string[]> {
  const touched: string[] = [];
  for (const file of await collectDtoFiles(outputDir)) {
    const content = await fs.readFile(file, "utf-8");
    const patched = dedupeDto(content);
    if (patched !== content) {
      await fs.writeFile(file, patched, "utf-8");
      touched.push(file);
    }
  }
  return touched;
}

export function dedupeDto(content: string): string {
  const removals: { start: number; end: number }[] = [];
  const seen = new Map<number, Set<string>>();

  /** Position de l'accolade ouvrante de la classe qui contient `pos`. */
  const scopeOf = (pos: number): number => {
    const stack: number[] = [];
    for (let i = 0; i < pos; i++) {
      if (content[i] === "{") stack.push(i);
      else if (content[i] === "}") stack.pop();
    }
    return stack.length > 0 ? stack[stack.length - 1] : -1;
  };
  const isDuplicate = (scope: number, key: string): boolean => {
    const set = seen.get(scope) ?? new Set<string>();
    seen.set(scope, set);
    if (set.has(key)) return true;
    set.add(key);
    return false;
  };

  const fieldRe = /^[ \t]*private\s+(?!static)[\w.<>, ]+?\s+(\w+)\s*;[ \t]*\r?\n/gm;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(content)) !== null) {
    if (isDuplicate(scopeOf(m.index), `field:${m[1].toLowerCase()}`)) {
      removals.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  const methodRe = /public\s+[\w.<>, ]+\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
  while ((m = methodRe.exec(content)) !== null) {
    const params = m[2]
      .split(",")
      .map((p) => p.trim().split(/\s+/).slice(0, -1).join(" "))
      .join(",");
    const open = m.index + m[0].length - 1;
    const close = matchingClose(content, open);
    if (isDuplicate(scopeOf(m.index), `method:${m[1]}(${params})`)) {
      const lineStart = content.lastIndexOf("\n", m.index) + 1;
      let end = close + 1;
      while (content[end] === "\r" || content[end] === "\n") end++;
      removals.push({ start: lineStart, end });
    }
    methodRe.lastIndex = close + 1;
  }

  let out = content;
  for (const r of removals.sort((a, b) => b.start - a.start)) out = out.slice(0, r.start) + out.slice(r.end);
  return out;
}

async function collectDtoFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["target", "node_modules", ".git"].includes(entry.name)) continue;
      result.push(...(await collectDtoFiles(full)));
    } else if (/(Request|Response)\.java$/.test(entry.name) && full.includes(`${path.sep}dto${path.sep}`)) {
      result.push(full);
    }
  }
  return result;
}
