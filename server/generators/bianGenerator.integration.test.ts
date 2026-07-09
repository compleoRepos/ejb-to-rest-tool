import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateBianWrappers } from "./bianGenerator";
import type { BianProject } from "./bianGenerator";
import fs from "fs/promises";
import path from "path";
import os from "os";

const TEST_OUTPUT = path.join(os.tmpdir(), "vitest-bian-integration");

// Test projects simulating real-world multi-adapter scenario
const testProjects: BianProject[] = [
  {
    adapterName: "virement-bmcedirect",
    endpoints: [
      {
        operation: "saveVirement",
        method: "POST",
        path: "/api/virement/save",
        requestFields: [
          { name: "montant", type: "Double", required: true },
          { name: "beneficiaire", type: "Object", children: [{ name: "nom", type: "String" }, { name: "rib", type: "String" }] },
        ],
        responseFields: [{ name: "reference", type: "String" }, { name: "statut", type: "String" }],
      },
      {
        operation: "getStatutVirement",
        method: "GET",
        path: "/api/virement/statut",
        requestFields: [{ name: "reference", type: "String", required: true }],
        responseFields: [{ name: "statut", type: "String" }],
      },
    ],
  },
  {
    adapterName: "commande-chequier-bmcedirect",
    endpoints: [
      {
        operation: "commanderChequier",
        method: "POST",
        path: "/api/chequier/commander",
        requestFields: [{ name: "numCompte", type: "String", required: true }],
        responseFields: [{ name: "numCommande", type: "String" }],
      },
    ],
  },
  {
    adapterName: "gestion-carte-bmcedirect",
    endpoints: [
      {
        operation: "bloquerCarte",
        method: "POST",
        path: "/api/carte/bloquer",
        requestFields: [{ name: "numCarte", type: "String", required: true }],
        responseFields: [{ name: "success", type: "Boolean" }],
      },
    ],
  },
  {
    adapterName: "3dsecure-carte-bmcedirect",
    endpoints: [
      {
        operation: "activer3DSecure",
        method: "POST",
        path: "/api/carte/3dsecure",
        requestFields: [{ name: "numCarte", type: "String" }],
        responseFields: [{ name: "enrolled", type: "Boolean" }],
      },
    ],
  },
  {
    adapterName: "releve-carte-bmcedirect",
    endpoints: [
      {
        operation: "getRelevesCarte",
        method: "GET",
        path: "/api/carte/releves",
        requestFields: [{ name: "numCarte", type: "String" }],
        responseFields: [
          { name: "releves", type: "Object", isList: true, children: [{ name: "date", type: "Date" }, { name: "montant", type: "Double" }, { name: "libelle", type: "String" }] },
        ],
      },
    ],
  },
  {
    adapterName: "envoi-notification-bmcedirect",
    endpoints: [
      {
        operation: "envoyerSms",
        method: "POST",
        path: "/api/notification/sms",
        requestFields: [{ name: "telephone", type: "String", required: true }, { name: "message", type: "String" }],
        responseFields: [{ name: "messageId", type: "String" }],
      },
    ],
  },
  {
    adapterName: "consultation-compte-bmcedirect",
    endpoints: [
      {
        operation: "getSolde",
        method: "GET",
        path: "/api/compte/solde",
        requestFields: [{ name: "numCompte", type: "String" }],
        responseFields: [{ name: "solde", type: "Double" }, { name: "devise", type: "String" }],
      },
    ],
  },
  {
    adapterName: "simulation-credit-bmcedirect",
    endpoints: [
      {
        operation: "simulerCredit",
        method: "POST",
        path: "/api/credit/simuler",
        requestFields: [{ name: "montant", type: "Double" }, { name: "duree", type: "Integer" }],
        responseFields: [{ name: "mensualite", type: "Double" }, { name: "tauxEffectif", type: "Double" }],
      },
    ],
  },
  {
    adapterName: "change-devise-bmcedirect",
    endpoints: [
      {
        operation: "convertirDevise",
        method: "POST",
        path: "/api/change/convertir",
        requestFields: [{ name: "montant", type: "Double" }, { name: "deviseSource", type: "String" }, { name: "deviseCible", type: "String" }],
        responseFields: [{ name: "montantConverti", type: "Double" }, { name: "taux", type: "Double" }],
      },
    ],
  },
];

