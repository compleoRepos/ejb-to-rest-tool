/**
 * Module COBOL Analyzer — Point d'entrée
 * @module server/engine/cobol
 */

export {
  CobolAnalyzer,
  type CobolProjectInput,
  type CobolFileInput,
  type CobolAnalysisResult,
} from './CobolAnalyzer';

export {
  CobolParser,
  type CobolProgramIR,
  type CobolDataItem,
  type CobolSQL,
  type CobolCall,
  type CobolFileDesc,
  type CobolSection,
} from './CobolParser';

export {
  JclParser,
  type JclJob,
  type JclStep,
  type JclDD,
} from './JclParser';

export {
  CobolDetectors,
  CobolDetectorsWithSource,
  type CobolTechDetection,
} from './CobolDetectors';

export {
  CobolMigrationReportGenerator,
  type CobolAnalysisReport,
  type ProgramEffort,
} from './CobolMigrationReport';
