/**
 * concurrencyRules — Auto-generated rules for concurrency
 * Total: 35 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const concurrencyRules: Rule[] = [
  {
    id: "CONC_001",
    category: "CONCURRENCY",
    name: "Synchronized method",
    severity: "major",
    description: "Methode synchronized au lieu de lock granulaire",
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
    id: "CONC_002",
    category: "CONCURRENCY",
    name: "Double-checked locking",
    severity: "critical",
    description: "Double-checked locking sans volatile",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /if\s*\(\s*\w+\s*==\s*null\s*\)\s*\{[\s\S]{0,200}synchronized[\s\S]{0,200}if\s*\(\s*\w+\s*==\s*null/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_003",
    category: "CONCURRENCY",
    name: "Thread.sleep dans loop",
    severity: "major",
    description: "Thread.sleep dans une boucle au lieu de wait/notify",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:while|for)\s*\([\s\S]{0,200}Thread\.sleep/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_004",
    category: "CONCURRENCY",
    name: "Race condition HashMap",
    severity: "critical",
    description: "HashMap partage entre threads sans synchronisation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:HashMap|ArrayList|HashSet)\s*<[\s\S]{0,100}>\s*\w+\s*=\s*new(?![\s\S]{0,200}(?:synchronized|Concurrent|Collections\.synchronized))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_005",
    category: "CONCURRENCY",
    name: "Thread non daemon",
    severity: "minor",
    description: "Thread non daemon qui empeche le shutdown",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+Thread\s*\((?![\s\S]{0,200}setDaemon\s*\(\s*true)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_006",
    category: "CONCURRENCY",
    name: "ExecutorService leak",
    severity: "major",
    description: "ExecutorService non ferme",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Executors\.new\w+Pool(?![\s\S]{0,500}(?:shutdown|close))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_007",
    category: "CONCURRENCY",
    name: "Future non verifie",
    severity: "major",
    description: "Future.get() sans timeout",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.get\s*\(\s*\)(?![\s\S]{0,50}(?:TimeUnit|timeout))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_008",
    category: "CONCURRENCY",
    name: "Volatile manquant",
    severity: "critical",
    description: "Variable partagee sans volatile",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:private|protected)\s+(?:boolean|int|long)\s+\w+(?:Flag|Status|Count|Running)(?![\s\S]{0,50}volatile)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_009",
    category: "CONCURRENCY",
    name: "AtomicInteger absent",
    severity: "minor",
    description: "Compteur partage sans AtomicInteger",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:private|protected)\s+int\s+\w*(?:count|counter|total|index)(?![\s\S]{0,100}(?:Atomic|volatile))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_010",
    category: "CONCURRENCY",
    name: "Lock ordering",
    severity: "critical",
    description: "Acquisition de locks dans un ordre inconsistant",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /synchronized\s*\(\s*(\w+)\s*\)[\s\S]{0,500}synchronized\s*\(\s*(?!\1)\w+\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_011",
    category: "CONCURRENCY",
    name: "Busy wait",
    severity: "major",
    description: "Attente active au lieu de condition variable",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /while\s*\(.*\)\s*\{\s*\}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_012",
    category: "CONCURRENCY",
    name: "Thread pool unbounded",
    severity: "major",
    description: "Thread pool sans limite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Executors\.newCachedThreadPool|new\s+ThreadPoolExecutor\s*\(\s*0/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_013",
    category: "CONCURRENCY",
    name: "CompletableFuture error",
    severity: "major",
    description: "CompletableFuture sans gestion d erreur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /CompletableFuture\.(?:supplyAsync|runAsync)(?![\s\S]{0,300}(?:exceptionally|handle|whenComplete))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_014",
    category: "CONCURRENCY",
    name: "Parallel stream danger",
    severity: "major",
    description: "Parallel stream avec effet de bord",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.parallelStream\s*\(\)[\s\S]{0,200}(?:\.forEach|\.collect)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_015",
    category: "CONCURRENCY",
    name: "ThreadLocal leak",
    severity: "major",
    description: "ThreadLocal sans remove dans finally",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ThreadLocal(?![\s\S]{0,500}\.remove\s*\(\))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_016",
    category: "CONCURRENCY",
    name: "Semaphore sans release",
    severity: "critical",
    description: "Semaphore acquire sans release dans finally",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.acquire\s*\((?![\s\S]{0,500}finally[\s\S]{0,200}\.release)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_017",
    category: "CONCURRENCY",
    name: "CountDownLatch timeout",
    severity: "major",
    description: "CountDownLatch.await() sans timeout",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /countDownLatch\.await\s*\(\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_018",
    category: "CONCURRENCY",
    name: "CyclicBarrier sans handler",
    severity: "minor",
    description: "CyclicBarrier sans barrier action",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+CyclicBarrier\s*\(\s*\d+\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_019",
    category: "CONCURRENCY",
    name: "ReadWriteLock absent",
    severity: "minor",
    description: "Pas de ReadWriteLock pour lecture concurrente",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /synchronized[\s\S]{0,200}(?:get\w+|read\w+|find\w+)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_020",
    category: "CONCURRENCY",
    name: "StampedLock absent",
    severity: "minor",
    description: "Pas de StampedLock pour lecture optimiste",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ReentrantReadWriteLock(?![\s\S]{0,500}StampedLock)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_021",
    category: "CONCURRENCY",
    name: "Phaser absent",
    severity: "minor",
    description: "Pas de Phaser pour synchronisation par phases",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /CountDownLatch[\s\S]{0,200}CountDownLatch/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_022",
    category: "CONCURRENCY",
    name: "ForkJoinPool custom",
    severity: "minor",
    description: "Pas de ForkJoinPool custom pour parallelStream",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.parallelStream\s*\(\)(?![\s\S]{0,500}ForkJoinPool)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_023",
    category: "CONCURRENCY",
    name: "Interrupt non gere",
    severity: "major",
    description: "InterruptedException catch sans re-interrupt",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\(\s*InterruptedException(?![\s\S]{0,200}(?:interrupt\(\)|Thread\.currentThread\(\)\.interrupt))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_024",
    category: "CONCURRENCY",
    name: "Blocking queue absent",
    severity: "minor",
    description: "Producer-consumer sans BlockingQueue",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:LinkedList|ArrayList)[\s\S]{0,200}(?:wait\s*\(|notify)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_025",
    category: "CONCURRENCY",
    name: "Exchanger absent",
    severity: "minor",
    description: "Echange de donnees entre threads sans Exchanger",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:synchronized|Lock)[\s\S]{0,200}(?:swap|exchange)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_026",
    category: "CONCURRENCY",
    name: "Virtual thread absent",
    severity: "minor",
    description: "Thread classique au lieu de virtual thread (Java 21+)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+Thread\s*\(|Executors\.newFixedThreadPool/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_027",
    category: "CONCURRENCY",
    name: "Structured concurrency",
    severity: "minor",
    description: "Pas de structured concurrency (Java 21+)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /CompletableFuture\.allOf(?![\s\S]{0,500}StructuredTaskScope)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_028",
    category: "CONCURRENCY",
    name: "Scoped value absent",
    severity: "minor",
    description: "ThreadLocal au lieu de ScopedValue (Java 21+)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ThreadLocal(?![\s\S]{0,500}ScopedValue)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_029",
    category: "CONCURRENCY",
    name: "Atomic reference absent",
    severity: "minor",
    description: "Reference partagee sans AtomicReference",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:private|protected)\s+\w+\s+\w+(?:Ref|Reference|Current)(?![\s\S]{0,100}(?:Atomic|volatile))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_030",
    category: "CONCURRENCY",
    name: "CAS operation absent",
    severity: "minor",
    description: "Pas d operation CAS pour mise a jour atomique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /synchronized[\s\S]{0,100}(?:\+\+|--|\+=|-=)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_031",
    category: "CONCURRENCY",
    name: "Disruptor pattern",
    severity: "minor",
    description: "Queue standard au lieu de Disruptor pour haute perf",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:BlockingQueue|ConcurrentLinkedQueue)(?![\s\S]{0,500}Disruptor)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_032",
    category: "CONCURRENCY",
    name: "Actor model absent",
    severity: "minor",
    description: "Pas de modele acteur pour concurrence complexe",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /synchronized[\s\S]{0,500}synchronized(?![\s\S]{0,500}(?:Akka|Actor|ActorSystem))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_033",
    category: "CONCURRENCY",
    name: "Reactive absent",
    severity: "minor",
    description: "Pas de programmation reactive pour IO non bloquant",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:InputStream|OutputStream|Socket)(?![\s\S]{0,500}(?:Flux|Mono|Observable|Publisher))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_034",
    category: "CONCURRENCY",
    name: "Backpressure absent",
    severity: "major",
    description: "Pas de backpressure dans pipeline async",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:Publisher|Flux|Observable)(?![\s\S]{0,300}(?:backpressure|onBackpressure|request\())/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CONC_035",
    category: "CONCURRENCY",
    name: "Timeout global absent",
    severity: "major",
    description: "Pas de timeout global sur operations concurrentes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ExecutorService(?![\s\S]{0,500}(?:awaitTermination|invokeAll.*timeout))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
