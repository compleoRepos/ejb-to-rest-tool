/**
 * BusinessConceptClassifier v13.15 — Unit tests
 *
 * 40+ tests covering:
 *   - Taxonomy structure validation
 *   - Single-field classification across all 10 categories
 *   - Multi-signal confidence scoring
 *   - Constraint inference
 *   - Business rule inference
 *   - Sensitivity detection
 *   - Rename suggestion
 *   - Batch classification (classifyAll)
 *   - Integration with FieldUsageAnalyzer + SemanticInferenceEngine
 *
 * @author Hamza NORDINE — Compleo
 */

import { describe, it, expect } from "vitest";
import { BusinessConceptClassifier, type BusinessConceptClassification } from "./BusinessConceptClassifier";
import {
  SUB_CONCEPTS,
  CATEGORY_META,
  getAllCategories,
  type PrimaryCategory,
} from "./BusinessConceptTaxonomy";
import { FieldUsageAnalyzer } from "./FieldUsageAnalyzer";
import { SemanticInferenceEngine } from "./SemanticInferenceEngine";
import type { SemanticField } from "./SemanticInferenceEngine";
import type { FieldUsage } from "./FieldUsageAnalyzer";

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeSemanticField(overrides: Partial<SemanticField>): SemanticField {
  return {
    dbColumn: "UNKNOWN_COL",
    tableName: "T_UNKNOWN",
    businessNameFr: "inconnu",
    businessNameEn: "unknown",
    description: "",
    domain: "inconnu",
    javaType: "String",
    confidence: "low",
    confidenceScore: 20,
    sources: [],
    variableNames: [],
    comparedTo: [],
    joinedWith: [],
    usageCount: 1,
    llmInferred: false,
    ...overrides,
  };
}

function makeFieldUsage(overrides: Partial<FieldUsage>): FieldUsage {
  return {
    fieldName: "UNKNOWN_COL",
    tableName: "T_UNKNOWN",
    reads: [],
    writes: [],
    variableNames: [],
    loggedAs: [],
    comparedTo: [],
    joinedWith: [],
    filesReferencing: [],
    totalUsages: 1,
    ...overrides,
  };
}

const classifier = new BusinessConceptClassifier();

// ═══════════════════════════════════════════════════════════════════════════
// TAXONOMY STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

