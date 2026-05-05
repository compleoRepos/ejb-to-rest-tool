/**
 * BusinessLogicTransformer — Transforme le corps de execute() EJB en code Spring Boot.
 *
 * 9 règles de transformation :
 *   T1: Cast VoIn → supprimer (request est déjà le bon type)
 *   T2: input.xxx → request.xxx
 *   T3: new VoOut() → ResponseDTO.builder()
 *   T4: output.setXxx(val) → builder.xxx(val)
 *   T5: return output → return builder.build()
 *   T6: javax. → jakarta.
 *   T7: Extraire les codes Magix
 *   T8: JDBC direct → TODO typé avec suggestion
 *   T9: Self-invocation this.xxx() → warning @Transactional
 *   T10: VoOut/VoIn dans variables locales et résiduels → DTO
 *
 * Cas particuliers :
 *   A) Méthodes privées this.xxx() → extraites dans le Service
 *   B) JDBC legacy → commentaire MIGRATION
 *   C) Constantes static final → préservées en haut de méthode
 *   D) Auto-appel UseCases → injection Service correspondant
 *
 * @since v5.3.0
 * @updated v5.3.1 — enrichissement AST (TransformTodo, magixCodes, migratedLines/manualLines)
 */

import type { SymbolTable } from "./ast/SymbolTable";

export interface TransformContext {
  voInClass: string;
  voOutClass: string;
  requestDtoClass: string;
  responseDtoClass: string;
  sourceClassName: string;
  methodName?: string;
  privateMethodBodies?: Map<string, string>;
}

export interface TransformTodo {
  type: "JDBC_DIRECT" | "EXTERNAL_API" | "COMPLEX_LOGIC" | "UNKNOWN_TYPE";
  line: string;
  suggestion: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface JdbcBlock {
  /** Identifiant unique du bloc JDBC (pour le placeholder) */
  blockId: string;
  /** Code JDBC legacy complet */
  code: string;
  /** Tables SQL référencées */
  tables: string[];
  /** DataSources utilisées */
  dataSources: string[];
  /** Constantes SQL disponibles dans le contexte */
  sqlConstants: Array<{ name: string; type: string; value: string }>;
  /** Nom de la classe source */
  sourceClassName: string;
  /** Nom de la méthode */
  methodName: string;
}

export interface TransformResult {
  /** @deprecated Use `code` instead — kept for backward compatibility */
  body: string;
  /** Code Java migré (identique à body) */
  code: string;
  extractedConstants: Array<{ name: string; type: string; value: string }>;
  extractedPrivateMethods: string[];
  warnings: string[];
  /** @deprecated Use `migratedLines` instead */
  linesTransformed: number;
  /** TODOs résiduels légitimes */
  todos: TransformTodo[];
  /** Codes Magix identifiés */
  magixCodes: string[];
  /** Lignes migrées avec succès */
  migratedLines: number;
  /** Lignes nécessitant intervention manuelle */
  manualLines: number;
  /** Blocs JDBC collectés pour migration LLM (v10.11) */
  jdbcBlocks: JdbcBlock[];
}

export class BusinessLogicTransformer {

