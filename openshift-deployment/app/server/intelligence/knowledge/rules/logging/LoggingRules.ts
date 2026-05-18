/**
 * loggingRules — Auto-generated rules for logging
 * Total: 40 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const loggingRules: Rule[] = [
  {
    id: "LOG_BP_001",
    category: "LOGGING",
    name: "System.out au lieu de logger",
    severity: "major",
    description: "System.out.println au lieu de framework de logging",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /System\.out\.print/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_002",
    category: "LOGGING",
    name: "System.err au lieu de logger",
    severity: "major",
    description: "System.err.println au lieu de logger.error",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /System\.err\.print/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_003",
    category: "LOGGING",
    name: "e.printStackTrace()",
    severity: "major",
    description: "printStackTrace() au lieu de logger.error(msg, e)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.printStackTrace\s*\(\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_004",
    category: "LOGGING",
    name: "Log sans niveau",
    severity: "minor",
    description: "Log sans niveau explicite (debug/info/warn/error)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\s*\(\s*["']/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_005",
    category: "LOGGING",
    name: "Log concatenation",
    severity: "minor",
    description: "Concatenation dans log au lieu de placeholder {}",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:debug|info|warn|error)\s*\(\s*["']\s*\+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_006",
    category: "LOGGING",
    name: "Log niveau incorrect",
    severity: "minor",
    description: "Exception loguee en info/debug au lieu de error/warn",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:debug|info)\s*\(.*(?:exception|error|fail)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_007",
    category: "LOGGING",
    name: "Log sans contexte",
    severity: "minor",
    description: "Message de log sans contexte metier",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:debug|info|warn|error)\s*\(\s*["'][^"']{0,20}["']\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_008",
    category: "LOGGING",
    name: "Log dans boucle",
    severity: "major",
    description: "Log dans boucle for/while (performance)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /for\s*\([\s\S]{0,200}log\w*\.(?:debug|info|warn|error)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_009",
    category: "LOGGING",
    name: "Log guard absent",
    severity: "minor",
    description: "Log debug sans isDebugEnabled guard",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.debug\s*\((?![\s\S]{0,50}isDebugEnabled)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_010",
    category: "LOGGING",
    name: "Logger non static final",
    severity: "minor",
    description: "Logger non declare static final",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:private|protected|public)\s+(?!static\s+final).*Logger/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_011",
    category: "LOGGING",
    name: "Logger mauvais nom classe",
    severity: "minor",
    description: "Logger avec nom de classe incorrect",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /LoggerFactory\.getLogger\s*\(\s*(?!\w+\.class)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_012",
    category: "LOGGING",
    name: "Log multiline",
    severity: "minor",
    description: "Message log sur plusieurs lignes (probleme parsing)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:debug|info|warn|error)\s*\([\s\S]{0,50}\\n/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_013",
    category: "LOGGING",
    name: "Log exception sans stack",
    severity: "major",
    description: "Exception loguee sans stack trace",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.error\s*\(\s*(?:e\.getMessage\(\)|["'][^"']*["'])\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_014",
    category: "LOGGING",
    name: "Log double exception",
    severity: "minor",
    description: "Exception loguee puis relancee (double log)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.error[\s\S]{0,100}throw/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_BP_015",
    category: "LOGGING",
    name: "Log toString() implicite",
    severity: "minor",
    description: "Objet dans log sans toString() explicite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\s*\(.*\+\s*\w+\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_001",
    category: "LOGGING",
    name: "Password en log",
    severity: "critical",
    description: "Mot de passe logue en clair",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:password|passwd|pwd)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_002",
    category: "LOGGING",
    name: "Token en log",
    severity: "critical",
    description: "Token/API key logue en clair",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:token|apiKey|api_key|secret)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_003",
    category: "LOGGING",
    name: "Email en log",
    severity: "major",
    description: "Adresse email loguee sans masquage",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:email|mail|courriel)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_004",
    category: "LOGGING",
    name: "Phone en log",
    severity: "major",
    description: "Numero de telephone logue sans masquage",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:phone|telephone|mobile|gsm)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_005",
    category: "LOGGING",
    name: "Card number en log",
    severity: "critical",
    description: "Numero de carte logue en clair",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:cardNumber|numeroCarte|pan|creditCard)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_006",
    category: "LOGGING",
    name: "IBAN en log",
    severity: "critical",
    description: "IBAN logue en clair",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:iban|accountNumber|numeroCompte)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_007",
    category: "LOGGING",
    name: "SSN en log",
    severity: "critical",
    description: "Numero securite sociale logue",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:ssn|numSecu|socialSecurity)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_008",
    category: "LOGGING",
    name: "Address en log",
    severity: "major",
    description: "Adresse postale loguee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:address|adresse|postalCode|codePostal)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_009",
    category: "LOGGING",
    name: "Birth date en log",
    severity: "major",
    description: "Date de naissance loguee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:birthDate|dateNaissance|dob)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_010",
    category: "LOGGING",
    name: "SQL query en log",
    severity: "major",
    description: "Requete SQL complete loguee (risque exposition)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:SELECT|INSERT|UPDATE|DELETE).*(?:FROM|INTO|SET)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_011",
    category: "LOGGING",
    name: "Request body en log",
    severity: "major",
    description: "Corps de requete HTTP logue en entier",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:requestBody|getBody|getInputStream)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_012",
    category: "LOGGING",
    name: "Session ID en log",
    severity: "major",
    description: "ID de session logue",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:sessionId|jsessionid|JSESSIONID)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_013",
    category: "LOGGING",
    name: "Cookie en log",
    severity: "major",
    description: "Cookie logue en clair",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:cookie|Cookie)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_014",
    category: "LOGGING",
    name: "Header auth en log",
    severity: "critical",
    description: "Header Authorization logue",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:Authorization|Bearer|Basic)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_SEC_015",
    category: "LOGGING",
    name: "IP address en log",
    severity: "minor",
    description: "Adresse IP loguee sans justification",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:getRemoteAddr|ipAddress|clientIp)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_STRUCT_001",
    category: "LOGGING",
    name: "Log non structure",
    severity: "minor",
    description: "Log sans format structure (JSON/MDC)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:debug|info|warn|error)\s*\(\s*["'][^{]*["']\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_STRUCT_002",
    category: "LOGGING",
    name: "MDC non nettoye",
    severity: "major",
    description: "MDC.put sans MDC.remove dans finally",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /MDC\.put(?![\s\S]{0,500}MDC\.(?:remove|clear))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_STRUCT_003",
    category: "LOGGING",
    name: "Correlation ID absent",
    severity: "major",
    description: "Pas de correlation ID dans les logs",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:info|error)(?!.*(?:correlationId|requestId|traceId))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_STRUCT_004",
    category: "LOGGING",
    name: "Timestamp absent",
    severity: "minor",
    description: "Log sans timestamp explicite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\((?!.*(?:timestamp|time|date))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_STRUCT_005",
    category: "LOGGING",
    name: "Log level dynamique",
    severity: "minor",
    description: "Niveau de log determine dynamiquement",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /if\s*\(.*level.*\)\s*log\w*\./g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_STRUCT_006",
    category: "LOGGING",
    name: "Log rotation absent",
    severity: "minor",
    description: "Pas de configuration de rotation des logs",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /FileAppender(?!.*Rolling|.*Size|.*Time)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_STRUCT_007",
    category: "LOGGING",
    name: "Log async absent",
    severity: "minor",
    description: "Logging synchrone pour haute charge",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:FileAppender|ConsoleAppender)(?!.*Async)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_STRUCT_008",
    category: "LOGGING",
    name: "Log encoding absent",
    severity: "minor",
    description: "Pas de charset specifie pour les logs",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /FileAppender(?!.*charset|.*encoding)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_STRUCT_009",
    category: "LOGGING",
    name: "Log sans categorie",
    severity: "minor",
    description: "Logger sans categorie/package specifique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /LoggerFactory\.getLogger\s*\(\s*["']/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "LOG_STRUCT_010",
    category: "LOGGING",
    name: "Log exception chain",
    severity: "minor",
    description: "Exception wrappee sans cause originale",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+\w+Exception\s*\(\s*(?:e\.getMessage\(\)|["'])(?!\s*,\s*e)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
