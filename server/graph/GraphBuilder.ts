/**
 * GraphBuilder — Construit le graphe de dépendances depuis l'IR existant.
 * Réutilise SemanticAnalyzer (rôle) et DomainInferrer (domaine).
 * 8 types d'arêtes, métriques par nœud et globales, exports JGF/GraphML/Cytoscape.
 *
 * @author Hamza NORDINE
 */

import type { ProjectIR, UseCaseIR, ServiceIR, DtoIR, Ejb2xBeanIR, BatchJobIR } from "../java-parser";
import {
  type DependencyGraph,
  type GraphNode,
  type GraphEdge,
  type ClassNode,
  type ExternalNode,
  type NodeMetrics,
  type GraphMetrics,
  type EdgeType,
  type TechnologyType,
  type JGFGraph,
  type CytoscapeGraph,
  type CytoscapeElement,
  type GraphMLExport,
  EDGE_WEIGHTS,
  createNodeId,
  createEdgeId,
  getEdgeWeight,
} from "./model/GraphModel";
import { DomainInferrer, type ClassDomainContext } from "../intelligence/semantic/DomainInferrer";
import { SemanticAnalyzer, type ClassContext } from "../intelligence/semantic/SemanticAnalyzer";

// ─── Helper: detect technology type from source ─────────────────────────────

function detectTechnology(rawSource: string, annotations: string[]): TechnologyType {
  if (annotations.some((a) => a.includes("MessageDriven")) || rawSource.includes("@MessageDriven"))
    return "JMS";
  if (rawSource.includes("javax.batch") || rawSource.includes("jakarta.batch")) return "BATCH_JSR352";
  if (rawSource.includes("SessionBean") || rawSource.includes("EntityBean") || rawSource.includes("ejbCreate"))
    return "EJB_2X";
  if (annotations.some((a) => a.includes("Stateless") || a.includes("Stateful") || a.includes("Singleton")))
    return "EJB_3X";
  if (annotations.some((a) => a.includes("WebServlet") || a.includes("HttpServlet"))) return "SERVLET";
  if (annotations.some((a) => a.includes("WebService") || a.includes("SOAPBinding"))) return "SOAP";
  if (rawSource.includes("PreparedStatement") || rawSource.includes("DriverManager")) return "JDBC";
  if (annotations.some((a) => a.includes("Entity") || a.includes("Table"))) return "JPA";
  return "EJB_3X";
}

// ─── Helper: estimate complexity from source ────────────────────────────────

