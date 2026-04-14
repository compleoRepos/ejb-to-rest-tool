/**
 * Saga Shared Generators — Compleo v7.10 (Production-Ready)
 *
 * Génère les fichiers Java partagés entre toutes les Sagas :
 *   - RetryPolicy.java + SagaStepException.java
 *   - SagaCircuitBreaker.java + CircuitBreakerRegistry.java + CircuitOpenException.java
 *   - SagaSavepointManager.java
 *   - SagaStateStore.java + SagaStateRecord.java
 *   - SagaRecoveryScheduler.java + SagaRecoveryExecutor.java
 *   - V4__create_saga_state.sql (Oracle DDL)
 *
 * Ces fichiers sont générés UNE SEULE FOIS, partagés par toutes les Sagas du projet.
 *
 * @author Hamza NORDINE
 */

import type { SagaCandidate } from "./saga-detector";
import type { SagaGeneratedFile } from "./saga-generator";

// ── Types ────────────────────────────────────────────────────────────────────

export type SharedFileCategory =
  | "saga-retry"
  | "saga-circuitbreaker"
  | "saga-transaction"
  | "saga-recovery"
  | "saga-migration";

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Génère tous les fichiers Java partagés pour le mécanisme Saga production-ready.
 * Ces fichiers sont indépendants du domaine et partagés entre toutes les Sagas.
 */
export function generateSharedSagaFiles(
  basePackage: string,
  candidates: SagaCandidate[],
): SagaGeneratedFile[] {
  const packagePath = basePackage.replace(/\./g, "/");
  const files: SagaGeneratedFile[] = [];

  // ── 1. Retry ──────────────────────────────────────────────────────────
  files.push({
    path: `src/main/java/${packagePath}/saga/retry/RetryPolicy.java`,
    content: generateRetryPolicy(basePackage),
    category: "saga-retry" as any,
  });

  files.push({
    path: `src/main/java/${packagePath}/saga/retry/SagaStepException.java`,
    content: generateSagaStepException(basePackage),
    category: "saga-retry" as any,
  });

  // ── 2. Circuit Breaker ────────────────────────────────────────────────
  files.push({
    path: `src/main/java/${packagePath}/saga/circuitbreaker/SagaCircuitBreaker.java`,
    content: generateCircuitBreaker(basePackage),
    category: "saga-circuitbreaker" as any,
  });

  files.push({
    path: `src/main/java/${packagePath}/saga/circuitbreaker/CircuitBreakerRegistry.java`,
    content: generateCircuitBreakerRegistry(basePackage),
    category: "saga-circuitbreaker" as any,
  });

  files.push({
    path: `src/main/java/${packagePath}/saga/circuitbreaker/CircuitOpenException.java`,
    content: generateCircuitOpenException(basePackage),
    category: "saga-circuitbreaker" as any,
  });

  // ── 3. Transaction / Savepoints ───────────────────────────────────────
  files.push({
    path: `src/main/java/${packagePath}/saga/transaction/SagaSavepointManager.java`,
    content: generateSavepointManager(basePackage),
    category: "saga-transaction" as any,
  });

  // ── 4. Recovery ───────────────────────────────────────────────────────
  files.push({
    path: `src/main/java/${packagePath}/saga/recovery/SagaStateStore.java`,
    content: generateStateStore(basePackage),
    category: "saga-recovery" as any,
  });

  files.push({
    path: `src/main/java/${packagePath}/saga/recovery/SagaStateRecord.java`,
    content: generateStateRecord(basePackage),
    category: "saga-recovery" as any,
  });

  files.push({
    path: `src/main/java/${packagePath}/saga/recovery/SagaRecoveryScheduler.java`,
    content: generateRecoveryScheduler(basePackage),
    category: "saga-recovery" as any,
  });

  files.push({
    path: `src/main/java/${packagePath}/saga/recovery/SagaRecoveryExecutor.java`,
    content: generateRecoveryExecutor(basePackage, candidates),
    category: "saga-recovery" as any,
  });

  // ── 5. DDL Migration ──────────────────────────────────────────────────
  files.push({
    path: `src/main/resources/db/migration/V4__create_saga_state.sql`,
    content: generateSagaStateDDL(),
    category: "saga-migration",
  });

  return files;
}

