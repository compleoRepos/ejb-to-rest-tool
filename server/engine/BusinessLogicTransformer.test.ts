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
    expect(result.body).toContain("Builder pattern");
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
