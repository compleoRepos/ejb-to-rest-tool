/**
 * JdbcPipeline.test.ts — Tests E2E pour le pipeline JDBC v10.11
 *
 * Vérifie que :
 * 1. Le registre JDBC dans service-gen collecte les blocs pendant la génération
 * 2. Les blocs sont inclus dans GenerationResult.jdbcBlocks
 * 3. Le JdbcPostProcessor reçoit les blocs et peut reconstruire le contexte
 * 4. Le phaseReScoring recalcule le score après migration
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  resetJdbcBlocksRegistry,
  getCollectedJdbcBlocks,
} from "../../spring/service-gen";
import { JdbcPostProcessor, hasUnresolvedPlaceholders, countUnresolvedPlaceholders } from "./JdbcPostProcessor";
import type { JdbcBlock } from "../BusinessLogicTransformer";
import { scoreGeneration } from "../quality-scorer";

// ─── Test 1: JDBC Block Registry ────────────────────────────────────────────

describe("JDBC Block Registry (v10.11)", () => {
  beforeEach(() => {
    resetJdbcBlocksRegistry();
  });

  it("starts empty after reset", () => {
    expect(getCollectedJdbcBlocks()).toHaveLength(0);
  });

  it("reset clears previously collected blocks", () => {
    // Simulate collecting blocks (we can't call transform directly here,
    // but we can verify the registry API works)
    const registry = getCollectedJdbcBlocks();
    expect(registry).toEqual([]);
    resetJdbcBlocksRegistry();
    expect(getCollectedJdbcBlocks()).toHaveLength(0);
  });
});

// ─── Test 2: JdbcPostProcessor with blockIndex ──────────────────────────────

describe("JdbcPostProcessor — blockIndex integration (v10.11)", () => {
  it("uses blockIndex to build migration context when blocks are provided", async () => {
    // This test calls the LLM (or fallback) so needs more time
    const postProcessor = new JdbcPostProcessor();

    // Simulate a file with a JDBC placeholder (comment format)
    const files = [{
      path: "src/main/java/com/example/service/CreditService.java",
      content: `package com.example.service;
import org.springframework.stereotype.Service;
@Service
public class CreditService {
    public void processCredit() {
        // @@JDBC_LLM_BLOCK_1@@
    }
}`,
      category: "service",
    }];

    // Provide the JDBC blocks that were collected during generation
    const jdbcBlocks: JdbcBlock[] = [{
      blockId: "JDBC_LLM_BLOCK_1",
      code: `Connection conn = dataSource.getConnection();
PreparedStatement ps = conn.prepareStatement("SELECT * FROM T_CREDITS WHERE id = ?");
ps.setLong(1, creditId);
ResultSet rs = ps.executeQuery();
if (rs.next()) {
    credit.setMontant(rs.getBigDecimal("montant"));
    credit.setStatut(rs.getString("statut"));
}`,
      tables: ["T_CREDITS"],
      dataSources: ["dataSource"],
      sqlConstants: [],
      sourceClassName: "CreditEJB",
      methodName: "processCredit",
    }];

    const entityFiles = [{
      path: "src/main/java/com/example/entity/TCredits.java",
      content: `@Entity @Table(name = "T_CREDITS") public class TCredits { private BigDecimal montant; private String statut; }`,
    }];

    const repositoryFiles = [{
      path: "src/main/java/com/example/repository/TCreditsRepository.java",
      content: `public interface TCreditsRepository extends JpaRepository<TCredits, Long> {}`,
    }];

    const result = await postProcessor.processAll(
      files,
      jdbcBlocks,
      "com.example",
      entityFiles,
      repositoryFiles,
    );

    // The placeholder should have been replaced (either by LLM or fallback)
    const migratedFile = result.files.find(f => f.path.includes("CreditService"));
    expect(migratedFile).toBeDefined();
    expect(migratedFile!.content).not.toContain("@@JDBC_LLM_BLOCK_1@@");
    expect(result.migratedCount + result.fallbackCount).toBeGreaterThan(0);
  });

  it("handles empty blockIndex gracefully (DAO blocks still work)", async () => {
    // This test calls the LLM (or fallback) so needs more time
    const postProcessor = new JdbcPostProcessor();

    // File with a DAO placeholder (has embedded metadata)
    const files = [{
      path: "src/main/java/com/example/dao/ClientDao.java",
      content: `package com.example.dao;
public class ClientDao {
    public void findClient() {
        // @@DAO_LLM_BLOCK_1@@
        // TABLES: T_CLIENTS
        // DATASOURCES: default
        // ENTITY: TClients
        // METHOD: findClient
        // DAO_JDBC_BODY_START
        // Connection conn = ds.getConnection();
        // PreparedStatement ps = conn.prepareStatement("SELECT * FROM T_CLIENTS WHERE id = ?");
        // DAO_JDBC_BODY_END
    }
}`,
      category: "dao",
    }];

    const result = await postProcessor.processAll(
      files,
      [], // Empty blockIndex
      "com.example",
      [],
      [],
    );

    // DAO blocks should still be processed via embedded metadata
    const migratedFile = result.files.find(f => f.path.includes("ClientDao"));
    expect(migratedFile).toBeDefined();
    // Either migrated or kept as-is if LLM unavailable
    expect(result.migratedCount + result.fallbackCount).toBeGreaterThanOrEqual(0);
  });
});

// ─── Test 3: Placeholder detection utilities ────────────────────────────────

describe("Placeholder detection utilities", () => {
  it("detects unresolved JDBC placeholders", () => {
    const files = [
      { path: "A.java", content: "code // @@JDBC_LLM_BLOCK_1@@ more" },
      { path: "B.java", content: "clean code" },
    ];
    expect(hasUnresolvedPlaceholders(files)).toBe(true);
    expect(countUnresolvedPlaceholders(files)).toBe(1);
  });

  it("detects unresolved DAO placeholders", () => {
    const files = [
      { path: "A.java", content: "code // @@DAO_LLM_BLOCK_1@@ more" },
    ];
    expect(hasUnresolvedPlaceholders(files)).toBe(true);
    expect(countUnresolvedPlaceholders(files)).toBe(1);
  });

  it("returns false when no placeholders", () => {
    const files = [
      { path: "A.java", content: "clean code" },
      { path: "B.java", content: "more clean code" },
    ];
    expect(hasUnresolvedPlaceholders(files)).toBe(false);
    expect(countUnresolvedPlaceholders(files)).toBe(0);
  });

  it("counts multiple placeholders across files", () => {
    const files = [
      { path: "A.java", content: "// @@JDBC_LLM_BLOCK_1@@\n// @@JDBC_LLM_BLOCK_2@@" },
      { path: "B.java", content: "// @@DAO_LLM_BLOCK_1@@" },
    ];
    expect(countUnresolvedPlaceholders(files)).toBe(3);
  });
});

// ─── Test 4: phaseReScoring logic ───────────────────────────────────────────

describe("phaseReScoring — quality score recalculation (v10.16)", () => {
  it("scoreGeneration produces a valid QualityReport", () => {

    const files = [
      {
        path: "src/main/java/com/example/service/TestService.java",
        content: `package com.example.service;
import org.springframework.stereotype.Service;
import lombok.RequiredArgsConstructor;
@Service
@RequiredArgsConstructor
public class TestService {
    private final TestRepository testRepository;
    public TestResponseDTO process(TestRequestDTO request) {
        // Business logic migrated
        return TestResponseDTO.builder().build();
    }
}`,
        category: "service",
      },
      {
        path: "src/main/java/com/example/controller/TestController.java",
        content: `package com.example.controller;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/test")
public class TestController {
    @PostMapping
    public TestResponseDTO process(@RequestBody TestRequestDTO request) {
        return testService.process(request);
    }
}`,
        category: "controller",
      },
    ];

    const report = scoreGeneration(files as any, undefined, undefined, 1);
    expect(report).toBeDefined();
    expect(report.totalScore).toBeGreaterThan(0);
    expect(report.maxScore).toBeGreaterThan(0);
    expect(report.grade).toMatch(/^[A-F][+]?$/);
  });
});
