/**
 * cloudNativeRules — Auto-generated rules for cloud
 * Total: 55 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const cloudNativeRules: Rule[] = [
  {
    id: "CLOUD_12F_001",
    category: "CLOUD_NATIVE",
    name: "Config hardcodee",
    severity: "critical",
    description: "Configuration en dur au lieu de variable d environnement",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:url|host|port|database)\s*=\s*["'](?:localhost|127\.0\.0\.1|jdbc:)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_002",
    category: "CLOUD_NATIVE",
    name: "Port hardcode",
    severity: "major",
    description: "Port en dur au lieu de variable d environnement",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.listen\s*\(\s*\d+|port\s*=\s*\d{4}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_003",
    category: "CLOUD_NATIVE",
    name: "File system state",
    severity: "major",
    description: "Etat stocke sur le systeme de fichiers local",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+File\s*\(\s*["']\/(?:tmp|var|data)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_004",
    category: "CLOUD_NATIVE",
    name: "Session sticky",
    severity: "major",
    description: "Session HTTP sticky au lieu de store distribue",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /HttpSession|getSession\(\)(?!.*redis|.*Redis|.*distributed)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_005",
    category: "CLOUD_NATIVE",
    name: "Log to file",
    severity: "major",
    description: "Logs ecrits dans fichier au lieu de stdout",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /FileAppender|FileHandler|new\s+FileWriter.*log/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_006",
    category: "CLOUD_NATIVE",
    name: "Process singleton",
    severity: "major",
    description: "Application supposant instance unique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /static\s+\w+\s+instance\s*=|Singleton/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_007",
    category: "CLOUD_NATIVE",
    name: "Build dependency",
    severity: "minor",
    description: "Dependance de build non declaree",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /System\.getProperty\s*\(\s*["'](?!java\.)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_008",
    category: "CLOUD_NATIVE",
    name: "Dev/Prod parity",
    severity: "major",
    description: "Code specifique a un environnement",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /if\s*\(.*(?:isDev|isProd|isLocal|env.*==.*["']dev)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_009",
    category: "CLOUD_NATIVE",
    name: "Admin process",
    severity: "minor",
    description: "Processus admin couple au code applicatif",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /public\s+static\s+void\s+main.*(?:migrate|seed|admin)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_010",
    category: "CLOUD_NATIVE",
    name: "Backing service coupled",
    severity: "major",
    description: "Service externe couple au code au lieu de config",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+\w+\(\s*["'](?:mysql|postgres|redis|rabbit|kafka):\/\//g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_011",
    category: "CLOUD_NATIVE",
    name: "Startup slow",
    severity: "minor",
    description: "Initialisation lente au demarrage",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /static\s*\{[\s\S]{500,}?\}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_012",
    category: "CLOUD_NATIVE",
    name: "Graceful shutdown absent",
    severity: "major",
    description: "Pas de gestion arret gracieux",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /main\s*\([\s\S]{0,2000}(?!.*shutdownHook|.*addShutdownHook)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_013",
    category: "CLOUD_NATIVE",
    name: "Secret in code",
    severity: "critical",
    description: "Secret/credential en dur dans le code",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:password|secret|apiKey|api_key)\s*=\s*["'][^"']{8,}["']/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_014",
    category: "CLOUD_NATIVE",
    name: "Absolute path",
    severity: "major",
    description: "Chemin absolu en dur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /["']\/(?:opt|usr|home|etc|var)\/\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_12F_015",
    category: "CLOUD_NATIVE",
    name: "Timezone hardcode",
    severity: "minor",
    description: "Timezone en dur au lieu de UTC",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /TimeZone\.getTimeZone\s*\(\s*["'](?!UTC)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_001",
    category: "CLOUD_NATIVE",
    name: "JVM memory hardcode",
    severity: "major",
    description: "Memoire JVM en dur au lieu de limites container",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /-Xmx\d+|-Xms\d+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_002",
    category: "CLOUD_NATIVE",
    name: "Thread count hardcode",
    severity: "major",
    description: "Nombre de threads en dur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+\w+ThreadPool\s*\(\s*\d{2,}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_003",
    category: "CLOUD_NATIVE",
    name: "PID file",
    severity: "minor",
    description: "Fichier PID non compatible avec containers",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.pid["']|pidFile/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_004",
    category: "CLOUD_NATIVE",
    name: "Native library",
    severity: "major",
    description: "Dependance native non portable",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /System\.loadLibrary|System\.load\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_005",
    category: "CLOUD_NATIVE",
    name: "Temp file cleanup",
    severity: "minor",
    description: "Fichiers temporaires non nettoyes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createTempFile(?![\s\S]{0,300}(?:deleteOnExit|delete\(\)))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_006",
    category: "CLOUD_NATIVE",
    name: "DNS cache",
    severity: "minor",
    description: "Cache DNS JVM non configure pour containers",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /InetAddress\.getByName(?![\s\S]{0,200}(?:networkaddress\.cache\.ttl))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_007",
    category: "CLOUD_NATIVE",
    name: "Signal handling",
    severity: "minor",
    description: "Pas de gestion des signaux SIGTERM/SIGINT",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:main|Application)(?![\s\S]{0,2000}(?:SIGTERM|SIGINT|Signal))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_008",
    category: "CLOUD_NATIVE",
    name: "Root user",
    severity: "minor",
    description: "Application executee en root",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:chmod\s+777|0\.0\.0\.0|EXPOSE\s+(?:80|443)\b)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_009",
    category: "CLOUD_NATIVE",
    name: "Large image",
    severity: "minor",
    description: "Image Docker potentiellement trop grande",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /FROM\s+(?!.*alpine|.*slim|.*distroless)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_010",
    category: "CLOUD_NATIVE",
    name: "Multi-stage absent",
    severity: "minor",
    description: "Dockerfile sans multi-stage build",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /FROM[\s\S]*(?!FROM)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_011",
    category: "CLOUD_NATIVE",
    name: "Healthcheck absent",
    severity: "major",
    description: "Container sans healthcheck",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:EXPOSE|CMD)(?![\s\S]{0,500}HEALTHCHECK)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_012",
    category: "CLOUD_NATIVE",
    name: "Volume mount",
    severity: "minor",
    description: "Donnees persistantes sans volume explicite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+File\s*\(\s*["']\/data/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_013",
    category: "CLOUD_NATIVE",
    name: "Env file committed",
    severity: "critical",
    description: "Fichier .env commite dans le repository",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.env["']|dotenv/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_014",
    category: "CLOUD_NATIVE",
    name: "Connection string hardcode",
    severity: "critical",
    description: "Connection string en dur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /jdbc:\w+:\/\/\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_CTR_015",
    category: "CLOUD_NATIVE",
    name: "Cache local filesystem",
    severity: "major",
    description: "Cache sur filesystem local au lieu de Redis/Memcached",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+File.*cache|cacheDir.*new\s+File/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_001",
    category: "CLOUD_NATIVE",
    name: "Liveness probe absent",
    severity: "major",
    description: "Pas de liveness probe configuree",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:liveness|health|actuator))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_002",
    category: "CLOUD_NATIVE",
    name: "Readiness probe absent",
    severity: "major",
    description: "Pas de readiness probe configuree",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:readiness|ready|startup))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_003",
    category: "CLOUD_NATIVE",
    name: "Resource limits absent",
    severity: "major",
    description: "Pas de limites de ressources definies",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:Deployment|Pod)(?![\s\S]{0,500}(?:resources|limits|requests))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_004",
    category: "CLOUD_NATIVE",
    name: "ConfigMap non utilise",
    severity: "minor",
    description: "Configuration en dur au lieu de ConfigMap",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:properties|config)\s*=\s*new\s+Properties/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_005",
    category: "CLOUD_NATIVE",
    name: "Secret non utilise",
    severity: "critical",
    description: "Secret en dur au lieu de Kubernetes Secret",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:password|secret|key)\s*=\s*["'][^"']{8,}["'](?!.*env|.*config)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_006",
    category: "CLOUD_NATIVE",
    name: "Service discovery hardcode",
    severity: "major",
    description: "URL de service en dur au lieu de DNS K8s",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /["']https?:\/\/(?:localhost|\d+\.\d+\.\d+\.\d+)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_007",
    category: "CLOUD_NATIVE",
    name: "Horizontal scaling blocker",
    severity: "major",
    description: "Pattern qui empeche le scaling horizontal",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /static\s+(?:Map|Set|List)\s*<.*>\s*\w+\s*=\s*(?:new|Collections)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_008",
    category: "CLOUD_NATIVE",
    name: "Stateful in stateless",
    severity: "major",
    description: "Etat mutable dans service suppose stateless",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Stateless|Service)[\s\S]{0,500}(?:private\s+(?:Map|List|Set)\s*<)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_009",
    category: "CLOUD_NATIVE",
    name: "Init container absent",
    severity: "minor",
    description: "Pas d init container pour pre-conditions",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:waitFor|retry.*connect|checkDatabase)[\s\S]{0,200}(?:Thread\.sleep|while)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_010",
    category: "CLOUD_NATIVE",
    name: "Pod disruption budget",
    severity: "minor",
    description: "Pas de PodDisruptionBudget pour haute disponibilite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /replicas\s*:\s*[1-9](?![\s\S]{0,500}PodDisruptionBudget)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_011",
    category: "CLOUD_NATIVE",
    name: "Network policy absent",
    severity: "minor",
    description: "Pas de NetworkPolicy pour isolation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:Service|Deployment)(?![\s\S]{0,500}NetworkPolicy)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_012",
    category: "CLOUD_NATIVE",
    name: "Rolling update absent",
    severity: "minor",
    description: "Pas de strategie de rolling update",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:Deployment)(?![\s\S]{0,500}(?:rollingUpdate|RollingUpdate))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_013",
    category: "CLOUD_NATIVE",
    name: "Persistent volume",
    severity: "minor",
    description: "Stockage local au lieu de PersistentVolume",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+File\s*\(\s*["'](?!\/tmp)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_014",
    category: "CLOUD_NATIVE",
    name: "Sidecar pattern absent",
    severity: "minor",
    description: "Pas de sidecar pour logging/monitoring",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:sidecar|Sidecar|proxy|Proxy))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_K8S_015",
    category: "CLOUD_NATIVE",
    name: "Namespace absent",
    severity: "minor",
    description: "Pas de namespace specifique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:apiVersion|kind)(?![\s\S]{0,200}namespace)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_MS_001",
    category: "CLOUD_NATIVE",
    name: "Monolith coupling",
    severity: "major",
    description: "Couplage fort entre modules (monolithe)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+\w+\.(?:module|service)\.\w+\.(?:module|service)\./g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_MS_002",
    category: "CLOUD_NATIVE",
    name: "Shared database",
    severity: "major",
    description: "Base de donnees partagee entre services",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:DataSource|EntityManager)[\s\S]{0,200}(?:shared|common|global)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_MS_003",
    category: "CLOUD_NATIVE",
    name: "Distributed transaction",
    severity: "major",
    description: "Transaction distribuee (2PC) au lieu de saga",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:XADataSource|XAResource|TwoPhaseCommit)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_MS_004",
    category: "CLOUD_NATIVE",
    name: "Sync communication",
    severity: "major",
    description: "Communication synchrone entre services",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient|HttpClient)\.(?:get|post)(?![\s\S]{0,200}(?:async|Async|reactive))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_MS_005",
    category: "CLOUD_NATIVE",
    name: "API versioning absent",
    severity: "minor",
    description: "API sans versioning",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Path|RequestMapping)\s*\(\s*["']\/(?!v\d)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_MS_006",
    category: "CLOUD_NATIVE",
    name: "Contract testing absent",
    severity: "minor",
    description: "Pas de test de contrat entre services",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient)(?![\s\S]{0,2000}(?:contract|Contract|pact|Pact))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_MS_007",
    category: "CLOUD_NATIVE",
    name: "Event sourcing absent",
    severity: "minor",
    description: "Pas d event sourcing pour audit trail",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:save|update|delete)\w*\((?![\s\S]{0,200}(?:event|Event|publish))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_MS_008",
    category: "CLOUD_NATIVE",
    name: "CQRS absent",
    severity: "minor",
    description: "Pas de separation commande/requete",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Service[\s\S]{0,500}(?:find|get|list)[\s\S]{0,500}(?:save|update|delete)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_MS_009",
    category: "CLOUD_NATIVE",
    name: "Gateway absent",
    severity: "minor",
    description: "Pas de API gateway pour routage",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:@Controller|@RestController)(?![\s\S]{0,2000}(?:gateway|Gateway|zuul|Zuul))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CLOUD_MS_010",
    category: "CLOUD_NATIVE",
    name: "Service mesh absent",
    severity: "minor",
    description: "Pas de service mesh pour observabilite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:istio|Istio|linkerd|envoy))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
