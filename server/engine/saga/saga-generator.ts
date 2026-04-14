/**
 * Saga Generator — Compleo v7.9
 *
 * Génère les fichiers Java Spring Boot pour chaque Saga détectée :
 *   - {Domain}SagaOrchestrator.java  (orchestrateur @Service)
 *   - {Domain}SagaState.java         (enum des états)
 *   - {Domain}SagaContext.java        (POJO partagé entre steps)
 *   - {Domain}SagaLog.java            (JPA entity audit)
 *   - V3__create_saga_log.sql         (migration Flyway)
 *
 * @author Hamza NORDINE
 */

import type { SagaCandidate } from "./saga-detector";
import type { SagaStep, IntermediateResult } from "./saga-step-extractor";
import { extractSagaSteps, extractIntermediateResults } from "./saga-step-extractor";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SagaGeneratedFile {
  path: string;
  content: string;
  category: "saga-orchestrator" | "saga-state" | "saga-context" | "saga-log" | "saga-migration";
}

export interface SagaGenerationResult {
  /** Nom du domaine (ex: virement-sepa) */
  domain: string;
  /** Classe source EJB */
  sourceClass: string;
  /** Steps extraits */
  steps: SagaStep[];
  /** Résultats intermédiaires */
  intermediateResults: IntermediateResult[];
  /** Fichiers générés */
  files: SagaGeneratedFile[];
  /** Statistiques */
  stats: {
    totalSteps: number;
    compensableSteps: number;
    asyncSteps: number;
    criticalSteps: number;
  };
}

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Génère tous les fichiers Saga pour un candidat détecté.
 */
export function generateSaga(
  candidate: SagaCandidate,
  basePackage: string,
): SagaGenerationResult {
  const steps = extractSagaSteps(
    candidate.rawSource,
    "execute",
    candidate.ejbDependencies,
  );

  const intermediateResults = extractIntermediateResults(
    candidate.rawSource,
    steps,
  );

  const domain = candidate.domain;
  const domainPascal = toPascalCase(domain);
  const packagePath = basePackage.replace(/\./g, "/");

  const files: SagaGeneratedFile[] = [];

  // 1. State enum
  files.push({
    path: `src/main/java/${packagePath}/saga/${domainPascal}SagaState.java`,
    content: generateStateEnum(domainPascal, steps, basePackage),
    category: "saga-state",
  });

  // 2. Context POJO
  files.push({
    path: `src/main/java/${packagePath}/saga/${domainPascal}SagaContext.java`,
    content: generateContext(domainPascal, intermediateResults, basePackage),
    category: "saga-context",
  });

  // 3. Log entity
  files.push({
    path: `src/main/java/${packagePath}/saga/${domainPascal}SagaLog.java`,
    content: generateLogEntity(domainPascal, basePackage),
    category: "saga-log",
  });

  // 4. Orchestrator
  files.push({
    path: `src/main/java/${packagePath}/saga/${domainPascal}SagaOrchestrator.java`,
    content: generateOrchestrator(domainPascal, steps, intermediateResults, candidate, basePackage),
    category: "saga-orchestrator",
  });

  // 5. SQL migration
  files.push({
    path: `src/main/resources/db/migration/V3__create_saga_log.sql`,
    content: generateSqlMigration(domainPascal),
    category: "saga-migration",
  });

  const compensableSteps = steps.filter((s) => s.isCompensable);
  const asyncSteps = steps.filter((s) => s.isAsync);
  const criticalSteps = steps.filter((s) => s.isCritical);

  return {
    domain,
    sourceClass: candidate.className,
    steps,
    intermediateResults,
    files,
    stats: {
      totalSteps: steps.length,
      compensableSteps: compensableSteps.length,
      asyncSteps: asyncSteps.length,
      criticalSteps: criticalSteps.length,
    },
  };
}

/**
 * Génère les Sagas pour tous les candidats détectés.
 */
