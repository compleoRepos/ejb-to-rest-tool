// Debug script to check IR content for exit point detection
const BASE = "http://localhost:3000";

async function main() {
  // Get sessions
  const sessRes = await fetch(`${BASE}/api/compleo/sessions`);
  const sessions = await sessRes.json();
  const generated = sessions.find(s => s.status === "generated");
  if (!generated) {
    console.log("No generated session found");
    return;
  }
  console.log(`Using session: ${generated.id} (${generated.projectName})`);

  // We need to check the IR directly from the session store
  // Use the test-inject-session endpoint to read back
  // Or better, add a debug endpoint temporarily
  
  // Instead, let's check what the GraphBuilder produces
  const archRes = await fetch(`${BASE}/api/architecture/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: generated.id }),
  });
  const arch = await archRes.json();
  
  console.log("\n=== Graph Metrics ===");
  console.log(JSON.stringify(arch.graph, null, 2));
  
  console.log("\n=== Entry Points ===");
  console.log(`Count: ${arch.entryPoints?.length}`);
  for (const ep of (arch.entryPoints || []).slice(0, 3)) {
    console.log(`  ${ep.className} (${ep.type}, ${ep.protocol})`);
  }
  
  console.log("\n=== Exit Points ===");
  console.log(`Count: ${arch.exitPoints?.length}`);
  for (const ep of (arch.exitPoints || []).slice(0, 5)) {
    console.log(`  ${ep.className} → ${ep.target} (${ep.type}, ${ep.protocol})`);
  }
  
  // Check cytoscape data for EXTERNAL nodes
  const cd = arch.visualizations?.cytoscapeData;
  if (cd) {
    const elements = cd.elements || [];
    const extNodes = elements.filter(e => e.group === "nodes" && e.data?.type === "EXTERNAL");
    console.log(`\n=== Cytoscape EXTERNAL nodes: ${extNodes.length} ===`);
    for (const en of extNodes.slice(0, 5)) {
      console.log(`  ${en.data.id} (${en.data.externalType}, ${en.data.protocol})`);
    }
    
    // Check all node types
    const nodeTypes = {};
    for (const e of elements.filter(e => e.group === "nodes")) {
      const t = e.data?.type || "unknown";
      nodeTypes[t] = (nodeTypes[t] || 0) + 1;
    }
    console.log("\n=== Node types ===");
    console.log(JSON.stringify(nodeTypes, null, 2));
  }
}

main().catch(console.error);
