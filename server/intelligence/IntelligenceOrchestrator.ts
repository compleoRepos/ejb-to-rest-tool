/**
 * IntelligenceOrchestrator — Orchestre le pipeline complet d'intelligence.
 * Coordonne : SemanticAnalyzer → KnowledgeBase → IntelligenceScorer → ReportBuilder.
 * 100% déterministe, 0 LLM.
 *
 * @author Hamza NORDINE
 */

import { SemanticAnalyzer, type RoleInference, type ClassContext } from "./semantic/SemanticAnalyzer";
import { DomainInferrer, type DomainInference, type ClassDomainContext } from "./semantic/DomainInferrer";
import { IntentInferrer, type IntentInference, type MethodIntentContext } from "./semantic/IntentInferrer";
import { DataProfiler, type DataProfile, type FieldContext } from "./semantic/DataProfiler";
import { KnowledgeBase } from "./knowledge/KnowledgeBase";
import type { RuleContext, RuleHit } from "./knowledge/rules/RuleEngine";
import { IntelligenceScorer, type IntelligenceScore } from "./scoring/IntelligenceScorer";

// ── Types ──────────────────────────────────────────────────────

export interface JavaFileInput {
  path: string;
  content: string;
  className: string;
}

/** Parsed class data used internally */
interface ParsedClass {
  className: string;
  packageName: string;
  imports: string[];
  annotations: string[];
  modifiers: string[];
  extendsClass?: string;
  implementsInterfaces: string[];
  isEnum: boolean;
  fields: { name: string; type: string; annotations: string[]; modifiers: string[]; line: number }[];
  methods: {
    name: string;
    returnType: string;
    parameters: { name: string; type: string }[];
    annotations: string[];
    modifiers: string[];
    body: string;
    line: number;
    callsExternal: string[];
    javadoc?: string;
  }[];
  injectedBeans: string[];
}

export interface IntelligenceReport {
  timestamp: string;
  durationMs: number;
  score: IntelligenceScore;
  roles: Record<string, RoleInference>;
  domainAnalyses: Record<string, DomainInference>;
  intents: Record<string, IntentInference>;
  dataProfiles: DataProfile[];
  hits: RuleHit[];
  hitsByCategory: Record<string, RuleHit[]>;
  hitsBySeverity: Record<string, RuleHit[]>;
  topViolations: RuleHit[];
  knowledgeBaseStats: { totalRules: number; byCategory: Record<string, number> };
  filesAnalyzed: number;
  classesAnalyzed: number;
  domainAnalysis: { primaryDomain: string; confidence: number; subDomains: string[] };
}

// ── Simple Java parser ─────────────────────────────────────────

