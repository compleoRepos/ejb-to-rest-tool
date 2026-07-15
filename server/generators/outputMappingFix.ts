/**
 * Post-traitement du projet adaptateur généré par le JAR jaxrs-wrapper-generator.
 *
 * Le JAR expose correctement les endpoints (lookup JNDI, Envelope d'entrée), mais
 * son mapping de SORTIE est scalaire : il lit `flux/code` / `flux/message` et
 * retombe sur un rawBody. Pour les fonctions qui renvoient un flux réel (liste de
 * cartes, objets…), le code retour porte d'autres noms (CODRET, codeRetour) et les
 * données ne sont jamais extraites — la resource renvoie alors 500 ou une réponse
 * vide.
 *
 * Ce post-traitement aligne la sortie sur la couche adaptateur validée à la main
 * (fork demande-dotation, 200 OK) : lecture du corps via getBody() avec repli sur
 * toString(), localisation de l'élément Flux même imbriqué, et conversion générique
 * du flux en structure JSON. Il ne touche pas au JAR : les autres correctifs du
 * générateur restent intacts.
 */
import fs from "fs/promises";
import path from "path";

const ENVELOPE_JSON_TEMPLATE = (converterPackage: string): string => `package ${converterPackage};

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import ma.eai.commons.services.parsing.Envelope;

/**
 * Conversion générique du flux de sortie d'une Envelope en structure JSON.
 * Le corps est lu via getBody() avec repli sur toString(), et l'élément Flux
 * est localisé même s'il est imbriqué sous une enveloppe de transport.
 */
public final class EnvelopeJson {

    private EnvelopeJson() {
    }

    public static Object toJson(Envelope envelope) {
        String body = null;
        try {
            body = envelope.getBody();
        } catch (Exception ignored) {
            body = null;
        }
        if (body == null || body.trim().isEmpty()) {
            body = envelope.toString();
        }
        return fromXml(body);
    }

    static Object fromXml(String xml) {
        if (xml == null || xml.trim().isEmpty()) {
            return new LinkedHashMap<String, Object>();
        }
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
            Element flux = locateFlux(doc);
            return elementToValue(flux);
        } catch (Exception e) {
            Map<String, Object> fallback = new LinkedHashMap<String, Object>();
            fallback.put("rawBody", xml);
            return fallback;
        }
    }

    private static Element locateFlux(Document doc) {
        Element root = doc.getDocumentElement();
        if (root != null && "flux".equalsIgnoreCase(root.getNodeName())) {
            return root;
        }
        NodeList byName = doc.getElementsByTagName("Flux");
        if (byName.getLength() == 0) {
            byName = doc.getElementsByTagName("flux");
        }
        return (byName.getLength() > 0) ? (Element) byName.item(0) : root;
    }

    @SuppressWarnings("unchecked")
    private static Object elementToValue(Element element) {
        List<Element> children = childElements(element);
        if (children.isEmpty()) {
            String text = element.getTextContent();
            return text == null ? "" : text.trim();
        }
        Map<String, Object> map = new LinkedHashMap<String, Object>();
        for (Element child : children) {
            String name = child.getNodeName();
            Object value = elementToValue(child);
            if (map.containsKey(name)) {
                Object existing = map.get(name);
                List<Object> list;
                if (existing instanceof List) {
                    list = (List<Object>) existing;
                } else {
                    list = new ArrayList<Object>();
                    list.add(existing);
                    map.put(name, list);
                }
                list.add(value);
            } else {
                map.put(name, value);
            }
        }
        return map;
    }

    private static List<Element> childElements(Element parent) {
        List<Element> result = new ArrayList<Element>();
        NodeList nodes = parent.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) {
            Node n = nodes.item(i);
            if (n.getNodeType() == Node.ELEMENT_NODE) {
                result.add((Element) n);
            }
        }
        return result;
    }
}
`;

