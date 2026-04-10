/**
 * Service Generator — Generates Spring @Service classes with business logic migration.
 * Rules: R6 (constructor injection), R7 (@Transactional), R8 (stubs).
 * Extracted from spring-generator.ts (v5.5).
 */

import type { ProjectIR, UseCaseIR, DtoIR } from "../java-parser";
import {
  BusinessLogicTransformer,
  extractExecuteBody,
  extractMethodBody,
  extractConstants,
  type TransformContext,
} from "../engine/BusinessLogicTransformer";
import { JavaASTParser } from "../engine/ast/JavaASTParser";
import { SymbolTable } from "../engine/ast/SymbolTable";
import { ServiceMethodGenerator } from "../engine/ServiceMethodGenerator";
import {
  type GeneratedFile,
  toPascalCase, toMethodName, capitalize, mapDtoClassName,
  inferSemanticEndpoint, mapToSpringType,
} from "./shared";

// Singleton instances for the AST pipeline
const astParser = new JavaASTParser();
const astSymbolTable = new SymbolTable();
const serviceMethodGenerator = new ServiceMethodGenerator("");

export function generateDomainService(
  basePackage: string, basePath: string, domain: string,
  useCases: UseCaseIR[], dtoMap: Map<string, DtoIR>, ir: ProjectIR
): GeneratedFile {
  const serviceName = toPascalCase(domain) + "Service";
  const imports = new Set<string>();
  imports.add("import lombok.RequiredArgsConstructor;");
  imports.add("import lombok.extern.slf4j.Slf4j;");
  imports.add("import org.springframework.stereotype.Service;");
  imports.add("import org.springframework.transaction.annotation.Transactional;");

  const methods: string[] = [];

  // FIX E v5.7.2: Collect SQL constants at class level (not duplicated per method)
  // Extract constants from all UseCases and deduplicate by name
  const classLevelConstants = new Map<string, { type: string; name: string; value: string; source: string }>();
  for (const uc of useCases) {
    if (uc.rawSource) {
      const constants = extractConstants(uc.rawSource);
      for (const c of constants) {
        if (!classLevelConstants.has(c.name)) {
          classLevelConstants.set(c.name, { ...c, source: uc.className });
        }
      }
    }
  }

  for (const uc of useCases) {
    const methodName = toMethodName(uc.className);
    const reqDto = dtoMap.get(uc.voInType);
    const resDto = dtoMap.get(uc.voOutType);

    const reqType = reqDto ? mapDtoClassName(reqDto.className) : "Void";
    const resType = resDto ? mapDtoClassName(resDto.className) : "Void";

    if (reqDto) imports.add(`import ${basePackage}.dto.${reqType};`);
    if (resDto) imports.add(`import ${basePackage}.dto.${resType};`);

    // R7: @Transactional at the right level
    let txAnnotation = "";
    if (uc.transactional) {
      if (uc.transactional.readOnly) {
        txAnnotation = "    @Transactional(readOnly = true)\n";
      } else if (uc.transactional.rollbackFor) {
        txAnnotation = `    @Transactional(rollbackFor = ${uc.transactional.rollbackFor}.class)\n`;
      } else {
        txAnnotation = "    @Transactional\n";
      }
    } else {
      const semantic = inferSemanticEndpoint(uc, domain);
      if (semantic.method === "GET") {
        txAnnotation = "    @Transactional(readOnly = true)\n";
      } else {
        txAnnotation = "    @Transactional\n";
      }
    }

    // FIX A v5.7.2: For direct EJB, use actual parameter/return types even if not in dtoMap
    // The voInType/voOutType from parser may be raw Java types (e.g. "CompteDTO", "List<Mouvement>")
    const paramType = reqType !== "Void" ? `${reqType} request` : "";
    const returnType = resType !== "Void" ? resType : "void";

    // v5.10.2: Sanitize javadoc — remove braces and limit length to prevent
    // brace imbalance in generated Java files (class-level javadoc can leak code)
    let javadocRaw = (uc as any).useCaseDescription || (uc as any).javadoc || "";
    let javadoc = javadocRaw
      .replace(/[{}]/g, "")          // Remove all braces
      .replace(/\s+/g, " ")          // Collapse whitespace
      .trim();
    if (javadoc.length > 200) javadoc = javadoc.substring(0, 200) + "...";
    const javadocLine = javadoc ? `\n     * ${javadoc}` : "";

    const methodBody = generateServiceMethodBody(uc, reqDto, resDto, reqType, resType);
    const isMigrated = methodBody.includes("return builder.build()") || methodBody.includes("Migrated from:");
    const endingLines = isMigrated
      ? ""
      : `\n        log.info("=== Ending ${methodName} ===");\n${returnType !== "void" ? "        return response;" : ""}`;

    methods.push(`
${txAnnotation}    /**
     * ${uc.className} — ${uc.bianDomain || domain} / ${uc.bianAction || methodName}.${javadocLine}
     * Migrated from legacy UseCase: ${uc.className}
     */
    public ${returnType} ${methodName}(${paramType}) {
        log.info("=== Starting ${methodName} ===");
${methodBody}${endingLines}
    }`);
  }

  // R6: Collect all injected services for constructor injection
  const allInjected = new Map<string, { type: string; crossModule?: boolean; sourceModule?: string }>();
  for (const uc of useCases) {
    for (const svc of uc.injectedServices) {
      if (!allInjected.has(svc.type)) {
        allInjected.set(svc.type, {
          type: svc.type,
          crossModule: (svc as any).crossModule ?? false,
          sourceModule: (svc as any).sourceModule,
        });
      }
    }
  }

  // Separate local and cross-module dependencies
  const localFields: string[] = [];
  const crossModuleFields: string[] = [];
  for (const [, svc] of allInjected) {
    const fieldName = svc.type.charAt(0).toLowerCase() + svc.type.slice(1);
    if (svc.crossModule) {
      crossModuleFields.push(`    /** Cross-module dependency from ${svc.sourceModule ?? "external"} */\n    private final ${svc.type} ${fieldName};`);
    } else {
      localFields.push(`    private final ${svc.type} ${fieldName};`);
    }
  }
  const injectedFields = [...localFields, ...crossModuleFields];

  return {
    path: `${basePath}/service/${serviceName}.java`,
    category: "service",
    content: `package ${basePackage}.service;

${[...imports].sort().join("\n")}

/**
 * ${serviceName} — Domain service for ${domain}.
 * Contains ${useCases.length} migrated use case(s).
 * Auto-generated from EJB legacy project by Compleo Modernizer.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ${serviceName} {

${injectedFields.length > 0 ? injectedFields.join("\n") + "\n" : "    // No external dependencies detected\n"}
${classLevelConstants.size > 0 ? "\n    // \u2500\u2500\u2500 SQL / Business Constants (class-level, deduplicated) \u2500\u2500\u2500\n" + [...classLevelConstants.values()].map(c => `    private static final ${c.type} ${c.name} = ${c.value}; // from ${c.source}`).join("\n") + "\n" : ""}
${methods.join("\n")}
}
`,
  };
}

function generateServiceMethodBody(
  uc: UseCaseIR, reqDto: DtoIR | undefined, resDto: DtoIR | undefined,
  reqType: string, resType: string
): string {
  // ─── v5.10.2: Detect direct EJB method name from className pattern ───
  // Direct EJB UseCases have className = "CompteEJB_consulterSolde" → methodName = "consulterSolde"
  const directEjbMethodName = uc.className.includes("_") ? uc.className.split("_").slice(1).join("_") : null;

  // ─── v5.3.1: AST pipeline — parse, build symbol table, transform ───
  let astUsed = false;
  try {
    if (uc.rawSource && uc.rawSource.length > 50) {
      const classAST = astParser.parse(uc.rawSource);
      // v5.10.2: For direct EJB, search for the actual method name first, then fallback to execute()
      const executeMethod = classAST.methods.find(m =>
        (directEjbMethodName ? m.name === directEjbMethodName : m.name === "execute") && !m.isPrivate
      ) ?? classAST.methods.find(m =>
        m.name === "execute" && !m.isPrivate
      );

      if (executeMethod && executeMethod.body && executeMethod.body.length > 15) {
        astSymbolTable.buildFromMethod(executeMethod, classAST, /VoIn$/, /VoOut$/);

        const transformer = new BusinessLogicTransformer();
        const ctx: TransformContext = {
          voInClass: uc.voInType,
          voOutClass: uc.voOutType,
          requestDtoClass: reqType,
          responseDtoClass: resType,
          sourceClassName: uc.className,
          methodName: toMethodName(uc.className),
        };
        const result = transformer.transform(executeMethod.body, astSymbolTable, ctx);

        const constants = extractConstants(uc.rawSource);
        const constantLines = constants.map(c =>
          `        // Migrated constant from ${uc.className}\n        final ${c.type} ${c.name} = ${c.value};`
        );

        const lines: string[] = [];

        if (constantLines.length > 0) {
          lines.push(...constantLines);
          lines.push("");
        }

        if (resDto && resType !== "Void" && !result.code.includes("builder")) {
          lines.push(`        var builder = ${resType}.builder();`);
        }

        const bodyLines = result.code.split("\n").map(line => {
          if (line.trim() === "") return "";
          if (line.startsWith("        ")) return line;
          return "        " + line;
        });
        lines.push(...bodyLines);

        for (const todo of result.todos) {
          lines.push(`        // TODO [${todo.type}]: ${todo.suggestion} (priority: ${todo.priority})`);
        }

        for (const warning of result.warnings) {
          lines.push(`        // WARNING: ${warning}`);
        }

        if (result.magixCodes.length > 0) {
          lines.push(`        // Codes Magix identifiés : ${result.magixCodes.join(", ")}`);
        }

        lines.push(`        // Migrated from: ${uc.className}.execute() — ${result.migratedLines} lignes migrées, ${result.manualLines} manuelles, ${result.todos.length} TODOs`);

        // v5.10.2: Validate brace balance before returning AST-migrated code
        const joined = lines.join("\n");
        const openBraces = (joined.match(/\{/g) || []).length;
        const closeBraces = (joined.match(/\}/g) || []).length;
        if (openBraces === closeBraces) {
          astUsed = true;
          return joined;
        }
        // Brace imbalance detected — fall through to legacy/fallback
      }
    }
  } catch {
    // AST pipeline failed — fall through to legacy extraction
  }

  // ─── v5.3 legacy fallback: regex-based extraction ───
  // v5.10.2: For direct EJB, try extracting the specific method body first
  const executeBody = directEjbMethodName
    ? extractMethodBody(uc.rawSource, directEjbMethodName) ?? extractExecuteBody(uc.rawSource)
    : extractExecuteBody(uc.rawSource);

  if (executeBody) {
    const transformer = new BusinessLogicTransformer();
    const ctx: TransformContext = {
      voInClass: uc.voInType,
      voOutClass: uc.voOutType,
      requestDtoClass: reqType,
      responseDtoClass: resType,
      sourceClassName: uc.className,
    };
    const result = transformer.transform(executeBody, ctx);

    const constants = extractConstants(uc.rawSource);
    const constantLines = constants.map(c =>
      `        // Migrated constant from ${uc.className}\n        final ${c.type} ${c.name} = ${c.value};`
    );

    const lines: string[] = [];

    if (constantLines.length > 0) {
      lines.push(...constantLines);
      lines.push("");
    }

    if (resDto && resType !== "Void") {
      lines.push(`        var builder = ${resType}.builder();`);
    }

    const bodyLines = result.body.split("\n").map(line => {
      if (line.trim() === "") return "";
      if (line.startsWith("        ")) return line;
      return "        " + line;
    });
    lines.push(...bodyLines);

    for (const warning of result.warnings) {
      lines.push(`        // WARNING: ${warning}`);
    }

    lines.push(`        // Migrated from: ${uc.className}.execute() — ${result.linesTransformed} transformations applied`);

    // v5.10.2: Validate brace balance before returning legacy-migrated code
    const legacyJoined = lines.join("\n");
    const legacyOpen = (legacyJoined.match(/\{/g) || []).length;
    const legacyClose = (legacyJoined.match(/\}/g) || []).length;
    if (legacyOpen === legacyClose) {
      return legacyJoined;
    }
    // Brace imbalance — fall through to safe fallback
  }

  // ─── Fallback: No execute() body found — generate builder + TODO ───
  const lines: string[] = [];

  // FIX B v5.7.2: Only generate builder if resDto exists AND resType is not Void
  // Direct EJBs may have voOutType = raw Java type (e.g. "CompteDTO") not in dtoMap
  // In that case, resDto is undefined but resType could still be non-Void
  if (resDto && resType !== "Void") {
    lines.push(`        ${resType} response = ${resType}.builder()`);

    if (reqDto) {
      for (const outField of resDto.fields) {
        const inField = reqDto.fields.find(f => f.name === outField.name);
        if (inField) {
          lines.push(`            .${outField.name}(request.get${capitalize(outField.name)}())`);
        }
      }
    }

    for (const field of resDto.fields) {
      if (field.name === "codeRetour") {
        lines.push(`            .codeRetour("000")`);
      } else if (field.name === "messageRetour") {
        lines.push(`            .messageRetour("Operation completed successfully")`);
      }
    }

    lines.push(`            .build();`);
  }

  const magixService = uc.injectedServices.find(s =>
    s.type.toLowerCase().includes("magix") || s.type.toLowerCase().includes("service")
  );
  if (magixService) {
    const fieldName = (magixService as any).fieldName || magixService.type.charAt(0).toLowerCase() + magixService.type.slice(1);
    lines.push(`        // TODO: Implement call to ${magixService.type} — migrated from @EJB ${fieldName}`);
    lines.push(`        // Original transaction code: see legacy ${uc.className}`);
  } else {
    lines.push(`        // TODO: Implement business logic from legacy ${uc.className}`);
  }

  return lines.join("\n");
}
