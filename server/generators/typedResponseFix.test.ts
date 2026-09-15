/**
 * Tests autonomes du post-traitement des DTO de réponse typés.
 * Les fixtures reproduisent la sortie du générateur : un DTO à classes imbriquées
 * et un converter qui affecte ces champs avec getNodeAsString.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fixTypedResponseMapping, parseResponseDto, addListImport, patchConverter } from "./typedResponseFix";

const BASE = "ma.eai.web";
const WEB = "adapter-web/src/main/java/ma/eai/web";

const RESPONSE_JAVA = `package ${BASE}.dto;

import java.io.Serializable;

public class FatcadocumentResponse implements Serializable {

    private static final long serialVersionUID = 1L;

    private String code;
    private Data data;
    private long id;

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public Data getData() {
        return data;
    }

    public void setData(Data data) {
        this.data = data;
    }

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public static class Data implements Serializable {

        private static final long serialVersionUID = 1L;

        private List<Title> title;

        public List<Title> getTitle() {
            return title;
        }

        public void setTitle(List<Title> title) {
            this.title = title;
        }

        public static class Title implements Serializable {

            private static final long serialVersionUID = 1L;

            private String fr;

            public String getFr() {
                return fr;
            }

            public void setFr(String fr) {
                this.fr = fr;
            }

        }

    }

}
`;

const CONVERTER_JAVA = `package ${BASE}.converter;

import ma.eai.commons.services.parsing.Envelope;
import ma.eai.commons.services.parsing.ParsingException;
import ma.eai.web.dto.*;

public class SouscridistcomptebmceConverter {

    public FatcadocumentResponse fromFatcadocumentEnvelope(Envelope envelope) throws ParsingException {
        FatcadocumentResponse response = new FatcadocumentResponse();
        response.setCode(envelope.getNodeAsString("flux/code"));
        response.setData(envelope.getNodeAsString("flux/data"));
        response.setId(envelope.getNodeAsLong("flux/id"));
        return response;
    }

}
`;

describe("parseResponseDto", () => {
  it("relève les champs de premier niveau et les classes imbriquées", () => {
    const model = parseResponseDto(RESPONSE_JAVA);
    expect(model.fields.get("code")).toBe("String");
    expect(model.fields.get("data")).toBe("Data");
    expect(model.fields.get("id")).toBe("long");
    expect(model.fields.has("title")).toBe(false);
    expect(model.nestedTypes.has("Data")).toBe(true);
    expect(model.nestedTypes.has("Title")).toBe(true);
  });
});

describe("addListImport", () => {
  it("ajoute l'import java.util.List quand le DTO déclare une liste", () => {
    expect(addListImport(RESPONSE_JAVA)).toContain("import java.util.List;");
  });

  it("laisse inchangé un DTO sans liste", () => {
    const sansListe = "package a;\n\nimport java.io.Serializable;\n\npublic class A {\n}\n";
    expect(addListImport(sansListe)).toBe(sansListe);
  });
});

describe("patchConverter", () => {
  it("construit les champs objet et long, garde les champs String", () => {
    const models = new Map([["FatcadocumentResponse", parseResponseDto(RESPONSE_JAVA)]]);
    const patched = patchConverter(CONVERTER_JAVA, models);
    expect(patched).toContain('response.setCode(envelope.getNodeAsString("flux/code"));');
    expect(patched).toContain(
      'response.setData(EnvelopeJson.toBean(envelope, "flux/data", FatcadocumentResponse.Data.class));'
    );
    expect(patched).toContain('response.setId(EnvelopeJson.toLong(envelope, "flux/id"));');
    expect(patched).not.toContain("getNodeAsLong");
  });
});

describe("fixTypedResponseMapping", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "typed-response-fix-"));
    await fs.mkdir(path.join(dir, WEB, "dto"), { recursive: true });
    await fs.mkdir(path.join(dir, WEB, "converter"), { recursive: true });
    await fs.writeFile(path.join(dir, WEB, "dto", "FatcadocumentResponse.java"), RESPONSE_JAVA, "utf-8");
    await fs.writeFile(
      path.join(dir, WEB, "converter", "SouscridistcomptebmceConverter.java"),
      CONVERTER_JAVA,
      "utf-8"
    );
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("corrige le DTO et le converter du projet", async () => {
    const touched = await fixTypedResponseMapping(dir);
    expect(touched).toHaveLength(2);

    const dto = await fs.readFile(path.join(dir, WEB, "dto", "FatcadocumentResponse.java"), "utf-8");
    expect(dto).toContain("import java.util.List;");

    const converter = await fs.readFile(
      path.join(dir, WEB, "converter", "SouscridistcomptebmceConverter.java"),
      "utf-8"
    );
    expect(converter).toContain("EnvelopeJson.toBean(envelope,");
    expect(converter).toContain("EnvelopeJson.toLong(envelope,");
  });
});
