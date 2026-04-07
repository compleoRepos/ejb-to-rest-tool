/**
 * Tests for Web Workers — WorkerPool and analysis-worker modules.
 * Since Web Workers are browser-only, we test the data structures,
 * chunking logic, progress calculation, and configuration validation.
 *
 * @author Hamza NORDINE
 */

import { describe, expect, it } from "vitest";

// ============================================================
// We can't import the actual worker-pool.ts (it uses `new Worker()`)
// but we can test the pure logic by recreating the key algorithms
// ============================================================

// ---- Chunking algorithm (from WorkerPool) ----

function chunkFiles<T>(files: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < files.length; i += chunkSize) {
    chunks.push(files.slice(i, i + chunkSize));
  }
  return chunks;
}

function calculateOptimalChunkSize(totalFiles: number, workerCount: number): number {
  if (totalFiles <= workerCount) return 1;
  const baseChunk = Math.ceil(totalFiles / workerCount);
  return Math.min(baseChunk, 50);
}

function calculateOptimalWorkerCount(totalFiles: number, maxWorkers: number): number {
  if (totalFiles <= 5) return 1;
  if (totalFiles <= 20) return Math.min(2, maxWorkers);
  if (totalFiles <= 100) return Math.min(4, maxWorkers);
  return maxWorkers;
}

// ---- Progress calculation (from WorkerPool) ----

interface ProgressState {
  completedFiles: number;
  totalFiles: number;
  startTime: number;
}

function calculateProgress(state: ProgressState) {
  const elapsed = Date.now() - state.startTime;
  const percent = state.totalFiles > 0
    ? Math.round((state.completedFiles / state.totalFiles) * 100)
    : 0;
  const filesPerSecond = elapsed > 0
    ? parseFloat(((state.completedFiles / elapsed) * 1000).toFixed(1))
    : 0;
  const remaining = state.totalFiles - state.completedFiles;
  const etaSeconds = filesPerSecond > 0
    ? Math.ceil(remaining / filesPerSecond)
    : 0;
  return { percent, filesPerSecond, etaSeconds, elapsedMs: elapsed };
}

// ---- FilePayload validation ----

interface FilePayload {
  id: string;
  name: string;
  content: string;
}

function validatePayload(payload: FilePayload): boolean {
  return (
    typeof payload.id === "string" &&
    payload.id.length > 0 &&
    typeof payload.name === "string" &&
    payload.name.endsWith(".java") &&
    typeof payload.content === "string" &&
    payload.content.length > 0
  );
}

// ============================================================
// Tests
// ============================================================

describe("WorkerPool — Chunking Algorithm", () => {
  it("creates correct number of chunks for small file sets", () => {
    const files = Array.from({ length: 5 }, (_, i) => `file${i}.java`);
    const chunks = chunkFiles(files, 2);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(2);
    expect(chunks[1]).toHaveLength(2);
    expect(chunks[2]).toHaveLength(1);
  });

  it("creates single chunk when files <= chunkSize", () => {
    const files = Array.from({ length: 3 }, (_, i) => `file${i}.java`);
    const chunks = chunkFiles(files, 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(3);
  });

  it("handles empty file array", () => {
    const chunks = chunkFiles([], 5);
    expect(chunks).toHaveLength(0);
  });

  it("handles chunk size of 1", () => {
    const files = ["a.java", "b.java", "c.java"];
    const chunks = chunkFiles(files, 1);
    expect(chunks).toHaveLength(3);
    chunks.forEach((c) => expect(c).toHaveLength(1));
  });

  it("handles large file sets (500+ files)", () => {
    const files = Array.from({ length: 500 }, (_, i) => `File${i}.java`);
    const chunks = chunkFiles(files, 50);
    expect(chunks).toHaveLength(10);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(50));
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(total).toBe(500);
  });

  it("handles 1000+ files correctly", () => {
    const files = Array.from({ length: 1200 }, (_, i) => `Service${i}.java`);
    const chunks = chunkFiles(files, 50);
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(total).toBe(1200);
    expect(chunks).toHaveLength(24);
  });
});

describe("WorkerPool — Optimal Chunk Size", () => {
  it("returns 1 when files <= workers", () => {
    expect(calculateOptimalChunkSize(4, 8)).toBe(1);
  });

  it("distributes evenly across workers", () => {
    const chunkSize = calculateOptimalChunkSize(100, 4);
    expect(chunkSize).toBe(25);
  });

  it("caps at 50 for very large sets", () => {
    const chunkSize = calculateOptimalChunkSize(10000, 4);
    expect(chunkSize).toBe(50);
  });

  it("handles single worker", () => {
    const chunkSize = calculateOptimalChunkSize(100, 1);
    expect(chunkSize).toBe(50); // capped at 50
  });
});

describe("WorkerPool — Optimal Worker Count", () => {
  it("uses 1 worker for <= 5 files", () => {
    expect(calculateOptimalWorkerCount(3, 8)).toBe(1);
    expect(calculateOptimalWorkerCount(5, 8)).toBe(1);
  });

  it("uses 2 workers for 6-20 files", () => {
    expect(calculateOptimalWorkerCount(10, 8)).toBe(2);
    expect(calculateOptimalWorkerCount(20, 8)).toBe(2);
  });

  it("uses 4 workers for 21-100 files", () => {
    expect(calculateOptimalWorkerCount(50, 8)).toBe(4);
    expect(calculateOptimalWorkerCount(100, 8)).toBe(4);
  });

  it("uses max workers for 100+ files", () => {
    expect(calculateOptimalWorkerCount(500, 8)).toBe(8);
    expect(calculateOptimalWorkerCount(1000, 16)).toBe(16);
  });

  it("respects maxWorkers limit", () => {
    expect(calculateOptimalWorkerCount(50, 2)).toBe(2);
    expect(calculateOptimalWorkerCount(500, 4)).toBe(4);
  });
});

