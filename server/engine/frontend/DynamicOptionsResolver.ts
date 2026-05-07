/**
 * DynamicOptionsResolver -- Moteur d'options de generation conditionnelles.
 *
 * Les options proposees au developpeur sont 100% dynamiques, basees sur
 * ce que l'analyse a reellement detecte. Aucune checkbox statique.
 *
 * Logique :
 *   - JSP/Struts/Servlet HTML/JSF detectes  -> proposer generation Frontend
 *   - Bounded contexts detectes             -> proposer Microservices
 *   - Transactions distribuees detectees    -> proposer Saga Orchestration
 *   - Domaine bancaire detecte              -> proposer mapping BIAN
 *   - Domaine assurance detecte             -> proposer mapping ACORD
 *   - Domaine sante detecte                 -> proposer mapping HL7/FHIR
 *   - Domaine telecom detecte               -> proposer mapping TMForum/eTOM
 *   - Domaine e-commerce detecte            -> proposer mapping DDD standard
 *   - SOAP/WSDL detectes                    -> proposer adapter REST
 *   - JMS detecte                           -> proposer migration messaging (Kafka/RabbitMQ)
 *   - Batch detecte                         -> proposer Spring Batch / Spring Cloud Task
 *
 * @version v10.8
 * @author Compleo
 */

import type { TechnologyType } from "../registry/types";
import type { AIAnalysisInsights, DomainInsight } from "../analysis/AnalysisLLMEnricher";

// --- Types ---

export type FrontendFramework = "react" | "angular" | "vue" | "thymeleaf" | "jsf";

export type IndustryStandard =
  | "BIAN"      // Banking Industry Architecture Network
  | "ACORD"     // Association for Cooperative Operations Research and Development (Insurance)
  | "HL7_FHIR"  // Health Level 7 / FHIR (Healthcare)
  | "TMFORUM"   // TM Forum / eTOM (Telecom)
  | "DDD"       // Domain-Driven Design (Generic / E-commerce)
  | "TOGAF"     // The Open Group Architecture Framework (Enterprise)
  | "NONE";

export type MessagingTarget = "kafka" | "rabbitmq" | "none";

export interface DynamicOption {
  /** Unique identifier for this option */
  id: string;
  /** Display label (French) */
  label: string;
  /** Short description explaining why this option is proposed */
  description: string;
  /** Category for UI grouping */
  category: "frontend" | "architecture" | "standard" | "messaging" | "batch" | "quality";
  /** Whether this option is enabled by default (recommended) */
  defaultEnabled: boolean;
  /** Confidence level based on detection strength */
  confidence: "high" | "medium" | "low";
  /** Icon hint for the UI (lucide icon name) */
  icon: string;
  /** Color hint for the UI (tailwind color) */
  color: string;
  /** Technologies that triggered this option */
  triggeredBy: string[];
  /** Sub-options (e.g., framework choice for frontend) */
  subOptions?: SubOption[];
  /** Dependencies: other option IDs that must be enabled for this one */
  requires?: string[];
}

export interface SubOption {
  id: string;
  label: string;
  description: string;
  defaultSelected: boolean;
}

export interface ResolvedOptions {
  /** All dynamic options to present to the user */
  options: DynamicOption[];
  /** Detected industry domain */
  detectedDomain: DetectedDomain;
  /** Summary of what was detected */
  detectionSummary: string;
  /** Whether IHM (UI layer) was detected in the legacy project */
  hasIHM: boolean;
  /** Whether distributed transactions were detected */
  hasDistributedTransactions: boolean;
  /** Whether multiple bounded contexts were detected */
  hasBoundedContexts: boolean;
}

export interface DetectedDomain {
  primary: IndustryStandard;
  confidence: "high" | "medium" | "low";
  indicators: string[];
  label: string;
}

// --- Domain detection keywords ---

