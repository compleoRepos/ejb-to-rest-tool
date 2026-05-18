/**
 * springMigrationRules — Auto-generated rules for spring
 * Total: 50 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const springMigrationRules: Rule[] = [
  {
    id: "SPR_BOOT_001",
    category: "SPRING_MIGRATION",
    name: "XML config",
    severity: "major",
    description: "Configuration Spring XML a migrer vers Java Config",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /applicationContext\.xml|spring-beans\.xml|<beans/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_002",
    category: "SPRING_MIGRATION",
    name: "Web.xml",
    severity: "major",
    description: "web.xml a migrer vers Spring Boot auto-config",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /web\.xml|<web-app/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_003",
    category: "SPRING_MIGRATION",
    name: "WAR deployment",
    severity: "major",
    description: "Deploiement WAR a migrer vers JAR executable",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /packaging>war|\.war\b/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_004",
    category: "SPRING_MIGRATION",
    name: "Manual bean",
    severity: "minor",
    description: "Bean manuel a migrer vers @Component/@Service",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+\w+(?:Service|Repository|Controller)\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_005",
    category: "SPRING_MIGRATION",
    name: "PropertyPlaceholder",
    severity: "minor",
    description: "PropertyPlaceholderConfigurer a migrer vers @Value",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /PropertyPlaceholderConfigurer|PropertySourcesPlaceholderConfigurer/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_006",
    category: "SPRING_MIGRATION",
    name: "JdbcTemplate direct",
    severity: "minor",
    description: "JdbcTemplate direct a migrer vers Spring Data",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /JdbcTemplate|NamedParameterJdbcTemplate/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_007",
    category: "SPRING_MIGRATION",
    name: "RestTemplate deprecated",
    severity: "minor",
    description: "RestTemplate a migrer vers WebClient",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /RestTemplate/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_008",
    category: "SPRING_MIGRATION",
    name: "Spring Security XML",
    severity: "major",
    description: "Spring Security XML a migrer vers Java Config",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /security:http|<security:/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_009",
    category: "SPRING_MIGRATION",
    name: "Manual transaction",
    severity: "major",
    description: "Transaction manuelle a migrer vers @Transactional",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /PlatformTransactionManager|TransactionTemplate/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_010",
    category: "SPRING_MIGRATION",
    name: "Manual AOP",
    severity: "minor",
    description: "AOP XML a migrer vers @Aspect",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /<aop:|aop:config|aop:pointcut/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_011",
    category: "SPRING_MIGRATION",
    name: "Spring MVC XML",
    severity: "major",
    description: "Spring MVC XML a migrer vers @Configuration",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /mvc:annotation-driven|<mvc:/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_012",
    category: "SPRING_MIGRATION",
    name: "Manual view resolver",
    severity: "minor",
    description: "ViewResolver manuel a migrer vers Thymeleaf/REST",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /InternalResourceViewResolver|JstlView/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_013",
    category: "SPRING_MIGRATION",
    name: "Manual datasource",
    severity: "major",
    description: "DataSource manuel a migrer vers spring.datasource.*",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /BasicDataSource|DriverManagerDataSource/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_014",
    category: "SPRING_MIGRATION",
    name: "Manual connection pool",
    severity: "major",
    description: "Pool de connexions manuel a migrer vers HikariCP",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /BasicDataSource|C3P0|DBCP/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_015",
    category: "SPRING_MIGRATION",
    name: "Manual cache",
    severity: "minor",
    description: "Cache manuel a migrer vers @Cacheable",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+(?:HashMap|ConcurrentHashMap).*cache/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_016",
    category: "SPRING_MIGRATION",
    name: "Manual scheduler",
    severity: "minor",
    description: "Scheduler manuel a migrer vers @Scheduled",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ScheduledExecutorService|Timer\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_017",
    category: "SPRING_MIGRATION",
    name: "Manual async",
    severity: "minor",
    description: "Async manuel a migrer vers @Async",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+Thread\s*\(|ExecutorService/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_018",
    category: "SPRING_MIGRATION",
    name: "Manual validation",
    severity: "minor",
    description: "Validation manuelle a migrer vers @Valid",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /if\s*\(\s*\w+\s*==\s*null\s*\)\s*throw/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_019",
    category: "SPRING_MIGRATION",
    name: "Manual exception handler",
    severity: "minor",
    description: "Exception handler manuel a migrer vers @ControllerAdvice",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /try\s*\{[\s\S]{0,500}catch[\s\S]{0,200}(?:response\.setStatus|sendError)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_020",
    category: "SPRING_MIGRATION",
    name: "Manual CORS",
    severity: "minor",
    description: "CORS manuel a migrer vers @CrossOrigin",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Access-Control-Allow-Origin|addCorsMappings/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_021",
    category: "SPRING_MIGRATION",
    name: "Manual multipart",
    severity: "minor",
    description: "Multipart manuel a migrer vers @RequestPart",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /CommonsMultipartResolver|MultipartHttpServletRequest/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_022",
    category: "SPRING_MIGRATION",
    name: "Manual i18n",
    severity: "minor",
    description: "I18n manuel a migrer vers MessageSource",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ResourceBundle\.getBundle|Properties.*messages/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_023",
    category: "SPRING_MIGRATION",
    name: "Manual profile",
    severity: "minor",
    description: "Profile manuel a migrer vers @Profile",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /System\.getProperty.*(?:env|profile|mode)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_024",
    category: "SPRING_MIGRATION",
    name: "Manual health",
    severity: "minor",
    description: "Health check manuel a migrer vers Actuator",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\/health|healthCheck|isHealthy/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_BOOT_025",
    category: "SPRING_MIGRATION",
    name: "Manual metrics",
    severity: "minor",
    description: "Metriques manuelles a migrer vers Micrometer",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:counter|gauge|timer)\s*\+\+|\.increment\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_001",
    category: "SPRING_MIGRATION",
    name: "Eureka absent",
    severity: "minor",
    description: "Pas de service discovery",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient).*["']https?:\/\/(?:localhost|\d+\.\d+)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_002",
    category: "SPRING_MIGRATION",
    name: "Config server absent",
    severity: "minor",
    description: "Configuration locale au lieu de Config Server",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /application\.(?:properties|yml).*(?:spring\.datasource|server\.port)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_003",
    category: "SPRING_MIGRATION",
    name: "Ribbon deprecated",
    severity: "minor",
    description: "Ribbon a migrer vers Spring Cloud LoadBalancer",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Ribbon|@RibbonClient/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_004",
    category: "SPRING_MIGRATION",
    name: "Hystrix deprecated",
    severity: "minor",
    description: "Hystrix a migrer vers Resilience4j",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Hystrix|@HystrixCommand/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_005",
    category: "SPRING_MIGRATION",
    name: "Zuul deprecated",
    severity: "minor",
    description: "Zuul a migrer vers Spring Cloud Gateway",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Zuul|@EnableZuulProxy/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_006",
    category: "SPRING_MIGRATION",
    name: "Feign manual",
    severity: "minor",
    description: "Client HTTP manuel au lieu de OpenFeign",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient)(?![\s\S]{0,500}@FeignClient)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_007",
    category: "SPRING_MIGRATION",
    name: "Sleuth absent",
    severity: "minor",
    description: "Pas de tracing distribue",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient)(?![\s\S]{0,2000}(?:Sleuth|Zipkin|Brave|Micrometer.*tracing))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_008",
    category: "SPRING_MIGRATION",
    name: "Bus absent",
    severity: "minor",
    description: "Pas de bus d evenements",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:@Configuration|@Service)(?![\s\S]{0,2000}(?:Spring.*Cloud.*Bus|@StreamListener))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_009",
    category: "SPRING_MIGRATION",
    name: "Vault absent",
    severity: "minor",
    description: "Secrets en fichier au lieu de Vault",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:password|secret|apiKey)\s*=\s*(?!.*\$\{)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_010",
    category: "SPRING_MIGRATION",
    name: "Stream absent",
    severity: "minor",
    description: "Messaging manuel au lieu de Spring Cloud Stream",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:JmsTemplate|RabbitTemplate|KafkaTemplate)(?![\s\S]{0,500}@StreamListener)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_011",
    category: "SPRING_MIGRATION",
    name: "Contract absent",
    severity: "minor",
    description: "Pas de Spring Cloud Contract",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:@FeignClient|RestTemplate)(?![\s\S]{0,2000}(?:@AutoConfigureStubRunner|StubRunner))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_012",
    category: "SPRING_MIGRATION",
    name: "Function absent",
    severity: "minor",
    description: "Pas de Spring Cloud Function pour serverless",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:Function|Supplier|Consumer))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_013",
    category: "SPRING_MIGRATION",
    name: "Task absent",
    severity: "minor",
    description: "Batch sans Spring Cloud Task",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:@Scheduled|@Batch)(?![\s\S]{0,2000}(?:@EnableTask|TaskExecution))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_014",
    category: "SPRING_MIGRATION",
    name: "Kubernetes config",
    severity: "minor",
    description: "Pas de Spring Cloud Kubernetes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:ConfigMap|Secret|kubernetes)(?![\s\S]{0,500}spring-cloud-kubernetes)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_CLD_015",
    category: "SPRING_MIGRATION",
    name: "OpenTelemetry absent",
    severity: "minor",
    description: "Pas d observabilite OpenTelemetry",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application(?![\s\S]{0,2000}(?:OpenTelemetry|otel|OTEL))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_DATA_001",
    category: "SPRING_MIGRATION",
    name: "Repository sans interface",
    severity: "major",
    description: "Repository sans interface Spring Data",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Repository(?![\s\S]{0,200}extends\s+(?:JpaRepository|CrudRepository|PagingAndSortingRepository))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_DATA_002",
    category: "SPRING_MIGRATION",
    name: "Custom query unsafe",
    severity: "critical",
    description: "Query native avec concatenation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Query.*nativeQuery.*\+\s*\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_DATA_003",
    category: "SPRING_MIGRATION",
    name: "Specification absent",
    severity: "minor",
    description: "Filtrage complexe sans Specification",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /findBy\w+And\w+And\w+And\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_DATA_004",
    category: "SPRING_MIGRATION",
    name: "Projection absent",
    severity: "minor",
    description: "Pas de projection pour optimiser les requetes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /findAll\(\)(?![\s\S]{0,200}Projection)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_DATA_005",
    category: "SPRING_MIGRATION",
    name: "Auditing absent",
    severity: "minor",
    description: "Pas d auditing Spring Data",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Entity(?![\s\S]{0,500}(?:@CreatedDate|@LastModifiedDate|@EntityListeners.*AuditingEntityListener))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_DATA_006",
    category: "SPRING_MIGRATION",
    name: "Envers absent",
    severity: "minor",
    description: "Pas d historisation avec Hibernate Envers",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Entity(?![\s\S]{0,500}(?:@Audited|@AuditTable))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_DATA_007",
    category: "SPRING_MIGRATION",
    name: "QueryDSL absent",
    severity: "minor",
    description: "Pas de QueryDSL pour requetes typesafes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createQuery\s*\(\s*["'](?![\s\S]{0,500}(?:QueryDSL|JPAQueryFactory|BooleanBuilder))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_DATA_008",
    category: "SPRING_MIGRATION",
    name: "Flyway absent",
    severity: "minor",
    description: "Pas de Flyway/Liquibase pour migrations",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /CREATE\s+TABLE|ALTER\s+TABLE(?![\s\S]{0,2000}(?:flyway|liquibase|V\d+__))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_DATA_009",
    category: "SPRING_MIGRATION",
    name: "Connection pool config",
    severity: "major",
    description: "Pool de connexions non configure",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /spring\.datasource(?![\s\S]{0,200}(?:hikari|maximumPoolSize|maxActive))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SPR_DATA_010",
    category: "SPRING_MIGRATION",
    name: "Second level cache",
    severity: "minor",
    description: "Pas de cache de second niveau Hibernate",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Entity(?![\s\S]{0,500}(?:@Cacheable|@Cache|hibernate\.cache))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
