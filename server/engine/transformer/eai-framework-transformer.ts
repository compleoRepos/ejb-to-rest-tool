/**
 * eai-framework-transformer.ts — v8.4 STEP 3 + STEP 4
 * Post-generation transformer : remplace les références au framework EAI
 * par les équivalents Spring Boot dans le code Java généré.
 *
 * STEP 3 : EaiLog / Log → @Slf4j log
 * STEP 4 : FwkRollbackException + SessionContext → Spring equivalents
 *
 * Appliqué APRÈS la génération de chaque fichier .java.
 * Toutes les transformations sont idempotentes.
 *
 * @author Compleo
 */

// ═══ STEP 3 : Logging EAI → @Slf4j ═══

const LOGGING_REPLACEMENTS: [RegExp, string][] = [
  // EaiLog.info(msg) → log.info(msg)
  [/EaiLog\.info\(/g, "log.info("],
  [/EaiLog\.error\(/g, "log.error("],
  [/EaiLog\.debug\(/g, "log.debug("],
  [/EaiLog\.warn\(/g, "log.warn("],

  // Log.info(msg) → log.info(msg) (variante ma.eai.midw.log.Log)
  [/\bLog\.info\(/g, "log.info("],
  [/\bLog\.error\(/g, "log.error("],
  [/\bLog\.debug\(/g, "log.debug("],
  [/\bLog\.warn\(/g, "log.warn("],

  // Supprimer les appels d'initialisation EAI (MDC géré par Spring)
  [/\s*EaiLog\.initLogTraceInfos\([^)]*\);\r?\n?/g, "\n"],
  [/\s*EaiLog\.setNewThreadId\(\);\r?\n?/g, "\n"],
  [/\s*Log\.initLogTraceInfos\([^)]*\);\r?\n?/g, "\n"],
  [/\s*Log\.setNewThreadId\(\);\r?\n?/g, "\n"],
];

// ═══ STEP 4 : FwkRollbackException + SessionContext ═══

const FRAMEWORK_REPLACEMENTS: [RegExp, string][] = [
  // extends FwkRollbackException → extends RuntimeException
  [/extends\s+FwkRollbackException/g, "extends RuntimeException"],

  // throws FwkRollbackException → (supprimé, RuntimeException est unchecked)
  [/\s*throws\s+FwkRollbackException/g, ""],

  // catch (FwkRollbackException e) → catch (RuntimeException e)
  [/catch\s*\(\s*FwkRollbackException\s+(\w+)\s*\)/g, "catch (RuntimeException $1)"],

  // new FwkRollbackException(...) → new RuntimeException(...)
  [/new\s+FwkRollbackException\(/g, "new RuntimeException("],

  // @Transactional(rollbackFor = FwkRollbackException.class) → @Transactional
  [/\(rollbackFor\s*=\s*FwkRollbackException\.class\)/g, ""],

  // Nettoyer les attributs restants après suppression de rollbackFor
  [/readOnly\s*=\s*false\s*,?\s*/g, ""],
  [/,?\s*rollbackFor\s*=\s*FwkRollbackException\.class/g, ""],

  // Nettoyer les @Transactional() vides → @Transactional
  [/@Transactional\(\s*\)/g, "@Transactional"],

  // sctx.setRollbackOnly() → throw new RuntimeException("Transaction rollback forced")
  [/sctx\.setRollbackOnly\(\)/g, 'throw new RuntimeException("Transaction rollback forced")'],

  // Parser EAI → identité (JSON natif en Spring)
  [/Parser\.unmarshall\(([^)]+)\)/g, "$1"],
  [/Parser\.update\(([^)]+)\)/g, "$1"],
];

// ═══ Imports EAI à supprimer ═══

const EAI_IMPORT_PATTERNS: RegExp[] = [
  /import\s+ma\.eai\.ingdev\.fwk\.logging\.EaiLog;\r?\n?/g,
  /import\s+ma\.eai\.midw\.log\.Log;\r?\n?/g,
  /import\s+ma\.eai\.commons\.services\.parsing\.Envelope;\r?\n?/g,
  /import\s+ma\.eai\.commons\.services\.parsing\.Parser;\r?\n?/g,
  /import\s+ma\.eai\.midw\.connectors\.SynchroneService;\r?\n?/g,
  /import\s+ma\.eai\.ingdev\.fwk\.strategie\.impl\.UCStrategie;\r?\n?/g,
  /import\s+ma\.eai\.ingdev\.fwk\..*;\r?\n?/g,
  /import\s+ma\.eai\.midw\..*;\r?\n?/g,
  /import\s+ma\.eai\.commons\..*;\r?\n?/g,
  /import\s+.*FwkRollbackException;\r?\n?/g,
  /import\s+javax\.ejb\.SessionContext;\r?\n?/g,
];

// ─── API publique ───────────────────────────────────────────────────────────

/**
 * Appliquer toutes les transformations EAI framework sur le code Java généré.
 * Idempotent : si aucun pattern EAI n'est trouvé, le code passe sans modification.
 */
export function transformEaiFrameworkReferences(javaCode: string): string {
  let result = javaCode;

  // 1. Supprimer les imports EAI
  for (const pattern of EAI_IMPORT_PATTERNS) {
    result = result.replace(pattern, "");
  }

  // 2. Remplacer les appels de logging
  for (const [pattern, replacement] of LOGGING_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // 3. Remplacer les patterns framework
  for (const [pattern, replacement] of FRAMEWORK_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // 4. Nettoyer les lignes vides consécutives (max 2)
  result = result.replace(/\n{4,}/g, "\n\n\n");

  return result;
}

/**
 * Vérifie si un code Java contient des références au framework EAI.
 * Utile pour les rapports de qualité.
 */
export function hasEaiFrameworkReferences(javaCode: string): {
  hasEaiLog: boolean;
  hasLegacyLog: boolean;
  hasFwkRollback: boolean;
  hasSessionContext: boolean;
  hasEaiImports: boolean;
  hasParser: boolean;
  totalReferences: number;
} {
  const hasEaiLog = /EaiLog\.\w+\(/.test(javaCode);
  const hasLegacyLog = /\bLog\.(info|error|debug|warn)\(/.test(javaCode);
  const hasFwkRollback = /FwkRollbackException/.test(javaCode);
  const hasSessionContext = /sctx\.setRollbackOnly\(\)/.test(javaCode);
  const hasEaiImports = /import\s+ma\.eai\./.test(javaCode);
  const hasParser = /Parser\.(unmarshall|update)\(/.test(javaCode);

  const totalReferences =
    (javaCode.match(/EaiLog\.\w+\(/g) || []).length +
    (javaCode.match(/\bLog\.(info|error|debug|warn)\(/g) || []).length +
    (javaCode.match(/FwkRollbackException/g) || []).length +
    (javaCode.match(/sctx\.setRollbackOnly\(\)/g) || []).length +
    (javaCode.match(/Parser\.(unmarshall|update)\(/g) || []).length;

  return { hasEaiLog, hasLegacyLog, hasFwkRollback, hasSessionContext, hasEaiImports, hasParser, totalReferences };
}