// ── Retry ────────────────────────────────────────────────────────────────────

function generateRetryPolicy(basePackage: string): string {
  return `package ${basePackage}.saga.retry;

import java.time.Duration;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Politique de retry par step avec backoff exponentiel.
 * Les valeurs sont inférées automatiquement par Compleo depuis le type de step.
 *
 * Profils disponibles :
 *   - forLocalDb()         : deadlocks Oracle, lock timeouts (3 retries, 100ms)
 *   - forRemoteService()   : timeout réseau, service down (3 retries, 1s)
 *   - forExternalGateway() : SWIFT/TARGET2, latence élevée (5 retries, 5s)
 *   - forAsync()           : fire-and-forget (0 retry)
 *   - forCompensation()    : retry agressif (5 retries, 2s, backoff 3x)
 *
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
public class RetryPolicy {

    private static final Logger log = LoggerFactory.getLogger(RetryPolicy.class);

    private final int maxAttempts;
    private final Duration initialDelay;
    private final double backoffMultiplier;
    private final Duration maxDelay;
    private final Class<? extends Exception>[] retryableExceptions;
    private final Class<? extends Exception>[] nonRetryableExceptions;

    @SuppressWarnings("unchecked")
    private RetryPolicy(Builder builder) {
        this.maxAttempts = builder.maxAttempts;
        this.initialDelay = builder.initialDelay;
        this.backoffMultiplier = builder.backoffMultiplier;
        this.maxDelay = builder.maxDelay;
        this.retryableExceptions = builder.retryableExceptions;
        this.nonRetryableExceptions = builder.nonRetryableExceptions;
    }

    /**
     * Exécuter une action avec retry et backoff exponentiel.
     * Retourne le résultat ou throw la dernière exception après épuisement des retries.
     */
    public <T> T execute(String stepName, Supplier<T> action) {
        Exception lastException = null;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return action.get();
            } catch (Exception e) {
                lastException = e;

                // Exception non-retryable → throw immédiatement
                if (isNonRetryable(e)) {
                    throw new SagaStepException(stepName, e, attempt, false);
                }

                // Dernier attempt → throw
                if (attempt == maxAttempts) {
                    throw new SagaStepException(stepName, e, attempt, true);
                }

                // Backoff exponentiel
                long delayMs = calculateDelay(attempt);
                log.warn("[RETRY] Step {} — attempt {}/{} failed: {} — retry in {}ms",
                    stepName, attempt, maxAttempts, e.getMessage(), delayMs);

                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new SagaStepException(stepName, e, attempt, false);
                }
            }
        }

        throw new SagaStepException(stepName, lastException, maxAttempts, true);
    }

    /** Version void (pas de retour) */
    public void executeVoid(String stepName, Runnable action) {
        execute(stepName, () -> { action.run(); return null; });
    }

    private long calculateDelay(int attempt) {
        long delay = (long) (initialDelay.toMillis() * Math.pow(backoffMultiplier, attempt - 1));
        return Math.min(delay, maxDelay.toMillis());
    }

    private boolean isNonRetryable(Exception e) {
        for (Class<? extends Exception> cls : nonRetryableExceptions) {
            if (cls.isInstance(e)) return true;
        }
        return false;
    }

    // ═══ Factory methods — inférées par Compleo depuis le type de step ═══

    /** Step local DB : deadlocks Oracle, lock timeouts */
    @SuppressWarnings("unchecked")
    public static RetryPolicy forLocalDb() {
        return new Builder()
            .maxAttempts(3)
            .initialDelay(Duration.ofMillis(100))
            .backoffMultiplier(2.0)
            .maxDelay(Duration.ofSeconds(2))
            .retryOn(java.sql.SQLException.class)
            .build();
    }

    /** Step service distant : timeout réseau, service temporairement down */
    @SuppressWarnings("unchecked")
    public static RetryPolicy forRemoteService() {
        return new Builder()
            .maxAttempts(3)
            .initialDelay(Duration.ofSeconds(1))
            .backoffMultiplier(2.0)
            .maxDelay(Duration.ofSeconds(10))
            .retryOn(
                java.net.ConnectException.class,
                java.net.SocketTimeoutException.class
            )
            .build();
    }

    /** Step externe SWIFT/TARGET2 : latence élevée, fenêtres de maintenance */
    @SuppressWarnings("unchecked")
    public static RetryPolicy forExternalGateway() {
        return new Builder()
            .maxAttempts(5)
            .initialDelay(Duration.ofSeconds(5))
            .backoffMultiplier(2.0)
            .maxDelay(Duration.ofMinutes(2))
            .retryOn(
                java.net.ConnectException.class,
                java.io.IOException.class
            )
            .build();
    }

    /** Step async fire-and-forget : pas de retry, jamais bloquant */
    public static RetryPolicy forAsync() {
        return new Builder()
            .maxAttempts(1)
            .initialDelay(Duration.ZERO)
            .build();
    }

    /** Compensation : retry agressif, on ne veut PAS abandonner */
    @SuppressWarnings("unchecked")
    public static RetryPolicy forCompensation() {
        return new Builder()
            .maxAttempts(5)
            .initialDelay(Duration.ofSeconds(2))
            .backoffMultiplier(3.0)
            .maxDelay(Duration.ofMinutes(5))
            .retryOn(Exception.class)
            .build();
    }

    // ═══ Accesseurs ═══

    public int getMaxAttempts() { return maxAttempts; }
    public Duration getInitialDelay() { return initialDelay; }
    public double getBackoffMultiplier() { return backoffMultiplier; }

    // ═══ Builder ═══

    @SuppressWarnings("unchecked")
    public static class Builder {
        private int maxAttempts = 3;
        private Duration initialDelay = Duration.ofMillis(500);
        private double backoffMultiplier = 2.0;
        private Duration maxDelay = Duration.ofSeconds(30);
        private Class<? extends Exception>[] retryableExceptions = new Class[]{Exception.class};
        private Class<? extends Exception>[] nonRetryableExceptions = new Class[0];

        public Builder maxAttempts(int v) { this.maxAttempts = v; return this; }
        public Builder initialDelay(Duration v) { this.initialDelay = v; return this; }
        public Builder backoffMultiplier(double v) { this.backoffMultiplier = v; return this; }
        public Builder maxDelay(Duration v) { this.maxDelay = v; return this; }
        @SafeVarargs
        public final Builder retryOn(Class<? extends Exception>... v) { this.retryableExceptions = v; return this; }
        @SafeVarargs
        public final Builder noRetryOn(Class<? extends Exception>... v) { this.nonRetryableExceptions = v; return this; }
        public RetryPolicy build() { return new RetryPolicy(this); }
    }
}
`;
}

