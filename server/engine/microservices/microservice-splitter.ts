/**
 * MicroserviceSplitter — Compleo v7.0
 *
 * Algorithme de découpage automatique des EJBs en microservices.
 * Utilise une matrice de couplage basée sur :
 *   - Tables partagées (lecture/écriture)
 *   - Appels @EJB directs
 *   - Queues JMS partagées
 *
 * Entrée : ProjectIR + PipelineResult (types réels du moteur Compleo)
 * Sortie : ServiceCandidate[] (microservices proposés)
 *
 * @author Compleo Engine
 */

import type { ProjectIR, UseCaseIR, ServiceIR, Ejb2xBeanIR, BatchJobIR } from "../../java-parser";
import type { DetectedComponent, TechnologyType } from "../registry/types";
import type { PipelineResult } from "../pipeline/index";

// ── Public Interfaces ──────────────────────────────────────────────

export interface ServiceCandidate {
  name:             string;
  ejbs:             string[];
  ownedTables:      string[];
  readOnlyTables:   string[];
  kafkaTopics:      KafkaTopic[];
  restApis:         RestApi[];
  restDependencies: RestDep[];
  dbSchema:         string;
  confidence:       number;
}

export interface KafkaTopic {
  name:      string;
  direction: "PRODUCE" | "CONSUME";
  eventType: string;
}

export interface RestApi {
  method:  string;
  path:    string;
  purpose: string;
}

export interface RestDep {
  targetService: string;
  method:        string;
  path:          string;
  isCritical:    boolean;
}

// ── Internal ParsedModule (adapter from ProjectIR + PipelineResult) ──

export interface ParsedModule {
  id:            string;
  type:          string;
  domain:        string;
  readTables:    string[];
  writeTables:   string[];
  writeCount:    Map<string, number>;
  ejbCalls:      string[];
  jmsQueues:     string[];
  jmsProduces:   string[];
  jmsConsumes:   string[];
  sqlFeatures:   string[];
  useCases:      ParsedModuleUseCase[];
  rawSource:     string;
}

export interface ParsedModuleUseCase {
  methodName:   string;
  voInType:     string | null;
  voOutType:    string | null;
  tx:           string;
  httpVerb:     string | null;
  sqlConstants: { name: string; value: string }[];
}

// ── SQL Extraction Helpers ─────────────────────────────────────────

