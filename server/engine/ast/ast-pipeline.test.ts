/**
 * Tests unitaires pour le pipeline AST v5.3.1 :
 *   - JavaASTParser
 *   - SymbolTable
 *   - BusinessLogicTransformer (mode enrichi avec SymbolTable)
 *   - ServiceMethodGenerator
 *
 * @author Hamza NORDINE
 */
import { describe, it, expect, beforeAll } from "vitest";
import { JavaASTParser, type ClassNode } from "./JavaASTParser";
import { SymbolTable } from "./SymbolTable";
import { BusinessLogicTransformer, extractExecuteBody } from "../BusinessLogicTransformer";
import { ServiceMethodGenerator } from "../ServiceMethodGenerator";
import * as fs from "fs";
import * as path from "path";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const ACTIVER_CARTE_PATH = "/home/ubuntu/test-projects/activation-carte-bmcedirect-ejb/src/main/java/ma/eai/boa/xbanking/carte/usecases/ActiverCarteUC.java";
const BLOQUER_CARTE_PATH = "/home/ubuntu/test-projects/activation-carte-bmcedirect-ejb/src/main/java/ma/eai/boa/xbanking/carte/usecases/BloquerCarteUC.java";

const SYNTHETIC_JAVA = `
package com.example.test;

import javax.ejb.EJB;
import javax.ejb.Stateless;
import ma.eai.midw.usecases.UseCase;
import ma.eai.midw.services.MagixService;

@Stateless
public class TestUC extends UseCase {

    @EJB
    private MagixService magixService;

    private static final String CODE_OP = "TEST01";
    private static final String CODE_OP2 = "TEST02";

    public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        TestVoIn input = (TestVoIn) voIn;
        String result = magixService.consulter("TEST01", input.getNumCarte());
        TestVoOut output = new TestVoOut();
        output.setCodeRetour("000");
        output.setMessage(result);
        return output;
    }

    private void validateInput(String numCarte) {
        if (numCarte == null || numCarte.isEmpty()) {
            throw new IllegalArgumentException("Numéro de carte invalide");
        }
    }

    private String formatResult(String raw) {
        return raw.trim().toUpperCase();
    }
}
`;

const JDBC_JAVA = `
package com.example.test;

public class JdbcUC extends UseCase {
    public ValueObject execute(ValueObject voIn) throws Exception {
        JdbcVoIn input = (JdbcVoIn) voIn;
        Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement("SELECT * FROM table WHERE id = ?");
        JdbcVoOut output = new JdbcVoOut();
        output.setResult("ok");
        return output;
    }
}
`;

const SELF_INVOKE_JAVA = `
package com.example.test;

public class SelfUC extends UseCase {
    public ValueObject execute(ValueObject voIn) throws Exception {
        SelfVoIn input = (SelfVoIn) voIn;
        this.verifierCarte(input.getNumCarte());
        SelfVoOut output = new SelfVoOut();
        output.setStatus("OK");
        return output;
    }

    private void verifierCarte(String numCarte) {
        // validation
    }
}
`;

// ─── JavaASTParser Tests ───────────────────────────────────────────────────

describe("JavaASTParser", () => {
  const parser = new JavaASTParser();

  it("parses synthetic Java class correctly", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    expect(ast.className).toBe("TestUC");
    expect(ast.packageName).toBe("com.example.test");
  });

  it("extracts superclass", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    expect(ast.superClass).toBe("UseCase");
  });

  it("extracts fields with annotations", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const magixField = ast.fields.find(f => f.name === "magixService");
    expect(magixField).toBeDefined();
    expect(magixField!.type).toContain("MagixService");
    expect(magixField!.annotations.some(a => a.includes("EJB"))).toBe(true);
  });

  it("extracts static final constants", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const codeOp = ast.fields.find(f => f.name === "CODE_OP");
    expect(codeOp).toBeDefined();
    expect(codeOp!.isStatic).toBe(true);
    expect(codeOp!.isFinal).toBe(true);
  });

  it("extracts 3 methods (execute + 2 private)", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    expect(ast.methods.length).toBe(3);
    const executeMethod = ast.methods.find(m => m.name === "execute");
    expect(executeMethod).toBeDefined();
    expect(executeMethod!.isPublic).toBe(true);
  });

  it("extracts execute() body non-empty", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute");
    expect(executeMethod!.body.length).toBeGreaterThan(10);
    expect(executeMethod!.body).toContain("magixService.consulter");
  });

  it("extracts private methods", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const privateMethods = ast.methods.filter(m => m.isPrivate);
    expect(privateMethods.length).toBe(2);
    expect(privateMethods.map(m => m.name)).toContain("validateInput");
    expect(privateMethods.map(m => m.name)).toContain("formatResult");
  });

  it("extracts method parameters", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute");
    expect(executeMethod!.params.length).toBe(1);
    expect(executeMethod!.params[0].name).toBe("voIn");
  });

  it("extracts throws clause", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute");
    expect(executeMethod!.throwsClause.length).toBeGreaterThan(0);
  });

  it("extracts imports", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    expect(ast.imports.length).toBeGreaterThan(0);
    expect(ast.imports.some(i => i.includes("javax.ejb.EJB"))).toBe(true);
  });

  // Test with real project file if available
  if (fs.existsSync(ACTIVER_CARTE_PATH)) {
    it("parses ActiverCarteUC.java from real project", () => {
      const source = fs.readFileSync(ACTIVER_CARTE_PATH, "utf-8");
      const ast = parser.parse(source);
      expect(ast.className).toBe("ActiverCarteUC");
      expect(ast.methods.find(m => m.name === "execute")).toBeDefined();
      const ejbFields = ast.fields.filter(f =>
        f.annotations.some(a => a.includes("EJB"))
      );
      expect(ejbFields.length).toBeGreaterThan(0);
    });
  }
});

