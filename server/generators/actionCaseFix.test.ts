import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { exactDispatchLiterals, fixActionCase, patchConverterSource } from "./actionCaseFix";

const EJB = `package ma.x.services;
public class Services {
    public Envelope process(Envelope envIn) {
        Action action = Action.valueOf(envIn.getNodeAsString(Constante.FLUX_ACTION).toString().trim().toUpperCase());
        switch (action) {
            case CONFIRMIMPAYES:
                envOut = confirmer(envIn);
                break;
            case GETFORMS:
                envOut = formulaires(envIn);
                break;
        }
        if ("confirmImpayes".equals(envIn.getNodeAsString(Constante.FLUX_ACTION))) {
            sctx.setRollbackOnly();
        }
        if (envIn.getNodeAsString(Constante.FLUX_ACTION)
                .equals("exeVrt")) {
            sctx.setRollbackOnly();
        }
        if ("oui".equals(envIn.getNodeAsString("flux/accord"))) {
            accord();
        }
        return envOut;
    }
}
`;

const CONVERTER = `package ma.x.converter;
public class SynchroneConverter {
    public Envelope toEnvelopeConfirmimpayes(Request request) {
        xml.append("<action>CONFIRMIMPAYES</action>");
    }
    public Envelope toEnvelopeExevrt(Request request) {
        xml.append("<action>EXEVRT</action>");
    }
    public Envelope toEnvelopeExevrtTst(Request request) {
        xml.append("<action>EXEVRT_TST</action>");
    }
    public Envelope toEnvelopeGetforms(Request request) {
        xml.append("<action>GETFORMS</action>");
    }
    public Envelope toEnvelopeOui(Request request) {
        xml.append("<action>OUI</action>");
    }
}
`;

describe("actionCaseFix", () => {
  it("retient les valeurs comparees exactement a la balise d'aiguillage", () => {
    const lits = exactDispatchLiterals([EJB]);
    expect([...lits]).toEqual([
      ["CONFIRMIMPAYES", "confirmImpayes"],
      ["EXEVRT", "exeVrt"],
    ]);
  });

  it("n'agit pas quand l'aiguillage ne met pas la valeur en majuscules", () => {
    const strict = EJB.replace(".toString().trim().toUpperCase()", "");
    expect(exactDispatchLiterals([strict]).size).toBe(0);
  });

  it("ignore un code compare dans deux casses differentes", () => {
    const deux = EJB + `class B { void m(Envelope e) { if (e.getNodeAsString(FLUX_ACTION).equals("ConfirmImpayes")) {} } }`;
    expect(exactDispatchLiterals([deux]).has("CONFIRMIMPAYES")).toBe(false);
  });

  it("ecrit dans le convertisseur la valeur que l'EJB compare, et rien d'autre", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ac-"));
    const put = async (rel: string, content: string) => {
      const f = path.join(dir, rel);
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(f, content, "utf-8");
    };
    await put("svc-ejb/src/main/java/ma/x/services/Services.java", EJB);
    await put("svc-web/src/main/java/ma/x/converter/SynchroneConverter.java", CONVERTER);
    const report = await fixActionCase(dir);
    expect(report.replaced.map((r) => `${r.from}->${r.to}`)).toEqual(["CONFIRMIMPAYES->confirmImpayes", "EXEVRT->exeVrt"]);
    const conv = await fs.readFile(path.join(dir, "svc-web/src/main/java/ma/x/converter/SynchroneConverter.java"), "utf-8");
    expect(conv).toContain('xml.append("<action>confirmImpayes</action>");');
    expect(conv).toContain('xml.append("<action>exeVrt</action>");');
    expect(conv).toContain('xml.append("<action>EXEVRT_TST</action>");');
    expect(conv).toContain('xml.append("<action>GETFORMS</action>");');
    expect(conv).toContain('xml.append("<action>OUI</action>");');
  });

  it("laisse intact un convertisseur sans valeur a corriger", () => {
    const { text, replaced } = patchConverterSource(CONVERTER, new Map());
    expect(text).toBe(CONVERTER);
    expect(replaced).toEqual([]);
  });
});
