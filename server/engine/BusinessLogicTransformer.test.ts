import { describe, it, expect } from "vitest";
import {
  BusinessLogicTransformer,
  extractExecuteBody,
  extractPrivateMethods,
  extractConstants,
  TransformContext,
} from "./BusinessLogicTransformer";
import * as fs from "fs";
import * as path from "path";

// ─── Test data: ActiverCarteUC source ───
const activerCarteSource = fs.readFileSync(
  path.join(__dirname, "../../test-projects/boa-realistic-ejb-project/activation-carte-bmcedirect-ejb/src/main/java/ma/eai/boa/xbanking/carte/usecases/ActiverCarteUC.java"),
  "utf-8"
);

const bloquerCarteSource = fs.readFileSync(
  path.join(__dirname, "../../test-projects/boa-realistic-ejb-project/activation-carte-bmcedirect-ejb/src/main/java/ma/eai/boa/xbanking/carte/usecases/BloquerCarteUC.java"),
  "utf-8"
);

const receptionnerCarteSource = fs.readFileSync(
  path.join(__dirname, "../../test-projects/boa-realistic-ejb-project/activation-carte-bmcedirect-ejb/src/main/java/ma/eai/boa/xbanking/carte/usecases/ReceptionnerCarteUC.java"),
  "utf-8"
);

// Empty UC (return null)
const emptyUCSource = `
public class VirementUC implements BaseUseCase {
    @EJB private MagixService magixService;
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException { return null; }
}`;

// ═══════════════════════════════════════════════════════════════
// ÉTAPE 1 — extractExecuteBody
// ═══════════════════════════════════════════════════════════════

describe("extractExecuteBody", () => {

  it("extracts the body of ActiverCarteUC.execute()", () => {
    const body = extractExecuteBody(activerCarteSource);
    expect(body).not.toBeNull();
    expect(body).toContain('magixService.consulter("CART01"');
    expect(body).toContain("throw new CarteInexistanteException");
    expect(body).not.toContain("public ValueObject execute");
  });

  it("extracts the body of BloquerCarteUC.execute()", () => {
    const body = extractExecuteBody(bloquerCarteSource);
    expect(body).not.toBeNull();
    expect(body).toContain('magixService.executeTransaction("CART05"');
    expect(body).toContain('output.setCodeRetour("000")');
  });

  it("extracts the body of ReceptionnerCarteUC.execute()", () => {
    const body = extractExecuteBody(receptionnerCarteSource);
    expect(body).not.toBeNull();
    expect(body).toContain('magixService.executeTransaction("CART04"');
  });

  it("returns null for empty execute() (return null)", () => {
    const body = extractExecuteBody(emptyUCSource);
    expect(body).toBeNull();
  });

  it("returns null when no execute() method exists", () => {
    const body = extractExecuteBody("public class Foo { }");
    expect(body).toBeNull();
  });

  it("handles nested braces correctly", () => {
    const body = extractExecuteBody(activerCarteSource);
    expect(body).not.toBeNull();
    // The body should contain the try-catch block with nested braces
    expect(body).toContain("try {");
    expect(body).toContain("} catch (");
  });
});

// ═══════════════════════════════════════════════════════════════
// ÉTAPE 2 — BusinessLogicTransformer
// ═══════════════════════════════════════════════════════════════

