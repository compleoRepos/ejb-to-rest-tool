import { describe, it, expect } from "vitest";
import { parseDependencies, selectSocleDependencies, webDependencyBlock, rewriteWebSocle } from "./webPomFix";
import { patchRequestLoggingSource } from "./requestLoggingFix";
import { patchEnvelopeJsonSource } from "./returnCodeFix";

const dep = (g: string, a: string, extra = "") =>
  `<dependency><groupId>${g}</groupId><artifactId>${a}</artifactId>${extra}</dependency>`;

const VIREMENT_PERMANENT_EJB = `<project>
  <dependencies>
    ${dep("ma.eai.sop", "sop-connector-interfaces", "<scope>provided</scope>")}
    ${dep("ma.eai.commons", "iso8583-client", "<scope>provided</scope>")}
    ${dep("ma.eai.midw", "midw-logging", "<version>1.13</version><scope>provided</scope>")}
    ${dep("ma.eai.boa.tv", "referentiel-compte-client", "<version>2.27</version><scope>provided</scope>")}
    ${dep("ma.eai.midw", "midw-integration", "<scope>provided</scope>")}
    ${dep("ch.qos.logback", "logback-classic", "<version>1.0.0</version><scope>provided</scope>")}
    ${dep("ma.eai.test", "outil-test", "<scope>test</scope>")}
  </dependencies>
</project>
`;

const WEB_POM = `<project>
    <artifactId>neobank-virement-permanent-web</artifactId>
    <dependencies>
        <dependency>
            <groupId>javax</groupId>
            <artifactId>javaee-api</artifactId>
            <version>7.0</version>
            <scope>provided</scope>
        </dependency>

        <dependency>
            <groupId>ma.eai.boa.tv</groupId>
            <artifactId>neobank-virement-permanent-ejb</artifactId>
            <version>1.45</version>
            <scope>provided</scope>
        </dependency>

        <dependency>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-api</artifactId>
            <version>1.7.36</version>
            <scope>compile</scope>
        </dependency>

        <dependency>
            <groupId>ma.eai.commons</groupId>
            <artifactId>iso8583-client</artifactId>
            <scope>provided</scope>
        </dependency>
    </dependencies>
</project>
`;

const names = (deps: { artifactId: string }[]) => deps.map((d) => d.artifactId);

describe("selectSocleDependencies", () => {
  it("ne garde que l'artefact qui porte SynchroneService quand l'EJB declare sop-connector-interfaces", () => {
    const section = VIREMENT_PERMANENT_EJB.match(/<dependencies>([\s\S]*)<\/dependencies>/)![1];
    expect(names(selectSocleDependencies(parseDependencies(section)))).toEqual(["sop-connector-interfaces"]);
  });

  it("garde commons-services a cote de sop-connector-interfaces", () => {
    const deps = parseDependencies(
      dep("ma.eai.sop", "sop-connector-interfaces") + dep("ma.eai.commons", "commons-services") + dep("ma.eai.midw", "midw-logging")
    );
    expect(names(selectSocleDependencies(deps))).toEqual(["sop-connector-interfaces", "commons-services"]);
  });

  it("retombe sur midw-integration, qui tire sop-connector-interfaces", () => {
    const deps = parseDependencies(
      dep("ma.eai.midw", "properties-loader") + dep("ma.eai.midw", "midw-integration") + dep("ma.eai.midw", "midw-logging")
    );
    expect(names(selectSocleDependencies(deps))).toEqual(["midw-integration"]);
  });

  it("reprend tout le socle quand aucun porteur connu n'est declare", () => {
    const deps = parseDependencies(dep("ma.eai.midw", "properties-loader") + dep("ma.eai.boa.tv", "referentiel-compte-client"));
    expect(names(selectSocleDependencies(deps))).toEqual(["properties-loader", "referentiel-compte-client"]);
  });

  it("ne reprend rien quand l'EJB herite le socle de son parent", () => {
    expect(selectSocleDependencies(parseDependencies(dep("javax.mail", "mail")))).toEqual([]);
  });
});

describe("webDependencyBlock", () => {
  it("exclut logback et log4j en conservant les exclusions de l'EJB", () => {
    const [d] = parseDependencies(
      dep(
        "ma.eai.idev",
        "midw-integration",
        "<version>1.5.14</version><exclusions><exclusion><groupId>org.springframework</groupId><artifactId>spring-jms</artifactId></exclusion></exclusions>"
      )
    );
    const block = webDependencyBlock(d);
    expect(block).toContain("<version>1.5.14</version>");
    expect(block).toContain("<scope>provided</scope>");
    expect(block).toContain("<artifactId>spring-jms</artifactId>");
    expect(block).toMatch(/<groupId>ch\.qos\.logback<\/groupId>\s*<artifactId>\*<\/artifactId>/);
    expect(block).toMatch(/<groupId>log4j<\/groupId>\s*<artifactId>log4j<\/artifactId>/);
  });

  it("n'ajoute pas une exclusion deja couverte", () => {
    const [d] = parseDependencies(
      dep("ma.eai.sop", "sop-connector-interfaces", "<exclusions><exclusion><groupId>log4j</groupId><artifactId>*</artifactId></exclusion></exclusions>")
    );
    expect(webDependencyBlock(d).match(/<groupId>log4j<\/groupId>/g)).toHaveLength(1);
  });
});

