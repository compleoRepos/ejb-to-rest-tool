/**
 * Transmission des paramètres d'entrée aux EJB historiques (flux <Flux><FONCTION|action>).
 *
 * Le moteur ne relève que les lectures littérales : la plupart des fonctions sortent sans aucun champ,
 * l'EJB ne reçoit rien du canal. À partir de l'analyse statique de l'EJB (ejbInputAnalysis), ce
 * correctif ajoute, fonction par fonction, les champs lus par l'EJB :
 * - POST, PUT, DELETE : champs du DTO de requête (classes imbriquées pour les chemins à plusieurs
 *   niveaux), écrits dans le flux par le convertisseur, un champ absent n'est pas émis ;
 * - GET : un @QueryParam par champ, notation pointée pour un chemin imbriqué (pager.pageSize) ;
 * - fonction relais (l'EJB transmet l'enveloppe entière à un service aval) : passage libre, champ
 *   "parametres" en POST, tous les paramètres de requête en GET.
 * Les champs déjà produits par le moteur sont conservés. Les listes lues par indice ne sont pas
 * transmises et sont signalées.
 */
import fs from "fs/promises";
import path from "path";
import { analyzeEjbInputs } from "./ejbInputAnalysis";

export interface RequestFieldsReport {
  functions: { service: string; code: string; verb: string; added: string[]; relay: boolean; lists: string[] }[];
  skipped: string[];
}

interface ConverterMethod {
  name: string;
  code: string;
  params: string;
  start: number;
  end: number;
  text: string;
}

const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue",
  "default", "do", "double", "else", "enum", "extends", "final", "finally", "float", "for", "goto", "if",
  "implements", "import", "instanceof", "int", "interface", "long", "native", "new", "package", "private",
  "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this",
  "throw", "throws", "transient", "try", "void", "volatile", "while", "true", "false", "null",
]);
const RESERVED_VARS = new Set(["params", "uriInfo", "log", "converter", "request", "envelopeIn", "envelopeOut", "code", "message", "entry"]);

