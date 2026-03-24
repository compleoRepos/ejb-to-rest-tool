/**
 * EJB Client Modernizer — Moteur d'analyse du code Java legacy.
 * Détecte les appels EJB (@EJB injection, JNDI lookup, InitialContext),
 * les transactions, les dépendances JMS/MQ/Batch et génère un rapport d'analyse.
 *
 * @author Hamza NORDINE
 * @version 1.0.0
 */

// ============================================================
// Types & Interfaces
// ============================================================

export interface EjbInjection {
  type: "field_injection";
  serviceType: string;
  fieldName: string;
  lineNumber: number;
  rawCode: string;
}

export interface JndiLookup {
  type: "jndi_lookup" | "initial_context";
  serviceType: string;
  jndiName: string;
  variableName: string;
  lineNumber: number;
  rawCode: string;
}

export interface MethodCall {
  serviceName: string;
  methodName: string;
  parameters: string[];
  returnType: string;
  lineNumber: number;
  rawCode: string;
}

export interface TransactionInfo {
  annotation: string;
  scope: string;
  lineNumber: number;
  rawCode: string;
}

export interface JmsInfo {
  type: "jms" | "mq" | "batch" | "listener";
  description: string;
  lineNumber: number;
  rawCode: string;
}

export interface DependencyLink {
  from: string;
  to: string;
  methods: string[];
}

export interface AnalysisReport {
  fileName: string;
  className: string;
  packageName: string;
  ejbInjections: EjbInjection[];
  jndiLookups: JndiLookup[];
  methodCalls: MethodCall[];
  transactions: TransactionInfo[];
  jmsElements: JmsInfo[];
  dependencies: DependencyLink[];
  summary: {
    totalEjbInjections: number;
    totalJndiLookups: number;
    totalMethodCalls: number;
    totalTransactions: number;
    totalJmsElements: number;
    totalDependencies: number;
    servicesDetected: string[];
  };
}

// ============================================================
// Analyse du code Java
// ============================================================

/**
 * Analyse un fichier Java et retourne un rapport complet.
 */
export function analyzeJavaCode(code: string, fileName: string = "Unknown.java"): AnalysisReport {
  const lines = code.split("\n");

  const className = extractClassName(code);
  const packageName = extractPackageName(code);
  const ejbInjections = detectEjbInjections(lines);
  const jndiLookups = detectJndiLookups(lines);
  const methodCalls = detectMethodCalls(lines, ejbInjections, jndiLookups);
  const transactions = detectTransactions(lines);
  const jmsElements = detectJmsElements(lines);
  const dependencies = buildDependencyGraph(ejbInjections, jndiLookups, methodCalls, className);

  const servicesDetected = Array.from(
    new Set([
      ...ejbInjections.map((e) => e.serviceType),
      ...jndiLookups.map((j) => j.serviceType),
    ])
  );

  return {
    fileName,
    className,
    packageName,
    ejbInjections,
    jndiLookups,
    methodCalls,
    transactions,
    jmsElements,
    dependencies,
    summary: {
      totalEjbInjections: ejbInjections.length,
      totalJndiLookups: jndiLookups.length,
      totalMethodCalls: methodCalls.length,
      totalTransactions: transactions.length,
      totalJmsElements: jmsElements.length,
      totalDependencies: dependencies.length,
      servicesDetected,
    },
  };
}

function extractClassName(code: string): string {
  const match = code.match(/(?:public\s+)?class\s+(\w+)/);
  return match ? match[1] : "UnknownClass";
}

function extractPackageName(code: string): string {
  const match = code.match(/package\s+([\w.]+)\s*;/);
  return match ? match[1] : "";
}

function detectEjbInjections(lines: string[]): EjbInjection[] {
  const injections: EjbInjection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Détection @EJB ou @Inject
    if (line.match(/^@(EJB|Inject)\b/)) {
      // La ligne suivante contient la déclaration du champ
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const fieldLine = lines[j].trim();
        const fieldMatch = fieldLine.match(
          /(?:private|protected|public)?\s*(\w+)\s+(\w+)\s*;/
        );
        if (fieldMatch) {
          injections.push({
            type: "field_injection",
            serviceType: fieldMatch[1],
            fieldName: fieldMatch[2],
            lineNumber: i + 1,
            rawCode: `${line}\n${fieldLine}`,
          });
          break;
        }
      }
    }
  }

  return injections;
}