describe("rewriteWebSocle", () => {
  it("pom web de virement-permanent : plus aucun artefact qui tire logback", () => {
    const out = rewriteWebSocle(WEB_POM, VIREMENT_PERMANENT_EJB, "neobank-virement-permanent-ejb");
    expect(out).not.toContain("iso8583-client");
    expect(out).not.toContain("midw-logging");
    expect(out).not.toContain("referentiel-compte-client");
    expect(out).not.toContain("midw-integration");
    expect(out).not.toContain("logback-classic");
    expect(out).not.toContain("outil-test");
    expect(out).toContain("<artifactId>neobank-virement-permanent-ejb</artifactId>");
    expect(out).toContain("<artifactId>javaee-api</artifactId>");
    expect(out).toContain("<artifactId>slf4j-api</artifactId>");
    expect(out.match(/<artifactId>sop-connector-interfaces<\/artifactId>/g)).toHaveLength(1);
    expect(out).toContain("<artifactId>*</artifactId>");
  });

  it("est idempotent", () => {
    const once = rewriteWebSocle(WEB_POM, VIREMENT_PERMANENT_EJB, "neobank-virement-permanent-ejb");
    expect(rewriteWebSocle(once, VIREMENT_PERMANENT_EJB, "neobank-virement-permanent-ejb")).toBe(once);
  });

  it("laisse intact un pom web dont l'EJB herite le socle", () => {
    const ejb = `<project><dependencies>${dep("javax.mail", "mail")}</dependencies></project>`;
    const web = WEB_POM.replace(/\s*<dependency>\s*<groupId>ma\.eai\.commons<\/groupId>[\s\S]*?<\/dependency>/, "");
    expect(rewriteWebSocle(web, ejb, "neobank-virement-permanent-ejb")).toBe(web);
  });
});

describe("patchRequestLoggingSource", () => {
  const FILTER = `/**
 *   <li>Méthode HTTP et URI</li>
 */
        log.info("[REQ] {} {}", requestContext.getMethod(), requestContext.getUriInfo().getRequestUri());
        log.info("[RES] {} {} → {} ({}ms)",
                requestContext.getMethod(),
                requestContext.getUriInfo().getRequestUri(),
                responseContext.getStatus(),
                duration);
`;

  it("journalise le chemin sans la query string, meme format de trace", () => {
    const out = patchRequestLoggingSource(FILTER);
    expect(out.match(/getRequestUri\(\)\.getPath\(\)/g)).toHaveLength(2);
    expect(out).not.toMatch(/getRequestUri\(\)(?!\.getPath)/);
    expect(out).toContain(`log.info("[REQ] {} {}"`);
    expect(out).toContain(`log.info("[RES] {} {} → {} ({}ms)"`);
  });

  it("est idempotent", () => {
    const once = patchRequestLoggingSource(FILTER);
    expect(patchRequestLoggingSource(once)).toBe(once);
  });
});

describe("EnvelopeJson durci contre XXE", () => {
  it("les deux analyses passent par l'analyseur sans DTD ni entite externe", async () => {
    const fs = await import("fs/promises");
    const os = await import("os");
    const path = await import("path");
    const { applyOutputMappingFix } = await import("./outputMappingFix");
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "xxe-"));
    const conv = path.join(base, "x-web/src/main/java/ma/x/converter");
    await fs.mkdir(conv, { recursive: true });
    await fs.writeFile(path.join(conv, "SynchroneConverter.java"), "package ma.x.converter;\npublic class SynchroneConverter {\n}\n");
    await applyOutputMappingFix(base);
    const src = patchEnvelopeJsonSource(await fs.readFile(path.join(conv, "EnvelopeJson.java"), "utf-8"));
    await fs.rm(base, { recursive: true, force: true });
    expect(src.match(/DocumentBuilderFactory\.newInstance\(\)/g)).toHaveLength(1);
    expect(src).toContain("XMLConstants.FEATURE_SECURE_PROCESSING, true");
    expect(src).toContain(`"http://apache.org/xml/features/disallow-doctype-decl", true`);
    expect(src).toContain(`"http://xml.org/sax/features/external-general-entities", false`);
    expect(src).toContain(`"http://xml.org/sax/features/external-parameter-entities", false`);
    expect(src).toContain("factory.setExpandEntityReferences(false);");
    expect(src).toContain("return newBuilder().parse(new InputSource(new StringReader(xml)));");
    expect(src).toContain("DocumentBuilder builder = newBuilder();");
  });
});
