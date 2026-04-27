/**
 * Java Legacy Modernizer Platform — Moteur d'analyse étendu.
 * Détecte l'ensemble des technologies Java legacy :
 * EJB, Servlets, JSP, Struts, SOAP, JDBC, Hibernate, JMS, Batch, Transactions.
 * Produit un graphe de dépendances, une cartographie des services et une analyse du couplage.
 *
 * @author Compleo
 * @version 2.0.0
 */

// ============================================================
// Types & Interfaces — Technologies Legacy
// ============================================================

export type LegacyTechnology =
  | "ejb"
  | "servlet"
  | "jsp"
  | "struts"
  | "soap"
  | "jdbc"
  | "hibernate"
  | "jms"
  | "batch"
  | "transaction"
  | "spring-legacy"
  | "jakarta-ee";

export interface TechnologyDetection {
  technology: LegacyTechnology;
  pattern: string;
  description: string;
  lineNumber: number;
  rawCode: string;
  severity: "info" | "warning" | "critical";
  modernTarget: string;
}

export interface ServletDetection {
  className: string;
  urlPattern: string;
  httpMethods: string[];
  lineNumber: number;
  rawCode: string;
}

export interface JspDetection {
  type: "scriptlet" | "directive" | "taglib" | "expression" | "declaration" | "include";
  content: string;
  lineNumber: number;
  rawCode: string;
}

export interface StrutsDetection {
  type: "action" | "form" | "forward" | "config" | "tiles";
  className: string;
  path: string;
  lineNumber: number;
  rawCode: string;
}

export interface SoapDetection {
  type: "service" | "method" | "port" | "binding" | "wsdl";
  serviceName: string;
  operationName: string;
  lineNumber: number;
  rawCode: string;
}

export interface JdbcDetection {
  type: "connection" | "statement" | "prepared_statement" | "callable_statement" | "result_set" | "datasource";
  operation: string;
  sql: string;
  lineNumber: number;
  rawCode: string;
}

export interface HibernateDetection {
  type: "session_factory" | "session" | "hql" | "criteria" | "native_query" | "mapping";
  operation: string;
  query: string;
  lineNumber: number;
  rawCode: string;
}

export interface BatchDetection {
  type: "reader" | "writer" | "processor" | "batchlet" | "step" | "job" | "listener";
  className: string;
  lineNumber: number;
  rawCode: string;
}

export interface ServiceNode {
  name: string;
  type: LegacyTechnology;
  methods: string[];
  dependencies: string[];
  lineNumber: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: "injection" | "lookup" | "call" | "inheritance" | "import";
  weight: number;
}

export interface CouplingMetrics {
  afferentCoupling: number; // Ca: incoming dependencies
  efferentCoupling: number; // Ce: outgoing dependencies
  instability: number;      // I = Ce / (Ca + Ce)
  abstractness: number;
  distanceFromMainSequence: number;
}

export interface ExtendedAnalysisReport {
  fileName: string;
  className: string;
  packageName: string;
  // Existing EJB analysis
  ejbDetections: TechnologyDetection[];
  // New technology detections
  servletDetections: ServletDetection[];
  jspDetections: JspDetection[];
  strutsDetections: StrutsDetection[];
  soapDetections: SoapDetection[];
  jdbcDetections: JdbcDetection[];
  hibernateDetections: HibernateDetection[];
  jmsDetections: TechnologyDetection[];
  batchDetections: BatchDetection[];
  transactionDetections: TechnologyDetection[];
  // All technology detections (flat list)
  allDetections: TechnologyDetection[];
  // Service graph
  serviceNodes: ServiceNode[];
  dependencyEdges: DependencyEdge[];
  // Coupling
  couplingMetrics: CouplingMetrics;
  // Summary
  summary: ExtendedSummary;
}

export interface ExtendedSummary {
  technologiesDetected: LegacyTechnology[];
  technologyCounts: Record<LegacyTechnology, number>;
  totalDetections: number;
  complexityScore: number; // 0-100
  estimatedEffortDays: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  modernizationTargets: string[];
}

// ============================================================
// Main Analysis Function
// ============================================================