  /**
   * Transforme le corps de execute() en code Spring Boot.
   * Supporte deux signatures :
   *   - transform(body, ctx)                    — mode legacy (regex seul)
   *   - transform(body, symbolTableOrCtx, ctx)  — mode enrichi (AST + SymbolTable)
   */
  transform(body: string, ctxOrSymbols: TransformContext | SymbolTable, ctx?: TransformContext): TransformResult {
    // Détecter le mode d'appel
    let resolvedCtx: TransformContext;
    let symbolTable: SymbolTable | null = null;

    if (ctx) {
      // Mode enrichi : transform(body, symbolTable, ctx)
      symbolTable = ctxOrSymbols as SymbolTable;
      resolvedCtx = ctx;
    } else {
      // Mode legacy : transform(body, ctx)
      resolvedCtx = ctxOrSymbols as TransformContext;
    }

    const warnings: string[] = [];
    const extractedConstants: Array<{ name: string; type: string; value: string }> = [];
    const extractedPrivateMethods: string[] = [];
    const todos: TransformTodo[] = [];
    const magixCodes: string[] = [];
    let migratedLines = 0;
    let manualLines = 0;
    let result = body;

    // Résolution des noms de variables via SymbolTable ou regex
    let inputVar = "input";
    let outputVar = "output";

    if (symbolTable) {
      const inputAlias = symbolTable.getInputAlias();
      const outputDto = symbolTable.getOutputVar();
      if (inputAlias) inputVar = inputAlias.name;
      if (outputDto) outputVar = outputDto.name;
    }

    // ─── T8: Supprimer les imports EJB obsolètes ───
    const importsBefore = (result.match(/import\s+(javax\.ejb|ma\.eai\.midw\.usecases|ma\.eai\.midw\.annotations)\.[^;]+;\n?/g) || []).length;
    result = result.replace(
      /import\s+(javax\.ejb|ma\.eai\.midw\.usecases|ma\.eai\.midw\.annotations)\.[^;]+;\n?/g,
      ""
    );
    migratedLines += importsBefore;

    // ─── T1: Cast du VoIn → supprimer ───
    const castPattern = new RegExp(
      `${this.escapeRegex(resolvedCtx.voInClass)}\\s+(\\w+)\\s*=\\s*\\(${this.escapeRegex(resolvedCtx.voInClass)}\\)\\s*voIn\\s*;`,
      "g"
    );
    const castMatch = castPattern.exec(result);
    if (castMatch) inputVar = castMatch[1];
    result = result.replace(
      new RegExp(
        `${this.escapeRegex(resolvedCtx.voInClass)}\\s+\\w+\\s*=\\s*\\(${this.escapeRegex(resolvedCtx.voInClass)}\\)\\s*voIn\\s*;`,
        "g"
      ),
      `// Paramètre migré : request (${resolvedCtx.requestDtoClass})`
    );
    migratedLines++;

    // ─── T2: input.xxx → request.xxx ───
    if (inputVar && inputVar !== "request") {
      const inputRefPattern = new RegExp(`\\b${this.escapeRegex(inputVar)}\\.`, "g");
      const inputRefCount = (result.match(inputRefPattern) || []).length;
      result = result.replace(inputRefPattern, "request.");
      migratedLines += inputRefCount;
    }

    // ─── T0: Remplacer voIn → request quand il n'y a PAS de cast (fallback) ───
    // Si T1 n'a pas trouvé de cast, voIn est utilisé directement comme paramètre
    if (/\bvoIn\./.test(result) || /\bvoIn\b/.test(result)) {
      const voInDotPattern = /\bvoIn\./g;
      const voInDotCount = (result.match(voInDotPattern) || []).length;
      result = result.replace(voInDotPattern, "request.");
      const voInAlonePattern = /\bvoIn\b(?!\.)/g;
      result = result.replace(voInAlonePattern, "request");
      migratedLines += voInDotCount;
    }

    // ─── T3: new VoOut() → builder pattern ───
    const voOutPattern = new RegExp(
      `${this.escapeRegex(resolvedCtx.voOutClass)}\\s+(\\w+)\\s*=\\s*new\\s+${this.escapeRegex(resolvedCtx.voOutClass)}\\(\\)\\s*;`,
      "g"
    );
    const voOutMatch = voOutPattern.exec(result);
    if (voOutMatch) outputVar = voOutMatch[1];
    result = result.replace(
      new RegExp(
        `${this.escapeRegex(resolvedCtx.voOutClass)}\\s+\\w+\\s*=\\s*new\\s+${this.escapeRegex(resolvedCtx.voOutClass)}\\(\\)\\s*;`,
        "g"
      ),
      `${resolvedCtx.responseDtoClass}.${resolvedCtx.responseDtoClass}Builder builder = ${resolvedCtx.responseDtoClass}.builder();`
    );
    migratedLines++;

    // ─── T4: output.setXxx(val) → builder.xxx(val) ───
    const setterPattern = new RegExp(
      `${this.escapeRegex(outputVar)}\\.set([A-Z][a-zA-Z0-9]*)\\s*\\(`,
      "g"
    );
    result = result.replace(setterPattern, (match, setter) => {
      const field = setter.charAt(0).toLowerCase() + setter.slice(1);
      migratedLines++;
      return `builder.${field}(`;
    });

    // ─── T5: return output → return builder.build() ───
    // FIX v5.8.1: Si des logs/instructions référencent outputVar APRÈS les setters
    // et AVANT le return, on doit stocker builder.build() dans une variable "result"
    // pour que ces logs puissent accéder aux getters du DTO.
    const returnPattern = new RegExp(`return\\s+${this.escapeRegex(outputVar)}\\s*;`, "g");
    if (returnPattern.test(result)) {
      // Chercher si outputVar est encore référencé APRÈS le dernier setter et AVANT le return
      const lines = result.split("\n");
      let lastSetterIdx = -1;
      let returnIdx = -1;
      const returnRe = new RegExp(`^\\s*return\\s+${this.escapeRegex(outputVar)}\\s*;`);
      const outputRefRe = new RegExp(`\\b${this.escapeRegex(outputVar)}\\.`);
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("builder.") && lines[i].includes("(")) lastSetterIdx = i;
        if (returnRe.test(lines[i])) returnIdx = i;
      }
      
