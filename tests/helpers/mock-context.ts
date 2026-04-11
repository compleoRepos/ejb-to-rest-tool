/**
 * tests/helpers/mock-context.ts
 *
 * Génère un ReportContext fictif pour les tests du ReportEnhancer (v7.4).
 * Simule un projet bancaire BMCE avec des modules EJB, des services
 * microservices, et des DataSources Oracle/DB2.
 */
import type { ReportContext, ReportModule, ReportService, ReportDataSource } from "../../server/engine/ml/report-enhancer";
import type { QualityReport } from "../../server/engine/quality-scorer";

export function buildMockContext(opts: {
  projectName?:  string;
  moduleCount?:  number;
  serviceCount?: number;
  hasOracle?:    boolean;
  hasDB2?:       boolean;
  hasJMS?:       boolean;
  hasSoap?:      boolean;
} = {}): ReportContext {
  const moduleNames  = ["CompteEJB", "VirementEJB", "CarteEJB", "ReportingEJB", "AuthServlet"];
  const tableNames   = ["T_COMPTES", "T_VIREMENTS", "T_CARTES", "T_DOSSIERS", "T_SESSIONS"];
  const serviceNames = ["carte-service", "compte-service", "virement-service",
                        "auth-service", "reporting-service", "batch-service"];
  const confidences  = [99, 92, 88, 84, 60, 84];

  const moduleCount  = opts.moduleCount ?? 5;
  const serviceCount = opts.serviceCount ?? 6;

  const modules: ReportModule[] = Array.from({ length: moduleCount }, (_, i) => ({
    id:           moduleNames[i] ?? `Module${i}`,
    type:         "EJB3X",
    writeTables:  tableNames[i] ? [tableNames[i]] : [],
    readTables:   [],
    dataSources:  opts.hasOracle ? ["jdbc/BMCE_CORE_DS"] : [],
    jmsQueues:    opts.hasJMS ? ["jms/queue/BMCE_VIREMENTS"] : [],
    externalApis: opts.hasSoap ? ["SWIFT GPI SOAP"] : [],
    sqlFeatures:  ["FOR UPDATE NOWAIT", "SYSDATE"],
    ejbCalls:     [],
  }));

  const services: ReportService[] = Array.from({ length: serviceCount }, (_, i) => ({
    name:             serviceNames[i] ?? `service-${i}`,
    ejbs:             [],
    ownedTables:      [],
    readOnlyTables:   [],
    kafkaTopics:      [],
    restApis:         [],
    restDependencies: [],
    dbSchema:         `SCHEMA_${i}`,
    confidence:       confidences[i] ?? 75,
  }));

  const dataSources: ReportDataSource[] = [
    {
      jndi:        "jdbc/BMCE_CORE_DS",
      vendor:      "Oracle",
      schema:      "BMCE_CORE",
      tables:      ["T_COMPTES", "T_VIREMENTS"],
      sqlFeatures: ["FOR UPDATE NOWAIT", "SYSDATE"],
    },
    ...(opts.hasDB2 ? [{
      jndi:        "jdbc/BMCE_LEGACY_DB2",
      vendor:      "DB2",
      schema:      "BMCE_HIST",
      tables:      ["T_MOUVEMENTS_ARCH"],
      sqlFeatures: ["YEAR()", "MONTH()", "FETCH FIRST"],
    }] : []),
  ];

  const qualityReport: QualityReport = {
    score:     87,
    grade:     "A",
    checks:    [],
    issues:    [],
    summary:   "Score 87/100 — Bon niveau de qualité",
    timestamp: new Date().toLocaleString("fr-FR"),
    totalScore: 87,
    maxScore:   100,
    criteria:   [],
  };

  return {
    projectName:            opts.projectName ?? "BMCE Digital Banking",
    modules,
    services,
    dataSources,
    useCasesCount:          opts.moduleCount ?? 8,
    confidenceScore:        89,
    qualityReport,
    estimatedDuration:      serviceCount * 2 + 4,
    criticalDependencies:   ["VirementEJB → T_COMPTES FOR UPDATE NOWAIT"],
    requiredInfrastructure: ["Kafka 3.x", "Oracle 19c RAC", "K8s cluster"],
  };
}