export function analyzeJavaLegacy(code: string, fileName: string = "Unknown.java"): ExtendedAnalysisReport {
  const lines = code.split("\n");
  const className = extractClassName(code);
  const packageName = extractPackageName(code);

  const ejbDetections = detectEjb(lines);
  const servletDetections = detectServlets(lines, code);
  const jspDetections = detectJsp(lines);
  const strutsDetections = detectStruts(lines, code);
  const soapDetections = detectSoap(lines, code);
  const jdbcDetections = detectJdbc(lines, code);
  const hibernateDetections = detectHibernate(lines, code);
  const jmsDetections = detectJms(lines);
  const batchDetections = detectBatch(lines, code);
  const transactionDetections = detectTransactions(lines);

  const allDetections: TechnologyDetection[] = [
    ...ejbDetections,
    ...servletDetections.map(s => toTechDetection(s, "servlet", `Servlet: ${s.className}`, "Spring REST Controller")),
    ...jspDetections.map(j => toTechDetection(j, "jsp", `JSP ${j.type}: ${j.content.substring(0, 50)}`, "Thymeleaf / React SPA")),
    ...strutsDetections.map(s => toTechDetection(s, "struts", `Struts ${s.type}: ${s.className}`, "Spring MVC Controller")),
    ...soapDetections.map(s => toTechDetection(s, "soap", `SOAP ${s.type}: ${s.serviceName}.${s.operationName}`, "REST API (OpenAPI)")),
    ...jdbcDetections.map(j => toTechDetection(j, "jdbc", `JDBC ${j.type}: ${j.operation}`, "Spring Data JPA")),
    ...hibernateDetections.map(h => toTechDetection(h, "hibernate", `Hibernate ${h.type}: ${h.operation}`, "Spring Data JPA")),
    ...jmsDetections,
    ...batchDetections.map(b => toTechDetection(b, "batch", `Batch ${b.type}: ${b.className}`, "Spring Batch")),
    ...transactionDetections,
  ];

  const serviceNodes = buildServiceNodes(lines, code, className, allDetections);
  const dependencyEdges = buildDependencyEdges(lines, code, className);
  const couplingMetrics = calculateCoupling(dependencyEdges, className);

  const technologiesDetected = Array.from(new Set(allDetections.map(d => d.technology)));
  const technologyCounts: Record<string, number> = {};
  for (const tech of allDetections) {
    technologyCounts[tech.technology] = (technologyCounts[tech.technology] || 0) + 1;
  }

  const complexityScore = calculateComplexity(allDetections, dependencyEdges);
  const estimatedEffortDays = estimateEffort(allDetections, complexityScore);
  const riskLevel = calculateRisk(allDetections, complexityScore);
  const modernizationTargets = Array.from(new Set(allDetections.map(d => d.modernTarget)));

  return {
    fileName,
    className,
    packageName,
    ejbDetections,
    servletDetections,
    jspDetections,
    strutsDetections,
    soapDetections,
    jdbcDetections,
    hibernateDetections,
    jmsDetections,
    batchDetections,
    transactionDetections,
    allDetections,
    serviceNodes,
    dependencyEdges,
    couplingMetrics,
    summary: {
      technologiesDetected: technologiesDetected as LegacyTechnology[],
      technologyCounts: technologyCounts as Record<LegacyTechnology, number>,
      totalDetections: allDetections.length,
      complexityScore,
      estimatedEffortDays,
      riskLevel,
      modernizationTargets,
    },
  };
}

// ============================================================
// Helpers
// ============================================================