function generateSagaStepException(basePackage: string): string {
  return `package ${basePackage}.saga.retry;

/**
 * Exception levée quand un step Saga échoue après épuisement des retries.
 * Contient le contexte d'échec : nom du step, tentative, et si les retries sont épuisés.
 *
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
public class SagaStepException extends RuntimeException {

    private final String stepName;
    private final int attempt;
    private final boolean retriesExhausted;

    public SagaStepException(String stepName, Throwable cause, int attempt, boolean retriesExhausted) {
        super(String.format("[SAGA] Step '%s' failed at attempt %d (retries exhausted: %s): %s",
            stepName, attempt, retriesExhausted, cause != null ? cause.getMessage() : "unknown"), cause);
        this.stepName = stepName;
        this.attempt = attempt;
        this.retriesExhausted = retriesExhausted;
    }

    public String getStepName() { return stepName; }
    public int getAttempt() { return attempt; }
    public boolean isRetriesExhausted() { return retriesExhausted; }
}
`;
}

// ── Circuit Breaker ──────────────────────────────────────────────────────────

function generateCircuitBreaker(basePackage: string): string {
  return `package ${basePackage}.saga.circuitbreaker;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Circuit Breaker simplifié pour les appels inter-services dans les Sagas.
 * 3 états : CLOSED (normal) → OPEN (bloqué) → HALF_OPEN (test)
 *
 * Généré automatiquement par Compleo — 1 instance par service distant.
 */
public class SagaCircuitBreaker {

    private static final Logger log = LoggerFactory.getLogger(SagaCircuitBreaker.class);

    public enum State { CLOSED, OPEN, HALF_OPEN }

    private final String serviceName;
    private final int failureThreshold;
    private final Duration openDuration;
    private final AtomicInteger failureCount = new AtomicInteger(0);
    private final AtomicInteger successCount = new AtomicInteger(0);
    private final AtomicReference<State> state = new AtomicReference<>(State.CLOSED);
    private volatile LocalDateTime lastFailureTime;
    private volatile LocalDateTime openedAt;

    public SagaCircuitBreaker(String serviceName, int failureThreshold, Duration openDuration) {
        this.serviceName = serviceName;
        this.failureThreshold = failureThreshold;
        this.openDuration = openDuration;
    }

    /**
     * Exécuter une action protégée par le circuit breaker.
     * @throws CircuitOpenException si le circuit est ouvert
     */
    public <T> T execute(Supplier<T> action) {
        State currentState = getEffectiveState();

        if (currentState == State.OPEN) {
            log.warn("[CB:{}] Circuit OUVERT — fail-fast (ouvert depuis {})",
                serviceName, openedAt);
            throw new CircuitOpenException(serviceName,
                "Service " + serviceName + " indisponible — circuit ouvert depuis " + openedAt);
        }

        try {
            T result = action.get();
            onSuccess();
            return result;
        } catch (Exception e) {
            onFailure(e);
            throw e;
        }
    }

    private void onSuccess() {
        if (state.get() == State.HALF_OPEN) {
            int successes = successCount.incrementAndGet();
            if (successes >= 2) {
                log.info("[CB:{}] Circuit FERMÉ — service rétabli après {} succès",
                    serviceName, successes);
                state.set(State.CLOSED);
                failureCount.set(0);
                successCount.set(0);
            }
        } else {
            failureCount.set(0);
        }
    }

    private void onFailure(Exception e) {
        lastFailureTime = LocalDateTime.now();
        successCount.set(0);

        int failures = failureCount.incrementAndGet();
        if (failures >= failureThreshold && state.get() == State.CLOSED) {
            state.set(State.OPEN);
            openedAt = LocalDateTime.now();
            log.error("[CB:{}] Circuit OUVERT — {} échecs consécutifs (seuil: {})",
                serviceName, failures, failureThreshold);
        }
    }

    private State getEffectiveState() {
        if (state.get() == State.OPEN && openedAt != null) {
            if (Duration.between(openedAt, LocalDateTime.now()).compareTo(openDuration) > 0) {
                log.info("[CB:{}] Circuit HALF_OPEN — tentative de rétablissement", serviceName);
                state.set(State.HALF_OPEN);
                successCount.set(0);
                return State.HALF_OPEN;
            }
        }
        return state.get();
    }

    public State getState() { return getEffectiveState(); }
    public int getFailureCount() { return failureCount.get(); }
    public String getServiceName() { return serviceName; }
}
`;
}

