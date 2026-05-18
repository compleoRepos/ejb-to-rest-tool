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
 * @author Compleo
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

// ══════════════════════════════════════════════════════════════════════════════
// ██  1. RETRY — Mécanisme de reprise automatique avec backoff exponentiel  ██
// ══════════════════════════════════════════════════════════════════════════════
//
// POURQUOI :
//   Dans un système distribué bancaire, les erreurs transitoires sont fréquentes :
//   - Deadlocks Oracle (ORA-00060) lors d'accès concurrents aux comptes
//   - Timeouts réseau vers les services distants (SWIFT, TARGET2)
//   - Indisponibilités temporaires de services internes
//
//   Le RetryPolicy permet de re-tenter automatiquement un step Saga en cas
//   d'erreur transitoire, avec un backoff exponentiel pour éviter de surcharger
//   le service défaillant.
//
// COMMENT :
//   Chaque step Saga reçoit un RetryPolicy adapté à son type :
//   - forLocalDb()         → 3 retries, 100ms initial, backoff x2 (deadlocks Oracle)
//   - forRemoteService()   → 3 retries, 1s initial, backoff x2 (services internes)
//   - forExternalGateway() → 5 retries, 5s initial, backoff x2 (SWIFT/TARGET2)
//   - forAsync()           → 0 retry (fire-and-forget, pas de blocage)
//   - forCompensation()    → 5 retries, 2s initial, backoff x3 (on ne veut PAS abandonner)
//
// FLUX :
//   execute(stepName, action)
//     ├─ attempt 1 → succès → return résultat
//     ├─ attempt 1 → échec transitoire → sleep(100ms) → attempt 2
//     ├─ attempt 2 → échec transitoire → sleep(200ms) → attempt 3
//     ├─ attempt 3 → échec → throw SagaStepException (retriesExhausted=true)
//     └─ à tout moment → exception non-retryable → throw immédiatement
//
// ══════════════════════════════════════════════════════════════════════════════

