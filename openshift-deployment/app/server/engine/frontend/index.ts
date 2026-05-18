/**
 * Module Frontend -- Barrel export.
 *
 * Exporte les 3 composants principaux du module frontend :
 *   1. DynamicOptionsResolver : Options de generation conditionnelles
 *   2. FrontendGenerator : Generateur de projet frontend (React/Angular/Vue)
 *   3. PostMigrationChecklist : Checklist post-migration dynamique
 *
 * @version v10.8
 */

export { DynamicOptionsResolver } from "./DynamicOptionsResolver";
export type {
  DynamicOption,
  SubOption,
  ResolvedOptions,
  DetectedDomain,
  FrontendFramework,
  IndustryStandard,
  MessagingTarget,
} from "./DynamicOptionsResolver";

export { FrontendGenerator } from "./FrontendGenerator";
export type {
  FrontendGeneratorInput,
  FrontendGeneratorOutput,
  FrontendTodo,
  ExtractedEndpoint,
  ExtractedDto,
  FrontendGenEvent,
  FrontendGenEventCallback,
} from "./FrontendGenerator";

export { PostMigrationChecklist } from "./PostMigrationChecklist";
export type {
  ChecklistItem,
  ChecklistCategory,
  ChecklistPriority,
  PostMigrationChecklistResult,
  ChecklistInput,
} from "./PostMigrationChecklist";
