/**
 * Conserve les poms du dépôt d'origine dans le projet adaptateur.
 *
 * Le moteur produit un agrégateur <nom>-pom-rest et un pom EAR neufs : ils perdent ce que le dépôt porte
 * pour la chaîne de livraison (artifactId de l'agrégateur, bloc scm, repository-name, was_application_name,
 * paramétrage hérité du parent). Le projet livré remplace le dépôt, ses poms doivent donc rester ceux du
 * dépôt. Ce correctif :
 * - reprend le pom racine d'origine et y ajoute seulement le module web ;
 * - reprend le pom d'origine du module EJB, sans réalignement de parent ;
 * - reprend le pom EAR d'origine et y ajoute la dépendance au WAR et sa racine de contexte ;
 * - rattache le pom web au parent d'origine, avec ses propres versions (reprises de l'agrégateur
 *   généré), son niveau Java et son encodage, pour ne rien imposer au reste du projet.
 */
import fs from "fs/promises";
import path from "path";

export interface PomPreservationReport {
  restored: string[];
  skipped: string[];
}

export async function restoreOriginalPoms(outputDir: string, inputPath: string): Promise<PomPreservationReport> {
  const report: PomPreservationReport = { restored: [], skipped: [] };
  const originalRoot = await readIfExists(path.join(inputPath, "pom.xml"));
  const generatedRoot = await readIfExists(path.join(outputDir, "pom.xml"));
  if (!originalRoot || !generatedRoot) {
    report.skipped.push("pom racine d'origine ou genere introuvable");
    return report;
  }
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const web = dirs.find((d) => d.toLowerCase().endsWith("-web"));
  const ejb = dirs.find((d) => d.toLowerCase().endsWith("-ejb"));
  const ear = dirs.find((d) => d.toLowerCase().endsWith("-ear"));
  if (!web || !ejb || !ear) {
    report.skipped.push("modules web, ejb ou ear introuvables");
    return report;
  }
  const originalModules = [...originalRoot.matchAll(/<module>\s*([^<\s]+)\s*<\/module>/g)].map((m) => m[1]);
  if (!originalModules.includes(ejb) || !originalModules.includes(ear)) {
    report.skipped.push("le pom racine d'origine ne declare pas les modules ejb et ear attendus");
    return report;
  }

  const parent = projectCoordinates(originalRoot);
  if (!parent) {
    report.skipped.push("coordonnees du pom racine d'origine introuvables");
    return report;
  }
  const managed = managedDependencies(generatedRoot);

  await fs.writeFile(path.join(outputDir, "pom.xml"), addModule(originalRoot, web, ejb), "utf-8");
  report.restored.push("pom.xml");

  const ejbOriginal = await readIfExists(path.join(inputPath, ejb, "pom.xml"));
  if (ejbOriginal) {
    await fs.writeFile(path.join(outputDir, ejb, "pom.xml"), ejbOriginal, "utf-8");
    report.restored.push(`${ejb}/pom.xml`);
  }

  const earOriginal = await readIfExists(path.join(inputPath, ear, "pom.xml"));
  const earGenerated = await readIfExists(path.join(outputDir, ear, "pom.xml"));
  if (earOriginal && earGenerated) {
    const contextRoot = earGenerated.match(/<contextRoot>\s*([^<\s]+)\s*<\/contextRoot>/)?.[1] ?? `/${web.replace(/-web$/i, "")}`;
    const webGroup = projectGroupId(earGenerated) ?? parent.groupId;
    await fs.writeFile(path.join(outputDir, ear, "pom.xml"), extendEarPom(earOriginal, webGroup, web, contextRoot), "utf-8");
    report.restored.push(`${ear}/pom.xml`);
  }

  const webPomPath = path.join(outputDir, web, "pom.xml");
  const webPom = await readIfExists(webPomPath);
  if (webPom) {
    await fs.writeFile(webPomPath, attachWebPom(webPom, parent, managed), "utf-8");
    report.restored.push(`${web}/pom.xml`);
  }
  return report;
}

interface Coordinates {
  groupId: string;
  artifactId: string;
  version: string;
}

interface Managed {
  groupId: string;
  artifactId: string;
  version?: string;
  scope?: string;
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf-8");
  } catch {
    return null;
  }
}

function withoutParent(pom: string): string {
  return pom.replace(/<parent>[\s\S]*?<\/parent>/, "");
}

/** Coordonnées propres d'un pom, groupId et version hérités du parent quand ils sont absents. */
export function projectCoordinates(pom: string): Coordinates | null {
  const own = withoutParent(pom).replace(/<(dependencies|dependencyManagement|build|profiles|modules|properties|scm|distributionManagement|reporting)>[\s\S]*?<\/\1>/g, "");
  const parentBlock = pom.match(/<parent>([\s\S]*?)<\/parent>/)?.[1] ?? "";
  const tag = (src: string, t: string) => src.match(new RegExp(`<${t}>\\s*([^<\\s]+)\\s*</${t}>`))?.[1];
  const artifactId = tag(own, "artifactId");
  const groupId = tag(own, "groupId") ?? tag(parentBlock, "groupId");
  const version = tag(own, "version") ?? tag(parentBlock, "version");
  return artifactId && groupId && version ? { groupId, artifactId, version } : null;
}

