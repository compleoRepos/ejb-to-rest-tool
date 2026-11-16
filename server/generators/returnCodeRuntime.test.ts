import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { patchEnvelopeJsonSource } from "./returnCodeFix";

/**
 * Exécute la lecture du code retour générée sur des flux de sortie réels d'EJB historiques.
 * Nécessite un JDK (GENERATOR_JAVA_HOME ou JAVA_HOME), le test est sauté sinon.
 */
const JDK = [process.env.GENERATOR_JAVA_HOME, process.env.JAVA_HOME].find(
  (h) => h && existsSync(path.join(h, "bin", process.platform === "win32" ? "javac.exe" : "javac"))
);

const SKELETON = `package banc;

import java.util.ArrayList;
import java.util.List;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

public final class EnvelopeJson {

    static DocumentBuilder newBuilder() throws ParserConfigurationException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(false);
        factory.setExpandEntityReferences(false);
        try {
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        } catch (ParserConfigurationException unsupported) {
            return factory.newDocumentBuilder();
        }
        return factory.newDocumentBuilder();
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

const ENVELOPE = `package banc;
public class Envelope {
    private final String body;
    public Envelope(String body) { this.body = body; }
    public String getBody() { return body; }
    public String toString() { return body; }
}
`;

const MAIN = `package banc;
public class Main {
    public static void main(String[] args) {
        for (String xml : args) {
            Envelope e = new Envelope(xml);
            System.out.println(EnvelopeJson.returnCode(e) + "|" + EnvelopeJson.returnMessage(e));
        }
    }
}
`;

const CAS: [string, string, string][] = [
  ["fatourati traitementovo, entete/codeErreur", "<flux><entete><codeErreur>1031</codeErreur><libErreur>KO</libErreur></entete></flux>", "1031|KO"],
  ["virement visopreponse, succes 0000", "<flux><entete><codeErreur>0000</codeErreur></entete></flux>", "0000|null"],
  ["mise-disposition controlmontant, msg a la racine", "<flux><CODRET>002</CODRET><msg>Plafond jour depasse</msg></flux>", "002|Plafond jour depasse"],
  ["virement-permanent controlplafondmontant, row unique", "<flux><row><marche>M1</marche><msg>Montant hors bornes</msg><code>001</code></row></flux>", "001|Montant hors bornes"],
  ["liste sous rows, non lue comme un code", "<flux><rows><row><code>A</code></row><row><code>B</code></row></rows></flux>", "null|null"],
  ["deux row a la racine, non lus comme un code", "<flux><row><code>1</code></row><row><code>2</code></row></flux>", "null|null"],
  ["CODRET prioritaire sur codeErreur", "<flux><CODRET>000</CODRET><sop><entete><codeErreur>0103</codeErreur></entete></sop></flux>", "000|null"],
];

describe.skipIf(!JDK)("returnCodeFix, execution de la lecture generee", () => {
  it("lit le code et le message aux emplacements ecrits par les EJB", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-"));
    const src = path.join(dir, "src", "banc");
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(path.join(src, "EnvelopeJson.java"), patchEnvelopeJsonSource(SKELETON), "utf-8");
    await fs.writeFile(path.join(src, "Envelope.java"), ENVELOPE, "utf-8");
    await fs.writeFile(path.join(src, "Main.java"), MAIN, "utf-8");
    const bin = path.join(dir, "bin");
    await fs.mkdir(bin, { recursive: true });
    const javac = path.join(JDK!, "bin", "javac");
    const java = path.join(JDK!, "bin", "java");
    execFileSync(javac, ["-encoding", "UTF-8", "-d", bin, ...["EnvelopeJson", "Envelope", "Main"].map((c) => path.join(src, c + ".java"))]);
    const out = execFileSync(java, ["-cp", bin, "banc.Main", ...CAS.map((c) => c[1])], { encoding: "utf-8" })
      .split(/\r?\n/)
      .filter((l) => l.length > 0);
    expect(out).toEqual(CAS.map((c) => c[2]));
  }, 60000);
});
