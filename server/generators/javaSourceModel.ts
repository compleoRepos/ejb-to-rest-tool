/**
 * Modèle minimal des sources Java d'un projet EJB, suffisant pour relire les
 * classes use case du framework eai-fwk-ejb, leurs VoIn et le mapping JAXB de
 * ces VoIn : types (y compris imbriqués), champs, méthodes et annotations.
 *
 * Ce n'est pas un compilateur : il ne résout que ce qui est présent dans les
 * sources fournies, et renvoie null pour tout le reste.
 */
import fs from "fs/promises";
import path from "path";

export interface JavaAnnotation {
  name: string;
  args: string;
}

export interface JavaField {
  name: string;
  type: string;
  modifiers: string[];
  annotations: JavaAnnotation[];
  initializer: string | null;
}

export interface JavaParam {
  name: string;
  type: string;
}

export interface JavaMethod {
  name: string;
  returnType: string;
  params: JavaParam[];
  modifiers: string[];
  annotations: JavaAnnotation[];
  body: string;
}

export interface JavaType {
  name: string;
  kind: "class" | "interface" | "enum" | "annotation";
  pkg: string;
  fqcn: string;
  imports: string[];
  annotations: JavaAnnotation[];
  modifiers: string[];
  superclass: string | null;
  interfaces: string[];
  fields: JavaField[];
  methods: JavaMethod[];
  nested: JavaType[];
  outer: JavaType | null;
  file: string;
}

export class JavaSourceIndex {
  readonly types: JavaType[] = [];
  private readonly byFqcn = new Map<string, JavaType>();
  private readonly bySimple = new Map<string, JavaType[]>();

  add(type: JavaType): void {
    if (this.byFqcn.has(type.fqcn)) return;
    this.types.push(type);
    this.byFqcn.set(type.fqcn, type);
    const list = this.bySimple.get(type.name) ?? [];
    list.push(type);
    this.bySimple.set(type.name, list);
    for (const n of type.nested) this.add(n);
  }

  get(fqcn: string): JavaType | null {
    return this.byFqcn.get(fqcn) ?? null;
  }

  /**
   * Résout un nom de type tel qu'écrit dans le contexte d'une classe : type
   * imbriqué, import explicite, même package, import générique, puis nom simple
   * unique dans l'index.
   */
  resolve(typeName: string, context: JavaType | null): JavaType | null {
    const name = typeName.replace(/<.*>$/, "").trim();
    if (!name) return null;
    const direct = this.byFqcn.get(name);
    if (direct) return direct;

    const [head, ...rest] = name.split(".");
    const resolveHead = (): JavaType | null => {
      if (!context) return null;
      for (let t: JavaType | null = context; t; t = t.outer) {
        if (t.name === head) return t;
        const n = t.nested.find((x) => x.name === head);
        if (n) return n;
      }
      const top = topLevel(context);
      const imp = top.imports.find((i) => i.endsWith(`.${head}`) && !i.startsWith("static "));
      if (imp) {
        const t = this.byFqcn.get(imp);
        if (t) return t;
      }
      const samePkg = this.byFqcn.get(top.pkg ? `${top.pkg}.${head}` : head);
      if (samePkg) return samePkg;
      for (const i of top.imports) {
        if (!i.endsWith(".*") || i.startsWith("static ")) continue;
        const t = this.byFqcn.get(`${i.slice(0, -2)}.${head}`);
        if (t) return t;
      }
      return null;
    };

    let current = resolveHead();
    if (!current) {
      const candidates = this.bySimple.get(head) ?? [];
      current = candidates.length === 1 ? candidates[0] : null;
    }
    for (const part of rest) {
      if (!current) return null;
      current = current.nested.find((x) => x.name === part) ?? null;
    }
    return current;
  }

  /** Vrai si le type (ou un de ses ancêtres connus) étend ou implémente `simpleName`. */
  inherits(type: JavaType, simpleName: string, seen = new Set<string>()): boolean {
    if (seen.has(type.fqcn)) return false;
    seen.add(type.fqcn);
    const parents = [type.superclass, ...type.interfaces].filter((x): x is string => !!x);
    for (const p of parents) {
      const raw = p.replace(/<.*>$/, "").trim();
      if (raw === simpleName || raw.endsWith(`.${simpleName}`)) return true;
      const resolved = this.resolve(raw, type);
      if (resolved && this.inherits(resolved, simpleName, seen)) return true;
    }
    return false;
  }
}

