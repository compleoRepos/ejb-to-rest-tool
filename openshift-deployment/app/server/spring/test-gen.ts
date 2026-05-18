/**
 * Test Generator — Generates JUnit 5 + MockMvc tests.
 * Rules: R11 (realistic test data), R12 (min 3 tests per endpoint).
 * Extracted from spring-generator.ts (v5.5).
 */

import type { DtoIR, DtoFieldIR, UseCaseIR } from "../java-parser";
import {
  type GeneratedFile,
  toPascalCase, toMethodName, mapDtoClassName, pluralize,
  inferSemanticEndpoint, getRealisticValue,
} from "./shared";

export function generateDomainControllerTest(
  basePackage: string, testPath: string, domain: string,
  useCases: UseCaseIR[], dtoMap: Map<string, DtoIR>
): GeneratedFile {
  const controllerName = toPascalCase(domain) + "Controller";
  const serviceName = toPascalCase(domain) + "Service";

  const testImports = new Set<string>();
  testImports.add("import org.junit.jupiter.api.DisplayName;");
  testImports.add("import org.junit.jupiter.api.Test;");
  testImports.add("import org.springframework.beans.factory.annotation.Autowired;");
  testImports.add("import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;");
  testImports.add("import org.springframework.boot.test.mock.bean.MockBean;");
  testImports.add("import org.springframework.http.MediaType;");
  testImports.add("import org.springframework.test.web.servlet.MockMvc;");
  testImports.add(`import ${basePackage}.service.${serviceName};`);
  testImports.add("import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;");
  testImports.add("import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;");
  testImports.add("import static org.mockito.ArgumentMatchers.*;");
  testImports.add("import static org.mockito.Mockito.when;");
  testImports.add(`import ${basePackage}.exception.BusinessRuleException;`);

  const testMethods: string[] = [];

  for (const uc of useCases) {
    const methodName = toMethodName(uc.className);
    const reqDto = dtoMap.get(uc.voInType);
    const resDto = dtoMap.get(uc.voOutType);
    const reqType = reqDto ? mapDtoClassName(reqDto.className) : null;
    const resType = resDto ? mapDtoClassName(resDto.className) : null;

    if (reqType) testImports.add(`import ${basePackage}.dto.${reqType};`);
    if (resType) testImports.add(`import ${basePackage}.dto.${resType};`);

    const semantic = inferSemanticEndpoint(uc, domain);
    const httpMethod = semantic.method.toLowerCase();
    const url = semantic.path
      .replace("{numCarte}", "1234567890123456")
      .replace("{numCompte}", "001234567890")
      .replace(/{(\w+)Id}/g, "12345")
      .replace(/{(\w+)}/g, "test-value");

    const isCreation = semantic.method === "POST" && /^(creer|create|ajouter|add)/i.test(uc.className.replace(/UC$/, "").replace(/UseCase$/, ""));

    const requestBody = reqDto ? buildRealisticRequestJson(reqDto) : null;
    const responseSetup = resDto ? buildRealisticResponseMock(resDto, resType!, methodName, domain + "Service") : null;

    const expectedStatus = isCreation ? "isCreated" : "isOk";
    testMethods.push(`
    @Test
    @DisplayName("${semantic.method} ${semantic.path} — happy path")
    void ${methodName}_shouldReturnOk() throws Exception {
${responseSetup ? responseSetup : ""}
        // when & then
        mockMvc.perform(${httpMethod}("${url}")${requestBody ? `
                .contentType(MediaType.APPLICATION_JSON)
                .content(${JSON.stringify(requestBody)})` : ""})
                .andExpect(status().${expectedStatus}())${resDto ? buildJsonPathAssertions(resDto) : ""};
    }`);

    if (reqType && (semantic.method === "POST" || semantic.method === "PUT")) {
      testMethods.push(`
    @Test
    @DisplayName("${semantic.method} ${semantic.path} — validation error with empty body")
    void ${methodName}_shouldReturnBadRequest_whenInvalidInput() throws Exception {
        // when & then
        mockMvc.perform(${httpMethod}("${url}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
                .andExpect(status().isBadRequest());
    }`);
    }

    testMethods.push(`
    @Test
    @DisplayName("${semantic.method} ${semantic.path} — business rule violation")
    void ${methodName}_shouldReturn422_whenBusinessRuleViolated() throws Exception {
        // given — service throws a business rule exception
        when(${domain}Service.${methodName}(${reqType ? "any()" : ""}))
            .thenThrow(new BusinessRuleException("Règle métier violée"));

        // when & then
        mockMvc.perform(${httpMethod}("${url}")${requestBody ? `
                .contentType(MediaType.APPLICATION_JSON)
                .content(${JSON.stringify(requestBody)})` : ""})
                .andExpect(status().isUnprocessableEntity());
    }`);
  }

  return {
    path: `${testPath}/controller/${controllerName}Test.java`,
    category: "test",
    content: `package ${basePackage}.controller;

${[...testImports].sort().join("\n")}

/**
 * Tests for ${controllerName}.
 * R12: Minimum 3 tests per endpoint (happy path, validation, business rule).
 * Auto-generated by Compleo Modernizer.
 */
@WebMvcTest(${controllerName}.class)
class ${controllerName}Test {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ${serviceName} ${domain}Service;
${testMethods.join("\n")}
}
`,
  };
}

function buildRealisticRequestJson(dto: DtoIR): string {
  const obj: Record<string, any> = {};
  for (const field of dto.fields) {
    obj[field.name] = getRealisticValue(field);
  }
  return JSON.stringify(obj);
}

function buildRealisticResponseMock(dto: DtoIR, resType: string, methodName: string, serviceVar: string): string {
  const lines: string[] = [];
  lines.push(`        // given — R11: realistic test data`);
  lines.push(`        ${resType} expected = ${resType}.builder()`);
  for (const field of dto.fields) {
    const val = getRealisticValue(field);
    if (typeof val === "string") {
      lines.push(`            .${field.name}("${val}")`);
    } else {
      lines.push(`            .${field.name}(${val})`);
    }
  }
  lines.push(`            .build();`);
  lines.push(`        when(${serviceVar}.${methodName}(any())).thenReturn(expected);`);
  return lines.join("\n");
}

function buildJsonPathAssertions(dto: DtoIR): string {
  const assertions: string[] = [];
  const fieldsToAssert = dto.fields.slice(0, 3);
  for (const field of fieldsToAssert) {
    const val = getRealisticValue(field);
    if (typeof val === "string") {
      assertions.push(`\n                .andExpect(jsonPath("$.${field.name}").value("${val}"))`);
    } else if (typeof val === "number") {
      assertions.push(`\n                .andExpect(jsonPath("$.${field.name}").value(${val}))`);
    }
  }
  return assertions.join("");
}
