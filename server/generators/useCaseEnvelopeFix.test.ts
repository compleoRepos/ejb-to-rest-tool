import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fixUseCaseEnvelopes, jsonName } from "./useCaseEnvelopeFix";
import { dedupeDto } from "./duplicatePropertyFix";

const EJB = "demo-ejb/src/main/java/ma/demo";
const WEB = "demo-rest-web/src/main/java/ma/rest";

async function write(root: string, rel: string, content: string) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf-8");
}

const legacyMethod = (name: string, code: string, service: string, params: string, fields: string) => `
    /**
     * Le corps XML est construit au format attendu par l'EJB : {@code <Flux><FONCTION>...</FONCTION>...</Flux>}
     */
    public Envelope ${name}(${params}) {
        Envelope envelope = new Envelope();
        envelope.setService("${service}");
        envelope.setMethod("${code}");
        StringBuilder xml = new StringBuilder("<Flux>");
        xml.append("<fonction>${code}</fonction>");
${fields}
        xml.append("</Flux>");
        envelope.setBody(xml.toString());
        return envelope;
    }
`;

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "uc-fix-"));
  await write(root, `${EJB}/DemoBean.java`, `package ma.demo;
import ma.eai.ingdev.fwk.strategie.impl.UCStrategie;
@Stateless(name = "demoBean")
public class DemoBean extends UCStrategie {}
`);
  await write(root, `${EJB}/utils/CommonFunction.java`, `package ma.demo.utils;
public class CommonFunction {
    public static String bodyError = "<object>\\r\\n" + "<codeRetour>" + Constants.ERROR_CODE + "</codeRetour>\\r\\n"
        + "<messageRetour>Retour KO</messageRetour>\\r\\n" + "</object>";
}
`);
  await write(root, `${EJB}/utils/Constants.java`, `package ma.demo.utils;
public final class Constants { public static final String ERROR_CODE = "0001"; }
`);
  await write(root, `${EJB}/usecases/ListerUC.java`, `package ma.demo.usecases;
import ma.demo.vo.ListerIn;
@UseCase
public class ListerUC implements BaseUseCase {
    public ValueObject execute(ValueObject in) throws FwkRollbackException {
        ListerIn criteres = (ListerIn) in;
        return null;
    }
}
`);
  await write(root, `${EJB}/usecases/ConsulterUC.java`, `package ma.demo.usecases;
import ma.demo.vo.ConsulterVoIn;
@UseCase
public class ConsulterUC implements BaseUseCase {
    public ValueObject execute(ValueObject voIn) { ConsulterVoIn v = (ConsulterVoIn) voIn; return null; }
}
`);
  await write(root, `${EJB}/usecases/ParamsUC.java`, `package ma.demo.usecases;
@UseCase
public class ParamsUC implements BaseUseCase {
    public ValueObject execute(ValueObject voIn) { ParamsOut out = new ParamsOut(); return out; }
}
`);
  await write(root, `${EJB}/vo/ListerIn.java`, `package ma.demo.vo;
import java.util.List;
@XmlRootElement(name = "object")
@XmlAccessorType(XmlAccessType.FIELD)
public class ListerIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    private String DateExecution;
    private Double montant;
    @XmlElementWrapper(name = "lignes")
    @XmlElement(name = "Ligne")
    private List<Ligne> lignes;
    private List<String> comptes;
}
`);
  await write(root, `${EJB}/vo/Ligne.java`, `package ma.demo.vo;
@XmlAccessorType(XmlAccessType.FIELD)
public class Ligne { private String code; private int quantite; }
`);
  await write(root, `${EJB}/vo/ConsulterVoIn.java`, `package ma.demo.vo;
@XmlRootElement(name = "object")
public class ConsulterVoIn implements ValueObject {
    private String numTiers;
    public String getNumTiers() { return numTiers; }
    @XmlElement(name = "numTiers")
    public void setNumTiers(String numTiers) { this.numTiers = numTiers; }
}
`);
  await write(root, `${EJB}/vo/ParamsOut.java`, `package ma.demo.vo;
@XmlRootElement(name = "object")
public class ParamsOut implements ValueObject { private String codeRetour; }
`);

  await write(root, `${WEB}/converter/DemoConverter.java`, `package ma.rest.converter;

import ma.eai.commons.services.parsing.Envelope;
import ma.rest.config.InputSanitizer;
import ma.rest.dto.*;

/**
 * Converter.
 */
public class DemoConverter {
${legacyMethod("toEnvelopeLister", "Lister", "demoBean", "", "")}
${legacyMethod("toEnvelopeConsulter", "Consulter", "demoBean", "String numTiers", `        xml.append("<numTiers>").append(InputSanitizer.sanitize(numTiers)).append("</numTiers>");`)}
${legacyMethod("toEnvelopeParams", "Params", "demoBean", "", "")}
}
`);
  await write(root, `${WEB}/resource/DemoResource.java`, `package ma.rest.resource;

import ma.rest.converter.DemoConverter;
import ma.rest.dto.*;

/**
 * Resource.
 */
public class DemoResource {
    private final DemoConverter converter = new DemoConverter();

    /**
     * Endpoint {@code Lister}.
     */
    @GET
    @Path("/lister")
    public Response lister() {
        try {
            Envelope envelopeIn = converter.toEnvelopeLister();
            Envelope envelopeOut = getEjbService().process(envelopeIn);
            String code = envelopeOut.getNodeAsString("flux/code");
            String message = envelopeOut.getNodeAsString("flux/message");
            if (CodeMapper.isError(code)) {
                return Response.status(CodeMapper.toHttpStatus(code))
                        .entity(new ErrorResponse(code, message))
                        .build();
            }
            return Response.ok().build();
        } catch (Exception e) {
            return null;
        }
    }

    @GET
    @Path("/consulter")
    public Response consulter(@QueryParam("numTiers") String numTiers) {
        Envelope envelopeIn = converter.toEnvelopeConsulter(numTiers);
        return null;
    }
}
`);
});

