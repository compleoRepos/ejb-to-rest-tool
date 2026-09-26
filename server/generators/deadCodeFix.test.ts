import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { removeDeadResponseMapping, removeUnreachablePrivate, removeUnusedImports } from "./deadCodeFix";

const PKG = "ma/bmce/adapter";

const RESOURCE = `package ma.bmce.adapter.resource;

import ma.eai.commons.services.parsing.Envelope;
import ma.bmce.adapter.converter.SynchroneConverter;
import ma.bmce.adapter.converter.EnvelopeJson;
import ma.bmce.adapter.dto.*;

public class SynchroneResource {
    private final SynchroneConverter converter = new SynchroneConverter();

    public Response lstcrts() {
        Envelope envelopeIn = converter.toEnvelopeLstcrts();
        Envelope envelopeOut = service.process(envelopeIn);

        // 4. Convertir la réponse Envelope en DTO JSON
        LstcrtsResponse response = converter.fromLstcrtsEnvelope(envelopeOut);
        return Response.ok(EnvelopeJson.toJson(envelopeOut)).build();
    }
}
`;

const CONVERTER = `package ma.bmce.adapter.converter;

import ma.eai.commons.services.parsing.Envelope;
import ma.eai.commons.services.parsing.ParsingException;
import ma.bmce.adapter.dto.*;

public class SynchroneConverter {

    /**
     * Convertit la requête.
     */
    public Envelope toEnvelopeLstcrts() {
        Envelope envelope = new Envelope();
        envelope.setBody("<Flux><FONCTION>LSTCRTS</FONCTION></Flux>");
        return envelope;
    }

    /**
     * Convertit la réponse.
     */
    public LstcrtsResponse fromLstcrtsEnvelope(Envelope envelope) throws ParsingException {
        LstcrtsResponse response = new LstcrtsResponse();
        response.setCode(envelope.getNodeAsString("flux/code"));
        return response;
    }

}
`;

const ENVELOPE_JSON = `package ma.bmce.adapter.converter;

import java.lang.reflect.Method;
import java.util.Map;
import ma.eai.commons.services.parsing.Envelope;

public final class EnvelopeJson {

    public static Object toJson(Envelope envelope) {
        return fromXml(envelope.toString());
    }

    public static <T> T toBean(Envelope envelope, String path, Class<T> type) {
        return convert(lookup(null, path), type);
    }

    static Object fromXml(String xml) {
        return xml;
    }

    private static Object lookup(Map<String, Object> map, String name) {
        return map;
    }

    /**
     * Convertit une valeur.
     */
    @SuppressWarnings("unchecked")
    private static <T> T convert(Object value, Class<T> type) {
        return convertList(value, type) == null ? null : null;
    }

    private static <T> T convertList(Object value, Class<T> type) {
        Method m = null;
        return convert(value, type);
    }
}
`;

async function fixture(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "deadcode-"));
  const src = path.join(base, "demo-web", "src", "main", "java", PKG);
  await fs.mkdir(path.join(src, "resource"), { recursive: true });
  await fs.mkdir(path.join(src, "converter"), { recursive: true });
  await fs.mkdir(path.join(src, "dto"), { recursive: true });
  await fs.writeFile(path.join(src, "resource", "SynchroneResource.java"), RESOURCE);
  await fs.writeFile(path.join(src, "converter", "SynchroneConverter.java"), CONVERTER);
  await fs.writeFile(path.join(src, "converter", "EnvelopeJson.java"), ENVELOPE_JSON);
  await fs.writeFile(path.join(src, "dto", "LstcrtsResponse.java"), "package ma.bmce.adapter.dto;\npublic class LstcrtsResponse {}\n");
  return base;
}

describe("removeDeadResponseMapping", () => {
  it("retire l'appel fromXxxEnvelope ignoré, les méthodes orphelines et leurs imports", async () => {
    const base = await fixture();
    const src = path.join(base, "demo-web", "src", "main", "java", PKG);
    await removeDeadResponseMapping(base);

    const resource = await fs.readFile(path.join(src, "resource", "SynchroneResource.java"), "utf-8");
    expect(resource).not.toContain("fromLstcrtsEnvelope");
    expect(resource).not.toContain("Convertir la réponse Envelope en DTO JSON");
    expect(resource).toContain("return Response.ok(EnvelopeJson.toJson(envelopeOut)).build();");

    const converter = await fs.readFile(path.join(src, "converter", "SynchroneConverter.java"), "utf-8");
    expect(converter).not.toContain("fromLstcrtsEnvelope");
    expect(converter).not.toContain("Convertit la réponse.");
    expect(converter).not.toContain("ParsingException");
    expect(converter).toContain("toEnvelopeLstcrts");

    const json = await fs.readFile(path.join(src, "converter", "EnvelopeJson.java"), "utf-8");
    expect(json).toContain("toJson");
    expect(json).toContain("fromXml");
    for (const gone of ["toBean", "lookup", "convert(", "convertList", "java.lang.reflect.Method", "java.util.Map", "@SuppressWarnings", "Convertit une valeur."]) {
      expect(json).not.toContain(gone);
    }

    expect(await fs.readFile(path.join(src, "dto", "LstcrtsResponse.java"), "utf-8")).toContain("LstcrtsResponse");
    await fs.rm(base, { recursive: true, force: true });
  });

  it("ne retire rien d'une méthode encore appelée", async () => {
    const base = await fixture();
    const src = path.join(base, "demo-web", "src", "main", "java", PKG);
    const keep = RESOURCE.replace(
      "return Response.ok(EnvelopeJson.toJson(envelopeOut)).build();",
      "return Response.ok(converter.fromLstcrtsEnvelope(envelopeOut)).build();"
    );
    await fs.writeFile(path.join(src, "resource", "SynchroneResource.java"), keep);
    await removeDeadResponseMapping(base);
    const converter = await fs.readFile(path.join(src, "converter", "SynchroneConverter.java"), "utf-8");
    expect(converter).toContain("fromLstcrtsEnvelope");
    await fs.rm(base, { recursive: true, force: true });
  });
});

describe("removeUnreachablePrivate", () => {
  it("retire deux méthodes privées qui ne s'appellent qu'entre elles", () => {
    const { removed } = removeUnreachablePrivate(ENVELOPE_JSON.replace(/\n    public static <T> T toBean[\s\S]*?\n    }\n/, "\n"));
    expect(removed.sort()).toEqual(["convert", "convertList", "lookup"]);
  });
});

describe("removeUnusedImports", () => {
  it("garde les imports utilisés et les imports génériques", () => {
    const out = removeUnusedImports("import a.B;\nimport a.C;\nimport d.*;\nclass X { B b; }\n");
    expect(out).toContain("import a.B;");
    expect(out).not.toContain("import a.C;");
    expect(out).toContain("import d.*;");
  });
});
