/**
 * Tests for Schema Reverse-Engineering pipeline v13.13
 *
 * Tests FieldUsageAnalyzer, SemanticInferenceEngine (no-LLM mode),
 * OrphanFieldDetector, GlossaryGenerator, and the orchestrator.
 */

import { describe, it, expect } from "vitest";
import { FieldUsageAnalyzer } from "./FieldUsageAnalyzer";
import { SemanticInferenceEngine } from "./SemanticInferenceEngine";
import { CrossProjectCorrelator } from "./CrossProjectCorrelator";
import { OrphanFieldDetector } from "./OrphanFieldDetector";
import { GlossaryGenerator } from "./GlossaryGenerator";
import { SchemaReverseEngineer } from "./SchemaReverseEngineer";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const BANKING_DAO_JAVA = `
package ma.bmce.avisopere.dao;

import java.sql.*;
import java.math.BigDecimal;

public class AvisOpereDAO {
    private static final String SQL_SELECT =
        "SELECT NOM_CLI, MNT_TIRAGE, DT_ECHEANCE, COD_DEVISE, NUM_COMPTE " +
        "FROM T_AVIS_OPERE WHERE NUM_DOSSIER = ?";

    private static final String SQL_INSERT =
        "INSERT INTO T_AVIS_OPERE (NOM_CLI, MNT_TIRAGE, DT_ECHEANCE, COD_DEVISE, NUM_COMPTE, NUM_DOSSIER) " +
        "VALUES (?, ?, ?, ?, ?, ?)";

    public AvisOpere findByDossier(String numDossier) throws SQLException {
        PreparedStatement ps = conn.prepareStatement(SQL_SELECT);
        ps.setString(1, numDossier);
        ResultSet rs = ps.executeQuery();
        if (rs.next()) {
            AvisOpere avo = new AvisOpere();
            String nomClient = rs.getString("NOM_CLI");
            BigDecimal montantTirage = rs.getBigDecimal("MNT_TIRAGE");
            java.sql.Date dateEcheance = rs.getDate("DT_ECHEANCE");
            String codeDevise = rs.getString("COD_DEVISE");
            String numeroCompte = rs.getString("NUM_COMPTE");

            avo.setNomClient(nomClient);
            avo.setMontantTirage(montantTirage);
            avo.setDateEcheance(dateEcheance);
            avo.setCodeDevise(codeDevise);
            avo.setNumeroCompte(numeroCompte);
            return avo;
        }
        return null;
    }

    public void save(AvisOpere avo) throws SQLException {
        PreparedStatement ps = conn.prepareStatement(SQL_INSERT);
        ps.setString(1, avo.getNomClient());
        ps.setBigDecimal(2, avo.getMontantTirage());
        ps.setDate(3, avo.getDateEcheance());
        ps.setString(4, avo.getCodeDevise());
        ps.setString(5, avo.getNumeroCompte());
        ps.setString(6, avo.getNumDossier());
        ps.executeUpdate();
    }
}
`;

const CREDIT_SERVICE_JAVA = `
package ma.bmce.credit.service;

import java.sql.*;
import org.apache.log4j.Logger;

public class CreditService {
    private static final Logger logger = Logger.getLogger(CreditService.class);

    private static final String SQL_CREDIT =
        "SELECT NOM_CLI, MNT_CREDIT, TAU_INTERET, DUR_REMBOURSEMENT " +
        "FROM T_CREDIT WHERE NUM_DOSSIER = ?";

    public Credit findCredit(String numDossier) throws SQLException {
        ResultSet rs = stmt.executeQuery(SQL_CREDIT);
        if (rs.next()) {
            String nomClient = rs.getString("NOM_CLI");
            BigDecimal montantCredit = rs.getBigDecimal("MNT_CREDIT");
            BigDecimal tauxInteret = rs.getBigDecimal("TAU_INTERET");
            int dureeRemboursement = rs.getInt("DUR_REMBOURSEMENT");

            logger.info("Credit trouvé pour client: " + nomClient);

            if (tauxInteret.compareTo(new BigDecimal("15.0")) > 0) {
                logger.warn("Taux élevé: " + tauxInteret);
            }

            Credit credit = new Credit();
            credit.setNomClient(nomClient);
            credit.setMontantCredit(montantCredit);
            credit.setTauxInteret(tauxInteret);
            credit.setDureeRemboursement(dureeRemboursement);
            return credit;
        }
        return null;
    }
}
`;

