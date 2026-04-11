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

  // FIX C v5.7.2: Detect and resolve URL conflicts (same verb + same path)
  // Pre-compute httpConfig for all UseCases to detect duplicates
  const httpConfigs = useCases.map(uc => ({
    uc,
    config: determineHttpConfig(uc, domain),
    methodName: toMethodName(uc.className),
  }));
  const pathCounts = new Map<string, number>();
  for (const { config } of httpConfigs) {
    const key = `${config.method}:${config.pathSuffix}`;
    pathCounts.set(key, (pathCounts.get(key) || 0) + 1);
  }

  for (const uc of useCases) {
    const methodName = toMethodName(uc.className);
    const reqDto = dtoMap.get(uc.voInType);
    const resDto = dtoMap.get(uc.voOutType);

    const reqType = reqDto ? mapDtoClassName(reqDto.className) : null;
    // FIX B v7.1: Infer return type from voOutType even when not in dtoMap
    const resType = resDto
      ? mapDtoClassName(resDto.className)
      : (uc.voOutType && uc.voOutType !== "Void" && uc.voOutType !== "void" && uc.voOutType !== "Object" && uc.voOutType !== "ValueObject")
        ? resolveRawReturnTypeCtrl(uc.voOutType, imports, basePackage)
        : "Void";

    if (reqType) imports.add(`import ${basePackage}.dto.${reqType};`);
    if (resType !== "Void") {
      if (resDto) {
        imports.add(`import ${basePackage}.dto.${resType};`);
      } else {
        addImportsForRawTypeCtrl(resType, imports, basePackage);
      }
    }
    if (reqType) imports.add("import jakarta.validation.Valid;");

    // FIX v5.8.2: Use determineHttpConfig for proper REST URL semantics
    const httpConfig = determineHttpConfig(uc, domain);
    const httpMethod = httpConfig.method;
    let endpointPath = httpConfig.pathSuffix;
    const hasIdParam = httpConfig.hasPathVariable;
    const idParamName = hasIdParam ? getIdParamName(uc) : "";

    // FIX C v5.7.2: If multiple UseCases share the same verb + path, add sub-path
    // e.g. GET /{numCompte} conflict → GET /{numCompte}/solde, GET /{numCompte}/mouvements
    const pathKey = `${httpMethod}:${endpointPath}`;
    if ((pathCounts.get(pathKey) || 0) > 1) {
      const actionSlug = methodName
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .toLowerCase();
      if (hasIdParam) {
        endpointPath = endpointPath + "/" + actionSlug;
      } else {
        endpointPath = endpointPath + "/" + actionSlug;
      }
    }

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

    // v5.10.2: Sanitize javadoc — remove braces and limit length to prevent
    // brace imbalance in generated Java files (class-level javadoc can leak code)
    let javadocRaw = (uc as any).useCaseDescription || (uc as any).javadoc || "";
    let javadoc = javadocRaw
      .replace(/[{}]/g, "")          // Remove all braces
      .replace(/\s+/g, " ")          // Collapse whitespace
      .trim();
    if (javadoc.length > 200) javadoc = javadoc.substring(0, 200) + "...";
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

// ─── FIX B v7.1: Helpers for raw return type inference (controller) ─────────

const JAVA_BUILTIN_TYPES_CTRL = new Set([
  "String", "int", "Integer", "long", "Long", "double", "Double",
  "float", "Float", "boolean", "Boolean", "byte", "Byte", "short", "Short",
  "char", "Character", "BigDecimal", "BigInteger", "LocalDate", "LocalDateTime",
  "Date", "Instant", "void", "Void", "Object",
]);

function resolveRawReturnTypeCtrl(rawType: string, imports: Set<string>, basePackage: string): string {
  if (!rawType || rawType === "Void" || rawType === "void") return "Void";

  const genericMatch = rawType.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const container = genericMatch[1];
    const inner = genericMatch[2].trim();
    if (container === "List" || container === "ArrayList" || container === "LinkedList") {
      imports.add("import java.util.List;");
      return `List<${resolveRawReturnTypeCtrl(inner, imports, basePackage)}>`;
    }
    if (container === "Set" || container === "HashSet" || container === "TreeSet") {
      imports.add("import java.util.Set;");
      return `Set<${resolveRawReturnTypeCtrl(inner, imports, basePackage)}>`;
    }
    if (container === "Map" || container === "HashMap") {
      imports.add("import java.util.Map;");
      const parts = inner.split(",").map(p => p.trim());
      if (parts.length === 2) {
        return `Map<${resolveRawReturnTypeCtrl(parts[0], imports, basePackage)}, ${resolveRawReturnTypeCtrl(parts[1], imports, basePackage)}>`;
      }
    }
    return rawType;
  }

  if (JAVA_BUILTIN_TYPES_CTRL.has(rawType)) {
    if (rawType === "BigDecimal") imports.add("import java.math.BigDecimal;");
    if (rawType === "BigInteger") imports.add("import java.math.BigInteger;");
    if (rawType === "LocalDate") imports.add("import java.time.LocalDate;");
    if (rawType === "LocalDateTime") imports.add("import java.time.LocalDateTime;");
    if (rawType === "Instant") imports.add("import java.time.Instant;");
    return rawType;
  }

  return mapDtoClassName(rawType);
}

function addImportsForRawTypeCtrl(resType: string, imports: Set<string>, basePackage: string): void {
  if (resType.includes("<")) return;
  if (JAVA_BUILTIN_TYPES_CTRL.has(resType)) return;
  imports.add(`import ${basePackage}.dto.${resType};`);
}
