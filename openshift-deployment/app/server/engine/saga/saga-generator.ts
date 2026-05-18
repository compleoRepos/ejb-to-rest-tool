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
 * @author Compleo
 */

import type { SagaCandidate } from "./saga-detector";
import type { SagaStep, IntermediateResult } from "./saga-step-extractor";
import { extractSagaSteps, extractIntermediateResults } from "./saga-step-extractor";
import { generateSharedSagaFiles } from "./saga-shared-generators";
import type { SagaMLEnricher, SagaMLResult } from "./ml/SagaMLEnricher";
import type { MLStepEnrichment } from "./ml/prompts";
import { getStepBody, getAdditionalServicesForDomain } from "./step-body-mapper";
import { getCompensationBody } from "./compensation-mapper";

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
  /** Statistiques ML (si enrichissement ML activé) */
  mlStats?: {
    mlEnriched: number;
    fallbackUsed: number;
    validationIssues: number;
    totalDurationMs: number;
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

  // 5. SQL migration (audit log) — v8.1: path unique par domaine
  files.push({
    path: `src/main/resources/db/migration/V3__create_${domain.replace(/[^a-z0-9]/g, '_')}_saga_log.sql`,
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
 *
 * v8.1 BUG-1 fix: Déduplique par domaine — si plusieurs candidats partagent le même
 * domaine (ex: 3 méthodes du même EJB), on ne garde que le candidat le plus riche
 * (celui avec le plus de writeOperations) pour éviter les fichiers dupliqués.
 */
export function generateAllSagas(
  candidates: SagaCandidate[],
  basePackage: string,
): SagaGenerationResult[] {
  // BUG-1 fix: Dédupliquer par domaine — garder le candidat le plus riche
  const deduped = deduplicateCandidatesByDomain(candidates);
  const perSagaResults = deduped.map((c) => generateSaga(c, basePackage));

  // Fichiers partagés — générés 1 seule fois, ajoutés au premier résultat
  if (perSagaResults.length > 0) {
    const sharedFiles = generateSharedSagaFiles(basePackage, deduped);
    perSagaResults[0].files = [...perSagaResults[0].files, ...sharedFiles];
  }

  return perSagaResults;
}

/**
 * Génère une Saga enrichie par le LLM.
 * Le ML remplace les TODO dans les step bodies et compensations
 * par du code métier réel migré depuis l'EJB source.
 *
 * Fallback automatique vers le rule-based si Ollama est absent.
 */
export async function generateSagaWithML(
  candidate: SagaCandidate,
  basePackage: string,
  mlEnricher: SagaMLEnricher,
): Promise<SagaGenerationResult> {
  // 1. Extraction mécanique (identique au rule engine)
  const steps = extractSagaSteps(
    candidate.rawSource,
    "execute",
    candidate.ejbDependencies,
  );
  const intermediateResults = extractIntermediateResults(
    candidate.rawSource,
    steps,
  );

  // 2. Enrichissement ML
  const mlResult = await mlEnricher.enrichSaga(candidate, steps, intermediateResults);

  // 3. Génération des fichiers avec enrichissements ML
  const domain = candidate.domain;
  const domainPascal = toPascalCase(domain);
  const packagePath = basePackage.replace(/\./g, "/");

  const files: SagaGeneratedFile[] = [];

  // State enum (identique)
  files.push({
    path: `src/main/java/${packagePath}/saga/${domainPascal}SagaState.java`,
    content: generateStateEnum(domainPascal, steps, basePackage),
    category: "saga-state",
  });

  // Context POJO enrichi avec les champs ML
  files.push({
    path: `src/main/java/${packagePath}/saga/${domainPascal}SagaContext.java`,
    content: generateContextWithML(domainPascal, intermediateResults, basePackage, mlResult),
    category: "saga-context",
  });

  // Log entity (identique)
  files.push({
    path: `src/main/java/${packagePath}/saga/${domainPascal}SagaLog.java`,
    content: generateLogEntity(domainPascal, basePackage),
    category: "saga-log",
  });

  // Orchestrator enrichi ML
  files.push({
    path: `src/main/java/${packagePath}/saga/${domainPascal}SagaOrchestrator.java`,
    content: generateOrchestratorWithML(domainPascal, steps, intermediateResults, candidate, basePackage, mlResult),
    category: "saga-orchestrator",
  });

  // SQL migration — v8.1: path unique par domaine
  files.push({
    path: `src/main/resources/db/migration/V3__create_${domain.replace(/[^a-z0-9]/g, '_')}_saga_log.sql`,
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
    mlStats: {
      mlEnriched: mlResult.stats.mlEnriched,
      fallbackUsed: mlResult.stats.fallbackUsed,
      validationIssues: mlResult.stats.validationIssues,
      totalDurationMs: mlResult.stats.totalDurationMs,
    },
  };
}

/**
 * Génère toutes les Sagas avec enrichissement ML.
 * Version async de generateAllSagas.
 *
 * v8.1 BUG-1 fix: Déduplique par domaine avant génération.
 */
export async function generateAllSagasWithML(
  candidates: SagaCandidate[],
  basePackage: string,
  mlEnricher: SagaMLEnricher,
): Promise<SagaGenerationResult[]> {
  // BUG-1 fix: Dédupliquer par domaine
  const deduped = deduplicateCandidatesByDomain(candidates);
  const results: SagaGenerationResult[] = [];
  for (const c of deduped) {
    results.push(await generateSagaWithML(c, basePackage, mlEnricher));
  }

  // Fichiers partagés — générés 1 seule fois
  if (results.length > 0) {
    const sharedFiles = generateSharedSagaFiles(basePackage, deduped);
    results[0].files = [...results[0].files, ...sharedFiles];
  }

  return results;
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

  // BUG-1 T5.1 fix: No inline Javadoc comments between enum constants.
  // Comments are placed in the class-level Javadoc only.
  const stateLines = states.map((s, i) => {
    return `    ${s}${i < states.length - 1 ? "," : ";"}`;
  }).join("\n");

  return `package ${basePackage}.saga;

/**
 * States of the ${domainPascal} Saga.
 *
 * Transition diagram:
 * <pre>
 *   INITIATED
 *       |
 *       v
 *   STEP_1_xxx --> STEP_2_xxx --> ... --> STEP_N_xxx
 *       |               |                     |
 *       | (failure)      | (failure)           | (success)
 *       v               v                     v
 *   COMPENSATING   COMPENSATING           COMPLETED
 *       |
 *       +--> COMPENSATED          (all compensations OK)
 *       +--> COMPENSATION_FAILED  (at least 1 compensation failed -> Dead Letter)
 * </pre>
 *
 * Rules:
 * - Only terminal states (COMPLETED, COMPENSATED, FAILED, COMPENSATION_FAILED)
 *   mark the end of the Saga.
 * - COMPENSATING is transient: the Saga traverses completed steps
 *   in LIFO (Last In, First Out) order to undo effects.
 * - COMPENSATION_FAILED triggers Dead Letter Queue for
 *   manual intervention or automatic recovery.
 *
 * Generated by Compleo - DO NOT MODIFY.
 */
public enum ${domainPascal}SagaState {

${stateLines}

    // Whether this state is terminal (Saga will not progress further).
    // Terminal states: COMPLETED, FAILED, COMPENSATED, COMPENSATION_FAILED.
    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == COMPENSATED || this == COMPENSATION_FAILED;
    }

    // Whether the Saga is currently compensating (LIFO undo with retry).
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
 *
 * <h3>Rôle dans le pattern Saga</h3>
 * Le Context est le "sac à dos" de la Saga : chaque step y dépose ses résultats
 * intermédiaires, et les steps suivants y puisent les données dont ils ont besoin.
 * Cela évite les appels directs entre steps et garantit un couplage lâche.
 *
 * <h3>Champs système</h3>
 * <ul>
 *   <li><b>sagaId</b> — UUID unique généré à la création. Utilisé pour le tracking,
 *       les logs, la persistance d'état et la recovery.</li>
 *   <li><b>currentState</b> — État courant de la Saga (voir ${domainPascal}SagaState).
 *       Mis à jour avant chaque step et persisté via SagaStateStore.</li>
 *   <li><b>completedSteps</b> — Liste ordonnée des steps terminés. Utilisée par
 *       la compensation LIFO : on parcourt cette liste en ordre inverse pour
 *       annuler les effets de chaque step.</li>
 *   <li><b>errorReason</b> — Message d'erreur du step qui a échoué. Persisté
 *       dans SagaStateStore pour le diagnostic et la recovery.</li>
 * </ul>
 *
 * <h3>Champs métier (résultats intermédiaires)</h3>
 * Les champs ci-dessous sont extraits automatiquement depuis le code EJB source.
 * Chaque step producteur appelle le setter correspondant, et les steps
 * consommateurs utilisent le getter.
 *
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
// Note: Cette entité JPA trace chaque transition d'état de la Saga.
// Elle est utilisée pour l'audit, le monitoring et le débogage en production.
import java.time.LocalDateTime;

/**
 * Entité JPA pour l'audit des exécutions Saga ${domainPascal}.
 *
 * <h3>Rôle dans le pattern Saga</h3>
 * <p>Chaque transition d'état (step démarré, step réussi, step échoué, compensation,
 * dead letter) est enregistrée comme une ligne dans la table SAGA_LOG.
 * Cela fournit un <b>audit trail complet</b> pour :</p>
 * <ul>
 *   <li>Le diagnostic en cas de problème (quelle étape a échoué ? quand ?)</li>
 *   <li>Le monitoring de performance (durée de chaque step)</li>
 *   <li>La conformité réglementaire (traçabilité des opérations bancaires)</li>
 *   <li>Le SagaRecoveryExecutor (reprise des Sagas orphelines)</li>
 * </ul>
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
  const injections = buildInjections(steps, candidate, basePackage, candidate.domain);
  const stepMethods = steps.map((s) => buildStepMethod(s, domainPascal, candidate.domain));
  const compensationMethods = compensableSteps.map((s) =>
    buildCompensationMethod(s, domainPascal, candidate.domain),
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
 *
 * <h3>Architecture Production-Ready</h3>
 * Cet orchestrateur coordonne ${steps.length} steps séquentiels en 3 phases distinctes,
 * chacune avec ses propres garanties de résilience :
 *
 * <pre>
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │  PHASE 1 : READ-ONLY                                                       │
 * │  Validations + queries (pas de transaction)                                │
 * │  Retry: RetryPolicy.forLocalDb() ou forRemoteService()                     │
 * │  Circuit Breaker: activé pour les services distants                        │
 * ├──────────────────────────────────────────────────────────────────────────────┤
 * │  PHASE 2 : WRITE                                                           │
 * │  Commands avec savepoints JDBC + retry + CB                                │
 * │  SagaSavepointManager: begin() → setSavepoint() → commit()/rollbackAll()  │
 * │  Chaque step est protégé par un savepoint pour rollback granulaire          │
 * ├──────────────────────────────────────────────────────────────────────────────┤
 * │  PHASE 3 : ASYNC                                                           │
 * │  Fire-and-forget (hors transaction)                                        │
 * │  Retry: RetryPolicy.forAsync() | Échec non-bloquant (log warning)          │
 * └──────────────────────────────────────────────────────────────────────────────┘
 * </pre>
 *
 * <h3>5 mécanismes de résilience</h3>
 * <ol>
 *   <li><b>Retry + Backoff</b> — Chaque step a une RetryPolicy inférée depuis son type
 *       (forLocalDb, forRemoteService, forExternalGateway, forAsync). Le backoff est
 *       exponentiel avec jitter pour éviter les thundering herds.</li>
 *   <li><b>Circuit Breaker</b> — Les steps appelant des services distants sont protégés
 *       par un CircuitBreaker (3 états : CLOSED/OPEN/HALF_OPEN). Si le circuit est ouvert,
 *       l'appel échoue immédiatement avec CircuitOpenException.</li>
 *   <li><b>Savepoints</b> — La phase WRITE utilise des savepoints JDBC pour permettre
 *       un rollback granulaire sans annuler toute la transaction.</li>
 *   <li><b>Compensation LIFO</b> — En cas d'échec, les steps sont compensés en ordre
 *       inverse (Last In, First Out) avec RetryPolicy.forCompensation() (5 tentatives).</li>
 *   <li><b>Dead Letter + Recovery</b> — Si une compensation échoue après tous les retries,
 *       elle est envoyée en Dead Letter. Le SagaRecoveryScheduler détecte les Sagas
 *       orphelines et les relance automatiquement.</li>
 * </ol>
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
        // ── Point d'entrée ───────────────────────────────────────────────────────

    /**
     * Exécute la Saga complète en 3 phases séquentielles.
     *
     * <h4>Flux d'exécution</h4>
     * <pre>
     *   execute(input)
     *       │
     *       ├── Phase 1 (readonly) : validations + queries
     *       │   └─ Pas de transaction, retry + CB par step
     *       │
     *       ├── Phase 2 (write) : commands avec savepoints JDBC
     *       │   ├─ SagaSavepointManager.begin()
     *       │   ├─ setSavepoint("before-step-N") avant chaque step
     *       │   ├─ commit() si tout OK
     *       │   └─ rollbackAll() si échec
     *       │
     *       ├── Phase 3 (async) : fire-and-forget
     *       │   └─ Échec non-bloquant (log warning, saga continue)
     *       │
     *       ├── [SUCCÈS] → COMPLETED + persistSagaState
     *       │
     *       └── [ÉCHEC] → COMPENSATING → compensate(ctx)
     *           ├─ COMPENSATED (toutes les compensations OK)
     *           └─ COMPENSATION_FAILED (dead letter)
     * </pre>
     *
     * <h4>Heartbeat</h4>
     * Avant chaque step, un heartbeat est envoyé au SagaStateStore.
     * Le SagaRecoveryScheduler utilise ce heartbeat pour détecter les Sagas
     * orphelines (pas de heartbeat depuis > 30 min) et les relancer.
     *
     * @param input Données d'entrée de la Saga (DTO du client)
     * @return Le contexte final avec l'état terminal et les résultats intermédiaires
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

    // ── Persistance état + heartbeat ─────────────────────────────────────

    /**
     * Persiste l'état courant de la Saga dans la table SAGA_STATE.
     *
     * <p>Appelé à chaque transition d'état (avant/après chaque step, en début
     * et fin de saga). Sert de <b>heartbeat</b> : le SagaRecoveryScheduler
     * vérifie le champ updated_at pour détecter les Sagas orphelines
     * (pas de mise à jour depuis > 30 minutes).</p>
     *
     * <p>En cas d'échec de persistance (ex: base indisponible), un warning
     * est logué mais la Saga continue — la persistance est best-effort
     * pour ne pas bloquer le flux métier.</p>
     */
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
/**
 * Java reserved keywords — used to filter out phantom dependencies.
 * BUG-2 fix: prevents injection of `private`, `public`, etc. as service names.
 */
const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch',
  'char', 'class', 'const', 'continue', 'default', 'do', 'double',
  'else', 'enum', 'extends', 'final', 'finally', 'float', 'for',
  'goto', 'if', 'implements', 'import', 'instanceof', 'int',
  'interface', 'long', 'native', 'new', 'package', 'private',
  'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while',
  'true', 'false', 'null',
]);

/**
 * Validates that a dependency name is a valid Java identifier and not a keyword.
 */
function isValidDependencyName(name: string): boolean {
  // Must start with uppercase (Java class convention)
  if (!/^[A-Z]/.test(name)) return false;
  // Must be at least 3 chars
  if (name.length < 3) return false;
  // Must not be a Java keyword (case-insensitive check)
  if (JAVA_KEYWORDS.has(name.toLowerCase())) return false;
  return true;
}

function buildInjections(
  steps: SagaStep[],
  candidate: SagaCandidate,
  basePackage: string,
  domain?: string,
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
  seen.add("jdbcTemplate");

  // 2. Always inject SagaLogRepository
  deps.push({ type: "SagaLogRepository", field: "sagaLogRepository" });
  seen.add("SagaLogRepository");
  seen.add("sagaLogRepository");

  // 3. Collect from ejbDependencies — with Java keyword filter (BUG-2)
  for (const dep of candidate.ejbDependencies) {
    const typeName = dep.type
      .replace(/EJB(?:Local|Remote)?$/i, "")
      .replace(/Bean$/i, "")
      .replace(/Impl$/i, "");
    const serviceName = typeName + "Service";
    const fieldName = lcFirst(typeName) + "Service";
    // BUG-2: Filter out Java keywords and invalid names
    if (!isValidDependencyName(serviceName)) continue;
    if (JAVA_KEYWORDS.has(fieldName.toLowerCase())) continue;
    if (JAVA_KEYWORDS.has(typeName.toLowerCase())) continue;
    if (!seen.has(serviceName)) {
      seen.add(serviceName);
      seen.add(fieldName);
      deps.push({ type: serviceName, field: fieldName });
    }
  }

  // 4. Collect from step.targetService — with Java keyword filter (BUG-2)
  for (const step of steps) {
    if (step.targetService) {
      const svcName = step.targetService
        .replace(/EJB(?:Local|Remote)?$/i, "")
        .replace(/Bean$/i, "")
        .replace(/Impl$/i, "");
      const serviceName = svcName + (svcName.endsWith("Service") ? "" : "Service");
      const fieldName = lcFirst(svcName) + (svcName.endsWith("Service") ? "" : "Service");
      // BUG-2: Filter out Java keywords and invalid names
      if (!isValidDependencyName(serviceName)) continue;
      if (JAVA_KEYWORDS.has(fieldName.toLowerCase())) continue;
      if (!seen.has(serviceName)) {
        seen.add(serviceName);
        seen.add(fieldName);
        deps.push({ type: serviceName, field: fieldName });
      }
    }
  }

  // v8.2 STEP 2: Ajouter les services additionnels du step-body-mapper
  if (domain) {
    const additionalServices = getAdditionalServicesForDomain(domain);
    for (const svcField of additionalServices) {
      if (!seen.has(svcField)) {
        seen.add(svcField);
        const svcType = svcField.charAt(0).toUpperCase() + svcField.slice(1);
        seen.add(svcType);
        deps.push({ type: svcType, field: svcField });
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
function buildStepMethod(step: SagaStep, domainPascal: string, domain?: string): string {
  const methodName = `step${step.order}${toPascalCase(step.name)}`;
  const asyncTag = step.isAsync ? " [ASYNC]" : "";
  const criticalTag = step.isCritical ? " [CRITICAL]" : "";
  const serviceRef = step.targetService
    ? lcFirst(step.targetService.replace(/EJB(?:Local|Remote)?$/i, "").replace(/Bean$/i, "").replace(/Impl$/i, "")) + "Service"
    : null;
  const serviceCall = serviceRef
    ? `${serviceRef}.${step.targetMethod}(ctx)`
    : `// ${step.targetMethod}(ctx)`;

  // Générer les commentaires sur le retry et le circuit breaker
  const retryComment = `RetryPolicy: ${getRetryPolicyForStep(step)} — définit le nombre de tentatives et le backoff`;
  const cbComment = needsCircuitBreaker(step)
    ? `Circuit Breaker: ACTIVÉ (service distant ${step.targetService || 'inconnu'}) — protège contre les cascades d'échecs`
    : `Circuit Breaker: non requis (appel local ou base de données)`;
  const compensableComment = step.isCompensable
    ? `Compensable: OUI — en cas d'échec ultérieur, compensateStep${step.order}${toPascalCase(step.name)}() sera appelé`
    : `Compensable: NON — step en lecture seule ou non réversible`;

  // v8.2 STEP 2: Utiliser le step-body-mapper si un mapping existe
  const mappedBody = domain ? getStepBody(domain, step.order) : null;

  const bodyBlock = mappedBody
    ? mappedBody.split("\n").map(line => line.trimEnd()).join("\n")
    : `            // TODO: Implémenter l'appel au service ${step.targetService || "local"}
            //
            // Exemple d'implémentation :
            //   var result = ${serviceCall};
            //   ctx.set...(result);  // Stocker le résultat intermédiaire dans le context
            //
            // Après succès, ce step est ajouté à ctx.getCompletedSteps()
            // pour que la compensation LIFO sache quels steps annuler.`;

  return `    /**
     * Step ${step.order}: ${step.label}${asyncTag}${criticalTag}
     *
     * <p>Ce step ${step.type === 'query' ? 'effectue une lecture/validation' : step.type === 'command' ? 'exécute une commande avec effet de bord' : step.isAsync ? 'envoie un message asynchrone (fire-and-forget)' : 'effectue un appel'}
     * ${step.targetService ? `vers le service <b>${step.targetService}</b>` : 'en local'}.</p>
     *
     * <ul>
     *   <li>${retryComment}</li>
     *   <li>${cbComment}</li>
     *   <li>${compensableComment}</li>
     * </ul>
     *
     * Source EJB: ${step.sourceComment}
     */
    private void ${methodName}(${domainPascal}SagaContext ctx) {
        log.info("[SAGA:${domainPascal}] Step ${step.order} — ${step.label}");
        long start = System.currentTimeMillis();
        try {
${bodyBlock}
            logTransition(ctx, "${domainPascal}SagaState.STEP_${step.order}_${toConstCase(step.name)}", "SUCCESS", null);
        } catch (Exception ex) {
            // L'exception remonte à l'orchestrateur qui déclenchera la compensation LIFO.
            // Le RetryPolicy aura déjà épuisé ses tentatives avant d'arriver ici.
            logTransition(ctx, "${domainPascal}SagaState.STEP_${step.order}_${toConstCase(step.name)}", "FAILED", ex.getMessage());
            throw ex;
        } finally {
            log.debug("[SAGA:${domainPascal}] Step ${step.order} durée={}ms", System.currentTimeMillis() - start);
        }
    }`;
}

function buildCompensationMethod(step: SagaStep, domainPascal: string, domain?: string): string {
  const methodName = `compensateStep${step.order}${toPascalCase(step.name)}`;
  const comp = step.compensation;

  // v8.2 STEP 3: Utiliser le compensation-mapper si un mapping existe
  const mappedCompBody = domain ? getCompensationBody(domain, step.order) : null;

  const sqlHintComment = comp?.sqlHint ? `\n     * <p>Indice SQL: <code>${comp.sqlHint}</code></p>` : '';

  // Build the compensation body block
  let compensationBodyBlock: string;
  if (mappedCompBody) {
    compensationBodyBlock = mappedCompBody.split("\n").map(line => line.trimEnd()).join("\n");
  } else {
    compensationBodyBlock = `
            log.warn("[SAGA:${domainPascal}] Compensation step ${step.order} \u2014 ${comp?.method || step.name}");

            // TODO: Impl\u00e9menter la compensation (action inverse du step ${step.order})
            //
            // Exemple :
            //   ${comp?.method || "compensate"}(ctx);
            //
            // La compensation doit \u00eatre IDEMPOTENTE : si elle est appel\u00e9e
            // plusieurs fois (retry), le r\u00e9sultat doit \u00eatre identique.

            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`;
  }

  return `    /**
     * Compensation du Step ${step.order}: ${step.label}
     *
     * <p><b>R\u00f4le :</b> ${comp?.description || "Annuler les effets du step " + step.order + " pour restaurer l'\u00e9tat coh\u00e9rent."}</p>
     *${sqlHintComment}
     * <h4>M\u00e9canisme de compensation</h4>
     * <ul>
     *   <li><b>Ordre LIFO</b> \u2014 Cette compensation est appel\u00e9e en ordre inverse :
     *       si les steps 1\u21923\u21924 ont r\u00e9ussi et le step 5 \u00e9choue, on compense
     *       dans l'ordre 4\u21923\u21921 (Last In, First Out).</li>
     *   <li><b>Retry d\u00e9di\u00e9</b> \u2014 RetryPolicy.forCompensation() : 5 tentatives avec
     *       backoff multiplicateur 3x (1s \u2192 3s \u2192 9s \u2192 27s \u2192 81s). Plus agressif
     *       que le retry normal car une compensation qui \u00e9choue laisse le syst\u00e8me
     *       dans un \u00e9tat incoh\u00e9rent.</li>
     *   <li><b>Dead Letter</b> \u2014 Si la compensation \u00e9choue apr\u00e8s 5 tentatives,
     *       elle est envoy\u00e9e en Dead Letter Queue. Le SagaRecoveryScheduler
     *       la reprendra automatiquement ou une alerte sera g\u00e9n\u00e9r\u00e9e pour
     *       intervention manuelle.</li>
     * </ul>
     */
    private void ${methodName}(${domainPascal}SagaContext ctx) {
        try {${compensationBodyBlock}
        } catch (Exception ex) {
            // L'exception remonte \u00e0 l'orchestrateur pour retry via
            // RetryPolicy.forCompensation(). Apr\u00e8s \u00e9puisement des retries,
            // ce step sera envoy\u00e9 en Dead Letter Queue.
            log.error("[SAGA:${domainPascal}] \u00c9chec compensation step ${step.order} \u2014 {}", ex.getMessage());
            logTransition(ctx, "COMPENSATING", "COMPENSATION_FAILED", ex.getMessage());
            throw ex;
        }
    }`;
}

// ── ML-Enhanced Generators ────────────────────────────────────────────────────────────────

/**
 * Génère le Context POJO enrichi avec les champs découverts par le ML.
 */
function generateContextWithML(
  domainPascal: string,
  results: IntermediateResult[],
  basePackage: string,
  mlResult: SagaMLResult,
): string {
  // Collecter les champs ML découverts (en plus des champs rule-based)
  const mlFields: Array<{ name: string; type: string }> = [];
  const seenFields = new Set(results.map(r => r.fieldName));

  for (const [, enrichment] of mlResult.enrichments) {
    for (const field of enrichment.contextFields) {
      if (!seenFields.has(field.name)) {
        seenFields.add(field.name);
        mlFields.push(field);
      }
    }
  }

  // Combiner les champs rule-based + ML
  const allFieldDecls = [
    ...results.map((r) => `    private ${r.type} ${r.fieldName};`),
    ...mlFields.map((f) => `    /** Découvert par ML */\n    private ${f.type} ${f.name};`),
  ];

  const allGettersSetters = [
    ...results.map((r) => {
      const cap = r.fieldName.charAt(0).toUpperCase() + r.fieldName.slice(1);
      return `\n    public ${r.type} get${cap}() {\n        return ${r.fieldName};\n    }\n\n    public void set${cap}(${r.type} ${r.fieldName}) {\n        this.${r.fieldName} = ${r.fieldName};\n    }`;
    }),
    ...mlFields.map((f) => {
      const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
      return `\n    public ${f.type} get${cap}() {\n        return ${f.name};\n    }\n\n    public void set${cap}(${f.type} ${f.name}) {\n        this.${f.name} = ${f.name};\n    }`;
    }),
  ];

  return `package ${basePackage}.saga;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Contexte partagé entre les steps de la Saga ${domainPascal}.
 * Enrichi par ML : ${mlFields.length} champs supplémentaires découverts.
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

${allFieldDecls.join("\n")}

    // ── Constructeur ─────────────────────────────────────────────────────────────

    public ${domainPascal}SagaContext() {
        this.sagaId = java.util.UUID.randomUUID().toString();
        this.startedAt = LocalDateTime.now();
        this.currentState = ${domainPascal}SagaState.INITIATED;
        this.completedSteps = new ArrayList<>();
    }

    // ── Getters / Setters ────────────────────────────────────────────────────────

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
${allGettersSetters.join("\n")}
}
`;
}

/**
 * Génère l'Orchestrator enrichi ML.
 * Les step bodies et compensations contiennent du code métier réel
 * au lieu de TODO.
 */
function generateOrchestratorWithML(
  domainPascal: string,
  steps: SagaStep[],
  _results: IntermediateResult[],
  candidate: SagaCandidate,
  basePackage: string,
  mlResult: SagaMLResult,
): string {
  const phases = splitIntoPhases(steps);
  const compensableSteps = steps.filter((s) => s.isCompensable).reverse();
  const injections = buildInjections(steps, candidate, basePackage, candidate.domain);
  const stepMethods = steps.map((s) => buildStepMethodWithML(s, domainPascal, mlResult));
  const compensationMethods = compensableSteps.map((s) =>
    buildCompensationMethodWithML(s, domainPascal, mlResult),
  );

  const retryPolicyInit = steps.map((s) => {
    // Utiliser la recommandation ML si disponible
    const enrichment = mlResult.enrichments.get(s.order);
    const retryPolicy = enrichment?.retryRecommendation
      && enrichment.retryRecommendation.startsWith("RetryPolicy.")
      ? enrichment.retryRecommendation
      : getRetryPolicyForStep(s);
    return `        retryPolicies.put("step${s.order}", ${retryPolicy});`;
  }).join("\n");

  const phaseBlocks = phases.map((phase) => buildPhaseBlock(phase, domainPascal, candidate)).join("\n\n");
  const compensateBlock = buildCompensateWithRetry(compensableSteps, domainPascal);

  const mlStatsComment = `\n * ML Enrichment: ${mlResult.stats.mlEnriched} steps enrichis par ML, ${mlResult.stats.fallbackUsed} fallback rule-based`;

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
 *   - Retry + backoff exponentiel par step
 *   - Circuit breaker par service distant
 *   - Savepoints pour rollback granulaire
 *   - Compensation avec retry dédié + dead letter
 *   - Recovery pour les Sagas orphelines${mlStatsComment}
 *
 * Source EJB : ${candidate.className}
 * Généré automatiquement par Compleo (ML-Enhanced) — NE PAS MODIFIER.
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

        // ── Retry policies par step ───────────────────────────────────────
${retryPolicyInit}
    }

    // ── Point d'entrée ─────────────────────────────────────────────────────────

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ${domainPascal}SagaContext execute(${candidate.inputType} input) {
        ${domainPascal}SagaContext ctx = new ${domainPascal}SagaContext();
        log.info("[SAGA:{}] Démarrage saga {} — sagaId={}", "${domainPascal}", "${domainPascal}", ctx.getSagaId());
        persistSagaState(ctx);

        try {
${phaseBlocks}

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

            compensate(ctx);
        }

        sagaStateStore.markCompleted(ctx.getSagaId(), ctx.getCurrentState().name());
        return ctx;
    }

    // ── Compensation LIFO avec retry dédié ──────────────────────────────

${compensateBlock}

    // ── Steps (ML-Enhanced) ───────────────────────────────────────────────────

${stepMethods.join("\n\n")}

    // ── Compensations (ML-Enhanced) ──────────────────────────────────────────

${compensationMethods.join("\n\n")}

    // ── Persistance état + heartbeat ────────────────────────────────────────

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

    /**
     * Envoie les compensations échouées vers la Dead Letter Queue.
     *
     * <p><b>Dead Letter Queue (DLQ)</b> : file d'attente pour les compensations
     * qui ont échoué après tous les retries (RetryPolicy.forCompensation()).
     * Le SagaRecoveryScheduler analyse périodiquement la DLQ pour :</p>
     * <ul>
     *   <li>Retenter automatiquement les compensations (après un délai)</li>
     *   <li>Générer une alerte pour intervention manuelle si le retry échoue encore</li>
     * </ul>
     *
     * <p><b>ALERTE CRITIQUE</b> : une compensation en DLQ signifie que le système
     * est dans un état incohérent. L'équipe ops doit intervenir rapidement.</p>
     */
    private void sendToDeadLetter(${domainPascal}SagaContext ctx, List<String> failedCompensations) {
        log.error("[SAGA:{}] DEAD LETTER — {} compensations échouées: {}",
            "${domainPascal}", failedCompensations.size(), failedCompensations);
        persistSagaState(ctx);
    }

    /**
     * Trace une transition d'état dans les logs.
     * Format : [SAGA:Domain] État_actuel → Nouvel_état [STATUS] message_erreur
     * Utilisé pour le monitoring et le débogage des Sagas en production.
     */
    private void logTransition(${domainPascal}SagaContext ctx, String stateTo, String status, String error) {
        log.debug("[SAGA:{}] {} → {} [{}] {}", "${domainPascal}", ctx.getCurrentState(), stateTo, status, error != null ? error : "");
    }
}
`;
}

/**
 * Step method enrichi ML : le corps contient du code métier réel.
 */
function buildStepMethodWithML(step: SagaStep, domainPascal: string, mlResult: SagaMLResult): string {
  const methodName = `step${step.order}${toPascalCase(step.name)}`;
  const asyncTag = step.isAsync ? " [ASYNC]" : "";
  const criticalTag = step.isCritical ? " [CRITICAL]" : "";
  const enrichment = mlResult.enrichments.get(step.order);
  const source = mlResult.sources.get(step.order) || "fallback";

  // Préconditions en commentaire Javadoc
  const preconditions = enrichment?.preconditions?.length
    ? enrichment.preconditions.map(p => `     *   - ${p}`).join("\n")
    : "     *   - context != null";

  // Postconditions en commentaire Javadoc
  const postconditions = enrichment?.postconditions?.length
    ? enrichment.postconditions.map(p => `     *   - ${p}`).join("\n")
    : "     *   - Step complété";

  // Corps du step (ML ou fallback)
  const stepBody = enrichment?.stepBody
    ? indentCode(enrichment.stepBody, 12)
    : `            // TODO: Implémenter l'appel au service ${step.targetService || "local"}`;

  return `    /**
     * Step ${step.order}: ${step.label}${asyncTag}${criticalTag}
     * Type: ${step.type} | Compensable: ${step.isCompensable}
     * Source: ${source} | Retry: ${getRetryPolicyForStep(step)}
     * ${step.sourceComment}
     *
     * Préconditions:
${preconditions}
     * Postconditions:
${postconditions}
     */
    private void ${methodName}(${domainPascal}SagaContext ctx) {
        log.info("[SAGA:${domainPascal}] Step ${step.order} — ${step.label}");
        long start = System.currentTimeMillis();
        try {
${stepBody}
            logTransition(ctx, "${domainPascal}SagaState.STEP_${step.order}_${toConstCase(step.name)}", "SUCCESS", null);
        } catch (Exception ex) {
            logTransition(ctx, "${domainPascal}SagaState.STEP_${step.order}_${toConstCase(step.name)}", "FAILED", ex.getMessage());
            throw ex;
        } finally {
            log.debug("[SAGA:${domainPascal}] Step ${step.order} durée={}ms", System.currentTimeMillis() - start);
        }
    }`;
}

/**
 * Compensation method enrichie ML : le corps contient l'action inverse concrète.
 */
function buildCompensationMethodWithML(step: SagaStep, domainPascal: string, mlResult: SagaMLResult): string {
  const methodName = `compensateStep${step.order}${toPascalCase(step.name)}`;
  const comp = step.compensation;
  const enrichment = mlResult.enrichments.get(step.order);
  const source = mlResult.sources.get(step.order) || "fallback";

  // Corps de la compensation (ML ou fallback)
  const compensationBody = enrichment?.compensationBody
    && enrichment.compensationBody.trim().length > 0
    && !/^\s*\/\/\s*(TODO|non compensable)/i.test(enrichment.compensationBody)
    ? indentCode(enrichment.compensationBody, 12)
    : `            // TODO: Implémenter la compensation\n            // ${comp?.method || "compensate"}(ctx);`;

  return `    /**
     * Compensation Step ${step.order}: ${step.label}
     * ${comp?.description || "Compensation générique"}
     * Source: ${source}
     * Retry: RetryPolicy.forCompensation() (5 tentatives, backoff 3x)
     */
    private void ${methodName}(${domainPascal}SagaContext ctx) {
        try {
            log.warn("[SAGA:${domainPascal}] Compensation step ${step.order} — ${comp?.method || step.name}");
${compensationBody}
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);
        } catch (Exception ex) {
            log.error("[SAGA:${domainPascal}] Échec compensation step ${step.order} — {}", ex.getMessage());
            logTransition(ctx, "COMPENSATING", "COMPENSATION_FAILED", ex.getMessage());
            throw ex;
        }
    }`;
}

/**
 * Indente un bloc de code Java avec le nombre d'espaces spécifié.
 */
function indentCode(code: string, spaces: number): string {
  const indent = " ".repeat(spaces);
  return code
    .split("\n")
    .map(line => line.trim() ? `${indent}${line.trim()}` : "")
    .join("\n");
}

// ── Utilitaires ──────────────────────────────────────────────────────────────────────────────

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

/**
 * Converts a label to PascalCase with ASCII transliteration.
 * BUG-3 fix: accented chars are transliterated to ASCII before conversion.
 * "vérification-éligibilité-kyc" → "VerificationEligibiliteKyc"
 */
function toPascalCase(s: string): string {
  return transliterateToAscii(s)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/**
 * Transliterates French accented characters to ASCII equivalents.
 * Shared by toPascalCase, toConstCase, and toCamelCase.
 */
function transliterateToAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // Strip combining diacritical marks
    .replace(/\u0153/g, "oe")          // œ ligature
    .replace(/\u00e6/g, "ae")          // æ ligature
    .replace(/\u00c6/g, "AE")
    .replace(/\u0152/g, "OE")
    .replace(/\u00e7/g, "c")           // ç
    .replace(/\u00c7/g, "C");
}

/**
 * Converts a label to camelCase with ASCII transliteration.
 * Used for Java method names in compensations.
 */
function toCamelCase(s: string): string {
  const pascal = toPascalCase(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Post-Audit STEP 5: ASCII-only constant names for Java enums.
 * Transliterates accented characters before stripping non-ASCII.
 * "Vérification KYC" → "VERIFICATION_KYC" (not "V_RIFICATION_KYC")
 * "Décaissement" → "DECAISSEMENT"
 */
function toConstCase(s: string): string {
  return transliterateToAscii(s)
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase()
    .replace(/^_|_$/g, "")
    .replace(/_{2,}/g, "_");
}

function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * v8.1 BUG-1 fix: Déduplique les candidats par domaine.
 *
 * Quand le détecteur crée un candidat par méthode (ex: 3 méthodes du même EJB
 * génèrent 3 candidats "credit"), on ne garde que le candidat le plus riche
 * pour chaque domaine (celui avec le plus de writeOperations, puis le plus de
 * dépendances inter-services).
 *
 * Cela évite les fichiers dupliqués (CreditSagaState.java x3) et les paths
 * de migration SQL en conflit.
 */
function deduplicateCandidatesByDomain(candidates: SagaCandidate[]): SagaCandidate[] {
  const byDomain = new Map<string, SagaCandidate>();

  for (const c of candidates) {
    const existing = byDomain.get(c.domain);
    if (!existing) {
      byDomain.set(c.domain, c);
    } else {
      // Garder le candidat le plus riche :
      // 1. Plus de writeOperations
      // 2. Plus de dépendances inter-services
      // 3. Plus de code source (rawSource plus long)
      const score = (cand: SagaCandidate) =>
        cand.writeOperations.length * 100 +
        cand.interServiceCount * 10 +
        cand.rawSource.length / 1000;
      if (score(c) > score(existing)) {
        byDomain.set(c.domain, c);
      }
    }
  }

  return [...byDomain.values()];
}

/**
 * Exported for testing.
 */
export { deduplicateCandidatesByDomain };