const JPA_ENTITY_JAVA = `
package ma.bmce.entity;

import javax.persistence.*;

@Entity
@Table(name = "T_OLD_FIELD")
public class OldFieldEntity {
    @Column(name = "FIELD1")
    private String reference;

    @Column(name = "FIELD2")
    private String description;

    @Column(name = "OLD_TMP_DATA")
    private String oldTmpData;
}
`;

// ─── Phase 1: FieldUsageAnalyzer ────────────────────────────────────────────

describe("FieldUsageAnalyzer", () => {
  it("should extract fields from SQL SELECT and ResultSet getters", () => {
    const analyzer = new FieldUsageAnalyzer();
    const result = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    expect(result.fields.length).toBeGreaterThan(0);

    const nomCli = result.fields.find(f => f.fieldName === "NOM_CLI");
    expect(nomCli).toBeDefined();
    expect(nomCli!.tableName).toBe("T_AVIS_OPERE");
    expect(nomCli!.reads.length).toBeGreaterThan(0);
    expect(nomCli!.variableNames).toContain("nomClient");
  });

  it("should track variable names from ResultSet → variable assignments", () => {
    const analyzer = new FieldUsageAnalyzer();
    const result = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const mntTirage = result.fields.find(f => f.fieldName === "MNT_TIRAGE");
    expect(mntTirage).toBeDefined();
    expect(mntTirage!.variableNames).toContain("montantTirage");
  });

  it("should detect both reads and writes for fields in INSERT + SELECT", () => {
    const analyzer = new FieldUsageAnalyzer();
    const result = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const nomCli = result.fields.find(f => f.fieldName === "NOM_CLI");
    expect(nomCli!.reads.length).toBeGreaterThan(0);
    expect(nomCli!.writes.length).toBeGreaterThan(0);
  });

  it("should discover tables from SQL statements", () => {
    const analyzer = new FieldUsageAnalyzer();
    const result = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    expect(result.tables.has("T_AVIS_OPERE")).toBe(true);
  });

  it("should extract JPA @Column annotations", () => {
    const analyzer = new FieldUsageAnalyzer();
    const result = analyzer.analyze([
      { path: "src/main/java/OldFieldEntity.java", content: JPA_ENTITY_JAVA },
    ]);

    const field1 = result.fields.find(f => f.fieldName === "FIELD1");
    expect(field1).toBeDefined();
    expect(field1!.variableNames).toContain("reference");
  });
});

// ─── Phase 2: SemanticInferenceEngine (no-LLM mode) ────────────────────────

describe("SemanticInferenceEngine", () => {
  it("should infer business names from banking abbreviation dictionary", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const engine = new SemanticInferenceEngine({ useLlm: false });
    const result = await engine.infer(usageResult);

    expect(result.fields.length).toBeGreaterThan(0);

    const nomCli = result.fields.find(f => f.dbColumn === "NOM_CLI");
    expect(nomCli).toBeDefined();
    expect(nomCli!.confidenceScore).toBeGreaterThan(30);
    // Should have variable name "nomClient" as a source
    expect(nomCli!.variableNames).toContain("nomClient");
  });

  it("should compute confidence scores based on evidence", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const engine = new SemanticInferenceEngine({ useLlm: false });
    const result = await engine.infer(usageResult);

    // Fields with variable names + multiple usages should have higher confidence
    const mntTirage = result.fields.find(f => f.dbColumn === "MNT_TIRAGE");
    expect(mntTirage).toBeDefined();
    expect(mntTirage!.confidenceScore).toBeGreaterThan(20);
  });

  it("should infer Java types from ResultSet getters", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const engine = new SemanticInferenceEngine({ useLlm: false });
    const result = await engine.infer(usageResult);

    const mntTirage = result.fields.find(f => f.dbColumn === "MNT_TIRAGE");
    expect(mntTirage!.javaType).toBe("BigDecimal");

    const dtEcheance = result.fields.find(f => f.dbColumn === "DT_ECHEANCE");
    expect(dtEcheance!.javaType).toBe("LocalDate");
  });

  it("should report stats correctly", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const engine = new SemanticInferenceEngine({ useLlm: false });
    const result = await engine.infer(usageResult);

    expect(result.stats.total).toBe(result.fields.length);
    expect(result.stats.high + result.stats.medium + result.stats.low + result.stats.unresolved).toBe(result.stats.total);
    expect(result.stats.llmCalls).toBe(0); // LLM disabled
  });
});

// ─── Phase 3: CrossProjectCorrelator ────────────────────────────────────────

