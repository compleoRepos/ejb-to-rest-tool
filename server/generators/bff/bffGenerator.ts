/**
 * Générateur de couche API sur un dépôt de domaine issu de archetype-bff-api : ajoute à un
 * dépôt existant, sans toucher à ses fichiers d'origine, un port, un adaptateur et un
 * contrôleur par service exposé décrit au format 4.
 */
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { ZipArchive } from "archiver";
import { extractArchive } from "../archiveExtract";
import { BFF_COMMON_FILES } from "./bffCommonFiles";
import { parseBffDescriptor, type BffDescriptor } from "./bffDescriptor";
import { buildServiceModel, serviceFiles, type GeneratedFile, type ServiceModel } from "./bffServiceFiles";

const JAVA_ROOT = "src/main/java/ma/eai/msiboa/api";
const BLOCK_START = "# neobank-upstream:debut";
const BLOCK_END = "# neobank-upstream:fin";
const FIXED_DATE = new Date("2026-01-01T00:00:00Z");

export interface BffRepository {
  root: string;
  artifactId: string;
  modulePrefix: string;
  domain: string;
}

export interface BffGenerationReport {
  repository: string;
  domain: string;
  services: {
    name: string;
    route: string;
    operations: { fonction: string; method: string; route: string; idempotence: string; securite: string }[];
    excluded: { fonction: string; path: string; reason: string }[];
  }[];
  defaultSecurity: string[];
  written: string[];
  removed: string[];
}

/** Identifie le dépôt de domaine : artifactId `neobank-<domaine>-api` et présence des cinq modules. */
export async function readBffRepository(root: string): Promise<BffRepository> {
  let pom: string;
  try {
    pom = await fs.readFile(path.join(root, "pom.xml"), "utf-8");
  } catch {
    throw new Error("pom.xml absent à la racine du dépôt de domaine");
  }
  const own = pom.replace(/<parent>[\s\S]*?<\/parent>/, "");
  const artifactId = own.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] ?? "";
  const m = artifactId.match(/^neobank-(.+)-api$/);
  if (!m) throw new Error(`artifactId ${artifactId || "absent"} : un dépôt neobank-<domaine>-api est attendu`);
  const modulePrefix = artifactId.slice(0, -"-api".length);
  for (const module of [
    `${modulePrefix}-container`,
    `${modulePrefix}-application`,
    `${modulePrefix}-domain/${modulePrefix}-domain-core`,
    `${modulePrefix}-domain/${modulePrefix}-application-service`,
  ]) {
    try {
      await fs.access(path.join(root, module, "pom.xml"));
    } catch {
      throw new Error(`module ${module} absent : le dépôt ne vient pas de archetype-bff-api`);
    }
  }
  return { root, artifactId, modulePrefix, domain: m[1] };
}

/**
 * Génère la couche API dans le dépôt. Les fichiers d'une génération précédente sont retirés
 * avant écriture, de sorte que la sortie ne dépend que des descripteurs fournis.
 */
export async function generateBffLayer(root: string, descriptors: BffDescriptor[]): Promise<BffGenerationReport> {
  const repo = await readBffRepository(root);
  const names = new Set<string>();
  for (const d of descriptors) {
    if (d.bian.service_domain && d.bian.service_domain !== repo.domain) {
      throw new Error(`${d.adapter_name} relève du domaine ${d.bian.service_domain}, pas de ${repo.domain}`);
    }
    if (names.has(d.adapter_name)) throw new Error(`${d.adapter_name} fourni deux fois`);
    names.add(d.adapter_name);
  }

  const models = descriptors
    .map(buildServiceModel)
    .filter((m) => m.operations.length > 0)
    .sort((a, b) => a.key.localeCompare(b.key));

  const removed = await removePreviousGeneration(repo, models.length === 0);
  const files: GeneratedFile[] = [];
  if (models.length > 0) {
    for (const [rel, content] of Object.entries(BFF_COMMON_FILES)) {
      files.push({ path: rel.replace(/<P>/g, repo.modulePrefix), content });
    }
    for (const model of models) files.push(...serviceFiles(model, repo.modulePrefix));
  }
  for (const file of files) {
    const target = path.join(root, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content);
  }

  const resources = path.join(root, `${repo.modulePrefix}-container`, "src", "main", "resources");
  await writePropertiesBlock(path.join(resources, "application-dev.properties"), propertiesBlock(models, "dev"));
  await writePropertiesBlock(path.join(resources, "application-cloud.properties"), propertiesBlock(models, "cloud"));

  return report(repo, models, files, removed);
}

