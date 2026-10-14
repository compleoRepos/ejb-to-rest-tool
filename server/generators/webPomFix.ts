/**
 * Dépendances du socle dans le pom du module web.
 *
 * L'adaptateur n'importe du socle que `Envelope`, `ParsingException` (commons-services) et
 * `SynchroneService` (sop-connector-interfaces). Recopier toutes les dépendances `ma.eai.*` de l'EJB
 * ramène des artefacts inutiles au web, dont certains tirent un logback absent du dépôt Maven de la
 * banque (iso8583-client déclare logback-classic 0.9.26). Le web ne reprend donc que l'artefact qui
 * porte ces classes, tel que l'EJB le déclare, et chaque dépendance du socle exclut logback et log4j :
 * la journalisation est fournie par le serveur.
 */

export interface PomDependency {
  groupId: string;
  artifactId: string;
  body: string;
}

const ENVELOPE_CARRIER = "commons-services";
const SERVICE_CARRIERS = ["sop-connector-interfaces", "midw-integration"];

export const LOG_EXCLUSIONS: [string, string][] = [
  ["ch.qos.logback", "*"],
  ["log4j", "log4j"],
];

export function parseDependencies(section: string): PomDependency[] {
  const out: PomDependency[] = [];
  for (const m of section.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const groupId = m[1].match(/<groupId>\s*([^<\s]+)\s*<\/groupId>/)?.[1];
    const artifactId = m[1].match(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/)?.[1];
    if (groupId && artifactId) out.push({ groupId, artifactId, body: m[1] });
  }
  return out;
}

/**
 * Dépendances du socle à reporter dans le web, choisies parmi celles de l'EJB (hors test).
 * `sop-connector-interfaces` porte `SynchroneService` et tire `commons-services` ; à défaut,
 * `midw-integration` tire `sop-connector-interfaces`. `commons-services` est repris s'il est déclaré.
 * Sans aucun de ces artefacts, l'EJB hérite le framework de son parent, que le web partage : rien à reporter.
 */
export function selectSocleDependencies(ejbDependencies: PomDependency[]): PomDependency[] {
  const socle = ejbDependencies.filter(
    (d) => d.groupId.startsWith("ma.eai.") && !/<scope>\s*test\s*<\/scope>/.test(d.body)
  );
  const service = SERVICE_CARRIERS.map((a) => socle.find((d) => d.artifactId === a)).find(Boolean);
  if (!service) return [];
  const envelope = socle.find((d) => d.artifactId === ENVELOPE_CARRIER);
  return socle.filter((d) => d === service || d === envelope);
}

/** Bloc `<dependency>` du web : coordonnées et exclusions de l'EJB, scope provided, logback exclu. */
export function webDependencyBlock(dep: PomDependency): string {
  const version = dep.body.match(/<version>\s*([^<\s]+)\s*<\/version>/)?.[1];
  const lines = [
    "        <dependency>",
    `            <groupId>${dep.groupId}</groupId>`,
    `            <artifactId>${dep.artifactId}</artifactId>`,
  ];
  if (version) lines.push(`            <version>${version}</version>`);
  lines.push("            <scope>provided</scope>");
  lines.push(...exclusionLines(existingExclusions(dep.body)));
  lines.push("        </dependency>");
  return lines.join("\n");
}

function existingExclusions(body: string): [string, string][] {
  const block = body.match(/<exclusions>([\s\S]*?)<\/exclusions>/)?.[1] ?? "";
  const out: [string, string][] = [];
  for (const m of block.matchAll(/<exclusion>([\s\S]*?)<\/exclusion>/g)) {
    const g = m[1].match(/<groupId>\s*([^<\s]+)\s*<\/groupId>/)?.[1];
    const a = m[1].match(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/)?.[1];
    if (g && a) out.push([g, a]);
  }
  return out;
}

/**
 * Dépendance à l'EJB du dépôt sans logback ni log4j : l'EJB peut les déclarer en compile, le web ne
 * doit pas les voir. Sans effet sur l'EAR, qui embarque l'EJB depuis son propre module.
 */
export function withLogExclusions(block: string): string {
  const body = block.replace(/^<dependency>|<\/dependency>$/g, "");
  const kept = body.replace(/\s*<exclusions>[\s\S]*?<\/exclusions>/, "").replace(/\s+$/, "");
  return `<dependency>${kept}\n${exclusionLines(existingExclusions(body)).join("\n")}\n        </dependency>`;
}

function exclusionLines(existing: [string, string][]): string[] {
  const all = [...existing];
  for (const [g, a] of LOG_EXCLUSIONS) {
    if (!all.some(([eg, ea]) => eg === g && (ea === a || ea === "*"))) all.push([g, a]);
  }
  const lines = ["            <exclusions>"];
  for (const [g, a] of all) {
    lines.push(
      "                <exclusion>",
      `                    <groupId>${g}</groupId>`,
      `                    <artifactId>${a}</artifactId>`,
      "                </exclusion>"
    );
  }
  lines.push("            </exclusions>");
  return lines;
}

/**
 * Pom web avec, pour seul socle, la sélection reportée depuis l'EJB. Les autres dépendances `ma.eai.*`
 * sont retirées, sauf l'artefact EJB du dépôt ; les dépendances hors socle restent intactes.
 */
export function rewriteWebSocle(webPom: string, ejbPom: string, ejbArtifactId: string): string {
  const cleanEjb = ejbPom
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, "")
    .replace(/<profiles>[\s\S]*?<\/profiles>/g, "");
  const ejbSection = cleanEjb.match(/<dependencies>([\s\S]*?)<\/dependencies>/)?.[1] ?? "";
  const selected = selectSocleDependencies(parseDependencies(ejbSection));

  const dmStart = webPom.indexOf("<dependencyManagement>");
  const dmEnd = webPom.indexOf("</dependencyManagement>");
  const open = webPom.indexOf("<dependencies>", dmEnd >= 0 ? dmEnd : 0);
  const close = webPom.indexOf("</dependencies>", open);
  if (open < 0 || close < 0 || (dmStart >= 0 && open < dmStart)) return webPom;

  const kept: string[] = [];
  for (const m of webPom.slice(open + "<dependencies>".length, close).matchAll(/<dependency>[\s\S]*?<\/dependency>/g)) {
    const [dep] = parseDependencies(m[0]);
    if (!dep) continue;
    if (dep.groupId.startsWith("ma.eai.") && dep.artifactId !== ejbArtifactId) continue;
    kept.push("        " + (dep.artifactId === ejbArtifactId ? withLogExclusions(m[0]) : m[0]));
  }
  const blocks = [...kept, ...selected.map(webDependencyBlock)];
  const lineStart = webPom.lastIndexOf("\n", close) + 1;
  return (
    webPom.slice(0, open) +
    "<dependencies>\n" +
    blocks.join("\n\n") +
    "\n" +
    webPom.slice(lineStart)
  );
}