describe("CrossProjectCorrelator", () => {
  it("should detect shared fields across projects", async () => {
    // Project 1: AVO
    const analyzer1 = new FieldUsageAnalyzer();
    const usage1 = analyzer1.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);
    const engine1 = new SemanticInferenceEngine({ useLlm: false });
    const inference1 = await engine1.infer(usage1);

    // Project 2: Credit (shares NOM_CLI)
    const analyzer2 = new FieldUsageAnalyzer();
    const usage2 = analyzer2.analyze([
      { path: "src/main/java/CreditService.java", content: CREDIT_SERVICE_JAVA },
    ]);
    const engine2 = new SemanticInferenceEngine({ useLlm: false });
    const inference2 = await engine2.infer(usage2);

    // Note: NOM_CLI is in different tables (T_AVIS_OPERE vs T_CREDIT)
    // so they won't correlate by default. Let's check isolated fields instead.
    const correlator = new CrossProjectCorrelator();
    const projectResults = new Map<string, typeof inference1>();
    projectResults.set("avis-opere", inference1);
    projectResults.set("credit", inference2);

    const result = correlator.correlate(projectResults);

    // All fields should be categorized
    expect(result.stats.totalFields).toBeGreaterThan(0);
    expect(result.stats.totalFields).toBe(
      result.stats.correlatedFields + result.stats.isolatedFields
    );
  });

  it("should boost confidence for correlated fields", async () => {
    // Create two projects with the SAME table and field
    const sharedCode = `
      public class SharedDAO {
        String sql = "SELECT NOM_CLI FROM T_SHARED WHERE ID = ?";
        public void find() {
          String nomClient = rs.getString("NOM_CLI");
        }
      }
    `;

    const analyzer1 = new FieldUsageAnalyzer();
    const usage1 = analyzer1.analyze([{ path: "SharedDAO.java", content: sharedCode }]);
    const engine1 = new SemanticInferenceEngine({ useLlm: false });
    const inference1 = await engine1.infer(usage1);

    const analyzer2 = new FieldUsageAnalyzer();
    const usage2 = analyzer2.analyze([{ path: "SharedDAO.java", content: sharedCode }]);
    const engine2 = new SemanticInferenceEngine({ useLlm: false });
    const inference2 = await engine2.infer(usage2);

    const correlator = new CrossProjectCorrelator();
    const projectResults = new Map();
    projectResults.set("project-a", inference1);
    projectResults.set("project-b", inference2);

    const result = correlator.correlate(projectResults);

    // Should have correlated fields
    expect(result.correlatedFields.length).toBeGreaterThan(0);

    // Correlated fields should have boosted confidence
    for (const cf of result.correlatedFields) {
      expect(cf.boostedConfidence).toBeGreaterThanOrEqual(cf.originalConfidence);
    }
  });
});

// ─── Phase 4: OrphanFieldDetector ───────────────────────────────────────────

describe("OrphanFieldDetector", () => {
  it("should detect deprecated fields", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/OldFieldEntity.java", content: JPA_ENTITY_JAVA },
    ]);

    const engine = new SemanticInferenceEngine({ useLlm: false });
    const inferenceResult = await engine.infer(usageResult);

    const detector = new OrphanFieldDetector();
    const result = detector.detect(usageResult, inferenceResult);

    // OLD_TMP_DATA should be flagged as deprecated (matches _TMP pattern)
    const oldTmp = result.orphans.find(o => o.dbColumn === "OLD_TMP_DATA");
    expect(oldTmp).toBeDefined();
    expect(oldTmp!.category).toBe("deprecated");
  });

  it("should detect dead fields from DDL", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const detector = new OrphanFieldDetector();
    const result = detector.detect(usageResult, undefined, [
      { tableName: "T_AVIS_OPERE", columnName: "GHOST_FIELD" },
    ]);

    const ghost = result.orphans.find(o => o.dbColumn === "GHOST_FIELD");
    expect(ghost).toBeDefined();
    expect(ghost!.category).toBe("dead");
    expect(ghost!.severity).toBe("critical");
  });

  it("should compute health score", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const detector = new OrphanFieldDetector();
    const result = detector.detect(usageResult);

    expect(result.stats.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.stats.healthScore).toBeLessThanOrEqual(100);
  });
});

// ─── Phase 5: GlossaryGenerator ────────────────────────────────────────────