function extractClassName(code: string): string {
  const match = code.match(/(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/);
  return match ? match[1] : "UnknownClass";
}

function extractPackageName(code: string): string {
  const match = code.match(/package\s+([\w.]+)\s*;/);
  return match ? match[1] : "";
}

function toTechDetection(
  item: { lineNumber: number; rawCode: string },
  technology: LegacyTechnology,
  description: string,
  modernTarget: string
): TechnologyDetection {
  return {
    technology,
    pattern: technology,
    description,
    lineNumber: item.lineNumber,
    rawCode: item.rawCode,
    severity: technology === "jsp" || technology === "struts" ? "critical" : "warning",
    modernTarget,
  };
}

// ============================================================
// EJB Detection
// ============================================================

function detectEjb(lines: string[]): TechnologyDetection[] {
  const detections: TechnologyDetection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.match(/^@(Stateless|Stateful|Singleton|MessageDriven)\b/)) {
      detections.push({
        technology: "ejb",
        pattern: line.match(/@(\w+)/)?.[1] || "EJB",
        description: `EJB Bean: ${line}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "warning",
        modernTarget: "Spring @Service / @Component",
      });
    }

    if (line.match(/^@(EJB|Inject)\b/)) {
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
      detections.push({
        technology: "ejb",
        pattern: "EJB Injection",
        description: `Injection EJB: ${nextLine}`,
        lineNumber: i + 1,
        rawCode: `${line}\n${nextLine}`,
        severity: "warning",
        modernTarget: "Spring @Autowired / Constructor Injection",
      });
    }

    if (line.includes("InitialContext") || line.includes(".lookup(")) {
      detections.push({
        technology: "ejb",
        pattern: "JNDI Lookup",
        description: `JNDI Lookup: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "critical",
        modernTarget: "Spring DI / WebClient",
      });
    }

    if (line.match(/@(Local|Remote|LocalBean)\b/)) {
      detections.push({
        technology: "ejb",
        pattern: line.match(/@(\w+)/)?.[1] || "EJB Interface",
        description: `EJB Interface: ${line}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "info",
        modernTarget: "Spring Interface / REST API",
      });
    }
  }

  return detections;
}

// ============================================================
// Servlet Detection
// ============================================================

function detectServlets(lines: string[], code: string): ServletDetection[] {
  const detections: ServletDetection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // @WebServlet annotation
    if (line.match(/@WebServlet/)) {
      const urlMatch = line.match(/urlPatterns?\s*=\s*\{?\s*"([^"]+)"/);
      const valueMatch = line.match(/@WebServlet\(\s*"([^"]+)"/);
      const urlPattern = urlMatch?.[1] || valueMatch?.[1] || "/unknown";

      // Find class name
      let className = "UnknownServlet";
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const classMatch = lines[j].match(/class\s+(\w+)/);
        if (classMatch) {
          className = classMatch[1];
          break;
        }
      }

      // Detect HTTP methods in the class
      const httpMethods: string[] = [];
      if (code.includes("doGet")) httpMethods.push("GET");
      if (code.includes("doPost")) httpMethods.push("POST");
      if (code.includes("doPut")) httpMethods.push("PUT");
      if (code.includes("doDelete")) httpMethods.push("DELETE");
      if (httpMethods.length === 0) httpMethods.push("GET");

      detections.push({ className, urlPattern, httpMethods, lineNumber: i + 1, rawCode: line });
    }

    // Extends HttpServlet
    if (line.match(/extends\s+HttpServlet\b/)) {
      const classMatch = line.match(/class\s+(\w+)/);
      const className = classMatch?.[1] || "UnknownServlet";
      if (!detections.some(d => d.className === className)) {
        const httpMethods: string[] = [];
        if (code.includes("doGet")) httpMethods.push("GET");
        if (code.includes("doPost")) httpMethods.push("POST");
        if (code.includes("doPut")) httpMethods.push("PUT");
        if (code.includes("doDelete")) httpMethods.push("DELETE");
        if (httpMethods.length === 0) httpMethods.push("GET");

        detections.push({ className, urlPattern: "/", httpMethods, lineNumber: i + 1, rawCode: line });
      }
    }

    // javax.servlet imports
    if (line.match(/import\s+(javax|jakarta)\.servlet/)) {
      // Already covered by class detection, just note it
    }
  }

  return detections;
}

// ============================================================
// JSP Detection
// ============================================================

function detectJsp(lines: string[]): JspDetection[] {
  const detections: JspDetection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Scriptlets <% ... %>
    if (line.match(/<%[^=@!-]/)) {
      detections.push({ type: "scriptlet", content: line, lineNumber: i + 1, rawCode: line });
    }

    // Expressions <%= ... %>
    if (line.includes("<%=")) {
      detections.push({ type: "expression", content: line, lineNumber: i + 1, rawCode: line });
    }

    // Directives <%@ ... %>
    if (line.includes("<%@")) {
      detections.push({ type: "directive", content: line, lineNumber: i + 1, rawCode: line });
    }

    // Declarations <%! ... %>
    if (line.includes("<%!")) {
      detections.push({ type: "declaration", content: line, lineNumber: i + 1, rawCode: line });
    }

    // Taglib
    if (line.match(/<%@\s*taglib/i) || line.match(/xmlns:\w+="http:\/\/java\.sun\.com\/jsp/)) {
      detections.push({ type: "taglib", content: line, lineNumber: i + 1, rawCode: line });
    }

    // JSP include
    if (line.match(/<jsp:include/) || line.match(/<%@\s*include/)) {
      detections.push({ type: "include", content: line, lineNumber: i + 1, rawCode: line });
    }

    // RequestDispatcher forward (in Java code)
    if (line.includes("RequestDispatcher") || line.includes(".forward(") || line.includes(".include(")) {
      detections.push({ type: "include", content: line, lineNumber: i + 1, rawCode: line });
    }
  }

  return detections;
}

// ============================================================
// Struts Detection
// ============================================================

function detectStruts(lines: string[], code: string): StrutsDetection[] {
  const detections: StrutsDetection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Struts Action class
    if (line.match(/extends\s+(Action|DispatchAction|MappingDispatchAction|ActionSupport)\b/)) {
      const classMatch = line.match(/class\s+(\w+)/);
      detections.push({
        type: "action",
        className: classMatch?.[1] || "UnknownAction",
        path: "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Struts ActionForm
    if (line.match(/extends\s+(ActionForm|ValidatorForm|DynaActionForm)\b/)) {
      const classMatch = line.match(/class\s+(\w+)/);
      detections.push({
        type: "form",
        className: classMatch?.[1] || "UnknownForm",
        path: "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Struts 2 annotations
    if (line.match(/@(Action|Result|Results|Namespace)\b/)) {
      const pathMatch = line.match(/value\s*=\s*"([^"]+)"/);
      detections.push({
        type: "action",
        className: extractClassName(code),
        path: pathMatch?.[1] || "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // struts-config.xml patterns
    if (line.includes("<action") && line.includes("path=")) {
      const pathMatch = line.match(/path="([^"]+)"/);
      const typeMatch = line.match(/type="([^"]+)"/);
      detections.push({
        type: "config",
        className: typeMatch?.[1] || "",
        path: pathMatch?.[1] || "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Tiles
    if (line.includes("<tiles:") || line.includes("TilesConfigurer") || line.includes("tiles-defs")) {
      detections.push({
        type: "tiles",
        className: "",
        path: "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }
  }

  return detections;
}

// ============================================================
// SOAP Detection
// ============================================================

function detectSoap(lines: string[], code: string): SoapDetection[] {
  const detections: SoapDetection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // @WebService annotation
    if (line.match(/@WebService\b/)) {
      const nameMatch = line.match(/serviceName\s*=\s*"([^"]+)"/);
      const className = extractClassName(code);
      detections.push({
        type: "service",
        serviceName: nameMatch?.[1] || className,
        operationName: "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // @WebMethod annotation
    if (line.match(/@WebMethod\b/)) {
      const opMatch = line.match(/operationName\s*=\s*"([^"]+)"/);
      // Find method name
      let methodName = "unknownMethod";
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const mMatch = lines[j].match(/(?:public|protected)\s+\w+\s+(\w+)\s*\(/);
        if (mMatch) { methodName = mMatch[1]; break; }
      }
      detections.push({
        type: "method",
        serviceName: extractClassName(code),
        operationName: opMatch?.[1] || methodName,
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // @WebParam
    if (line.match(/@WebParam\b/)) {
      detections.push({
        type: "binding",
        serviceName: extractClassName(code),
        operationName: "parameter",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // JAX-WS imports
    if (line.match(/import\s+(javax|jakarta)\.xml\.ws\./)) {
      detections.push({
        type: "port",
        serviceName: "",
        operationName: "JAX-WS import",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // WSDL references
    if (line.includes(".wsdl") || line.includes("wsdlLocation")) {
      const wsdlMatch = line.match(/"([^"]*\.wsdl[^"]*)"/);
      detections.push({
        type: "wsdl",
        serviceName: "",
        operationName: wsdlMatch?.[1] || "WSDL reference",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // SOAPMessage, SOAPConnection
    if (line.includes("SOAPMessage") || line.includes("SOAPConnection") || line.includes("SOAPFactory")) {
      detections.push({
        type: "binding",
        serviceName: "",
        operationName: "SOAP API usage",
        lineNumber: i + 1,
        rawCode: line,
      });
    }
  }

  return detections;
}

// ============================================================
// JDBC Detection
// ============================================================

function detectJdbc(lines: string[], code: string): JdbcDetection[] {
  const detections: JdbcDetection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // DriverManager.getConnection
    if (line.includes("DriverManager.getConnection")) {
      const urlMatch = line.match(/"([^"]+)"/);
      detections.push({
        type: "connection",
        operation: "DriverManager.getConnection",
        sql: urlMatch?.[1] || "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // DataSource
    if (line.match(/@Resource/) && code.includes("DataSource")) {
      detections.push({
        type: "datasource",
        operation: "DataSource injection",
        sql: "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Statement / PreparedStatement / CallableStatement
    if (line.includes("createStatement()")) {
      detections.push({
        type: "statement",
        operation: "createStatement",
        sql: findNearestSql(lines, i),
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    if (line.includes("prepareStatement(")) {
      const sqlMatch = line.match(/prepareStatement\(\s*"([^"]+)"/);
      detections.push({
        type: "prepared_statement",
        operation: "prepareStatement",
        sql: sqlMatch?.[1] || findNearestSql(lines, i),
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    if (line.includes("prepareCall(")) {
      const sqlMatch = line.match(/prepareCall\(\s*"([^"]+)"/);
      detections.push({
        type: "callable_statement",
        operation: "prepareCall (stored procedure)",
        sql: sqlMatch?.[1] || "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // ResultSet operations
    if (line.includes("executeQuery(") || line.includes("executeUpdate(") || line.includes("execute(")) {
      if (line.includes("Statement") || line.includes("stmt") || line.includes("ps")) {
        const sqlMatch = line.match(/"([^"]+)"/);
        detections.push({
          type: "result_set",
          operation: line.includes("executeQuery") ? "SELECT" : line.includes("executeUpdate") ? "UPDATE/INSERT/DELETE" : "execute",
          sql: sqlMatch?.[1] || "",
          lineNumber: i + 1,
          rawCode: line,
        });
      }
    }
  }

  return detections;
}

function findNearestSql(lines: string[], index: number): string {
  for (let i = Math.max(0, index - 3); i <= Math.min(lines.length - 1, index + 3); i++) {
    const sqlMatch = lines[i].match(/"([^"]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)[^"]*)"/i);
    if (sqlMatch) return sqlMatch[1];
  }
  return "";
}

// ============================================================
// Hibernate Detection
// ============================================================

function detectHibernate(lines: string[], code: string): HibernateDetection[] {
  const detections: HibernateDetection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // SessionFactory
    if (line.includes("SessionFactory") && !line.startsWith("import")) {
      detections.push({
        type: "session_factory",
        operation: "SessionFactory usage",
        query: "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Session operations
    if (line.match(/session\.(save|persist|update|merge|delete|get|load|createQuery|createCriteria)\(/i)) {
      const opMatch = line.match(/session\.(\w+)\(/i);
      const queryMatch = line.match(/"([^"]+)"/);
      detections.push({
        type: "session",
        operation: opMatch?.[1] || "session operation",
        query: queryMatch?.[1] || "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // HQL queries
    if (line.includes("createQuery(") && (line.includes("FROM ") || line.includes("from "))) {
      const queryMatch = line.match(/"([^"]+)"/);
      detections.push({
        type: "hql",
        operation: "HQL Query",
        query: queryMatch?.[1] || "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Criteria API (legacy)
    if (line.includes("createCriteria(") || line.includes("Criteria ") || line.includes("Restrictions.")) {
      detections.push({
        type: "criteria",
        operation: "Criteria API",
        query: "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Native SQL via Hibernate
    if (line.includes("createSQLQuery(") || line.includes("createNativeQuery(")) {
      const queryMatch = line.match(/"([^"]+)"/);
      detections.push({
        type: "native_query",
        operation: "Native SQL Query",
        query: queryMatch?.[1] || "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Hibernate mapping annotations
    if (line.match(/@(Entity|Table|Column|Id|GeneratedValue|OneToMany|ManyToOne|ManyToMany|OneToOne|JoinColumn)\b/)) {
      detections.push({
        type: "mapping",
        operation: line.match(/@(\w+)/)?.[1] || "mapping",
        query: "",
        lineNumber: i + 1,
        rawCode: line,
      });
    }
  }

  return detections;
}

// ============================================================
// JMS Detection (extended)
// ============================================================

function detectJms(lines: string[]): TechnologyDetection[] {
  const detections: TechnologyDetection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.match(/@MessageDriven/) || line.includes("MessageListener")) {
      detections.push({
        technology: "jms",
        pattern: "MessageDriven",
        description: `JMS Message-Driven Bean: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "warning",
        modernTarget: "Kafka @KafkaListener",
      });
    }

    if (line.includes("JMSContext") || line.includes("JMSProducer") || line.includes("JMSConsumer")) {
      detections.push({
        technology: "jms",
        pattern: "JMS API",
        description: `JMS API: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "warning",
        modernTarget: "KafkaTemplate / @KafkaListener",
      });
    }

    if (line.includes("ConnectionFactory") && (line.includes("jms") || line.includes("JMS") || line.includes("javax.jms") || line.includes("jakarta.jms"))) {
      detections.push({
        technology: "jms",
        pattern: "ConnectionFactory",
        description: `JMS ConnectionFactory: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "warning",
        modernTarget: "Spring Kafka Configuration",
      });
    }

    if (line.includes("Queue") && (line.includes("@Resource") || line.includes("javax.jms") || line.includes("jakarta.jms"))) {
      detections.push({
        technology: "jms",
        pattern: "JMS Queue",
        description: `JMS Queue: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "info",
        modernTarget: "Kafka Topic",
      });
    }

    if (line.includes("Topic") && (line.includes("@Resource") || line.includes("javax.jms") || line.includes("jakarta.jms"))) {
      detections.push({
        technology: "jms",
        pattern: "JMS Topic",
        description: `JMS Topic: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "info",
        modernTarget: "Kafka Topic",
      });
    }

    // IBM MQ
    if (line.includes("MQQueue") || line.includes("MQConnection") || line.includes("com.ibm.mq")) {
      detections.push({
        technology: "jms",
        pattern: "IBM MQ",
        description: `IBM MQ: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "critical",
        modernTarget: "Kafka / Spring Cloud Stream",
      });
    }
  }

  return detections;
}

// ============================================================
// Batch Detection (extended)
// ============================================================

function detectBatch(lines: string[], code: string): BatchDetection[] {
  const detections: BatchDetection[] = [];
  const className = extractClassName(code);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.match(/implements\s+ItemReader\b/) || line.includes("extends AbstractItemReader")) {
      detections.push({ type: "reader", className, lineNumber: i + 1, rawCode: line });
    }
    if (line.match(/implements\s+ItemWriter\b/) || line.includes("extends AbstractItemWriter")) {
      detections.push({ type: "writer", className, lineNumber: i + 1, rawCode: line });
    }
    if (line.match(/implements\s+ItemProcessor\b/)) {
      detections.push({ type: "processor", className, lineNumber: i + 1, rawCode: line });
    }
    if (line.includes("AbstractBatchlet") || line.match(/implements\s+Batchlet\b/)) {
      detections.push({ type: "batchlet", className, lineNumber: i + 1, rawCode: line });
    }
    if (line.match(/@BatchProperty/) || line.match(/@Inject.*BatchProperty/)) {
      detections.push({ type: "step", className, lineNumber: i + 1, rawCode: line });
    }
    if (line.includes("javax.batch") || line.includes("jakarta.batch")) {
      if (!line.startsWith("import")) {
        detections.push({ type: "job", className, lineNumber: i + 1, rawCode: line });
      }
    }
    if (line.match(/implements\s+(StepListener|JobListener|ChunkListener|ItemReadListener|ItemWriteListener)\b/)) {
      detections.push({ type: "listener", className, lineNumber: i + 1, rawCode: line });
    }
  }

  return detections;
}

// ============================================================
// Transaction Detection (extended)
// ============================================================

function detectTransactions(lines: string[]): TechnologyDetection[] {
  const detections: TechnologyDetection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.match(/@TransactionAttribute\b/)) {
      const typeMatch = line.match(/TransactionAttributeType\.(\w+)/);
      detections.push({
        technology: "transaction",
        pattern: "@TransactionAttribute",
        description: `EJB Transaction: ${typeMatch?.[1] || "REQUIRED"}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "warning",
        modernTarget: "Spring @Transactional",
      });
    }

    if (line.match(/@Transactional\b/)) {
      detections.push({
        technology: "transaction",
        pattern: "@Transactional",
        description: `Transaction: ${line.substring(0, 60)}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "info",
        modernTarget: "Spring @Transactional (keep/update)",
      });
    }

    if (line.includes("UserTransaction") && !line.startsWith("import")) {
      detections.push({
        technology: "transaction",
        pattern: "UserTransaction",
        description: `Programmatic transaction: ${line.substring(0, 60)}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "critical",
        modernTarget: "Spring TransactionTemplate",
      });
    }

    if (line.includes("EntityTransaction") && !line.startsWith("import")) {
      detections.push({
        technology: "transaction",
        pattern: "EntityTransaction",
        description: `JPA EntityTransaction: ${line.substring(0, 60)}`,
        lineNumber: i + 1,
        rawCode: line,
        severity: "warning",
        modernTarget: "Spring @Transactional",
      });
    }
  }

  return detections;
}

