import { describe, it, expect } from "vitest";
import { patchResourceSource, patchEnvelopeJsonSource, patchCodeMapperSource } from "./returnCodeFix";

const RESOURCE = `            String code = envelopeOut.getNodeAsString("flux/code");
            String message = envelopeOut.getNodeAsString("flux/message");
            String ucCode = envelopeOut.getNodeAsString("object/codeRetour");`;

const ENVELOPE_JSON = `package ma.x.converter;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.w3c.dom.NodeList;

public final class EnvelopeJson {
    static Object fromXml(String xml) {
        Document doc = builder.parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        return null;
    }
}
`;

const CODE_MAPPER = `    public static Response.Status toHttpStatus(String code) {
        Response.Status status = CODE_MAP.get(code);
        return status != null ? status : Response.Status.INTERNAL_SERVER_ERROR;
    }

    public static boolean isSuccess(String code) {
        return "000".equals(code);
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
    }
}`;

describe("returnCodeFix", () => {
  it("remplace la lecture flux/code et laisse la famille use case", () => {
    const out = patchResourceSource(RESOURCE);
    expect(out).toContain("String code = EnvelopeJson.returnCode(envelopeOut);");
    expect(out).toContain("String message = EnvelopeJson.returnMessage(envelopeOut);");
    expect(out).toContain(`getNodeAsString("object/codeRetour")`);
    expect(out).not.toContain(`"flux/code"`);
  });

  it("ajoute returnCode et parse sans reencodage", () => {
    const out = patchEnvelopeJsonSource(ENVELOPE_JSON);
    expect(out).toContain("public static String returnCode(Envelope envelope)");
    expect(out).toContain("new InputSource(new StringReader(xml))");
    expect(out).toContain("import org.xml.sax.InputSource;");
    expect(out).toContain("import java.io.StringReader;");
    expect(out).not.toContain("ByteArrayInputStream");
    expect(out).not.toContain("StandardCharsets");
    expect(out.trimEnd().endsWith("}")).toBe(true);
    expect(patchEnvelopeJsonSource(out)).toBe(out);
  });

  it("fait de tout code non succes une erreur", () => {
    const out = patchCodeMapperSource(CODE_MAPPER);
    expect(out).toContain(`"000".equals(code) || "00".equals(code) || "0".equals(code)`);
    expect(out).toContain("return !isSuccess(code.trim());");
    expect(out).toContain("Response.Status.CONFLICT;");
    expect(out).not.toContain("non répertorié");
  });
});