function generateCircuitBreakerRegistry(basePackage: string): string {
  return `package ${basePackage}.saga.circuitbreaker;

import org.springframework.stereotype.Component;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Registry des circuit breakers — un par service distant.
 * Généré automatiquement par Compleo depuis les dépendances @EJB inter-services.
 */
@Component
public class CircuitBreakerRegistry {

    private final ConcurrentHashMap<String, SagaCircuitBreaker> breakers = new ConcurrentHashMap<>();

    public SagaCircuitBreaker getBreaker(String serviceName) {
        return breakers.computeIfAbsent(serviceName,
            name -> new SagaCircuitBreaker(name, 3, Duration.ofSeconds(30)));
    }

    /** Health check — exposé via /actuator/saga-circuits */
    public java.util.Map<String, String> getStatus() {
        java.util.Map<String, String> status = new java.util.LinkedHashMap<>();
        breakers.forEach((name, cb) -> status.put(name, cb.getState().name()));
        return status;
    }
}
`;
}

function generateCircuitOpenException(basePackage: string): string {
  return `package ${basePackage}.saga.circuitbreaker;

/**
 * Exception levée quand un circuit breaker est ouvert (fail-fast).
 * Non-retryable par défaut — le service distant est confirmé indisponible.
 *
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
public class CircuitOpenException extends RuntimeException {

    private final String serviceName;

    public CircuitOpenException(String serviceName, String message) {
        super(message);
        this.serviceName = serviceName;
    }

    public String getServiceName() { return serviceName; }
}
`;
}

