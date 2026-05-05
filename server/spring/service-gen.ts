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
  type JdbcBlock,
} from "../engine/BusinessLogicTransformer";
import { JavaASTParser } from "../engine/ast/JavaASTParser";
import { SymbolTable } from "../engine/ast/SymbolTable";
import { ServiceMethodGenerator } from "../engine/ServiceMethodGenerator";
import {
  type GeneratedFile,
  toPascalCase, toMethodName, capitalize, mapDtoClassName,
  inferSemanticEndpoint, mapToSpringType, sanitizeClassName,
} from "./shared";

// Singleton instances for the AST pipeline
const astParser = new JavaASTParser();
const astSymbolTable = new SymbolTable();
const serviceMethodGenerator = new ServiceMethodGenerator("");

// ─── v10.11: JDBC Block Registry ─────────────────────────────────────────────
// Accumulates JDBC blocks during service generation for later LLM migration.
let _jdbcBlocksRegistry: JdbcBlock[] = [];

/** Reset the registry before a new generation run */
export function resetJdbcBlocksRegistry(): void {
  _jdbcBlocksRegistry = [];
}

/** Get all collected JDBC blocks */
export function getCollectedJdbcBlocks(): JdbcBlock[] {
  return _jdbcBlocksRegistry;
}

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
    // FIX B v7.1: Infer return type from voOutType even when not in dtoMap
    // e.g. voOutType = "List<String>" or "MouvementsResponseDTO" → use directly
    // FIX F v7.3: Object is never acceptable as return type — infer from rawSource
    let effectiveVoOutType = uc.voOutType;
    if (effectiveVoOutType === "Object" || effectiveVoOutType === "ValueObject") {
      effectiveVoOutType = inferReturnTypeFromSource(uc.rawSource, uc.className, methodName);
    }
    const resType = resDto
      ? mapDtoClassName(resDto.className)
      : (effectiveVoOutType && effectiveVoOutType !== "Void" && effectiveVoOutType !== "void" && effectiveVoOutType !== "Object" && effectiveVoOutType !== "ValueObject")
        ? resolveRawReturnType(effectiveVoOutType, imports, basePackage)
        : "Void";

    if (reqDto) imports.add(`import ${basePackage}.dto.${reqType};`);
    if (resDto) imports.add(`import ${basePackage}.dto.${resType};`);
    // FIX B v7.1: Import for non-dtoMap return types (raw Java types)
    if (!resDto && resType !== "Void") {
      addImportsForRawType(resType, imports, basePackage);
    }

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

    // FIX E v7.3: Propagate all legacy method parameters when voInType is absent
    // If the method has individual parameters (not wrapped in a VO/DTO), use them directly
    let paramType = "";
    const legacyParams = (uc as any).methodParameters as { name: string; type: string }[] | undefined;
    if (reqType !== "Void") {
      paramType = `${reqType} request`;
    } else if (legacyParams && legacyParams.length > 0) {
      // Use individual parameters from the legacy method signature
      // Collect enum names from dtoMap for type resolution
      const enumNames = new Set<string>();
      paramType = legacyParams.map(p => {
        const springType = mapToSpringType(p.type, false, enumNames, imports);
        addImportsForRawType(springType, imports, basePackage);
        return `${springType} ${p.name}`;
      }).join(", ");
    }
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
      : `\n        log.info("Audit trail: transaction ${methodName} completed");\n${returnType !== "void" ? "        return response;" : ""}`;

    methods.push(`
${txAnnotation}    /**
     * ${sanitizeClassName(uc.className)} — ${uc.bianDomain || domain} / ${uc.bianAction || methodName}.${javadocLine}
     * Migrated from legacy UseCase: ${sanitizeClassName(uc.className)}
     */
    public ${returnType} ${methodName}(${paramType}) {
        log.info("Audit trail: transaction ${methodName} initiated");
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
  // v8.8: For handler-pattern UseCases, the real method is handle()/process()/execute(),
  // not the derived method name (e.g., "ajouterBeneficiari").
  const isHandler = !!(uc as any).isFromHandlerPattern;

  // ─── v5.3.1: AST pipeline — parse, build symbol table, transform ───
  let astUsed = false;
  try {
    if (uc.rawSource && uc.rawSource.length > 50) {
      const classAST = astParser.parse(uc.rawSource);
      // v5.10.2: For direct EJB, search for the actual method name first, then fallback to execute()
      // v8.8: For handler-pattern, also search for handle()/process() as the entry method
      let executeMethod = classAST.methods.find(m =>
        (directEjbMethodName ? m.name === directEjbMethodName : m.name === "execute") && !m.isPrivate
      ) ?? classAST.methods.find(m =>
        m.name === "execute" && !m.isPrivate
      );
      // v8.8: Handler fallback — if no method found yet, try handle/process/doAction
      if (!executeMethod && isHandler) {
        executeMethod = classAST.methods.find(m =>
          /^(handle|process|doAction)$/.test(m.name) && !m.isPrivate
        );
      }

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

        // v10.11: Collect JDBC blocks for LLM migration
        if (result.jdbcBlocks && result.jdbcBlocks.length > 0) {
          _jdbcBlocksRegistry.push(...result.jdbcBlocks);
        }

        // FIX v7.8: Post-process Void variable declarations → infer real type
        // When resType is "Void", the T10 replacement produces "Void sql = ..." which is invalid Java.
        // Replace "Void varName = " with inferred type based on the RHS value.
        result.code = result.code.replace(/\bVoid\s+(\w+)\s*=/g, (match, varName) => {
          // Infer type from variable name and common patterns
          if (/sql|query|hql|jpql/i.test(varName)) return `String ${varName} =`;
          if (/msg|message|text|body|subject|content/i.test(varName)) return `String ${varName} =`;
          if (/count|total|nb|size|index/i.test(varName)) return `int ${varName} =`;
          if (/flag|is[A-Z]|has[A-Z]|found|exists/i.test(varName)) return `boolean ${varName} =`;
          if (/result|response|data|obj|entity/i.test(varName)) return `Object ${varName} =`;
          return `var ${varName} =`;  // Safe fallback: let Java infer the type
        });

        // FIX A v7.1: SQL constants are now ONLY at class level (private static final)
        // No longer duplicated inside method body — removed constant extraction here

        const lines: string[] = [];

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

        lines.push(`        // Migrated from: ${sanitizeClassName(uc.className)}.execute() — ${result.migratedLines} lignes migrées, ${result.manualLines} manuelles, ${result.todos.length} TODOs`);

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
  // v8.8: For handler-pattern, also try handle()/process() as fallback
  let executeBody = directEjbMethodName
    ? extractMethodBody(uc.rawSource, directEjbMethodName) ?? extractExecuteBody(uc.rawSource)
    : extractExecuteBody(uc.rawSource);
  // v8.8: Handler fallback — try handle/process/doAction if nothing found yet
  if (!executeBody && isHandler) {
    executeBody = extractMethodBody(uc.rawSource, "handle")
      ?? extractMethodBody(uc.rawSource, "process")
      ?? extractMethodBody(uc.rawSource, "doAction");
  }

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

    // v10.11: Collect JDBC blocks for LLM migration (legacy path)
    if (result.jdbcBlocks && result.jdbcBlocks.length > 0) {
      _jdbcBlocksRegistry.push(...result.jdbcBlocks);
    }

    // FIX v7.8: Post-process Void variable declarations → infer real type (legacy path)
    result.body = result.body.replace(/\bVoid\s+(\w+)\s*=/g, (match, varName) => {
      if (/sql|query|hql|jpql/i.test(varName)) return `String ${varName} =`;
      if (/msg|message|text|body|subject|content/i.test(varName)) return `String ${varName} =`;
      if (/count|total|nb|size|index/i.test(varName)) return `int ${varName} =`;
      if (/flag|is[A-Z]|has[A-Z]|found|exists/i.test(varName)) return `boolean ${varName} =`;
      if (/result|response|data|obj|entity/i.test(varName)) return `Object ${varName} =`;
      return `var ${varName} =`;
    });

    // FIX A v7.1: SQL constants are now ONLY at class level (private static final)
    // No longer duplicated inside method body — removed constant extraction here

    const lines: string[] = [];

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

    lines.push(`        // Migrated from: ${sanitizeClassName(uc.className)}.execute() — ${result.linesTransformed} transformations applied`);

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
  // BUG-I v7.5: For complex methods (>50 lines), generate a structured stub
  // that documents the legacy steps instead of a generic TODO.
  const lines: string[] = [];

  // BUG-I v7.5: Extract step comments from complex legacy methods
  const legacySteps = extractLegacySteps(uc.rawSource, uc.className);

  // FIX B v5.7.2: Only generate builder if resDto exists AND resType is not Void
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

  // BUG-I v7.5: If complex method with steps, generate structured stub
  if (legacySteps.length > 0) {
    lines.push(`        // ─── Structured migration stub from ${sanitizeClassName(uc.className)} (${legacySteps.length} steps detected) ───`);
    lines.push(`        // This method is complex (>50 lines). Each step below corresponds`);
    lines.push(`        // to a logical block in the legacy code. Implement them in order.`);
    lines.push(``);
    for (let i = 0; i < legacySteps.length; i++) {
      const step = legacySteps[i];
      lines.push(`        // STEP ${i + 1}: ${step.label}`);
      if (step.tables.length > 0) {
        lines.push(`        //   Tables concernées : ${step.tables.join(", ")}`);
      }
      if (step.ejbCalls.length > 0) {
        lines.push(`        //   Appels @EJB : ${step.ejbCalls.join(", ")}`);
      }
      if (step.hasTransaction) {
        lines.push(`        //   ⚠️ Transaction manuelle détectée — vérifier la gestion transactionnelle`);
      }
      lines.push(`        // TODO: Implement step ${i + 1} — ${step.label}`);
      lines.push(``);
    }
    lines.push(`        // Migrated from: ${sanitizeClassName(uc.className)} — ${legacySteps.length} steps, structured stub`);
  } else {
    // Simple fallback for non-complex methods
    const magixService = uc.injectedServices.find(s =>
      s.type.toLowerCase().includes("magix") || s.type.toLowerCase().includes("service")
    );
    if (magixService) {
      const fieldName = (magixService as any).fieldName || magixService.type.charAt(0).toLowerCase() + magixService.type.slice(1);
      lines.push(`        // TODO: Implement call to ${magixService.type} — migrated from @EJB ${fieldName}`);
      lines.push(`        // Original transaction code: see legacy ${sanitizeClassName(uc.className)}`);
    } else {
      lines.push(`        // TODO: Implement business logic from legacy ${sanitizeClassName(uc.className)}`);
    }
  }

  return lines.join("\n");
}

