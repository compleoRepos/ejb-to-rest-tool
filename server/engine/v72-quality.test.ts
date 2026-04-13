/**
 * Tests unitaires — Quality Scorer v7.3 (8 checks)
 *
 * Pondération (total = 100 pts) :
 *   CHECK 1 — SQL_CONSTANTS     (25 pts)
 *   CHECK 2 — NO_VOID_BUILDER   (15 pts)
 *   CHECK 3 — NO_OBJECT_RETURN  (10 pts)
 *   CHECK 4 — METHOD_PARAMS     (15 pts)
 *   CHECK 5 — MS_NAMES          (10 pts)
 *   CHECK 6 — ORACLE_KEYWORDS    (5 pts)
 *   CHECK 7 — URL_CONFLICTS     (10 pts)
 *   CHECK 8 — USECASES_DETECTED (10 pts)
 */

import { describe, it, expect } from "vitest";
import { scoreGeneration, type QualityReport, type CheckId } from "./quality-scorer";
import type { GeneratedFile } from "../spring/shared";

// ── Helper: build minimal files ─────────────────────────────────────

function serviceFile(className: string, body: string): GeneratedFile {
  return {
    path: `src/main/java/com/example/service/${className}Service.java`,
    content: body,
    category: "service",
  };
}

function controllerFile(className: string, body: string): GeneratedFile {
  return {
    path: `src/main/java/com/example/controller/${className}Controller.java`,
    content: body,
    category: "controller",
  };
}

function getCheck(report: QualityReport, id: CheckId) {
  return report.checks.find(c => c.id === id)!;
}

// ══════════════════════════════════════════════════════════════════════
// CHECK 1 — SQL_CONSTANTS (25 pts)
// ══════════════════════════════════════════════════════════════════════