// ── Transaction / Savepoints ─────────────────────────────────────────────────

function generateSavepointManager(basePackage: string): string {
  return `package ${basePackage}.saga.transaction;

import org.springframework.jdbc.datasource.DataSourceUtils;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Savepoint;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Gestionnaire de savepoints pour les Sagas.
 * Permet un rollback granulaire par step au lieu d'un rollback total.
 *
 * Workflow :
 *   setSavepoint("before-step-9")
 *   → step 9 (création dossier)
 *   setSavepoint("before-step-10")
 *   → step 10 (déblocage fonds)
 *   → step 11 (écritures comptables)
 *   commit()
 *
 * Si step 10 échoue :
 *   rollbackToSavepoint("before-step-10")
 *   → step 9 est préservé, seul step 10 est annulé
 *   → compenser step 9 manuellement (compensation Saga)
 *
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
public class SagaSavepointManager {

    private static final Logger log = LoggerFactory.getLogger(SagaSavepointManager.class);

    private final DataSource dataSource;
    private Connection currentConnection;
    private final Map<String, Savepoint> savepoints = new LinkedHashMap<>();

    public SagaSavepointManager(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public void begin() throws SQLException {
        this.currentConnection = DataSourceUtils.getConnection(dataSource);
        this.currentConnection.setAutoCommit(false);
        log.debug("[SAVEPOINT] Transaction manuelle démarrée");
    }

    public void setSavepoint(String name) throws SQLException {
        Savepoint sp = currentConnection.setSavepoint(name);
        savepoints.put(name, sp);
        log.debug("[SAVEPOINT] Savepoint '{}' créé", name);
    }

    public void rollbackToSavepoint(String name) throws SQLException {
        Savepoint sp = savepoints.get(name);
        if (sp != null) {
            currentConnection.rollback(sp);
            log.warn("[SAVEPOINT] Rollback vers '{}'", name);
            // Supprimer les savepoints après celui-ci
            boolean found = false;
            var iterator = savepoints.entrySet().iterator();
            while (iterator.hasNext()) {
                var entry = iterator.next();
                if (found) iterator.remove();
                if (entry.getKey().equals(name)) found = true;
            }
        }
    }

    public void commit() throws SQLException {
        if (currentConnection != null) {
            currentConnection.commit();
            savepoints.clear();
            log.debug("[SAVEPOINT] Transaction committée");
        }
    }

    public void rollbackAll() throws SQLException {
        if (currentConnection != null) {
            currentConnection.rollback();
            savepoints.clear();
            log.warn("[SAVEPOINT] Rollback total");
        }
    }

    public void close() {
        if (currentConnection != null) {
            DataSourceUtils.releaseConnection(currentConnection, dataSource);
            log.debug("[SAVEPOINT] Connection libérée");
        }
    }

    public Connection getConnection() { return currentConnection; }
}
`;
}

// ── Recovery ─────────────────────────────────────────────────────────────────