function detectJndiLookups(lines: string[]): JndiLookup[] {
  const lookups: JndiLookup[] = [];
  const code = lines.join("\n");

  // Détection de ctx.lookup("...") ou new InitialContext().lookup("...")
  const lookupRegex =
    /(\w+)\s*=\s*\(?(\w+)\)?\s*(?:new\s+InitialContext\(\)|ctx|context|initialContext)\s*\.lookup\(\s*"([^"]+)"\s*\)/gi;
  let match;

  while ((match = lookupRegex.exec(code)) !== null) {
    const lineNumber = code.substring(0, match.index).split("\n").length;
    const jndiName = match[3];
    const serviceType = extractServiceTypeFromJndi(jndiName);

    lookups.push({
      type: "initial_context",
      serviceType,
      jndiName,
      variableName: match[1],
      lineNumber,
      rawCode: match[0],
    });
  }

  // Détection plus simple : lignes contenant .lookup(
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes(".lookup(") && !lookups.some((l) => l.lineNumber === i + 1)) {
      const jndiMatch = line.match(/\.lookup\(\s*"([^"]+)"\s*\)/);
      if (jndiMatch) {
        const serviceType = extractServiceTypeFromJndi(jndiMatch[1]);
        const varMatch = line.match(/(\w+)\s*=/);
        lookups.push({
          type: line.includes("InitialContext") ? "initial_context" : "jndi_lookup",
          serviceType,
          jndiName: jndiMatch[1],
          variableName: varMatch ? varMatch[1] : "service",
          lineNumber: i + 1,
          rawCode: line,
        });
      }
    }
  }

  // Détection de new InitialContext() seul
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes("new InitialContext()") && !line.includes(".lookup(")) {
      // Chercher le lookup dans les lignes suivantes
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j].trim();
        const lookupMatch = nextLine.match(/\.lookup\(\s*"([^"]+)"\s*\)/);
        if (lookupMatch) {
          const serviceType = extractServiceTypeFromJndi(lookupMatch[1]);
          const varMatch = nextLine.match(/(\w+)\s*=/);
          if (!lookups.some((l) => l.lineNumber === j + 1)) {
            lookups.push({
              type: "initial_context",
              serviceType,
              jndiName: lookupMatch[1],
              variableName: varMatch ? varMatch[1] : "service",
              lineNumber: j + 1,
              rawCode: `${line}\n${nextLine}`,
            });
          }
          break;
        }
      }
    }
  }

  return lookups;
}

function extractServiceTypeFromJndi(jndiName: string): string {
  // Extraire le nom du service depuis un JNDI comme "java:global/bank/TransferService"
  const parts = jndiName.split("/");
  return parts[parts.length - 1];
}

function detectMethodCalls(
  lines: string[],
  injections: EjbInjection[],
  lookups: JndiLookup[]
): MethodCall[] {
  const calls: MethodCall[] = [];
  const knownVars = new Map<string, string>();

  // Construire la map des variables connues
  for (const inj of injections) {
    knownVars.set(inj.fieldName, inj.serviceType);
  }
  for (const lookup of lookups) {
    knownVars.set(lookup.variableName, lookup.serviceType);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    for (const [varName, serviceType] of Array.from(knownVars.entries())) {
      const callRegex = new RegExp(
        `(?:(\\w+)\\s*=\\s*)?${varName}\\.(\\w+)\\(([^)]*)\\)`,
        "g"
      );
      let match;
      while ((match = callRegex.exec(line)) !== null) {
        const returnVar = match[1] || "";
        const methodName = match[2];
        const paramsStr = match[3];
        const parameters = paramsStr
          ? paramsStr.split(",").map((p) => p.trim()).filter(Boolean)
          : [];

        calls.push({
          serviceName: serviceType,
          methodName,
          parameters,
          returnType: returnVar ? inferReturnType(returnVar, lines, i) : "void",
          lineNumber: i + 1,
          rawCode: line,
        });
      }
    }
  }

  return calls;
}

function inferReturnType(varName: string, lines: string[], currentLine: number): string {
  // Chercher la déclaration de type dans les lignes précédentes
  for (let i = Math.max(0, currentLine - 5); i <= currentLine; i++) {
    const line = lines[i].trim();
    const typeMatch = line.match(new RegExp(`(\\w+(?:<[^>]+>)?)\\s+${varName}\\s*=`));
    if (typeMatch) {
      return typeMatch[1];
    }
  }
  // Chercher dans la ligne courante
  const currentLineStr = lines[currentLine].trim();
  const inlineMatch = currentLineStr.match(new RegExp(`(\\w+(?:<[^>]+>)?)\\s+${varName}\\s*=`));
  if (inlineMatch) return inlineMatch[1];

  return "Object";
}

