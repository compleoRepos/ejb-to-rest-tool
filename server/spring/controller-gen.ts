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
import { _knownEntityNames as _ctrlKnownEntityNames } from "../spring-generator";
import {
  type GeneratedFile,
  type HttpConfig,
  toPascalCase, toMethodName, mapDtoClassName, pluralize,
  determineHttpConfig, getIdParamName, getHttpAnnotation,
  mapToSpringType,
} from "./shared";

export function generateDomainController(
  basePackage: string, basePath: string, domain: string,
  useCases: UseCaseIR[], dtoMap: Map<string, DtoIR>
): GeneratedFile {
  const controllerName = toPascalCase(domain) + "Controller";
  const serviceName = toPascalCase(domain) + "Service";
  // v12.8: Sanitize serviceVar to remove hyphens and invalid Java identifier chars
  const rawServiceVar = domain.charAt(0).toLowerCase() + domain.slice(1) + "Service";
  const serviceVar = rawServiceVar.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9_$]/g, '');
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
    // FIX F v7.3: Object is never acceptable as return type — infer from rawSource
    let effectiveVoOutType = uc.voOutType;
    if (effectiveVoOutType === "Object" || effectiveVoOutType === "ValueObject") {
      effectiveVoOutType = inferReturnTypeFromSourceCtrl(uc.rawSource, uc.className, methodName);
    }
    // FIX B v7.1: Infer return type from voOutType even when not in dtoMap
    const resType = resDto
      ? mapDtoClassName(resDto.className)
      : (effectiveVoOutType && effectiveVoOutType !== "Void" && effectiveVoOutType !== "void" && effectiveVoOutType !== "Object" && effectiveVoOutType !== "ValueObject")
        ? resolveRawReturnTypeCtrl(effectiveVoOutType, imports, basePackage)
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

    // v12.7: Determine PathVariable type from voInType for primitives
    const PRIMITIVE_TYPES = new Set(["int", "long", "Integer", "Long", "String", "double", "float", "boolean", "short"]);
    // Bloc 4A v12.8: Always use Long for @PathVariable (Spring convention, avoids Long→int mismatch)
    const pathVarType = (uc.voInType === "int" || uc.voInType === "Integer" || uc.voInType === "long" || uc.voInType === "Long")
      ? "Long"
      : PRIMITIVE_TYPES.has(uc.voInType) ? uc.voInType : "Long";

    let paramList = "";
    let methodBodyPrefix = "";

    if (httpMethod === "GET" && reqType && reqDto) {
      // GET methods NEVER have @RequestBody — convert DTO fields to @RequestParam/@RequestHeader
      const paramParts: string[] = [];
      if (hasIdParam) {
        paramParts.push(`@PathVariable ${pathVarType} ${idParamName}`);
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
      paramList = `@PathVariable ${pathVarType} ${idParamName}, @Valid @RequestBody ${reqType} request`;
    } else if (hasIdParam) {
      paramList = `@PathVariable ${pathVarType} ${idParamName}`;
    } else if (reqType) {
      paramList = `@Valid @RequestBody ${reqType} request`;
    } else {
      // FIX E v7.3: Use legacy method parameters when no DTO wrapper exists
      const legacyParams = (uc as any).methodParameters as { name: string; type: string }[] | undefined;
      if (legacyParams && legacyParams.length > 0) {
        const enumNames = new Set<string>();
        const paramParts: string[] = [];
        if (hasIdParam) {
          paramParts.push(`@PathVariable ${pathVarType} ${idParamName}`);
        }
        for (const p of legacyParams) {
          const springType = mapToSpringType(p.type, false, enumNames, imports);
          addImportsForRawTypeCtrl(springType, imports, basePackage);
          if (httpMethod === "GET") {
            imports.add("import org.springframework.web.bind.annotation.RequestParam;");
            paramParts.push(`@RequestParam ${springType} ${p.name}`);
          } else {
            paramParts.push(`${springType} ${p.name}`);
          }
        }
        paramList = paramParts.join(", ");
      }
    }

       // FIX E v7.3: Determine service call arguments
    // If using individual legacy params, pass them directly; otherwise pass "request" DTO
    const legacyParamsCtrl = (uc as any).methodParameters as { name: string; type: string }[] | undefined;
    let serviceCallArgs = reqType ? "request" : "";
    if (!reqType && legacyParamsCtrl && legacyParamsCtrl.length > 0) {
      serviceCallArgs = legacyParamsCtrl.map(p => p.name).join(", ");
    }

    // Bloc 4A v12.8: Box primitives for generic type parameters (Java doesn't allow ResponseEntity<int>)
    const PRIMITIVE_TO_WRAPPER: Record<string, string> = {
      'int': 'Integer', 'long': 'Long', 'double': 'Double',
      'float': 'Float', 'boolean': 'Boolean', 'byte': 'Byte',
      'short': 'Short', 'char': 'Character', 'void': 'Void',
    };
    const resultVarType = PRIMITIVE_TO_WRAPPER[resType] || resType;

    // FIX v5.8.2: Use httpConfig.responseStatus for proper HTTP status codes
    let responseStatement: string;
    if (httpConfig.responseStatus === 201) {
      imports.add("import org.springframework.http.HttpStatus;");
      responseStatement = resType !== "Void"
        ? `        ${resultVarType} result = ${serviceVar}.${methodName}(${serviceCallArgs});
        return ResponseEntity.status(HttpStatus.CREATED).body(result);`
        : `        ${serviceVar}.${methodName}(${serviceCallArgs});
        return ResponseEntity.status(HttpStatus.CREATED).build();`;
    } else if (httpConfig.responseStatus === 204) {
      responseStatement = `        ${serviceVar}.${methodName}(${serviceCallArgs});
        return ResponseEntity.noContent().build();`;
    } else {
      responseStatement = resType !== "Void"
        ? `        ${resultVarType} result = ${serviceVar}.${methodName}(${serviceCallArgs});
        return ResponseEntity.ok(result);`
        : `        ${serviceVar}.${methodName}(${serviceCallArgs});
        return ResponseEntity.ok().build();`;
    }

    // v5.10.2: Sanitize javadoc — remove braces and limit length to prevent
    // brace imbalance in generated Java files (class-level javadoc can leak code)
    let javadocRaw = (uc as any).useCaseDescription || (uc as any).javadoc || "";
    let javadoc = javadocRaw
      .replace(/[{}]/g, "")          // Remove all braces
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, "'") // Curly/smart quotes → single quote (safe in Java strings)
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")             // Smart single quotes → apostrophe
      .replace(/\s+/g, " ")          // Collapse whitespace
      .trim();
    if (javadoc.length > 200) javadoc = javadoc.substring(0, 200) + "...";
    const operationSummary = extractShortSummary(javadoc, methodName, domain);
    const operationDescription = javadoc ? javadoc.replace(/"/g, '\\"') : "";

    const basePath2 = `/api/v1/${pluralize(domain.toLowerCase())}`;
    const fullPath = `${basePath2}${endpointPath}`;
    const httpAnnotation = getHttpAnnotation(httpMethod, endpointPath || "/" + methodName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase());
    const rawReturnGeneric = resType !== "Void"
      ? (PRIMITIVE_TO_WRAPPER[resType] || resType)
      : "Void";
    // Defensive: strip spaces and invalid chars from generic type (LLM may include method name)
    let returnGeneric = rawReturnGeneric.split(/\s+/)[0].replace(/[^\w<>,\[\]?]/g, "");
    // Fix unbalanced angle brackets (LLM may include trailing '>')
    const openBrackets = (returnGeneric.match(/</g) || []).length;
    const closeBrackets = (returnGeneric.match(/>/g) || []).length;
    if (closeBrackets > openBrackets) {
      for (let i = 0; i < closeBrackets - openBrackets; i++) {
        const lastIdx = returnGeneric.lastIndexOf('>');
        if (lastIdx >= 0) returnGeneric = returnGeneric.slice(0, lastIdx) + returnGeneric.slice(lastIdx + 1);
      }
    } else if (openBrackets > closeBrackets) {
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        const firstIdx = returnGeneric.indexOf('<');
        if (firstIdx >= 0) returnGeneric = returnGeneric.slice(0, firstIdx) + returnGeneric.slice(firstIdx + 1);
      }
    }

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
  let result: string;
  if (description) {
    const firstSentence = description.split(/[.:\n]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length <= 80) {
      result = firstSentence;
    } else if (firstSentence.length > 80) {
      result = firstSentence.substring(0, 77) + "...";
    } else {
      result = methodName
        .replace(/([A-Z])/g, " $1")
        .trim()
        .replace(/^./, (c) => c.toUpperCase())
        + " \u2014 " + domain;
    }
  } else {
    result = methodName
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/^./, (c) => c.toUpperCase())
      + " \u2014 " + domain;
  }
  // Sanitize: escape double quotes and replace smart quotes
  return result
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, "'")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/"/g, '\\"');
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
  // Strip Java modifiers that may leak from method signatures (e.g. "static void")
  const JAVA_MODIFIERS = /^(public|private|protected|static|final|synchronized|abstract|native|transient|volatile)\s+/;
  let cleaned = rawType.trim();
  while (JAVA_MODIFIERS.test(cleaned)) {
    cleaned = cleaned.replace(JAVA_MODIFIERS, "");
  }
  if (!cleaned || cleaned === "void" || cleaned === "Void") return "Void";
  rawType = cleaned;

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
  // v12.7: Use entity.* if the type is a known generated entity, otherwise dto.*
  if (_ctrlKnownEntityNames.has(resType)) {
    imports.add(`import ${basePackage}.entity.${resType};`);
  } else {
    imports.add(`import ${basePackage}.dto.${resType};`);
  }
}


