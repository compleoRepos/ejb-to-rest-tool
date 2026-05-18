/**
 * E2E v13.15 — Run pipeline on 3 projects sequentially.
 * Uses existing uploaded sessions as source.
 */

const BASE = "http://localhost:3000";

interface ProjectRun {
  name: string;
  uploadedSessionId: string;
  fileCount: number;
}

const PROJECTS: ProjectRun[] = [
  { name: "interface-send-sms", uploadedSessionId: "7mSJKX2kYuitA8dh", fileCount: 20 },
  { name: "commande-chequier", uploadedSessionId: "cJHSM3Y5OXlCr7-u", fileCount: 41 },
  { name: "avis-opere", uploadedSessionId: "sOSzeKDoiarXKLKi", fileCount: 64 },
];

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startAgent(p: ProjectRun): Promise<string> {
  const body = {
    source: { type: "zip", sessionId: p.uploadedSessionId },
    output: { type: "zip" },
    options: {
      projectName: p.name,
      autoResolveAmbiguities: true,
      maxCompilationAttempts: 3,
    },
  };
  const res = await fetch(`${BASE}/api/agent/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log(`  → Agent started: ${data.sessionId}`);
  return data.sessionId;
}

async function waitForCompletion(sessionId: string, maxWaitMs = 300000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BASE}/api/agent/${sessionId}/status`, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      const state = data.state || data.status;
      if (state === "COMPLETED" || state === "FAILED") {
        return data;
      }
      if (state === "AWAITING_INPUT") {
        // Auto-resolve: send empty choices
        console.log(`  → AWAITING_INPUT, sending empty choices...`);
        await fetch(`${BASE}/api/agent/${sessionId}/choices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choices: [] }),
        });
      }
      console.log(`  → State: ${state} (${Math.round((Date.now() - start) / 1000)}s)`);
    } catch (e) {
      console.log(`  → Fetch error, retrying...`);
    }
    await sleep(15000);
  }
  return { state: "TIMEOUT" };
}

async function getDownloadUrl(sessionId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/agent/${sessionId}/status`);
    const data = await res.json();
    return data.downloadUrl || data.download_url || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== E2E v13.15 — BusinessConceptClassifier Pipeline ===\n");
  const results: any[] = [];

  for (const p of PROJECTS) {
    console.log(`\n[${p.name}] Starting (${p.fileCount} files)...`);
    try {
      const sessionId = await startAgent(p);
      const finalState = await waitForCompletion(sessionId);
      const state = finalState.state || finalState.status;
      console.log(`[${p.name}] Final state: ${state}`);

      let downloadUrl = null;
      if (state === "COMPLETED") {
        downloadUrl = await getDownloadUrl(sessionId);
        console.log(`[${p.name}] Download URL: ${downloadUrl || "N/A"}`);
      }

      results.push({
        name: p.name,
        sessionId,
        state,
        downloadUrl,
        fileCount: p.fileCount,
      });
    } catch (err: any) {
      console.log(`[${p.name}] ERROR: ${err.message}`);
      results.push({
        name: p.name,
        state: "ERROR",
        error: err.message,
        fileCount: p.fileCount,
      });
    }
  }

  console.log("\n=== Results ===");
  console.log(JSON.stringify(results, null, 2));

  // Save results
  const fs = await import("fs");
  fs.writeFileSync("/tmp/e2e-v1315/results.json", JSON.stringify(results, null, 2));
  console.log("\nResults saved to /tmp/e2e-v1315/results.json");
}

// Create output dir
import { mkdirSync } from "fs";
mkdirSync("/tmp/e2e-v1315", { recursive: true });

main().catch(console.error);
