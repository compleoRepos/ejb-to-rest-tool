/**
 * Saga Orchestration Module — Compleo v7.10 (Production-Ready)
 * @author Compleo
 */

export { detectSagaCandidates } from "./saga-detector";
export type { SagaCandidate, EjbDependency } from "./saga-detector";

export { extractSagaSteps, extractIntermediateResults } from "./saga-step-extractor";
export type { SagaStep, StepType, IntermediateResult } from "./saga-step-extractor";

export { inferCompensation } from "./saga-compensation";
export type { CompensationAction } from "./saga-compensation";

export { generateSaga, generateAllSagas, generateSagaWithML, generateAllSagasWithML } from "./saga-generator";
export type { SagaGeneratedFile, SagaGenerationResult } from "./saga-generator";

export { generateSharedSagaFiles } from "./saga-shared-generators";

// ML-Enhanced Saga
export { SagaMLEnricher } from "./ml/SagaMLEnricher";
export type { SagaMLResult } from "./ml/SagaMLEnricher";
export type { MLStepEnrichment } from "./ml/prompts";
export { validateSagaMLOutput } from "./ml/validateSagaMLOutput";
export { generateFallbackEnrichment } from "./ml/fallback";
