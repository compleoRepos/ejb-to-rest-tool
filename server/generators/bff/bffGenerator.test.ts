import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { generateBffLayer, readBffRepository } from "./bffGenerator";
import { parseBffDescriptor, type BffDescriptor } from "./bffDescriptor";
import { camel, channelSubPath, pascal } from "./bffNaming";
import { buildServiceModel } from "./bffServiceFiles";

const P = "neobank-current-account";
const JAVA = "src/main/java/ma/eai/msiboa/api";

async function write(root: string, rel: string, content: string) {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

async function skeleton(root: string) {
  await write(
    root,
    "pom.xml",
    `<project>\n<parent>\n<artifactId>msiboa-api-parent</artifactId>\n</parent>\n<artifactId>${P}-api</artifactId>\n</project>\n`
  );
  for (const m of [`${P}-container`, `${P}-application`, `${P}-domain/${P}-domain-core`, `${P}-domain/${P}-application-service`]) {
    await write(root, `${m}/pom.xml`, "<project/>\n");
  }
  await write(root, `${P}-container/src/main/resources/application-dev.properties`, "server.port=8183\n");
  await write(root, `${P}-container/src/main/resources/application-cloud.properties`, "server.port=${server.port}\n");
  await write(root, `${P}-container/${JAVA}/domain/RestClientConfig.java`, "class RestClientConfig {}\n");
}

async function snapshot(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  async function walk(dir: string) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else result.set(path.relative(root, full).split(path.sep).join("/"), createHash("sha256").update(await fs.readFile(full)).digest("hex"));
    }
  }
  await walk(root);
  return result;
}

function descriptor(overrides: Partial<BffDescriptor> = {}): BffDescriptor {
  return parseBffDescriptor(
    {
      format: 4,
      adapter_name: "neobank-commande-chequier",
      adapter_base_url: "http://localhost:9080/neobank-commande-chequier",
      bian: { service_domain: "current-account" },
      codes_retour: { succes: ["000"], metier: ["001"], saisie: ["333"] },
      endpoints: [
        {
          fonction: "enrgCommande",
          method: "POST",
          path: "/api/synchrone/enrg-commande",
          request_fields: [
            { name: "numAccount", type: "String" },
            { name: "adresse", type: "Object", children: [{ name: "ville", type: "String" }] },
            { name: "lignes", type: "Object", isList: true, children: [{ name: "Code", type: "Integer" }] },
          ],
        },
        {
          fonction: "HISTORY_CMD",
          method: "GET",
          path: "/api/synchrone/history-cmd",
          query_params: [{ name: "entete.numAccount", type: "String" }],
        },
        {
          fonction: "MODIF",
          method: "PUT",
          path: "/api/synchrone/modif",
          request_fields: [{ name: "id-client", type: "String", required: true }],
        },
        { fonction: "LSTCRTS", method: "GET", path: "/api/synchrone/lstcrts", query_libre: true },
        { fonction: "SUPPRIMER", method: "DELETE", path: "/api/synchrone/supprimer", request_fields: [{ name: "id", type: "String" }] },
        { fonction: "lstcrtsTest", method: "GET", path: "/api/synchrone/test/lstcrts--tst", test: true },
        { fonction: "RELOADCONFIG", method: "POST", path: "/api/synchrone/reloadconfig", exposer: false },
      ],
      ...overrides,
    },
    "test"
  );
}

describe("bffNaming", () => {
  it("convertit les codes fonction en noms Java", () => {
    expect(camel("enrgCommande")).toBe("enrgCommande");
    expect(camel("GETINFOTIERS")).toBe("getinfotiers");
    expect(camel("CHECK_COMPTE_TRANSFERE")).toBe("checkCompteTransfere");
    expect(camel("ActiverCarte")).toBe("activerCarte");
    expect(camel("entete.idFonction")).toBe("enteteIdFonction");
    expect(camel("default")).toBe("defaultValue");
    expect(pascal("commande-chequier")).toBe("CommandeChequier");
  });

  it("retire /api et le chemin de classe de la route du canal", () => {
    expect(channelSubPath("/api/synchrone/enrg-commande")).toBe("/enrg-commande");
    expect(channelSubPath("/api/params-cartes-bmcedirect/service-carte")).toBe("/service-carte");
  });
});

describe("parseBffDescriptor", () => {
  it("refuse un descripteur v3", () => {
    expect(() => parseBffDescriptor({ adapter_name: "neobank-x", endpoints: [] }, "v3.json")).toThrow(/format 4/);
  });

  it("refuse une adresse de base terminée par /api", () => {
    expect(() =>
      parseBffDescriptor({ format: 4, adapter_name: "neobank-x", adapter_base_url: "http://h/neobank-x/api", endpoints: [] }, "x")
    ).toThrow(/sans \/api/);
  });

  it("déduit l'idempotence du verbe", () => {
    const d = descriptor();
    expect(d.endpoints[0].idempotence).toBe("cle");
    expect(d.endpoints[1].idempotence).toBe("sans");
  });
});