const SQL_TABLE_REGEX = /(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+([A-Z_][A-Z0-9_.]+)/gi;
const SQL_WRITE_REGEX = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+([A-Z_][A-Z0-9_.]+)/gi;
const SQL_READ_REGEX  = /(?:SELECT\s+.*?\s+FROM|FROM|JOIN)\s+([A-Z_][A-Z0-9_.]+)/gi;
const SQL_FEATURE_REGEX = /(FOR\s+UPDATE(?:\s+NOWAIT)?|MERGE\s+INTO|BULK\s+COLLECT|RETURNING|CONNECT\s+BY)/gi;

// FIX D v7.1: Oracle/SQL keywords that must NEVER be treated as table names
const SQL_KEYWORDS_NOT_TABLES = new Set([
  "DUAL", "SYSDATE", "SYSTIMESTAMP", "NOWAIT", "NEXTVAL", "CURRVAL",
  "ROWNUM", "ROWID", "LEVEL", "NULL", "TRUE", "FALSE",
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "EXISTS",
  "BETWEEN", "LIKE", "IS", "AS", "ON", "SET", "VALUES",
  "ORDER", "GROUP", "HAVING", "LIMIT", "OFFSET", "UNION",
  "ALL", "DISTINCT", "CASE", "WHEN", "THEN", "ELSE", "END",
  "ASC", "DESC", "COUNT", "SUM", "AVG", "MIN", "MAX",
  "NVL", "NVL2", "DECODE", "COALESCE", "TRIM", "UPPER", "LOWER",
  "TO_CHAR", "TO_DATE", "TO_NUMBER", "SUBSTR", "LENGTH", "REPLACE",
  "TRUNC", "ROUND", "CEIL", "FLOOR", "MOD", "ABS", "SIGN",
  "USER", "CURRENT_DATE", "CURRENT_TIMESTAMP",
]);

/**
 * BUG-F v7.5: Extract ALL tables from a class source, including private helper methods.
 * Scans the entire source code, not just public methods.
 */
export function extractAllTablesFromClass(source: string): { read: string[]; write: string[] } {
  return {
    read:  extractTables(source, SQL_READ_REGEX),
    write: extractTables(source, SQL_WRITE_REGEX),
  };
}

function extractTables(source: string, regex: RegExp): string[] {
  const tables = new Set<string>();
  let match: RegExpExecArray | null;
  const r = new RegExp(regex.source, regex.flags);
  while ((match = r.exec(source)) !== null) {
    const table = match[1].toUpperCase().replace(/^[A-Z_]+\./, ""); // strip schema prefix
    // FIX D v7.1: Skip Oracle keywords, SQL functions, and pseudo-columns
    if (table.length > 1 && !SQL_KEYWORDS_NOT_TABLES.has(table)) {
      tables.add(table);
    }
  }
  return Array.from(tables);
}

function extractSqlFeatures(source: string): string[] {
  const features = new Set<string>();
  let match: RegExpExecArray | null;
  const r = new RegExp(SQL_FEATURE_REGEX.source, SQL_FEATURE_REGEX.flags);
  while ((match = r.exec(source)) !== null) {
    features.add(match[1].toUpperCase());
  }
  return Array.from(features);
}

function extractEjbCalls(source: string, allIds: string[]): string[] {
  const calls: string[] = [];
  for (const id of allIds) {
    // Match @EJB injection or lookup patterns
    if (new RegExp(`@EJB[^;]*${id}`, "i").test(source) ||
        new RegExp(`lookup\\s*\\([^)]*${id}`, "i").test(source)) {
      calls.push(id);
    }
  }
  return calls;
}

function extractJmsQueues(source: string): string[] {
  const queues = new Set<string>();
  // @Resource(name = "jms/queue/XXX") or @Resource(name = "jms/topic/XXX")
  const resourceRegex = /@Resource\s*\([^)]*name\s*=\s*["']([^"']*jms\/(?:queue|topic)\/[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = resourceRegex.exec(source)) !== null) {
    queues.add(m[1]);
  }
  // lookup("jms/queue/XXX") or lookup("jms/topic/XXX")
  const lookupRegex = /lookup\s*\(\s*["']([^"']*jms\/(?:queue|topic)\/[^"']+)["']\s*\)/g;
  while ((m = lookupRegex.exec(source)) !== null) {
    queues.add(m[1]);
  }
  return Array.from(queues);
}

function classifyJmsDirection(source: string, queue: string): "PRODUCE" | "CONSUME" {
  // If the source sends messages (createProducer, send, publish)
  if (/createProducer|\.send\(|\.publish\(/i.test(source)) return "PRODUCE";
  // If the source receives messages (onMessage, createConsumer, receive)
  if (/onMessage|createConsumer|\.receive\(/i.test(source)) return "CONSUME";
  // If it's a MessageDrivenBean or MessageListener, it consumes
  if (/MessageDrivenBean|MessageListener|@MessageDriven/i.test(source)) return "CONSUME";
  // Default: produce
  return "PRODUCE";
}

// ── Adapter: ProjectIR + PipelineResult → ParsedModule[] ──────────

export function buildParsedModules(
  ir: ProjectIR,
  pipelineResult?: PipelineResult
): ParsedModule[] {
  const modules: ParsedModule[] = [];
  const allClassNames: string[] = [];

  // Collect all class names for EJB call detection
  for (const uc of ir.useCases) allClassNames.push(uc.className);
  for (const svc of ir.services) allClassNames.push(svc.className);
  for (const ejb of ir.ejb2xBeans) allClassNames.push(ejb.className);

  // 1. UseCases → ParsedModule (one per UseCase class)
  const useCasesByClass = new Map<string, UseCaseIR[]>();
  for (const uc of ir.useCases) {
    const existing = useCasesByClass.get(uc.className) ?? [];
    existing.push(uc);
    useCasesByClass.set(uc.className, existing);
  }

  for (const [className, ucs] of useCasesByClass) {
    const source = ucs[0].rawSource;
    const readTables = extractTables(source, SQL_READ_REGEX);
    const writeTables = extractTables(source, SQL_WRITE_REGEX);
    const writeCount = new Map<string, number>();
    for (const t of writeTables) {
      const count = (source.match(new RegExp(t, "gi")) ?? []).length;
      writeCount.set(t, count);
    }

    modules.push({
      id: className,
      type: "USE_CASE",
      domain: ucs[0].domain || inferDomainFromClassName(className),
      readTables,
      writeTables,
      writeCount,
      ejbCalls: extractEjbCalls(source, allClassNames),
      jmsQueues: extractJmsQueues(source),
      jmsProduces: extractJmsQueues(source).filter(q => classifyJmsDirection(source, q) === "PRODUCE"),
      jmsConsumes: extractJmsQueues(source).filter(q => classifyJmsDirection(source, q) === "CONSUME"),
      sqlFeatures: extractSqlFeatures(source),
      useCases: ucs.map(uc => ({
        methodName: uc.className.replace(/^UC/, "").replace(/^UseCase/, ""),
        voInType: uc.voInType !== "Void" ? uc.voInType : null,
        voOutType: uc.voOutType !== "Void" ? uc.voOutType : null,
        tx: uc.transactional?.propagation ?? "REQUIRED",
        httpVerb: uc.httpMethod || null,
        sqlConstants: [],
      })),
      rawSource: source,
    });
  }

  // 2. Services → ParsedModule (one per Service class)
  for (const svc of ir.services) {
    const source = svc.methods.map(m => m.name).join(" ");
    const rawSource = (ir._rawFiles ?? []).find(f => f.path.includes(svc.className))?.content ?? "";
    const readTables = extractTables(rawSource, SQL_READ_REGEX);
    const writeTables = extractTables(rawSource, SQL_WRITE_REGEX);
    const writeCount = new Map<string, number>();
    for (const t of writeTables) {
      const count = (rawSource.match(new RegExp(t, "gi")) ?? []).length;
      writeCount.set(t, count);
    }

    modules.push({
      id: svc.className,
      type: "SERVICE",
      domain: inferDomainFromClassName(svc.className),
      readTables,
      writeTables,
      writeCount,
      ejbCalls: extractEjbCalls(rawSource, allClassNames),
      jmsQueues: extractJmsQueues(rawSource),
      jmsProduces: extractJmsQueues(rawSource).filter(q => classifyJmsDirection(rawSource, q) === "PRODUCE"),
      jmsConsumes: extractJmsQueues(rawSource).filter(q => classifyJmsDirection(rawSource, q) === "CONSUME"),
      sqlFeatures: extractSqlFeatures(rawSource),
      useCases: svc.methods.map(m => ({
        methodName: m.name,
        voInType: m.parameters.length > 0 ? m.parameters[0].type : null,
        voOutType: m.returnType !== "void" ? m.returnType : null,
        tx: "REQUIRED",
        httpVerb: null,
        sqlConstants: [],
      })),
      rawSource,
    });
  }

  // 3. EJB 2.x beans → ParsedModule
  for (const ejb of ir.ejb2xBeans) {
    const rawSource = ejb.rawSource;
    const readTables = extractTables(rawSource, SQL_READ_REGEX);
    const writeTables = extractTables(rawSource, SQL_WRITE_REGEX);
    const writeCount = new Map<string, number>();
    for (const t of writeTables) {
      const count = (rawSource.match(new RegExp(t, "gi")) ?? []).length;
      writeCount.set(t, count);
    }

    modules.push({
      id: ejb.className,
      type: ejb.beanType === "MDB" ? "MDB" : "EJB2X",
      domain: inferDomainFromClassName(ejb.className),
      readTables,
      writeTables,
      writeCount,
      ejbCalls: extractEjbCalls(rawSource, allClassNames),
      jmsQueues: extractJmsQueues(rawSource),
      jmsProduces: extractJmsQueues(rawSource).filter(q => classifyJmsDirection(rawSource, q) === "PRODUCE"),
      jmsConsumes: extractJmsQueues(rawSource).filter(q => classifyJmsDirection(rawSource, q) === "CONSUME"),
      sqlFeatures: extractSqlFeatures(rawSource),
      useCases: ejb.methods.map(m => ({
        methodName: m.name,
        voInType: m.parameters.length > 0 ? m.parameters[0].type : null,
        voOutType: m.returnType !== "void" ? m.returnType : null,
        tx: "REQUIRED",
        httpVerb: null,
        sqlConstants: [],
      })),
      rawSource,
    });
  }

  // 4. Batch jobs → ParsedModule
  for (const batch of ir.batchJobs) {
    const rawSource = batch.rawSource;
    modules.push({
      id: batch.className,
      type: "BATCH",
      domain: "batch",
      readTables: extractTables(rawSource, SQL_READ_REGEX),
      writeTables: extractTables(rawSource, SQL_WRITE_REGEX),
      writeCount: new Map(),
      ejbCalls: [],
      jmsQueues: extractJmsQueues(rawSource),
      jmsProduces: [],
      jmsConsumes: [],
      sqlFeatures: [],
      useCases: [],
      rawSource,
    });
  }

  // 5. Enrich from PipelineResult DetectedComponents (JMS, JDBC, Servlet, etc.)
  if (pipelineResult) {
    enrichFromPipeline(modules, pipelineResult, allClassNames);
  }

  return modules;
}

function enrichFromPipeline(
  modules: ParsedModule[],
  pipeline: PipelineResult,
  allClassNames: string[]
): void {
  for (const comp of pipeline.detectedComponents) {
    const existing = modules.find(m => m.id === comp.className);

    if (comp.technology === "JMS") {
      const meta = comp.metadata as {
        role: string;
        destinationType: string;
        destinationName: string;
      };
      if (existing) {
        if (!existing.jmsQueues.includes(meta.destinationName)) {
          existing.jmsQueues.push(meta.destinationName);
        }
        if (meta.role === "PRODUCER" || meta.role === "SENDER") {
          if (!existing.jmsProduces.includes(meta.destinationName)) {
            existing.jmsProduces.push(meta.destinationName);
          }
        } else {
          if (!existing.jmsConsumes.includes(meta.destinationName)) {
            existing.jmsConsumes.push(meta.destinationName);
          }
        }
      }
    }

    if (comp.technology === "JDBC" || comp.technology === "HIBERNATE" || comp.technology === "JPA") {
      const tableName = (comp.metadata as any)?.tableName as string | undefined;
      if (tableName && existing) {
        const upper = tableName.toUpperCase();
        if (!existing.readTables.includes(upper)) {
          existing.readTables.push(upper);
        }
      }
    }

    // Add Servlet/Struts/SOAP components as modules if not already present
    if (!existing && (
      comp.technology === "SERVLET" ||
      comp.technology.startsWith("STRUTS") ||
      comp.technology === "SOAP" ||
      comp.technology === "JAX_RS"
    )) {
      const rawFile = (modules[0]?.rawSource ?? "");
      modules.push({
        id: comp.className,
        type: comp.technology,
        domain: inferDomainFromClassName(comp.className),
        readTables: [],
        writeTables: [],
        writeCount: new Map(),
        ejbCalls: [],
        jmsQueues: [],
        jmsProduces: [],
        jmsConsumes: [],
        sqlFeatures: [],
        useCases: [],
        rawSource: "",
      });
    }
  }
}

// ── Domain Inference ───────────────────────────────────────────────

function inferDomainFromClassName(className: string): string {
  const name = className
    .replace(/EJB$/i, "")
    .replace(/Service$/i, "")
    .replace(/Bean$/i, "")
    .replace(/Impl$/i, "")
    .replace(/DAO$/i, "")
    .replace(/Controller$/i, "")
    .replace(/Servlet$/i, "");

  const lower = name.toLowerCase();

  // ── Domaines bancaires core ──
  if (/compte|account|solde|balance/i.test(lower)) return "compte";
  if (/virement|transfer|remittance/i.test(lower)) return "virement";
  if (/client|customer|kyc|beneficiaire|beneficiary/i.test(lower)) return "client";
  if (/carte|card/i.test(lower)) return "carte";
  if (/credit|pret|loan|financement|leasing/i.test(lower)) return "credit";
  if (/auth|session|login|security|habilitation|acl/i.test(lower)) return "auth";
  if (/reporting|report|stat|bam|regulat/i.test(lower)) return "reporting";
  if (/batch|job|scheduler|arrete|cloture/i.test(lower)) return "batch";
  if (/notification|alert|sms|email|push/i.test(lower)) return "notification";
  if (/paiement|payment|prelevement|debit/i.test(lower)) return "paiement";
  // ── Domaines bancaires étendus ──
  if (/assurance|insurance|sinistre|police/i.test(lower)) return "assurance";
  if (/epargne|saving|placement|depot/i.test(lower)) return "epargne";
  if (/change|forex|devise|currency/i.test(lower)) return "change";
  if (/cheque|chequier|check/i.test(lower)) return "cheque";
  if (/garantie|collateral|nantissement|hypotheque/i.test(lower)) return "garantie";
  if (/risque|risk|scoring|notation/i.test(lower)) return "risque";
  if (/tresorerie|treasury|liquidite|cash/i.test(lower)) return "tresorerie";
  if (/trade|commerce|lettre.*credit|lc|import|export/i.test(lower)) return "trade-finance";
  if (/conformite|compliance|aml|lcb|sanctions/i.test(lower)) return "conformite";
  if (/comptabilite|accounting|gl|grand.*livre/i.test(lower)) return "comptabilite";
  if (/referentiel|reference|parametre|config/i.test(lower)) return "referentiel";
  if (/document|ged|archive|scan/i.test(lower)) return "document";
  if (/workflow|bpm|process|approbation/i.test(lower)) return "workflow";
  if (/monetique|tpe|pos|terminal/i.test(lower)) return "monetique";
  if (/swift|sepa|interbank|compensation/i.test(lower)) return "interbancaire";

  // Split camelCase and take the first meaningful word
  const parts = name.replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/);
  return (parts[0] || name).toLowerCase();
}

// ── MicroserviceSplitter ──────────────────────────────────────────

export class MicroserviceSplitter {

  /**
   * Main entry point: split parsed modules into microservice candidates.
   * Accepts either pre-built ParsedModule[] or ProjectIR + PipelineResult.
   */
  split(modules: ParsedModule[]): ServiceCandidate[];
  split(ir: ProjectIR, pipelineResult?: PipelineResult): ServiceCandidate[];
  split(
    modulesOrIr: ParsedModule[] | ProjectIR,
    pipelineResult?: PipelineResult
  ): ServiceCandidate[] {
    let modules: ParsedModule[];

    if (Array.isArray(modulesOrIr)) {
      modules = modulesOrIr;
    } else {
      modules = buildParsedModules(modulesOrIr, pipelineResult);
    }

    if (modules.length === 0) return [];

    const coupling = this.buildCouplingMatrix(modules);
    const groups   = this.groupByCoupling(modules, coupling, 60);
    const services = this.assignTableOwnership(groups, modules);
    this.generateRestApis(services, modules);
    this.convertJmsToKafka(services, modules);
    return services;
  }

  // ── Coupling Matrix ────────────────────────────────────────────

  private buildCouplingMatrix(
    modules: ParsedModule[]
  ): Map<string, Map<string, number>> {
    const matrix = new Map<string, Map<string, number>>();

    for (const mod of modules) {
      const scores = new Map<string, number>();
      for (const other of modules) {
        if (mod.id === other.id) continue;
        let score = 0;

        // Tables écrites en commun : très fort couplage
        const sharedRW = (mod.writeTables ?? [])
          .filter(t => (other.writeTables ?? []).includes(t));
        score += sharedRW.length * 30;

        // Tables lues en commun : couplage moyen
        const sharedR = (mod.readTables ?? [])
          .filter(t =>
            (other.readTables ?? []).includes(t) ||
            (other.writeTables ?? []).includes(t)
          );
        score += sharedR.length * 10;

        // Appel @EJB direct : fort couplage
        if ((mod.ejbCalls ?? []).includes(other.id)) score += 40;

        // JMS partagé : couplage moyen
        const sharedJms = (mod.jmsQueues ?? [])
          .filter(q => (other.jmsQueues ?? []).includes(q));
        score += sharedJms.length * 20;

        scores.set(other.id, Math.min(100, score));
      }
      matrix.set(mod.id, scores);
    }
    return matrix;
  }

  // ── Grouping ───────────────────────────────────────────────────

  private groupByCoupling(
    modules:   ParsedModule[],
    coupling:  Map<string, Map<string, number>>,
    threshold: number
  ): ParsedModule[][] {
    const visited = new Set<string>();
    const groups: ParsedModule[][] = [];

    for (const mod of modules) {
      if (visited.has(mod.id)) continue;
      const group = [mod];
      visited.add(mod.id);

      for (const other of modules) {
        if (visited.has(other.id)) continue;
        const score = coupling.get(mod.id)?.get(other.id) ?? 0;
        if (score >= threshold) {
          group.push(other);
          visited.add(other.id);
        }
      }
      groups.push(group);
    }
    return groups;
  }

  // ── Table Ownership ────────────────────────────────────────────

  private assignTableOwnership(
    groups:  ParsedModule[][],
    modules: ParsedModule[]
  ): ServiceCandidate[] {
    // Table → module qui écrit le plus = propriétaire
    const tableOwner = new Map<string, string>();
    const allTables  = [
      ...new Set(modules.flatMap(m => m.writeTables ?? []))
    ];

    for (const table of allTables) {
      const writers = modules
        .filter(m => (m.writeTables ?? []).includes(table))
        .sort((a, b) =>
          (b.writeCount?.get(table) ?? 0) -
          (a.writeCount?.get(table) ?? 0)
        );
      if (writers.length > 0) tableOwner.set(table, writers[0].id);
    }

    return groups.map(group => {
      const ownedTables = allTables.filter(t =>
        group.some(m => tableOwner.get(t) === m.id)
      );
      const readOnlyTables = [
        ...new Set(group.flatMap(m => m.readTables ?? []))
      ].filter(t => !ownedTables.includes(t));

      const name = this.inferServiceName(group);

      return {
        name,
        ejbs:             group.map(m => m.id),
        ownedTables,
        readOnlyTables,
        kafkaTopics:      [],
        restApis:         [],
        restDependencies: [],
        dbSchema:         name.replace("-service", "_SVC").toUpperCase(),
        confidence:       this.computeConfidence(
          group, ownedTables, readOnlyTables
        ),
      };
    });
  }

  // ── REST API Generation ────────────────────────────────────────

  private generateRestApis(
    services: ServiceCandidate[],
    modules:  ParsedModule[]
  ): void {
    for (const service of services) {
      for (const table of service.readOnlyTables) {
        const owner = services.find(s =>
          s.ownedTables.includes(table)
        );
        if (!owner || owner.name === service.name) continue;

        const path = this.inferApiPath(table);

        if (!owner.restApis.some(a => a.path === path)) {
          owner.restApis.push({
            method:  "GET",
            path,
            purpose: `Lecture ${table} — appelé par ${service.name}`,
          });
        }

        const isCritical = modules
          .filter(m => service.ejbs.includes(m.id))
          .some(m => (m.sqlFeatures ?? []).includes("FOR UPDATE NOWAIT") &&
                     (m.readTables ?? []).includes(table));

        service.restDependencies.push({
          targetService: owner.name,
          method:        "GET",
          path,
          isCritical,
        });
      }
    }
  }

  // ── JMS → Kafka Conversion ─────────────────────────────────────

  private convertJmsToKafka(
    services: ServiceCandidate[],
    modules:  ParsedModule[]
  ): void {
    for (const service of services) {
      const mods = modules.filter(m =>
        service.ejbs.includes(m.id)
      );
      for (const mod of mods) {
        for (const q of (mod.jmsProduces ?? [])) {
          service.kafkaTopics.push({
            name:      this.jndiToTopic(q),
            direction: "PRODUCE",
            eventType: this.toEventType(q),
          });
        }
        for (const q of (mod.jmsConsumes ?? [])) {
          service.kafkaTopics.push({
            name:      this.jndiToTopic(q),
            direction: "CONSUME",
            eventType: this.toEventType(q),
          });
        }
      }
      // BUG-D v7.5: Deduplicate Kafka topics by direction+name
      service.kafkaTopics = this.deduplicateKafkaTopics(service.kafkaTopics);
    }
  }

  /**
   * BUG-D v7.5: Deduplicate Kafka topics within a service.
   * Multiple EJB methods may reference the same JMS queue → same Kafka topic.
   * Dedup key = direction + name.
   */
  private deduplicateKafkaTopics(topics: KafkaTopic[]): KafkaTopic[] {
    const seen = new Set<string>();
    return topics.filter(t => {
      const key = `${t.direction}:${t.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ── Naming Helpers ─────────────────────────────────────────────

  private inferServiceName(group: ParsedModule[]): string {
    const ids = group.map(m => m.id.toLowerCase());

    // BUG-E/J v7.5: Dashboard/Operateur/Admin servlets → ops-service (NOT auth-service)
    if (ids.some(id =>
      id.includes("dashboard") || id.includes("operateur") ||
      id.includes("admin") || id.includes("backoffice")
    )) return "ops-service";

    if (ids.some(id => id.includes("reporting"))) return "reporting-service";
    if (ids.some(id => id.includes("batch")))     return "batch-service";

    // BUG-E/J v7.5: Only auth/session keywords → auth-service (NOT all servlets)
    if (ids.some(id =>
      id.includes("auth") || id.includes("login") || id.includes("session")
    )) return "auth-service";

    // BUG-E/J v7.5: Servlets without specific domain → ops-service
    const hasServlet = group.some(m => m.type === "SERVLET");
    if (hasServlet) {
      // Check if there's a clear domain from non-servlet modules in the group
      const nonServletDomains = group
        .filter(m => m.type !== "SERVLET")
        .map(m => this.toDomain(m.id))
        .filter(d => d !== "unknown");
      if (nonServletDomains.length === 0) return "ops-service";
    }

    // Domaine dominant
    const domains = group.map(m => this.toDomain(m.id));
    const dominant = domains.sort((a, b) =>
      domains.filter(d => d === b).length -
      domains.filter(d => d === a).length
    )[0];
    return `${dominant}-service`;
  }

  private toDomain(ejbId: string): string {
    // FIX C v7.1: Extract domain from EJB class name, not className_methodName
    // e.g. "CarteEJB_getCartesActives" → strip method → "CarteEJB" → "carte"
    //      "CompteEJB_consulterSolde"  → strip method → "CompteEJB" → "compte"
    const baseName = ejbId.includes("_") ? ejbId.split("_")[0] : ejbId;
    const cleaned = baseName
      .replace(/EJB$/i, "")
      .replace(/Service$/i, "")
      .replace(/Bean$/i, "")
      .replace(/Impl$/i, "")
      .replace(/DAO$/i, "")
      .replace(/MDB$/i, "");
    // Delegate to shared inferDomainFromClassName for consistent domain mapping
    return inferDomainFromClassName(cleaned);
  }

  private jndiToTopic(jndi: string): string {
    return jndi
      .replace(/jms\/(queue|topic)\//i, "")
      .toLowerCase()
      .replace(/_/g, "-");
  }

  private toEventType(jndi: string): string {
    const topic = this.jndiToTopic(jndi);
    return topic
      .split("-")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join("") + "Event";
  }

  private inferApiPath(table: string): string {
    const resource = table
      .replace(/^T_/i, "")
      .toLowerCase()
      .replace(/_/g, "-");
    return `/${resource}/{id}`;
  }

  private computeConfidence(
    group:          ParsedModule[],
    ownedTables:    string[],
    readOnlyTables: string[]
  ): number {
    let score = 100;
    score -= readOnlyTables.length * 8;
    if (group.length > 3) score -= (group.length - 3) * 5;
    if (readOnlyTables.length === 0) score += 10;
    return Math.max(40, Math.min(99, score));
  }
}
