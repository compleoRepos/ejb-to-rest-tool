/**
 * RuleInferrer — Déduit des règles d'apprentissage depuis les choix utilisateur.
 *
 * Pour chaque choix résolu, le RuleInferrer :
 *   1. Extrait les patterns du contexte de l'ambiguïté
 *   2. Génère N règles généralisables (une par combinaison de patterns)
 *   3. Persiste les règles en DB via RuleStore
 *
 * Niveaux de confiance initiale :
 *   - Pattern fort (className + methodName + annotations) : 0.80
 *   - Pattern moyen (package + returnType + paramTypes)   : 0.65
 *   - Pattern faible (javadoc seul)                       : 0.40
 *
 * @author Hamza NORDINE
 */

import type { Ambiguity, AmbiguityContext, UserChoice } from "../ambiguity-detector";
import type { InsertLearningRule } from "../../drizzle/schema";
import { RuleStore } from "./RuleStore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InferenceContext {
  className: string;
  methodName?: string;
  packageName?: string;
  javadoc?: string;
  annotations?: string[];
  returnType?: string;
  paramTypes?: string[];
}

export interface InferenceInput {
  ambiguity: Ambiguity;
  chosenOptionId: string;
  chosenReason?: string;
  tenantId: string;
  sourceProject: string;
  sourceSessionId: string;
}

export interface InferredRule {
  ruleType: string;
  patterns: Record<string, string>;
  chosenOption: string;
  confidence: number;
  description: string;
}

// ─── Pattern Extraction ─────────────────────────────────────────────────────

/**
 * Extrait un pattern regex généralisable depuis un nom de classe.
 * Ex: "TraiterDemandeUC" → ".*UC$"
 *     "GetCarteAction" → ".*Action$"
 */
function extractClassNamePattern(className: string): string | null {
  // Suffixes courants dans les projets Java legacy
  const suffixes = [
    "UC", "UseCase", "Action", "Bean", "Service", "Facade",
    "Handler", "Processor", "Manager", "Controller", "Servlet",
    "Listener", "Producer", "Consumer", "Reader", "Writer",
    "Validator", "Adapter", "Proxy", "Delegate", "Helper",
  ];

  for (const suffix of suffixes) {
    if (className.endsWith(suffix)) {
      return `.*${suffix}$`;
    }
  }

  // Prefixes courants
  const prefixes = [
    "Get", "Find", "List", "Create", "Update", "Delete",
    "Traiter", "Valider", "Activer", "Bloquer", "Consulter",
    "Rechercher", "Modifier", "Supprimer", "Creer", "Envoyer",
    "Process", "Execute", "Handle", "Manage",
  ];

  for (const prefix of prefixes) {
    if (className.startsWith(prefix)) {
      return `^${prefix}.*`;
    }
  }

  return null;
}

/**
 * Extrait un pattern depuis un nom de méthode.
 * Ex: "execute" → "^execute$"
 *     "getCarteDetails" → "^get.*"
 */
function extractMethodNamePattern(methodName: string): string | null {
  if (!methodName) return null;

  // Méthodes exactes courantes
  const exactMethods = ["execute", "doGet", "doPost", "doPut", "doDelete", "onMessage", "process"];
  if (exactMethods.includes(methodName)) {
    return `^${methodName}$`;
  }

  // Préfixes de méthode
  const prefixMap: Record<string, string> = {
    get: "^get.*",
    find: "^find.*",
    list: "^list.*",
    search: "^search.*",
    create: "^create.*",
    save: "^save.*",
    update: "^update.*",
    delete: "^delete.*",
    remove: "^remove.*",
    traiter: "^traiter.*",
    valider: "^valider.*",
    activer: "^activer.*",
    bloquer: "^bloquer.*",
    consulter: "^consulter.*",
    modifier: "^modifier.*",
    supprimer: "^supprimer.*",
    creer: "^creer.*",
    envoyer: "^envoyer.*",
  };

  const lowerMethod = methodName.toLowerCase();
  for (const [prefix, pattern] of Object.entries(prefixMap)) {
    if (lowerMethod.startsWith(prefix)) {
      return pattern;
    }
  }

  return null;
}

/**
 * Extrait un pattern depuis un nom de package.
 * Ex: "ma.eai.boa.xbanking.credit.usecases" → ".*usecases.*"
 */
function extractPackagePattern(packageName: string): string | null {
  if (!packageName) return null;

  const keywords = [
    "usecases", "usecase", "services", "service",
    "controllers", "controller", "actions", "action",
    "handlers", "handler", "facades", "facade",
    "ejb", "beans", "jms", "batch", "soap", "rest",
    "domain", "business", "core", "api",
  ];

  for (const kw of keywords) {
    if (packageName.toLowerCase().includes(kw)) {
      return `.*${kw}.*`;
    }
  }

  return null;
}

