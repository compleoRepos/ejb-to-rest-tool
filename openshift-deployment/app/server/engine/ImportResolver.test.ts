/**
 * Tests unitaires pour ImportResolver — FIX v5.8.2.
 * Vérifie la résolution automatique des imports Java manquants.
 */

import { describe, it, expect } from "vitest";
import { ImportResolver } from "./ImportResolver";
import type { ProjectIR } from "../java-parser";

const resolver = new ImportResolver();

describe("ImportResolver — FIX v5.8.2", () => {

  describe("Java stdlib imports", () => {
    it("détecte BigDecimal et ajoute l'import java.math.BigDecimal", () => {
      const code = `package com.example.service;

public class TestService {
    public void calculate(BigDecimal amount) {
        BigDecimal result = amount.multiply(BigDecimal.TEN);
    }
}`;
      const imports = resolver.resolveImports(code, "com.example.service");
      expect(imports).toContain("import java.math.BigDecimal;");
    });

    it("détecte LocalDate et ajoute l'import java.time.LocalDate", () => {
      const code = `package com.example.service;

public class TestService {
    public void setDate(LocalDate date) {}
}`;
      const imports = resolver.resolveImports(code, "com.example.service");
      expect(imports).toContain("import java.time.LocalDate;");
    });

    it("détecte List, Map, Optional en même temps", () => {
      const code = `package com.example.service;

public class TestService {
    private List<String> items;
    private Map<String, Object> config;
    private Optional<String> name;
}`;
      const imports = resolver.resolveImports(code, "com.example.service");
      expect(imports).toContain("import java.util.List;");
      expect(imports).toContain("import java.util.Map;");
      expect(imports).toContain("import java.util.Optional;");
    });
  });

  describe("Ne duplique pas les imports existants", () => {
    it("ignore les imports déjà présents dans le code", () => {
      const code = `package com.example.service;

import java.math.BigDecimal;

public class TestService {
    public void calculate(BigDecimal amount) {}
}`;
      const imports = resolver.resolveImports(code, "com.example.service");
      expect(imports).not.toContain("import java.math.BigDecimal;");
    });
  });

  describe("DTOs du projet", () => {
    it("ajoute les imports pour les DTOs mappés (VoIn→RequestDTO)", () => {
      const code = `package com.example.service;

public class TestService {
    public void process(ActiverCarteRequestDTO request) {}
}`;
      const ir: Partial<ProjectIR> = {
        dtos: [{
          className: "ActiverCarteVoIn",
          packageName: "com.example.dto",
          fields: [],
          sourceFile: "test.java",
          isInput: true,
          isOutput: false,
        }],
        exceptions: [],
        enums: [],
      };
      const imports = resolver.resolveImports(code, "com.example", ir as ProjectIR);
      expect(imports).toContain("import com.example.dto.ActiverCarteRequestDTO;");
    });
  });

  describe("Exceptions du projet", () => {
    it("ajoute les imports pour les exceptions du projet", () => {
      const code = `package com.example.service;

public class TestService {
    public void process() {
        throw new CarteInactiveException("Carte inactive");
    }
}`;
      const ir: Partial<ProjectIR> = {
        dtos: [],
        exceptions: [{
          className: "CarteInactiveException",
          packageName: "com.example.exception",
          sourceFile: "test.java",
        }],
        enums: [],
      };
      const imports = resolver.resolveImports(code, "com.example", ir as ProjectIR);
      expect(imports).toContain("import com.example.exception.CarteInactiveException;");
    });
  });

  describe("Enums du projet", () => {
    it("ajoute les imports pour les enums du projet", () => {
      const code = `package com.example.service;

public class TestService {
    private StatutCarte statut = StatutCarte.ACTIVE;
}`;
      const ir: Partial<ProjectIR> = {
        dtos: [],
        exceptions: [],
        enums: [{
          className: "StatutCarte",
          packageName: "com.example.model",
          values: ["ACTIVE", "INACTIVE"],
          sourceFile: "test.java",
        }],
      };
      const imports = resolver.resolveImports(code, "com.example", ir as ProjectIR);
      expect(imports).toContain("import com.example.model.StatutCarte;");
    });
  });

  describe("injectImports", () => {
    it("insère les imports après la déclaration package", () => {
      const code = `package com.example.service;

public class TestService {}`;
      const result = resolver.injectImports(code, ["import java.math.BigDecimal;"]);
      expect(result).toContain("import java.math.BigDecimal;");
      expect(result.indexOf("import java.math.BigDecimal;")).toBeGreaterThan(
        result.indexOf("package com.example.service;")
      );
    });

    it("ne duplique pas les imports déjà présents lors de l'injection", () => {
      const code = `package com.example.service;

import java.math.BigDecimal;

public class TestService {}`;
      const result = resolver.injectImports(code, ["import java.math.BigDecimal;"]);
      const matches = result.match(/import java\.math\.BigDecimal;/g);
      expect(matches).toHaveLength(1);
    });

    it("ne modifie pas le code si aucun import à ajouter", () => {
      const code = `package com.example.service;

public class TestService {}`;
      const result = resolver.injectImports(code, []);
      expect(result).toBe(code);
    });
  });

  describe("Filtrage du même package", () => {
    it("ne génère pas d'import pour les classes du même package", () => {
      const code = `package com.example.service;

public class TestService {
    private OtherService other;
}`;
      // OtherService n'est pas dans les mappings connus, donc pas d'import
      const imports = resolver.resolveImports(code, "com.example.service");
      const samePackageImport = imports.find(i => i.includes("com.example.service"));
      expect(samePackageImport).toBeUndefined();
    });
  });
});
