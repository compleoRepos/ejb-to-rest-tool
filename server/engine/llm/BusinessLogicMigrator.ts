/**
 * BusinessLogicMigrator — Migration de la logique métier via LLM.
 *
 * Responsabilités :
 *   1. Recevoir un bloc de code JDBC legacy + contexte (Entity JPA, Repository, DTOs)
 *   2. Appeler le LLM pour migrer le code vers Spring Data JPA
 *   3. Valider le code migré (syntaxe, cohérence, imports)
 *   4. Entourer le code migré de commentaires métier
 *
 * Le LLM reçoit :
 *   - Le code JDBC legacy complet (bloc try/Connection/PreparedStatement)
 *   - Les Entity JPA générées (pour mapper les colonnes)
 *   - Les Repository JPA générés (pour les appels findBy/save/delete)
 *   - Les DTOs (pour le mapping ResultSet → DTO)
 *   - Les constantes SQL (pour comprendre les requêtes)
 *
 * @since v10.11
 */

import {
  llmGenerateCode,
  llmGenerateCodeWithBackend,
  isLLMAvailable,
  type LLMAdapterConfig,
  type LLMBackend,
} from "../ml/llm-adapter";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface JdbcMigrationContext {
  /** Nom de la classe source (ex: VirementSEPAOrchestrateurEJB) */
  sourceClassName: string;
  /** Nom de la méthode source */
  methodName: string;
  /** Code JDBC legacy complet (le bloc entier) */
  jdbcCode: string;
  /** Constantes SQL définies dans la classe */
  sqlConstants: Array<{ name: string; type: string; value: string }>;
  /** Entity JPA générée (code complet) */
  entityCode?: string;
  /** Repository JPA généré (code complet) */
  repositoryCode?: string;
  /** DTO de réponse (code complet) */
  responseDtoCode?: string;
  /** DTO de requête (code complet) */
  requestDtoCode?: string;
  /** Tables référencées */
  referencedTables: string[];
  /** DataSources utilisées */
  dataSources: string[];
  /** Nom du Repository (ex: TComptesRepository) */
  repositoryName?: string;
  /** Nom de l'Entity (ex: TComptes) */
  entityName?: string;
  /** Package de base */
  basePackage: string;
}

