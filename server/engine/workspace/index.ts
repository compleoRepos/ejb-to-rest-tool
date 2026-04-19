/**
 * Workspace Intelligence Module — Entry point.
 *
 * Exports all workspace-level analysis capabilities:
 * - RedundancyDetector: Detects duplicate/overlapping services across projects
 * - MutualizationRecommender: Proposes service consolidation strategies
 * - WorkspaceIntelligenceEngine: Orchestrates the full analysis pipeline
 *
 * @author Hamza NORDINE
 */

export { RedundancyDetector } from "./RedundancyDetector";
export type { RedundancyMatch, RedundancyReport, WorkspaceProjectEntry } from "./RedundancyDetector";

export { MutualizationRecommender } from "./MutualizationRecommender";
export type { MutualizationRecommendation, MutualizationReport } from "./MutualizationRecommender";

export { WorkspaceIntelligenceEngine } from "./WorkspaceIntelligenceEngine";
export type { WorkspaceInsight } from "./WorkspaceIntelligenceEngine";