describe("BusinessLogicTransformer", () => {
  const transformer = new BusinessLogicTransformer();

  const activerCtx: TransformContext = {
    voInClass: "ActiverCarteVoIn",
    voOutClass: "ActiverCarteVoOut",
    requestDtoClass: "ActiverCarteRequestDTO",
    responseDtoClass: "ActiverCarteResponseDTO",
    sourceClassName: "ActiverCarteUC",
  };

  const bloquerCtx: TransformContext = {
    voInClass: "BloquerCarteVoIn",
    voOutClass: "BloquerCarteVoOut",
    requestDtoClass: "BloquerCarteRequestDTO",
    responseDtoClass: "BloquerCarteResponseDTO",
    sourceClassName: "BloquerCarteUC",
  };

  it("T1: removes VoIn cast line", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).not.toContain("(ActiverCarteVoIn) voIn");
    expect(result.body).toContain("Paramètre migré : request (ActiverCarteRequestDTO)");
  });

  it("T2: replaces input.xxx with request.xxx", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).toContain("request.getNumCarte()");
    expect(result.body).toContain("request.getCodeActivation()");
    expect(result.body).not.toContain("input.getNumCarte()");
    expect(result.body).not.toContain("input.getCodeActivation()");
  });

  it("T3: replaces new VoOut() with builder comment", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).not.toContain("new ActiverCarteVoOut()");
    expect(result.body).toContain("builder");
  });

  it("T4: replaces output.setXxx(val) with builder.xxx(val)", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).toContain('builder.codeRetour("000")');
    expect(result.body).toContain('builder.messageRetour("Carte activee avec succes")');
    expect(result.body).toContain("builder.numCarte(request.getNumCarte())");
    expect(result.body).not.toContain("output.setCodeRetour");
  });

  it("T5: replaces return output with return builder.build()", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).toContain("return builder.build();");
    expect(result.body).not.toContain("return output;");
  });

  it("T6: replaces javax. with jakarta.", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).not.toContain("javax.");
  });

  it("T7: replaces FwkRollbackException with BusinessRuleException", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).not.toContain("FwkRollbackException");
    expect(result.body).toContain("BusinessRuleException");
  });

  it("preserves magixService calls", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).toContain('magixService.consulter("CART01"');
    expect(result.body).toContain('magixService.executeTransaction("CART02"');
    expect(result.body).toContain('magixService.executeTransaction("CART03"');
  });

  it("preserves exception throws", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).toContain("throw new CarteInexistanteException");
    expect(result.body).toContain("throw new CarteDejaActiveException");
    expect(result.body).toContain("throw new CodeActivationInvalideException");
  });

  it("does NOT contain TODO", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).not.toContain("TODO");
  });

  it("transforms BloquerCarteUC correctly", () => {
    const body = extractExecuteBody(bloquerCarteSource)!;
    const result = transformer.transform(body, bloquerCtx);
    expect(result.body).toContain("request.getNumCarte()");
    expect(result.body).toContain("request.getMotifBlocage()");
    expect(result.body).toContain('builder.codeRetour("000")');
    expect(result.body).toContain("return builder.build();");
    expect(result.body).not.toContain("TODO");
  });

  it("reports linesTransformed > 0", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.linesTransformed).toBeGreaterThan(5);
  });

  // ═══════════════════════════════════════════════════════════════
  // BUG 2 — T0: voIn → request fallback (no cast scenario)
  // ═══════════════════════════════════════════════════════════════

  it("T0: replaces voIn. → request. when no cast exists", () => {
    const noCastBody = `
        voIn.getNumCarte();
        voIn.getCodeActivation();
        String result = voIn.toString();
    `;
    const ctx: TransformContext = {
      voInClass: "SomeVoIn",
      voOutClass: "SomeVoOut",
      requestDtoClass: "SomeRequestDTO",
      responseDtoClass: "SomeResponseDTO",
      sourceClassName: "SomeUC",
    };
    const result = transformer.transform(noCastBody, ctx);
    expect(result.body).toContain("request.getNumCarte()");
    expect(result.body).toContain("request.getCodeActivation()");
    expect(result.body).not.toContain("voIn.getNumCarte()");
    expect(result.body).not.toContain("voIn.getCodeActivation()");
  });

  it("T0: does NOT interfere with T1 cast removal", () => {
    // When T1 finds a cast, voIn should already be replaced by T1+T2
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    expect(result.body).not.toContain("voIn.");
    expect(result.body).toContain("Paramètre migré : request");
  });

  // ═══════════════════════════════════════════════════════════════
  // BUG 3 — T6b/c/d: LOG → log, Logger removal, warning → warn
  // ═══════════════════════════════════════════════════════════════

  it("T6b: replaces LOG. with log. for @Slf4j", () => {
    const body = `
        LOG.info("Starting operation");
        LOG.warning("Something happened");
        LOG.severe("Error occurred");
    `;
    const ctx: TransformContext = {
      voInClass: "XVoIn",
      voOutClass: "XVoOut",
      requestDtoClass: "XRequestDTO",
      responseDtoClass: "XResponseDTO",
      sourceClassName: "XUC",
    };
    const result = transformer.transform(body, ctx);
    expect(result.body).toContain("log.info");
    expect(result.body).not.toContain("LOG.info");
    expect(result.body).not.toContain("LOG.warning");
    expect(result.body).not.toContain("LOG.severe");
  });

  it("T6c: removes Logger/EaiLog declarations", () => {
    const body = `
        private static final Logger LOG = Logger.getLogger(MyClass.class.getName());
        private static final EaiLog eaiLog = new EaiLog(MyClass.class);
        LOG.info("test");
    `;
    const ctx: TransformContext = {
      voInClass: "XVoIn",
      voOutClass: "XVoOut",
      requestDtoClass: "XRequestDTO",
      responseDtoClass: "XResponseDTO",
      sourceClassName: "XUC",
    };
    const result = transformer.transform(body, ctx);
    expect(result.body).not.toContain("private static final Logger LOG");
    expect(result.body).not.toContain("private static final EaiLog");
    expect(result.body).toContain("log.info");
  });

  it("T6d: migrates java.util.logging methods to SLF4J", () => {
    const body = `
        log.warning("deprecated warning");
        log.severe("critical error");
        log.fine("debug info");
        log.finer("trace info");
        log.finest("deep trace");
        log.info("should stay");
    `;
    const ctx: TransformContext = {
      voInClass: "XVoIn",
      voOutClass: "XVoOut",
      requestDtoClass: "XRequestDTO",
      responseDtoClass: "XResponseDTO",
      sourceClassName: "XUC",
    };
    const result = transformer.transform(body, ctx);
    expect(result.body).toContain('log.warn("deprecated warning")');
    expect(result.body).toContain('log.error("critical error")');
    expect(result.body).toContain('log.debug("debug info")');
    expect(result.body).toContain('log.trace("trace info")');
    expect(result.body).toContain('log.trace("deep trace")');
    expect(result.body).toContain('log.info("should stay")');
    expect(result.body).not.toContain("log.warning");
    expect(result.body).not.toContain("log.severe");
    expect(result.body).not.toContain("log.fine(");
    expect(result.body).not.toContain("log.finer");
    expect(result.body).not.toContain("log.finest");
  });

  it("T6: real file — EaiLog declaration removed and LOG migrated", () => {
    const body = extractExecuteBody(activerCarteSource)!;
    const result = transformer.transform(body, activerCtx);
    // EaiLog is in the class body but extractExecuteBody only gets execute() body
    // Inside execute(), log.info/log.error should use lowercase log (from T6b)
    expect(result.body).toContain("log.info");
    expect(result.body).toContain("log.error");
    expect(result.body).not.toContain("LOG.info");
    expect(result.body).not.toContain("LOG.error");
  });
});