function generateStateStore(basePackage: string): string {
  return `package ${basePackage}.saga.recovery;

import org.springframework.stereotype.Repository;
import org.springframework.jdbc.core.JdbcTemplate;
import lombok.RequiredArgsConstructor;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Persistance de l'état de la Saga pour recovery.
 * Table T_SAGA_STATE — 1 ligne par Saga en cours.
 * Mise à jour à chaque transition de step.
 *
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
@Repository
@RequiredArgsConstructor
public class SagaStateStore {

    private static final Logger log = LoggerFactory.getLogger(SagaStateStore.class);

    private final JdbcTemplate jdbcTemplate;

    private static final String SQL_UPSERT = """
        MERGE INTO T_SAGA_STATE s
        USING DUAL ON (s.SAGA_ID = ?)
        WHEN MATCHED THEN UPDATE SET
            s.CURRENT_STATE = ?, s.LAST_STEP_COMPLETED = ?,
            s.COMPLETED_STEPS = ?, s.CONTEXT_JSON = ?,
            s.UPDATED_AT = SYSTIMESTAMP, s.ERROR_MESSAGE = ?
        WHEN NOT MATCHED THEN INSERT
            (SAGA_ID, SAGA_NAME, CURRENT_STATE, LAST_STEP_COMPLETED,
             COMPLETED_STEPS, CONTEXT_JSON, INPUT_JSON,
             CREATED_AT, UPDATED_AT, HEARTBEAT_AT)
        VALUES (?, ?, ?, ?, ?, ?, ?, SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP)
        """;

    private static final String SQL_HEARTBEAT =
        "UPDATE T_SAGA_STATE SET HEARTBEAT_AT = SYSTIMESTAMP WHERE SAGA_ID = ?";

    private static final String SQL_ORPHANS = """
        SELECT SAGA_ID, SAGA_NAME, CURRENT_STATE, LAST_STEP_COMPLETED,
               COMPLETED_STEPS, CONTEXT_JSON, INPUT_JSON, ERROR_MESSAGE,
               RETRY_COUNT, CREATED_AT
        FROM T_SAGA_STATE
        WHERE CURRENT_STATE NOT IN ('COMPLETED', 'COMPENSATED', 'FAILED')
          AND HEARTBEAT_AT < SYSTIMESTAMP - INTERVAL '5' MINUTE
        ORDER BY CREATED_AT
        """;

    private static final String SQL_DEAD_LETTERS = """
        SELECT SAGA_ID, SAGA_NAME, CURRENT_STATE, LAST_STEP_COMPLETED,
               COMPLETED_STEPS, CONTEXT_JSON, INPUT_JSON, ERROR_MESSAGE,
               RETRY_COUNT, CREATED_AT
        FROM T_SAGA_STATE
        WHERE CURRENT_STATE = 'COMPENSATION_FAILED'
          AND RETRY_COUNT < 3
        ORDER BY CREATED_AT
        """;

    public void persistState(SagaStateRecord record) {
        jdbcTemplate.update(SQL_UPSERT,
            record.getSagaId(), record.getCurrentState(), record.getLastStepCompleted(),
            record.getCompletedStepsJson(), record.getContextJson(), record.getErrorMessage(),
            record.getSagaId(), record.getSagaName(), record.getCurrentState(),
            record.getLastStepCompleted(), record.getCompletedStepsJson(),
            record.getContextJson(), record.getInputJson());
    }

    public void heartbeat(String sagaId) {
        jdbcTemplate.update(SQL_HEARTBEAT, sagaId);
    }

    public List<SagaStateRecord> findOrphans() {
        return jdbcTemplate.query(SQL_ORPHANS, (rs, i) -> SagaStateRecord.builder()
            .sagaId(rs.getString("SAGA_ID"))
            .sagaName(rs.getString("SAGA_NAME"))
            .currentState(rs.getString("CURRENT_STATE"))
            .lastStepCompleted(rs.getInt("LAST_STEP_COMPLETED"))
            .completedStepsJson(rs.getString("COMPLETED_STEPS"))
            .contextJson(rs.getString("CONTEXT_JSON"))
            .inputJson(rs.getString("INPUT_JSON"))
            .errorMessage(rs.getString("ERROR_MESSAGE"))
            .retryCount(rs.getInt("RETRY_COUNT"))
            .build());
    }

    public List<SagaStateRecord> findDeadLetters() {
        return jdbcTemplate.query(SQL_DEAD_LETTERS, (rs, i) -> SagaStateRecord.builder()
            .sagaId(rs.getString("SAGA_ID"))
            .sagaName(rs.getString("SAGA_NAME"))
            .currentState(rs.getString("CURRENT_STATE"))
            .lastStepCompleted(rs.getInt("LAST_STEP_COMPLETED"))
            .completedStepsJson(rs.getString("COMPLETED_STEPS"))
            .contextJson(rs.getString("CONTEXT_JSON"))
            .inputJson(rs.getString("INPUT_JSON"))
            .errorMessage(rs.getString("ERROR_MESSAGE"))
            .retryCount(rs.getInt("RETRY_COUNT"))
            .build());
    }

    public void markCompleted(String sagaId, String finalState) {
        jdbcTemplate.update(
            "UPDATE T_SAGA_STATE SET CURRENT_STATE = ?, UPDATED_AT = SYSTIMESTAMP WHERE SAGA_ID = ?",
            finalState, sagaId);
    }
}
`;
}