function estimateComplexity(rawSource: string): number {
  let complexity = 1;
  const patterns = [/\bif\b/g, /\belse\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcatch\b/g, /\bcase\b/g, /&&/g, /\|\|/g];
  for (const p of patterns) {
    const matches = rawSource.match(p);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

// ─── GraphBuilder ───────────────────────────────────────────────────────────

export class GraphBuilder {
  private domainInferrer = new DomainInferrer();
  private semanticAnalyzer = new SemanticAnalyzer();

  /**
   * Construit le graphe de dépendances complet depuis l'IR du projet.
   */
  buildFromIR(ir: ProjectIR): DependencyGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    // Helper to add node only once
    const addNode = (node: GraphNode) => {
      if (!nodeIds.has(node.id)) {
        nodeIds.add(node.id);
        nodes.push(node);
      }
    };

    // Helper to add edge only once
    const addEdge = (source: string, target: string, type: EdgeType, label?: string) => {
      const id = createEdgeId(source, target, type);
      if (!edgeIds.has(id) && nodeIds.has(source) && nodeIds.has(target)) {
        edgeIds.add(id);
        edges.push({ id, source, target, type, weight: getEdgeWeight(type), label });
      }
    };

    // Helper to add edge even if target doesn't exist yet (deferred)
    const deferredEdges: Array<{ source: string; target: string; type: EdgeType; label?: string }> = [];
    const addDeferredEdge = (source: string, target: string, type: EdgeType, label?: string) => {
      deferredEdges.push({ source, target, type, label });
    };

    // ── Step 1: Create ClassNode for each UseCase ──────────────────────────
    for (const uc of ir.useCases) {
      const nodeId = createNodeId(uc.className, uc.packageName);
      const domainCtx = this.buildDomainContext(uc);
      const domainResult = this.domainInferrer.inferDomain(domainCtx);
      const roleCtx = this.buildRoleContext(uc);
      const roleResult = this.semanticAnalyzer.inferRole(roleCtx);

      const classNode: ClassNode = {
        id: nodeId,
        type: "CLASS",
        className: uc.className,
        packageName: uc.packageName,
        role: roleResult.role,
        domain: domainResult.domain,
        linesOfCode: uc.rawSource ? uc.rawSource.split("\n").length : 0,
        complexity: uc.rawSource ? estimateComplexity(uc.rawSource) : 1,
        technologyType: detectTechnology(uc.rawSource || "", []),
        sourceFile: uc.sourceFile,
      };
      addNode(classNode);
    }

    // ── Step 2: Create ClassNode for each Service ──────────────────────────
    for (const svc of ir.services) {
      const nodeId = createNodeId(svc.className, svc.packageName);
      const svcDomainCtx: ClassDomainContext = {
        className: svc.className,
        packageName: svc.packageName,
        fieldNames: svc.injectedDependencies.map((d) => d.name),
        methodNames: svc.methods.map((m) => m.name),
        body: "",
        javadoc: "",
        imports: [],
      };
      const svcDomain = this.domainInferrer.inferDomain(svcDomainCtx);
      const classNode: ClassNode = {
        id: nodeId,
        type: "CLASS",
        className: svc.className,
        packageName: svc.packageName,
        role: "DOMAIN_SERVICE",
        domain: svcDomain.domain,
        linesOfCode: 0,
        complexity: 1,
        technologyType: "EJB_3X",
        sourceFile: svc.sourceFile,
      };
      addNode(classNode);

      // Service dependencies → DEPENDS_ON edges
      for (const dep of svc.injectedDependencies) {
        addDeferredEdge(nodeId, dep.type, "DEPENDS_ON", dep.name);
      }
    }

    // ── Step 3: Create ClassNode for each DTO ──────────────────────────────
    for (const dto of ir.dtos) {
      const nodeId = createNodeId(dto.className, dto.packageName);
      const dtoDomainCtx: ClassDomainContext = {
        className: dto.className,
        packageName: dto.packageName,
        fieldNames: dto.fields.map((f) => f.name),
        methodNames: [],
        body: "",
        javadoc: "",
        imports: [],
      };
      const dtoDomain = this.domainInferrer.inferDomain(dtoDomainCtx);
      const classNode: ClassNode = {
        id: nodeId,
        type: "CLASS",
        className: dto.className,
        packageName: dto.packageName,
        role: "VALUE_OBJECT",
        domain: dtoDomain.domain,
        linesOfCode: 0,
        complexity: 1,
        technologyType: "UNKNOWN",
        sourceFile: dto.sourceFile,
      };
      addNode(classNode);
    }

    // ── Step 4: Create ClassNode for each Enum ─────────────────────────────
    for (const en of ir.enums) {
      const nodeId = createNodeId(en.className, en.packageName);
      const enumDomainCtx: ClassDomainContext = {
        className: en.className,
        packageName: en.packageName,
        fieldNames: en.values,
        methodNames: [],
        body: en.values.join(" "),
        javadoc: "",
        imports: [],
      };
      const enumDomain = this.domainInferrer.inferDomain(enumDomainCtx);
      const classNode: ClassNode = {
        id: nodeId,
        type: "CLASS",
        className: en.className,
        packageName: en.packageName,
        role: "ENUM_TYPE",
        domain: enumDomain.domain,
        linesOfCode: 0,
        complexity: 1,
        technologyType: "UNKNOWN",
        sourceFile: en.sourceFile,
      };
      addNode(classNode);
    }

    // ── Step 5: Create ClassNode for each Exception ────────────────────────
    for (const ex of ir.exceptions) {
      const nodeId = createNodeId(ex.className, ex.packageName);
      const exDomainCtx: ClassDomainContext = {
        className: ex.className,
        packageName: ex.packageName,
        fieldNames: [],
        methodNames: [],
        body: "",
        javadoc: "",
        imports: [],
      };
      const exDomain = this.domainInferrer.inferDomain(exDomainCtx);
      const classNode: ClassNode = {
        id: nodeId,
        type: "CLASS",
        className: ex.className,
        packageName: ex.packageName,
        role: "EXCEPTION_TYPE",
        domain: exDomain.domain,
        linesOfCode: 0,
        complexity: 1,
        technologyType: "UNKNOWN",
        sourceFile: ex.sourceFile,
      };
      addNode(classNode);
    }

    // ── Step 6: Build edges from UseCases ──────────────────────────────────
    for (const uc of ir.useCases) {
      const sourceId = createNodeId(uc.className, uc.packageName);
      const raw = uc.rawSource || "";

      // 6a: @EJB / @Inject / @Autowired → DEPENDS_ON
      for (const dep of uc.injectedServices) {
        addDeferredEdge(sourceId, dep.type, "DEPENDS_ON", dep.name);
      }

      // 6b: JNDI lookup → JNDI_LOOKUP (5 patterns)
      // Pattern 1: InitialContext.lookup("...")
      // Pattern 2: @EJB(lookup = "...")
      // Pattern 3: @EJB(lookup="...")
      // Pattern 4: @EJB(beanName = "...")
      // Pattern 5: @Resource(mappedName = "...")
      const jndiPatterns: RegExp[] = [
        /lookup\s*\(\s*["']([^"']+)["']\s*\)/g,                        // InitialContext.lookup("...")
        /@EJB\s*\(\s*(?:[^)]*?,\s*)?lookup\s*=\s*["']([^"']+)["']/g,  // @EJB(lookup="...")
        /@EJB\s*\(\s*(?:[^)]*?,\s*)?beanName\s*=\s*["']([^"']+)["']/g, // @EJB(beanName="...")
        /@Resource\s*\(\s*(?:[^)]*?,\s*)?mappedName\s*=\s*["']([^"']+)["']/g, // @Resource(mappedName="...")
      ];
      const jndiTargetsSeen = new Set<string>();
      for (const pattern of jndiPatterns) {
        let jndiMatch;
        while ((jndiMatch = pattern.exec(raw)) !== null) {
          const jndiName = jndiMatch[1];
          if (jndiTargetsSeen.has(jndiName)) continue;
          jndiTargetsSeen.add(jndiName);
          // Create external node for JNDI target
          const extId = `jndi:${jndiName}`;
          addNode({
            id: extId,
            type: "EXTERNAL",
            systemName: jndiName,
            externalType: "WEBSERVICE",
            protocol: "JNDI",
          } as ExternalNode);
          addEdge(sourceId, extId, "JNDI_LOOKUP", jndiName);
        }
      }

      // 6c: PreparedStatement / @Query → DB_ACCESS
      const tablePattern =
        /(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+(?:`)?(\w+)(?:`)?/gi;
      let tableMatch;
      while ((tableMatch = tablePattern.exec(raw)) !== null) {
        const tableName = tableMatch[1];
        if (tableName.toUpperCase() === tableName.toLowerCase() && tableName.length < 3) continue;
        const dbId = `db:${tableName}`;
        if (!nodeIds.has(dbId)) {
          addNode({
            id: dbId,
            type: "EXTERNAL",
            systemName: tableName,
            externalType: "DATABASE",
            protocol: "JDBC",
          } as ExternalNode);
        }
        addEdge(sourceId, dbId, "DB_ACCESS", tableName);
      }

      // 6d: @MessageDriven / JMS → EMITS_EVENT
      if (raw.includes("@MessageDriven") || raw.includes("MessageListener") || raw.includes("JMSProducer")) {
        const queuePattern = /(?:destination|queue|topic)\s*=\s*["']([^"']+)["']/gi;
        let queueMatch;
        while ((queueMatch = queuePattern.exec(raw)) !== null) {
          const queueName = queueMatch[1];
          const queueId = `queue:${queueName}`;
          if (!nodeIds.has(queueId)) {
            addNode({
              id: queueId,
              type: "EXTERNAL",
              systemName: queueName,
              externalType: "QUEUE",
              protocol: "JMS",
            } as ExternalNode);
          }
          addEdge(sourceId, queueId, "EMITS_EVENT", queueName);
        }
      }

      // 6e-1: @Resource DataSource → DB_ACCESS (JNDI DataSource injection)
      const dsResourcePattern = /@Resource\s*\([^)]*(?:name|lookup)\s*=\s*["']([^"']+)["'][^)]*\)[^;]*DataSource/g;
      let dsResMatch;
      while ((dsResMatch = dsResourcePattern.exec(raw)) !== null) {
        const dsName = dsResMatch[1];
        const dbId = `db:${dsName}`;
        if (!nodeIds.has(dbId)) {
          addNode({ id: dbId, type: "EXTERNAL", systemName: dsName, externalType: "DATABASE", protocol: "JDBC" } as ExternalNode);
        }
        addEdge(sourceId, dbId, "DB_ACCESS", dsName);
      }
      // Also detect: private DataSource xxx; with @Resource(name="...") on previous line
      const dsResourcePattern2 = /@Resource\s*\([^)]*name\s*=\s*["']([^"']+)["']/g;
      let dsResMatch2;
      while ((dsResMatch2 = dsResourcePattern2.exec(raw)) !== null) {
        const dsName = dsResMatch2[1];
        if (dsName.includes("jdbc") || dsName.includes("DataSource") || dsName.includes("ds") || dsName.includes("xa")) {
          const dbId = `db:${dsName}`;
          if (!nodeIds.has(dbId)) {
            addNode({ id: dbId, type: "EXTERNAL", systemName: dsName, externalType: "DATABASE", protocol: "JDBC" } as ExternalNode);
          }
          addEdge(sourceId, dbId, "DB_ACCESS", dsName);
        }
      }

      // 6e-2: @WebService / RestTemplate / WebServiceTemplate → SOAP_CALLS
      if (raw.includes("@WebService") || raw.includes("RestTemplate") || raw.includes("WebServiceTemplate")) {
        const wsId = `ws:${uc.className}_ws`;
        if (!nodeIds.has(wsId)) {
          addNode({
            id: wsId,
            type: "EXTERNAL",
            systemName: `${uc.className}_WebService`,
            externalType: "WEBSERVICE",
            protocol: "SOAP",
          } as ExternalNode);
        }
        addEdge(sourceId, wsId, "SOAP_CALLS");
      }

      // 6e-3: SOAP client calls via new XXXService() / getPort() / ServicePortType
      const soapClientPattern = /new\s+(\w+Service)\s*\(/g;
      let soapMatch;
      const soapServicesSeen = new Set<string>();
      while ((soapMatch = soapClientPattern.exec(raw)) !== null) {
        const svcName = soapMatch[1];
        if (svcName === uc.className || soapServicesSeen.has(svcName)) continue;
        soapServicesSeen.add(svcName);
        const wsId = `ws:${svcName}`;
        if (!nodeIds.has(wsId)) {
          addNode({ id: wsId, type: "EXTERNAL", systemName: svcName, externalType: "WEBSERVICE", protocol: "SOAP" } as ExternalNode);
        }
        addEdge(sourceId, wsId, "SOAP_CALLS", svcName);
      }
      // Also detect getPort() calls for SOAP
      const getPortPattern = /getPort\s*\([^)]*?(\w+PortType)\.class/g;
      let portMatch;
      while ((portMatch = getPortPattern.exec(raw)) !== null) {
        const portName = portMatch[1];
        if (soapServicesSeen.has(portName)) continue;
        soapServicesSeen.add(portName);
        const wsId = `ws:${portName}`;
        if (!nodeIds.has(wsId)) {
          addNode({ id: wsId, type: "EXTERNAL", systemName: portName, externalType: "WEBSERVICE", protocol: "SOAP" } as ExternalNode);
        }
        addEdge(sourceId, wsId, "SOAP_CALLS", portName);
      }

      // 6e-4: Email/SMTP detection → EXTERNAL EMAIL
      if (raw.includes("Mailer.send") || raw.includes("javax.mail") || raw.includes("jakarta.mail") || raw.includes("MimeMessage") || raw.includes("Transport.send")) {
        const emailId = "ext:SMTP_EMAIL";
        if (!nodeIds.has(emailId)) {
          addNode({ id: emailId, type: "EXTERNAL", systemName: "SMTP Email", externalType: "WEBSERVICE", protocol: "SMTP" } as ExternalNode);
        }
        addEdge(sourceId, emailId, "SOAP_CALLS", "Email");
      }

      // 6e-5: Push notification detection
      if (raw.includes("SendNotif") || raw.includes("pushNotif") || raw.includes("notification")) {
        const pushId = "ext:PUSH_NOTIFICATION";
        if (!nodeIds.has(pushId)) {
          addNode({ id: pushId, type: "EXTERNAL", systemName: "Push Notification", externalType: "WEBSERVICE", protocol: "HTTP" } as ExternalNode);
        }
        addEdge(sourceId, pushId, "SOAP_CALLS", "Push");
      }

      // 6f: Shared DTOs → SHARES_DTO
      if (uc.voInType && uc.voInType !== "void") {
        const dtoNode = nodes.find(
          (n) => n.type === "CLASS" && (n as ClassNode).className === uc.voInType
        );
        if (dtoNode) {
          addEdge(sourceId, dtoNode.id, "SHARES_DTO", uc.voInType);
        }
      }
      if (uc.voOutType && uc.voOutType !== "void" && uc.voOutType !== uc.voInType) {
        const dtoNode = nodes.find(
          (n) => n.type === "CLASS" && (n as ClassNode).className === uc.voOutType
        );
        if (dtoNode) {
          addEdge(sourceId, dtoNode.id, "SHARES_DTO", uc.voOutType);
        }
      }

      // 6g: @Transactional → TRANSACTION_WITH (same transaction context)
      if (uc.transactional) {
        for (const dep of uc.injectedServices) {
          addDeferredEdge(sourceId, dep.type, "TRANSACTION_WITH", "shared-tx");
        }
      }
    }

    // ── Step 6bis: Scan ALL raw Java files for ALL dependency patterns ──
    // Covers DAO, utility classes, services without rawSource, and any file not classified as UseCase
    // Detects: JNDI lookups, SQL tables (DB_ACCESS), @Resource DataSource, SOAP clients, Email, Push, JMS
    const jndiPatternsGlobal: RegExp[] = [
      /lookup\s*\(\s*["']([^"']+)["']\s*\)/g,
      /@EJB\s*\(\s*(?:[^)]*?,\s*)?lookup\s*=\s*["']([^"']+)["']/g,
      /@EJB\s*\(\s*(?:[^)]*?,\s*)?beanName\s*=\s*["']([^"']+)["']/g,
      /@Resource\s*\(\s*(?:[^)]*?,\s*)?mappedName\s*=\s*["']([^"']+)["']/g,
    ];
    // SQL table exclusion list (SQL keywords that look like table names)
    const SQL_KEYWORDS = new Set([
      "SELECT", "WHERE", "SET", "AND", "OR", "ON", "AS", "IS", "IN", "NOT", "NULL",
      "VALUES", "ORDER", "GROUP", "HAVING", "LIMIT", "OFFSET", "EXISTS", "BETWEEN",
      "LIKE", "CASE", "WHEN", "THEN", "ELSE", "END", "IF", "BEGIN", "DECLARE",
      "INTO", "FROM", "DELETE", "INSERT", "UPDATE", "CREATE", "DROP", "ALTER",
      "INDEX", "VIEW", "TRIGGER", "PROCEDURE", "FUNCTION", "RETURN", "CURSOR",
    ]);
    // Track which files we already scanned in Step 6 (UseCases)
    const scannedFiles = new Set(ir.useCases.map(uc => uc.sourceFile));
    if ((ir as any)._rawFiles) {
      for (const file of (ir as any)._rawFiles) {
        if (scannedFiles.has(file.path)) continue;
        const raw = file.content || "";
        // Try to find a node for this file
        const classMatch = raw.match(/(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/);
        const pkgMatch = raw.match(/package\s+([\w.]+)/);
        if (!classMatch) continue;
        const className = classMatch[1];
        const pkgName = pkgMatch ? pkgMatch[1] : "";
        const sourceId = createNodeId(className, pkgName);
        // If this class is not already a node, create it
        if (!nodeIds.has(sourceId)) {
          const tech = detectTechnology(raw, []);
          addNode({
            id: sourceId,
            type: "CLASS",
            className,
            packageName: pkgName,
            role: "INFRASTRUCTURE",
            domain: "UNKNOWN",
            linesOfCode: raw.split("\n").length,
            complexity: estimateComplexity(raw),
            technologyType: tech,
            sourceFile: file.path,
          } as ClassNode);
        }

        // 6bis-a: JNDI lookups
        for (const pattern of jndiPatternsGlobal) {
          let m;
          while ((m = pattern.exec(raw)) !== null) {
            const jndiName = m[1];
            const extId = `jndi:${jndiName}`;
            addNode({ id: extId, type: "EXTERNAL", systemName: jndiName, externalType: "WEBSERVICE", protocol: "JNDI" } as ExternalNode);
            addEdge(sourceId, extId, "JNDI_LOOKUP", jndiName);
          }
        }

        // 6bis-b: SQL table access (FROM/INTO/UPDATE/JOIN/TABLE)
        const tblPatternGlobal = /(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+(?:`)?([A-Za-z][A-Za-z0-9_]+)(?:`)?/gi;
        let tblMatchG;
        while ((tblMatchG = tblPatternGlobal.exec(raw)) !== null) {
          const tableName = tblMatchG[1];
          if (tableName.length < 3 || SQL_KEYWORDS.has(tableName.toUpperCase())) continue;
          const dbId = `db:${tableName}`;
          if (!nodeIds.has(dbId)) {
            addNode({ id: dbId, type: "EXTERNAL", systemName: tableName, externalType: "DATABASE", protocol: "JDBC" } as ExternalNode);
          }
          addEdge(sourceId, dbId, "DB_ACCESS", tableName);
        }

        // 6bis-c: @Resource DataSource (JNDI DataSource injection)
        const dsPatternGlobal = /@Resource\s*\([^)]*name\s*=\s*["']([^"']+)["']/g;
        let dsMatchG;
        while ((dsMatchG = dsPatternGlobal.exec(raw)) !== null) {
          const dsName = dsMatchG[1];
          if (dsName.includes("jdbc") || dsName.includes("DataSource") || dsName.includes("ds") || dsName.includes("xa") || dsName.includes("DS")) {
            const dbId = `db:${dsName}`;
            if (!nodeIds.has(dbId)) {
              addNode({ id: dbId, type: "EXTERNAL", systemName: dsName, externalType: "DATABASE", protocol: "JDBC" } as ExternalNode);
            }
            addEdge(sourceId, dbId, "DB_ACCESS", dsName);
          }
        }
        // Also detect DataSource field with getConnection() call
        if ((raw.includes("DataSource") || raw.includes("getConnection")) && (raw.includes("PreparedStatement") || raw.includes("executeQuery") || raw.includes("executeUpdate"))) {
          const genericDbId = "db:DATABASE";
          if (!nodeIds.has(genericDbId)) {
            addNode({ id: genericDbId, type: "EXTERNAL", systemName: "Database", externalType: "DATABASE", protocol: "JDBC" } as ExternalNode);
          }
          addEdge(sourceId, genericDbId, "DB_ACCESS", "JDBC");
        }

        // 6bis-d: SOAP client calls (new XXXService() / getPort())
        const soapPatternGlobal = /new\s+(\w+Service)\s*\(/g;
        let soapMatchG;
        while ((soapMatchG = soapPatternGlobal.exec(raw)) !== null) {
          const svcName = soapMatchG[1];
          if (svcName === className) continue;
          const wsId = `ws:${svcName}`;
          if (!nodeIds.has(wsId)) {
            addNode({ id: wsId, type: "EXTERNAL", systemName: svcName, externalType: "WEBSERVICE", protocol: "SOAP" } as ExternalNode);
          }
          addEdge(sourceId, wsId, "SOAP_CALLS", svcName);
        }
        // getPort() SOAP calls
        const portPatternGlobal = /getPort\s*\([^)]*?(\w+PortType)\.class/g;
        let portMatchG;
        while ((portMatchG = portPatternGlobal.exec(raw)) !== null) {
          const portName = portMatchG[1];
          const wsId = `ws:${portName}`;
          if (!nodeIds.has(wsId)) {
            addNode({ id: wsId, type: "EXTERNAL", systemName: portName, externalType: "WEBSERVICE", protocol: "SOAP" } as ExternalNode);
          }
          addEdge(sourceId, wsId, "SOAP_CALLS", portName);
        }

        // 6bis-e: Email/SMTP detection
        if (raw.includes("Mailer.send") || raw.includes("javax.mail") || raw.includes("jakarta.mail") || raw.includes("MimeMessage") || raw.includes("Transport.send")) {
          const emailId = "ext:SMTP_EMAIL";
          if (!nodeIds.has(emailId)) {
            addNode({ id: emailId, type: "EXTERNAL", systemName: "SMTP Email", externalType: "WEBSERVICE", protocol: "SMTP" } as ExternalNode);
          }
          addEdge(sourceId, emailId, "SOAP_CALLS", "Email");
        }

        // 6bis-f: Push notification detection
        if (raw.includes("SendNotif") || raw.includes("pushNotif")) {
          const pushId = "ext:PUSH_NOTIFICATION";
          if (!nodeIds.has(pushId)) {
            addNode({ id: pushId, type: "EXTERNAL", systemName: "Push Notification", externalType: "WEBSERVICE", protocol: "HTTP" } as ExternalNode);
          }
          addEdge(sourceId, pushId, "SOAP_CALLS", "Push");
        }

        // 6bis-g: JMS / MessageDriven
        if (raw.includes("@MessageDriven") || raw.includes("MessageListener") || raw.includes("JMSProducer") || raw.includes("jms/")) {
          const qPatternGlobal = /(?:destination|queue|topic|mappedName|name)\s*=\s*["']([^"']+)["']/gi;
          let qMatchG;
          while ((qMatchG = qPatternGlobal.exec(raw)) !== null) {
            const qName = qMatchG[1];
            if (!qName.includes("jms") && !qName.includes("queue") && !qName.includes("Queue") && !qName.includes("topic") && !qName.includes("Topic")) continue;
            const qId = `queue:${qName}`;
            if (!nodeIds.has(qId)) {
              addNode({ id: qId, type: "EXTERNAL", systemName: qName, externalType: "QUEUE", protocol: "JMS" } as ExternalNode);
            }
            addEdge(sourceId, qId, "EMITS_EVENT", qName);
          }
        }

        // 6bis-h: @EJB / @Inject dependency injection in non-UseCase files
        const ejbInjectPattern = /@(?:EJB|Inject|Autowired)\s+(?:private\s+)?(\w+)\s+(\w+)/g;
        let ejbInjectMatch;
        while ((ejbInjectMatch = ejbInjectPattern.exec(raw)) !== null) {
          const depType = ejbInjectMatch[1];
          addDeferredEdge(sourceId, depType, "DEPENDS_ON", ejbInjectMatch[2]);
        }
      }
    }

    // ── Step 6ter: Scan EJB 2.x beans and batch jobs for additional edges ─────────
    // Scan ejb2xBeans for DB_ACCESS, JNDI, and EMITS_EVENT patterns
    if (ir.ejb2xBeans) {
      for (const bean of ir.ejb2xBeans) {
        const sourceId = createNodeId(bean.className, bean.packageName);
        const raw = bean.rawSource || "";
        // DB_ACCESS
        const tblPattern = /(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+(?:`)?([A-Z_]\w+)(?:`)?/gi;
        let tblMatch;
        while ((tblMatch = tblPattern.exec(raw)) !== null) {
          const tableName = tblMatch[1];
          if (tableName.length < 3) continue;
          const dbId = `db:${tableName}`;
          if (!nodeIds.has(dbId)) {
            addNode({ id: dbId, type: "EXTERNAL", systemName: tableName, externalType: "DATABASE", protocol: "JDBC" } as ExternalNode);
          }
          addEdge(sourceId, dbId, "DB_ACCESS", tableName);
        }
        // JMS / EMITS_EVENT
        if (raw.includes("@MessageDriven") || raw.includes("MessageListener") || raw.includes("JMSProducer") || raw.includes("jms/")) {
          const qPattern = /(?:destination|queue|topic|mappedName|name)\s*=\s*["']([^"']+)["']/gi;
          let qMatch;
          while ((qMatch = qPattern.exec(raw)) !== null) {
            const qName = qMatch[1];
            if (!qName.includes("jms") && !qName.includes("queue") && !qName.includes("Queue") && !qName.includes("topic") && !qName.includes("Topic")) continue;
            const qId = `queue:${qName}`;
            if (!nodeIds.has(qId)) {
              addNode({ id: qId, type: "EXTERNAL", systemName: qName, externalType: "QUEUE", protocol: "JMS" } as ExternalNode);
            }
            addEdge(sourceId, qId, "EMITS_EVENT", qName);
          }
        }
      }
    }
    // Scan batchJobs for DB_ACCESS, EMITS_EVENT, and @Resource DataSource patterns
    if (ir.batchJobs) {
      for (const job of ir.batchJobs) {
        const sourceId = createNodeId(job.className, job.packageName);
        const raw = job.rawSource || "";
        // DB_ACCESS from SQL or DataSource
        const tblPattern2 = /(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+(?:`)?([A-Z_]\w+)(?:`)?/gi;
        let tblMatch2;
        while ((tblMatch2 = tblPattern2.exec(raw)) !== null) {
          const tableName = tblMatch2[1];
          if (tableName.length < 3) continue;
          const dbId = `db:${tableName}`;
          if (!nodeIds.has(dbId)) {
            addNode({ id: dbId, type: "EXTERNAL", systemName: tableName, externalType: "DATABASE", protocol: "JDBC" } as ExternalNode);
          }
          addEdge(sourceId, dbId, "DB_ACCESS", tableName);
        }
        // @Resource DataSource → DB_ACCESS
        const dsPattern = /@Resource\s*\(\s*(?:[^)]*?,\s*)?name\s*=\s*["']([^"']+)["']/g;
        let dsMatch;
        while ((dsMatch = dsPattern.exec(raw)) !== null) {
          const dsName = dsMatch[1];
          const dbId = `db:${dsName}`;
          if (!nodeIds.has(dbId)) {
            addNode({ id: dbId, type: "EXTERNAL", systemName: dsName, externalType: "DATABASE", protocol: "JDBC" } as ExternalNode);
          }
          addEdge(sourceId, dbId, "DB_ACCESS", dsName);
        }
        // JMS patterns in batch
        if (raw.includes("@MessageDriven") || raw.includes("MessageListener") || raw.includes("jms/")) {
          const qPattern2 = /(?:destination|queue|topic|mappedName|name)\s*=\s*["']([^"']+)["']/gi;
          let qMatch2;
          while ((qMatch2 = qPattern2.exec(raw)) !== null) {
            const qName = qMatch2[1];
            if (!qName.includes("jms") && !qName.includes("queue") && !qName.includes("Queue") && !qName.includes("topic") && !qName.includes("Topic")) continue;
            const qId = `queue:${qName}`;
            if (!nodeIds.has(qId)) {
              addNode({ id: qId, type: "EXTERNAL", systemName: qName, externalType: "QUEUE", protocol: "JMS" } as ExternalNode);
            }
            addEdge(sourceId, qId, "EMITS_EVENT", qName);
          }
        }
      }
    }

    // ── Step 7: Resolve deferred edges ─────────────────────────────────────
    for (const de of deferredEdges) {
      // Try to find target by className match
      const targetNode = nodes.find(
        (n) => n.type === "CLASS" && (n as ClassNode).className === de.target
      );
      if (targetNode) {
        const id = createEdgeId(de.source, targetNode.id, de.type);
        if (!edgeIds.has(id)) {
          edgeIds.add(id);
          edges.push({
            id,
            source: de.source,
            target: targetNode.id,
            type: de.type,
            weight: getEdgeWeight(de.type),
            label: de.label,
          });
        }
      } else {
        // Unresolved dependency → create EXTERNAL node (exit point)
        // This handles @EJB/@Inject services not found in the project (e.g., MagixService, external APIs)
        const extId = `ext:${de.target}`;
        if (!nodeIds.has(extId)) {
          addNode({
            id: extId,
            type: "EXTERNAL",
            systemName: de.target,
            externalType: "WEBSERVICE",
            protocol: "EJB_INJECT",
          } as ExternalNode);
        }
        const edgeId = createEdgeId(de.source, extId, de.type);
        if (!edgeIds.has(edgeId)) {
          edgeIds.add(edgeId);
          edges.push({
            id: edgeId,
            source: de.source,
            target: extId,
            type: de.type,
            weight: getEdgeWeight(de.type),
            label: de.label,
          });
        }
      }
    }

    // ── Step 8: Compute metrics ────────────────────────────────────────────
    const nodeMetrics = this.computeNodeMetrics(nodes, edges);
    const graphMetrics = this.computeGraphMetrics(nodes, edges);

    return {
      projectName: ir.projectName,
      createdAt: new Date().toISOString(),
      nodes,
      edges,
      nodeMetrics,
      graphMetrics,
    };
  }

  // ─── Compute per-node metrics ───────────────────────────────────────────

  private computeNodeMetrics(nodes: GraphNode[], edges: GraphEdge[]): NodeMetrics[] {
    const metrics: NodeMetrics[] = [];

    for (const node of nodes) {
      const inEdges = edges.filter((e) => e.target === node.id);
      const outEdges = edges.filter((e) => e.source === node.id);

      // Cohesion: ratio of intra-domain edges for CLASS nodes
      let cohesion = 0;
      if (node.type === "CLASS") {
        const domain = (node as ClassNode).domain;
        const neighborIds = [
          ...inEdges.map((e) => e.source),
          ...outEdges.map((e) => e.target),
        ];
        const totalNeighbors = neighborIds.length;
        if (totalNeighbors > 0) {
          const sameDomain = neighborIds.filter((nid) => {
            const n = nodes.find((nn) => nn.id === nid);
            return n && n.type === "CLASS" && (n as ClassNode).domain === domain;
          }).length;
          cohesion = sameDomain / totalNeighbors;
        }
      }

      metrics.push({
        nodeId: node.id,
        inDegree: inEdges.length,
        outDegree: outEdges.length,
        betweenness: 0, // Simplified: computed below
        cohesion,
      });
    }

    // Simplified betweenness: nodes with high in+out degree get higher betweenness
    const maxDegree = Math.max(...metrics.map((m) => m.inDegree + m.outDegree), 1);
    for (const m of metrics) {
      m.betweenness = (m.inDegree + m.outDegree) / maxDegree;
    }

    return metrics;
  }

  // ─── Compute global graph metrics ───────────────────────────────────────

  private computeGraphMetrics(nodes: GraphNode[], edges: GraphEdge[]): GraphMetrics {
    const degrees = nodes.map((n) => {
      return (
        edges.filter((e) => e.source === n.id).length +
        edges.filter((e) => e.target === n.id).length
      );
    });

    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const avgDegree = totalNodes > 0 ? degrees.reduce((a, b) => a + b, 0) / totalNodes : 0;
    const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0;

    // Connected components via BFS
    const visited = new Set<string>();
    let components = 0;
    const adjacency = new Map<string, string[]>();
    for (const n of nodes) adjacency.set(n.id, []);
    for (const e of edges) {
      adjacency.get(e.source)?.push(e.target);
      adjacency.get(e.target)?.push(e.source);
    }
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        components++;
        const queue = [n.id];
        while (queue.length > 0) {
          const current = queue.shift()!;
          if (visited.has(current)) continue;
          visited.add(current);
          for (const neighbor of adjacency.get(current) || []) {
            if (!visited.has(neighbor)) queue.push(neighbor);
          }
        }
      }
    }

    // Detect cycles via DFS
    const cyclicDependencies = this.detectCycles(nodes, edges);

    return {
      totalNodes,
      totalEdges,
      avgDegree: Math.round(avgDegree * 100) / 100,
      maxDegree,
      connectedComponents: components,
      cyclicDependencies,
    };
  }

  // ─── Cycle detection (DFS) ──────────────────────────────────────────────

  private detectCycles(nodes: GraphNode[], edges: GraphEdge[]): string[][] {
    const cycles: string[][] = [];
    const adjacency = new Map<string, string[]>();
    for (const n of nodes) adjacency.set(n.id, []);
    for (const e of edges) {
      adjacency.get(e.source)?.push(e.target);
    }

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();
    for (const n of nodes) color.set(n.id, WHITE);

    for (const n of nodes) {
      if (color.get(n.id) === WHITE) {
        const stack: Array<{ node: string; neighbors: string[]; idx: number }> = [];
        stack.push({ node: n.id, neighbors: adjacency.get(n.id) || [], idx: 0 });
        color.set(n.id, GRAY);
        parent.set(n.id, null);

        while (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (top.idx < top.neighbors.length) {
            const neighbor = top.neighbors[top.idx];
            top.idx++;
            if (color.get(neighbor) === GRAY) {
              // Found a cycle — reconstruct
              const cycle: string[] = [neighbor];
              let cur = top.node;
              while (cur !== neighbor) {
                cycle.push(cur);
                cur = parent.get(cur) || "";
                if (!cur) break;
              }
              cycle.push(neighbor);
              if (cycle.length > 2 && cycles.length < 20) {
                cycles.push(cycle.reverse());
              }
            } else if (color.get(neighbor) === WHITE) {
              color.set(neighbor, GRAY);
              parent.set(neighbor, top.node);
              stack.push({ node: neighbor, neighbors: adjacency.get(neighbor) || [], idx: 0 });
            }
          } else {
            color.set(top.node, BLACK);
            stack.pop();
          }
        }
      }
    }

    return cycles;
  }

  // ─── Export: JSON Graph Format ──────────────────────────────────────────

  toJSON(graph: DependencyGraph): JGFGraph {
    const jgfNodes: Record<string, { label: string; metadata: Record<string, unknown> }> = {};
    for (const node of graph.nodes) {
      jgfNodes[node.id] = {
        label: node.type === "CLASS" ? (node as ClassNode).className : node.type === "EXTERNAL" ? (node as ExternalNode).systemName : node.id,
        metadata: { ...node },
      };
    }

    return {
      graph: {
        id: graph.projectName,
        type: "directed",
        label: `Dependency Graph — ${graph.projectName}`,
        metadata: {
          projectName: graph.projectName,
          createdAt: graph.createdAt,
          totalNodes: graph.graphMetrics.totalNodes,
          totalEdges: graph.graphMetrics.totalEdges,
        },
        nodes: jgfNodes,
        edges: graph.edges.map((e) => ({
          source: e.source,
          target: e.target,
          relation: e.type,
          metadata: { weight: e.weight, label: e.label },
        })),
      },
    };
  }

  // ─── Export: Cytoscape.js ──────────────────────────────────────────────

  toCytoscape(graph: DependencyGraph): CytoscapeGraph {
    const elements: CytoscapeElement[] = [];

    for (const node of graph.nodes) {
      const metrics = graph.nodeMetrics.find((m) => m.nodeId === node.id);
      elements.push({
        group: "nodes",
        data: {
          id: node.id,
          label:
            node.type === "CLASS"
              ? (node as ClassNode).className
              : node.type === "EXTERNAL"
                ? (node as ExternalNode).systemName
                : node.id,
          type: node.type,
          ...(node.type === "CLASS"
            ? {
                role: (node as ClassNode).role,
                domain: (node as ClassNode).domain,
                linesOfCode: (node as ClassNode).linesOfCode,
                complexity: (node as ClassNode).complexity,
              }
            : {}),
          ...(node.type === "EXTERNAL"
            ? {
                externalType: (node as ExternalNode).externalType,
                protocol: (node as ExternalNode).protocol,
              }
            : {}),
          inDegree: metrics?.inDegree || 0,
          outDegree: metrics?.outDegree || 0,
          betweenness: metrics?.betweenness || 0,
        },
        classes: node.type === "CLASS" ? (node as ClassNode).role : node.type,
      });
    }

    for (const edge of graph.edges) {
      elements.push({
        group: "edges",
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          weight: edge.weight,
          label: edge.label || edge.type,
        },
        classes: edge.type,
      });
    }

    return { elements };
  }

  // ─── Export: GraphML ──────────────────────────────────────────────────

  toGraphML(graph: DependencyGraph): GraphMLExport {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<graphml xmlns="http://graphml.graphstruct.org/graphml"');
    lines.push('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    lines.push('  xsi:schemaLocation="http://graphml.graphstruct.org/graphml http://graphml.graphstruct.org/graphml/1.0/graphml.xsd">');
    lines.push('  <key id="d0" for="node" attr.name="label" attr.type="string"/>');
    lines.push('  <key id="d1" for="node" attr.name="type" attr.type="string"/>');
    lines.push('  <key id="d2" for="node" attr.name="role" attr.type="string"/>');
    lines.push('  <key id="d3" for="node" attr.name="domain" attr.type="string"/>');
    lines.push('  <key id="d4" for="edge" attr.name="type" attr.type="string"/>');
    lines.push('  <key id="d5" for="edge" attr.name="weight" attr.type="double"/>');
    lines.push(`  <graph id="${this.escapeXml(graph.projectName)}" edgedefault="directed">`);

    for (const node of graph.nodes) {
      const label =
        node.type === "CLASS"
          ? (node as ClassNode).className
          : node.type === "EXTERNAL"
            ? (node as ExternalNode).systemName
            : node.id;
      lines.push(`    <node id="${this.escapeXml(node.id)}">`);
      lines.push(`      <data key="d0">${this.escapeXml(label)}</data>`);
      lines.push(`      <data key="d1">${node.type}</data>`);
      if (node.type === "CLASS") {
        lines.push(`      <data key="d2">${(node as ClassNode).role}</data>`);
        lines.push(`      <data key="d3">${(node as ClassNode).domain}</data>`);
      }
      lines.push("    </node>");
    }

    for (const edge of graph.edges) {
      lines.push(
        `    <edge id="${this.escapeXml(edge.id)}" source="${this.escapeXml(edge.source)}" target="${this.escapeXml(edge.target)}">`
      );
      lines.push(`      <data key="d4">${edge.type}</data>`);
      lines.push(`      <data key="d5">${edge.weight}</data>`);
      lines.push("    </edge>");
    }

    lines.push("  </graph>");
    lines.push("</graphml>");

    return {
      xml: lines.join("\n"),
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    };
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // ─── Build context helpers ────────────────────────────────────────────

  private buildDomainContext(uc: UseCaseIR): ClassDomainContext {
    return {
      className: uc.className,
      packageName: uc.packageName,
      fieldNames: uc.injectedServices.map((s) => s.name),
      methodNames: ["execute"],
      body: uc.rawSource || "",
      javadoc: uc.javadoc || "",
      imports: [],
    };
  }

  private buildRoleContext(uc: UseCaseIR): ClassContext {
    return {
      className: uc.className,
      packageName: uc.packageName,
      imports: [],
      annotations: uc.transactional ? ["@Transactional"] : [],
      implementsInterfaces: [],
      isEnum: false,
      fields: uc.injectedServices.map((s) => ({
        name: s.name,
        type: s.type,
        annotations: ["@EJB"],
      })),
      methods: [
        {
          name: "execute",
          returnType: uc.voOutType || "void",
          parameters: uc.voInType ? [{ name: "input", type: uc.voInType }] : [],
          annotations: [],
          body: uc.rawSource || "",
          callsExternal: [],
        },
      ],
      injectedBeans: uc.injectedServices.map((s) => s.type),
    };
  }
}
