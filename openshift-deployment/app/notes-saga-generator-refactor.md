# Saga Generator Refactor Notes

## Modifications requises dans saga-generator.ts

### 1. Élargir le type SagaGeneratedFile.category
Ajouter: "saga-retry" | "saga-circuitbreaker" | "saga-transaction" | "saga-recovery"

### 2. Nouvelles fonctions helper à ajouter
- `getRetryPolicyForStep(step)` → retourne la factory method string
- `isExternalGateway(step)` → détecte SWIFT/TARGET2/SEPA etc.
- `needsCircuitBreaker(step)` → true si targetService != null && type !== 'async'
- `splitIntoPhases(steps)` → sépare readonly / write / async

### 3. Modifier generateOrchestrator()
- Remplacer @Transactional par @Transactional(propagation = NOT_SUPPORTED)
- Injecter CircuitBreakerRegistry, SagaStateStore, DataSource
- Ajouter retryPolicies Map<String, RetryPolicy> dans le constructeur
- Séparer execute() en 3 phases (readonly / write+savepoints / async)
- Wrapper chaque step avec retry + CB si nécessaire
- Ajouter heartbeat + persistState à chaque transition
- Modifier compensate() pour utiliser RetryPolicy.forCompensation()
- Ajouter sendToDeadLetter() et persistSagaState()

### 4. Modifier generateAllSagas()
- Ajouter les fichiers partagés (via generateSharedSagaFiles) UNE SEULE FOIS
- Retourner un objet enrichi avec sharedFiles + perSagaResults

### 5. Modifier generateStateEnum()
- Ajouter COMPENSATED et COMPENSATION_FAILED aux états

### 6. Modifier generateContext()
- Ajouter completedSteps: List<String>

### 7. Tests existants à préserver
- Test 11: attend 5 fichiers par saga → va passer à plus (shared + per-saga)
- Test 14: attend 5 files par candidat dans generateAllSagas
- Test 12-post-audit: utilise toBeGreaterThanOrEqual(5) → OK