// ─── SymbolTable Tests ─────────────────────────────────────────────────────

describe("SymbolTable", () => {
  const parser = new JavaASTParser();
  const symbolTable = new SymbolTable();

  it("detects INPUT_ALIAS from VoIn cast", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const input = symbolTable.resolve("input");
    expect(input).toBeDefined();
    expect(input!.role).toBe("INPUT_ALIAS");
    expect(input!.isVoIn).toBe(true);
  });

  it("detects OUTPUT_DTO from new VoOut()", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const output = symbolTable.resolve("output");
    expect(output).toBeDefined();
    expect(output!.role).toBe("OUTPUT_DTO");
    expect(output!.isVoOut).toBe(true);
  });

  it("detects EXTERNAL_SERVICE on @EJB field", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const magix = symbolTable.resolve("magixService");
    expect(magix).toBeDefined();
    expect(magix!.role).toBe("EXTERNAL_SERVICE");
  });

  it("extracts Magix codes from source", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const magix = symbolTable.resolve("magixService");
    expect(magix!.magixCodes).toContain("TEST01");
  });

  it("detects CONSTANT on static final fields", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const constants = symbolTable.getConstants();
    expect(constants.length).toBeGreaterThanOrEqual(2);
    expect(constants.map(c => c.name)).toContain("CODE_OP");
  });

  it("getExternalServices returns only @EJB fields", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const services = symbolTable.getExternalServices();
    expect(services.length).toBe(1);
    expect(services[0].name).toBe("magixService");
  });

  it("getInputAlias returns the cast variable", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const alias = symbolTable.getInputAlias();
    expect(alias).toBeDefined();
    expect(alias!.name).toBe("input");
  });

  it("getOutputVar returns the VoOut variable", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const output = symbolTable.getOutputVar();
    expect(output).toBeDefined();
    expect(output!.name).toBe("output");
  });
});

// ─── BusinessLogicTransformer (enriched mode) Tests ────────────────────────

describe("BusinessLogicTransformer — enriched mode", () => {
  const parser = new JavaASTParser();
  const symbolTable = new SymbolTable();
  const transformer = new BusinessLogicTransformer();

  const ctx = {
    voInClass: "TestVoIn",
    voOutClass: "TestVoOut",
    requestDtoClass: "TestRequestDTO",
    responseDtoClass: "TestResponseDTO",
    sourceClassName: "TestUC",
    methodName: "test",
  };

  it("transforms with SymbolTable (3-arg mode)", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const result = transformer.transform(executeMethod.body, symbolTable, ctx);
    expect(result.code).toBeDefined();
    expect(result.code).not.toContain("(TestVoIn) voIn");
    expect(result.code).toContain("request.");
    expect(result.code).toContain("builder.");
    expect(result.code).toContain("return builder.build();");
  });

  it("extracts Magix codes in enriched mode", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const result = transformer.transform(executeMethod.body, symbolTable, ctx);
    expect(result.magixCodes).toContain("TEST01");
  });

  it("reports migratedLines > 0", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const result = transformer.transform(executeMethod.body, symbolTable, ctx);
    expect(result.migratedLines).toBeGreaterThan(0);
  });

  it("reports 0 TODOs for clean code", () => {
    const ast = parser.parse(SYNTHETIC_JAVA);
    const executeMethod = ast.methods.find(m => m.name === "execute")!;
    symbolTable.buildFromMethod(executeMethod, ast, /VoIn$/, /VoOut$/);

    const result = transformer.transform(executeMethod.body, symbolTable, ctx);
    expect(result.todos).toHaveLength(0);
    expect(result.manualLines).toBe(0);
  });

  it("T8: detects JDBC_DIRECT as TODO", () => {
    const jdbcBody = `Connection conn = dataSource.getConnection();
PreparedStatement ps = conn.prepareStatement("SELECT * FROM table");`;
    const result = transformer.transform(jdbcBody, ctx);
    expect(result.todos.length).toBeGreaterThan(0);
    expect(result.todos[0].type).toBe("JDBC_DIRECT");
    expect(result.todos[0].priority).toBe("HIGH");
    expect(result.manualLines).toBeGreaterThan(0);
  });

  it("T9: detects self-invocation as warning", () => {
    const selfBody = `this.verifierCarte(input.getNumCarte());`;
    const result = transformer.transform(selfBody, ctx);
    expect(result.warnings.some(w => w.includes("Self-invocation"))).toBe(true);
  });

  it("backward compatible: 2-arg mode still works", () => {
    const body = extractExecuteBody(SYNTHETIC_JAVA)!;
    const result = transformer.transform(body, ctx);
    expect(result.body).toBeDefined();
    expect(result.code).toBe(result.body);
    expect(result.linesTransformed).toBe(result.migratedLines);
  });
});

