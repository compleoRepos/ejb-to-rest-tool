import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fixRequestFields } from "./requestFieldsFix";
import { analyzeEjbInputs, resolveExpr } from "./ejbInputAnalysis";

const EJB = `package ma.x.services;

public class Service {
    public static final String FLUX = "flux/";
    public static final String ORD = FLUX + "ordonnateur";
    enum Action { PAYER, LISTER, CARTES }

    public Envelope process(Envelope envIn) throws Exception {
        String canal = envIn.getNodeAsString("flux/canal");
        switch (Action.valueOf(envIn.getNodeAsString("flux/action"))) {
        case PAYER:
            return payer(envIn);
        case LISTER:
            String page = envIn.getNodeAsString("flux/pager/page");
            for (int i = 0; i < 3; i++) {
                envIn.getNodeAsString("flux/items/item," + i);
            }
            return null;
        case CARTES:
            return WriteFlux.cartes(Parser.marshall(envIn));
        default:
            return null;
        }
    }

    private Envelope payer(Envelope envIn) throws Exception {
        String ord = envIn.getNodeAsString(ORD);
        String montant = envIn.getNodeAsString("flux/montant");
        Envelope envOut = new Envelope();
        envOut.getNodeAsString("flux/code");
        return envOut;
    }
}
`;

const CONVERTER = `package ma.x.converter;

import ma.eai.commons.services.parsing.Envelope;
import ma.x.dto.*;

public class SynchroneConverter {

    public Envelope toEnvelopePayer(PayerRequest request) {
        Envelope envelope = new Envelope();
        envelope.setService("SynchroneService");
        envelope.setMethod("PAYER");
        StringBuilder xml = new StringBuilder("<Flux>");
        xml.append("<action>PAYER</action>");
        xml.append("</Flux>");
        envelope.setBody(xml.toString());
        return envelope;
    }

    public Envelope toEnvelopeLister() {
        Envelope envelope = new Envelope();
        envelope.setService("SynchroneService");
        envelope.setMethod("LISTER");
        envelope.setBody("<Flux><action>LISTER</action></Flux>");
        return envelope;
    }

    public Envelope toEnvelopeCartes() {
        Envelope envelope = new Envelope();
        envelope.setService("SynchroneService");
        envelope.setMethod("CARTES");
        envelope.setBody("<Flux><action>CARTES</action></Flux>");
        return envelope;
    }
}
`;

const RESOURCE = `package ma.x.resource;

import javax.ws.rs.*;
import ma.x.converter.SynchroneConverter;
import ma.x.dto.*;

public class SynchroneResource {

    @POST
    @Path("/payer")
    public Response payer(@Valid @NotNull PayerRequest request) {
        try {
            Envelope envelopeIn = converter.toEnvelopePayer(request);
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    @GET
    @Path("/lister")
    public Response lister() {
        try {
            Envelope envelopeIn = converter.toEnvelopeLister();
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    @GET
    @Path("/cartes")
    public Response cartes() {
        try {
            Envelope envelopeIn = converter.toEnvelopeCartes();
            return null;
        } catch (Exception e) {
            return null;
        }
    }
}
`;

const DTO = `package ma.x.dto;

import java.io.Serializable;

public class PayerRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    public PayerRequest() {
    }

}
`;

async function project(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rf-"));
  const put = async (rel: string, content: string) => {
    const f = path.join(dir, rel);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, content, "utf-8");
  };
  await put("svc-ejb/src/main/java/ma/x/services/Service.java", EJB);
  await put("svc-web/src/main/java/ma/x/converter/SynchroneConverter.java", CONVERTER);
  await put("svc-web/src/main/java/ma/x/resource/SynchroneResource.java", RESOURCE);
  await put("svc-web/src/main/java/ma/x/dto/PayerRequest.java", DTO);
  await put("svc-web/src/main/java/ma/x/config/InputSanitizer.java", "package ma.x.config;\npublic final class InputSanitizer {}\n");
  return dir;
}

describe("ejbInputAnalysis", () => {
  it("resout les constantes concatenees", () => {
    const c = new Map([["FLUX", "flux/"]]);
    expect(resolveExpr('FLUX + "montant"', c)).toEqual({ value: "flux/montant", indexed: false });
    expect(resolveExpr('"flux/items/item," + i', c)).toEqual({ value: "flux/items/item,", indexed: true });
  });

  it("rend les champs lus par fonction, lectures communes et methodes suivies comprises", async () => {
    const dir = await project();
    const res = await analyzeEjbInputs(path.join(dir, "svc-ejb"), ["PAYER", "LISTER", "CARTES"]);
    expect(res.get("PAYER")?.paths).toEqual(["canal", "montant", "ordonnateur"]);
    expect(res.get("LISTER")?.paths).toEqual(["canal", "pager/page"]);
    expect(res.get("LISTER")?.lists).toEqual(["items/item"]);
    expect(res.get("CARTES")?.relay).toBe(true);
  });
});

describe("fixRequestFields", () => {
  it("ajoute les champs au DTO, au convertisseur et aux parametres GET", async () => {
    const dir = await project();
    const report = await fixRequestFields(dir);
    expect(report.functions.map((f) => `${f.verb} ${f.code}`)).toEqual(["POST PAYER", "GET LISTER", "GET CARTES"]);

    const dto = await fs.readFile(path.join(dir, "svc-web/src/main/java/ma/x/dto/PayerRequest.java"), "utf-8");
    expect(dto).toContain("private String ordonnateur;");
    expect(dto).toContain("public String getMontant()");
    expect(dto.indexOf("private String canal;")).toBeLessThan(dto.indexOf("public PayerRequest()"));

    const conv = await fs.readFile(path.join(dir, "svc-web/src/main/java/ma/x/converter/SynchroneConverter.java"), "utf-8");
    expect(conv).toContain('appendNode(xml, "ordonnateur", request.getOrdonnateur());');
    expect(conv).toContain("public Envelope toEnvelopeLister(Map<String, String> params)");
    expect(conv).toContain("appendNodes(xml, params);");
    expect(conv).toContain("import ma.x.config.InputSanitizer;");

    const res = await fs.readFile(path.join(dir, "svc-web/src/main/java/ma/x/resource/SynchroneResource.java"), "utf-8");
    expect(res).toContain('public Response lister(@QueryParam("canal") String canal, @QueryParam("pager.page") String pagerPage)');
    expect(res).toContain("converter.toEnvelopeLister(params)");
    expect(res).toContain("public Response cartes(@QueryParam(\"canal\") String canal, @Context UriInfo uriInfo)");
    expect(res).toContain("import javax.ws.rs.core.UriInfo;");
  });
});
