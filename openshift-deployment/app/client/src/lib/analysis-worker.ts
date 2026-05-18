/**
 * Web Worker d'analyse Java Legacy — Traitement parallèle.
 *
 * Ce worker reçoit un batch de fichiers Java et exécute les 3 moteurs d'analyse
 * (ejb-analyzer, legacy-analyzer, ai-engine) sur chaque fichier.
 * Il envoie des messages de progression au thread principal après chaque fichier.
 *
 * Protocol de messages :
 * - Main → Worker : { type: "analyze", files: FilePayload[], batchId: number }
 * - Worker → Main : { type: "progress", fileIndex: number, fileName: string, batchId: number }
 * - Worker → Main : { type: "file-result", result: FileAnalysisResult, batchId: number }
 * - Worker → Main : { type: "batch-complete", batchId: number, results: FileAnalysisResult[] }
 * - Worker → Main : { type: "error", error: string, fileName: string, batchId: number }
 *
 * @author Compleo
 */

// ============================================================
// Types
// ============================================================

export interface FilePayload {
  id: string;
  name: string;
  content: string;
}

export interface FileAnalysisResult {
  fileId: string;
  fileName: string;
  ejbReport: any;
  extendedReport: any;
  technologiesDetected: string[];
  totalDetections: number;
  complexityScore: number;
  lineCount: number;
  methodCount: number;
  issueCount: number;
  processingTimeMs: number;
}

export interface WorkerMessage {
  type: "analyze";
  files: FilePayload[];
  batchId: number;
}

export interface WorkerProgressMessage {
  type: "progress";
  fileIndex: number;
  fileName: string;
  batchId: number;
  totalInBatch: number;
}

export interface WorkerFileResultMessage {
  type: "file-result";
  result: FileAnalysisResult;
  batchId: number;
}

export interface WorkerBatchCompleteMessage {
  type: "batch-complete";
  batchId: number;
  results: FileAnalysisResult[];
  totalTimeMs: number;
}

export interface WorkerErrorMessage {
  type: "error";
  error: string;
  fileName: string;
  batchId: number;
}

export type WorkerOutMessage =
  | WorkerProgressMessage
  | WorkerFileResultMessage
  | WorkerBatchCompleteMessage
  | WorkerErrorMessage;

// ============================================================
// Inline analysis functions (self-contained for worker context)
// ============================================================

/**
 * Simplified EJB analysis (core patterns only, runs in worker context).
 * We inline the analysis logic to avoid import issues in Web Workers.
 */