      // Check if outputVar is referenced between last setter and return
      let hasPostSetterRef = false;
      if (lastSetterIdx >= 0 && returnIdx > lastSetterIdx) {
        for (let i = lastSetterIdx + 1; i < returnIdx; i++) {
          if (outputRefRe.test(lines[i])) {
            hasPostSetterRef = true;
            break;
          }
        }
      }
      
      if (hasPostSetterRef && returnIdx >= 0) {
        // Insert "ResponseDTO result = builder.build();" before the first post-setter reference
        const resultDecl = `        ${resolvedCtx.responseDtoClass} result = builder.build();`;
        let insertIdx = -1;
        for (let i = lastSetterIdx + 1; i < returnIdx; i++) {
          if (outputRefRe.test(lines[i])) {
            insertIdx = i;
            break;
          }
        }
        if (insertIdx >= 0) {
          lines.splice(insertIdx, 0, resultDecl);
          // Re-find returnIdx after insertion
          returnIdx++;
        }
        // Replace outputVar. with result. in lines between insertIdx and returnIdx
        for (let i = (insertIdx >= 0 ? insertIdx + 1 : lastSetterIdx + 1); i <= returnIdx; i++) {
          lines[i] = lines[i].replace(
            new RegExp(`\\b${this.escapeRegex(outputVar)}\\.`, "g"),
            "result."
          );
        }
        // Replace return outputVar; with return result;
        lines[returnIdx] = lines[returnIdx].replace(
          new RegExp(`return\\s+${this.escapeRegex(outputVar)}\\s*;`),
          "return result;"
        );
        result = lines.join("\n");
      } else {
        // Simple case: no post-setter references, just replace return
        result = result.replace(
          new RegExp(`return\\s+${this.escapeRegex(outputVar)}\\s*;`, "g"),
          "return builder.build();"
        );
      }
    }
    // Also replace any remaining outputVar. references (e.g. voOut.getXxx() in other positions)
    const remainingOutputRefs2 = new RegExp(`\\b${this.escapeRegex(outputVar)}\\.`, "g");
    if (remainingOutputRefs2.test(result)) {
      // If we haven't inserted a result variable yet, insert one before the first orphan reference
      if (!result.includes(`${resolvedCtx.responseDtoClass} result = builder.build()`)) {
        // Insert result = builder.build() before the first remaining reference
        const orphanLines = result.split("\n");
        const orphanRefRe = new RegExp(`\\b${this.escapeRegex(outputVar)}\\.`);
        let orphanInsertIdx = -1;
        for (let i = 0; i < orphanLines.length; i++) {
          if (orphanRefRe.test(orphanLines[i])) {
            orphanInsertIdx = i;
            break;
          }
        }
        if (orphanInsertIdx >= 0) {
          orphanLines.splice(orphanInsertIdx, 0, `        ${resolvedCtx.responseDtoClass} result = builder.build();`);
          result = orphanLines.join("\n");
        }
        // Now replace all remaining outputVar. with result.
        result = result.replace(new RegExp(`\\b${this.escapeRegex(outputVar)}\\.`, "g"), "result.");
        // Also replace return outputVar; with return result;
        result = result.replace(
          new RegExp(`return\\s+${this.escapeRegex(outputVar)}\\s*;`, "g"),
          "return result;"
        );
      }
    }

