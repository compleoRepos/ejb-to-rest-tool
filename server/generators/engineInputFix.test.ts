import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { blankEnumComments, prepareEngineInput } from "./engineInputFix";
import { removeNonEjbExposures } from "./nonEjbExposureFix";

describe("blankEnumComments", () => {
  it("masque les commentaires et les membres qui suivent les constantes", () => {
    const src = `public class S {
    // commentaire hors enum conservé
    public enum Action {
        // en tête
        GETFAVORIS, // done
        GETINFOTIERS("GetInfoTiers") /* bloc */,
        DETAIL;
        private final String value;
        Action(String value) { this.value = value; }
    }
}`;
    const out = blankEnumComments(src);
    expect(out).toContain("// commentaire hors enum conservé");
    expect(out).toContain("GETFAVORIS,");
    expect(out).toContain('GETINFOTIERS("GetInfoTiers")');
    expect(out).toContain("DETAIL ");
    expect(out).not.toContain("DETAIL;");
    expect(out).not.toContain("done");
    expect(out).not.toContain("en tête");
    expect(out).not.toContain("private final String value");
    expect(out).not.toContain("this.value");
    expect(out.length).toBe(src.length);
    expect(out.split("\n").length).toBe(src.split("\n").length);
  });

  it("laisse un fichier sans enum inchangé", () => {
    const src = "class A { // x\n}";
    expect(blankEnumComments(src)).toBe(src);
  });
});

describe("prepareEngineInput", () => {
  it("travaille sur une copie et laisse la source intacte", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "engine-src-"));
    const file = path.join(root, "p-ejb", "S.java");
    await fs.mkdir(path.dirname(file), { recursive: true });
    const original = "enum A { X, // y\n Y }";
    await fs.writeFile(file, original, "latin1");
    const input = await prepareEngineInput(root);
    expect(input.path).not.toBe(root);
    const copied = await fs.readFile(path.join(input.path, "p-ejb", "S.java"), "latin1");
    expect(copied).not.toContain("// y");
    expect(await fs.readFile(file, "latin1")).toBe(original);
    await input.cleanup();
    await expect(fs.stat(input.path)).rejects.toThrow();
  });
});

describe("removeNonEjbExposures", () => {
  it("retire resource, converter et DTO d'une interface cliente, garde le bean", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "non-ejb-"));
    const w = async (rel: string, c: string) => {
      const f = path.join(root, rel);
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(f, c, "utf-8");
    };
    const src = "src-ejb/src/main/java/ma/x";
    await w(`${src}/ServiceData.java`, `package ma.x;\n@WebService(name = "ServiceData")\npublic interface ServiceData { }\n`);
    await w(`${src}/IDao.java`, `package ma.x;\n@Local\npublic interface IDao { }\n`);
    await w(`${src}/MainBean.java`, `package ma.x;\n@Stateless(name = "MainBean")\npublic class MainBean { }\n`);
    const web = "out/p-rest-web/src/main/java/ma/rest";
    for (const [name, sub] of [["Servicedata", "servicedata"], ["Idao", "idao"], ["Main", "main"]]) {
      const target = name === "Servicedata" ? "ServiceData" : name === "Idao" ? "IDao" : "MainBean";
      await w(
        `${web}/resource/${name}Resource.java`,
        `package ma.rest.resource;\nimport ma.rest.converter.${name}Converter;\nimport ma.rest.dto.${sub}.*;\n/**\n * Adaptateur REST pour {@link ${target}}.\n */\npublic class ${name}Resource { }\n`
      );
      await w(`${web}/converter/${name}Converter.java`, `package ma.rest.converter;\npublic class ${name}Converter { }\n`);
      await w(`${web}/dto/${sub}/X${name}Request.java`, `package ma.rest.dto.${sub};\npublic class X${name}Request { }\n`);
    }

    const removals = await removeNonEjbExposures(path.join(root, "out"), path.join(root, "src-ejb"));
    expect(removals.map((r) => r.reason).sort()).toEqual(["interface cliente de web service", "interface locale"]);
    const exists = (rel: string) => fs.stat(path.join(root, rel)).then(() => true, () => false);
    expect(await exists(`${web}/resource/ServicedataResource.java`)).toBe(false);
    expect(await exists(`${web}/converter/ServicedataConverter.java`)).toBe(false);
    expect(await exists(`${web}/dto/servicedata/XServicedataRequest.java`)).toBe(false);
    expect(await exists(`${web}/resource/IdaoResource.java`)).toBe(false);
    expect(await exists(`${web}/resource/MainResource.java`)).toBe(true);
    expect(await exists(`${web}/converter/MainConverter.java`)).toBe(true);
  });
});