const IS_ERROR_METHOD = `        return "000".equals(code);
    }

    /**
     * Indique si le code retour correspond à une erreur métier/technique connue.
     * Un code absent ou non répertorié n'est pas traité comme une erreur : la
     * réponse porte alors les données du flux avec un statut 200.
     */
    public static boolean isError(String code) {
        if (code == null || code.trim().isEmpty()) {
            return false;
        }
        Response.Status status = CODE_MAP.get(code);
        return status != null && status != Response.Status.OK;
    }`;

/**
 * Applique le correctif de mapping de sortie à un projet adaptateur généré.
 * Retourne la liste des fichiers modifiés/ajoutés (pour traçabilité/tests).
 */
export async function applyOutputMappingFix(outputDir: string): Promise<string[]> {
  const touched: string[] = [];
  const javaFiles = await collectJavaFiles(outputDir);

  const resourceFiles = javaFiles.filter((f) => f.endsWith("Resource.java"));
  const converterFiles = javaFiles.filter((f) => f.endsWith("Converter.java"));
  const codeMapperFiles = javaFiles.filter((f) => f.endsWith("CodeMapper.java"));

  const converterPackages = new Set<string>();

  for (const resource of resourceFiles) {
    const changed = await patchResource(resource);
    if (changed) touched.push(resource);
  }

  for (const converter of converterFiles) {
    const dir = path.dirname(converter);
    const pkg = await readPackage(converter);
    if (!pkg) continue;
    if (converterPackages.has(pkg)) continue;
    converterPackages.add(pkg);
    const envelopeJsonPath = path.join(dir, "EnvelopeJson.java");
    await fs.writeFile(envelopeJsonPath, ENVELOPE_JSON_TEMPLATE(pkg), "utf-8");
    touched.push(envelopeJsonPath);
  }

  for (const codeMapper of codeMapperFiles) {
    const changed = await patchCodeMapper(codeMapper);
    if (changed) touched.push(codeMapper);
  }

  return touched;
}

async function patchResource(file: string): Promise<boolean> {
  let content = await fs.readFile(file, "utf-8");
  const original = content;

  const basePackage = readPackageFromContent(content)?.replace(/\.resource$/, "");
  if (!basePackage) return false;
  const converterPackage = `${basePackage}.converter`;

  // Assouplir le gate : seul un code d'erreur explicite renvoie une erreur HTTP.
  content = content.split("if (!CodeMapper.isSuccess(code)) {").join("if (CodeMapper.isError(code)) {");

  // Renvoyer le flux converti en JSON générique plutôt que le DTO scalaire.
  content = content.split("return Response.ok(response).build();").join("return Response.ok(EnvelopeJson.toJson(envelopeOut)).build();");

  // Importer le helper (une seule fois, après l'import du converter typé).
  if (!content.includes(`import ${converterPackage}.EnvelopeJson;`)) {
    content = content.replace(
      /(import\s+[\w.]+\.converter\.\w+Converter;\n)/,
      `$1import ${converterPackage}.EnvelopeJson;\n`
    );
  }

  if (content === original) return false;
  await fs.writeFile(file, content, "utf-8");
  return true;
}

async function patchCodeMapper(file: string): Promise<boolean> {
  const content = await fs.readFile(file, "utf-8");
  if (content.includes("public static boolean isError(")) return false;
  if (!content.includes(`return "000".equals(code);`)) return false;
  const patched = content.replace(
    `        return "000".equals(code);\n    }`,
    IS_ERROR_METHOD
  );
  if (patched === content) return false;
  await fs.writeFile(file, patched, "utf-8");
  return true;
}

async function readPackage(file: string): Promise<string | null> {
  const content = await fs.readFile(file, "utf-8");
  return readPackageFromContent(content);
}

function readPackageFromContent(content: string): string | null {
  const m = content.match(/^package\s+([\w.]+);/m);
  return m ? m[1] : null;
}