// ============================================================
// Service Graph & Dependency Analysis
// ============================================================

function buildServiceNodes(
  lines: string[],
  code: string,
  className: string,
  detections: TechnologyDetection[]
): ServiceNode[] {
  const nodes: ServiceNode[] = [];
  const techTypes = new Set(detections.map(d => d.technology));

  // Current class as a node
  const methods: string[] = [];
  const methodRegex = /(?:public|protected|private)\s+\w+(?:<[^>]+>)?\s+(\w+)\s*\(/g;
  let match;
  while ((match = methodRegex.exec(code)) !== null) {
    if (match[1] !== className) methods.push(match[1]);
  }

  const deps: string[] = [];
  for (const det of detections) {
    if (det.pattern === "EJB Injection" || det.pattern === "JNDI Lookup") {
      const serviceMatch = det.rawCode.match(/(\w+Service\w*)/);
      if (serviceMatch) deps.push(serviceMatch[1]);
    }
  }

  const primaryTech: LegacyTechnology = techTypes.has("ejb") ? "ejb"
    : techTypes.has("servlet") ? "servlet"
    : techTypes.has("struts") ? "struts"
    : techTypes.has("soap") ? "soap"
    : techTypes.has("batch") ? "batch"
    : "jakarta-ee";

  nodes.push({
    name: className,
    type: primaryTech,
    methods,
    dependencies: Array.from(new Set(deps)),
    lineNumber: 1,
  });

  return nodes;
}

function buildDependencyEdges(lines: string[], code: string, className: string): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const seen = new Set<string>();

  // Injection dependencies
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.match(/^@(EJB|Inject|Autowired|Resource)\b/)) {
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const fieldMatch = lines[j].match(/(?:private|protected|public)?\s*(\w+)\s+\w+\s*;/);
        if (fieldMatch) {
          const key = `${className}->${fieldMatch[1]}`;
          if (!seen.has(key)) {
            edges.push({ from: className, to: fieldMatch[1], type: "injection", weight: 3 });
            seen.add(key);
          }
          break;
        }
      }
    }
  }

  // Import dependencies
  const importRegex = /import\s+([\w.]+)\.(\w+)\s*;/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const imported = match[2];
    if (imported.match(/(Service|Repository|DAO|Manager|Client|Facade|Gateway)$/)) {
      const key = `${className}->${imported}`;
      if (!seen.has(key)) {
        edges.push({ from: className, to: imported, type: "import", weight: 1 });
        seen.add(key);
      }
    }
  }

  // Method call dependencies
  for (const line of lines) {
    const callMatch = line.match(/(\w+(?:Service|Repository|DAO|Manager|Client))\.\w+\(/g);
    if (callMatch) {
      for (const c of callMatch) {
        const target = c.match(/^(\w+)\./)?.[1];
        if (target) {
          const key = `${className}->${target}`;
          if (!seen.has(key)) {
            edges.push({ from: className, to: target, type: "call", weight: 2 });
            seen.add(key);
          }
        }
      }
    }
  }

  // Inheritance
  const extendsMatch = code.match(/extends\s+(\w+)/);
  if (extendsMatch && extendsMatch[1] !== "Object") {
    edges.push({ from: className, to: extendsMatch[1], type: "inheritance", weight: 5 });
  }

  return edges;
}