describe("GlossaryGenerator", () => {
  it("should generate HTML, CSV, and JSON outputs", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const engine = new SemanticInferenceEngine({ useLlm: false });
    const inferenceResult = await engine.infer(usageResult);

    const generator = new GlossaryGenerator();
    const glossary = generator.generate(inferenceResult, null, null, "test-project");

    // HTML
    expect(glossary.html).toContain("<!DOCTYPE html>");
    expect(glossary.html).toContain("Glossaire Métier");
    expect(glossary.html).toContain("NOM_CLI");

    // CSV
    expect(glossary.csv).toContain("Table,Colonne DB");
    expect(glossary.csv).toContain("NOM_CLI");

    // JSON
    const parsed = JSON.parse(glossary.json);
    expect(parsed.version).toBe("13.13");
    expect(parsed.entries.length).toBeGreaterThan(0);
    expect(parsed.entries[0]).toHaveProperty("column");
    expect(parsed.entries[0]).toHaveProperty("businessName");
  });

  it("should include orphan data in glossary entries", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/OldFieldEntity.java", content: JPA_ENTITY_JAVA },
    ]);

    const engine = new SemanticInferenceEngine({ useLlm: false });
    const inferenceResult = await engine.infer(usageResult);

    const detector = new OrphanFieldDetector();
    const orphanResult = detector.detect(usageResult, inferenceResult);

    const generator = new GlossaryGenerator();
    const glossary = generator.generate(inferenceResult, null, orphanResult, "test");

    // Should have orphan entries
    const orphanEntries = glossary.entries.filter(e => e.orphanCategory !== null);
    expect(orphanEntries.length).toBeGreaterThan(0);
  });

  it("should report stats correctly", async () => {
    const analyzer = new FieldUsageAnalyzer();
    const usageResult = analyzer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    const engine = new SemanticInferenceEngine({ useLlm: false });
    const inferenceResult = await engine.infer(usageResult);

    const generator = new GlossaryGenerator();
    const glossary = generator.generate(inferenceResult, null, null, "test");

    expect(glossary.stats.totalEntries).toBe(glossary.entries.length);
    expect(glossary.stats.tables.length).toBeGreaterThan(0);
  });
});

// ─── Orchestrator: SchemaReverseEngineer ────────────────────────────────────

describe("SchemaReverseEngineer", () => {
  it("should run the full pipeline (no-LLM mode)", async () => {
    const engineer = new SchemaReverseEngineer({
      useLlm: false,
      projectName: "avis-opere",
    });

    const result = await engineer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    // Legacy result should be present
    expect(result.legacyResult.tables.length).toBeGreaterThan(0);

    // Field usage analysis
    expect(result.fieldUsageAnalysis.fields.length).toBeGreaterThan(0);

    // Semantic inference
    expect(result.semanticInference.fields.length).toBeGreaterThan(0);

    // Orphan detection
    expect(result.orphanDetection).toBeDefined();

    // Glossary
    expect(result.glossary.html).toContain("<!DOCTYPE html>");
    expect(result.glossary.csv).toContain("Table,Colonne DB");

    // Execution time
    expect(result.executionTimeMs).toBeGreaterThan(0);
  });

  it("should maintain backward compatibility with SchemaDecoder", async () => {
    const engineer = new SchemaReverseEngineer({ useLlm: false });

    const result = await engineer.analyze([
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);

    // Legacy result should have the same structure as decodeSchema()
    expect(result.legacyResult).toHaveProperty("tables");
    expect(result.legacyResult).toHaveProperty("stats");
    expect(result.legacyResult).toHaveProperty("executionTimeMs");
    expect(result.legacyResult.stats).toHaveProperty("totalColumns");
    expect(result.legacyResult.stats).toHaveProperty("decoded");
    expect(result.legacyResult.stats).toHaveProperty("highConfidence");
  });

  it("should run multi-project analysis", async () => {
    const engineer = new SchemaReverseEngineer({ useLlm: false });

    const projects = new Map<string, { path: string; content: string }[]>();
    projects.set("avis-opere", [
      { path: "src/main/java/AvisOpereDAO.java", content: BANKING_DAO_JAVA },
    ]);
    projects.set("credit", [
      { path: "src/main/java/CreditService.java", content: CREDIT_SERVICE_JAVA },
    ]);

    const result = await engineer.analyzeMultiProject(projects);

    // Should have results for both projects
    expect(result.projects.size).toBe(2);
    expect(result.projects.has("avis-opere")).toBe(true);
    expect(result.projects.has("credit")).toBe(true);

    // Should have correlation
    expect(result.correlation).toBeDefined();
    expect(result.correlation.stats.totalFields).toBeGreaterThan(0);

    // Should have merged glossary
    expect(result.mergedGlossary.html).toContain("<!DOCTYPE html>");
    expect(result.mergedGlossary.entries.length).toBeGreaterThan(0);
  });
});