// ═════════════════════════════════════════════════════════════
// FIX 1 — T5: voOut référencé après setters → variable result
// ═════════════════════════════════════════════════════════════

describe("FIX 1: voOut post-setter reference → result variable", () => {
  const transformer = new BusinessLogicTransformer();

  it("inserts 'result = builder.build()' when voOut is referenced after setters", () => {
    const body = `
        ActiverCarteVoOut voOut = new ActiverCarteVoOut();
        voOut.setCodeRetour("000");
        voOut.setMessage("OK");
        LOG.info("Résultat: " + voOut.getCodeRetour());
        return voOut;
    `;
    const ctx: TransformContext = {
      voInClass: "ActiverCarteVoIn",
      voOutClass: "ActiverCarteVoOut",
      requestDtoClass: "ActiverCarteRequestDTO",
      responseDtoClass: "ActiverCarteResponseDTO",
      sourceClassName: "ActiverCarteUC",
    };
    const result = transformer.transform(body, ctx);
    // Should insert result variable
    expect(result.body).toContain("ActiverCarteResponseDTO result = builder.build();");
    // Should replace voOut.getCodeRetour() with result.getCodeRetour()
    expect(result.body).toContain("result.getCodeRetour()");
    expect(result.body).not.toContain("voOut.getCodeRetour()");
    // Should return result (not builder.build())
    expect(result.body).toContain("return result;");
  });

  it("does NOT insert result variable when voOut is NOT referenced after setters", () => {
    const body = `
        ActiverCarteVoOut voOut = new ActiverCarteVoOut();
        voOut.setCodeRetour("000");
        voOut.setMessage("OK");
        return voOut;
    `;
    const ctx: TransformContext = {
      voInClass: "ActiverCarteVoIn",
      voOutClass: "ActiverCarteVoOut",
      requestDtoClass: "ActiverCarteRequestDTO",
      responseDtoClass: "ActiverCarteResponseDTO",
      sourceClassName: "ActiverCarteUC",
    };
    const result = transformer.transform(body, ctx);
    // No result variable needed
    expect(result.body).not.toContain("ActiverCarteResponseDTO result = builder.build();");
    // Should use builder.build() directly
    expect(result.body).toContain("return builder.build();");
  });

  it("handles multiple post-setter references to voOut", () => {
    const body = `
        ActiverCarteVoOut voOut = new ActiverCarteVoOut();
        voOut.setCodeRetour("000");
        voOut.setMessage("Activation réussie");
        LOG.info("Code: " + voOut.getCodeRetour());
        LOG.info("Message: " + voOut.getMessage());
        return voOut;
    `;
    const ctx: TransformContext = {
      voInClass: "ActiverCarteVoIn",
      voOutClass: "ActiverCarteVoOut",
      requestDtoClass: "ActiverCarteRequestDTO",
      responseDtoClass: "ActiverCarteResponseDTO",
      sourceClassName: "ActiverCarteUC",
    };
    const result = transformer.transform(body, ctx);
    expect(result.body).toContain("ActiverCarteResponseDTO result = builder.build();");
    expect(result.body).toContain("result.getCodeRetour()");
    expect(result.body).toContain("result.getMessage()");
    expect(result.body).toContain("return result;");
  });
});