describe("buildServiceModel", () => {
  it("exclut les fonctions de test et non exposées", () => {
    const model = buildServiceModel(descriptor());
    expect(model.operations.map((o) => o.methodName)).toEqual(["enrgCommande", "historyCmd", "modif", "lstcrts", "supprimer"]);
    expect(model.excluded.map((e) => e.reason)).toEqual(["fonction de test", "non exposée au canal"]);
  });

  it("refuse deux opérations sur la même route", () => {
    const d = descriptor();
    d.endpoints.push({ ...d.endpoints[1], fonction: "AUTRE" });
    expect(() => buildServiceModel(d)).toThrow(/route du canal en double/);
  });
});

describe("generateBffLayer", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "bff-"));
    await skeleton(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("lit le préfixe de module et le domaine du dépôt", async () => {
    const repo = await readBffRepository(root);
    expect(repo.modulePrefix).toBe(P);
    expect(repo.domain).toBe("current-account");
  });

  it("refuse un dépôt qui n'est pas une couche API", async () => {
    await write(root, "pom.xml", "<project><artifactId>neobank-virement</artifactId></project>");
    await expect(readBffRepository(root)).rejects.toThrow(/neobank-<domaine>-api/);
  });

  it("refuse un service d'un autre domaine", async () => {
    await expect(generateBffLayer(root, [descriptor({ bian: { service_domain: "card-case" } })])).rejects.toThrow(/domaine/);
  });

  it("ajoute port, cas d'utilisation, contrôleur et adaptateur sans toucher aux fichiers d'origine", async () => {
    const before = await snapshot(root);
    const report = await generateBffLayer(root, [descriptor()]);
    const after = await snapshot(root);

    for (const [rel, hash] of before) {
      if (rel.endsWith(".properties")) continue;
      expect(after.get(rel), rel).toBe(hash);
    }
    expect(report.written).toContain(`${P}-container/${JAVA}/integration/commandechequier/CommandeChequierRestAdapter.java`);
    expect(report.written).toContain(`${P}-application/${JAVA}/application/commandechequier/CommandeChequierController.java`);
    expect(report.written).toContain(`${P}-container/${JAVA}/integration/upstream/UpstreamRestClients.java`);
    expect(report.defaultSecurity).toHaveLength(5);

    const dev = await fs.readFile(path.join(root, `${P}-container/src/main/resources/application-dev.properties`), "utf-8");
    expect(dev).toBe(
      "server.port=8183\n\n# neobank-upstream:debut\nneobank.upstream.business-error-status=422\n" +
        "neobank.upstream.commande-chequier.base-url=http://localhost:9080/neobank-commande-chequier\n# neobank-upstream:fin\n"
    );
    const cloud = await fs.readFile(path.join(root, `${P}-container/src/main/resources/application-cloud.properties`), "utf-8");
    expect(cloud).toContain("neobank.upstream.commande-chequier.base-url=${neobank-upstream-commande-chequier-base-url}");
  });

  it("produit un code Java conforme aux règles d'appel", async () => {
    await generateBffLayer(root, [descriptor()]);
    const adapter = await fs.readFile(
      path.join(root, `${P}-container/${JAVA}/integration/commandechequier/CommandeChequierRestAdapter.java`),
      "utf-8"
    );
    expect(adapter).toContain('.queryParamIfPresent("entete.numAccount", Optional.ofNullable(enteteNumAccount))');
    expect(adapter).toContain("params.forEach((name, value) -> uri.queryParam(name, value));");
    expect(adapter).toContain("return restClient.method(HttpMethod.DELETE)");
    expect(adapter).toContain('List.of("001"),');
    expect(adapter).not.toMatch(/^\s*\/\//m);

    const controller = await fs.readFile(
      path.join(root, `${P}-application/${JAVA}/application/commandechequier/CommandeChequierController.java`),
      "utf-8"
    );
    expect(controller).toContain('@RequestMapping("/api/v1/commande-chequier")');
    expect(controller).toContain('@PostMapping("/enrg-commande")');
    expect(controller).toContain('@RequestHeader("Idempotency-Key") String idempotencyKey');
    expect(controller).toContain('idempotencyService.execute(idempotencyKey, SERVICE, "enrgCommande", request,');
    expect(controller).toContain('@RequestParam(name = "entete.numAccount", required = false) String enteteNumAccount');
    expect(controller).not.toContain("reloadconfig");

    const request = await fs.readFile(
      path.join(root, `${P}-domain/${P}-application-service/${JAVA}/domain/commandechequier/model/EnrgCommandeRequest.java`),
      "utf-8"
    );
    expect(request).toContain("@Valid Adresse adresse");
    expect(request).toContain("@Valid List<Lignes> lignes");
    expect(request).toContain("        Integer Code");
    expect(request).not.toContain("@JsonProperty");
    expect(request).toContain("    public record Adresse(");

    const modif = await fs.readFile(
      path.join(root, `${P}-domain/${P}-application-service/${JAVA}/domain/commandechequier/model/ModifRequest.java`),
      "utf-8"
    );
    expect(modif).toContain('@NotNull @JsonProperty("id-client") String idClient');
  });

  it("donne la même sortie à chaque génération et retire un service retiré", async () => {
    const original = await snapshot(root);
    await generateBffLayer(root, [descriptor()]);
    const first = await snapshot(root);
    await generateBffLayer(root, [descriptor()]);
    expect(await snapshot(root)).toEqual(first);

    await generateBffLayer(root, []);
    expect(await snapshot(root)).toEqual(original);
  });
});