// ============================================================
// Coupling Metrics
// ============================================================

function calculateCoupling(edges: DependencyEdge[], className: string): CouplingMetrics {
  const ca = edges.filter(e => e.to === className).length;
  const ce = edges.filter(e => e.from === className).length;
  const instability = ca + ce > 0 ? ce / (ca + ce) : 0;
  const abstractness = 0; // Would need interface analysis
  const distance = Math.abs(abstractness + instability - 1);

  return {
    afferentCoupling: ca,
    efferentCoupling: ce,
    instability: Math.round(instability * 100) / 100,
    abstractness,
    distanceFromMainSequence: Math.round(distance * 100) / 100,
  };
}

// ============================================================
// Complexity & Effort Estimation
// ============================================================

function calculateComplexity(detections: TechnologyDetection[], edges: DependencyEdge[]): number {
  let score = 0;
  const techWeights: Record<string, number> = {
    ejb: 3, servlet: 2, jsp: 4, struts: 5, soap: 4,
    jdbc: 3, hibernate: 2, jms: 4, batch: 3, transaction: 2,
    "spring-legacy": 1, "jakarta-ee": 2,
  };

  for (const det of detections) {
    score += techWeights[det.technology] || 1;
    if (det.severity === "critical") score += 3;
    else if (det.severity === "warning") score += 1;
  }

  score += edges.length * 2;
  return Math.min(100, score);
}

