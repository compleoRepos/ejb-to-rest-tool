/**
 * MethodTransformer v12.1 — Per-method LLM-powered migration with rule-based fallback.
 * Strategy:
 *   1. Try LLM migration (with structured prompt)
 *   2. Validate LLM output (no anti-patterns, brace-balanced, etc.)
 *   3. If LLM fails/unavailable → apply rule-based transforms
 *   4. If rule-based produces <50% coverage → emit structured TODO with context
 *
 * @author Hamza NORDINE — Compleo
 */

import { llmGenerateCode, isLLMAvailable } from "../ml/llm-adapter";
import {
  BusinessLogicTransformer,
  extractMethodBody,
  type TransformContext,
} from "../BusinessLogicTransformer";

export interface MethodContext {
  className: string;
  methodName: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  body: string;
  availableServices: string[];
  availableRepositories: string[];
}

export interface MethodMigrationResult {
  code: string;
  strategy: "llm" | "rule-based" | "todo";
  confidence: number;
  warnings?: string[];
  todos?: string[];
}

// Anti-patterns that indicate a bad LLM output
const ANTI_PATTERNS = [
  /import\s+javax\.ejb/,
  /import\s+javax\.naming/,
  /@Stateless|@Stateful|@Remote|@Local/,
  /InitialContext|Context\.lookup/,
  /SessionContext|EJBContext/,
  /UserTransaction\s+ut/,
  /getEJBObject|getEJBHome/,
];

