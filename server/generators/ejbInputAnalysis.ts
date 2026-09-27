/**
 * Analyse statique des paramètres d'entrée lus par un EJB historique, fonction par fonction.
 *
 * Le moteur ne relève que les lectures littérales faites dans le bloc de la fonction. Les EJB du
 * patrimoine lisent leurs paramètres par des constantes, des concaténations de constantes et des
 * méthodes utilitaires. Cette analyse :
 * - résout les constantes String du module (littéraux et concaténations) ;
 * - localise le bloc de chaque code fonction (case d'un switch, if sur equals, classe instanciée) ;
 * - suit les méthodes appelées depuis ce bloc, et les lectures communes du point d'aiguillage ;
 * - retient les chemins flux/... lus sur l'enveloppe d'entrée, hors action et fonction.
 * Les lectures indexées (liste parcourue par un compteur) sont rendues à part, non typées.
 */
import fs from "fs/promises";
import path from "path";

export interface FunctionInputs {
  /** Chemins relatifs au flux, segments séparés par "/" (ex. "numCompte", "ordonnateur/nom"). */
  paths: string[];
  /** Préfixes de listes lues par indice (ex. "fields/field"), non transmis. */
  lists: string[];
  /** L'enveloppe d'entrée est transmise telle quelle à un service aval, qui définit d'autres champs. */
  relay: boolean;
}

interface MethodBody {
  className: string;
  name: string;
  body: string;
}

interface Module {
  constants: Map<string, string>;
  methods: MethodBody[];
  byName: Map<string, MethodBody[]>;
  byClass: Map<string, MethodBody[]>;
  sources: string[];
}

const DISPATCH_KEYS = new Set(["action", "fonction"]);
const OUTPUT_RECEIVER = /(out|rep|resp|retour|result|sortie|send|sop|answer)/i;
const GENERIC_NAMES = new Set(["process", "execute", "toString", "equals", "hashCode", "valueOf", "getInstance", "run", "call", "main", "init", "get", "set"]);
const RELAY_CALL = /\b(?!EaiLog\b|Log\b|log\b|logger\b|LOG\b|Parser\b)\w+\s*\.\s*(?!info\b|debug\b|error\b|warn\b|trace\b)\w+\s*\([^;]*?\bParser\s*\.\s*marshall\s*\(\s*\w*(?:envIn|fluxInput|EnvelopeIn|envelope)\w*\s*\)/i;
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "new", "synchronized", "throw", "else", "try", "do", "super", "this"]);

export async function analyzeEjbInputs(ejbDir: string, codes: string[]): Promise<Map<string, FunctionInputs>> {
  const mod = await loadModule(ejbDir);
  const result = new Map<string, FunctionInputs>();
  const dispatchers = findDispatchers(mod, codes);
  for (const code of codes) {
    const reads = new Map<string, boolean>();
    const relay = { found: false };
    const blocks = findFunctionBlocks(mod, code);
    for (const block of blocks) collectReads(mod, block.text, reads, new Set<string>(), 0, false, relay);
    if (blocks.length > 0) {
      for (const d of dispatchers) collectReads(mod, d, reads, new Set<string>(), 0, true);
    }
    const paths: string[] = [];
    const lists: string[] = [];
    for (const [p, indexed] of reads) (indexed ? lists : paths).push(p);
    result.set(code, { paths: normalizePaths(paths), lists: [...new Set(lists)].sort(), relay: relay.found });
  }
  return result;
}

/** Retire un chemin qui est le parent d'un autre (le parent est un conteneur, pas une valeur). */
function normalizePaths(paths: string[]): string[] {
  const set = [...new Set(paths)].filter((p) => p.length > 0);
  return set.filter((p) => !set.some((q) => q !== p && q.toLowerCase().startsWith(p.toLowerCase() + "/"))).sort();
}

async function loadModule(ejbDir: string): Promise<Module> {
  const files = await javaFiles(ejbDir);
  const sources: string[] = [];
  for (const f of files) sources.push(stripComments(await fs.readFile(f, "latin1")));
  const raw = new Map<string, string>();
  for (const src of sources) {
    for (const m of src.matchAll(/\bString\s+(\w+)\s*=\s*([^;]+);/g)) {
      if (!raw.has(m[1])) raw.set(m[1], m[2].trim());
    }
  }
  const constants = new Map<string, string>();
  for (let pass = 0; pass < 6; pass++) {
    for (const [name, expr] of raw) {
      if (constants.has(name)) continue;
      const v = resolveExpr(expr, constants);
      if (v !== null && !v.indexed) constants.set(name, v.value);
    }
  }
  const methods: MethodBody[] = [];
  for (const src of sources) methods.push(...extractMethods(src));
  const byName = new Map<string, MethodBody[]>();
  const byClass = new Map<string, MethodBody[]>();
  for (const m of methods) {
    byName.set(m.name, [...(byName.get(m.name) ?? []), m]);
    byClass.set(m.className, [...(byClass.get(m.className) ?? []), m]);
  }
  return { constants, methods, byName, byClass, sources };
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

export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < src.length && src[j] !== q) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Valeur d'une expression String : littéraux et constantes concaténés. Un terme inconnu rend la suite indexée. */
export function resolveExpr(expr: string, constants: Map<string, string>): { value: string; indexed: boolean } | null {
  const terms = splitTopLevel(expr.trim(), "+");
  let value = "";
  for (let k = 0; k < terms.length; k++) {
    const t = terms[k].trim().replace(/^\((.*)\)$/s, "$1").trim();
    const lit = t.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (lit) {
      value += lit[1];
      continue;
    }
    const id = t.match(/^(?:[\w]+\.)*([A-Za-z_]\w*)$/);
    if (id && constants.has(id[1])) {
      value += constants.get(id[1]);
      continue;
    }
    if (k === 0) return null;
    return { value, indexed: true };
  }
  return { value, indexed: false };
}

