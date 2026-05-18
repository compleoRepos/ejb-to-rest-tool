/**
 * errorHandlingRules — Auto-generated rules for error-handling
 * Total: 35 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const errorHandlingRules: Rule[] = [
  {
    id: "ERR_001",
    category: "ERROR_HANDLING",
    name: "Catch generic Exception",
    severity: "critical",
    description: "Catch de Exception generique au lieu de specifique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*Exception\s+\w+\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_002",
    category: "ERROR_HANDLING",
    name: "Empty catch block",
    severity: "critical",
    description: "Bloc catch vide qui avale les erreurs",
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
    id: "ERR_003",
    category: "ERROR_HANDLING",
    name: "Catch Throwable",
    severity: "critical",
    description: "Catch de Throwable au lieu de Exception",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*Throwable\s+\w+\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_004",
    category: "ERROR_HANDLING",
    name: "Exception swallowed",
    severity: "major",
    description: "Exception attrapee et ignoree",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\([^)]+\)\s*\{[\s\S]{0,100}(?:\/\/\s*(?:ignore|todo|fixme)|return\s*;)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_005",
    category: "ERROR_HANDLING",
    name: "Throw generic",
    severity: "major",
    description: "Throw de Exception generique",
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
    id: "ERR_006",
    category: "ERROR_HANDLING",
    name: "Error code absent",
    severity: "major",
    description: "Exception sans code d erreur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /throw\s+new\s+\w+Exception\s*\(\s*["'](?!.*\b[A-Z]{2,5}_\d{3,5}\b)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_007",
    category: "ERROR_HANDLING",
    name: "Stack trace expose",
    severity: "critical",
    description: "Stack trace exposee au client",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:printStackTrace|getStackTrace|stackTrace)[\s\S]{0,200}(?:response|json|body)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_008",
    category: "ERROR_HANDLING",
    name: "Null return au lieu exception",
    severity: "major",
    description: "Retour null au lieu de lever une exception",
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
    id: "ERR_009",
    category: "ERROR_HANDLING",
    name: "Exception dans finally",
    severity: "critical",
    description: "Code pouvant lever exception dans finally",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /finally\s*\{[\s\S]{0,200}(?:\.close\(\)|throw)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_010",
    category: "ERROR_HANDLING",
    name: "Multi-catch absent",
    severity: "minor",
    description: "Catches multiples au lieu de multi-catch",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*\w+Exception\s+\w+\s*\)\s*\{[\s\S]{0,200}\}\s*catch\s*\(\s*\w+Exception/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_011",
    category: "ERROR_HANDLING",
    name: "Try-with-resources absent",
    severity: "major",
    description: "Pas de try-with-resources pour AutoCloseable",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:InputStream|OutputStream|Connection|Statement|ResultSet)\s+\w+\s*=(?![\s\S]{0,50}try\s*\()/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_012",
    category: "ERROR_HANDLING",
    name: "Checked exception abuse",
    severity: "minor",
    description: "Checked exception pour erreur de programmation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /throws\s+\w+Exception[\s\S]{0,200}(?:IllegalArgument|NullPointer|IndexOutOfBounds)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_013",
    category: "ERROR_HANDLING",
    name: "Exception wrapping absent",
    severity: "major",
    description: "Exception re-levee sans cause originale",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*\w+\s+(\w+)\s*\)[\s\S]{0,200}throw\s+new\s+\w+\((?![\s\S]{0,100}\1)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_014",
    category: "ERROR_HANDLING",
    name: "Custom exception absent",
    severity: "minor",
    description: "Pas d exceptions custom pour le domaine",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /throw\s+new\s+(?:RuntimeException|Exception|IllegalStateException)\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_015",
    category: "ERROR_HANDLING",
    name: "Error hierarchy absent",
    severity: "minor",
    description: "Pas de hierarchie d exceptions metier",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Exception\s+extends\s+(?:RuntimeException|Exception)(?![\s\S]{0,500}class\s+\w+Exception\s+extends\s+\w+Exception)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_016",
    category: "ERROR_HANDLING",
    name: "Assertion absent",
    severity: "minor",
    description: "Pas d assertions pour preconditions",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:public|protected)\s+\w+\s+\w+\s*\((?![\s\S]{0,200}(?:assert|Objects\.requireNonNull|Preconditions\.check))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_017",
    category: "ERROR_HANDLING",
    name: "Optional misuse",
    severity: "minor",
    description: "Optional.get() sans isPresent()",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.get\s*\(\s*\)(?![\s\S]{0,50}(?:isPresent|ifPresent|orElse))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_018",
    category: "ERROR_HANDLING",
    name: "NullPointerException",
    severity: "major",
    description: "Risque de NullPointerException",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.\w+\s*\(\)(?:\.\w+\s*\(\)){3,}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_019",
    category: "ERROR_HANDLING",
    name: "ClassCastException",
    severity: "major",
    description: "Cast sans instanceof",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\(\s*\w+\s*\)\s*\w+(?![\s\S]{0,100}instanceof)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_020",
    category: "ERROR_HANDLING",
    name: "ArrayIndexOutOfBounds",
    severity: "major",
    description: "Acces tableau sans verification de taille",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\[\s*\w+\s*\](?![\s\S]{0,100}(?:\.length|\.size\(\)|bounds|index.*<))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_021",
    category: "ERROR_HANDLING",
    name: "NumberFormatException",
    severity: "major",
    description: "Parsing nombre sans try-catch",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:Integer|Long|Double)\.parse\w+\s*\((?![\s\S]{0,200}catch)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_022",
    category: "ERROR_HANDLING",
    name: "DateTimeParseException",
    severity: "major",
    description: "Parsing date sans try-catch",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:SimpleDateFormat|DateTimeFormatter)\.parse\s*\((?![\s\S]{0,200}catch)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_023",
    category: "ERROR_HANDLING",
    name: "IOException non geree",
    severity: "major",
    description: "IOException non geree dans IO",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:read|write|flush|close)\s*\((?![\s\S]{0,300}(?:catch.*IOException|throws.*IOException))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_024",
    category: "ERROR_HANDLING",
    name: "SQLException non geree",
    severity: "major",
    description: "SQLException non geree dans JDBC",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:executeQuery|executeUpdate|prepareStatement)\s*\((?![\s\S]{0,300}(?:catch.*SQLException|throws.*SQLException))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_025",
    category: "ERROR_HANDLING",
    name: "Timeout non gere",
    severity: "major",
    description: "Timeout non gere dans appels reseau",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:connect|send|receive|get)\s*\((?![\s\S]{0,300}(?:catch.*TimeoutException|timeout|Timeout))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_026",
    category: "ERROR_HANDLING",
    name: "Retry sans backoff",
    severity: "major",
    description: "Retry sans backoff exponentiel",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:retry|Retry)(?![\s\S]{0,200}(?:backoff|exponential|delay))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_027",
    category: "ERROR_HANDLING",
    name: "Fallback absent",
    severity: "major",
    description: "Pas de fallback pour operations critiques",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:catch|CircuitBreaker)(?![\s\S]{0,200}(?:fallback|Fallback|default|Default))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_028",
    category: "ERROR_HANDLING",
    name: "Error logging insuffisant",
    severity: "major",
    description: "Log d erreur sans contexte suffisant",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.error\s*\(\s*["'][^"']{0,30}["']\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_029",
    category: "ERROR_HANDLING",
    name: "Error notification absent",
    severity: "major",
    description: "Erreur critique sans notification",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch[\s\S]{0,200}(?:Critical|CRITICAL|fatal|FATAL)(?![\s\S]{0,200}(?:notify|alert|alarm))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_030",
    category: "ERROR_HANDLING",
    name: "Graceful degradation",
    severity: "major",
    description: "Pas de degradation gracieuse",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch[\s\S]{0,200}throw(?![\s\S]{0,200}(?:fallback|degrade|partial))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_031",
    category: "ERROR_HANDLING",
    name: "Dead letter queue",
    severity: "minor",
    description: "Pas de dead letter queue pour messages en echec",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:JmsTemplate|RabbitTemplate|KafkaTemplate)(?![\s\S]{0,500}(?:deadLetter|DLQ|dlq))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_032",
    category: "ERROR_HANDLING",
    name: "Compensation absent",
    severity: "major",
    description: "Pas de compensation pour saga pattern",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:@Transactional|transaction)[\s\S]{0,500}(?:remote|external|http)(?![\s\S]{0,500}(?:compensat|rollback|undo))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_033",
    category: "ERROR_HANDLING",
    name: "Idempotent retry",
    severity: "major",
    description: "Retry sur operation non idempotente",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:retry|Retry)[\s\S]{0,200}(?:POST|create|insert|delete)(?![\s\S]{0,200}(?:idempotent|Idempotent))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_034",
    category: "ERROR_HANDLING",
    name: "Poison pill handler",
    severity: "minor",
    description: "Pas de gestion des messages poison",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:onMessage|@JmsListener|@KafkaListener)(?![\s\S]{0,500}(?:poison|Poison|errorHandler|ErrorHandler))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ERR_035",
    category: "ERROR_HANDLING",
    name: "Circuit breaker config",
    severity: "minor",
    description: "Circuit breaker sans configuration adaptee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /CircuitBreaker(?![\s\S]{0,200}(?:failureRateThreshold|waitDurationInOpenState|slidingWindow))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