function topLevel(type: JavaType): JavaType {
  let t = type;
  while (t.outer) t = t.outer;
  return t;
}

/** Charge dans un index toutes les sources Java des répertoires donnés (hors target et tests). */
export async function loadJavaSources(roots: string[]): Promise<JavaSourceIndex> {
  const index = new JavaSourceIndex();
  const seen = new Set<string>();
  for (const root of roots) {
    if (!root) continue;
    for (const file of await collectSources(root)) {
      const key = path.resolve(file).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let content: string;
      try {
        content = decodeSource(await fs.readFile(file));
      } catch {
        continue;
      }
      try {
        for (const t of parseJavaFile(content, file)) index.add(t);
      } catch {
        // Un fichier illisible par le modèle n'empêche pas l'analyse des autres.
      }
    }
  }
  return index;
}

/** Décode une source en UTF-8 si elle est valide, sinon en ISO-8859-1 (encodage historique des projets). */
export function decodeSource(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return bytes.toString("latin1");
  }
}

async function collectSources(dir: string): Promise<string[]> {
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
      if (["target", "node_modules", ".git", "test"].includes(entry.name)) continue;
      result.push(...(await collectSources(full)));
    } else if (entry.name.endsWith(".java")) {
      result.push(full);
    }
  }
  return result;
}

const MODIFIERS = new Set([
  "public", "private", "protected", "static", "final", "transient", "volatile",
  "abstract", "synchronized", "native", "default", "strictfp", "sealed", "non-sealed",
]);

/** Retire les commentaires en conservant les littéraux chaîne et caractère. */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      out += " ";
      continue;
    }
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = skipLiteral(src, i);
      out += src.slice(i, end);
      i = end;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function skipLiteral(src: string, start: number): number {
  const quote = src[start];
  if (quote === '"' && src.startsWith('"""', start)) {
    const end = src.indexOf('"""', start + 3);
    return end < 0 ? src.length : end + 3;
  }
  let i = start + 1;
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
      continue;
    }
    if (src[i] === quote) return i + 1;
    if (src[i] === "\n") return i;
    i++;
  }
  return i;
}

/** Index du caractère fermant correspondant à l'ouvrant situé en `open`. */
export function matchingClose(src: string, open: number): number {
  const o = src[open];
  const c = o === "{" ? "}" : o === "(" ? ")" : o === "<" ? ">" : "]";
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      i = skipLiteral(src, i);
      continue;
    }
    if (ch === o) depth++;
    else if (ch === c) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return src.length - 1;
}

/** Découpe sur les virgules de premier niveau (hors <>, (), {}, [] et littéraux). */
export function splitTopLevel(src: string, sep = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const end = skipLiteral(src, i);
      cur += src.slice(i, end);
      i = end;
      continue;
    }
    if ("<({[".includes(ch)) depth++;
    else if (">)}]".includes(ch)) depth--;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
    i++;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseJavaFile(content: string, file: string): JavaType[] {
  const src = stripComments(content);
  const root: JavaType = emptyType("", "", file);
  const ctx = { pkg: "", imports: [] as string[] };
  parseBody(src, 0, src.length, root, ctx, file, true);
  for (const t of root.nested) t.outer = null;
  return root.nested;
}

function emptyType(name: string, pkg: string, file: string): JavaType {
  return {
    name,
    kind: "class",
    pkg,
    fqcn: name,
    imports: [],
    annotations: [],
    modifiers: [],
    superclass: null,
    interfaces: [],
    fields: [],
    methods: [],
    nested: [],
    outer: null,
    file,
  };
}