describe("fixUseCaseEnvelopes", () => {
  it("réécrit le flux au format UCStrategie avec le nom exact du use case et la VoIn castée", async () => {
    const report = await fixUseCaseEnvelopes(root, path.join(root, "demo-ejb"));
    const converter = await fs.readFile(path.join(root, WEB, "converter/DemoConverter.java"), "utf-8");

    expect(converter).not.toContain("<Flux>");
    expect(converter).toContain(`xml.append("<entete><fonction>ListerUC</fonction></entete>");`);
    expect(converter).toContain(`xml.append("<object class=\\"ma.demo.vo.ListerIn\\">");`);
    expect(converter).toContain(`appendValue(xml, "DateExecution", request.getDateExecution());`);
    expect(converter).toContain(`xml.append("<lignes>");`);
    expect(converter).toContain(`appendListerRequestLigne(xml, "Ligne", item);`);
    expect(converter).toContain(`appendValues(xml, "comptes", request.getComptes());`);
    expect(converter).toContain(`"0001".equals(code == null ? null : code.trim())`);
    expect(report.functions.find((f) => f.code === "Lister")?.voSource).toBe("cast");
  });

  it("garde la signature à paramètres quand elle couvre la VoIn et suit @XmlElement du setter", async () => {
    await fixUseCaseEnvelopes(root, path.join(root, "demo-ejb"));
    const converter = await fs.readFile(path.join(root, WEB, "converter/DemoConverter.java"), "utf-8");
    expect(converter).toContain("public Envelope toEnvelopeConsulter(String numTiers)");
    expect(converter).toContain(`appendValue(xml, "numTiers", numTiers);`);
  });

  it("choisit une VoIn de repli pour un use case sans entrée", async () => {
    const report = await fixUseCaseEnvelopes(root, path.join(root, "demo-ejb"));
    const params = report.functions.find((f) => f.code === "Params")!;
    expect(params.voClass).toBe("ma.demo.vo.ParamsOut");
    expect(params.voSource).toBe("fallback");
    expect(params.signature).toBe("none");
  });

  it("génère le DTO de requête typé et bascule la resource en corps JSON", async () => {
    await fixUseCaseEnvelopes(root, path.join(root, "demo-ejb"));
    const dto = await fs.readFile(path.join(root, WEB, "dto/ListerRequest.java"), "utf-8");
    expect(dto).toContain("private String dateExecution;");
    expect(dto).toContain("private Double montant;");
    expect(dto).toContain("private List<Ligne> lignes;");
    expect(dto).toContain("public static class Ligne implements Serializable");
    expect(dto).toContain("private Integer quantite;");

    const resource = await fs.readFile(path.join(root, WEB, "resource/DemoResource.java"), "utf-8");
    expect(resource).toContain("@POST\n    @Path(\"/lister\")");
    expect(resource).toContain("public Response lister(@Valid @NotNull ListerRequest request)");
    expect(resource).toContain("converter.toEnvelopeLister(request);");
    expect(resource).toContain(`getNodeAsString("object/codeRetour")`);
    expect(resource).toContain("if (converter.isTechnicalError(code, message)) {");
    expect(resource).toContain("import javax.validation.Valid;");
  });

  it("ne touche pas un bean historique", async () => {
    const legacy = (await fs.readFile(path.join(root, `${EJB}/DemoBean.java`), "utf-8")).replace("extends UCStrategie", "");
    await write(root, `${EJB}/DemoBean.java`, legacy);
    const before = await fs.readFile(path.join(root, WEB, "converter/DemoConverter.java"), "utf-8");
    const report = await fixUseCaseEnvelopes(root, path.join(root, "demo-ejb"));
    expect(report.functions).toHaveLength(0);
    expect(await fs.readFile(path.join(root, WEB, "converter/DemoConverter.java"), "utf-8")).toBe(before);
  });
});

describe("jsonName", () => {
  it("aligne le nom sur celui que Jackson déduit du getter", () => {
    expect(jsonName("DateExecution")).toBe("dateExecution");
    expect(jsonName("ctrBAD")).toBe("ctrBAD");
    expect(jsonName("URL")).toBe("url");
    expect(jsonName("numTiers")).toBe("numTiers");
  });
});

describe("dedupeDto", () => {
  it("retire les accesseurs en double dans une même classe seulement", () => {
    const dto = `public class R {
    private String fluxDoc;
    private String FluxDoc;
    public String getFluxDoc() {
        return fluxDoc;
    }
    public String getFluxDoc() {
        return FluxDoc;
    }
    public static class A {
        private String code;
    }
    public static class B {
        private String code;
    }
}
`;
    const out = dedupeDto(dto);
    expect(out.match(/getFluxDoc\(\)/g)).toHaveLength(1);
    expect(out).not.toContain("private String FluxDoc;");
    expect(out.match(/private String code;/g)).toHaveLength(2);
  });
});
