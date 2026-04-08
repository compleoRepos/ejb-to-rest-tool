/**
 * architectureExtendedRules — Auto-generated rules for architecture
 * Total: 35 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const architectureExtendedRules: Rule[] = [
  {
    id: "ARCH_COUP_001",
    category: "ARCHITECTURE",
    name: "Import circulaire",
    severity: "major",
    description: "Dependance circulaire entre packages",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+\w+\.(?:service|controller|dao)\.[\s\S]{0,100}import\s+\w+\.(?:service|controller|dao)\./g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_COUP_002",
    category: "ARCHITECTURE",
    name: "God class",
    severity: "critical",
    description: "Classe avec trop de responsabilites (>500 lignes)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_COUP_003",
    category: "ARCHITECTURE",
    name: "Service dans Entity",
    severity: "critical",
    description: "Injection service dans entite JPA",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Entity[\s\S]{0,500}@(?:Inject|Autowired)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_COUP_004",
    category: "ARCHITECTURE",
    name: "DAO dans Controller",
    severity: "major",
    description: "Acces direct DAO depuis controller sans service",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Controller[\s\S]{0,500}(?:Repository|DAO|Dao)\s+\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_COUP_005",
    category: "ARCHITECTURE",
    name: "Static utility abuse",
    severity: "minor",
    description: "Classe utilitaire statique au lieu de service injectable",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /static\s+\w+\s+\w+\s*\([\s\S]{0,50}\)[\s\S]{0,200}static\s+\w+\s+\w+\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_COUP_006",
    category: "ARCHITECTURE",
    name: "Concrete dependency",
    severity: "major",
    description: "Dependance sur implementation concrete au lieu interface",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+\w+(?:Service|Repository|Dao)Impl\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_COUP_007",
    category: "ARCHITECTURE",
    name: "Feature envy",
    severity: "minor",
    description: "Methode qui utilise plus de donnees externes que locales",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\w+\.get\w+\(\)[\s\S]{0,20}\w+\.get\w+\(\)[\s\S]{0,20}\w+\.get\w+\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_COUP_008",
    category: "ARCHITECTURE",
    name: "Law of Demeter",
    severity: "minor",
    description: "Chaine d appels trop longue (a.b().c().d())",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\w+\.\w+\(\)\.\w+\(\)\.\w+\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_COUP_009",
    category: "ARCHITECTURE",
    name: "Package cycle",
    severity: "major",
    description: "Cycle entre packages detecte",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+\w+\.\w+\.(?:impl|internal)\./g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_COUP_010",
    category: "ARCHITECTURE",
    name: "Anemic domain",
    severity: "minor",
    description: "Entite sans logique metier (getters/setters uniquement)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Entity[\s\S]{0,1000}(?:get\w+|set\w+|is\w+)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_NAME_001",
    category: "ARCHITECTURE",
    name: "Classe mal nommee",
    severity: "minor",
    description: "Nom de classe ne respecte pas les conventions",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+[a-z]\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_NAME_002",
    category: "ARCHITECTURE",
    name: "Methode trop generique",
    severity: "minor",
    description: "Nom de methode trop generique (process, handle, do, execute)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(?:public|private|protected)\s+\w+\s+(?:process|handle|doIt|execute|run)\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_NAME_003",
    category: "ARCHITECTURE",
    name: "Variable single letter",
    severity: "minor",
    description: "Variable nommee avec une seule lettre",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(?:int|long|String|Object)\s+[a-z]\s*[;=]/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_NAME_004",
    category: "ARCHITECTURE",
    name: "Boolean sans prefix",
    severity: "minor",
    description: "Variable booleenne sans prefix is/has/can",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /boolean\s+(?!is|has|can|should|was|will)\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_NAME_005",
    category: "ARCHITECTURE",
    name: "Constante non UPPER_CASE",
    severity: "minor",
    description: "Constante static final sans convention UPPER_CASE",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /static\s+final\s+\w+\s+[a-z]\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_NAME_006",
    category: "ARCHITECTURE",
    name: "Package non lowercase",
    severity: "minor",
    description: "Nom de package avec majuscules",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /package\s+\w*[A-Z]\w*/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_NAME_007",
    category: "ARCHITECTURE",
    name: "Interface prefix I",
    severity: "minor",
    description: "Interface avec prefix I (convention C#)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /interface\s+I[A-Z]\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_NAME_008",
    category: "ARCHITECTURE",
    name: "Impl suffix abuse",
    severity: "minor",
    description: "Implementation avec suffix Impl sans raison",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Impl\b/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_NAME_009",
    category: "ARCHITECTURE",
    name: "Manager/Helper abuse",
    severity: "minor",
    description: "Classe Manager/Helper/Utils trop generique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?:Manager|Helper|Utils|Utility)\b/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_NAME_010",
    category: "ARCHITECTURE",
    name: "Abbreviation obscure",
    severity: "minor",
    description: "Nom avec abbreviation non standard",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(?:mgr|svc|repo|impl|dto|vo|bo)\b/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_001",
    category: "ARCHITECTURE",
    name: "Methode trop longue",
    severity: "major",
    description: "Methode de plus de 50 lignes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\{[\s\S]{2500,}?\}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_002",
    category: "ARCHITECTURE",
    name: "Parametres excessifs",
    severity: "major",
    description: "Methode avec plus de 5 parametres",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\(\s*\w+\s+\w+\s*,\s*\w+\s+\w+\s*,\s*\w+\s+\w+\s*,\s*\w+\s+\w+\s*,\s*\w+\s+\w+\s*,\s*\w+\s+\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_003",
    category: "ARCHITECTURE",
    name: "If imbrique profond",
    severity: "major",
    description: "If imbrique sur plus de 3 niveaux",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /if\s*\([\s\S]{0,200}if\s*\([\s\S]{0,200}if\s*\([\s\S]{0,200}if\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_004",
    category: "ARCHITECTURE",
    name: "Switch sans default",
    severity: "minor",
    description: "Switch sans clause default",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /switch\s*\([^)]+\)\s*\{(?![\s\S]*default\s*:)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_005",
    category: "ARCHITECTURE",
    name: "Catch generique",
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
    id: "ARCH_CMPLX_006",
    category: "ARCHITECTURE",
    name: "Return multiple",
    severity: "minor",
    description: "Methode avec plus de 3 return statements",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /return\s+[\s\S]{0,2000}return\s+[\s\S]{0,2000}return\s+[\s\S]{0,2000}return\s+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_007",
    category: "ARCHITECTURE",
    name: "Magic number",
    severity: "minor",
    description: "Nombre magique au lieu de constante nommee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:if|while|for)\s*\(.*(?:==|!=|<|>)\s*\d{2,}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_008",
    category: "ARCHITECTURE",
    name: "Magic string",
    severity: "minor",
    description: "Chaine magique au lieu de constante",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.equals\s*\(\s*["'][A-Z_]{3,}["']\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_009",
    category: "ARCHITECTURE",
    name: "Null check excessif",
    severity: "minor",
    description: "Verification null excessive au lieu d Optional",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /if\s*\(\s*\w+\s*!=\s*null\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_010",
    category: "ARCHITECTURE",
    name: "Empty catch",
    severity: "major",
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
    id: "ARCH_CMPLX_011",
    category: "ARCHITECTURE",
    name: "Instanceof chain",
    severity: "major",
    description: "Chaine instanceof au lieu de polymorphisme",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /instanceof\s+\w+[\s\S]{0,200}instanceof\s+\w+[\s\S]{0,200}instanceof\s+\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_012",
    category: "ARCHITECTURE",
    name: "Boolean parameter",
    severity: "minor",
    description: "Parametre boolean qui controle le flux",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\(\s*(?:boolean|Boolean)\s+\w*(?:flag|mode|type|option)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_013",
    category: "ARCHITECTURE",
    name: "Temporal coupling",
    severity: "major",
    description: "Methodes qui doivent etre appelees dans un ordre precis",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.init\s*\(\)[\s\S]{0,100}\.configure\s*\(\)[\s\S]{0,100}\.start\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_014",
    category: "ARCHITECTURE",
    name: "Dead code",
    severity: "minor",
    description: "Code mort ou commente",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\/\/\s*(?:TODO|FIXME|HACK|XXX|DEPRECATED)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "ARCH_CMPLX_015",
    category: "ARCHITECTURE",
    name: "System.out.println",
    severity: "major",
    description: "System.out/err au lieu de framework de logging",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /System\.(?:out|err)\.print/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