function propertiesBlock(models: ServiceModel[], profile: "dev" | "cloud"): string | null {
  if (models.length === 0) return null;
  const lines = [
    BLOCK_START,
    profile === "dev"
      ? "neobank.upstream.business-error-status=422"
      : "neobank.upstream.business-error-status=${neobank-upstream-business-error-status}",
    profile === "dev"
      ? "neobank.upstream.oauth2.enabled=false"
      : "neobank.upstream.oauth2.enabled=${NEOBANK_UPSTREAM_OAUTH2_ENABLED:false}",
    ...models.map((m) =>
      profile === "dev"
        ? `neobank.upstream.${m.key}.base-url=${m.descriptor.adapter_base_url}`
        : `neobank.upstream.${m.key}.base-url=\${neobank-upstream-${m.key}-base-url}`
    ),
    BLOCK_END,
  ];
  return lines.join("\n") + "\n";
}

/** Ajoute, remplace ou retire le bloc balisé en fin de fichier, sans toucher au reste. */
async function writePropertiesBlock(file: string, block: string | null): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(file, "utf-8");
  } catch {
    if (block === null) return;
    throw new Error(`${path.basename(file)} absent du module container`);
  }
  const start = content.indexOf("\n" + BLOCK_START);
  let base = content;
  if (start >= 0) {
    const end = content.indexOf(BLOCK_END, start);
    base = content.slice(0, start) + content.slice(end + BLOCK_END.length + 1);
  }
  const next = block === null ? base : base + "\n" + block;
  if (next !== content) await fs.writeFile(file, next);
}

async function removePreviousGeneration(repo: BffRepository, removeCommon: boolean): Promise<string[]> {
  const p = repo.modulePrefix;
  const container = path.join(repo.root, `${p}-container`, JAVA_ROOT, "integration");
  const segments: string[] = [];
  for (const entry of await readDirSafe(container)) {
    if (!entry.isDirectory() || entry.name === "upstream") continue;
    const files = await readDirSafe(path.join(container, entry.name));
    if (files.some((f) => f.isFile() && f.name.endsWith("RestAdapter.java"))) segments.push(entry.name);
  }
  const targets: string[] = [];
  for (const seg of segments) {
    targets.push(
      `${p}-container/${JAVA_ROOT}/integration/${seg}`,
      `${p}-container/src/test/java/ma/eai/msiboa/api/integration/${seg}`,
      `${p}-application/${JAVA_ROOT}/application/${seg}`,
      `${p}-domain/${p}-application-service/${JAVA_ROOT}/domain/${seg}`
    );
  }
  targets.push(`${p}-domain/${p}-application-service/${JAVA_ROOT}/domain/ports/output/client`);
  if (removeCommon) {
    targets.push(...Object.keys(BFF_COMMON_FILES).map((rel) => rel.replace(/<P>/g, p)));
    targets.push(`${p}-container/${JAVA_ROOT}/integration/upstream`);
  }
  const removed: string[] = [];
  for (const rel of targets) {
    const full = path.join(repo.root, rel);
    try {
      await fs.access(full);
    } catch {
      continue;
    }
    await fs.rm(full, { recursive: true, force: true });
    removed.push(rel);
  }
  return removed;
}