/**
 * Inclut les modules source d'origine (EJB et EAR) dans le projet adaptateur
 * généré, pour garder le projet d'entrée ISO et rendre le réacteur auto-suffisant :
 * - modules `*-ejb` : clonés et déclarés dans le pom parent (dépendance de l'EAR
 *   adaptateur → build du réacteur complet sans jar EJB pré-installé) ;
 * - modules `*-ear` : clonés « pour tout garder ensemble » (non ajoutés aux
 *   modules : c'est l'EAR adaptateur généré qui assemble l'adaptateur), et leur
 *   `.ear` pré-buildé (présent dans leur `target/`) est déposé dans le module web.
 * Ne fait rien si l'entrée ne contient pas de tels modules (projets mono-module).
 */
export async function includeSourceModules(outputDir: string, inputPath: string): Promise<string[]> {
  const touched: string[] = [];
  if (!inputPath) return touched;

  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(inputPath, { withFileTypes: true });
  } catch {
    return touched;
  }

  const parentPomPath = path.join(outputDir, "pom.xml");
  let parentPom = "";
  try {
    parentPom = await fs.readFile(parentPomPath, "utf-8");
  } catch {
    parentPom = "";
  }

  // Répertoire du module web généré (pour y déposer le .ear pré-buildé).
  let webModuleDir: string | null = null;
  try {
    const outEntries = await fs.readdir(outputDir, { withFileTypes: true });
    const web = outEntries.find((e) => e.isDirectory() && e.name.toLowerCase().endsWith("-web"));
    webModuleDir = web ? path.join(outputDir, web.name) : null;
  } catch {
    webModuleDir = null;
  }

  const modulesToAdd: string[] = [];

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const lower = e.name.toLowerCase();
    const isEjb = lower.endsWith("-ejb");
    const isEar = lower.endsWith("-ear");
    if (!isEjb && !isEar) continue;

    const srcModule = path.join(inputPath, e.name);
    if (!(await fileExists(path.join(srcModule, "pom.xml")))) continue;

    // Cloner le module source (hors target) s'il n'est pas déjà présent.
    const destModule = path.join(outputDir, e.name);
    if (!(await fileExists(destModule))) {
      await copyDir(srcModule, destModule);
      touched.push(destModule);
    }

    // Seul l'EJB rejoint le réacteur (dépendance de l'EAR adaptateur).
    if (isEjb && parentPom.includes("<modules>") && !parentPom.includes(`<module>${e.name}</module>`)) {
      modulesToAdd.push(e.name);
    }

    // Déposer le .ear pré-buildé du module EAR d'entrée dans le module web.
    if (isEar && webModuleDir) {
      const earFile = await findFirstEar(path.join(srcModule, "target"));
      if (earFile) {
        const dest = path.join(webModuleDir, path.basename(earFile));
        if (!(await fileExists(dest))) {
          await fs.copyFile(earFile, dest);
          touched.push(dest);
        }
      }
    }
  }

  if (modulesToAdd.length > 0 && parentPom.includes("<modules>")) {
    const insertion = modulesToAdd.map((m) => `        <module>${m}</module>`).join("\n") + "\n";
    parentPom = parentPom.replace("<modules>\n", `<modules>\n${insertion}`);
    await fs.writeFile(parentPomPath, parentPom, "utf-8");
    touched.push(parentPomPath);
  }

  return touched;
}

/**
 * Aligne les dépendances du pom web sur l'adaptateur validé à la main en retirant
 * les dépendances superflues ajoutées par le générateur :
 * - `ma.eai.commons:eai-commons-services` et `ma.eai.midw:eai-midw-connectors` :
 *   déclarées sans version ni gestion → cassent le build (« version is missing ») ;
 *   inutiles car Envelope/SynchroneService arrivent transitivement via `*-ejb`.
 * - `org.slf4j:slf4j-jdk14` : binding de log absent de l'adaptateur validé
 *   (seul `slf4j-api` est requis) et non résolu en build offline.
 */