function parseBody(
  src: string,
  start: number,
  end: number,
  owner: JavaType,
  ctx: { pkg: string; imports: string[] },
  file: string,
  isFileRoot: boolean
): void {
  let buf = "";
  let paren = 0;
  let i = start;
  let skipUntilSemicolon = false;
  while (i < end) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const e = skipLiteral(src, i);
      buf += src.slice(i, e);
      i = e;
      continue;
    }
    if (ch === "(") paren++;
    if (ch === ")") paren--;
    if (ch === "{" && paren === 0) {
      const close = matchingClose(src, i);
      const decl = buf.trim();
      if (skipUntilSemicolon || indexOfTopLevel(splitHeader(decl).rest, "=") >= 0) {
        // Initialiseur de champ avec accolades (tableau, classe anonyme) : le champ se termine au ';'.
        buf += src.slice(i, close + 1);
        skipUntilSemicolon = true;
        i = close + 1;
        continue;
      }
      handleBlockDecl(decl, src.slice(i + 1, close), owner, ctx, file);
      buf = "";
      i = close + 1;
      continue;
    }
    if (ch === ";" && paren === 0) {
      handleSimpleDecl(buf.trim(), owner, ctx, isFileRoot);
      buf = "";
      skipUntilSemicolon = false;
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
}

/** Sépare les annotations de tête du reste d'une déclaration. */
export function stripAnnotations(decl: string): { annotations: JavaAnnotation[]; rest: string } {
  const annotations: JavaAnnotation[] = [];
  let s = decl.trim();
  for (;;) {
    const m = s.match(/^@\s*([\w.]+)\s*/);
    if (!m || m[1] === "interface") break;
    let rest = s.slice(m[0].length);
    let args = "";
    if (rest.startsWith("(")) {
      const close = matchingClose(rest, 0);
      args = rest.slice(1, close);
      rest = rest.slice(close + 1);
    }
    annotations.push({ name: m[1].split(".").pop()!, args: args.trim() });
    s = rest.trim();
  }
  return { annotations, rest: s };
}