/**
 * Extrait des mots-clés significatifs depuis la javadoc.
 * Ex: "Traite une demande de crédit immobilier" → "traite|demande|crédit"
 */
function extractJavadocPattern(javadoc: string): string | null {
  if (!javadoc || javadoc.length < 5) return null;

  // Mots-clés d'action significatifs
  const actionWords = [
    "traite", "valide", "active", "bloque", "consulte", "recherche",
    "modifie", "supprime", "crée", "envoie", "récupère", "liste",
    "process", "validate", "create", "update", "delete", "get",
    "find", "search", "send", "receive", "handle", "manage",
  ];

  const lowerDoc = javadoc.toLowerCase();
  const found = actionWords.filter(w => lowerDoc.includes(w));

  if (found.length > 0) {
    return found.join("|");
  }

  return null;
}

/**
 * Extrait un pattern depuis les annotations.
 * Ex: ["@UseCase", "@Transactional"] → "@UseCase"
 */
function extractAnnotationsPattern(annotations: string[]): string | null {
  if (!annotations || annotations.length === 0) return null;

  // Annotations significatives pour le type d'ambiguïté
  const significant = [
    "@UseCase", "@Stateless", "@Stateful", "@Singleton",
    "@MessageDriven", "@WebService", "@WebMethod",
    "@Path", "@GET", "@POST", "@PUT", "@DELETE",
    "@WebServlet", "@BatchProperty",
  ];

  const found = annotations.filter(a =>
    significant.some(s => a.includes(s.replace("@", "")))
  );

  if (found.length > 0) {
    return found.join(",");
  }

  return null;
}

/**
 * Extrait un pattern depuis le type de retour.
 * Ex: "TraiterDemandeVoOut" → ".*VoOut$"
 */
function extractReturnTypePattern(returnType: string): string | null {
  if (!returnType) return null;

  const suffixes = [
    "VoOut", "Response", "Result", "DTO", "Dto",
    "Output", "Reply", "Message",
  ];

  for (const suffix of suffixes) {
    if (returnType.endsWith(suffix)) {
      return `.*${suffix}$`;
    }
  }

  // Types génériques
  if (returnType.startsWith("List<") || returnType.startsWith("Collection<")) {
    return "^(List|Collection)<.*>$";
  }

  return null;
}

/**
 * Extrait un pattern depuis les types de paramètres.
 * Ex: ["TraiterDemandeVoIn"] → ".*VoIn$"
 */
function extractParamTypesPattern(paramTypes: string[]): string | null {
  if (!paramTypes || paramTypes.length === 0) return null;

  const suffixes = [
    "VoIn", "Request", "Input", "DTO", "Dto",
    "Command", "Query", "Message",
  ];

  for (const param of paramTypes) {
    for (const suffix of suffixes) {
      if (param.endsWith(suffix)) {
        return `.*${suffix}$`;
      }
    }
  }

  return null;
}

// ─── Rule Generation ────────────────────────────────────────────────────────

/**
 * Construit le contexte d'inférence depuis une Ambiguity.
 * Enrichit le contexte avec les informations disponibles.
 */
export function buildInferenceContext(ambiguity: Ambiguity): InferenceContext {
  const ctx = ambiguity.context;
  return {
    className: ctx.className || "",
    methodName: ctx.methodName,
    packageName: ctx.packageName,
    javadoc: ctx.javadoc,
    annotations: ctx.relatedClasses, // annotations are stored in relatedClasses for some types
    returnType: undefined, // will be enriched from IR if available
    paramTypes: undefined,
  };
}

/**
 * Génère les règles inférées depuis un choix utilisateur.
 * Retourne 1 à 3 règles avec des niveaux de confiance différents.
 */
