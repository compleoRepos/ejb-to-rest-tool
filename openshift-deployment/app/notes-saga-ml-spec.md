# Notes — ML-Enhanced Saga Generation Spec

## Résumé
Le LLM (Ollama qwen2.5) enrichit les squelettes Saga générés par le rule engine :
- Step body : logique métier migrée depuis l'EJB
- Compensation body : action inverse concrète
- Context fields : résultats intermédiaires typés
- Retry policy : analysé depuis les exceptions du code
- Preconditions / Postconditions

## Architecture
1. Rule Engine (existant) → extraction mécanique
2. ML Step Enricher (nouveau) → enrichissement par LLM
3. ML Validator (nouveau) → validation anti-hallucination
4. Saga Generator (modifié) → assemblage final

## Fichiers à créer (4)
- server/engine/saga/ml/SagaMLEnricher.ts
- server/engine/saga/ml/validateSagaMLOutput.ts
- server/engine/saga/ml/prompts.ts
- server/engine/saga/ml/fallback.ts

## Fichiers à modifier (2)
- server/engine/saga/saga-generator.ts (intégrer phase ML)
- server/agent/CompleoAgent.ts (brancher ML Saga dans pipeline)

## Types clés
- StepContext : stepNumber, stepLabel, stepType, isCompensable, targetService, targetMethod, ejbSourceCode, availableServices, availableContext, availableExceptions, sqlStatements
- MLStepEnrichment : stepBody, compensationBody, contextFields, retryRecommendation, preconditions, postconditions
- SagaMLValidation : isValid, issues, cleanedOutput

## Validation anti-hallucination (6 checks)
1. Services utilisés existent dans availableServices
2. Pas de JDBC direct (Connection, PreparedStatement, ResultSet)
3. Compensation non vide pour steps compensables
4. Types Java valides
5. Pas de classes inventées
6. Compensation idempotente (pas d'INSERT sauf contre-passation)

## Fallback rule-based
- Si Ollama absent → fallback automatique
- Compensation basée sur patterns SQL bancaires connus (10 patterns)
- Context minimal mais fonctionnel

## Intégration pipeline
- Phase 4c (entre SAGA DETECTION et SAGA GENERATION)
- Activé par la checkbox "Rapports IA" existante
- Durée estimée : ~6-9 min pour 37 appels Ollama

## Tests (14-saga-ml-enrichment.test.ts)
- Step Enrichment (5 tests)
- Context Enrichment (4 tests)
- Retry Analysis (3 tests)
- Compensation Quality (4 tests)
- Fallback sans Ollama (3 tests)
- Anti-hallucination Saga (4 tests)