export interface JdbcMigrationResult {
  /** Code Spring Data JPA migré */
  migratedCode: string;
  /** Imports additionnels requis */
  additionalImports: string[];
  /** Champs à injecter dans le Service (ex: TComptesRepository) */
  requiredInjections: Array<{ type: string; fieldName: string }>;
  /** Confiance dans la migration (0.0 - 1.0) */
  confidence: number;
  /** Backend LLM utilisé */
  backend?: LLMBackend;
  /** Avertissements */
  warnings: string[];
  /** Succès de la migration */
  success: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════════════

function buildMigrationPrompt(ctx: JdbcMigrationContext): string {
  const sqlConstantsSection = ctx.sqlConstants.length > 0
    ? `## Constantes SQL disponibles dans la classe\n${ctx.sqlConstants.map(c => `- ${c.name} = ${c.value}`).join("\n")}\n`
    : "";

  const entitySection = ctx.entityCode
    ? `## Entity JPA générée\n\`\`\`java\n${ctx.entityCode}\n\`\`\`\n`
    : "";

  const repoSection = ctx.repositoryCode
    ? `## Repository JPA généré\n\`\`\`java\n${ctx.repositoryCode}\n\`\`\`\n`
    : "";

  const responseDtoSection = ctx.responseDtoCode
    ? `## DTO de réponse\n\`\`\`java\n${ctx.responseDtoCode}\n\`\`\`\n`
    : "";

  return `Tu es un architecte Java expert en migration JDBC legacy → Spring Data JPA.

## Contexte
Classe source : ${ctx.sourceClassName}
Méthode : ${ctx.methodName}
Tables : ${ctx.referencedTables.join(", ") || "N/A"}
DataSources : ${ctx.dataSources.join(", ") || "default"}
Package : ${ctx.basePackage}
${ctx.repositoryName ? `Repository : ${ctx.repositoryName}` : ""}
${ctx.entityName ? `Entity : ${ctx.entityName}` : ""}

${sqlConstantsSection}
${entitySection}
${repoSection}
${responseDtoSection}

## Code JDBC legacy à migrer
\`\`\`java
${ctx.jdbcCode}
\`\`\`

## Règles de migration STRICTES
1. **Remplacer** tout le code JDBC (Connection, PreparedStatement, ResultSet) par des appels au Repository Spring Data JPA
2. **Mapper** les ResultSet.getXxx("COLUMN") vers les champs de l'Entity JPA
3. **Remplacer** les PreparedStatement.setXxx() par des paramètres de méthode Repository
4. **Supprimer** les try/catch(SQLException) — Spring gère les exceptions
5. **Supprimer** les Connection.close(), conn.setAutoCommit(), conn.commit() — Spring @Transactional gère ça
6. **Conserver** la logique métier (validations, calculs, conditions) INTACTE
7. **Conserver** les exceptions métier (SoldeInsuffisantException, TechnicalException, etc.)
8. **Utiliser** le Repository injecté (${ctx.repositoryName || "repository"}) pour les opérations CRUD
9. **Pour les SELECT** : utiliser repository.findByXxx() ou @Query JPQL
10. **Pour les INSERT** : utiliser repository.save(entity)
11. **Pour les UPDATE** : charger l'entity, modifier les champs, repository.save(entity)
12. **Pour les DELETE** : utiliser repository.deleteByXxx()
13. **Ne PAS générer** de TODO, de commentaire "à implémenter", ni de UnsupportedOperationException
14. **Le code DOIT être fonctionnel** et compilable

## Format de sortie
Génère UNIQUEMENT le code Java migré (pas de classe, pas de méthode signature, juste le corps).
Le code doit être indenté avec 8 espaces.
Commence directement avec le code, pas de commentaire introductif.

\`\`\`java
`;
}

function buildValidationPrompt(
  originalJdbc: string,
  migratedCode: string,
  ctx: JdbcMigrationContext,
): string {
  return `Tu es un reviewer Java expert. Valide cette migration JDBC → Spring Data JPA.

## Code JDBC original
\`\`\`java
${originalJdbc}
\`\`\`

## Code migré
\`\`\`java
${migratedCode}
\`\`\`

## Critères de validation
1. La logique métier est-elle préservée ? (conditions, calculs, exceptions)
2. Les opérations CRUD sont-elles correctement mappées ?
3. Le code est-il compilable ?
4. Les types sont-ils cohérents ?
5. Les exceptions métier sont-elles conservées ?

Réponds en JSON strict :
\`\`\`json
{
  "valid": true/false,
  "confidence": 0.0-1.0,
  "issues": ["issue1", "issue2"],
  "correctedCode": "code corrigé si invalid, sinon null"
}
\`\`\`
`;
}

// ═══════════════════════════════════════════════════════════════════════
// MIGRATOR
// ═══════════════════════════════════════════════════════════════════════

export class BusinessLogicMigrator {
  private adapterConfig: LLMAdapterConfig;

  constructor(ollamaUrl?: string) {
    this.adapterConfig = {
      ollamaUrl: ollamaUrl ?? "http://localhost:11434",
      timeoutMs: 90_000,
    };
  }