function estimateEffort(detections: TechnologyDetection[], complexity: number): number {
  const baseEffort = detections.length * 0.3;
  const complexityMultiplier = 1 + (complexity / 100);
  return Math.max(1, Math.round(baseEffort * complexityMultiplier));
}

function calculateRisk(detections: TechnologyDetection[], complexity: number): "low" | "medium" | "high" | "critical" {
  const criticalCount = detections.filter(d => d.severity === "critical").length;
  if (criticalCount > 5 || complexity > 80) return "critical";
  if (criticalCount > 2 || complexity > 60) return "high";
  if (criticalCount > 0 || complexity > 30) return "medium";
  return "low";
}

// ============================================================
// Markdown Report Generation (Extended)
// ============================================================

export function generateExtendedMarkdownReport(report: ExtendedAnalysisReport): string {
  let md = `# Rapport d'Analyse Legacy — ${report.fileName}\n\n`;
  md += `**Auteur de l'outil** : Compleo\n`;
  md += `**Classe** : \`${report.className}\` | **Package** : \`${report.packageName}\`\n\n`;
  md += `---\n\n`;

  // Summary
  md += `## Résumé\n\n`;
  md += `| Métrique | Valeur |\n`;
  md += `| :--- | :---: |\n`;
  md += `| Technologies détectées | ${report.summary.technologiesDetected.join(", ") || "Aucune"} |\n`;
  md += `| Total détections | ${report.summary.totalDetections} |\n`;
  md += `| Score de complexité | ${report.summary.complexityScore}/100 |\n`;
  md += `| Effort estimé | ${report.summary.estimatedEffortDays} jour(s) |\n`;
  md += `| Niveau de risque | ${report.summary.riskLevel.toUpperCase()} |\n\n`;

  // Technology breakdown
  md += `## Technologies Détectées\n\n`;
  md += `| Technologie | Occurrences | Cible Moderne |\n`;
  md += `| :--- | :---: | :--- |\n`;
  for (const tech of report.summary.technologiesDetected) {
    const count = report.summary.technologyCounts[tech] || 0;
    const target = report.allDetections.find(d => d.technology === tech)?.modernTarget || "-";
    md += `| ${tech.toUpperCase()} | ${count} | ${target} |\n`;
  }
  md += `\n`;

  // Coupling metrics
  md += `## Métriques de Couplage\n\n`;
  md += `| Métrique | Valeur |\n`;
  md += `| :--- | :---: |\n`;
  md += `| Couplage afférent (Ca) | ${report.couplingMetrics.afferentCoupling} |\n`;
  md += `| Couplage efférent (Ce) | ${report.couplingMetrics.efferentCoupling} |\n`;
  md += `| Instabilité (I) | ${report.couplingMetrics.instability} |\n\n`;

  // Detailed detections per technology
  const techGroups = new Map<string, TechnologyDetection[]>();
  for (const det of report.allDetections) {
    const existing = techGroups.get(det.technology) || [];
    existing.push(det);
    techGroups.set(det.technology, existing);
  }

  for (const [tech, dets] of Array.from(techGroups.entries())) {
    md += `## ${tech.toUpperCase()} (${dets.length})\n\n`;
    for (const det of dets) {
      md += `- **L${det.lineNumber}** [${det.severity}] ${det.description}\n`;
      md += `  → Cible : ${det.modernTarget}\n`;
    }
    md += `\n`;
  }

  // Dependency graph
  if (report.dependencyEdges.length > 0) {
    md += `## Graphe de Dépendances\n\n`;
    md += `| Source | Cible | Type | Poids |\n`;
    md += `| :--- | :--- | :--- | :---: |\n`;
    for (const edge of report.dependencyEdges) {
      md += `| ${edge.from} | ${edge.to} | ${edge.type} | ${edge.weight} |\n`;
    }
    md += `\n`;
  }

  // Modernization targets
  md += `## Plan de Modernisation\n\n`;
  for (const target of report.summary.modernizationTargets) {
    md += `- ${target}\n`;
  }

  return md;
}