function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === "\\") {
        cur += s[++i] ?? "";
      } else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === sep && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

function matchingClose(src: string, open: number, o = "{", c = "}"): number {
  let depth = 0;
  let inStr = false;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === o) depth++;
    else if (ch === c) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length - 1;
}

function extractMethods(src: string): MethodBody[] {
  const out: MethodBody[] = [];
  const classRe = /\b(?:class|enum)\s+(\w+)[^{;]*\{/g;
  const classes: { name: string; start: number; end: number }[] = [];
  for (const m of src.matchAll(classRe)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    classes.push({ name: m[1], start: open, end: matchingClose(src, open) });
  }
  const headerRe = /(?:^|[;{}\s])((?:public|private|protected|static|final|synchronized|\s)*[\w<>\[\],.?\s]+?\s+(\w+)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?:throws\s+[\w.,\s]+)?)\{/g;
  for (const m of src.matchAll(headerRe)) {
    const name = m[2];
    if (KEYWORDS.has(name)) continue;
    const open = (m.index ?? 0) + m[0].length - 1;
    const close = matchingClose(src, open);
    const owner = classes.filter((c) => c.start < open && c.end > open).sort((a, b) => b.start - a.start)[0];
    out.push({ className: owner?.name ?? "", name, body: src.slice(open + 1, close) });
  }
  return out;
}

interface Block {
  text: string;
}

/** Blocs qui traitent un code fonction : case d'un switch, branche d'un if sur equals, classe dédiée instanciée. */
function findFunctionBlocks(mod: Module, code: string, seen: Set<string> = new Set()): Block[] {
  if (seen.has(code)) return [];
  seen.add(code);
  const blocks = directBlocks(mod, code);
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const aliases = new Set<string>();
  for (const src of mod.sources) {
    for (const m of src.matchAll(new RegExp(`\\b([A-Z][A-Z0-9_]*)\\s*\\(\\s*"${esc}"\\s*[,)]`, "g"))) aliases.add(m[1]);
  }
  for (const b of blocks) {
    const ret = b.text.match(/^\s*return\s+(?:\w+\.)*([A-Z][A-Z0-9_]+)\s*;\s*$/);
    if (ret) aliases.add(ret[1]);
  }
  for (const a of aliases) if (a !== code) blocks.push(...findFunctionBlocks(mod, a, seen));
  for (const src of mod.sources) {
    const handlerRe = new RegExp(`(?:\\w+\\.)?\\b${esc}\\s*,\\s*(?:(\\w+)\\s*::\\s*new|new\\s+(\\w+)\\s*\\()`, "g");
    for (const m of src.matchAll(handlerRe)) {
      const bodies = mod.byClass.get(m[1] ?? m[2]);
      if (bodies) blocks.push({ text: bodies.map((b) => b.body).join("\n") });
    }
  }
  return blocks;
}

function directBlocks(mod: Module, code: string): Block[] {
  const blocks: Block[] = [];
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const src of mod.sources) {
    const caseRe = new RegExp(`case\\s+(?:[\\w]+\\.)*(?:${esc}|"${esc}")\\s*:`, "gi");
    for (const m of src.matchAll(caseRe)) {
      blocks.push({ text: caseBlock(src, (m.index ?? 0) + m[0].length) });
    }
    const eqRe = new RegExp(`(?:"${esc}"\\s*\\.\\s*equals(?:IgnoreCase)?\\s*\\(|\\.\\s*equals(?:IgnoreCase)?\\s*\\(\\s*"${esc}"\\s*\\)|==\\s*(?:\\w+\\.)*${esc}\\b)`, "gi");
    for (const m of src.matchAll(eqRe)) {
      const from = (m.index ?? 0) + m[0].length;
      const open = src.indexOf("{", from);
      const semi = src.indexOf(";", from);
      if (open < 0 || (semi >= 0 && semi < open && !/\)\s*$/.test(src.slice(from, semi)))) continue;
      blocks.push({ text: src.slice(open + 1, matchingClose(src, open)) });
    }
  }
  return blocks;
}