// ─── BUG-I v7.5: Extract logical steps from complex legacy methods ───────────────────

interface LegacyStep {
  label:          string;
  tables:         string[];
  ejbCalls:       string[];
  hasTransaction: boolean;
}

/**
 * BUG-I v7.5: Parse a complex legacy method to extract logical steps.
 * Detects:
 *   - // ÉTAPE N: ... comments
 *   - // Step N: ... comments
 *   - Large try/catch blocks with distinct SQL operations
 *   - Transaction boundaries (UserTransaction, begin/commit/rollback)
 */
export function extractLegacySteps(rawSource: string, className: string): LegacyStep[] {
  if (!rawSource || rawSource.length < 500) return []; // Not complex enough

  // Count non-blank lines to determine complexity
  const nonBlankLines = rawSource.split("\n").filter(l => l.trim().length > 0).length;
  if (nonBlankLines < 50) return []; // Not complex enough

  const steps: LegacyStep[] = [];

  // Strategy 1: Look for explicit step comments (ÉTAPE, Step, STEP, Phase)
  const stepCommentRegex = /\/\/\s*(?:ÉTAPE|ETAPE|Step|STEP|Phase)\s*(\d+)\s*[:.]?\s*(.+)/gi;
  let match: RegExpExecArray | null;
  const stepPositions: { index: number; label: string }[] = [];

  while ((match = stepCommentRegex.exec(rawSource)) !== null) {
    stepPositions.push({
      index: match.index,
      label:  match[2].trim(),
    });
  }

  if (stepPositions.length >= 2) {
    // Extract context for each step section
    for (let i = 0; i < stepPositions.length; i++) {
      const start = stepPositions[i].index;
      const end   = i + 1 < stepPositions.length
        ? stepPositions[i + 1].index
        : rawSource.length;
      const section = rawSource.substring(start, end);

      steps.push({
        label:          stepPositions[i].label,
        tables:         extractTablesFromSection(section),
        ejbCalls:       extractEjbCallsFromSection(section),
        hasTransaction: /UserTransaction|utx\.|begin\(|commit\(|rollback\(/i.test(section),
      });
    }
    return steps;
  }

  // Strategy 2: Infer steps from large try/catch blocks and SQL patterns
  const tryCatchRegex = /try\s*\{/g;
  const tryPositions: number[] = [];
  while ((match = tryCatchRegex.exec(rawSource)) !== null) {
    tryPositions.push(match.index);
  }

  if (tryPositions.length >= 2) {
    for (let i = 0; i < tryPositions.length; i++) {
      const start = tryPositions[i];
      const end   = i + 1 < tryPositions.length
        ? tryPositions[i + 1]
        : rawSource.length;
      const section = rawSource.substring(start, end);
      const tables  = extractTablesFromSection(section);
      const ejbCalls = extractEjbCallsFromSection(section);

      if (tables.length > 0 || ejbCalls.length > 0) {
        steps.push({
          label:          tables.length > 0
            ? `Opération sur ${tables.join(", ")}`
            : `Bloc try/catch #${i + 1}`,
          tables,
          ejbCalls,
          hasTransaction: /UserTransaction|utx\.|begin\(|commit\(|rollback\(/i.test(section),
        });
      }
    }
  }

  // Strategy 3: If still no steps, create one big step
  if (steps.length === 0 && nonBlankLines >= 50) {
    const allTables = extractTablesFromSection(rawSource);
    const allEjbCalls = extractEjbCallsFromSection(rawSource);
    steps.push({
      label:          `Logique métier complexe (${nonBlankLines} lignes)`,
      tables:         allTables,
      ejbCalls:       allEjbCalls,
      hasTransaction: /UserTransaction|utx\.|begin\(|commit\(|rollback\(/i.test(rawSource),
    });
  }

  return steps;
}

function extractTablesFromSection(section: string): string[] {
  const tables = new Set<string>();
  const regex = /(?:FROM|INTO|UPDATE|JOIN|DELETE\s+FROM)\s+([A-Z_][A-Z0-9_]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(section)) !== null) {
    const t = m[1].toUpperCase();
    if (t.length > 2 && ![
      "SELECT", "WHERE", "SET", "AND", "OR", "ON", "AS", "IS", "IN",
      "NOT", "NULL", "VALUES", "ORDER", "GROUP", "HAVING", "DUAL",
    ].includes(t)) {
      tables.add(t);
    }
  }
  return [...tables];
}

function extractEjbCallsFromSection(section: string): string[] {
  const calls = new Set<string>();
  const regex = /@EJB[^;]*?(\w+Service|\w+EJB|\w+Bean)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(section)) !== null) {
    calls.add(m[1]);
  }
  // Also detect method calls on injected EJBs
  const callRegex = /(\w+(?:Service|EJB|Bean))\.\w+\(/g;
  while ((m = callRegex.exec(section)) !== null) {
    calls.add(m[1]);
  }
   return [...calls];
}

// ─── FIX B v7.1:: Helpers for raw return type inference ──────────────────────

/** Known Java primitive/wrapper types that don't need DTO import */
const JAVA_BUILTIN_TYPES = new Set([
  "String", "int", "Integer", "long", "Long", "double", "Double",
  "float", "Float", "boolean", "Boolean", "byte", "Byte", "short", "Short",
  "char", "Character", "BigDecimal", "BigInteger", "LocalDate", "LocalDateTime",
  "Date", "Instant", "void", "Void", "Object",
]);

/**
 * Resolve a raw voOutType (not in dtoMap) to a valid Java return type.
 * Handles: List<X>, Set<X>, Map<K,V>, simple types, DTO class names.
 */
function resolveRawReturnType(rawType: string, imports: Set<string>, basePackage: string): string {
  if (!rawType || rawType === "Void" || rawType === "void") return "Void";

  // Generic types: List<String>, List<CompteDTO>, Set<X>, Map<K,V>
  const genericMatch = rawType.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const container = genericMatch[1];
    const inner = genericMatch[2].trim();

    if (container === "List" || container === "ArrayList" || container === "LinkedList") {
      imports.add("import java.util.List;");
      const innerType = resolveRawReturnType(inner, imports, basePackage);
      return `List<${innerType}>`;
    }
    if (container === "Set" || container === "HashSet" || container === "TreeSet") {
      imports.add("import java.util.Set;");
      const innerType = resolveRawReturnType(inner, imports, basePackage);
      return `Set<${innerType}>`;
    }
    if (container === "Map" || container === "HashMap") {
      imports.add("import java.util.Map;");
      const parts = inner.split(",").map(p => p.trim());
      if (parts.length === 2) {
        const k = resolveRawReturnType(parts[0], imports, basePackage);
        const v = resolveRawReturnType(parts[1], imports, basePackage);
        return `Map<${k}, ${v}>`;
      }
    }
    return rawType; // unknown generic — pass through
  }

  // Array types
  if (rawType.endsWith("[]")) {
    const base = rawType.slice(0, -2);
    resolveRawReturnType(base, imports, basePackage); // resolve imports for base
    return rawType;
  }

  // Known Java types
  if (JAVA_BUILTIN_TYPES.has(rawType)) {
    if (rawType === "BigDecimal") imports.add("import java.math.BigDecimal;");
    if (rawType === "BigInteger") imports.add("import java.math.BigInteger;");
    if (rawType === "LocalDate") imports.add("import java.time.LocalDate;");
    if (rawType === "LocalDateTime") imports.add("import java.time.LocalDateTime;");
    if (rawType === "Instant") imports.add("import java.time.Instant;");
    return rawType;
  }

  // DTO-like class name (e.g. MouvementsResponseDTO, CompteDTO)
  // Apply mapDtoClassName transformation (VoOut→ResponseDTO, etc.)
  return mapDtoClassName(rawType);
}

/**
 * Add required imports for a raw return type that is not in dtoMap.
 */
function addImportsForRawType(resType: string, imports: Set<string>, basePackage: string): void {
  // Generic types already handled in resolveRawReturnType
  if (resType.includes("<")) return;

  // Java builtins — imports already added by resolveRawReturnType
  if (JAVA_BUILTIN_TYPES.has(resType)) return;

  // DTO class — add import from dto package
  imports.add(`import ${basePackage}.dto.${resType};`);
}

/**
 * FIX F v7.3: Infer the real return type from raw source code when voOutType is "Object".
 * Scans the method body for patterns like:
 *   - return new XxxDTO(...) → XxxDTO
 *   - return xxxResponse → look for variable declaration type
 *   - XxxResponseDTO result = ... → XxxResponseDTO
 *   - method signature in remote interface: ReturnType methodName(...)
 * Falls back to "void" for deconnexion/logout/destroy methods.
 */
function inferReturnTypeFromSource(rawSource: string, className: string, methodName: string): string {
  if (!rawSource) return "Void";

  // Heuristic 1: Methods that are clearly void (logout, disconnect, destroy, etc.)
  const voidPatterns = /deconnex|logout|disconnect|destroy|cleanup|invalidat|fermer|close/i;
  if (voidPatterns.test(methodName)) return "Void";

  // Heuristic 2: Extract the specific method body
  // Look for the method signature in the source
  const methodRegex = new RegExp(
    `public\\s+(\\S+)\\s+${escapeRegex(methodName)}\\s*\\(`,
    "m"
  );
  const sigMatch = rawSource.match(methodRegex);
  if (sigMatch) {
    const declaredReturn = sigMatch[1];
    if (declaredReturn && declaredReturn !== "void" && declaredReturn !== "Object") {
      return declaredReturn;
    }
  }

  // Heuristic 3: Look for "return new XxxDTO(...)" or "return new XxxResponse(...)"
  const returnNewMatch = rawSource.match(/return\s+new\s+(\w+(?:DTO|Response|Result|Info|Data))\s*\(/);
  if (returnNewMatch) return returnNewMatch[1];

  // Heuristic 4: Look for typed variable assignment before return
  // e.g. "AuthResponseDTO response = ..." then "return response;"
  const typedVarMatch = rawSource.match(/(\w+(?:DTO|Response|Result|Info|Data))\s+\w+\s*=/);
  if (typedVarMatch) return typedVarMatch[1];

  // Heuristic 5: Look for cast pattern "return (XxxDTO) something"
  const castMatch = rawSource.match(/return\s+\((\w+(?:DTO|Response|Result|Info|Data))\)\s+/);
  if (castMatch) return castMatch[1];

  // Heuristic 6: For handlePostXxx methods, infer XxxResponseDTO
  const handleMatch = methodName.match(/^handlePost(\w+)$/i);
  if (handleMatch) {
    const action = handleMatch[1];
    return `${action}ResponseDTO`;
  }

  // Fallback: keep Void (better than Object)
  return "Void";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