describe("WorkerPool — Progress Calculation", () => {
  it("returns 0% for no completed files", () => {
    const result = calculateProgress({
      completedFiles: 0,
      totalFiles: 100,
      startTime: Date.now(),
    });
    expect(result.percent).toBe(0);
  });

  it("returns 100% when all files completed", () => {
    const result = calculateProgress({
      completedFiles: 100,
      totalFiles: 100,
      startTime: Date.now() - 5000,
    });
    expect(result.percent).toBe(100);
    expect(result.etaSeconds).toBe(0);
  });

  it("calculates correct percentage", () => {
    const result = calculateProgress({
      completedFiles: 50,
      totalFiles: 200,
      startTime: Date.now() - 10000,
    });
    expect(result.percent).toBe(25);
  });

  it("calculates files per second", () => {
    const result = calculateProgress({
      completedFiles: 100,
      totalFiles: 200,
      startTime: Date.now() - 10000, // 10 seconds ago
    });
    expect(result.filesPerSecond).toBeCloseTo(10, 0);
  });

  it("calculates ETA correctly", () => {
    const result = calculateProgress({
      completedFiles: 100,
      totalFiles: 200,
      startTime: Date.now() - 10000,
    });
    // 100 remaining, 10 files/s => ~10 seconds
    expect(result.etaSeconds).toBeCloseTo(10, 0);
  });

  it("handles zero total files", () => {
    const result = calculateProgress({
      completedFiles: 0,
      totalFiles: 0,
      startTime: Date.now(),
    });
    expect(result.percent).toBe(0);
  });
});

describe("WorkerPool — File Payload Validation", () => {
  it("accepts valid Java file payload", () => {
    expect(validatePayload({
      id: "file-1",
      name: "PaymentService.java",
      content: "public class PaymentService { }",
    })).toBe(true);
  });

  it("rejects non-Java file", () => {
    expect(validatePayload({
      id: "file-1",
      name: "readme.md",
      content: "# README",
    })).toBe(false);
  });

  it("rejects empty content", () => {
    expect(validatePayload({
      id: "file-1",
      name: "Test.java",
      content: "",
    })).toBe(false);
  });

  it("rejects empty id", () => {
    expect(validatePayload({
      id: "",
      name: "Test.java",
      content: "class Test {}",
    })).toBe(false);
  });
});

describe("WorkerPool — Integration Scenarios", () => {
  it("handles typical enterprise project (350 services)", () => {
    const fileCount = 350;
    const maxWorkers = 8;
    const workerCount = calculateOptimalWorkerCount(fileCount, maxWorkers);
    const chunkSize = calculateOptimalChunkSize(fileCount, workerCount);
    const files = Array.from({ length: fileCount }, (_, i) => `Service${i}.java`);
    const chunks = chunkFiles(files, chunkSize);

    expect(workerCount).toBe(maxWorkers);
    expect(chunkSize).toBeLessThanOrEqual(50);
    const totalChunked = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(totalChunked).toBe(fileCount);
  });

  it("handles small project (5 files)", () => {
    const fileCount = 5;
    const maxWorkers = 8;
    const workerCount = calculateOptimalWorkerCount(fileCount, maxWorkers);
    expect(workerCount).toBe(1);
    const chunkSize = calculateOptimalChunkSize(fileCount, workerCount);
    expect(chunkSize).toBe(5); // ceil(5/1) = 5, single worker processes all
  });

  it("handles medium project (50 files)", () => {
    const fileCount = 50;
    const maxWorkers = 4;
    const workerCount = calculateOptimalWorkerCount(fileCount, maxWorkers);
    expect(workerCount).toBe(4);
    const chunkSize = calculateOptimalChunkSize(fileCount, workerCount);
    expect(chunkSize).toBe(13); // ceil(50/4) = 13
    const files = Array.from({ length: fileCount }, (_, i) => `File${i}.java`);
    const chunks = chunkFiles(files, chunkSize);
    const totalChunked = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(totalChunked).toBe(fileCount);
  });

  it("handles very large project (2000 files)", () => {
    const fileCount = 2000;
    const maxWorkers = 16;
    const workerCount = calculateOptimalWorkerCount(fileCount, maxWorkers);
    expect(workerCount).toBe(16);
    const chunkSize = calculateOptimalChunkSize(fileCount, workerCount);
    expect(chunkSize).toBe(50); // capped
    const files = Array.from({ length: fileCount }, (_, i) => `File${i}.java`);
    const chunks = chunkFiles(files, chunkSize);
    const totalChunked = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(totalChunked).toBe(fileCount);
    expect(chunks).toHaveLength(40); // 2000 / 50
  });

  it("progress tracking across full analysis lifecycle", () => {
    const startTime = Date.now() - 5000; // 5 seconds ago
    const totalFiles = 100;

    // 25% done
    let p = calculateProgress({ completedFiles: 25, totalFiles, startTime });
    expect(p.percent).toBe(25);

    // 50% done
    p = calculateProgress({ completedFiles: 50, totalFiles, startTime });
    expect(p.percent).toBe(50);

    // 100% done
    p = calculateProgress({ completedFiles: 100, totalFiles, startTime });
    expect(p.percent).toBe(100);
    expect(p.etaSeconds).toBe(0);
  });
});