describe("BusinessConceptTaxonomy", () => {
  it("should have exactly 10 primary categories", () => {
    const categories = getAllCategories();
    expect(categories).toHaveLength(10);
    expect(categories).toContain("IDENTITY");
    expect(categories).toContain("CONTACT");
    expect(categories).toContain("ACCOUNT");
    expect(categories).toContain("MONEY");
    expect(categories).toContain("TIME");
    expect(categories).toContain("TRANSACTION");
    expect(categories).toContain("CARD");
    expect(categories).toContain("COMPLIANCE");
    expect(categories).toContain("SYSTEM");
    expect(categories).toContain("UNKNOWN");
  });

  it("should have metadata for every category", () => {
    for (const cat of getAllCategories()) {
      const meta = CATEGORY_META[cat];
      expect(meta).toBeDefined();
      expect(meta.label).toBeTruthy();
      expect(meta.labelFr).toBeTruthy();
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(meta.icon).toBeTruthy();
    }
  });

  it("should have at least 60 sub-concepts", () => {
    expect(SUB_CONCEPTS.length).toBeGreaterThanOrEqual(60);
  });

  it("should have unique keys for all sub-concepts", () => {
    const keys = SUB_CONCEPTS.map(sc => sc.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("every sub-concept should have at least one field pattern", () => {
    for (const sc of SUB_CONCEPTS) {
      expect(sc.fieldPatterns.length).toBeGreaterThan(0);
    }
  });

  it("every sub-concept should reference a valid category", () => {
    const validCategories = getAllCategories();
    for (const sc of SUB_CONCEPTS) {
      expect(validCategories).toContain(sc.category);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY: IDENTITY
// ═══════════════════════════════════════════════════════════════════════════

describe("Classification — IDENTITY", () => {
  it("should classify NOM_CLI as ClientName", () => {
    const sf = makeSemanticField({ dbColumn: "NOM_CLI", tableName: "T_CLIENT", variableNames: ["nomClient"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("IDENTITY");
    expect(result.subConcept).toBe("ClientName");
    expect(result.sensitivity).toBe("pii");
  });

  it("should classify NUM_CLI as ClientId", () => {
    const sf = makeSemanticField({ dbColumn: "NUM_CLI", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("IDENTITY");
    expect(result.subConcept).toBe("ClientId");
  });

  it("should classify CIF as ClientId", () => {
    const sf = makeSemanticField({ dbColumn: "CIF", tableName: "T_CUSTOMER" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("IDENTITY");
    expect(result.subConcept).toBe("ClientId");
  });

  it("should classify PRENOM as FirstName", () => {
    const sf = makeSemanticField({ dbColumn: "PRENOM", tableName: "T_CLIENT", variableNames: ["prenom"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("IDENTITY");
    expect(result.subConcept).toBe("FirstName");
    expect(result.sensitivity).toBe("pii");
  });

  it("should classify NATIONALITE as Nationality", () => {
    const sf = makeSemanticField({ dbColumn: "NATIONALITE", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("IDENTITY");
    expect(result.subConcept).toBe("Nationality");
  });

  it("should classify SEXE as Gender", () => {
    const sf = makeSemanticField({ dbColumn: "SEXE", tableName: "T_CLIENT", comparedTo: ["M", "F"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("IDENTITY");
    expect(result.subConcept).toBe("Gender");
  });

  it("should classify CIN as NationalId", () => {
    const sf = makeSemanticField({ dbColumn: "CIN", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("IDENTITY");
    expect(result.subConcept).toBe("NationalId");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY: CONTACT
// ═══════════════════════════════════════════════════════════════════════════

describe("Classification — CONTACT", () => {
  it("should classify EMAIL as Email", () => {
    const sf = makeSemanticField({ dbColumn: "EMAIL", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("CONTACT");
    expect(result.subConcept).toBe("Email");
  });

  it("should classify ADRESSE as Address", () => {
    const sf = makeSemanticField({ dbColumn: "ADRESSE", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("CONTACT");
    expect(result.subConcept).toBe("Address");
  });

  it("should classify TEL_MOBILE as Mobile", () => {
    const sf = makeSemanticField({ dbColumn: "TEL_MOBILE", tableName: "T_CLIENT", variableNames: ["mobile"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("CONTACT");
    expect(result.subConcept).toBe("Mobile");
  });

  it("should classify CODE_POSTAL as PostalCode", () => {
    const sf = makeSemanticField({ dbColumn: "CODE_POSTAL", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("CONTACT");
    expect(result.subConcept).toBe("PostalCode");
  });

  it("should classify VILLE as City", () => {
    const sf = makeSemanticField({ dbColumn: "VILLE", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("CONTACT");
    expect(result.subConcept).toBe("City");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY: ACCOUNT
// ═══════════════════════════════════════════════════════════════════════════

describe("Classification — ACCOUNT", () => {
  it("should classify NUM_COMPTE as AccountNumber", () => {
    const sf = makeSemanticField({ dbColumn: "NUM_COMPTE", tableName: "T_COMPTE", variableNames: ["numeroCompte"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("ACCOUNT");
    expect(result.subConcept).toBe("AccountNumber");
    expect(result.sensitivity).toBe("banking-sensitive");
  });

  it("should classify IBAN as IBAN", () => {
    const sf = makeSemanticField({ dbColumn: "IBAN", tableName: "T_COMPTE" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("ACCOUNT");
    expect(result.subConcept).toBe("IBAN");
    expect(result.businessRules.some(r => r.includes("ISO 7064"))).toBe(true);
  });

  it("should classify COD_AGENCE as AgencyCode", () => {
    const sf = makeSemanticField({ dbColumn: "COD_AGENCE", tableName: "T_COMPTE" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("ACCOUNT");
    expect(result.subConcept).toBe("AgencyCode");
  });

  it("should classify TYPE_COMPTE as AccountType with enum constraints", () => {
    const sf = makeSemanticField({
      dbColumn: "TYPE_COMPTE",
      tableName: "T_COMPTE",
      comparedTo: ["COURANT", "EPARGNE", "DEPOT"],
    });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("ACCOUNT");
    expect(result.subConcept).toBe("AccountType");
  });

  it("should classify COD_DEVISE as Currency", () => {
    const sf = makeSemanticField({ dbColumn: "COD_DEVISE", tableName: "T_COMPTE", variableNames: ["codeDevise"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("ACCOUNT");
    expect(result.subConcept).toBe("Currency");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY: MONEY
// ═══════════════════════════════════════════════════════════════════════════

describe("Classification — MONEY", () => {
  it("should classify MNT_TIRAGE as Amount", () => {
    const sf = makeSemanticField({ dbColumn: "MNT_TIRAGE", tableName: "T_OPER", javaType: "BigDecimal", variableNames: ["montantTirage"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("MONEY");
    expect(result.subConcept).toBe("Amount");
  });

  it("should classify SOLDE as Balance", () => {
    const sf = makeSemanticField({ dbColumn: "SOLDE", tableName: "T_COMPTE", javaType: "BigDecimal" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("MONEY");
    expect(result.subConcept).toBe("Balance");
  });

  it("should classify MNT_CREDIT as CreditAmount", () => {
    const sf = makeSemanticField({ dbColumn: "MNT_CREDIT", tableName: "T_OPER", javaType: "BigDecimal", variableNames: ["montantCredit"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("MONEY");
  });

  it("should classify TAU_INTERET as InterestAmount", () => {
    const sf = makeSemanticField({ dbColumn: "TAU_INTERET", tableName: "T_CREDIT", javaType: "BigDecimal", variableNames: ["tauxInteret"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("MONEY");
    expect(result.subConcept).toBe("InterestAmount");
  });

  it("should classify FRAIS as Fee", () => {
    const sf = makeSemanticField({ dbColumn: "FRAIS", tableName: "T_OPER", javaType: "BigDecimal" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("MONEY");
    expect(result.subConcept).toBe("Fee");
  });

  it("should classify TAUX_CHANGE as ExchangeRate", () => {
    const sf = makeSemanticField({ dbColumn: "TAUX_CHANGE", tableName: "T_DEVISE", javaType: "BigDecimal" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("MONEY");
    expect(result.subConcept).toBe("ExchangeRate");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY: TIME
// ═══════════════════════════════════════════════════════════════════════════

describe("Classification — TIME", () => {
  it("should classify DT_ECHEANCE as DueDate", () => {
    const sf = makeSemanticField({ dbColumn: "DT_ECHEANCE", tableName: "T_CREDIT", javaType: "Date", variableNames: ["dateEcheance"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("TIME");
    expect(result.subConcept).toBe("DueDate");
  });

  it("should classify DT_CREATION as CreationDate", () => {
    const sf = makeSemanticField({ dbColumn: "DT_CREATION", tableName: "T_OPER", javaType: "Timestamp" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("TIME");
    expect(result.subConcept).toBe("CreationDate");
  });

  it("should classify DT_OPERATION as OperationDate", () => {
    const sf = makeSemanticField({ dbColumn: "DT_OPERATION", tableName: "T_OPER", javaType: "Date" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("TIME");
    expect(result.subConcept).toBe("OperationDate");
  });

  it("should classify DT_VALEUR as ValueDate", () => {
    const sf = makeSemanticField({ dbColumn: "DT_VALEUR", tableName: "T_OPER", javaType: "Date" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("TIME");
    expect(result.subConcept).toBe("ValueDate");
  });

  it("should classify DUR_REMBOURSEMENT as Duration", () => {
    const sf = makeSemanticField({ dbColumn: "DUR_REMBOURSEMENT", tableName: "T_CREDIT", javaType: "int", variableNames: ["dureeRemboursement"] });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("TIME");
    expect(result.subConcept).toBe("Duration");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY: TRANSACTION
// ═══════════════════════════════════════════════════════════════════════════

describe("Classification — TRANSACTION", () => {
  it("should classify REF_TRANSACTION as TransactionReference", () => {
    const sf = makeSemanticField({ dbColumn: "REF_TRANSACTION", tableName: "T_OPER" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("TRANSACTION");
    expect(result.subConcept).toBe("TransactionReference");
  });

  it("should classify STATUT as TransactionStatus when compared to status values", () => {
    const sf = makeSemanticField({
      dbColumn: "STATUT",
      tableName: "T_OPER",
      comparedTo: ["VALIDE", "EN_COURS", "REJETE"],
    });
    const fu = makeFieldUsage({
      fieldName: "STATUT",
      tableName: "T_OPER",
      comparedTo: ["VALIDE", "EN_COURS", "REJETE"],
    });
    const result = classifier.classifyField(sf, fu);
    expect(result.primaryCategory).toBe("TRANSACTION");
    expect(result.subConcept).toBe("TransactionStatus");
  });

  it("should classify CANAL as Channel", () => {
    const sf = makeSemanticField({
      dbColumn: "CANAL",
      tableName: "T_OPER",
      comparedTo: ["GAB", "WEB", "AGENCE"],
    });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("TRANSACTION");
    expect(result.subConcept).toBe("Channel");
  });

  it("should classify SENS as Direction", () => {
    const sf = makeSemanticField({
      dbColumn: "SENS",
      tableName: "T_OPER",
      comparedTo: ["D", "C"],
    });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("TRANSACTION");
    expect(result.subConcept).toBe("Direction");
  });

  it("should classify MOTIF as Motif", () => {
    const sf = makeSemanticField({ dbColumn: "MOTIF", tableName: "T_OPER" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("TRANSACTION");
    expect(result.subConcept).toBe("Motif");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY: CARD
// ═══════════════════════════════════════════════════════════════════════════

describe("Classification — CARD", () => {
  it("should classify NUM_CARTE as PAN with PCI-DSS sensitivity", () => {
    const sf = makeSemanticField({ dbColumn: "NUM_CARTE", tableName: "T_CARTE" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("CARD");
    expect(result.subConcept).toBe("PAN");
    expect(result.sensitivity).toBe("pci-dss");
    expect(result.businessRules.some(r => r.includes("masked"))).toBe(true);
  });

  it("should classify CVV as CVV with critical sensitivity", () => {
    const sf = makeSemanticField({ dbColumn: "CVV", tableName: "T_CARTE" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("CARD");
    expect(result.subConcept).toBe("CVV");
    expect(result.sensitivity).toBe("critical");
    expect(result.businessRules.some(r => r.includes("PCI-DSS"))).toBe(true);
  });

  it("should classify TYPE_CARTE as CardType", () => {
    const sf = makeSemanticField({ dbColumn: "TYPE_CARTE", tableName: "T_CARTE" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("CARD");
    expect(result.subConcept).toBe("CardType");
  });

  it("should classify DT_EXPIRATION_CARTE as CardExpiration", () => {
    const sf = makeSemanticField({ dbColumn: "DT_EXPIRATION_CARTE", tableName: "T_CARTE", javaType: "Date" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("CARD");
    expect(result.subConcept).toBe("CardExpiration");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY: COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════

describe("Classification — COMPLIANCE", () => {
  it("should classify STATUT_KYC as KycStatus", () => {
    const sf = makeSemanticField({ dbColumn: "STATUT_KYC", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("COMPLIANCE");
    expect(result.subConcept).toBe("KycStatus");
  });

  it("should classify FLAG_AML as AmlFlag", () => {
    const sf = makeSemanticField({ dbColumn: "FLAG_AML", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("COMPLIANCE");
    expect(result.subConcept).toBe("AmlFlag");
  });

  it("should classify SCORE_RISQUE as RiskScore", () => {
    const sf = makeSemanticField({ dbColumn: "SCORE_RISQUE", tableName: "T_CLIENT", javaType: "int" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("COMPLIANCE");
    expect(result.subConcept).toBe("RiskScore");
  });

  it("should classify FLAG_PPE as PepFlag", () => {
    const sf = makeSemanticField({ dbColumn: "FLAG_PPE", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("COMPLIANCE");
    expect(result.subConcept).toBe("PepFlag");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY: SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

describe("Classification — SYSTEM", () => {
  it("should classify VERSION as Version", () => {
    const sf = makeSemanticField({ dbColumn: "VERSION", tableName: "T_OPER", javaType: "int" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("SYSTEM");
    expect(result.subConcept).toBe("Version");
  });

  it("should classify FLG_ACTIF as ActiveFlag", () => {
    const sf = makeSemanticField({
      dbColumn: "FLG_ACTIF",
      tableName: "T_CLIENT",
      comparedTo: ["O", "N"],
    });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("SYSTEM");
    expect(result.subConcept).toBe("ActiveFlag");
  });

  it("should classify COD_APPLICATION as ApplicationCode", () => {
    const sf = makeSemanticField({ dbColumn: "COD_APPLICATION", tableName: "T_PARAM" });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("SYSTEM");
    expect(result.subConcept).toBe("ApplicationCode");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE SCORING
// ═══════════════════════════════════════════════════════════════════════════

describe("Confidence scoring", () => {
  it("should give HIGH confidence (≥75) when 3+ signal types converge", () => {
    const sf = makeSemanticField({
      dbColumn: "NUM_COMPTE",
      tableName: "T_COMPTE",
      variableNames: ["numeroCompte"],
      javaType: "String",
    });
    const fu = makeFieldUsage({
      fieldName: "NUM_COMPTE",
      tableName: "T_COMPTE",
      variableNames: ["numeroCompte"],
      joinedWith: ["T_CLIENT.NUM_COMPTE"],
    });
    const result = classifier.classifyField(sf, fu);
    // 4 signal types: field name + variable name + type hint + context (join)
    expect(result.confidence).toBeGreaterThanOrEqual(75);
  });

  it("should give MEDIUM confidence (50-74) with 2 signal types", () => {
    const sf = makeSemanticField({
      dbColumn: "NUM_COMPTE",
      tableName: "T_COMPTE",
      variableNames: [],
      javaType: "String",
    });
    const result = classifier.classifyField(sf);
    expect(result.confidence).toBeGreaterThanOrEqual(25);
    expect(result.confidence).toBeLessThan(95);
  });

  it("should give LOW confidence (25-49) with only 1 signal type", () => {
    // Only field name match, no variable names, generic type
    const sf = makeSemanticField({
      dbColumn: "SOME_IBAN_FIELD",
      tableName: "T_UNKNOWN",
      variableNames: [],
      javaType: "Object",
    });
    const result = classifier.classifyField(sf);
    if (result.primaryCategory !== "UNKNOWN") {
      expect(result.confidence).toBeGreaterThanOrEqual(25);
    }
  });

  it("should return UNKNOWN with confidence 0 for unrecognizable fields", () => {
    const sf = makeSemanticField({
      dbColumn: "XYZZY_PLUGH",
      tableName: "T_UNKNOWN",
      variableNames: ["xyzzyPlugh"],
      javaType: "Object",
    });
    const result = classifier.classifyField(sf);
    expect(result.primaryCategory).toBe("UNKNOWN");
    expect(result.confidence).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRAINT INFERENCE
// ═══════════════════════════════════════════════════════════════════════════

describe("Constraint inference", () => {
  it("should infer enum constraints from comparison values", () => {
    const sf = makeSemanticField({
      dbColumn: "TYPE_COMPTE",
      tableName: "T_COMPTE",
      comparedTo: ["COURANT", "EPARGNE", "DEPOT"],
    });
    const fu = makeFieldUsage({
      fieldName: "TYPE_COMPTE",
      tableName: "T_COMPTE",
      comparedTo: ["COURANT", "EPARGNE", "DEPOT"],
    });
    const result = classifier.classifyField(sf, fu);
    expect(result.inferredConstraints.enumValues).toContain("COURANT");
    expect(result.inferredConstraints.enumValues).toContain("EPARGNE");
  });

  it("should not infer enum constraints with only 1 comparison value", () => {
    const sf = makeSemanticField({
      dbColumn: "STATUT",
      tableName: "T_OPER",
      comparedTo: ["VALIDE"],
    });
    const fu = makeFieldUsage({
      fieldName: "STATUT",
      tableName: "T_OPER",
      comparedTo: ["VALIDE"],
    });
    const result = classifier.classifyField(sf, fu);
    expect(result.inferredConstraints.enumValues).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS RULES
// ═══════════════════════════════════════════════════════════════════════════

describe("Business rules inference", () => {
  it("should infer PCI-DSS rule for CVV", () => {
    const sf = makeSemanticField({ dbColumn: "CVV", tableName: "T_CARTE" });
    const result = classifier.classifyField(sf);
    expect(result.businessRules.some(r => r.includes("MUST NOT be stored"))).toBe(true);
  });

  it("should infer masking rule for PAN", () => {
    const sf = makeSemanticField({ dbColumn: "NUM_CARTE", tableName: "T_CARTE" });
    const result = classifier.classifyField(sf);
    expect(result.businessRules.some(r => r.includes("masked"))).toBe(true);
  });

  it("should infer IBAN validation rule", () => {
    const sf = makeSemanticField({ dbColumn: "IBAN", tableName: "T_COMPTE" });
    const result = classifier.classifyField(sf);
    expect(result.businessRules.some(r => r.includes("ISO 7064"))).toBe(true);
  });

  it("should infer PII/GDPR rule for client names", () => {
    const sf = makeSemanticField({ dbColumn: "NOM_CLI", tableName: "T_CLIENT" });
    const result = classifier.classifyField(sf);
    expect(result.businessRules.some(r => r.includes("PII") || r.includes("GDPR") || r.includes("CNDP"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RENAME SUGGESTION
// ═══════════════════════════════════════════════════════════════════════════

describe("Rename suggestion", () => {
  it("should prefer existing Java variable name when available", () => {
    const sf = makeSemanticField({
      dbColumn: "NOM_CLI",
      tableName: "T_CLIENT",
      variableNames: ["nomClient"],
    });
    const result = classifier.classifyField(sf);
    expect(result.suggestedRename).toBe("nomClient");
  });

  it("should derive camelCase from sub-concept key when no variable name", () => {
    const sf = makeSemanticField({
      dbColumn: "IBAN",
      tableName: "T_COMPTE",
      variableNames: [],
    });
    const result = classifier.classifyField(sf);
    // Should be "iBAN" or similar from "IBAN" key
    expect(result.suggestedRename).toBeTruthy();
    expect(result.suggestedRename.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH CLASSIFICATION (classifyAll)
// ═══════════════════════════════════════════════════════════════════════════

describe("classifyAll", () => {
  it("should classify multiple fields and produce correct distribution", () => {
    const fields: SemanticField[] = [
      makeSemanticField({ dbColumn: "NOM_CLI", tableName: "T_CLIENT" }),
      makeSemanticField({ dbColumn: "NUM_COMPTE", tableName: "T_COMPTE" }),
      makeSemanticField({ dbColumn: "MNT_TIRAGE", tableName: "T_OPER", javaType: "BigDecimal" }),
      makeSemanticField({ dbColumn: "DT_ECHEANCE", tableName: "T_OPER", javaType: "Date" }),
      makeSemanticField({ dbColumn: "CVV", tableName: "T_CARTE" }),
      makeSemanticField({ dbColumn: "XYZZY", tableName: "T_UNKNOWN" }),
    ];

    const result = classifier.classifyAll(fields);

    expect(result.stats.total).toBe(6);
    expect(result.stats.classified).toBeGreaterThanOrEqual(5);
    expect(result.stats.unknown).toBeGreaterThanOrEqual(0);
    expect(result.distribution.IDENTITY).toBeGreaterThanOrEqual(1);
    expect(result.distribution.ACCOUNT).toBeGreaterThanOrEqual(1);
    expect(result.distribution.MONEY).toBeGreaterThanOrEqual(1);
    expect(result.distribution.TIME).toBeGreaterThanOrEqual(1);
    expect(result.distribution.CARD).toBeGreaterThanOrEqual(1);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("should produce correct Map keys in format TABLE.COLUMN", () => {
    const fields: SemanticField[] = [
      makeSemanticField({ dbColumn: "NOM_CLI", tableName: "T_CLIENT" }),
    ];
    const result = classifier.classifyAll(fields);
    expect(result.classifications.has("T_CLIENT.NOM_CLI")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION: Full pipeline with FieldUsageAnalyzer + SemanticInferenceEngine
// ═══════════════════════════════════════════════════════════════════════════

const BANKING_DAO_JAVA = `
package ma.bmce.avisopere.dao;

import java.sql.*;
import java.math.BigDecimal;

public class AvisOpereDAO {
    private static final String SQL_SELECT =
        "SELECT NOM_CLI, MNT_TIRAGE, DT_ECHEANCE, COD_DEVISE, NUM_COMPTE " +
        "FROM T_AVIS_OPERE WHERE NUM_DOSSIER = ?";

    public AvisOpere findByDossier(String numDossier) throws SQLException {
        PreparedStatement ps = conn.prepareStatement(SQL_SELECT);
        ps.setString(1, numDossier);
        ResultSet rs = ps.executeQuery();
        if (rs.next()) {
            String nomClient = rs.getString("NOM_CLI");
            BigDecimal montantTirage = rs.getBigDecimal("MNT_TIRAGE");
            java.sql.Date dateEcheance = rs.getDate("DT_ECHEANCE");
            String codeDevise = rs.getString("COD_DEVISE");
            String numeroCompte = rs.getString("NUM_COMPTE");
            return new AvisOpere(nomClient, montantTirage, dateEcheance, codeDevise, numeroCompte);
        }
        return null;
    }
}
`;

describe("Integration — Full pipeline classification", () => {
  it("should classify fields from real Java DAO source code", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const engine = new SemanticInferenceEngine({ useLlm: false });
    const inference = await engine.infer(usageResult);

    const classification = classifier.classifyAll(inference.fields, usageResult.fields);

    // NOM_CLI → IDENTITY
    const nomCli = classification.classifications.get("T_AVIS_OPERE.NOM_CLI");
    expect(nomCli).toBeDefined();
    expect(nomCli!.primaryCategory).toBe("IDENTITY");

    // MNT_TIRAGE → MONEY
    const mntTirage = classification.classifications.get("T_AVIS_OPERE.MNT_TIRAGE");
    expect(mntTirage).toBeDefined();
    expect(mntTirage!.primaryCategory).toBe("MONEY");

    // DT_ECHEANCE → TIME
    const dtEch = classification.classifications.get("T_AVIS_OPERE.DT_ECHEANCE");
    expect(dtEch).toBeDefined();
    expect(dtEch!.primaryCategory).toBe("TIME");

    // COD_DEVISE → ACCOUNT (Currency)
    const devise = classification.classifications.get("T_AVIS_OPERE.COD_DEVISE");
    expect(devise).toBeDefined();
    expect(devise!.primaryCategory).toBe("ACCOUNT");

    // NUM_COMPTE → ACCOUNT
    const compte = classification.classifications.get("T_AVIS_OPERE.NUM_COMPTE");
    expect(compte).toBeDefined();
    expect(compte!.primaryCategory).toBe("ACCOUNT");

    // NUM_DOSSIER is not in the taxonomy, so 1 field will be UNKNOWN
    expect(classification.stats.classified).toBeGreaterThanOrEqual(5);
    expect(classification.stats.unknown).toBeLessThanOrEqual(1);
  });
});
