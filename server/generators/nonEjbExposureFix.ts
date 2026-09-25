/**
 * Retrait des adaptateurs générés pour des types qui ne sont pas des EJB appelables.
 *
 * Le moteur expose toute interface qu'il rencontre, y compris :
 *   - les interfaces clientes de web services (@WebService, @WebServiceClient),
 *     que l'EJB utilise pour appeler un service externe ;
 *   - les interfaces @Local (DAO internes), non accessibles à distance.
 * Les resources produites cherchent le bean du service principal et lui envoient
 * un flux construit par addNode, donc vide : aucun appel ne peut aboutir, et une
 * interface DAO n'a pas à être exposée. Resource, converter et DTO dédiés sont
 * retirés du projet généré.
 */
import fs from "fs/promises";
import path from "path";
import { loadJavaSources, findAnnotation, JavaType, JavaSourceIndex } from "./javaSourceModel";

export interface NonEjbRemoval {
  target: string;
  reason: string;
  removed: string[];
}

export async function removeNonEjbExposures(outputDir: string, inputPath: string): Promise<NonEjbRemoval[]> {
  const index = await loadJavaSources([inputPath]);
  const removals: NonEjbRemoval[] = [];
  const webFiles = await collectJavaFiles(outputDir);
  const resources = webFiles.filter((f) => f.endsWith("Resource.java") && f.includes(`${path.sep}resource${path.sep}`));
  const remaining = new Set(webFiles);

  for (const resource of resources) {
    const content = await fs.readFile(resource, "utf-8");
    const link = content.match(/\{@link\s+([\w.]+)\}/);
    if (!link) continue;
    const candidates = index.types.filter((t) => t.name === link[1] || t.fqcn === link[1]);
    if (candidates.length === 0) continue;
    const reasons = candidates.map((c) => nonEjbReason(c, index));
    if (reasons.some((r) => r === null)) continue;
    const reason = reasons[0]!;

    const removed: string[] = [resource];
    const converterName = content.match(/import\s+[\w.]+\.converter\.(\w+Converter);/);
    const converter = converterName ? webFiles.find((f) => path.basename(f) === `${converterName[1]}.java`) : undefined;
    if (converter) removed.push(converter);

    const dtoImport = content.match(/import\s+([\w.]+\.dto\.\w+)\.\*;/);
    if (dtoImport) {
      const dtoDir = path.join(javaRootOf(resource), ...dtoImport[1].split("."));
      for (const f of webFiles) if (path.dirname(f) === dtoDir) removed.push(f);
    }

    for (const f of removed) {
      await fs.rm(f, { force: true });
      remaining.delete(f);
    }
    removals.push({ target: candidates[0].fqcn, reason, removed });
  }

  // Un package de DTO vidé ne doit pas rester importé ailleurs.
  for (const f of remaining) {
    const content = await fs.readFile(f, "utf-8");
    let patched = content;
    for (const r of removals) {
      for (const m of content.matchAll(/import\s+([\w.]+\.dto\.\w+)\.\*;\r?\n/g)) {
        const dir = path.join(javaRootOf(f), ...m[1].split("."));
        if (r.removed.some((x) => path.dirname(x) === dir)) patched = patched.replace(m[0], "");
      }
    }
    if (patched !== content) await fs.writeFile(f, patched, "utf-8");
  }
  return removals;
}

function nonEjbReason(t: JavaType, index: JavaSourceIndex): string | null {
  if (isSessionBean(t)) return null;
  const servedByBean = index.types.some(
    (b) =>
      isSessionBean(b) &&
      (b.interfaces.some((i) => i.replace(/<.*>$/, "").split(".").pop() === t.name) ||
        b.annotations.some((a) => (a.name === "Remote" || a.name === "Local") && new RegExp(`\\b${t.name}\\.class`).test(a.args)))
  );
  if (findAnnotation(t.annotations, "WebServiceClient")) return "client de web service";
  if (t.kind !== "interface") return null;
  if (findAnnotation(t.annotations, "WebService") && !servedByBean) return "interface cliente de web service";
  if (findAnnotation(t.annotations, "Local") && !findAnnotation(t.annotations, "Remote")) return "interface locale";
  if (t.interfaces.some((i) => i === "java.rmi.Remote" || i === "Remote") && !servedByBean) return "interface cliente RMI";
  return null;
}

function isSessionBean(t: JavaType): boolean {
  return ["Stateless", "Stateful", "Singleton", "MessageDriven"].some((a) => !!findAnnotation(t.annotations, a));
}

function javaRootOf(file: string): string {
  const marker = `${path.sep}src${path.sep}main${path.sep}java${path.sep}`;
  const i = file.indexOf(marker);
  return i >= 0 ? file.slice(0, i + marker.length - 1) : path.dirname(file);
}

async function collectJavaFiles(dir: string): Promise<string[]> {
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
      if (["target", "node_modules", ".git"].includes(entry.name) || /-ejb$|-ear$/.test(entry.name)) continue;
      result.push(...(await collectJavaFiles(full)));
    } else if (entry.name.endsWith(".java")) {
      result.push(full);
    }
  }
  return result;
}
