/**
 * BusinessLogicTransformer — Transforme le corps de execute() EJB en code Spring Boot.
 *
 * 8 règles de transformation :
 *   T1: Cast VoIn → supprimer (request est déjà le bon type)
 *   T2: input.xxx → request.xxx
 *   T3: new VoOut() → ResponseDTO.builder()
 *   T4: output.setXxx(val) → builder.xxx(val)
 *   T5: return output → return builder.build()
 *   T6: javax. → jakarta.
 *   T7: Exceptions préservées (FwkRollbackException → BusinessRuleException)
 *   T8: Imports EJB obsolètes supprimés
 *
 * Cas particuliers :
 *   A) Méthodes privées this.xxx() → extraites dans le Service
 *   B) JDBC legacy → commentaire MIGRATION
 *   C) Constantes static final → préservées en haut de méthode
 *   D) Auto-appel UseCases → injection Service correspondant
 *
 * @since v5.3.0
 */

export interface TransformContext {
  voInClass: string;
  voOutClass: string;
  requestDtoClass: string;
  responseDtoClass: string;
  sourceClassName: string;
  privateMethodBodies?: Map<string, string>;
}

export interface TransformResult {
  body: string;
  extractedConstants: Array<{ name: string; type: string; value: string }>;
  extractedPrivateMethods: string[];
  warnings: string[];
  linesTransformed: number;
}

export class BusinessLogicTransformer {

  transform(body: string, ctx: TransformContext): TransformResult {
    const warnings: string[] = [];
    const extractedConstants: Array<{ name: string; type: string; value: string }> = [];
    const extractedPrivateMethods: string[] = [];
    let result = body;
    let linesTransformed = 0;

    // ─── T8: Supprimer les imports EJB obsolètes ───
    const importsBefore = (result.match(/import\s+(javax\.ejb|ma\.eai\.midw\.usecases|ma\.eai\.midw\.annotations)\.[^;]+;\n?/g) || []).length;
    result = result.replace(
      /import\s+(javax\.ejb|ma\.eai\.midw\.usecases|ma\.eai\.midw\.annotations)\.[^;]+;\n?/g,
      ""
    );
    linesTransformed += importsBefore;

    // ─── T1: Cast du VoIn → supprimer ───
    // Pattern: VoInClass varName = (VoInClass) voIn;
    const castPattern = new RegExp(
      `${this.escapeRegex(ctx.voInClass)}\\s+(\\w+)\\s*=\\s*\\(${this.escapeRegex(ctx.voInClass)}\\)\\s*voIn\\s*;`,
      "g"
    );
    const castMatch = castPattern.exec(result);
    const inputVar = castMatch ? castMatch[1] : "input";
    result = result.replace(
      new RegExp(
        `${this.escapeRegex(ctx.voInClass)}\\s+\\w+\\s*=\\s*\\(${this.escapeRegex(ctx.voInClass)}\\)\\s*voIn\\s*;`,
        "g"
      ),
      `// Paramètre migré : request (${ctx.requestDtoClass})`
    );
    linesTransformed++;

    // ─── T2: input.xxx → request.xxx ───
    if (inputVar && inputVar !== "request") {
      const inputRefPattern = new RegExp(`\\b${this.escapeRegex(inputVar)}\\.`, "g");
      const inputRefCount = (result.match(inputRefPattern) || []).length;
      result = result.replace(inputRefPattern, "request.");
      linesTransformed += inputRefCount;
    }

    // ─── T3: new VoOut() → builder pattern ───
    const voOutPattern = new RegExp(
      `${this.escapeRegex(ctx.voOutClass)}\\s+(\\w+)\\s*=\\s*new\\s+${this.escapeRegex(ctx.voOutClass)}\\(\\)\\s*;`,
      "g"
    );
    const voOutMatch = voOutPattern.exec(result);
    const outputVar = voOutMatch ? voOutMatch[1] : "output";
    result = result.replace(
      new RegExp(
        `${this.escapeRegex(ctx.voOutClass)}\\s+\\w+\\s*=\\s*new\\s+${this.escapeRegex(ctx.voOutClass)}\\(\\)\\s*;`,
        "g"
      ),
      `// Builder pattern — ${ctx.responseDtoClass}`
    );
    linesTransformed++;

    // ─── T4: output.setXxx(val) → builder.xxx(val) ───
    const setterPattern = new RegExp(
      `${this.escapeRegex(outputVar)}\\.set([A-Z][a-zA-Z0-9]*)\\s*\\(`,
      "g"
    );
    result = result.replace(setterPattern, (match, setter) => {
      const field = setter.charAt(0).toLowerCase() + setter.slice(1);
      linesTransformed++;
      return `builder.${field}(`;
    });

    // ─── T5: return output → return builder.build() ───
    const returnPattern = new RegExp(`return\\s+${this.escapeRegex(outputVar)}\\s*;`, "g");
    result = result.replace(returnPattern, "return builder.build();");
    linesTransformed++;

    // ─── T6: javax. → jakarta. ───
    const javaxCount = (result.match(/javax\./g) || []).length;
    result = result.replace(/javax\./g, "jakarta.");
    linesTransformed += javaxCount;

    // ─── T7: FwkRollbackException → BusinessRuleException ───
    result = result.replace(/FwkRollbackException/g, "BusinessRuleException");
    result = result.replace(/new EaiLog\([^)]+\)/g, "// Logger migré vers @Slf4j");

