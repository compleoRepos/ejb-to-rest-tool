/**
 * Génère un descripteur JSON des endpoints du projet adaptateur, prêt à être
 * ré-uploadé dans le générateur de wrappers Spring Boot par domaine.
 *
 * Le descripteur est reconstruit à partir du module web produit par le moteur :
 * les Resources JAX-RS fournissent les endpoints (verbe HTTP, chemin, opération),
 * les DTO Request/Response fournissent les champs. Il est déposé dans
 * src/main/resources/descriptor/<artifactId>.json du module web.
 */
import fs from "fs/promises";
import path from "path";

interface DescriptorField {
  name: string;
  type: string;
  required?: boolean;
}

interface DescriptorEndpoint {
  operation: string;
  method: string;
  path: string;
  request_fields: DescriptorField[];
  response_fields: DescriptorField[];
}

interface Descriptor {
  adapter_name: string;
  adapter_base_url: string;
  bian: { service_domain: string };
  endpoints: DescriptorEndpoint[];
}

const APP_PATH = "/api";

/**
 * Reconstruit et écrit le descripteur. Renvoie le chemin du fichier écrit, ou null
 * si aucune Resource n'a été trouvée.
 */
export async function writeEndpointDescriptor(
  outputDir: string,
  artifactId: string
): Promise<string | null> {
  const javaFiles = await collectFiles(outputDir, ".java");
  const resourceFiles = javaFiles.filter(
    (f) => f.endsWith("Resource.java") && f.includes(`${path.sep}resource${path.sep}`)
  );
  if (resourceFiles.length === 0) return null;

  const dtoIndex = await buildDtoIndex(javaFiles);

  const endpoints: DescriptorEndpoint[] = [];
  for (const resourceFile of resourceFiles.sort()) {
    const content = await fs.readFile(resourceFile, "utf-8");
    endpoints.push(...(await parseResource(content, dtoIndex)));
  }

  const webModuleRoot = moduleRootOf(resourceFiles[0]);
  if (!webModuleRoot) return null;

  const descriptor: Descriptor = {
    adapter_name: artifactId,
    adapter_base_url: `http://localhost:9080/${artifactId}${APP_PATH}`,
    bian: { service_domain: "" },
    endpoints,
  };

  const descriptorDir = path.join(webModuleRoot, "src", "main", "resources", "descriptor");
  await fs.mkdir(descriptorDir, { recursive: true });
  const descriptorPath = path.join(descriptorDir, `${artifactId}.json`);
  await fs.writeFile(descriptorPath, JSON.stringify(descriptor, null, 2) + "\n");
  return descriptorPath;
}

/**
 * Extrait les endpoints d'une Resource : chemin de base de la classe, puis pour
 * chaque méthode le verbe HTTP, le sous-chemin, l'opération et ses champs.
 */
async function parseResource(
  content: string,
  dtoIndex: Map<string, string>
): Promise<DescriptorEndpoint[]> {
  const subpkgMatch = content.match(/import\s+[\w.]+\.dto\.(\w+)\.\*;/);
  const subpkg = subpkgMatch ? subpkgMatch[1] : "";

  const classIdx = content.indexOf("public class");
  const beforeClass = classIdx >= 0 ? content.slice(0, classIdx) : "";
  const classPaths = [...beforeClass.matchAll(/@Path\("([^"]*)"\)/g)];
  const classBase = classPaths.length > 0 ? classPaths[classPaths.length - 1][1] : "";

  const endpoints: DescriptorEndpoint[] = [];
  const lines = content.split(/\r?\n/);
  let httpMethod: string | null = null;
  let subPath = "";

  for (const line of lines) {
    const hm = line.match(/@(GET|POST|PUT|DELETE|PATCH)\b/);
    if (hm) {
      httpMethod = hm[1];
      continue;
    }
    const pm = line.match(/@Path\("([^"]*)"\)/);
    if (pm) {
      subPath = pm[1];
      continue;
    }
    const sig = line.match(/public\s+Response\s+(\w+)\s*\(([^)]*)\)/);
    if (sig && httpMethod) {
      const methodName = sig[1];
      const params = sig[2];
      const requestFields = extractRequestFields(params, subpkg, dtoIndex);
      const responseClass = capitalize(methodName) + "Response";
      const responseFields = parseDtoFields(dtoIndex, subpkg, responseClass);

      endpoints.push({
        operation: methodName,
        method: httpMethod,
        path: normalizePath(APP_PATH + classBase + subPath),
        request_fields: requestFields,
        response_fields: responseFields,
      });
      httpMethod = null;
      subPath = "";
    }
  }
  return endpoints;
}

