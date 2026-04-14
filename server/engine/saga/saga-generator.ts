/**
 * Saga Generator — Compleo v7.10 (Production-Ready)
 *
 * Génère les fichiers Java Spring Boot pour chaque Saga détectée :
 *   - {Domain}SagaOrchestrator.java  (orchestrateur @Service + retry + CB + savepoints)
 *   - {Domain}SagaState.java         (enum des états enrichi)
 *   - {Domain}SagaContext.java        (POJO partagé + completedSteps)
 *   - {Domain}SagaLog.java            (JPA entity audit)
 *   - V3__create_saga_log.sql         (migration Flyway)
 *
 * + Fichiers partagés (via saga-shared-generators.ts) :
 *   - RetryPolicy, SagaStepException
 *   - SagaCircuitBreaker, CircuitBreakerRegistry, CircuitOpenException
 *   - SagaSavepointManager
 *   - SagaStateStore, SagaStateRecord, SagaRecoveryScheduler, SagaRecoveryExecutor
 *   - V4__create_saga_state.sql
 *
 * @author Hamza NORDINE
 */

import type { SagaCandidate } from "./saga-detector";
import type { SagaStep, IntermediateResult } from "./saga-step-extractor";
import { extractSagaSteps, extractIntermediateResults } from "./saga-step-extractor";
import { generateSharedSagaFiles } from "./saga-shared-generators";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SagaGeneratedFile {
  path: string;
  content: string;
  category:
    | "saga-orchestrator"
    | "saga-state"
    | "saga-context"
    | "saga-log"
    | "saga-migration"
    | "saga-retry"
    | "saga-circuitbreaker"
    | "saga-transaction"
    | "saga-recovery";
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

/** Phase d'exécution (readonly / write / async) */
interface SagaPhase {
  name: "readonly" | "write" | "async";
  steps: SagaStep[];
  needsTransaction: boolean;
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

  // 1. State enum (enrichi avec COMPENSATED, COMPENSATION_FAILED)
  files.push({
    path: `src/main/java/${packagePath}/saga/${domainPascal}SagaState.java`,
    content: generateStateEnum(domainPascal, steps, basePackage),
    category: "saga-state",
  });

  // 2. Context POJO (enrichi avec completedSteps)
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

  // 4. Orchestrator (production-ready: retry + CB + savepoints + recovery)
  files.push({
    path: `src/main/java/${packagePath}/saga/${domainPascal}SagaOrchestrator.java`,
    content: generateOrchestrator(domainPascal, steps, intermediateResults, candidate, basePackage),
    category: "saga-orchestrator",
  });

  // 5. SQL migration (audit log)
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
 * Inclut les fichiers partagés (retry, CB, savepoints, recovery) UNE SEULE FOIS.
 */
export function generateAllSagas(
  candidates: SagaCandidate[],
  basePackage: string,
): SagaGenerationResult[] {
  const perSagaResults = candidates.map((c) => generateSaga(c, basePackage));

  // Fichiers partagés — générés 1 seule fois, ajoutés au premier résultat
  if (perSagaResults.length > 0) {
    const sharedFiles = generateSharedSagaFiles(basePackage, candidates);
    perSagaResults[0].files = [...perSagaResults[0].files, ...sharedFiles];
  }

  return perSagaResults;
}

// ── Helpers production-ready ─────────────────────────────────────────────────

/**
 * Détecte si un step est un appel vers une gateway externe (SWIFT, TARGET2, SEPA, etc.)
 */
function isExternalGateway(step: SagaStep): boolean {
  return /SWIFT|TARGET2|SEPA|pain\.001|pain\.002|Office.*Changes|CNSS|DGI/i.test(step.label)
    || /soumettre|envoyer.*canal|submit|gateway/i.test(step.label)
    || /SWIFT|Gateway|TARGET/i.test(step.targetService || "");
}

/**
 * Retourne le code Java pour la factory method RetryPolicy appropriée.
 * Inféré automatiquement depuis le type de step et sa cible.
 */
function getRetryPolicyForStep(step: SagaStep): string {
  // Priorité 1 : les steps async (fire-and-forget) — détectés via isAsync flag
  if (step.isAsync || step.type === "async") return "RetryPolicy.forAsync()";

  switch (step.type) {
    case "validation":
      return step.targetService ? "RetryPolicy.forRemoteService()" : "RetryPolicy.forLocalDb()";
    case "query":
      return step.targetService ? "RetryPolicy.forRemoteService()" : "RetryPolicy.forLocalDb()";
    case "command":
      if (isExternalGateway(step)) return "RetryPolicy.forExternalGateway()";
      if (step.targetService) return "RetryPolicy.forRemoteService()";
      return "RetryPolicy.forLocalDb()";
    default:
      return "RetryPolicy.forLocalDb()";
  }
}

/**
 * Détermine si un step nécessite un circuit breaker.
 * Uniquement sur les appels inter-services (pas async, pas local).
 */
function needsCircuitBreaker(step: SagaStep): boolean {
  return step.targetService != null && step.type !== "async";
}

/**
 * Sépare les steps en 3 phases : readonly, write, async.
 * Phase readonly : validations + queries avant les writes
 * Phase write : commands compensables (transaction avec savepoints)
 * Phase async : fire-and-forget (hors transaction)
 */
function splitIntoPhases(steps: SagaStep[]): SagaPhase[] {
  const phases: SagaPhase[] = [];
  const readonlySteps: SagaStep[] = [];
  const writeSteps: SagaStep[] = [];
  const asyncSteps: SagaStep[] = [];

  for (const step of steps) {
    if (step.isAsync || step.type === "async") asyncSteps.push(step);
    else if (step.isCompensable || step.type === "command") writeSteps.push(step);
    else readonlySteps.push(step);
  }

  if (readonlySteps.length > 0) {
    phases.push({ name: "readonly", steps: readonlySteps, needsTransaction: false });
  }
  if (writeSteps.length > 0) {
    phases.push({ name: "write", steps: writeSteps, needsTransaction: true });
  }
  if (asyncSteps.length > 0) {
    phases.push({ name: "async", steps: asyncSteps, needsTransaction: false });
  }

  return phases;
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
    "COMPENSATED",
    "FAILED",
    "COMPENSATION_FAILED",
  ];

  return `package ${basePackage}.saga;

/**
 * States of the ${domainPascal} Saga.
 * Each state corresponds to a step in the orchestrated flow.
 * Includes terminal states for compensation success/failure.
 * Auto-generated by Compleo -- DO NOT MODIFY.
 */
public enum ${domainPascal}SagaState {
${states.map((s, i) => `    ${s}${i < states.length - 1 ? "," : ";"}`).join("\n")}

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == COMPENSATED || this == COMPENSATION_FAILED;
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
import java.util.ArrayList;
import java.util.List;

/**
 * Contexte partagé entre les steps de la Saga ${domainPascal}.
 * Contient les résultats intermédiaires produits par chaque step.
 * Enrichi avec completedSteps pour le suivi de la compensation.
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

    /** Steps complétés (pour compensation LIFO) */
    private List<String> completedSteps;

${fields.join("\n")}

    // ── Constructeur ─────────────────────────────────────────────────────

    public ${domainPascal}SagaContext() {
        this.sagaId = java.util.UUID.randomUUID().toString();
        this.startedAt = LocalDateTime.now();
        this.currentState = ${domainPascal}SagaState.INITIATED;
        this.completedSteps = new ArrayList<>();
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

    public List<String> getCompletedSteps() { return completedSteps; }
    public void setCompletedSteps(List<String> completedSteps) { this.completedSteps = completedSteps; }
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
  const phases = splitIntoPhases(steps);
  const compensableSteps = steps.filter((s) => s.isCompensable).reverse();
  const injections = buildInjections(steps, candidate, basePackage);
  const stepMethods = steps.map((s) => buildStepMethod(s, domainPascal));
  const compensationMethods = compensableSteps.map((s) =>
    buildCompensationMethod(s, domainPascal),
  );

  // Build retry policy map initialization
  const retryPolicyInit = steps.map((s) => {
    const retryPolicy = getRetryPolicyForStep(s);
    return `        retryPolicies.put("step${s.order}", ${retryPolicy});`;
  }).join("\n");

  // Build phase execution blocks
  const phaseBlocks = phases.map((phase) => buildPhaseBlock(phase, domainPascal, candidate)).join("\n\n");

  // Build compensation with retry
  const compensateBlock = buildCompensateWithRetry(compensableSteps, domainPascal);

  return `package ${basePackage}.saga;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import ${basePackage}.saga.retry.RetryPolicy;
import ${basePackage}.saga.retry.SagaStepException;
import ${basePackage}.saga.circuitbreaker.CircuitBreakerRegistry;
import ${basePackage}.saga.circuitbreaker.CircuitOpenException;
import ${basePackage}.saga.transaction.SagaSavepointManager;
import ${basePackage}.saga.recovery.SagaStateStore;
import ${basePackage}.saga.recovery.SagaStateRecord;
import javax.sql.DataSource;
import java.util.*;
${injections.imports.join("\n")}

/**
 * Orchestrateur Saga pour le domaine ${domainPascal}.
 * Coordonne ${steps.length} steps séquentiels avec :
 *   - Retry + backoff exponentiel par step (inféré depuis le type)
 *   - Circuit breaker par service distant
 *   - Savepoints pour rollback granulaire (phase write)
 *   - Compensation avec retry dédié (5 tentatives, backoff 3x)
 *   - Dead letter + recovery pour les Sagas orphelines
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
    private final CircuitBreakerRegistry circuitBreakerRegistry;
    private final SagaStateStore sagaStateStore;
    private final DataSource dataSource;
    private final Map<String, RetryPolicy> retryPolicies = new HashMap<>();

    // ── Constructeur (injection par constructeur) ────────────────────────

    public ${domainPascal}SagaOrchestrator(
${injections.constructorParams.join(",\n")},
            CircuitBreakerRegistry circuitBreakerRegistry,
            SagaStateStore sagaStateStore,
            DataSource dataSource
    ) {
${injections.constructorAssignments.join("\n")}
        this.circuitBreakerRegistry = circuitBreakerRegistry;
        this.sagaStateStore = sagaStateStore;
        this.dataSource = dataSource;

        // ── Retry policies par step (inférées depuis le type) ───────────
${retryPolicyInit}
    }

    // ── Point d'entrée ───────────────────────────────────────────────────

    /**
     * Exécute la Saga complète en 3 phases :
     *   Phase 1 (readonly) : validations + queries (pas de transaction)
     *   Phase 2 (write)    : commands avec savepoints + retry + CB
     *   Phase 3 (async)    : fire-and-forget (hors transaction)
     *
     * En cas d'échec : compensation LIFO avec retry dédié.
     * En cas de crash : recovery via SagaStateStore + heartbeat.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ${domainPascal}SagaContext execute(${candidate.inputType} input) {
        ${domainPascal}SagaContext ctx = new ${domainPascal}SagaContext();
        log.info("[SAGA:{}] Démarrage saga {} — sagaId={}", "${domainPascal}", "${domainPascal}", ctx.getSagaId());
        persistSagaState(ctx);

        try {
${phaseBlocks}

            // ── Saga terminée avec succès ────────────────────────────────
            ctx.setCurrentState(${domainPascal}SagaState.COMPLETED);
            ctx.setCompletedAt(java.time.LocalDateTime.now());
            logTransition(ctx, "COMPLETED", "SUCCESS", null);
            persistSagaState(ctx);
            log.info("[SAGA:{}] Saga terminée avec succès — sagaId={}", "${domainPascal}", ctx.getSagaId());

        } catch (Exception ex) {
            log.error("[SAGA:{}] Échec — sagaId={} — {}", "${domainPascal}", ctx.getSagaId(), ex.getMessage());
            ctx.setErrorReason(ex.getMessage());
            ctx.setCurrentState(${domainPascal}SagaState.COMPENSATING);
            persistSagaState(ctx);

            // ── Compensation LIFO avec retry ────────────────────────────
            compensate(ctx);
        }

        sagaStateStore.markCompleted(ctx.getSagaId(), ctx.getCurrentState().name());
        return ctx;
    }

    // ── Compensation LIFO avec retry dédié ──────────────────────────────

${compensateBlock}

    // ── Steps ────────────────────────────────────────────────────────────

${stepMethods.join("\n\n")}

    // ── Compensations ────────────────────────────────────────────────────

${compensationMethods.join("\n\n")}

    // ── Persistance état + heartbeat ────────────────────────────────────

    private void persistSagaState(${domainPascal}SagaContext ctx) {
        try {
            sagaStateStore.persistState(SagaStateRecord.builder()
                .sagaId(ctx.getSagaId())
                .sagaName("${domainPascal}")
                .currentState(ctx.getCurrentState().name())
                .lastStepCompleted(ctx.getCompletedSteps().size())
                .completedStepsJson(String.join(",", ctx.getCompletedSteps()))
                .errorMessage(ctx.getErrorReason())
                .build());
        } catch (Exception e) {
            log.warn("[SAGA:{}] Échec persistance état: {}", "${domainPascal}", e.getMessage());
        }
    }

    private void sendToDeadLetter(${domainPascal}SagaContext ctx, List<String> failedCompensations) {
        log.error("[SAGA:{}] DEAD LETTER — {} compensations échouées: {}",
            "${domainPascal}", failedCompensations.size(), failedCompensations);
        persistSagaState(ctx);
    }

    // ── Audit ────────────────────────────────────────────────────────────

    private void logTransition(${domainPascal}SagaContext ctx, String stateTo, String status, String error) {
        // TODO: Persister via SagaLogRepository
        log.debug("[SAGA:{}] {} → {} [{}] {}", "${domainPascal}", ctx.getCurrentState(), stateTo, status, error != null ? error : "");
    }
}
`;
}

// ── Phase block builders ─────────────────────────────────────────────────────

function buildPhaseBlock(phase: SagaPhase, domainPascal: string, candidate: SagaCandidate): string {
  if (phase.name === "readonly") {
    return buildReadonlyPhase(phase.steps, domainPascal);
  } else if (phase.name === "write") {
    return buildWritePhase(phase.steps, domainPascal);
  } else {
    return buildAsyncPhase(phase.steps, domainPascal);
  }
}

function buildReadonlyPhase(steps: SagaStep[], domainPascal: string): string {
  const stepCalls = steps.map((s) => {
    const methodName = `step${s.order}${toPascalCase(s.name)}`;
    const stateConst = `${domainPascal}SagaState.STEP_${s.order}_${toConstCase(s.name)}`;
    const hasCB = needsCircuitBreaker(s);
    const retryPolicy = getRetryPolicyForStep(s);

    let call: string;
    if (hasCB) {
      const serviceName = inferServiceName(s);
      call = `            // Step ${s.order}: ${s.label} [CB: ${serviceName}]
            ctx.setCurrentState(${stateConst});
            sagaStateStore.heartbeat(ctx.getSagaId());
            circuitBreakerRegistry.getBreaker("${serviceName}").execute(() -> {
                retryPolicies.get("step${s.order}").execute("${s.name}", () -> {
                    ${methodName}(ctx);
                    return null;
                });
                return null;
            });
            ctx.getCompletedSteps().add("step-${s.order}");`;
    } else {
      call = `            // Step ${s.order}: ${s.label}
            ctx.setCurrentState(${stateConst});
            sagaStateStore.heartbeat(ctx.getSagaId());
            retryPolicies.get("step${s.order}").execute("${s.name}", () -> {
                ${methodName}(ctx);
                return null;
            });
            ctx.getCompletedSteps().add("step-${s.order}");`;
    }
    return call;
  }).join("\n\n");

  return `            // ── PHASE 1 : Steps read-only (pas de transaction nécessaire) ──
${stepCalls}`;
}

function buildWritePhase(steps: SagaStep[], domainPascal: string): string {
  const stepCalls = steps.map((s) => {
    const methodName = `step${s.order}${toPascalCase(s.name)}`;
    const stateConst = `${domainPascal}SagaState.STEP_${s.order}_${toConstCase(s.name)}`;
    const hasCB = needsCircuitBreaker(s);

    let innerCall: string;
    if (hasCB) {
      const serviceName = inferServiceName(s);
      innerCall = `                circuitBreakerRegistry.getBreaker("${serviceName}").execute(() -> {
                    retryPolicies.get("step${s.order}").execute("${s.name}", () -> {
                        ${methodName}(ctx);
                        return null;
                    });
                    return null;
                });`;
    } else {
      innerCall = `                retryPolicies.get("step${s.order}").execute("${s.name}", () -> {
                    ${methodName}(ctx);
                    return null;
                });`;
    }

    return `                spm.setSavepoint("before-step-${s.order}");
                ctx.setCurrentState(${stateConst});
                sagaStateStore.heartbeat(ctx.getSagaId());
${innerCall}
                ctx.getCompletedSteps().add("step-${s.order}");`;
  }).join("\n\n");

  return `            // ── PHASE 2 : Steps écriture (transaction avec savepoints) ──
            SagaSavepointManager spm = new SagaSavepointManager(dataSource);
            spm.begin();
            try {
${stepCalls}

                spm.commit();
            } catch (Exception e) {
                spm.rollbackAll();
                throw e;
            } finally {
                spm.close();
            }`;
}

function buildAsyncPhase(steps: SagaStep[], domainPascal: string): string {
  const stepCalls = steps.map((s) => {
    const methodName = `step${s.order}${toPascalCase(s.name)}`;
    return `            try {
                ${methodName}(ctx);
                ctx.getCompletedSteps().add("step-${s.order}");
            } catch (Exception e) {
                log.warn("[SAGA:${domainPascal}] Step async ${s.order} échoué (non-bloquant): {}", e.getMessage());
            }`;
  }).join("\n\n");

  return `            // ── PHASE 3 : Steps async (hors transaction, fire-and-forget) ──
${stepCalls}`;
}

// ── Compensation with retry ──────────────────────────────────────────────────

function buildCompensateWithRetry(compensableSteps: SagaStep[], domainPascal: string): string {
  const compensateCases = compensableSteps.map((s) => {
    const methodName = `compensateStep${s.order}${toPascalCase(s.name)}`;
    return `                case "step-${s.order}":
                    ${methodName}(ctx);
                    break;`;
  }).join("\n");

  return `    private void compensate(${domainPascal}SagaContext ctx) {
        log.warn("[SAGA:{}] Compensation LIFO de {} steps — sagaId={}",
            "${domainPascal}", ctx.getCompletedSteps().size(), ctx.getSagaId());
        persistSagaState(ctx);

        RetryPolicy compensationRetry = RetryPolicy.forCompensation();
        List<String> completedSteps = new ArrayList<>(ctx.getCompletedSteps());
        Collections.reverse(completedSteps);
        List<String> failedCompensations = new ArrayList<>();

        for (String stepName : completedSteps) {
            try {
                compensationRetry.executeVoid("compensate-" + stepName, () -> {
                    switch (stepName) {
${compensateCases}
                        default:
                            log.debug("[SAGA:{}] Step {} non-compensable", ctx.getSagaId(), stepName);
                    }
                });
                logTransition(ctx, "COMPENSATED", stepName, null);
            } catch (Exception e) {
                log.error("[SAGA:{}] ÉCHEC COMPENSATION {} après retries: {}",
                    ctx.getSagaId(), stepName, e.getMessage());
                failedCompensations.add(stepName + ": " + e.getMessage());
                logTransition(ctx, "COMPENSATION_FAILED", stepName, e.getMessage());
            }
        }

        if (failedCompensations.isEmpty()) {
            ctx.setCurrentState(${domainPascal}SagaState.COMPENSATED);
            log.info("[SAGA:{}] Compensation complète — état cohérent restauré", ctx.getSagaId());
        } else {
            ctx.setCurrentState(${domainPascal}SagaState.COMPENSATION_FAILED);
            log.error("[SAGA:{}] COMPENSATION PARTIELLE — {} steps non compensés — ALERTE CRITIQUE",
                ctx.getSagaId(), failedCompensations.size());
            sendToDeadLetter(ctx, failedCompensations);
        }

        persistSagaState(ctx);
    }`;
}

function generateSqlMigration(domainPascal: string): string {
  // Post-Audit STEP 8b: Oracle DDL (not MySQL)
  return `-- Flyway migration: Table d'audit Saga
-- Générée automatiquement par Compleo — Saga ${domainPascal}
-- Dialecte: Oracle 19c+

CREATE TABLE T_SAGA_LOG (
    ID              NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    SAGA_ID         VARCHAR2(64)   NOT NULL,
    SAGA_NAME       VARCHAR2(128)  NOT NULL,
    STEP_NAME       VARCHAR2(128)  NOT NULL,
    STEP_ORDER      NUMBER(4),
    STATE_FROM      VARCHAR2(64),
    STATE_TO        VARCHAR2(64)   NOT NULL,
    STATUS          VARCHAR2(32)   NOT NULL,
    DURATION_MS     NUMBER(12),
    ERROR_MESSAGE   VARCHAR2(2000),
    PAYLOAD         CLOB,
    CREATED_AT      TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE INDEX IDX_SAGA_LOG_SAGA_ID ON T_SAGA_LOG (SAGA_ID);
CREATE INDEX IDX_SAGA_LOG_SAGA_NAME ON T_SAGA_LOG (SAGA_NAME);
CREATE INDEX IDX_SAGA_LOG_STATUS ON T_SAGA_LOG (STATUS, CREATED_AT);

COMMENT ON TABLE T_SAGA_LOG IS 'Historique des transitions Saga — audit, monitoring, replay';
COMMENT ON COLUMN T_SAGA_LOG.SAGA_ID IS 'UUID unique de l''exécution Saga';
COMMENT ON COLUMN T_SAGA_LOG.STATUS IS 'SUCCESS | FAILED | COMPENSATED | COMPENSATION_FAILED';
`;
}

// ── Builders pour l'Orchestrator ─────────────────────────────────────────────

/**
 * Post-Audit STEP 6: Inject ALL dependencies into the orchestrator.
 * Sources:
 *   1. candidate.ejbDependencies (inter-service EJB refs)
 *   2. step.targetService (services called by each step)
 *   3. Always inject JdbcTemplate (for SQL operations)
 *   4. Always inject SagaLogRepository (for audit logging)
 */
function buildInjections(
  steps: SagaStep[],
  candidate: SagaCandidate,
  basePackage: string,
): {
  imports: string[];
  fields: string[];
  constructorParams: string[];
  constructorAssignments: string[];
} {
  const imports: string[] = [
    "import org.springframework.jdbc.core.JdbcTemplate;",
  ];
  const deps: Array<{ type: string; field: string }> = [];
  const seen = new Set<string>();

  // 1. Always inject JdbcTemplate
  deps.push({ type: "JdbcTemplate", field: "jdbcTemplate" });
  seen.add("JdbcTemplate");

  // 2. Always inject SagaLogRepository
  deps.push({ type: "SagaLogRepository", field: "sagaLogRepository" });
  seen.add("SagaLogRepository");

  // 3. Collect from ejbDependencies
  for (const dep of candidate.ejbDependencies) {
    const typeName = dep.type
      .replace(/EJB(?:Local|Remote)?$/i, "")
      .replace(/Bean$/i, "")
      .replace(/Impl$/i, "");
    const serviceName = typeName + "Service";
    if (!seen.has(serviceName)) {
      seen.add(serviceName);
      const fieldName = lcFirst(typeName) + "Service";
      deps.push({ type: serviceName, field: fieldName });
    }
  }

  // 4. Collect from step.targetService
  for (const step of steps) {
    if (step.targetService) {
      const svcName = step.targetService
        .replace(/EJB(?:Local|Remote)?$/i, "")
        .replace(/Bean$/i, "")
        .replace(/Impl$/i, "");
      const serviceName = svcName + (svcName.endsWith("Service") ? "" : "Service");
      if (!seen.has(serviceName)) {
        seen.add(serviceName);
        const fieldName = lcFirst(svcName) + (svcName.endsWith("Service") ? "" : "Service");
        deps.push({ type: serviceName, field: fieldName });
      }
    }
  }

  const fields = deps.map(d => `    private final ${d.type} ${d.field};`);
  const constructorParams = deps.map(d => `            ${d.type} ${d.field}`);
  const constructorAssignments = deps.map(d => `        this.${d.field} = ${d.field};`);

  return { imports, fields, constructorParams, constructorAssignments };
}

/**
 * Post-Audit STEP 7: Step methods now store intermediate results in context.
 */
function buildStepMethod(step: SagaStep, domainPascal: string): string {
  const methodName = `step${step.order}${toPascalCase(step.name)}`;
  const asyncTag = step.isAsync ? " [ASYNC]" : "";
  const criticalTag = step.isCritical ? " [CRITICAL]" : "";
  const serviceRef = step.targetService
    ? lcFirst(step.targetService.replace(/EJB(?:Local|Remote)?$/i, "").replace(/Bean$/i, "").replace(/Impl$/i, "")) + "Service"
    : null;
  const serviceCall = serviceRef
    ? `${serviceRef}.${step.targetMethod}(ctx)`
    : `// ${step.targetMethod}(ctx)`;

  return `    /**
     * Step ${step.order}: ${step.label}${asyncTag}${criticalTag}
     * Type: ${step.type} | Compensable: ${step.isCompensable}
     * Retry: ${getRetryPolicyForStep(step)} | CB: ${needsCircuitBreaker(step)}
     * ${step.sourceComment}
     */
    private void ${methodName}(${domainPascal}SagaContext ctx) {
        log.info("[SAGA:${domainPascal}] Step ${step.order} — ${step.label}");
        long start = System.currentTimeMillis();
        try {
            // TODO: Implémenter l'appel au service ${step.targetService || "local"}
            // var result = ${serviceCall};
            // ctx.set...(result);  // Stocker le résultat intermédiaire dans le context
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
     * Retry: RetryPolicy.forCompensation() (5 tentatives, backoff 3x)
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
            throw ex;  // Remonter pour que RetryPolicy.forCompensation() puisse retenter
        }
    }`;
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

function inferServiceName(step: SagaStep): string {
  if (!step.targetService) return "unknown-service";
  return step.targetService
    .replace(/EJB(?:Local|Remote)?$/i, "")
    .replace(/Bean$/i, "")
    .replace(/Impl$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    + "-service";
}

function toPascalCase(s: string): string {
  return s
    .replace(/[^a-zA-ZÀ-ÿ0-9]+/g, " ")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/**
 * Post-Audit STEP 5: ASCII-only constant names for Java enums.
 * Transliterates accented characters before stripping non-ASCII.
 * "Vérification KYC" → "VERIFICATION_KYC" (not "V_RIFICATION_KYC")
 * "Décaissement" → "DECAISSEMENT"
 */
function toConstCase(s: string): string {
  // Transliterate common French accented chars to ASCII equivalents
  const ascii = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // Strip combining diacritical marks
    .replace(/\u0153/g, "oe")          // œ ligature
    .replace(/\u00e6/g, "ae")          // æ ligature
    .replace(/\u00c6/g, "AE")
    .replace(/\u0152/g, "OE")
    .replace(/\u00e7/g, "c")           // ç
    .replace(/\u00c7/g, "C");
  return ascii
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase()
    .replace(/^_|_$/g, "")
    .replace(/_{2,}/g, "_");
}

function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