export function inferRules(input: InferenceInput): InferredRule[] {
  const rules: InferredRule[] = [];
  const ctx = buildInferenceContext(input.ambiguity);
  const chosenOption = input.chosenOptionId;
  const ruleType = input.ambiguity.type;

  // ─── Règle 1 : Pattern fort (className + methodName + annotations) ────
  const classPattern = extractClassNamePattern(ctx.className);
  const methodPattern = extractMethodNamePattern(ctx.methodName || "");
  const annotPattern = extractAnnotationsPattern(ctx.annotations || []);

  if (classPattern || methodPattern || annotPattern) {
    const patterns: Record<string, string> = {};
    const parts: string[] = [];

    if (classPattern) {
      patterns.patternClassName = classPattern;
      parts.push(`classe ${classPattern}`);
    }
    if (methodPattern) {
      patterns.patternMethodName = methodPattern;
      parts.push(`méthode ${methodPattern}`);
    }
    if (annotPattern) {
      patterns.patternAnnotations = annotPattern;
      parts.push(`annotations ${annotPattern}`);
    }

    // Confiance basée sur le nombre de patterns
    const patternCount = Object.keys(patterns).length;
    const confidence = patternCount >= 3 ? 0.80 : patternCount >= 2 ? 0.70 : 0.60;

    rules.push({
      ruleType,
      patterns,
      chosenOption,
      confidence,
      description: `${parts.join(" + ")} → ${chosenOption}`,
    });
  }

  // ─── Règle 2 : Pattern moyen (package + returnType + paramTypes) ──────
  const pkgPattern = extractPackagePattern(ctx.packageName || "");
  const retPattern = extractReturnTypePattern(ctx.returnType || "");
  const paramPattern = extractParamTypesPattern(ctx.paramTypes || []);

  if (pkgPattern || retPattern || paramPattern) {
    const patterns: Record<string, string> = {};
    const parts: string[] = [];

    if (pkgPattern) {
      patterns.patternPackage = pkgPattern;
      parts.push(`package ${pkgPattern}`);
    }
    if (retPattern) {
      patterns.patternReturnType = retPattern;
      parts.push(`retour ${retPattern}`);
    }
    if (paramPattern) {
      patterns.patternParamTypes = paramPattern;
      parts.push(`params ${paramPattern}`);
    }

    const patternCount = Object.keys(patterns).length;
    const confidence = patternCount >= 2 ? 0.65 : 0.55;

    // Avoid duplicate if same patterns as rule 1
    const isDuplicate = rules.some(r =>
      JSON.stringify(r.patterns) === JSON.stringify(patterns)
    );

    if (!isDuplicate) {
      rules.push({
        ruleType,
        patterns,
        chosenOption,
        confidence,
        description: `${parts.join(" + ")} → ${chosenOption}`,
      });
    }
  }

  // ─── Règle 3 : Pattern faible (javadoc seul) ─────────────────────────
  const javadocPattern = extractJavadocPattern(ctx.javadoc || "");
  if (javadocPattern) {
    rules.push({
      ruleType,
      patterns: { patternJavadoc: javadocPattern },
      chosenOption,
      confidence: 0.40,
      description: `javadoc contient "${javadocPattern}" → ${chosenOption}`,
    });
  }

  return rules;
}

// ─── RuleInferrer Class ─────────────────────────────────────────────────────

export class RuleInferrer {
  private store: RuleStore;

  constructor(store?: RuleStore) {
    this.store = store || new RuleStore();
  }

  /**
   * Traite un ensemble de choix utilisateur et crée les règles correspondantes.
   * Retourne le nombre de règles créées.
   */
  async processChoices(
    ambiguities: Ambiguity[],
    choices: UserChoice[],
    tenantId: string,
    sourceProject: string,
    sourceSessionId: string
  ): Promise<{ rulesCreated: number; rules: InferredRule[] }> {
    const allInferred: InferredRule[] = [];
    const toInsert: InsertLearningRule[] = [];

    for (const choice of choices) {
      const ambiguity = ambiguities.find(a => a.id === choice.ambiguityId);
      if (!ambiguity) continue;

      const input: InferenceInput = {
        ambiguity,
        chosenOptionId: choice.choiceId,
        tenantId,
        sourceProject,
        sourceSessionId,
      };

      const inferred = inferRules(input);
      allInferred.push(...inferred);

      for (const rule of inferred) {
        // Guard: skip rules without a valid chosenOption to avoid DB insert errors
        if (!rule.chosenOption) continue;
        toInsert.push({
          tenantId,
          ruleType: rule.ruleType,
          patternClassName: rule.patterns.patternClassName || null,
          patternMethodName: rule.patterns.patternMethodName || null,
          patternPackage: rule.patterns.patternPackage || null,
          patternJavadoc: rule.patterns.patternJavadoc || null,
          patternAnnotations: rule.patterns.patternAnnotations || null,
          patternReturnType: rule.patterns.patternReturnType || null,
          patternParamTypes: rule.patterns.patternParamTypes || null,
          chosenOption: rule.chosenOption,
          chosenReason: input.chosenReason || null,
          confidence: rule.confidence,
          occurrenceCount: 1,
          isActive: true,
          sourceProject,
          sourceSessionId,
          confirmedByUser: true,
        });
      }
    }

    if (toInsert.length > 0) {
      await this.store.insertBatch(toInsert);
    }

    return {
      rulesCreated: toInsert.length,
      rules: allInferred,
    };
  }
}
