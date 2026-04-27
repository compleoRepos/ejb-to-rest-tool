/**
 * Intelligence Module — Point d'entrée public.
 * Exporte l'orchestrateur et les types nécessaires.
 * 100% déterministe, 0 LLM, 100% on-premises.
 *
 * @author Compleo
 */

export { IntelligenceOrchestrator } from "./IntelligenceOrchestrator";
export type { IntelligenceReport, JavaFileInput } from "./IntelligenceOrchestrator";

export { SemanticAnalyzer } from "./semantic/SemanticAnalyzer";
export type { RoleInference, ClassContext } from "./semantic/SemanticAnalyzer";

export { DomainInferrer } from "./semantic/DomainInferrer";
export type { DomainInference, ClassDomainContext } from "./semantic/DomainInferrer";

export { IntentInferrer } from "./semantic/IntentInferrer";
export type { IntentInference, HttpVerb, SensitivityLevel } from "./semantic/IntentInferrer";

export { DataProfiler } from "./semantic/DataProfiler";
export type { DataProfile, FieldProfile, FieldContext } from "./semantic/DataProfiler";

export { KnowledgeBase } from "./knowledge/KnowledgeBase";
export type { KnowledgeBaseStats } from "./knowledge/KnowledgeBase";

export type { Rule, RuleHit, RuleContext, Severity, RuleFix } from "./knowledge/rules/RuleEngine";
export type RuleCategory = string;
export type RuleSeverity = string;

export { IntelligenceScorer } from "./scoring/IntelligenceScorer";
export type { IntelligenceScore } from "./scoring/IntelligenceScorer";

export { ReportBuilder } from "./report/ReportBuilder";