const DOMAIN_INDICATORS: Record<IndustryStandard, { keywords: string[]; classPatterns: RegExp[]; label: string }> = {
  BIAN: {
    keywords: [
      "account", "transaction", "payment", "loan", "credit", "debit",
      "banking", "bank", "deposit", "withdrawal", "transfer", "mortgage",
      "interest", "balance", "ledger", "currency", "forex", "swift",
      "iban", "bic", "sepa", "clearing", "settlement", "collateral",
      "compliance", "kyc", "aml", "fraud", "risk", "portfolio",
    ],
    classPatterns: [
      /Account(Service|Manager|Bean|DAO|Repository)/i,
      /Transaction(Service|Manager|Bean|DAO)/i,
      /Payment(Service|Manager|Gateway|Processor)/i,
      /Loan(Service|Manager|Calculator)/i,
      /Credit(Service|Score|Check)/i,
      /(Virement|Compte|Solde|Pret|Echeance)/i,
    ],
    label: "Banque / Finance",
  },
  ACORD: {
    keywords: [
      "policy", "claim", "premium", "underwriting", "insurance",
      "insurer", "insured", "beneficiary", "coverage", "deductible",
      "endorsement", "reinsurance", "actuary", "risk", "sinistre",
      "contrat", "assurance", "police", "cotisation", "garantie",
    ],
    classPatterns: [
      /Policy(Service|Manager|Bean|DAO)/i,
      /Claim(Service|Manager|Processor)/i,
      /Premium(Calculator|Service)/i,
      /Underwriting(Service|Engine)/i,
      /(Sinistre|Contrat|Police|Garantie)(Service|Manager|Bean)/i,
    ],
    label: "Assurance",
  },
  HL7_FHIR: {
    keywords: [
      "patient", "doctor", "hospital", "diagnosis", "prescription",
      "medical", "health", "clinical", "pharmacy", "lab", "specimen",
      "observation", "encounter", "appointment", "practitioner",
      "medication", "allergy", "immunization", "procedure",
    ],
    classPatterns: [
      /Patient(Service|Manager|Bean|DAO)/i,
      /Doctor(Service|Manager)/i,
      /Prescription(Service|Manager)/i,
      /Diagnosis(Service|Manager)/i,
      /(Medecin|Ordonnance|Consultation|Dossier)(Service|Manager|Bean)/i,
    ],
    label: "Sante / Medical",
  },
  TMFORUM: {
    keywords: [
      "subscriber", "subscription", "telecom", "network", "billing",
      "tariff", "roaming", "sim", "operator", "bandwidth", "voip",
      "sms", "mms", "data_plan", "provisioning", "activation",
      "portability", "interconnect", "cdr", "usage",
    ],
    classPatterns: [
      /Subscriber(Service|Manager|Bean)/i,
      /Subscription(Service|Manager)/i,
      /Billing(Service|Engine|Calculator)/i,
      /Tariff(Service|Manager)/i,
      /(Abonne|Forfait|Facturation|Reseau)(Service|Manager|Bean)/i,
    ],
    label: "Telecom",
  },
  DDD: {
    keywords: [
      "product", "catalog", "cart", "order", "checkout", "inventory",
      "shipping", "warehouse", "customer", "merchant", "payment",
      "discount", "coupon", "review", "wishlist", "recommendation",
    ],
    classPatterns: [
      /Product(Service|Manager|Bean|DAO)/i,
      /Cart(Service|Manager)/i,
      /Order(Service|Manager|Processor)/i,
      /Inventory(Service|Manager)/i,
      /(Commande|Panier|Catalogue|Produit|Stock)(Service|Manager|Bean)/i,
    ],
    label: "E-Commerce / Retail",
  },
  TOGAF: {
    keywords: [
      "enterprise", "workflow", "process", "bpm", "erp", "crm",
      "document", "approval", "notification", "audit", "report",
      "dashboard", "kpi", "metric", "integration", "middleware",
    ],
    classPatterns: [
      /Workflow(Service|Manager|Engine)/i,
      /Process(Service|Manager|Orchestrator)/i,
      /Approval(Service|Manager)/i,
      /Audit(Service|Logger|Trail)/i,
    ],
    label: "Enterprise / ERP",
  },
  NONE: {
    keywords: [],
    classPatterns: [],
    label: "Generique",
  },
};

// --- IHM detection ---

const IHM_TECHNOLOGIES: TechnologyType[] = ["JSP", "STRUTS_1", "STRUTS_2", "SERVLET"];

const IHM_FILE_PATTERNS = [
  /\.jsp$/i,
  /\.jspx$/i,
  /\.jsf$/i,
  /\.xhtml$/i,  // JSF Facelets
  /\.tag$/i,    // JSP Tag files
  /\.tld$/i,    // Tag Library Descriptors
  /faces-config\.xml$/i,
  /struts-config\.xml$/i,
  /struts\.xml$/i,
  /tiles\.xml$/i,
  /web\.xml$/i,
  // v10.8c: JavaScript/AJAX legacy files
  /\.js$/i,     // JavaScript files in webapp
  /\.html$/i,   // Static HTML pages
  /\.htm$/i,
];