    // ─── T4b: Cleanup — builder.build().setXxx(val) → builder.xxx(val) ───
    // Safety net: if any builder.build().setXxx() patterns slipped through, fix them
    result = result.replace(
      /builder\.build\(\)\.set([A-Z][a-zA-Z0-9]*)\s*\(([^;]+)\)\s*;/g,
      (_, setter, value) => {
        const field = setter.charAt(0).toLowerCase() + setter.slice(1);
        return `builder.${field}(${value});`;
      }
    );
    // Also fix builder.build().getXxx() → result.getXxx() (if result variable exists)
    if (result.includes(`${resolvedCtx.responseDtoClass} result = builder.build()`)) {
      result = result.replace(
        /builder\.build\(\)\.get([A-Z][a-zA-Z0-9]*)\s*\(/g,
        'result.get$1('
      );
    }
    migratedLines++;

    // ─── T6: javax. → jakarta. + LOG → log (@Slf4j) ───
    const javaxCount = (result.match(/javax\./g) || []).length;
    result = result.replace(/javax\./g, "jakarta.");
    migratedLines += javaxCount;

    // T6b: Migrer LOG (majuscule) → log (minuscule) pour @Slf4j
    const logUpperCount = (result.match(/\bLOG\./g) || []).length;
    result = result.replace(/\bLOG\./g, "log.");
    migratedLines += logUpperCount;

    // T6c: Supprimer les déclarations de Logger obsolètes (@Slf4j les remplace)
    result = result.replace(
      /private\s+static\s+final\s+Logger\s+LOG\s*=\s*[^;]+;\n?/g,
      ""
    );
    result = result.replace(
      /private\s+static\s+final\s+EaiLog\s+\w+\s*=\s*[^;]+;\n?/g,
      ""
    );

    // T6d: Migrer les méthodes java.util.logging → SLF4J
    result = result.replace(/\blog\.warning\s*\(/g, "log.warn(");
    result = result.replace(/\blog\.severe\s*\(/g, "log.error(");
    result = result.replace(/\blog\.fine\s*\(/g, "log.debug(");
    result = result.replace(/\blog\.finer\s*\(/g, "log.trace(");
    result = result.replace(/\blog\.finest\s*\(/g, "log.trace(");

    // T6e: Migrer log.log(Level.XXX, msg[, exception]) et LOG.log(Level.XXX, msg[, exception]) → SLF4J
    const levelMap: Record<string, string> = { WARNING: "warn", SEVERE: "error", INFO: "info", FINE: "debug", FINER: "trace", FINEST: "trace" };
    // Pattern 1: (log|LOG).log(Level.XXX, msg, exception) → log.xxx(msg, exception)
    result = result.replace(
      /\b(?:log|LOG)\.log\s*\(\s*Level\.(WARNING|SEVERE|INFO|FINE|FINER|FINEST)\s*,\s*("(?:[^"\\]|\\.)*"[^,)]*),\s*(\w+)\s*\)/g,
      (_, level: string, msg: string, ex: string) => {
        return `log.${levelMap[level] ?? "info"}(${msg.trim()}, ${ex})`;
      }
    );
    // Pattern 2: (log|LOG).log(Level.XXX, msg) sans exception → log.xxx(msg)
    result = result.replace(
      /\b(?:log|LOG)\.log\s*\(\s*Level\.(WARNING|SEVERE|INFO|FINE|FINER|FINEST)\s*,\s*("(?:[^"\\]|\\.)*"[^)]*)\s*\)/g,
      (_, level: string, msg: string) => {
        return `log.${levelMap[level] ?? "info"}(${msg.trim()})`;
      }
    );

    // T6f: Supprimer les imports java.util.logging
    result = result.replace(/import\s+java\.util\.logging\.[^;]+;\n?/g, "");
    result = result.replace(/import\s+java\.util\.logging;\n?/g, "");

    // ─── T7: Extraire les codes Magix ───
    const magixPattern = /"([A-Z]{2,6}[0-9]{1,3})"/g;
    let magixMatch;
    while ((magixMatch = magixPattern.exec(result)) !== null) {
      magixCodes.push(magixMatch[1]);
    }

    // ─── T7 (legacy): FwkRollbackException → BusinessRuleException ───
    result = result.replace(/FwkRollbackException/g, "BusinessRuleException");
    result = result.replace(/new EaiLog\([^)]+\)/g, "// Logger migré vers @Slf4j");

    // ─── T8: JDBC direct → Collecte blocs pour migration LLM ───
    const jdbcBlocks: JdbcBlock[] = [];
    const jdbcLines = result.split("\n");
    const processedLines: string[] = [];
    let inJdbcBlock = false;
    let jdbcBlockLines: string[] = [];
    let jdbcBraceDepth = 0;
    let blockCounter = 0;

    for (let i = 0; i < jdbcLines.length; i++) {
      const line = jdbcLines[i];
      const trimmedLine = line.trim();

      // Détecter le début d'un bloc JDBC
      if (!inJdbcBlock && (
        trimmedLine.includes("getConnection()") ||
        (trimmedLine.includes("PreparedStatement") && trimmedLine.includes("prepareStatement")) ||
        (trimmedLine.includes("DataSource") && trimmedLine.includes("getConnection"))
      )) {
        inJdbcBlock = true;
        jdbcBraceDepth = 0;
        jdbcBlockLines = [];
      }

      if (inJdbcBlock) {
        jdbcBlockLines.push(line);
        jdbcBraceDepth += (line.match(/\{/g) || []).length;
        jdbcBraceDepth -= (line.match(/\}/g) || []).length;

        // Fin du bloc JDBC
        if (jdbcBraceDepth <= 0 && jdbcBlockLines.length > 1) {
          blockCounter++;
          const blockId = `JDBC_LLM_BLOCK_${blockCounter}`;
          const blockCode = jdbcBlockLines.join("\n");

          // Extraire les tables SQL du bloc
          const tables: string[] = [];
          const tableRegex = /(?:FROM|INTO|UPDATE|JOIN|DELETE\s+FROM)\s+([A-Z_][A-Z0-9_]+)/gi;
          let tm: RegExpExecArray | null;
          while ((tm = tableRegex.exec(blockCode)) !== null) {
            const t = tm[1].toUpperCase();
            if (t.length > 2 && !["SELECT","WHERE","SET","AND","OR","ON","AS","IS","IN","NOT","NULL","VALUES","ORDER","GROUP","HAVING","DUAL"].includes(t)) {
              tables.push(t);
            }
          }

          // Extraire les DataSources
          const dataSources: string[] = [];
          const dsRegex = /(\w+DS|dataSource\w*)\s*\.\s*getConnection/g;
          let dm: RegExpExecArray | null;
          while ((dm = dsRegex.exec(blockCode)) !== null) {
            dataSources.push(dm[1]);
          }

          jdbcBlocks.push({
            blockId,
            code: blockCode,
            tables: [...new Set(tables)],
            dataSources: [...new Set(dataSources)],
            sqlConstants: extractedConstants,
            sourceClassName: resolvedCtx.sourceClassName,
            methodName: resolvedCtx.methodName || "execute",
          });

          // FIX v11.2: Ajouter le TODO JDBC_DIRECT (régression v10.15)
          todos.push({
            type: "JDBC_DIRECT",
            line: blockCode.split("\n")[0].trim(),
            suggestion: "Use Spring Data JPA",
            priority: "HIGH",
          });
          manualLines++;

          // Insérer un placeholder pour le post-processeur LLM
          processedLines.push(`        // @@${blockId}@@`);
          migratedLines++;

          inJdbcBlock = false;
          jdbcBlockLines = [];
          continue;
        }
        continue; // Ne pas ajouter les lignes du bloc JDBC aux processedLines
      }

      // v10.15: Lignes JDBC isolées — traitement intelligent
      // Cas 1: getConnection() comme paramètre d'un appel de méthode (ex: HibernateDao.xxx(..., ds.getConnection()))
      //   → Supprimer le paramètre Connection inline au lieu de créer un placeholder
      // Cas 2: Vraie ligne JDBC autonome (PreparedStatement, executeQuery, etc.)
      //   → Créer un placeholder pour migration LLM
      const isGetConnectionParam = trimmedLine.includes("getConnection()") &&
        (trimmedLine.includes("(") && !trimmedLine.match(/^\s*\w+\s*=\s*\w+\.getConnection\(\)/)) &&
        !trimmedLine.includes("PreparedStatement") &&
        !trimmedLine.includes("Statement");

      if (isGetConnectionParam) {
        // Supprimer le paramètre getConnection() inline — c'est un paramètre d'appel DAO
        let cleanedLine = line
          .replace(/,\s*\w+\.getConnection\(\)\s*/g, "")  // ", ds.getConnection()" → ""
          .replace(/\(\s*\w+\.getConnection\(\)\s*,/g, "(")  // "(ds.getConnection(), " → "("
          .replace(/\w+\.getConnection\(\)\s*,\s*/g, "")  // "ds.getConnection(), " → ""
          .replace(/\w+\.getConnection\(\)/g, "");  // standalone
        processedLines.push(cleanedLine);
        migratedLines++;
      } else if (
        trimmedLine.includes("getConnection()") ||
        trimmedLine.includes("PreparedStatement") ||
        trimmedLine.includes("executeQuery") ||
        trimmedLine.includes("executeUpdate") ||
        (trimmedLine.includes("DataSource") && !trimmedLine.startsWith("//") && !trimmedLine.startsWith("*"))
      ) {
        blockCounter++;
        const blockId = `JDBC_LLM_BLOCK_${blockCounter}`;
        jdbcBlocks.push({
          blockId,
          code: line,
          tables: [],
          dataSources: [],
          sqlConstants: extractedConstants,
          sourceClassName: resolvedCtx.sourceClassName,
          methodName: resolvedCtx.methodName || "execute",
        });
        // FIX v11.2: Ajouter le TODO JDBC_DIRECT pour lignes isolées (régression v10.15)
        todos.push({
          type: "JDBC_DIRECT",
          line: trimmedLine,
          suggestion: "Use Spring Data JPA",
          priority: "HIGH",
        });
        manualLines++;
        processedLines.push(`        // @@${blockId}@@`);
        migratedLines++;
      } else {
        processedLines.push(line);
      }
    }

    // Si un bloc JDBC n'a pas été fermé, l'ajouter quand même
    if (jdbcBlockLines.length > 0) {
      blockCounter++;
      const blockId = `JDBC_LLM_BLOCK_${blockCounter}`;
      jdbcBlocks.push({
        blockId,
        code: jdbcBlockLines.join("\n"),
        tables: [],
        dataSources: [],
        sqlConstants: extractedConstants,
        sourceClassName: resolvedCtx.sourceClassName,
        methodName: resolvedCtx.methodName || "execute",
      });
      processedLines.push(`        // @@${blockId}@@`);
      migratedLines++;
    }

    result = processedLines.join("\n");

    // ─── T9: Self-invocation → warning ───
    const selfInvocationPattern = /this\.(\w+)\s*\(/g;
    let selfMatch;
    while ((selfMatch = selfInvocationPattern.exec(result)) !== null) {
      // Skip if it's a comment line
      const lineStart = result.lastIndexOf("\n", selfMatch.index) + 1;
      const lineText = result.substring(lineStart, selfMatch.index).trim();
      if (lineText.startsWith("//")) continue;

      warnings.push(
        `Self-invocation détectée : this.${selfMatch[1]}() — @Transactional ignoré. Extraire dans un @Service séparé.`
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
    if (resolvedCtx.privateMethodBodies) {
      for (const [methodName] of resolvedCtx.privateMethodBodies) {
        extractedPrivateMethods.push(methodName);
      }
    }

    // ─── T10: Remplacer VoOut/VoIn dans les variables locales et partout ───
    // Cas 1: Déclarations de variables locales (VoOut varName = ...)
    if (resolvedCtx.voOutClass) {
      result = result.replace(
        new RegExp(`\\b${this.escapeRegex(resolvedCtx.voOutClass)}\\s+(\\w+)\\s*=`, 'g'),
        `${resolvedCtx.responseDtoClass} $1 =`
      );
    }
    // v8.8: Skip voIn variable declaration replacement when voInClass === voOutClass
    // to prevent overwriting the voOut replacement (e.g., Envelope varName = → Void varName =)
    if (resolvedCtx.voInClass && resolvedCtx.voInClass !== resolvedCtx.voOutClass) {
      result = result.replace(
        new RegExp(`\\b${this.escapeRegex(resolvedCtx.voInClass)}\\s+(\\w+)\\s*=`, 'g'),
        `${resolvedCtx.requestDtoClass} $1 =`
      );
    }
    // Cas 2: Tous les types VoOut/VoIn résiduels (return types, casts, etc.)
    if (resolvedCtx.voOutClass) {
      result = result.replace(
        new RegExp(`\\b${this.escapeRegex(resolvedCtx.voOutClass)}\\b`, 'g'),
        resolvedCtx.responseDtoClass
      );
    }
    // v8.8: Skip voIn global replacement when voInClass === voOutClass
    // to prevent overwriting the voOut replacement (e.g., Envelope→Envelope then Envelope→Void)
    if (resolvedCtx.voInClass && resolvedCtx.voInClass !== resolvedCtx.voOutClass) {
      result = result.replace(
        new RegExp(`\\b${this.escapeRegex(resolvedCtx.voInClass)}\\b`, 'g'),
        resolvedCtx.requestDtoClass
      );
    }

    // ─── Nettoyage final ───
    result = result.replace(/\blog\.info\(/g, "log.info(");
    result = result.replace(/\blog\.error\(/g, "log.error(");
    result = result.replace(/\blog\.debug\(/g, "log.debug(");
    result = result.replace(/\blog\.warn\(/g, "log.warn(");
    result = result.replace(/\n{3,}/g, "\n\n");

    // v10.15: Post-traitement des catch blocks — ajouter throw après log.error
    // Les catch blocks legacy font souvent log.error() sans rethrow,
    // ce qui avale silencieusement les exceptions. En Spring Boot,
    // il faut relancer l'exception pour que le @ControllerAdvice la capture.
    result = this.enhanceCatchBlocks(result);

    const trimmed = result.trim();

    return {
      body: trimmed,
      code: trimmed,
      extractedConstants,
      extractedPrivateMethods,
      warnings,
      linesTransformed: migratedLines,
      todos,
      magixCodes: [...new Set(magixCodes)],
      migratedLines,
      manualLines,
      jdbcBlocks,
    };
  }

  /**
   * Détecte le nom du paramètre original de execute() dans le corps de la méthode.
   * Cherche d'abord le cast (XxxVoIn varName = (XxxVoIn) voIn), puis les patterns courants.
   */
  private findExecuteParamName(body: string, ctx: TransformContext): string {
    // Chercher le cast : "XxxVoIn varName = (XxxVoIn) voIn"
    if (ctx.voInClass) {
      const castMatch = body.match(
        new RegExp(`${this.escapeRegex(ctx.voInClass)}\\s+(\\w+)\\s*=`)
      );
      if (castMatch) {
        // Le nom après le cast est l'alias local, mais le paramètre original est "voIn"
        // On doit renommer "voIn" (le param d'execute) en "request"
        if (body.includes("voIn.") || body.includes("voIn;") || body.includes("voIn)")) {
          return "voIn";
        }
        return castMatch[1];
      }
    }

    // Chercher l'utilisation directe de voIn
    if (/\bvoIn\./.test(body)) return "voIn";

    // Chercher d'autres patterns courants
    const paramPatterns = ["input.", "param.", "vo."];
    for (const p of paramPatterns) {
      if (body.includes(p)) return p.replace(".", "");
    }

    return ""; // Pas de paramètre détecté
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * v10.15: Post-traitement des catch blocks.
   * Transforme les catch blocks qui font log.error() sans throw
   * en ajoutant un throw RuntimeException après le log.
   * Cela évite les exceptions avalées silencieusement.
   */
  private enhanceCatchBlocks(code: string): string {
    const lines = code.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Détecter un catch block
      if (trimmed.match(/^\}?\s*catch\s*\(/) || trimmed.match(/catch\s*\(/)) {
        // Extraire le nom de la variable d'exception
        const exMatch = trimmed.match(/catch\s*\(\s*\w+\s+(\w+)\s*\)/);
        const exVar = exMatch ? exMatch[1] : "e";

        // Collecter le catch block (jusqu'à l'accolade fermante)
        const catchLines: string[] = [line];
        let braceCount = 0;
        let foundOpen = line.includes("{");
        if (foundOpen) braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        i++;

        while (i < lines.length && (braceCount > 0 || !foundOpen)) {
          const cl = lines[i];
          if (cl.includes("{")) { foundOpen = true; }
          braceCount += (cl.match(/\{/g) || []).length - (cl.match(/\}/g) || []).length;
          catchLines.push(cl);
          i++;
          if (foundOpen && braceCount <= 0) break;
        }

        const catchContent = catchLines.join("\n");
        const hasThrow = /throw\s/.test(catchContent);
        const hasReturn = /return\s/.test(catchContent);
        const hasLog = /log\.(?:error|warn)/.test(catchContent);

        if (hasLog && !hasThrow && !hasReturn) {
          // Insérer throw avant la dernière accolade fermante
          const lastBrace = catchLines.length - 1;
          const indent = catchLines[1] ? catchLines[1].match(/^(\s*)/)?.[1] || "        " : "        ";
          catchLines.splice(lastBrace, 0, `${indent}throw new RuntimeException(${exVar}.getMessage(), ${exVar});`);
        }

        result.push(...catchLines);
        continue;
      }

      result.push(line);
      i++;
    }

    return result.join("\n");
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
 * Extract the body of a named public method from Java source code.
 * v5.10.2: Used for direct EJB methods (consulterSolde, initierVirement, etc.)
 * that don't follow the execute() pattern.
 *
 * @param sourceCode - The full Java source code
 * @param methodName - The method name to extract (e.g., "consulterSolde")
 * @returns The method body as a string, or null if not found
 */
export function extractMethodBody(sourceCode: string, methodName: string): string | null {
  // Pattern: public <ReturnType> <methodName>(<params>) [throws ...] {
  const escapedName = methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const methodPattern = new RegExp(
    `public\\s+\\S+\\s+${escapedName}\\s*\\([^)]*\\)\\s*(?:throws\\s+[^{]*)?\\{`,
    "g"
  );

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

  // Check if the body is essentially empty
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
