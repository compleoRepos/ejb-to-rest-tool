// Debug: check rawSource content in the session IR
// We need to access the session store directly, so we'll add a temp debug endpoint

const BASE = "http://localhost:3000";

async function main() {
  // Use the test-inject-session endpoint to inject a session, 
  // then read it back. But actually we need to check the existing session.
  // Let's add a quick debug endpoint via the existing session detail API
  
  // The session detail API at /api/compleo/session/:id returns irSummary but not the full IR
  // We need to check the raw session store. Let's use a different approach:
  // Call the architecture analyze endpoint but with debug logging
  
  // Actually, let's just check what the session store has
  const res = await fetch(`${BASE}/api/compleo/session/_PS6YZh4xcfREoT6`);
  const data = await res.json();
  
  console.log("Session keys:", Object.keys(data));
  console.log("irSummary:", JSON.stringify(data.irSummary, null, 2));
  
  // The session detail endpoint doesn't return the full IR
  // We need to check the session store directly
  // Let's create a temp debug endpoint
  
  // Alternative: check the test-inject endpoint to understand the session structure
  // Or check if there's a way to get the full IR
  
  // Let's check if the session has files with rawSource patterns
  const stats = data.stats || {};
  console.log("\nStats:", JSON.stringify(stats, null, 2));
  console.log("\nTechnologies:", data.technologiesDetected);
  console.log("\nDetected components:", JSON.stringify(data.detectedComponents, null, 2));
}

main().catch(console.error);