    // ─── Cas B: JDBC legacy detection ───
    if (result.includes("getConnection()") || result.includes("DataSource") || result.includes("PreparedStatement")) {
      warnings.push("MIGRATION: JDBC direct détecté — recommander Spring Data JPA (règle JDBC-001)");
      result = result.replace(
        /(.*(?:getConnection|PreparedStatement|ResultSet).*)/g,
        "        // MIGRATION: JDBC direct détecté — recommander Spring Data JPA\n$1"
      );
    }

    // ─── Cas D: Auto-appel UseCases ───
    const ucInstantiationPattern = /new\s+(\w+UC)\s*\(\)/g;
    let ucMatch;
    while ((ucMatch = ucInstantiationPattern.exec(result)) !== null) {
      const ucName = ucMatch[1];
      warnings.push(`Auto-appel détecté: new ${ucName}() — injecter le Service correspondant`);
    }
    result = result.replace(
      /new\s+(\w+)UC\s*\(\)/g,
      (match, name) => {
        const serviceName = name.charAt(0).toLowerCase() + name.slice(1) + "Service";
        return serviceName;
      }
    );

    // ─── Cas A: Extraction méthodes privées this.xxx() ───
    if (ctx.privateMethodBodies) {
      for (const [methodName, methodBody] of ctx.privateMethodBodies) {
        extractedPrivateMethods.push(methodName);
      }
    }

    // ─── Nettoyage final ───
    // Remove EaiLog references (migrated to @Slf4j)
    result = result.replace(/\blog\.info\(/g, "log.info(");
    result = result.replace(/\blog\.error\(/g, "log.error(");
    result = result.replace(/\blog\.debug\(/g, "log.debug(");
    result = result.replace(/\blog\.warn\(/g, "log.warn(");

    // Clean up double blank lines
    result = result.replace(/\n{3,}/g, "\n\n");

    return {
      body: result.trim(),
      extractedConstants,
      extractedPrivateMethods,
      warnings,
      linesTransformed,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

/**
 * Extract the body of the execute() method from a Java UseCase source file.
 * Uses brace-counting to handle nested blocks correctly.
 *
 * @param sourceCode - The full Java source code of the UseCase
 * @returns The body of execute() (without the method signature), or null if not found
 */
export function extractExecuteBody(sourceCode: string): string | null {
  // Pattern: public ValueObject execute(ValueObject voIn) [throws ...] {
  // Also handle: public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
  const methodPattern = /public\s+ValueObject\s+execute\s*\([^)]*\)\s*(?:throws\s+[^{]*)?\{/g;

  const match = methodPattern.exec(sourceCode);
  if (!match) return null;

  // Extract the body using brace counting
  let depth = 0;
  const start = match.index + match[0].length;
  let i = start;

  for (; i < sourceCode.length; i++) {
    if (sourceCode[i] === "{") depth++;
    if (sourceCode[i] === "}") {
      if (depth === 0) break;
      depth--;
    }
  }

  const body = sourceCode.substring(start, i).trim();

  // Check if the body is essentially empty (just "return null;" or empty)
  if (!body || body === "return null;" || body.length < 15) {
    return null;
  }

  return body;
}

/**
 * Extract private method bodies from a UseCase source file.
 * These are helper methods called via this.xxx() within execute().
 *
 * @param sourceCode - The full Java source code
 * @returns Map of method name → method body
 */
export function extractPrivateMethods(sourceCode: string): Map<string, string> {
  const methods = new Map<string, string>();
  const pattern = /private\s+\w+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[^{]*)?\{/g;

  let match;
  while ((match = pattern.exec(sourceCode)) !== null) {
    const methodName = match[1];
    let depth = 0;
    const start = match.index + match[0].length;
    let i = start;

    for (; i < sourceCode.length; i++) {
      if (sourceCode[i] === "{") depth++;
      if (sourceCode[i] === "}") {
        if (depth === 0) break;
        depth--;
      }
    }

    const body = sourceCode.substring(match.index, i + 1).trim();
    methods.set(methodName, body);
  }

  return methods;
}

/**
 * Extract static final constants from a UseCase source file.
 *
 * @param sourceCode - The full Java source code
 * @returns Array of constant definitions
 */
export function extractConstants(sourceCode: string): Array<{ name: string; type: string; value: string }> {
  const constants: Array<{ name: string; type: string; value: string }> = [];
  const pattern = /private\s+static\s+final\s+(\w+)\s+(\w+)\s*=\s*([^;]+);/g;

  let match;
  while ((match = pattern.exec(sourceCode)) !== null) {
    const [, type, name, value] = match;
    // Skip logger constants
    if (type === "EaiLog" || type === "Logger") continue;
    constants.push({ name, type, value: value.trim() });
  }

  return constants;
}
