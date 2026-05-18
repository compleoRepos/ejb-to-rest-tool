/**
 * Tests unitaires — LlmFieldClassifier v13.16
 *
 * Couvre :
 *   - Cache hit/miss
 *   - Batch splitting
 *   - Fallback gracieux (LLM down)
 *   - Validation des réponses LLM
 *   - Seuil de confiance minimum
 *   - Séquentiel pour > 50 champs
 *   - Export/import cache
 *   - Stats
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM adapter
vi.mock("../ml/llm-adapter", () => ({
  isLLMAvailable: vi.fn(),
  llmGenerateJSON: vi.fn(),
}));

import { LlmFieldClassifier, type UnknownField, type LlmClassificationCache } from "./LlmFieldClassifier";
import { isLLMAvailable, llmGenerateJSON } from "../ml/llm-adapter";

const mockedIsLLMAvailable = vi.mocked(isLLMAvailable);
const mockedLlmGenerateJSON = vi.mocked(llmGenerateJSON);

describe("LlmFieldClassifier v13.16", () => {
  let classifier: LlmFieldClassifier;

  const makeField = (table: string, column: string, javaType = "String"): UnknownField => ({
    tableName: table,
    columnName: column,
    javaType,
    variableNames: [`${column.toLowerCase()}Value`],
    usageContext: [`rs.getString("${column}")`],
    comparedTo: [],
    joinedWith: [],
  });

  const makeLlmResponse = (fieldIndex: number, category: string, confidence: number, subConcept = "TestConcept") => ({
    fieldIndex,
    primaryCategory: category,
    subConcept,
    confidence,
    sensitivity: "internal",
    businessRules: ["Test rule"],
    suggestedRename: "testRename",
    reasoning: "Champ de test classifié par LLM",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    classifier = new LlmFieldClassifier({
      batchSize: 15,
      maxConcurrent: 2,
      timeoutMs: 15000,
      cacheEnabled: true,
      minConfidence: 50,
    });
  });

  // ─── Availability ─────────────────────────────────────────────────────

  it("should check LLM availability", async () => {
    mockedIsLLMAvailable.mockResolvedValue(true);
    expect(await classifier.isAvailable()).toBe(true);

    mockedIsLLMAvailable.mockResolvedValue(false);
    expect(await classifier.isAvailable()).toBe(false);
  });

  it("should return false if isLLMAvailable throws", async () => {
    mockedIsLLMAvailable.mockRejectedValue(new Error("Connection refused"));
    expect(await classifier.isAvailable()).toBe(false);
  });

  // ─── Empty input ──────────────────────────────────────────────────────

  it("should return empty map for empty input", async () => {
    const results = await classifier.classifyBatch([]);
    expect(results.size).toBe(0);
    expect(mockedLlmGenerateJSON).not.toHaveBeenCalled();
  });

  // ─── Basic classification ─────────────────────────────────────────────

  it("should classify fields via LLM and return valid results", async () => {
    const fields = [
      makeField("T_TIERS", "NOM_TIERS"),
      makeField("T_TIERS", "PRENOM_TIERS"),
    ];

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "IDENTITY", 85, "ThirdParty Name"),
      makeLlmResponse(2, "IDENTITY", 80, "ThirdParty FirstName"),
    ]);

    const results = await classifier.classifyBatch(fields);
    expect(results.size).toBe(2);

    const nom = results.get("T_TIERS.NOM_TIERS");
    expect(nom).toBeDefined();
    expect(nom!.primaryCategory).toBe("IDENTITY");
    expect(nom!.confidence).toBe(85);
    expect(nom!.source).toBe("llm");
    expect(nom!.reasoning).toBe("Champ de test classifié par LLM");

    const prenom = results.get("T_TIERS.PRENOM_TIERS");
    expect(prenom).toBeDefined();
    expect(prenom!.primaryCategory).toBe("IDENTITY");
  });

  // ─── Minimum confidence threshold ────────────────────────────────────

  it("should reject classifications below minConfidence threshold", async () => {
    const fields = [makeField("T_OP", "CHAMP_OBSCUR")];

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "SYSTEM", 30), // Below 50 threshold
    ]);

    const results = await classifier.classifyBatch(fields);
    expect(results.size).toBe(0); // Rejected due to low confidence
  });

  it("should accept classifications at exactly minConfidence", async () => {
    const fields = [makeField("T_OP", "CHAMP_LIMITE")];

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "SYSTEM", 50), // Exactly at threshold
    ]);

    const results = await classifier.classifyBatch(fields);
    expect(results.size).toBe(1);
  });

  // ─── Category validation ──────────────────────────────────────────────

  it("should normalize invalid categories to UNKNOWN and reject them", async () => {
    const fields = [makeField("T_OP", "CHAMP_BIZARRE")];

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "INVALID_CATEGORY", 90),
    ]);

    const results = await classifier.classifyBatch(fields);
    expect(results.size).toBe(0); // UNKNOWN from LLM is rejected (no point storing)
  });

  it("should reject UNKNOWN classifications from LLM (no value added)", async () => {
    const fields = [makeField("T_OP", "CHAMP_INCONNU")];

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "UNKNOWN", 90),
    ]);

    const results = await classifier.classifyBatch(fields);
    expect(results.size).toBe(0);
  });

  // ─── Sensitivity validation ───────────────────────────────────────────

  it("should normalize invalid sensitivity to 'internal'", async () => {
    const fields = [makeField("T_TIERS", "EMAIL")];

    mockedLlmGenerateJSON.mockResolvedValue([{
      fieldIndex: 1,
      primaryCategory: "CONTACT",
      subConcept: "Email",
      confidence: 90,
      sensitivity: "super-secret", // Invalid
      businessRules: [],
      suggestedRename: "email",
      reasoning: "Adresse email du tiers",
    }]);

    const results = await classifier.classifyBatch(fields);
    expect(results.get("T_TIERS.EMAIL")!.sensitivity).toBe("internal");
  });

  // ─── Cache behavior ───────────────────────────────────────────────────

  it("should cache results and return them on second call", async () => {
    const fields = [makeField("T_TIERS", "NOM_TIERS")];

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "IDENTITY", 85, "ThirdParty Name"),
    ]);

    // First call — cache miss
    const results1 = await classifier.classifyBatch(fields);
    expect(results1.size).toBe(1);
    expect(mockedLlmGenerateJSON).toHaveBeenCalledTimes(1);

    // Second call — cache hit
    const results2 = await classifier.classifyBatch(fields);
    expect(results2.size).toBe(1);
    expect(mockedLlmGenerateJSON).toHaveBeenCalledTimes(1); // Not called again

    const stats = classifier.getStats();
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
  });

  it("should invalidate cache when field data changes", async () => {
    const field1 = makeField("T_TIERS", "NOM_TIERS");

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "IDENTITY", 85),
    ]);

    await classifier.classifyBatch([field1]);
    expect(mockedLlmGenerateJSON).toHaveBeenCalledTimes(1);

    // Same key but different data (new variable name)
    const field2: UnknownField = {
      ...field1,
      variableNames: ["nomDuTiers", "thirdPartyName"],
    };

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "IDENTITY", 90),
    ]);

    await classifier.classifyBatch([field2]);
    expect(mockedLlmGenerateJSON).toHaveBeenCalledTimes(2); // Cache miss (hash changed)
  });

  it("should export and import cache correctly", async () => {
    const fields = [makeField("T_TIERS", "NOM_TIERS")];

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "IDENTITY", 85),
    ]);

    await classifier.classifyBatch(fields);

    // Export cache
    const cache = classifier.exportCache();
    expect(cache.version).toBe("1");
    expect(Object.keys(cache.entries)).toHaveLength(1);
    expect(cache.entries["T_TIERS.NOM_TIERS"]).toBeDefined();

    // Create new classifier and load cache
    const classifier2 = new LlmFieldClassifier({ cacheEnabled: true, minConfidence: 50 });
    classifier2.loadCache(cache);

    const results = await classifier2.classifyBatch(fields);
    expect(results.size).toBe(1);
    expect(mockedLlmGenerateJSON).toHaveBeenCalledTimes(1); // Not called again
  });

  it("should work with cache disabled", async () => {
    const noCacheClassifier = new LlmFieldClassifier({ cacheEnabled: false, minConfidence: 50 });
    const fields = [makeField("T_TIERS", "NOM_TIERS")];

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "IDENTITY", 85),
    ]);

    await noCacheClassifier.classifyBatch(fields);
    await noCacheClassifier.classifyBatch(fields);

    // Called twice because cache is disabled
    expect(mockedLlmGenerateJSON).toHaveBeenCalledTimes(2);
  });

  // ─── Batch splitting ──────────────────────────────────────────────────

  it("should split large inputs into batches of batchSize", async () => {
    const smallBatchClassifier = new LlmFieldClassifier({
      batchSize: 3,
      maxConcurrent: 2,
      minConfidence: 50,
    });

    const fields = Array.from({ length: 7 }, (_, i) =>
      makeField("T_OP", `CHAMP_${i}`)
    );

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "SYSTEM", 70),
      makeLlmResponse(2, "SYSTEM", 70),
      makeLlmResponse(3, "SYSTEM", 70),
    ]);

    await smallBatchClassifier.classifyBatch(fields);

    // 7 fields / 3 per batch = 3 batches
    expect(mockedLlmGenerateJSON).toHaveBeenCalledTimes(3);
  });

  // ─── Fallback gracieux ────────────────────────────────────────────────

  it("should not crash when LLM returns null", async () => {
    const fields = [makeField("T_OP", "CHAMP_TEST")];

    mockedLlmGenerateJSON.mockResolvedValue(null);

    const results = await classifier.classifyBatch(fields);
    expect(results.size).toBe(0); // Graceful fallback
  });

  it("should not crash when LLM throws an error", async () => {
    const fields = [makeField("T_OP", "CHAMP_TEST")];

    mockedLlmGenerateJSON.mockRejectedValue(new Error("LLM timeout"));

    const results = await classifier.classifyBatch(fields);
    expect(results.size).toBe(0); // Graceful fallback, no crash
  });

  it("should not crash when LLM returns non-array", async () => {
    const fields = [makeField("T_OP", "CHAMP_TEST")];

    mockedLlmGenerateJSON.mockResolvedValue("invalid response" as any);

    const results = await classifier.classifyBatch(fields);
    expect(results.size).toBe(0);
  });

  it("should skip items with invalid fieldIndex", async () => {
    const fields = [makeField("T_OP", "CHAMP_A")];

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(99, "SYSTEM", 90), // Invalid index
    ]);

    const results = await classifier.classifyBatch(fields);
    expect(results.size).toBe(0);
  });

  // ─── Sequential mode for large sets ───────────────────────────────────

  it("should process sequentially when > 50 fields (anti-OOM)", async () => {
    const seqClassifier = new LlmFieldClassifier({
      batchSize: 15,
      maxConcurrent: 2,
      minConfidence: 50,
    });

    // 51 fields → sequential mode
    const fields = Array.from({ length: 51 }, (_, i) =>
      makeField("T_OP", `CHAMP_${i}`)
    );

    mockedLlmGenerateJSON.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => makeLlmResponse(i + 1, "SYSTEM", 70))
    );

    await seqClassifier.classifyBatch(fields);

    // 51 / 15 = 4 batches, processed sequentially
    expect(mockedLlmGenerateJSON).toHaveBeenCalledTimes(4);
  });

  // ─── Stats ────────────────────────────────────────────────────────────

  it("should track execution stats correctly", async () => {
    const fields = [
      makeField("T_TIERS", "NOM_TIERS"),
      makeField("T_TIERS", "PRENOM_TIERS"),
    ];

    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "IDENTITY", 85),
      makeLlmResponse(2, "IDENTITY", 80),
    ]);

    await classifier.classifyBatch(fields);

    const stats = classifier.getStats();
    expect(stats.totalLlmCalls).toBe(1);
    expect(stats.cacheMisses).toBe(2);
    expect(stats.cacheHits).toBe(0);
    expect(stats.avgBatchTimeMs).toBeGreaterThanOrEqual(0);
  });

  // ─── Partial LLM response ────────────────────────────────────────────

  it("should handle partial LLM response (some fields classified, some missing)", async () => {
    const fields = [
      makeField("T_TIERS", "NOM_TIERS"),
      makeField("T_TIERS", "CHAMP_INCONNU"),
      makeField("T_TIERS", "EMAIL"),
    ];

    // LLM only returns 2 out of 3
    mockedLlmGenerateJSON.mockResolvedValue([
      makeLlmResponse(1, "IDENTITY", 85, "ThirdParty Name"),
      makeLlmResponse(3, "CONTACT", 90, "Email Address"),
    ]);

    const results = await classifier.classifyBatch(fields);
    expect(results.size).toBe(2);
    expect(results.has("T_TIERS.NOM_TIERS")).toBe(true);
    expect(results.has("T_TIERS.EMAIL")).toBe(true);
    expect(results.has("T_TIERS.CHAMP_INCONNU")).toBe(false);
  });

  // ─── Confidence clamping ──────────────────────────────────────────────

  it("should clamp confidence to 0-100 range", async () => {
    const fields = [
      makeField("T_OP", "CHAMP_A"),
      makeField("T_OP", "CHAMP_B"),
    ];

    mockedLlmGenerateJSON.mockResolvedValue([
      { ...makeLlmResponse(1, "SYSTEM", 150), confidence: 150 }, // Over 100
      { ...makeLlmResponse(2, "SYSTEM", -20), confidence: -20 }, // Under 0
    ]);

    const results = await classifier.classifyBatch(fields);
    // CHAMP_A: clamped to 100, above threshold → accepted
    expect(results.get("T_OP.CHAMP_A")?.confidence).toBe(100);
    // CHAMP_B: clamped to 0, below threshold → rejected
    expect(results.has("T_OP.CHAMP_B")).toBe(false);
  });
});
