/**
 * Saga ML Validator — Compleo v7.10
 *
 * Validation anti-hallucination des sorties ML pour les steps Saga.
 * 6 vérifications systématiques :
 *   1. Services utilisés existent dans availableServices
 *   2. Pas de JDBC direct (Connection, PreparedStatement, ResultSet)
 *   3. Compensation non vide pour steps compensables
 *   4. Types Java valides
 *   5. Pas de classes inventées
 *   6. Compensation idempotente (pas d'INSERT sauf contre-passation)
 *
 * @author Compleo
 */

import type { StepContext, MLStepEnrichment } from "./prompts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SagaMLValidation {
  /** La sortie ML est-elle valide ? */
  isValid: boolean;
  /** Liste des problèmes détectés */
  issues: SagaMLIssue[];
  /** Sortie nettoyée (corrections appliquées) */
  cleanedOutput: MLStepEnrichment;
}

export interface SagaMLIssue {
  /** Type du problème */
  type:
    | "unknown-service"
    | "jdbc-direct"
    | "empty-compensation"
    | "invalid-java-type"
    | "invented-class"
    | "non-idempotent-compensation";
  /** Description du problème */
  message: string;
  /** Sévérité (error = rejet, warning = correction) */
  severity: "error" | "warning";
}

// ── Blacklists ──────────────────────────────────────────────────────────────

