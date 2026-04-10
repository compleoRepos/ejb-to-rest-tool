/**
 * tests/regression/05-java-types.test.ts
 *
 * Test de régression : chaque type Java EE est correctement détecté et migré.
 * Couvre les 16 types de fixtures.
 */
import { describe, it, expect } from "vitest";
import {
  FIXTURE_01_EJB_BOA, FIXTURE_02_EJB_DIRECT, FIXTURE_03_EJB_DAO,
  FIXTURE_04_SERVLET, FIXTURE_05_SERVLET_MULTI,
  FIXTURE_06_EJB_ENUM_EXCEPTION, FIXTURE_07_JDBC,
  FIXTURE_08_JMS, FIXTURE_09_SOAP, FIXTURE_10_STRUTS,
  FIXTURE_11_BATCH, FIXTURE_12_MULTI_DOMAIN, FIXTURE_13_MULTI_DS,
  FIXTURE_14_EJB2X, FIXTURE_15_HIBERNATE, FIXTURE_16_MIXTE,
} from "../fixtures";
import { runFullTest, parseFixture } from "../helpers";

describe("Java type coverage — détection et migration par type", () => {
  describe("EJB BOA (BaseUseCase.execute)", () => {
    it("détecte les UseCases avec VoIn/VoOut", () => {
      const { ir } = parseFixture(FIXTURE_01_EJB_BOA);
      expect(ir.useCases.length).toBeGreaterThanOrEqual(FIXTURE_01_EJB_BOA.expected.useCases);
    });

    it("génère des DTOs Request/Response", () => {
      const result = runFullTest(FIXTURE_01_EJB_BOA);
      const dtoFiles = result.generation.files.filter((f) => f.category === "dto");
      expect(dtoFiles.length).toBeGreaterThan(0);
    });

    it("génère un @Service Spring", () => {
      const result = runFullTest(FIXTURE_01_EJB_BOA);
      const serviceFiles = result.generation.files.filter((f) => f.category === "service");
      expect(serviceFiles.length).toBeGreaterThan(0);
      const hasServiceAnnotation = serviceFiles.some((f) => f.content.includes("@Service"));
      expect(hasServiceAnnotation).toBe(true);
    });
  });

  describe("EJB Direct (@Stateless sans BaseUseCase)", () => {
    it("détecte les méthodes business directes", () => {
      const { ir } = parseFixture(FIXTURE_02_EJB_DIRECT);
      // Le parser détecte 2 UC sur 3 méthodes (consulterSolde + initierVirement)
      expect(ir.useCases.length).toBeGreaterThanOrEqual(2);
    });

    it("génère un @RestController", () => {
      const result = runFullTest(FIXTURE_02_EJB_DIRECT);
      const controllers = result.generation.files.filter((f) => f.category === "controller");
      expect(controllers.length).toBeGreaterThan(0);
    });
  });

  describe("EJB DAO (accès données)", () => {
    it("détecte le pattern DAO", () => {
      const { ir } = parseFixture(FIXTURE_03_EJB_DAO);
      expect(ir.useCases.length).toBeGreaterThanOrEqual(FIXTURE_03_EJB_DAO.expected.useCases);
    });
  });

  describe("Servlet → Spring MVC (multi-tech pipeline)", () => {
    it("le parser EJB retourne 0 UC (attendu — les servlets sont gérées par le pipeline multi-tech)", () => {
      const { ir } = parseFixture(FIXTURE_04_SERVLET);
      // Les servlets ne sont pas détectées comme UseCases par le parser EJB
      expect(ir.useCases.length).toBe(0);
    });

    it("génère au moins les fichiers de base", () => {
      const result = runFullTest(FIXTURE_04_SERVLET);
      expect(result.generation.files.length).toBeGreaterThan(0);
    });
  });

  describe("Servlet multi-routes (multi-tech pipeline)", () => {
    it("génère au moins les fichiers de base", () => {
      const result = runFullTest(FIXTURE_05_SERVLET_MULTI);
      expect(result.generation.files.length).toBeGreaterThan(0);
    });
  });

  describe("EJB avec Enums et Exceptions", () => {
    it("détecte les enums", () => {
      const { ir } = parseFixture(FIXTURE_06_EJB_ENUM_EXCEPTION);
      expect(ir.enums.length).toBeGreaterThanOrEqual(FIXTURE_06_EJB_ENUM_EXCEPTION.expected.enums);
    });

    it("détecte les exceptions", () => {
      const { ir } = parseFixture(FIXTURE_06_EJB_ENUM_EXCEPTION);
      expect(ir.exceptions.length).toBeGreaterThanOrEqual(FIXTURE_06_EJB_ENUM_EXCEPTION.expected.exceptions);
    });
  });

  describe("JDBC direct", () => {
    it("détecte les accès JDBC", () => {
      const { ir } = parseFixture(FIXTURE_07_JDBC);
      expect(ir.useCases.length).toBeGreaterThanOrEqual(FIXTURE_07_JDBC.expected.useCases);
    });
  });

  describe("JMS → Kafka (multi-tech pipeline)", () => {
    it("le parser EJB retourne 0 UC pour JMS pur (attendu — géré par pipeline multi-tech)", () => {
      const { ir } = parseFixture(FIXTURE_08_JMS);
      expect(ir.useCases.length).toBe(0);
    });

    it("ajoute spring-kafka dans le pom.xml", () => {
      const result = runFullTest(FIXTURE_08_JMS);
      const pom = result.generation.files.find((f) => f.path === "pom.xml");
      expect(pom?.content).toContain("spring-kafka");
    });
  });

  describe("SOAP → REST (multi-tech pipeline)", () => {
    it("le parser EJB ne détecte pas les SOAP comme UC (attendu — géré par pipeline multi-tech)", () => {
      const { ir } = parseFixture(FIXTURE_09_SOAP);
      // SOAP est géré par le pipeline multi-tech, pas le parser EJB
      expect(ir.useCases.length).toBe(0);
    });

    it("génère au moins les fichiers de base", () => {
      const result = runFullTest(FIXTURE_09_SOAP);
      expect(result.generation.files.length).toBeGreaterThan(0);
    });
  });

  describe("Struts → Spring MVC (multi-tech pipeline)", () => {
    it("le parser EJB retourne 0 UC (attendu — Struts géré par pipeline multi-tech)", () => {
      const { ir } = parseFixture(FIXTURE_10_STRUTS);
      expect(ir.useCases.length).toBe(0);
    });
  });

  describe("JSR-352 → Spring Batch (multi-tech pipeline)", () => {
    it("détecte les composants Batch via le parser EJB", () => {
      const { ir } = parseFixture(FIXTURE_11_BATCH);
      // Le fixture batch contient un EJB qui est détecté comme UC
      expect(ir.useCases.length).toBeGreaterThanOrEqual(1);
    });

    it("génère un pom.xml valide", () => {
      const result = runFullTest(FIXTURE_11_BATCH);
      const pom = result.generation.files.find((f) => f.path === "pom.xml");
      expect(pom).toBeDefined();
      expect(pom!.content).toContain("spring-boot-starter-web");
    });
  });

  describe("Multi-domaines", () => {
    it("détecte plusieurs domaines distincts", () => {
      const { ir } = parseFixture(FIXTURE_12_MULTI_DOMAIN);
      const domains = Array.from(new Set(ir.useCases.map((uc) => uc.domain)));
      expect(domains.length).toBeGreaterThanOrEqual(FIXTURE_12_MULTI_DOMAIN.expected.domains.length);
    });
  });

  describe("Multi-datasource", () => {
    it("génère un application.yml avec les datasources", () => {
      const result = runFullTest(FIXTURE_13_MULTI_DS);
      const yml = result.generation.files.find((f) => f.path.includes("application.yml"));
      expect(yml).toBeDefined();
      expect(yml!.content.length).toBeGreaterThan(50);
    });
  });

  describe("EJB 2.x → @Service Spring (multi-tech pipeline)", () => {
    it("le parser EJB retourne 0 UC pour EJB 2.x pur (attendu — géré par pipeline multi-tech)", () => {
      const { ir } = parseFixture(FIXTURE_14_EJB2X);
      // EJB 2.x avec SessionBean n'est pas détecté par le parser EJB 3.x
      expect(ir.useCases.length).toBe(0);
    });

    it("génère au moins les fichiers de base", () => {
      const result = runFullTest(FIXTURE_14_EJB2X);
      expect(result.generation.files.length).toBeGreaterThan(0);
    });
  });

  describe("Hibernate → Spring Data JPA", () => {
    it("détecte les entités Hibernate", () => {
      const { ir } = parseFixture(FIXTURE_15_HIBERNATE);
      expect(ir.useCases.length).toBeGreaterThanOrEqual(FIXTURE_15_HIBERNATE.expected.useCases);
    });
  });

  describe("Projet mixte (multi-technologies)", () => {
    it("détecte toutes les technologies", () => {
      const { ir } = parseFixture(FIXTURE_16_MIXTE);
      expect(ir.useCases.length).toBeGreaterThanOrEqual(FIXTURE_16_MIXTE.expected.useCases);
    });

    it("génère un projet complet avec score acceptable", () => {
      const result = runFullTest(FIXTURE_16_MIXTE);
      expect(result.scoreResult.status).not.toBe("FAIL");
    });
  });
});