// ─── ServiceMethodGenerator Tests ──────────────────────────────────────────

describe("ServiceMethodGenerator", () => {
  const generator = new ServiceMethodGenerator("com.example.test");

  it("generates method with Javadoc and @Transactional", () => {
    const result = generator.generateMethod(
      {
        methodName: "activerCarte",
        description: "Activation de carte bancaire",
        sourceClassName: "ActiverCarteUC",
        sourceFilePath: "carte/usecases/ActiverCarteUC.java",
        requestDtoClass: "ActiverCarteRequestDTO",
        responseDtoClass: "ActiverCarteResponseDTO",
        requestDtoFields: [{ name: "numCarte", type: "String" }],
      },
      {
        body: "",
        code: "        String result = magixService.consulter(\"CART01\", request.getNumCarte());\n        return builder.build();",
        extractedConstants: [],
        extractedPrivateMethods: [],
        warnings: [],
        linesTransformed: 5,
        todos: [],
        magixCodes: ["CART01"],
        migratedLines: 5,
        manualLines: 0,
      },
      []
    );

    expect(result).toContain("@Transactional");
    expect(result).toContain("activerCarte");
    expect(result).toContain("ActiverCarteRequestDTO");
    expect(result).toContain("Migré depuis : ActiverCarteUC");
    expect(result).toContain("Codes Magix : CART01");
    expect(result).toContain("request.getNumCarte()");
  });

  it("includes TODO comments when present", () => {
    const result = generator.generateMethod(
      {
        methodName: "test",
        description: "Test",
        sourceClassName: "TestUC",
        sourceFilePath: "test.java",
        requestDtoClass: "TestRequestDTO",
        responseDtoClass: "TestResponseDTO",
      },
      {
        body: "",
        code: "        // migrated code",
        extractedConstants: [],
        extractedPrivateMethods: [],
        warnings: [],
        linesTransformed: 1,
        todos: [{ type: "JDBC_DIRECT", line: "conn.getConnection()", suggestion: "Use Spring Data JPA", priority: "HIGH" }],
        magixCodes: [],
        migratedLines: 1,
        manualLines: 1,
      },
      []
    );

    expect(result).toContain("TODO [JDBC_DIRECT]");
  });

  it("generates MagixService stub with specific code methods", () => {
    const stub = generator.generateMagixServiceStub(["CART01", "CART02", "VIR01"]);
    expect(stub).toContain("class MagixService");
    expect(stub).toContain("consulter");
    expect(stub).toContain("executeTransaction");
    expect(stub).toContain("cart01");
    expect(stub).toContain("cart02");
    expect(stub).toContain("vir01");
    expect(stub).toContain("CART01");
  });

  it("extracts private helpers from AST methods", () => {
    const parser = new JavaASTParser();
    const ast = parser.parse(SYNTHETIC_JAVA);
    const privateMethods = ast.methods.filter(m => m.isPrivate);

    const helpers = ServiceMethodGenerator.extractPrivateHelpers(privateMethods, "TestUC");
    expect(helpers.length).toBe(2);
    expect(helpers.map(h => h.name)).toContain("validateInput");
    expect(helpers.map(h => h.name)).toContain("formatResult");
    expect(helpers[0].sourceClassName).toBe("TestUC");
  });
});
