/**
 * E2E Validation v13.14 — Run 3 BMCE projects through the full pipeline
 * and download the ZIPs with Schema Reverse-Engineering artifacts.
 */
import * as fs from "fs";
import * as path from "path";

const BASE = "http://localhost:3000";
const OUTPUT_DIR = "/tmp/e2e-v1314";
const FIXTURES_DIR = "/home/ubuntu/ejb-client-modernizer/tests/e2e/fixtures/bmce";

const PROJECTS = [
  { name: "interface-send-sms", zip: "interface-send-sms.zip" },
  { name: "commande-chequier", zip: "commande-chequier.zip" },
  { name: "transfert-euro-bmce-direct", zip: "transfert-euro-bmce-direct.zip" },
];

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadZip(zipPath: string): Promise<{ sessionId: string; fileCount: number }> {
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(zipPath);
  const blob = new Blob([fileBuffer], { type: "application/zip" });
  formData.append("file", blob, path.basename(zipPath));

  const res = await fetch(`${BASE}/api/compleo/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function startAgent(sessionId: string, projectName: string): Promise<string> {
  const res = await fetch(`${BASE}/api/agent/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { type: "zip", sessionId },
      output: { type: "zip" },
      options: { projectName, targetFramework: "spring-boot" },
    }),
  });
  if (!res.ok) throw new Error(`Start failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.sessionId;
}

async function waitForState(agentId: string, targetStates: string[], maxWaitMs = 300_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${BASE}/api/agent/${agentId}/status`);
    if (!res.ok) {
      await sleep(3000);
      continue;
    }
    const data = await res.json();
    if (targetStates.includes(data.state)) return data;
    await sleep(5000);
  }
  throw new Error(`Timeout waiting for states ${targetStates.join("|")} on ${agentId}`);
}

async function resolveAmbiguities(agentId: string, statusData: any): Promise<void> {
  // Find ambiguities in events
  const awaitEvent = statusData.events?.find(
    (e: any) => e.type === "AWAITING_INPUT" && e.data?.ambiguities?.length > 0
  );
  const ambiguities = awaitEvent?.data?.ambiguities || [];
  const choices = ambiguities.map((a: any) => ({
    ambiguityId: a.id,
    choiceId: a.options?.[0]?.id || "A",
  }));

  const res = await fetch(`${BASE}/api/agent/${agentId}/choices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ choices }),
  });
  if (!res.ok) throw new Error(`Choices failed: ${res.status} ${await res.text()}`);
  const result = await res.json();
  console.log(`  Resolved ${choices.length} ambiguities. Learning: ${JSON.stringify(result.learning || {})}`);
}

async function downloadZip(agentId: string, outputPath: string): Promise<void> {
  const statusRes = await fetch(`${BASE}/api/agent/${agentId}/status`);
  const status = await statusRes.json();
  const url = status.summary?.downloadUrl;
  if (!url) throw new Error(`No download URL for ${agentId}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`  Downloaded: ${outputPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function processProject(project: { name: string; zip: string }): Promise<any> {
  const t0 = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing: ${project.name}`);
  console.log(`${"=".repeat(60)}`);

  // 1. Upload
  const zipPath = path.join(FIXTURES_DIR, project.zip);
  console.log(`  Uploading ${project.zip}...`);
  const upload = await uploadZip(zipPath);
  console.log(`  Uploaded: ${upload.fileCount} files, sessionId=${upload.sessionId}`);

  // 2. Start agent
  const agentId = await startAgent(upload.sessionId, project.name);
  console.log(`  Agent started: ${agentId}`);

  // 3. Wait for AWAITING_INPUT or COMPLETED
  console.log(`  Waiting for analysis...`);
  let status = await waitForState(agentId, ["AWAITING_INPUT", "COMPLETED", "FAILED"]);

  if (status.state === "FAILED") {
    console.error(`  FAILED: ${status.events?.slice(-1)?.[0]?.message}`);
    return { project: project.name, status: "FAILED", error: status.events?.slice(-1)?.[0]?.message };
  }

  // 4. Resolve ambiguities if needed
  if (status.state === "AWAITING_INPUT") {
    console.log(`  Resolving ambiguities...`);
    await resolveAmbiguities(agentId, status);

    // 5. Wait for completion
    console.log(`  Waiting for generation + compilation + pushing...`);
    status = await waitForState(agentId, ["COMPLETED", "FAILED"], 600_000);
  }

  if (status.state === "FAILED") {
    console.error(`  FAILED: ${status.events?.slice(-1)?.[0]?.message}`);
    return { project: project.name, status: "FAILED", error: status.events?.slice(-1)?.[0]?.message };
  }

  // 6. Download ZIP
  const outputPath = path.join(OUTPUT_DIR, `${project.name}-v1314.zip`);
  await downloadZip(agentId, outputPath);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  COMPLETED in ${elapsed}s`);

  return {
    project: project.name,
    status: "COMPLETED",
    agentId,
    fileCount: upload.fileCount,
    downloadUrl: status.summary?.downloadUrl,
    qualityScore: status.summary?.qualityScore,
    compilationStatus: status.summary?.compilationStatus,
    elapsed: `${elapsed}s`,
    outputPath,
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  E2E Validation v13.14 — 3 BMCE Projects                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const results: any[] = [];

  for (const project of PROJECTS) {
    try {
      const result = await processProject(project);
      results.push(result);
    } catch (err) {
      console.error(`  ERROR: ${err}`);
      results.push({ project: project.name, status: "ERROR", error: String(err) });
    }
  }

  // Summary
  console.log("\n\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  SUMMARY                                                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  for (const r of results) {
    const icon = r.status === "COMPLETED" ? "✓" : "✗";
    console.log(`  ${icon} ${r.project}: ${r.status} ${r.elapsed || ""} ${r.qualityScore?.score || ""}`);
  }

  // Write results JSON
  fs.writeFileSync(path.join(OUTPUT_DIR, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\nResults written to ${OUTPUT_DIR}/results.json`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
