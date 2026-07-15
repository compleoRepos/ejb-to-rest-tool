/**
 * Tests autonomes du post-traitement de mapping de sortie.
 * Ils créent une fixture Java minimale (sans JAR ni EJB externe) reproduisant
 * la structure émise par le générateur, puis vérifient les transformations.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  applyOutputMappingFix,
  includeSourceModules,
  detectBasePackage,
  fixWebPomDependencies,
  fixEarFinalName,
  writeDeployTooling,
} from "./outputMappingFix";

const BASE = "ma.bmce.adapter.demandedotation";
const WEB = "adapter-web/src/main/java/ma/bmce/adapter/demandedotation";

const RESOURCE_JAVA = `package ${BASE}.resource;

import javax.naming.InitialContext;
import ma.eai.commons.services.parsing.Envelope;
import ma.bmce.adapter.demandedotation.config.CodeMapper;
import ma.bmce.adapter.demandedotation.converter.SynchroneConverter;
import ma.bmce.adapter.demandedotation.dto.*;
import ma.bmce.adapter.demandedotation.dto.ErrorResponse;

@Path("/synchrone")
public class SynchroneResource {

    private final SynchroneConverter converter = new SynchroneConverter();

    @GET
    @Path("/lstcrts")
    public Response lstcrts() {
        try {
            Envelope envelopeIn = converter.toEnvelopeLstcrts();
            Envelope envelopeOut = getEjbService().process(envelopeIn);
            String code = envelopeOut.getNodeAsString("flux/code");
            String message = envelopeOut.getNodeAsString("flux/message");
            if (!CodeMapper.isSuccess(code)) {
                return Response.status(CodeMapper.toHttpStatus(code))
                        .entity(new ErrorResponse(code, message))
                        .build();
            }
            LstcrtsResponse response = converter.fromLstcrtsEnvelope(envelopeOut);
            return Response.ok(response).build();
        } catch (Exception e) {
            return Response.status(500).entity(new ErrorResponse("500", e.getMessage())).build();
        }
    }
}
`;

const CONVERTER_JAVA = `package ${BASE}.converter;

public class SynchroneConverter {
}
`;

const CODEMAPPER_JAVA = `package ${BASE}.config;

import javax.ws.rs.core.Response;
import java.util.HashMap;
import java.util.Map;

public final class CodeMapper {

    private static final Map<String, Response.Status> CODE_MAP = new HashMap<String, Response.Status>();

    private CodeMapper() {}

    public static Response.Status toHttpStatus(String code) {
        return Response.Status.INTERNAL_SERVER_ERROR;
    }

    public static boolean isSuccess(String code) {
        return "000".equals(code);
    }
}
`;

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "outfix-"));
  const base = path.join(root, WEB);
  await fs.mkdir(path.join(base, "resource"), { recursive: true });
  await fs.mkdir(path.join(base, "converter"), { recursive: true });
  await fs.mkdir(path.join(base, "config"), { recursive: true });
  await fs.writeFile(path.join(base, "resource", "SynchroneResource.java"), RESOURCE_JAVA);
  await fs.writeFile(path.join(base, "converter", "SynchroneConverter.java"), CONVERTER_JAVA);
  await fs.writeFile(path.join(base, "config", "CodeMapper.java"), CODEMAPPER_JAVA);
  await applyOutputMappingFix(root);
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function read(rel: string): Promise<string> {
  return fs.readFile(path.join(root, WEB, rel), "utf-8");
}

describe("applyOutputMappingFix", () => {
  it("assouplit le gate isSuccess en isError dans la resource", async () => {
    const resource = await read("resource/SynchroneResource.java");
    expect(resource).toContain("if (CodeMapper.isError(code)) {");
    expect(resource).not.toContain("if (!CodeMapper.isSuccess(code)) {");
  });

  it("renvoie le flux converti en JSON générique", async () => {
    const resource = await read("resource/SynchroneResource.java");
    expect(resource).toContain("return Response.ok(EnvelopeJson.toJson(envelopeOut)).build();");
    expect(resource).not.toContain("return Response.ok(response).build();");
  });

  it("ajoute l'import du helper EnvelopeJson une seule fois", async () => {
    const resource = await read("resource/SynchroneResource.java");
    const occurrences = resource.split(`import ${BASE}.converter.EnvelopeJson;`).length - 1;
    expect(occurrences).toBe(1);
  });

  it("génère EnvelopeJson dans le package converter", async () => {
    const envJson = await read("converter/EnvelopeJson.java");
    expect(envJson).toContain(`package ${BASE}.converter;`);
    expect(envJson).toContain("public static Object toJson(Envelope envelope)");
    expect(envJson).toContain("getElementsByTagName(\"Flux\")");
    expect(envJson).toContain("body = envelope.toString();");
  });

  it("ajoute la méthode isError au CodeMapper", async () => {
    const codeMapper = await read("config/CodeMapper.java");
    expect(codeMapper).toContain("public static boolean isError(String code)");
    expect(codeMapper).toContain("status != Response.Status.OK");
    expect(codeMapper).toContain("public static boolean isSuccess(String code)");
  });

  it("est idempotent (une seconde passe ne change rien)", async () => {
    const before = await read("resource/SynchroneResource.java");
    const codeMapperBefore = await read("config/CodeMapper.java");
    await applyOutputMappingFix(root);
    const after = await read("resource/SynchroneResource.java");
    const codeMapperAfter = await read("config/CodeMapper.java");
    expect(after).toBe(before);
    expect(codeMapperAfter).toBe(codeMapperBefore);
  });
});

describe("includeSourceModules", () => {
  let out: string;
  let inp: string;

  beforeAll(async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "incmod-"));
    inp = path.join(base, "in", "demande-dotation");
    out = path.join(base, "out", "demande-dotation-adapter");

    // Entrée : modules -ejb et -ear (avec .ear buildé dans target/).
    await fs.mkdir(path.join(inp, "demande-dotation-ejb", "src"), { recursive: true });
    await fs.writeFile(path.join(inp, "demande-dotation-ejb", "pom.xml"), "<project/>");
    await fs.mkdir(path.join(inp, "demande-dotation-ear", "target"), { recursive: true });
    await fs.writeFile(path.join(inp, "demande-dotation-ear", "pom.xml"), "<project/>");
    await fs.writeFile(path.join(inp, "demande-dotation-ear", "target", "demande-dotation-ear.ear"), "EAR");

    // Sortie : pom parent + module web généré.
    await fs.mkdir(path.join(out, "demande-dotation-adapter-web"), { recursive: true });
    await fs.writeFile(
      path.join(out, "pom.xml"),
      "<project>\n    <modules>\n        <module>demande-dotation-adapter-web</module>\n        <module>demande-dotation-adapter-ear</module>\n    </modules>\n</project>\n"
    );

    await includeSourceModules(out, inp);
  });

  it("clone le module EJB d'origine et le déclare dans le pom parent", async () => {
    expect(await fs.readFile(path.join(out, "demande-dotation-ejb", "pom.xml"), "utf-8")).toContain("<project");
    const parent = await fs.readFile(path.join(out, "pom.xml"), "utf-8");
    expect(parent).toContain("<module>demande-dotation-ejb</module>");
  });

  it("clone le module EAR d'origine sans le déclarer dans les modules", async () => {
    expect(await fs.readFile(path.join(out, "demande-dotation-ear", "pom.xml"), "utf-8")).toContain("<project");
    const parent = await fs.readFile(path.join(out, "pom.xml"), "utf-8");
    expect(parent).not.toContain("<module>demande-dotation-ear</module>");
  });

  it("n'inclut pas le target dans le clone EAR", async () => {
    await expect(fs.access(path.join(out, "demande-dotation-ear", "target"))).rejects.toThrow();
  });

  it("dépose le .ear pré-buildé dans le module web", async () => {
    const earInWeb = path.join(out, "demande-dotation-adapter-web", "demande-dotation-ear.ear");
    expect(await fs.readFile(earInWeb, "utf-8")).toBe("EAR");
  });
});

describe("detectBasePackage", () => {
  it("retourne le préfixe de package commun des sources d'entrée", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "detpkg-"));
    const srcRoot = path.join(base, "demande-dotation-ejb", "src", "main", "java", "ma", "eai", "boa", "xbanking");
    await fs.mkdir(path.join(srcRoot, "services"), { recursive: true });
    await fs.mkdir(path.join(srcRoot, "util"), { recursive: true });
    await fs.writeFile(path.join(srcRoot, "services", "DotationService.java"), "package ma.eai.boa.xbanking.services;\n");
    await fs.writeFile(path.join(srcRoot, "util", "Utility.java"), "package ma.eai.boa.xbanking.util;\n");
    expect(await detectBasePackage(base)).toBe("ma.eai.boa.xbanking");
    await fs.rm(base, { recursive: true, force: true });
  });

  it("retourne null sans source Java", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "detpkg-empty-"));
    expect(await detectBasePackage(base)).toBeNull();
    await fs.rm(base, { recursive: true, force: true });
  });
});

describe("fixWebPomDependencies", () => {
  it("retire les dépendances framework superflues du pom web", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "pomdep-"));
    const webDir = path.join(base, "demande-dotation-web");
    await fs.mkdir(webDir, { recursive: true });
    const pom = `<project>
  <dependencies>
    <dependency>
      <groupId>ma.eai.boa.xbanking</groupId>
      <artifactId>demande-dotation-ejb</artifactId>
      <scope>provided</scope>
    </dependency>
    <dependency>
      <groupId>ma.eai.commons</groupId>
      <artifactId>eai-commons-services</artifactId>
      <scope>provided</scope>
    </dependency>
    <dependency>
      <groupId>ma.eai.midw</groupId>
      <artifactId>eai-midw-connectors</artifactId>
      <scope>provided</scope>
    </dependency>
    <dependency>
      <groupId>org.slf4j</groupId>
      <artifactId>slf4j-jdk14</artifactId>
      <version>1.7.36</version>
    </dependency>
  </dependencies>
</project>
`;
    await fs.writeFile(path.join(webDir, "pom.xml"), pom);
    await fixWebPomDependencies(base);
    const result = await fs.readFile(path.join(webDir, "pom.xml"), "utf-8");
    expect(result).not.toContain("eai-commons-services");
    expect(result).not.toContain("eai-midw-connectors");
    expect(result).not.toContain("slf4j-jdk14");
    expect(result).toContain("demande-dotation-ejb");
    await fs.rm(base, { recursive: true, force: true });
  });
});

describe("fixEarFinalName", () => {
  it("ajoute finalName=artifactId au pom EAR", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "earfn-"));
    const earDir = path.join(base, "demande-dotation-ear");
    await fs.mkdir(earDir, { recursive: true });
    const pom = `<project>
  <artifactId>demande-dotation-ear</artifactId>
  <build>
    <plugins>
      <plugin><artifactId>maven-ear-plugin</artifactId></plugin>
    </plugins>
  </build>
</project>
`;
    await fs.writeFile(path.join(earDir, "pom.xml"), pom);
    await fixEarFinalName(base);
    const result = await fs.readFile(path.join(earDir, "pom.xml"), "utf-8");
    expect(result).toContain("<finalName>${project.artifactId}</finalName>");
    await fs.rm(base, { recursive: true, force: true });
  });
});

describe("writeDeployTooling", () => {
  let out: string;
  let webDir: string;

  beforeAll(async () => {
    out = await fs.mkdtemp(path.join(os.tmpdir(), "deploy-"));
    webDir = path.join(out, "demande-dotation-web");
    await fs.mkdir(webDir, { recursive: true });
    await fs.mkdir(path.join(out, "demande-dotation-ejb"), { recursive: true });
    await fs.mkdir(path.join(out, "demande-dotation-ear"), { recursive: true });

    // Stubs emis par le generateur, que l'outillage doit remplacer.
    await fs.writeFile(path.join(webDir, "install_app"), "stub");
    await fs.writeFile(path.join(webDir, "run-local"), "stub");

    await writeDeployTooling(out);
  });

  afterAll(async () => {
    await fs.rm(out, { recursive: true, force: true });
  });

  it("ecrit un Dockerfile avec /app/logs inscriptible et l'image icr.io", async () => {
    const dockerfile = await fs.readFile(path.join(webDir, "Dockerfile"), "utf-8");
    expect(dockerfile).toContain("icr.io/appcafe/websphere-traditional:9.0.5.14");
    expect(dockerfile).toContain("mkdir -p /app/logs && chown -R was:root /app");
  });

  it("ecrit un install_app.py creant la DataSource Derby XA", async () => {
    const installApp = await fs.readFile(path.join(webDir, "install_app.py"), "utf-8");
    expect(installApp).toContain("jdbc/ebankdirect_xa");
    expect(installApp).toContain("-MapWebModToVH");
  });

  it("ecrit un run-local.sh qui peuple libs/ et exclut le logging cloud", async () => {
    const runLocal = await fs.readFile(path.join(webDir, "run-local.sh"), "utf-8");
    expect(runLocal).toContain("copy-dependencies");
    expect(runLocal).toContain("eai-fwk-logging-cloud");
  });

  it("retire les stubs de deploiement du generateur", async () => {
    await expect(fs.access(path.join(webDir, "install_app"))).rejects.toThrow();
    await expect(fs.access(path.join(webDir, "run-local"))).rejects.toThrow();
  });

  it("signale l'absence d'un module au lieu de laisser les stubs en place", async () => {
    const partial = await fs.mkdtemp(path.join(os.tmpdir(), "deploy-partial-"));
    await fs.mkdir(path.join(partial, "demande-dotation-web"), { recursive: true });
    await fs.mkdir(path.join(partial, "demande-dotation-ear"), { recursive: true });
    await expect(writeDeployTooling(partial)).rejects.toThrow("-ejb");
    await fs.rm(partial, { recursive: true, force: true });
  });
});
