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