async function readDirSafe(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function report(
  repo: BffRepository,
  models: ServiceModel[],
  files: GeneratedFile[],
  removed: string[]
): BffGenerationReport {
  const defaultSecurity: string[] = [];
  return {
    repository: repo.artifactId,
    domain: repo.domain,
    services: models.map((m) => ({
      name: m.descriptor.adapter_name,
      route: `/api/v1/${m.key}`,
      operations: m.operations.map((op) => {
        if (op.defaultSecurity) defaultSecurity.push(`${m.key}.${op.methodName}`);
        return {
          fonction: op.endpoint.fonction,
          method: op.endpoint.method,
          route: `/api/v1/${m.key}${op.route}`,
          idempotence: op.endpoint.idempotence,
          securite: op.securityResource,
        };
      }),
      excluded: m.excluded,
    })),
    defaultSecurity,
    written: files.map((f) => f.path).sort(),
    removed,
  };
}

/** Rapport lisible, rendu à côté du zip et jamais déposé dans le dépôt. */
export function formatBffReport(r: BffGenerationReport): string {
  const lines = [`Depot ${r.repository}, domaine ${r.domain}`, ""];
  for (const s of r.services) {
    lines.push(`${s.name} -> ${s.route}`);
    for (const op of s.operations) {
      lines.push(`  ${op.method.padEnd(6)} ${op.route}  ${op.fonction}  idempotence=${op.idempotence}  ressource=${op.securite}`);
    }
    for (const ex of s.excluded) lines.push(`  exclue  ${ex.path}  ${ex.fonction}  (${ex.reason})`);
    lines.push("");
  }
  if (r.services.length === 0) lines.push("Aucun service a generer, depot laisse sans couche API.", "");
  if (r.defaultSecurity.length > 0) {
    lines.push(`Ressource de securite par defaut sur ${r.defaultSecurity.length} operations, a remplacer :`);
    lines.push(...r.defaultSecurity.map((o) => `  ${o}`), "");
  }
  lines.push(`${r.written.length} fichiers ecrits, ${r.removed.length} emplacements d'une generation precedente retires.`);
  return lines.join("\n") + "\n";
}

/**
 * Chaîne complète sur archives : extrait le dépôt, lit les descripteurs, génère, et range le
 * dépôt dans un zip au même nom de dossier racine.
 */
export async function generateBffFromArchive(
  repositoryZip: string,
  descriptorFiles: string[],
  workDir: string
): Promise<{ zipPath: string; report: BffGenerationReport; reportText: string }> {
  const extractDir = path.join(workDir, "depot");
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  await extractArchive(repositoryZip, extractDir);
  const entries = (await fs.readdir(extractDir, { withFileTypes: true })).filter((e) => !e.name.startsWith("."));
  const root =
    entries.length === 1 && entries[0].isDirectory() ? path.join(extractDir, entries[0].name) : extractDir;

  const descriptors: BffDescriptor[] = [];
  for (const file of descriptorFiles) {
    const raw = JSON.parse(await fs.readFile(file, "utf-8"));
    descriptors.push(parseBffDescriptor(raw, path.basename(file)));
  }
  const report = await generateBffLayer(root, descriptors);
  const zipPath = path.join(workDir, `${report.repository}.zip`);
  await packDirectory(root, zipPath, report.repository);
  return { zipPath, report, reportText: formatBffReport(report) };
}

/** Zip à séparateurs `/`, entrées triées et datées à l'identique, pour des sorties comparables. */
export async function packDirectory(dir: string, zipPath: string, rootName: string): Promise<void> {
  const files: string[] = [];
  async function walk(d: string, rel: string) {
    for (const e of (await fs.readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(d, e.name), r);
      else if (e.isFile()) files.push(r);
    }
  }
  await walk(dir, "");
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", (err: Error) => reject(err));
    archive.pipe(output);
    for (const rel of files) {
      archive.file(path.join(dir, ...rel.split("/")), { name: `${rootName}/${rel}`, date: FIXED_DATE });
    }
    archive.finalize();
  });
}
