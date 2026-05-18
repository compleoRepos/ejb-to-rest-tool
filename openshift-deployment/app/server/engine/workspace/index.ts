/**
 * Workspace Intelligence Module — Entry point.
 *
 * Exports all workspace-level analysis capabilities:
 * - RedundancyDetector: Detects duplicate/overlapping services across projects
 * - MutualizationRecommender: Proposes service consolidation strategies
 * - WorkspaceIntelligenceEngine: Orchestrates the full analysis pipeline
 *
 * @author Compleo
 */

export { RedundancyDetector } from "./RedundancyDetector";
export type { RedundancyMatch, RedundancyReport, WorkspaceProjectEntry } from "./RedundancyDetector";

export { MutualizationRecommender } from "./MutualizationRecommender";
export type { MutualizationRecommendation, MutualizationReport } from "./MutualizationRecommender";

export { WorkspaceIntelligenceEngine } from "./WorkspaceIntelligenceEngine";
export type { WorkspaceInsight } from "./WorkspaceIntelligenceEngine";

// v13.0 — Workspace Mode
export { DependencyAnalyzer } from "./DependencyAnalyzer";
export type { Workspace, ProjectNode, ExternalDep, DependencyEdge, WorkspaceGraph } from "./DependencyAnalyzer";

export { MigrationPlanner } from "./MigrationPlanner";
export type { Tier, TierItem, FrameworkGroup, MigrationPlan } from "./MigrationPlanner";

export { SharedStubLibrary } from "./SharedStubLibrary";
export type { ClassUsageData, MethodSignature, SharedStubBundle } from "./SharedStubLibrary";

// v13.2 — Workspace Report Generator
export { WorkspaceReportGenerator } from "./WorkspaceReportGenerator";
export type { ReportInput, ReportOutput, EnrichmentData, Finding, FrameworkRole, Risk } from "./WorkspaceReportGenerator";