function parseJavaFile(content: string, className: string): ParsedClass {
  const lines = content.split("\n");

  // Package
  const pkgMatch = content.match(/package\s+([\w.]+)\s*;/);
  const packageName = pkgMatch ? pkgMatch[1] : "";

  // Imports
  const imports = (content.match(/import\s+([\w.*]+)\s*;/g) || []).map((m) =>
    m.replace(/import\s+/, "").replace(/\s*;/, "")
  );

  // Class-level annotations
  const classAnnotations: string[] = [];
  const classLineMatch = content.match(/((?:@\w+(?:\([^)]*\))?\s*\n?\s*)*)(public\s+)?(abstract\s+)?(class|interface|enum)\s+/);
  if (classLineMatch) {
    const annoBlock = classLineMatch[1] || "";
    const annos = annoBlock.match(/@\w+(?:\([^)]*\))?/g);
    if (annos) classAnnotations.push(...annos);
  }

  const isEnum = /\benum\s+/.test(content);
  const extendsMatch = content.match(/extends\s+([\w<>]+)/);
  const implMatch = content.match(/implements\s+([\w<>,\s]+)/);
  const implementsInterfaces = implMatch
    ? implMatch[1].split(",").map((s) => s.trim())
    : [];

  // Modifiers
  const modifiers: string[] = [];
  if (/\bpublic\s+(abstract\s+)?class/.test(content)) modifiers.push("public");
  if (/\babstract\s+class/.test(content)) modifiers.push("abstract");

  // Fields
  const fields: ParsedClass["fields"] = [];
  const fieldRegex = /(?:(@\w+(?:\([^)]*\))?)\s+)*(?:(private|protected|public)\s+)?(?:(static)\s+)?(?:(final)\s+)?([\w<>\[\],\s]+?)\s+(\w+)\s*[;=]/g;
  let fm;
  while ((fm = fieldRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, fm.index).split("\n").length;
    const fieldAnnotations: string[] = [];
    // Look back for annotations
    const before = content.substring(Math.max(0, fm.index - 200), fm.index);
    const annos = before.match(/@\w+(?:\([^)]*\))?/g);
    if (annos) fieldAnnotations.push(...annos);

    const fieldModifiers: string[] = [];
    if (fm[2]) fieldModifiers.push(fm[2]);
    if (fm[3]) fieldModifiers.push(fm[3]);
    if (fm[4]) fieldModifiers.push(fm[4]);

    fields.push({
      name: fm[6],
      type: fm[5].trim(),
      annotations: fieldAnnotations,
      modifiers: fieldModifiers,
      line: lineNum,
    });
  }

  // Methods (simplified)
  const methods: ParsedClass["methods"] = [];
  const methodRegex = /(?:(@\w+(?:\([^)]*\))?)\s+)*(?:(public|private|protected)\s+)?(?:(static)\s+)?(?:(synchronized)\s+)?([\w<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
  let mm;
  while ((mm = methodRegex.exec(content)) !== null) {
    const methodName = mm[6];
    if (methodName === className || methodName === "if" || methodName === "for" || methodName === "while" || methodName === "switch" || methodName === "catch") continue;

    const lineNum = content.substring(0, mm.index).split("\n").length;
    const methodAnnotations: string[] = [];
    const before = content.substring(Math.max(0, mm.index - 300), mm.index);
    const annos = before.match(/@\w+(?:\([^)]*\))?/g);
    if (annos) methodAnnotations.push(...annos);

    const methodModifiers: string[] = [];
    if (mm[2]) methodModifiers.push(mm[2]);
    if (mm[3]) methodModifiers.push(mm[3]);

    // Parse parameters
    const paramStr = mm[7] || "";
    const parameters = paramStr
      .split(",")
      .filter((p) => p.trim())
      .map((p) => {
        const parts = p.trim().split(/\s+/);
        return { name: parts[parts.length - 1] || "", type: parts.slice(0, -1).join(" ") || "Object" };
      });

    // Extract method body (simplified — find matching brace)
    let braceCount = 1;
    let bodyStart = mm.index + mm[0].length;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < content.length && braceCount > 0; i++) {
      if (content[i] === "{") braceCount++;
      if (content[i] === "}") braceCount--;
      bodyEnd = i;
    }
    const body = content.substring(bodyStart, bodyEnd);

    // External calls
    const callsExternal: string[] = [];
    const callMatches = body.match(/(\w+)\.\w+\s*\(/g);
    if (callMatches) {
      for (const c of callMatches) {
        const obj = c.split(".")[0];
        if (!["this", "super", "System", "Math", "String", "Integer", "Long", "Boolean"].includes(obj)) {
          callsExternal.push(obj);
        }
      }
    }

    methods.push({
      name: methodName,
      returnType: mm[5],
      parameters,
      annotations: methodAnnotations,
      modifiers: methodModifiers,
      body,
      line: lineNum,
      callsExternal: [...new Set(callsExternal)],
    });
  }

  // Injected beans
  const injectedBeans = fields
    .filter((f) => f.annotations.some((a) => /@(EJB|Inject|Autowired|Resource)/.test(a)))
    .map((f) => f.type);

  return {
    className,
    packageName,
    imports,
    annotations: classAnnotations,
    modifiers,
    extendsClass: extendsMatch ? extendsMatch[1] : undefined,
    implementsInterfaces,
    isEnum,
    fields,
    methods,
    injectedBeans,
  };
}

// ── Orchestrator ───────────────────────────────────────────────

export class IntelligenceOrchestrator {
  private semanticAnalyzer = new SemanticAnalyzer();
  private domainInferrer = new DomainInferrer();
  private intentInferrer = new IntentInferrer();
  private dataProfiler = new DataProfiler();
  private knowledgeBase = new KnowledgeBase();
  private scorer = new IntelligenceScorer();