/**
 * Champs de la requête : soit les @QueryParam de la signature, soit les champs du
 * DTO Request référencé en corps.
 */
function extractRequestFields(
  params: string,
  subpkg: string,
  dtoIndex: Map<string, string>
): DescriptorField[] {
  if (/@QueryParam/.test(params)) {
    return [...params.matchAll(/@QueryParam\("([^"]+)"\)\s*([\w.<>]+)\s+\w+/g)].map((m) => ({
      name: m[1],
      type: mapType(m[2]),
      required: false,
    }));
  }
  const reqMatch = params.match(/(\w+Request)\s+\w+/);
  if (reqMatch) {
    return parseDtoFields(dtoIndex, subpkg, reqMatch[1]);
  }
  return [];
}

/**
 * Lit les champs plats (private <type> <name>;) d'un DTO donné.
 */
function parseDtoFields(
  dtoIndex: Map<string, string>,
  subpkg: string,
  className: string
): DescriptorField[] {
  const filePath = dtoIndex.get(`${subpkg}/${className}`) || dtoIndex.get(className);
  if (!filePath) return [];
  let content = "";
  try {
    content = readFileSyncCache.get(filePath) ?? "";
  } catch {
    return [];
  }
  const fields: DescriptorField[] = [];
  for (const m of content.matchAll(/^\s*private\s+(?!static)([\w.<>]+)\s+(\w+)\s*;/gm)) {
    fields.push({ name: m[2], type: mapType(m[1]), required: false });
  }
  return fields;
}

/**
 * Indexe les DTO par "<sous-package>/<Classe>" et par "<Classe>" et pré-charge
 * leur contenu.
 */
const readFileSyncCache = new Map<string, string>();

async function buildDtoIndex(javaFiles: string[]): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const dtoFiles = javaFiles.filter((f) => f.includes(`${path.sep}dto${path.sep}`));
  for (const file of dtoFiles) {
    const className = path.basename(file, ".java");
    const subpkg = path.basename(path.dirname(file));
    index.set(`${subpkg}/${className}`, file);
    if (!index.has(className)) index.set(className, file);
    readFileSyncCache.set(file, await fs.readFile(file, "utf-8"));
  }
  return index;
}

function mapType(javaType: string): string {
  const t = javaType.replace(/<.*>/, "").trim();
  switch (t) {
    case "String":
      return "String";
    case "long":
    case "Long":
      return "Long";
    case "int":
    case "Integer":
    case "short":
    case "byte":
      return "Integer";
    case "boolean":
    case "Boolean":
      return "Boolean";
    case "double":
    case "Double":
    case "float":
    case "Float":
      return "Double";
    case "BigDecimal":
      return "BigDecimal";
    default:
      return t;
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizePath(p: string): string {
  return ("/" + p.replace(/\\/g, "/")).replace(/\/+/g, "/");
}

function moduleRootOf(javaFile: string): string | null {
  const marker = `${path.sep}src${path.sep}main${path.sep}java${path.sep}`;
  const idx = javaFile.indexOf(marker);
  return idx >= 0 ? javaFile.slice(0, idx) : null;
}

async function collectFiles(dir: string, ext: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(d: string) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}