// ═══════════════════════════════════════════════════════════════
// Utility functions
// ═══════════════════════════════════════════════════════════════

describe("extractConstants", () => {
  it("extracts static final constants (not loggers)", () => {
    const source = `
      private static final EaiLog log = new EaiLog(ActiverCarteUC.class);
      private static final String CODE_ACTIVATION = "CART02";
      private static final int MAX_RETRIES = 3;
    `;
    const constants = extractConstants(source);
    expect(constants).toHaveLength(2);
    expect(constants[0]).toEqual({ name: "CODE_ACTIVATION", type: "String", value: '"CART02"' });
    expect(constants[1]).toEqual({ name: "MAX_RETRIES", type: "int", value: "3" });
  });
});

describe("extractPrivateMethods", () => {
  it("extracts private methods from source", () => {
    const source = `
public class TestUC {
    private String verifierCarte(String numCarte) {
        return magixService.consulter("CART01", numCarte);
    }
    private void logOperation(String msg) {
        log.info(msg);
    }
}`;
    const methods = extractPrivateMethods(source);
    expect(methods.size).toBe(2);
    expect(methods.has("verifierCarte")).toBe(true);
    expect(methods.has("logOperation")).toBe(true);
  });
});

// ─── FIX 2: T6e — log.log(Level.XXX) migration ───
describe("T6e: log.log(Level.XXX) migration", () => {
  const transformer = new BusinessLogicTransformer();
  const baseCtx: TransformContext = {
    voInClass: "CreditVoIn",
    voOutClass: "CreditVoOut",
    requestDtoClass: "CreditRequest",
    responseDtoClass: "CreditResponse",
    useCaseName: "DemanderCreditUC",
    serviceName: "DemanderCreditService",
    symbolTable: undefined,
  };

  it("migrates log.log(Level.WARNING, msg, exception) to log.warn(msg, exception)", () => {
    const code = `log.log(Level.WARNING, "GED non disponible (non bloquant)", e);`;
    const result = transformer.transform(code, baseCtx);
    expect(result.code).toContain('log.warn("GED non disponible (non bloquant)", e)');
    expect(result.code).not.toContain("Level.WARNING");
  });

  it("migrates log.log(Level.SEVERE, msg, ex) to log.error(msg, ex)", () => {
    const code = `log.log(Level.SEVERE, "Erreur critique", ex);`;
    const result = transformer.transform(code, baseCtx);
    expect(result.code).toContain('log.error("Erreur critique", ex)');
  });

  it("migrates log.log(Level.INFO, msg) to log.info(msg)", () => {
    const code = `log.log(Level.INFO, "Traitement en cours");`;
    const result = transformer.transform(code, baseCtx);
    expect(result.code).toContain('log.info("Traitement en cours")');
  });

  it("migrates log.log(Level.FINE, msg) to log.debug(msg)", () => {
    const code = `log.log(Level.FINE, "Debug trace");`;
    const result = transformer.transform(code, baseCtx);
    expect(result.code).toContain('log.debug("Debug trace")');
  });

  it("removes import java.util.logging statements", () => {
    const code = `import java.util.logging.Level;\nimport java.util.logging.Logger;\nlog.log(Level.WARNING, "test");`;
    const result = transformer.transform(code, baseCtx);
    expect(result.code).not.toContain("java.util.logging");
    expect(result.code).toContain('log.warn("test")');
  });
});