function detectTransactions(lines: string[]): TransactionInfo[] {
  const transactions: TransactionInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.match(/@Transactional/)) {
      transactions.push({
        annotation: "@Transactional",
        scope: extractAnnotationParams(line) || "REQUIRED",
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    if (line.match(/@TransactionAttribute/)) {
      transactions.push({
        annotation: "@TransactionAttribute",
        scope: extractAnnotationParams(line) || "REQUIRED",
        lineNumber: i + 1,
        rawCode: line,
      });
    }
  }

  return transactions;
}

function extractAnnotationParams(line: string): string {
  const match = line.match(/\(([^)]+)\)/);
  return match ? match[1].trim() : "";
}

function detectJmsElements(lines: string[]): JmsInfo[] {
  const elements: JmsInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // JMS
    if (
      line.match(/@MessageDriven/) ||
      line.includes("JMSContext") ||
      line.includes("JMSProducer") ||
      line.includes("JMSConsumer") ||
      line.includes("MessageListener") ||
      line.includes("javax.jms") ||
      line.includes("jakarta.jms")
    ) {
      elements.push({
        type: "jms",
        description: `JMS element detected: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // MQ
    if (
      line.includes("MQQueue") ||
      line.includes("MQConnection") ||
      line.includes("MQQueueManager") ||
      line.includes("com.ibm.mq")
    ) {
      elements.push({
        type: "mq",
        description: `IBM MQ element detected: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Batch
    if (
      line.match(/@BatchProperty/) ||
      line.includes("AbstractBatchlet") ||
      line.includes("ItemReader") ||
      line.includes("ItemWriter") ||
      line.includes("ItemProcessor") ||
      line.includes("javax.batch") ||
      line.includes("jakarta.batch")
    ) {
      elements.push({
        type: "batch",
        description: `Batch element detected: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
      });
    }

    // Listeners
    if (
      line.match(/@Observes/) ||
      line.match(/@Schedule/) ||
      line.match(/@Timeout/)
    ) {
      elements.push({
        type: "listener",
        description: `Event/Schedule listener detected: ${line.substring(0, 80)}`,
        lineNumber: i + 1,
        rawCode: line,
      });
    }
  }

  return elements;
}

function buildDependencyGraph(
  injections: EjbInjection[],
  lookups: JndiLookup[],
  calls: MethodCall[],
  className: string
): DependencyLink[] {
  const depMap = new Map<string, Set<string>>();

  for (const inj of injections) {
    if (!depMap.has(inj.serviceType)) depMap.set(inj.serviceType, new Set());
  }
  for (const lookup of lookups) {
    if (!depMap.has(lookup.serviceType)) depMap.set(lookup.serviceType, new Set());
  }
  for (const call of calls) {
    const existing = depMap.get(call.serviceName) || new Set();
    existing.add(call.methodName);
    depMap.set(call.serviceName, existing);
  }

  return Array.from(depMap.entries()).map(([service, methods]) => ({
    from: className,
    to: service,
    methods: Array.from(methods),
  }));
}

// ============================================================
// Génération du rapport Markdown
// ============================================================

export function generateMarkdownReport(report: AnalysisReport): string {
  let md = `# Rapport d'Analyse — ${report.fileName}\n\n`;
  md += `**Auteur de l'outil** : Hamza NORDINE\n\n`;
  md += `**Classe** : \`${report.className}\`\n`;
  md += `**Package** : \`${report.packageName}\`\n\n`;
  md += `---\n\n`;

  // Résumé
  md += `## Résumé\n\n`;
  md += `| Élément | Nombre |\n`;
  md += `| :--- | :---: |\n`;
  md += `| Injections @EJB | ${report.summary.totalEjbInjections} |\n`;
  md += `| Lookups JNDI | ${report.summary.totalJndiLookups} |\n`;
  md += `| Appels de méthodes | ${report.summary.totalMethodCalls} |\n`;
  md += `| Transactions | ${report.summary.totalTransactions} |\n`;
  md += `| Éléments JMS/MQ/Batch | ${report.summary.totalJmsElements} |\n`;
  md += `| Dépendances entre services | ${report.summary.totalDependencies} |\n\n`;

  md += `**Services détectés** : ${report.summary.servicesDetected.join(", ") || "Aucun"}\n\n`;

  // Injections EJB
  if (report.ejbInjections.length > 0) {
    md += `## Injections EJB Détectées\n\n`;
    for (const inj of report.ejbInjections) {
      md += `- **Ligne ${inj.lineNumber}** : \`${inj.serviceType} ${inj.fieldName}\`\n`;
      md += `  \`\`\`java\n  ${inj.rawCode}\n  \`\`\`\n\n`;
    }
  }

  // JNDI Lookups
  if (report.jndiLookups.length > 0) {
    md += `## Lookups JNDI Détectés\n\n`;
    for (const lookup of report.jndiLookups) {
      md += `- **Ligne ${lookup.lineNumber}** : \`${lookup.serviceType}\` via \`${lookup.jndiName}\`\n`;
      md += `  \`\`\`java\n  ${lookup.rawCode}\n  \`\`\`\n\n`;
    }
  }

  // Appels de méthodes
  if (report.methodCalls.length > 0) {
    md += `## Appels de Méthodes Détectés\n\n`;
    md += `| Service | Méthode | Paramètres | Type Retour | Ligne |\n`;
    md += `| :--- | :--- | :--- | :--- | :---: |\n`;
    for (const call of report.methodCalls) {
      md += `| ${call.serviceName} | ${call.methodName} | ${call.parameters.join(", ") || "-"} | ${call.returnType} | ${call.lineNumber} |\n`;
    }
    md += `\n`;
  }

  // Transactions
  if (report.transactions.length > 0) {
    md += `## Transactions Détectées\n\n`;
    md += `> **Attention** : Les transactions ci-dessous doivent être prises en compte lors de la migration. Le pattern Saga ou la compensation manuelle peuvent être nécessaires.\n\n`;
    for (const tx of report.transactions) {
      md += `- **Ligne ${tx.lineNumber}** : \`${tx.annotation}\` (scope: ${tx.scope})\n`;
    }
    md += `\n`;
  }

  // JMS/MQ/Batch
  if (report.jmsElements.length > 0) {
    md += `## Éléments JMS / MQ / Batch\n\n`;
    for (const jms of report.jmsElements) {
      md += `- **[${jms.type.toUpperCase()}]** Ligne ${jms.lineNumber} : ${jms.description}\n`;
    }
    md += `\n`;
  }

  // Dépendances
  if (report.dependencies.length > 0) {
    md += `## Graphe de Dépendances\n\n`;
    md += `| Classe Source | Service Cible | Méthodes Appelées |\n`;
    md += `| :--- | :--- | :--- |\n`;
    for (const dep of report.dependencies) {
      md += `| ${dep.from} | ${dep.to} | ${dep.methods.join(", ") || "-"} |\n`;
    }
    md += `\n`;
  }

  // Mapping REST proposé
  md += `## Mapping REST Proposé\n\n`;
  const serviceMethodMap = new Map<string, MethodCall[]>();
  for (const call of report.methodCalls) {
    const existing = serviceMethodMap.get(call.serviceName) || [];
    existing.push(call);
    serviceMethodMap.set(call.serviceName, existing);
  }

  if (serviceMethodMap.size > 0) {
    md += `| Service EJB | Méthode | Verbe HTTP | Endpoint REST |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    for (const [service, calls] of Array.from(serviceMethodMap.entries())) {
      const basePath = inferRestBasePath(service);
      for (const call of calls) {
        const httpMethod = inferHttpMethod(call.methodName);
        const restPath = inferRestPath(call.methodName, basePath);
        md += `| ${service} | ${call.methodName} | ${httpMethod} | ${restPath} |\n`;
      }
    }
  } else {
    md += `Aucun appel de méthode détecté pour proposer un mapping REST.\n`;
  }

  return md;
}

function inferRestBasePath(serviceName: string): string {
  const name = serviceName
    .replace(/Service$/, "")
    .replace(/Bean$/, "")
    .replace(/EJB$/, "");
  return `/api/v1/${camelToKebab(name)}s`;
}

function inferHttpMethod(methodName: string): string {
  const lower = methodName.toLowerCase();
  if (lower.startsWith("get") || lower.startsWith("find") || lower.startsWith("search") || lower.startsWith("list") || lower.startsWith("fetch")) return "GET";
  if (lower.startsWith("create") || lower.startsWith("add") || lower.startsWith("save") || lower.startsWith("insert")) return "POST";
  if (lower.startsWith("update") || lower.startsWith("modify") || lower.startsWith("edit")) return "PUT";
  if (lower.startsWith("delete") || lower.startsWith("remove")) return "DELETE";
  return "POST";
}

function inferRestPath(methodName: string, basePath: string): string {
  const httpMethod = inferHttpMethod(methodName);
  if (httpMethod === "GET" && !methodName.toLowerCase().startsWith("get")) {
    return basePath;
  }
  if (methodName.toLowerCase().match(/^(get|find|update|delete)\w+by/i)) {
    return `${basePath}/{id}`;
  }
  if (httpMethod === "GET" && methodName.toLowerCase().match(/^get[A-Z]/)) {
    return `${basePath}/{id}`;
  }
  if (httpMethod === "PUT" || httpMethod === "DELETE") {
    return `${basePath}/{id}`;
  }
  return basePath;
}

function camelToKebab(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
}
