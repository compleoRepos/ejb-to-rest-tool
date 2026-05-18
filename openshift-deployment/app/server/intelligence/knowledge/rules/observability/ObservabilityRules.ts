/**
 * observabilityRules — Auto-generated rules for observability
 * Total: 30 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const observabilityRules: Rule[] = [
  {
    id: "OBS_001",
    category: "OBSERVABILITY",
    name: "Health endpoint absent",
    severity: "major",
    description: "Pas de health check endpoint",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:health|Health|actuator|Actuator))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_002",
    category: "OBSERVABILITY",
    name: "Metrics absent",
    severity: "major",
    description: "Pas de metriques applicatives",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?:Service|Controller)(?![\s\S]{0,2000}(?:Metric|Counter|Gauge|Timer|MeterRegistry))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_003",
    category: "OBSERVABILITY",
    name: "Tracing absent",
    severity: "major",
    description: "Pas de tracing distribue",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient|HttpClient)(?![\s\S]{0,500}(?:Tracer|Span|TraceId|B3))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_004",
    category: "OBSERVABILITY",
    name: "Correlation ID absent",
    severity: "major",
    description: "Pas de correlation ID dans les logs",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:info|warn|error)(?![\s\S]{0,100}(?:correlationId|traceId|requestId|MDC))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_005",
    category: "OBSERVABILITY",
    name: "Structured logging absent",
    severity: "major",
    description: "Logs non structures (pas JSON)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:info|warn|error)\s*\(\s*["'](?!.*\{)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_006",
    category: "OBSERVABILITY",
    name: "Log level dynamique absent",
    severity: "minor",
    description: "Pas de changement de log level dynamique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:LoggerFactory|Logger)(?![\s\S]{0,2000}(?:setLevel|LogLevel|actuator.*loggers))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_007",
    category: "OBSERVABILITY",
    name: "Alert absent",
    severity: "major",
    description: "Pas d alerting sur erreurs critiques",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\([\s\S]{0,200}(?:log\w*\.error)(?![\s\S]{0,200}(?:alert|notify|alarm|page))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_008",
    category: "OBSERVABILITY",
    name: "Dashboard absent",
    severity: "minor",
    description: "Pas de dashboard de monitoring",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:Grafana|Prometheus|Datadog|NewRelic))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_009",
    category: "OBSERVABILITY",
    name: "SLA monitoring absent",
    severity: "minor",
    description: "Pas de monitoring SLA/SLO",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:SLA|SLO|latency.*percentile))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_010",
    category: "OBSERVABILITY",
    name: "Error rate monitoring",
    severity: "major",
    description: "Pas de monitoring du taux d erreur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:errorRate|error.*count|error.*metric))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_011",
    category: "OBSERVABILITY",
    name: "Audit trail absent",
    severity: "major",
    description: "Pas de piste d audit pour operations sensibles",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:delete|update|create)\w*(?:Account|User|Transaction)(?![\s\S]{0,300}(?:audit|Audit|AuditLog))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_012",
    category: "OBSERVABILITY",
    name: "Log rotation absent",
    severity: "minor",
    description: "Pas de rotation des logs",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /FileAppender|FileHandler(?![\s\S]{0,200}(?:Rolling|rotate|maxSize|maxHistory))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_013",
    category: "OBSERVABILITY",
    name: "Log aggregation absent",
    severity: "minor",
    description: "Pas d aggregation de logs centralisee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:FileAppender|FileHandler)(?![\s\S]{0,500}(?:Logstash|Fluentd|CloudWatch|Splunk))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_014",
    category: "OBSERVABILITY",
    name: "APM absent",
    severity: "minor",
    description: "Pas d APM (Application Performance Monitoring)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:APM|apm|NewRelic|Datadog|Dynatrace|AppDynamics))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_015",
    category: "OBSERVABILITY",
    name: "Custom metric absent",
    severity: "minor",
    description: "Pas de metriques metier custom",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Service(?![\s\S]{0,2000}(?:Counter\.builder|Gauge\.builder|Timer\.builder))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_016",
    category: "OBSERVABILITY",
    name: "Span custom absent",
    severity: "minor",
    description: "Pas de span custom pour tracing",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Service(?![\s\S]{0,2000}(?:@NewSpan|Tracer|Span\.current))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_017",
    category: "OBSERVABILITY",
    name: "Baggage absent",
    severity: "minor",
    description: "Pas de baggage propagation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient)(?![\s\S]{0,500}(?:Baggage|baggage|propagation))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_018",
    category: "OBSERVABILITY",
    name: "Log context absent",
    severity: "minor",
    description: "Pas de contexte dans les logs (user, tenant)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:info|warn|error)(?![\s\S]{0,100}(?:userId|tenantId|sessionId|MDC))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_019",
    category: "OBSERVABILITY",
    name: "Profiling absent",
    severity: "minor",
    description: "Pas de profiling en production",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:JFR|FlightRecorder|async-profiler))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_020",
    category: "OBSERVABILITY",
    name: "Heap dump config",
    severity: "minor",
    description: "Pas de heap dump automatique sur OOM",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:HeapDumpOnOutOfMemoryError|heapDump))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_021",
    category: "OBSERVABILITY",
    name: "Thread dump endpoint",
    severity: "minor",
    description: "Pas d endpoint thread dump",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:threadDump|ThreadDump|actuator.*threaddump))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_022",
    category: "OBSERVABILITY",
    name: "GC logging absent",
    severity: "minor",
    description: "Pas de logging GC",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:gc\.log|PrintGCDetails|Xlog:gc))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_023",
    category: "OBSERVABILITY",
    name: "Dependency health",
    severity: "major",
    description: "Pas de health check des dependances",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:DataSource|RestTemplate|KafkaTemplate)(?![\s\S]{0,500}(?:HealthIndicator|healthCheck|ping))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_024",
    category: "OBSERVABILITY",
    name: "Circuit breaker metrics",
    severity: "minor",
    description: "Circuit breaker sans metriques",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:CircuitBreaker|Resilience4j)(?![\s\S]{0,300}(?:metric|Metric|MeterRegistry))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_025",
    category: "OBSERVABILITY",
    name: "Cache metrics absent",
    severity: "minor",
    description: "Cache sans metriques (hit/miss ratio)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:@Cacheable|CacheManager)(?![\s\S]{0,500}(?:cacheMetric|CacheMetric|hit.*miss))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_026",
    category: "OBSERVABILITY",
    name: "Queue metrics absent",
    severity: "minor",
    description: "Queue sans metriques (depth, latency)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:JmsTemplate|RabbitTemplate|KafkaTemplate)(?![\s\S]{0,500}(?:queueMetric|QueueMetric|depth))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_027",
    category: "OBSERVABILITY",
    name: "DB pool metrics",
    severity: "minor",
    description: "Pool de connexions DB sans metriques",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:DataSource|HikariConfig)(?![\s\S]{0,500}(?:poolMetric|PoolMetric|activeConnections))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_028",
    category: "OBSERVABILITY",
    name: "Request logging absent",
    severity: "minor",
    description: "Pas de logging des requetes HTTP",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Controller(?![\s\S]{0,2000}(?:CommonsRequestLoggingFilter|RequestLogging|accessLog))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_029",
    category: "OBSERVABILITY",
    name: "Response time tracking",
    severity: "major",
    description: "Pas de tracking du temps de reponse",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Controller(?![\s\S]{0,2000}(?:responseTime|Timer|@Timed|duration))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "OBS_030",
    category: "OBSERVABILITY",
    name: "Error classification",
    severity: "minor",
    description: "Pas de classification des erreurs (4xx vs 5xx)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /catch\s*\([\s\S]{0,200}(?:Exception)(?![\s\S]{0,200}(?:4\d\d|5\d\d|CLIENT_ERROR|SERVER_ERROR))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
