/**
 * Types fondamentaux du moteur multi-technologies Compleo v3.0.
 * Pattern Registry + Strategy.
 * @author Compleo
 */

// ─── Technology Types ──────────────────────────────────────────────────────

export type TechnologyType =
  | "EJB_3X_STATELESS"
  | "EJB_3X_STATEFUL"
  | "EJB_3X_SINGLETON"
  | "EJB_3X_MDB"
  | "EJB_2X"
  | "SERVLET"
  | "JSP"
  | "STRUTS_1"
  | "STRUTS_2"
  | "SOAP"
  | "JAX_RS"
  | "JDBC"
  | "HIBERNATE"
  | "JMS"
  | "BATCH"
  | "JPA"
  | "EAI_CUSTOM"
  | "SAGA";

export type TechnologyTier = 1 | 2;

export interface TechnologyInfo {
  type: TechnologyType;
  tier: TechnologyTier;
  label: string;
  description: string;
  springTarget: string;
}

// ─── Detection IR ──────────────────────────────────────────────────────────

export interface DetectedComponent {
  technology: TechnologyType;
  className: string;
  packageName: string;
  filePath: string;
  confidence: number; // 0-100
  metadata: Record<string, unknown>;
}

export interface DetectedMethod {
  name: string;
  returnType: string;
  params: MethodParam[];
  httpVerb?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  urlPattern?: string;
  annotations: string[];
  javadoc?: string;
  lineNumber?: number;
  sourceRef?: string;
}

export interface MethodParam {
  name: string;
  type: string;
  annotations?: string[];
}

export interface DetectedField {
  name: string;
  type: string;
  annotations?: string[];
  columnName?: string;
  nullable?: boolean;
}

// ─── Specific IR types per technology ──────────────────────────────────────

export interface ServletComponent extends DetectedComponent {
  technology: "SERVLET";
  metadata: {
    servletName: string;
    urlPatterns: string[];
    methods: DetectedMethod[];
    usesSession: boolean;
    usesForward: boolean;
    requestParams: { name: string; type: string }[];
    source: "annotation" | "web.xml" | "extends";
  };
}

export interface JspComponent extends DetectedComponent {
  technology: "JSP";
  metadata: {
    fileName: string;
    beansUsed: { id: string; className: string }[];
    dataExposed: string[];
    linkedServlet?: string;
    forms: { action: string; method: string; fields: string[] }[];
    jstlTags: string[];
    migrationNote: string;
  };
}

export interface Ejb2xComponent extends DetectedComponent {
  technology: "EJB_2X";
  metadata: {
    beanClass: string;
    remoteInterface?: string;
    homeInterface?: string;
    sessionType: "Stateless" | "Stateful";
    businessMethods: DetectedMethod[];
    ejbJarDescriptor?: boolean;
  };
}

export interface StrutsComponent extends DetectedComponent {
  technology: "STRUTS_1" | "STRUTS_2";
  metadata: {
    actionPath: string;
    actionFormClass?: string;
    formFields: DetectedField[];
    validationRules: string[];
    forwards: { name: string; path: string }[];
    strutsVersion: 1 | 2;
  };
}

export interface SoapComponent extends DetectedComponent {
  technology: "SOAP";
  metadata: {
    serviceName: string;
    targetNamespace?: string;
    operations: DetectedMethod[];
    wsdlPresent: boolean;
    migrationNote: string;
  };
}

export interface JaxRsComponent extends DetectedComponent {
  technology: "JAX_RS";
  metadata: {
    basePath: string;
    methods: DetectedMethod[];
    produces: string[];
    consumes: string[];
  };
}

export interface JdbcComponent extends DetectedComponent {
  technology: "JDBC";
  metadata: {
    tableName: string;
    inferredEntity: {
      className: string;
      fields: DetectedField[];
    };
    queries: { sql: string; jpql: string; type: "SELECT" | "INSERT" | "UPDATE" | "DELETE" }[];
    connectionUrl?: string;
  };
}

export interface HibernateComponent extends DetectedComponent {
  technology: "HIBERNATE";
  metadata: {
    entityClass: string;
    tableName: string;
    fields: DetectedField[];
    hqlQueries: { hql: string; jpql: string }[];
    criteriaUsage: boolean;
    hbmXmlPresent: boolean;
  };
}

export interface JmsComponent extends DetectedComponent {
  technology: "JMS";
  metadata: {
    role: "PRODUCER" | "CONSUMER" | "MDB";
    destinationType: "QUEUE" | "TOPIC";
    destinationName: string;
    messageType: string;
    methods: DetectedMethod[];
  };
}

export interface BatchComponent extends DetectedComponent {
  technology: "BATCH";
  metadata: {
    role: "READER" | "PROCESSOR" | "WRITER" | "JOB_CONFIG";
    itemType?: string;
    outputType?: string;
    batchProperties: { name: string; type: string }[];
    jobName?: string;
    steps: string[];
  };
}

export interface JpaComponent extends DetectedComponent {
  technology: "JPA";
  metadata: {
    entityClass: string;
    tableName: string;
    fields: DetectedField[];
    namedQueries: { name: string; query: string }[];
    criteriaBuilderUsage: boolean;
  };
}

export interface EaiComponent extends DetectedComponent {
  technology: "EAI_CUSTOM";
  metadata: {
    useCaseName: string;
    voInType: string;
    voOutType: string;
    domain: string;
    description?: string;
    injectedServices: string[];
    transactional: boolean;
  };
}

// ─── Generation types ──────────────────────────────────────────────────────

export interface GeneratedFile {
  path: string;
  content: string;
  category: "controller" | "service" | "dto" | "entity" | "repository" | "config" | "test" | "migration_note" | "infrastructure" | "exception" | "enum" | "adapter" | "validator" | "cloud" | "pom" | "report" | "main" | "saga" | "other";
  technology: TechnologyType;
  sourceRef?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  file: string;
  line?: number;
  message: string;
  severity: "error" | "warning";
}

export interface MigrationNote {
  title: string;
  content: string;
  severity: "info" | "warning" | "critical";
  technology: TechnologyType;
  affectedFiles: string[];
}

// ─── Detector & Generator interfaces ───────────────────────────────────────

export interface TechnologyDetector {
  readonly technology: TechnologyType;
  readonly tier: TechnologyTier;
  readonly label: string;
  canDetect(fileContent: string, fileName: string): boolean;
  detect(fileContent: string, fileName: string, allFiles?: { path: string; content: string }[]): DetectedComponent[];
  getConfidence(component: DetectedComponent): number;
}

export interface CodeGenerator {
  readonly technology: TechnologyType;
  canGenerate(component: DetectedComponent): boolean;
  generate(component: DetectedComponent, allComponents: DetectedComponent[], basePackage: string): GeneratedFile[];
  validate(generated: GeneratedFile[]): ValidationResult;
}
