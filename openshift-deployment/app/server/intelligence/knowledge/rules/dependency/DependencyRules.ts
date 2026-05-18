/**
 * dependencyRules — Auto-generated rules for dependency
 * Total: 30 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const dependencyRules: Rule[] = [
  {
    id: "DEP_001",
    category: "DEPENDENCY",
    name: "Dependency vulnerable",
    severity: "critical",
    description: "Dependance avec vulnerabilite connue",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:commons-collections|struts|log4j-core).*(?:3\.|1\.|2\.(?:0|1[0-6]))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_002",
    category: "DEPENDENCY",
    name: "Dependency deprecated",
    severity: "major",
    description: "Dependance deprecated",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:commons-lang(?!3)|commons-io.*1\.|junit.*4\.)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_003",
    category: "DEPENDENCY",
    name: "Dependency conflict",
    severity: "major",
    description: "Conflit de versions de dependances",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:import\s+org\.apache\.commons\.lang\.)|(?:import\s+org\.apache\.commons\.lang3\.)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_004",
    category: "DEPENDENCY",
    name: "Snapshot in release",
    severity: "major",
    description: "Version SNAPSHOT dans release",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SNAPSHOT/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_005",
    category: "DEPENDENCY",
    name: "Version range",
    severity: "minor",
    description: "Plage de version au lieu de version fixe",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\[\d+\.\d+,\s*\d+\.\d+\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_006",
    category: "DEPENDENCY",
    name: "Dependency unused",
    severity: "minor",
    description: "Dependance declaree mais non utilisee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+\w+\.\w+\.(?:unused|legacy)\./g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_007",
    category: "DEPENDENCY",
    name: "Transitive dependency",
    severity: "minor",
    description: "Dependance transitive non declaree explicitement",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+\w+\.(?!java\.|javax\.|jakarta\.)\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_008",
    category: "DEPENDENCY",
    name: "Fat JAR",
    severity: "minor",
    description: "JAR avec toutes les dependances (taille excessive)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /maven-shade-plugin|maven-assembly-plugin.*jar-with-dependencies/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_009",
    category: "DEPENDENCY",
    name: "BOM absent",
    severity: "minor",
    description: "Pas de BOM pour gestion coherente des versions",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:spring-boot|quarkus|micronaut)(?![\s\S]{0,500}(?:BOM|bom|dependencyManagement))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_010",
    category: "DEPENDENCY",
    name: "License incompatible",
    severity: "major",
    description: "Dependance avec licence potentiellement incompatible",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:GPL|AGPL|SSPL)(?!.*exception|.*classpath)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_011",
    category: "DEPENDENCY",
    name: "Java EE deprecated",
    severity: "major",
    description: "API Java EE deprecated a migrer vers Jakarta EE",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+javax\.(?!xml)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_012",
    category: "DEPENDENCY",
    name: "JUnit 4 legacy",
    severity: "minor",
    description: "JUnit 4 a migrer vers JUnit 5",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.junit\.(?!jupiter)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_013",
    category: "DEPENDENCY",
    name: "Mockito legacy",
    severity: "minor",
    description: "Mockito version ancienne",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.mockito\.(?:runners|Matchers)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_014",
    category: "DEPENDENCY",
    name: "Apache HTTP legacy",
    severity: "minor",
    description: "Apache HttpClient 4.x a migrer vers 5.x",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.apache\.http(?!\.client5)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_015",
    category: "DEPENDENCY",
    name: "Jackson legacy",
    severity: "minor",
    description: "Jackson 1.x a migrer vers 2.x",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.codehaus\.jackson/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_016",
    category: "DEPENDENCY",
    name: "Guava deprecated",
    severity: "minor",
    description: "API Guava deprecated",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /com\.google\.common\.(?:base\.Optional|collect\.FluentIterable)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_017",
    category: "DEPENDENCY",
    name: "Joda-Time legacy",
    severity: "minor",
    description: "Joda-Time a migrer vers java.time",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.joda\.time/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_018",
    category: "DEPENDENCY",
    name: "Commons Lang 2",
    severity: "minor",
    description: "Commons Lang 2 a migrer vers 3",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.apache\.commons\.lang\./g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_019",
    category: "DEPENDENCY",
    name: "Log4j 1.x",
    severity: "critical",
    description: "Log4j 1.x vulnerable a migrer vers 2.x+",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.apache\.log4j(?!\.core)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_020",
    category: "DEPENDENCY",
    name: "Servlet API old",
    severity: "major",
    description: "Servlet API 3.x ou inferieur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+javax\.servlet/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_021",
    category: "DEPENDENCY",
    name: "EJB API",
    severity: "major",
    description: "API EJB a migrer vers CDI",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+javax\.ejb/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_022",
    category: "DEPENDENCY",
    name: "JMS old API",
    severity: "minor",
    description: "JMS 1.1 API a migrer vers 2.0+",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+javax\.jms/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_023",
    category: "DEPENDENCY",
    name: "JAX-WS legacy",
    severity: "major",
    description: "JAX-WS a migrer vers JAX-RS",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+javax\.xml\.ws/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_024",
    category: "DEPENDENCY",
    name: "JAXB legacy",
    severity: "minor",
    description: "JAXB a migrer vers Jackson/JSON-B",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+javax\.xml\.bind/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_025",
    category: "DEPENDENCY",
    name: "Velocity legacy",
    severity: "minor",
    description: "Apache Velocity a migrer vers Thymeleaf",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.apache\.velocity/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_026",
    category: "DEPENDENCY",
    name: "Struts dependency",
    severity: "critical",
    description: "Struts framework a migrer vers Spring MVC/JAX-RS",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.apache\.struts/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_027",
    category: "DEPENDENCY",
    name: "Hibernate 3.x",
    severity: "major",
    description: "Hibernate 3.x a migrer vers 5.x+",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.hibernate\.(?:classic|criterion)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_028",
    category: "DEPENDENCY",
    name: "Spring 3.x/4.x",
    severity: "major",
    description: "Spring Framework ancien a migrer",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.springframework\.(?:web\.servlet\.mvc\.Controller\b|orm\.hibernate3)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_029",
    category: "DEPENDENCY",
    name: "Java 8 API missing",
    severity: "minor",
    description: "API Java 8+ non utilisee (Optional, Stream, etc.)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:if\s*\(\s*\w+\s*!=\s*null\s*\))(?![\s\S]{0,200}Optional)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DEP_030",
    category: "DEPENDENCY",
    name: "Security dependency old",
    severity: "critical",
    description: "Dependance securite obsolete",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+org\.apache\.shiro|import\s+org\.owasp\.esapi/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
