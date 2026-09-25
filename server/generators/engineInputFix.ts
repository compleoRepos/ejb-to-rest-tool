/**
 * Préparation de l'entrée du moteur jaxrs-wrapper-generator.
 *
 * Le moteur lit les constantes des enum (codes fonction) sans ignorer les
 * commentaires : une ligne `GETFAVORIS, // done` ou un commentaire placé en tête
 * de l'enum devient un code fonction au nom vide, et le moteur s'arrête sur
 * `InvalidPathException: //Request.java`.
 *
 * Le moteur reçoit donc une copie temporaire du projet dans laquelle les
 * commentaires situés dans le corps des enum sont remplacés par des espaces.
 * Les sources d'origine ne sont pas modifiées : les modules clonés dans le projet
 * généré proviennent toujours de l'entrée d'origine.
 */
import fs from "fs/promises";
import os from "os";
import path from "path";

export interface EngineInput {
  path: string;
  cleanup: () => Promise<void>;
}

export async function prepareEngineInput(inputPath: string): Promise<EngineInput> {
  const passthrough: EngineInput = { path: inputPath, cleanup: async () => {} };
  let stat;
  try {
    stat = await fs.stat(inputPath);
  } catch {
    return passthrough;
  }
  if (!stat.isDirectory()) return passthrough;

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "engine-input-"));
  const copy = path.join(tempRoot, path.basename(path.resolve(inputPath)));
  await copyTree(inputPath, copy);
  await inlineFactorySwitches(copy);
  return {
    path: copy,
    cleanup: () => fs.rm(tempRoot, { recursive: true, force: true }),
  };
}

async function copyTree(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if ([".git", "target", "node_modules"].includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyTree(from, to);
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".java")) {
        // latin1 : correspondance octet pour octet, l'encodage d'origine est conservé.
        const content = await fs.readFile(from, "latin1");
        await fs.writeFile(to, blankEnumComments(content), "latin1");
      } else {
        await fs.copyFile(from, to);
      }
    }
  }
}

/**
 * Le moteur ne lit les codes fonction d'un enum externe que si le `switch` sur cet
 * enum figure dans `process()` ou dans une méthode du bean. Certains EJB historiques
 * délèguent l'aiguillage à une fabrique :
 * `MethodType t = MethodType.valueOf(envIn.getNodeAsString(...)); IMethod m = MethodFactory.getMethod(t);`
 * Dans la copie destinée au moteur, le `switch` de la fabrique est recopié dans le
 * bean, juste après l'appel, sur la variable du bean. Les sources d'origine restent intactes.
 */