export function generateAllSagas(
  candidates: SagaCandidate[],
  basePackage: string,
): SagaGenerationResult[] {
  return candidates.map((c) => generateSaga(c, basePackage));
}

// ── Générateurs Java ─────────────────────────────────────────────────────────

function generateStateEnum(
  domainPascal: string,
  steps: SagaStep[],
  basePackage: string,
): string {
  const states = [
    "INITIATED",
    ...steps.map((s) => `STEP_${s.order}_${toConstCase(s.name)}`),
    "COMPLETED",
    "COMPENSATING",
    "FAILED",
  ];

  return `package ${basePackage}.saga;

/**
 * États de la Saga ${domainPascal}.
 * Chaque état correspond à un step du flux orchestré.
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
public enum ${domainPascal}SagaState {
${states.map((s, i) => `    ${s}${i < states.length - 1 ? "," : ";"}`).join("\n")}

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED;
    }

    public boolean isCompensating() {
        return this == COMPENSATING;
    }
}
`;
}

function generateContext(
  domainPascal: string,
  results: IntermediateResult[],
  basePackage: string,
): string {
  const fields = results.map((r) => `    private ${r.type} ${r.fieldName};`);
  const gettersSetters = results.map((r) => {
    const cap = r.fieldName.charAt(0).toUpperCase() + r.fieldName.slice(1);
    return `
    public ${r.type} get${cap}() {
        return ${r.fieldName};
    }

    public void set${cap}(${r.type} ${r.fieldName}) {
        this.${r.fieldName} = ${r.fieldName};
    }`;
  });

  return `package ${basePackage}.saga;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Contexte partagé entre les steps de la Saga ${domainPascal}.
 * Contient les résultats intermédiaires produits par chaque step.
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
public class ${domainPascal}SagaContext implements Serializable {

    private static final long serialVersionUID = 1L;

    /** Identifiant unique de l'exécution Saga */
    private String sagaId;

    /** Timestamp de début */
    private LocalDateTime startedAt;

    /** Timestamp de fin */
    private LocalDateTime completedAt;

    /** État courant */
    private ${domainPascal}SagaState currentState;

    /** Motif d'erreur (si échec) */
    private String errorReason;

${fields.join("\n")}

    // ── Constructeur ─────────────────────────────────────────────────────

    public ${domainPascal}SagaContext() {
        this.sagaId = java.util.UUID.randomUUID().toString();
        this.startedAt = LocalDateTime.now();
        this.currentState = ${domainPascal}SagaState.INITIATED;
    }

    // ── Getters / Setters ────────────────────────────────────────────────

    public String getSagaId() { return sagaId; }
    public void setSagaId(String sagaId) { this.sagaId = sagaId; }

    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }

    public ${domainPascal}SagaState getCurrentState() { return currentState; }
    public void setCurrentState(${domainPascal}SagaState currentState) { this.currentState = currentState; }

    public String getErrorReason() { return errorReason; }
    public void setErrorReason(String errorReason) { this.errorReason = errorReason; }
${gettersSetters.join("\n")}
}
`;
}

