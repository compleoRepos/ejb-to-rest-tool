/**
 * JakartaRules — 6 règles de migration Jakarta EE / Spring Boot.
 * EJB→CDI, Servlet→JAX-RS, JNDI→DI, javax→jakarta.
 * 100% déterministe, 0 LLM.
 *
 * @author Compleo
 */

import type { Rule, RuleContext, RuleHit } from "../RuleEngine";

function hasAnnotation(annotations: string[], pattern: RegExp): boolean {
  return annotations.some((a) => pattern.test(a));
}

export const jakartaRules: Rule[] = [
  // JAK-001: javax → jakarta namespace
  {
    id: "JAK-001",
    category: "JAKARTA",
    name: "javax → jakarta",
    severity: "HIGH",
    description: "Les imports javax.* doivent être migrés vers jakarta.* (Jakarta EE 9+)",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const javaxImports = ctx.imports.filter((i) =>
        i.startsWith("javax.") &&
        !i.startsWith("javax.crypto") &&
        !i.startsWith("javax.net") &&
        !i.startsWith("javax.security.cert") &&
        !i.startsWith("javax.xml.crypto")
      );

      if (javaxImports.length > 0) {
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `${javaxImports.length} imports javax.* à migrer vers jakarta.*`,
          reason: "Jakarta EE 9+ utilise le namespace jakarta.* au lieu de javax.*",
          fix: {
            type: "REPLACE_CODE",
            newValue: javaxImports.map((i) => `${i} → ${i.replace("javax.", "jakarta.")}`).join("\n"),
          },
        });
      }
      return hits;
    },
  },

  // JAK-002: @Stateless/@Stateful → @ApplicationScoped/@RequestScoped
  {
    id: "JAK-002",
    category: "JAKARTA",
    name: "EJB → CDI",
    severity: "HIGH",
    description: "Les EJB @Stateless/@Stateful doivent être migrés vers CDI scopes",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      if (hasAnnotation(ctx.annotations, /@Stateless/)) {
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `La classe "${ctx.className}" utilise @Stateless (EJB legacy)`,
          reason: "CDI @ApplicationScoped remplace @Stateless avec moins d'overhead",
          fix: {
            type: "REPLACE_ANNOTATION",
            target: "@Stateless",
            newValue: "@ApplicationScoped @Transactional",
            additionalImports: [
              "jakarta.enterprise.context.ApplicationScoped",
              "jakarta.transaction.Transactional",
            ],
          },
        });
      }
      if (hasAnnotation(ctx.annotations, /@Stateful/)) {
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `La classe "${ctx.className}" utilise @Stateful (EJB legacy)`,
          reason: "CDI @SessionScoped ou @RequestScoped remplace @Stateful",
          fix: {
            type: "REPLACE_ANNOTATION",
            target: "@Stateful",
            newValue: "@SessionScoped",
            additionalImports: ["jakarta.enterprise.context.SessionScoped"],
          },
        });
      }
      if (hasAnnotation(ctx.annotations, /@Singleton/)) {
        const isEjbSingleton = ctx.imports.some((i) => i.includes("javax.ejb.Singleton") || i.includes("jakarta.ejb.Singleton"));
        if (isEjbSingleton) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className,
            message: `La classe "${ctx.className}" utilise @Singleton EJB`,
            reason: "CDI @ApplicationScoped remplace @Singleton EJB",
            fix: {
              type: "REPLACE_ANNOTATION",
              target: "@Singleton",
              newValue: "@ApplicationScoped",
              additionalImports: ["jakarta.enterprise.context.ApplicationScoped"],
            },
          });
        }
      }
      return hits;
    },
  },

  // JAK-003: @EJB → @Inject
  {
    id: "JAK-003",
    category: "JAKARTA",
    name: "@EJB → @Inject",
    severity: "HIGH",
    description: "L'injection @EJB doit être remplacée par @Inject (CDI standard)",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const f of ctx.fields) {
        if (hasAnnotation(f.annotations, /@EJB/)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, fieldName: f.name,
            message: `Le champ "${f.name}" utilise @EJB au lieu de @Inject`,
            reason: "@Inject est le standard CDI, portable et testable",
            fix: {
              type: "REPLACE_ANNOTATION",
              target: "@EJB",
              newValue: "@Inject",
              additionalImports: ["jakarta.inject.Inject"],
            },
          });
        }
      }
      return hits;
    },
  },

  // JAK-004: JNDI lookup → DI
  {
    id: "JAK-004",
    category: "JAKARTA",
    name: "JNDI → DI",
    severity: "HIGH",
    description: "Les lookups JNDI doivent être remplacés par l'injection de dépendances",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        if (/InitialContext|Context\.lookup|new\s+InitialContext/.test(m.body)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name, line: m.line,
            message: `La méthode "${m.name}" utilise un lookup JNDI`,
            reason: "JNDI est remplacé par l'injection de dépendances CDI/Spring",
            fix: {
              type: "REPLACE_CODE",
              newValue: "// TODO: Remplacer le lookup JNDI par @Inject ou @Autowired",
            },
          });
        }
      }
      return hits;
    },
  },

  // JAK-005: Servlet → REST Controller
  {
    id: "JAK-005",
    category: "JAKARTA",
    name: "Servlet → REST",
    severity: "MEDIUM",
    description: "Les Servlets HTTP doivent être migrées vers des REST controllers",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const isServlet = hasAnnotation(ctx.annotations, /@WebServlet/) ||
        ctx.extends?.includes("HttpServlet");

      if (isServlet) {
        const methods = ctx.methods.filter((m) =>
          /^(doGet|doPost|doPut|doDelete|service)$/.test(m.name)
        );
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `La Servlet "${ctx.className}" (${methods.length} handlers) doit être migrée vers un @RestController`,
          reason: "Les Servlets sont remplacées par des REST controllers avec typage fort",
          fix: {
            type: "REPLACE_ANNOTATION",
            target: "@WebServlet",
            newValue: "@RestController @RequestMapping",
            additionalImports: [
              "org.springframework.web.bind.annotation.RestController",
              "org.springframework.web.bind.annotation.RequestMapping",
            ],
          },
        });
      }
      return hits;
    },
  },

  // JAK-006: Entity Manager usage patterns
  {
    id: "JAK-006",
    category: "JAKARTA",
    name: "EntityManager patterns",
    severity: "MEDIUM",
    description: "Les patterns EntityManager legacy doivent être modernisés",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        // Native query without type safety
        if (/createNativeQuery\s*\(/.test(m.body) && !/\.class\)/.test(m.body)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode "${m.name}" utilise createNativeQuery sans type safety`,
            reason: "Les native queries sans type sont fragiles — préférer JPQL ou Criteria API",
            fix: { type: "ADD_COMMENT", newValue: "// JAK: Migrer vers JPQL typé ou Spring Data JPA" },
          });
        }

        // Manual transaction management
        if (/entityManager\.getTransaction\(\)|UserTransaction|utx\.begin/.test(m.body)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode "${m.name}" gère les transactions manuellement`,
            reason: "Préférer @Transactional pour la gestion déclarative des transactions",
            fix: {
              type: "ADD_ANNOTATION",
              target: m.name,
              newValue: "@Transactional",
              additionalImports: ["org.springframework.transaction.annotation.Transactional"],
            },
          });
        }
      }
      return hits;
    },
  },
];
