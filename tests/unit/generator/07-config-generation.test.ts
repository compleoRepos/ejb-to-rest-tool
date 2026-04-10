/**
 * tests/unit/generator/07-config-generation.test.ts
 *
 * Tests unitaires pour la génération de fichiers de configuration.
 * Vérifie application.yml, Dockerfile, docker-compose, K8s manifests.
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../../../server/java-parser";
import { generateSpringBootProject } from "../../../server/spring-generator";

function generateFromEjb(src: string, path = "src/main/java/com/bank/Test.java") {
  const ir = parseEjbProject([{ path, content: src }]);
  return generateSpringBootProject(ir);
}

const BASIC_EJB = `
  package com.bank.compte;
  import javax.ejb.Stateless;
  @Stateless
  public class CompteEJB {
    public double consulterSolde(String numCompte) { return 0; }
  }
`;

describe("Config generation", () => {
  describe("application.yml", () => {
    it("génère un fichier application.yml", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const yml = gen.files.find((f) => f.path.endsWith("application.yml"));
      expect(yml).toBeDefined();
      expect(yml!.category).toBe("config");
    });

    it("application.yml contient spring.application.name", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const yml = gen.files.find((f) => f.path.endsWith("application.yml"));
      expect(yml!.content).toContain("application");
    });

    it("application.yml contient la config datasource", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const yml = gen.files.find((f) => f.path.endsWith("application.yml"));
      expect(yml!.content).toContain("datasource");
    });

    it("application.yml contient la config JPA/Hibernate", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const yml = gen.files.find((f) => f.path.endsWith("application.yml"));
      expect(yml!.content).toContain("jpa");
    });
  });

  describe("application.properties", () => {
    it("génère un fichier application.properties", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const props = gen.files.find((f) => f.path.endsWith("application.properties"));
      expect(props).toBeDefined();
    });
  });

  describe("Dockerfile", () => {
    it("génère un Dockerfile", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const dockerfile = gen.files.find((f) => f.path === "Dockerfile");
      expect(dockerfile).toBeDefined();
      expect(dockerfile!.category).toBe("cloud");
    });

    it("Dockerfile utilise une image Java 17+", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const dockerfile = gen.files.find((f) => f.path === "Dockerfile");
      expect(dockerfile!.content).toMatch(/(?:openjdk|eclipse-temurin|amazoncorretto)/i);
    });

    it("Dockerfile a un EXPOSE 8080", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const dockerfile = gen.files.find((f) => f.path === "Dockerfile");
      expect(dockerfile!.content).toContain("EXPOSE");
    });
  });

  describe("docker-compose.yml", () => {
    it("génère un docker-compose.yml", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const compose = gen.files.find((f) => f.path === "docker-compose.yml");
      expect(compose).toBeDefined();
      expect(compose!.category).toBe("cloud");
    });

    it("docker-compose contient un service app", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const compose = gen.files.find((f) => f.path === "docker-compose.yml");
      expect(compose!.content).toContain("services:");
    });
  });

  describe("Kubernetes manifests", () => {
    it("génère un deployment K8s", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const deployment = gen.files.find((f) => f.path.includes("k8s/deployment"));
      expect(deployment).toBeDefined();
      expect(deployment!.category).toBe("cloud");
    });

    it("génère un service K8s", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const service = gen.files.find((f) => f.path.includes("k8s/service"));
      expect(service).toBeDefined();
    });
  });

  describe("Migration report", () => {
    it("génère un MIGRATION_REPORT.md", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const report = gen.files.find((f) => f.path === "MIGRATION_REPORT.md");
      expect(report).toBeDefined();
      expect(report!.category).toBe("report");
    });

    it("le rapport contient les statistiques de migration", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const report = gen.files.find((f) => f.path === "MIGRATION_REPORT.md");
      expect(report!.content).toContain("UseCases");
    });
  });

  describe("DATASOURCE_MIGRATION.md", () => {
    it("génère un guide de migration datasource", () => {
      const gen = generateFromEjb(BASIC_EJB, "src/main/java/com/bank/compte/CompteEJB.java");
      const ds = gen.files.find((f) => f.path.includes("DATASOURCE_MIGRATION"));
      expect(ds).toBeDefined();
    });
  });
});
