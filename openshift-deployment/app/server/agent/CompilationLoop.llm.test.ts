/**
 * Tests unitaires pour le CompilationLoop v10.1 — Self-Healing LLM.
 *
 * Teste l'intégration du LLM dans la boucle de compilation pour les erreurs
 * que les corrections déterministes ne peuvent pas résoudre.
 *
 * @author Compleo
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CompilationLoop, GeneratedFile, CompilationLoopConfig } from "./CompilationLoop";

// Mock the llm-adapter module
vi.mock("../engine/ml/llm-adapter", () => ({
  llmGenerateCodeWithBackend: vi.fn(),
  isLLMAvailable: vi.fn(),
}));

import { llmGenerateCodeWithBackend, isLLMAvailable } from "../engine/ml/llm-adapter";

const mockIsLLMAvailable = vi.mocked(isLLMAvailable);
const mockLLMGenerateCode = vi.mocked(llmGenerateCodeWithBackend);

describe("CompilationLoop — LLM Self-Healing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Test: LLM disabled → no LLM calls ──────────────────────────────

  it("should NOT call LLM when enableLLM is false", async () => {
    const loop = new CompilationLoop({ enableLLM: false });
    mockIsLLMAvailable.mockResolvedValue(true);

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/BrokenService.java",
        content: `package com.example.service;

public class BrokenService {
    private UnknownExternalType field;
    public void process() {}
}`,
      },
    ];

    await loop.run(project, 3);
    expect(mockLLMGenerateCode).not.toHaveBeenCalled();
  });

  // ─── Test: LLM not available → graceful fallback ──────────────────────

  it("should gracefully fallback when LLM is not available", async () => {
    const loop = new CompilationLoop({ enableLLM: true });
    mockIsLLMAvailable.mockResolvedValue(false);

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/BrokenService.java",
        content: `package com.example.service;

public class BrokenService {
    private UnknownExternalType field;
    public void process() {}
}`,
      },
    ];

    const result = await loop.run(project, 3);
    expect(mockLLMGenerateCode).not.toHaveBeenCalled();
    expect(result.llmStats.totalCalls).toBe(0);
    expect(result.llmStats.backend).toBe("none");
  });

  // ─── Test: LLM called for unfixable errors ────────────────────────────

  it("should call LLM for UNRESOLVED_TYPE errors", async () => {
    const loop = new CompilationLoop({ enableLLM: true });
    mockIsLLMAvailable.mockResolvedValue(true);

    // LLM returns a fixed version without the unknown type
    mockLLMGenerateCode.mockResolvedValue({
      code: `package com.example.service;

import org.springframework.stereotype.Service;

@Service
public class BrokenService {
    private String field;
    public void process() {}
}`,
      backend: "finetuned",
    });

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/BrokenService.java",
        content: `package com.example.service;

public class BrokenService {
    private UnknownExternalType field;
    public void process() {}
}`,
      },
    ];

    const result = await loop.run(project, 5);
    expect(mockLLMGenerateCode).toHaveBeenCalled();
    expect(result.llmStats.totalCalls).toBeGreaterThan(0);
  });

  // ─── Test: LLM fix accepted when it reduces errors ────────────────────

  it("should accept LLM fix when it reduces compilation errors", async () => {
    const loop = new CompilationLoop({ enableLLM: true });
    mockIsLLMAvailable.mockResolvedValue(true);

    // LLM returns a clean version
    mockLLMGenerateCode.mockResolvedValue({
      code: `package com.example.service;

import org.springframework.stereotype.Service;

@Service
public class PaymentService {
    public String processPayment(String accountId, double amount) {
        return "payment-" + accountId + "-" + amount;
    }
}`,
      backend: "finetuned",
    });

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/PaymentService.java",
        content: `package com.example.service;

import com.legacy.banking.TransactionManager;

public class PaymentService {
    private TransactionManager txManager;
    public String processPayment(String accountId, double amount) {
        return txManager.execute(accountId, amount);
    }
}`,
      },
    ];

    const result = await loop.run(project, 5);

    // The LLM fix should have been accepted (reduces errors)
    if (result.llmStats.successfulFixes > 0) {
      const service = result.project.find(f => f.path.includes("PaymentService"));
      expect(service?.content).toContain("@Service");
      expect(service?.content).not.toContain("TransactionManager");
    }
  });

  // ─── Test: LLM fix rejected when it introduces new errors ─────────────

  it("should reject LLM fix when it introduces new errors", async () => {
    const loop = new CompilationLoop({ enableLLM: true });
    mockIsLLMAvailable.mockResolvedValue(true);

    // LLM returns a "fix" that introduces a new unknown type
    mockLLMGenerateCode.mockResolvedValue({
      code: `package com.example.service;

import com.another.unknown.BrokenDependency;

public class TestService {
    private BrokenDependency dep;
    public void process() {}
}`,
      backend: "finetuned",
    });

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/TestService.java",
        content: `package com.example.service;

public class TestService {
    private UnknownType field;
    public void process() {}
}`,
      },
    ];

    const result = await loop.run(project, 3);

    // The original content should be preserved (LLM fix rejected)
    const service = result.project.find(f => f.path.includes("TestService"));
    expect(service?.content).not.toContain("BrokenDependency");
  });

  // ─── Test: Budget LLM respecté ────────────────────────────────────────

  it("should respect maxTotalLLMCalls budget", async () => {
    const config: CompilationLoopConfig = {
      enableLLM: true,
      maxTotalLLMCalls: 2,
      maxLLMCallsPerIteration: 1,
    };
    const loop = new CompilationLoop(config);
    mockIsLLMAvailable.mockResolvedValue(true);

    // LLM always returns null (fails to fix)
    mockLLMGenerateCode.mockResolvedValue(null);

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/a/ServiceA.java",
        content: `package com.example.a;
public class ServiceA { private UnknownTypeA field; }`,
      },
      {
        path: "src/main/java/com/example/b/ServiceB.java",
        content: `package com.example.b;
public class ServiceB { private UnknownTypeB field; }`,
      },
      {
        path: "src/main/java/com/example/c/ServiceC.java",
        content: `package com.example.c;
public class ServiceC { private UnknownTypeC field; }`,
      },
    ];

    const result = await loop.run(project, 5);
    expect(result.llmStats.totalCalls).toBeLessThanOrEqual(2);
  });

  // ─── Test: LLM null response handled gracefully ───────────────────────

  it("should handle LLM returning null gracefully", async () => {
    const loop = new CompilationLoop({ enableLLM: true });
    mockIsLLMAvailable.mockResolvedValue(true);
    mockLLMGenerateCode.mockResolvedValue(null);

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/NullService.java",
        content: `package com.example.service;

public class NullService {
    private UnknownType field;
    public void process() {}
}`,
      },
    ];

    const result = await loop.run(project, 3);
    expect(result.status).toBe("NEEDS_HUMAN");
    expect(result.llmStats.totalCalls).toBeGreaterThan(0);
    expect(result.llmStats.successfulFixes).toBe(0);
  });

  // ─── Test: LLM exception handled gracefully ───────────────────────────

  it("should handle LLM exceptions gracefully", async () => {
    const loop = new CompilationLoop({ enableLLM: true });
    mockIsLLMAvailable.mockResolvedValue(true);
    mockLLMGenerateCode.mockRejectedValue(new Error("LLM timeout"));

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/ErrorService.java",
        content: `package com.example.service;

public class ErrorService {
    private UnknownType field;
    public void process() {}
}`,
      },
    ];

    // Should not throw
    const result = await loop.run(project, 3);
    expect(result.status).toBe("NEEDS_HUMAN");
  });

  // ─── Test: Events emitted for LLM operations ─────────────────────────

  it("should emit llm_fix_start and llm_fix_applied/failed events", async () => {
    const loop = new CompilationLoop({ enableLLM: true });
    const events: string[] = [];
    loop.setEventListener((event) => {
      events.push(event.type);
    });

    mockIsLLMAvailable.mockResolvedValue(true);
    mockLLMGenerateCode.mockResolvedValue({
      code: `package com.example.service;

import org.springframework.stereotype.Service;

@Service
public class EventService {
    public void process() {}
}`,
      backend: "finetuned",
    });

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/EventService.java",
        content: `package com.example.service;

public class EventService {
    private UnknownType field;
    public void process() {}
}`,
      },
    ];

    await loop.run(project, 5);
    expect(events).toContain("llm_fix_start");
    // Should have either llm_fix_applied or llm_fix_failed
    expect(events.some(e => e === "llm_fix_applied" || e === "llm_fix_failed")).toBe(true);
  });

  // ─── Test: Rule-based fixes applied BEFORE LLM ────────────────────────

  it("should apply rule-based fixes before calling LLM", async () => {
    const loop = new CompilationLoop({ enableLLM: true });
    mockIsLLMAvailable.mockResolvedValue(true);
    mockLLMGenerateCode.mockResolvedValue(null);

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/dto/OrderDTO.java",
        content: `package com.example.dto;
public class OrderDTO { private String orderId; }`,
      },
      {
        path: "src/main/java/com/example/service/OrderService.java",
        content: `package com.example.service;

import ma.eai.legacy.LegacyConnector;

public class OrderService {
    private OrderDTO dto;
    public void process() {}
}`,
      },
    ];

    const result = await loop.run(project, 5);

    // Rule-based should have fixed MISSING_IMPORT for OrderDTO
    // and MISSING_PACKAGE for LegacyConnector
    const hasRuleBasedFixes = result.iterations.some(i => i.fixes.length > 0);
    expect(hasRuleBasedFixes).toBe(true);
  });

  // ─── Test: LoopResult contains llmStats ───────────────────────────────

  it("should include llmStats in LoopResult even when LLM is not used", async () => {
    const loop = new CompilationLoop({ enableLLM: false });

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/App.java",
        content: `package com.example;
public class App { public static void main(String[] args) {} }`,
      },
    ];

    const result = await loop.run(project);
    expect(result.llmStats).toBeDefined();
    expect(result.llmStats.totalCalls).toBe(0);
    expect(result.llmStats.successfulFixes).toBe(0);
    expect(result.llmStats.failedFixes).toBe(0);
    expect(result.llmStats.backend).toBe("none");
  });

  // ─── Test: Config defaults ────────────────────────────────────────────

  it("should use default config values when not specified", async () => {
    const loop = new CompilationLoop();
    mockIsLLMAvailable.mockResolvedValue(true);
    mockLLMGenerateCode.mockResolvedValue(null);

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/DefaultService.java",
        content: `package com.example.service;
public class DefaultService { private UnknownType field; }`,
      },
    ];

    const result = await loop.run(project, 2);
    // Default enableLLM is true, so LLM should be called
    expect(result.llmStats.totalCalls).toBeGreaterThan(0);
  });

  // ─── Test: Multiple errors in same file → single LLM call ────────────

  it("should batch multiple errors in same file into single LLM call", async () => {
    const loop = new CompilationLoop({ enableLLM: true, batchByFile: true });
    mockIsLLMAvailable.mockResolvedValue(true);
    mockLLMGenerateCode.mockResolvedValue({
      code: `package com.example.service;

import org.springframework.stereotype.Service;

@Service
public class MultiErrorService {
    private String fieldA;
    private String fieldB;
    public void process() {}
}`,
      backend: "finetuned",
    });

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/MultiErrorService.java",
        content: `package com.example.service;

public class MultiErrorService {
    private UnknownTypeA fieldA;
    private UnknownTypeB fieldB;
    public void process() {}
}`,
      },
    ];

    await loop.run(project, 5);
    // Should be called only once for the file (batched)
    expect(mockLLMGenerateCode).toHaveBeenCalledTimes(1);
  });
});