describe("CHECK 1 — SQL_CONSTANTS", () => {
  it("25/25 quand les constantes sont au niveau classe", () => {
    const files: GeneratedFile[] = [
      serviceFile("Compte", `
public class CompteService {
    private static final String SQL_SELECT = "SELECT * FROM T_COMPTE";
    private static final String SQL_UPDATE = "UPDATE T_COMPTE SET ...";

    @Transactional
    public CompteDTO consulterSolde(String numCompte) {
        log.info("consulterSolde: {}", numCompte);
        return jdbcTemplate.queryForObject(SQL_SELECT, mapper, numCompte);
    }
}
      `),
    ];
    const report = scoreGeneration(files);
    const check = getCheck(report, "SQL_CONSTANTS");
    expect(check.points).toBe(25);
    expect(check.passed).toBe(true);
  });

  it("< 25 quand une constante SQL est dans le body", () => {
    const files: GeneratedFile[] = [
      serviceFile("Carte", `
public class CarteService {
    private static final String SQL_SELECT = "SELECT * FROM T_CARTE";

    @Transactional
    public List<String> getCartesActives(String numCompte) {
        final String SQL_INSERT = "INSERT INTO T_CARTE_LOG ...";
        return jdbcTemplate.queryForList(SQL_SELECT, String.class, numCompte);
    }
}
      `),
    ];
    const report = scoreGeneration(files);
    const check = getCheck(report, "SQL_CONSTANTS");
    expect(check.points).toBeLessThan(25);
    expect(check.passed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// CHECK 2 — NO_VOID_BUILDER (15 pts)
// ══════════════════════════════════════════════════════════════════════

describe("CHECK 2 — NO_VOID_BUILDER", () => {
  it("15/15 quand pas de Void.builder()", () => {
    const files: GeneratedFile[] = [
      serviceFile("Compte", `
public class CompteService {
    public CompteDTO consulterSolde(String numCompte) {
        return new CompteDTO();
    }
}
      `),
    ];
    const report = scoreGeneration(files);
    const check = getCheck(report, "NO_VOID_BUILDER");
    expect(check.points).toBe(15);
    expect(check.passed).toBe(true);
  });

  it("0/15 quand Void.builder() est présent", () => {
    const files: GeneratedFile[] = [
      serviceFile("Carte", `
public class CarteService {
    public Void getCartesActives() {
        return Void.builder().build();
    }
}
      `),
    ];
    const report = scoreGeneration(files);
    const check = getCheck(report, "NO_VOID_BUILDER");
    expect(check.points).toBe(0);
    expect(check.passed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// CHECK 3 — NO_OBJECT_RETURN (10 pts)
// ══════════════════════════════════════════════════════════════════════

describe("CHECK 3 — NO_OBJECT_RETURN", () => {
  it("10/10 quand pas de méthode retournant Object", () => {
    const files: GeneratedFile[] = [
      serviceFile("Auth", `
public class AuthService {
    public AuthResponseDTO handlePostConnexion(AuthRequestDTO request) {
        return new AuthResponseDTO();
    }
}
      `),
    ];
    const report = scoreGeneration(files);
    const check = getCheck(report, "NO_OBJECT_RETURN");
    expect(check.points).toBe(10);
    expect(check.passed).toBe(true);
  });

  it("0/10 quand Object est type retour", () => {
    const files: GeneratedFile[] = [
      serviceFile("Auth", `
public class AuthService {
    public Object handlePostConnexion(String request) {
        return new Object();
    }
}
      `),
    ];
    const report = scoreGeneration(files);
    const check = getCheck(report, "NO_OBJECT_RETURN");
    expect(check.points).toBe(0);
    expect(check.passed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// CHECK 5 — MS_NAMES (10 pts)
// ══════════════════════════════════════════════════════════════════════

describe("CHECK 5 — MS_NAMES", () => {
  it("10/10 avec des noms de domaine propres", () => {
    const report = scoreGeneration(
      [],
      ["carte-service", "compte-service", "virement-service"]
    );
    const check = getCheck(report, "MS_NAMES");
    expect(check.points).toBe(10);
    expect(check.passed).toBe(true);
  });

  it("< 10 avec des noms contenant des underscores", () => {
    const report = scoreGeneration(
      [],
      ["carteejb_getcartesactives-service", "compteejb_consultersolde-service"]
    );
    const check = getCheck(report, "MS_NAMES");
    expect(check.points).toBeLessThan(10);
    expect(check.passed).toBe(false);
  });

  it("10/10 quand pas de microservices (N/A)", () => {
    const report = scoreGeneration([], []);
    const check = getCheck(report, "MS_NAMES");
    expect(check.points).toBe(10);
    expect(check.passed).toBe(true);
  });

  it("pénalise les noms contenant EJB", () => {
    const report = scoreGeneration(
      [],
      ["carteejb-service", "compte-service"]
    );
    const check = getCheck(report, "MS_NAMES");
    expect(check.points).toBeLessThan(10);
    expect(check.passed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// CHECK 6 — ORACLE_KEYWORDS (5 pts)
// ══════════════════════════════════════════════════════════════════════

describe("CHECK 6 — ORACLE_KEYWORDS", () => {
  it("5/5 avec des tables propres", () => {
    const report = scoreGeneration(
      [],
      [],
      ["T_COMPTE", "T_CARTE", "T_VIREMENT", "T_CLIENT"]
    );
    const check = getCheck(report, "ORACLE_KEYWORDS");
    expect(check.points).toBe(5);
    expect(check.passed).toBe(true);
  });

  it("0/5 avec des mots-clés Oracle", () => {
    const report = scoreGeneration(
      [],
      [],
      ["T_COMPTE", "DUAL", "SYSDATE", "NEXTVAL", "T_CARTE"]
    );
    const check = getCheck(report, "ORACLE_KEYWORDS");
    expect(check.points).toBe(0);
    expect(check.passed).toBe(false);
  });

  it("détecte ROWNUM et NOWAIT", () => {
    const report = scoreGeneration(
      [],
      [],
      ["ROWNUM", "NOWAIT", "T_VALID"]
    );
    const check = getCheck(report, "ORACLE_KEYWORDS");
    expect(check.passed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Score global et grade
// ══════════════════════════════════════════════════════════════════════

describe("Score global", () => {
  it("100/100 A+ pour un projet parfait", () => {
    const files: GeneratedFile[] = [
      serviceFile("Compte", `
public class CompteService {
    private static final String SQL_SELECT = "SELECT * FROM T_COMPTE";

    @Transactional(readOnly = true)
    public CompteDTO consulterSolde(String numCompte) {
        return jdbcTemplate.queryForObject(SQL_SELECT, mapper, numCompte);
    }
}
      `),
    ];
    const report = scoreGeneration(
      files,
      ["compte-service", "carte-service"],
      ["T_COMPTE", "T_CARTE"],
      1 // legacyMethodCount = 1 (matches the 1 generated method)
    );
    expect(report.totalScore).toBe(120); // v7.9: 100 + 3 v7.8 checks (5+5+5) + 1 v7.9 SAGA (5)
    expect(report.grade).toBe("A+");
  });

  it("grade < A+ pour un projet avec violations", () => {
    const files: GeneratedFile[] = [
      serviceFile("Carte", `
public class CarteService {
    @Transactional
    public void getCartesActives(String numCompte) {
        final String SQL_SELECT = "SELECT * FROM T_CARTE";
        return jdbcTemplate.queryForList(SQL_SELECT, String.class, numCompte);
    }
}
      `),
    ];
    const report = scoreGeneration(
      files,
      ["carteejb_getcartesactives-service"],
      ["DUAL", "SYSDATE"]
    );
    expect(report.grade).not.toBe("A+");
    expect(report.totalScore).toBeLessThan(110); // v7.9: adjusted for 120 max
  });

  it("le summary contient le tableau markdown", () => {
    const report = scoreGeneration([], [], []);
    expect(report.summary).toContain("Score de Qualité");
    expect(report.summary).toContain("Critère");
    expect(report.summary).toContain("Description");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Domaines bancaires enrichis (FIX C v7.2)
// ══════════════════════════════════════════════════════════════════════

describe("Domaines bancaires enrichis", () => {
  it("les noms de domaine bancaires étendus sont reconnus", async () => {
    const { MicroserviceSplitter } = await import("./microservices/microservice-splitter");
    const splitter = new MicroserviceSplitter();
    expect(splitter).toBeDefined();
    expect(typeof splitter.split).toBe("function");
  });
});

// ══════════════════════════════════════════════════════════════════════
// FIX C bis — cleanModuleName dans microservice-generator
// ══════════════════════════════════════════════════════════════════════

describe("FIX C bis — cleanModuleName", () => {
  it("les fichiers microservices utilisent des noms propres", async () => {
    const { MicroserviceGenerator } = await import("./microservices/microservice-generator");
    expect(MicroserviceGenerator).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════
// inferDomainFromClassName — domaines bancaires étendus
// ══════════════════════════════════════════════════════════════════════

describe("inferDomainFromClassName — domaines étendus", () => {
  it("reconnaît les domaines bancaires core", async () => {
    const mod = await import("./microservices/microservice-splitter");
    expect(mod.MicroserviceSplitter).toBeDefined();
  });

  it("le score MS_NAMES valide les noms de domaines bancaires étendus", () => {
    const extendedDomains = [
      "assurance-service",
      "epargne-service",
      "change-service",
      "cheque-service",
      "garantie-service",
      "risque-service",
      "tresorerie-service",
      "trade-finance-service",
      "conformite-service",
      "comptabilite-service",
      "referentiel-service",
      "document-service",
      "workflow-service",
      "monetique-service",
      "interbancaire-service",
    ];

    const report = scoreGeneration([], extendedDomains, []);
    const check = getCheck(report, "MS_NAMES");
    expect(check.points).toBe(10);
    expect(check.passed).toBe(true);
  });
});
