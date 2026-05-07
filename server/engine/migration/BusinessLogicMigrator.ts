/**
 * BusinessLogicMigrator v12.1 — Orchestrates per-method business logic migration.
 * For each method with hasBusinessLogic=true, calls the LLM to transform the body.
 * Falls back to rule-based transforms if LLM is unavailable or fails.
 *
 * @author Hamza NORDINE — Compleo
 */

import { MethodTransformer, type MethodMigrationResult, type MethodContext } from "./MethodTransformer";

export interface MigrationStats {
  totalMethods: number;
  migratedByLLM: number;
  migratedByRules: number;
  keptAsTodo: number;
  errors: number;
  totalTimeMs: number;
}

export interface MethodToMigrate {
  name: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  body: string;
  bodyLOC: number;
  hasBusinessLogic: boolean;
  className: string;
}

export interface ServiceContext {
  availableServices: string[];
  availableRepositories: string[];
  basePackage: string;
  domain: string;
}

export class BusinessLogicMigrator {
  private transformer: MethodTransformer;
  private stats: MigrationStats;

  constructor() {
    this.transformer = new MethodTransformer();
    this.stats = {
      totalMethods: 0,
      migratedByLLM: 0,
      migratedByRules: 0,
      keptAsTodo: 0,
      errors: 0,
      totalTimeMs: 0,
    };
  }

  /**
   * Migrate all methods in a service/adapter that have business logic.
   * Returns a map of methodName → migrated body string.
   */
  async migrateAll(
    methods: MethodToMigrate[],
    serviceContext: ServiceContext
  ): Promise<Map<string, MethodMigrationResult>> {
    const results = new Map<string, MethodMigrationResult>();
    const startTime = Date.now();

    for (const method of methods) {
      this.stats.totalMethods++;

      // CAS 1: No body or no business logic → keep TODO
      if (!method.body || !method.hasBusinessLogic || method.bodyLOC <= 2) {
        this.stats.keptAsTodo++;
        results.set(method.name, {
          code: `// TODO: Implement ${method.name} — no business logic body available`,
          strategy: "todo",
          confidence: 0,
        });
        continue;
      }

      // CAS 2: Has business logic → transform via LLM then fallback
      const ctx: MethodContext = {
        className: method.className,
        methodName: method.name,
        returnType: method.returnType,
        parameters: method.parameters,
        body: method.body,
        availableServices: serviceContext.availableServices,
        availableRepositories: serviceContext.availableRepositories,
      };

      try {
        const result = await this.transformer.transform(ctx);
        results.set(method.name, result);

        if (result.strategy === "llm") {
          this.stats.migratedByLLM++;
        } else if (result.strategy === "rule-based") {
          this.stats.migratedByRules++;
        } else {
          this.stats.keptAsTodo++;
        }
      } catch (e) {
        this.stats.errors++;
        results.set(method.name, {
          code: `// TODO: Implement ${method.name} — migration failed: ${(e as Error).message}`,
          strategy: "todo",
          confidence: 0,
        });
      }
    }

    this.stats.totalTimeMs = Date.now() - startTime;
    return results;
  }

  /**
   * Migrate a single method — used for adapter @Remote methods.
   */
  async migrateMethod(
    method: MethodToMigrate,
    serviceContext: ServiceContext
  ): Promise<MethodMigrationResult> {
    if (!method.body || !method.hasBusinessLogic || method.bodyLOC <= 2) {
      return {
        code: `// TODO: Implement ${method.name} — no business logic body available`,
        strategy: "todo",
        confidence: 0,
      };
    }

    const ctx: MethodContext = {
      className: method.className,
      methodName: method.name,
      returnType: method.returnType,
      parameters: method.parameters,
      body: method.body,
      availableServices: serviceContext.availableServices,
      availableRepositories: serviceContext.availableRepositories,
    };

    return this.transformer.transform(ctx);
  }

  getStats(): MigrationStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      totalMethods: 0,
      migratedByLLM: 0,
      migratedByRules: 0,
      keptAsTodo: 0,
      errors: 0,
      totalTimeMs: 0,
    };
  }
}
