/**
 * Controller Generator — Generates Spring @RestController classes.
 * Rules: R1 (semantic naming), R2 (PathVariable), R3 (HTTP status), R4 (no try/catch), R5 (OpenAPI).
 * Extracted from spring-generator.ts (v5.5).
 *
 * FIX v5.8.2: Uses determineHttpConfig() for proper REST URL semantics:
 * - POST création → /resources (sans ID), 201 Created
 * - POST action métier → /resources/{id}/action, 200 OK
 * - GET consultation → /resources/{id}, 200 OK
 * - GET liste → /resources, 200 OK
 * - PUT modification → /resources/{id}, 200 OK
 * - DELETE suppression → /resources/{id}, 204 No Content
 */

import type { UseCaseIR, DtoIR, DtoFieldIR } from "../java-parser";
import {
  type GeneratedFile,
  type HttpConfig,
  toPascalCase, toMethodName, mapDtoClassName, pluralize,
  determineHttpConfig, getIdParamName, getHttpAnnotation,
} from "./shared";

export function generateDomainController(
  basePackage: string, basePath: string, domain: string,
  useCases: UseCaseIR[], dtoMap: Map<string, DtoIR>
): GeneratedFile {
  const controllerName = toPascalCase(domain) + "Controller";
  const serviceName = toPascalCase(domain) + "Service";
  const serviceVar = domain + "Service";
  const imports = new Set<string>();
  imports.add("import lombok.RequiredArgsConstructor;");
  imports.add("import lombok.extern.slf4j.Slf4j;");
  imports.add("import org.springframework.http.ResponseEntity;");
  imports.add("import org.springframework.web.bind.annotation.*;");
  imports.add(`import ${basePackage}.service.${serviceName};`);
  imports.add("import io.swagger.v3.oas.annotations.Operation;");
  imports.add("import io.swagger.v3.oas.annotations.tags.Tag;");

  const endpoints: string[] = [];

  for (const uc of useCases) {
    const methodName = toMethodName(uc.className);
    const reqDto = dtoMap.get(uc.voInType);
    const resDto = dtoMap.get(uc.voOutType);

    const reqType = reqDto ? mapDtoClassName(reqDto.className) : null;
    const resType = resDto ? mapDtoClassName(resDto.className) : "Void";

    if (reqType) imports.add(`import ${basePackage}.dto.${reqType};`);
    if (resType !== "Void") imports.add(`import ${basePackage}.dto.${resType};`);
    if (reqType) imports.add("import jakarta.validation.Valid;");

    // FIX v5.8.2: Use determineHttpConfig for proper REST URL semantics
    const httpConfig = determineHttpConfig(uc, domain);
    const httpMethod = httpConfig.method;
    const endpointPath = httpConfig.pathSuffix;
    const hasIdParam = httpConfig.hasPathVariable;
    const idParamName = hasIdParam ? getIdParamName(uc) : "";

    let paramList = "";
    let methodBodyPrefix = "";

    if (httpMethod === "GET" && reqType && reqDto) {
      // GET methods NEVER have @RequestBody — convert DTO fields to @RequestParam/@RequestHeader
      const paramParts: string[] = [];
      if (hasIdParam) {
        paramParts.push(`@PathVariable String ${idParamName}`);
      }
      const contextualFields = new Set(["canal", "codeCanal", "channel", "userId", "idUtilisateur", "userAgent"]);
      const idFields = new Set(["id", "numCompte", "numCarte", "clientId", "numero"]);
      const builderParts: string[] = [];

      for (const field of reqDto.fields) {
        const fieldName = field.name;
        if (hasIdParam && (fieldName === idParamName || idFields.has(fieldName))) {
          builderParts.push(`            .${fieldName}(${idParamName})`);
          continue;
        }
        const isRequired = field.required;
        if (contextualFields.has(fieldName)) {
          imports.add("import org.springframework.web.bind.annotation.RequestHeader;");
          const headerName = fieldName === "canal" || fieldName === "codeCanal" ? "X-Canal" :
                            fieldName === "userId" || fieldName === "idUtilisateur" ? "X-User-Id" :
                            "X-" + fieldName.replace(/([A-Z])/g, "-$1");
          paramParts.push(`@RequestHeader(value = "${headerName}", required = ${isRequired}) String ${fieldName}`);
        } else {
          imports.add("import org.springframework.web.bind.annotation.RequestParam;");
          paramParts.push(`@RequestParam(required = ${isRequired}) ${mapToSpringParamType(field)} ${fieldName}`);
        }
        builderParts.push(`            .${fieldName}(${fieldName})`);
      }
      paramList = paramParts.join(",\n            ");

      methodBodyPrefix = `        ${reqType} request = ${reqType}.builder()
${builderParts.join("\n")}
            .build();\n`;
    } else if (hasIdParam && reqType) {
      paramList = `@PathVariable String ${idParamName}, @Valid @RequestBody ${reqType} request`;
    } else if (hasIdParam) {
      paramList = `@PathVariable String ${idParamName}`;
    } else if (reqType) {
      paramList = `@Valid @RequestBody ${reqType} request`;
    }

    // FIX v5.8.2: Use httpConfig.responseStatus for proper HTTP status codes
    let responseStatement: string;
    if (httpConfig.responseStatus === 201) {
      imports.add("import org.springframework.http.HttpStatus;");
      responseStatement = resType !== "Void"
        ? `        ${resType} result = ${serviceVar}.${methodName}(${reqType ? "request" : ""});\n        return ResponseEntity.status(HttpStatus.CREATED).body(result);`
        : `        ${serviceVar}.${methodName}(${reqType ? "request" : ""});\n        return ResponseEntity.status(HttpStatus.CREATED).build();`;
    } else if (httpConfig.responseStatus === 204) {
      responseStatement = `        ${serviceVar}.${methodName}(${reqType ? "request" : ""});\n        return ResponseEntity.noContent().build();`;
    } else {
      responseStatement = resType !== "Void"
        ? `        ${resType} result = ${serviceVar}.${methodName}(${reqType ? "request" : ""});\n        return ResponseEntity.ok(result);`
        : `        ${serviceVar}.${methodName}(${reqType ? "request" : ""});\n        return ResponseEntity.ok().build();`;
    }

    const javadoc = (uc as any).useCaseDescription || (uc as any).javadoc || "";
    const operationSummary = extractShortSummary(javadoc, methodName, domain);
    const operationDescription = javadoc ? javadoc.replace(/"/g, '\\"') : "";

    const basePath2 = `/api/v1/${pluralize(domain.toLowerCase())}`;
    const fullPath = `${basePath2}${endpointPath}`;
    const httpAnnotation = getHttpAnnotation(httpMethod, endpointPath || "/" + methodName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase());
    const returnGeneric = resType !== "Void" ? resType : "Void";

    endpoints.push(`
    /**
     * ${httpMethod} ${fullPath}
     * ${uc.bianDomain ? `BIAN: ${uc.bianDomain} / ${uc.bianAction}` : `UseCase: ${uc.className}`}
     * ${javadoc ? javadoc : ""}
     */
    @Operation(
        summary = "${operationSummary}"${operationDescription ? `,
        description = "${operationDescription}"` : ""}
    )
    ${httpAnnotation}
    public ResponseEntity<${returnGeneric}> ${methodName}(${paramList}) {
        log.info("${httpMethod} ${fullPath}");
${methodBodyPrefix}${responseStatement}
    }`);
  }

  const basePath2 = `/api/v1/${pluralize(domain.toLowerCase())}`;

  return {
    path: `${basePath}/controller/${controllerName}.java`,
    category: "controller",
    content: `package ${basePackage}.controller;

${[...imports].sort().join("\n")}

/**
 * ${controllerName} — REST API for ${domain} domain.
 * ${useCases.length} endpoint(s) migrated from EJB UseCases.
 * Auto-generated by Compleo Modernizer.
 */
@Slf4j
@RestController
@RequestMapping("${basePath2}")
@RequiredArgsConstructor
@Tag(name = "${toPascalCase(domain)}", description = "API for ${domain} operations")
public class ${controllerName} {

    private final ${serviceName} ${serviceVar};
${endpoints.join("\n")}
}
`,
  };
}

// ─── Helper: Map DTO field type to a simple @RequestParam type ───────────────

function mapToSpringParamType(field: DtoFieldIR): string {
  const t = field.resolvedType || field.type;
  if (t === "BigDecimal") return "java.math.BigDecimal";
  if (t === "Long" || t === "long") return "Long";
  if (t === "Integer" || t === "int") return "Integer";
  if (t === "Double" || t === "double") return "Double";
  if (t === "Boolean" || t === "boolean") return "Boolean";
  if (t.startsWith("List<")) return "String"; // Simplified: pass as comma-separated string
  return "String";
}

// ─── Helper: Extract short summary for @Operation (< 80 chars) ──────────────

function extractShortSummary(description: string, methodName: string, domain: string): string {
  if (description) {
    const firstSentence = description.split(/[.:\n]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length <= 80) {
      return firstSentence;
    }
    if (firstSentence.length > 80) {
      return firstSentence.substring(0, 77) + "...";
    }
  }
  return methodName
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
    + " \u2014 " + domain;
}