describe("BIAN Generator - Integration Tests", () => {
  let result: Awaited<ReturnType<typeof generateBianWrappers>>;

  beforeAll(async () => {
    await fs.rm(TEST_OUTPUT, { recursive: true, force: true });
    result = await generateBianWrappers({
      projects: testProjects,
      outputDir: TEST_OUTPUT,
      groupId: "ma.bmce.bian",
      basePackage: "ma.bmce.bian",
    });
  });

  afterAll(async () => {
    await fs.rm(TEST_OUTPUT, { recursive: true, force: true });
  });

  describe("Wrapper Generation Results", () => {
    it("should generate correct number of wrappers (grouped by BIAN domain)", () => {
      expect(result.errors).toHaveLength(0);
      // virement + commande-chequier → Payment Order
      // gestion-carte + 3dsecure-carte + releve-carte → Card Administration
      // envoi-notification → Party Notification
      // consultation-compte → Current Account
      // simulation-credit → Consumer Loan
      // change-devise → Foreign Exchange
      expect(result.wrappers.length).toBe(6);
    });

    it("should group virement and commande-chequier into Payment Order", () => {
      const po = result.wrappers.find((w) => w.name === "payment-order-wrapper");
      expect(po).toBeDefined();
      expect(po!.serviceDomain).toBe("Payment Order");
      expect(po!.endpoints).toBe(3); // 2 from virement + 1 from commande-chequier
    });

    it("should group carte adapters into Card Administration", () => {
      const ca = result.wrappers.find((w) => w.name === "card-administration-wrapper");
      expect(ca).toBeDefined();
      expect(ca!.endpoints).toBe(3); // bloquer + 3dsecure + releves
    });

    it("should report zero errors", () => {
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("File Structure Validation", () => {
    it("should generate pom.xml for each wrapper", async () => {
      for (const w of result.wrappers) {
        const pomPath = path.join(w.outputDir, "pom.xml");
        const exists = await fs.access(pomPath).then(() => true).catch(() => false);
        expect(exists, `pom.xml missing in ${w.name}`).toBe(true);
      }
    });

    it("should generate application.yml for each wrapper", async () => {
      for (const w of result.wrappers) {
        const ymlPath = path.join(w.outputDir, "src/main/resources/application.yml");
        const exists = await fs.access(ymlPath).then(() => true).catch(() => false);
        expect(exists, `application.yml missing in ${w.name}`).toBe(true);
      }
    });

    it("should generate Dockerfile for each wrapper", async () => {
      for (const w of result.wrappers) {
        const dockerPath = path.join(w.outputDir, "Dockerfile");
        const exists = await fs.access(dockerPath).then(() => true).catch(() => false);
        expect(exists, `Dockerfile missing in ${w.name}`).toBe(true);
      }
    });

    it("should generate OpenAPI spec for each wrapper", async () => {
      for (const w of result.wrappers) {
        const specPath = path.join(w.outputDir, "src/main/resources/openapi.json");
        const exists = await fs.access(specPath).then(() => true).catch(() => false);
        expect(exists, `openapi.json missing in ${w.name}`).toBe(true);
      }
    });

    it("should generate Postman collection for each wrapper", async () => {
      for (const w of result.wrappers) {
        const docsDir = path.join(w.outputDir, "docs");
        const exists = await fs.access(docsDir).then(() => true).catch(() => false);
        expect(exists, `docs/ dir missing in ${w.name}`).toBe(true);
        if (exists) {
          const files = await fs.readdir(docsDir);
          const hasPostman = files.some((f) => f.includes("postman"));
          expect(hasPostman, `Postman collection missing in ${w.name}/docs/`).toBe(true);
        }
      }
    });

    it("should generate Pact Consumer and Provider tests", async () => {
      for (const w of result.wrappers) {
        const testDir = path.join(w.outputDir, "src/test/java");
        const exists = await fs.access(testDir).then(() => true).catch(() => false);
        expect(exists, `test dir missing in ${w.name}`).toBe(true);
        if (exists) {
          const allFiles = await listFilesRecursive(testDir);
          const pactFiles = allFiles.filter((f) => f.includes("Pact"));
          expect(pactFiles.length, `No Pact tests in ${w.name}`).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("CORS Configuration", () => {
    it("should use allowedOriginPatterns (not allowedOrigins) in CorsConfig", async () => {
      const po = result.wrappers.find((w) => w.name === "payment-order-wrapper")!;
      const corsPath = path.join(po.outputDir, "src/main/java/ma/bmce/bian/paymentorder/config/CorsConfig.java");
      const content = await fs.readFile(corsPath, "utf-8");
      expect(content).toContain("allowedOriginPatterns");
      expect(content).not.toContain(".allowedOrigins(");
    });
  });

  describe("Nested DTO Generation", () => {
    it("should generate child DTO class for nested Object field (beneficiaire)", async () => {
      const po = result.wrappers.find((w) => w.name === "payment-order-wrapper")!;
      const dtoDir = path.join(po.outputDir, "src/main/java/ma/bmce/bian/paymentorder/dto/request");
      const files = await fs.readdir(dtoDir);
      const childDto = files.find((f) => f.includes("Beneficiaire"));
      expect(childDto, "Child DTO for beneficiaire not found").toBeDefined();
    });

    it("should generate List<T> field for isList nested Object (releves)", async () => {
      const ca = result.wrappers.find((w) => w.name === "card-administration-wrapper")!;
      const dtoDir = path.join(ca.outputDir, "src/main/java/ma/bmce/bian/cardadministration/dto/response");
      const files = await fs.readdir(dtoDir);
      const responseDto = files.find((f) => f.includes("GetRelevesCarteResponse") && !f.includes("Releves."));
      expect(responseDto).toBeDefined();
      if (responseDto) {
        const content = await fs.readFile(path.join(dtoDir, responseDto), "utf-8");
        expect(content).toContain("List<");
      }
    });

    it("should add @Valid annotation for nested object fields", async () => {
      const po = result.wrappers.find((w) => w.name === "payment-order-wrapper")!;
      const dtoDir = path.join(po.outputDir, "src/main/java/ma/bmce/bian/paymentorder/dto/request");
      const files = await fs.readdir(dtoDir);
      const mainDto = files.find((f) => f.includes("SaveVirementRequest") && !f.includes("Beneficiaire"));
      expect(mainDto).toBeDefined();
      if (mainDto) {
        const content = await fs.readFile(path.join(dtoDir, mainDto), "utf-8");
        expect(content).toContain("@Valid");
      }
    });
  });

  describe("Multi-Adapter Controller Split", () => {
    it("should generate separate controllers for multi-adapter wrappers", async () => {
      const po = result.wrappers.find((w) => w.name === "payment-order-wrapper")!;
      const ctrlDir = path.join(po.outputDir, "src/main/java/ma/bmce/bian/paymentorder/controller");
      const files = await fs.readdir(ctrlDir);
      // Should have VirementController + CommandeChequierController (2 adapters)
      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files.some((f) => f.includes("Virement"))).toBe(true);
      expect(files.some((f) => f.includes("CommandeChequier"))).toBe(true);
    });

    it("should generate a single controller for single-adapter wrappers", async () => {
      const cl = result.wrappers.find((w) => w.name === "consumer-loan-wrapper")!;
      const ctrlDir = path.join(cl.outputDir, "src/main/java/ma/bmce/bian/consumerloan/controller");
      const files = await fs.readdir(ctrlDir);
      expect(files.length).toBe(1);
      expect(files[0]).toBe("ConsumerLoanController.java");
    });
  });

  describe("Java Identifier Safety", () => {
    it("should not generate Java files starting with a digit", async () => {
      const ca = result.wrappers.find((w) => w.name === "card-administration-wrapper")!;
      const allFiles = await listFilesRecursive(ca.outputDir);
      const javaFiles = allFiles.filter((f) => f.endsWith(".java"));
      for (const f of javaFiles) {
        const basename = path.basename(f);
        expect(basename, `Java file starts with digit: ${basename}`).not.toMatch(/^\d/);
      }
    });
  });

  describe("Application Configuration", () => {
    it("should have SERVER_PORT configurable with default 8081", async () => {
      const po = result.wrappers.find((w) => w.name === "payment-order-wrapper")!;
      const yml = await fs.readFile(path.join(po.outputDir, "src/main/resources/application.yml"), "utf-8");
      expect(yml).toContain("${SERVER_PORT:8081}");
    });

    it("should have INFO log level by default", async () => {
      const po = result.wrappers.find((w) => w.name === "payment-order-wrapper")!;
      const yml = await fs.readFile(path.join(po.outputDir, "src/main/resources/application.yml"), "utf-8");
      expect(yml).toContain("ma.bmce.bian.paymentorder: INFO");
    });

    it("should have per-adapter URL configuration", async () => {
      const po = result.wrappers.find((w) => w.name === "payment-order-wrapper")!;
      const yml = await fs.readFile(path.join(po.outputDir, "src/main/resources/application.yml"), "utf-8");
      expect(yml).toContain("virement-bmcedirect:");
      expect(yml).toContain("commande-chequier-bmcedirect:");
    });
  });

  describe("Security Configuration", () => {
    it("should generate SecurityConfig with Keycloak OAuth2", async () => {
      const po = result.wrappers.find((w) => w.name === "payment-order-wrapper")!;
      const secPath = path.join(po.outputDir, "src/main/java/ma/bmce/bian/paymentorder/config/SecurityConfig.java");
      const content = await fs.readFile(secPath, "utf-8");
      expect(content).toContain("@EnableWebSecurity");
      expect(content).toContain("oauth2ResourceServer");
    });
  });

  describe("Resilience4j Configuration", () => {
    it("should configure per-adapter circuit breaker instances", async () => {
      const po = result.wrappers.find((w) => w.name === "payment-order-wrapper")!;
      const yml = await fs.readFile(path.join(po.outputDir, "src/main/resources/application.yml"), "utf-8");
      expect(yml).toContain("circuitbreaker:");
      expect(yml).toContain("virement-bmcedirect:");
      expect(yml).toContain("commande-chequier-bmcedirect:");
    });
  });
});

// Helper to list all files recursively
async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}