function generateLogEntity(
  domainPascal: string,
  basePackage: string,
): string {
  return `package ${basePackage}.saga;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Entité JPA pour l'audit des exécutions Saga ${domainPascal}.
 * Chaque ligne = 1 transition d'état dans la Saga.
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
@Entity
@Table(name = "T_SAGA_LOG")
public class ${domainPascal}SagaLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Identifiant unique de l'exécution Saga */
    @Column(name = "SAGA_ID", nullable = false, length = 64)
    private String sagaId;

    /** Nom de la Saga (ex: virement-sepa) */
    @Column(name = "SAGA_NAME", nullable = false, length = 128)
    private String sagaName;

    /** Nom du step (ex: validation-iban) */
    @Column(name = "STEP_NAME", nullable = false, length = 128)
    private String stepName;

    /** Numéro d'ordre du step */
    @Column(name = "STEP_ORDER")
    private Integer stepOrder;

    /** État avant la transition */
    @Column(name = "STATE_FROM", length = 64)
    private String stateFrom;

    /** État après la transition */
    @Column(name = "STATE_TO", nullable = false, length = 64)
    private String stateTo;

    /** Statut du step : SUCCESS, FAILED, COMPENSATED */
    @Column(name = "STATUS", nullable = false, length = 32)
    private String status;

    /** Durée d'exécution du step (ms) */
    @Column(name = "DURATION_MS")
    private Long durationMs;

    /** Message d'erreur (si échec) */
    @Column(name = "ERROR_MESSAGE", length = 2000)
    private String errorMessage;

    /** Payload JSON sérialisé (contexte au moment du step) */
    @Column(name = "PAYLOAD", columnDefinition = "TEXT")
    private String payload;

    /** Timestamp de la transition */
    @Column(name = "CREATED_AT", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    // ── Getters / Setters ────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getSagaId() { return sagaId; }
    public void setSagaId(String sagaId) { this.sagaId = sagaId; }

    public String getSagaName() { return sagaName; }
    public void setSagaName(String sagaName) { this.sagaName = sagaName; }

    public String getStepName() { return stepName; }
    public void setStepName(String stepName) { this.stepName = stepName; }

    public Integer getStepOrder() { return stepOrder; }
    public void setStepOrder(Integer stepOrder) { this.stepOrder = stepOrder; }

    public String getStateFrom() { return stateFrom; }
    public void setStateFrom(String stateFrom) { this.stateFrom = stateFrom; }

    public String getStateTo() { return stateTo; }
    public void setStateTo(String stateTo) { this.stateTo = stateTo; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public String getPayload() { return payload; }
    public void setPayload(String payload) { this.payload = payload; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
`;
}

function generateOrchestrator(
  domainPascal: string,
  steps: SagaStep[],
  _results: IntermediateResult[],
  candidate: SagaCandidate,
  basePackage: string,
): string {
  const compensableSteps = steps.filter((s) => s.isCompensable).reverse();
  const injections = buildInjections(steps, candidate);
  const stepMethods = steps.map((s) => buildStepMethod(s, domainPascal));
  const compensationMethods = compensableSteps.map((s) =>
    buildCompensationMethod(s, domainPascal),
  );
  const executeSteps = steps.map((s) => buildExecuteStep(s, domainPascal));
  const compensateSteps = compensableSteps.map((s) =>
    buildCompensateCall(s, domainPascal),
  );

  return `package ${basePackage}.saga;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
${injections.imports.join("\n")}

/**
 * Orchestrateur Saga pour le domaine ${domainPascal}.
 * Coordonne ${steps.length} steps séquentiels avec compensation LIFO en cas d'échec.
 *
 * Source EJB : ${candidate.className}
 * Steps compensables : ${compensableSteps.length}
 * Steps asynchrones : ${steps.filter((s) => s.isAsync).length}
 *
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
@Service
public class ${domainPascal}SagaOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(${domainPascal}SagaOrchestrator.class);

${injections.fields.join("\n")}

    // ── Constructeur (injection par constructeur) ────────────────────────

    public ${domainPascal}SagaOrchestrator(
${injections.constructorParams.join(",\n")}
    ) {
${injections.constructorAssignments.join("\n")}
    }

    // ── Point d'entrée ───────────────────────────────────────────────────

    /**
     * Exécute la Saga complète.
     * En cas d'échec à un step, déclenche la compensation LIFO
     * de tous les steps compensables déjà exécutés.
     */
    @Transactional
    public ${domainPascal}SagaContext execute(${candidate.inputType} input) {
        ${domainPascal}SagaContext ctx = new ${domainPascal}SagaContext();
        log.info("[SAGA:{}] Démarrage saga {} — sagaId={}", "${domainPascal}", "${domainPascal}", ctx.getSagaId());

        int lastCompletedStep = 0;

        try {
${executeSteps.join("\n\n")}

            // ── Saga terminée avec succès ────────────────────────────────
            ctx.setCurrentState(${domainPascal}SagaState.COMPLETED);
            ctx.setCompletedAt(java.time.LocalDateTime.now());
            logTransition(ctx, "COMPLETED", "SUCCESS", null);
            log.info("[SAGA:{}] Saga terminée avec succès — sagaId={}", "${domainPascal}", ctx.getSagaId());

        } catch (Exception ex) {
            log.error("[SAGA:{}] Échec au step {} — sagaId={} — {}", "${domainPascal}", lastCompletedStep + 1, ctx.getSagaId(), ex.getMessage());
            ctx.setErrorReason(ex.getMessage());
            ctx.setCurrentState(${domainPascal}SagaState.COMPENSATING);

            // ── Compensation LIFO ────────────────────────────────────────
            compensate(ctx, lastCompletedStep);

            ctx.setCurrentState(${domainPascal}SagaState.FAILED);
            ctx.setCompletedAt(java.time.LocalDateTime.now());
            logTransition(ctx, "FAILED", "FAILED", ex.getMessage());
        }

        return ctx;
    }

    // ── Compensation LIFO ────────────────────────────────────────────────

    private void compensate(${domainPascal}SagaContext ctx, int lastCompletedStep) {
        log.warn("[SAGA:{}] Démarrage compensation LIFO depuis step {} — sagaId={}", "${domainPascal}", lastCompletedStep, ctx.getSagaId());
${compensateSteps.join("\n\n")}
    }

    // ── Steps ────────────────────────────────────────────────────────────

${stepMethods.join("\n\n")}

    // ── Compensations ────────────────────────────────────────────────────

${compensationMethods.join("\n\n")}

    // ── Audit ────────────────────────────────────────────────────────────

    private void logTransition(${domainPascal}SagaContext ctx, String stateTo, String status, String error) {
        // TODO: Persister via SagaLogRepository
        log.debug("[SAGA:{}] {} → {} [{}] {}", "${domainPascal}", ctx.getCurrentState(), stateTo, status, error != null ? error : "");
    }
}
`;
}