  /**
   * Migre un bloc JDBC legacy vers Spring Data JPA via LLM.
   * Inclut migration + validation + commentaires métier.
   */
  async migrateJdbcBlock(ctx: JdbcMigrationContext): Promise<JdbcMigrationResult> {
    const warnings: string[] = [];

    // ── Phase 1 : Migration via LLM ──
    const migrationPrompt = buildMigrationPrompt(ctx);
    let migratedCode: string | null = null;
    let backend: LLMBackend | undefined;

    try {
      const result = await llmGenerateCodeWithBackend(
        migrationPrompt,
        { temperature: 0.1, maxTokens: 2000 },
        this.adapterConfig,
      );

      if (result) {
        migratedCode = result.code;
        backend = result.backend;
      }
    } catch (e) {
      warnings.push(`LLM migration failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── Fallback si LLM indisponible ──
    if (!migratedCode) {
      return this.buildFallbackResult(ctx, warnings);
    }

    // ── Phase 2 : Validation via LLM ──
    let confidence = 0.85;
    try {
      const validationPrompt = buildValidationPrompt(ctx.jdbcCode, migratedCode, ctx);
      const validationRaw = await llmGenerateCode(
        validationPrompt,
        { temperature: 0.0, maxTokens: 1000 },
        this.adapterConfig,
      );

      if (validationRaw && typeof validationRaw === "string") {
        const jsonMatch = validationRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const validation = JSON.parse(jsonMatch[0]);
            confidence = validation.confidence ?? 0.85;
            if (!validation.valid && validation.correctedCode) {
              migratedCode = validation.correctedCode;
              warnings.push("Code corrigé par le validateur LLM");
            }
            if (validation.issues?.length > 0) {
              warnings.push(...validation.issues);
            }
          } catch {
            // JSON parse failed — keep original migration
          }
        }
      }
    } catch {
      warnings.push("Validation LLM indisponible — migration conservée sans validation");
    }

    // ── Phase 3 : Post-traitement ──
    const finalCode = migratedCode!; // Non-null garanti par le guard ci-dessus
    const processedCode = this.postProcess(finalCode, ctx);
    const additionalImports = this.extractRequiredImports(processedCode);
    const requiredInjections = this.extractRequiredInjections(processedCode, ctx);

    return {
      migratedCode: processedCode,
      additionalImports,
      requiredInjections,
      confidence,
      backend,
      warnings,
      success: true,
    };
  }

  /**
   * Migre plusieurs blocs JDBC en parallèle (pour un même Service).
   */
  async migrateMultipleBlocks(
    blocks: JdbcMigrationContext[],
  ): Promise<JdbcMigrationResult[]> {
    // Limiter la concurrence à 3 pour ne pas surcharger le LLM
    const results: JdbcMigrationResult[] = [];
    const batchSize = 3;

    for (let i = 0; i < blocks.length; i += batchSize) {
      const batch = blocks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(block => this.migrateJdbcBlock(block)),
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Post-traitement du code migré :
   * - Ajouter les commentaires métier
   * - Nettoyer les artefacts LLM
   * - Normaliser l'indentation
   */
  private postProcess(code: string, ctx: JdbcMigrationContext): string {
    let processed = code;

    // Supprimer les artefacts LLM courants
    processed = processed.replace(/```java\s*/g, "");
    processed = processed.replace(/```\s*/g, "");
    processed = processed.replace(/^\/\/ (Voici|Here is|Below is).*\n/gm, "");

    // Normaliser l'indentation à 8 espaces
    const lines = processed.split("\n");
    const normalized = lines.map(line => {
      if (line.trim() === "") return "";
      // Si la ligne n'a pas assez d'indentation, ajouter
      if (!line.startsWith("        ") && line.trim().length > 0) {
        return "        " + line.trimStart();
      }
      return line;
    });

    // Entourer de commentaires métier
    const header = [
      `        // ─── Logique métier migrée depuis ${ctx.sourceClassName}.${ctx.methodName} ───`,
      `        // Tables : ${ctx.referencedTables.join(", ") || "N/A"}`,
      `        // Migration automatique JDBC → Spring Data JPA (validée par LLM)`,
    ];

    const footer = [
      `        // ─── Fin logique métier migrée (${ctx.sourceClassName}.${ctx.methodName}) ───`,
    ];

    return [...header, ...normalized, ...footer].join("\n");
  }

  /**
   * Extrait les imports additionnels requis par le code migré.
   */
  private extractRequiredImports(code: string): string[] {
    const imports: string[] = [];

    if (code.includes("@Query")) imports.push("import org.springframework.data.jpa.repository.Query;");
    if (code.includes("@Modifying")) imports.push("import org.springframework.data.jpa.repository.Modifying;");
    if (code.includes("Optional<")) imports.push("import java.util.Optional;");
    if (code.includes("List<")) imports.push("import java.util.List;");
    if (code.includes("ArrayList<")) imports.push("import java.util.ArrayList;");
    if (code.includes("BigDecimal")) imports.push("import java.math.BigDecimal;");
    if (code.includes("LocalDateTime")) imports.push("import java.time.LocalDateTime;");
    if (code.includes("LocalDate")) imports.push("import java.time.LocalDate;");
    if (code.includes("Pageable")) imports.push("import org.springframework.data.domain.Pageable;");
    if (code.includes("Page<")) imports.push("import org.springframework.data.domain.Page;");

    return [...new Set(imports)];
  }

  /**
   * Extrait les injections de dépendances requises (Repositories).
   */
  private extractRequiredInjections(
    code: string,
    ctx: JdbcMigrationContext,
  ): Array<{ type: string; fieldName: string }> {
    const injections: Array<{ type: string; fieldName: string }> = [];

    // Détecter les noms de Repository utilisés dans le code
    const repoPattern = /(\w+Repository)\./g;
    let match: RegExpExecArray | null;
    const seen = new Set<string>();

    while ((match = repoPattern.exec(code)) !== null) {
      const repoType = match[1];
      if (!seen.has(repoType)) {
        seen.add(repoType);
        const fieldName = repoType.charAt(0).toLowerCase() + repoType.slice(1);
        injections.push({ type: repoType, fieldName });
      }
    }

    // Si aucun Repository détecté mais qu'on en a un dans le contexte
    if (injections.length === 0 && ctx.repositoryName) {
      const fieldName = ctx.repositoryName.charAt(0).toLowerCase() + ctx.repositoryName.slice(1);
      injections.push({ type: ctx.repositoryName, fieldName });
    }

    return injections;
  }

  /**
   * Fallback quand le LLM est indisponible :
   * Génère du code Spring Data JPA basique à partir des métadonnées.
   */
  private buildFallbackResult(
    ctx: JdbcMigrationContext,
    warnings: string[],
  ): JdbcMigrationResult {
    const repoField = ctx.repositoryName
      ? ctx.repositoryName.charAt(0).toLowerCase() + ctx.repositoryName.slice(1)
      : "repository";
    const entityName = ctx.entityName || "Entity";

    // Analyser le type d'opération JDBC
    const isSelect = /SELECT|FROM/i.test(ctx.jdbcCode);
    const isInsert = /INSERT/i.test(ctx.jdbcCode);
    const isUpdate = /UPDATE.*SET/i.test(ctx.jdbcCode);
    const isDelete = /DELETE/i.test(ctx.jdbcCode);

    let fallbackCode: string;

    if (isSelect && ctx.jdbcCode.includes("while (rs.next()")) {
      // SELECT multiple rows
      fallbackCode = [
        `        // ─── Logique métier migrée depuis ${ctx.sourceClassName}.${ctx.methodName} ───`,
        `        // Tables : ${ctx.referencedTables.join(", ") || "N/A"}`,
        `        // Migration automatique JDBC → Spring Data JPA (fallback règles)`,
        `        List<${entityName}> entities = ${repoField}.findAll();`,
        `        // TODO [FALLBACK]: Affiner la requête findAll() avec les critères WHERE du SQL original`,
        `        // SQL original : voir constantes SQL de la classe`,
        `        // ─── Fin logique métier migrée (${ctx.sourceClassName}.${ctx.methodName}) ───`,
      ].join("\n");
    } else if (isSelect) {
      // SELECT single row
      fallbackCode = [
        `        // ─── Logique métier migrée depuis ${ctx.sourceClassName}.${ctx.methodName} ───`,
        `        // Tables : ${ctx.referencedTables.join(", ") || "N/A"}`,
        `        // Migration automatique JDBC → Spring Data JPA (fallback règles)`,
        `        Optional<${entityName}> entityOpt = ${repoField}.findById(id);`,
        `        ${entityName} entity = entityOpt.orElseThrow(() ->`,
        `            new TechnicalException("NOT_FOUND", "${entityName} non trouvé"));`,
        `        // ─── Fin logique métier migrée (${ctx.sourceClassName}.${ctx.methodName}) ───`,
      ].join("\n");
    } else if (isInsert) {
      fallbackCode = [
        `        // ─── Logique métier migrée depuis ${ctx.sourceClassName}.${ctx.methodName} ───`,
        `        // Tables : ${ctx.referencedTables.join(", ") || "N/A"}`,
        `        // Migration automatique JDBC → Spring Data JPA (fallback règles)`,
        `        ${entityName} entity = new ${entityName}();`,
        `        // Mapper les champs depuis le request DTO`,
        `        ${repoField}.save(entity);`,
        `        // ─── Fin logique métier migrée (${ctx.sourceClassName}.${ctx.methodName}) ───`,
      ].join("\n");
    } else if (isUpdate) {
      fallbackCode = [
        `        // ─── Logique métier migrée depuis ${ctx.sourceClassName}.${ctx.methodName} ───`,
        `        // Tables : ${ctx.referencedTables.join(", ") || "N/A"}`,
        `        // Migration automatique JDBC → Spring Data JPA (fallback règles)`,
        `        ${entityName} entity = ${repoField}.findById(id)`,
        `            .orElseThrow(() -> new TechnicalException("NOT_FOUND", "${entityName} non trouvé"));`,
        `        // Mettre à jour les champs de l'entity`,
        `        ${repoField}.save(entity);`,
        `        // ─── Fin logique métier migrée (${ctx.sourceClassName}.${ctx.methodName}) ───`,
      ].join("\n");
    } else if (isDelete) {
      fallbackCode = [
        `        // ─── Logique métier migrée depuis ${ctx.sourceClassName}.${ctx.methodName} ───`,
        `        // Tables : ${ctx.referencedTables.join(", ") || "N/A"}`,
        `        // Migration automatique JDBC → Spring Data JPA (fallback règles)`,
        `        ${repoField}.deleteById(id);`,
        `        // ─── Fin logique métier migrée (${ctx.sourceClassName}.${ctx.methodName}) ───`,
      ].join("\n");
    } else {
      fallbackCode = [
        `        // ─── Logique métier migrée depuis ${ctx.sourceClassName}.${ctx.methodName} ───`,
        `        // Tables : ${ctx.referencedTables.join(", ") || "N/A"}`,
        `        // Migration automatique JDBC → Spring Data JPA (fallback règles)`,
        `        log.info("${ctx.methodName} — opération migrée depuis JDBC");`,
        `        // Utiliser ${repoField} pour les opérations CRUD`,
        `        // ─── Fin logique métier migrée (${ctx.sourceClassName}.${ctx.methodName}) ───`,
      ].join("\n");
    }

    const requiredInjections = ctx.repositoryName
      ? [{ type: ctx.repositoryName, fieldName: repoField }]
      : [];

    return {
      migratedCode: fallbackCode,
      additionalImports: ["import java.util.Optional;", "import java.util.List;"],
      requiredInjections,
      confidence: 0.4,
      warnings: [...warnings, "LLM indisponible — migration fallback basée sur les règles"],
      success: false,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extrait un bloc JDBC complet depuis le code source.
 * Détecte les patterns : try (Connection conn = ...) { ... }
 */
export function extractJdbcBlocks(code: string): string[] {
  const blocks: string[] = [];
  const lines = code.split("\n");
  let inBlock = false;
  let braceDepth = 0;
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (!inBlock && (
      line.includes("getConnection()") ||
      (line.includes("PreparedStatement") && line.includes("prepareStatement"))
    )) {
      inBlock = true;
      braceDepth = 0;
      currentBlock = [];
    }

    if (inBlock) {
      currentBlock.push(line);
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      // Fin du bloc quand on revient à 0 ou en dessous
      if (braceDepth <= 0 && currentBlock.length > 1) {
        blocks.push(currentBlock.join("\n"));
        inBlock = false;
        currentBlock = [];
      }
    }
  }

  // Si on est encore dans un bloc (pas fermé), l'ajouter quand même
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join("\n"));
  }

  return blocks;
}

/**
 * Extrait les tables référencées dans un bloc de code SQL/JDBC.
 */
export function extractReferencedTables(code: string): string[] {
  const tables = new Set<string>();
  const regex = /(?:FROM|INTO|UPDATE|JOIN|DELETE\s+FROM)\s+([A-Z_][A-Z0-9_]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(code)) !== null) {
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

/**
 * Extrait les DataSources référencées dans un bloc de code.
 */
export function extractDataSources(code: string): string[] {
  const ds = new Set<string>();
  const regex = /(\w+DS|dataSource\w*)\s*\.\s*getConnection/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(code)) !== null) {
    ds.add(m[1]);
  }
  return [...ds];
}
