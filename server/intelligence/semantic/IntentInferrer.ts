/**
 * IntentInferrer — Infère l'intention d'une méthode Java.
 * Détermine le verbe HTTP, le niveau de sensibilité, et la pagination.
 * 100% déterministe, 0 LLM.
 *
 * @author Hamza NORDINE
 */

export type HttpVerb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type SensitivityLevel = "PUBLIC" | "INTERNAL" | "SENSITIVE" | "CRITICAL";

export interface IntentInference {
  httpVerb: HttpVerb;
  verbConfidence: number;
  verbReason: string;
  sensitivity: SensitivityLevel;
  sensitivityReason: string;
  isPaginated: boolean;
  paginationReason: string;
  isIdempotent: boolean;
  isReadOnly: boolean;
  suggestedUrlSegment: string;
}

export interface MethodIntentContext {
  methodName: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  annotations: string[];
  body: string;
  javadoc: string;
  className: string;
}

// ── Verbe HTTP ─────────────────────────────────────────────────

interface VerbPattern {
  verb: HttpVerb;
  confidence: number;
  patterns: RegExp[];
}

const VERB_PATTERNS: VerbPattern[] = [
  {
    verb: "GET",
    confidence: 0.95,
    patterns: [
      /^(get|find|fetch|load|read|search|list|retrieve|consulter|charger|lister|chercher|obtenir|afficher)/i,
      /^(is|has|exists|check|verify|count)/i,
    ],
  },
  {
    verb: "POST",
    confidence: 0.95,
    patterns: [
      /^(create|add|insert|register|submit|initier|creer|ajouter|enregistrer|inscrire|souscrire|ouvrir|activer|envoyer)/i,
      /^(execute|process|run|launch|lancer|traiter|calculer|simuler)/i,
    ],
  },
  {
    verb: "PUT",
    confidence: 0.90,
    patterns: [
      /^(update|modify|edit|change|replace|modifier|mettre|maj|majClient)/i,
      /^(set|assign|configure|affecter)/i,
    ],
  },
  {
    verb: "PATCH",
    confidence: 0.85,
    patterns: [
      /^(patch|partial|toggle)/i,
      /^(enable|disable|activer|desactiver|bloquer|debloquer)/i,
    ],
  },
  {
    verb: "DELETE",
    confidence: 0.95,
    patterns: [
      /^(delete|remove|destroy|cancel|annuler|supprimer|cloturer|resilier|revoquer)/i,
    ],
  },
];

// ── Annotation-based verb overrides ────────────────────────────

const ANNOTATION_VERB_MAP: Record<string, HttpVerb> = {
  "@GET": "GET",
  "@POST": "POST",
  "@PUT": "PUT",
  "@PATCH": "PATCH",
  "@DELETE": "DELETE",
  "@GetMapping": "GET",
  "@PostMapping": "POST",
  "@PutMapping": "PUT",
  "@PatchMapping": "PATCH",
  "@DeleteMapping": "DELETE",
};

// ── Sensibilité ────────────────────────────────────────────────

interface SensitivityPattern {
  level: SensitivityLevel;
  patterns: RegExp[];
  reason: string;
}

const SENSITIVITY_PATTERNS: SensitivityPattern[] = [
  {
    level: "CRITICAL",
    patterns: [
      /virement|transfer|paiement|payment|debit/i,
      /credit|pret|loan/i,
      /password|motDePasse|pin|codePin|otp/i,
      /signature|signer|valider.*transaction/i,
    ],
    reason: "Opération financière ou authentification critique",
  },
  {
    level: "SENSITIVE",
    patterns: [
      /client|customer|kyc|identite|cin|passport/i,
      /compte|account|solde|balance/i,
      /carte|card|bloquer|opposition/i,
      /contrat|police|sinistre/i,
    ],
    reason: "Données personnelles ou financières",
  },
  {
    level: "INTERNAL",
    patterns: [
      /admin|config|parametre|setting/i,
      /batch|job|scheduler|cron/i,
      /audit|log|trace|historique/i,
    ],
    reason: "Opération interne ou administrative",
  },
  {
    level: "PUBLIC",
    patterns: [
      /public|open|info|status|health/i,
      /version|ping|echo/i,
    ],
    reason: "Information publique",
  },
];

// ── URL segment generation ─────────────────────────────────────

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── IntentInferrer ─────────────────────────────────────────────

export class IntentInferrer {
  /**
   * Infère l'intention complète d'une méthode.
   */
  inferIntent(ctx: MethodIntentContext): IntentInference {
    const verb = this.inferVerb(ctx);
    const sensitivity = this.inferSensitivity(ctx);
    const pagination = this.inferPagination(ctx);

    return {
      ...verb,
      ...sensitivity,
      ...pagination,
      isIdempotent: verb.httpVerb === "GET" || verb.httpVerb === "PUT" || verb.httpVerb === "DELETE",
      isReadOnly: verb.httpVerb === "GET",
      suggestedUrlSegment: this.suggestUrlSegment(ctx),
    };
  }

