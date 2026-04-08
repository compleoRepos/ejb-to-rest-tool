/**
 * SecurityRules — 10 règles de sécurité.
 * OWASP, PCI-DSS, RGPD, authentification, autorisation.
 * 100% déterministe, 0 LLM.
 *
 * @author Hamza NORDINE
 */

import type { Rule, RuleContext, RuleHit } from "../RuleEngine";

function findFieldsByName(ctx: RuleContext, pattern: RegExp) {
  return ctx.fields.filter((f) => pattern.test(f.name));
}

function hasAnnotation(annotations: string[], pattern: RegExp): boolean {
  return annotations.some((a) => pattern.test(a));
}

export const securityRules: Rule[] = [
  // SEC-001: Données sensibles non exposées
  {
    id: "SEC-001",
    category: "SECURITY",
    name: "Données sensibles exposées",
    severity: "CRITICAL",
    description: "Les champs sensibles (password, PIN, CVV, PAN) ne doivent pas être dans les réponses API",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const sensitiveFields = findFieldsByName(ctx, /password|motDePasse|pin|codePin|cvv|cvc|secret|token|otp/i);
      for (const f of sensitiveFields) {
        if (!hasAnnotation(f.annotations, /@JsonIgnore|@JsonProperty.*access.*WRITE/)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, fieldName: f.name, line: f.line,
            message: `Le champ sensible "${f.name}" peut être exposé dans les réponses API`,
            reason: "OWASP A01: Les données sensibles ne doivent jamais être retournées dans les réponses",
            fix: { type: "ADD_ANNOTATION", target: f.name, newValue: "@JsonIgnore" },
          });
        }
      }
      return hits;
    },
  },

  // SEC-002: SQL Injection
  {
    id: "SEC-002",
    category: "SECURITY",
    name: "SQL Injection",
    severity: "CRITICAL",
    description: "Les requêtes SQL ne doivent pas utiliser de concaténation de chaînes",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        if (/("SELECT|"INSERT|"UPDATE|"DELETE).*\+\s*\w+/.test(m.body) ||
            /String\.format.*SELECT/i.test(m.body)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name, line: m.line,
            message: `La méthode "${m.name}" utilise la concaténation SQL (injection possible)`,
            reason: "OWASP A03: Les requêtes SQL doivent utiliser des PreparedStatement ou des paramètres nommés",
            fix: { type: "REPLACE_CODE", newValue: "// TODO: Utiliser PreparedStatement ou JPA named parameters" },
          });
        }
      }
      return hits;
    },
  },

  // SEC-003: Authentification manquante
  {
    id: "SEC-003",
    category: "SECURITY",
    name: "Authentification manquante",
    severity: "HIGH",
    description: "Les endpoints sensibles doivent exiger une authentification",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const isGateway = /(Servlet|Controller|Resource|Endpoint)/i.test(ctx.className);
      if (!isGateway) return hits;

      for (const m of ctx.methods) {
        const isSensitive = /virer|debiter|crediter|modifier|supprimer|bloquer/i.test(m.name);
        if (isSensitive && !hasAnnotation(m.annotations, /@Secured|@RolesAllowed|@PreAuthorize|@Authenticated/)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `L'endpoint sensible "${m.name}" n'a pas d'annotation d'authentification`,
            reason: "OWASP A07: Les opérations sensibles doivent vérifier l'identité de l'appelant",
            fix: { type: "ADD_ANNOTATION", target: m.name, newValue: '@PreAuthorize("isAuthenticated()")' },
          });
        }
      }
      return hits;
    },
  },

  // SEC-004: Autorisation par rôle
  {
    id: "SEC-004",
    category: "SECURITY",
    name: "Autorisation par rôle",
    severity: "HIGH",
    description: "Les opérations admin doivent vérifier le rôle",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const isAdmin = /admin|gerer|parametrer|configurer|supprimer/i.test(m.name);
        if (isAdmin && !hasAnnotation(m.annotations, /@RolesAllowed|@PreAuthorize.*ADMIN|@Secured.*ADMIN/)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode admin "${m.name}" ne vérifie pas le rôle ADMIN`,
            reason: "Principe du moindre privilège : seuls les admins doivent accéder aux fonctions d'administration",
            fix: { type: "ADD_ANNOTATION", target: m.name, newValue: "@PreAuthorize(\"hasRole('ADMIN')\")" },
          });
        }
      }
      return hits;
    },
  },

  // SEC-005: CORS non configuré
  {
    id: "SEC-005",
    category: "SECURITY",
    name: "CORS non configuré",
    severity: "MEDIUM",
    description: "Les Servlets/Controllers doivent configurer CORS explicitement",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const isGateway = /(Servlet|Controller|Resource)/i.test(ctx.className);
      if (isGateway && !hasAnnotation(ctx.annotations, /@CrossOrigin/)) {
        const hasCorsInBody = ctx.methods.some((m) =>
          /Access-Control|addHeader.*Origin|cors/i.test(m.body)
        );
        if (!hasCorsInBody) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className,
            message: `Le controller "${ctx.className}" ne configure pas CORS`,
            reason: "Sans CORS explicite, les appels cross-origin seront bloqués ou trop permissifs",
            fix: { type: "ADD_ANNOTATION", target: ctx.className, newValue: "@CrossOrigin(origins = \"${app.cors.origins}\")" },
          });
        }
      }
      return hits;
    },
  },

  // SEC-006: Logging de données sensibles
  {
    id: "SEC-006",
    category: "SECURITY",
    name: "Log de données sensibles",
    severity: "HIGH",
    description: "Les logs ne doivent pas contenir de données sensibles",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const logsSensitive = /log\w*\.(info|debug|warn|error)\s*\(.*(?:password|pin|cvv|pan|iban|token|secret)/i.test(m.body);
        if (logsSensitive) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode "${m.name}" logue potentiellement des données sensibles`,
            reason: "RGPD/PCI-DSS : les données sensibles ne doivent jamais apparaître dans les logs",
            fix: { type: "ADD_COMMENT", newValue: "// SECURITY: Masquer les données sensibles avant logging" },
          });
        }
      }
      return hits;
    },
  },

  // SEC-007: Exception non catchée
  {
    id: "SEC-007",
    category: "SECURITY",
    name: "Exception stack trace exposée",
    severity: "MEDIUM",
    description: "Les exceptions ne doivent pas exposer la stack trace au client",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        if (/printStackTrace\(\)/.test(m.body)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode "${m.name}" utilise printStackTrace() (fuite d'information)`,
            reason: "OWASP: Les stack traces exposent l'architecture interne de l'application",
            fix: { type: "REPLACE_CODE", newValue: "// TODO: Remplacer printStackTrace() par un logger" },
          });
        }
      }
      return hits;
    },
  },

  // SEC-008: Input validation
  {
    id: "SEC-008",
    category: "SECURITY",
    name: "Validation des entrées",
    severity: "HIGH",
    description: "Les paramètres d'entrée des endpoints doivent être validés",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const isGateway = /(Servlet|Controller|Resource)/i.test(ctx.className);
      if (!isGateway) return hits;

      for (const m of ctx.methods) {
        const hasParams = m.parameters.length > 0;
        const hasValidation = hasAnnotation(m.annotations, /@Valid/) ||
          m.parameters.some((p) => /Valid|NotNull|NotBlank/.test(p.type));
        if (hasParams && !hasValidation) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `L'endpoint "${m.name}" ne valide pas ses paramètres d'entrée`,
            reason: "OWASP A03: Toujours valider les entrées pour prévenir les injections",
            fix: { type: "ADD_ANNOTATION", target: m.name, newValue: "@Valid" },
          });
        }
      }
      return hits;
    },
  },

  // SEC-009: Hardcoded credentials
  {
    id: "SEC-009",
    category: "SECURITY",
    name: "Credentials en dur",
    severity: "CRITICAL",
    description: "Les mots de passe et clés ne doivent pas être codés en dur",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        if (/password\s*=\s*"|secret\s*=\s*"|apiKey\s*=\s*"/.test(m.body)) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode "${m.name}" contient des credentials en dur`,
            reason: "Les credentials en dur sont un risque majeur de sécurité (CWE-798)",
            fix: { type: "REPLACE_CODE", newValue: "// TODO: Externaliser les credentials dans les variables d'environnement" },
          });
        }
      }
      return hits;
    },
  },

  // SEC-010: Rate limiting
  {
    id: "SEC-010",
    category: "SECURITY",
    name: "Rate limiting",
    severity: "MEDIUM",
    description: "Les endpoints publics doivent avoir un rate limiting",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const isGateway = /(Servlet|Controller|Resource)/i.test(ctx.className);
      if (!isGateway) return hits;

      const hasRateLimit = hasAnnotation(ctx.annotations, /@RateLimit|@Throttle/) ||
        ctx.methods.some((m) => /rateLimit|throttle|bucket/i.test(m.body));

      if (!hasRateLimit) {
        hits.push({
          ruleId: this.id, category: this.category, severity: this.severity,
          className: ctx.className,
          message: `Le controller "${ctx.className}" n'a pas de rate limiting`,
          reason: "Sans rate limiting, l'API est vulnérable aux attaques par déni de service",
          fix: { type: "ADD_COMMENT", newValue: "// TODO: Ajouter @RateLimit ou un filtre de throttling" },
        });
      }
      return hits;
    },
  },
];