// ─── FIX 1 v5.9.2: T10 — VoOut/VoIn dans variables locales et résiduels → DTO ───
describe("T10: VoOut/VoIn type replacement in local variables and residuals", () => {
  const transformer = new BusinessLogicTransformer();
  const ctx: TransformContext = {
    voInClass: "ActiverCarteVoIn",
    voOutClass: "ActiverCarteVoOut",
    requestDtoClass: "ActiverCarteRequestDTO",
    responseDtoClass: "ActiverCarteResponseDTO",
    sourceClassName: "ActiverCarteUC",
  };

  it("replaces VoOut type in local variable declarations", () => {
    const body = `
        ActiverCarteVoOut result = new ActiverCarteVoOut();
        result.setCodeRetour("000");
        return result;
    `;
    const result = transformer.transform(body, ctx);
    expect(result.code).toContain("ActiverCarteResponseDTO");
    expect(result.code).not.toContain("ActiverCarteVoOut");
  });

  it("replaces VoIn type in local variable declarations", () => {
    const body = `
        ActiverCarteVoIn copie = request;
        String num = copie.getNumCarte();
    `;
    const result = transformer.transform(body, ctx);
    expect(result.code).toContain("ActiverCarteRequestDTO copie");
    expect(result.code).not.toContain("ActiverCarteVoIn");
  });

  it("replaces VoOut in method signatures and casts", () => {
    const body = `
        Object obj = getResult();
        ActiverCarteVoOut typed = (ActiverCarteVoOut) obj;
    `;
    const result = transformer.transform(body, ctx);
    expect(result.code).toContain("ActiverCarteResponseDTO typed");
    expect(result.code).toContain("(ActiverCarteResponseDTO)");
    expect(result.code).not.toContain("ActiverCarteVoOut");
  });

  it("replaces VoOut/VoIn in private method return types and parameters", () => {
    const body = `
        ActiverCarteVoOut processResult(ActiverCarteVoIn input) {
            return new ActiverCarteVoOut();
        }
    `;
    const result = transformer.transform(body, ctx);
    expect(result.code).toContain("ActiverCarteResponseDTO processResult");
    expect(result.code).toContain("ActiverCarteRequestDTO input");
    expect(result.code).not.toContain("ActiverCarteVoOut");
    expect(result.code).not.toContain("ActiverCarteVoIn");
  });
});

// ─── FIX 5 v5.9.2: ImportResolver enriched types ───
import { ImportResolver as IR } from "./ImportResolver";
describe("ImportResolver enriched types", () => {
  const resolver = new IR();

  it("resolves RoundingMode import", () => {
    const code = `package com.test;
public class Calc {
    BigDecimal amount = new BigDecimal("100").setScale(2, RoundingMode.HALF_UP);
}`;
    const imports = resolver.resolveImports(code, "com.test");
    expect(imports.some((i: string) => i.includes("java.math.RoundingMode"))).toBe(true);
    expect(imports.some((i: string) => i.includes("java.math.BigDecimal"))).toBe(true);
  });

  it("resolves DateTimeFormatter import", () => {
    const code = `package com.test;
public class DateUtil {
    DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd");
}`;
    const imports = resolver.resolveImports(code, "com.test");
    expect(imports.some((i: string) => i.includes("java.time.format.DateTimeFormatter"))).toBe(true);
  });

  it("resolves JPA annotations (Entity, Table, Id)", () => {
    const code = `package com.test;
@Entity
@Table(name = "comptes")
public class Compte {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
}`;
    const imports = resolver.resolveImports(code, "com.test");
    expect(imports.some((i: string) => i.includes("jakarta.persistence.Entity"))).toBe(true);
    expect(imports.some((i: string) => i.includes("jakarta.persistence.Table"))).toBe(true);
    expect(imports.some((i: string) => i.includes("jakarta.persistence.Id"))).toBe(true);
  });

  it("resolves ObjectMapper and JsonProperty imports", () => {
    const code = `package com.test;
public class Mapper {
    ObjectMapper mapper = new ObjectMapper();
    @JsonProperty("name")
    private String name;
}`;
    const imports = resolver.resolveImports(code, "com.test");
    expect(imports.some((i: string) => i.includes("com.fasterxml.jackson.databind.ObjectMapper"))).toBe(true);
    expect(imports.some((i: string) => i.includes("com.fasterxml.jackson.annotation.JsonProperty"))).toBe(true);
  });
});