/**
 * FIX F v7.3: Infer the real return type from raw source code when voOutType is "Object".
 * Same logic as service-gen.ts version but for controller context.
 */
function inferReturnTypeFromSourceCtrl(rawSource: string, className: string, methodName: string): string {
  if (!rawSource) return "Void";

  // Heuristic 1: Methods that are clearly void
  const voidPatterns = /deconnex|logout|disconnect|destroy|cleanup|invalidat|fermer|close/i;
  if (voidPatterns.test(methodName)) return "Void";

  // Heuristic 2: Extract declared return type from method signature
  const methodRegex = new RegExp(
    `public\\s+(\\S+)\\s+${methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`,
    "m"
  );
  const sigMatch = rawSource.match(methodRegex);
  if (sigMatch) {
    const declaredReturn = sigMatch[1];
    if (declaredReturn && declaredReturn !== "void" && declaredReturn !== "Object") {
      return declaredReturn;
    }
  }

  // Heuristic 3: "return new XxxDTO(...)"
  const returnNewMatch = rawSource.match(/return\s+new\s+(\w+(?:DTO|Response|Result|Info|Data))\s*\(/);
  if (returnNewMatch) return returnNewMatch[1];

  // Heuristic 4: Typed variable assignment
  const typedVarMatch = rawSource.match(/(\w+(?:DTO|Response|Result|Info|Data))\s+\w+\s*=/);
  if (typedVarMatch) return typedVarMatch[1];

  // Heuristic 5: Cast pattern
  const castMatch = rawSource.match(/return\s+\((\w+(?:DTO|Response|Result|Info|Data))\)\s+/);
  if (castMatch) return castMatch[1];

  // Heuristic 6: handlePostXxx → XxxResponseDTO
  const handleMatch = methodName.match(/^handlePost(\w+)$/i);
  if (handleMatch) {
    return `${handleMatch[1]}ResponseDTO`;
  }

  return "Void";
}
