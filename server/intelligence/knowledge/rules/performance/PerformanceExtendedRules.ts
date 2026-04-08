/**
 * performanceExtendedRules — Auto-generated rules for performance
 * Total: 45 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const performanceExtendedRules: Rule[] = [
  {
    id: "PERF_NQ_001",
    category: "PERFORMANCE",
    name: "N+1 boucle query",
    severity: "critical",
    description: "Requete SQL dans une boucle for/while",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /for\s*\([\s\S]{0,200}(?:executeQuery|createQuery|find\w+)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_002",
    category: "PERFORMANCE",
    name: "SELECT * usage",
    severity: "major",
    description: "SELECT * au lieu de colonnes specifiques",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SELECT\s+\*/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_003",
    category: "PERFORMANCE",
    name: "Count sans index",
    severity: "major",
    description: "COUNT(*) sans clause WHERE indexee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /COUNT\s*\(\s*\*\s*\)(?!.*WHERE.*indexed)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_004",
    category: "PERFORMANCE",
    name: "LIKE %prefix",
    severity: "major",
    description: "LIKE avec wildcard en debut empeche index",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /LIKE\s+['"]%/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_005",
    category: "PERFORMANCE",
    name: "Subquery correlate",
    severity: "major",
    description: "Sous-requete correlee dans SELECT",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SELECT[\s\S]{0,100}\(\s*SELECT/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_006",
    category: "PERFORMANCE",
    name: "ORDER BY sans index",
    severity: "minor",
    description: "ORDER BY sur colonne non indexee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ORDER\s+BY(?!.*indexed)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_007",
    category: "PERFORMANCE",
    name: "DISTINCT excessif",
    severity: "minor",
    description: "DISTINCT utilise pour masquer duplicats",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SELECT\s+DISTINCT/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_008",
    category: "PERFORMANCE",
    name: "JOIN sans ON",
    severity: "critical",
    description: "JOIN cartesien sans condition ON",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /,\s*\w+\s+WHERE(?!.*JOIN.*ON)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_009",
    category: "PERFORMANCE",
    name: "Fetch size absent",
    severity: "major",
    description: "ResultSet sans fetchSize configure",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /executeQuery(?!.*setFetchSize)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_010",
    category: "PERFORMANCE",
    name: "Batch insert absent",
    severity: "major",
    description: "Insertions multiples sans batch",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /for\s*\([\s\S]{0,200}(?:INSERT|\.save\(|\.persist\()/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_011",
    category: "PERFORMANCE",
    name: "Eager loading excessif",
    severity: "major",
    description: "FetchType.EAGER sur collection",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /FetchType\.EAGER|fetch\s*=\s*EAGER/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_012",
    category: "PERFORMANCE",
    name: "Lazy loading N+1",
    severity: "major",
    description: "Acces lazy dans boucle sans fetch join",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.get\w+\(\)[\s\S]{0,50}for\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_013",
    category: "PERFORMANCE",
    name: "Pagination memoire",
    severity: "critical",
    description: "findAll() suivi de subList au lieu de LIMIT",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /findAll\(\)[\s\S]{0,200}subList/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_014",
    category: "PERFORMANCE",
    name: "Connection non fermee",
    severity: "critical",
    description: "Connection JDBC non fermee dans finally",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /getConnection\(\)(?![\s\S]{0,500}\.close\(\))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_NQ_015",
    category: "PERFORMANCE",
    name: "Statement non prepare",
    severity: "major",
    description: "Statement au lieu de PreparedStatement",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createStatement\s*\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_001",
    category: "PERFORMANCE",
    name: "String concat boucle",
    severity: "major",
    description: "Concatenation String dans boucle au lieu de StringBuilder",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /for\s*\([\s\S]{0,200}\+\s*=\s*["']/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_002",
    category: "PERFORMANCE",
    name: "Liste sans capacite",
    severity: "minor",
    description: "ArrayList sans capacite initiale pour grande collection",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+ArrayList\s*\(\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_003",
    category: "PERFORMANCE",
    name: "Autoboxing boucle",
    severity: "minor",
    description: "Autoboxing dans boucle intensive",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /for\s*\([\s\S]{0,100}(?:Integer|Long|Double)\s+\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_004",
    category: "PERFORMANCE",
    name: "Objet dans boucle",
    severity: "major",
    description: "Creation objet dans boucle chaude",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /for\s*\([\s\S]{0,100}new\s+(?:Date|SimpleDateFormat|DecimalFormat)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_005",
    category: "PERFORMANCE",
    name: "Stream non ferme",
    severity: "major",
    description: "InputStream/OutputStream non ferme",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+\w*(?:Input|Output)Stream(?![\s\S]{0,300}\.close\(\)|[\s\S]{0,50}try\s*\()/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_006",
    category: "PERFORMANCE",
    name: "ResultSet non ferme",
    severity: "critical",
    description: "ResultSet non ferme dans finally",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /executeQuery\(\)(?![\s\S]{0,500}\.close\(\))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_007",
    category: "PERFORMANCE",
    name: "Cache sans eviction",
    severity: "major",
    description: "Cache HashMap sans politique eviction",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+HashMap.*cache|cache.*new\s+HashMap(?!.*evict|.*expire|.*max)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_008",
    category: "PERFORMANCE",
    name: "Static collection",
    severity: "major",
    description: "Collection statique qui croit sans limite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /static.*(?:List|Map|Set)\s*<.*>\s*\w+\s*=\s*new/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_009",
    category: "PERFORMANCE",
    name: "Finalizer usage",
    severity: "major",
    description: "Methode finalize() obsolete et couteuse",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /protected\s+void\s+finalize\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_010",
    category: "PERFORMANCE",
    name: "Large array allocation",
    severity: "major",
    description: "Allocation tableau > 10MB",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+byte\s*\[\s*\d{7,}\s*\]/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_011",
    category: "PERFORMANCE",
    name: "ThreadLocal leak",
    severity: "major",
    description: "ThreadLocal sans remove() dans finally",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ThreadLocal(?![\s\S]{0,500}\.remove\(\))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_012",
    category: "PERFORMANCE",
    name: "Regex recompile",
    severity: "minor",
    description: "Pattern.compile dans boucle ou methode appelee souvent",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Pattern\.compile\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_013",
    category: "PERFORMANCE",
    name: "String.intern abuse",
    severity: "minor",
    description: "String.intern() sur donnees variables",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.intern\s*\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_014",
    category: "PERFORMANCE",
    name: "Weak reference absent",
    severity: "minor",
    description: "Cache sans WeakReference pour objets lourds",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /cache.*put(?!.*Weak|.*Soft)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_MEM_015",
    category: "PERFORMANCE",
    name: "Buffer trop petit",
    severity: "minor",
    description: "BufferedReader/Writer avec buffer par defaut",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+Buffered(?:Reader|Writer)\s*\(\s*new/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_001",
    category: "PERFORMANCE",
    name: "Synchronized excessif",
    severity: "major",
    description: "Methode entiere synchronized au lieu de bloc",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /synchronized\s+\w+\s+\w+\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_002",
    category: "PERFORMANCE",
    name: "HashMap concurrent",
    severity: "critical",
    description: "HashMap partage entre threads sans synchronisation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:static|shared|volatile).*HashMap/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_003",
    category: "PERFORMANCE",
    name: "SimpleDateFormat partage",
    severity: "critical",
    description: "SimpleDateFormat partage entre threads (non thread-safe)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /static.*SimpleDateFormat/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_004",
    category: "PERFORMANCE",
    name: "Double-check locking",
    severity: "major",
    description: "Double-checked locking sans volatile",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /if\s*\(\s*\w+\s*==\s*null\s*\)[\s\S]{0,100}synchronized[\s\S]{0,100}if\s*\(\s*\w+\s*==\s*null/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_005",
    category: "PERFORMANCE",
    name: "Thread.sleep dans lock",
    severity: "critical",
    description: "Thread.sleep dans bloc synchronized",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /synchronized[\s\S]{0,200}Thread\.sleep/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_006",
    category: "PERFORMANCE",
    name: "Executor non ferme",
    severity: "major",
    description: "ExecutorService sans shutdown",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Executors\.new(?![\s\S]{0,500}shutdown)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_007",
    category: "PERFORMANCE",
    name: "Thread pool unbounded",
    severity: "major",
    description: "newCachedThreadPool sans limite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /newCachedThreadPool/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_008",
    category: "PERFORMANCE",
    name: "Volatile compose",
    severity: "major",
    description: "Volatile sur operation composee (check-then-act)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /volatile[\s\S]{0,100}if\s*\(.*\+\+|volatile[\s\S]{0,100}\+\+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_009",
    category: "PERFORMANCE",
    name: "Wait sans boucle",
    severity: "major",
    description: "wait() sans boucle while (spurious wakeup)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.wait\s*\(\)(?![\s\S]{0,50}while)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_010",
    category: "PERFORMANCE",
    name: "Lock ordering absent",
    severity: "critical",
    description: "Acquisition de locks dans ordre variable (deadlock)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /synchronized\s*\(\s*(\w+)\)[\s\S]{0,200}synchronized\s*\(\s*(?!\1)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_011",
    category: "PERFORMANCE",
    name: "Atomic non utilise",
    severity: "minor",
    description: "Compteur synchronized au lieu de AtomicInteger",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /synchronized[\s\S]{0,100}\+\+\s*\w*count/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_012",
    category: "PERFORMANCE",
    name: "ConcurrentModification",
    severity: "critical",
    description: "Modification collection pendant iteration",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /for\s*\([\s\S]{0,200}\.remove\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_013",
    category: "PERFORMANCE",
    name: "Future.get sans timeout",
    severity: "major",
    description: "Future.get() bloquant sans timeout",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.get\s*\(\s*\)(?!.*timeout)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_014",
    category: "PERFORMANCE",
    name: "Singleton non thread-safe",
    severity: "major",
    description: "Singleton lazy sans synchronisation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /static.*getInstance[\s\S]{0,100}if\s*\(\s*instance\s*==\s*null/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "PERF_CONC_015",
    category: "PERFORMANCE",
    name: "Busy wait",
    severity: "major",
    description: "Boucle active au lieu de wait/notify",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /while\s*\(.*\)\s*\{[\s\S]{0,50}Thread\.sleep\s*\(\s*\d{1,3}\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
