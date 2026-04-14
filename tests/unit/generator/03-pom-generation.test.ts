/**
 * tests/unit/generator/03-pom-generation.test.ts
 *
 * Tests unitaires pour la génération du pom.xml.
 * Vérifie que les dépendances Maven sont correctement ajoutées
 * en fonction des technologies détectées.
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../../../server/java-parser";
import { generateSpringBootProject } from "../../../server/spring-generator";
import { generatePomXml } from "../../../server/spring/infra-gen";

describe("POM generation", () => {
  describe("Dépendances de base", () => {
    it("pom.xml contient toujours spring-boot-starter-web", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom).toBeDefined();
      expect(pom!.content).toContain("spring-boot-starter-web");
    });

    it("pom.xml contient spring-boot-starter-validation", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom!.content).toContain("spring-boot-starter-validation");
    });

    it("pom.xml contient spring-boot-starter-actuator", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom!.content).toContain("spring-boot-starter-actuator");
    });

    it("pom.xml contient springdoc-openapi", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom!.content).toContain("springdoc-openapi");
    });

    it("pom.xml contient lombok", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom!.content).toContain("lombok");
    });
  });

  describe("Dépendances conditionnelles", () => {
    it("pom.xml contient spring-boot-starter-data-jpa", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom!.content).toContain("spring-boot-starter-data-jpa");
    });

    it("pom.xml contient spring-boot-starter-test", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom!.content).toContain("spring-boot-starter-test");
    });
  });

  describe("Vendor-specific dependencies", () => {
    it("Oracle JDBC URL → ojdbc dans le pom", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        import javax.annotation.Resource;
        import javax.sql.DataSource;
        @Stateless
        public class CompteEJB {
          @Resource(name = "jdbc/OracleDS")
          private DataSource ds;
          private static final String URL = "jdbc:oracle:thin:@//localhost:1521/XE";
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom).toBeDefined();
      // Oracle driver should be in the POM
      expect(pom!.content).toContain("ojdbc");
    });
  });

  describe("POM structure", () => {
    it("pom.xml est un XML valide avec les balises essentielles", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom).toBeDefined();
      expect(pom!.content).toContain("<?xml version");
      expect(pom!.content).toContain("<project");
      expect(pom!.content).toContain("</project>");
      expect(pom!.content).toContain("<dependencies>");
      expect(pom!.content).toContain("</dependencies>");
      expect(pom!.content).toContain("<build>");
      expect(pom!.content).toContain("</build>");
    });

    it("pom.xml utilise Spring Boot 3.2.x", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom!.content).toContain("3.2.");
    });

    it("pom.xml utilise Java 17", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      const gen = generateSpringBootProject(ir);
      const pom = gen.files.find((f) => f.category === "pom");
      expect(pom!.content).toContain("<java.version>17</java.version>");
    });
  });
});