function takeModifiers(s: string): { modifiers: string[]; rest: string } {
  const modifiers: string[] = [];
  let rest = s.trim();
  for (;;) {
    const m = rest.match(/^([\w-]+)\s+/);
    if (!m || !MODIFIERS.has(m[1])) break;
    modifiers.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  return { modifiers, rest };
}

/** Annotations et modificateurs peuvent s'entrelacer : on les consomme alternativement. */
function splitHeader(decl: string): { annotations: JavaAnnotation[]; modifiers: string[]; rest: string } {
  const annotations: JavaAnnotation[] = [];
  const modifiers: string[] = [];
  let rest = decl.trim();
  for (;;) {
    const a = stripAnnotations(rest);
    const m = takeModifiers(a.rest);
    annotations.push(...a.annotations);
    modifiers.push(...m.modifiers);
    if (a.annotations.length === 0 && m.modifiers.length === 0) break;
    rest = m.rest;
  }
  return { annotations, modifiers, rest };
}

function handleSimpleDecl(decl: string, owner: JavaType, ctx: { pkg: string; imports: string[] }, isFileRoot: boolean): void {
  if (!decl) return;
  if (isFileRoot) {
    const pkg = decl.match(/^package\s+([\w.]+)$/);
    if (pkg) {
      ctx.pkg = pkg[1];
      return;
    }
    const imp = decl.match(/^import\s+(static\s+)?([\w.*]+)$/);
    if (imp) {
      ctx.imports.push((imp[1] ? "static " : "") + imp[2]);
      return;
    }
    return;
  }
  if (owner.kind === "enum" || owner.kind === "annotation") return;
  const { annotations, modifiers, rest } = splitHeader(decl);
  if (/\(/.test(rest.replace(/=[\s\S]*$/, ""))) {
    const method = parseMethodHeader(rest, annotations, modifiers, "");
    if (method) owner.methods.push(method);
    return;
  }
  owner.fields.push(...parseFieldDecl(rest, annotations, modifiers));
}

function handleBlockDecl(
  decl: string,
  body: string,
  owner: JavaType,
  ctx: { pkg: string; imports: string[] },
  file: string
): void {
  const { annotations, modifiers, rest } = splitHeader(decl);
  const typeMatch = rest.match(/^(class|interface|enum|@\s*interface|record)\s+(\w+)([\s\S]*)$/);
  if (typeMatch) {
    const kindRaw = typeMatch[1].replace(/\s+/g, "");
    const kind = kindRaw === "@interface" ? "annotation" : kindRaw === "record" ? "class" : (kindRaw as JavaType["kind"]);
    const name = typeMatch[2];
    const header = typeMatch[3];
    const isRoot = owner.name === "";
    const t = emptyType(name, ctx.pkg, file);
    t.kind = kind;
    t.annotations = annotations;
    t.modifiers = modifiers;
    t.imports = isRoot ? [...ctx.imports] : [];
    t.outer = isRoot ? null : owner;
    t.fqcn = isRoot ? (ctx.pkg ? `${ctx.pkg}.${name}` : name) : `${owner.fqcn}.${name}`;
    const ext = header.match(/\bextends\s+([\w.<>,\s?]+?)(?=\bimplements\b|$)/);
    const impl = header.match(/\bimplements\s+([\w.<>,\s?]+)$/);
    if (kind === "interface") {
      t.interfaces = ext ? splitTopLevel(ext[1]).map((x) => x.trim()).filter(Boolean) : [];
    } else {
      t.superclass = ext ? ext[1].trim() : null;
      t.interfaces = impl ? splitTopLevel(impl[1]).map((x) => x.trim()).filter(Boolean) : [];
    }
    if (kind === "enum") {
      // Les constantes précèdent le premier ';' de niveau zéro : seuls les membres suivants nous intéressent.
      const semi = findTopLevelSemicolon(body);
      if (semi >= 0) parseBody(body, semi + 1, body.length, t, ctx, file, false);
    } else {
      parseBody(body, 0, body.length, t, ctx, file, false);
    }
    owner.nested.push(t);
    return;
  }
  if (owner.name === "" || owner.kind === "annotation") return;
  if (/^(static\s*)?$/.test(rest)) return;
  if (!/\(/.test(rest)) return;
  const method = parseMethodHeader(rest, annotations, modifiers, body);
  if (method) owner.methods.push(method);
}

function findTopLevelSemicolon(src: string): number {
  let depth = 0;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      i = skipLiteral(src, i);
      continue;
    }
    if ("({[".includes(ch)) depth++;
    else if (")}]".includes(ch)) depth--;
    else if (ch === ";" && depth === 0) return i;
    i++;
  }
  return -1;
}

function parseMethodHeader(
  rest: string,
  annotations: JavaAnnotation[],
  modifiers: string[],
  body: string
): JavaMethod | null {
  const open = rest.indexOf("(");
  if (open < 0) return null;
  const close = matchingClose(rest, open);
  let head = rest.slice(0, open).trim();
  if (head.startsWith("<")) head = head.slice(matchingClose(head, 0) + 1).trim();
  const hm = head.match(/^([\s\S]*?)\s*\b(\w+)$/);
  if (!hm) return null;
  const params: JavaParam[] = [];
  for (const p of splitTopLevel(rest.slice(open + 1, close))) {
    const clean = splitHeader(p).rest.replace(/\bfinal\s+/g, "").trim();
    const pm = clean.match(/^([\s\S]+?)\s+(\w+)(\s*\[\s*\])?$/);
    if (pm) params.push({ type: normalizeType(pm[1] + (pm[3] ? "[]" : "")), name: pm[2] });
  }
  return {
    name: hm[2],
    returnType: normalizeType(hm[1]),
    params,
    modifiers,
    annotations,
    body,
  };
}

function parseFieldDecl(rest: string, annotations: JavaAnnotation[], modifiers: string[]): JavaField[] {
  const parts = splitTopLevel(rest);
  if (parts.length === 0) return [];
  const first = parts[0].trim();
  const eq = indexOfTopLevel(first, "=");
  const left = (eq >= 0 ? first.slice(0, eq) : first).trim();
  const m = left.match(/^([\s\S]+?)\s+(\w+)(\s*\[\s*\])?$/);
  if (!m) return [];
  const baseType = normalizeType(m[1]);
  const fields: JavaField[] = [
    {
      name: m[2],
      type: m[3] ? `${baseType}[]` : baseType,
      modifiers,
      annotations,
      initializer: eq >= 0 ? first.slice(eq + 1).trim() : null,
    },
  ];
  for (const extra of parts.slice(1)) {
    const e = extra.trim();
    const eqx = indexOfTopLevel(e, "=");
    const nm = (eqx >= 0 ? e.slice(0, eqx) : e).trim().match(/^(\w+)(\s*\[\s*\])?$/);
    if (!nm) continue;
    fields.push({
      name: nm[1],
      type: nm[2] ? `${baseType}[]` : baseType,
      modifiers,
      annotations,
      initializer: eqx >= 0 ? e.slice(eqx + 1).trim() : null,
    });
  }
  return fields;
}

function indexOfTopLevel(src: string, ch: string): number {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if ("<({[".includes(c)) depth++;
    else if (">)}]".includes(c)) depth--;
    else if (c === ch && depth === 0) return i;
  }
  return -1;
}