export async function fixRequestFields(outputDir: string): Promise<RequestFieldsReport> {
  const report: RequestFieldsReport = { functions: [], skipped: [] };
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const webName = entries.find((e) => e.isDirectory() && e.name.toLowerCase().endsWith("-web"))?.name;
  const ejbName = entries.find((e) => e.isDirectory() && e.name.toLowerCase().endsWith("-ejb"))?.name;
  if (!webName || !ejbName) return report;
  const service = webName.replace(/-web$/i, "");
  const javaFiles = await collectJavaFiles(path.join(outputDir, webName, "src", "main", "java"));
  const sanitizerFile = javaFiles.find((f) => path.basename(f) === "InputSanitizer.java");
  const sanitizerClass = sanitizerFile ? await qualifiedName(sanitizerFile) : null;

  for (const converterFile of javaFiles.filter((f) => f.endsWith("Converter.java"))) {
    let converter = await fs.readFile(converterFile, "utf-8");
    const methods = converterMethods(converter);
    if (methods.length === 0) continue;
    const inputs = await analyzeEjbInputs(path.join(outputDir, ejbName), [...new Set(methods.map((m) => m.code))]);
    const resourceFiles = await filesCalling(javaFiles, methods.map((m) => m.name));
    const helpersNeeded = { node: false, nodes: false };
    const resourcesChanged = new Map<string, string>();

    for (const method of methods) {
      const found = inputs.get(method.code);
      if (!found || (found.paths.length === 0 && !found.relay)) continue;
      const existing = existingTags(method.text);
      const paths = found.paths.filter((p) => !existing.has(p.split("/")[0].toLowerCase()));
      if (paths.length === 0 && !found.relay) continue;

      let resourceText = "";
      let resourcePath = "";
      for (const f of resourceFiles) {
        const t = resourcesChanged.get(f) ?? (await fs.readFile(f, "utf-8"));
        if (t.includes(`converter.${method.name}(`)) {
          resourceText = t;
          resourcePath = f;
          break;
        }
      }
      if (!resourcePath) {
        report.skipped.push(`${service} ${method.code} : resource introuvable`);
        continue;
      }
      const res = resourceMethod(resourceText, method.name);
      if (!res) {
        report.skipped.push(`${service} ${method.code} : methode de resource introuvable`);
        continue;
      }

      if (res.verb === "GET") {
        if (res.params.trim() !== "" || method.params.trim() !== "") {
          report.skipped.push(`${service} ${method.code} : GET deja parametre, laisse tel quel`);
          continue;
        }
        const vars = queryVariables(paths);
        const signature = vars.map((v) => `@QueryParam("${v.query}") String ${v.name}`);
        if (found.relay) signature.push("@Context UriInfo uriInfo");
        const build = [
          `Map<String, String> params = new LinkedHashMap<String, String>();`,
          ...vars.map((v) => `params.put("${v.query}", ${v.name});`),
        ];
        if (found.relay) {
          build.push(
            `for (Map.Entry<String, List<String>> entry : uriInfo.getQueryParameters().entrySet()) {`,
            `    if (!params.containsKey(entry.getKey()) && !entry.getValue().isEmpty()) {`,
            `        params.put(entry.getKey(), entry.getValue().get(0));`,
            `    }`,
            `}`
          );
        }
        const body = res.text
          .replace(new RegExp(`public Response ${res.name}\\(\\)`), `public Response ${res.name}(${signature.join(", ")})`)
          .replace(
            new RegExp(`(\\n[ \\t]*)Envelope envelopeIn = converter\\.${method.name}\\(\\);`),
            (_m, nl: string) => `${nl}${build.join(nl)}${nl}Envelope envelopeIn = converter.${method.name}(params);`
          );
        resourceText = resourceText.slice(0, res.start) + body + resourceText.slice(res.end);
        resourceText = ensureImports(resourceText, [
          "java.util.LinkedHashMap",
          "java.util.Map",
          ...(found.relay ? ["java.util.List", "javax.ws.rs.core.Context", "javax.ws.rs.core.UriInfo"] : []),
        ]);
        resourcesChanged.set(resourcePath, resourceText);

        const newMethod = rewriteConverterBody(method, `Map<String, String> params`, ["appendNodes(xml, params);"]);
        converter = converter.replace(method.text, newMethod);
        helpersNeeded.node = true;
        helpersNeeded.nodes = true;
        report.functions.push({ service, code: method.code, verb: "GET", added: vars.map((v) => v.query), relay: found.relay, lists: found.lists });
        continue;
      }

      const reqType = method.params.match(/^\s*(\w+)\s+request\s*$/)?.[1];
      if (!reqType) {
        report.skipped.push(`${service} ${method.code} : ${res.verb} sans DTO de requete, laisse tel quel`);
        continue;
      }
      const dtoFile = javaFiles.find((f) => path.basename(f) === `${reqType}.java`);
      if (!dtoFile) {
        report.skipped.push(`${service} ${method.code} : DTO ${reqType} introuvable`);
        continue;
      }
      const dto = await fs.readFile(dtoFile, "utf-8");
      const tree = buildTree(paths);
      const { dtoText, lines } = extendDto(dto, reqType, tree, found.relay);
      await fs.writeFile(dtoFile, dtoText, "utf-8");
      const appends = [...lines];
      if (found.relay) appends.push("appendNodes(xml, request.getParametres());");
      converter = converter.replace(method.text, rewriteConverterBody(method, null, appends));
      helpersNeeded.node = true;
      if (found.relay) helpersNeeded.nodes = true;
      report.functions.push({ service, code: method.code, verb: res.verb, added: paths.map((p) => p.replace(/\//g, ".")), relay: found.relay, lists: found.lists });
    }

    if (helpersNeeded.node) {
      converter = addConverterHelpers(converter, helpersNeeded.nodes);
      const imports = ["java.util.LinkedHashMap", "java.util.Map"];
      if (sanitizerClass && !converter.includes(`import ${sanitizerClass};`)) imports.push(sanitizerClass);
      converter = ensureImports(converter, imports);
      await fs.writeFile(converterFile, converter, "utf-8");
    }
    for (const [f, t] of resourcesChanged) await fs.writeFile(f, t, "utf-8");
  }
  return report;
}

function converterMethods(src: string): ConverterMethod[] {
  const out: ConverterMethod[] = [];
  const re = /public\s+Envelope\s+(toEnvelope\w+)\s*\(([^)]*)\)\s*\{/g;
  for (const m of src.matchAll(re)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const close = matchingClose(src, open);
    const text = src.slice(m.index ?? 0, close + 1);
    const code = text.match(/<(?:FONCTION|action)>(\w+)<\/(?:FONCTION|action)>/);
    if (!code) continue;
    out.push({ name: m[1], code: code[1], params: m[2], start: m.index ?? 0, end: close + 1, text });
  }
  return out;
}

function existingTags(text: string): Set<string> {
  const tags = new Set<string>();
  for (const m of text.matchAll(/"<(\w+)>/g)) tags.add(m[1].toLowerCase());
  tags.delete("flux");
  tags.delete("fonction");
  tags.delete("action");
  return tags;
}

/** Réécrit le corps d'une méthode toEnvelope : corps construit par StringBuilder, ajouts avant </Flux>. */
function rewriteConverterBody(method: ConverterMethod, newParams: string | null, appends: string[]): string {
  let text = method.text;
  if (newParams !== null) text = text.replace(`${method.name}(${method.params})`, `${method.name}(${newParams})`);
  const single = text.match(/([ \t]*)envelope\.setBody\("(<Flux>.*)<\/Flux>"\);/);
  if (single) {
    const indent = single[1];
    const opening = single[2].match(/^<Flux>(.*)$/)?.[1] ?? "";
    const lines = [
      `StringBuilder xml = new StringBuilder("<Flux>");`,
      `xml.append("${opening}");`,
      ...appends,
      `xml.append("</Flux>");`,
      `envelope.setBody(xml.toString());`,
    ];
    return text.replace(single[0], lines.map((l) => indent + l).join("\n"));
  }
  const close = text.match(/([ \t]*)xml\.append\("<\/Flux>"\);/);
  if (!close) return text;
  return text.replace(close[0], [...appends.map((l) => close[1] + l), close[0]].join("\n"));
}

interface Node {
  tag: string;
  children: Node[];
}

const nestedNames = new WeakMap<Node, string>();

function buildTree(paths: string[]): Node[] {
  const root: Node[] = [];
  for (const p of paths) {
    let level = root;
    const segs = p.split("/");
    segs.forEach((seg, i) => {
      let node = level.find((n) => n.tag === seg);
      if (!node) {
        if (level.some((n) => n.tag.toLowerCase() === seg.toLowerCase())) return;
        node = { tag: seg, children: [] };
        level.push(node);
      }
      if (i < segs.length - 1) level = node.children;
    });
  }
  return root;
}

function javaName(tag: string): string {
  let n = tag.replace(/[^A-Za-z0-9_]/g, "_");
  const head = n.match(/^[A-Z]+/);
  if (head) n = head[0].toLowerCase() + n.slice(head[0].length);
  if (/^[0-9]/.test(n)) n = "_" + n;
  if (JAVA_KEYWORDS.has(n)) n = n + "_";
  return n;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Ajoute au DTO les champs de l'arbre (classes imbriquées pour les noeuds) et rend les lignes du
 * convertisseur qui les écrivent dans le flux.
 */
function extendDto(dto: string, className: string, tree: Node[], relay: boolean): { dtoText: string; lines: string[] } {
  const usedClassNames = new Set<string>([className]);
  const nested: string[] = [];
  const lines: string[] = [];

  const fieldsOf = (nodes: Node[], prefix: string, access: string, indent: string, pathPrefix: string): string[] => {
    const decl: string[] = [];
    for (const n of nodes) {
      const name = javaName(n.tag);
      const getter = `get${capitalize(name)}()`;
      const envPath = `flux/${pathPrefix}${n.tag}`;
      if (n.children.length === 0) {
        decl.push(`${indent}/** Champ métier mappé depuis Envelope path: ${envPath} */`, `${indent}private String ${name};`, "");
        lines.push(`${prefix}appendNode(xml, "${n.tag}", ${access}.${getter});`);
      } else {
        let cls = capitalize(name);
        while (usedClassNames.has(cls)) cls = cls + "Bloc";
        usedClassNames.add(cls);
        nestedNames.set(n, cls);
        decl.push(`${indent}/** Bloc métier mappé depuis Envelope path: ${envPath} */`, `${indent}private ${cls} ${name};`, "");
        lines.push(`${prefix}if (${access}.${getter} != null) {`);
        lines.push(`${prefix}    xml.append("<${n.tag}>");`);
        const inner = fieldsOf(n.children, prefix + "    ", `${access}.${getter}`, "        ", `${pathPrefix}${n.tag}/`);
        lines.push(`${prefix}    xml.append("</${n.tag}>");`);
        lines.push(`${prefix}}`);
        nested.push(renderNestedClass(cls, n.children, inner));
      }
    }
    return decl;
  };

  const topDecl = fieldsOf(tree, "", "request", "    ", "");
  const topAccessors = accessorsFor(tree, "    ");
  if (relay) {
    topDecl.push("    /** Paramètres transmis tels quels au service aval appelé par l'EJB. */", "    private Map<String, String> parametres;", "");
    topAccessors.push(
      "    public Map<String, String> getParametres() {",
      "        return parametres;",
      "    }",
      "",
      "    public void setParametres(Map<String, String> parametres) {",
      "        this.parametres = parametres;",
      "    }",
      ""
    );
  }

  const classOpen = dto.search(new RegExp(`class\\s+${className}\\b[^{]*\\{`));
  const open = dto.indexOf("{", classOpen);
  const close = matchingClose(dto, open);
  const tail = "\n" + [...topAccessors, ...nested].join("\n").replace(/\n+$/, "") + "\n";
  let text = dto.slice(0, close).replace(/\s*$/, "\n") + tail + dto.slice(close);
  const declarations = topDecl.join("\n").replace(/\n+$/, "");
  const serial = text.match(/\n[ \t]*private static final long serialVersionUID[^;]*;\n/);
  if (serial && serial.index !== undefined) {
    const at = serial.index + serial[0].length;
    text = text.slice(0, at) + "\n" + declarations + "\n" + text.slice(at).replace(/^\n+/, "\n");
  } else {
    const at = text.indexOf("{", classOpen) + 1;
    text = text.slice(0, at) + "\n\n" + declarations + "\n" + text.slice(at);
  }
  if (relay) text = ensureImports(text, ["java.util.Map"]);
  return { dtoText: text, lines };
}

function accessorsFor(nodes: Node[], indent: string): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const name = javaName(n.tag);
    const type = n.children.length === 0 ? "String" : nestedTypeName(n, name);
    out.push(
      `${indent}public ${type} get${capitalize(name)}() {`,
      `${indent}    return ${name};`,
      `${indent}}`,
      "",
      `${indent}public void set${capitalize(name)}(${type} ${name}) {`,
      `${indent}    this.${name} = ${name};`,
      `${indent}}`,
      ""
    );
  }
  return out;
}

function nestedTypeName(n: Node, name: string): string {
  return nestedNames.get(n) ?? capitalize(name);
}

function renderNestedClass(cls: string, children: Node[], decl: string[]): string {
  const acc = accessorsFor(children, "        ");
  return [
    `    /**`,
    `     * Bloc ${cls} du flux d'entrée.`,
    `     */`,
    `    public static class ${cls} implements Serializable {`,
    "",
    `        private static final long serialVersionUID = 1L;`,
    "",
    ...decl,
    ...acc,
    `    }`,
    "",
  ].join("\n");
}

function queryVariables(paths: string[]): { query: string; name: string }[] {
  const used = new Set<string>(RESERVED_VARS);
  return paths.map((p) => {
    const segs = p.split("/");
    let name = segs
      .map((s, i) => {
        const clean = s.replace(/[^A-Za-z0-9]/g, "");
        return i === 0 ? clean.charAt(0).toLowerCase() + clean.slice(1) : capitalize(clean);
      })
      .join("");
    if (!/^[A-Za-z_]/.test(name)) name = "p" + name;
    if (JAVA_KEYWORDS.has(name)) name = name + "Param";
    let unique = name;
    let k = 2;
    while (used.has(unique)) unique = name + k++;
    used.add(unique);
    return { query: segs.join("."), name: unique };
  });
}

function addConverterHelpers(src: string, withNodes: boolean): string {
  const helpers: string[] = [];
  if (!src.includes("private static void appendNode(")) {
    helpers.push(`    private static void appendNode(StringBuilder xml, String tag, String value) {
        if (value == null) {
            return;
        }
        xml.append('<').append(tag).append('>').append(InputSanitizer.sanitize(value)).append("</").append(tag).append('>');
    }`);
  }
  if (withNodes && !src.includes("private static void appendNodes(")) {
    helpers.push(`    private static void appendNodes(StringBuilder xml, Map<String, String> params) {
        if (params == null) {
            return;
        }
        Map<String, Map<String, String>> groups = new LinkedHashMap<String, Map<String, String>>();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            String key = entry.getKey();
            if (key == null || entry.getValue() == null) {
                continue;
            }
            int dot = key.indexOf('.');
            String head = dot < 0 ? key : key.substring(0, dot);
            if (!head.matches("[A-Za-z_][A-Za-z0-9_-]*")) {
                continue;
            }
            if (dot < 0) {
                appendNode(xml, head, entry.getValue());
                continue;
            }
            Map<String, String> group = groups.get(head);
            if (group == null) {
                group = new LinkedHashMap<String, String>();
                groups.put(head, group);
            }
            group.put(key.substring(dot + 1), entry.getValue());
        }
        for (Map.Entry<String, Map<String, String>> group : groups.entrySet()) {
            xml.append('<').append(group.getKey()).append('>');
            appendNodes(xml, group.getValue());
            xml.append("</").append(group.getKey()).append('>');
        }
    }`);
  }
  if (helpers.length === 0) return src;
  const end = src.lastIndexOf("}");
  return src.slice(0, end).replace(/\s*$/, "\n") + "\n" + helpers.join("\n\n") + "\n}\n";
}

interface ResourceMethod {
  name: string;
  verb: string;
  params: string;
  start: number;
  end: number;
  text: string;
}

function resourceMethod(src: string, converterMethod: string): ResourceMethod | null {
  const call = src.indexOf(`converter.${converterMethod}(`);
  if (call < 0) return null;
  const headerRe = /public\s+Response\s+(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*\{/g;
  let best: RegExpMatchArray | null = null;
  for (const m of src.matchAll(headerRe)) {
    if ((m.index ?? 0) < call) best = m;
  }
  if (!best) return null;
  const start = best.index ?? 0;
  const open = start + best[0].length - 1;
  const end = matchingClose(src, open) + 1;
  const before = src.slice(Math.max(0, start - 400), start);
  const verbs = [...before.matchAll(/@(GET|POST|PUT|DELETE|PATCH)\b/g)];
  const verb = verbs.length ? verbs[verbs.length - 1][1] : "POST";
  return { name: best[1], verb, params: best[2], start, end, text: src.slice(start, end) };
}

function ensureImports(src: string, imports: string[]): string {
  let out = src;
  for (const imp of imports) {
    if (out.includes(`import ${imp};`)) continue;
    const all = [...out.matchAll(/^import\s+[\w.*]+;[ \t]*$/gm)];
    if (all.length > 0) {
      const last = all[all.length - 1];
      const at = (last.index ?? 0) + last[0].length;
      out = out.slice(0, at) + `\nimport ${imp};` + out.slice(at);
    } else {
      out = out.replace(/(package\s+[\w.]+;[ \t]*\r?\n)/, `$1\nimport ${imp};\n`);
    }
  }
  return out;
}

async function qualifiedName(file: string): Promise<string | null> {
  const content = await fs.readFile(file, "utf-8");
  const pkg = content.match(/^package\s+([\w.]+);/m);
  return pkg ? `${pkg[1]}.${path.basename(file, ".java")}` : null;
}

async function filesCalling(files: string[], methods: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files.filter((x) => x.endsWith("Resource.java"))) {
    const t = await fs.readFile(f, "utf-8");
    if (methods.some((m) => t.includes(`converter.${m}(`))) out.push(f);
  }
  return out;
}

async function collectJavaFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await collectJavaFiles(full)));
    else if (e.name.endsWith(".java")) out.push(full);
  }
  return out;
}

function matchingClose(src: string, open: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length - 1;
}