// v10.8c: JavaScript/AJAX patterns in source files (JSP + JS)
const JS_AJAX_PATTERNS = [
  // jQuery AJAX
  /\$\.ajax\s*\(/,
  /\$\.get\s*\(/,
  /\$\.post\s*\(/,
  /\$\.getJSON\s*\(/,
  /jQuery\.ajax/,
  // Vanilla JS AJAX
  /XMLHttpRequest/,
  /new\s+XMLHttpRequest/,
  /\.open\s*\(\s*["'](GET|POST|PUT|DELETE)/,
  /\.send\s*\(/,
  /fetch\s*\(\s*["']/,
  // Legacy JS frameworks
  /Prototype\.js/i,
  /new\s+Ajax\.Request/,     // Prototype.js
  /new\s+Ajax\.Updater/,     // Prototype.js
  /dojo\.xhrGet/,             // Dojo
  /dojo\.xhrPost/,            // Dojo
  /dojo\.request/,            // Dojo
  /Ext\.Ajax\.request/,       // ExtJS
  /Ext\.data\.Store/,         // ExtJS
  /Ext\.create\s*\(/,         // ExtJS
  // GWT (Google Web Toolkit)
  /com\.google\.gwt/,
  /GWT\.create\s*\(/,
  /RemoteServiceServlet/,
  /AsyncCallback/,
  // JavaScript in JSP (embedded scripts)
  /<script[^>]*>.*\$\.ajax/s,
  /<script[^>]*>.*XMLHttpRequest/s,
  /<script[^>]*>.*fetch\s*\(/s,
  // DWR (Direct Web Remoting)
  /DWRUtil/,
  /dwr\.engine/,
  /dwr\.util/,
];

// v10.8c: Detected JS framework types for summary
const JS_FRAMEWORK_DETECTORS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "jQuery", patterns: [/\$\.ajax/, /jQuery/, /\$\(document\)/, /\$\(function/] },
  { name: "Prototype.js", patterns: [/Prototype\.js/, /new\s+Ajax\.Request/, /\$\$\s*\(/] },
  { name: "Dojo", patterns: [/dojo\.xhrGet/, /dojo\.request/, /dojo\.require/] },
  { name: "ExtJS", patterns: [/Ext\.Ajax/, /Ext\.create/, /Ext\.define/] },
  { name: "GWT", patterns: [/com\.google\.gwt/, /GWT\.create/, /RemoteServiceServlet/] },
  { name: "DWR", patterns: [/DWRUtil/, /dwr\.engine/] },
  { name: "AJAX vanilla", patterns: [/XMLHttpRequest/, /fetch\s*\(\s*["']/] },
];

const IHM_CLASS_PATTERNS = [
  /extends\s+HttpServlet/,
  /extends\s+Action\b/,       // Struts 1 Action
  /extends\s+ActionSupport/,  // Struts 2 ActionSupport
  /extends\s+DispatchAction/,
  /@WebServlet/,
  /@ManagedBean/,             // JSF
  /@Named/,                   // CDI (JSF)
  /doGet\s*\(/,
  /doPost\s*\(/,
  /forward\s*\(\s*["'].*\.jsp/,
  /getRequestDispatcher/,
  /setAttribute\s*\(\s*["']/,
  /sendRedirect/,
  // v10.8c: GWT server-side patterns
  /extends\s+RemoteServiceServlet/,
  /implements\s+.*RemoteService/,
];

// --- Distributed transaction detection ---

const DISTRIBUTED_TX_PATTERNS = [
  /@TransactionAttribute\s*\(\s*TransactionAttributeType\.REQUIRES_NEW/,
  /UserTransaction/,
  /javax\.transaction/,
  /jakarta\.transaction/,
  /XAResource/,
  /XADataSource/,
  /two.?phase.?commit/i,
  /distributed.?transaction/i,
  /saga/i,
  /compensat/i,
];

// --- Main resolver class ---

export class DynamicOptionsResolver {

  /**
   * Analyse les resultats et retourne les options dynamiques a proposer.
   * Chaque option est conditionnee a ce que l'analyse a reellement detecte.
   */
  resolve(input: {
    technologiesDetected: TechnologyType[];
    detectedComponents: Array<{ type: string; technology: TechnologyType; className?: string; filePath?: string }>;
    aiInsights?: AIAnalysisInsights | null;
    sourceFiles?: Array<{ path: string; content: string }>;
    classNames?: string[];
    domainCount?: number;
  }): ResolvedOptions {
    const options: DynamicOption[] = [];

    // 1. Detect IHM (UI layer)
    const hasIHM = this.detectIHM(input);

    // 2. Detect domain
    const detectedDomain = this.detectDomain(input);

    // 3. Detect distributed transactions
    const hasDistributedTransactions = this.detectDistributedTransactions(input);

    // 4. Detect bounded contexts (multiple domains)
    const hasBoundedContexts = this.detectBoundedContexts(input);

    // --- Build dynamic options ---

    // Option: Frontend generation (only if IHM detected)
    if (hasIHM) {
      options.push({
        id: "frontend",
        label: "Generation Frontend",
        description: `IHM legacy detectee (${this.getIHMSummary(input)}). Generation d'un projet frontend moderne connecte au backend Spring Boot.`,
        category: "frontend",
        defaultEnabled: true,
        confidence: this.getIHMConfidence(input),
        icon: "Monitor",
        color: "cyan",
        triggeredBy: this.getIHMTriggers(input),
        subOptions: [
          { id: "react", label: "React + TypeScript", description: "SPA React avec Vite, React Router, Axios, TailwindCSS", defaultSelected: true },
          { id: "angular", label: "Angular", description: "Application Angular avec Angular Material, HttpClient, routing", defaultSelected: false },
          { id: "vue", label: "Vue.js 3", description: "Application Vue 3 avec Composition API, Vue Router, Pinia, Axios", defaultSelected: false },
          { id: "thymeleaf", label: "Thymeleaf / Spring MVC", description: "Rendu serveur avec Spring MVC, Thymeleaf templates, Bootstrap 5", defaultSelected: false },
          { id: "jsf", label: "JSF / PrimeFaces", description: "Jakarta Faces avec PrimeFaces, JoinFaces Spring Boot, composants riches", defaultSelected: false },
        ],
      });
    }

    // Option: Microservices (only if bounded contexts detected)
    if (hasBoundedContexts) {
      options.push({
        id: "microservices",
        label: "Decoupage Microservices",
        description: `${input.domainCount || "Plusieurs"} domaines metier detectes. Decoupage en microservices autonomes avec API Gateway.`,
        category: "architecture",
        defaultEnabled: true,
        confidence: (input.domainCount || 0) >= 3 ? "high" : "medium",
        icon: "Layers",
        color: "pink",
        triggeredBy: ["bounded_contexts", `${input.domainCount || 0}_domains`],
        subOptions: [
          { id: "ml_enhanced", label: "Amelioration IA", description: "Utiliser le modele IA pour optimiser le decoupage", defaultSelected: true },
        ],
      });
    }

    // Option: Saga (only if distributed transactions detected AND microservices proposed)
    if (hasDistributedTransactions && hasBoundedContexts) {
      options.push({
        id: "saga",
        label: "Saga Orchestration",
        description: "Transactions distribuees detectees. Generation de sagas avec compensation automatique.",
        category: "architecture",
        defaultEnabled: true,
        confidence: "high",
        icon: "GitBranch",
        color: "violet",
        triggeredBy: this.getDistributedTxTriggers(input),
        requires: ["microservices"],
      });
    }

    // Option: Industry standard mapping — ONE toggle with sub-options (like frontend framework)
    const recommendedStandard = detectedDomain.primary !== "NONE" ? detectedDomain.primary : null;
    const ALL_STANDARDS: Array<{ id: string; standard: IndustryStandard; label: string; description: string }> = [
      { id: "BIAN", standard: "BIAN", label: "Mapping BIAN (Banque / Finance)", description: "Alignement des services sur le referentiel BIAN v12." },
      { id: "ACORD", standard: "ACORD", label: "Mapping ACORD (Assurance)", description: "Alignement sur le standard ACORD pour le domaine assurance." },
      { id: "HL7_FHIR", standard: "HL7_FHIR", label: "Mapping HL7/FHIR (Sante)", description: "Alignement sur les standards HL7 FHIR pour le domaine sante." },
      { id: "TMFORUM", standard: "TMFORUM", label: "Mapping TMForum/eTOM (Telecom)", description: "Alignement sur le referentiel TMForum pour les telecoms." },
      { id: "DDD", standard: "DDD", label: "Structuration DDD (Domain-Driven Design)", description: "Structuration en Bounded Contexts, Aggregats et Value Objects." },
      { id: "TOGAF", standard: "TOGAF", label: "Architecture TOGAF (Enterprise)", description: "Alignement sur le framework TOGAF ADM." },
    ];

    options.push({
      id: "industry_standard",
      label: "Standards Metier",
      description: recommendedStandard
        ? `Domaine ${detectedDomain.label} detecte (${detectedDomain.confidence}). Choisissez le standard d'alignement.`
        : "Alignement sur un standard industriel pour structurer vos services.",
      category: "standard",
      defaultEnabled: !!recommendedStandard,
      confidence: recommendedStandard ? detectedDomain.confidence : "low",
      icon: "Shield",
      color: "blue",
      triggeredBy: recommendedStandard ? detectedDomain.indicators.slice(0, 3) : ["user_choice"],
      subOptions: ALL_STANDARDS.map(std => ({
        id: std.id,
        label: std.id === recommendedStandard ? `${std.label} (Recommande)` : std.label,
        description: std.description,
        defaultSelected: std.id === recommendedStandard,
      })),
    });

    // Option: SOAP to REST adapter (if SOAP detected)
    if (input.technologiesDetected.includes("SOAP")) {
      options.push({
        id: "soap_to_rest",
        label: "Adaptateur SOAP vers REST",
        description: "Services SOAP detectes. Generation d'adaptateurs REST avec OpenAPI/Swagger.",
        category: "architecture",
        defaultEnabled: true,
        confidence: "high",
        icon: "Globe",
        color: "blue",
        triggeredBy: ["SOAP"],
      });
    }

    // Option: Messaging migration (if JMS or MDB detected)
    const hasMessaging = input.technologiesDetected.some(t =>
      t === "JMS" || t.includes("MDB") || t.includes("JMS") || t === "EJB_3X_MDB"
    );
    if (hasMessaging) {
      options.push({
        id: "messaging",
        label: "Migration Messaging",
        description: "JMS detecte. Migration vers un broker moderne (Kafka ou RabbitMQ).",
        category: "messaging",
        defaultEnabled: true,
        confidence: "high",
        icon: "Radio",
        color: "orange",
        triggeredBy: ["JMS"],
        subOptions: [
          { id: "kafka", label: "Apache Kafka", description: "Event streaming haute performance, ideal pour les architectures event-driven", defaultSelected: true },
          { id: "rabbitmq", label: "RabbitMQ", description: "Message broker AMQP, ideal pour les patterns request/reply", defaultSelected: false },
        ],
      });
    }

    // Option: Batch migration (if Batch detected)
    if (input.technologiesDetected.includes("BATCH")) {
      options.push({
        id: "batch",
        label: "Migration Batch",
        description: "Traitements batch detectes. Migration vers Spring Batch / Spring Cloud Task.",
        category: "batch",
        defaultEnabled: true,
        confidence: "high",
        icon: "Clock",
        color: "amber",
        triggeredBy: ["BATCH"],
      });
    }

    // Option: AI-enhanced reports (always available if AI insights exist)
    if (input.aiInsights) {
      options.push({
        id: "ai_reports",
        label: "Rapports IA enrichis",
        description: "Rapports de migration enrichis par l'IA : analyse de risques, plan de migration, recommandations.",
        category: "quality",
        defaultEnabled: true,
        confidence: "high",
        icon: "Star",
        color: "amber",
        triggeredBy: ["ai_insights_available"],
      });
    }

    // Option: SOC 2 Compliance (always available)
    options.push({
      id: "soc2_compliance",
      label: "Conformite SOC 2",
      description: "Generer le code avec les patterns de securite SOC 2 Type II : audit trails, chiffrement AES-256, controle d'acces, headers securises, monitoring.",
      category: "security" as any,
      defaultEnabled: false,
      confidence: "high",
      icon: "Shield",
      color: "red",
      triggeredBy: ["always_available"],
      subOptions: [
        { id: "audit_trail", label: "Audit Trail complet", description: "Enregistrement automatique de chaque action utilisateur/systeme", defaultSelected: true },
        { id: "encryption", label: "Chiffrement donnees sensibles", description: "AES-256-GCM pour les champs annotes @EncryptedField", defaultSelected: true },
        { id: "input_validation", label: "Validation des entrees", description: "Protection XSS, SQL Injection, Path Traversal via AOP", defaultSelected: true },
        { id: "security_headers", label: "Headers de securite HTTP", description: "CSP, HSTS, X-Frame-Options, Referrer-Policy", defaultSelected: true },
      ],
    });

    // Always add: auto-resolve ambiguities
    options.unshift({
      id: "auto_resolve",
      label: "Auto-resolution des ambiguites",
      description: "Utiliser les recommandations du moteur pour resoudre automatiquement les ambiguites detectees.",
      category: "quality",
      defaultEnabled: true,
      confidence: "high",
      icon: "Zap",
      color: "emerald",
      triggeredBy: ["always"],
    });

    // Build summary
    const detectionSummary = this.buildDetectionSummary(hasIHM, detectedDomain, hasDistributedTransactions, hasBoundedContexts, input);

    return {
      options,
      detectedDomain,
      detectionSummary,
      hasIHM,
      hasDistributedTransactions,
      hasBoundedContexts,
    };
  }

  // --- IHM Detection ---

  private detectIHM(input: {
    technologiesDetected: TechnologyType[];
    detectedComponents: Array<{ type: string; technology: TechnologyType; className?: string; filePath?: string }>;
    sourceFiles?: Array<{ path: string; content: string }>;
  }): boolean {
    // Check 1: Technologies detected by the pipeline
    const hasIHMTech = input.technologiesDetected.some(t => IHM_TECHNOLOGIES.includes(t));
    if (hasIHMTech) return true;

    // Check 2: File patterns in source files
    if (input.sourceFiles) {
      // Only count .js/.html files if they are in webapp directories (not node_modules, not test)
      const hasIHMFiles = input.sourceFiles.some(f =>
        IHM_FILE_PATTERNS.some(p => p.test(f.path)) &&
        !f.path.includes("node_modules") && !f.path.includes("/test/")
      );
      if (hasIHMFiles) return true;

      // Check 3: Code patterns in source files (Java classes)
      const hasIHMCode = input.sourceFiles.some(f =>
        IHM_CLASS_PATTERNS.some(p => p.test(f.content))
      );
      if (hasIHMCode) return true;

      // Check 4 (v10.8c): JavaScript/AJAX patterns in JSP and JS files
      const hasJSAjax = input.sourceFiles.some(f => {
        // Only check JSP, JS, HTML files for AJAX patterns
        if (!/\.(jsp|jspx|js|html|htm|xhtml)$/i.test(f.path)) return false;
        return JS_AJAX_PATTERNS.some(p => p.test(f.content));
      });
      if (hasJSAjax) return true;
    }

    // Check 4: Detected components with IHM-related types
    const hasIHMComponents = input.detectedComponents.some(c =>
      IHM_TECHNOLOGIES.includes(c.technology) ||
      c.type === "jsp" || c.type === "servlet" || c.type === "struts_action"
    );
    return hasIHMComponents;
  }

  private getIHMSummary(input: {
    technologiesDetected: TechnologyType[];
    detectedComponents: Array<{ type: string; technology: TechnologyType }>;
    sourceFiles?: Array<{ path: string; content: string }>;
  }): string {
    const parts: string[] = [];
    if (input.technologiesDetected.includes("JSP")) parts.push("JSP");
    if (input.technologiesDetected.includes("STRUTS_1")) parts.push("Struts 1");
    if (input.technologiesDetected.includes("STRUTS_2")) parts.push("Struts 2");
    if (input.technologiesDetected.includes("SERVLET")) parts.push("Servlets");

    // v10.8c: Detect JS frameworks in source files
    if (input.sourceFiles) {
      const allContent = input.sourceFiles
        .filter(f => /\.(jsp|jspx|js|html|htm|xhtml)$/i.test(f.path))
        .map(f => f.content)
        .join("\n");
      for (const detector of JS_FRAMEWORK_DETECTORS) {
        if (detector.patterns.some(p => p.test(allContent))) {
          parts.push(detector.name);
        }
      }
    }

    return parts.length > 0 ? parts.join(", ") : "IHM legacy";
  }

  private getIHMConfidence(input: {
    technologiesDetected: TechnologyType[];
    detectedComponents: Array<{ type: string; technology: TechnologyType }>;
    sourceFiles?: Array<{ path: string; content: string }>;
  }): "high" | "medium" | "low" {
    const ihmTechCount = input.technologiesDetected.filter(t => IHM_TECHNOLOGIES.includes(t)).length;
    // v10.8c: Count JS/AJAX hits for confidence boost
    let jsAjaxHits = 0;
    if (input.sourceFiles) {
      for (const f of input.sourceFiles) {
        if (!/\.(jsp|jspx|js|html|htm|xhtml)$/i.test(f.path)) continue;
        for (const p of JS_AJAX_PATTERNS) {
          if (p.test(f.content)) jsAjaxHits++;
        }
      }
    }
    if (ihmTechCount >= 2 || jsAjaxHits >= 5) return "high";
    if (ihmTechCount === 1 || jsAjaxHits >= 2) return "medium";
    return "low";
  }

  private getIHMTriggers(input: {
    technologiesDetected: TechnologyType[];
    sourceFiles?: Array<{ path: string; content: string }>;
  }): string[] {
    const triggers: string[] = input.technologiesDetected.filter(t => IHM_TECHNOLOGIES.includes(t)) as string[];
    // v10.8c: Add JS framework triggers
    if (input.sourceFiles) {
      const allContent = input.sourceFiles
        .filter(f => /\.(jsp|jspx|js|html|htm|xhtml)$/i.test(f.path))
        .map(f => f.content)
        .join("\n");
      for (const detector of JS_FRAMEWORK_DETECTORS) {
        if (detector.patterns.some(p => p.test(allContent))) {
          triggers.push(detector.name);
        }
      }
    }
    return triggers.length > 0 ? triggers : ["ihm_detected"];
  }

  // --- Domain Detection ---

  private detectDomain(input: {
    aiInsights?: AIAnalysisInsights | null;
    classNames?: string[];
    detectedComponents: Array<{ type: string; className?: string }>;
    sourceFiles?: Array<{ path: string; content: string }>;
  }): DetectedDomain {
    const scores: Record<IndustryStandard, { score: number; indicators: string[] }> = {
      BIAN: { score: 0, indicators: [] },
      ACORD: { score: 0, indicators: [] },
      HL7_FHIR: { score: 0, indicators: [] },
      TMFORUM: { score: 0, indicators: [] },
      DDD: { score: 0, indicators: [] },
      TOGAF: { score: 0, indicators: [] },
      NONE: { score: 0, indicators: [] },
    };

    // Source 1: AI insights domain analysis (highest weight)
    if (input.aiInsights?.domainInsights) {
      for (const domain of input.aiInsights.domainInsights) {
        const domainLower = domain.domain.toLowerCase();
        const labelLower = domain.label.toLowerCase();
        const combined = `${domainLower} ${labelLower} ${domain.businessRole.toLowerCase()}`;

        for (const [standard, config] of Object.entries(DOMAIN_INDICATORS)) {
          if (standard === "NONE") continue;
          const matchCount = config.keywords.filter(k => combined.includes(k)).length;
          if (matchCount > 0) {
            scores[standard as IndustryStandard].score += matchCount * 3; // AI insights get 3x weight
            scores[standard as IndustryStandard].indicators.push(`AI: ${domain.label} (${matchCount} keywords)`);
          }
        }
      }
    }

    // Source 2: Class names from analysis
    const allClassNames = [
      ...(input.classNames || []),
      ...input.detectedComponents.map(c => c.className || "").filter(Boolean),
    ];

    for (const className of allClassNames) {
      for (const [standard, config] of Object.entries(DOMAIN_INDICATORS)) {
        if (standard === "NONE") continue;
        for (const pattern of config.classPatterns) {
          if (pattern.test(className)) {
            scores[standard as IndustryStandard].score += 2;
            scores[standard as IndustryStandard].indicators.push(`Class: ${className}`);
          }
        }
      }
    }

    // Source 3: Source file content (keyword frequency)
    if (input.sourceFiles) {
      const allContent = input.sourceFiles.map(f => f.content).join(" ").toLowerCase();
      for (const [standard, config] of Object.entries(DOMAIN_INDICATORS)) {
        if (standard === "NONE") continue;
        let keywordHits = 0;
        for (const keyword of config.keywords) {
          const regex = new RegExp(`\\b${keyword}\\b`, "gi");
          const matches = allContent.match(regex);
          if (matches) {
            keywordHits += matches.length;
          }
        }
        if (keywordHits > 5) {
          scores[standard as IndustryStandard].score += Math.min(keywordHits, 20);
          scores[standard as IndustryStandard].indicators.push(`Keywords: ${keywordHits} occurrences`);
        }
      }
    }

    // Find the highest scoring domain
    let bestStandard: IndustryStandard = "NONE";
    let bestScore = 0;
    for (const [standard, data] of Object.entries(scores)) {
      if (standard === "NONE") continue;
      if (data.score > bestScore) {
        bestScore = data.score;
        bestStandard = standard as IndustryStandard;
      }
    }

    // Determine confidence
    let confidence: "high" | "medium" | "low" = "low";
    if (bestScore >= 15) confidence = "high";
    else if (bestScore >= 8) confidence = "medium";

    if (bestScore < 3) {
      bestStandard = "NONE";
    }

    return {
      primary: bestStandard,
      confidence,
      indicators: scores[bestStandard]?.indicators || [],
      label: DOMAIN_INDICATORS[bestStandard]?.label || "Generique",
    };
  }

  // --- Distributed Transactions Detection ---

  private detectDistributedTransactions(input: {
    sourceFiles?: Array<{ path: string; content: string }>;
    aiInsights?: AIAnalysisInsights | null;
    detectedComponents: Array<{ type: string; className?: string }>;
  }): boolean {
    // Check source files for distributed transaction patterns
    if (input.sourceFiles) {
      for (const file of input.sourceFiles) {
        for (const pattern of DISTRIBUTED_TX_PATTERNS) {
          if (pattern.test(file.content)) return true;
        }
      }
    }

    // Check AI insights for saga candidates
    if (input.aiInsights?.migrationStrategy) {
      const hasSagaMention = input.aiInsights.migrationStrategy.some(step =>
        step.description.toLowerCase().includes("saga") ||
        step.description.toLowerCase().includes("transaction distribu")
      );
      if (hasSagaMention) return true;
    }

    return false;
  }

  private getDistributedTxTriggers(input: {
    sourceFiles?: Array<{ path: string; content: string }>;
  }): string[] {
    const triggers: string[] = [];
    if (input.sourceFiles) {
      for (const file of input.sourceFiles) {
        if (/UserTransaction/.test(file.content)) triggers.push("UserTransaction");
        if (/XAResource/.test(file.content)) triggers.push("XAResource");
        if (/@TransactionAttribute.*REQUIRES_NEW/.test(file.content)) triggers.push("REQUIRES_NEW");
      }
    }
    return triggers.length > 0 ? triggers : ["distributed_tx_detected"];
  }

  // --- Bounded Contexts Detection ---

  private detectBoundedContexts(input: {
    aiInsights?: AIAnalysisInsights | null;
    domainCount?: number;
    detectedComponents: Array<{ type: string; className?: string }>;
  }): boolean {
    // Check AI insights for multiple domains
    if (input.aiInsights?.domainInsights && input.aiInsights.domainInsights.length >= 2) {
      return true;
    }

    // Check domain count
    if (input.domainCount && input.domainCount >= 2) {
      return true;
    }

    // Heuristic: if many different component types, likely multiple contexts
    const uniqueTypes = new Set(input.detectedComponents.map(c => c.type));
    if (uniqueTypes.size >= 5) return true;

    return false;
  }

  // --- Industry Standard Option Builder ---

  private buildIndustryStandardOption(domain: DetectedDomain): DynamicOption | null {
    switch (domain.primary) {
      case "BIAN":
        return {
          id: "bian_mapping",
          label: "Mapping BIAN (Banking)",
          description: `Domaine bancaire detecte (${domain.confidence}). Alignement des services sur le referentiel BIAN v12.`,
          category: "standard",
          defaultEnabled: true,
          confidence: domain.confidence,
          icon: "Building2",
          color: "blue",
          triggeredBy: domain.indicators.slice(0, 3),
        };
      case "ACORD":
        return {
          id: "acord_mapping",
          label: "Mapping ACORD (Assurance)",
          description: `Domaine assurance detecte (${domain.confidence}). Alignement sur le standard ACORD.`,
          category: "standard",
          defaultEnabled: true,
          confidence: domain.confidence,
          icon: "Shield",
          color: "green",
          triggeredBy: domain.indicators.slice(0, 3),
        };
      case "HL7_FHIR":
        return {
          id: "hl7_mapping",
          label: "Mapping HL7/FHIR (Sante)",
          description: `Domaine sante detecte (${domain.confidence}). Alignement sur les standards HL7 FHIR.`,
          category: "standard",
          defaultEnabled: true,
          confidence: domain.confidence,
          icon: "Heart",
          color: "red",
          triggeredBy: domain.indicators.slice(0, 3),
        };
      case "TMFORUM":
        return {
          id: "tmforum_mapping",
          label: "Mapping TMForum/eTOM (Telecom)",
          description: `Domaine telecom detecte (${domain.confidence}). Alignement sur le referentiel TMForum.`,
          category: "standard",
          defaultEnabled: true,
          confidence: domain.confidence,
          icon: "Wifi",
          color: "purple",
          triggeredBy: domain.indicators.slice(0, 3),
        };
      case "DDD":
        return {
          id: "ddd_mapping",
          label: "Mapping DDD (E-Commerce)",
          description: `Domaine e-commerce detecte (${domain.confidence}). Structuration DDD avec aggregats et bounded contexts.`,
          category: "standard",
          defaultEnabled: true,
          confidence: domain.confidence,
          icon: "ShoppingCart",
          color: "orange",
          triggeredBy: domain.indicators.slice(0, 3),
        };
      case "TOGAF":
        return {
          id: "togaf_mapping",
          label: "Architecture TOGAF (Enterprise)",
          description: `Architecture enterprise detectee (${domain.confidence}). Alignement sur le framework TOGAF.`,
          category: "standard",
          defaultEnabled: true,
          confidence: domain.confidence,
          icon: "Building",
          color: "slate",
          triggeredBy: domain.indicators.slice(0, 3),
        };
      default:
        return null;
    }
  }

  // --- Summary Builder ---

  private buildDetectionSummary(
    hasIHM: boolean,
    domain: DetectedDomain,
    hasDistributedTx: boolean,
    hasBoundedContexts: boolean,
    input: { technologiesDetected: TechnologyType[] },
  ): string {
    const parts: string[] = [];

    parts.push(`Technologies detectees : ${input.technologiesDetected.join(", ")}`);

    if (hasIHM) {
      parts.push("Couche IHM legacy detectee (JSP/Struts/Servlet) - generation frontend proposee");
    }

    if (domain.primary !== "NONE") {
      parts.push(`Domaine metier : ${domain.label} (confiance: ${domain.confidence})`);
    }

    if (hasBoundedContexts) {
      parts.push("Plusieurs bounded contexts identifies - decoupage microservices propose");
    }

    if (hasDistributedTx) {
      parts.push("Transactions distribuees detectees - saga orchestration proposee");
    }

    return parts.join(". ");
  }
}