  /**
   * Exécute l'analyse complète sur un ensemble de fichiers Java.
   */
  analyze(files: JavaFileInput[]): IntelligenceReport {
    const startTime = Date.now();

    // 0. Parse all Java files
    const parsedClasses = files.map((f) => parseJavaFile(f.content, f.className));

    // 1. Analyse sémantique — inférence de rôle
    const roles: Record<string, RoleInference> = {};
    for (const pc of parsedClasses) {
      const ctx: ClassContext = {
        className: pc.className,
        packageName: pc.packageName,
        imports: pc.imports,
        annotations: pc.annotations,
        extendsClass: pc.extendsClass,
        implementsInterfaces: pc.implementsInterfaces,
        isEnum: pc.isEnum,
        fields: pc.fields.map((f) => ({ name: f.name, type: f.type, annotations: f.annotations })),
        methods: pc.methods.map((m) => ({
          name: m.name,
          returnType: m.returnType,
          parameters: m.parameters,
          annotations: m.annotations,
          body: m.body,
          callsExternal: m.callsExternal,
        })),
        injectedBeans: pc.injectedBeans,
      };
      roles[pc.className] = this.semanticAnalyzer.inferRole(ctx);
    }

    // 2. Analyse du domaine
    const domainAnalyses: Record<string, DomainInference> = {};
    let primaryDomain = "UNKNOWN";
    let primaryConfidence = 0;
    const allSubDomains = new Set<string>();

    for (const pc of parsedClasses) {
      const ctx: ClassDomainContext = {
        className: pc.className,
        packageName: pc.packageName,
        fieldNames: pc.fields.map((f) => f.name),
        methodNames: pc.methods.map((m) => m.name),
        body: files.find((f) => f.className === pc.className)?.content || "",
        javadoc: "",
        imports: pc.imports,
      };
      const di = this.domainInferrer.inferDomain(ctx);
      domainAnalyses[pc.className] = di;

      if (di.confidence > primaryConfidence) {
        primaryDomain = di.domain;
        primaryConfidence = di.confidence;
      }
      // Add secondary domains with decent scores as sub-domains
      for (const [dom, sc] of Object.entries(di.scores)) {
        if (sc > 0.3 && dom !== di.domain) allSubDomains.add(dom);
      }
    }

    // 3. Inférence des intentions
    const intents: Record<string, IntentInference> = {};
    for (const pc of parsedClasses) {
      for (const m of pc.methods) {
        const ctx: MethodIntentContext = {
          methodName: m.name,
          returnType: m.returnType,
          parameters: m.parameters,
          annotations: m.annotations,
          body: m.body,
          javadoc: m.javadoc || "",
          className: pc.className,
        };
        const key = `${pc.className}.${m.name}`;
        intents[key] = this.intentInferrer.inferIntent(ctx);
      }
    }

    // 4. Profils de données
    const dataProfiles: DataProfile[] = [];
    for (const pc of parsedClasses) {
      if (pc.fields.length > 0) {
        const fieldContexts: FieldContext[] = pc.fields.map((f) => ({
          name: f.name,
          type: f.type,
          annotations: f.annotations,
          modifiers: f.modifiers,
        }));
        const profile = this.dataProfiler.profileClass(pc.className, fieldContexts);
        dataProfiles.push(profile);
      }
    }

    // 5. Évaluation des règles
    const allHits: RuleHit[] = [];
    for (const pc of parsedClasses) {
      const fileContent = files.find((f) => f.className === pc.className)?.content || "";
      const ruleCtx: RuleContext = {
        className: pc.className,
        classType: pc.isEnum ? "ENUM" : pc.modifiers.includes("abstract") ? "ABSTRACT" : "CLASS",
        packageName: pc.packageName,
        imports: pc.imports,
        annotations: pc.annotations,
        modifiers: pc.modifiers,
        extendsClass: pc.extendsClass,
        extends: pc.extendsClass,
        implementsInterfaces: pc.implementsInterfaces,
        implements: pc.implementsInterfaces,
        isEnum: pc.isEnum,
        fields: pc.fields,
        methods: pc.methods.map(m => ({ ...m, callsExternal: m.callsExternal || [] })),
        injectedBeans: pc.injectedBeans,
        sourceCode: fileContent,
        rawSource: fileContent,
      };
      const hits = this.knowledgeBase.evaluate(ruleCtx);
      allHits.push(...hits);
    }

    // 6. Scoring
    const score = this.scorer.computeScore(allHits, parsedClasses.length);

    // 7. Groupements
    const hitsByCategory: Record<string, RuleHit[]> = {};
    const hitsBySeverity: Record<string, RuleHit[]> = {};
    for (const hit of allHits) {
      const cat = hit.category || "UNKNOWN";
      const sev = hit.severity || "LOW";
      if (!hitsByCategory[cat]) hitsByCategory[cat] = [];
      hitsByCategory[cat].push(hit);
      if (!hitsBySeverity[sev]) hitsBySeverity[sev] = [];
      hitsBySeverity[sev].push(hit);
    }

    // 8. Top 10 violations
    const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const topViolations = [...allHits]
      .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
      .slice(0, 10);

    const durationMs = Date.now() - startTime;

    return {
      timestamp: new Date().toISOString(),
      durationMs,
      score,
      roles,
      domainAnalyses,
      intents,
      dataProfiles,
      hits: allHits,
      hitsByCategory,
      hitsBySeverity,
      topViolations,
      knowledgeBaseStats: this.knowledgeBase.getStats(),
      filesAnalyzed: files.length,
      classesAnalyzed: parsedClasses.length,
      domainAnalysis: {
        primaryDomain,
        confidence: primaryConfidence,
        subDomains: [...allSubDomains],
      },
    };
  }

  getKnowledgeBaseStats() {
    return this.knowledgeBase.getStats();
  }

  getKnowledgeBase(): KnowledgeBase {
    return this.knowledgeBase;
  }
}