// Patterns that indicate successful Spring migration
const SPRING_PATTERNS = [
  /repository\.\w+\(/,
  /\.save\(|\.findById\(|\.findAll\(|\.delete\(/,
  /log\.(info|warn|error|debug)\(/,
  /throw new \w+Exception/,
  /return\s+/,
];

export class MethodTransformer {
  private static readonly LLM_TIMEOUT_MS = 15_000; // 15s per method
  private static readonly MAX_BODY_LOC_FOR_LLM = 80; // Don't send huge methods to LLM

  /**
   * Transform a single legacy method body to Spring Boot.
   */
  async transform(ctx: MethodContext): Promise<MethodMigrationResult> {
    // Guard: if body is too large, skip LLM and go rule-based
    const bodyLOC = ctx.body.split("\n").filter(l => l.trim()).length;

    // Try LLM first (if available and body is reasonable size)
    if (bodyLOC <= MethodTransformer.MAX_BODY_LOC_FOR_LLM) {
      try {
        const llmAvailable = await isLLMAvailable();
        if (llmAvailable) {
          const llmResult = await this.tryLLMMigration(ctx);
          if (llmResult && llmResult.confidence >= 0.6) {
            return llmResult;
          }
        }
      } catch {
        // LLM failed — fall through to rule-based
      }
    }

    // Fallback: rule-based transformation
    return this.applyRuleBasedTransforms(ctx);
  }

  /**
   * LLM migration — builds a structured prompt and validates the output.
   */
  private async tryLLMMigration(ctx: MethodContext): Promise<MethodMigrationResult | null> {
    const prompt = this.buildMigrationPrompt(ctx);

    const generated = await llmGenerateCode(prompt, {
      temperature: 0.2,
      maxTokens: 2000,
    });

    if (!generated || generated.trim().length < 10) return null;

    // Validate output
    const validation = this.validateOutput(generated, ctx);
    if (!validation.valid) return null;

    // Format and return
    const formatted = this.formatOutput(generated, ctx);
    return {
      code: formatted,
      strategy: "llm",
      confidence: validation.confidence,
      warnings: validation.warnings,
    };
  }

  /**
   * Build the LLM prompt for method migration.
   */
  private buildMigrationPrompt(ctx: MethodContext): string {
    const params = ctx.parameters.map(p => `${p.type} ${p.name}`).join(", ");
    const repos = ctx.availableRepositories.length > 0
      ? `Available Spring Data repositories: ${ctx.availableRepositories.join(", ")}`
      : "No repositories available — use EntityManager or service calls.";
    const services = ctx.availableServices.length > 0
      ? `Available Spring services: ${ctx.availableServices.join(", ")}`
      : "";

    return `You are a Java EE to Spring Boot migration expert.
Migrate the following legacy EJB method body to Spring Boot 3.2 / Java 17+.

RULES:
- Replace EntityManager JPQL/SQL with Spring Data repository calls where possible
- Replace @EJB injections with constructor-injected Spring services
- Replace javax.* with jakarta.* where applicable
- Keep ALL business logic intact — do not simplify or remove conditions
- Use Lombok @Slf4j for logging (log.info/warn/error)
- Wrap checked exceptions in RuntimeException or custom exceptions
- Keep BigDecimal operations unchanged
- Do NOT add imports — only output the method BODY (no signature, no class)
- Do NOT use @Autowired — dependencies are constructor-injected (already available as fields)

METHOD SIGNATURE:
public ${ctx.returnType} ${ctx.methodName}(${params})

CLASS CONTEXT:
- Class: ${ctx.className}
${repos}
${services}

LEGACY METHOD BODY TO MIGRATE:
\`\`\`java
${ctx.body}
\`\`\`

OUTPUT: Only the migrated method body (no signature, no class wrapper). Pure Java code.`;
  }

  /**
   * Validate LLM output for anti-patterns and structural correctness.
   */
  private validateOutput(code: string, ctx: MethodContext): { valid: boolean; confidence: number; warnings: string[] } {
    const warnings: string[] = [];
    let confidence = 0.8;

    // Check anti-patterns
    for (const pattern of ANTI_PATTERNS) {
      if (pattern.test(code)) {
        return { valid: false, confidence: 0, warnings: ["Contains legacy anti-pattern"] };
      }
    }

    // Check brace balance
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      return { valid: false, confidence: 0, warnings: ["Brace imbalance"] };
    }

    // Check for Spring patterns (boost confidence)
    let springPatternCount = 0;
    for (const pattern of SPRING_PATTERNS) {
      if (pattern.test(code)) springPatternCount++;
    }
    if (springPatternCount >= 2) confidence += 0.1;

    // Check return statement exists if non-void
    if (ctx.returnType !== "void" && !/\breturn\s+/.test(code)) {
      warnings.push("Missing return statement for non-void method");
      confidence -= 0.2;
    }

    // Check code is not too short (likely incomplete)
    const loc = code.split("\n").filter(l => l.trim()).length;
    const originalLOC = ctx.body.split("\n").filter(l => l.trim()).length;
    if (loc < originalLOC * 0.3) {
      warnings.push("Generated code is significantly shorter than original");
      confidence -= 0.2;
    }

    return { valid: confidence >= 0.5, confidence: Math.min(confidence, 1.0), warnings };
  }

  /**
   * Format LLM output with proper indentation.
   */
  private formatOutput(code: string, ctx: MethodContext): string {
    // Remove any class/method wrapper the LLM might have added
    let cleaned = code.trim();

    // Remove ```java ... ``` wrapper if present
    cleaned = cleaned.replace(/^```java\s*\n?/, "").replace(/\n?```\s*$/, "");

    // Remove method signature if LLM included it
    const sigPattern = new RegExp(`^\\s*public\\s+${ctx.returnType}\\s+${ctx.methodName}\\s*\\([^)]*\\)\\s*\\{?\\s*\\n?`);
    cleaned = cleaned.replace(sigPattern, "");
    // Remove trailing } if it was the method's closing brace
    if (cleaned.endsWith("}")) {
      const lastNewline = cleaned.lastIndexOf("\n");
      const lastLine = cleaned.substring(lastNewline + 1).trim();
      if (lastLine === "}") {
        cleaned = cleaned.substring(0, lastNewline).trimEnd();
      }
    }

    // Ensure proper indentation (8 spaces for method body)
    const lines = cleaned.split("\n").map(line => {
      if (line.trim() === "") return "";
      if (line.startsWith("        ")) return line;
      return "        " + line.trimStart();
    });

    return lines.join("\n");
  }

  /**
   * Rule-based fallback — applies pattern replacements without LLM.
   */
  private applyRuleBasedTransforms(ctx: MethodContext): MethodMigrationResult {
    const transformer = new BusinessLogicTransformer();
    const transformCtx: TransformContext = {
      voInClass: ctx.parameters[0]?.type || "Void",
      voOutClass: ctx.returnType,
      requestDtoClass: ctx.parameters[0]?.type || "Void",
      responseDtoClass: ctx.returnType,
      sourceClassName: ctx.className,
      methodName: ctx.methodName,
    };

    try {
      const result = transformer.transform(ctx.body, transformCtx);
      const totalLines = ctx.body.split("\n").filter(l => l.trim()).length;
      const coverage = totalLines > 0 ? result.migratedLines / totalLines : 0;

      if (coverage >= 0.4) {
        // Good enough — use rule-based result
        const lines: string[] = [];
        const bodyLines = result.code.split("\n").map(line => {
          if (line.trim() === "") return "";
          if (line.startsWith("        ")) return line;
          return "        " + line;
        });
        lines.push(...bodyLines);

        if (result.todos.length > 0) {
          for (const todo of result.todos) {
            lines.push(`        // TODO [${todo.type}]: ${todo.suggestion}`);
          }
        }

        lines.push(`        // Migrated from: ${ctx.className}.${ctx.methodName}() — rule-based (${result.migratedLines}/${totalLines} lines)`);

        return {
          code: lines.join("\n"),
          strategy: "rule-based",
          confidence: Math.min(coverage + 0.2, 0.9),
          warnings: result.warnings,
          todos: result.todos.map(t => t.suggestion),
        };
      }

      // Coverage too low — generate structured TODO with extracted context
      return this.generateStructuredTodo(ctx);
    } catch {
      return this.generateStructuredTodo(ctx);
    }
  }

  /**
   * Generate a structured TODO with context extracted from the legacy body.
   */
  private generateStructuredTodo(ctx: MethodContext): MethodMigrationResult {
    const lines: string[] = [];
    const body = ctx.body;

    // Extract key operations from the body
    const operations: string[] = [];
    if (/em\.(persist|merge)/.test(body)) operations.push("JPA persist/merge");
    if (/em\.find/.test(body)) operations.push("JPA find");
    if (/em\.createQuery/.test(body)) operations.push("JPQL query");
    if (/prepareStatement|executeQuery/.test(body)) operations.push("JDBC query");
    if (/BigDecimal/.test(body)) operations.push("Financial calculation");
    if (/\w+Service\.\w+\(|\w+Bean\.\w+\(/.test(body)) operations.push("Service delegation");
    if (/throw\s+new/.test(body)) operations.push("Exception handling");
    if (/for\s*\(|while\s*\(/.test(body)) operations.push("Collection iteration");

    lines.push(`        // ─── Migration stub for ${ctx.className}.${ctx.methodName}() ───`);
    lines.push(`        // Original: ${ctx.body.split("\\n").filter(l => l.trim()).length} LOC`);
    if (operations.length > 0) {
      lines.push(`        // Key operations: ${operations.join(", ")}`);
    }
    lines.push(`        // TODO: Migrate business logic from legacy ${ctx.className}.${ctx.methodName}()`);

    // Add a simplified skeleton based on detected patterns
    if (/em\.find/.test(body)) {
      const entityMatch = body.match(/em\.find\((\w+)\.class/);
      if (entityMatch) {
        lines.push(`        // var entity = ${entityMatch[1].toLowerCase()}Repository.findById(id).orElseThrow();`);
      }
    }
    if (/em\.(persist|merge)/.test(body)) {
      lines.push(`        // repository.save(entity);`);
    }
    if (ctx.returnType !== "void") {
      lines.push(`        throw new UnsupportedOperationException("${ctx.methodName} — migration pending");`);
    }

    return {
      code: lines.join("\n"),
      strategy: "todo",
      confidence: 0.2,
      todos: [`Implement ${ctx.methodName} — ${operations.join(", ")}`],
    };
  }
}