async function inlineFactorySwitches(root: string): Promise<void> {
  const files = await listJavaFiles(root);
  const byClass = new Map<string, string>();
  for (const f of files) byClass.set(path.basename(f, ".java"), f);

  const readClass = async (cls: string) => {
    const f = byClass.get(cls);
    return f ? fs.readFile(f, "latin1") : null;
  };
  for (const file of files) {
    const src = await fs.readFile(file, "latin1");
    if (!/\bprocess\s*\(/.test(src) || !/getNodeAsString/.test(src)) continue;
    let result = await resolveQualifiedNodeConstants(src, readClass);
    result = await inlineFactorySwitchesInSource(result, readClass);
    if (result !== src) await fs.writeFile(file, result, "latin1");
  }
}

/**
 * Le moteur ne résout que les constantes locales (`getNodeAsString(FLUX_FUNCTION)`) :
 * une constante qualifiée `getNodeAsString(Constants.FLUX_FUNCTION)` lui fait perdre le
 * chemin d'aiguillage, et il retombe sur `action`. Dans la copie du moteur, la
 * constante qualifiée est remplacée par sa valeur littérale lue dans sa classe.
 */
export async function resolveQualifiedNodeConstants(
  src: string,
  readClass: (className: string) => Promise<string | null>
): Promise<string> {
  const re = /getNodeAsString\(\s*([A-Z]\w*)\.([A-Z_][A-Z0-9_]*)\s*\)/g;
  const found = Array.from(src.matchAll(re));
  let out = src;
  for (const m of found) {
    const cls = await readClass(m[1]);
    if (!cls) continue;
    const def = new RegExp(`\\bString\\s+${m[2]}\\s*=\\s*"([^"]*)"`).exec(cls);
    if (!def) continue;
    out = out.split(m[0]).join(`getNodeAsString("${def[1]}")`);
  }
  return out;
}

export async function inlineFactorySwitchesInSource(
  src: string,
  readClass: (className: string) => Promise<string | null>
): Promise<string> {
  const valueOfRe = /\b([A-Z]\w*)\s+(\w+)\s*=\s*([A-Z]\w*)\.valueOf\s*\([^;]*getNodeAsString[^;]*;/g;
  let out = src;
  let m: RegExpExecArray | null;
  while ((m = valueOfRe.exec(src)) !== null) {
    const [, declType, variable, enumType] = m;
    if (declType !== enumType) continue;
    if (new RegExp(`switch\\s*\\(\\s*${variable}\\s*\\)`).test(src)) continue;
    const callRe = new RegExp(`\\b([A-Z]\\w*)\\.(\\w+)\\s*\\(\\s*${variable}\\s*\\)[^;]*;`);
    const call = callRe.exec(src.slice(m.index + m[0].length));
    if (!call || call[1] === enumType) continue;
    const factorySrc = await readClass(call[1]);
    if (!factorySrc) continue;
    const sw = extractFactorySwitch(factorySrc, call[2], enumType);
    if (!sw) continue;
    const renamed = sw.body.replace(new RegExp(`switch\\s*\\(\\s*${sw.param}\\s*\\)`), `switch (${variable})`);
    const anchor = call[0];
    const at = out.indexOf(anchor, out.indexOf(m[0]));
    if (at < 0) continue;
    const insertAt = at + anchor.length;
    out = out.slice(0, insertAt) + "\n" + renamed + "\n" + out.slice(insertAt);
  }
  return out;
}

function extractFactorySwitch(
  src: string,
  method: string,
  enumType: string
): { param: string; body: string } | null {
  const sig = new RegExp(`\\b${method}\\s*\\(\\s*${enumType}\\s+(\\w+)\\s*\\)[^{;]*\\{`).exec(src);
  if (!sig) return null;
  const open = sig.index + sig[0].length - 1;
  const close = matchingBrace(src, open);
  const body = src.slice(open + 1, close);
  const swRe = new RegExp(`switch\\s*\\(\\s*${sig[1]}\\s*\\)\\s*\\{`);
  const sw = swRe.exec(body);
  if (!sw) return null;
  const swOpen = sw.index + sw[0].length - 1;
  const swClose = matchingBrace(body, swOpen);
  return { param: sig[1], body: body.slice(sw.index, swClose + 1) };
}

async function listJavaFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listJavaFiles(p)));
    else if (entry.isFile() && entry.name.endsWith(".java")) out.push(p);
  }
  return out;
}

/**
 * Dans le corps des enum : commentaires remplacés par des espaces, et membres
 * situés après la liste des constantes (champs, constructeur, méthodes) masqués,
 * le moteur les lisant aussi comme des codes fonction (`value;`).
 */
export function blankEnumComments(src: string): string {
  if (!/\benum\s+\w+/.test(src)) return src;
  const chars = src.split("");
  const enumRe = /\benum\s+\w+[^{;]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = enumRe.exec(src)) !== null) {
    let i = m.index + m[0].length;
    let depth = 1;
    let paren = 0;
    let afterConstants = false;
    while (i < src.length && depth > 0) {
      const c = src[i];
      const n = src[i + 1];
      if (c === '"' || c === "'") {
        const end = skipLiteral(src, i);
        if (afterConstants) for (let k = i; k < end; k++) if (src[k] !== "\n" && src[k] !== "\r") chars[k] = " ";
        i = end;
        continue;
      }
      if (c === "/" && n === "/") {
        while (i < src.length && src[i] !== "\n") {
          if (src[i] !== "\r") chars[i] = " ";
          i++;
        }
        continue;
      }
      if (c === "/" && n === "*") {
        const end = src.indexOf("*/", i + 2);
        const stop = end < 0 ? src.length : end + 2;
        for (let k = i; k < stop; k++) if (src[k] !== "\n" && src[k] !== "\r") chars[k] = " ";
        i = stop;
        continue;
      }
      if (afterConstants && depth === 1 && c !== "}") {
        if (c === "{") {
          const close = matchingBrace(src, i);
          for (let k = i; k <= close; k++) if (src[k] !== "\n" && src[k] !== "\r") chars[k] = " ";
          i = close + 1;
          continue;
        }
        if (c !== "\n" && c !== "\r") chars[i] = " ";
        i++;
        continue;
      }
      if (c === "(") paren++;
      else if (c === ")") paren--;
      else if (c === ";" && depth === 1 && paren === 0) {
        chars[i] = " ";
        afterConstants = true;
        i++;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      i++;
    }
  }
  return chars.join("");
}

function matchingBrace(src: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i = skipLiteral(src, i);
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return src.length - 1;
}

function skipLiteral(src: string, start: number): number {
  const quote = src[start];
  let i = start + 1;
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
      continue;
    }
    if (src[i] === quote || src[i] === "\n") return i + 1;
    i++;
  }
  return i;
}
