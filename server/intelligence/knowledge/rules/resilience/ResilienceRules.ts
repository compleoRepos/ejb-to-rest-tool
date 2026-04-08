/**
 * resilienceRules — Auto-generated rules for resilience
 * Total: 45 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const resilienceRules: Rule[] = [
  {
    id: "RES_ERR_001",
    category: "RESILIENCE",
    name: "Catch vide",
    severity: "critical",
    description: "Bloc catch vide qui avale les exceptions",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\([^)]+\)\s*\{\s*\}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_002",
    category: "RESILIENCE",
    name: "Catch Exception generique",
    severity: "major",
    description: "catch(Exception) au lieu d exception specifique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*Exception\s+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_003",
    category: "RESILIENCE",
    name: "Catch Throwable",
    severity: "critical",
    description: "catch(Throwable) capture les erreurs systeme",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*Throwable\s+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_004",
    category: "RESILIENCE",
    name: "Return dans finally",
    severity: "critical",
    description: "Return dans bloc finally masque les exceptions",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /finally\s*\{[\s\S]{0,200}return\s+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_005",
    category: "RESILIENCE",
    name: "Exception generique throw",
    severity: "major",
    description: "throw new Exception() au lieu d exception metier",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /throw\s+new\s+(?:Exception|RuntimeException)\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_006",
    category: "RESILIENCE",
    name: "Exception sans message",
    severity: "minor",
    description: "Exception lancee sans message descriptif",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /throw\s+new\s+\w+Exception\s*\(\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_007",
    category: "RESILIENCE",
    name: "Exception sans cause",
    severity: "major",
    description: "Exception wrappee sans cause originale",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*\w+\s+(\w+)\s*\)[\s\S]{0,200}throw\s+new\s+\w+\((?!.*\1)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_008",
    category: "RESILIENCE",
    name: "Log et throw",
    severity: "minor",
    description: "Exception loguee puis relancee (double logging)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.error[\s\S]{0,100}throw\s+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_009",
    category: "RESILIENCE",
    name: "Null return",
    severity: "major",
    description: "Return null au lieu d Optional ou exception",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /return\s+null\s*;/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_010",
    category: "RESILIENCE",
    name: "Checked exception abuse",
    severity: "minor",
    description: "Exception checked pour erreur de programmation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /throws\s+\w+Exception[\s\S]{0,50}throws\s+\w+Exception[\s\S]{0,50}throws/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_011",
    category: "RESILIENCE",
    name: "Error code magic",
    severity: "minor",
    description: "Code erreur magique au lieu de enum",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /errorCode\s*=\s*\d+|return\s+\d+\s*;.*error/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_012",
    category: "RESILIENCE",
    name: "Exception dans constructeur",
    severity: "major",
    description: "Exception dans constructeur laisse objet inconsistant",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:public|protected)\s+\w+\s*\([^)]*\)\s*(?:throws)?[\s\S]{0,200}throw\s+new/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_013",
    category: "RESILIENCE",
    name: "Assert en production",
    severity: "major",
    description: "assert utilise en production au lieu de validation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\bassert\s+\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_014",
    category: "RESILIENCE",
    name: "NullPointerException catch",
    severity: "critical",
    description: "catch(NullPointerException) masque un bug",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*NullPointerException/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_015",
    category: "RESILIENCE",
    name: "ClassCastException catch",
    severity: "major",
    description: "catch(ClassCastException) masque un probleme de type",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*ClassCastException/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_016",
    category: "RESILIENCE",
    name: "NumberFormatException non gere",
    severity: "major",
    description: "parseInt/parseLong sans catch NumberFormatException",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:parseInt|parseLong|parseDouble)\s*\((?![\s\S]{0,200}catch.*NumberFormat)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_017",
    category: "RESILIENCE",
    name: "IOException generique",
    severity: "minor",
    description: "catch(IOException) trop generique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*IOException\s+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_018",
    category: "RESILIENCE",
    name: "Exception dans equals",
    severity: "critical",
    description: "Exception possible dans equals/hashCode",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:equals|hashCode)\s*\([^)]*\)[\s\S]{0,200}(?:throw|\.get\w+\(\)\.)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_019",
    category: "RESILIENCE",
    name: "Suppressed exception",
    severity: "minor",
    description: "Exception supprimee dans try-with-resources non geree",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /try\s*\([\s\S]{0,200}\)\s*\{[\s\S]{0,500}catch(?!.*getSuppressed)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_ERR_020",
    category: "RESILIENCE",
    name: "Error handling inconsistant",
    severity: "major",
    description: "Gestion erreur inconsistante dans la meme classe",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*\w+\s+\w+\s*\)\s*\{[\s\S]{0,100}log[\s\S]{0,500}catch\s*\(\s*\w+\s+\w+\s*\)\s*\{[\s\S]{0,100}throw/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_001",
    category: "RESILIENCE",
    name: "Retry sans backoff",
    severity: "major",
    description: "Retry sans delai exponentiel (thundering herd)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /retry|attempt[\s\S]{0,200}(?:Thread\.sleep\s*\(\s*\d+\s*\)|(?!.*backoff|.*exponential))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_002",
    category: "RESILIENCE",
    name: "Retry infini",
    severity: "critical",
    description: "Boucle de retry sans limite maximale",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /while\s*\(\s*true\s*\)[\s\S]{0,200}(?:retry|attempt|try)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_003",
    category: "RESILIENCE",
    name: "Timeout absent",
    severity: "critical",
    description: "Appel distant sans timeout configure",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:HttpURLConnection|RestTemplate|WebClient)(?![\s\S]{0,300}(?:timeout|connectTimeout|readTimeout))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_004",
    category: "RESILIENCE",
    name: "Circuit breaker absent",
    severity: "major",
    description: "Appel service externe sans circuit breaker",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient|HttpClient)\.(?:get|post|put|delete)(?![\s\S]{0,300}(?:circuitBreaker|CircuitBreaker|fallback))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_005",
    category: "RESILIENCE",
    name: "Fallback absent",
    severity: "major",
    description: "Circuit breaker sans methode fallback",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@CircuitBreaker(?!.*fallback)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_006",
    category: "RESILIENCE",
    name: "Bulkhead absent",
    severity: "minor",
    description: "Service haute charge sans bulkhead/isolation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Service[\s\S]{0,500}(?:RestTemplate|WebClient)(?![\s\S]{0,300}(?:bulkhead|Bulkhead|semaphore))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_007",
    category: "RESILIENCE",
    name: "Rate limiter absent",
    severity: "minor",
    description: "API publique sans rate limiting",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:GetMapping|PostMapping|RequestMapping)(?![\s\S]{0,300}(?:rateLimiter|RateLimiter|throttle))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_008",
    category: "RESILIENCE",
    name: "Health check absent",
    severity: "minor",
    description: "Service sans endpoint de health check",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?:Service|Application)(?![\s\S]{0,2000}(?:health|Health|actuator))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_009",
    category: "RESILIENCE",
    name: "Graceful shutdown absent",
    severity: "major",
    description: "Application sans arret gracieux",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:main|Application)(?![\s\S]{0,2000}(?:shutdown|ShutdownHook|graceful))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_010",
    category: "RESILIENCE",
    name: "Connection pool exhaustion",
    severity: "critical",
    description: "Pas de gestion de pool de connexions epuise",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /getConnection(?![\s\S]{0,300}(?:maxPool|maxActive|maxTotal|timeout))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_011",
    category: "RESILIENCE",
    name: "Dead letter queue absent",
    severity: "major",
    description: "Message JMS sans dead letter queue",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:onMessage|MessageListener)(?![\s\S]{0,500}(?:deadLetter|DLQ|errorQueue))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_012",
    category: "RESILIENCE",
    name: "Idempotency absent",
    severity: "major",
    description: "Operation non idempotente sans protection",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:PostMapping|PutMapping)(?![\s\S]{0,300}(?:idempotent|idempotency|dedup))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_013",
    category: "RESILIENCE",
    name: "Cache stampede",
    severity: "major",
    description: "Cache sans protection contre stampede",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /cache\.get(?![\s\S]{0,200}(?:lock|synchronized|singleFlight))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_014",
    category: "RESILIENCE",
    name: "Compensating transaction",
    severity: "major",
    description: "Saga sans transaction compensatoire",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /saga|orchestrat(?![\s\S]{0,500}(?:compensat|rollback|undo))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_CB_015",
    category: "RESILIENCE",
    name: "Poison message",
    severity: "major",
    description: "Pas de gestion des messages empoisonnes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /onMessage(?![\s\S]{0,500}(?:retry.*count|maxRetries|poison|reject))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_OBS_001",
    category: "RESILIENCE",
    name: "Metriques absentes",
    severity: "minor",
    description: "Service sans metriques de monitoring",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Service(?![\s\S]{0,2000}(?:metric|Metric|counter|gauge|timer))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_OBS_002",
    category: "RESILIENCE",
    name: "Tracing absent",
    severity: "minor",
    description: "Appel distribue sans tracing",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient)(?![\s\S]{0,300}(?:trace|Trace|span|Span))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_OBS_003",
    category: "RESILIENCE",
    name: "Alert absent",
    severity: "minor",
    description: "Erreur critique sans mecanisme d alerte",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.error(?![\s\S]{0,200}(?:alert|notify|alarm))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_OBS_004",
    category: "RESILIENCE",
    name: "SLA monitoring absent",
    severity: "minor",
    description: "Pas de monitoring des SLA/SLO",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Service(?![\s\S]{0,2000}(?:sla|SLA|slo|SLO|latency))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_OBS_005",
    category: "RESILIENCE",
    name: "Audit trail absent",
    severity: "major",
    description: "Operation sensible sans trace d audit",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:delete|update|create)\w*\((?![\s\S]{0,200}(?:audit|Audit|trace|log))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_OBS_006",
    category: "RESILIENCE",
    name: "Error rate monitoring",
    severity: "minor",
    description: "Pas de monitoring du taux d erreur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch[\s\S]{0,100}(?:log|throw)(?![\s\S]{0,200}(?:errorRate|errorCount|metric))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_OBS_007",
    category: "RESILIENCE",
    name: "Queue depth monitoring",
    severity: "minor",
    description: "File d attente sans monitoring de profondeur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:Queue|BlockingQueue)(?![\s\S]{0,300}(?:size|depth|monitor))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_OBS_008",
    category: "RESILIENCE",
    name: "Memory monitoring absent",
    severity: "minor",
    description: "Pas de monitoring memoire pour operations lourdes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:byte\[\]|ByteBuffer|InputStream)(?![\s\S]{0,300}(?:memory|Memory|heap|Heap))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_OBS_009",
    category: "RESILIENCE",
    name: "Dependency health absent",
    severity: "minor",
    description: "Pas de verification sante des dependances",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:DataSource|ConnectionFactory)(?![\s\S]{0,500}(?:health|ping|isValid))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "RES_OBS_010",
    category: "RESILIENCE",
    name: "Log aggregation absent",
    severity: "minor",
    description: "Logs non structures pour aggregation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:info|error)\s*\(\s*["'][^{]*["']/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
