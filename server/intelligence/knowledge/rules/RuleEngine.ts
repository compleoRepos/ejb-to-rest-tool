/**
 * RuleEngine — Moteur d'exécution des règles métier.
 * Évalue les règles sur les composants détectés et produit des résultats.
 * 100% déterministe, 0 LLM.
 */

// ── Types de base ──────────────────────────────────────────────

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | "critical" | "major" | "minor" | "info";

export interface RuleHit {
  ruleId: string;
  category?: string;
  severity: Severity;
  className?: string;
  fieldName?: string;
  methodName?: string;
  line?: number;
  location?: string;
  message: string;
  reason?: string;
  suggestion?: string;
  fix?: RuleFix;
}

export interface RuleFix {
  type: "ADD_ANNOTATION" | "CHANGE_TYPE" | "ADD_IMPORT" | "REPLACE_CODE" | "ADD_COMMENT" | "GENERATE_CLASS" | "ADD_METHOD";
  target?: string;
  newValue: string;
  additionalImports?: string[];
}

export interface RuleContext {
  className: string;
  packageName: string;
  imports: string[];
  annotations: string[];
  extendsClass?: string;
  implementsInterfaces: string[];
  isEnum: boolean;
  fields: FieldContext[];
  methods: MethodContext[];
  injectedBeans: string[];
  role?: string;
  domain?: string;
  rawSource?: string;
  // Extended fields used by orchestrator
  classType?: string;
  modifiers?: string[];
  extends?: string;
  implements?: string[];
  sourceCode?: string;
}

export interface FieldContext {
  name: string;
  type: string;
  annotations: string[];
  modifiers: string[];
  line?: number;
}

export interface MethodContext {
  name: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  annotations: string[];
  modifiers: string[];
  body: string;
  callsExternal: string[];
  line?: number;
}

export interface Rule {
  id: string;
  category: string;
  name: string;
  severity: Severity;
  description: string;
  evaluate(ctx: RuleContext): RuleHit[];
}

// ── RuleEngine ─────────────────────────────────────────────────

export class RuleEngine {
  private rules: Rule[] = [];

  register(rule: Rule): void {
    this.rules.push(rule);
  }

  registerAll(rules: Rule[]): void {
    rules.forEach((r) => this.register(r));
  }

  evaluate(ctx: RuleContext): RuleHit[] {
    const hits: RuleHit[] = [];
    for (const rule of this.rules) {
      try {
        const ruleHits = rule.evaluate(ctx);
        hits.push(...ruleHits);
      } catch {
        // Rule evaluation failed silently — skip
      }
    }
    return hits;
  }

  evaluateAll(contexts: RuleContext[]): RuleHit[] {
    const hits: RuleHit[] = [];
    for (const ctx of contexts) {
      hits.push(...this.evaluate(ctx));
    }
    return hits;
  }

  getRules(): Rule[] {
    return [...this.rules];
  }

  getRuleCount(): number {
    return this.rules.length;
  }

  getRulesByCategory(): Record<string, Rule[]> {
    const result: Record<string, Rule[]> = {};
    for (const rule of this.rules) {
      if (!result[rule.category]) result[rule.category] = [];
      result[rule.category].push(rule);
    }
    return result;
  }

  getRulesBySeverity(): Record<Severity, Rule[]> {
    const result: Record<Severity, Rule[]> = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
      INFO: [],
    };
    for (const rule of this.rules) {
      result[rule.severity].push(rule);
    }
    return result;
  }
}