export function normalizeType(t: string): string {
  return t
    .replace(/\s+/g, " ")
    .replace(/\s*([<>,\[\]?])\s*/g, "$1")
    .replace(/,/g, ", ")
    .trim();
}

/** Valeur d'un attribut d'annotation : `name = "x"` ou valeur unique `"x"` pour la clé `value`. */
export function annotationValue(ann: JavaAnnotation | undefined, key: string): string | null {
  if (!ann || !ann.args) return null;
  for (const part of splitTopLevel(ann.args)) {
    const kv = part.match(/^\s*(\w+)\s*=\s*([\s\S]+?)\s*$/);
    if (kv) {
      if (kv[1] === key) return unquote(kv[2]);
    } else if (key === "value") {
      return unquote(part.trim());
    }
  }
  return null;
}

function unquote(v: string): string {
  const m = v.match(/^"((?:[^"\\]|\\.)*)"$/);
  return m ? m[1] : v;
}

export function findAnnotation(anns: JavaAnnotation[], name: string): JavaAnnotation | undefined {
  return anns.find((a) => a.name === name);
}

/**
 * Évalue une expression de chaîne constante : concaténation de littéraux, de
 * constantes `static final String` connues et de `String.format` à arguments
 * constants. Renvoie null dès qu'un terme n'est pas résoluble.
 */
export function evaluateStringExpression(
  expr: string,
  context: JavaType,
  index: JavaSourceIndex,
  depth = 0
): string | null {
  if (depth > 8) return null;
  const e = expr.trim();
  const fmt = e.match(/^String\s*\.\s*format\s*\(([\s\S]*)\)$/);
  if (fmt) {
    const args = splitTopLevel(fmt[1]).map((a) => evaluateStringExpression(a, context, index, depth + 1));
    if (args.some((a) => a === null)) return null;
    let i = 1;
    return (args[0] as string).replace(/%s/g, () => (args[i++] as string) ?? "");
  }
  const terms = splitTopLevel(e, "+");
  if (terms.length > 1) {
    let out = "";
    for (const t of terms) {
      const v = evaluateStringExpression(t, context, index, depth + 1);
      if (v === null) return null;
      out += v;
    }
    return out;
  }
  const lit = e.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (lit) return unescapeJava(lit[1]);
  const paren = e.match(/^\(([\s\S]*)\)$/);
  if (paren) return evaluateStringExpression(paren[1], context, index, depth + 1);
  const ref = e.match(/^(?:([\w.]+)\.)?(\w+)$/);
  if (!ref) return null;
  const owner = ref[1] ? index.resolve(ref[1], context) : context;
  const candidates: JavaType[] = [];
  if (owner) candidates.push(owner);
  if (!ref[1]) for (let t = context.outer; t; t = t.outer) candidates.push(t);
  for (const c of candidates) {
    const f = c.fields.find((x) => x.name === ref[2]);
    if (f && f.initializer) return evaluateStringExpression(f.initializer, c, index, depth + 1);
  }
  return null;
}

function unescapeJava(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c: string) => {
    if (c.startsWith("u") && c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16));
    switch (c) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return c;
    }
  });
}
