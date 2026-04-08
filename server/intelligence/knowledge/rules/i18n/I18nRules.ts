/**
 * i18nRules — Auto-generated rules for i18n
 * Total: 30 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const i18nRules: Rule[] = [
  {
    id: "I18N_001",
    category: "I18N",
    name: "String hardcode UI",
    severity: "major",
    description: "Chaine de caracteres en dur dans l interface",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:setText|setTitle|setLabel|setMessage)\s*\(\s*["'][A-Z]/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_002",
    category: "I18N",
    name: "Date format locale",
    severity: "major",
    description: "Format de date sans locale",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SimpleDateFormat\s*\(\s*["'](?!.*Locale)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_003",
    category: "I18N",
    name: "Number format locale",
    severity: "major",
    description: "Format de nombre sans locale",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /DecimalFormat\s*\(\s*["'](?!.*Locale)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_004",
    category: "I18N",
    name: "Currency format locale",
    severity: "major",
    description: "Format de devise sans locale",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /NumberFormat\.getCurrencyInstance\s*\(\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_005",
    category: "I18N",
    name: "Encoding absent",
    severity: "major",
    description: "Pas d encodage UTF-8 explicite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+(?:InputStreamReader|OutputStreamWriter)\s*\(\s*\w+\s*\)(?!.*UTF)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_006",
    category: "I18N",
    name: "Collation locale",
    severity: "minor",
    description: "Tri de chaines sans collation locale",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Collections\.sort\s*\((?!.*Collator)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_007",
    category: "I18N",
    name: "Timezone hardcode",
    severity: "major",
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
    id: "I18N_008",
    category: "I18N",
    name: "Locale default",
    severity: "minor",
    description: "Utilisation de Locale.getDefault() non deterministe",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Locale\.getDefault\s*\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_009",
    category: "I18N",
    name: "String concat i18n",
    severity: "major",
    description: "Concatenation de chaines au lieu de MessageFormat",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /["']\s*\+\s*\w+\s*\+\s*["'].*(?:message|label|title|text)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_010",
    category: "I18N",
    name: "Pluralization absent",
    severity: "minor",
    description: "Pas de gestion du pluriel",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:count|nombre|total)\s*\+\s*["']\s*(?:element|item|result)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_011",
    category: "I18N",
    name: "RTL support absent",
    severity: "minor",
    description: "Pas de support pour langues RTL",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:margin-left|padding-left|text-align.*left)(?![\s\S]{0,200}(?:rtl|RTL|direction))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_012",
    category: "I18N",
    name: "Char encoding filter",
    severity: "major",
    description: "Pas de filtre d encodage caracteres",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /HttpServletRequest(?![\s\S]{0,500}(?:CharacterEncodingFilter|setCharacterEncoding))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_013",
    category: "I18N",
    name: "Error message hardcode",
    severity: "major",
    description: "Message d erreur en dur au lieu de resource bundle",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /throw\s+new\s+\w+\(\s*["'][A-Z]/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_014",
    category: "I18N",
    name: "Validation message hardcode",
    severity: "major",
    description: "Message de validation en dur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /message\s*=\s*["'][A-Z](?!.*\{)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_015",
    category: "I18N",
    name: "Log message i18n",
    severity: "minor",
    description: "Message de log avec texte en dur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.(?:info|warn|error)\s*\(\s*["'][A-Z]/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_016",
    category: "I18N",
    name: "Email template hardcode",
    severity: "major",
    description: "Template email en dur au lieu de template",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:setSubject|setContent|setText)\s*\(\s*["'][A-Z]/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_017",
    category: "I18N",
    name: "PDF content hardcode",
    severity: "major",
    description: "Contenu PDF en dur au lieu de template",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:addCell|addParagraph|drawString)\s*\(\s*["'][A-Z]/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_018",
    category: "I18N",
    name: "SMS content hardcode",
    severity: "major",
    description: "Contenu SMS en dur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:sendSms|sendMessage)\s*\([\s\S]{0,100}["'][A-Z]/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_019",
    category: "I18N",
    name: "Notification hardcode",
    severity: "major",
    description: "Notification en dur au lieu de template",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:notify|sendNotification)\s*\([\s\S]{0,100}["'][A-Z]/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_020",
    category: "I18N",
    name: "Country code hardcode",
    severity: "minor",
    description: "Code pays en dur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /["'](?:FR|US|GB|MA|DE|ES|IT|PT|NL|BE)["']/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_021",
    category: "I18N",
    name: "Phone format hardcode",
    severity: "minor",
    description: "Format telephone en dur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /["']\+?\d{2,3}["']|phonePrefix/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_022",
    category: "I18N",
    name: "Address format hardcode",
    severity: "minor",
    description: "Format adresse en dur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:zipCode|postalCode|codePostal).*\d{5}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_023",
    category: "I18N",
    name: "Calendar locale",
    severity: "minor",
    description: "Calendrier sans locale",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Calendar\.getInstance\s*\(\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_024",
    category: "I18N",
    name: "Resource bundle absent",
    severity: "major",
    description: "Pas de resource bundle pour i18n",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?:Controller|Service)(?![\s\S]{0,2000}(?:MessageSource|ResourceBundle|messages))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_025",
    category: "I18N",
    name: "Locale resolver absent",
    severity: "minor",
    description: "Pas de LocaleResolver configure",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?:Config|Application)(?![\s\S]{0,2000}(?:LocaleResolver|LocaleChangeInterceptor))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_026",
    category: "I18N",
    name: "Content-Language absent",
    severity: "minor",
    description: "Pas de header Content-Language dans les reponses",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /response\.setHeader(?!.*Content-Language)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_027",
    category: "I18N",
    name: "Accept-Language absent",
    severity: "minor",
    description: "Pas de gestion du header Accept-Language",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /request\.getHeader(?!.*Accept-Language)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_028",
    category: "I18N",
    name: "Unicode normalization",
    severity: "minor",
    description: "Pas de normalisation Unicode",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /String\s+\w+\s*=(?![\s\S]{0,100}(?:Normalizer|normalize))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_029",
    category: "I18N",
    name: "Char length vs byte",
    severity: "minor",
    description: "Validation longueur en bytes au lieu de caracteres",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.length\s*\(\s*\)\s*(?:>|<|==)\s*\d+(?!.*codePointCount)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "I18N_030",
    category: "I18N",
    name: "Regex unicode absent",
    severity: "minor",
    description: "Regex sans support Unicode",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Pattern\.compile\s*\(\s*["'](?!.*\\p\{|.*UNICODE)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