function generateRetryPolicy(basePackage: string): string {
  return `package ${basePackage}.saga.retry;

import java.time.Duration;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RetryPolicy — Politique de retry par step avec backoff exponentiel
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * <h2>Rôle dans le pattern Saga</h2>
 * <p>
 * Dans une Saga distribuée, chaque step peut échouer pour des raisons
 * transitoires (réseau, deadlock, timeout). Le RetryPolicy encapsule la
 * logique de reprise automatique <b>avant</b> de déclencher la compensation.
 * </p>
 *
 * <h2>Principe du backoff exponentiel</h2>
 * <p>
 * Au lieu de re-tenter immédiatement (ce qui surchargerait le service),
 * on attend un délai croissant entre chaque tentative :
 * </p>
 * <pre>
 *   Tentative 1 → échec → attendre 100ms
 *   Tentative 2 → échec → attendre 200ms  (100ms × 2^1)
 *   Tentative 3 → échec → attendre 400ms  (100ms × 2^2)
 *   → SagaStepException (retries épuisés) → déclencher compensation
 * </pre>
 *
 * <h2>Profils disponibles (inférés par Compleo depuis le type de step)</h2>
 * <table>
 *   <tr><th>Profil</th><th>Max retries</th><th>Délai initial</th><th>Cas d'usage</th></tr>
 *   <tr><td>{@link #forLocalDb()}</td><td>3</td><td>100ms</td><td>Deadlocks Oracle, lock timeouts</td></tr>
 *   <tr><td>{@link #forRemoteService()}</td><td>3</td><td>1s</td><td>Timeout réseau, service down</td></tr>
 *   <tr><td>{@link #forExternalGateway()}</td><td>5</td><td>5s</td><td>SWIFT/TARGET2, latence élevée</td></tr>
 *   <tr><td>{@link #forAsync()}</td><td>1</td><td>0</td><td>Fire-and-forget (JMS, events)</td></tr>
 *   <tr><td>{@link #forCompensation()}</td><td>5</td><td>2s</td><td>Compensation : retry agressif</td></tr>
 * </table>
 *
 * <h2>Exemple d'utilisation dans un orchestrateur Saga</h2>
 * <pre>
 *   // Step de type "query locale" → retry adapté aux deadlocks Oracle
 *   RetryPolicy retryPolicy = RetryPolicy.forLocalDb();
 *   retryPolicy.execute("verifierSolde", () -&gt; {
 *       return compteService.verifierSolde(context.getNumeroCompte());
 *   });
 *
 *   // Step de type "service distant" → retry adapté aux timeouts réseau
 *   RetryPolicy retryRemote = RetryPolicy.forRemoteService();
 *   retryRemote.execute("debiterCompte", () -&gt; {
 *       return comptabiliteService.debiter(context.getMontant());
 *   });
 * </pre>
 *
 * @author Compleo — Généré automatiquement depuis l'analyse du code legacy
 * @see SagaStepException Exception levée après épuisement des retries
 * @see SagaCircuitBreaker Protection complémentaire pour les services distants
 */
public class RetryPolicy {

    private static final Logger log = LoggerFactory.getLogger(RetryPolicy.class);

    /** Nombre maximum de tentatives avant de considérer le step comme échoué */
    private final int maxAttempts;

    /** Délai initial entre la 1ère et la 2ème tentative */
    private final Duration initialDelay;

    /**
     * Multiplicateur de backoff exponentiel.
     * Délai(n) = initialDelay × backoffMultiplier^(n-1)
     * Exemple avec initialDelay=100ms et multiplier=2.0 :
     *   attempt 1→2 : 100ms, attempt 2→3 : 200ms, attempt 3→4 : 400ms
     */
    private final double backoffMultiplier;

    /** Délai maximum entre deux tentatives (plafond du backoff) */
    private final Duration maxDelay;

    /**
     * Exceptions qui déclenchent un retry (ex: SQLException, ConnectException).
     * Par défaut : toutes les exceptions.
     */
    private final Class<? extends Exception>[] retryableExceptions;

    /**
     * Exceptions qui NE déclenchent PAS de retry (ex: IllegalArgumentException).
     * Si une exception non-retryable est levée, on throw immédiatement
     * sans consommer les tentatives restantes.
     */
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
     *
     * <p><b>Algorithme :</b></p>
     * <ol>
     *   <li>Exécuter l'action</li>
     *   <li>Si succès → retourner le résultat</li>
     *   <li>Si exception non-retryable → throw immédiatement (pas de retry)</li>
     *   <li>Si dernière tentative → throw SagaStepException (retriesExhausted=true)</li>
     *   <li>Sinon → calculer le délai de backoff → sleep → recommencer</li>
     * </ol>
     *
     * @param stepName Nom du step Saga (pour les logs et le diagnostic)
     * @param action   L'action à exécuter (lambda ou method reference)
     * @param <T>      Type de retour de l'action
     * @return Le résultat de l'action si succès
     * @throws SagaStepException Si toutes les tentatives sont épuisées
     */
    public <T> T execute(String stepName, Supplier<T> action) {
        Exception lastException = null;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return action.get();
            } catch (Exception e) {
                lastException = e;

                // ── Vérification : exception non-retryable → throw immédiatement ──
                // Certaines exceptions indiquent une erreur de logique métier
                // (ex: montant négatif, compte inexistant) qui ne sera jamais
                // résolue par un retry. On les propage directement.
                if (isNonRetryable(e)) {
                    throw new SagaStepException(stepName, e, attempt, false);
                }

                // ── Dernier attempt → throw avec retriesExhausted=true ──
                // Cela signale à l'orchestrateur Saga qu'il doit déclencher
                // la compensation (rollback des steps précédents).
                if (attempt == maxAttempts) {
                    throw new SagaStepException(stepName, e, attempt, true);
                }

                // ── Backoff exponentiel ──
                // On attend un délai croissant pour laisser le service
                // défaillant se rétablir avant de re-tenter.
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

    /**
     * Version void (pas de retour) — pour les steps qui ne retournent rien.
     * Exemple : envoi de notification, mise à jour de statut.
     *
     * @param stepName Nom du step Saga
     * @param action   L'action void à exécuter
     */
    public void executeVoid(String stepName, Runnable action) {
        execute(stepName, () -> { action.run(); return null; });
    }

    /**
     * Calcul du délai de backoff exponentiel.
     * Formule : delay = initialDelay × backoffMultiplier^(attempt - 1)
     * Plafonné à maxDelay pour éviter des attentes trop longues.
     *
     * Exemple avec initialDelay=1s, multiplier=2.0, maxDelay=10s :
     *   attempt 1 : 1s
     *   attempt 2 : 2s
     *   attempt 3 : 4s
     *   attempt 4 : 8s
     *   attempt 5 : 10s (plafonné)
     */
    private long calculateDelay(int attempt) {
        long delay = (long) (initialDelay.toMillis() * Math.pow(backoffMultiplier, attempt - 1));
        return Math.min(delay, maxDelay.toMillis());
    }

    /**
     * Vérifie si l'exception est dans la liste des non-retryables.
     * Utilise isInstance() pour supporter l'héritage de classes d'exception.
     */
    private boolean isNonRetryable(Exception e) {
        for (Class<? extends Exception> cls : nonRetryableExceptions) {
            if (cls.isInstance(e)) return true;
        }
        return false;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Factory methods — Profils de retry inférés par Compleo
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Chaque profil est calibré pour un type de step spécifique.
    // Le choix du profil est fait automatiquement par Compleo lors de la
    // génération de l'orchestrateur, en fonction du type de step détecté
    // dans le code legacy (query, update, remote, async, external).
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Profil "Base de données locale" — pour les steps qui accèdent à la DB Oracle.
     *
     * <p><b>Cas d'usage :</b> deadlocks Oracle (ORA-00060), lock timeouts,
     * contention sur les tables de comptes lors de virements concurrents.</p>
     *
     * <p><b>Paramètres :</b> 3 retries, 100ms initial, backoff ×2, max 2s</p>
     *
     * <p><b>Pourquoi ces valeurs :</b> les deadlocks Oracle se résolvent
     * généralement en quelques millisecondes (le SGBD choisit une victime).
     * Un délai initial court (100ms) suffit pour laisser le lock se libérer.</p>
     */
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

    /**
     * Profil "Service distant interne" — pour les appels REST/gRPC inter-services.
     *
     * <p><b>Cas d'usage :</b> timeout réseau, service temporairement down
     * (redémarrage, déploiement blue-green), load balancer en reconfiguration.</p>
     *
     * <p><b>Paramètres :</b> 3 retries, 1s initial, backoff ×2, max 10s</p>
     *
     * <p><b>Pourquoi ces valeurs :</b> un service interne qui timeout met
     * généralement 1-5s à se rétablir. 3 tentatives avec backoff couvrent
     * la plupart des indisponibilités transitoires.</p>
     */
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

    /**
     * Profil "Gateway externe" — pour les appels SWIFT, TARGET2, SEPA.
     *
     * <p><b>Cas d'usage :</b> systèmes de paiement interbancaires avec
     * latence élevée (5-30s), fenêtres de maintenance quotidiennes,
     * quotas de requêtes par minute.</p>
     *
     * <p><b>Paramètres :</b> 5 retries, 5s initial, backoff ×2, max 2min</p>
     *
     * <p><b>Pourquoi ces valeurs :</b> SWIFT et TARGET2 ont des SLA de
     * disponibilité de 99.7% avec des fenêtres de maintenance. 5 retries
     * avec un backoff long (jusqu'à 2min) permettent de traverser ces
     * micro-coupures sans déclencher de compensation inutile.</p>
     */
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

    /**
     * Profil "Asynchrone" — pour les steps fire-and-forget (JMS, events).
     *
     * <p><b>Cas d'usage :</b> envoi de message JMS, publication d'événement,
     * notification. Le step ne bloque pas la Saga — si l'envoi échoue,
     * on ne re-tente pas (le message sera repris par le broker).</p>
     *
     * <p><b>Paramètres :</b> 1 tentative, pas de délai</p>
     *
     * <p><b>Pourquoi :</b> les systèmes de messaging (JMS, Kafka) ont
     * leur propre mécanisme de retry. Ajouter un retry côté Saga
     * risquerait de créer des doublons de messages.</p>
     */
    public static RetryPolicy forAsync() {
        return new Builder()
            .maxAttempts(1)
            .initialDelay(Duration.ZERO)
            .build();
    }

    /**
     * Profil "Compensation" — retry agressif pour les rollbacks.
     *
     * <p><b>Cas d'usage :</b> compensation d'un step déjà exécuté.
     * On ne veut PAS abandonner une compensation — un step non-compensé
     * laisse le système dans un état incohérent (ex: argent débité
     * mais virement non crédité).</p>
     *
     * <p><b>Paramètres :</b> 5 retries, 2s initial, backoff ×3, max 5min</p>
     *
     * <p><b>Pourquoi backoff ×3 :</b> le backoff est plus agressif que
     * pour les steps normaux car on préfère attendre longtemps plutôt
     * que d'abandonner la compensation. Si les 5 retries échouent,
     * la Saga est envoyée en "dead letter" pour intervention humaine.</p>
     *
     * @see SagaRecoveryScheduler Scheduler qui reprend les dead letters
     */
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

    // ═══════════════════════════════════════════════════════════════════════
    // Builder — Construction fluide d'un RetryPolicy personnalisé
    // ═══════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// ██  SagaStepException — Exception structurée pour les échecs de step      ██
// ══════════════════════════════════════════════════════════════════════════════
//
// RÔLE :
//   Quand un step Saga échoue après tous les retries, le RetryPolicy lève
//   une SagaStepException. Cette exception contient le contexte d'échec
//   (nom du step, numéro de tentative, retries épuisés ou non) pour que
//   l'orchestrateur puisse prendre la bonne décision :
//     - retriesExhausted=true  → déclencher la compensation
//     - retriesExhausted=false → exception non-retryable, compensation immédiate
//
// ══════════════════════════════════════════════════════════════════════════════

function generateSagaStepException(basePackage: string): string {
  return `package ${basePackage}.saga.retry;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SagaStepException — Exception structurée pour les échecs de step Saga
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * <h2>Rôle dans le pattern Saga</h2>
 * <p>
 * Quand un step échoue après tous les retries (ou sur une exception non-retryable),
 * le {@link RetryPolicy} lève cette exception. L'orchestrateur Saga l'intercepte
 * pour décider s'il doit :
 * </p>
 * <ul>
 *   <li><b>retriesExhausted=true</b> → Déclencher la compensation LIFO
 *       (rollback des steps précédents dans l'ordre inverse)</li>
 *   <li><b>retriesExhausted=false</b> → Exception non-retryable (erreur métier),
 *       compensation immédiate sans attendre d'autres retries</li>
 * </ul>
 *
 * <h2>Informations de diagnostic</h2>
 * <p>
 * Le message d'erreur inclut automatiquement :
 * le nom du step, le numéro de tentative, et la cause racine.
 * Ces informations sont aussi persistées dans T_SAGA_STATE.ERROR_MESSAGE
 * pour le diagnostic post-mortem.
 * </p>
 *
 * @author Compleo — Généré automatiquement
 * @see RetryPolicy#execute(String, java.util.function.Supplier)
 */
public class SagaStepException extends RuntimeException {

    /** Nom du step Saga qui a échoué (ex: "verifierSolde", "debiterCompte") */
    private final String stepName;

    /** Numéro de la tentative lors de l'échec (1-based) */
    private final int attempt;

    /**
     * true = toutes les tentatives de retry ont été épuisées
     * false = l'exception est non-retryable (erreur métier, pas transitoire)
     */
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

// ══════════════════════════════════════════════════════════════════════════════
// ██  2. CIRCUIT BREAKER — Protection contre les services défaillants       ██
// ══════════════════════════════════════════════════════════════════════════════
//
// POURQUOI :
//   Quand un service distant est down, chaque appel consomme un timeout
//   (ex: 30s). Si une Saga a 5 steps vers ce service, elle bloque 150s
//   avant de déclencher la compensation. Le Circuit Breaker détecte le
//   service défaillant et court-circuite les appels suivants (fail-fast).
//
// COMMENT — Les 3 états :
//
//   ┌──────────┐    N échecs consécutifs    ┌──────────┐
//   │  CLOSED  │ ────────────────────────→  │   OPEN   │
//   │ (normal) │                             │ (bloqué) │
//   └──────────┘                             └──────────┘
//        ↑                                        │
//        │    2 succès consécutifs                 │ après openDuration (30s)
//        │                                        ↓
//        │                                  ┌───────────┐
//        └────────────────────────────────  │ HALF_OPEN │
//                                           │  (test)   │
//                                           └───────────┘
//
//   CLOSED    → état normal, les appels passent
//   OPEN      → service confirmé down, fail-fast immédiat (CircuitOpenException)
//   HALF_OPEN → après un délai, on laisse passer 1-2 appels pour tester
//               si le service est rétabli. 2 succès → CLOSED, 1 échec → OPEN
//
// EXEMPLE CONCRET :
//   Le service "ComptabiliteService" est down.
//   - Step 1 : appel → timeout 30s → échec (failureCount=1)
//   - Step 2 : appel → timeout 30s → échec (failureCount=2)
//   - Step 3 : appel → timeout 30s → échec (failureCount=3 ≥ threshold)
//   → Circuit OUVERT → les appels suivants échouent en 0ms (fail-fast)
//   → Après 30s → HALF_OPEN → 1 appel test → succès → CLOSED
//
// ══════════════════════════════════════════════════════════════════════════════

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
 * ═══════════════════════════════════════════════════════════════════════════
 * SagaCircuitBreaker — Protection contre les services distants défaillants
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * <h2>Rôle dans le pattern Saga</h2>
 * <p>
 * Le Circuit Breaker protège les Sagas contre les services distants
 * défaillants. Sans lui, chaque step vers un service down consommerait
 * un timeout complet (30s+), bloquant la Saga pendant plusieurs minutes.
 * Avec le CB, après N échecs consécutifs, les appels suivants échouent
 * immédiatement (fail-fast) → la compensation démarre plus vite.
 * </p>
 *
 * <h2>Les 3 états du Circuit Breaker</h2>
 * <pre>
 *   ┌──────────┐    N échecs    ┌──────────┐   après délai   ┌───────────┐
 *   │  CLOSED  │ ────────────→  │   OPEN   │ ──────────────→ │ HALF_OPEN │
 *   │ (normal) │                │ (bloqué) │                  │  (test)   │
 *   └──────────┘                └──────────┘                  └───────────┘
 *        ↑                                                         │
 *        └──────────── 2 succès consécutifs ───────────────────────┘
 * </pre>
 *
 * <h2>Paramètres par défaut</h2>
 * <ul>
 *   <li><b>failureThreshold=3</b> : nombre d'échecs consécutifs pour ouvrir le circuit</li>
 *   <li><b>openDuration=30s</b> : durée pendant laquelle le circuit reste ouvert</li>
 *   <li><b>successThreshold=2</b> : nombre de succès en HALF_OPEN pour fermer le circuit</li>
 * </ul>
 *
 * <h2>Thread-safety</h2>
 * <p>
 * Utilise des AtomicInteger et AtomicReference pour être thread-safe
 * sans synchronisation lourde. Plusieurs Sagas concurrentes peuvent
 * partager le même CB pour un service donné.
 * </p>
 *
 * @author Compleo — Généré automatiquement
 * @see CircuitBreakerRegistry Registre global des CB (un par service)
 * @see CircuitOpenException Exception levée en fail-fast
 */
public class SagaCircuitBreaker {

    private static final Logger log = LoggerFactory.getLogger(SagaCircuitBreaker.class);

    /** Les 3 états possibles du circuit */
    public enum State { CLOSED, OPEN, HALF_OPEN }

    /** Nom du service protégé (pour les logs et le monitoring) */
    private final String serviceName;

    /** Nombre d'échecs consécutifs pour passer de CLOSED à OPEN */
    private final int failureThreshold;

    /** Durée pendant laquelle le circuit reste OPEN avant de passer en HALF_OPEN */
    private final Duration openDuration;

    // ── Compteurs thread-safe ──
    private final AtomicInteger failureCount = new AtomicInteger(0);
    private final AtomicInteger successCount = new AtomicInteger(0);
    private final AtomicReference<State> state = new AtomicReference<>(State.CLOSED);
    private volatile LocalDateTime lastFailureTime;
    private volatile LocalDateTime openedAt;

    /**
     * @param serviceName      Nom du service distant (ex: "ComptabiliteService")
     * @param failureThreshold Nombre d'échecs pour ouvrir le circuit (défaut: 3)
     * @param openDuration     Durée d'ouverture avant test HALF_OPEN (défaut: 30s)
     */
    public SagaCircuitBreaker(String serviceName, int failureThreshold, Duration openDuration) {
        this.serviceName = serviceName;
        this.failureThreshold = failureThreshold;
        this.openDuration = openDuration;
    }

    /**
     * Exécuter une action protégée par le circuit breaker.
     *
     * <p><b>Algorithme :</b></p>
     * <ol>
     *   <li>Vérifier l'état effectif du circuit (CLOSED/OPEN/HALF_OPEN)</li>
     *   <li>Si OPEN → throw CircuitOpenException immédiatement (fail-fast, 0ms)</li>
     *   <li>Si CLOSED ou HALF_OPEN → exécuter l'action</li>
     *   <li>Si succès → appeler onSuccess() (reset compteurs ou fermer le circuit)</li>
     *   <li>Si échec → appeler onFailure() (incrémenter compteur, ouvrir si seuil atteint)</li>
     * </ol>
     *
     * @param action L'action à exécuter (appel service distant)
     * @param <T>    Type de retour
     * @return Le résultat de l'action
     * @throws CircuitOpenException Si le circuit est ouvert (fail-fast)
     */
    public <T> T execute(Supplier<T> action) {
        State currentState = getEffectiveState();

        // ── OPEN → fail-fast immédiat ──
        // Le service est confirmé défaillant. On ne tente même pas l'appel
        // pour éviter de consommer un timeout inutile.
        if (currentState == State.OPEN) {
            log.warn("[CB:{}] Circuit OUVERT — fail-fast (ouvert depuis {})",
                serviceName, openedAt);
            throw new CircuitOpenException(serviceName,
                "Service " + serviceName + " indisponible — circuit ouvert depuis " + openedAt);
        }

        // ── CLOSED ou HALF_OPEN → tenter l'appel ──
        try {
            T result = action.get();
            onSuccess();
            return result;
        } catch (Exception e) {
            onFailure(e);
            throw e;
        }
    }

    /**
     * Callback succès :
     * - En HALF_OPEN : compter les succès. Après 2 succès → CLOSED (service rétabli)
     * - En CLOSED : reset le compteur d'échecs (le service fonctionne normalement)
     */
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
            // En CLOSED, un succès remet le compteur d'échecs à 0
            failureCount.set(0);
        }
    }

    /**
     * Callback échec :
     * - Incrémenter le compteur d'échecs
     * - Si le seuil est atteint en CLOSED → passer en OPEN
     * - En HALF_OPEN, un seul échec suffit pour rouvrir le circuit
     */
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

    /**
     * Calcule l'état effectif du circuit.
     * Si le circuit est OPEN et que le délai d'ouverture est dépassé,
     * on passe automatiquement en HALF_OPEN pour tester le service.
     */
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
 * ═══════════════════════════════════════════════════════════════════════════
 * CircuitBreakerRegistry — Registre global des Circuit Breakers
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * <h2>Rôle</h2>
 * <p>
 * Maintient un Circuit Breaker unique par service distant.
 * Toutes les Sagas du projet partagent les mêmes CB, ce qui permet
 * de détecter un service défaillant même si les appels viennent
 * de Sagas différentes.
 * </p>
 *
 * <h2>Exemple</h2>
 * <pre>
 *   // Dans l'orchestrateur Saga :
 *   SagaCircuitBreaker cb = circuitBreakerRegistry.getBreaker("ComptabiliteService");
 *   cb.execute(() -&gt; comptabiliteService.debiter(montant));
 *   // Si ComptabiliteService est down, le CB sera partagé entre toutes les Sagas
 *   // qui appellent ce service → fail-fast global.
 * </pre>
 *
 * <h2>Monitoring</h2>
 * <p>
 * La méthode {@link #getStatus()} retourne l'état de tous les CB,
 * exposable via un endpoint Actuator (/actuator/saga-circuits).
 * </p>
 *
 * @author Compleo — Généré automatiquement
 * @see SagaCircuitBreaker Le Circuit Breaker individuel par service
 */
@Component
public class CircuitBreakerRegistry {

    /** Map thread-safe : nom du service → Circuit Breaker */
    private final ConcurrentHashMap<String, SagaCircuitBreaker> breakers = new ConcurrentHashMap<>();

    /**
     * Obtenir (ou créer) le Circuit Breaker pour un service donné.
     * Paramètres par défaut : 3 échecs pour ouvrir, 30s d'ouverture.
     *
     * @param serviceName Nom du service distant (ex: "ComptabiliteService")
     * @return Le Circuit Breaker associé (créé à la première demande)
     */
    public SagaCircuitBreaker getBreaker(String serviceName) {
        return breakers.computeIfAbsent(serviceName,
            name -> new SagaCircuitBreaker(name, 3, Duration.ofSeconds(30)));
    }

    /**
     * Health check — retourne l'état de tous les Circuit Breakers.
     * Exposable via /actuator/saga-circuits pour le monitoring.
     *
     * @return Map&lt;nomService, état&gt; (ex: {"ComptabiliteService": "CLOSED", "SwiftGateway": "OPEN"})
     */
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
 * ═══════════════════════════════════════════════════════════════════════════
 * CircuitOpenException — Exception de fail-fast quand le circuit est ouvert
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * <h2>Rôle</h2>
 * <p>
 * Levée par {@link SagaCircuitBreaker#execute(java.util.function.Supplier)}
 * quand le circuit est en état OPEN. Cela signifie que le service distant
 * est confirmé défaillant — l'appel échoue immédiatement (0ms) au lieu
 * de consommer un timeout (30s+).
 * </p>
 *
 * <h2>Traitement par l'orchestrateur</h2>
 * <p>
 * Cette exception est <b>non-retryable</b> par défaut : le RetryPolicy
 * ne re-tentera pas un appel si le circuit est ouvert (inutile de
 * re-tenter un service confirmé down). L'orchestrateur déclenche
 * directement la compensation.
 * </p>
 *
 * @author Compleo — Généré automatiquement
 * @see SagaCircuitBreaker Le Circuit Breaker qui lève cette exception
 */
public class CircuitOpenException extends RuntimeException {

    /** Nom du service dont le circuit est ouvert */
    private final String serviceName;

    public CircuitOpenException(String serviceName, String message) {
        super(message);
        this.serviceName = serviceName;
    }

    public String getServiceName() { return serviceName; }
}
`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ██  3. SAVEPOINTS — Rollback granulaire par step dans la transaction      ██
// ══════════════════════════════════════════════════════════════════════════════
//
// POURQUOI :
//   Dans une Saga bancaire, certains steps modifient la base de données
//   locale (INSERT, UPDATE). Si un step ultérieur échoue, on veut pouvoir
//   annuler uniquement les modifications du step échoué, pas toute la
//   transaction. Les savepoints JDBC permettent ce rollback granulaire.
//
// COMMENT :
//   L'orchestrateur crée un savepoint AVANT chaque step qui modifie la DB :
//
//   begin()
//   ├─ setSavepoint("before-step-1")
//   │   └─ step 1 : INSERT INTO T_DOSSIER (création dossier)
//   ├─ setSavepoint("before-step-2")
//   │   └─ step 2 : UPDATE T_COMPTE SET solde = solde - montant
//   ├─ setSavepoint("before-step-3")
//   │   └─ step 3 : INSERT INTO T_ECRITURE (écriture comptable) ← ÉCHEC
//   │
//   └─ rollbackToSavepoint("before-step-3")
//       → step 1 et step 2 sont préservés
//       → seul step 3 est annulé
//       → compenser step 2 (re-créditer le compte)
//       → compenser step 1 (annuler le dossier)
//
// NOTE :
//   Les savepoints sont utilisés UNIQUEMENT pour les steps locaux (DB).
//   Les steps vers des services distants utilisent la compensation Saga
//   classique (appel d'un endpoint d'annulation).
//
// ══════════════════════════════════════════════════════════════════════════════

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
 * ═══════════════════════════════════════════════════════════════════════════
 * SagaSavepointManager — Rollback granulaire par step dans la transaction
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * <h2>Rôle dans le pattern Saga</h2>
 * <p>
 * Gère les savepoints JDBC pour permettre un rollback granulaire
 * (par step) au lieu d'un rollback total de la transaction.
 * Utilisé uniquement pour les steps qui modifient la base de données locale.
 * </p>
 *
 * <h2>Workflow typique dans un orchestrateur Saga</h2>
 * <pre>
 *   SagaSavepointManager spm = new SagaSavepointManager(dataSource);
 *   spm.begin();  // Démarre la transaction manuelle (autoCommit=false)
 *
 *   try {
 *       spm.setSavepoint("before-step-1");
 *       step1_creerDossier(context);        // INSERT INTO T_DOSSIER
 *
 *       spm.setSavepoint("before-step-2");
 *       step2_debiterCompte(context);        // UPDATE T_COMPTE
 *
 *       spm.setSavepoint("before-step-3");
 *       step3_ecritureComptable(context);    // INSERT INTO T_ECRITURE ← ÉCHEC !
 *
 *       spm.commit();  // Tout OK → commit final
 *   } catch (Exception e) {
 *       // Step 3 a échoué → rollback uniquement step 3
 *       spm.rollbackToSavepoint("before-step-3");
 *       // Steps 1 et 2 sont préservés dans la transaction
 *       // → compenser step 2 puis step 1 via la compensation Saga
 *   } finally {
 *       spm.close();  // Libérer la connexion
 *   }
 * </pre>
 *
 * <h2>Compatibilité Oracle</h2>
 * <p>
 * Oracle 19c+ supporte nativement les savepoints JDBC.
 * Les noms de savepoints sont limités à 128 caractères.
 * </p>
 *
 * @author Compleo — Généré automatiquement
 * @see RetryPolicy Retry avant de déclencher le rollback
 */
public class SagaSavepointManager {

    private static final Logger log = LoggerFactory.getLogger(SagaSavepointManager.class);

    private final DataSource dataSource;
    private Connection currentConnection;

    /**
     * Map ordonnée des savepoints créés.
     * LinkedHashMap préserve l'ordre d'insertion, ce qui est important
     * pour le rollback : on doit savoir quels savepoints sont "après"
     * celui vers lequel on rollback (ils seront supprimés).
     */
    private final Map<String, Savepoint> savepoints = new LinkedHashMap<>();

    public SagaSavepointManager(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    /**
     * Démarrer une transaction manuelle.
     * AutoCommit est désactivé pour permettre les savepoints.
     * DOIT être appelé avant tout setSavepoint().
     */
    public void begin() throws SQLException {
        this.currentConnection = DataSourceUtils.getConnection(dataSource);
        this.currentConnection.setAutoCommit(false);
        log.debug("[SAVEPOINT] Transaction manuelle démarrée");
    }

    /**
     * Créer un savepoint nommé à la position courante de la transaction.
     * Si le step suivant échoue, on pourra rollback vers ce point.
     *
     * @param name Nom du savepoint (ex: "before-step-3")
     */
    public void setSavepoint(String name) throws SQLException {
        Savepoint sp = currentConnection.setSavepoint(name);
        savepoints.put(name, sp);
        log.debug("[SAVEPOINT] Savepoint '{}' créé", name);
    }

    /**
     * Rollback vers un savepoint spécifique.
     * Toutes les modifications APRÈS ce savepoint sont annulées.
     * Les savepoints créés après celui-ci sont supprimés de la map.
     *
     * <p><b>Exemple :</b> si on a les savepoints [sp1, sp2, sp3] et qu'on
     * rollback vers sp2, alors sp3 est supprimé et les modifications
     * entre sp2 et sp3 sont annulées.</p>
     *
     * @param name Nom du savepoint vers lequel rollback
     */
    public void rollbackToSavepoint(String name) throws SQLException {
        Savepoint sp = savepoints.get(name);
        if (sp != null) {
            currentConnection.rollback(sp);
            log.warn("[SAVEPOINT] Rollback vers '{}'", name);
            // Supprimer les savepoints créés après celui-ci
            boolean found = false;
            var iterator = savepoints.entrySet().iterator();
            while (iterator.hasNext()) {
                var entry = iterator.next();
                if (found) iterator.remove();
                if (entry.getKey().equals(name)) found = true;
            }
        }
    }

    /**
     * Commit final de la transaction.
     * Tous les savepoints sont libérés.
     * Appelé quand tous les steps locaux ont réussi.
     */
    public void commit() throws SQLException {
        if (currentConnection != null) {
            currentConnection.commit();
            savepoints.clear();
            log.debug("[SAVEPOINT] Transaction committée");
        }
    }

    /**
     * Rollback total de la transaction.
     * Annule TOUTES les modifications depuis begin().
     * Utilisé en dernier recours si la compensation échoue aussi.
     */
    public void rollbackAll() throws SQLException {
        if (currentConnection != null) {
            currentConnection.rollback();
            savepoints.clear();
            log.warn("[SAVEPOINT] Rollback total");
        }
    }

    /**
     * Libérer la connexion JDBC.
     * DOIT être appelé dans un bloc finally pour éviter les fuites de connexion.
     */
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

// ══════════════════════════════════════════════════════════════════════════════
// ██  4. RECOVERY — Persistance d'état + reprise des Sagas orphelines       ██
// ══════════════════════════════════════════════════════════════════════════════
//
// POURQUOI :
//   Si le serveur crash au milieu d'une Saga, les steps déjà exécutés
//   ne seront jamais compensés (la Saga est en mémoire). La recovery
//   persiste l'état de chaque Saga dans T_SAGA_STATE et un scheduler
//   reprend les Sagas orphelines au redémarrage.
//
// ARCHITECTURE :
//
//   ┌─────────────────┐     persistState()      ┌──────────────┐
//   │  Orchestrateur   │ ─────────────────────→  │ SagaStateStore│
//   │  (chaque step)   │                         │  (T_SAGA_STATE)│
//   └─────────────────┘                          └──────────────┘
//          │                                            │
//          │ heartbeat() (toutes les 30s)               │ findOrphans()
//          │                                            │ findDeadLetters()
//          ↓                                            ↓
//   ┌─────────────────┐                          ┌──────────────────┐
//   │  T_SAGA_STATE    │ ←─────────────────────  │ SagaRecovery     │
//   │  (table Oracle)  │                         │ Scheduler (cron) │
//   └─────────────────┘                          └──────────────────┘
//                                                       │
//                                                       ↓
//                                                ┌──────────────────┐
//                                                │ SagaRecovery     │
//                                                │ Executor         │
//                                                │ (compensate)     │
//                                                └──────────────────┘
//
// FLUX DE RECOVERY :
//   1. L'orchestrateur persiste l'état à chaque transition de step
//   2. L'orchestrateur envoie un heartbeat toutes les 30s
//   3. Le scheduler (cron 2min) cherche les Sagas dont le heartbeat > 5min
//   4. Ces Sagas sont considérées "orphelines" (le serveur a probablement crashé)
//   5. Le RecoveryExecutor reprend la compensation depuis le dernier step connu
//
// DEAD LETTER :
//   Si la compensation échoue après 5 retries, la Saga passe en
//   COMPENSATION_FAILED (dead letter). Le scheduler re-tente toutes
//   les 10min, max 3 fois. Après → alerte humaine.
//
// ══════════════════════════════════════════════════════════════════════════════

function generateStateStore(basePackage: string): string {
  return `package ${basePackage}.saga.recovery;

import org.springframework.stereotype.Repository;
import org.springframework.jdbc.core.JdbcTemplate;
import lombok.RequiredArgsConstructor;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SagaStateStore — Persistance de l'état Saga dans T_SAGA_STATE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * <h2>Rôle dans le pattern Saga</h2>
 * <p>
 * Persiste l'état de chaque Saga en cours dans la table T_SAGA_STATE.
 * Cela permet de reprendre une Saga après un crash serveur (recovery)
 * et de monitorer les Sagas en cours via des requêtes SQL.
 * </p>
 *
 * <h2>Quand l'état est-il persisté ?</h2>
 * <ul>
 *   <li><b>À chaque transition de step</b> : l'orchestrateur appelle
 *       {@link #persistState(SagaStateRecord)} après chaque step réussi</li>
 *   <li><b>Heartbeat</b> : toutes les 30s, l'orchestrateur appelle
 *       {@link #heartbeat(String)} pour signaler qu'il est toujours vivant</li>
 *   <li><b>Fin de Saga</b> : {@link #markCompleted(String, String)} met
 *       l'état final (COMPLETED, COMPENSATED, ou FAILED)</li>
 * </ul>
 *
 * <h2>Requêtes de recovery</h2>
 * <ul>
 *   <li>{@link #findOrphans()} : Sagas dont le heartbeat date de &gt; 5min
 *       et qui ne sont pas dans un état terminal → le serveur a crashé</li>
 *   <li>{@link #findDeadLetters()} : Sagas en COMPENSATION_FAILED
 *       avec retry_count &lt; 3 → re-tenter la compensation</li>
 * </ul>
 *
 * <h2>SQL Oracle</h2>
 * <p>
 * Utilise MERGE INTO (upsert Oracle) pour créer ou mettre à jour
 * l'état en une seule requête atomique.
 * </p>
 *
 * @author Compleo — Généré automatiquement
 * @see SagaStateRecord Le record représentant l'état persisté
 * @see SagaRecoveryScheduler Le scheduler qui utilise findOrphans/findDeadLetters
 */
@Repository
@RequiredArgsConstructor
public class SagaStateStore {

    private static final Logger log = LoggerFactory.getLogger(SagaStateStore.class);

    private final JdbcTemplate jdbcTemplate;

    /**
     * MERGE INTO — Upsert Oracle.
     * Si la Saga existe déjà → UPDATE (mise à jour de l'état courant).
     * Si c'est une nouvelle Saga → INSERT (création de l'enregistrement).
     *
     * Pourquoi MERGE et pas INSERT+UPDATE séparés ?
     * → Atomicité : pas de race condition entre le test d'existence et l'écriture.
     * → Performance : une seule requête au lieu de deux.
     */
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

    /**
     * Heartbeat — Met à jour HEARTBEAT_AT à SYSTIMESTAMP.
     * Appelé toutes les 30s par l'orchestrateur pour signaler qu'il est vivant.
     * Si HEARTBEAT_AT n'est pas mis à jour pendant 5min → la Saga est orpheline.
     */
    private static final String SQL_HEARTBEAT =
        "UPDATE T_SAGA_STATE SET HEARTBEAT_AT = SYSTIMESTAMP WHERE SAGA_ID = ?";

    /**
     * Requête de détection des Sagas orphelines.
     * Critères :
     *   - État non-terminal (pas COMPLETED, COMPENSATED, FAILED)
     *   - Heartbeat > 5 minutes → le serveur a probablement crashé
     */
    private static final String SQL_ORPHANS = """
        SELECT SAGA_ID, SAGA_NAME, CURRENT_STATE, LAST_STEP_COMPLETED,
               COMPLETED_STEPS, CONTEXT_JSON, INPUT_JSON, ERROR_MESSAGE,
               RETRY_COUNT, CREATED_AT
        FROM T_SAGA_STATE
        WHERE CURRENT_STATE NOT IN ('COMPLETED', 'COMPENSATED', 'FAILED')
          AND HEARTBEAT_AT < SYSTIMESTAMP - INTERVAL '5' MINUTE
        ORDER BY CREATED_AT
        """;

    /**
     * Requête de détection des dead letters.
     * Critères :
     *   - État = COMPENSATION_FAILED (la compensation a échoué)
     *   - retry_count < 3 (on n'a pas encore atteint le max de retries globaux)
     */
    private static final String SQL_DEAD_LETTERS = """
        SELECT SAGA_ID, SAGA_NAME, CURRENT_STATE, LAST_STEP_COMPLETED,
               COMPLETED_STEPS, CONTEXT_JSON, INPUT_JSON, ERROR_MESSAGE,
               RETRY_COUNT, CREATED_AT
        FROM T_SAGA_STATE
        WHERE CURRENT_STATE = 'COMPENSATION_FAILED'
          AND RETRY_COUNT < 3
        ORDER BY CREATED_AT
        """;

    /**
     * Persister l'état courant de la Saga.
     * Appelé par l'orchestrateur après chaque step réussi.
     *
     * @param record L'état courant (sagaId, currentState, lastStepCompleted, etc.)
     */
    public void persistState(SagaStateRecord record) {
        jdbcTemplate.update(SQL_UPSERT,
            // Paramètres pour la clause ON (test d'existence)
            record.getSagaId(),
            // Paramètres pour le WHEN MATCHED (UPDATE)
            record.getCurrentState(), record.getLastStepCompleted(),
            record.getCompletedStepsJson(), record.getContextJson(), record.getErrorMessage(),
            // Paramètres pour le WHEN NOT MATCHED (INSERT)
            record.getSagaId(), record.getSagaName(), record.getCurrentState(),
            record.getLastStepCompleted(), record.getCompletedStepsJson(),
            record.getContextJson(), record.getInputJson());
    }

    /**
     * Envoyer un heartbeat pour signaler que la Saga est toujours en cours.
     * Appelé toutes les 30s par l'orchestrateur.
     *
     * @param sagaId UUID de la Saga
     */
    public void heartbeat(String sagaId) {
        jdbcTemplate.update(SQL_HEARTBEAT, sagaId);
    }

    /**
     * Trouver les Sagas orphelines (heartbeat > 5min, état non-terminal).
     * Appelé par le {@link SagaRecoveryScheduler} toutes les 2 minutes.
     *
     * @return Liste des Sagas orphelines à reprendre
     */
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

    /**
     * Trouver les Sagas en dead letter (compensation échouée, retry < 3).
     * Appelé par le {@link SagaRecoveryScheduler} toutes les 10 minutes.
     *
     * @return Liste des dead letters à re-tenter
     */
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

    /**
     * Marquer une Saga comme terminée (état final).
     * Appelé quand la Saga est complétée ou compensée avec succès.
     *
     * @param sagaId     UUID de la Saga
     * @param finalState État final : "COMPLETED", "COMPENSATED", ou "FAILED"
     */
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
 * ═══════════════════════════════════════════════════════════════════════════
 * SagaStateRecord — Record représentant l'état persisté d'une Saga
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * <h2>Rôle</h2>
 * <p>
 * Objet de transfert entre {@link SagaStateStore} et {@link SagaRecoveryExecutor}.
 * Contient toutes les informations nécessaires pour reprendre une Saga
 * après un crash serveur.
 * </p>
 *
 * <h2>Champs clés</h2>
 * <table>
 *   <tr><th>Champ</th><th>Rôle</th><th>Exemple</th></tr>
 *   <tr><td>sagaId</td><td>UUID unique de l'exécution</td><td>"a1b2c3d4-..."</td></tr>
 *   <tr><td>sagaName</td><td>Nom de la Saga (pour le dispatch)</td><td>"VirementBancaire"</td></tr>
 *   <tr><td>currentState</td><td>État courant</td><td>"EXECUTING", "COMPENSATING"</td></tr>
 *   <tr><td>lastStepCompleted</td><td>Numéro du dernier step réussi</td><td>3</td></tr>
 *   <tr><td>completedStepsJson</td><td>Liste JSON des steps complétés</td><td>["step1","step2","step3"]</td></tr>
 *   <tr><td>contextJson</td><td>Contexte Saga sérialisé en JSON</td><td>{"montant":1000,...}</td></tr>
 *   <tr><td>inputJson</td><td>Données d'entrée initiales</td><td>{"compteSource":"FR76..."}</td></tr>
 *   <tr><td>errorMessage</td><td>Message d'erreur du dernier échec</td><td>"ORA-00060: deadlock"</td></tr>
 *   <tr><td>retryCount</td><td>Nombre de tentatives de recovery</td><td>0, 1, 2 (max 3)</td></tr>
 * </table>
 *
 * @author Compleo — Généré automatiquement
 * @see SagaStateStore Persistance dans T_SAGA_STATE
 */
@Getter
@Setter
@Builder
public class SagaStateRecord {

    /** UUID unique de l'exécution Saga (généré par l'orchestrateur au démarrage) */
    private String sagaId;

    /** Nom de la Saga — utilisé par le RecoveryExecutor pour dispatcher vers le bon orchestrateur */
    private String sagaName;

    /**
     * État courant de la Saga. Valeurs possibles :
     * INITIATED → EXECUTING → COMPLETED (succès)
     * INITIATED → EXECUTING → COMPENSATING → COMPENSATED (échec + compensation OK)
     * INITIATED → EXECUTING → COMPENSATING → COMPENSATION_FAILED (dead letter)
     */
    private String currentState;

    /** Numéro du dernier step complété avec succès (0-based). Utilisé pour la reprise. */
    private int lastStepCompleted;

    /** Liste JSON des noms de steps complétés. Ex: ["verifierSolde","debiterCompte"] */
    private String completedStepsJson;

    /** Contexte Saga complet sérialisé en JSON (montant, numéro de compte, etc.) */
    private String contextJson;

    /** Données d'entrée initiales sérialisées en JSON (pour rejouer la Saga si nécessaire) */
    private String inputJson;

    /** Message d'erreur du dernier échec (pour le diagnostic) */
    private String errorMessage;

    /** Nombre de tentatives de recovery globales (max 3, après → alerte humaine) */
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
 * ═══════════════════════════════════════════════════════════════════════════
 * SagaRecoveryScheduler — Reprise automatique des Sagas orphelines
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * <h2>Rôle dans le pattern Saga</h2>
 * <p>
 * Ce scheduler tourne en arrière-plan et détecte les Sagas qui n'ont
 * pas été terminées correctement (crash serveur, timeout, etc.).
 * Il reprend automatiquement la compensation pour éviter de laisser
 * le système dans un état incohérent.
 * </p>
 *
 * <h2>Deux types de recovery</h2>
 *
 * <h3>1. Sagas orphelines (toutes les 2 minutes)</h3>
 * <p>
 * Une Saga est "orpheline" si son heartbeat n'a pas été mis à jour
 * depuis plus de 5 minutes ET qu'elle n'est pas dans un état terminal.
 * Cela signifie que le serveur qui exécutait la Saga a probablement crashé.
 * </p>
 * <pre>
 *   Orchestrateur → heartbeat toutes les 30s → T_SAGA_STATE.HEARTBEAT_AT
 *   Scheduler → vérifie toutes les 2min → HEARTBEAT_AT &gt; 5min ? → orpheline !
 *   → Reprendre la compensation depuis le dernier step connu
 * </pre>
 *
 * <h3>2. Dead letters (toutes les 10 minutes)</h3>
 * <p>
 * Une Saga est en "dead letter" si sa compensation a échoué après
 * 5 retries (RetryPolicy.forCompensation()). Le scheduler re-tente
 * la compensation avec un délai plus long, max 3 fois.
 * Après 3 tentatives globales → alerte humaine.
 * </p>
 * <pre>
 *   Compensation échoue 5x → COMPENSATION_FAILED (dead letter)
 *   Scheduler → re-tente toutes les 10min → max 3 tentatives globales
 *   → Après 3 échecs → log ALERTE CRITIQUE → intervention humaine
 * </pre>
 *
 * @author Compleo — Généré automatiquement
 * @see SagaStateStore Requêtes findOrphans() et findDeadLetters()
 * @see SagaRecoveryExecutor Exécution de la reprise/compensation
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SagaRecoveryScheduler {

    private final SagaStateStore stateStore;
    private final SagaRecoveryExecutor recoveryExecutor;

    /**
     * Toutes les 2 minutes : chercher les Sagas orphelines.
     *
     * <p><b>Critères de détection :</b></p>
     * <ul>
     *   <li>État non-terminal (pas COMPLETED, COMPENSATED, FAILED)</li>
     *   <li>HEARTBEAT_AT &gt; 5 minutes (le serveur ne répond plus)</li>
     * </ul>
     *
     * <p><b>Action :</b> reprendre la compensation depuis le dernier step connu.</p>
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
     *
     * <p><b>Critères :</b></p>
     * <ul>
     *   <li>État = COMPENSATION_FAILED</li>
     *   <li>retry_count &lt; 3 (pas encore au max de retries globaux)</li>
     * </ul>
     *
     * <p><b>Escalade :</b></p>
     * <ul>
     *   <li>retry 1 → re-tenter la compensation</li>
     *   <li>retry 2 → re-tenter avec un délai plus long</li>
     *   <li>retry 3 → ALERTE CRITIQUE → intervention humaine requise</li>
     * </ul>
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

    /**
     * Alerte humaine — Appelée quand une Saga a épuisé toutes les tentatives
     * de recovery automatique. En production, cette méthode devrait envoyer
     * un email/SMS/PagerDuty à l'équipe support.
     *
     * @param dl Le record de la Saga en dead letter
     */
    private void alerterEquipeSupport(SagaStateRecord dl) {
        log.error("[SAGA-ALERTE] ══════════════════════════════════════════════════");
        log.error("[SAGA-ALERTE] INTERVENTION HUMAINE REQUISE");
        log.error("[SAGA-ALERTE] SagaId: {}", dl.getSagaId());
        log.error("[SAGA-ALERTE] Saga: {}", dl.getSagaName());
        log.error("[SAGA-ALERTE] État: {}", dl.getCurrentState());
        log.error("[SAGA-ALERTE] Erreur: {}", dl.getErrorMessage());
        log.error("[SAGA-ALERTE] ══════════════════════════════════════════════════");
        // TODO: Intégrer avec le système d'alerte de l'entreprise
        // (email, SMS, PagerDuty, Slack, etc.)
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
                // Reprendre la compensation pour la Saga ${name}
                // L'orchestrateur ${name}SagaOrchestrator sera injecté via @Autowired
                log.info("[RECOVERY] Reprise compensation pour Saga {}", record.getSagaName());
                // TODO: Injecter ${name}SagaOrchestrator et appeler sa méthode compensate()
                // Exemple : ${name.charAt(0).toLowerCase() + name.slice(1)}Orchestrator.compensateFromStep(record.getLastStepCompleted(), record.getContextJson());
                break;`).join("\n");

  return `package ${basePackage}.saga.recovery;

import org.springframework.stereotype.Component;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SagaRecoveryExecutor — Exécution de la reprise des Sagas orphelines
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * <h2>Rôle</h2>
 * <p>
 * Dispatche la reprise vers l'orchestrateur Saga approprié en fonction
 * du nom de la Saga (stocké dans T_SAGA_STATE.SAGA_NAME).
 * </p>
 *
 * <h2>Flux de recovery</h2>
 * <pre>
 *   SagaRecoveryScheduler
 *     └─ findOrphans() → List&lt;SagaStateRecord&gt;
 *         └─ pour chaque orpheline :
 *             └─ SagaRecoveryExecutor.recover(record)
 *                 └─ switch(record.sagaName)
 *                     ├─ "VirementBancaire" → virementOrchestrator.compensateFromStep(...)
 *                     ├─ "OuvertureCompte"  → ouvertureOrchestrator.compensateFromStep(...)
 *                     └─ default → log erreur (Saga inconnue)
 * </pre>
 *
 * <h2>Personnalisation</h2>
 * <p>
 * Les blocs switch/case sont générés automatiquement par Compleo
 * en fonction des Sagas détectées dans le code legacy.
 * Pour chaque Saga, il faut injecter l'orchestrateur correspondant
 * et appeler sa méthode de compensation partielle.
 * </p>
 *
 * @author Compleo — Généré automatiquement
 * @see SagaRecoveryScheduler Le scheduler qui appelle recover()
 * @see SagaStateStore La source des Sagas orphelines
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SagaRecoveryExecutor {

    private final SagaStateStore stateStore;

    /**
     * Reprendre une Saga orpheline.
     * Dispatche vers l'orchestrateur approprié pour relancer la compensation
     * depuis le dernier step connu.
     *
     * @param record L'état persisté de la Saga orpheline
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
     * Même logique que recover(), mais pour les Sagas dont la compensation
     * a déjà échoué. Le retry_count est incrémenté par le scheduler.
     *
     * @param record L'état persisté de la Saga en dead letter
     */
    public void retryCompensation(SagaStateRecord record) {
        log.info("[RECOVERY] Re-tentative compensation dead letter: {} (sagaId={}, attempt={})",
            record.getSagaName(), record.getSagaId(), record.getRetryCount() + 1);

        recover(record);
    }
}
`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ██  5. DDL — Table T_SAGA_STATE pour Oracle 19c+                          ██
// ══════════════════════════════════════════════════════════════════════════════
//
// STRUCTURE DE LA TABLE :
//
//   T_SAGA_STATE
//   ├── SAGA_ID (PK)           → UUID unique de l'exécution Saga
//   ├── SAGA_NAME              → Nom de la Saga (pour le dispatch recovery)
//   ├── CURRENT_STATE          → État courant (INITIATED → EXECUTING → COMPLETED/COMPENSATED/FAILED)
//   ├── LAST_STEP_COMPLETED    → Numéro du dernier step réussi (pour la reprise)
//   ├── COMPLETED_STEPS        → Liste JSON des steps complétés
//   ├── CONTEXT_JSON           → Contexte Saga sérialisé (CLOB pour les gros contextes)
//   ├── INPUT_JSON             → Données d'entrée initiales
//   ├── ERROR_MESSAGE          → Message d'erreur du dernier échec
//   ├── RETRY_COUNT            → Nombre de tentatives de recovery
//   ├── CREATED_AT             → Timestamp de création
//   ├── UPDATED_AT             → Timestamp de dernière mise à jour
//   └── HEARTBEAT_AT           → Timestamp du dernier heartbeat (orpheline si > 5min)
//
// INDEX :
//   - IDX_SAGA_STATE_STATUS : accélère findOrphans() (WHERE CURRENT_STATE + HEARTBEAT_AT)
//   - IDX_SAGA_STATE_NAME   : accélère les requêtes par nom de Saga
//
// CONTRAINTE :
//   - CHK_SAGA_STATE : vérifie que CURRENT_STATE est une valeur valide
//
// ══════════════════════════════════════════════════════════════════════════════

function generateSagaStateDDL(): string {
  return `-- ═══════════════════════════════════════════════════════════════════════════
-- Flyway migration V4 : Table d'état Saga pour recovery et dead letter
-- ═══════════════════════════════════════════════════════════════════════════
--
-- RÔLE :
--   Persiste l'état de chaque Saga en cours pour permettre :
--   1. La reprise après crash serveur (recovery des Sagas orphelines)
--   2. Le monitoring des Sagas en cours (dashboard, alertes)
--   3. Le re-traitement des dead letters (compensation échouée)
--
-- CYCLE DE VIE D'UNE LIGNE :
--   INSERT (INITIATED) → UPDATE (EXECUTING) → UPDATE (COMPLETED/COMPENSATED/FAILED)
--   Heartbeat toutes les 30s → HEARTBEAT_AT mis à jour
--   Si HEARTBEAT_AT > 5min et état non-terminal → Saga orpheline → recovery
--
-- DIALECTE : Oracle 19c+
-- Généré automatiquement par Compleo — Saga Production-Ready
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE T_SAGA_STATE (
    -- Identifiant unique de l'exécution Saga (UUID généré par l'orchestrateur)
    SAGA_ID               VARCHAR2(64)  PRIMARY KEY,

    -- Nom de la Saga (ex: "VirementBancaire", "OuvertureCompte")
    -- Utilisé par le SagaRecoveryExecutor pour dispatcher vers le bon orchestrateur
    SAGA_NAME             VARCHAR2(128) NOT NULL,

    -- État courant de la Saga
    -- Transitions valides :
    --   INITIATED → EXECUTING → COMPLETED (succès, tous les steps OK)
    --   INITIATED → EXECUTING → COMPENSATING → COMPENSATED (échec + compensation OK)
    --   INITIATED → EXECUTING → COMPENSATING → COMPENSATION_FAILED (dead letter)
    --   INITIATED → EXECUTING → FAILED (échec sans compensation possible)
    CURRENT_STATE         VARCHAR2(50)  NOT NULL,

    -- Numéro du dernier step complété avec succès (0-based)
    -- Utilisé pour la reprise : on sait où reprendre la compensation
    LAST_STEP_COMPLETED   NUMBER(4)     DEFAULT 0,

    -- Liste JSON des noms de steps complétés
    -- Ex: '["verifierSolde","debiterCompte","ecritureComptable"]'
    -- Utilisé pour la compensation LIFO (on compense dans l'ordre inverse)
    COMPLETED_STEPS       VARCHAR2(2000),

    -- Contexte Saga complet sérialisé en JSON (CLOB pour les gros contextes)
    -- Contient toutes les données métier (montant, numéro de compte, etc.)
    -- Nécessaire pour reprendre la Saga ou la compensation
    CONTEXT_JSON          CLOB,

    -- Données d'entrée initiales sérialisées en JSON
    -- Permet de rejouer la Saga complètement si nécessaire
    INPUT_JSON            CLOB,

    -- Message d'erreur du dernier échec (pour le diagnostic post-mortem)
    -- Tronqué à 2000 caractères pour éviter les débordements
    ERROR_MESSAGE         VARCHAR2(2000),

    -- Nombre de tentatives de recovery globales (max 3)
    -- Après 3 tentatives → alerte humaine via SagaRecoveryScheduler
    RETRY_COUNT           NUMBER(4)     DEFAULT 0,

    -- Timestamps de suivi
    CREATED_AT            TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_AT            TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,

    -- Heartbeat — mis à jour toutes les 30s par l'orchestrateur
    -- Si HEARTBEAT_AT > SYSTIMESTAMP - 5 MINUTES et état non-terminal
    -- → la Saga est considérée orpheline (le serveur a crashé)
    HEARTBEAT_AT          TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,

    -- Contrainte de validation des états
    CONSTRAINT CHK_SAGA_STATE CHECK (CURRENT_STATE IN (
        'INITIATED','EXECUTING','COMPENSATING','COMPLETED',
        'COMPENSATED','FAILED','COMPENSATION_FAILED'
    ))
);

-- Index pour accélérer la requête findOrphans()
-- (WHERE CURRENT_STATE NOT IN (...) AND HEARTBEAT_AT < SYSTIMESTAMP - 5min)
CREATE INDEX IDX_SAGA_STATE_STATUS ON T_SAGA_STATE (CURRENT_STATE, HEARTBEAT_AT);

-- Index pour accélérer les requêtes par nom de Saga (monitoring, dashboard)
CREATE INDEX IDX_SAGA_STATE_NAME   ON T_SAGA_STATE (SAGA_NAME, CREATED_AT);

-- Commentaires sur la table et les colonnes clés
COMMENT ON TABLE T_SAGA_STATE IS 'État persisté des Sagas — recovery, dead letter, monitoring';
COMMENT ON COLUMN T_SAGA_STATE.SAGA_ID IS 'UUID unique de l''exécution Saga';
COMMENT ON COLUMN T_SAGA_STATE.HEARTBEAT_AT IS 'Dernier heartbeat — orpheline si > 5 min sans MAJ';
COMMENT ON COLUMN T_SAGA_STATE.RETRY_COUNT IS 'Nombre de tentatives de recovery (max 3)';
COMMENT ON COLUMN T_SAGA_STATE.COMPLETED_STEPS IS 'Liste JSON des steps complétés — pour compensation LIFO';
COMMENT ON COLUMN T_SAGA_STATE.CONTEXT_JSON IS 'Contexte Saga sérialisé — nécessaire pour la reprise';
`;
}
