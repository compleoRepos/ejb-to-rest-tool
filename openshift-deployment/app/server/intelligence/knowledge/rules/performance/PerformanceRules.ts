/**
 * PerformanceRules — 8 règles de performance.
 * N+1, caching, pagination, connection pooling, lazy loading.
 * 100% déterministe, 0 LLM.
 *
 * @author Compleo
 */

import type { Rule, RuleContext, RuleHit } from "../RuleEngine";

export const performanceRules: Rule[] = [
  // PERF-001: N+1 Query
  {
    id: "PERF-001",
    category: "PERFORMANCE",
    name: "N+1 Query potentiel",
    severity: "HIGH",
    description: "Boucle avec requête DB à chaque itération → N+1 queries",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const hasLoop = /for\s*\(|while\s*\(|\.forEach\(|\.stream\(\)/.test(m.body);
        const hasDbCall = /find|get|load|query|select|executeQuery|createQuery/.test(m.body);
        if (hasLoop && hasDbCall) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name, line: m.line,
            message: `La méthode "${m.name}" contient potentiellement un N+1 query (boucle + requête DB)`,
            reason: "Un N+1 query multiplie les appels DB par le nombre d'éléments, dégradant les performances",
            fix: { type: "ADD_COMMENT", newValue: "// PERF: Remplacer par un batch query (WHERE IN) ou un JOIN FETCH" },
          });
        }
      }
      return hits;
    },
  },

  // PERF-002: Pagination manquante sur les listes
  {
    id: "PERF-002",
    category: "PERFORMANCE",
    name: "Pagination manquante",
    severity: "HIGH",
    description: "Les méthodes retournant des listes doivent être paginées",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const returnsList = /List<|Collection<|Set</.test(m.returnType);
        const isListMethod = /^(list|getAll|findAll|search|lister|chercher)/i.test(m.name);
        const hasPagination = m.parameters.some((p) => /page|offset|limit|size|Pageable/i.test(p.name) || /Pageable/.test(p.type));

        if (returnsList && isListMethod && !hasPagination) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name, line: m.line,
            message: `La méthode "${m.name}" retourne une liste sans pagination`,
            reason: "Sans pagination, une table avec 1M de lignes retourne tout en mémoire",
            fix: { type: "ADD_COMMENT", newValue: "// PERF: Ajouter Pageable en paramètre et retourner Page<T>" },
          });
        }
      }
      return hits;
    },
  },

  // PERF-003: Connection non fermée
  {
    id: "PERF-003",
    category: "PERFORMANCE",
    name: "Connection non fermée",
    severity: "CRITICAL",
    description: "Les connexions JDBC doivent être fermées dans un finally/try-with-resources",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const opensConnection = /getConnection\(\)|DataSource\.get|DriverManager\.get/.test(m.body);
        const closesConnection = /\.close\(\)|try\s*\(/.test(m.body);
        if (opensConnection && !closesConnection) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name, line: m.line,
            message: `La méthode "${m.name}" ouvre une connexion JDBC sans la fermer explicitement`,
            reason: "Une fuite de connexion épuise le pool et provoque des timeouts",
            fix: { type: "REPLACE_CODE", newValue: "// PERF: Utiliser try-with-resources pour fermer automatiquement la connexion" },
          });
        }
      }
      return hits;
    },
  },

  // PERF-004: Eager loading excessif
  {
    id: "PERF-004",
    category: "PERFORMANCE",
    name: "Eager loading excessif",
    severity: "MEDIUM",
    description: "Les relations @ManyToMany/@OneToMany en EAGER chargent trop de données",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const f of ctx.fields) {
        const hasEager = f.annotations.some((a) => /fetch\s*=\s*FetchType\.EAGER|@ManyToMany|@OneToMany/.test(a));
        const isCollection = /List<|Set<|Collection</.test(f.type);
        if (hasEager && isCollection) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, fieldName: f.name, line: f.line,
            message: `Le champ "${f.name}" utilise EAGER loading sur une collection`,
            reason: "EAGER loading sur une collection charge toutes les entités associées à chaque requête",
            fix: { type: "ADD_ANNOTATION", target: f.name, newValue: "// PERF: Passer en FetchType.LAZY et utiliser JOIN FETCH quand nécessaire" },
          });
        }
      }
      return hits;
    },
  },

  // PERF-005: Cache manquant sur les données de référence
  {
    id: "PERF-005",
    category: "PERFORMANCE",
    name: "Cache manquant",
    severity: "MEDIUM",
    description: "Les données de référence (paramètres, listes de valeurs) doivent être cachées",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const isRefData = /getParametre|getConfig|getReferentiel|getListeValeurs|findByCode/i.test(m.name);
        const hasCache = /Cache|@Cacheable|cache\.get|cacheManager/.test(m.body) ||
          m.annotations.some((a) => /@Cacheable/.test(a));
        if (isRefData && !hasCache) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode de référentiel "${m.name}" n'utilise pas de cache`,
            reason: "Les données de référence changent rarement — les cacher réduit les appels DB",
            fix: { type: "ADD_ANNOTATION", target: m.name, newValue: "@Cacheable(\"referentiel\")" },
          });
        }
      }
      return hits;
    },
  },

  // PERF-006: String concatenation dans les boucles
  {
    id: "PERF-006",
    category: "PERFORMANCE",
    name: "Concaténation String en boucle",
    severity: "LOW",
    description: "Utiliser StringBuilder au lieu de += dans les boucles",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const hasLoop = /for\s*\(|while\s*\(/.test(m.body);
        const hasConcat = /\+=\s*"/.test(m.body);
        if (hasLoop && hasConcat) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode "${m.name}" concatène des Strings dans une boucle`,
            reason: "La concaténation String crée un nouvel objet à chaque itération",
            fix: { type: "REPLACE_CODE", newValue: "// PERF: Utiliser StringBuilder pour les concaténations en boucle" },
          });
        }
      }
      return hits;
    },
  },

  // PERF-007: Synchronisation excessive
  {
    id: "PERF-007",
    category: "PERFORMANCE",
    name: "Synchronisation excessive",
    severity: "MEDIUM",
    description: "Les méthodes synchronized bloquent les threads concurrents",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        if (m.modifiers.includes("synchronized")) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode "${m.name}" est synchronized (goulot d'étranglement potentiel)`,
            reason: "En Spring Boot, préférer les structures thread-safe (ConcurrentHashMap, AtomicReference)",
            fix: { type: "ADD_COMMENT", newValue: "// PERF: Évaluer si synchronized est nécessaire ou si une structure concurrent suffit" },
          });
        }
      }
      return hits;
    },
  },

  // PERF-008: Appel externe sans timeout
  {
    id: "PERF-008",
    category: "PERFORMANCE",
    name: "Appel externe sans timeout",
    severity: "HIGH",
    description: "Les appels HTTP/SOAP externes doivent avoir un timeout configuré",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const hasExternalCall = /HttpClient|RestTemplate|WebClient|HttpURLConnection|SOAPConnection/.test(m.body);
        const hasTimeout = /timeout|connectTimeout|readTimeout|Duration\.of/.test(m.body);
        if (hasExternalCall && !hasTimeout) {
          hits.push({
            ruleId: this.id, category: this.category, severity: this.severity,
            className: ctx.className, methodName: m.name,
            message: `La méthode "${m.name}" fait un appel externe sans timeout`,
            reason: "Sans timeout, un service externe lent peut bloquer tous les threads",
            fix: { type: "ADD_COMMENT", newValue: "// PERF: Configurer connectTimeout et readTimeout sur le client HTTP" },
          });
        }
      }
      return hits;
    },
  },
];
