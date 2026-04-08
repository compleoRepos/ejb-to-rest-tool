/**
 * ArchitectureRules — 8 règles d'architecture.
 * SOLID, layering, DI, naming, separation of concerns.
 * 100% déterministe, 0 LLM.
 *
 * @author Hamza NORDINE
 */

import type { Rule, RuleContext, RuleHit } from "../RuleEngine";

export const architectureRules: Rule[] = [
  // ARCH-001: God Class
  {
    id: "ARCH-001",
    category: "ARCHITECTURE",
    name: "God Class",
    severity: "HIGH",
    description: "Une classe avec trop de méthodes/champs viole le SRP",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      if (ctx.methods.length > 20) {
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `La classe "${ctx.className}" a ${ctx.methods.length} méthodes (God Class)`,
          reason: "SRP: Une classe ne devrait avoir qu'une seule raison de changer",
          fix: { type: "ADD_COMMENT", newValue: `// ARCH: Extraire en ${Math.ceil(ctx.methods.length / 7)} services spécialisés` },
        });
      }
      if (ctx.fields.length > 15) {
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `La classe "${ctx.className}" a ${ctx.fields.length} champs (trop de responsabilités)`,
          reason: "Trop de champs indique un manque de cohésion",
          fix: { type: "ADD_COMMENT", newValue: "// ARCH: Regrouper les champs liés dans des Value Objects" },
        });
      }
      return hits;
    },
  },

  // ARCH-002: Couplage direct à l'implémentation
  {
    id: "ARCH-002",
    category: "ARCHITECTURE",
    name: "Couplage direct",
    severity: "MEDIUM",
    description: "Les dépendances doivent être sur des interfaces, pas des implémentations",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const f of ctx.fields) {
        const isImpl = /Impl$|Service$/.test(f.type) && !f.type.startsWith("I");
        const isInjected = f.annotations.some((a) => /@Inject|@Autowired|@EJB/.test(a));
        if (isImpl && isInjected) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, fieldName: f.name,
            message: `Le champ "${f.name}" est injecté avec le type concret "${f.type}"`,
            reason: "DIP: Dépendre des abstractions, pas des implémentations",
            fix: { type: "CHANGE_TYPE", target: f.name, newValue: f.type.replace(/Impl$/, "") },
          });
        }
      }
      return hits;
    },
  },

  // ARCH-003: Logique métier dans le controller
  {
    id: "ARCH-003",
    category: "ARCHITECTURE",
    name: "Logique dans le controller",
    severity: "HIGH",
    description: "Les controllers/servlets ne doivent pas contenir de logique métier",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const isGateway = /(Servlet|Controller|Resource|Endpoint)/i.test(ctx.className);
      if (!isGateway) return hits;

      for (const m of ctx.methods) {
        // Check for business logic indicators
        const hasDbAccess = /EntityManager|Session|Repository|DAO|DataSource|PreparedStatement/.test(m.body);
        const hasComplexLogic = (m.body.match(/if\s*\(/g) || []).length > 3;
        if (hasDbAccess || hasComplexLogic) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `Le controller "${ctx.className}.${m.name}" contient de la logique métier`,
            reason: "Les controllers doivent déléguer au service layer (separation of concerns)",
            fix: { type: "ADD_COMMENT", newValue: "// ARCH: Extraire la logique dans un service dédié" },
          });
        }
      }
      return hits;
    },
  },

  // ARCH-004: Naming conventions
  {
    id: "ARCH-004",
    category: "ARCHITECTURE",
    name: "Convention de nommage",
    severity: "LOW",
    description: "Les classes doivent suivre les conventions de nommage Spring Boot",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const name = ctx.className;

      // Service classes should end with Service
      if (ctx.annotations.some((a) => /@Service/.test(a)) && !name.endsWith("Service") && !name.endsWith("ServiceImpl")) {
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `La classe @Service "${name}" ne se termine pas par "Service"`,
          reason: "Convention: les services Spring doivent être nommés XxxService",
          fix: { type: "ADD_COMMENT", newValue: `// ARCH: Renommer en ${name}Service` },
        });
      }

      // Repository classes
      if (ctx.annotations.some((a) => /@Repository/.test(a)) && !name.endsWith("Repository") && !name.endsWith("Dao")) {
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `La classe @Repository "${name}" ne se termine pas par "Repository"`,
          reason: "Convention: les repositories Spring doivent être nommés XxxRepository",
          fix: { type: "ADD_COMMENT", newValue: `// ARCH: Renommer en ${name}Repository` },
        });
      }

      return hits;
    },
  },

  // ARCH-005: Circular dependency
  {
    id: "ARCH-005",
    category: "ARCHITECTURE",
    name: "Dépendance circulaire potentielle",
    severity: "HIGH",
    description: "Détection de dépendances circulaires potentielles via les injections",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const injectedTypes = ctx.fields
        .filter((f) => f.annotations.some((a) => /@Inject|@Autowired|@EJB/.test(a)))
        .map((f) => f.type);

      // Check if the class name appears in its own dependencies (simplified)
      const selfRef = injectedTypes.some((t) => t === ctx.className);
      if (selfRef) {
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `La classe "${ctx.className}" s'injecte elle-même (dépendance circulaire)`,
          reason: "Les dépendances circulaires rendent le code difficile à tester et à maintenir",
          fix: { type: "ADD_COMMENT", newValue: "// ARCH: Extraire la logique partagée dans un service tiers" },
        });
      }

      // Too many dependencies
      if (injectedTypes.length > 7) {
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `La classe "${ctx.className}" a ${injectedTypes.length} dépendances injectées`,
          reason: "Trop de dépendances indique une violation du SRP",
          fix: { type: "ADD_COMMENT", newValue: "// ARCH: Réduire les dépendances en regroupant les responsabilités" },
        });
      }

      return hits;
    },
  },

  // ARCH-006: Static mutable state
  {
    id: "ARCH-006",
    category: "ARCHITECTURE",
    name: "État statique mutable",
    severity: "HIGH",
    description: "Les champs static mutable sont dangereux en environnement concurrent",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const f of ctx.fields) {
        const isStatic = f.modifiers.includes("static");
        const isFinal = f.modifiers.includes("final");
        const isMutable = /List|Map|Set|Array|StringBuilder/.test(f.type);
        if (isStatic && !isFinal && isMutable) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, fieldName: f.name,
            message: `Le champ static mutable "${f.name}" est dangereux en multi-thread`,
            reason: "Un champ static mutable partagé entre threads provoque des race conditions",
            fix: { type: "ADD_COMMENT", newValue: "// ARCH: Rendre final ou utiliser ConcurrentHashMap/AtomicReference" },
          });
        }
      }
      return hits;
    },
  },

  // ARCH-007: Exception générique
  {
    id: "ARCH-007",
    category: "ARCHITECTURE",
    name: "Exception générique",
    severity: "MEDIUM",
    description: "Utiliser des exceptions métier au lieu de Exception/RuntimeException",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        if (/throw new (Exception|RuntimeException)\s*\(/.test(m.body)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode "${m.name}" lance une exception générique`,
            reason: "Les exceptions métier permettent un traitement d'erreur plus fin",
            fix: { type: "REPLACE_CODE", newValue: "// ARCH: Créer une exception métier dédiée (ex: CompteInexistantException)" },
          });
        }
      }
      return hits;
    },
  },

  // ARCH-008: Layer violation (DAO accessing presentation)
  {
    id: "ARCH-008",
    category: "ARCHITECTURE",
    name: "Violation de couche",
    severity: "HIGH",
    description: "Les couches basses ne doivent pas dépendre des couches hautes",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const isDao = /(DAO|Repository|Dao)/i.test(ctx.className);
      if (!isDao) return hits;

      for (const f of ctx.fields) {
        if (/(Servlet|Controller|View|JSP|Response|Request)/i.test(f.type)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, fieldName: f.name,
            message: `Le DAO "${ctx.className}" dépend du type présentation "${f.type}"`,
            reason: "Les couches basses (DAO) ne doivent jamais dépendre des couches hautes (Controller/Servlet)",
            fix: { type: "ADD_COMMENT", newValue: "// ARCH: Supprimer cette dépendance — le DAO ne doit pas connaître la couche présentation" },
          });
        }
      }
      return hits;
    },
  },
];
