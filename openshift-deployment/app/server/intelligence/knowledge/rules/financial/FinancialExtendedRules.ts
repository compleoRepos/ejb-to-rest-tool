/**
 * financialExtendedRules — Auto-generated rules for financial
 * Total: 40 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const financialExtendedRules: Rule[] = [
  {
    id: "FIN_PREC_001",
    category: "FINANCIAL",
    name: "Double pour montant",
    severity: "critical",
    description: "Utilisation de double/float pour un montant financier",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(double|float)\s+\w*(amount|montant|solde|balance|prix|price|total|sum)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_PREC_002",
    category: "FINANCIAL",
    name: "Division sans BigDecimal",
    severity: "critical",
    description: "Division arithmetique sans BigDecimal.divide()",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b\w+\s*\/\s*\w+(?!.*BigDecimal)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_PREC_003",
    category: "FINANCIAL",
    name: "BigDecimal.valueOf(double)",
    severity: "major",
    description: "Construction BigDecimal depuis double perd la precision",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /BigDecimal\.valueOf\s*\(\s*\w+\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_PREC_004",
    category: "FINANCIAL",
    name: "new BigDecimal(double)",
    severity: "critical",
    description: "new BigDecimal(double) perd la precision, utiliser new BigDecimal(String)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+BigDecimal\s*\(\s*(?!["'])\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_PREC_005",
    category: "FINANCIAL",
    name: "Arrondi HALF_UP manquant",
    severity: "major",
    description: "Operation BigDecimal sans mode arrondi explicite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.divide\s*\([^)]*\)(?!.*RoundingMode)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_PREC_006",
    category: "FINANCIAL",
    name: "Scale non defini",
    severity: "major",
    description: "BigDecimal sans setScale pour montant financier",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /BigDecimal(?!.*setScale).*\b(amount|montant|solde)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_PREC_007",
    category: "FINANCIAL",
    name: "Math.round sur montant",
    severity: "critical",
    description: "Math.round() sur montant financier perd la precision",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Math\.round\s*\(.*\b(amount|montant|prix|total)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_PREC_008",
    category: "FINANCIAL",
    name: "Comparaison == BigDecimal",
    severity: "major",
    description: "Comparaison BigDecimal avec == au lieu de compareTo",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /BigDecimal.*==|==.*BigDecimal/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_PREC_009",
    category: "FINANCIAL",
    name: "String.format montant",
    severity: "minor",
    description: "Formatage montant avec String.format au lieu de DecimalFormat",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /String\.format\s*\(.*%[.\d]*f.*\b(amount|montant)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_PREC_010",
    category: "FINANCIAL",
    name: "Currency hardcode",
    severity: "major",
    description: "Code devise en dur au lieu de Currency.getInstance()",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /["'](EUR|USD|GBP|MAD|XOF)["']/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_TX_001",
    category: "FINANCIAL",
    name: "Transaction sans rollback",
    severity: "critical",
    description: "Bloc transactionnel sans gestion rollback explicite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /begin\s*\(\)|beginTransaction(?!.*rollback)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_TX_002",
    category: "FINANCIAL",
    name: "Commit sans try-finally",
    severity: "critical",
    description: "Commit transactionnel hors bloc try-finally",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.commit\s*\(\)(?!.*finally)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_TX_003",
    category: "FINANCIAL",
    name: "Transaction imbriquee",
    severity: "major",
    description: "Transactions imbriquees detectees",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /beginTransaction[\s\S]{0,500}beginTransaction/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_TX_004",
    category: "FINANCIAL",
    name: "Timeout transaction absent",
    severity: "major",
    description: "Transaction sans timeout configure",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Transactional(?!.*timeout)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_TX_005",
    category: "FINANCIAL",
    name: "Isolation READ_UNCOMMITTED",
    severity: "critical",
    description: "Niveau isolation READ_UNCOMMITTED pour donnees financieres",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /READ_UNCOMMITTED/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_TX_006",
    category: "FINANCIAL",
    name: "Propagation REQUIRES_NEW abuse",
    severity: "minor",
    description: "REQUIRES_NEW excessif peut causer des deadlocks",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /REQUIRES_NEW/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_TX_007",
    category: "FINANCIAL",
    name: "Transaction read-only manquante",
    severity: "minor",
    description: "Methode de lecture sans @Transactional(readOnly=true)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\bfind\w+|get\w+|list\w+|search\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_TX_008",
    category: "FINANCIAL",
    name: "Savepoint non utilise",
    severity: "minor",
    description: "Transaction longue sans savepoints intermediaires",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Transactional[\s\S]{0,2000}(?!.*[Ss]avepoint)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_TX_009",
    category: "FINANCIAL",
    name: "Lock pessimiste absent",
    severity: "major",
    description: "Mise a jour solde sans verrouillage pessimiste",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /update.*\b(solde|balance|amount)(?!.*PESSIMISTIC|.*FOR UPDATE)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_TX_010",
    category: "FINANCIAL",
    name: "Double spending possible",
    severity: "critical",
    description: "Debit sans verification atomique du solde",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.debit\s*\(|withdraw\s*\((?!.*synchronized|.*PESSIMISTIC)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_AUD_001",
    category: "FINANCIAL",
    name: "Operation sans trace audit",
    severity: "critical",
    description: "Operation financiere sans journalisation audit",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(transfer|virement|debit|credit)\s*\((?!.*audit|.*log|.*trace)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_AUD_002",
    category: "FINANCIAL",
    name: "Montant sans validation",
    severity: "critical",
    description: "Montant accepte sans validation de plage",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(amount|montant)\b(?!.*validate|.*check|.*verify|.*assert)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_AUD_003",
    category: "FINANCIAL",
    name: "IBAN sans validation",
    severity: "major",
    description: "IBAN utilise sans validation de format",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b[Ii][Bb][Aa][Nn]\b(?!.*valid|.*check|.*verify)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_AUD_004",
    category: "FINANCIAL",
    name: "RIB sans checksum",
    severity: "major",
    description: "RIB utilise sans verification cle de controle",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b[Rr][Ii][Bb]\b(?!.*check|.*valid|.*cle)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_AUD_005",
    category: "FINANCIAL",
    name: "Devise non validee",
    severity: "major",
    description: "Code devise accepte sans validation ISO 4217",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /currency|devise(?!.*ISO|.*valid|.*Currency\.getInstance)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_AUD_006",
    category: "FINANCIAL",
    name: "Date valeur absente",
    severity: "major",
    description: "Operation financiere sans date de valeur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(transfer|virement|operation)\b(?!.*dateValeur|.*valueDate)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_AUD_007",
    category: "FINANCIAL",
    name: "Numero compte en clair log",
    severity: "critical",
    description: "Numero de compte logue en clair",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*\b(accountNumber|numeroCompte|iban|rib)\b/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_AUD_008",
    category: "FINANCIAL",
    name: "Solde negatif autorise",
    severity: "major",
    description: "Pas de verification de solde minimum avant debit",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /debit|withdraw(?!.*solde.*>=|.*balance.*>=|.*sufficient)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_AUD_009",
    category: "FINANCIAL",
    name: "Plafond non verifie",
    severity: "major",
    description: "Virement sans verification du plafond journalier",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /virement|transfer(?!.*plafond|.*limit|.*ceiling|.*threshold)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_AUD_010",
    category: "FINANCIAL",
    name: "Beneficiaire non valide",
    severity: "major",
    description: "Ajout beneficiaire sans validation KYC",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /benefici|payee(?!.*valid|.*kyc|.*verify)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_REG_001",
    category: "FINANCIAL",
    name: "PCI-DSS carte en clair",
    severity: "critical",
    description: "Numero de carte stocke en clair",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(cardNumber|numeroCarte|pan)\b.*=(?!.*encrypt|.*mask|.*hash)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_REG_002",
    category: "FINANCIAL",
    name: "CVV stocke",
    severity: "critical",
    description: "CVV/CVC stocke en base de donnees",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(cvv|cvc|cvv2)\b/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_REG_003",
    category: "FINANCIAL",
    name: "RGPD donnees sensibles",
    severity: "critical",
    description: "Donnees personnelles sans consentement explicite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(dateNaissance|birthDate|ssn|numSecu)\b(?!.*consent|.*rgpd)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_REG_004",
    category: "FINANCIAL",
    name: "KYC incomplet",
    severity: "major",
    description: "Ouverture compte sans verification KYC complete",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /openAccount|ouvrirCompte(?!.*kyc|.*identity|.*verify)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_REG_005",
    category: "FINANCIAL",
    name: "AML seuil non verifie",
    severity: "critical",
    description: "Transaction sans verification anti-blanchiment",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(amount|montant)\s*>\s*\d{4,}(?!.*aml|.*antiBlanchiment|.*suspicious)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_REG_006",
    category: "FINANCIAL",
    name: "SWIFT sans validation",
    severity: "major",
    description: "Code SWIFT/BIC utilise sans validation format",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(swift|bic)\b(?!.*valid|.*check)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_REG_007",
    category: "FINANCIAL",
    name: "Taux change hardcode",
    severity: "major",
    description: "Taux de change en dur au lieu de service externe",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(rate|taux)\s*=\s*[\d.]+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_REG_008",
    category: "FINANCIAL",
    name: "Signature electronique absente",
    severity: "major",
    description: "Document contractuel sans signature electronique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /contrat|contract(?!.*sign|.*signature)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_REG_009",
    category: "FINANCIAL",
    name: "Archivage legal absent",
    severity: "minor",
    description: "Transaction sans archivage legal conforme",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\b(transaction|operation)\b(?!.*archive|.*retention)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "FIN_REG_010",
    category: "FINANCIAL",
    name: "Horodatage non certifie",
    severity: "minor",
    description: "Operation sans horodatage certifie (TSA)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /timestamp|horodatage(?!.*certif|.*tsa|.*ntp)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