function generateSqlMigration(domainPascal: string): string {
  return `-- Flyway migration: Table d'audit Saga
-- Générée automatiquement par Compleo — Saga ${domainPascal}

CREATE TABLE IF NOT EXISTS T_SAGA_LOG (
    ID              BIGINT AUTO_INCREMENT PRIMARY KEY,
    SAGA_ID         VARCHAR(64)   NOT NULL,
    SAGA_NAME       VARCHAR(128)  NOT NULL,
    STEP_NAME       VARCHAR(128)  NOT NULL,
    STEP_ORDER      INT,
    STATE_FROM      VARCHAR(64),
    STATE_TO        VARCHAR(64)   NOT NULL,
    STATUS          VARCHAR(32)   NOT NULL,
    DURATION_MS     BIGINT,
    ERROR_MESSAGE   VARCHAR(2000),
    PAYLOAD         TEXT,
    CREATED_AT      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX IDX_SAGA_LOG_SAGA_ID (SAGA_ID),
    INDEX IDX_SAGA_LOG_SAGA_NAME (SAGA_NAME),
    INDEX IDX_SAGA_LOG_STATUS (STATUS),
    INDEX IDX_SAGA_LOG_CREATED_AT (CREATED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Commentaire: Cette table stocke l'historique de toutes les transitions
-- d'état des Sagas. Chaque ligne = 1 step exécuté ou compensé.
-- Utilisée pour l'audit, le monitoring et le replay des Sagas.
`;
}

// ── Builders pour l'Orchestrator ─────────────────────────────────────────────

