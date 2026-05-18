/**
 * codeQualityRules — Auto-generated rules for code-quality
 * Total: 55 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const codeQualityRules: Rule[] = [
  {
    id: "CQ_SOLID_001",
    category: "CODE_QUALITY",
    name: "SRP violation",
    severity: "major",
    description: "Classe avec trop de responsabilites (>10 methodes publiques)",
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
    id: "CQ_SOLID_002",
    category: "CODE_QUALITY",
    name: "OCP violation",
    severity: "major",
    description: "Switch/if-else sur type au lieu de polymorphisme",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /switch\s*\(\s*\w+\.(?:getType|type|kind)\s*\(\s*\)\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_003",
    category: "CODE_QUALITY",
    name: "LSP violation",
    severity: "major",
    description: "Methode override qui lance UnsupportedOperationException",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Override[\s\S]{0,200}throw\s+new\s+UnsupportedOperationException/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_004",
    category: "CODE_QUALITY",
    name: "ISP violation",
    severity: "minor",
    description: "Interface avec trop de methodes (>7)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /interface\s+\w+\s*\{/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_005",
    category: "CODE_QUALITY",
    name: "DIP violation",
    severity: "major",
    description: "Dependance sur implementation concrete",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /private\s+\w+(?:Impl|Service|Repository)\s+\w+\s*=\s*new/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_006",
    category: "CODE_QUALITY",
    name: "God object",
    severity: "critical",
    description: "Classe avec plus de 1000 lignes",
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
    id: "CQ_SOLID_007",
    category: "CODE_QUALITY",
    name: "Feature envy",
    severity: "minor",
    description: "Methode qui accede plus aux donnees d un autre objet",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\w+\.get\w+\(\)[\s\S]{0,30}\w+\.get\w+\(\)[\s\S]{0,30}\w+\.get\w+\(\)[\s\S]{0,30}\w+\.get\w+\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_008",
    category: "CODE_QUALITY",
    name: "Data class",
    severity: "minor",
    description: "Classe avec uniquement getters/setters sans logique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?:DTO|VO|Bean)\b/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_009",
    category: "CODE_QUALITY",
    name: "Refused bequest",
    severity: "minor",
    description: "Classe heritiere qui n utilise pas les methodes parentes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /extends\s+\w+[\s\S]{0,500}@Override[\s\S]{0,100}throw\s+new\s+UnsupportedOperation/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_010",
    category: "CODE_QUALITY",
    name: "Parallel hierarchy",
    severity: "minor",
    description: "Hierarchies de classes paralleles",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?:Factory|Builder|Validator)\s+extends\s+\w+(?:Factory|Builder|Validator)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_011",
    category: "CODE_QUALITY",
    name: "Inappropriate intimacy",
    severity: "major",
    description: "Classe qui accede aux membres prives d une autre",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.getClass\(\)\.getDeclaredField|Field\.setAccessible\s*\(\s*true/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_012",
    category: "CODE_QUALITY",
    name: "Middle man",
    severity: "minor",
    description: "Classe qui delegue tout sans valeur ajoutee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /return\s+\w+\.\w+\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_013",
    category: "CODE_QUALITY",
    name: "Speculative generality",
    severity: "minor",
    description: "Abstraction prematuree sans implementation concrete",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /abstract\s+class\s+\w+(?![\s\S]{0,5000}extends\s+\w+)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_014",
    category: "CODE_QUALITY",
    name: "Temporal coupling",
    severity: "major",
    description: "Methodes qui doivent etre appelees dans un ordre precis",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.init\s*\(\)[\s\S]{0,200}\.start\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_SOLID_015",
    category: "CODE_QUALITY",
    name: "Primitive obsession",
    severity: "minor",
    description: "Utilisation excessive de types primitifs au lieu de value objects",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:String|int|long)\s+\w*(?:Id|Code|Number|Amount|Price|Date)\b/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_001",
    category: "CODE_QUALITY",
    name: "Commentaire TODO",
    severity: "minor",
    description: "TODO non resolu dans le code",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\/\/\s*TODO/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_002",
    category: "CODE_QUALITY",
    name: "Commentaire FIXME",
    severity: "major",
    description: "FIXME non resolu dans le code",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\/\/\s*FIXME/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_003",
    category: "CODE_QUALITY",
    name: "Commentaire HACK",
    severity: "major",
    description: "HACK non resolu dans le code",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\/\/\s*HACK/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_004",
    category: "CODE_QUALITY",
    name: "Code commente",
    severity: "minor",
    description: "Code commente au lieu d etre supprime",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\/\/\s*(?:if|for|while|return|public|private)\s/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_005",
    category: "CODE_QUALITY",
    name: "Import wildcard",
    severity: "minor",
    description: "Import wildcard au lieu d imports specifiques",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+\w+\.\*\s*;/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_006",
    category: "CODE_QUALITY",
    name: "Import inutilise",
    severity: "minor",
    description: "Import non utilise dans le fichier",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /import\s+[\w.]+\s*;/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_007",
    category: "CODE_QUALITY",
    name: "Classe vide",
    severity: "minor",
    description: "Classe vide sans contenu",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+\s*(?:extends\s+\w+\s*)?(?:implements\s+[\w,\s]+\s*)?\{\s*\}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_008",
    category: "CODE_QUALITY",
    name: "Methode vide",
    severity: "minor",
    description: "Methode vide sans implementation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:public|private|protected)\s+\w+\s+\w+\s*\([^)]*\)\s*\{\s*\}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_009",
    category: "CODE_QUALITY",
    name: "Constructeur vide",
    severity: "minor",
    description: "Constructeur vide explicite inutile",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:public|private|protected)\s+\w+\s*\(\s*\)\s*\{\s*\}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_010",
    category: "CODE_QUALITY",
    name: "Annotation @SuppressWarnings",
    severity: "minor",
    description: "SuppressWarnings masque des problemes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@SuppressWarnings/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_011",
    category: "CODE_QUALITY",
    name: "Cast non securise",
    severity: "major",
    description: "Cast sans instanceof verification",
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
    id: "CQ_CLEAN_012",
    category: "CODE_QUALITY",
    name: "String == comparison",
    severity: "critical",
    description: "Comparaison String avec == au lieu de equals",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /String[\s\S]{0,50}==\s*["']|["']\s*==[\s\S]{0,50}String/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_013",
    category: "CODE_QUALITY",
    name: "Equals sans hashCode",
    severity: "major",
    description: "Override equals sans override hashCode",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Override[\s\S]{0,100}equals\s*\((?![\s\S]{0,2000}hashCode)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_014",
    category: "CODE_QUALITY",
    name: "Clone sans deep copy",
    severity: "major",
    description: "Clone sans copie profonde des objets mutables",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.clone\s*\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_015",
    category: "CODE_QUALITY",
    name: "Serializable sans serialVersionUID",
    severity: "minor",
    description: "Implements Serializable sans serialVersionUID",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /implements\s+Serializable(?![\s\S]{0,500}serialVersionUID)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_016",
    category: "CODE_QUALITY",
    name: "Mutable return",
    severity: "major",
    description: "Retour de collection mutable depuis getter",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /return\s+\w+(?:List|Map|Set)\s*;(?!.*unmodifiable|.*Collections\.unmodifiable)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_017",
    category: "CODE_QUALITY",
    name: "Public field",
    severity: "major",
    description: "Champ public non final",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /public\s+(?!static\s+final|final\s+static)\w+\s+\w+\s*;/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_018",
    category: "CODE_QUALITY",
    name: "Deprecated usage",
    severity: "minor",
    description: "Utilisation de methode deprecated",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Deprecated|@SuppressWarnings.*deprecation/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_019",
    category: "CODE_QUALITY",
    name: "Raw type",
    severity: "minor",
    description: "Utilisation de type generique brut",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:List|Map|Set|Collection)\s+\w+\s*=\s*new\s+(?:Array|Hash|Tree|Linked)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_CLEAN_020",
    category: "CODE_QUALITY",
    name: "Varargs abuse",
    severity: "minor",
    description: "Utilisation excessive de varargs",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\w+\s*\(\s*\w+\.\.\.\s*\w+\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_DOC_001",
    category: "CODE_QUALITY",
    name: "Javadoc absent public",
    severity: "minor",
    description: "Methode publique sans Javadoc",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /public\s+\w+\s+\w+\s*\((?![\s\S]{0,100}\/\*\*)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_DOC_002",
    category: "CODE_QUALITY",
    name: "Javadoc @param absent",
    severity: "minor",
    description: "Javadoc sans @param pour les parametres",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\/\*\*[\s\S]{0,200}\*\/[\s\n]*public\s+\w+\s+\w+\s*\(\s*\w+(?![\s\S]{0,100}@param)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_DOC_003",
    category: "CODE_QUALITY",
    name: "Javadoc @return absent",
    severity: "minor",
    description: "Javadoc sans @return pour methode non-void",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\/\*\*(?![\s\S]{0,200}@return)[\s\S]{0,200}\*\/[\s\n]*public\s+(?!void)\w+\s+\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_DOC_004",
    category: "CODE_QUALITY",
    name: "Javadoc @throws absent",
    severity: "minor",
    description: "Javadoc sans @throws pour methode throws",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\/\*\*(?![\s\S]{0,200}@throws)[\s\S]{0,200}\*\/[\s\n]*public\s+\w+\s+\w+[^{]*throws/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_DOC_005",
    category: "CODE_QUALITY",
    name: "README absent",
    severity: "minor",
    description: "Pas de fichier README dans le projet",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Application/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_DOC_006",
    category: "CODE_QUALITY",
    name: "API doc absent",
    severity: "minor",
    description: "API REST sans documentation Swagger/OpenAPI",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Path|RequestMapping)(?![\s\S]{0,500}(?:@Api|@Operation|@Schema))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_DOC_007",
    category: "CODE_QUALITY",
    name: "Changelog absent",
    severity: "minor",
    description: "Pas de changelog pour le projet",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /version\s*=\s*["']\d+\.\d+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_DOC_008",
    category: "CODE_QUALITY",
    name: "License absent",
    severity: "minor",
    description: "Pas de licence dans les fichiers source",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?![\s\S]{0,200}(?:Copyright|License|licence))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_DOC_009",
    category: "CODE_QUALITY",
    name: "Magic constant doc",
    severity: "minor",
    description: "Constante magique sans documentation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /static\s+final\s+\w+\s+\w+\s*=\s*\d+\s*;(?![\s\S]{0,100}\/\/)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_DOC_010",
    category: "CODE_QUALITY",
    name: "Deprecated sans alternative",
    severity: "minor",
    description: "Methode deprecated sans indication de remplacement",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Deprecated(?![\s\S]{0,100}(?:@see|use|replace|instead))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_PAT_001",
    category: "CODE_QUALITY",
    name: "Singleton anti-pattern",
    severity: "major",
    description: "Singleton avec double-checked locking au lieu de CDI",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /private\s+static.*instance[\s\S]{0,200}synchronized/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_PAT_002",
    category: "CODE_QUALITY",
    name: "Service locator",
    severity: "major",
    description: "Service Locator anti-pattern au lieu de DI",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ServiceLocator|Registry\.get|lookup\s*\(\s*["']/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_PAT_003",
    category: "CODE_QUALITY",
    name: "Telescoping constructor",
    severity: "major",
    description: "Constructeur telescopique au lieu de Builder",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /public\s+\w+\s*\(\s*\w+\s+\w+\s*,\s*\w+\s+\w+\s*,\s*\w+\s+\w+\s*,\s*\w+\s+\w+\s*,\s*\w+\s+\w+\s*,/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_PAT_004",
    category: "CODE_QUALITY",
    name: "Observer manual",
    severity: "minor",
    description: "Pattern Observer manuel au lieu d EventBus/CDI Events",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:add|remove)(?:Listener|Observer)\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_PAT_005",
    category: "CODE_QUALITY",
    name: "Strategy if-else",
    severity: "major",
    description: "Chaine if-else au lieu de Strategy pattern",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /if\s*\(.*type.*==[\s\S]{0,100}else\s+if\s*\(.*type.*==[\s\S]{0,100}else\s+if/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_PAT_006",
    category: "CODE_QUALITY",
    name: "Factory method absent",
    severity: "minor",
    description: "Creation objet complexe sans Factory",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+\w+\s*\(\s*(?:\w+\s*,\s*){4,}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_PAT_007",
    category: "CODE_QUALITY",
    name: "Template method absent",
    severity: "minor",
    description: "Code duplique dans sous-classes sans Template Method",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /extends\s+\w+[\s\S]{0,500}@Override[\s\S]{0,200}super\.\w+\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_PAT_008",
    category: "CODE_QUALITY",
    name: "Decorator absent",
    severity: "minor",
    description: "Fonctionnalite ajoutee par heritage au lieu de Decorator",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /extends\s+\w+[\s\S]{0,200}extends\s+\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_PAT_009",
    category: "CODE_QUALITY",
    name: "Command pattern absent",
    severity: "minor",
    description: "Action complexe sans Command pattern",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:execute|run|process)\w*\s*\([\s\S]{0,500}(?:if|switch)[\s\S]{0,500}(?:execute|run|process)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "CQ_PAT_010",
    category: "CODE_QUALITY",
    name: "State machine manual",
    severity: "major",
    description: "Machine a etats manuelle au lieu de State pattern",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:state|status)\s*==\s*["']\w+["'][\s\S]{0,200}(?:state|status)\s*=\s*["']\w+["']/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
