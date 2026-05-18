/**
 * testingRules — Auto-generated rules for testing
 * Total: 40 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const testingRules: Rule[] = [
  {
    id: "TEST_COV_001",
    category: "TESTING",
    name: "Classe sans test",
    severity: "major",
    description: "Classe de service/DAO sans test unitaire correspondant",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?:Service|DAO|Dao|Repository|Controller)\b/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_002",
    category: "TESTING",
    name: "Methode publique non testee",
    severity: "minor",
    description: "Methode publique sans test correspondant",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /public\s+\w+\s+\w+\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_003",
    category: "TESTING",
    name: "Test sans assertion",
    severity: "major",
    description: "Test sans assertion (test inutile)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}(?!assert|verify|expect|should)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_004",
    category: "TESTING",
    name: "Test avec Thread.sleep",
    severity: "major",
    description: "Test utilisant Thread.sleep au lieu de await/verify",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}Thread\.sleep/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_005",
    category: "TESTING",
    name: "Test dependant ordre",
    severity: "major",
    description: "Tests dependants de l ordre d execution",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test.*dependsOnMethods|@FixMethodOrder/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_006",
    category: "TESTING",
    name: "Test avec DB reelle",
    severity: "major",
    description: "Test utilisant base de donnees reelle au lieu de mock",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}(?:DriverManager|DataSource|getConnection)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_007",
    category: "TESTING",
    name: "Test avec reseau",
    severity: "major",
    description: "Test dependant du reseau (fragile)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}(?:HttpURLConnection|RestTemplate|WebClient)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_008",
    category: "TESTING",
    name: "Test avec System.out",
    severity: "minor",
    description: "Test utilisant System.out au lieu de logger",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}System\.out/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_009",
    category: "TESTING",
    name: "Test sans cleanup",
    severity: "minor",
    description: "Test sans methode de nettoyage @After/@AfterEach",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Before(?!.*@After)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_010",
    category: "TESTING",
    name: "Test avec new Date()",
    severity: "minor",
    description: "Test utilisant new Date() (non deterministe)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}new\s+Date\s*\(\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_011",
    category: "TESTING",
    name: "Exception non testee",
    severity: "major",
    description: "Methode throws sans test du cas d erreur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /throws\s+\w+Exception/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_012",
    category: "TESTING",
    name: "Boundary non teste",
    severity: "minor",
    description: "Pas de test aux limites (0, null, max)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test(?![\s\S]{0,1000}(?:null|empty|zero|max|min|boundary))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_013",
    category: "TESTING",
    name: "Mock trop profond",
    severity: "minor",
    description: "Mock avec when().thenReturn() imbrique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /when\s*\(.*when\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_014",
    category: "TESTING",
    name: "Test integration manquant",
    severity: "major",
    description: "Pas de test d integration pour endpoint REST",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Path|RequestMapping|GetMapping|PostMapping)(?![\s\S]{0,2000}@Test)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_015",
    category: "TESTING",
    name: "Test concurrent absent",
    severity: "minor",
    description: "Code concurrent sans test de concurrence",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /synchronized|AtomicInteger|ConcurrentHashMap(?![\s\S]{0,2000}@Test.*concurrent)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_016",
    category: "TESTING",
    name: "Hardcoded test data",
    severity: "minor",
    description: "Donnees de test en dur au lieu de builder/factory",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,200}new\s+\w+\(\s*["']/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_017",
    category: "TESTING",
    name: "Test trop long",
    severity: "minor",
    description: "Methode de test trop longue (>50 lignes)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{2500,}?@Test/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_018",
    category: "TESTING",
    name: "Assert message absent",
    severity: "minor",
    description: "Assertion sans message descriptif",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /assert(?:Equals|True|False|NotNull)\s*\(\s*(?!["'])/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_019",
    category: "TESTING",
    name: "Test avec random",
    severity: "minor",
    description: "Test utilisant Random (non reproductible)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}new\s+Random/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_COV_020",
    category: "TESTING",
    name: "Spy au lieu de mock",
    severity: "minor",
    description: "Utilisation de spy quand mock suffit",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Mockito\.spy\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_001",
    category: "TESTING",
    name: "Test nom non descriptif",
    severity: "minor",
    description: "Nom de test non descriptif (test1, testMethod)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,50}void\s+test\d+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_002",
    category: "TESTING",
    name: "Multiple assert",
    severity: "minor",
    description: "Test avec trop d assertions (>5)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,2000}(?:assert\w+[\s\S]{0,200}){5,}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_003",
    category: "TESTING",
    name: "Test sans Given-When-Then",
    severity: "minor",
    description: "Test sans structure Given-When-Then claire",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,50}void\s+\w+(?!.*given|.*when|.*then|.*should)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_004",
    category: "TESTING",
    name: "Verify sans times",
    severity: "minor",
    description: "Mockito verify sans specification du nombre d appels",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /verify\s*\(\s*\w+\s*\)\./g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_005",
    category: "TESTING",
    name: "Test avec static state",
    severity: "major",
    description: "Test modifiant etat statique (effet de bord)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}static\s+\w+\s*=/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_006",
    category: "TESTING",
    name: "Test ignore sans raison",
    severity: "minor",
    description: "Test @Ignore/@Disabled sans commentaire",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Ignore|Disabled)\s*(?:\(\s*\))?[\s\n]*(?:@Test|public)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_007",
    category: "TESTING",
    name: "Expected exception generique",
    severity: "major",
    description: "Test attend Exception generique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test\s*\(\s*expected\s*=\s*Exception\.class/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_008",
    category: "TESTING",
    name: "Test avec try-catch",
    severity: "minor",
    description: "Test avec try-catch au lieu de assertThrows",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}try\s*\{[\s\S]{0,200}catch/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_009",
    category: "TESTING",
    name: "Flaky test indicator",
    severity: "major",
    description: "Test avec retry ou @RepeatedTest (potentiellement flaky)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@RepeatedTest|@Retry|flaky/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_010",
    category: "TESTING",
    name: "Test avec file system",
    severity: "minor",
    description: "Test dependant du systeme de fichiers",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}new\s+File\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_011",
    category: "TESTING",
    name: "Test sans timeout",
    severity: "minor",
    description: "Test potentiellement bloquant sans timeout",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test(?!.*timeout)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_012",
    category: "TESTING",
    name: "Assert equals null",
    severity: "minor",
    description: "assertEquals(null, x) au lieu de assertNull(x)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /assertEquals\s*\(\s*null\s*,/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_013",
    category: "TESTING",
    name: "Test avec println",
    severity: "minor",
    description: "Test avec System.out.println pour debug",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}System\.out\.println/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_014",
    category: "TESTING",
    name: "Mock final class",
    severity: "minor",
    description: "Mock de classe finale (necessite configuration speciale)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /mock\s*\(\s*\w+\.class\s*\)[\s\S]{0,100}final/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_015",
    category: "TESTING",
    name: "Test avec env variable",
    severity: "minor",
    description: "Test dependant de variable d environnement",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}System\.getenv/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_016",
    category: "TESTING",
    name: "Test sans parametrize",
    severity: "minor",
    description: "Tests repetitifs sans @ParameterizedTest",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,200}assertEquals[\s\S]{0,500}@Test[\s\S]{0,200}assertEquals/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_017",
    category: "TESTING",
    name: "Test avec magic values",
    severity: "minor",
    description: "Test avec valeurs magiques non expliquees",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,200}assertEquals\s*\(\s*\d{3,}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_018",
    category: "TESTING",
    name: "Test setup trop lourd",
    severity: "minor",
    description: "Methode @Before/@BeforeEach trop complexe",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Before(?:Each)?[\s\S]{1000,}?(?:@Test|@After)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_019",
    category: "TESTING",
    name: "Test avec cast",
    severity: "minor",
    description: "Test avec cast explicite (fragilite)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Test[\s\S]{0,500}\(\s*\w+\s*\)\s*\w+\.\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "TEST_QUAL_020",
    category: "TESTING",
    name: "Test sans isolation",
    severity: "major",
    description: "Tests partageant des ressources mutables",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /static\s+(?:List|Map|Set)\s*<[\s\S]{0,200}@Test/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
