/**
 * databaseRules — Auto-generated rules for database
 * Total: 50 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const databaseRules: Rule[] = [
  {
    id: "DB_SCH_001",
    category: "DATABASE",
    name: "Table sans PK",
    severity: "critical",
    description: "Table sans cle primaire",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /CREATE\s+TABLE(?![\s\S]{0,500}PRIMARY\s+KEY)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_002",
    category: "DATABASE",
    name: "FK absente",
    severity: "major",
    description: "Relation sans foreign key",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:_id|Id)\s+(?:INT|BIGINT|VARCHAR)(?![\s\S]{0,200}(?:FOREIGN\s+KEY|REFERENCES))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_003",
    category: "DATABASE",
    name: "Index absent",
    severity: "major",
    description: "Colonne de recherche sans index",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /WHERE\s+\w+\.\w+\s*=(?![\s\S]{0,500}(?:CREATE\s+INDEX|@Index))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_004",
    category: "DATABASE",
    name: "VARCHAR sans taille",
    severity: "minor",
    description: "VARCHAR sans taille explicite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /VARCHAR\s*(?:\(\s*\)|\b(?!\s*\())/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_005",
    category: "DATABASE",
    name: "TEXT pour court",
    severity: "minor",
    description: "Type TEXT pour champ court au lieu de VARCHAR",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\bTEXT\b.*(?:name|code|status|type|email)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_006",
    category: "DATABASE",
    name: "FLOAT pour montant",
    severity: "critical",
    description: "Type FLOAT/DOUBLE pour montant financier",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:FLOAT|DOUBLE)\s+\w*(?:amount|montant|price|prix|balance|solde)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_007",
    category: "DATABASE",
    name: "Timestamp sans timezone",
    severity: "major",
    description: "Timestamp sans timezone",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /TIMESTAMP(?!\s+WITH\s+TIME\s*ZONE)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_008",
    category: "DATABASE",
    name: "Auto increment overflow",
    severity: "minor",
    description: "INT auto-increment au lieu de BIGINT",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /INT\s+AUTO_INCREMENT|SERIAL(?!8|BIGSERIAL)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_009",
    category: "DATABASE",
    name: "Enum en DB",
    severity: "minor",
    description: "Type ENUM en base au lieu de table de reference",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ENUM\s*\(/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_010",
    category: "DATABASE",
    name: "Nullable excessif",
    severity: "minor",
    description: "Colonne nullable sans raison metier",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:VARCHAR|INT|BIGINT)\s+(?!NOT\s+NULL)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_011",
    category: "DATABASE",
    name: "Default absent",
    severity: "minor",
    description: "Colonne sans valeur par defaut",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:VARCHAR|INT|BOOLEAN)\s+NOT\s+NULL(?!\s+DEFAULT)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_012",
    category: "DATABASE",
    name: "Composite PK",
    severity: "minor",
    description: "Cle primaire composite au lieu de surrogate key",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /PRIMARY\s+KEY\s*\(\s*\w+\s*,\s*\w+/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_013",
    category: "DATABASE",
    name: "Natural key",
    severity: "minor",
    description: "Cle naturelle comme PK au lieu de surrogate",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /PRIMARY\s+KEY\s*\(\s*(?:email|code|name|numero)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_014",
    category: "DATABASE",
    name: "EAV anti-pattern",
    severity: "major",
    description: "Entity-Attribute-Value anti-pattern",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:attribute_name|attribute_value|property_name|property_value)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_015",
    category: "DATABASE",
    name: "Polymorphic association",
    severity: "major",
    description: "Association polymorphique sans contrainte",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:entity_type|object_type|ref_type).*(?:entity_id|object_id|ref_id)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_016",
    category: "DATABASE",
    name: "JSON column abuse",
    severity: "minor",
    description: "Colonne JSON pour donnees structurees",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /JSON\b|JSONB\b/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_017",
    category: "DATABASE",
    name: "Soft delete column",
    severity: "minor",
    description: "Soft delete sans index partiel",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:deleted|is_deleted|deleted_at)(?![\s\S]{0,200}(?:INDEX|WHERE.*deleted))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_018",
    category: "DATABASE",
    name: "Audit columns absent",
    severity: "major",
    description: "Table sans colonnes d audit",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /CREATE\s+TABLE(?![\s\S]{0,500}(?:created_at|updated_at|created_by))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_019",
    category: "DATABASE",
    name: "Cascade delete",
    severity: "major",
    description: "CASCADE DELETE sans protection",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ON\s+DELETE\s+CASCADE/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_SCH_020",
    category: "DATABASE",
    name: "Table sans commentaire",
    severity: "minor",
    description: "Table sans commentaire/documentation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /CREATE\s+TABLE(?![\s\S]{0,200}COMMENT)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_001",
    category: "DATABASE",
    name: "SELECT *",
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
    id: "DB_QRY_002",
    category: "DATABASE",
    name: "N+1 query",
    severity: "critical",
    description: "Requete dans une boucle (N+1)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /for\s*\([\s\S]{0,200}(?:executeQuery|createQuery|find\w+By)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_003",
    category: "DATABASE",
    name: "LIKE %prefix",
    severity: "major",
    description: "LIKE avec wildcard en debut",
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
    id: "DB_QRY_004",
    category: "DATABASE",
    name: "Subquery correlee",
    severity: "major",
    description: "Sous-requete correlee couteuse",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /WHERE\s+\w+\s*IN\s*\(\s*SELECT/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_005",
    category: "DATABASE",
    name: "DISTINCT masque",
    severity: "minor",
    description: "DISTINCT pour masquer des duplicats",
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
    id: "DB_QRY_006",
    category: "DATABASE",
    name: "ORDER BY sans index",
    severity: "minor",
    description: "ORDER BY sur colonne non indexee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ORDER\s+BY\s+\w+(?![\s\S]{0,200}(?:INDEX|@Index))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_007",
    category: "DATABASE",
    name: "COUNT(*) lourd",
    severity: "minor",
    description: "COUNT(*) sur grande table sans filtre",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /COUNT\s*\(\s*\*\s*\)(?!\s*WHERE)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_008",
    category: "DATABASE",
    name: "JOIN cartesien",
    severity: "critical",
    description: "JOIN sans condition ON",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /FROM\s+\w+\s*,\s*\w+\s+WHERE/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_009",
    category: "DATABASE",
    name: "Function sur index",
    severity: "major",
    description: "Fonction appliquee sur colonne indexee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /WHERE\s+(?:UPPER|LOWER|TRIM|DATE|YEAR)\s*\(\s*\w+/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_010",
    category: "DATABASE",
    name: "OR au lieu de UNION",
    severity: "minor",
    description: "OR sur colonnes differentes au lieu de UNION",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /WHERE[\s\S]{0,100}OR\s+\w+\.\w+/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_011",
    category: "DATABASE",
    name: "Batch absent",
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
    id: "DB_QRY_012",
    category: "DATABASE",
    name: "Fetch size absent",
    severity: "major",
    description: "ResultSet sans fetchSize",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /executeQuery(?![\s\S]{0,200}setFetchSize)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_013",
    category: "DATABASE",
    name: "Connection leak",
    severity: "critical",
    description: "Connection non fermee dans finally",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /getConnection\s*\((?![\s\S]{0,500}(?:\.close\(\)|try\s*\())/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_014",
    category: "DATABASE",
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
    id: "DB_QRY_015",
    category: "DATABASE",
    name: "Cursor non ferme",
    severity: "major",
    description: "Cursor/ResultSet non ferme",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /executeQuery\s*\((?![\s\S]{0,500}\.close\(\))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_016",
    category: "DATABASE",
    name: "Transaction longue",
    severity: "major",
    description: "Transaction ouverte trop longtemps",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Transactional[\s\S]{2000,}?(?:return|throw)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_017",
    category: "DATABASE",
    name: "Lock escalation",
    severity: "major",
    description: "Risque d escalation de verrou",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SELECT.*FOR\s+UPDATE(?!.*NOWAIT|.*SKIP\s+LOCKED)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_018",
    category: "DATABASE",
    name: "Deadlock pattern",
    severity: "critical",
    description: "Pattern de deadlock potentiel",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /UPDATE\s+\w+[\s\S]{0,500}UPDATE\s+(?!\1)\w+/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_019",
    category: "DATABASE",
    name: "Implicit conversion",
    severity: "minor",
    description: "Conversion implicite dans WHERE",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /WHERE\s+\w+\s*=\s*['"]?\d+['"]?/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_QRY_020",
    category: "DATABASE",
    name: "Pagination OFFSET",
    severity: "minor",
    description: "Pagination avec OFFSET au lieu de keyset",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /OFFSET\s+\d+|\.setFirstResult\s*\(/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_MIG_001",
    category: "DATABASE",
    name: "Schema change sans migration",
    severity: "critical",
    description: "Modification schema sans script de migration",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_MIG_002",
    category: "DATABASE",
    name: "Data migration absent",
    severity: "major",
    description: "Changement schema sans migration de donnees",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ALTER\s+TABLE.*(?:DROP|RENAME|MODIFY)(?![\s\S]{0,500}(?:UPDATE|INSERT|migrate))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_MIG_003",
    category: "DATABASE",
    name: "Rollback absent",
    severity: "major",
    description: "Migration sans script de rollback",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:UP|migrate)(?![\s\S]{0,500}(?:DOWN|rollback|revert))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_MIG_004",
    category: "DATABASE",
    name: "Index concurrent absent",
    severity: "minor",
    description: "Creation index sans CONCURRENTLY",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /CREATE\s+INDEX(?!\s+CONCURRENTLY)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_MIG_005",
    category: "DATABASE",
    name: "Column rename",
    severity: "major",
    description: "Renommage colonne sans compatibilite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /RENAME\s+COLUMN/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_MIG_006",
    category: "DATABASE",
    name: "NOT NULL sans default",
    severity: "critical",
    description: "Ajout NOT NULL sans valeur par defaut",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ADD\s+COLUMN.*NOT\s+NULL(?!\s+DEFAULT)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_MIG_007",
    category: "DATABASE",
    name: "Drop column data loss",
    severity: "critical",
    description: "Suppression colonne sans backup",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /DROP\s+COLUMN/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_MIG_008",
    category: "DATABASE",
    name: "Type change lossy",
    severity: "major",
    description: "Changement type avec perte de donnees",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ALTER.*(?:COLUMN|TYPE).*(?:VARCHAR.*INT|TEXT.*VARCHAR|BIGINT.*INT)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_MIG_009",
    category: "DATABASE",
    name: "Sequence reset",
    severity: "major",
    description: "Reset de sequence sans verification",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ALTER\s+SEQUENCE.*RESTART/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "DB_MIG_010",
    category: "DATABASE",
    name: "Truncate en production",
    severity: "critical",
    description: "TRUNCATE TABLE en production",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /TRUNCATE\s+TABLE/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