const JDBC_PATTERNS = [
  /\bConnection\b/,
  /\bPreparedStatement\b/,
  /\bResultSet\b/,
  /\bDriverManager\b/,
  /\bStatement\b(?!\.)/,
  /\bCallableStatement\b/,
  /\bjava\.sql\./,
  /\bgetConnection\s*\(/,
  /\bprepareStatement\s*\(/,
  /\bexecuteQuery\s*\(/,
  /\bexecuteUpdate\s*\(/,
];

const INVENTED_CLASSES = new Set([
  "UserService", "OrderService", "ProductService", "CustomerService",
  "UserController", "OrderController", "ProductController",
  "UserRepository", "OrderRepository", "ProductRepository",
  "UserEntity", "OrderEntity", "ProductEntity",
  "UserDTO", "OrderDTO", "ProductDTO",
  "ShoppingCartService", "PaymentGateway", "NotificationManager",
  "EmailService", "SmsService", "PushNotificationService",
  "CacheManager", "RedisService", "MongoService",
]);

const VALID_JAVA_TYPES = new Set([
  "String", "Integer", "Long", "Double", "Float", "Boolean",
  "BigDecimal", "BigInteger", "LocalDate", "LocalDateTime",
  "Date", "Timestamp", "UUID", "byte[]",
  "List", "Map", "Set", "Optional",
  "void", "Object", "int", "long", "double", "float", "boolean",
]);

// ── API publique ────────────────────────────────────────────────────────────

/**
 * Valide la sortie ML d'un enrichissement de step Saga.
 * Applique les 6 vérifications anti-hallucination et retourne
 * une version nettoyée si possible.
 */
export function validateSagaMLOutput(
  output: MLStepEnrichment,
  ctx: StepContext,
): SagaMLValidation {
  const issues: SagaMLIssue[] = [];
  const cleaned = structuredClone(output);

  // ── Check 1 : Services utilisés existent dans availableServices ──────
  checkUnknownServices(cleaned.stepBody, ctx.availableServices, issues);
  checkUnknownServices(cleaned.compensationBody, ctx.availableServices, issues);

  // ── Check 2 : Pas de JDBC direct ────────────────────────────────────
  checkJdbcDirect(cleaned.stepBody, "stepBody", issues);
  checkJdbcDirect(cleaned.compensationBody, "compensationBody", issues);

  // ── Check 3 : Compensation non vide pour steps compensables ─────────
  if (ctx.isCompensable) {
    checkEmptyCompensation(cleaned.compensationBody, issues);
  }

  // ── Check 4 : Types Java valides ────────────────────────────────────
  checkJavaTypes(cleaned.contextFields, ctx, issues);

  // ── Check 5 : Pas de classes inventées ──────────────────────────────
  checkInventedClasses(cleaned.stepBody, issues);
  checkInventedClasses(cleaned.compensationBody, issues);

  // ── Check 6 : Compensation idempotente ──────────────────────────────
  if (ctx.isCompensable) {
    checkCompensationIdempotent(cleaned.compensationBody, issues);
  }

  // ── Nettoyage automatique ───────────────────────────────────────────
  cleaned.stepBody = cleanJdbcReferences(cleaned.stepBody);
  cleaned.compensationBody = cleanJdbcReferences(cleaned.compensationBody);

  const hasErrors = issues.some((i) => i.severity === "error");

  return {
    isValid: !hasErrors,
    issues,
    cleanedOutput: cleaned,
  };
}

// ── Vérifications individuelles ─────────────────────────────────────────────

/**
 * Check 1 : Vérifie que les services appelés dans le code existent
 * dans la liste des services disponibles.
 */
function checkUnknownServices(
  code: string,
  availableServices: string[],
  issues: SagaMLIssue[],
): void {
  if (!code || availableServices.length === 0) return;

  // Extraire les appels de service : xxx.method(
  const serviceCallPattern = /(\w+Service|\w+Repository|\w+Dao)\.\w+\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = serviceCallPattern.exec(code)) !== null) {
    const serviceName = match[1];
    // Vérifier si le service existe (insensible à la casse)
    const exists = availableServices.some(
      (s) => s.toLowerCase() === serviceName.toLowerCase()
        || s.toLowerCase().includes(serviceName.toLowerCase())
        || serviceName.toLowerCase().includes(s.toLowerCase()),
    );

    if (!exists) {
      // Vérifier que ce n'est pas un service standard Spring
      if (!isStandardSpringService(serviceName)) {
        issues.push({
          type: "unknown-service",
          message: `Service inconnu "${serviceName}" — non trouvé dans les services disponibles`,
          severity: "warning",
        });
      }
    }
  }
}

/**
 * Check 2 : Vérifie l'absence de JDBC direct dans le code.
 */
function checkJdbcDirect(
  code: string,
  field: string,
  issues: SagaMLIssue[],
): void {
  if (!code) return;

  for (const pattern of JDBC_PATTERNS) {
    if (pattern.test(code)) {
      issues.push({
        type: "jdbc-direct",
        message: `JDBC direct détecté dans ${field} : ${pattern.source}`,
        severity: "error",
      });
    }
  }
}

/**
 * Check 3 : Vérifie que la compensation n'est pas vide pour un step compensable.
 */
function checkEmptyCompensation(
  compensationBody: string,
  issues: SagaMLIssue[],
): void {
  if (!compensationBody || compensationBody.trim().length === 0) {
    issues.push({
      type: "empty-compensation",
      message: "Compensation vide pour un step compensable",
      severity: "error",
    });
    return;
  }

  // Vérifier que ce n'est pas juste un TODO
  if (/^\s*\/\/\s*(TODO|FIXME|à implémenter)/i.test(compensationBody.trim())) {
    issues.push({
      type: "empty-compensation",
      message: "Compensation contient uniquement un TODO — action inverse concrète requise",
      severity: "error",
    });
  }
}

/**
 * Check 4 : Vérifie que les types Java dans les contextFields sont valides.
 */
function checkJavaTypes(
  contextFields: Array<{ name: string; type: string }>,
  ctx: StepContext,
  issues: SagaMLIssue[],
): void {
  for (const field of contextFields) {
    const baseType = field.type.replace(/<.*>/, "").trim();

    if (!VALID_JAVA_TYPES.has(baseType) && !isKnownDtoType(baseType, ctx)) {
      issues.push({
        type: "invalid-java-type",
        message: `Type Java inconnu "${field.type}" pour le champ "${field.name}"`,
        severity: "warning",
      });
    }
  }
}

/**
 * Check 5 : Vérifie l'absence de classes inventées (hallucinations courantes).
 */
function checkInventedClasses(
  code: string,
  issues: SagaMLIssue[],
): void {
  if (!code) return;

  for (const invented of INVENTED_CLASSES) {
    if (code.includes(invented)) {
      issues.push({
        type: "invented-class",
        message: `Classe inventée détectée : "${invented}"`,
        severity: "error",
      });
    }
  }
}

/**
 * Check 6 : Vérifie que la compensation est idempotente.
 * Pas d'INSERT (sauf contre-passation comptable).
 */
function checkCompensationIdempotent(
  compensationBody: string,
  issues: SagaMLIssue[],
): void {
  if (!compensationBody) return;

  // Chercher des INSERT dans la compensation
  const insertPattern = /\bINSERT\s+INTO\b/i;
  if (insertPattern.test(compensationBody)) {
    // Tolérer les contre-passations comptables
    if (!/contre.?pass|reversal|annulation.*écriture|écriture.*annulation/i.test(compensationBody)) {
      issues.push({
        type: "non-idempotent-compensation",
        message: "INSERT détecté dans la compensation — non idempotent (sauf contre-passation)",
        severity: "warning",
      });
    }
  }

  // Chercher des .save() ou .create() dans la compensation
  if (/\.save\s*\(|\.create\s*\(|\.insert\s*\(/i.test(compensationBody)) {
    if (!/contre.?pass|reversal|annulation/i.test(compensationBody)) {
      issues.push({
        type: "non-idempotent-compensation",
        message: "Opération de création détectée dans la compensation — vérifier l'idempotence",
        severity: "warning",
      });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isStandardSpringService(name: string): boolean {
  const standards = new Set([
    "log", "logger", "transactionManager", "entityManager",
    "jdbcTemplate", "namedParameterJdbcTemplate",
    "applicationEventPublisher", "messageSource",
  ]);
  return standards.has(name) || standards.has(name.toLowerCase());
}

function isKnownDtoType(type: string, ctx: StepContext): boolean {
  // Accepter les types qui se terminent par DTO, VO, Entity, Response, Request
  if (/(?:DTO|VO|Entity|Response|Request|Result|Info|Detail)$/.test(type)) {
    return true;
  }
  // Accepter les types mentionnés dans le code EJB source
  if (ctx.ejbSourceCode.includes(type)) {
    return true;
  }
  return false;
}

/**
 * Nettoie les références JDBC directes dans le code.
 * Remplace par des commentaires TODO.
 */
function cleanJdbcReferences(code: string): string {
  if (!code) return code;

  let cleaned = code;

  // Remplacer les blocs JDBC par des commentaires
  cleaned = cleaned.replace(
    /Connection\s+\w+\s*=\s*[^;]+;/g,
    "// TODO: remplacer JDBC par Spring Data JPA",
  );
  cleaned = cleaned.replace(
    /PreparedStatement\s+\w+\s*=\s*[^;]+;/g,
    "// TODO: remplacer PreparedStatement par repository",
  );
  cleaned = cleaned.replace(
    /ResultSet\s+\w+\s*=\s*[^;]+;/g,
    "// TODO: remplacer ResultSet par entity mapping",
  );

  return cleaned;
}