/** Texte d'un case jusqu'au case ou default suivant de même niveau, ou la fin du switch. */
function caseBlock(src: string, from: number): string {
  let depth = 0;
  let inStr = false;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      if (depth === 0) return src.slice(from, i);
      depth--;
    } else if (depth === 0 && /^(case\s|default\s*:)/.test(src.slice(i, i + 9)) && /\W/.test(src[i - 1] ?? " ")) {
      if (src.slice(from, i).trim() === "") {
        const colon = src.indexOf(":", i);
        if (colon > 0) {
          from = colon + 1;
          i = colon;
          continue;
        }
      }
      return src.slice(from, i);
    }
  }
  return src.slice(from);
}

/**
 * Méthodes qui aiguillent : celles qui contiennent le switch ou les if des codes fonction, et process().
 * Leurs lectures hors des blocs de fonction sont communes à toutes les fonctions.
 */
function findDispatchers(mod: Module, codes: string[]): string[] {
  const known = codes.map((c) => c.toLowerCase());
  const scored = mod.methods.map((m) => {
    const lower = m.body.toLowerCase();
    return { m, hits: known.filter((c) => lower.includes(c)).length };
  });
  const max = Math.max(0, ...scored.map((x) => x.hits));
  const threshold = Math.max(Math.min(2, known.length), Math.ceil(max * 0.6));
  const out: string[] = [];
  for (const { m, hits } of scored) {
    const dispatcher = hits >= threshold && /\bswitch\s*\(|equals/.test(m.body);
    if (dispatcher || (m.name === "process" && /getNode/.test(m.body))) {
      out.push(stripFunctionBlocks(m.body, codes));
    }
  }
  return out;
}

function stripFunctionBlocks(body: string, codes: string[]): string {
  let out = body;
  const sw = out.search(/\bswitch\s*\(/);
  if (sw >= 0) {
    const open = out.indexOf("{", sw);
    const close = matchingClose(out, open);
    out = out.slice(0, sw) + out.slice(close + 1);
  }
  for (const code of codes) {
    const esc = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:"${esc}"\\s*\\.\\s*equals(?:IgnoreCase)?\\s*\\(|\\.\\s*equals(?:IgnoreCase)?\\s*\\(\\s*"${esc}"\\s*\\))`, "i");
    let m: RegExpMatchArray | null;
    let guard = 0;
    while ((m = out.match(re)) && guard++ < 50) {
      const open = out.indexOf("{", m.index ?? 0);
      if (open < 0) break;
      const close = matchingClose(out, open);
      out = out.slice(0, m.index) + out.slice(close + 1);
    }
  }
  return out;
}

function collectReads(
  mod: Module,
  text: string,
  reads: Map<string, boolean>,
  visited: Set<string>,
  depth: number,
  noFollow = false,
  relay: { found: boolean } = { found: false }
): void {
  if (depth <= 1 && RELAY_CALL.test(text)) relay.found = true;
  const readRe = /(\w+)\s*\.\s*getNode(?:AsString|AsInt|AsInteger|AsLong|AsDouble|AsBoolean|AsList)?\s*\(/g;
  for (const m of text.matchAll(readRe)) {
    if (OUTPUT_RECEIVER.test(m[1])) continue;
    const open = (m.index ?? 0) + m[0].length - 1;
    const close = matchingClose(text, open, "(", ")");
    const arg = splitTopLevel(text.slice(open + 1, close), ",")[0];
    const v = resolveExpr(arg, mod.constants);
    if (!v) continue;
    const segs = v.value.split("/").filter((s) => s.length > 0);
    if (segs.length < 2 || segs[0].toLowerCase() !== "flux") continue;
    const rel = segs.slice(1).map((s) => s.replace(/,.*$/, ""));
    if (DISPATCH_KEYS.has(rel[0].toLowerCase())) continue;
    if (!rel.every((s) => /^[A-Za-z_][\w.-]*$/.test(s))) continue;
    const indexed = v.indexed || /,/.test(v.value);
    const key = rel.join("/");
    if (!indexed) reads.set(key, false);
    else if (!reads.has(key)) reads.set(key, true);
  }
  if (noFollow || depth > 6) return;
  const follow = (body: string) => collectReads(mod, body, reads, visited, depth + 1, false, relay);
  for (const m of text.matchAll(/\bnew\s+(\w+)\s*\(/g)) {
    const bodies = mod.byClass.get(m[1]);
    if (!bodies || visited.has("class:" + m[1])) continue;
    visited.add("class:" + m[1]);
    for (const b of bodies) follow(b.body);
  }
  for (const m of text.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
    const name = m[1];
    if (KEYWORDS.has(name) || GENERIC_NAMES.has(name) || visited.has(name)) continue;
    const bodies = mod.byName.get(name);
    if (!bodies) continue;
    const classes = new Set(bodies.map((b) => b.className));
    if (classes.size > 3) continue;
    visited.add(name);
    for (const b of bodies) follow(b.body);
  }
}