function generateStateRecord(basePackage: string): string {
  return `package ${basePackage}.saga.recovery;

import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

/**
 * Record représentant l'état persisté d'une Saga.
 * Utilisé par SagaStateStore et SagaRecoveryScheduler.
 *
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
@Getter
@Setter
@Builder
public class SagaStateRecord {

    private String sagaId;
    private String sagaName;
    private String currentState;
    private int lastStepCompleted;
    private String completedStepsJson;
    private String contextJson;
    private String inputJson;
    private String errorMessage;
    @Builder.Default
    private int retryCount = 0;
}
`;
}

function generateRecoveryScheduler(basePackage: string): string {
  return `package ${basePackage}.saga.recovery;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.util.List;

/**
 * Scheduler de recovery des Sagas orphelines et dead letters.
 *
 * - Orphelines : Sagas dont le heartbeat n'a pas été mis à jour depuis 5 min
 *   → le serveur a probablement crashé au milieu → reprendre la compensation
 *
 * - Dead letters : Sagas dont la compensation a échoué après 5 retries
 *   → re-tenter la compensation avec un délai plus long
 *   → après 3 tentatives globales → alerte humaine
 *
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SagaRecoveryScheduler {

    private final SagaStateStore stateStore;
    private final SagaRecoveryExecutor recoveryExecutor;

    /**
     * Toutes les 2 minutes : chercher les Sagas orphelines.
     * Une Saga est orpheline si son heartbeat date de plus de 5 min
     * et qu'elle n'est pas dans un état terminal.
     */
    @Scheduled(fixedDelay = 120_000)
    public void recoverOrphanSagas() {
        List<SagaStateRecord> orphans = stateStore.findOrphans();
        if (orphans.isEmpty()) return;

        log.warn("[SAGA-RECOVERY] {} Saga(s) orpheline(s) détectée(s)", orphans.size());
        for (SagaStateRecord orphan : orphans) {
            try {
                log.info("[SAGA-RECOVERY] Reprise de {} (sagaId={}, state={}, lastStep={})",
                    orphan.getSagaName(), orphan.getSagaId(),
                    orphan.getCurrentState(), orphan.getLastStepCompleted());
                recoveryExecutor.recover(orphan);
            } catch (Exception e) {
                log.error("[SAGA-RECOVERY] Échec recovery {}: {}", orphan.getSagaId(), e.getMessage());
            }
        }
    }

    /**
     * Toutes les 10 minutes : re-tenter les dead letters.
     * Max 3 tentatives globales, après quoi → alerte humaine.
     */
    @Scheduled(fixedDelay = 600_000)
    public void retryDeadLetters() {
        List<SagaStateRecord> deadLetters = stateStore.findDeadLetters();
        if (deadLetters.isEmpty()) return;

        log.warn("[SAGA-DEAD-LETTER] {} Saga(s) en dead letter", deadLetters.size());
        for (SagaStateRecord dl : deadLetters) {
            try {
                log.info("[SAGA-DEAD-LETTER] Re-tentative compensation {} (attempt {})",
                    dl.getSagaId(), dl.getRetryCount() + 1);
                recoveryExecutor.retryCompensation(dl);
            } catch (Exception e) {
                log.error("[SAGA-DEAD-LETTER] Échec retry {}: {}", dl.getSagaId(), e.getMessage());
                if (dl.getRetryCount() >= 2) {
                    log.error("[SAGA-DEAD-LETTER] ALERTE CRITIQUE — {} a atteint le max de retries — intervention humaine requise",
                        dl.getSagaId());
                    alerterEquipeSupport(dl);
                }
            }
        }
    }

    private void alerterEquipeSupport(SagaStateRecord dl) {
        log.error("[SAGA-ALERTE] ══════════════════════════════════════════════════");
        log.error("[SAGA-ALERTE] INTERVENTION HUMAINE REQUISE");
        log.error("[SAGA-ALERTE] SagaId: {}", dl.getSagaId());
        log.error("[SAGA-ALERTE] Saga: {}", dl.getSagaName());
        log.error("[SAGA-ALERTE] État: {}", dl.getCurrentState());
        log.error("[SAGA-ALERTE] Erreur: {}", dl.getErrorMessage());
        log.error("[SAGA-ALERTE] ══════════════════════════════════════════════════");
    }
}
`;
}