function buildInjections(
  steps: SagaStep[],
  candidate: SagaCandidate,
): {
  imports: string[];
  fields: string[];
  constructorParams: string[];
  constructorAssignments: string[];
} {
  const imports: string[] = [];
  const fields: string[] = [];
  const constructorParams: string[] = [];
  const constructorAssignments: string[] = [];

  // Collecter les services uniques depuis les dépendances
  const seen = new Set<string>();
  for (const dep of candidate.ejbDependencies) {
    if (dep.isInterService && !seen.has(dep.type)) {
      seen.add(dep.type);
      const fieldName = dep.name || lcFirst(dep.type.replace(/EJB(?:Local|Remote)?$/, ""));
      const typeName = dep.type.replace(/EJB(?:Local|Remote)?$/, "Service");

      fields.push(`    private final ${typeName} ${fieldName};`);
      constructorParams.push(`            ${typeName} ${fieldName}`);
      constructorAssignments.push(`        this.${fieldName} = ${fieldName};`);
    }
  }

  return { imports, fields, constructorParams, constructorAssignments };
}

function buildStepMethod(step: SagaStep, domainPascal: string): string {
  const methodName = `step${step.order}${toPascalCase(step.name)}`;
  const asyncTag = step.isAsync ? " [ASYNC]" : "";
  const criticalTag = step.isCritical ? " [CRITICAL]" : "";

  return `    /**
     * Step ${step.order}: ${step.label}${asyncTag}${criticalTag}
     * Type: ${step.type} | Compensable: ${step.isCompensable}
     * ${step.sourceComment}
     */
    private void ${methodName}(${domainPascal}SagaContext ctx) {
        log.info("[SAGA:${domainPascal}] Step ${step.order} — ${step.label}");
        long start = System.currentTimeMillis();
        try {
            // TODO: Implémenter l'appel au service ${step.targetService || "local"}
            // ${step.targetMethod}(ctx);
            logTransition(ctx, "${domainPascal}SagaState.STEP_${step.order}_${toConstCase(step.name)}", "SUCCESS", null);
        } catch (Exception ex) {
            logTransition(ctx, "${domainPascal}SagaState.STEP_${step.order}_${toConstCase(step.name)}", "FAILED", ex.getMessage());
            throw ex;
        } finally {
            log.debug("[SAGA:${domainPascal}] Step ${step.order} durée={}ms", System.currentTimeMillis() - start);
        }
    }`;
}

function buildCompensationMethod(step: SagaStep, domainPascal: string): string {
  const methodName = `compensateStep${step.order}${toPascalCase(step.name)}`;
  const comp = step.compensation;

  return `    /**
     * Compensation Step ${step.order}: ${step.label}
     * ${comp?.description || "Compensation générique"}
     * ${comp?.sqlHint ? `SQL: ${comp.sqlHint}` : ""}
     */
    private void ${methodName}(${domainPascal}SagaContext ctx) {
        try {
            log.warn("[SAGA:${domainPascal}] Compensation step ${step.order} — ${comp?.method || step.name}");
            // TODO: Implémenter la compensation
            // ${comp?.method || "compensate"}(ctx);
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);
        } catch (Exception ex) {
            log.error("[SAGA:${domainPascal}] Échec compensation step ${step.order} — {}", ex.getMessage());
            logTransition(ctx, "COMPENSATING", "COMPENSATION_FAILED", ex.getMessage());
            // La compensation continue malgré l'échec (best effort)
        }
    }`;
}

function buildExecuteStep(step: SagaStep, domainPascal: string): string {
  const methodName = `step${step.order}${toPascalCase(step.name)}`;
  const stateConst = `${domainPascal}SagaState.STEP_${step.order}_${toConstCase(step.name)}`;

  return `            // Step ${step.order}: ${step.label}
            ctx.setCurrentState(${stateConst});
            ${methodName}(ctx);
            lastCompletedStep = ${step.order};`;
}

function buildCompensateCall(step: SagaStep, domainPascal: string): string {
  const methodName = `compensateStep${step.order}${toPascalCase(step.name)}`;

  return `        if (lastCompletedStep >= ${step.order}) {
            ${methodName}(ctx);
        }`;
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

function toPascalCase(s: string): string {
  return s
    .replace(/[^a-zA-ZÀ-ÿ0-9]+/g, " ")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toConstCase(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase()
    .replace(/^_|_$/g, "")
    .replace(/_{2,}/g, "_");
}

function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
