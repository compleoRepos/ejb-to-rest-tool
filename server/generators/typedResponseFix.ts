/**
 * Post-traitement des DTO de réponse et des converters produits par le JAR
 * jaxrs-wrapper-generator.
 *
 * Le moteur enrichit les DTO de sortie à partir des classes du projet source :
 * un champ qui porte un objet (ex. `data`) devient une classe imbriquée typée,
 * et un champ répété devient une `List`. Le converter, lui, reste scalaire et
 * affecte ces champs avec `getNodeAsString`, qui renvoie une String. Le module
 * web ne compile donc pas :
 *   incompatible types: java.lang.String cannot be converted to ...Response.Data
 * Les DTO concernés déclarent par ailleurs des `List` sans importer `java.util.List`.
 *
 * Le moteur émet par ailleurs `getNodeAsLong` pour les champs `long`, accesseur
 * que l'Envelope du framework n'expose pas (String, Int, Double, Boolean, List).
 *
 * Ce post-traitement ajoute l'import manquant et remplace les affectations
 * fautives par les méthodes d'EnvelopeJson (toBean, toBeanList, toLong), écrit
 * par le correctif de mapping de sortie dans le même package.
 */
import fs from "fs/promises";
import path from "path";

interface ResponseDtoModel {
  /** Type déclaré de chaque champ de premier niveau, par nom de champ. */
  fields: Map<string, string>;
  /** Noms des classes imbriquées déclarées dans le fichier. */
  nestedTypes: Set<string>;
}

/**
 * Applique le correctif aux DTO de réponse et aux converters d'un projet généré.
 * Retourne la liste des fichiers modifiés (traçabilité et tests).
 */
export async function fixTypedResponseMapping(outputDir: string): Promise<string[]> {
  const touched: string[] = [];
  const javaFiles = await collectJavaFiles(outputDir);

  const models = new Map<string, ResponseDtoModel>();
  for (const file of javaFiles.filter((f) => f.endsWith("Response.java"))) {
    const content = await fs.readFile(file, "utf-8");
    const className = path.basename(file, ".java");
    models.set(className, parseResponseDto(content));

    const patched = addListImport(content);
    if (patched !== content) {
      await fs.writeFile(file, patched, "utf-8");
      touched.push(file);
    }
  }

  for (const file of javaFiles.filter((f) => f.endsWith("Converter.java"))) {
    const content = await fs.readFile(file, "utf-8");
    const patched = patchConverter(content, models);
    if (patched !== content) {
      await fs.writeFile(file, patched, "utf-8");
      touched.push(file);
    }
  }

  return touched;
}

/**
 * Relève les champs de premier niveau et les classes imbriquées d'un DTO de réponse.
 */
export function parseResponseDto(content: string): ResponseDtoModel {
  const nestedTypes = new Set<string>();
  const nestedRe = /\bstatic\s+class\s+(\w+)\b/g;
  let nested: RegExpExecArray | null;
  while ((nested = nestedRe.exec(content)) !== null) {
    nestedTypes.add(nested[1]);
  }

  // Les champs de premier niveau précèdent la première classe imbriquée.
  const firstNested = content.search(/\n\s{4}public\s+static\s+class\s+\w+/);
  const head = firstNested === -1 ? content : content.slice(0, firstNested);

  const fields = new Map<string, string>();
  const fieldRe = /^\s{4}private\s+(?!static\b)([\w.]+(?:<[\w.,\s<>]+>)?)\s+(\w+)\s*;/gm;
  let field: RegExpExecArray | null;
  while ((field = fieldRe.exec(head)) !== null) {
    fields.set(field[2], field[1]);
  }

  return { fields, nestedTypes };
}

/**
 * Ajoute `import java.util.List;` à un DTO qui déclare des listes sans l'importer.
 */
export function addListImport(content: string): string {
  if (!/\bList</.test(content)) return content;
  if (/^import\s+java\.util\.List;/m.test(content)) return content;
  return content.replace(
    /^(import\s+java\.io\.Serializable;\n)/m,
    "$1import java.util.List;\n"
  );
}

/**
 * Remplace, dans un converter, les affectations scalaires des champs typés par
 * une construction via EnvelopeJson. Les champs String restent inchangés.
 */
export function patchConverter(content: string, models: Map<string, ResponseDtoModel>): string {
  const lines = content.split("\n");
  let currentDto: string | null = null;

  const patched = lines.map((line) => {
    const declaration = line.match(/\b(\w+Response)\s+response\s*=\s*new\s+\1\s*\(/);
    if (declaration) {
      currentDto = declaration[1];
      return line;
    }
    if (!currentDto) return line;

    // L'Envelope du framework n'expose pas getNodeAsLong.
    const longRead = line.match(
      /^(\s*)response\.set(\w+)\(\s*envelope\.getNodeAsLong\(\s*"([^"]+)"\s*\)\s*\);\s*$/
    );
    if (longRead) {
      const [, indent, setter, nodePath] = longRead;
      return `${indent}response.set${setter}(EnvelopeJson.toLong(envelope, "${nodePath}"));`;
    }

    const assignment = line.match(
      /^(\s*)response\.set(\w+)\(\s*envelope\.getNodeAsString\(\s*"([^"]+)"\s*\)\s*\);\s*$/
    );
    if (!assignment) return line;

    const model = models.get(currentDto);
    if (!model) return line;

    const [, indent, setter, nodePath] = assignment;
    const property = setter.charAt(0).toLowerCase() + setter.slice(1);
    const declared = model.fields.get(property);
    if (!declared || declared === "String") return line;

    const listItem = declared.match(/^(?:java\.util\.)?List<\s*([\w.]+)\s*>$/);
    if (listItem) {
      const item = qualify(listItem[1], currentDto, model);
      return `${indent}response.set${setter}(EnvelopeJson.toBeanList(envelope, "${nodePath}", ${item}.class));`;
    }

    const type = qualify(declared, currentDto, model);
    return `${indent}response.set${setter}(EnvelopeJson.toBean(envelope, "${nodePath}", ${type}.class));`;
  });

  return patched.join("\n");
}

/**
 * Préfixe un type par la classe englobante lorsqu'il s'agit d'une classe imbriquée.
 */
function qualify(type: string, dtoClass: string, model: ResponseDtoModel): string {
  return model.nestedTypes.has(type) ? `${dtoClass}.${type}` : type;
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
      if (entry.name === "target" || entry.name === "node_modules") continue;
      result.push(...(await collectJavaFiles(full)));
    } else if (entry.name.endsWith(".java")) {
      result.push(full);
    }
  }
  return result;
}