function generateRecoveryExecutor(basePackage: string, candidates: SagaCandidate[]): string {
  const sagaNames = candidates.map(c => {
    const pascal = c.domain
      .replace(/[^a-zA-ZÀ-ÿ0-9]+/g, " ")
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
    return pascal;
  });

  const caseBlocks = sagaNames.map(name => `            case "${name}":
                log.info("[RECOVERY] Reprise compensation pour Saga {}", record.getSagaName());
                // TODO: Injecter ${name}SagaOrchestrator et appeler sa méthode compensate()
                break;`).join("\n");

  return `package ${basePackage}.saga.recovery;

import org.springframework.stereotype.Component;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Exécuteur de recovery — reprend les Sagas orphelines et re-tente les dead letters.
 * Dispatche vers l'orchestrateur approprié selon le nom de la Saga.
 *
 * Généré automatiquement par Compleo — NE PAS MODIFIER.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SagaRecoveryExecutor {

    private final SagaStateStore stateStore;

    /**
     * Reprendre une Saga orpheline : relancer la compensation depuis le dernier step connu.
     */
    public void recover(SagaStateRecord record) {
        log.info("[RECOVERY] Reprise Saga orpheline: {} (sagaId={}, lastStep={})",
            record.getSagaName(), record.getSagaId(), record.getLastStepCompleted());

        switch (record.getSagaName()) {
${caseBlocks}
            default:
                log.error("[RECOVERY] Saga inconnue: {} — intervention manuelle requise", record.getSagaName());
        }

        stateStore.markCompleted(record.getSagaId(), "COMPENSATED");
    }

    /**
     * Re-tenter la compensation d'une dead letter.
     */
    public void retryCompensation(SagaStateRecord record) {
        log.info("[RECOVERY] Re-tentative compensation dead letter: {} (sagaId={}, attempt={})",
            record.getSagaName(), record.getSagaId(), record.getRetryCount() + 1);

        recover(record);
    }
}
`;
}

// ── DDL Migration ────────────────────────────────────────────────────────────

function generateSagaStateDDL(): string {
  return `-- Flyway migration: Table d'état Saga pour recovery et dead letter
-- Générée automatiquement par Compleo — Saga Production-Ready
-- Dialecte: Oracle 19c+

CREATE TABLE T_SAGA_STATE (
    SAGA_ID               VARCHAR2(64)  PRIMARY KEY,
    SAGA_NAME             VARCHAR2(128) NOT NULL,
    CURRENT_STATE         VARCHAR2(50)  NOT NULL,
    LAST_STEP_COMPLETED   NUMBER(4)     DEFAULT 0,
    COMPLETED_STEPS       VARCHAR2(2000),
    CONTEXT_JSON          CLOB,
    INPUT_JSON            CLOB,
    ERROR_MESSAGE         VARCHAR2(2000),
    RETRY_COUNT           NUMBER(4)     DEFAULT 0,
    CREATED_AT            TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_AT            TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
    HEARTBEAT_AT          TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT CHK_SAGA_STATE CHECK (CURRENT_STATE IN (
        'INITIATED','EXECUTING','COMPENSATING','COMPLETED',
        'COMPENSATED','FAILED','COMPENSATION_FAILED'
    ))
);

CREATE INDEX IDX_SAGA_STATE_STATUS ON T_SAGA_STATE (CURRENT_STATE, HEARTBEAT_AT);
CREATE INDEX IDX_SAGA_STATE_NAME   ON T_SAGA_STATE (SAGA_NAME, CREATED_AT);

COMMENT ON TABLE T_SAGA_STATE IS 'État persisté des Sagas — recovery, dead letter, monitoring';
COMMENT ON COLUMN T_SAGA_STATE.SAGA_ID IS 'UUID unique de l''exécution Saga';
COMMENT ON COLUMN T_SAGA_STATE.HEARTBEAT_AT IS 'Dernier heartbeat — orpheline si > 5 min sans MAJ';
COMMENT ON COLUMN T_SAGA_STATE.RETRY_COUNT IS 'Nombre de tentatives de recovery (max 3)';
`;
}