function analyzeEjbInWorker(code: string, fileName: string): any {
  const lines = code.split("\n");
  const className = (code.match(/(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/) || ["", "UnknownClass"])[1];
  const packageName = (code.match(/package\s+([\w.]+)\s*;/) || ["", ""])[1];

  const ejbAnnotations: string[] = [];
  const injections: any[] = [];
  const lookups: any[] = [];
  const methodCalls: any[] = [];
  const transactions: any[] = [];
  const jmsElements: any[] = [];
  const dependencies: any[] = [];
  const servicesDetected: string[] = [];
  let totalLines = lines.length;
  let totalMethods = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // EJB annotations
    const ejbMatch = line.match(/^@(Stateless|Stateful|Singleton|MessageDriven|Entity)\b/);
    if (ejbMatch) ejbAnnotations.push(ejbMatch[1]);

    // Injections
    if (line.match(/^@(EJB|Inject|Resource)\b/)) {
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
      const typeMatch = nextLine.match(/(?:private|protected|public)?\s*(\w+)\s+(\w+)/);
      injections.push({
        annotation: line.match(/@(\w+)/)?.[1] || "EJB",
        type: typeMatch?.[1] || "Unknown",
        name: typeMatch?.[2] || "unknown",
        lineNumber: i + 1,
        rawCode: `${line}\n${nextLine}`,
      });
    }

    // JNDI Lookups
    if (line.includes("InitialContext") || line.includes(".lookup(")) {
      const jndiMatch = line.match(/lookup\("([^"]+)"\)/);
      lookups.push({
        jndiName: jndiMatch?.[1] || "unknown",
        lineNumber: i + 1,
        rawCode: line,
        type: line.includes("InitialContext") ? "InitialContext" : "lookup",
      });
    }

    // Method detection
    const methodMatch = line.match(/(?:public|protected|private)\s+(?:static\s+)?(?:synchronized\s+)?(?:final\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/);
    if (methodMatch && !line.includes("class ")) {
      totalMethods++;
      methodCalls.push({
        className,
        methodName: methodMatch[2],
        returnType: methodMatch[1],
        lineNumber: i + 1,
        rawCode: line,
        parameters: [],
        httpMethod: line.includes("get") || line.includes("find") || line.includes("list") ? "GET" :
          line.includes("create") || line.includes("add") || line.includes("save") ? "POST" :
          line.includes("update") || line.includes("modify") ? "PUT" :
          line.includes("delete") || line.includes("remove") ? "DELETE" : "POST",
      });
    }

    // Transactions
    if (line.match(/@TransactionAttribute|@Transactional|UserTransaction|begin\(\)|commit\(\)|rollback\(\)/)) {
      transactions.push({
        type: line.includes("@TransactionAttribute") ? "CMT" : line.includes("@Transactional") ? "Spring" : "BMT",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // JMS
    if (line.match(/JMSContext|MessageProducer|MessageConsumer|@JMSDestination|ConnectionFactory|Queue|Topic/)) {
      jmsElements.push({
        type: line.includes("Producer") ? "producer" : line.includes("Consumer") ? "consumer" : "connection",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Dependencies (imports)
    const importMatch = line.match(/^import\s+([\w.]+);/);
    if (importMatch) {
      const pkg = importMatch[1];
      if (pkg.includes("javax.ejb") || pkg.includes("jakarta.ejb")) {
        dependencies.push({ from: className, to: pkg, type: "ejb-import" });
      }
    }

    // Services
    if (line.match(/@(Stateless|Stateful|Singleton|Service|Component|Repository)\b/)) {
      servicesDetected.push(className);
    }
  }

  return {
    className,
    packageName,
    ejbAnnotations,
    injections,
    lookups,
    methodCalls,
    transactions,
    jmsElements,
    dependencies,
    summary: {
      totalLines,
      totalMethods,
      totalInjections: injections.length,
      totalLookups: lookups.length,
      totalTransactions: transactions.length,
      totalJmsElements: jmsElements.length,
      servicesDetected: [...new Set(servicesDetected)],
      complexityLevel: ejbAnnotations.length > 3 ? "high" : ejbAnnotations.length > 1 ? "medium" : "low",
    },
  };
}

/**
 * Simplified legacy technology detection (runs in worker context).
 */
function analyzeLegacyInWorker(code: string, fileName: string): any {
  const lines = code.split("\n");
  const className = (code.match(/(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/) || ["", "UnknownClass"])[1];
  const packageName = (code.match(/package\s+([\w.]+)\s*;/) || ["", ""])[1];

  const techs = new Set<string>();
  const detections: any[] = [];
  let totalMethods = 0;

  const patterns: [RegExp, string, string, string][] = [
    [/@(Stateless|Stateful|Singleton|MessageDriven)\b/, "ejb", "EJB Bean", "Spring @Service"],
    [/@(EJB|Inject)\b/, "ejb", "EJB Injection", "Spring @Autowired"],
    [/InitialContext|\.lookup\(/, "ejb", "JNDI Lookup", "Spring DI"],
    [/@WebServlet|HttpServlet|doGet|doPost|doDelete|doPut/, "servlet", "Servlet", "Spring REST Controller"],
    [/<%|<jsp:|<c:|<fmt:|taglib/, "jsp", "JSP", "React / Thymeleaf"],
    [/ActionForm|ActionForward|struts-config|DispatchAction/, "struts", "Struts", "Spring MVC"],
    [/@WebService|@WebMethod|@SOAPBinding|wsdl|javax\.xml\.ws/, "soap", "SOAP", "REST API (OpenAPI)"],
    [/DriverManager|Connection\s|Statement\s|PreparedStatement|ResultSet|DataSource/, "jdbc", "JDBC", "Spring Data JPA"],
    [/SessionFactory|Session\s|createQuery|createCriteria|HibernateUtil|@Entity/, "hibernate", "Hibernate", "Spring Data JPA"],
    [/JMSContext|MessageProducer|MessageConsumer|@JMSDestination|ConnectionFactory/, "jms", "JMS", "Spring Kafka"],
    [/@BatchProperty|ItemReader|ItemWriter|ItemProcessor|@Batchlet/, "batch", "Batch", "Spring Batch"],
    [/@TransactionAttribute|UserTransaction|begin\(\)|commit\(\)|rollback\(\)/, "transaction", "Transaction", "Spring @Transactional"],
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Method count
    if (line.match(/(?:public|protected|private)\s+(?:static\s+)?(?:synchronized\s+)?(?:final\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/) && !line.includes("class ")) {
      totalMethods++;
    }

    for (const [regex, tech, desc, target] of patterns) {
      if (regex.test(line)) {
        techs.add(tech);
        detections.push({
          technology: tech,
          description: `${desc}: ${line.substring(0, 80)}`,
          lineNumber: i + 1,
          rawCode: line,
          severity: tech === "jsp" || tech === "struts" ? "critical" : "warning",
          modernTarget: target,
        });
      }
    }
  }

  const complexityScore = Math.min(100, detections.length * 5 + (techs.size * 10));

  return {
    fileName,
    className,
    packageName,
    allDetections: detections,
    summary: {
      technologiesDetected: Array.from(techs),
      totalDetections: detections.length,
      complexityScore,
      totalMethods,
    },
  };
}

/**
 * Simplified AI rule engine (core rules, runs in worker context).
 * Counts issues by severity for the progress stats.
 */
function countIssuesInWorker(code: string): { critical: number; warning: number; info: number; total: number } {
  const lines = code.split("\n");
  let critical = 0, warning = 0, info = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Critical patterns
    if (/catch\s*\(\s*Exception\s/.test(line) && /\.printStackTrace\(\)/.test(lines[i + 1]?.trim() || "")) critical++;
    if (/\"[^"]*\"\s*\+\s*\w+/.test(line) && /createQuery|prepareStatement|execute/.test(line)) critical++;
    if (/new\s+Random\(\)/.test(line)) critical++;
    if (/MD5|SHA-1/.test(line) && /MessageDigest/.test(line)) critical++;

    // Warning patterns
    if (/catch\s*\(\s*Exception\s+\w+\s*\)\s*\{/.test(line)) warning++;
    if (line.includes("System.out.print") || line.includes("System.err.print")) warning++;
    if (/@SuppressWarnings/.test(line)) warning++;
    if (/static\s+(?:final\s+)?(?:Map|List|Set|Collection)\s/.test(line) && !line.includes("final")) warning++;
    if (line.includes("synchronized")) warning++;

    // Info patterns
    if (/TODO|FIXME|HACK|XXX/.test(line)) info++;
    if (/@Deprecated/.test(line)) info++;
  }

  return { critical, warning, info, total: critical + warning + info };
}

// ============================================================
// Worker message handler
// ============================================================

self.onmessage = function (e: MessageEvent<WorkerMessage>) {
  const { type, files, batchId } = e.data;

  if (type !== "analyze") return;

  const results: FileAnalysisResult[] = [];
  const batchStart = performance.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileStart = performance.now();

    try {
      // Send progress
      self.postMessage({
        type: "progress",
        fileIndex: i,
        fileName: file.name,
        batchId,
        totalInBatch: files.length,
      } satisfies WorkerProgressMessage);

      // Run analysis
      const ejbReport = analyzeEjbInWorker(file.content, file.name);
      const extendedReport = analyzeLegacyInWorker(file.content, file.name);
      const issues = countIssuesInWorker(file.content);

      const result: FileAnalysisResult = {
        fileId: file.id,
        fileName: file.name,
        ejbReport,
        extendedReport,
        technologiesDetected: extendedReport.summary.technologiesDetected,
        totalDetections: extendedReport.summary.totalDetections,
        complexityScore: extendedReport.summary.complexityScore,
        lineCount: file.content.split("\n").length,
        methodCount: extendedReport.summary.totalMethods,
        issueCount: issues.total,
        processingTimeMs: performance.now() - fileStart,
      };

      results.push(result);

      // Send individual file result
      self.postMessage({
        type: "file-result",
        result,
        batchId,
      } satisfies WorkerFileResultMessage);
    } catch (err) {
      self.postMessage({
        type: "error",
        error: err instanceof Error ? err.message : String(err),
        fileName: file.name,
        batchId,
      } satisfies WorkerErrorMessage);
    }
  }

  // Send batch complete
  self.postMessage({
    type: "batch-complete",
    batchId,
    results,
    totalTimeMs: performance.now() - batchStart,
  } satisfies WorkerBatchCompleteMessage);
};