export async function fixWebPomDependencies(outputDir: string): Promise<string[]> {
  const touched: string[] = [];
  const artifactIds = ["eai-commons-services", "eai-midw-connectors", "slf4j-jdk14"];

  const pomFiles = await collectPomFiles(outputDir);
  for (const pom of pomFiles) {
    if (!pom.replace(/\\/g, "/").toLowerCase().includes("-web/pom.xml")) continue;
    let content = await fs.readFile(pom, "utf-8");
    const original = content;
    for (const artifactId of artifactIds) {
      const block = new RegExp(
        `\\s*<dependency>(?:(?!</dependency>)[\\s\\S])*?<artifactId>${artifactId}</artifactId>(?:(?!</dependency>)[\\s\\S])*?</dependency>`,
        "g"
      );
      content = content.replace(block, "");
    }
    if (content !== original) {
      await fs.writeFile(pom, content, "utf-8");
      touched.push(pom);
    }
  }
  return touched;
}

/**
 * Fixe le `finalName` du module EAR sur l'artifactId (sans version), comme le pom
 * d'entrée. Sinon Maven produit `<artifactId>-<version>.ear` alors que le Dockerfile
 * généré copie `<artifactId>.ear` → le COPY Docker échoue.
 */
export async function fixEarFinalName(outputDir: string): Promise<string[]> {
  const touched: string[] = [];
  const pomFiles = await collectPomFiles(outputDir);
  for (const pom of pomFiles) {
    if (!pom.replace(/\\/g, "/").toLowerCase().includes("-ear/pom.xml")) continue;
    const content = await fs.readFile(pom, "utf-8");
    if (content.includes("<finalName>") || !content.includes("<build>")) continue;
    const patched = content.replace(
      /<build>(\s*\n)/,
      `<build>$1        <finalName>\${project.artifactId}</finalName>\n`
    );
    if (patched !== content) {
      await fs.writeFile(pom, patched, "utf-8");
      touched.push(pom);
    }
  }
  return touched;
}

const DOCKERFILE = `ARG WAS_IMAGE=icr.io/appcafe/websphere-traditional:9.0.5.14
FROM \${WAS_IMAGE}
USER root
RUN mkdir -p /app/logs && chown -R was:root /app && chmod -R g+w /app
USER was
COPY --chown=was:root libs/ /opt/IBM/WebSphere/AppServer/lib/ext/
COPY --chown=was:root app.ear /work/app.ear
COPY --chown=was:root install_app.py /work/install_app.py
RUN /opt/IBM/WebSphere/AppServer/bin/wsadmin.sh -lang jython -conntype NONE -f /work/install_app.py
EXPOSE 9080 9443 9060 9043
`;

const INSTALL_APP = (appName: string): string => `ear     = '/work/app.ear'
appName = '${appName}'

cell = AdminConfig.list('Cell')

print 'Ajout des alias hote (ports du banc) au default_host'
vhost = AdminConfig.getid('/VirtualHost:default_host/')
for p in ['9081', '9082', '9083', '9084', '9085', '9086', '9087', '9088', '9089', '9090']:
    try:
        AdminConfig.create('HostAlias', vhost, [['hostname', '*'], ['port', p]])
    except:
        pass

template = None
for t in AdminConfig.listTemplates('JDBCProvider').splitlines():
    if 'Derby JDBC Provider (XA)(templates/system' in t and 'jdbc-resource-provider-templates.xml' in t:
        template = t.strip()
        break

print 'Creation du provider JDBC Derby XA'
jdbc = AdminConfig.createUsingTemplate('JDBCProvider', cell, [['name', 'DerbyXA-ebankdirect']], template)

print 'Creation de la DataSource jdbc/ebankdirect_xa'
ds = AdminTask.createDatasource(jdbc, [
    '-name', 'ebankdirect_xa',
    '-jndiName', 'jdbc/ebankdirect_xa',
    '-dataStoreHelperClassName', 'com.ibm.websphere.rsadapter.DerbyDataStoreHelper',
    '-componentManagedAuthenticationAlias', '',
    '-configureResourceProperties', [['databaseName', 'java.lang.String', '/work/ebankdb']]])
propSet = AdminConfig.showAttribute(ds, 'propertySet')
AdminConfig.create('J2EEResourceProperty', propSet, [['name', 'createDatabase'], ['type', 'java.lang.String'], ['value', 'create']])

print 'Installation de %s' % appName
AdminApp.install(ear, ['-appname', appName, '-MapWebModToVH', [['.*', '.*', 'default_host']], '-usedefaultbindings'])
AdminConfig.save()
print 'Installation terminee'
`;