  private inferVerb(ctx: MethodIntentContext): {
    httpVerb: HttpVerb;
    verbConfidence: number;
    verbReason: string;
  } {
    // 1. Annotation-based (highest priority)
    for (const ann of ctx.annotations) {
      for (const [annPattern, verb] of Object.entries(ANNOTATION_VERB_MAP)) {
        if (ann.includes(annPattern)) {
          return {
            httpVerb: verb,
            verbConfidence: 0.99,
            verbReason: `Annotation ${annPattern}`,
          };
        }
      }
    }

    // 2. Method name pattern
    for (const vp of VERB_PATTERNS) {
      for (const pattern of vp.patterns) {
        if (pattern.test(ctx.methodName)) {
          return {
            httpVerb: vp.verb,
            verbConfidence: vp.confidence,
            verbReason: `Method name "${ctx.methodName}" matches ${vp.verb} pattern`,
          };
        }
      }
    }

    // 3. Return type heuristic
    if (ctx.returnType === "void") {
      return {
        httpVerb: "POST",
        verbConfidence: 0.60,
        verbReason: "void return type suggests mutation (POST)",
      };
    }

    if (/List|Collection|Set|Page|Iterable/.test(ctx.returnType)) {
      return {
        httpVerb: "GET",
        verbConfidence: 0.70,
        verbReason: `Collection return type "${ctx.returnType}" suggests GET`,
      };
    }

    // 4. Body analysis
    if (/persist|save|insert|merge/.test(ctx.body)) {
      return {
        httpVerb: "POST",
        verbConfidence: 0.65,
        verbReason: "Body contains persist/save operations",
      };
    }

    if (/delete|remove/.test(ctx.body)) {
      return {
        httpVerb: "DELETE",
        verbConfidence: 0.65,
        verbReason: "Body contains delete/remove operations",
      };
    }

    // Default
    return {
      httpVerb: "POST",
      verbConfidence: 0.40,
      verbReason: "Default fallback (no strong signal)",
    };
  }

  private inferSensitivity(ctx: MethodIntentContext): {
    sensitivity: SensitivityLevel;
    sensitivityReason: string;
  } {
    const textToCheck = `${ctx.methodName} ${ctx.className} ${ctx.javadoc} ${ctx.body}`;

    for (const sp of SENSITIVITY_PATTERNS) {
      for (const pattern of sp.patterns) {
        if (pattern.test(textToCheck)) {
          return {
            sensitivity: sp.level,
            sensitivityReason: sp.reason,
          };
        }
      }
    }

    return {
      sensitivity: "INTERNAL",
      sensitivityReason: "Niveau par défaut",
    };
  }

  private inferPagination(ctx: MethodIntentContext): {
    isPaginated: boolean;
    paginationReason: string;
  } {
    // Check return type
    if (/Page<|Pageable|PageResult|PaginatedResult/.test(ctx.returnType)) {
      return {
        isPaginated: true,
        paginationReason: `Return type "${ctx.returnType}" is paginated`,
      };
    }

    // Check parameters
    for (const p of ctx.parameters) {
      if (/page|offset|limit|size|pageSize|pageNumber/.test(p.name)) {
        return {
          isPaginated: true,
          paginationReason: `Parameter "${p.name}" suggests pagination`,
        };
      }
    }

    // Check method name
    if (/^(list|search|find.*All|getAll|lister|chercher)/i.test(ctx.methodName)) {
      // Check if return type is a collection
      if (/List|Collection|Set/.test(ctx.returnType)) {
        return {
          isPaginated: true,
          paginationReason: `Method "${ctx.methodName}" returns collection → should be paginated`,
        };
      }
    }

    return {
      isPaginated: false,
      paginationReason: "Pas de pagination détectée",
    };
  }

  private suggestUrlSegment(ctx: MethodIntentContext): string {
    // Remove common prefixes
    let name = ctx.methodName
      .replace(/^(get|find|fetch|load|read|search|list|retrieve|create|add|insert|update|modify|delete|remove|execute|process)/i, "")
      .replace(/^(consulter|charger|lister|chercher|obtenir|creer|ajouter|modifier|supprimer|annuler|initier|valider|traiter|calculer|simuler)/i, "");

    if (!name) {
      name = ctx.methodName;
    }

    return toKebabCase(name);
  }

  /**
   * Infère les intentions pour un ensemble de méthodes.
   */
  inferIntents(contexts: MethodIntentContext[]): Map<string, IntentInference> {
    const results = new Map<string, IntentInference>();
    for (const ctx of contexts) {
      const key = `${ctx.className}.${ctx.methodName}`;
      results.set(key, this.inferIntent(ctx));
    }
    return results;
  }
}
