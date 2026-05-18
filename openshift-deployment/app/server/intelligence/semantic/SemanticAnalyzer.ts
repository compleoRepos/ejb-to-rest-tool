/**
 * SemanticAnalyzer — Inférence de rôle pour chaque classe Java.
 * 9 rôles possibles, classés par priorité décroissante.
 * 100% déterministe, 0 LLM.
 *
 * @author Compleo
 */

export type SemanticRole =
  | "GATEWAY"
  | "ORCHESTRATOR"
  | "DOMAIN_SERVICE"
  | "EXTERNAL_ADAPTER"
  | "REPOSITORY"
  | "VALUE_OBJECT"
  | "ENUM_TYPE"
  | "EXCEPTION_TYPE"
  | "UNKNOWN";

export interface RoleInference {
  role: SemanticRole;
  confidence: number;
  matchedRules: string[];
}

export interface ClassContext {
  className: string;
  packageName: string;
  imports: string[];
  annotations: string[];
  extendsClass?: string;
  implementsInterfaces: string[];
  isEnum: boolean;
  fields: { name: string; type: string; annotations: string[] }[];
  methods: {
    name: string;
    returnType: string;
    parameters: { name: string; type: string }[];
    annotations: string[];
    body: string;
    callsExternal: string[];
  }[];
  injectedBeans: string[];
}

// ── Règles d'inférence par priorité ────────────────────────────

interface RoleRule {
  role: SemanticRole;
  confidence: number;
  priority: number;
  match(ctx: ClassContext): string[];
}

const ROLE_RULES: RoleRule[] = [
  // ENUM_TYPE (confiance 0.98, priorité 1)
  {
    role: "ENUM_TYPE",
    confidence: 0.98,
    priority: 1,
    match(ctx) {
      const reasons: string[] = [];
      if (ctx.isEnum) reasons.push("isEnum === true");
      return reasons;
    },
  },

  // EXCEPTION_TYPE (confiance 0.98, priorité 2)
  {
    role: "EXCEPTION_TYPE",
    confidence: 0.98,
    priority: 2,
    match(ctx) {
      const reasons: string[] = [];
      if (ctx.extendsClass && /Exception|Error/.test(ctx.extendsClass)) {
        reasons.push(`extends ${ctx.extendsClass}`);
      }
      return reasons;
    },
  },

  // VALUE_OBJECT (confiance 0.95, priorité 3)
  {
    role: "VALUE_OBJECT",
    confidence: 0.95,
    priority: 3,
    match(ctx) {
      const reasons: string[] = [];
      const nameMatch = /(VoIn|VoOut|DTO|Dto|Request|Response|Model|Bean|Form|Vo)$/i.test(ctx.className);
      if (!nameMatch) return [];
      reasons.push(`className matches DTO/VO pattern: ${ctx.className}`);

      const nonAccessorMethods = ctx.methods.filter(
        (m) => !m.name.match(/^(get|set|is|has|toString|hashCode|equals)/)
      );
      if (nonAccessorMethods.length === 0) {
        reasons.push("All methods are accessors (get/set/is/has)");
      } else {
        return []; // Has business methods → not a pure VO
      }
      return reasons;
    },
  },

  // GATEWAY (confiance 0.95, priorité 4)
  {
    role: "GATEWAY",
    confidence: 0.95,
    priority: 4,
    match(ctx) {
      const reasons: string[] = [];

      if (ctx.extendsClass === "HttpServlet") {
        reasons.push("extends HttpServlet");
      }
      for (const ann of ctx.annotations) {
        if (ann.includes("@WebServlet")) reasons.push("@WebServlet annotation");
        if (ann.includes("@WebService")) reasons.push("@WebService annotation");
        if (ann.includes("@Path")) reasons.push("@Path (JAX-RS) annotation");
        if (ann.includes("@RestController")) reasons.push("@RestController annotation");
        if (ann.includes("@Controller")) reasons.push("@Controller annotation");
      }
      if (/(Servlet|Controller|Resource|Endpoint|Gateway|Rest)$/i.test(ctx.className)) {
        reasons.push(`className matches Gateway pattern: ${ctx.className}`);
      }

      return reasons;
    },
  },

  // REPOSITORY (confiance 0.90, priorité 5)
  {
    role: "REPOSITORY",
    confidence: 0.90,
    priority: 5,
    match(ctx) {
      const reasons: string[] = [];

      const repoImports = [
        "PreparedStatement", "SessionFactory", "EntityManager",
        "JdbcTemplate", "CrudRepository", "JpaRepository",
        "HibernateTemplate", "Session",
      ];
      for (const imp of ctx.imports) {
        for (const ri of repoImports) {
          if (imp.includes(ri)) reasons.push(`imports ${ri}`);
        }
      }

      if (/(DAO|Dao|Repository|Repo)$/i.test(ctx.className)) {
        reasons.push(`className matches Repository pattern: ${ctx.className}`);
      }

      // Check for SQL in method bodies
      for (const m of ctx.methods) {
        if (/SELECT|INSERT|UPDATE|DELETE|FROM\s+\w+/i.test(m.body)) {
          reasons.push(`method ${m.name} contains SQL`);
        }
      }

      return reasons;
    },
  },

  // EXTERNAL_ADAPTER (confiance 0.90, priorité 6)
  {
    role: "EXTERNAL_ADAPTER",
    confidence: 0.90,
    priority: 6,
    match(ctx) {
      const reasons: string[] = [];

      for (const m of ctx.methods) {
        if (m.body.includes("executeTransaction")) {
          reasons.push(`method ${m.name} calls executeTransaction`);
        }
        if (m.body.includes("InitialContext")) {
          reasons.push(`method ${m.name} uses InitialContext (JNDI lookup)`);
        }
        if (m.body.includes("lookup(")) {
          reasons.push(`method ${m.name} performs JNDI lookup`);
        }
        if (/MagixService|CoreBanking|T24|ATLAS|ExternalService/.test(m.body)) {
          reasons.push(`method ${m.name} calls external system`);
        }
      }

      if (/(Adapter|Connector|Client|Proxy|Stub|Gateway|Bridge)$/i.test(ctx.className)) {
        reasons.push(`className matches Adapter pattern: ${ctx.className}`);
      }

      for (const iface of ctx.implementsInterfaces) {
        if (/Adapter|Connector|Client/.test(iface)) {
          reasons.push(`implements ${iface}`);
        }
      }

      return reasons;
    },
  },

  // DOMAIN_SERVICE (confiance 0.92, priorité 7)
  {
    role: "DOMAIN_SERVICE",
    confidence: 0.92,
    priority: 7,
    match(ctx) {
      const reasons: string[] = [];

      if (ctx.implementsInterfaces.includes("BaseUseCase")) {
        reasons.push("implements BaseUseCase");
      }

      for (const ann of ctx.annotations) {
        if (ann.includes("@UseCase")) reasons.push("@UseCase annotation");
        if (ann.includes("@Stateless") && ctx.methods.some((m) => m.name === "execute")) {
          reasons.push("@Stateless with execute() method");
        }
        if (ann.includes("@Service")) reasons.push("@Service annotation");
      }

      if (
        /(UC|UseCase|Service|Manager|Handler|Processor|Facade)$/i.test(ctx.className) &&
        ctx.methods.some((m) => /^(execute|process|handle|run|perform)$/i.test(m.name))
      ) {
        reasons.push(`className matches Service pattern + has execute/process method`);
      }

      // Also match if className ends with UC/UseCase regardless of method names
      if (/(UC|UseCase)$/i.test(ctx.className)) {
        reasons.push(`className ends with UC/UseCase`);
      }

      return reasons;
    },
  },

  // ORCHESTRATOR (confiance 0.88, priorité 8)
  {
    role: "ORCHESTRATOR",
    confidence: 0.88,
    priority: 8,
    match(ctx) {
      const reasons: string[] = [];

      if (ctx.injectedBeans.length < 3) return [];

      reasons.push(`${ctx.injectedBeans.length} injected beans`);

      const hasMultiExternalCalls = ctx.methods.some(
        (m) => m.callsExternal.length >= 3
      );
      if (hasMultiExternalCalls) {
        reasons.push("method with 3+ external calls");
      } else {
        return []; // Not enough external calls
      }

      return reasons;
    },
  },
];