const RUN_LOCAL = (opts: { ejb: string; ear: string; earFile: string; app: string }): string => `#!/usr/bin/env bash
#
# Deploiement local sur WebSphere traditional (Docker) : build -> libs -> EAR ->
# image -> run -> attente du demarrage. API sur http://localhost:\${HOST_PORT}/${opts.app}/api
#
set -euo pipefail

WEB_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$WEB_DIR/.." && pwd)"
EJB_MODULE="${opts.ejb}"
EAR_MODULE="${opts.ear}"
EAR_FILE="${opts.earFile}"
APP_CONTEXT="${opts.app}"
IMAGE="${opts.app}-local:latest"
CONTAINER="${opts.app}-local"
HOST_PORT="\${HOST_PORT:-9080}"
WAS_IMAGE="\${WAS_IMAGE:-icr.io/appcafe/websphere-traditional:9.0.5.14}"
DEP_PLUGIN="org.apache.maven.plugins:maven-dependency-plugin:2.8"
SERVER_APIS="jsr311-api javaee-api javax.servlet-api servlet-api javax.json-api javax.json-1"

MVN="\${MVN:-mvn}"
if ! command -v "$MVN" >/dev/null 2>&1; then
    for c in "/c/Users/$USERNAME/tools/apache-maven-3.9.9/bin/mvn" "/c/Users/Pro/tools/apache-maven-3.9.9/bin/mvn"; do
        [ -f "$c" ] && MVN="$c" && break
    done
fi

echo "=== Build (mvn install) ==="
( cd "$PROJECT_DIR" && "$MVN" -o -q clean install -DskipTests )

echo "=== Peuplement libs/ ==="
rm -rf "$WEB_DIR/libs" && mkdir -p "$WEB_DIR/libs"
( cd "$PROJECT_DIR" && "$MVN" -o -q -pl "$EJB_MODULE" "\${DEP_PLUGIN}:copy-dependencies" -DincludeScope=compile -DoutputDirectory="$WEB_DIR/libs" )
for api in $SERVER_APIS; do rm -f "$WEB_DIR/libs/\${api}"*.jar; done
rm -f "$WEB_DIR/libs/"eai-fwk-logging-cloud*.jar

echo "=== Copie EAR ==="
cp "$PROJECT_DIR/$EAR_MODULE/target/$EAR_FILE" "$WEB_DIR/app.ear"

echo "=== docker build + run ==="
docker build --build-arg WAS_IMAGE="$WAS_IMAGE" -t "$IMAGE" "$WEB_DIR"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -p "\${HOST_PORT}:9080" -p 9443:9443 "$IMAGE" >/dev/null

echo "=== Attente du demarrage ==="
BASE="http://localhost:\${HOST_PORT}/$APP_CONTEXT/api"
for i in $(seq 1 60); do
    code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$BASE" 2>/dev/null || echo 000)
    [ "$code" != "000" ] && break
    sleep 5
done
echo "Serveur demarre. API: $BASE"
echo "Endpoints de test (mock, suffixe --tst), ex: $BASE/synchrone/test/lstcrts--tst"
`;

/**
 * Remplace les scripts de deploiement generes (stubs non fonctionnels) par
 * l'outillage valide de bout en bout : Dockerfile (WAS icr.io, /app/logs
 * inscriptible, libs framework en lib/ext), install_app.py (DataSource Derby XA
 * jdbc/ebankdirect_xa + install), run-local.sh (build -> libs -> EAR -> Docker).
 */
