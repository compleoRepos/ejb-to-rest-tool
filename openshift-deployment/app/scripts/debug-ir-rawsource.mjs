// Debug: Add temp endpoint to check IR rawSource, then call it
const BASE = "http://localhost:3000";

async function main() {
  // Call the debug endpoint
  const res = await fetch(`${BASE}/api/compleo/debug-ir/_PS6YZh4xcfREoT6`);
  if (!res.ok) {
    console.log("Debug endpoint not available, status:", res.status);
    console.log("Adding it now...");
    return;
  }
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