// ── SemanticAnalyzer ───────────────────────────────────────────

export class SemanticAnalyzer {
  /**
   * Infère le rôle d'une classe Java depuis son contexte AST.
   */
  inferRole(ctx: ClassContext): RoleInference {
    // Évaluer chaque règle par priorité
    for (const rule of ROLE_RULES) {
      const matchedRules = rule.match(ctx);
      if (matchedRules.length > 0) {
        return {
          role: rule.role,
          confidence: rule.confidence,
          matchedRules,
        };
      }
    }

    return {
      role: "UNKNOWN",
      confidence: 0.0,
      matchedRules: ["Aucune règle ne correspond"],
    };
  }

  /**
   * Infère les rôles pour un ensemble de classes.
   */
  inferRoles(contexts: ClassContext[]): Map<string, RoleInference> {
    const results = new Map<string, RoleInference>();
    for (const ctx of contexts) {
      results.set(ctx.className, this.inferRole(ctx));
    }
    return results;
  }

  /**
   * Retourne les statistiques des rôles inférés.
   */
  getRoleStats(contexts: ClassContext[]): Record<SemanticRole, number> {
    const stats: Record<SemanticRole, number> = {
      GATEWAY: 0,
      ORCHESTRATOR: 0,
      DOMAIN_SERVICE: 0,
      EXTERNAL_ADAPTER: 0,
      REPOSITORY: 0,
      VALUE_OBJECT: 0,
      ENUM_TYPE: 0,
      EXCEPTION_TYPE: 0,
      UNKNOWN: 0,
    };

    for (const ctx of contexts) {
      const { role } = this.inferRole(ctx);
      stats[role]++;
    }

    return stats;
  }
}
