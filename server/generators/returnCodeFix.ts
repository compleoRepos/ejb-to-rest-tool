/**
 * Lecture du code retour des EJB historiques dans les adaptateurs générés.
 *
 * Le moteur lit `flux/code` et `flux/message`, balises qu'aucun EJB historique ne produit : ils
 * répondent en CODRET/MSGRET, codeRetour/messageRetour, CodeRetour ou CODE_RETOUR. Le code est donc
 * toujours absent et toute réponse sort en 200, y compris l'enveloppe vide renvoyée quand l'EJB a
 * échoué. Ce correctif :
 * - remplace la lecture par EnvelopeJson.returnCode / returnMessage, qui cherchent ces balises
 *   sous le flux et rendent le code technique 009 quand l'EJB n'a rien renvoyé ;
 * - fait de tout code différent de 000, 00 ou 0 une erreur, statut du barème s'il existe,
 *   409 sinon (refus métier, non rejouable) ;
 * - parse le corps sans réencodage, pour respecter l'encodage déclaré (ISO-8859-1).
 * La famille use case (object/codeRetour, isTechnicalError) n'est pas concernée.
 */
import fs from "fs/promises";
import path from "path";

const RETURN_CODE_METHODS = `
    private static final String[] CODE_TAGS = {"CODRET", "codeRetour", "CodeRetour", "CODE_RETOUR"};

    private static final String[] MESSAGE_TAGS = {"MSGRET", "messageRetour", "MessageRetour", "MSG_RETOUR", "libelleRetour"};

    /** Code technique rendu quand l'EJB n'a renvoyé aucun flux. */
    public static final String EMPTY_RESPONSE_CODE = "009";

    /**
     * Code retour porté par le flux de sortie, 009 si l'EJB n'a renvoyé aucun contenu, null si le flux n'en porte pas.
     */
    public static String returnCode(Envelope envelope) {
        Element flux = parseFlux(readBody(envelope));
        if (flux == null || childElements(flux).isEmpty() && flux.getTextContent().trim().isEmpty()) {
            return EMPTY_RESPONSE_CODE;
        }
        return firstTag(flux, CODE_TAGS, "code");
    }

    /**
     * Message retour porté par le flux de sortie, message technique si l'EJB n'a renvoyé aucun contenu.
     */
    public static String returnMessage(Envelope envelope) {
        Element flux = parseFlux(readBody(envelope));
        if (flux == null || childElements(flux).isEmpty() && flux.getTextContent().trim().isEmpty()) {
            return "Reponse vide du service";
        }
        return firstTag(flux, MESSAGE_TAGS, "message");
    }

    private static String readBody(Envelope envelope) {
        String body = null;
        try {
            body = envelope.getBody();
        } catch (Exception ignored) {
            body = null;
        }
        if (body == null || body.trim().isEmpty()) {
            body = envelope.toString();
        }
        return body;
    }

    private static Element parseFlux(String xml) {
        if (xml == null || xml.trim().isEmpty()) {
            return null;
        }
        try {
            Element flux = locateFlux(parse(xml));
            if (flux != null && "Envelope".equals(localName(flux))) {
                Element body = firstChildNamed(flux, "Body");
                if (body == null) {
                    return null;
                }
                List<Element> content = childElements(body);
                return content.isEmpty() ? null : content.get(0);
            }
            return flux;
        } catch (Exception e) {
            return null;
        }
    }

    private static String firstTag(Element flux, String[] tags, String directChild) {
        for (String tag : tags) {
            if (tag.equals(flux.getNodeName())) {
                return flux.getTextContent().trim();
            }
            NodeList nodes = flux.getElementsByTagName(tag);
            if (nodes.getLength() > 0) {
                return nodes.item(0).getTextContent().trim();
            }
        }
        Element child = firstChildNamed(flux, directChild);
        return child == null ? null : child.getTextContent().trim();
    }

    private static Element firstChildNamed(Element parent, String localName) {
        for (Element child : childElements(parent)) {
            if (localName.equals(localName(child))) {
                return child;
            }
        }
        return null;
    }

    private static String localName(Element element) {
        String name = element.getNodeName();
        int colon = name.indexOf(':');
        return colon < 0 ? name : name.substring(colon + 1);
    }

    private static Document parse(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(false);
        DocumentBuilder builder = factory.newDocumentBuilder();
        return builder.parse(new InputSource(new StringReader(xml)));
    }
`;

const IS_SUCCESS_NEW = `    public static boolean isSuccess(String code) {
        return "000".equals(code) || "00".equals(code) || "0".equals(code);
    }`;