function projectGroupId(pom: string): string | null {
  return projectCoordinates(pom)?.groupId ?? null;
}

export function managedDependencies(pom: string): Managed[] {
  const block = pom.match(/<dependencyManagement>([\s\S]*?)<\/dependencyManagement>/)?.[1] ?? "";
  const out: Managed[] = [];
  for (const m of block.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const t = (name: string) => m[1].match(new RegExp(`<${name}>\\s*([^<\\s]+)\\s*</${name}>`))?.[1];
    const groupId = t("groupId");
    const artifactId = t("artifactId");
    if (groupId && artifactId) out.push({ groupId, artifactId, version: t("version"), scope: t("scope") });
  }
  return out;
}

/** Ajoute le module web juste après le module EJB, dans le style d'indentation du pom. */
export function addModule(pom: string, web: string, ejb: string): string {
  if (new RegExp(`<module>\\s*${web}\\s*</module>`).test(pom)) return pom;
  return pom.replace(
    new RegExp(`([ \\t]*)<module>\\s*${ejb}\\s*</module>(\\r?\\n)`),
    (m, indent: string, nl: string) => `${m}${indent}<module>${web}</module>${nl}`
  );
}

/** Pom EAR d'origine, plus la dépendance au WAR et sa racine de contexte. */
export function extendEarPom(pom: string, groupId: string, web: string, contextRoot: string): string {
  if (pom.includes(`<artifactId>${web}</artifactId>`)) return pom;
  const nl = pom.includes("\r\n") ? "\r\n" : "\n";
  const unit = pom.match(/\n([ \t]+)<modelVersion>/)?.[1] ?? "\t";
  const i = (n: number) => unit.repeat(n);
  const dependency = [
    `${i(2)}<dependency>`,
    `${i(3)}<groupId>${groupId}</groupId>`,
    `${i(3)}<artifactId>${web}</artifactId>`,
    `${i(3)}<version>\${project.version}</version>`,
    `${i(3)}<type>war</type>`,
    `${i(2)}</dependency>`,
  ].join(nl);
  let out = pom.replace(/([ \t]*)<\/dependencies>/, (m) => `${dependency}${nl}${m}`);
  const plugin = [
    `${i(2)}<plugins>`,
    `${i(3)}<plugin>`,
    `${i(4)}<groupId>org.apache.maven.plugins</groupId>`,
    `${i(4)}<artifactId>maven-ear-plugin</artifactId>`,
    `${i(4)}<configuration>`,
    `${i(5)}<modules>`,
    `${i(6)}<webModule>`,
    `${i(7)}<groupId>${groupId}</groupId>`,
    `${i(7)}<artifactId>${web}</artifactId>`,
    `${i(7)}<contextRoot>${contextRoot}</contextRoot>`,
    `${i(6)}</webModule>`,
    `${i(5)}</modules>`,
    `${i(4)}</configuration>`,
    `${i(3)}</plugin>`,
    `${i(2)}</plugins>`,
  ].join(nl);
  if (/<build>[\s\S]*?<\/build>/.test(out)) {
    out = out.replace(/([ \t]*)<\/build>/, (m) => `${plugin}${nl}${m}`);
  } else {
    out = out.replace(/([ \t]*)<dependencies>/, (m) => `${i(1)}<build>${nl}${plugin}${nl}${i(1)}</build>${nl}${m}`);
  }
  return out;
}

/** Pom web rattaché au parent d'origine, versions et niveau Java portés par le module lui-même. */
export function attachWebPom(pom: string, parent: Coordinates, managed: Managed[]): string {
  let out = pom.replace(
    /<parent>[\s\S]*?<\/parent>/,
    `<parent>\n        <groupId>${parent.groupId}</groupId>\n        <artifactId>${parent.artifactId}</artifactId>\n        <version>${parent.version}</version>\n    </parent>`
  );
  out = out.replace(/<dependency>([\s\S]*?)<\/dependency>/g, (whole, body: string) => {
    if (/<version>/.test(body)) return whole;
    const g = body.match(/<groupId>\s*([^<\s]+)\s*<\/groupId>/)?.[1];
    const a = body.match(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/)?.[1];
    const m = managed.find((x) => x.groupId === g && x.artifactId === a);
    if (!m || !m.version) return whole;
    const indent = body.match(/\n([ \t]*)<artifactId>/)?.[1] ?? "            ";
    let add = `\n${indent}<version>${m.version}</version>`;
    if (m.scope && !/<scope>/.test(body)) add += `\n${indent}<scope>${m.scope}</scope>`;
    return whole.replace(/(<artifactId>[^<]*<\/artifactId>)/, `$1${add}`);
  });
  const wanted: [string, string][] = [
    ["maven.compiler.source", "1.8"],
    ["maven.compiler.target", "1.8"],
    ["project.build.sourceEncoding", "UTF-8"],
  ];
  const missing = wanted.filter(([k]) => !out.includes(`<${k}>`));
  if (missing.length === 0) return out;
  const lines = missing.map(([k, v]) => `        <${k}>${v}</${k}>`).join("\n");
  if (/<properties>/.test(out)) {
    return out.replace(/<properties>\s*\n/, (m) => `${m}${lines}\n`);
  }
  return out.replace(/(<packaging>[^<]*<\/packaging>\s*\n)/, `$1\n    <properties>\n${lines}\n    </properties>\n`);
}