export async function writeDeployTooling(outputDir: string): Promise<string[]> {
  const touched: string[] = [];
  const entries = await fs.readdir(outputDir, { withFileTypes: true });

  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const webName = dirs.find((d) => d.toLowerCase().endsWith("-web"));
  const ejbName = dirs.find((d) => d.toLowerCase().endsWith("-ejb"));
  const earName = dirs.find((d) => d.toLowerCase().endsWith("-ear"));
  if (!webName || !ejbName || !earName) {
    const missing = [
      webName ? null : "-web",
      ejbName ? null : "-ejb",
      earName ? null : "-ear",
    ].filter(Boolean);
    throw new Error(
      `modules introuvables dans ${outputDir} : ${missing.join(", ")}. ` +
        `Les stubs de deploiement du generateur restent en place.`
    );
  }

  const app = webName.replace(/-web$/i, "");
  const earFile = `${earName}.ear`;
  const webDir = path.join(outputDir, webName);

  const dockerfile = path.join(webDir, "Dockerfile");
  const installApp = path.join(webDir, "install_app.py");
  const runLocal = path.join(webDir, "run-local.sh");

  await fs.writeFile(dockerfile, DOCKERFILE, "utf-8");
  await fs.writeFile(installApp, INSTALL_APP(app), "utf-8");
  await fs.writeFile(runLocal, RUN_LOCAL({ ejb: ejbName, ear: earName, earFile, app }), "utf-8");
  touched.push(dockerfile, installApp, runLocal);

  // Stubs du generateur remplaces par l'outillage ci-dessus : les retirer evite
  // qu'un script non fonctionnel soit lance a leur place.
  for (const stub of ["install_app", "run-local"]) {
    const stubPath = path.join(webDir, stub);
    try {
      await fs.unlink(stubPath);
      touched.push(stubPath);
    } catch {
      // Stub absent : rien a retirer.
    }
  }
  return touched;
}

async function collectPomFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries: import("fs").Dirent[] = [];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "target" || e.name === ".git" || e.name === "node_modules") continue;
        await walk(full);
      } else if (e.isFile() && e.name === "pom.xml") {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

/**
 * Détecte le package racine des sources de l'EJB d'entrée (préfixe commun des
 * déclarations `package ...;`), pour que l'adaptateur généré utilise le même
 * espace de nommage que l'EJB initial. Retourne null si aucune source Java.
 */
export async function detectBasePackage(inputPath: string): Promise<string | null> {
  const packages: string[] = [];
  async function scan(dir: string) {
    let entries: import("fs").Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "target" || e.name === ".git" || e.name === "node_modules" || e.name === "test") continue;
        await scan(full);
      } else if (e.isFile() && e.name.endsWith(".java")) {
        try {
          const content = await fs.readFile(full, "utf-8");
          const m = content.match(/^\s*package\s+([\w.]+)\s*;/m);
          if (m) packages.push(m[1]);
        } catch {
          // ignore
        }
      }
    }
  }
  await scan(inputPath);
  if (packages.length === 0) return null;

  let prefix = packages[0].split(".");
  for (const p of packages.slice(1)) {
    const segs = p.split(".");
    let i = 0;
    while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++;
    prefix = prefix.slice(0, i);
    if (prefix.length === 0) break;
  }
  return prefix.length > 0 ? prefix.join(".") : null;
}

async function findFirstEar(dir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const ear = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith(".ear"));
    return ear ? path.join(dir, ear.name) : null;
  } catch {
    return null;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });
  for (const e of entries) {
    if (e.isDirectory() && (e.name === "target" || e.name === ".git" || e.name === "node_modules")) {
      continue;
    }
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDir(s, d);
    } else if (e.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

async function collectJavaFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries: import("fs").Dirent[] = [];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && e.name.endsWith(".java")) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}