const IS_ERROR_NEW = `    public static boolean isError(String code) {
        if (code == null || code.trim().isEmpty()) {
            return false;
        }
        return !isSuccess(code.trim());
    }`;

/**
 * Applique le correctif à un projet adaptateur généré. Retourne les fichiers modifiés.
 */
export async function fixReturnCodeReading(outputDir: string): Promise<string[]> {
  const touched: string[] = [];
  const javaFiles = await collectJavaFiles(outputDir);
  const patchedPackages = new Set<string>();

  for (const file of javaFiles.filter((f) => f.endsWith("Resource.java"))) {
    const content = await fs.readFile(file, "utf-8");
    if (!content.includes(`getNodeAsString("flux/code")`)) continue;
    const patched = patchResourceSource(content);
    if (patched === content) continue;
    await fs.writeFile(file, patched, "utf-8");
    touched.push(file);
    const pkg = content.match(/^import\s+([\w.]+)\.EnvelopeJson;/m);
    if (pkg) patchedPackages.add(pkg[1]);
  }
  if (touched.length === 0) return touched;

  for (const file of javaFiles.filter((f) => f.endsWith("EnvelopeJson.java"))) {
    const content = await fs.readFile(file, "utf-8");
    const pkg = content.match(/^package\s+([\w.]+);/m);
    if (!pkg || !patchedPackages.has(pkg[1])) continue;
    const patched = patchEnvelopeJsonSource(content);
    if (patched === content) continue;
    await fs.writeFile(file, patched, "utf-8");
    touched.push(file);
  }

  for (const file of javaFiles.filter((f) => f.endsWith("CodeMapper.java"))) {
    const content = await fs.readFile(file, "utf-8");
    const patched = patchCodeMapperSource(content);
    if (patched === content) continue;
    await fs.writeFile(file, patched, "utf-8");
    touched.push(file);
  }
  return touched;
}

export function patchResourceSource(content: string): string {
  return content
    .split(`envelopeOut.getNodeAsString("flux/code")`).join("EnvelopeJson.returnCode(envelopeOut)")
    .split(`envelopeOut.getNodeAsString("flux/message")`).join("EnvelopeJson.returnMessage(envelopeOut)");
}

export function patchEnvelopeJsonSource(content: string): string {
  if (content.includes("public static String returnCode(")) return content;
  let out = content;
  out = out.replace(
    "builder.parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)))",
    "builder.parse(new InputSource(new StringReader(xml)))"
  );
  if (!out.includes("import java.io.StringReader;")) {
    out = out.replace(/(^import java\.[^\n]*\n)/m, "import java.io.StringReader;\n$1");
  }
  if (!out.includes("import org.xml.sax.InputSource;")) {
    out = out.replace(/(^import org\.w3c\.dom\.NodeList;\n)/m, "$1import org.xml.sax.InputSource;\n");
  }
  if (!out.includes("ByteArrayInputStream(")) out = out.replace(/^import java\.io\.ByteArrayInputStream;\n/m, "");
  if (!/StandardCharsets\./.test(out)) out = out.replace(/^import java\.nio\.charset\.StandardCharsets;\n/m, "");
  const end = out.lastIndexOf("}");
  return out.slice(0, end).replace(/\s*$/, "\n") + RETURN_CODE_METHODS + "}\n";
}

export function patchCodeMapperSource(content: string): string {
  let out = content.replace(
    /    public static boolean isSuccess\(String code\) \{\n\s*return "000"\.equals\(code\);\n    \}/,
    IS_SUCCESS_NEW
  );
  out = out.replace(
    /    public static boolean isError\(String code\) \{[\s\S]*?return status != null && status != Response\.Status\.OK;\n    \}/,
    IS_ERROR_NEW
  );
  out = out.replace(
    /     \* Indique si le code retour correspond à une erreur métier\/technique connue\.\n[\s\S]*?statut 200\.\n/,
    "     * Indique si le code retour est une erreur : tout code renseigné autre qu'un code de succès.\n"
  );
  out = out.replace(
    "return status != null ? status : Response.Status.INTERNAL_SERVER_ERROR;",
    "return status != null ? status : Response.Status.CONFLICT;"
  );
  return out;
}

async function collectJavaFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "target" || e.name === "node_modules") continue;
      out.push(...(await collectJavaFiles(full)));
    } else if (e.name.endsWith(".java")) {
      out.push(full);
    }
  }
  return out;
}
